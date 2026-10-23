// price-watch-check — run once a day: re-price every watched route and tell travelers about drops.
//
// Schedule it with pg_cron + pg_net (SQL in docs/setup-booking-and-points.md), sending
// header x-cron-key: <CRON_SECRET>. Shares the fare-search cache, so a route that was
// searched in the last 30 minutes costs nothing to re-check.
import { admin, cached, fail, json, logUsage, notify } from "../_shared/util.ts";
import { demoFares } from "../_shared/demo.ts";

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-key") !== secret) return fail("forbidden", 403);
  const db = admin();
  const token = Deno.env.get("TRAVELPAYOUTS_TOKEN");
  const thisMonth = new Date().toISOString().slice(0, 7);

  const { data: watches } = await db.from("price_watches").select("*").gte("depart_month", thisMonth);
  const routes = new Map<string, any[]>();
  for (const w of watches ?? []) {
    const k = `${w.origin}:${w.destination}:${w.depart_month}`;
    routes.set(k, [...(routes.get(k) ?? []), w]);
  }

  let drops = 0;
  for (const [k, list] of routes) {
    const [origin, destination, month] = k.split(":");
    let low: number | null = null;
    try {
      if (!token) low = demoFares(origin, destination, month).fares[0]?.price ?? null;
      else {
        const { data } = await cached(db, `tp:prices:${origin}:${destination}:${month}:ow:a`, 30 * 60, async () => {
          const q = new URLSearchParams({ origin, destination, departure_at: month, one_way: "true", direct: "false", currency: "usd", market: "us", sorting: "price", limit: "30", token });
          const res = await fetch(`https://api.travelpayouts.com/aviasales/v3/prices_for_dates?${q}`);
          await logUsage(db, "travelpayouts", "prices_for_dates:watch");
          if (!res.ok) throw new Error(`Travelpayouts ${res.status}`);
          const j = await res.json();
          return (j.data ?? []).map((f: any) => ({ price: f.price }));
        });
        low = data[0]?.price ?? null;
      }
    } catch (e) {
      console.error(k, e);
      continue;
    }
    if (low == null) continue;

    for (const w of list) {
      const was = w.last_price != null ? Number(w.last_price) : null;
      const told = w.last_notified_price != null ? Number(w.last_notified_price) : null;
      const target = w.target_price != null ? Number(w.target_price) : null;
      const dropped = was != null && low <= was * 0.95;
      const hitTarget = target != null && low <= target;
      const fresh = told == null || low < told;
      if ((dropped || hitTarget) && fresh) {
        drops++;
        const label = new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
        await notify(db, w.user_id, {
          kind: "price",
          title: `${origin} to ${destination} dropped to $${Math.round(low)}`,
          body: `${label} fares${was ? ` were $${Math.round(was)}` : ""}${hitTarget ? `, under your $${Math.round(target!)} target` : ""}. Prices like this don't usually last.`,
          link: `#/fly?from=${origin}&to=${destination}&month=${month}`,
        });
      }
      await db
        .from("price_watches")
        .update({
          last_price: low,
          lowest_seen: w.lowest_seen == null ? low : Math.min(Number(w.lowest_seen), low),
          last_checked_at: new Date().toISOString(),
          ...((dropped || hitTarget) && fresh ? { last_notified_price: low } : {}),
        })
        .eq("id", w.id);
    }
  }
  return json({ routes: routes.size, watches: watches?.length ?? 0, drops });
});
