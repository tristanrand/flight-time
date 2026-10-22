// The departure-board strip: the one loud thing in the app.
// Each character sits on its own flap; text is padded so columns line up like a real board.

export function Flaps({ text, width, tone }) {
  const s = String(text ?? "").toUpperCase().padEnd(width ?? String(text ?? "").length, " ");
  return (
    <span className={`flaps ${tone ? `tone-${tone}` : ""}`} aria-label={String(text ?? "")}>
      {[...s].map((ch, i) => (
        <span key={i} className="flap" aria-hidden="true">
          {ch === " " ? " " : ch}
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
        <Flaps text={flight.time} width={8} />
      </div>
      <div className="board-cell board-status">
        <span className="board-key">Status</span>
        <Flaps text={flight.statusText} width={compact ? 9 : 11} tone={t} />
      </div>
    </div>
  );
}
