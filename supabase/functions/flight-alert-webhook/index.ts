// flight-alert-webhook — FlightAware calls this when a tracked flight files, departs,
// is delayed, cancelled, diverted, or arrives. We update every saved trip for that
// departure and drop a line in each traveler's alerts feed, so the app sees it instantly.
//
// Deploy with --no-verify-jwt (FlightAware does not send a Supabase token) and give
// FlightAware this URL with a secret in the query string:
//   https://<project-ref>.supabase.co/functions/v1/flight-alert-webhook?key=<AEROAPI_WEBHOOK_SECRET>
import { admin, json, notify } from "../_shared/util.ts";
import { slimFlight } from "../_shared/aeroapi.ts";

const LOUD = new Set(["departure", "arrival", "cancelled", "diverted", "out", "in"]);

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
  const { data: before } = await db.from("tracked_flights").select("id, user_id, delay_minutes").eq("fa_flight_id", f.fa_flight_id);

  const { error } = await db
    .from("tracked_flights")
    .update({
      status: f.status,
      estimated_out: f.estimated_out,
      actual_out: f.actual_out,
      estimated_in: f.estimated_in,
      actual_in: f.actual_in,
      delay_minutes: f.delay_minutes,
      cancelled: f.cancelled,
      gate_origin: f.gate_origin,
      gate_destination: f.gate_destination,
      registration: f.registration,
      snapshot: f,
      last_event: body.event_code ?? body.short_description ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("fa_flight_id", f.fa_flight_id);
  if (error) console.error(error);

  // one line in each traveler's feed for the events worth interrupting someone for
  const event = String(body.event_code ?? "").toLowerCase();
  for (const t of before ?? []) {
    const delayJump = Math.abs((f.delay_minutes ?? 0) - (t.delay_minutes ?? 0)) >= 15;
    if (!LOUD.has(event) && !delayJump) continue;
    await notify(db, t.user_id, {
      kind: "flight",
      title: headline(f, event, delayJump),
      body: body.long_description ?? body.summary ?? body.short_description ?? f.status ?? undefined,
      link: `#/flight/${f.ident}?id=${encodeURIComponent(f.fa_flight_id)}`,
    });
  }

  // the cached answers for this flight are now stale
  await db
    .from("api_cache")
    .delete()
    .in("key", [
      `aeroapi:flights:${f.ident}`,
      `aeroapi:flights:${f.ident_icao}`,
      `aeroapi:flight:${f.fa_flight_id}`,
      `aeroapi:position:${f.fa_flight_id}`,
    ]);

  // Phase 1 next step: send a web push here too (see docs/phase-1-plan.md).
  return json({ ok: true });
});

function headline(f: any, event: string, delayJump: boolean) {
  const n = f.ident;
  if (f.cancelled || event === "cancelled") return `${n} is cancelled`;
  if (f.diverted || event === "diverted") return `${n} is diverting`;
  if (event === "in" || event === "arrival") return `${n} landed in ${f.destination_name ?? f.destination}`;
  if (event === "out" || event === "departure") return `${n} has left ${f.origin_name ?? f.origin}`;
  if (delayJump) return f.delay_minutes > 0 ? `${n} is now ${f.delay_minutes} minutes late` : `${n} is back on time`;
  return `${n}: ${f.status}`;
}
