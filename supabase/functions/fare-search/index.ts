// fare-search — cheapest fares for a route and month, from the Travelpayouts (Aviasales) Data API.
//
//   { origin: "OKC", destination: "LAS", month: "2026-12", one_way?: true }
//
// Each fare comes back with `book_url`: an Aviasales link carrying our affiliate marker,
// so a booking made there pays us commission while the traveler pays the plain fare.
//
// Note: the Data API returns prices travelers found in the last ~48 hours (cached),
// not a live seat quote. The final price is confirmed on the booking site. Phase 2
// swaps in live pricing (Duffel / Kiwi) for in-app booking.
//
// With no TRAVELPAYOUTS_TOKEN set, returns sample fares (demo: true).
import { admin, cached, cors, fail, json, logUsage } from "../_shared/util.ts";
import { demoFares } from "../_shared/demo.ts";

const IATA = /^[A-Z]{3}$/;
const MONTH = /^\d{4}-\d{2}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail("Send origin, destination and month.");
  }
  const origin = String(body.origin ?? "").toUpperCase();
  const destination = String(body.destination ?? "").toUpperCase();
  const month = String(body.month ?? "");
  const oneWay = body.one_way !== false;
  if (!IATA.test(origin) || !IATA.test(destination)) return fail("Use 3-letter airport codes, like OKC and LAS.");
  if (origin === destination) return fail("Pick two different airports.");
  if (!MONTH.test(month)) return fail("Pick a month.");

  const token = Deno.env.get("TRAVELPAYOUTS_TOKEN");
  const marker = Deno.env.get("TRAVELPAYOUTS_MARKER") ?? "";
  if (!token) return json(demoFares(origin, destination, month));

  const db = admin();
  try {
    const key = `tp:prices:${origin}:${destination}:${month}:${oneWay ? "ow" : "rt"}`;
    const { data, cached: hit } = await cached(db, key, 30 * 60, async () => {
      const q = new URLSearchParams({
        origin,
        destination,
        departure_at: month,
        one_way: String(oneWay),
        currency: "usd",
        market: "us",
        sorting: "price",
        limit: "30",
        token,
      });
      const res = await fetch(`https://api.travelpayouts.com/aviasales/v3/prices_for_dates?${q}`, {
        headers: { "Accept-Encoding": "gzip" },
      });
      await logUsage(db, "travelpayouts", "prices_for_dates");
      if (!res.ok) throw new Error(`Travelpayouts ${res.status}: ${await res.text()}`);
      const r = await res.json();
      return (r.data ?? []).map((f: any) => ({
        origin: f.origin_airport ?? f.origin,
        destination: f.destination_airport ?? f.destination,
        price: f.price,
        airline: f.airline,
        flight_number: f.flight_number,
        departure_at: f.departure_at,
        return_at: f.return_at ?? null,
        transfers: f.transfers ?? 0,
        duration_minutes: f.duration_to ?? f.duration ?? null,
        link: f.link,
      }));
    });

    const fares = data.map((f: any) => {
      const { link, ...rest } = f;
      const url = new URL(link ?? "/", "https://www.aviasales.com");
      if (marker) url.searchParams.set("marker", marker);
      return { ...rest, book_url: url.toString() };
    });
    return json({ currency: "usd", fares, cached: hit });
  } catch (e) {
    console.error(e);
    return fail("Fare search didn't answer. Try again in a minute.", 502);
  }
});
