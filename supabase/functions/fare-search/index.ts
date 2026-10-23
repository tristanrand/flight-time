// fare-search — cheapest fares from the Travelpayouts (Aviasales) Data API, plus award seats.
//
//   { origin, destination, month, return_month?, direct? }      -> cheapest fares that month (default mode)
//   { mode: "calendar", origin, destination, month }            -> cheapest price for each day of the month
//   { mode: "explore",  origin, month }                         -> cheapest places to fly from `origin`
//   { mode: "awards",   origin, destination, month }            -> award seats in miles (Seats.aero partner API)
//
// Each fare comes back with `book_url`: an Aviasales link carrying our affiliate marker,
// so a booking made there pays us commission while the traveler pays the plain fare.
// Fares that can be bought inside the app come from the `booking` function instead.
//
// The Data API returns prices travelers found in the last ~48 hours (cached),
// not a live seat quote; the final price is confirmed when booking.
//
// With no TRAVELPAYOUTS_TOKEN set, returns generated sample fares (demo: true).
// With no SEATSAERO_API_KEY set, awards mode answers { awards: [], connected: false }.
import { admin, cached, cors, fail, json, limited, logUsage } from "../_shared/util.ts";
import { demoCalendar, demoExplore, demoFares } from "../_shared/demo.ts";

const IATA = /^[A-Z]{3}$/;
const MONTH = /^\d{4}-\d{2}$/;
const TP = "https://api.travelpayouts.com/aviasales/v3";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail("Send origin, destination and month.");
  }
  const mode = String(body.mode ?? "dates");
  const origin = String(body.origin ?? "").toUpperCase();
  const destination = String(body.destination ?? "").toUpperCase();
  const month = String(body.month ?? "");
  const returnMonth = body.return_month ? String(body.return_month) : null;
  const direct = !!body.direct;
  if (!IATA.test(origin)) return fail("Use 3-letter airport codes, like OKC.");
  if (mode !== "explore") {
    if (!IATA.test(destination)) return fail("Use 3-letter airport codes, like OKC and LAS.");
    if (origin === destination) return fail("Pick two different airports.");
  }
  if (!MONTH.test(month) || (returnMonth && !MONTH.test(returnMonth))) return fail("Pick a month.");

  const token = Deno.env.get("TRAVELPAYOUTS_TOKEN");
  const marker = Deno.env.get("TRAVELPAYOUTS_MARKER") ?? "";
  const db = admin();
  const slow = await limited(req, db, "fares", 40);
  if (slow) return slow;

  const affiliate = (link?: string) => {
    const url = new URL(link ?? "/", "https://www.aviasales.com");
    if (marker) url.searchParams.set("marker", marker);
    return url.toString();
  };

  try {
    if (mode === "awards") return json(await awards(db, origin, destination, month));

    if (mode === "calendar") {
      if (!token) return json(demoCalendar(origin, destination, month));
      const { data } = await cached(db, `tp:cal:${origin}:${destination}:${month}`, 30 * 60, async () => {
        const q = new URLSearchParams({ origin, destination, departure_at: month, group_by: "departure_at", currency: "usd", market: "us", token });
        const res = await fetch(`${TP}/grouped_prices?${q}`, { headers: { "Accept-Encoding": "gzip" } });
        await logUsage(db, "travelpayouts", "grouped_prices");
        if (!res.ok) throw new Error(`Travelpayouts ${res.status}: ${await res.text()}`);
        const r = await res.json();
        const days: Record<string, unknown> = {};
        for (const [date, f] of Object.entries<any>(r.data ?? {})) {
          days[date.slice(0, 10)] = { price: f.price, airline: f.airline, transfers: f.transfers ?? 0 };
        }
        return days;
      });
      return json({ currency: "usd", days: data });
    }

    if (mode === "explore") {
      if (!token) return json(demoExplore(origin, month));
      const { data } = await cached(db, `tp:explore:${origin}:${month}`, 60 * 60, async () => {
        const q = new URLSearchParams({ origin, departure_at: month, one_way: "true", currency: "usd", market: "us", sorting: "price", limit: "100", unique: "true", token });
        const res = await fetch(`${TP}/prices_for_dates?${q}`, { headers: { "Accept-Encoding": "gzip" } });
        await logUsage(db, "travelpayouts", "prices_for_dates:explore");
        if (!res.ok) throw new Error(`Travelpayouts ${res.status}: ${await res.text()}`);
        const r = await res.json();
        const best = new Map<string, any>();
        for (const f of r.data ?? []) {
          const d = f.destination_airport ?? f.destination;
          if (!best.has(d) || best.get(d).price > f.price) {
            best.set(d, { destination: d, price: f.price, airline: f.airline, departure_at: f.departure_at, transfers: f.transfers ?? 0, link: f.link });
          }
        }
        return [...best.values()].sort((a, b) => a.price - b.price).slice(0, 40);
      });
      return json({ currency: "usd", places: data.map(({ link, ...p }: any) => ({ ...p, book_url: affiliate(link) })) });
    }

    // default: cheapest fares for the month
    let fares: any[];
    let hit = false;
    let demo = false;
    if (!token) {
      fares = demoFares(origin, destination, month).fares;
      demo = true;
    } else {
      const key = `tp:prices:${origin}:${destination}:${month}:${returnMonth ?? "ow"}:${direct ? "d" : "a"}`;
      const r = await cached(db, key, 30 * 60, async () => {
        const q = new URLSearchParams({
          origin,
          destination,
          departure_at: month,
          one_way: String(!returnMonth),
          direct: String(direct),
          currency: "usd",
          market: "us",
          sorting: "price",
          limit: "30",
          token,
        });
        if (returnMonth) q.set("return_at", returnMonth);
        const res = await fetch(`${TP}/prices_for_dates?${q}`, { headers: { "Accept-Encoding": "gzip" } });
        await logUsage(db, "travelpayouts", "prices_for_dates");
        if (!res.ok) throw new Error(`Travelpayouts ${res.status}: ${await res.text()}`);
        const j = await res.json();
        return (j.data ?? []).map((f: any) => ({
          origin: f.origin_airport ?? f.origin,
          destination: f.destination_airport ?? f.destination,
          price: f.price,
          airline: f.airline,
          flight_number: f.flight_number,
          departure_at: f.departure_at,
          return_at: f.return_at ?? null,
          transfers: f.transfers ?? 0,
          return_transfers: f.return_transfers ?? null,
          duration_minutes: f.duration_to ?? f.duration ?? null,
          duration_back_minutes: f.duration_back ?? null,
          link: f.link,
        }));
      });
      hit = r.cached;
      fares = r.data.map((f: any) => {
        const { link, ...rest } = f;
        return { ...rest, book_url: affiliate(link) };
      });
    }

    const stats = await dealStats(db, origin, destination, month, fares.map((f) => f.price), !returnMonth && !direct && !demo);
    return json({ currency: "usd", fares, cached: hit, stats, ...(demo ? { demo: true } : {}) });
  } catch (e) {
    console.error(e);
    return fail("Fare search didn't answer. Try again in a minute.", 502);
  }
});

