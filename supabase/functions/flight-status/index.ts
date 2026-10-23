// flight-status — everything the app asks FlightAware (and the free radar feed) for, behind one function.
//
//   { action: "lookup",   ident: "AA1234" | "N123AB" }     -> recent + upcoming departures of that flight number or tail
//   { action: "flight",   fa_flight_id }                    -> one specific departure (deep links, "where's my plane")
//   { action: "position", fa_flight_id }                    -> live position, flown track, and route endpoints
//   { action: "aircraft", type: "B738" }                    -> manufacturer + model for an ICAO type code
//   { action: "airport",  code: "DFW", kind: "departures" } -> airport info, weather, delays and the next 15 flights
//   { action: "route",    origin: "OKC", destination: "DFW" } -> today's nonstops between two airports
//   { action: "radar",    lat, lon, radius_nm }             -> every aircraft broadcasting near a point (adsb.lol, free)
//   { action: "track",    flight }  (signed in)             -> add to "My trips" and register a FlightAware push alert
//   { action: "untrack",  id }      (signed in)             -> remove from "My trips"
//
// With no AEROAPI_KEY set, FlightAware actions return generated sample data (demo: true).
import { admin, cached, callerOf, cors, fail, json, limited, logUsage } from "../_shared/util.ts";
import { aero, aeroKey, slimFlight } from "../_shared/aeroapi.ts";
import { airport as knownAirport } from "../_shared/geo.ts";
import {
  demoBoard, demoFlight, demoFlightById, demoPosition, demoRadar, demoRoute, demoWeather, isDemoId,
} from "../_shared/demo.ts";

// airline flight numbers (AA1234, AAL1234) and US tail numbers (N123AB)
const IDENT = /^([A-Z0-9]{2,3}\d{1,4}[A-Z]?|N\d{1,5}[A-Z]{0,2})$/;
const CODE = /^[A-Z0-9]{3,4}$/;

