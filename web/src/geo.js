// Great-circle math for maps and the flying stats in Trips.
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Statute miles between two [lat, lon] points or {lat, lon} objects. */
export function miles(a, b) {
  const [la1, lo1] = Array.isArray(a) ? a : [a.lat, a.lon];
  const [la2, lo2] = Array.isArray(b) ? b : [b.lat, b.lon];
  const h = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

/** Points along the great circle from a to b, for drawing the curved route a plane really flies. */
export function arc(a, b, n = 64) {
  const [φ1, λ1, φ2, λ2] = [rad(a[0]), rad(a[1]), rad(b[0]), rad(b[1])];
  const δ = 2 * Math.asin(Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2));
  if (!δ) return [a, b];
  const out = [];
  let prevLon = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const A = Math.sin((1 - t) * δ) / Math.sin(δ);
    const B = Math.sin(t * δ) / Math.sin(δ);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    let lon = deg(Math.atan2(y, x));
    // keep the line continuous across the date line so Leaflet doesn't draw it the long way round
    if (prevLon != null) while (lon - prevLon > 180) lon -= 360;
    if (prevLon != null) while (prevLon - lon > 180) lon += 360;
    prevLon = lon;
    out.push([deg(Math.atan2(z, Math.sqrt(x * x + y * y))), lon]);
  }
  return out;
}

/** The part of the great circle still to fly, from the plane's position to the destination. */
export const remaining = (pos, to) => arc(pos, to, 40);

/** Nautical miles across the visible map, for sizing radar requests. */
export function radiusNm(bounds) {
  const c = bounds.getCenter();
  const ne = bounds.getNorthEast();
  return (miles([c.lat, c.lng], [ne.lat, ne.lng]) / 1.15078) | 0;
}
