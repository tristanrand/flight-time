import { useEffect, useState } from "react";
import { BoardTable } from "../components/Board.jsx";
import { airport } from "../data/airports.js";
import { ago, call, local, useNow } from "../lib.js";

const CATEGORY = {
  VFR: "Clear for visual flying",
  MVFR: "Low clouds or haze",
  IFR: "Low clouds or poor visibility",
  LIFR: "Very low clouds or fog",
};
const compass = (d) => (d == null ? "" : ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(d / 45) % 8]);

export default function Airport({ route }) {
  const code = (route.parts[1] ?? "").toUpperCase();
  const [kind, setKind] = useState(route.query.kind === "arrivals" ? "arrivals" : "departures");
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [at, setAt] = useState(null);
  const [pinned, setPinned] = useState(() => local.get("pinnedAirports", []).includes(code));
  const now = useNow(20_000);
  const known = airport(code);

  useEffect(() => {
    let stop = false;
    const load = () =>
      call("flight-status", { action: "airport", code, icao: known?.icao, kind })
        .then((r) => {
          if (stop) return;
          setData(r);
          setErr("");
          setAt(new Date().toISOString());
        })
        .catch((e) => !stop && setErr(e.message));
    setData(null);
    load();
    const t = setInterval(load, 120_000); // the server shares one answer per 2 minutes anyway
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [code, kind]);

  const info = data?.info;
  const tz = info?.tz ?? known?.tz;
  const name = info?.name ?? known?.name ?? code;
  const city = info?.city ?? known?.city ?? "";
  const wx = data?.weather;
  const lat = info?.lat ?? known?.lat, lon = info?.lon ?? known?.lon;

  function togglePin() {
    const list = local.get("pinnedAirports", []);
    const next = list.includes(code) ? list.filter((c) => c !== code) : [code, ...list].slice(0, 8);
    local.set("pinnedAirports", next);
    setPinned(next.includes(code));
  }

  return (
    <section className="page airport-page">
      <a className="back" href="#/">Track</a>
      {data?.demo && <p className="note">Sample board. Live boards turn on once the FlightAware key is added.</p>}
      <header className="airport-head">
        <div>
          <p className="eyebrow">{code}{info?.icao || known?.icao ? ` · ${info?.icao ?? known?.icao}` : ""}{info?.elevation != null ? ` · ${info.elevation.toLocaleString()} ft` : ""}</p>
          <h1 className="page-title">{city || name}</h1>
          <p className="sub">{name}</p>
        </div>
        <div className="local-clock" aria-label="Local time at this airport">
          <span>Local time</span>
          <b>{new Date(now).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", ...(tz ? { timeZone: tz } : {}) })}</b>
        </div>
      </header>

      {data?.delays && (
        <div className={`delay-banner delay-${data.delays.color ?? "yellow"}`} role="status">
          <strong>Delays here: about {data.delays.minutes} minutes</strong>
          {data.delays.reasons?.length > 0 && <span>{data.delays.reasons.join(" · ")}</span>}
        </div>
      )}

      <div className="airport-grid">
        <div>
          <div className="seg" role="tablist" aria-label="Board">
            <button role="tab" aria-selected={kind === "departures"} onClick={() => setKind("departures")}>Departures</button>
            <button role="tab" aria-selected={kind === "arrivals"} onClick={() => setKind("arrivals")}>Arrivals</button>
          </div>
          {err && <p className="error" role="alert">{err}</p>}
          {!data && !err && <div className="board board-loading" aria-busy="true"><span className="board-key">Loading the {kind} board…</span></div>}
          {data && (data.flights?.length ? <BoardTable flights={[...data.flights].sort((a, b) => (kind === "departures" ? a.scheduled_out : a.scheduled_in).localeCompare(kind === "departures" ? b.scheduled_out : b.scheduled_in))} kind={kind} tz={tz} /> : <p className="empty">No {kind} listed right now.</p>)}
          {at && <p className="fine">Updated {ago(at, now)}. Shows the next 15 {kind}. Tap a flight for its gate, plane and live position.</p>}
        </div>

        <aside>
          <div className="panel wx">
            <h2>Weather</h2>
            {wx ? (
              <>
                <p className={`wx-cat cat-${wx.flight_category}`}>
                  <b>{wx.flight_category}</b> {CATEGORY[wx.flight_category]}
                </p>
                <dl className="wx-grid">
                  <div><dt>Sky</dt><dd>{wx.conditions ?? "—"}</dd></div>
                  <div><dt>Temp</dt><dd>{wx.temp_c != null ? `${Math.round(wx.temp_c * 1.8 + 32)}°F` : "—"}<small>{wx.temp_c != null ? `${Math.round(wx.temp_c)}°C` : ""}</small></dd></div>
                  <div><dt>Wind</dt><dd>{wx.wind_kts ? `${compass(wx.wind_dir)} ${wx.wind_kts} kt` : "Calm"}<small>{wx.gust_kts ? `gusting ${wx.gust_kts}` : ""}</small></dd></div>
                  <div><dt>Visibility</dt><dd>{wx.visibility_mi != null ? `${wx.visibility_mi} mi` : "—"}</dd></div>
                </dl>
                {wx.raw && <code className="metar">{wx.raw}</code>}
              </>
            ) : (
              <p className="fine">{data ? "No recent weather report." : "Loading…"}</p>
            )}
          </div>

          <div className="panel">
            <h2>From here</h2>
            <ul className="link-list">
              {lat != null && <li><a href={`#/radar?lat=${lat}&lon=${lon}&z=9`}>Live radar around {code}</a></li>}
              <li><a href={`#/fly?from=${code}&explore=1`}>Cheapest places to fly from {code}</a></li>
              <li>
                <button className="linkish" onClick={togglePin}>{pinned ? `Unpin ${code} from Track` : `Pin ${code} to Track`}</button>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}
