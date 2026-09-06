-- =========================================================================
-- EM Budget: App Lock security layer (2026-09-02)
--
-- ADDITIVE migration — does NOT modify any existing table. Adds three new
-- tables that sit on top of the existing Supabase auth flow:
--   * app_lock_credentials  — hashed PIN + server-side lockout counters
--   * webauthn_credentials  — platform-authenticator public keys (biometric)
--   * trusted_devices       — long-lived "remember this device" tokens
--
-- All endpoints that touch these tables REQUIRE a valid session token
-- (the existing /api/auth/verify-session HMAC token). They never replace
-- primary auth — they only gate access to the UI.
-- =========================================================================

-- 1. APP LOCK CREDENTIALS (PIN)
--    One row per user. pin_hash is bcrypt(12+); PIN is never stored/compared
--    in plaintext anywhere. failed_attempts + locked_until implement a
--    server-side lockout (never trust client timers).
create table if not exists public.app_lock_credentials (
  user_email      text not null primary key references public.auth_accounts(email) on delete cascade,
  pin_hash        text,
  pin_enabled     boolean not null default false,
  failed_attempts integer not null default 0,
  locked_until    bigint,                      -- epoch ms; NULL = not locked
  updated_at      timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. WEBAUTHN (biometric) CREDENTIALS
--    Stores the credential public key from navigator.credentials.create().
--    sign_count is used for replay protection on each unlock.
create table if not exists public.webauthn_credentials (
  id             uuid not null default gen_random_uuid() primary key,
  user_email     text not null references public.auth_accounts(email) on delete cascade,
  credential_id  text not null unique,        -- base64url credential id
  public_key     text not null,               -- base64url COSE public key
  transports     jsonb,
  sign_count     bigint not null default 0,
  device_label   text not null default 'Biometric device',
  created_at     timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists idx_webauthn_credentials_user
  on public.webauthn_credentials (user_email);

-- 3. TRUSTED DEVICES ("Remember this device")
--    Stores a SHA-256 hash of a random 256-bit token (never the raw token).
--    Expires 30 days after issue/sliding last-use; revocable.
create table if not exists public.trusted_devices (
  id              uuid not null default gen_random_uuid() primary key,
  user_email      text not null references public.auth_accounts(email) on delete cascade,
  device_token_hash text not null unique,     -- sha256 hex of the raw token
  created_at      timestamp with time zone default timezone('utc'::text, now()) not null,
  expires_at      bigint,                     -- epoch ms
  last_used_at    bigint,                     -- epoch ms (sliding inactivity window)
  user_agent      text
);
create index if not exists idx_trusted_devices_user
  on public.trusted_devices (user_email);

-- 3b. WEBAUTHN PENDING CHALLENGES (transient)
--    The backend is stateless (Cloud Run / Vercel), so register/authenticate
--    options store their one-time challenge here, keyed by a random state id.
--    Rows are short-lived (cleared after verification or when expired).
create table if not exists public.webauthn_challenges (
  id             uuid not null default gen_random_uuid() primary key,
  user_email     text not null references public.auth_accounts(email) on delete cascade,
  challenge      text not null,
  purpose        text not null default 'registration',   -- 'registration' | 'authentication'
  created_at     timestamp with time zone default timezone('utc'::text, now()) not null,
  expires_at     bigint
);
create index if not exists idx_webauthn_challenges_user
  on public.webauthn_challenges (user_email);

-- 4. ROW LEVEL SECURITY
--    The backend uses the service-role key (bypasses RLS) for management,
--    but we still enable RLS so direct anon-key reads/writes are denied.
alter table public.app_lock_credentials enable row level security;
alter table public.webauthn_credentials enable row level security;
alter table public.trusted_devices enable row level security;
alter table public.webauthn_challenges enable row level security;

-- No public (anon) policies are created by design: these tables are managed
-- exclusively by the secure backend endpoints (which use the service-role
-- client + required session token). With RLS enabled and no policies, the
-- anon key cannot read or write them.
