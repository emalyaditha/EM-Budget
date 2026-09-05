-- =========================================================================
-- EM Budget: Create vault table + seed session_secret
-- The vault table stores secrets used by HMAC verification
-- (verify_user_token / verify_system_signature read the session_secret here).
-- Prior migrations (20260904_vault_*) referenced public.vault but none created
-- it — this migration makes the table explicit and repeatable.
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

-- Seed the session_secret (idempotent — will not clobber an existing value)
insert into public.vault (key, value)
values ('session_secret', 'a492f8b1c7dc4a82b95c06feee482810')
on conflict (key) do nothing;

-- Verify reads resolve
do $$
declare s text;
begin
  select v.value into s from public.vault v where v.key = 'session_secret';
  if s is null then
    raise exception 'session_secret not seeded in vault';
  end if;
end $$;
