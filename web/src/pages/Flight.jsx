import { useEffect, useMemo, useState } from "react";
import { BoardRow, boardFor } from "../components/Board.jsx";
import FlightMap, { planeSvg } from "../components/FlightMap.jsx";
import Timeline from "../components/Timeline.jsx";
import { airlineName } from "../data/airlines.js";
import { airport } from "../data/airports.js";
import {
  call, clock, day, delayOf, duration, longDay, remember, statusLine, tone, until, useNow, useUser,
} from "../lib.js";
import { go } from "../router.js";

/** The departure people almost always mean: the one in the air, else the next one, else the latest. */
function bestOf(flights) {
  const now = Date.now();
  const airborne = flights.find((f) => f.actual_out && !f.actual_in && !f.cancelled);
  if (airborne) return airborne;
  const upcoming = flights
    .filter((f) => !f.actual_out && new Date(f.scheduled_out) > now - 2 * 3600_000)
    .sort((a, b) => new Date(a.scheduled_out) - new Date(b.scheduled_out))[0];
  if (upcoming && new Date(upcoming.scheduled_out) - now < 20 * 3600_000) return upcoming;
  return [...flights].sort((a, b) => Math.abs(new Date(a.scheduled_out) - now) - Math.abs(new Date(b.scheduled_out) - now))[0];
}

function ics(f) {
  const stamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const body = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Flight Time//EN", "BEGIN:VEVENT",
    `UID:${f.fa_flight_id}@flight-time`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(f.scheduled_out)}`,
    `DTEND:${stamp(f.scheduled_in ?? f.scheduled_out)}`,
    `SUMMARY:${f.ident} ${f.origin} → ${f.destination}`,
    `LOCATION:${f.origin_airport ?? f.origin}`,
    `DESCRIPTION:Track it live: ${location.origin}/#/flight/${f.ident}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type: "text/calendar" }));
  a.download = `${f.ident}-${f.scheduled_out.slice(0, 10)}.ics`;
  a.click();
}

