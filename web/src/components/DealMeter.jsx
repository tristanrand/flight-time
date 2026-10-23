// "Is this a good price?" — today's low against what we've seen on this route.
import { money } from "../lib.js";

function Spark({ points }) {
  if (!points || points.length < 2) return null;
  const ys = points.map((p) => p[1]);
  const min = Math.min(...ys), max = Math.max(...ys);
  const w = 160, h = 36;
  const d = points
    .map((p, i) => `${i ? "L" : "M"}${((i / (points.length - 1)) * w).toFixed(1)},${(h - 4 - ((p[1] - min) / (max - min || 1)) * (h - 8)).toFixed(1)}`)
    .join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

const WORDS = {
  low: ["Prices are low", "Cheaper than usual for this route. A good time to book."],
  typical: ["Prices are typical", "About what this route usually costs."],
  high: ["Prices are high", "More than usual. Watch the route and we'll tell you when it drops."],
};

export default function DealMeter({ stats }) {
  if (!stats) return null;
  const [title, body] = WORDS[stats.rating] ?? ["Building price history", `We've tracked this route for ${stats.days_tracked} day${stats.days_tracked === 1 ? "" : "s"}. After about a week we can tell you if a price is a deal.`];
  const pos = stats.range ? Math.max(0, Math.min(100, ((stats.min - stats.range[0]) / (stats.range[1] - stats.range[0] || 1)) * 100)) : null;
  return (
    <div className={`deal deal-${stats.rating ?? "new"}`}>
      <div>
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
      {pos != null && (
        <div className="deal-scale" aria-label={`Usual range ${money(stats.range[0])} to ${money(stats.range[1])}`}>
          <span className="deal-track"><i style={{ left: `${pos}%` }} /></span>
          <span className="deal-ends"><span>{money(stats.range[0])}</span><span>{money(stats.range[1])}</span></span>
        </div>
      )}
      <Spark points={stats.history} />
    </div>
  );
}
