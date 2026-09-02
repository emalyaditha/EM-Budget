-- =========================================================================
-- EM Budget: Sync live Supabase schema with expected backend contract (2026-09-02)
--
-- The init migration (20260725) defines auth_device_tokens with
-- (token, hashed_email, expires_at, created_at) and auth_otps with
-- (email, otp, expires_at, for_deletion), but the LIVE database drifted:
--   * auth_device_tokens is missing hashed_email + expires_at
--     -> device token save/verify fails with PGRST204 (missing column)
--   * auth_otps is missing for_deletion
--     -> delete-account flows that key on (email, for_deletion) may fail
--
-- This migration additively repairs the drift WITHOUT dropping existing data.
-- =========================================================================

-- 1. auth_device_tokens: add missing columns (additive)
alter table public.auth_device_tokens
  add column if not exists hashed_email text,
  add column if not exists expires_at bigint;

-- 2. auth_otps: add missing for_deletion column (additive)
alter table public.auth_otps
  add column if not exists for_deletion boolean not null default false;

-- 3. Ensure a composite primary key that matches the backend's lookup pattern
--    (email, for_deletion). The drop+re-add is safe: if the current PK is the
--    single-column email PK, dropping it frees us to create the composite key.
do $$
declare
  has_composite boolean;
begin
  select exists (
    select 1 from pg_constraint
    where conrelid = 'public.auth_otps'::regclass
      and contype = 'p'
      and array_length(conkey, 1) = 2
  ) into has_composite;

  if not has_composite then
    -- Remove the single-column PK if present so the composite PK can be created
    execute 'alter table public.auth_otps drop constraint if exists auth_otps_pkey';
    execute 'alter table public.auth_otps add primary key (email, for_deletion)';
  end if;
end $$;

-- 4. RLS: make sure the security definer signature policy still covers these
--    (the init migration created them; re-running is a no-op if they exist).
drop policy if exists "Secure system access on auth_otps" on public.auth_otps;
create policy "Secure system access on auth_otps" on public.auth_otps for all
using (public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

drop policy if exists "Secure system access on auth_device_tokens" on public.auth_device_tokens;
create policy "Secure system access on auth_device_tokens" on public.auth_device_tokens for all
using (public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
