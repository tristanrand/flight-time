-- Flight Time — in-app booking, points pricing, alerts feed, rate limits
-- Adds: travelers (saved passengers), bookings (Duffel orders paid by card or points),
-- notifications (in-app alerts feed), price_history (deal ratings), rate_hits (abuse limits).

-- ---------- profiles: a few preferences the app fills in for you ----------
alter table public.profiles
  add column if not exists preferred_cabin text not null default 'economy'
    check (preferred_cabin in ('economy', 'premium_economy', 'business', 'first')),
  add column if not exists pinned_airports text[] not null default '{}';

-- ---------- tracked flights: keep the full last-known flight so Trips can render offline ----------
alter table public.tracked_flights
  add column if not exists snapshot jsonb,
  add column if not exists aircraft_type text,
  add column if not exists registration text,
  add column if not exists gate_origin text,
  add column if not exists gate_destination text,
  add column if not exists actual_out timestamptz,
  add column if not exists actual_in timestamptz,
  add column if not exists booking_id uuid;

-- ---------- price watches: remember what we last told the traveler ----------
alter table public.price_watches
  add column if not exists last_notified_price numeric(10,2),
  add column if not exists lowest_seen numeric(10,2);

-- ---------- travelers (saved passengers, for one-tap checkout) ----------
create table public.travelers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  given_name text not null,
  family_name text not null,
  born_on date not null,
  gender text not null check (gender in ('m', 'f')),
  title text check (title in ('mr', 'ms', 'mrs', 'miss', 'dr')),
  email text,
  phone text,                         -- E.164, e.g. +14055551234
  is_self boolean not null default false,
  created_at timestamptz not null default now()
);
create index travelers_user_idx on public.travelers (user_id);
alter table public.travelers enable row level security;
create policy "travelers: read own" on public.travelers for select using ((select auth.uid()) = user_id);
create policy "travelers: insert own" on public.travelers for insert with check ((select auth.uid()) = user_id);
create policy "travelers: update own" on public.travelers for update using ((select auth.uid()) = user_id);
create policy "travelers: delete own" on public.travelers for delete using ((select auth.uid()) = user_id);

-- ---------- bookings ----------
-- Written only by the `booking` edge function (service role), so prices are always the
-- server's, never the browser's. Travelers can read their own.
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'paid', 'ticketed', 'failed', 'cancelled', 'handoff')),
  provider text not null default 'duffel' check (provider in ('duffel', 'demo')),
  offer_id text not null,
  offer jsonb not null,               -- snapshot of the offer as priced at checkout
  passengers jsonb not null,
  pay_with text not null default 'card' check (pay_with in ('card', 'points')),
  points_program text,
  points_amount bigint,
  fare_amount numeric(10,2) not null,
  service_fee numeric(10,2) not null default 0,
  total_amount numeric(10,2) not null,
  currency text not null default 'USD',
  stripe_session_id text unique,
  duffel_order_id text,
  booking_reference text,             -- the airline confirmation code (PNR)
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bookings_user_idx on public.bookings (user_id, created_at desc);
alter table public.bookings enable row level security;
create policy "bookings: read own" on public.bookings for select using ((select auth.uid()) = user_id);
alter publication supabase_realtime add table public.bookings;

alter table public.tracked_flights
  add constraint tracked_flights_booking_fk foreign key (booking_id) references public.bookings (id) on delete set null;

-- ---------- notifications (the alerts feed in Trips) ----------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('flight', 'price', 'booking', 'miles')),
  title text not null,
  body text,
  link text,                          -- in-app hash route, e.g. #/flight/AA100
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
create policy "notifications: read own" on public.notifications for select using ((select auth.uid()) = user_id);
create policy "notifications: update own" on public.notifications for update using ((select auth.uid()) = user_id);
create policy "notifications: delete own" on public.notifications for delete using ((select auth.uid()) = user_id);
alter publication supabase_realtime add table public.notifications;

-- ---------- price history (edge functions only) ----------
-- One row per route + month + day we saw: lets us say "low for this route" honestly.
create table public.price_history (
  origin text not null,
  destination text not null,
  depart_month text not null,
  seen_on date not null default current_date,
  min_price numeric(10,2) not null,
  median_price numeric(10,2),
  primary key (origin, destination, depart_month, seen_on)
);
alter table public.price_history enable row level security;

-- ---------- rate limits (edge functions only) ----------
create table public.rate_hits (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);
alter table public.rate_hits enable row level security;

-- true while `key` is under `max_hits` in the current `window_seconds` window
create function public.rate_hit(p_key text, p_window_seconds int, p_max_hits int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n int;
begin
  insert into public.rate_hits as r (key, window_start, hits) values (p_key, w, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into n;
  -- tidy old windows now and then
  if random() < 0.01 then
    delete from public.rate_hits where window_start < now() - interval '1 hour';
  end if;
  return n <= p_max_hits;
end $$;
revoke all on function public.rate_hit(text, int, int) from public, anon, authenticated;
