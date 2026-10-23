import { useEffect, useState } from "react";
import { BoardRow, boardFor } from "../components/Board.jsx";
import AirportPicker from "../components/AirportPicker.jsx";
import { airport } from "../data/airports.js";
import { day, local, supabase, until, useNow, useUser } from "../lib.js";
import { go } from "../router.js";

const MODES = [
  { id: "flight", label: "Flight number" },
  { id: "route", label: "Route" },
  { id: "airport", label: "Airport" },
];

const BIG = ["ATL", "DFW", "DEN", "ORD", "LAX", "JFK", "LAS", "MCO"];

export default function Home() {
  const user = useUser();
  const now = useNow(30_000);
  const [mode, setMode] = useState(local.get("trackMode", "flight"));
  const [q, setQ] = useState("");
  const [from, setFrom] = useState(local.get("lastFrom", ""));
  const [to, setTo] = useState("");
  const [here, setHere] = useState(local.get("lastAirport", ""));
  const [next, setNext] = useState(null);
  const [home, setHome] = useState(null);
  const recent = local.get("recent:flights", []);
  const pinned = local.get("pinnedAirports", []);

  useEffect(() => {
    local.set("trackMode", mode);
  }, [mode]);

  useEffect(() => {
    if (!user || !supabase) return;
    supabase
      .from("tracked_flights")
      .select("*")
      .gte("scheduled_in", new Date(Date.now() - 3 * 3600_000).toISOString())
      .order("scheduled_out")
      .limit(1)
      .then(({ data }) => setNext(data?.[0] ?? null));
    supabase.from("profiles").select("home_airport").eq("id", user.id).maybeSingle().then(({ data }) => setHome(data?.home_airport ?? null));
  }, [user?.id]);

  function submit(e) {
    e.preventDefault();
    if (mode === "flight") {
      const ident = q.toUpperCase().replace(/[\s-]+/g, "");
      if (ident) go(`/flight/${ident}`);
    } else if (mode === "route") {
      if (from && to) {
        local.set("lastFrom", from);
        go(`/route/${from}/${to}`);
      }
    } else if (here) {
      local.set("lastAirport", here);
      go(`/airport/${here}`);
    }
  }

  const quick = [...new Set([home, ...pinned, ...BIG].filter(Boolean))].slice(0, 10);

  return (
    <section className="page home">
      <div className="hero">
        <p className="eyebrow">Live flight tracking</p>
        <h1 className="page-title">Where's my flight?</h1>
      </div>

      <div className="seg" role="tablist" aria-label="Search by">
        {MODES.map((m) => (
          <button key={m.id} role="tab" aria-selected={mode === m.id} onClick={() => setMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      <form className="search-row" onSubmit={submit}>
        {mode === "flight" && (
          <label className="field grow">
            <span>Flight or tail number</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="AA1234 or N123AB"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck="false"
              className="ident-input"
              required
            />
          </label>
        )}
        {mode === "route" && (
          <>
            <AirportPicker label="From" value={from} onChange={setFrom} required className="grow" />
            <AirportPicker label="To" value={to} onChange={setTo} required className="grow" />
          </>
        )}
        {mode === "airport" && <AirportPicker label="Airport" value={here} onChange={setHere} required className="grow" />}
        <button className="btn">{mode === "airport" ? "See the board" : "Find flights"}</button>
      </form>

      {next && (
        <a className="next-trip" href={`#/flight/${next.ident}${next.fa_flight_id ? `?id=${encodeURIComponent(next.fa_flight_id)}` : ""}`}>
          <span className="next-trip-label">
            Your next flight · {day(next.scheduled_out)}
            <b>{new Date(next.scheduled_out) > now ? `leaves in ${until(next.estimated_out ?? next.scheduled_out, now)}` : "today"}</b>
          </span>
          <BoardRow flight={boardFor(next.snapshot ?? next)} />
        </a>
      )}

      <div className="home-grid">
        <div>
          <h2 className="section-title">Airports</h2>
          <ul className="chips">
            {quick.map((c) => (
              <li key={c}>
                <a className="chip" href={`#/airport/${c}`}>
                  <b>{c}</b> {airport(c)?.city ?? ""}
                </a>
              </li>
            ))}
          </ul>
        </div>

        {recent.length > 0 && (
          <div>
            <h2 className="section-title">Looked up recently</h2>
            <ul className="recent">
              {recent.map((r) => (
                <li key={r.ident}>
                  <a href={`#/flight/${r.ident}`}>
                    <b>{r.ident}</b>
                    <span>{r.origin} → {r.destination}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <a className="radar-callout" href="#/radar">
        <span className="radar-sweep" aria-hidden="true" />
        <span>
          <strong>Live radar</strong>
          Every plane in the sky around you, updated every few seconds. Tap one to see where it's going.
        </span>
      </a>

      <ul className="pillars">
        <li>
          <h3>Track anything that flies</h3>
          <p>Gates, delays, the runway it used, and where your plane is coming from before it gets to you.</p>
        </li>
        <li>
          <h3>Cash or points</h3>
          <p>Every fare shows what it costs in dollars and in the miles you already have, and which is the better deal.</p>
          <a href="#/fly">Search fares</a>
        </li>
        <li>
          <h3>One wallet for every program</h3>
          <p>Airline miles and card points in one place, with what they're worth and where they can transfer.</p>
          <a href="#/wallet">Open your wallet</a>
        </li>
      </ul>
    </section>
  );
}
