import { useEffect, useMemo, useState } from "react";
import { BoardRow, boardFor } from "../components/Board.jsx";
import FlightMap from "../components/FlightMap.jsx";
import { airlineName } from "../data/airlines.js";
import { airport } from "../data/airports.js";
import { miles } from "../geo.js";
import { ago, call, day, money, monthName, supabase, until, useNow, useUser } from "../lib.js";

const tripLink = (t) => `#/flight/${t.ident}${t.fa_flight_id ? `?id=${encodeURIComponent(t.fa_flight_id)}` : ""}`;

/** Lifetime flying, the way a logbook adds it up. */
function logbook(list) {
  let mi = 0, min = 0, longest = null;
  const ports = new Set(), lines = new Set(), routes = [];
  for (const t of list) {
    const a = airport(t.origin), b = airport(t.destination);
    if (a) ports.add(a.code);
    if (b) ports.add(b.code);
    lines.add(t.ident.replace(/\d.*/, ""));
    if (a && b) {
      const d = miles(a, b);
      mi += d;
      routes.push([[a.lat, a.lon], [b.lat, b.lon]]);
      if (!longest || d > longest.d) longest = { d, t };
    }
    if (t.scheduled_in && t.scheduled_out) min += (new Date(t.scheduled_in) - new Date(t.scheduled_out)) / 60000;
  }
  return { flights: list.length, miles: Math.round(mi), hours: Math.round(min / 60), airports: ports.size, airlines: lines.size, longest, routes };
}

