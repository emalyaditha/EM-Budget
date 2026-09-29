-- =========================================================================
-- EM Budget: Tier-1 database hardening (2026-09-29)
--
-- Fully idempotent: safe to run multiple times, safe to run on the live DB.
-- Additive only — no data is deleted, no existing policy is weakened.
--
-- Sections:
--   1. Pin search_path on SECURITY DEFINER verifier functions
--   2. FORCE ROW LEVEL SECURITY on every public table
--   3. Add the missing DELETE policy on ledger_states (fail-closed owner scope)
--   4. Missing operational indexes for expiry sweeps (column-guarded)
--   5. Uniqueness guard for idempotent installment payments
--   6. Reconcile schema drift (bank_cards card metadata, subscriptions.instance_type)
--   7. Health summary output
--
-- The service_role key used by the backend has BYPASSRLS, so section 2 does
-- not affect server.ts / sync_complete_ledger. Anon/authenticated access
-- remains governed by the strict policies from 20260903180000.
-- =========================================================================

-- --- 1. Pin search_path on the verifiers (match sync_complete_ledger) ------

ALTER FUNCTION public.verify_user_token(json) SET search_path = public;
ALTER FUNCTION public.verify_system_signature(json) SET search_path = public;

-- --- 2. FORCE ROW LEVEL SECURITY on all app tables --------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ledger_states', 'bank_cards', 'cash_accounts', 'transactions', 'debts',
    'incomes', 'expenses', 'notifications', 'subscriptions', 'loans_given',
    'spending_envelopes', 'credit_card_installments',
    'credit_card_installment_payments', 'auth_accounts', 'auth_otps',
    'auth_device_tokens', 'auth_rate_limits', 'app_lock_credentials',
    'webauthn_credentials', 'webauthn_challenges', 'trusted_devices',
    'login_attempts', 'vault'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r') THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END
$$;

-- --- 3. DELETE policy on ledger_states (same strict owner scope) ------------
-- Without this, account deletion / truncate flows silently fail closed.

DROP POLICY IF EXISTS "Secure delete on states" ON public.ledger_states;
CREATE POLICY "Secure delete on states" ON public.ledger_states FOR DELETE
USING (
  user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json)
  OR public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json)
);

-- --- 4. Missing operational indexes (column-guarded) -------------------------
-- The backend sweeps expired rows with .lt('expires_at'/'locked_until', now);
-- these were sequential scans on every request.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('webauthn_challenges', 'expires_at', 'idx_webauthn_challenges_expires_at'),
      ('webauthn_credentials', 'expires_at', 'idx_webauthn_credentials_expires_at'),
      ('trusted_devices',      'expires_at', 'idx_trusted_devices_expires_at'),
      ('login_attempts',       'locked_until', 'idx_login_attempts_locked_until'),
      ('app_lock_credentials', 'locked_until', 'idx_app_lock_credentials_locked_until')
    ) AS v(tbl, col, idx)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = r.tbl AND column_name = r.col
    ) THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)', r.idx, r.tbl, r.col);
      RAISE NOTICE 'index % ensured on %.%', r.idx, r.tbl, r.col;
    ELSE
      RAISE NOTICE 'column %.% not present; index % skipped', r.tbl, r.col, r.idx;
    END IF;
  END LOOP;
END
$$;

-- --- 5. Uniqueness guard for installment payments ----------------------------
-- The sync path upserts payments; without this, a retry can duplicate a row.
-- If live data already contains duplicates the index is skipped with a NOTICE
-- (review and dedupe, then re-run this script).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.credit_card_installment_payments
    GROUP BY installment_id, payment_number HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'DUPLICATES FOUND in credit_card_installment_payments (installment_id, payment_number) - unique index NOT created; dedupe then re-run';
  ELSE
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_ccip_installment_payment ON public.credit_card_installment_payments (installment_id, payment_number)';
    RAISE NOTICE 'unique index uq_ccip_installment_payment ensured';
  END IF;
END
$$;

-- --- 6. Reconcile schema drift -----------------------------------------------
-- These columns exist in the live DB (used by src/supabase.ts sync mapping)
-- but no migration ever created them; a fresh replay would lose card metadata
-- and subscription instance types. IF NOT EXISTS makes this a no-op on live.

ALTER TABLE public.bank_cards
  ADD COLUMN IF NOT EXISTS due_date         text,
  ADD COLUMN IF NOT EXISTS min_payment      numeric,
  ADD COLUMN IF NOT EXISTS apr              numeric,
  ADD COLUMN IF NOT EXISTS last_payment_date text;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS instance_type text;

-- --- 7. Health summary --------------------------------------------------------

SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

-- Optional (NOT executed here — verify no dangling rows first, then run manually):
--   SELECT count(*) FROM credit_card_installments ci
--    LEFT JOIN bank_cards bc ON bc.id = ci.card_id WHERE bc.id IS NULL;
--   ALTER TABLE public.credit_card_installments
--     ADD CONSTRAINT fk_cci_card FOREIGN KEY (card_id)
--     REFERENCES public.bank_cards(id) ON DELETE SET NULL;
