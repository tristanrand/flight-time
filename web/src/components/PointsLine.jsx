import { useState } from "react";
import { fmtPoints, pointsOptions, verdict } from "../points.js";
import { money } from "../lib.js";
import { PROGRAMS, programLabel } from "../data/programs.js";

/**
 * Under each fare: "or 14,200 AAdvantage miles + $5.60", and on tap every way to pay with
 * points, cheapest first, marking the ones the traveler can cover from their wallet.
 */
export default function PointsLine({ price, airline, segments = 1, intl = false, wallet, award }) {
  const [open, setOpen] = useState(false);
  const { options, best, cashWins } = pointsOptions({ price, airline, segments, intl, wallet: wallet?.length ? wallet : null, award });
  if (!options.length) return null;
  const head = best ?? options[0];
  const short = (o) => `${fmtPoints(o.points)} ${o.kind === "portal" ? `${PROGRAMS[o.program].owner} points` : programLabel(o.program)}${o.taxes ? ` + ${money(o.taxes, true)}` : ""}`;

  return (
    <div className="points-line">
      <button className="linkish pts" onClick={() => setOpen(!open)} aria-expanded={open}>
        or {short(head)}
        {!head.exact && <span className="est">est.</span>}
        {wallet?.length ? (head.balance >= head.points ? <em className="covered">you have enough</em> : <em>you're short</em>) : null}
      </button>
      {open && (
        <div className="pts-detail">
          <p className={cashWins ? "warn" : "ok"}>{cashWins ? "Paying cash is the better deal here." : verdict(head, price)}</p>
          <table>
            <thead>
              <tr><th>Pay with</th><th>Points</th><th>Worth</th><th /></tr>
            </thead>
            <tbody>
              {options.slice(0, 6).map((o) => (
                <tr key={o.kind + o.program}>
                  <td>
                    {o.label}
                    {o.detail && <small>{o.detail}</small>}
                  </td>
                  <td>{fmtPoints(o.points)}{o.taxes ? <small>+ {money(o.taxes, true)}</small> : null}</td>
                  <td>{o.cpp.toFixed(1)}¢<small>per point</small></td>
                  <td>{wallet?.length ? (o.balance >= o.points ? <span className="ok">✓ {fmtPoints(o.balance)}</span> : <span className="muted">{fmtPoints(o.balance)}</span>) : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="fine">
            {award ? "Award price from live availability; taxes may vary." : "Estimated from the cash fare. Airlines price most awards off the fare, so the real number is usually close."}
          </p>
        </div>
      )}
    </div>
  );
}
