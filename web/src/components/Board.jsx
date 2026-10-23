// The departure-board strip: the one loud thing in the app.
// Each character sits on its own flap; text is padded so columns line up like a real board.
import { airport } from "../data/airports.js";
import { clock24, delayOf, tone, toneLabel } from "../lib.js";

export function Flaps({ text, width, tone }) {
  const s = String(text ?? "").toUpperCase().slice(0, width ?? 99).padEnd(width ?? String(text ?? "").length, " ");
  return (
    <span className={`flaps ${tone ? `tone-${tone}` : ""}`} aria-label={String(text ?? "")}>
      {[...s].map((ch, i) => (
        <span key={i} className="flap" aria-hidden="true">
          {ch === " " ? " " : ch}
        </span>
      ))}
    </span>
  );
}

/** Full board row for a flight: number, route, time, status. */
export function BoardRow({ flight, compact }) {
  const t = flight.tone;
  return (
    <div className={`board ${compact ? "board-compact" : ""}`}>
      <div className="board-cell">
        <span className="board-key">Flight</span>
        <Flaps text={flight.ident} width={6} />
      </div>
      <div className="board-cell">
        <span className="board-key">From</span>
        <Flaps text={flight.origin} width={3} />
      </div>
      <div className="board-cell">
        <span className="board-key">To</span>
        <Flaps text={flight.destination} width={3} />
      </div>
      <div className="board-cell">
        <span className="board-key">{flight.timeLabel}</span>
        <Flaps text={flight.time} width={compact ? 5 : 8} />
      </div>
      <div className="board-cell board-status">
        <span className="board-key">Status</span>
        <Flaps text={flight.statusText} width={compact ? 9 : 11} tone={t} />
      </div>
    </div>
  );
}

/** Board fields for one flight, in the airport's own local time. */
export function boardFor(f) {
  const t = tone(f);
  const departed = !!f.actual_out;
  const d = delayOf(f);
  return {
    ident: f.ident,
    origin: f.origin,
    destination: f.destination,
    timeLabel: departed ? "Arrives" : "Departs",
    time: departed
      ? clock24(f.actual_in ?? f.estimated_in ?? f.scheduled_in, f.destination_tz ?? airport(f.destination)?.tz)
      : clock24(f.estimated_out ?? f.scheduled_out, f.origin_tz ?? airport(f.origin)?.tz),
    statusText: t === "delayed" && d ? `Late ${d}m` : toneLabel[t],
    tone: t,
  };
}

/**
 * An airport's departures or arrivals as a real board: one row per flight, every row a link.
 * kind: "departures" | "arrivals"
 */
export function BoardTable({ flights, kind, tz }) {
  const dep = kind === "departures";
  return (
    <div className="board board-table" role="table" aria-label={dep ? "Departures" : "Arrivals"}>
      <div className="bt-row bt-head" role="row">
        <span role="columnheader">Time</span>
        <span role="columnheader">Flight</span>
        <span role="columnheader">{dep ? "To" : "From"}</span>
        <span role="columnheader" className="bt-gate">Gate</span>
        <span role="columnheader">Status</span>
      </div>
      {flights.map((f) => {
        const t = tone(f);
        const d = delayOf(f);
        const time = dep ? f.scheduled_out : f.scheduled_in;
        const est = dep ? f.estimated_out : f.estimated_in;
        const other = dep ? f.destination : f.origin;
        const status =
          t === "cancelled" ? "Cancelled"
          : dep && f.actual_out ? "Departed"
          : !dep && f.actual_in ? "Arrived"
          : !dep && f.actual_on ? "Landed"
          : d >= 15 ? `Now ${clock24(est, tz)}`
          : !dep && f.actual_off ? "In the air"
          : "On time";
        return (
          <a key={f.fa_flight_id} role="row" className="bt-row" href={`#/flight/${f.ident}?id=${encodeURIComponent(f.fa_flight_id)}`}>
            <span role="cell"><Flaps text={clock24(time, tz)} width={5} /></span>
            <span role="cell"><Flaps text={f.ident} width={6} /></span>
            <span role="cell" className="bt-place">
              <Flaps text={other} width={3} />
              <em>{airport(other)?.city ?? (dep ? f.destination_name : f.origin_name)}</em>
            </span>
            <span role="cell" className="bt-gate"><Flaps text={(dep ? f.gate_origin : f.gate_destination) ?? ""} width={3} /></span>
            <span role="cell"><Flaps text={status} width={9} tone={t === "airborne" ? "scheduled" : t} /></span>
          </a>
        );
      })}
    </div>
  );
}
