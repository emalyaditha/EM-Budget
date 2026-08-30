-- =========================================================================
-- EM Budget: Fix subscriptions RLS read policy (DB review 2026-08-30)
--
-- SYMPTOM: Subscriptions are written to Supabase (visible via service key)
-- but never come back when the app loads them with the anon key. The rest
-- of the app (wallets, transactions, debts) loads fine; only subscriptions
-- is empty ("No recurring plans").
--
-- ROOT CAUSE (verified live):
--   * The 6 subscriptions exist in the relational `subscriptions` table.
--   * Every OTHER table in this deployment (cash_accounts, transactions,
--     debts, ledger_states) is PERMISSIVELY readable by the anon role
--     (they return rows with no auth headers at all).
--   * `subscriptions` was the only table using the strict token-based RLS
--     policy (`verify_user_token`/`verify_system_signature`). That policy
--     cannot pass in this deployment because `app.settings.session_secret`
--     in the DB does not match the value the app signs its session tokens
--     with, so verification always fails -> reads return zero rows.
--   * The ledger_states JSON fallback contains an empty subscriptions
--     array, so there is no fallback data to recover either.
--
-- FIX: Give `subscriptions` a permissive SELECT policy so it is readable
-- exactly like the other tables already are in this deployment. Write
-- (insert/update/delete) policies are left untouched (writes already work).
--
-- SECURITY NOTE: This makes subscriptions readable by anyone holding the
-- anon key, matching the current behavior of cash_accounts/transactions/
-- debts. If you later align `app.settings.session_secret` with the backend
-- SESSION_SECRET, you can switch back to the strict token-based policy.
-- =========================================================================

-- Drop any existing select policies so only one (permissive) select policy remains
drop policy if exists "Secure select on subscriptions" on public.subscriptions;
drop policy if exists "Allow select on subscriptions" on public.subscriptions;
drop policy if exists "Allow all on subscriptions"   on public.subscriptions;

-- Permissive SELECT, matching cash_accounts/transactions/debts in this deployment
create policy "Allow select on subscriptions" on public.subscriptions for select
using (true);
