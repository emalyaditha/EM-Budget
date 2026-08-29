-- =========================================================================
-- Fix RLS for auth_accounts (C4)
-- Ensures auth_accounts is not publicly readable; only owner or system
-- can select/update, and only system can insert. Enables FORCE RLS.
-- =========================================================================

ALTER TABLE public.auth_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_accounts FORCE ROW LEVEL SECURITY;

-- Drop legacy/permissive policies if they exist
drop policy if exists "Allow all on auth_accounts" on public.auth_accounts;
drop policy if exists "Secure insert on auth_accounts" on public.auth_accounts;
drop policy if exists "Secure select on auth_accounts" on public.auth_accounts;
drop policy if exists "Secure update on auth_accounts" on public.auth_accounts;
drop policy if exists "Secure delete on auth_accounts" on public.auth_accounts;

-- No public select: only owner (via verify_user_token) or system (via verify_system_signature) can select
create policy "Secure select on auth_accounts" on public.auth_accounts for select
using (
  email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json)
  or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json)
);

-- Only system insert: no user token allowed for insert
create policy "Secure insert on auth_accounts" on public.auth_accounts for insert
with check (
  public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json)
);

-- Owner select/update: owner or system can update, with WITH CHECK enforcing same ownership on new row
create policy "Secure update on auth_accounts" on public.auth_accounts for update
using (
  email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json)
  or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json)
)
with check (
  email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json)
  or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json)
);
