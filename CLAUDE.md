# Flight Time — notes for Claude Code

Flight Time is a consumer travel app: **track any flight live, find the cheapest fares, keep every airline's miles in one place.** Owner: Tristan Rand.

## Where things live

| Piece | What | Where |
|---|---|---|
| Web app | Vite + React 19 (plain JSX, hash routes in `src/router.js`) | `web/` |
| Database + auth | Supabase project `flight-time`, ref `ddqxquuzxeknwhvzaked` (ca-central-1) | `supabase/migrations/` |
| Server code | Supabase Edge Functions (Deno) — **all API keys live here, never in `web/`** | `supabase/functions/` |
| Hosting | Vercel project `flight-time` (team `rand-projects`), **Root Directory = `web`**, live at https://flight-time-alpha.vercel.app | `web/vercel.json` |

Same layout as Randline: root folder holds `web/`, `supabase/`, `docs/`.

## Phase plan (see docs/phase-1-plan.md)

- **Phase 1 (now):** FlightAware AeroAPI tracking + Travelpayouts/Aviasales affiliate fare search + manual miles (AwardWallet later). Goal: cheap to run, prove people want it.
- **Pulled forward at Tristan's request (Oct 2026):** in-app booking through Duffel + Stripe Checkout, points pricing on every fare, live radar. Built and running in demo mode; real keys per `docs/setup-booking-and-points.md`.
- **Phase 2:** Duffel rebooking during delays, Kiwi.com Tequila for multi-airline combos, premium subscription.
- **Phase 3:** own ARC accreditation, direct NDC with American / Southwest.

Do not build Phase 2/3 features unless asked.

## Edge functions

All functions deploy with `verify_jwt = false` (see `supabase/config.toml`): the new `sb_publishable_` keys are not JWTs, so each function checks auth itself with `callerOf()` and scopes every write with `.eq("user_id", user.id)`.

