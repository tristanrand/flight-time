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
  await logUsage(db, "aeroapi", path.split("?")[0]);
  if (!res.ok) throw new Error(`AeroAPI ${res.status}: ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : await res.json();
}

/** The fields the app uses, flattened from an AeroAPI flight object. */
export function slimFlight(f: any) {
  const delay = f.departure_delay ?? f.arrival_delay ?? 0;
  return {
    fa_flight_id: f.fa_flight_id,
    ident: f.ident_iata ?? f.ident,
    ident_icao: f.ident_icao ?? f.ident,
    operator: f.operator_iata ?? f.operator,
    aircraft_type: f.aircraft_type,
    origin: f.origin?.code_iata ?? f.origin?.code,
    origin_name: f.origin?.city ?? f.origin?.name,
    destination: f.destination?.code_iata ?? f.destination?.code,
    destination_name: f.destination?.city ?? f.destination?.name,
    scheduled_out: f.scheduled_out,
    estimated_out: f.estimated_out,
    actual_out: f.actual_out,
    scheduled_in: f.scheduled_in,
    estimated_in: f.estimated_in,
    actual_in: f.actual_in,
    gate_origin: f.gate_origin,
    terminal_origin: f.terminal_origin,
    gate_destination: f.gate_destination,
    baggage_claim: f.baggage_claim,
    status: f.status,
    progress_percent: f.progress_percent,
    delay_minutes: Math.round(delay / 60),
    cancelled: !!f.cancelled,
    diverted: !!f.diverted,
  };
}
export type SlimFlight = ReturnType<typeof slimFlight>;
