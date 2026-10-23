import { Component, useEffect, useState } from "react";
import Home from "./pages/Home.jsx";
import Flight from "./pages/Flight.jsx";
import Airport from "./pages/Airport.jsx";
import Route from "./pages/Route.jsx";
import Radar from "./pages/Radar.jsx";
import Fly from "./pages/Fly.jsx";
import Checkout from "./pages/Checkout.jsx";
import Booking from "./pages/Booking.jsx";
import Trips from "./pages/Trips.jsx";
import Wallet from "./pages/Wallet.jsx";
import Account from "./pages/Account.jsx";
import { configured, local, supabase, useUser } from "./lib.js";
import { go, useRoute } from "./router.js";

const PAGES = {
  "": Home, flight: Flight, airport: Airport, route: Route, radar: Radar,
  fly: Fly, checkout: Checkout, booking: Booking, trips: Trips, wallet: Wallet, account: Account,
};

// which tab lights up for each page
const SECTION = { "": "track", flight: "track", airport: "track", route: "track", radar: "radar", fly: "fly", checkout: "fly", booking: "trips", trips: "trips", wallet: "wallet", account: "account" };

const TABS = [
  { id: "track", label: "Track", href: "#/" },
  { id: "radar", label: "Radar", href: "#/radar" },
  { id: "fly", label: "Fly", href: "#/fly" },
  { id: "trips", label: "Trips", href: "#/trips" },
  { id: "wallet", label: "Wallet", href: "#/wallet" },
];

/** One broken screen shouldn't blank the whole app: show a way back instead. */
class Boundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e) {
    console.error(e);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="page">
        <h1 className="page-title">Something went wrong here</h1>
        <p className="empty">This screen hit an error. Try again, or head back to tracking.</p>
        <div className="actions">
          <button className="btn" onClick={() => location.reload()}>Try again</button>
          <a className="btn btn-quiet" href="#/">Track a flight</a>
        </div>
      </section>
    );
  }
}

function useUnread(user) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!user || !supabase) return setN(0);
    const load = () =>
      supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null).then(({ count }) => setN(count ?? 0));
    load();
    const ch = supabase
      .channel("unread")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [user?.id]);
  return n;
}

export default function App() {
  const route = useRoute();
  const user = useUser();
  const unread = useUnread(user);
  const Page = PAGES[route.page] ?? Home;
  const section = SECTION[route.page] ?? "track";
  const full = route.page === "radar";

  // back from a magic link: finish the trip the traveler started before signing in
  useEffect(() => {
    if (!user) return;
    const next = local.get("afterSignIn", null);
    if (!next) return;
    local.set("afterSignIn", null);
    go(next.startsWith("/") ? next : `/${next}`, null, { replace: true });
  }, [user?.id]);

  // new screen, new scroll position (but not when only the query changes)
  useEffect(() => {
    scrollTo(0, 0);
  }, [route.parts.join("/")]);

  useEffect(() => {
    document.title = { track: "Flight Time", radar: "Radar · Flight Time", fly: "Fares · Flight Time", trips: "My trips · Flight Time", wallet: "Wallet · Flight Time" }[section] ?? "Flight Time";
  }, [section]);

  return (
    <div className={`shell${full ? " shell-full" : ""}`}>
      <header className="top">
        <a className="brand" href="#/">
          <img src="/icon.svg" alt="" width="28" height="28" />
          Flight Time
        </a>
        <nav className="top-nav" aria-label="Sections">
          {TABS.map((t) => (
            <a key={t.id} href={t.href} aria-current={section === t.id ? "page" : undefined}>
              {t.label}
              {t.id === "trips" && unread > 0 && <i className="dot" aria-label={`${unread} new alerts`} />}
            </a>
          ))}
        </nav>
        <a className="linkish acct" href="#/account" aria-current={section === "account" ? "page" : undefined}>
          {user ? "Account" : "Sign in"}
        </a>
      </header>

      {!configured && (
        <p className="setup">
          Not connected to the database yet. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> (see README).
        </p>
      )}

      <main>
        <Boundary key={route.parts.slice(0, 3).join("/")}>
          <Page route={route} />
        </Boundary>
      </main>

      <nav className="tabs" aria-label="Sections">
        {TABS.map((t) => (
          <a key={t.id} className="tab" href={t.href} aria-current={section === t.id ? "page" : undefined}>
            {t.label}
            {t.id === "trips" && unread > 0 && <i className="dot" aria-hidden="true" />}
          </a>
        ))}
      </nav>
    </div>
  );
}