| Function | Who can call | Purpose |
|---|---|---|
| `flight-status` | anyone (`track`/`untrack` need sign-in) | `lookup` (flight or tail number), `flight` (one departure), `position`, `aircraft`, `airport` (board + weather + delays), `route` (today's nonstops), `radar` (adsb.lol, free), `track` / `untrack` |
| `flight-alert-webhook` | FlightAware only (`?key=` secret) | FlightAware pushes status changes here; updates `tracked_flights` and writes `notifications` |
| `fare-search` | anyone | Travelpayouts: default month list (+ deal `stats` from `price_history`), `calendar`, `explore`; `awards` via Seats.aero |
| `booking` | `search`/`offer` anyone; `checkout`/`confirm` signed-in | Duffel offers, server-side re-pricing, Stripe Checkout, points hand-off |
| `stripe-webhook` | Stripe only (signature) | Payment done → `finalize()` tickets the Duffel order |
| `price-watch-check` | cron only (`x-cron-key`) | Daily re-price of `price_watches`, writes price-drop `notifications` |
| `loyalty-sync` | signed-in | Placeholder for AwardWallet Account Access API |

Per-IP rate limits are in (`limited()` in `util.ts`, backed by the `rate_hit` SQL function). Tune the per-minute numbers before public launch.

Shared code in `supabase/functions/_shared/`: `util.ts` (cache, clients, limits, notify), `aeroapi.ts`, `booking.ts` (Duffel, Stripe, finalize), `geo.ts` (server airport table, great-circle math), `demo.ts` (generated sample data; demo flight ids encode the whole flight).

**Deploying:** the Supabase CLI isn't installed here. Deploy with the Supabase MCP `deploy_edge_function`, uploading every imported `_shared` file with names relative to `supabase/functions/` (e.g. `booking/index.ts`, `_shared/util.ts`) and `entrypoint_path` `<name>/index.ts`.

**Money rules:** prices shown in the browser are never trusted; `booking.checkout` re-fetches the offer. Never create a live Duffel order without a paid Stripe session. Points can't be spent in-app (no airline allows it); points checkout is a hand-off until a partner plugs into `redeem()`.

**Demo mode:** when a provider key is missing, functions return sample data with `demo: true` and the UI shows a note. Keep this working — it lets the app run before every sign-up is done.

### Secrets (set in Supabase → Edge Functions → Secrets)

- `AEROAPI_KEY` — FlightAware AeroAPI key (**Standard tier** for launch; Personal tier is non-commercial only)
- `AEROAPI_WEBHOOK_SECRET` — random string; part of the webhook URL
- `AEROAPI_ALERT_URL` — `https://<ref>.supabase.co/functions/v1/flight-alert-webhook?key=<AEROAPI_WEBHOOK_SECRET>`
- `TRAVELPAYOUTS_TOKEN`, `TRAVELPAYOUTS_MARKER` — from the Travelpayouts dashboard
- `DUFFEL_ACCESS_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BOOKING_SERVICE_FEE`, `APP_URL` — booking (see `docs/setup-booking-and-points.md`)
- `SEATSAERO_API_KEY` — real award prices; `CRON_SECRET` — daily price-watch job
- `AWARDWALLET_API_KEY` — later

## Cost rules (important)

- AeroAPI bills **per result set** (15 records). Always `max_pages=1`. Every upstream call goes through `cached()` in `_shared/util.ts` and is logged in `api_usage`.
- Cache windows: flight list 120s, position 60s, airport boards 120s, weather 15 min, delays 5 min, routes 5 min, airports 30 days, aircraft types 90 days, fares 30 min, explore 60 min, radar 20s (free feed). Don't shorten without a reason.
- An airport page costs up to 4 AeroAPI calls on a cold cache (info, board, weather, delays); the flight page adds `aircraft` and, before departure, one `flight` call for the inbound plane.
- Live position refreshes only while a flight is airborne and the page is open (60s).
- Prefer FlightAware **alerts** (push) over polling for saved trips.
- Check spend: `select provider, endpoint, count(*), sum(result_sets) from api_usage where created_at > now() - interval '1 day' group by 1,2;`

## Database

Tables: `profiles`, `tracked_flights`, `price_watches`, `loyalty_accounts`, `travelers` (all RLS: own rows only), `bookings` and `notifications` (read own; written by functions), `api_cache`, `api_usage`, `price_history`, `rate_hits` (RLS on, no policies → service role only). `tracked_flights`, `bookings` and `notifications` are in the realtime publication. `loyalty_accounts.airline_code` holds program codes from `web/src/data/programs.js` (airline `AA`… and bank `UR`, `MR`, `TY`, `C1`, `BILT`, `WF`).

New schema changes go in a new file in `supabase/migrations/` — never edit the applied init migration.

## Design

Aeronautical-chart palette (chart paper `#E9EFF1`, ink `#13283B`, airway magenta `#A8266F`) with a split-flap departure board (`components/Board.jsx`) as the one loud element. Type: Barlow Condensed (display, board) + Public Sans (body) + IBM Plex Mono (METARs, codes). Copy is plain, sentence case, from the traveler's point of view. Tokens are at the top of `web/src/styles.css`.

Screens (`web/src/pages/`): `Home` (track hub), `Flight`, `Airport`, `Route`, `Radar`, `Fly` (fares: flexible month, exact dates, explore), `Checkout`, `Booking`, `Trips`, `Wallet`, `Account`. Points math lives in `web/src/points.js`; program values and transfer partners in `web/src/data/programs.js` (review them now and then; they drift).

## Deploys

Repo: https://github.com/tristanrand/flight-time. Vercel is connected to it: every push to `main` deploys production (https://flight-time-alpha.vercel.app). Edge functions do NOT auto-deploy; deploy them with the Supabase CLI.

## Commands

```bash
cd web && npm install && npm run dev        # local app (needs web/.env.local, see .env.example)
supabase functions deploy flight-status      # deploy one function
supabase functions deploy                    # deploy all (config.toml sets verify_jwt)
supabase db push                             # apply new migrations
```

## Not yet set up

- **Supabase Auth URLs:** Site URL and Redirect URLs must include https://flight-time-alpha.vercel.app (and http://localhost:5173 for dev), or sign-in links bounce to the wrong place.
- **Map tiles** use openstreetmap.org directly. Fine for testing; switch to a paid tile plan before launch.
