import { useEffect, useState } from "react";
import { BoardRow } from "../components/Board.jsx";
import FlightMap from "../components/FlightMap.jsx";
import { call, clock, day, tone, toneLabel, useUser } from "../lib.js";

const boardFor = (f) => {
  const t = tone(f);
  const departed = !!f.actual_out;
  return {
    ident: f.ident,
    origin: f.origin,
    destination: f.destination,
    timeLabel: departed ? "Arrives" : "Departs",
    time: clock(departed ? f.estimated_in ?? f.scheduled_in : f.estimated_out ?? f.scheduled_out),
    statusText: t === "delayed" && f.delay_minutes ? `Late ${f.delay_minutes}m` : toneLabel[t],
    tone: t,
  };
};

export default function Track({ go, initial }) {
  const user = useUser();
  const [q, setQ] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null); // { flights, demo }
  const [pick, setPick] = useState(null);
  const [live, setLive] = useState(null); // { position, track, route }
  const [saved, setSaved] = useState("");

  async function lookup(e) {
    e?.preventDefault();
    setErr("");
    setResult(null);
    setPick(null);
    setLive(null);
    setSaved("");
    setBusy(true);
    try {
      const r = await call("flight-status", { action: "lookup", ident: q });
      if (!r.flights?.length) setErr(`No flights found for ${q.toUpperCase()}. Check the airline code and number.`);
      setResult(r);
      // the departure closest to now is the one people almost always mean
      const now = Date.now();
      const best = [...(r.flights ?? [])].sort(
        (a, b) => Math.abs(new Date(a.scheduled_out) - now) - Math.abs(new Date(b.scheduled_out) - now),
      )[0];
      setPick(best ?? null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (initial) lookup();
  }, []);

  // live position for the chosen departure, refreshed every 60s while it's in the air
  useEffect(() => {
    if (!pick) return;
    let stop = false;
    const load = () =>
      call("flight-status", { action: "position", fa_flight_id: pick.fa_flight_id })
        .then((r) => !stop && setLive(r))
        .catch(() => {});
    load();
    const airborne = pick.actual_out && !pick.actual_in;
    const t = airborne ? setInterval(load, 60_000) : null;
    return () => {
      stop = true;
      if (t) clearInterval(t);
    };
  }, [pick?.fa_flight_id]);

  async function save() {
    if (!user) return go("account");
    try {
      await call("flight-status", { action: "track", flight: pick });
      setSaved("Saved to My trips. You'll see changes there as they happen.");
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <section className="page">
      <h1 className="page-title">Where's my flight?</h1>
      <form className="search-row" onSubmit={lookup}>
        <label className="field grow">
          <span>Flight number</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="AA1234"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck="false"
            required
          />
        </label>
        <button className="btn" disabled={busy || !q.trim()}>
          {busy ? "Looking…" : "Find flight"}
        </button>
      </form>

      {result?.demo && <p className="note">Showing sample data. Live tracking turns on once the FlightAware key is added.</p>}
      {err && <p className="error" role="alert">{err}</p>}

      {pick && (
        <>
          <BoardRow flight={boardFor(pick)} />
          <FlightMap position={live?.position} track={live?.track} route={live?.route} />

          <dl className="facts">
            <div>
              <dt>{pick.origin_name ?? pick.origin}</dt>
              <dd>
                {clock(pick.actual_out ?? pick.estimated_out ?? pick.scheduled_out)}
                <small>{day(pick.scheduled_out)}{pick.gate_origin ? ` · Gate ${pick.gate_origin}` : ""}</small>
              </dd>
            </div>
            <div>
              <dt>{pick.destination_name ?? pick.destination}</dt>
              <dd>
                {clock(pick.actual_in ?? pick.estimated_in ?? pick.scheduled_in)}
                <small>
                  {pick.gate_destination ? `Gate ${pick.gate_destination}` : "Gate not posted"}
                  {pick.baggage_claim ? ` · Bags at ${pick.baggage_claim}` : ""}
                </small>
              </dd>
            </div>
            {live?.position && (
              <div>
                <dt>Right now</dt>
                <dd>
                  {(live.position.altitude * 100).toLocaleString()} ft
                  <small>{live.position.groundspeed} knots</small>
                </dd>
              </div>
            )}
          </dl>

          {pick.progress_percent > 0 && pick.progress_percent < 100 && (
            <div className="progress" aria-label={`${pick.progress_percent}% of the way there`}>
              <span style={{ width: `${pick.progress_percent}%` }} />
            </div>
          )}

          <div className="actions">
            <button className="btn" onClick={save}>{user ? "Save to My trips" : "Sign in to save this trip"}</button>
            {pick.origin && pick.destination && (
              <button className="btn btn-quiet" onClick={() => go("fares", { origin: pick.origin, destination: pick.destination })}>
                Find fares on this route
              </button>
            )}
          </div>
          {saved && <p className="ok">{saved}</p>}

          {result.flights.length > 1 && (
            <details className="others">
              <summary>Other days for {pick.ident}</summary>
              <ul>
                {result.flights.map((f) => (
                  <li key={f.fa_flight_id}>
                    <button className="linkish" onClick={() => setPick(f)} aria-current={f === pick}>
                      {day(f.scheduled_out)} · {f.origin} to {f.destination} · {toneLabel[tone(f)]}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {!pick && !err && !busy && (
        <p className="empty">Type a flight number to see where the plane is, when it lands, and which gate it's headed to.</p>
      )}
    </section>
  );
}
