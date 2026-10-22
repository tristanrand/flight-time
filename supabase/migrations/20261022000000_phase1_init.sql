-- Flight Time — Phase 1 schema
-- Tracking (FlightAware AeroAPI), fare search (Travelpayouts affiliate), miles (AwardWallet / manual).
-- Every user-owned table has row-level security: a signed-in user can only see and change their own rows.
-- Cache tables have RLS on with no policies, so only edge functions (service role) can touch them.

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  home_airport text check (home_airport is null or home_airport ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles: read own" on public.profiles for select using ((select auth.uid()) = id);
create policy "profiles: insert own" on public.profiles for insert with check ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles for update using ((select auth.uid()) = id);

-- create a profile row whenever someone signs up
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- tracked flights ("My trips") ----------
create table public.tracked_flights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ident text not null,                -- e.g. AAL1234 or AA1234
  fa_flight_id text,                  -- FlightAware's unique id for this specific departure
  origin text,
  destination text,
  scheduled_out timestamptz,
  estimated_out timestamptz,
  scheduled_in timestamptz,
  estimated_in timestamptz,
  status text,                        -- FlightAware status text, e.g. "Scheduled", "En Route / On Time"
  delay_minutes int,
  cancelled boolean not null default false,
  aeroapi_alert_id bigint,            -- set once a FlightAware push alert is registered
  last_event text,                    -- last alert event received (departure, arrival, cancelled, diverted...)
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, fa_flight_id)
);
create index tracked_flights_user_idx on public.tracked_flights (user_id, scheduled_out);
create index tracked_flights_fa_idx on public.tracked_flights (fa_flight_id);
alter table public.tracked_flights enable row level security;
create policy "tracked: read own" on public.tracked_flights for select using ((select auth.uid()) = user_id);
create policy "tracked: insert own" on public.tracked_flights for insert with check ((select auth.uid()) = user_id);
create policy "tracked: update own" on public.tracked_flights for update using ((select auth.uid()) = user_id);
create policy "tracked: delete own" on public.tracked_flights for delete using ((select auth.uid()) = user_id);
-- the app listens for changes so a delay pushed by FlightAware shows up instantly
alter publication supabase_realtime add table public.tracked_flights;

-- ---------- price watches (fare alerts) ----------
create table public.price_watches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  origin text not null check (origin ~ '^[A-Z]{3}$'),
  destination text not null check (destination ~ '^[A-Z]{3}$'),
  depart_month text not null check (depart_month ~ '^\d{4}-\d{2}$'),  -- YYYY-MM
  target_price numeric(10,2),
  last_price numeric(10,2),
  last_checked_at timestamptz,
  created_at timestamptz not null default now()
);
create index price_watches_user_idx on public.price_watches (user_id);
alter table public.price_watches enable row level security;
create policy "watches: read own" on public.price_watches for select using ((select auth.uid()) = user_id);
create policy "watches: insert own" on public.price_watches for insert with check ((select auth.uid()) = user_id);
create policy "watches: update own" on public.price_watches for update using ((select auth.uid()) = user_id);
create policy "watches: delete own" on public.price_watches for delete using ((select auth.uid()) = user_id);

-- ---------- loyalty accounts ("Miles") ----------
-- Phase 1 stores frequent-flyer numbers (to paste in at checkout) and balances,
-- entered by hand or synced from AwardWallet once that is connected.
create table public.loyalty_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  program text not null,              -- e.g. "American AAdvantage"
  airline_code text,                  -- e.g. AA
  member_number text,
  balance bigint,
  elite_tier text,
  expires_on date,
  source text not null default 'manual' check (source in ('manual', 'awardwallet')),
  synced_at timestamptz,
  created_at timestamptz not null default now()
);
create index loyalty_accounts_user_idx on public.loyalty_accounts (user_id);
alter table public.loyalty_accounts enable row level security;
create policy "loyalty: read own" on public.loyalty_accounts for select using ((select auth.uid()) = user_id);
create policy "loyalty: insert own" on public.loyalty_accounts for insert with check ((select auth.uid()) = user_id);
create policy "loyalty: update own" on public.loyalty_accounts for update using ((select auth.uid()) = user_id);
create policy "loyalty: delete own" on public.loyalty_accounts for delete using ((select auth.uid()) = user_id);

-- ---------- API response cache (edge functions only) ----------
-- AeroAPI and Travelpayouts charge or rate-limit per call. Every user who looks at
-- the same flight within the cache window shares one paid lookup.
create table public.api_cache (
  key text primary key,               -- e.g. "aeroapi:flights:AAL1234"
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);
alter table public.api_cache enable row level security;
-- no policies on purpose: only the service role (edge functions) can read or write

-- ---------- API usage log (edge functions only) ----------
-- One row per paid upstream call, so cost can be watched from day one.
create table public.api_usage (
  id bigint generated always as identity primary key,
  provider text not null,             -- aeroapi | travelpayouts | awardwallet
  endpoint text not null,
  result_sets int not null default 1,
  created_at timestamptz not null default now()
);
create index api_usage_day_idx on public.api_usage (provider, created_at);
alter table public.api_usage enable row level security;
