// Sample data returned while a provider key is missing, so the whole app can be clicked
// through before every sign-up is done. Every demo response carries `demo: true` and the
// app shows a note when it sees it.
//
// Demo flights are generated, not canned: the route, times and live position all follow
// from the flight number and the clock, so a demo plane actually moves across the map.
// A demo fa_flight_id encodes everything needed to rebuild the same flight later:
//   IDENT~ORIGIN~DEST~DEPARTURE_EPOCH_MINUTES~DELAY-DEMO
import { airport, AIRPORTS, along, miles, seeded, type Airport } from "./geo.ts";

export const isDemoId = (id?: string | null) => !!id && id.endsWith("-DEMO");

const HUBS: Record<string, string[]> = {
  AA: ["DFW", "CLT", "ORD", "MIA", "PHX", "PHL", "LAX", "JFK"],
  DL: ["ATL", "MSP", "DTW", "SLC", "JFK", "SEA", "LAX", "BOS"],
  UA: ["ORD", "DEN", "IAH", "EWR", "SFO", "IAD", "LAX"],
  WN: ["DAL", "HOU", "MDW", "DEN", "LAS", "PHX", "BWI", "BNA", "OKC"],
  AS: ["SEA", "PDX", "SFO", "LAX", "ANC"],
  B6: ["JFK", "BOS", "FLL", "MCO"],
  F9: ["DEN", "LAS", "MCO", "ATL"],
  NK: ["FLL", "LAS", "MCO", "DTW"],
  AC: ["YYZ", "YVR"],
  BA: ["LHR"],
};
const NAMES: Record<string, string> = {
  AA: "American", DL: "Delta", UA: "United", WN: "Southwest", AS: "Alaska", B6: "JetBlue",
  F9: "Frontier", NK: "Spirit", AC: "Air Canada", BA: "British Airways",
};
const ICAO_OP: Record<string, string> = {
  AA: "AAL", DL: "DAL", UA: "UAL", WN: "SWA", AS: "ASA", B6: "JBU", F9: "FFT", NK: "NKS", AC: "ACA", BA: "BAW",
};
export const airlineName = (code: string) => NAMES[code] ?? code;

const at = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const MIN = 60_000;
const pick = <T>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)];
const usAirports = AIRPORTS.filter((a) => a[1].startsWith("K")).map((a) => a[0]);

function aircraftFor(dist: number, r: () => number) {
  if (dist < 600) return pick(r, ["E175", "CRJ9", "B737", "A320", "E75L"]);
  if (dist < 2600) return pick(r, ["B738", "A321", "B739", "A21N", "B38M", "A320"]);
  return pick(r, ["B77W", "B789", "A333", "B772", "A359"]);
}

function splitIdent(ident: string) {
  const m = ident.toUpperCase().match(/^([A-Z0-9]{2})(\d{1,4})[A-Z]?$/) ?? ident.toUpperCase().match(/^([A-Z]{3})(\d{1,4})$/);
  const op = m ? (m[1].length === 3 ? Object.keys(ICAO_OP).find((k) => ICAO_OP[k] === m[1]) ?? m[1].slice(0, 2) : m[1]) : "AA";
  return { op, num: m ? Number(m[2]) : 100 };
}

/** The plausible route a flight number flies: from one of the airline's hubs. */
function routeFor(ident: string) {
  const { op } = splitIdent(ident);
  const r = seeded(`route:${ident}`);
  const hubs = (HUBS[op] ?? HUBS.AA).filter((c) => airport(c));
  const o = pick(r, hubs);
  let d = pick(r, usAirports);
  while (d === o) d = pick(r, usAirports);
  return r() < 0.5 ? [o, d] : [d, o];
}

type Spec = { ident: string; o: string; d: string; depMin: number; delay: number };

export const demoId = (s: Spec) => `${s.ident}~${s.o}~${s.d}~${s.depMin}~${s.delay}-DEMO`;
export function parseDemoId(id: string): Spec | null {
  const m = id.match(/^([A-Z0-9]+)~([A-Z]{3})~([A-Z]{3})~(\d+)~(\d+)-DEMO$/);
  return m ? { ident: m[1], o: m[2], d: m[3], depMin: Number(m[4]), delay: Number(m[5]) } : null;
}

