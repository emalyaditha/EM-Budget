-- =========================================================================
-- EM Budget: Seconds-granularity idle-lock timeout (2026-10-01)
--
-- ADDITIVE migration. Adds a single integer column to app_lock_credentials
-- storing the auto-lock idle timeout in seconds (5-86400). Takes precedence
-- over lock_idle_minutes when set; NULL falls back to the minutes column and
-- then to the 60-second default at the application layer.
-- =========================================================================

alter table public.app_lock_credentials
  add column if not exists lock_idle_seconds integer;
