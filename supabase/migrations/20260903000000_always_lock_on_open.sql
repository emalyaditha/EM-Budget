-- =========================================================================
-- EM Budget: "Always ask for PIN on open" (2026-09-03)
--
-- ADDITIVE migration. Adds a single boolean column to app_lock_credentials.
-- When `lock_on_open` is true, the backend forces the app-lock gate on every
-- app startup regardless of the browser's trusted-device status, so a
-- remembered device no longer skips the PIN.
-- =========================================================================

alter table public.app_lock_credentials
  add column if not exists lock_on_open boolean not null default false;