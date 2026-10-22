# Flight Time — notes for Claude Code

Flight Time is a consumer travel app: **track any flight live, find the cheapest fares, keep every airline's miles in one place.** Owner: Tristan Rand.

## Where things live

| Piece | What | Where |
|---|---|---|
| Web app | Vite + React 19 (plain JSX, no router, hash tabs) | `web/` |
| Database + auth | Supabase project `flight-time`, ref `ddqxquuzxeknwhvzaked` (ca-central-1) | `supabase/migrations/` |
| Server code | Supabase Edge Functions (Deno) — **all API keys live here, never in `web/`** | `supabase/functions/` |
| Hosting | Vercel project `flight-time` (team `rand-projects`), **Root Directory = `web`**, live at https://flight-time-alpha.vercel.app | `web/vercel.json` |

Same layout as Randline: root folder holds `web/`, `supabase/`, `docs/`.

## Phase plan (see docs/phase-1-plan.md)

- **Phase 1 (now):** FlightAware AeroAPI tracking + Travelpayouts/Aviasales affiliate fare search + manual miles (AwardWallet later). Goal: cheap to run, prove people want it.
- **Phase 2:** Duffel for in-app booking (start with rebooking during delays), Kiwi.com Tequila for multi-airline combos, premium subscription.
- **Phase 3:** own ARC accreditation, direct NDC with American / Southwest.

Do not build Phase 2/3 features unless asked.

## Edge functions

All functions deploy with `verify_jwt = false` (see `supabase/config.toml`): the new `sb_publishable_` keys are not JWTs, so each function checks auth itself with `callerOf()` and scopes every write with `.eq("user_id", user.id)`.

| Function | Who can call | Purpose |
|---|---|---|
| `flight-status` | anyone (`track`/`untrack` need sign-in) | `lookup` (by flight number), `position` (live position + track + route), `track` / `untrack` (My trips + FlightAware alert) |
| `flight-alert-webhook` | FlightAware only (`?key=` secret) | FlightAware pushes status changes here; updates `tracked_flights` |
| `fare-search` | anyone | Travelpayouts Data API `prices_for_dates`, returns affiliate `book_url` |
| `loyalty-sync` | signed-in | Placeholder for AwardWallet Account Access API |

**Before public launch:** add per-IP / per-user rate limits to `flight-status` and `fare-search`. Anonymous lookups spend AeroAPI money; the cache softens this but does not stop abuse.

Shared code in `supabase/functions/_shared/` (`util.ts` cache + clients, `aeroapi.ts`, `demo.ts`).

**Demo mode:** when a provider key is missing, functions return sample data with `demo: true` and the UI shows a note. Keep this working — it lets the app run before every sign-up is done.

### Secrets (set in Supabase → Edge Functions → Secrets)

- `AEROAPI_KEY` — FlightAware AeroAPI key (**Standard tier** for launch; Personal tier is non-commercial only)
- `AEROAPI_WEBHOOK_SECRET` — random string; part of the webhook URL
- `AEROAPI_ALERT_URL` — `https://<ref>.supabase.co/functions/v1/flight-alert-webhook?key=<AEROAPI_WEBHOOK_SECRET>`
- `TRAVELPAYOUTS_TOKEN`, `TRAVELPAYOUTS_MARKER` — from the Travelpayouts dashboard
- `AWARDWALLET_API_KEY` — later

## Cost rules (important)

- AeroAPI bills **per result set** (15 records). Always `max_pages=1`. Every upstream call goes through `cached()` in `_shared/util.ts` and is logged in `api_usage`.
- Cache windows: flight list 120s, position 60s, airports 30 days, fares 30 min. Don't shorten without a reason.
- Live position refreshes only while a flight is airborne and the page is open (60s).
- Prefer FlightAware **alerts** (push) over polling for saved trips.
- Check spend: `select provider, endpoint, count(*), sum(result_sets) from api_usage where created_at > now() - interval '1 day' group by 1,2;`

## Database

Tables: `profiles`, `tracked_flights`, `price_watches`, `loyalty_accounts` (all RLS: own rows only), `api_cache` and `api_usage` (RLS on, no policies → service role only). `tracked_flights` is in the realtime publication.

New schema changes go in a new file in `supabase/migrations/` — never edit the applied init migration.

## Design

Aeronautical-chart palette (chart paper `#E9EFF1`, ink `#13283B`, airway magenta `#A8266F`) with a split-flap departure board (`components/Board.jsx`) as the one loud element. Type: Barlow Condensed (display, board) + Public Sans (body). Copy is plain, sentence case, from the traveler's point of view. Tokens are at the top of `web/src/styles.css`.

## Commands

```bash
cd web && npm install && npm run dev        # local app (needs web/.env.local, see .env.example)
supabase functions deploy flight-status      # deploy one function
supabase functions deploy                    # deploy all (config.toml sets verify_jwt)
supabase db push                             # apply new migrations
```

## Not yet set up

- **No GitHub repo yet.** The first deploys were uploaded straight to Vercel. Next step: create `tristanrand/flight-time`, push, and connect it in Vercel (Settings → Git) so pushes to `main` deploy like Randline.
- **Supabase Auth URLs:** Site URL and Redirect URLs must include https://flight-time-alpha.vercel.app (and http://localhost:5173 for dev), or sign-in links bounce to the wrong place.
- **Map tiles** use openstreetmap.org directly. Fine for testing; switch to a paid tile plan before launch.
