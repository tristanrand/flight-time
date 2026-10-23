// A compact airport table for demo data and distance math on the server.
// The web app carries a larger list (web/src/data/airports.js) for search.
// [iata, icao, city, airport name, lat, lon, time zone]
export const AIRPORTS: [string, string, string, string, number, number, string][] = [
  ["ATL", "KATL", "Atlanta", "Hartsfield-Jackson", 33.6407, -84.4277, "America/New_York"],
  ["AUS", "KAUS", "Austin", "Austin-Bergstrom", 30.1975, -97.6664, "America/Chicago"],
  ["BNA", "KBNA", "Nashville", "Nashville Intl", 36.1263, -86.6774, "America/Chicago"],
  ["BOS", "KBOS", "Boston", "Logan Intl", 42.3656, -71.0096, "America/New_York"],
  ["BWI", "KBWI", "Baltimore", "BWI Marshall", 39.1754, -76.6683, "America/New_York"],
  ["CLT", "KCLT", "Charlotte", "Charlotte Douglas", 35.214, -80.9431, "America/New_York"],
  ["DCA", "KDCA", "Washington", "Reagan National", 38.8512, -77.0402, "America/New_York"],
  ["DEN", "KDEN", "Denver", "Denver Intl", 39.8561, -104.6737, "America/Denver"],
  ["DFW", "KDFW", "Dallas-Fort Worth", "DFW Intl", 32.8998, -97.0403, "America/Chicago"],
  ["DAL", "KDAL", "Dallas", "Love Field", 32.8471, -96.8518, "America/Chicago"],
  ["DTW", "KDTW", "Detroit", "Detroit Metro", 42.2162, -83.3554, "America/Detroit"],
  ["EWR", "KEWR", "Newark", "Newark Liberty", 40.6895, -74.1745, "America/New_York"],
  ["FLL", "KFLL", "Fort Lauderdale", "Fort Lauderdale-Hollywood", 26.0742, -80.1506, "America/New_York"],
  ["HNL", "PHNL", "Honolulu", "Daniel K. Inouye", 21.3187, -157.9225, "Pacific/Honolulu"],
  ["HOU", "KHOU", "Houston", "Hobby", 29.6454, -95.2789, "America/Chicago"],
  ["IAD", "KIAD", "Washington", "Dulles Intl", 38.9531, -77.4565, "America/New_York"],
  ["IAH", "KIAH", "Houston", "Bush Intercontinental", 29.9902, -95.3368, "America/Chicago"],
  ["JFK", "KJFK", "New York", "John F. Kennedy", 40.6413, -73.7781, "America/New_York"],
  ["LAS", "KLAS", "Las Vegas", "Harry Reid Intl", 36.084, -115.1537, "America/Los_Angeles"],
  ["LAX", "KLAX", "Los Angeles", "Los Angeles Intl", 33.9416, -118.4085, "America/Los_Angeles"],
  ["LGA", "KLGA", "New York", "LaGuardia", 40.7769, -73.874, "America/New_York"],
  ["MCO", "KMCO", "Orlando", "Orlando Intl", 28.4312, -81.3081, "America/New_York"],
  ["MDW", "KMDW", "Chicago", "Midway", 41.7868, -87.7522, "America/Chicago"],
  ["MIA", "KMIA", "Miami", "Miami Intl", 25.7959, -80.287, "America/New_York"],
  ["MSP", "KMSP", "Minneapolis", "Minneapolis-St Paul", 44.8848, -93.2223, "America/Chicago"],
  ["MSY", "KMSY", "New Orleans", "Louis Armstrong", 29.9934, -90.258, "America/Chicago"],
  ["OKC", "KOKC", "Oklahoma City", "Will Rogers", 35.3931, -97.6007, "America/Chicago"],
  ["ORD", "KORD", "Chicago", "O'Hare Intl", 41.9742, -87.9073, "America/Chicago"],
  ["PDX", "KPDX", "Portland", "Portland Intl", 45.5898, -122.5951, "America/Los_Angeles"],
  ["PHL", "KPHL", "Philadelphia", "Philadelphia Intl", 39.8744, -75.2424, "America/New_York"],
  ["PHX", "KPHX", "Phoenix", "Sky Harbor", 33.4352, -112.0101, "America/Phoenix"],
  ["SAN", "KSAN", "San Diego", "San Diego Intl", 32.7338, -117.1933, "America/Los_Angeles"],
  ["SEA", "KSEA", "Seattle", "Seattle-Tacoma", 47.4502, -122.3088, "America/Los_Angeles"],
  ["SFO", "KSFO", "San Francisco", "San Francisco Intl", 37.6213, -122.379, "America/Los_Angeles"],
  ["SLC", "KSLC", "Salt Lake City", "Salt Lake City Intl", 40.7899, -111.9791, "America/Denver"],
  ["STL", "KSTL", "St. Louis", "Lambert", 38.7487, -90.37, "America/Chicago"],
  ["TPA", "KTPA", "Tampa", "Tampa Intl", 27.9755, -82.5332, "America/New_York"],
  ["TUL", "KTUL", "Tulsa", "Tulsa Intl", 36.1984, -95.8881, "America/Chicago"],
  ["YYZ", "CYYZ", "Toronto", "Pearson", 43.6777, -79.6248, "America/Toronto"],
  ["YVR", "CYVR", "Vancouver", "Vancouver Intl", 49.1967, -123.1815, "America/Vancouver"],
  ["CUN", "MMUN", "Cancún", "Cancún Intl", 21.0365, -86.877, "America/Cancun"],
  ["MEX", "MMMX", "Mexico City", "Benito Juárez", 19.4361, -99.0719, "America/Mexico_City"],
  ["LHR", "EGLL", "London", "Heathrow", 51.47, -0.4543, "Europe/London"],
  ["CDG", "LFPG", "Paris", "Charles de Gaulle", 49.0097, 2.5479, "Europe/Paris"],
  ["FRA", "EDDF", "Frankfurt", "Frankfurt am Main", 50.0379, 8.5622, "Europe/Berlin"],
  ["AMS", "EHAM", "Amsterdam", "Schiphol", 52.3105, 4.7683, "Europe/Amsterdam"],
  ["MAD", "LEMD", "Madrid", "Barajas", 40.4983, -3.5676, "Europe/Madrid"],
  ["DUB", "EIDW", "Dublin", "Dublin", 53.4264, -6.2499, "Europe/Dublin"],
  ["NRT", "RJAA", "Tokyo", "Narita", 35.772, 140.3929, "Asia/Tokyo"],
  ["HND", "RJTT", "Tokyo", "Haneda", 35.5494, 139.7798, "Asia/Tokyo"],
];

