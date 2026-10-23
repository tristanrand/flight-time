// In-app booking: Duffel sells and tickets the seat, Stripe collects the traveler's card.
//
// Money flow (live): traveler pays us through Stripe Checkout -> on payment we create a Duffel
// order paid from our Duffel balance -> the airline issues the ticket. If ticketing fails we
// refund the Stripe payment automatically. Card details never touch our servers or the app.
//
// Points: no airline lets a third party spend a member's miles, so a points checkout is a
// hand-off: we price it, then send the traveler to the program's own award booking page.
// The `redeem` hook below is where a points partner plugs in later.
//
// Without DUFFEL_ACCESS_TOKEN, offers are generated (demo) and checkout completes instantly
// with a fake confirmation code, so the full flow can be clicked through.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { demoOffer } from "./demo.ts";
import { logUsage, notify } from "./util.ts";
import { airport, zonedToUtc } from "./geo.ts";

export const duffelKey = () => Deno.env.get("DUFFEL_ACCESS_TOKEN") ?? "";
export const stripeKey = () => Deno.env.get("STRIPE_SECRET_KEY") ?? "";
export const serviceFee = () => Math.max(0, Number(Deno.env.get("BOOKING_SERVICE_FEE") ?? "0") || 0);

export async function duffel<T = any>(db: SupabaseClient, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`https://api.duffel.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${duffelKey()}`,
      "Duffel-Version": "v2",
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  await logUsage(db, "duffel", path.split("?")[0].replace(/\/(off|ord)_[^/]+/, "/{id}"), 0);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = j?.errors?.[0]?.message ?? `Duffel ${res.status}`;
    throw Object.assign(new Error(msg), { status: res.status, body: j });
  }
  return j.data as T;
}

/** Stripe REST call with form encoding. */
export async function stripe<T = any>(path: string, form?: Record<string, string>, method = form ? "POST" : "GET"): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${stripeKey()}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form ? new URLSearchParams(form) : undefined,
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error?.message ?? `Stripe ${res.status}`);
  return j as T;
}

const isoMinutes = (d?: string | null) => {
  const m = d?.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/);
  return m ? Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : null;
};

/** Duffel offer -> the shape the app renders (same as demo offers). */
export function slimDuffelOffer(o: any) {
  const firstPax = (s: any) => s.passengers?.[0] ?? {};
  const bags = (type: string) =>
    Math.min(
      ...(o.slices ?? []).flatMap((sl: any) =>
        (sl.segments ?? []).map((s: any) => (firstPax(s).baggages ?? []).filter((b: any) => b.type === type).reduce((n: number, b: any) => n + (b.quantity ?? 0), 0)),
      ),
    );
  const refund = o.conditions?.refund_before_departure;
  const change = o.conditions?.change_before_departure;
  return {
    id: o.id,
    live: true,
    test_mode: o.live_mode === false,
    owner: { code: o.owner?.iata_code, name: o.owner?.name },
    total_amount: Number(o.total_amount),
    base_amount: Number(o.base_amount ?? o.total_amount),
    tax_amount: Number(o.tax_amount ?? 0),
    currency: o.total_currency,
    cabin: firstPax(o.slices?.[0]?.segments?.[0] ?? {}).cabin_class ?? "economy",
    fare_brand: o.slices?.[0]?.fare_brand_name ?? null,
    bags: { carry_on: Number.isFinite(bags("carry_on")) ? bags("carry_on") : null, checked: Number.isFinite(bags("checked")) ? bags("checked") : null },
    refundable: !!refund?.allowed,
    changeable: !!change?.allowed,
    change_fee: change?.allowed ? Number(change.penalty_amount ?? 0) : null,
    expires_at: o.expires_at,
    passengers: (o.passengers ?? []).map((p: any) => ({ id: p.id, type: p.type ?? "adult" })),
    slices: (o.slices ?? []).map((sl: any) => ({
      origin: sl.origin?.iata_code,
      destination: sl.destination?.iata_code,
      duration_minutes: isoMinutes(sl.duration),
      stops: Math.max(0, (sl.segments?.length ?? 1) - 1),
      segments: (sl.segments ?? []).map((s: any) => ({
        carrier: s.marketing_carrier?.iata_code,
        carrier_name: s.marketing_carrier?.name,
        operating_carrier: s.operating_carrier?.iata_code,
        flight_number: s.marketing_carrier_flight_number,
        origin: s.origin?.iata_code,
        destination: s.destination?.iata_code,
        departing_at: s.departing_at,
        arriving_at: s.arriving_at,
        aircraft: s.aircraft?.name ?? null,
        duration_minutes: isoMinutes(s.duration),
      })),
    })),
  };
}

/** Re-price one offer on the server. Prices from the browser are never trusted. */
export async function getOffer(db: SupabaseClient, id: string) {
  // sample fares only exist while Duffel isn't connected, so nobody can "book" one in production
  if (id.startsWith("demo_")) return duffelKey() ? null : demoOffer(id);
  if (!duffelKey()) return null;
  const o = await duffel(db, `/air/offers/${encodeURIComponent(id)}?return_available_services=false`);
  return slimDuffelOffer(o);
}

