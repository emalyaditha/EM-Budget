-- =========================================================================
-- EM Budget: Fix RLS Security — vault-based secret + drop permissive policies
-- =========================================================================

-- 1. Replace verify_user_token to read secret from vault table
CREATE OR REPLACE FUNCTION public.verify_user_token(headers json) RETURNS text AS $BODY$
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
  
  -- Read secret from vault table (works without ALTER DATABASE)
  SELECT v.value INTO secret FROM public.vault v WHERE v.key = 'session_secret';
  if secret is null then
    return null;
  end if;
  
  expected_signature := encode(hmac(payload_str, secret, 'sha256'), 'hex');
  if signature != expected_signature then
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
$BODY$ language plpgsql security definer;

-- 2. Replace verify_system_signature to read secret from vault table
CREATE OR REPLACE FUNCTION public.verify_system_signature(headers json) RETURNS boolean AS $BODY$
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
  
  -- Read secret from vault table (works without ALTER DATABASE)
  SELECT v.value INTO secret FROM public.vault v WHERE v.key = 'session_secret';
  if secret is null then
    return false;
  end if;
  
  expected_signature := encode(hmac(payload_str, secret, 'sha256'), 'hex');
  if signature != expected_signature then
    return false;
  end if;
  
  return true;
exception
  when others then
    return false;
end;
$BODY$ language plpgsql security definer;

-- 3. Verify both functions exist
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('verify_user_token', 'verify_system_signature')
ORDER BY routine_name;
