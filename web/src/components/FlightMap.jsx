import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { arc, remaining } from "../geo.js";

// Route drawn the way a sectional chart draws airways: the curve still to fly dashed,
// the flown track solid, both in the chart's magenta.
export const AIRWAY = "#A8266F";

export const planeSvg = (heading = 0, size = 28, fill = "#13283B") =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="transform:rotate(${heading}deg)"><path fill="${fill}" stroke="#E9EFF1" stroke-width="1" d="M12 2c.8 0 1.3.8 1.3 1.8v5.6l7.7 4.5v2.3l-7.7-2.4v4.8l2.4 1.8V22L12 21l-3.7 1v-1.6l2.4-1.8v-4.8L3 15.2v-2.3l7.7-4.5V3.8C10.7 2.8 11.2 2 12 2z"/></svg>`;

const planeIcon = (heading) => L.divIcon({ className: "plane-marker", html: planeSvg(heading), iconSize: [28, 28], iconAnchor: [14, 14] });

const airportIcon = (code) =>
  L.divIcon({ className: "airport-pin", html: `<span class="airport-dot"></span><b>${code ?? ""}</b>`, iconSize: [12, 12], iconAnchor: [6, 6] });

/** Shared tile setup: OpenStreetMap toned down toward chart paper. */
export function chartMap(el, opts = {}) {
  const map = L.map(el, { zoomControl: false, attributionControl: true, scrollWheelZoom: false, worldCopyJump: true, zoomSnap: 0.25, ...opts });
  // OpenStreetMap's own tiles: free for light use. Before launch, switch to a paid
  // tile plan (MapTiler, Stadia, Mapbox) so traffic stays within their usage policy.
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 12,
    className: "chart-tiles",
  }).addTo(map);
  L.control.zoom({ position: "bottomright" }).addTo(map);
  // Leaflet measures its box once; re-measure whenever the layout settles or changes
  const ro = new ResizeObserver(() => map.invalidateSize());
  ro.observe(el);
  map.on("unload", () => ro.disconnect());
  return map;
}

/**
 * One flight: route arc, flown track, the plane.
 * routes (optional): extra [from, to] pairs drawn faintly, used by the lifetime map in Trips.
 */
export default function FlightMap({ position, track, route, codes = [], routes, height, label = "Map of the flight's route and current position" }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const fitted = useRef(false);
  const touched = useRef(false); // once the traveler drags the map, leave the view alone

  useEffect(() => {
    map.current = chartMap(el.current);
    layer.current = L.layerGroup().addTo(map.current);
    map.current.setView([37, -96], 4);
    map.current.on("dragstart", () => (touched.current = true));
    return () => map.current.remove();
  }, []);

  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    const pts = [];
    for (const [a, b] of routes ?? []) {
      L.polyline(arc(a, b, 32), { color: AIRWAY, weight: 1.5, opacity: 0.55 }).addTo(g);
      L.circleMarker(a, { radius: 3, color: AIRWAY, weight: 1.5, fillColor: "#E9EFF1", fillOpacity: 1 }).addTo(g);
      L.circleMarker(b, { radius: 3, color: AIRWAY, weight: 1.5, fillColor: "#E9EFF1", fillOpacity: 1 }).addTo(g);
      pts.push(a, b);
    }
    const p = position?.latitude != null ? [position.latitude, position.longitude] : null;
    if (route?.from && route?.to) {
      // still to fly: from the plane (or the origin, before takeoff) to the destination
      const ahead = p ? remaining(p, route.to) : track?.length > 1 ? null : arc(route.from, route.to);
      if (ahead) L.polyline(ahead, { color: AIRWAY, weight: 2, dashArray: "6 7", opacity: 0.8 }).addTo(g);
      L.marker(route.from, { icon: airportIcon(codes[0]) }).addTo(g);
      L.marker(route.to, { icon: airportIcon(codes[1]) }).addTo(g);
      pts.push(route.from, route.to);
    }
    if (track?.length > 1) {
      L.polyline(track, { color: AIRWAY, weight: 3 }).addTo(g);
      pts.push(...track);
    }
    if (p) {
      L.marker(p, { icon: planeIcon(position.heading), zIndexOffset: 1000 }).addTo(g);
      pts.push(p);
    }
    // fit once; after that the traveler is in charge of the view
    if (pts.length && !fitted.current) {
      const b = L.latLngBounds(pts);
      const fit = () => {
        if (touched.current) return;
        map.current.invalidateSize();
        map.current.fitBounds(b, { padding: [40, 40], maxZoom: 8 });
      };
      fit();
      // the panel may still be laying out on first paint; fit again once it has a size
      setTimeout(fit, 300);
      fitted.current = !!(route || routes?.length);
    }
  }, [position, track, route, routes]);

  return <div ref={el} className="flight-map" style={height ? { height } : undefined} role="img" aria-label={label} />;
}
