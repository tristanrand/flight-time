# Flight Time — Phase 1 plan

**Goal:** launch for about $100–200/month, prove people want "your trip, tracked and protected", and learn what they'd pay for.

## What Phase 1 ships

| Feature | Provider | Status |
|---|---|---|
| Look up any flight by number, see the board, map, gates, bags | FlightAware AeroAPI | Built (demo data until key added) |
| Save trips; changes pushed instantly | AeroAPI alerts → `flight-alert-webhook` → realtime | Built (needs Standard tier + webhook secret) |
| Cheapest fares by route + month, book on Aviasales | Travelpayouts Data API + affiliate marker | Built (demo data until token added) |
| Price watches | Supabase | Saving built; the daily re-check job is next |
| Miles wallet + "add your member number at checkout" | Manual entry | Built |
| Miles sync from airline accounts | AwardWallet Account Access API | Placeholder; apply for access |
| Sign in by email link | Supabase Auth | Built |

## Sign-ups to do (in this order)

1. **FlightAware AeroAPI.** Start on **Personal** (free $5/mo) while developing, then switch to **Standard** ($100/mo minimum) **before launch**. Personal tier does not allow commercial use. https://www.flightaware.com/aeroapi/signup/personal
2. **Travelpayouts.** Free. Sign up, then join the **Aviasales** program. Copy your **API token** and **marker** from the dashboard. https://www.travelpayouts.com
3. **AwardWallet Business.** Request Account Access API access for an app. https://business.awardwallet.com
4. **Domain name.** Optional for now. Can be bought through Vercel.

## Next build steps (in order)

1. **Push notifications** for trip alerts. Send web push from `flight-alert-webhook`, same approach as Randline's `notify` function (VAPID keys).
2. **Price-watch job.** A daily scheduled function re-checks `price_watches` through `fare-search` and notifies on drops.
3. **"Delayed? Here are your options."** When an alert says delayed or cancelled, show the cheapest same-day alternatives from `fare-search`. This is the hook that leads into Phase 2's in-app rebooking.
4. **AwardWallet connect flow** once access is approved.
5. **Landing page + App Store wrapper** (Capacitor) when the web app feels right.

## Watch these numbers from day one

- AeroAPI result sets per day (`api_usage` table). Stay inside the Standard minimum until users justify more.
- Searches → booking-link clicks → affiliate bookings (Travelpayouts dashboard).
- Saved trips per user. This is the strongest signal that tracking is the hook.

## Not in Phase 1 (deliberately)

FlightAware Premium tier, in-app booking (Duffel), booking with miles, direct airline connections.
