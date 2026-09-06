-- =========================================================================
-- EM Budget: Configurable idle-lock timeout (2026-09-03)
--
-- ADDITIVE migration. Adds a single integer column to app_lock_credentials
-- storing the auto-lock idle timeout in minutes. NULL/0 falls back to the
-- 1-minute default at the application layer.
-- =========================================================================

alter table public.app_lock_credentials
  add column if not exists lock_idle_minutes integer;