/** One full flight (AeroAPI-slim shape) from its spec, with status worked out from the clock. */
export function buildFlight(s: Spec) {
  const A = airport(s.o) as Airport;
  const B = airport(s.d) as Airport;
  const r = seeded(`flight:${s.ident}:${s.depMin}`);
  const dist = A && B ? miles(A, B) : 700 + r() * 900;
  const airMin = Math.round((dist / 455) * 60 + 18);
  const sOut = s.depMin * MIN;
  const sIn = sOut + (airMin + 24) * MIN;
  const eOut = sOut + s.delay * MIN;
  const eOff = eOut + 14 * MIN;
  const eOn = eOff + airMin * MIN;
  const eIn = eOn + 8 * MIN;
  const now = Date.now();
  const { op, num } = splitIdent(s.ident);
  const done = (t: number) => (now >= t ? at(t) : null);
  const late = s.delay >= 15;
  const status =
    now >= eIn ? "Arrived / Gate Arrival"
    : now >= eOn ? "Landed / Taxiing"
    : now >= eOff ? `En Route / ${late ? "Delayed" : "On Time"}`
    : now >= eOut ? "Taxiing / Left Gate"
    : late ? "Scheduled / Delayed" : "Scheduled";
  const progress = now < eOff ? 0 : now >= eOn ? 100 : Math.round(((now - eOff) / (eOn - eOff)) * 100);
  const type = aircraftFor(dist, r);
  const reg = `N${100 + Math.floor(r() * 899)}${pick(r, ["AA", "AN", "DN", "UA", "WN", "NK", "JB", "AS"])}`;
  const gate = (pre: string) => `${pre}${1 + Math.floor(r() * 38)}`;
  return {
    fa_flight_id: demoId(s),
    ident: s.ident,
    ident_icao: `${ICAO_OP[op] ?? op}${num}`,
    operator: op,
    flight_number: String(num),
    codeshares: [],
    aircraft_type: type,
    registration: reg,
    inbound_fa_flight_id: inboundSpecFor(s) ? demoId(inboundSpecFor(s)!) : null,
    origin: s.o,
    origin_icao: A?.icao ?? s.o,
    origin_name: A?.city ?? s.o,
    origin_airport: A?.name ?? s.o,
    origin_tz: A?.tz ?? "America/Chicago",
    destination: s.d,
    destination_icao: B?.icao ?? s.d,
    destination_name: B?.city ?? s.d,
    destination_airport: B?.name ?? s.d,
    destination_tz: B?.tz ?? "America/Chicago",
    scheduled_out: at(sOut),
    estimated_out: at(eOut),
    actual_out: done(eOut),
    scheduled_off: at(sOut + 14 * MIN),
    estimated_off: at(eOff),
    actual_off: done(eOff),
    scheduled_on: at(sIn - 8 * MIN),
    estimated_on: at(eOn),
    actual_on: done(eOn),
    scheduled_in: at(sIn),
    estimated_in: at(eIn),
    actual_in: done(eIn),
    gate_origin: gate(pick(r, ["A", "B", "C", "D", ""])),
    terminal_origin: r() < 0.5 ? String(1 + Math.floor(r() * 3)) : null,
    gate_destination: gate(pick(r, ["A", "B", "C", "E", ""])),
    terminal_destination: null,
    baggage_claim: now >= eOn - 30 * MIN ? String(1 + Math.floor(r() * 14)) : null,
    runway_off: now >= eOff ? pick(r, ["17R", "35L", "18C", "27L", "09R", "13L"]) : null,
    runway_on: now >= eOn ? pick(r, ["17L", "36R", "26R", "08L", "31R"]) : null,
    route_distance: Math.round(dist),
    filed_altitude: dist < 400 ? 240 : dist < 900 ? 340 : 370,
    filed_airspeed: dist < 600 ? 430 : 465,
    status,
    progress_percent: progress,
    departure_delay_minutes: s.delay,
    arrival_delay_minutes: s.delay,
    delay_minutes: s.delay,
    cancelled: false,
    diverted: false,
    blocked: false,
  };
}