export type Airport = { code: string; icao: string; city: string; name: string; lat: number; lon: number; tz: string };
const byCode = new Map<string, Airport>();
for (const [code, icao, city, name, lat, lon, tz] of AIRPORTS) {
  const a = { code, icao, city, name, lat, lon, tz };
  byCode.set(code, a);
  byCode.set(icao, a);
}
export const airport = (code?: string | null) => (code ? byCode.get(code.toUpperCase()) ?? null : null);

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in statute miles. */
export function miles(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

/** Point a fraction `t` of the way along the great circle from a to b, plus the heading there. */
export function along(a: { lat: number; lon: number }, b: { lat: number; lon: number }, t: number) {
  const φ1 = rad(a.lat), λ1 = rad(a.lon), φ2 = rad(b.lat), λ2 = rad(b.lon);
  const δ = 2 * Math.asin(Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2));
  if (δ === 0) return { lat: a.lat, lon: a.lon, heading: 0 };
  const A = Math.sin((1 - t) * δ) / Math.sin(δ);
  const B = Math.sin(t * δ) / Math.sin(δ);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  const φ = Math.atan2(z, Math.sqrt(x * x + y * y));
  const λ = Math.atan2(y, x);
  const heading = (deg(Math.atan2(Math.sin(λ2 - λ) * Math.cos(φ2), Math.cos(φ) * Math.sin(φ2) - Math.sin(φ) * Math.cos(φ2) * Math.cos(λ2 - λ))) + 360) % 360;
  return { lat: deg(φ), lon: deg(λ), heading };
}

/** Small deterministic PRNG so the same demo flight looks the same on every refresh. */
export function seeded(str: string) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** "2026-12-03T08:15:00" read as wall-clock time in `tz` -> UTC ISO string. Unknown tz: treated as UTC. */
export function zonedToUtc(local: string, tz?: string | null) {
  const naive = new Date(`${local.slice(0, 19)}Z`);
  if (!tz || Number.isNaN(naive.getTime())) return naive.toISOString();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(naive)
      .map((p) => [p.type, p.value]),
  );
  const asLocal = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return new Date(naive.getTime() - (asLocal - naive.getTime())).toISOString();
}
