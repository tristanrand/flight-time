// booking — search bookable fares, price one, check out, confirm payment.
//
//   { action: "search",   slices: [{ origin, destination, departure_date }], adults, cabin } -> offers
//   { action: "offer",    offer_id }                                   -> one offer, re-priced now
//   { action: "checkout", offer_id, passengers, pay_with, points_program? } (signed in)
//        card   -> { booking, pay_url }       (Stripe Checkout; demo offers complete instantly)
//        points -> { booking, handoff_url }   (the program's own award page, until a partner is connected)
//   { action: "confirm",  booking_id }  (signed in)                    -> checks Stripe and tickets if paid
//
// Secrets: DUFFEL_ACCESS_TOKEN (duffel_test_… while building), STRIPE_SECRET_KEY,
// STRIPE_WEBHOOK_SECRET (see stripe-webhook), BOOKING_SERVICE_FEE (USD per booking, default 0),
// APP_URL (where Stripe sends travelers back; defaults to the Vercel URL).
import { admin, callerOf, cors, fail, json, limited } from "../_shared/util.ts";
import { demoOffers } from "../_shared/demo.ts";
import { awardPage, duffel, duffelKey, finalize, getOffer, redeem, serviceFee, slimDuffelOffer, stripe, stripeKey } from "../_shared/booking.ts";

const IATA = /^[A-Z]{3}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CABINS = ["economy", "premium_economy", "business", "first"];