/** The flight that brings this plane in: lands at our origin about 75–110 minutes before we leave. */
function inboundSpecFor(s: Spec): Spec | null {
  const r = seeded(`inbound:${s.ident}:${s.depMin}`);
  const { op, num } = splitIdent(s.ident);
  const from = pick(r, usAirports.filter((c) => c !== s.o));
  const A = airport(from)!, B = airport(s.o);
  if (!B) return null;
  const block = Math.round((miles(A, B) / 455) * 60 + 18 + 24);
  const turn = 75 + Math.floor(r() * 35);
  const delay = r() < 0.3 ? 10 + Math.floor(r() * 50) : 0;
  return {
    ident: `${op}${((num * 7 + 13) % 8899) + 100}`,
    o: from,
    d: s.o,
    depMin: s.depMin - turn - block,
    delay,
  };
}

/** Lookup by flight number: yesterday's, today's and tomorrow's departures. */
export function demoFlight(ident: string) {
  const code = ident.toUpperCase().replace(/\s+/g, "");
  const [o, d] = routeFor(code);
  const r = seeded(`times:${code}`);
  // today's departure lands somewhere between 3 hours ago and 5 hours from now
  const today = Math.round((Date.now() / MIN + (r() * 8 - 3) * 60) / 5) * 5;
  const delay = r() < 0.35 ? 10 + Math.floor(r() * 45) : 0;
  const flights = [-1, 0, 1].map((k) =>
    buildFlight({ ident: code, o, d, depMin: today + k * 1440, delay: k === 0 ? delay : k < 0 ? Math.floor(r() * 12) : 0 }),
  );
  return { demo: true, flights: flights.reverse() };
}

export function demoFlightById(id: string) {
  const s = parseDemoId(id);
  return s ? buildFlight(s) : null;
}

/** Live position, flown track and route for a demo flight, all consistent with the clock. */
export function demoPosition(id: string) {
  const s = parseDemoId(id);
  if (!s) return { demo: true, position: null, track: [], route: null };
  const f = buildFlight(s);
  const A = airport(s.o)!, B = airport(s.d)!;
  const route = A && B ? { from: [A.lat, A.lon], to: [B.lat, B.lon] } : null;
  if (!A || !B || !f.actual_off) return { demo: true, position: null, track: [], route };
  const t = f.actual_on ? 1 : f.progress_percent / 100;
  const track = Array.from({ length: 30 }, (_, i) => {
    const p = along(A, B, (t * i) / 29);
    return [Number(p.lat.toFixed(4)), Number(p.lon.toFixed(4))];
  });
  if (f.actual_on) return { demo: true, position: null, track, route };
  const p = along(A, B, t);
  const climb = Math.min(1, t * 9, (1 - t) * 7);
  return {
    demo: true,
    position: {
      latitude: p.lat,
      longitude: p.lon,
      heading: Math.round(p.heading),
      altitude: Math.round((f.filed_altitude ?? 350) * climb),
      groundspeed: Math.round(160 + ((f.filed_airspeed ?? 450) - 160) * climb),
      timestamp: new Date().toISOString(),
    },
    track,
    route,
  };
}

/** Departures or arrivals board for an airport. */
export function demoBoard(code: string, kind: "departures" | "arrivals") {
  const here = code.toUpperCase();
  const r = seeded(`board:${here}:${kind}:${Math.floor(Date.now() / (30 * MIN))}`);
  const start = Math.round(Date.now() / MIN / 5) * 5 - 10;
  const ops = Object.keys(HUBS).filter((k) => k !== "BA" && k !== "AC");
  const flights = Array.from({ length: 15 }, (_, i) => {
    const op = pick(r, ops);
    const other = pick(r, usAirports.filter((c) => c !== here));
    const depMin = start + i * (12 + Math.floor(r() * 18)) - (kind === "arrivals" ? 120 : 0);
    const delay = r() < 0.22 ? 15 + Math.floor(r() * 70) : r() < 0.4 ? Math.floor(r() * 9) : 0;
    const ident = `${op}${100 + Math.floor(r() * 2800)}`;
    return buildFlight(kind === "departures" ? { ident, o: here, d: other, depMin, delay } : { ident, o: other, d: here, depMin, delay });
  });
  if (r() < 0.5) Object.assign(flights[6], { cancelled: true, status: "Cancelled" });
  return { demo: true, flights };
}

