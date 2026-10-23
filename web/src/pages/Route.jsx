import { useEffect, useState } from "react";
import { Flaps } from "../components/Board.jsx";
import FlightMap from "../components/FlightMap.jsx";
import { airlineName } from "../data/airlines.js";
import { airport } from "../data/airports.js";
import { call, clock24, day, delayOf, duration, statusLine, tone } from "../lib.js";
import { miles } from "../geo.js";

export default function Route({ route }) {
  const [o, d] = [(route.parts[1] ?? "").toUpperCase(), (route.parts[2] ?? "").toUpperCase()];
  const [r, setR] = useState(null);
  const [err, setErr] = useState("");
  const A = airport(o), B = airport(d);

  useEffect(() => {
    setR(null);
    call("flight-status", { action: "route", origin: o, destination: d, origin_icao: A?.icao, destination_icao: B?.icao })
      .then(setR)
      .catch((e) => setErr(e.message));
  }, [o, d]);

  // today's picture: skip flights that landed a while ago, earliest departure first
  const flights = (r?.flights ?? [])
    .filter((f) => Date.now() - new Date(f.actual_in ?? f.estimated_in ?? f.scheduled_in ?? f.scheduled_out) < 2 * 3600_000)
    .sort((a, b) => a.scheduled_out.localeCompare(b.scheduled_out));
  const dist = A && B ? Math.round(miles(A, B)) : null;

  return (
    <section className="page">
      <a className="back" href="#/">Track</a>
      {r?.demo && <p className="note">Sample schedule. Live data turns on once the FlightAware key is added.</p>}
      <p className="eyebrow">{o} → {d}{dist ? ` · ${dist.toLocaleString()} miles` : ""}</p>
      <h1 className="page-title">{A?.city ?? o} <span className="to">to</span> {B?.city ?? d}</h1>

      {A && B && <FlightMap route={{ from: [A.lat, A.lon], to: [B.lat, B.lon] }} codes={[o, d]} height="220px" label={`Route from ${o} to ${d}`} />}

      {err && <p className="error" role="alert">{err}</p>}
      {!r && !err && <p className="empty">Finding today's flights…</p>}
      {r && !flights.length && <p className="empty">No nonstop flights found between {o} and {d} right now. Try the fares search for connections.</p>}

      {flights.length > 0 && (
        <ol className="route-list">
          {flights.map((f) => {
            const t = tone(f);
            const dl = delayOf(f);
            return (
              <li key={f.fa_flight_id}>
                <a href={`#/flight/${f.ident}?id=${encodeURIComponent(f.fa_flight_id)}`}>
                  <span className="rl-time"><Flaps text={clock24(f.scheduled_out, f.origin_tz ?? A?.tz)} width={5} /></span>
                  <span className="rl-main">
                    {day(f.scheduled_out, f.origin_tz ?? A?.tz) !== day(new Date().toISOString(), f.origin_tz ?? A?.tz) && <em className="rl-day">{day(f.scheduled_out, f.origin_tz ?? A?.tz)}</em>}
                    <b>{f.ident}</b> {airlineName(f.operator)}
                    <small>
                      {f.aircraft_type ?? ""}{f.scheduled_in ? ` · ${duration((new Date(f.scheduled_in) - new Date(f.scheduled_out)) / 60000)}` : ""}
                      {` · arrives ${clock24(f.estimated_in ?? f.scheduled_in, f.destination_tz ?? B?.tz)}`}
                    </small>
                  </span>
                  <span className={`rl-status tone-text-${t}`}>{t === "delayed" && dl ? `${dl}m late` : statusLine(f)}</span>
                </a>
              </li>
            );
          })}
        </ol>
      )}

      <div className="actions">
        <a className="btn" href={`#/fly?from=${o}&to=${d}`}>Fares from {o} to {d}</a>
        <a className="btn btn-quiet" href={`#/route/${d}/${o}`}>Flip direction</a>
      </div>
    </section>
  );
}
