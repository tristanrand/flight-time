import { useEffect, useState } from "react";
import Track from "./pages/Track.jsx";
import Fares from "./pages/Fares.jsx";
import Trips from "./pages/Trips.jsx";
import Miles from "./pages/Miles.jsx";
import Account from "./pages/Account.jsx";
import { configured, useUser } from "./lib.js";

const TABS = [
  { id: "track", label: "Track" },
  { id: "fares", label: "Fares" },
  { id: "trips", label: "My trips" },
  { id: "miles", label: "Miles" },
];

const fromHash = () => {
  const id = location.hash.replace("#", "");
  return [...TABS.map((t) => t.id), "account"].includes(id) ? id : "track";
};

export default function App() {
  const user = useUser();
  const [tab, setTab] = useState(fromHash);
  const [arg, setArg] = useState(null);

  useEffect(() => {
    const on = () => setTab(fromHash());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);

  const go = (id, a = null) => {
    setArg(a);
    setTab(id);
    history.pushState(null, "", `#${id}`);
    scrollTo(0, 0);
  };

  const Page = { track: Track, fares: Fares, trips: Trips, miles: Miles, account: Account }[tab];

  return (
    <div className="shell">
      <header className="top">
        <a className="brand" href="#track" onClick={(e) => (e.preventDefault(), go("track"))}>
          <img src="/icon.svg" alt="" width="28" height="28" />
          Flight Time
        </a>
        <button className="linkish" onClick={() => go("account")}>{user ? "Account" : "Sign in"}</button>
      </header>

      {!configured && (
        <p className="setup">
          Not connected to the database yet. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> (see README).
        </p>
      )}

      <main>
        <Page key={tab + JSON.stringify(arg)} go={go} initial={arg} />
      </main>

      <nav className="tabs" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} className="tab" aria-current={tab === t.id ? "page" : undefined} onClick={() => go(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
