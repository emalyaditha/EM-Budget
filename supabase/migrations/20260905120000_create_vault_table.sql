-- =========================================================================
-- EM Budget: Create vault table
-- The vault table stores secrets used by HMAC verification
-- (verify_user_token / verify_system_signature read the session_secret here).
-- Prior migrations (20260904_vault_*) referenced public.vault but none created
-- it — this migration makes the table explicit and repeatable.
-- The session_secret value is NOT committed here; the backend seeds it at
-- startup (idempotent upsert) from the SESSION_SECRET environment variable,
-- keeping the DB secret in sync with the server token without exposure in
-- source control.
-- Access is restricted to service_role only (RLS denied for the rest).
-- =========================================================================

create table if not exists public.vault (
  key   text primary key,
  value text not null
);

-- Restrict read/write to the service role only
revoke all on table public.vault from anon;
revoke all on table public.vault from authenticated;
revoke all on table public.vault from public;

alter table public.vault enable row level security;

-- No policies: deny-all for anon/authenticated. Only the backend
-- (service role, which bypasses RLS) reads/writes this table.
-- The 'session_secret' row is upserted by the server on boot from env.
-- (Legacy note: an earlier version of this migration seeded a literal here.
-- Removed — the value was effectively public and must be rotated.)
