// flight-alert-webhook — FlightAware calls this when a tracked flight files, departs,
// is delayed, cancelled, diverted, or arrives. We update every saved trip for that
// departure, so the app (and, later, push notifications) see the change immediately.
//
// Deploy with --no-verify-jwt (FlightAware does not send a Supabase token) and give
// FlightAware this URL with a secret in the query string:
//   https://<project-ref>.supabase.co/functions/v1/flight-alert-webhook?key=<AEROAPI_WEBHOOK_SECRET>
import { admin, json } from "../_shared/util.ts";
import { slimFlight } from "../_shared/aeroapi.ts";

Deno.serve(async (req) => {
  const secret = Deno.env.get("AEROAPI_WEBHOOK_SECRET");
  if (!secret || new URL(req.url).searchParams.get("key") !== secret) {
    return new Response("forbidden", { status: 403 });
  }
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const f = body.flight ? slimFlight(body.flight) : null;
  if (!f?.fa_flight_id) return json({ ok: true, ignored: true });

  const db = admin();
  const { error } = await db
    .from("tracked_flights")
    .update({
      status: f.status,
      estimated_out: f.estimated_out,
      estimated_in: f.estimated_in,
      delay_minutes: f.delay_minutes,
      cancelled: f.cancelled,
      last_event: body.event_code ?? body.short_description ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("fa_flight_id", f.fa_flight_id);
  if (error) console.error(error);

  // the cached flight list for this number is now stale
  await db
    .from("api_cache")
    .delete()
    .in("key", [`aeroapi:flights:${f.ident}`, `aeroapi:flights:${f.ident_icao}`, `aeroapi:position:${f.fa_flight_id}`]);

  // Phase 1 next step: send a push notification here (see docs/phase-1-plan.md).
  return json({ ok: true });
});