// Where to finish a points booking for each program, until a redemption partner is connected.
const AWARD_PAGES: Record<string, string> = {
  AA: "https://www.aa.com/booking/find-flights?redeemMiles=true",
  DL: "https://www.delta.com/flight-search/book-a-flight",
  UA: "https://www.united.com/en/us/book-flight/united-reservations",
  WN: "https://www.southwest.com/air/booking/",
  AS: "https://www.alaskaair.com/search",
  B6: "https://www.jetblue.com/booking/flights",
  F9: "https://booking.flyfrontier.com/Flight/Search",
  AC: "https://www.aircanada.com/aeroplan/redeem",
  BA: "https://www.britishairways.com/travel/redeem/execclub/",
  NK: "https://www.spirit.com/",
  AFKL: "https://www.flyingblue.com/",
  VS: "https://www.virginatlantic.com/flying-club",
  // bank travel portals (the "pay with card points" option)
  UR: "https://www.chase.com/travel",
  MR: "https://www.amextravel.com/",
  TY: "https://www.thankyou.com/",
  C1: "https://travel.capitalone.com/",
  BILT: "https://www.biltrewards.com/",
  WF: "https://www.wellsfargorewards.com/",
};
export const awardPage = (program?: string | null) => AWARD_PAGES[program ?? ""] ?? null;

/**
 * Spend a member's points with a redemption partner. None is connected yet, so this
 * always answers null and checkout falls back to the hand-off page.
 */
export async function redeem(_db: SupabaseClient, _booking: any): Promise<{ reference: string } | null> {
  return null;
}

const pnr = () => Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");

/**
 * Turn a paid booking into a ticket. Safe to call twice (Stripe webhook and the return page
 * may both arrive): only the call that flips `pending_payment` -> `paid` does the work.
 */
export async function finalize(db: SupabaseClient, bookingId: string, paymentIntent?: string | null) {
  const { data: claimed } = await db
    .from("bookings")
    .update({ status: "paid", updated_at: new Date().toISOString() })
    .eq("id", bookingId)
    .eq("status", "pending_payment")
    .select()
    .maybeSingle();
  if (!claimed) {
    const { data } = await db.from("bookings").select("*").eq("id", bookingId).maybeSingle();
    return data;
  }
  const b = claimed;
  let update: Record<string, any>;

  if (b.provider === "demo") {
    update = { status: "ticketed", booking_reference: pnr() };
  } else {
    try {
      const order = await duffel(db, "/air/orders", {
        method: "POST",
        body: JSON.stringify({
          data: {
            type: "instant",
            selected_offers: [b.offer_id],
            passengers: b.passengers,
            payments: [{ type: "balance", currency: b.offer.currency, amount: Number(b.fare_amount).toFixed(2) }],
            // lets us find the order from our side if the answer below never arrives
            metadata: { booking_id: b.id },
          },
        }),
        signal: AbortSignal.timeout(60_000),
      });
      update = { status: "ticketed", duffel_order_id: order.id, booking_reference: order.booking_reference };
    } catch (e) {
      const status = (e as any).status as number | undefined;
      console.error("duffel order failed", status, e);
      if (status && status >= 400 && status < 500) {
        // Duffel definitely refused (sold out, price changed, bad passenger data): no ticket exists, so refund
        update = { status: "failed", failure_reason: (e as Error).message };
        if (paymentIntent && stripeKey()) {
          try {
            const r = await stripe("/refunds", { payment_intent: paymentIntent, reason: "requested_by_customer" });
            update.refund_status = `refunded ${r.id}`;
          } catch (r) {
            console.error("refund failed — refund by hand in Stripe", bookingId, r);
            update.refund_status = `refund failed: ${(r as Error).message}`;
          }
        } else {
          update.refund_status = paymentIntent ? "refund needed (Stripe not configured)" : "nothing charged";
        }
      } else {
        // timeout or Duffel error: the order may exist. Leave it paid and flagged; see docs/setup-booking-and-points.md
        update = { status: "paid", failure_reason: `ticketing unconfirmed: ${(e as Error).message}` };
      }
    }
  }

  const { data: done } = await db
    .from("bookings")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", b.id)
    .select()
    .single();

  if (done?.status === "ticketed") {
    await addToTrips(db, done);
    const s = done.offer.slices[0];
    await notify(db, done.user_id, {
      kind: "booking",
      title: `You're booked: ${s.origin} to ${s.destination}`,
      body: `Confirmation ${done.booking_reference}. Your flights are in My trips and we'll watch them for you.`,
      link: `#/booking/${done.id}`,
    });
  } else if (done?.status === "failed") {
    const refunded = String(done.refund_status ?? "").startsWith("refunded") || done.refund_status === "nothing charged";
    await notify(db, done.user_id, {
      kind: "booking",
      title: "The airline didn't confirm your booking",
      body: refunded
        ? "Your payment has been refunded to your card. It can take 5–10 days to show."
        : "We're refunding your payment by hand and will email you when it's done.",
      link: `#/booking/${done.id}`,
    });
  }
  return done;
}

/** Every flight on a ticket goes into My trips, linked to the booking. */
export async function addToTrips(db: SupabaseClient, b: any) {
  const rows = b.offer.slices.flatMap((sl: any) =>
    sl.segments.map((s: any) => ({
      user_id: b.user_id,
      booking_id: b.id,
      ident: `${s.carrier}${s.flight_number}`,
      origin: s.origin,
      destination: s.destination,
      // offers give local airport times; the trips table stores real instants
      scheduled_out: zonedToUtc(s.departing_at, airport(s.origin)?.tz),
      scheduled_in: zonedToUtc(s.arriving_at, airport(s.destination)?.tz),
      status: "Scheduled",
      aircraft_type: s.aircraft,
    })),
  );
  if (rows.length) await db.from("tracked_flights").insert(rows);
}
