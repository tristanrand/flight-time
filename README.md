# Flight Time

Track any flight live, find the cheapest fares, and keep every airline's miles in one place.

- `web/`: the app (Vite + React), hosted on Vercel
- `supabase/`: database migrations and server functions (API keys live here)
- `docs/phase-1-plan.md`: what Phase 1 includes, the sign-ups needed, and what to build next
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
