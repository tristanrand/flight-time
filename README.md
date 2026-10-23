# Flight Time

Track any flight live, find the cheapest fares in cash or points, book them in the app, and keep every airline's miles in one place.

- `web/`: the app (Vite + React), hosted on Vercel
- `supabase/`: database migrations and server functions (API keys live here)
- `docs/phase-1-plan.md`: what Phase 1 includes, the sign-ups needed, and what to build next
- `docs/setup-booking-and-points.md`: turning on Duffel booking, Stripe payments, award prices and price alerts
- `CLAUDE.md`: working notes for Claude Code

## Run it locally

```bash
cd web
cp .env.example .env.local   # fill in the Supabase URL + publishable key
npm install
npm run dev
```

The app works before any provider sign-ups: tracking and fares show sample data, marked as such, until the keys are added.

## Turn on real data

Add these in **Supabase → Edge Functions → Secrets**:

| Secret | Where to get it |
|---|---|
| `AEROAPI_KEY` | FlightAware AeroAPI portal → API keys |
| `AEROAPI_WEBHOOK_SECRET` | any long random string you make up |
| `AEROAPI_ALERT_URL` | `https://<project-ref>.supabase.co/functions/v1/flight-alert-webhook?key=<that secret>` |
| `TRAVELPAYOUTS_TOKEN` | Travelpayouts → Profile → API token |
| `TRAVELPAYOUTS_MARKER` | Travelpayouts → your partner ID (marker) |

No redeploy is needed. Functions read secrets on each request.

Booking, payments, award prices and the daily price-watch job have their own keys: see `docs/setup-booking-and-points.md`.