// ICAO when we know it: AeroAPI is most reliable with ICAO airport codes
const icaoOf = (code: string, hint?: string) => (hint && /^[A-Z]{4}$/.test(hint) ? hint : knownAirport(code)?.icao ?? code);

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
        const ident = String(body.ident ?? "").toUpperCase().replace(/[\s-]+/g, "");
        if (!IDENT.test(ident)) return fail("Enter a flight number like AA1234, or a tail number like N123AB.");
        if (!live) return json(demoFlight(ident));
        const slow = await limited(req, db, "flight", 40);
        if (slow) return slow;
        // flight lists change slowly; 2 minutes of sharing keeps cost flat as users grow
        const { data, cached: hit } = await cached(db, `aeroapi:flights:${ident}`, 120, async () => {
          const r = await aero(db, `/flights/${encodeURIComponent(ident)}?max_pages=1`);
          return (r.flights ?? []).map(slimFlight);
        });
        return json({ flights: data, cached: hit });
      }

      case "flight": {
        const id = String(body.fa_flight_id ?? "");
        if (!id) return fail("Missing fa_flight_id.");
        if (isDemoId(id) || !live) {
          const f = demoFlightById(id);
          return f ? json({ demo: true, flight: f }) : fail("That flight isn't available.", 404);
        }
        const slow = await limited(req, db, "flight", 40);
        if (slow) return slow;
        const { data } = await cached(db, `aeroapi:flight:${id}`, 120, async () => {
          const r = await aero(db, `/flights/${encodeURIComponent(id)}`);
          return r.flights?.[0] ? slimFlight(r.flights[0]) : null;
        });
        return data ? json({ flight: data }) : fail("FlightAware has no record of that departure.", 404);
      }

      case "position": {
        const id = String(body.fa_flight_id ?? "");
        if (!id) return fail("Missing fa_flight_id.");
        if (!live || isDemoId(id)) return json(demoPosition(id));
        const slow = await limited(req, db, "position", 60);
        if (slow) return slow;
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

      case "aircraft": {
        const type = String(body.type ?? "").toUpperCase();
        if (!/^[A-Z0-9]{2,4}$/.test(type)) return fail("Missing aircraft type.");
        if (!live) return json({ demo: true, aircraft: null });
        // aircraft types never change; cache for 90 days
        const { data } = await cached(db, `aeroapi:type:${type}`, 90 * 86400, async () => {
          try {
            const a = await aero(db, `/aircraft/types/${type}`);
            return { manufacturer: a.manufacturer, type: a.type, description: a.description, engine_count: a.engine_count, engine_type: a.engine_type };
          } catch {
            return null;
          }
        });
        return json({ aircraft: data });
      }

      case "airport": {
        const code = String(body.code ?? "").toUpperCase();
        const kind = body.kind === "arrivals" ? "arrivals" : "departures";
        if (!CODE.test(code)) return fail("Use an airport code like DFW.");
        if (!live) return json({ ...demoBoard(code, kind), ...demoWeather(code), info: null });
        const slow = await limited(req, db, "airport", 30);
        if (slow) return slow;
        const id = icaoOf(code, body.icao);
        const [info, board, wx, delays] = await Promise.all([
          airportInfo(db, id),
          cached(db, `aeroapi:board:${id}:${kind}`, 120, async () => {
            const r = await aero(db, `/airports/${id}/flights/scheduled_${kind}?max_pages=1&type=Airline`);
            return (r[`scheduled_${kind}`] ?? []).map(slimFlight);
          }).then((r) => r.data),
          cached(db, `aeroapi:wx:${id}`, 15 * 60, async () => {
            try {
              const r = await aero(db, `/airports/${id}/weather/observations?max_pages=1`);
              return weatherOf(r.observations?.[0]);
            } catch {
              return null;
            }
          }).then((r) => r.data),
          cached(db, `aeroapi:delays:${id}`, 5 * 60, async () => {
            try {
              const d = await aero(db, `/airports/${id}/delays`);
              if (!d?.delay_secs) return null;
              return { color: d.color, minutes: Math.round(d.delay_secs / 60), reasons: (d.reasons ?? []).map((x: any) => x.reason).filter(Boolean) };
            } catch {
              return null; // FlightAware answers 404 when there's no delay program
            }
          }).then((r) => r.data),
        ]);
        return json({ info, flights: board, weather: wx, delays });
      }

      case "route": {
        const o = String(body.origin ?? "").toUpperCase();
        const d = String(body.destination ?? "").toUpperCase();
        if (!CODE.test(o) || !CODE.test(d) || o === d) return fail("Pick two different airports.");
        if (!live) return json(demoRoute(o, d));
        const slow = await limited(req, db, "route", 20);
        if (slow) return slow;
        const from = icaoOf(o, body.origin_icao), to = icaoOf(d, body.destination_icao);
        const { data } = await cached(db, `aeroapi:route:${from}:${to}`, 5 * 60, async () => {
          const r = await aero(db, `/airports/${from}/flights/to/${to}?max_pages=1&type=Airline&connection=nonstop`);
          return (r.flights ?? []).flatMap((x: any) => (x.segments?.length === 1 ? [slimFlight(x.segments[0])] : []));
        });
        return json({ flights: data });
      }

      case "radar": {
        const lat = Number(body.lat), lon = Number(body.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return fail("Missing lat/lon.");
        const radius = Math.min(250, Math.max(25, Math.round((Number(body.radius_nm) || 150) / 25) * 25));
        // snap to a half-degree grid so everyone looking at the same area shares one call
        const la = Math.round(lat * 2) / 2, lo = Math.round(lon * 2) / 2;
        const slow = await limited(req, db, "radar", 30);
        if (slow) return slow;
        const key = `adsb:${la}:${lo}:${radius}`;
        try {
          const { data } = await cached(db, key, 20, async () => {
            const url = `https://api.adsb.lol/v2/lat/${la}/lon/${lo}/dist/${radius}`;
            let res = await fetch(url, { signal: AbortSignal.timeout(8000) });
            if (res.status === 429) {
              // the free feed rate-limits shared cloud IPs; one polite retry
              await new Promise((r) => setTimeout(r, 1200));
              res = await fetch(url, { signal: AbortSignal.timeout(8000) });
            }
            await logUsage(db, "adsb.lol", "/v2/lat/lon/dist", 0);
            if (!res.ok) throw new Error(`adsb.lol ${res.status}`);
            const r = await res.json();
            return (r.ac ?? [])
              .filter((a: any) => a.lat != null && a.lon != null)
              .map((a: any) => ({
                hex: a.hex,
                callsign: (a.flight ?? "").trim() || null,
                registration: a.r ?? null,
                type: a.t ?? null,
                lat: a.lat,
                lon: a.lon,
                altitude: a.alt_baro === "ground" ? 0 : a.alt_baro ?? a.alt_geom ?? null,
                groundspeed: a.gs != null ? Math.round(a.gs) : null,
                heading: a.track != null ? Math.round(a.track) : a.true_heading ?? null,
                vertical_rate: a.baro_rate ?? a.geom_rate ?? 0,
                on_ground: a.alt_baro === "ground",
                squawk: a.squawk ?? null,
                emergency: a.emergency && a.emergency !== "none" ? a.emergency : null,
              }));
          });
          return json({ aircraft: data, center: [la, lo], radius_nm: radius, source: "adsb.lol" });
        } catch (e) {
          console.error(e);
          // a slightly old picture beats a made-up one
          const { data: old } = await db.from("api_cache").select("payload, fetched_at").eq("key", key).maybeSingle();
          if (old && Date.now() - new Date(old.fetched_at).getTime() < 10 * 60_000) {
            return json({ aircraft: old.payload, center: [la, lo], radius_nm: radius, source: "adsb.lol", stale_at: old.fetched_at });
          }
          return json({ ...demoRadar(la, lo, radius), center: [la, lo], radius_nm: radius });
        }
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
              actual_out: f.actual_out,
              scheduled_in: f.scheduled_in,
              estimated_in: f.estimated_in,
              actual_in: f.actual_in,
              status: f.status,
              delay_minutes: f.delay_minutes,
              cancelled: f.cancelled,
              aircraft_type: f.aircraft_type,
              registration: f.registration,
              gate_origin: f.gate_origin,
              gate_destination: f.gate_destination,
              snapshot: f,
              booking_id: body.booking_id ?? null,
            },
            { onConflict: "user_id,fa_flight_id" },
          )
          .select()
          .single();
        if (error) return fail(error.message, 500);

        // Push alerts need the Standard tier and a public webhook URL. Without them the
        // trip is still saved; the app refreshes it on open instead.
        const hook = Deno.env.get("AEROAPI_ALERT_URL");
        if (live && hook && !row.aeroapi_alert_id && !isDemoId(f.fa_flight_id)) {
          const alertId = await registerAlert(db, f, hook);
          if (alertId) await db.from("tracked_flights").update({ aeroapi_alert_id: alertId }).eq("id", row.id).eq("user_id", user.id);
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

/** Airport name, place and coordinates. These never change; cache for 30 days. */
async function airportInfo(db: any, code: string) {
  const { data } = await cached(db, `aeroapi:airport:info:${code}`, 30 * 86400, async () => {
    try {
      const a = await aero(db, `/airports/${encodeURIComponent(code)}`);
      return {
        code: a.code_iata ?? a.code_lid ?? a.airport_code,
        icao: a.code_icao,
        name: a.name,
        city: a.city,
        state: a.state,
        country: a.country_code,
        lat: a.latitude,
        lon: a.longitude,
        tz: a.timezone,
        elevation: a.elevation,
      };
    } catch {
      return null;
    }
  });
  return data;
}

async function airportPair(db: any, from?: string, to?: string) {
  if (!from || !to) return null;
  const [a, b] = await Promise.all([airportInfo(db, from), airportInfo(db, to)]);
  return a && b ? { from: [a.lat, a.lon], to: [b.lat, b.lon] } : null;
}

/** METAR observation → the handful of things a traveler can read at a glance. */
function weatherOf(o: any) {
  if (!o) return null;
  // the raw METAR is the most reliable source for visibility ("10SM", "1/2SM", "M1/4SM")
  const sm = String(o.raw_data ?? "").match(/\s(M?)(\d+)?\s?(?:(\d)\/(\d))?SM\b/);
  const fromRaw = sm ? Number(sm[2] ?? 0) + (sm[3] ? Number(sm[3]) / Number(sm[4]) : 0) : null;
  const units = String(o.visibility_units ?? "").toLowerCase();
  const vis = fromRaw ?? (o.visibility == null ? null : /met/.test(units) ? o.visibility / 1609 : o.visibility);
  const ceiling = Math.min(
    ...(o.clouds ?? []).filter((c: any) => /BKN|OVC|VV/.test(c.symbol ?? c.type ?? "")).map((c: any) => c.altitude ?? Infinity),
    Infinity,
  );
  const v = vis ?? 10;
  const cat =
    v < 1 || ceiling < 500 ? "LIFR" : v < 3 || ceiling < 1000 ? "IFR" : v <= 5 || ceiling <= 3000 ? "MVFR" : "VFR";
  return {
    conditions: o.cloud_friendly ?? o.conditions ?? null,
    temp_c: o.temp_air ?? null,
    wind_dir: o.wind_direction ?? null,
    wind_kts: o.wind_speed ?? null,
    gust_kts: o.wind_speed_gust || null,
    visibility_mi: vis != null ? Math.round(vis * 10) / 10 : null,
    flight_category: cat,
    raw: o.raw_data ?? null,
    time: o.time ?? null,
  };
}

/** One FlightAware alert per departure, firing on the events a traveler cares about. */
async function registerAlert(db: any, f: any, targetUrl: string): Promise<number | null> {
  try {
    const res = await fetch("https://aeroapi.flightaware.com/aeroapi/alerts", {
      method: "POST",
      headers: { "x-apikey": aeroKey(), "Content-Type": "application/json" },
      body: JSON.stringify({
        ident: f.ident_icao ?? f.ident,
        origin: f.origin_icao ?? f.origin,
        destination: f.destination_icao ?? f.destination,
        start: f.scheduled_out?.slice(0, 10),
        end: (f.scheduled_in ?? f.scheduled_out)?.slice(0, 10),
        events: { filed: true, departure: true, arrival: true, cancelled: true, diverted: true, out: true, in: true },
        target_url: targetUrl,
      }),
    });
    await logUsage(db, "aeroapi", "/alerts");
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
