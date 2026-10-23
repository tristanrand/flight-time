-- What happened to the traveler's money when ticketing failed: "refunded re_…", "refund failed: …",
-- "nothing charged". Read by the alert copy and by whoever reconciles stuck bookings.
alter table public.bookings add column if not exists refund_status text;