/** Today's nonstops between two airports. */
export function demoRoute(o: string, d: string) {
  const r = seeded(`routeday:${o}:${d}:${new Date().toDateString()}`);
  const ops = Object.keys(HUBS).filter((k) => HUBS[k].includes(o) || HUBS[k].includes(d));
  const use = ops.length ? ops : ["AA", "DL", "UA", "WN"];
  const base = Math.floor(Date.now() / 86400_000) * 1440 + 11 * 60; // ~6am Central
  const flights = Array.from({ length: 5 + Math.floor(r() * 5) }, (_, i) => {
    const op = pick(r, use);
    return buildFlight({
      ident: `${op}${100 + Math.floor(r() * 2800)}`,
      o, d,
      depMin: base + i * 95 + Math.floor(r() * 50),
      delay: r() < 0.25 ? 15 + Math.floor(r() * 40) : 0,
    });
  }).sort((a, b) => a.scheduled_out.localeCompare(b.scheduled_out));
  return { demo: true, flights };
}

/** Aircraft around a point, moving with the clock (same shape as the live radar feed). */
export function demoRadar(lat: number, lon: number, radiusNm: number) {
  const bucket = Math.floor(Date.now() / (10 * MIN));
  const r = seeded(`radar:${lat.toFixed(0)}:${lon.toFixed(0)}:${bucket}`);
  const elapsedH = (Date.now() - bucket * 10 * MIN) / 3600_000;
  const ops = Object.keys(ICAO_OP);
  const n = 50 + Math.floor(r() * 50);
  return {
    demo: true,
    aircraft: Array.from({ length: n }, () => {
      const op = pick(r, ops);
      const d = Math.sqrt(r()) * radiusNm;
      const b = r() * 2 * Math.PI;
      const heading = Math.round(r() * 360);
      const gs = 280 + Math.floor(r() * 220);
      const moved = (gs * elapsedH) / 60; // degrees, roughly
      const la = lat + (d / 60) * Math.cos(b) + moved * Math.cos((heading * Math.PI) / 180);
      const lo = lon + ((d / 60) * Math.sin(b) + moved * Math.sin((heading * Math.PI) / 180)) / Math.cos((lat * Math.PI) / 180);
      return {
        hex: Math.floor(r() * 0xffffff).toString(16).padStart(6, "0"),
        callsign: `${ICAO_OP[op]}${100 + Math.floor(r() * 2800)}`,
        registration: `N${100 + Math.floor(r() * 899)}${pick(r, ["AA", "DN", "UA", "WN"])}`,
        type: pick(r, ["B738", "A321", "E175", "B739", "A320", "B38M", "CRJ9", "B789"]),
        lat: la,
        lon: lo,
        altitude: 9000 + Math.floor(r() * 30) * 1000,
        groundspeed: gs,
        heading,
        vertical_rate: pick(r, [0, 0, 0, 1200, -900]),
        on_ground: false,
      };
    }),
  };
}

export function demoWeather(code: string) {
  const r = seeded(`wx:${code}:${Math.floor(Date.now() / (60 * MIN))}`);
  const wind = Math.floor(r() * 22);
  const dir = Math.floor(r() * 36) * 10;
  const temp = Math.round(4 + r() * 26);
  const vis = r() < 0.15 ? 3 : 10;
  const clouds = pick(r, ["Clear", "Few clouds", "Scattered clouds", "Broken clouds", "Overcast"]);
  return {
    demo: true,
    weather: {
      conditions: vis < 5 ? "Mist" : clouds,
      temp_c: temp,
      wind_dir: dir,
      wind_kts: wind,
      gust_kts: wind > 14 ? wind + 8 : null,
      visibility_mi: vis,
      flight_category: vis < 5 ? "MVFR" : "VFR",
      raw: `${airport(code)?.icao ?? code} ${new Date().toISOString().slice(8, 10)}${new Date().toISOString().slice(11, 13)}53Z ${String(dir).padStart(3, "0")}${String(wind).padStart(2, "0")}KT ${vis}SM ${clouds === "Clear" ? "CLR" : "SCT045"} ${temp}/${Math.max(-5, temp - 9)} A${2990 + Math.floor(r() * 30)}`,
    },
    delays: r() < 0.3 ? { color: "yellow", minutes: 15 + Math.floor(r() * 30), reasons: ["Traffic volume", "Weather at destination"] } : null,
  };
}

