// FlightAware AeroAPI v4 — https://www.flightaware.com/aeroapi/portal/documentation
// Billed per result set (15 records). Keep max_pages=1 and cache aggressively.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { logUsage } from "./util.ts";

const BASE = "https://aeroapi.flightaware.com/aeroapi";

export const aeroKey = () => Deno.env.get("AEROAPI_KEY") ?? "";

export async function aero<T = any>(db: SupabaseClient, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "x-apikey": aeroKey(), Accept: "application/json", ...(init.headers ?? {}) },
  });
  // log the endpoint shape, not the specific id, so spend groups cleanly
  await logUsage(db, "aeroapi", path.split("?")[0].replace(/\/flights\/[^/]+/, "/flights/{id}").replace(/\/airports\/[^/]+/, "/airports/{id}"));
  if (!res.ok) throw new Error(`AeroAPI ${res.status}: ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : await res.json();
}

const place = (a: any) =>
  a
    ? {
        code: a.code_iata ?? a.code_lid ?? a.code,
        icao: a.code_icao ?? a.code,
        name: a.name,
        city: a.city,
        tz: a.timezone,
      }
    : null;

/** The fields the app uses, flattened from an AeroAPI flight object. */
export function slimFlight(f: any) {
  const o = place(f.origin);
  const d = place(f.destination);
  return {
    fa_flight_id: f.fa_flight_id,
    ident: f.ident_iata ?? f.ident,
    ident_icao: f.ident_icao ?? f.ident,
    operator: f.operator_iata ?? f.operator,
    flight_number: f.flight_number,
    codeshares: f.codeshares_iata ?? [],
    aircraft_type: f.aircraft_type,
    registration: f.registration,
    inbound_fa_flight_id: f.inbound_fa_flight_id ?? null,
    origin: o?.code,
    origin_icao: o?.icao,
    origin_name: o?.city ?? o?.name,
    origin_airport: o?.name,
    origin_tz: o?.tz,
    destination: d?.code,
    destination_icao: d?.icao,
    destination_name: d?.city ?? d?.name,
    destination_airport: d?.name,
    destination_tz: d?.tz,
    scheduled_out: f.scheduled_out,
    estimated_out: f.estimated_out,
    actual_out: f.actual_out,
    scheduled_off: f.scheduled_off,
    estimated_off: f.estimated_off,
    actual_off: f.actual_off,
    scheduled_on: f.scheduled_on,
    estimated_on: f.estimated_on,
    actual_on: f.actual_on,
    scheduled_in: f.scheduled_in,
    estimated_in: f.estimated_in,
    actual_in: f.actual_in,
    gate_origin: f.gate_origin,
    terminal_origin: f.terminal_origin,
    gate_destination: f.gate_destination,
    terminal_destination: f.terminal_destination,
    baggage_claim: f.baggage_claim,
    runway_off: f.actual_runway_off ?? null,
    runway_on: f.actual_runway_on ?? null,
    route_distance: f.route_distance ?? null, // statute miles
    filed_altitude: f.filed_altitude ?? null, // hundreds of feet
    filed_airspeed: f.filed_airspeed ?? null, // knots
    status: f.status,
    progress_percent: f.progress_percent,
    departure_delay_minutes: Math.round((f.departure_delay ?? 0) / 60),
    arrival_delay_minutes: Math.round((f.arrival_delay ?? 0) / 60),
    delay_minutes: Math.round((f.departure_delay ?? f.arrival_delay ?? 0) / 60),
    cancelled: !!f.cancelled,
    diverted: !!f.diverted,
    blocked: !!f.blocked,
  };
}
export type SlimFlight = ReturnType<typeof slimFlight>;