const appUrl = (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  // local dev returns to localhost; everything else goes to the real app
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return Deno.env.get("APP_URL") ?? "https://flight-time-alpha.vercel.app";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail("Send a JSON body with an action.");
  }
  const db = admin();

  try {
    switch (body.action) {
      case "search": {
        const slices = (body.slices ?? []).map((s: any) => ({
          origin: String(s.origin ?? "").toUpperCase(),
          destination: String(s.destination ?? "").toUpperCase(),
          departure_date: String(s.departure_date ?? ""),
        }));
        if (!slices.length || slices.length > 2) return fail("Search one-way or round trip.");
        for (const s of slices) {
          if (!IATA.test(s.origin) || !IATA.test(s.destination) || s.origin === s.destination) return fail("Use two different 3-letter airport codes.");
          if (!DATE.test(s.departure_date)) return fail("Pick a travel date.");
          if (s.departure_date < new Date().toISOString().slice(0, 10)) return fail("That date has already passed.");
        }
        const adults = Math.min(9, Math.max(1, Number(body.adults) || 1));
        const cabin = CABINS.includes(body.cabin) ? body.cabin : "economy";
        const slow = await limited(req, db, "offers", 15);
        if (slow) return slow;
        if (!duffelKey()) return json(demoOffers({ slices, adults, cabin }));

        const r = await duffel(db, "/air/offer_requests?return_offers=true&supplier_timeout=20000", {
          method: "POST",
          body: JSON.stringify({
            data: { slices, passengers: Array.from({ length: adults }, () => ({ type: "adult" })), cabin_class: cabin, max_connections: 1 },
          }),
        });
        const offers = (r.offers ?? [])
          .map(slimDuffelOffer)
          // the app prices, charges and adds fees in US dollars only for now
          .filter((o: any) => o.currency === "USD")
          .sort((a: any, b: any) => a.total_amount - b.total_amount)
          .slice(0, 40);
        return json({ offers, service_fee: serviceFee() });
      }

      case "offer": {
        const id = String(body.offer_id ?? "");
        if (!id) return fail("Missing offer.");
        const offer = await getOffer(db, id);
        if (!offer) return fail("That fare is no longer available. Search again for the latest prices.", 410);
        return json({ offer, service_fee: serviceFee(), demo: !offer.live, card_payments: !!stripeKey() || !offer.live });
      }

      case "checkout": {
        const user = await callerOf(req, db);
        if (!user) return fail("Sign in to book.", 401);
        const offer = await getOffer(db, String(body.offer_id ?? "")).catch(() => null);
        if (!offer) return fail("That fare is no longer available. Search again for the latest prices.", 410);
        if (offer.expires_at && new Date(offer.expires_at).getTime() < Date.now()) return fail("This price expired. Search again for the latest fare.", 410);
        if (offer.currency !== "USD") return fail("This fare is priced in another currency, which we can't charge yet. Pick another fare.", 400);

        const pax = Array.isArray(body.passengers) ? body.passengers : [];
        if (pax.length !== offer.passengers.length) return fail(`Add details for all ${offer.passengers.length} travelers.`);
        const passengers = [];
        for (const [i, p] of pax.entries()) {
          const given = String(p.given_name ?? "").trim();
          const family = String(p.family_name ?? "").trim();
          if (!given || !family) return fail("Each traveler needs a first and last name, exactly as on their ID.");
          if (!DATE.test(String(p.born_on ?? ""))) return fail("Each traveler needs a date of birth.");
          if (!["m", "f"].includes(p.gender)) return fail("Each traveler needs a gender as shown on their ID.");
          const email = String(p.email || user.email || "").trim();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("Add an email address for the ticket.");
          const phone = String(p.phone_number ?? "").replace(/[^\d+]/g, "");
          if (!/^\+\d{8,15}$/.test(phone)) return fail("Add a phone number with country code, like +1 405 555 1234.");
          passengers.push({
            id: offer.passengers[i].id,
            type: "adult",
            given_name: given,
            family_name: family,
            born_on: p.born_on,
            gender: p.gender,
            title: ["mr", "ms", "mrs", "miss", "dr"].includes(p.title) ? p.title : p.gender === "m" ? "mr" : "ms",
            email,
            phone_number: phone,
            ...(p.loyalty?.airline && p.loyalty?.number
              ? { loyalty_programme_accounts: [{ airline_iata_code: String(p.loyalty.airline).toUpperCase(), account_number: String(p.loyalty.number) }] }
              : {}),
          });
        }

        const payWith = body.pay_with === "points" ? "points" : "card";
        const fee = serviceFee();
        const fare = offer.total_amount;
        const { data: booking, error } = await db
          .from("bookings")
          .insert({
            user_id: user.id,
            provider: offer.live ? "duffel" : "demo",
            offer_id: offer.id,
            offer,
            passengers,
            pay_with: payWith,
            points_program: payWith === "points" ? String(body.points_program ?? offer.owner.code) : null,
            points_amount: payWith === "points" ? Math.max(0, Math.round(Number(body.points_amount) || 0)) || null : null,
            fare_amount: fare,
            service_fee: fee,
            total_amount: Number((fare + fee).toFixed(2)),
            currency: offer.currency,
          })
          .select()
          .single();
        if (error) return fail(error.message, 500);

        if (payWith === "points") {
          if (!offer.live) return json({ booking: await finalize(db, booking.id) });
          const done = await redeem(db, booking);
          if (done) return json({ booking: await finalize(db, booking.id) });
          const url = awardPage(booking.points_program);
          if (!url) {
            await db.from("bookings").update({ status: "cancelled", failure_reason: "no award page for program" }).eq("id", booking.id);
            return fail("We can't hand this program off yet. Pay by card or pick another way to use points.");
          }
          const { data: handed } = await db.from("bookings").update({ status: "handoff" }).eq("id", booking.id).eq("user_id", user.id).select().single();
          return json({ booking: handed, handoff_url: url });
        }

        // demo fares complete without a card so the flow can be tried end to end
        if (!offer.live) return json({ booking: await finalize(db, booking.id) });
        if (!stripeKey()) {
          await db.from("bookings").update({ status: "cancelled", failure_reason: "card payments not set up" }).eq("id", booking.id);
          return fail("Card payments aren't switched on yet, so this fare can't be bought here. Nothing was charged.", 503);
        }

        const app = appUrl(req);
        const s = offer.slices;
        const title = `${s[0].origin} to ${s[0].destination}${s.length > 1 ? " round trip" : ""} · ${offer.owner.name}`;
        const session = await stripe("/checkout/sessions", {
          mode: "payment",
          "line_items[0][quantity]": "1",
          "line_items[0][price_data][currency]": offer.currency.toLowerCase(),
          "line_items[0][price_data][unit_amount]": String(Math.round(booking.total_amount * 100)),
          "line_items[0][price_data][product_data][name]": title,
          "line_items[0][price_data][product_data][description]": `${passengers.length} traveler${passengers.length > 1 ? "s" : ""}, ${offer.fare_brand ?? offer.cabin}. Includes taxes${fee ? " and a $" + fee + " booking fee" : ""}.`,
          customer_email: user.email ?? passengers[0].email,
          "metadata[booking_id]": booking.id,
          "payment_intent_data[metadata][booking_id]": booking.id,
          // Duffel offers hold their price for a short time; don't let a payment outlive it
          // Stripe's minimum is 30 minutes after it creates the session, so leave a margin
          expires_at: String(Math.floor(Date.now() / 1000) + 35 * 60),
          success_url: `${app}/#/booking/${booking.id}?paid=1`,
          cancel_url: `${app}/#/checkout/${encodeURIComponent(offer.id)}?cancelled=1`,
        });
        await db.from("bookings").update({ stripe_session_id: session.id }).eq("id", booking.id);
        return json({ booking, pay_url: session.url });
      }

      case "confirm": {
        const user = await callerOf(req, db);
        if (!user) return fail("Sign in first.", 401);
        const { data: b } = await db.from("bookings").select("*").eq("id", body.booking_id).eq("user_id", user.id).maybeSingle();
        if (!b) return fail("Booking not found.", 404);
        if (b.status !== "pending_payment" || !b.stripe_session_id || !stripeKey()) return json({ booking: b, handoff_url: b.status === "handoff" ? awardPage(b.points_program) : undefined });
        const session = await stripe(`/checkout/sessions/${b.stripe_session_id}`);
        if (session.payment_status !== "paid") return json({ booking: b, waiting: true });
        return json({ booking: await finalize(db, b.id, session.payment_intent) });
      }

      default:
        return fail("Unknown action.");
    }
  } catch (e) {
    console.error(e);
    const status = (e as any).status;
    if (status === 422 || status === 400) return fail((e as Error).message, 400);
    return fail("Booking didn't answer. Try again in a minute; you haven't been charged.", 502);
  }
});
