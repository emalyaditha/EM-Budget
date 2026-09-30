-- =========================================================================
-- EM Budget: system-token expiry in verify_system_signature (2026-09-30)
--
-- generateSystemToken() previously signed a payload of only
-- {system, timestamp}, and verify_system_signature never looked at
-- timestamp. A valid x-system-token header was therefore unforgeable but
-- immortal: anyone who captured one once (log, proxy, error dump) could
-- replay it forever and satisfy every RLS policy that trusts the backend.
--
-- The server now mints tokens carrying expiresAt (now + 5 min). This
-- replaces the function with one that decodes the base64url payload and
-- rejects tokens whose expiry has passed, so a captured header has a
-- bounded replay window instead of an unlimited one.
--
-- DEPLOY ORDER: ship the server change BEFORE applying this migration.
-- Legacy tokens without expiresAt are rejected here, so migrating first
-- would deny server-side writes until the new build is live.
--
-- The constant-time digest comparison and secret resolution from
-- 20260906000000 are preserved unchanged.
-- =========================================================================

create or replace function public.verify_system_signature(headers json) returns boolean as $$
declare
  token text;
  parts text[];
  payload_str text;
  signature text;
  expected_signature text;
  secret text;
  b64 text;
  payload_json jsonb;
  expires_at bigint;
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
  if encode(extensions.hmac(signature, secret, 'sha256'), 'hex')
     != encode(extensions.hmac(expected_signature, secret, 'sha256'), 'hex') then
    return false;
  end if;

  -- Signature is valid; now bound its lifetime. base64url -> base64 with
  -- padding restored, since Node emits the payload unpadded.
  b64 := translate(payload_str, '-_', '+/');
  b64 := rpad(b64, (length(b64) + 3) / 4 * 4, '=');
  payload_json := convert_from(decode(b64, 'base64'), 'UTF8')::jsonb;

  if payload_json->>'system' is distinct from 'express-server' then
    return false;
  end if;

  expires_at := (payload_json->>'expiresAt')::bigint;
  if expires_at is null or expires_at < (extract(epoch from clock_timestamp()) * 1000)::bigint then
    return false;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$ language plpgsql security definer;
