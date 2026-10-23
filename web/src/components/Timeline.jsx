// The four moments of a flight, each with the time it was meant to happen and the time
// it did (or now will). Late times are amber, early are green, like the board.
import { airport } from "../data/airports.js";
import { clock } from "../lib.js";

const diffMin = (a, b) => (a && b ? Math.round((new Date(a) - new Date(b)) / 60000) : 0);

export default function Timeline({ f }) {
  const oz = f.origin_tz ?? airport(f.origin)?.tz;
  const dz = f.destination_tz ?? airport(f.destination)?.tz;
  const steps = [
    { label: "Leaves the gate", where: f.gate_origin ? `Gate ${f.gate_origin}` : f.origin, s: f.scheduled_out, e: f.estimated_out, a: f.actual_out, tz: oz },
    { label: "Takes off", where: f.runway_off ? `Runway ${f.runway_off}` : "", s: f.scheduled_off, e: f.estimated_off, a: f.actual_off, tz: oz },
    { label: "Lands", where: f.runway_on ? `Runway ${f.runway_on}` : "", s: f.scheduled_on, e: f.estimated_on, a: f.actual_on, tz: dz },
    { label: "Arrives at the gate", where: f.gate_destination ? `Gate ${f.gate_destination}` : f.destination, s: f.scheduled_in, e: f.estimated_in, a: f.actual_in, tz: dz },
  ];
  const current = steps.findIndex((x) => !x.a);
  return (
    <ol className="timeline">
      {steps.map((x, i) => {
        const shown = x.a ?? x.e ?? x.s;
        const late = diffMin(shown, x.s);
        const cls = late >= 15 ? "late" : late <= -5 ? "early" : "";
        return (
          <li key={x.label} className={`${x.a ? "done" : ""} ${i === current ? "next" : ""}`}>
            <span className="tl-dot" aria-hidden="true" />
            <div className="tl-what">
              <strong>{x.label}</strong>
              {x.where && <span>{x.where}</span>}
            </div>
            <div className="tl-when">
              <b className={cls}>{clock(shown, x.tz)}</b>
              {x.s && Math.abs(late) >= 5 ? <s>{clock(x.s, x.tz)}</s> : <small>{x.a ? "actual" : x.e ? "expected" : "scheduled"}</small>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
