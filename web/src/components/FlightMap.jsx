import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Route drawn the way a sectional chart draws airways: planned leg dashed,
// flown leg solid, both in the chart's magenta.
const AIRWAY = "#A8266F";

const planeIcon = (heading = 0) =>
  L.divIcon({
    className: "plane-marker",
    html: `<svg viewBox="0 0 24 24" width="28" height="28" style="transform:rotate(${heading}deg)"><path fill="#13283B" stroke="#E9EFF1" stroke-width="1" d="M12 2c.8 0 1.3.8 1.3 1.8v5.6l7.7 4.5v2.3l-7.7-2.4v4.8l2.4 1.8V22L12 21l-3.7 1v-1.6l2.4-1.8v-4.8L3 15.2v-2.3l7.7-4.5V3.8C10.7 2.8 11.2 2 12 2z"/></svg>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

const airportDot = L.divIcon({ className: "airport-dot", iconSize: [12, 12], iconAnchor: [6, 6] });

export default function FlightMap({ position, track, route }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);

  useEffect(() => {
    map.current = L.map(el.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false });
    // OpenStreetMap's own tiles: free for light use. Before launch, switch to a paid
    // tile plan (MapTiler, Stadia, Mapbox) so traffic stays within their usage policy.
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 12,
      className: "chart-tiles",
    }).addTo(map.current);
    L.control.zoom({ position: "bottomright" }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    map.current.setView([37, -96], 4);
    return () => map.current.remove();
  }, []);

  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    const pts = [];
    if (route?.from && route?.to) {
      L.polyline([route.from, route.to], { color: AIRWAY, weight: 2, dashArray: "6 6", opacity: 0.7 }).addTo(g);
      L.marker(route.from, { icon: airportDot }).addTo(g);
      L.marker(route.to, { icon: airportDot }).addTo(g);
      pts.push(route.from, route.to);
    }
    if (track?.length > 1) {
      L.polyline(track, { color: AIRWAY, weight: 3 }).addTo(g);
      pts.push(...track);
    }
    if (position?.latitude != null) {
      const p = [position.latitude, position.longitude];
      L.marker(p, { icon: planeIcon(position.heading) }).addTo(g);
      pts.push(p);
    }
    if (pts.length) map.current.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 8 });
  }, [position, track, route]);

  return <div ref={el} className="flight-map" role="img" aria-label="Map of the flight's route and current position" />;
}
