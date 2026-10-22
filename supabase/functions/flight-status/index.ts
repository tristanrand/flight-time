// flight-status — everything the app asks FlightAware for, behind one function.
//
//   { action: "lookup",   ident: "AA1234" }              -> recent + upcoming departures of that flight number
//   { action: "position", fa_flight_id }                  -> live position, flown track, and route endpoints
//   { action: "track",    fa_flight_id }  (signed in)     -> add to "My trips" and register a FlightAware push alert
//   { action: "untrack",  id }            (signed in)     -> remove from "My trips"
//
// With no AEROAPI_KEY set, lookup/position return sample data (demo: true).
import { admin, cached, callerOf, cors, fail, json } from "../_shared/util.ts";
import { aero, aeroKey, slimFlight } from "../_shared/aeroapi.ts";
import { demoFlight } from "../_shared/demo.ts";

const IDENT = /^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail("Send a JSON body with an action.");
  }
  const db = admin();
  const live = !!aeroKey();

  try {
    switch (body.action) {
      case "lookup": {
        const ident = String(body.ident ?? "").toUpperCase().replace(/\s+/g, "");
        if (!IDENT.test(ident)) return fail("Enter a flight number like AA1234.");
        if (!live) return json(demoFlight(ident));
        // flight lists change slowly; 2 minutes of sharing keeps cost flat as users grow
        const { data, cached: hit } = await cached(db, `aeroapi:flights:${ident}`, 120, async () => {
          const r = await aero(db, `/flights/${encodeURIComponent(ident)}?max_pages=1`);
          return (r.flights ?? []).map(slimFlight);
        });
        return json({ flights: data, cached: hit });
      }

      case "position": {
        const id = String(body.fa_flight_id ?? "");
        if (!id) return fail("Missing fa_flight_id.");
        if (!live || id.endsWith("-DEMO-1")) {
          const d = demoFlight(id.split("-")[0]);
          return json({ demo: true, position: d.position, track: d.track, route: d.route });
        }
        const { data } = await cached(db, `aeroapi:position:${id}`, 60, async () => {
          const [pos, trk] = await Promise.all([
            aero(db, `/flights/${encodeURIComponent(id)}/position`),
            aero(db, `/flights/${encodeURIComponent(id)}/track`),
          ]);
          const route = await airportPair(db, pos.origin?.code_icao ?? pos.origin?.code, pos.destination?.code_icao ?? pos.destination?.code);
          return {
            position: pos.last_position ?? null,
            track: (trk.positions ?? []).map((p: any) => [p.latitude, p.longitude]),
            route,
          };
        });
        return json(data);
      }

      case "track": {
        const user = await callerOf(req, db);
        if (!user) return fail("Sign in to save trips.", 401);
        const f = body.flight;
        if (!f?.fa_flight_id) return fail("Missing flight.");
        const { data: row, error } = await db
          .from("tracked_flights")
          .upsert(
            {
              user_id: user.id,
              fa_flight_id: f.fa_flight_id,
              ident: f.ident,
              origin: f.origin,
              destination: f.destination,
              scheduled_out: f.scheduled_out,
              estimated_out: f.estimated_out,
              scheduled_in: f.scheduled_in,
              estimated_in: f.estimated_in,
              status: f.status,
              delay_minutes: f.delay_minutes,
              cancelled: f.cancelled,
            },
            { onConflict: "user_id,fa_flight_id" },
          )
          .select()
          .single();
        if (error) return fail(error.message, 500);

        // Push alerts need the Standard tier and a public webhook URL. Without them the
        // trip is still saved; the app refreshes it on open instead.
        const hook = Deno.env.get("AEROAPI_ALERT_URL");
        if (live && hook && !row.aeroapi_alert_id && !f.fa_flight_id.endsWith("-DEMO-1")) {
          const alertId = await registerAlert(db, f, hook);
          if (alertId) await db.from("tracked_flights").update({ aeroapi_alert_id: alertId }).eq("id", row.id);
        }
        return json({ trip: row });
      }

      case "untrack": {
        const user = await callerOf(req, db);
        if (!user) return fail("Sign in first.", 401);
        const { error } = await db.from("tracked_flights").delete().eq("id", body.id).eq("user_id", user.id);
        if (error) return fail(error.message, 500);
        return json({ ok: true });
      }

      default:
        return fail("Unknown action.");
    }
  } catch (e) {
    console.error(e);
    return fail("FlightAware didn't answer. Try again in a minute.", 502);
  }
});

/** Airport coordinates change never; cache for 30 days. */
async function airportPair(db: any, from?: string, to?: string) {
  if (!from || !to) return null;
  const one = (code: string) =>
    cached(db, `aeroapi:airport:${code}`, 30 * 86400, async () => {
      const a = await aero(db, `/airports/${encodeURIComponent(code)}`);
      return [a.latitude, a.longitude];
    }).then((r) => r.data);
  const [a, b] = await Promise.all([one(from), one(to)]);
  return { from: a, to: b };
}

/** One FlightAware alert per departure, firing on the events a traveler cares about. */
async function registerAlert(db: any, f: any, targetUrl: string): Promise<number | null> {
  try {
    const res = await fetch("https://aeroapi.flightaware.com/aeroapi/alerts", {
      method: "POST",
      headers: { "x-apikey": aeroKey(), "Content-Type": "application/json" },
      body: JSON.stringify({
        ident: f.ident_icao ?? f.ident,
        origin: f.origin,
        destination: f.destination,
        start: f.scheduled_out?.slice(0, 10),
        end: (f.scheduled_in ?? f.scheduled_out)?.slice(0, 10),
        events: { filed: true, departure: true, arrival: true, cancelled: true, diverted: true, out: true, in: true },
        target_url: targetUrl,
      }),
    });
    await db.from("api_usage").insert({ provider: "aeroapi", endpoint: "/alerts" });
    if (!res.ok) {
      console.error("alert register failed", res.status, await res.text());
      return null;
    }
    const loc = res.headers.get("Location") ?? "";
    const id = Number(loc.split("/").pop());
    return Number.isFinite(id) ? id : null;
  } catch (e) {
    console.error(e);
    return null;
  }
}