export default function Trips() {
  const user = useUser();
  const now = useNow(30_000);
  const [trips, setTrips] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [watches, setWatches] = useState([]);
  const [showPast, setShowPast] = useState(false);

  async function load() {
    const [t, b, n, w] = await Promise.all([
      supabase.from("tracked_flights").select("*").order("scheduled_out", { ascending: true }),
      supabase.from("bookings").select("*").neq("status", "cancelled").order("created_at", { ascending: false }).limit(20),
      supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(30),
      supabase.from("price_watches").select("*").order("created_at", { ascending: false }),
    ]);
    setTrips(t.data ?? []);
    setBookings(b.data ?? []);
    setAlerts(n.data ?? []);
    setWatches(w.data ?? []);
  }

  useEffect(() => {
    if (!user) return;
    load();
    // FlightAware alerts update these rows server-side; show changes the moment they land
    const ch = supabase
      .channel("trips")
      .on("postgres_changes", { event: "*", schema: "public", table: "tracked_flights", filter: `user_id=eq.${user.id}` }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [user?.id]);

  const { upcoming, past } = useMemo(() => {
    const cut = now - 3 * 3600_000;
    const list = trips ?? [];
    return {
      upcoming: list.filter((t) => new Date(t.actual_in ?? t.estimated_in ?? t.scheduled_in ?? t.scheduled_out) >= cut),
      past: list.filter((t) => new Date(t.actual_in ?? t.estimated_in ?? t.scheduled_in ?? t.scheduled_out) < cut).reverse(),
    };
  }, [trips, now]);
  const log = useMemo(() => logbook(past), [past]);
  const unread = alerts.filter((a) => !a.read_at);

  if (user === undefined) return <section className="page" />;
  if (!user)
    return (
      <section className="page">
        <h1 className="page-title">My trips</h1>
        <p className="empty">Sign in to save flights and get told the moment they're delayed, cancelled, or land.</p>
        <a className="btn" href="#/account">Sign in</a>
      </section>
    );

  async function readAll() {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null).eq("user_id", user.id);
    load();
  }

  const next = upcoming[0];

  return (
    <section className="page trips-page">
      <h1 className="page-title">My trips</h1>

      {unread.length > 0 && (
        <div className="panel alerts">
          <h2>
            {unread.length} new {unread.length === 1 ? "alert" : "alerts"}
            <button className="linkish small" onClick={readAll}>Mark all read</button>
          </h2>
          <ul>
            {unread.slice(0, 6).map((a) => (
              <li key={a.id} className={`alert alert-${a.kind}`}>
                <a href={a.link ?? "#/trips"}>
                  <strong>{a.title}</strong>
                  {a.body && <span>{a.body}</span>}
                  <small>{ago(a.created_at, now)}</small>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {trips?.length === 0 && (
        <div className="empty-state">
          <p className="empty">No saved flights yet. Look one up and tap "Save to My trips", or book one here and it shows up on its own.</p>
          <div className="actions">
            <a className="btn" href="#/">Look up a flight</a>
            <a className="btn btn-quiet" href="#/fly">Find a fare</a>
          </div>
        </div>
      )}

      {next && (
        <a className="next-trip" href={tripLink(next)}>
          <span className="next-trip-label">
            Next up · {day(next.scheduled_out)}
            <b>{new Date(next.estimated_out ?? next.scheduled_out) > now ? `leaves in ${until(next.estimated_out ?? next.scheduled_out, now)}` : next.actual_in ? "landed" : "today"}</b>
          </span>
          <BoardRow flight={boardFor(next.snapshot ?? next)} />
        </a>
      )}
      {next && (
        <button
          className="linkish remove"
          onClick={async () => {
            await call("flight-status", { action: "untrack", id: next.id });
            load();
          }}
        >
          Remove this flight
        </button>
      )}

      {upcoming.length > 1 && (
        <>
          <h2 className="section-title">Coming up</h2>
          <ul className="trip-list">
            {upcoming.slice(1).map((t) => (
              <li key={t.id}>
                <a className="trip" href={tripLink(t)}>
                  <span className="trip-day">{day(t.scheduled_out)} · {airport(t.origin)?.city ?? t.origin} to {airport(t.destination)?.city ?? t.destination}</span>
                  <BoardRow compact flight={boardFor(t.snapshot ?? t)} />
                </a>
                <button
                  className="linkish remove"
                  onClick={async () => {
                    await call("flight-status", { action: "untrack", id: t.id });
                    load();
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {bookings.length > 0 && (
        <>
          <h2 className="section-title">Bookings</h2>
          <ul className="bookings">
            {bookings.map((b) => (
              <li key={b.id}>
                <a href={`#/booking/${b.id}`}>
                  <b className="pnr-mini">{b.booking_reference ?? "······"}</b>
                  <span>
                    {b.offer.slices.map((s) => `${s.origin}–${s.destination}`).join(", ")}
                    <small>{b.offer.owner.name} · {day(b.offer.slices[0].segments[0].departing_at)} · {b.status.replace("_", " ")}</small>
                  </span>
                  <span>{b.pay_with === "points" ? `${(b.points_amount ?? 0).toLocaleString()} pts` : money(b.total_amount)}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      {watches.length > 0 && (
        <>
          <h2 className="section-title">Price watches</h2>
          <ul className="watch-list">
            {watches.map((w) => (
              <li key={w.id}>
                <a href={`#/fly?from=${w.origin}&to=${w.destination}&month=${w.depart_month}`}>
                  <b>{w.origin} → {w.destination}</b> {monthName(w.depart_month)}
                </a>
                <span>
                  {w.last_price ? `now ${money(w.last_price)}` : "checking"}
                  {w.lowest_seen ? ` · low ${money(w.lowest_seen)}` : ""}
                  {w.target_price ? ` · alert under ${money(w.target_price)}` : ""}
                </span>
                <button
                  className="linkish remove"
                  onClick={async () => {
                    await supabase.from("price_watches").delete().eq("id", w.id);
                    load();
                  }}
                >
                  Stop
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {past.length > 0 && (
        <>
          <h2 className="section-title">Your flying</h2>
          <dl className="logbook">
            <div><dt>Flights</dt><dd>{log.flights}</dd></div>
            <div><dt>Miles</dt><dd>{log.miles.toLocaleString()}</dd></div>
            <div><dt>Hours aloft</dt><dd>{log.hours}</dd></div>
            <div><dt>Airports</dt><dd>{log.airports}</dd></div>
            <div><dt>Airlines</dt><dd>{log.airlines}</dd></div>
            <div><dt>Around the earth</dt><dd>{(log.miles / 24901).toFixed(2)}×</dd></div>
          </dl>
          {log.routes.length > 0 && <FlightMap routes={log.routes} height="300px" label="Every route you've flown" />}
          {log.longest && <p className="fine">Longest: {log.longest.t.ident}, {log.longest.t.origin} to {log.longest.t.destination}, {Math.round(log.longest.d).toLocaleString()} miles.</p>}

          <button className="linkish" onClick={() => setShowPast(!showPast)}>{showPast ? "Hide past flights" : `Show ${past.length} past flights`}</button>
          {showPast && (
            <ul className="past-list">
              {past.map((t) => (
                <li key={t.id}>
                  <a href={tripLink(t)}>
                    <span>{day(t.scheduled_out)}</span>
                    <b>{t.ident}</b>
                    <span>{t.origin} → {t.destination}</span>
                    <span>{airlineName(t.ident.replace(/\d.*/, ""))}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {alerts.length > unread.length && (
        <details className="others">
          <summary>Earlier alerts</summary>
          <ul className="old-alerts">
            {alerts.filter((a) => a.read_at).map((a) => (
              <li key={a.id}><a href={a.link ?? "#/trips"}>{a.title}</a> <small>{ago(a.created_at, now)}</small></li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
