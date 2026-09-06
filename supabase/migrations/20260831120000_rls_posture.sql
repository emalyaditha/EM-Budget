-- =========================================================================
-- EM Budget: RLS posture — DIAGNOSTIC + GATED fix (2026-08-31)
--
-- READ THIS BEFORE RUNNING ANYTHING:
--   * The live database currently uses PERMISSIVE SELECT policies on the
--     financial tables (cash_accounts, transactions, debts, ledger_states,
--     subscriptions) so the app can read its own data with the public anon key.
--   * That posture makes the data readable by anyone who holds the anon key.
--     The fully-secure target is the STRICT token-based policy defined in
--     20260725_init.sql (verify_user_token / verify_system_signature), which
--     restricts reads to the row owner only.
--
-- SECTION A (below) is SAFE and read-only: it reports your current posture so
-- you can see exactly what is open. RUN SECTION A ANY TIME — it changes nothing.
--
-- SECTION B (at the bottom, ENTIRELY COMMENTED OUT) is the OPTIONAL migration
-- to the strict posture. DO NOT uncomment/run it unless you FIRST complete the
-- prerequisite (align app.settings.session_secret with the backend
-- SESSION_SECRET) — otherwise, because the client currently reads via the anon
-- key AND sends session tokens, an unaligned secret will make verification fail
-- CLOSED and the whole app will appear EMPTY. That is exactly the class of
-- outage we are avoiding.
--
-- RECOMMENDED SEQUENCE:
--   1. Run SECTION A to see the current open tables.
--   2. Identify rows you actually need protected; confirm the anon key is not
--      exposed anywhere public.
--   3. If you do adopt the strict posture, do it AFTER aligning session_secret
--      and only after testing in a staging project (never change a live DB
--      posture under time pressure).
-- =========================================================================

-- =========================================================================
-- SECTION A — READ-ONLY DIAGNOSTICS (safe, changes nothing)
-- =========================================================================

-- A1. Which financial tables have at least one RLS policy that allows anon
--     public SELECT (permissive USING(true))? These are the open ones.
select
  tablename,
  policyname,
  cmd,
  pg_get_expr(polqual, polrelid) as using_expr
from pg_policies
where schemaname = 'public'
  and cmd = 'SELECT'
  and pg_get_expr(polqual, polrelid) ilike '%true%'
order by tablename;

-- A2. Any card_number values that are still FULL numeric PANs (should be 0 after
--     running 20260831_pan_masking.sql):
select id, user_email, right(card_number, 4) as last4
from public.bank_cards
where card_number ~ '^[0-9]{13,19}$';

-- A3. Sanity: how many rows per owner are in the key financial tables
--     (confirms reads/writes are working today):
select
  (select count(*) from public.cash_accounts)   as cash_accounts,
  (select count(*) from public.transactions)    as transactions,
  (select count(*) from public.debts)           as debts,
  (select count(*) from public.subscriptions)   as subscriptions,
  (select count(*) from public.ledger_states)   as ledger_states,
  (select count(*) from public.bank_cards)      as bank_cards;

-- =========================================================================
-- SECTION B — OPT-IN STRICT POSTURE (COMMENTED OUT — see instructions above)
-- =========================================================================
--
-- PREREQUISITE (run FIRST, as the database owner, in the SQL editor):
--   alter database postgres
--     set app.settings.session_secret to '<SET THIS TO YOUR BACKEND SESSION_SECRET>';
--
-- After the prerequisite, UNCOMMENT and run the statements below to restore the
-- strict, per-owner SELECT policies (matching 20260725_init.sql) on the financial
-- tables, and REVOKE the permissive public SELECT policies. This is the
-- long-term secure posture and is optional for this single-user app.
--
-- (If you choose not to secure this further, the app continues to function as it
--  does today with the permissive posture. This file simply makes the decision
--  explicit and safe.)
--
-- ------------------------------------------------------------------------
-- -- 1) Drop the permissive public-SELECT policies we added to subscriptions
-- drop policy if exists "Allow select on subscriptions" on public.subscriptions;
-- drop policy if exists "Allow all on subscriptions"   on public.subscriptions;
--
-- -- 2) Confirm the strict helper functions exist (they do in 20260725_init.sql):
-- --    create or replace function public.verify_user_token(headers json) returns text
-- --    create or replace function public.verify_system_signature(headers json) returns boolean
--
-- -- 3) Restore strict owner-only SELECT on the financial tables (idempotent):
-- do $$ declare t text; begin
--   foreach t in array array['cash_accounts','transactions','debts','subscriptions','ledger_states','bank_cards']
--   loop
--     execute format(
--       'drop policy if exists "Secure select on %s" on public.%I', t, t);
--     execute format(
--       'create policy "Secure select on %s" on public.%I for select using (
--          user_email = public.verify_user_token(nullif(current_setting(''request.headers'', true), '''')::json)
--          or public.verify_system_signature(nullif(current_setting(''request.headers'', true), '''')::json))', t, t);
--   end loop;
-- end $$;
--
-- -- 4) Verify: re-run SECTION A1 — it should return no rows (no permissive SELECT).
-- =========================================================================