/* ---------- fares (Travelpayouts shape) ---------- */

function priceModel(o: string, d: string) {
  const A = airport(o), B = airport(d);
  const dist = A && B ? miles(A, B) : 900;
  const intl = !!(A && B && A.icao[0] !== B.icao[0]);
  return { dist, base: Math.round(48 + dist * (intl ? 0.075 : 0.105)) };
}

function carriersFor(o: string, d: string) {
  const list = Object.keys(HUBS).filter((k) => HUBS[k].includes(o) || HUBS[k].includes(d));
  return list.length >= 2 ? list : ["AA", "DL", "UA", "WN", "F9", "NK"];
}

export function demoFares(origin: string, destination: string, month: string) {
  const r = seeded(`fares:${origin}:${destination}:${month}`);
  const { base, dist } = priceModel(origin, destination);
  const airlines = carriersFor(origin, destination);
  return {
    demo: true,
    currency: "usd",
    fares: Array.from({ length: 12 }, (_, i) => {
      const day = String(1 + Math.floor(r() * 27)).padStart(2, "0");
      const stops = dist > 500 && r() < 0.4 ? 1 : 0;
      const a = pick(r, airlines);
      return {
        origin,
        destination,
        price: Math.round(base * (0.72 + r() * 0.9) * (stops ? 0.85 : 1)),
        airline: a,
        flight_number: String(100 + Math.floor(r() * 2800)),
        departure_at: `${month}-${day}T${String(6 + Math.floor(r() * 14)).padStart(2, "0")}:${pick(r, ["05", "20", "35", "50"])}:00-05:00`,
        return_at: null,
        transfers: stops,
        duration_minutes: Math.round((dist / 455) * 60 + 30 + stops * (55 + r() * 80)),
        book_url: `https://www.aviasales.com/search/${origin}${day}${month.slice(5, 7)}${destination}1`,
      };
    }).sort((a, b) => a.price - b.price),
  };
}

export function demoCalendar(origin: string, destination: string, month: string) {
  const r = seeded(`cal:${origin}:${destination}:${month}`);
  const { base } = priceModel(origin, destination);
  const [y, m] = month.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const out: Record<string, { price: number; airline: string; transfers: number }> = {};
  const airlines = carriersFor(origin, destination);
  for (let d = 1; d <= days; d++) {
    if (r() < 0.08) continue; // some days nobody searched
    const date = `${month}-${String(d).padStart(2, "0")}`;
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    const weekday = [1.12, 0.96, 0.84, 0.86, 1.08, 1.2, 0.98][dow];
    out[date] = { price: Math.round(base * weekday * (0.8 + r() * 0.45)), airline: pick(r, airlines), transfers: r() < 0.3 ? 1 : 0 };
  }
  return { demo: true, currency: "usd", days: out };
}

export function demoExplore(origin: string, month: string) {
  const r = seeded(`explore:${origin}:${month}`);
  const pool = AIRPORTS.map((a) => a[0]).filter((c) => c !== origin);
  const picks = new Set<string>();
  while (picks.size < 16) picks.add(pick(r, pool));
  return {
    demo: true,
    currency: "usd",
    places: [...picks]
      .map((d) => {
        const { base } = priceModel(origin, d);
        return {
          destination: d,
          price: Math.round(base * (0.7 + r() * 0.5)),
          airline: pick(r, carriersFor(origin, d)),
          departure_at: `${month}-${String(1 + Math.floor(r() * 27)).padStart(2, "0")}T09:00:00-05:00`,
          transfers: r() < 0.35 ? 1 : 0,
        };
      })
      .sort((a, b) => a.price - b.price),
  };
}

/* ---------- bookable offers (Duffel-slim shape) ---------- */

export type OfferSearch = {
  slices: { origin: string; destination: string; departure_date: string }[];
  adults: number;
  cabin: string;
};

const b64 = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));