/**
 * How today's prices compare with what we've seen on this route before. Records today's
 * low and median (one-way, any stops, real data only) so the answer gets better every day.
 */
async function dealStats(db: any, origin: string, destination: string, month: string, prices: number[], record: boolean) {
  if (!prices.length) return null;
  const sorted = [...prices].sort((a, b) => a - b);
  const min = sorted[0];
  const median = sorted[Math.floor(sorted.length / 2)];
  if (record) {
    await db.from("price_history").upsert({ origin, destination, depart_month: month, seen_on: new Date().toISOString().slice(0, 10), min_price: min, median_price: median });
  }
  const { data: hist } = await db
    .from("price_history")
    .select("min_price, seen_on")
    .eq("origin", origin)
    .eq("destination", destination)
    .gte("seen_on", new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10))
    .order("seen_on");
  const lows = (hist ?? []).map((h: any) => Number(h.min_price)).sort((a: number, b: number) => a - b);
  const q = (p: number) => lows[Math.min(lows.length - 1, Math.floor(p * lows.length))];
  // need a week or so of sightings before we're willing to call something a deal
  const rating = lows.length < 5 ? null : min <= q(0.25) ? "low" : min >= q(0.75) ? "high" : "typical";
  return {
    min,
    median,
    rating,
    typical_low: lows.length ? q(0.5) : null,
    range: lows.length >= 5 ? [q(0.1), q(0.9)] : null,
    days_tracked: lows.length,
    history: (hist ?? []).slice(-30).map((h: any) => [h.seen_on, Number(h.min_price)]),
  };
}

/** Award seats priced in miles, from the Seats.aero partner API (cached availability, not live). */
async function awards(db: any, origin: string, destination: string, month: string) {
  const key = Deno.env.get("SEATSAERO_API_KEY");
  if (!key) return { connected: false, awards: [] };
  const [y, m] = month.split("-").map(Number);
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const { data } = await cached(db, `seats:${origin}:${destination}:${month}`, 60 * 60, async () => {
    const q = new URLSearchParams({ origin_airport: origin, destination_airport: destination, start_date: `${month}-01`, end_date: end, take: "500" });
    const res = await fetch(`https://seats.aero/partnerapi/search?${q}`, { headers: { "Partner-Authorization": key, Accept: "application/json" } });
    await logUsage(db, "seats.aero", "search");
    if (!res.ok) throw new Error(`Seats.aero ${res.status}: ${await res.text()}`);
    const r = await res.json();
    const out: any[] = [];
    for (const a of r.data ?? []) {
      for (const [cabin, k] of [["economy", "Y"], ["premium_economy", "W"], ["business", "J"], ["first", "F"]] as const) {
        if (!a[`${k}Available`]) continue;
        out.push({
          program: a.Source ?? a.Route?.Source,
          date: a.Date,
          cabin,
          miles: Number(a[`${k}MileageCost`]) || null,
          taxes: a[`${k}TotalTaxes`] != null ? Number(a[`${k}TotalTaxes`]) / 100 : null,
          taxes_currency: a.TaxesCurrency ?? "USD",
          direct: !!a[`${k}Direct`],
          seats: a[`${k}RemainingSeats`] ?? null,
          airlines: a[`${k}Airlines`] ?? null,
        });
      }
    }
    return out.filter((x) => x.miles).sort((a, b) => a.miles - b.miles);
  });
  return { connected: true, awards: data };
}
