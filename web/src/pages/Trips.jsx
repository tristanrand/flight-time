import { useEffect, useState } from "react";
import { BoardRow } from "../components/Board.jsx";
import { call, clock, day, money, supabase, tone, toneLabel, useUser } from "../lib.js";

export default function Trips({ go }) {
  const user = useUser();
  const [trips, setTrips] = useState(null);
  const [watches, setWatches] = useState([]);

  async function load() {
    const [t, w] = await Promise.all([
      supabase.from("tracked_flights").select("*").order("scheduled_out", { ascending: true }),
      supabase.from("price_watches").select("*").order("created_at", { ascending: false }),
    ]);
    setTrips(t.data ?? []);
    setWatches(w.data ?? []);
  }

  useEffect(() => {
    if (!user) return;
    load();
    // FlightAware alerts update these rows server-side; show changes the moment they land
    const ch = supabase
      .channel("trips")
      .on("postgres_changes", { event: "*", schema: "public", table: "tracked_flights", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [user]);

  if (user === undefined) return <section className="page" />;
  if (!user)
    return (
      <section className="page">
        <h1 className="page-title">My trips</h1>
        <p className="empty">Sign in to save flights and get told the moment they're delayed, cancelled, or land.</p>
        <button className="btn" onClick={() => go("account")}>Sign in</button>
      </section>
    );

  return (
    <section className="page">
      <h1 className="page-title">My trips</h1>
      {trips?.length === 0 && (
        <>
          <p className="empty">No saved flights yet. Look one up and tap "Save to My trips".</p>
          <button className="btn" onClick={() => go("track")}>Look up a flight</button>
        </>
      )}
      <ul className="trip-list">
        {trips?.map((t) => {
          const k = tone(t);
          return (
            <li key={t.id}>
              <button className="trip" onClick={() => go("track", t.ident)}>
                <span className="trip-day">{day(t.scheduled_out)}</span>
                <BoardRow
                  compact
                  flight={{
                    ident: t.ident,
                    origin: t.origin,
                    destination: t.destination,
                    timeLabel: "Departs",
                    time: clock(t.estimated_out ?? t.scheduled_out),
                    statusText: k === "delayed" && t.delay_minutes ? `Late ${t.delay_minutes}m` : toneLabel[k],
                    tone: k,
                  }}
                />
              </button>
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
          );
        })}
      </ul>

      {watches.length > 0 && (
        <>
          <h2 className="section-title">Price watches</h2>
          <ul className="watch-list">
            {watches.map((w) => (
              <li key={w.id}>
                <button className="linkish" onClick={() => go("fares", { origin: w.origin, destination: w.destination })}>
                  {w.origin} to {w.destination}, {new Date(`${w.depart_month}-01T12:00`).toLocaleDateString("en-US", { month: "long" })}
                </button>
                <span>{w.last_price ? `from ${money(w.last_price)}` : "checking"}</span>
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
    </section>
  );
}
