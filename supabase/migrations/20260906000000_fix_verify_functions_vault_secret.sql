-- =========================================================================
-- EM Budget: Fix verify_user_token / verify_system_signature secret source
-- The RLS policies on every financial table call these two SECURITY DEFINER
-- functions to authorize relational reads/writes. They read the shared secret
-- from the 'app.settings.session_secret' GUC, but managed Supabase Postgres
-- blocks setting that GUC via SQL (permission denied), so it is NULL here and
-- every RLS policy evaluated to null -> anon/authenticated relational access
-- was silently fully blocked. The app papered over this by syncing through the
-- D-C2 RPC (which reads public.vault directly) and failing back to the
-- ledger_states JSON blob.
--
-- This migration makes these verifiers source the secret from public.vault
-- first (the value the server now seeds from SESSION_SECRET at boot) with the
-- GUC kept only as an optional fallback, so the RLS policies actually work.
-- The secret is never hardcoded. Both functions are SECURITY DEFINER owned by
-- postgres, so they may read the RLS-denied vault regardless of anon access.
-- =========================================================================

create or replace function public.verify_user_token(headers json) returns text as $$
declare
  token text;
  email text;
  parts text[];
  payload_str text;
  signature text;
  expected_signature text;
  payload json;
  expires_at bigint;
  secret text;
begin
  if headers is null then
    return null;
  end if;

  token := coalesce(headers->>'x-session-token', headers->>'X-Session-Token', headers->>'x-Session-Token');
  email := coalesce(headers->>'x-user-email', headers->>'X-User-Email', headers->>'x-User-Email');
  if token is null or email is null then
    return null;
  end if;

  parts := string_to_array(token, '.');
  if array_length(parts, 1) != 2 then
    return null;
  end if;

  payload_str := parts[1];
  signature := parts[2];

  -- Secret sourced from the vault (seeded by the server from SESSION_SECRET).
  -- The unsettable app.settings.session_secret GUC is retained only as a fallback.
  secret := nullif((select v.value from public.vault v where v.key = 'session_secret'), '');
  if secret is null then
    secret := nullif(current_setting('app.settings.session_secret', true), '');
  end if;
  if secret is null then
    return null;
  end if;

  expected_signature := encode(extensions.hmac(payload_str, secret, 'sha256'), 'hex');
  -- Constant-time comparison: HMAC both candidate strings and compare the fixed-
  -- length outputs so the work performed does not depend on matched prefix length
  -- (a plain '=' on the raw signature would short-circuit byte-by-byte).
  if encode(extensions.hmac(signature, secret, 'sha256'), 'hex') != encode(extensions.hmac(expected_signature, secret, 'sha256'), 'hex') then
    return null;
  end if;

  payload_str := rpad(replace(replace(payload_str, '-', '+'), '_', '/'), (ceil(length(payload_str) / 4.0) * 4)::integer, '=');
  payload := convert_from(decode(payload_str, 'base64'), 'utf-8')::json;

  expires_at := (payload->>'expiresAt')::bigint;
  if expires_at < (date_part('epoch', now()) * 1000)::bigint then
    return null;
  end if;

  if lower(payload->>'email') = lower(email) then
    return lower(email);
  end if;

  return null;
exception
  when others then
    return null;
end;
$$ language plpgsql security definer;

create or replace function public.verify_system_signature(headers json) returns boolean as $$
declare
  token text;
  parts text[];
  payload_str text;
  signature text;
  expected_signature text;
  secret text;
begin
  if headers is null then
    return false;
  end if;

  token := headers->>'x-system-token';
  if token is null then
    return false;
  end if;

  parts := string_to_array(token, '.');
  if array_length(parts, 1) != 2 then
    return false;
  end if;

  payload_str := parts[1];
  signature := parts[2];

  secret := nullif((select v.value from public.vault v where v.key = 'session_secret'), '');
  if secret is null then
    secret := nullif(current_setting('app.settings.session_secret', true), '');
  end if;
  if secret is null then
    return false;
  end if;

  expected_signature := encode(extensions.hmac(payload_str, secret, 'sha256'), 'hex');
  -- Constant-time comparison (see verify_user_token).
  return encode(extensions.hmac(signature, secret, 'sha256'), 'hex') = encode(extensions.hmac(expected_signature, secret, 'sha256'), 'hex');
exception
  when others then
    return false;
end;
$$ language plpgsql security definer;
