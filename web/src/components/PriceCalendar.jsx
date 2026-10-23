// A month of cheapest prices, one cell per day, shaded by how cheap the day is relative
// to the rest of the month. Tapping a day picks it.
import { money, todayISO } from "../lib.js";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

export default function PriceCalendar({ month, days, selected, onPick }) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const prices = Object.values(days ?? {}).map((d) => d.price).sort((a, b) => a - b);
  const lo = prices[Math.floor(prices.length / 3)] ?? 0;
  const hi = prices[Math.floor((prices.length * 2) / 3)] ?? Infinity;
  const min = prices[0];
  const today = todayISO();

  return (
    <div className="cal" role="grid" aria-label="Cheapest price by day">
      {DOW.map((d, i) => (
        <span key={i} className="cal-dow" role="columnheader">{d}</span>
      ))}
      {Array.from({ length: first }, (_, i) => <span key={`b${i}`} />)}
      {Array.from({ length: count }, (_, i) => {
        const date = `${month}-${String(i + 1).padStart(2, "0")}`;
        const d = days?.[date];
        const past = date < today;
        const band = !d ? "none" : d.price <= lo ? "low" : d.price >= hi ? "high" : "mid";
        return (
          <button
            key={date}
            role="gridcell"
            className={`cal-day band-${band}${selected === date ? " is-selected" : ""}${d?.price === min ? " is-min" : ""}`}
            disabled={past}
            onClick={() => onPick(date)}
            aria-label={`${date}${d ? `, from ${money(d.price)}` : ", no price yet"}`}
          >
            <span>{i + 1}</span>
            <b>{d ? money(d.price) : past ? "" : "·"}</b>
          </button>
        );
      })}
    </div>
  );
}