export default function Flight({ route }) {
  const ident = (route.parts[1] ?? "").toUpperCase();
  const wantId = route.query.id;
  const user = useUser();
  const now = useNow(30_000);
  const [flights, setFlights] = useState(null);
  const [demo, setDemo] = useState(false);
  const [pickId, setPickId] = useState(wantId ?? null);
  const [err, setErr] = useState("");
  const [live, setLive] = useState(null);
  const [aircraft, setAircraft] = useState(null);
  const [inbound, setInbound] = useState(null);
  const [saved, setSaved] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let stop = false;
    setFlights(null);
    setErr("");
    (async () => {
      try {
        const r = await call("flight-status", { action: "lookup", ident });
        let list = r.flights ?? [];
        // a link to a specific departure that's dropped off the recent list
        if (wantId && !list.some((f) => f.fa_flight_id === wantId)) {
          const one = await call("flight-status", { action: "flight", fa_flight_id: wantId }).catch(() => null);
          if (one?.flight) list = [one.flight, ...list];
        }
        if (stop) return;
        setDemo(!!r.demo);
        setFlights(list);
        if (!list.length) setErr(`No recent or upcoming flights for ${ident}. Check the airline code and number.`);
        const best = list.find((f) => f.fa_flight_id === wantId) ?? bestOf(list);
        setPickId(best?.fa_flight_id ?? null);
        if (best) remember("flights", { ident: best.ident, origin: best.origin, destination: best.destination });
      } catch (e) {
        if (!stop) setErr(e.message);
      }
    })();
    return () => {
      stop = true;
    };
  }, [ident]);

  const f = useMemo(() => flights?.find((x) => x.fa_flight_id === pickId) ?? null, [flights, pickId]);
  const airborne = f && f.actual_off && !f.actual_on;

  // live position for the chosen departure, refreshed every 60s while it's in the air
  useEffect(() => {
    if (!f) return;
    setLive(null);
    let stop = false;
    const load = () =>
      call("flight-status", { action: "position", fa_flight_id: f.fa_flight_id })
        .then((r) => !stop && setLive(r))
        .catch(() => {});
    load();
    const t = f.actual_out && !f.actual_in ? setInterval(load, 60_000) : null;
    return () => {
      stop = true;
      if (t) clearInterval(t);
    };
  }, [f?.fa_flight_id]);

  useEffect(() => {
    if (!f?.aircraft_type) return;
    call("flight-status", { action: "aircraft", type: f.aircraft_type }).then((r) => setAircraft(r.aircraft)).catch(() => {});
  }, [f?.aircraft_type]);

  // "where's my plane": only worth a lookup before this flight has left
  useEffect(() => {
    setInbound(null);
    if (!f?.inbound_fa_flight_id || f.actual_out || f.cancelled) return;
    if (new Date(f.scheduled_out) - Date.now() > 12 * 3600_000) return;
    call("flight-status", { action: "flight", fa_flight_id: f.inbound_fa_flight_id }).then((r) => setInbound(r.flight)).catch(() => {});
  }, [f?.fa_flight_id]);

  async function save() {
    if (!user) return go("/account", { next: location.hash.slice(1) });
    try {
      await call("flight-status", { action: "track", flight: f });
      setSaved("Saved to My trips. We'll tell you the moment anything changes.");
    } catch (e) {
      setErr(e.message);
    }
  }

  async function share() {
    const url = `${location.origin}/#/flight/${f.ident}?id=${encodeURIComponent(f.fa_flight_id)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${f.ident} ${f.origin} to ${f.destination}`, url });
        return;
      } catch {}
    }
    await navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  if (err && !f)
    return (
      <section className="page">
        <a className="back" href="#/">Track another flight</a>
        <h1 className="page-title">{ident}</h1>
        <p className="error" role="alert">{err}</p>
      </section>
    );

  if (!f)
    return (
      <section className="page">
        <h1 className="page-title">{ident}</h1>
        <div className="board board-loading" aria-busy="true">
          <span className="board-key">Looking up {ident}…</span>
        </div>
      </section>
    );

  const oz = f.origin_tz ?? airport(f.origin)?.tz;
  const dz = f.destination_tz ?? airport(f.destination)?.tz;
  const A = airport(f.origin), B = airport(f.destination);
  const route2 = live?.route ?? (A && B ? { from: [A.lat, A.lon], to: [B.lat, B.lon] } : null);
  const dist = f.route_distance;
  const pct = f.actual_in || f.actual_on ? 100 : f.progress_percent ?? 0;
  const arriveAt = f.actual_in ?? f.estimated_in ?? f.scheduled_in;
  const leaveAt = f.actual_out ?? f.estimated_out ?? f.scheduled_out;
  const d = delayOf(f);
  const t = tone(f);
  const pos = live?.position;

  return (
    <section className="page flight-page">
      <a className="back" href="#/">Track another flight</a>
      {demo && <p className="note">Sample flight. Live tracking turns on once the FlightAware key is added.</p>}

      <header className="flight-head">
        <p className="eyebrow">{airlineName(f.operator)} {f.flight_number ?? f.ident.replace(/^\D+/, "")} · {longDay(f.scheduled_out, oz)}</p>
        <h1 className="page-title">
          {f.origin_name ?? f.origin} <span className="to">to</span> {f.destination_name ?? f.destination}
        </h1>
        <p className={`status-line tone-text-${t}`}>{statusLine(f)}</p>
      </header>

      <div className="flight-grid">
        <div className="flight-main">
          <BoardRow flight={boardFor(f)} />

          <div className="leg" aria-label={`${pct}% of the way there`}>
            <div className="leg-end">
              <b>{f.origin}</b>
              <span>{clock(leaveAt, oz)}</span>
            </div>
            <div className="leg-bar">
              <span className="leg-fill" style={{ width: `${pct}%` }} />
              <span className="leg-plane" style={{ left: `${pct}%` }} dangerouslySetInnerHTML={{ __html: planeSvg(90, 22, t === "delayed" ? "#9a6400" : "#13283B") }} />
            </div>
            <div className="leg-end leg-end-r">
              <b>{f.destination}</b>
              <span>{clock(arriveAt, dz)}</span>
            </div>
          </div>
          <p className="leg-note">
            {[
              f.cancelled ? "This flight won't operate."
                : f.actual_in ? `Arrived ${until(f.actual_in, now)}`
                : airborne ? `${dist ? `${Math.round((dist * (100 - pct)) / 100).toLocaleString()} miles to go, ` : ""}lands in ${until(f.estimated_on ?? f.estimated_in, now)}`
                : f.actual_out ? "Taxiing out"
                : `Leaves ${new Date(leaveAt) > now ? `in ${until(leaveAt, now)}` : until(leaveAt, now)}${d >= 15 ? `, ${d} minutes late` : ""}`,
              dist ? `${dist.toLocaleString()} mi` : null,
              f.scheduled_in && f.scheduled_out ? `${duration((new Date(f.scheduled_in) - new Date(f.scheduled_out)) / 60000)} gate to gate` : null,
            ].filter(Boolean).join(" · ")}
          </p>

          <Timeline f={f} />

          <dl className="facts">
            <div>
              <dt>Departs {f.origin}</dt>
              <dd>
                {f.terminal_origin ? `T${f.terminal_origin} · ` : ""}{f.gate_origin ? `Gate ${f.gate_origin}` : "Gate TBA"}
                <small>{f.origin_airport ?? A?.name}</small>
              </dd>
            </div>
            <div>
              <dt>Arrives {f.destination}</dt>
              <dd>
                {f.terminal_destination ? `T${f.terminal_destination} · ` : ""}{f.gate_destination ? `Gate ${f.gate_destination}` : "Gate TBA"}
                <small>{f.baggage_claim ? `Bags at carousel ${f.baggage_claim}` : "Bag claim posted near landing"}</small>
              </dd>
            </div>
            <div>
              <dt>Aircraft</dt>
              <dd>
                {f.aircraft_type ?? "—"}
                <small>
                  {aircraft ? `${aircraft.manufacturer} ${aircraft.type}` : ""}
                  {f.registration ? `${aircraft ? " · " : ""}Tail ${f.registration}` : ""}
                </small>
              </dd>
            </div>
            {pos ? (
              <div>
                <dt>Right now</dt>
                <dd>
                  {(pos.altitude * 100).toLocaleString()} ft
                  <small>{pos.groundspeed} kt ground speed · heading {pos.heading}°</small>
                </dd>
              </div>
            ) : (
              <div>
                <dt>Filed</dt>
                <dd>
                  {f.filed_altitude ? `FL${f.filed_altitude}` : "—"}
                  <small>{f.filed_airspeed ? `${f.filed_airspeed} kt cruise` : ""}</small>
                </dd>
              </div>
            )}
          </dl>

          <div className="actions">
            <button className="btn" onClick={save}>{user ? "Save to My trips" : "Sign in to get alerts"}</button>
            <button className="btn btn-quiet" onClick={share}>{copied ? "Link copied" : "Share"}</button>
            <button className="btn btn-quiet" onClick={() => ics(f)}>Add to calendar</button>
          </div>
          {saved && <p className="ok">{saved}</p>}
          {err && <p className="error" role="alert">{err}</p>}
        </div>

        <aside className="flight-side">
          <FlightMap position={pos} track={live?.track} route={route2} codes={[f.origin, f.destination]} />
          {live?.position?.timestamp && <p className="fine map-note">Position from {new Date(live.position.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}. Refreshes every minute while airborne.</p>}

          {inbound && (
            <div className="panel inbound">
              <h2>Where your plane is now</h2>
              <p>
                It's flying in as <a href={`#/flight/${inbound.ident}?id=${encodeURIComponent(inbound.fa_flight_id)}`}>{inbound.ident}</a> from{" "}
                {inbound.origin_name ?? inbound.origin}.{" "}
                {inbound.actual_in
                  ? "It's already at the gate."
                  : inbound.actual_off
                    ? `It's in the air and lands ${until(inbound.estimated_in, now)} from now.`
                    : `It hasn't left yet; it's due out at ${clock(inbound.estimated_out ?? inbound.scheduled_out, inbound.origin_tz)}.`}
              </p>
              {(() => {
                const turn = (new Date(f.estimated_out ?? f.scheduled_out) - new Date(inbound.estimated_in ?? inbound.scheduled_in)) / 60000;
                if (!Number.isFinite(turn)) return null;
                return (
                  <p className={turn < 35 ? "warn" : "fine"}>
                    {turn < 35
                      ? `Only ${Math.max(0, Math.round(turn))} minutes between its arrival and your departure. A delay is likely.`
                      : `${duration(turn)} on the ground before your departure.`}
                  </p>
                );
              })()}
            </div>
          )}

          <div className="panel">
            <h2>Around this flight</h2>
            <ul className="link-list">
              <li><a href={`#/airport/${f.origin}`}>{f.origin} departures board, weather and delays</a></li>
              <li><a href={`#/airport/${f.destination}`}>{f.destination} arrivals board, weather and delays</a></li>
              <li><a href={`#/route/${f.origin}/${f.destination}`}>Every flight from {f.origin} to {f.destination} today</a></li>
              <li><a href={`#/fly?from=${f.origin}&to=${f.destination}`}>Fares on this route, in cash and points</a></li>
              {f.registration && <li><a href={`#/flight/${f.registration}`}>Everywhere tail {f.registration} is flying</a></li>}
            </ul>
          </div>

          {flights.length > 1 && (
            <div className="panel">
              <h2>Other days</h2>
              <ul className="days">
                {flights.map((x) => (
                  <li key={x.fa_flight_id}>
                    <button className="day-btn" aria-current={x.fa_flight_id === f.fa_flight_id} onClick={() => setPickId(x.fa_flight_id)}>
                      <b>{day(x.scheduled_out, x.origin_tz)}</b>
                      <span>{x.origin} → {x.destination}</span>
                      <span className={`tone-text-${tone(x)}`}>{statusLine(x)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