const BRANDS = [
  { name: "Basic", mult: 1, carry_on: 1, checked: 0, refundable: false, changeable: false, change_fee: null },
  { name: "Standard", mult: 1.22, carry_on: 1, checked: 0, refundable: false, changeable: true, change_fee: 0 },
  { name: "Flex", mult: 1.85, carry_on: 1, checked: 1, refundable: true, changeable: true, change_fee: 0 },
];
const CABIN_MULT: Record<string, number> = { economy: 1, premium_economy: 1.7, business: 3.4, first: 4.6 };

/** A list of bookable demo offers. Each id encodes its own search so it can be re-priced on the server. */
export function demoOffers(q: OfferSearch) {
  const out: any[] = [];
  const r = seeded(`offers:${JSON.stringify(q)}`);
  const n = 9;
  for (let i = 0; i < n; i++) {
    const brand = i % 3;
    out.push(demoOffer(`demo_${b64(JSON.stringify({ q, i: Math.floor(i / 3), brand, s: Math.floor(r() * 1e6) }))}`));
  }
  return { demo: true, offers: out.filter(Boolean).sort((a, b) => a.total_amount - b.total_amount) };
}

export function demoOffer(id: string) {
  let spec: { q: OfferSearch; i: number; brand: number; s: number };
  try {
    spec = JSON.parse(unb64(id.replace(/^demo_/, "")));
  } catch {
    return null;
  }
  const { q, i, brand, s } = spec;
  const r = seeded(`offer:${s}:${i}`);
  const first = q.slices[0];
  const airlines = carriersFor(first.origin, first.destination);
  const owner = airlines[i % airlines.length];
  const b = BRANDS[brand];
  let fare = 0;
  const slices = q.slices.map((sl, k) => {
    const { base, dist } = priceModel(sl.origin, sl.destination);
    fare += base * (0.8 + r() * 0.5);
    const hub = (HUBS[owner] ?? []).find((h) => h !== sl.origin && h !== sl.destination && airport(h));
    const stops = dist > 500 && hub && r() < 0.45 ? 1 : 0;
    const startH = 6 + Math.floor(r() * 14) + k * 0;
    const dep = new Date(`${sl.departure_date}T${String(startH).padStart(2, "0")}:${pick(r, ["00", "15", "30", "45"])}:00`);
    const legs = stops ? [[sl.origin, hub!], [hub!, sl.destination]] : [[sl.origin, sl.destination]];
    let t = dep.getTime();
    const segments = legs.map(([from, to], j) => {
      const A = airport(from), B = airport(to);
      const d = A && B ? miles(A, B) : dist;
      const mins = Math.round((d / 455) * 60 + 28);
      const seg = {
        carrier: owner,
        carrier_name: airlineName(owner),
        flight_number: String(100 + Math.floor(r() * 2800)),
        origin: from,
        destination: to,
        departing_at: new Date(t).toISOString().slice(0, 19),
        arriving_at: new Date(t + mins * MIN).toISOString().slice(0, 19),
        aircraft: aircraftFor(d, r),
        duration_minutes: mins,
      };
      t += (mins + (j === 0 && stops ? 55 + Math.floor(r() * 70) : 0)) * MIN;
      return seg;
    });
    return {
      origin: sl.origin,
      destination: sl.destination,
      duration_minutes: Math.round((t - dep.getTime()) / MIN),
      segments,
      stops,
    };
  });
  const perPax = Math.round(fare * b.mult * (CABIN_MULT[q.cabin] ?? 1) * (slices.some((x) => x.stops) ? 0.88 : 1)) + 0.0;
  const tax = Math.round(perPax * 0.12 + 11.2 * q.slices.length);
  const total = (perPax + tax) * q.adults;
  return {
    id,
    live: false,
    owner: { code: owner, name: airlineName(owner) },
    total_amount: Number(total.toFixed(2)),
    base_amount: Number((perPax * q.adults).toFixed(2)),
    tax_amount: Number((tax * q.adults).toFixed(2)),
    currency: "USD",
    cabin: q.cabin,
    fare_brand: b.name,
    bags: { carry_on: b.carry_on, checked: b.checked },
    refundable: b.refundable,
    changeable: b.changeable,
    change_fee: b.change_fee,
    expires_at: new Date(Date.now() + 25 * MIN).toISOString(),
    passengers: Array.from({ length: q.adults }, (_, k) => ({ id: `pas_demo_${k}`, type: "adult" })),
    slices,
  };
}
