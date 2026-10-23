import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { chartMap, planeSvg } from "../components/FlightMap.jsx";
import { airlineName, fromCallsign } from "../data/airlines.js";
import { AIRPORTS } from "../data/airports.js";
import { call, local } from "../lib.js";
import { radiusNm } from "../geo.js";

// altitude bands, low to high, in the chart palette
const band = (ft) => (ft == null || ft < 1000 ? "#5a6b7a" : ft < 10000 ? "#2f7d5b" : ft < 25000 ? "#b07a12" : "#13283B");

const icon = (a, selected) =>
  L.divIcon({
    className: `radar-plane${selected ? " is-selected" : ""}`,
    html: planeSvg(a.heading ?? 0, selected ? 26 : 18, selected ? "#A8266F" : band(a.altitude)),
    iconSize: selected ? [26, 26] : [18, 18],
    iconAnchor: selected ? [13, 13] : [9, 9],
  });

export default function Radar({ route }) {
  const el = useRef(null);
  const map = useRef(null);
  const markers = useRef(new Map());
  const planes = useRef(new Map());
  const circle = useRef(null);
  const [sel, setSel] = useState(null);
  const [count, setCount] = useState(0);
  const [demo, setDemo] = useState(false);
  const [tooWide, setTooWide] = useState(false);
  const [airlinesOnly, setAirlinesOnly] = useState(local.get("radarAirlines", false));
  const filter = useRef(airlinesOnly);
  const selRef = useRef(null);
  const hadLive = useRef(false);
  const busy = useRef(false);

  useEffect(() => {
    filter.current = airlinesOnly;
    local.set("radarAirlines", airlinesOnly);
    redraw();
  }, [airlinesOnly]);

  useEffect(() => {
    const q = route.query;
    const last = local.get("radarView", null);
    const start = q.lat ? [Number(q.lat), Number(q.lon)] : last?.c ?? [35.39, -97.6];
    const z = q.z ? Number(q.z) : last?.z ?? 8;
    map.current = chartMap(el.current, { scrollWheelZoom: true });
    map.current.setView(start, z);
    // airports as quiet reference points, like a chart
    const ap = L.layerGroup().addTo(map.current);
    for (const a of AIRPORTS) {
      L.marker([a.lat, a.lon], {
        icon: L.divIcon({ className: "radar-airport", html: `<span></span><b>${a.code}</b>`, iconSize: [8, 8], iconAnchor: [4, 4] }),
        keyboard: false,
      })
        .on("click", () => (location.hash = `#/airport/${a.code}`))
        .addTo(ap);
    }
    circle.current = L.circle(start, { radius: 1, color: "#A8266F", weight: 1, dashArray: "3 6", fill: false, interactive: false }).addTo(map.current);
    map.current.on("click", () => select(null));

    let timer;
    const onMove = () => {
      clearTimeout(timer);
      timer = setTimeout(load, 350);
      local.set("radarView", { c: [map.current.getCenter().lat, map.current.getCenter().lng], z: map.current.getZoom() });
    };
    map.current.on("moveend", onMove);
    load();
    const refresh = setInterval(load, 15_000);
    const glide = setInterval(tick, 1000);
    return () => {
      clearInterval(refresh);
      clearInterval(glide);
      clearTimeout(timer);
      map.current.remove();
      markers.current.clear();
      planes.current.clear();
    };
  }, []);

  async function load() {
    const m = map.current;
    if (!m || busy.current) return;
    busy.current = true;
    try {
      await fetchPlanes(m);
    } finally {
      busy.current = false;
    }
  }

  async function fetchPlanes(m) {
    const r = radiusNm(m.getBounds());
    setTooWide(r > 400);
    const c = m.getCenter();
    try {
      const res = await call("flight-status", { action: "radar", lat: c.lat, lon: c.lng, radius_nm: Math.min(250, r) });
      // keep showing real planes through a hiccup rather than swapping in sample traffic
      if (res.demo && hadLive.current) return;
      if (!res.demo) hadLive.current = true;
      setDemo(!!res.demo);
      circle.current?.setLatLng(res.center).setRadius(res.radius_nm * 1852);
      const seen = new Set();
      const t = Date.now();
      for (const a of res.aircraft ?? []) {
        seen.add(a.hex);
        planes.current.set(a.hex, { ...a, t });
      }
      for (const hex of [...planes.current.keys()]) if (!seen.has(hex)) planes.current.delete(hex);
      redraw();
    } catch {
      /* keep the last picture; the next refresh will try again */
    }
  }

  function visible(a) {
    if (a.on_ground) return false;
    if (filter.current && !fromCallsign(a.callsign)) return false;
    return true;
  }

  function redraw() {
    const m = map.current;
    if (!m) return;
    let n = 0;
    for (const [hex, a] of planes.current) {
      const show = visible(a);
      let mk = markers.current.get(hex);
      if (!show) {
        if (mk) (mk.remove(), markers.current.delete(hex));
        continue;
      }
      n++;
      const isSel = selRef.current === hex;
      if (!mk) {
        mk = L.marker([a.lat, a.lon], { icon: icon(a, isSel), keyboard: false }).on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          select(hex);
        });
        mk.addTo(m);
        markers.current.set(hex, mk);
      } else {
        mk.setLatLng([a.lat, a.lon]);
        mk.setIcon(icon(a, isSel));
      }
    }
    for (const [hex, mk] of markers.current) if (!planes.current.has(hex)) (mk.remove(), markers.current.delete(hex));
    setCount(n);
    if (selRef.current) setSel(planes.current.get(selRef.current) ?? null);
  }

  // between refreshes, move each plane along its heading at its ground speed
  function tick() {
    const now = Date.now();
    for (const [hex, a] of planes.current) {
      const mk = markers.current.get(hex);
      if (!mk || !a.groundspeed || a.heading == null) continue;
      const hrs = (now - a.t) / 3600_000;
      const nm = a.groundspeed * hrs;
      const h = (a.heading * Math.PI) / 180;
      const lat = a.lat + (nm / 60) * Math.cos(h);
      const lon = a.lon + ((nm / 60) * Math.sin(h)) / Math.cos((a.lat * Math.PI) / 180);
      mk.setLatLng([lat, lon]);
    }
  }

  function select(hex) {
    const prev = selRef.current;
    selRef.current = hex;
    for (const h of [prev, hex]) {
      const a = h && planes.current.get(h);
      const mk = h && markers.current.get(h);
      if (a && mk) mk.setIcon(icon(a, h === hex));
    }
    setSel(hex ? planes.current.get(hex) ?? null : null);
  }

  function locate() {
    navigator.geolocation?.getCurrentPosition((p) => map.current.setView([p.coords.latitude, p.coords.longitude], 9));
  }

  const cs = sel && fromCallsign(sel.callsign);

  return (
    <section className="radar-page">
      <div ref={el} className="radar-map" role="application" aria-label="Live map of aircraft" />
      <div className="radar-bar">
        <strong>{count}</strong> planes in the air here
        <label className="toggle">
          <input type="checkbox" checked={airlinesOnly} onChange={(e) => setAirlinesOnly(e.target.checked)} /> Airlines only
        </label>
        <button className="linkish" onClick={locate}>Near me</button>
      </div>
      {tooWide && <p className="radar-hint">Zoom in to see every plane. We cover about 250 miles around the center of the map.</p>}
      <div className="radar-legend" aria-hidden="true">
        <span style={{ "--c": "#2f7d5b" }}>under 10,000 ft</span>
        <span style={{ "--c": "#b07a12" }}>10–25,000</span>
        <span style={{ "--c": "#13283B" }}>cruising</span>
      </div>
      {sel && (
        <div className="radar-card" role="dialog" aria-label="Selected aircraft">
          <button className="close" aria-label="Close" onClick={() => select(null)}>×</button>
          <p className="eyebrow">{cs ? airlineName(cs.airline) : sel.registration ? "Private or charter" : "Aircraft"}</p>
          <h2>{cs?.ident ?? sel.callsign ?? sel.registration ?? sel.hex.toUpperCase()}</h2>
          <dl>
            <div><dt>Altitude</dt><dd>{sel.altitude ? `${sel.altitude.toLocaleString()} ft` : "—"}</dd></div>
            <div><dt>Speed</dt><dd>{sel.groundspeed ? `${sel.groundspeed} kt` : "—"}</dd></div>
            <div><dt>Heading</dt><dd>{sel.heading != null ? `${sel.heading}°` : "—"}</dd></div>
            <div><dt>Climb</dt><dd>{sel.vertical_rate ? `${sel.vertical_rate > 0 ? "+" : ""}${sel.vertical_rate} fpm` : "Level"}</dd></div>
            <div><dt>Type</dt><dd>{sel.type ?? "—"}</dd></div>
            <div><dt>Tail</dt><dd>{sel.registration ?? "—"}</dd></div>
          </dl>
          {sel.emergency && <p className="warn">Squawking {sel.emergency} emergency</p>}
          {(cs || sel.registration) && (
            <a className="btn btn-small" href={`#/flight/${cs?.ident ?? sel.registration}`}>Route, gates and times</a>
          )}
        </div>
      )}
      <p className="radar-credit">
        {demo ? "Sample traffic (live feed unavailable)." : <>Positions from <a href="https://adsb.lol" target="_blank" rel="noopener">adsb.lol</a> (ODbL), seconds old.</>}
      </p>
    </section>
  );
}
