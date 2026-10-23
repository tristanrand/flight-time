# Turning on booking, payments and points

Everything below works in **demo mode** first: with no keys set, fares are generated, checkout completes instantly with a pretend confirmation code, and nothing is charged. Add keys one at a time; each one switches its piece to real data on the next request (no redeploy).

All secrets go in **Supabase → Edge Functions → Secrets**.

## How a booking flows

```
Fly (exact dates) ──booking.search──▶ Duffel offer request ──▶ offers
Select ──▶ #/checkout/<offer> ──booking.offer──▶ re-priced on the server (browser prices are never trusted)
Pay with card ──booking.checkout──▶ bookings row (pending_payment) ──▶ Stripe Checkout page
Stripe paid ──stripe-webhook / booking.confirm──▶ finalize(): Duffel order paid from our Duffel balance
           ──▶ bookings.status = ticketed, PNR saved, flights added to My trips, alert in the feed
Duffel fails ──▶ status = failed, Stripe payment refunded automatically
Pay with points ──booking.checkout──▶ status = handoff, traveler sent to the program's award page
```

If Duffel refuses an order outright (sold out, price changed), the Stripe payment is refunded automatically and `bookings.refund_status` records the result. If Duffel times out or errors on its side, the order *may* exist, so we don't refund blindly: the booking stays `paid` with `failure_reason` starting `ticketing unconfirmed`. Check for those once a day:

```sql
select id, created_at, failure_reason, total_amount from bookings
where status = 'paid' and created_at < now() - interval '15 minutes';
```

Look each one up in the Duffel dashboard (orders carry `metadata.booking_id`). If the order exists, copy its booking reference into the row and set `status = 'ticketed'`; if not, refund in Stripe and set `status = 'failed'`.

We are the merchant: the traveler pays us by card through Stripe, and we pay Duffel from our prepaid Duffel balance. Card numbers never touch our app or servers.

## 1. Duffel (sells and tickets the seats)

1. Sign up at https://app.duffel.com and create an organisation.
2. Developers → Access tokens → create a **test** token (`duffel_test_…`). Test mode books "Duffel Airways" and real-looking itineraries without issuing tickets.
3. Add secret `DUFFEL_ACCESS_TOKEN`.
4. Before going live: complete Duffel's verification, top up the **balance** (orders are paid from it), then swap in the live token.

## 2. Stripe (collects the traveler's card)

1. Sign up at https://dashboard.stripe.com. Stay in **test mode** until launch.
2. Developers → API keys → copy the secret key → secret `STRIPE_SECRET_KEY`.
3. Developers → Webhooks → Add endpoint
   `https://ddqxquuzxeknwhvzaked.supabase.co/functions/v1/stripe-webhook`
   with event `checkout.session.completed`. Copy its signing secret → `STRIPE_WEBHOOK_SECRET`.
4. Optional: `BOOKING_SERVICE_FEE` (dollars added per booking, default 0) and `APP_URL` (defaults to https://flight-time-alpha.vercel.app).

Test card: `4242 4242 4242 4242`, any future date, any CVC.

## 3. Real award prices (Seats.aero)

Without this, points prices are **estimates** from the cash fare using each program's typical value (see `web/src/data/programs.js`). With it, the Fly page shows real award seats for the month and uses them in place of the estimate.

1. Apply for the Seats.aero **partner API** (commercial use) at https://seats.aero.
2. Add secret `SEATSAERO_API_KEY`.

## 4. Paying with points

No airline lets an outside app spend a member's miles today, so a points checkout is a **hand-off**: we price the award, save the booking with `status = handoff`, and send the traveler to that program's own award search. The hook for a real redemption partner is `redeem()` in `supabase/functions/_shared/booking.ts`; when one is connected, return its reference there and the booking finishes like a card booking.

## 5. Daily price-watch check

1. Add secret `CRON_SECRET` (any long random string).
2. In Supabase → Database → Extensions, enable `pg_cron` and `pg_net`.
3. Run once in the SQL editor (replace the secret):

```sql
select cron.schedule(
  'price-watch-check',
  '0 13 * * *',  -- 8am Central
  $$ select net.http_post(
       url := 'https://ddqxquuzxeknwhvzaked.supabase.co/functions/v1/price-watch-check',
       headers := jsonb_build_object('x-cron-key', '<CRON_SECRET>', 'Content-Type', 'application/json'),
       body := '{}'::jsonb) $$
);
```

## Secrets at a glance

| Secret | Turns on |
|---|---|
| `AEROAPI_KEY` | live tracking, boards, weather, delays (already set) |
| `AEROAPI_WEBHOOK_SECRET`, `AEROAPI_ALERT_URL` | push alerts for saved trips |
| `TRAVELPAYOUTS_TOKEN`, `TRAVELPAYOUTS_MARKER` | cheapest-fare search, calendar, explore (already set) |
| `DUFFEL_ACCESS_TOKEN` | bookable fares on exact dates |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | card payments |
| `BOOKING_SERVICE_FEE`, `APP_URL` | optional booking settings |
| `SEATSAERO_API_KEY` | real award seat prices |
| `CRON_SECRET` | daily price-drop alerts |
| `AWARDWALLET_API_KEY` | automatic balance sync (later) |

The live radar uses adsb.lol's free feed (ODbL). It needs no key; keep the credit on the map.
