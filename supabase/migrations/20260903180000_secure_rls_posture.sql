-- =========================================================================
-- EM Budget: Restore strict owner-scoped RLS posture (security fix 2026-09-03)
--
-- CONTEXT:
--   The financial tables (cash_accounts, transactions, debts, ledger_states,
--   subscriptions, bank_cards, incomes, expenses, notifications, loans_given,
--   spending_envelopes) were relaxed to permissive `using(true)` SELECT policies
--   (see 20260830_fix_subscriptions_rls.sql / 20260831_rls_posture.sql) because the
--   strict token-based policy could not pass in the deployment: the DB value of
--   `app.settings.session_secret` did not match the backend `SESSION_SECRET`.
--
--   With permissive SELECT, any client holding the anon key can read EVERYONE's
--   financial data. That is an unacceptable posture for a personal finance app,
--   even the current single-user deployment.
--
-- PREREQUISITE (MUST be done BEFORE applying this migration in a live DB):
--   Align the session secret in the database with the backend so the strict
--   token verification can pass. From a Supabase SQL editor / psql, run:
--
--     alter database <your-db-name> set app.settings.session_secret =
--       '<the exact SESSION_SECRET the backend signs sessions with>';
--
--   The app already sends `x-session-token` + `x-user-email` on its Supabase
--   reads (src/supabase.ts), so once that secret matches, `verify_user_token`
--   (20260725_init.sql) will pass and the owner-scoped policies below will
--   return only the caller's own rows.
--
-- SAFETY: This migration is idempotent and reversible. It drops any permissive
--   SELECT policy and any pre-existing strict policy, then creates the strict
--   top-scoped policies from 20260725_init.sql. If the secret has NOT been
--   aligned, reads will FAIL CLOSED (return zero rows) rather than leak data.
--   Review the "ROOT CAUSE" note in 20260830_fix_subscriptions_rls.sql before
--   applying on a live DB with existing writes.
-- =========================================================================

-- --- Financial tables: strict owner-scoped policies ---

drop policy if exists "Allow select on subscriptions" on public.subscriptions;

-- ledger_states
drop policy if exists "Secure select on states"       on public.ledger_states;
drop policy if exists "Secure insert on states"       on public.ledger_states;
drop policy if exists "Secure update on states"       on public.ledger_states;
create policy "Secure select on states" on public.ledger_states for select
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure insert on states" on public.ledger_states for insert
with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure update on states" on public.ledger_states for update
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

-- bank_cards
drop policy if exists "Secure select on cards"  on public.bank_cards;
drop policy if exists "Secure insert on cards"  on public.bank_cards;
drop policy if exists "Secure update on cards"  on public.bank_cards;
drop policy if exists "Secure delete on cards"  on public.bank_cards;
create policy "Secure select on cards" on public.bank_cards for select
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure insert on cards" on public.bank_cards for insert
with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure update on cards" on public.bank_cards for update
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure delete on cards" on public.bank_cards for delete
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

-- cash_accounts
drop policy if exists "Secure select on cash" on public.cash_accounts;
drop policy if exists "Secure insert on cash" on public.cash_accounts;
drop policy if exists "Secure update on cash" on public.cash_accounts;
drop policy if exists "Secure delete on cash" on public.cash_accounts;
create policy "Secure select on cash" on public.cash_accounts for select
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure insert on cash" on public.cash_accounts for insert
with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure update on cash" on public.cash_accounts for update
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure delete on cash" on public.cash_accounts for delete
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

-- transactions
drop policy if exists "Secure select on tx" on public.transactions;
drop policy if exists "Secure insert on tx" on public.transactions;
drop policy if exists "Secure update on tx" on public.transactions;
drop policy if exists "Secure delete on tx" on public.transactions;
create policy "Secure select on tx" on public.transactions for select
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure insert on tx" on public.transactions for insert
with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure update on tx" on public.transactions for update
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure delete on tx" on public.transactions for delete
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

-- debts
drop policy if exists "Secure select on debts" on public.debts;
drop policy if exists "Secure insert on debts" on public.debts;
drop policy if exists "Secure update on debts" on public.debts;
drop policy if exists "Secure delete on debts" on public.debts;
create policy "Secure select on debts" on public.debts for select
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure insert on debts" on public.debts for insert
with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure update on debts" on public.debts for update
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure delete on debts" on public.debts for delete
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

-- incomes
drop policy if exists "Secure select on incomes" on public.incomes;
drop policy if exists "Secure insert on incomes" on public.incomes;
drop policy if exists "Secure update on incomes" on public.incomes;
drop policy if exists "Secure delete on incomes" on public.incomes;
create policy "Secure select on incomes" on public.incomes for select
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure insert on incomes" on public.incomes for insert
with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure update on incomes" on public.incomes for update
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure delete on incomes" on public.incomes for delete
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

-- expenses
drop policy if exists "Secure select on expenses" on public.expenses;
drop policy if exists "Secure insert on expenses" on public.expenses;
drop policy if exists "Secure update on expenses" on public.expenses;
drop policy if exists "Secure delete on expenses" on public.expenses;
create policy "Secure select on expenses" on public.expenses for select
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure insert on expenses" on public.expenses for insert
with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure update on expenses" on public.expenses for update
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure delete on expenses" on public.expenses for delete
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

-- notifications
drop policy if exists "Secure select on notifications" on public.notifications;
drop policy if exists "Secure insert on notifications" on public.notifications;
drop policy if exists "Secure update on notifications" on public.notifications;
drop policy if exists "Secure delete on notifications" on public.notifications;
create policy "Secure select on notifications" on public.notifications for select
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure insert on notifications" on public.notifications for insert
with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure update on notifications" on public.notifications for update
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure delete on notifications" on public.notifications for delete
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

-- subscriptions
drop policy if exists "Secure select on subscriptions" on public.subscriptions;
drop policy if exists "Secure insert on subscriptions" on public.subscriptions;
drop policy if exists "Secure update on subscriptions" on public.subscriptions;
drop policy if exists "Secure delete on subscriptions" on public.subscriptions;
create policy "Secure select on subscriptions" on public.subscriptions for select
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure insert on subscriptions" on public.subscriptions for insert
with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure update on subscriptions" on public.subscriptions for update
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure delete on subscriptions" on public.subscriptions for delete
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

-- loans_given
drop policy if exists "Secure select on loans_given" on public.loans_given;
drop policy if exists "Secure insert on loans_given" on public.loans_given;
drop policy if exists "Secure update on loans_given" on public.loans_given;
drop policy if exists "Secure delete on loans_given" on public.loans_given;
create policy "Secure select on loans_given" on public.loans_given for select
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure insert on loans_given" on public.loans_given for insert
with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure update on loans_given" on public.loans_given for update
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure delete on loans_given" on public.loans_given for delete
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

-- spending_envelopes
drop policy if exists "Secure select on envelopes" on public.spending_envelopes;
drop policy if exists "Secure insert on envelopes" on public.spending_envelopes;
drop policy if exists "Secure update on envelopes" on public.spending_envelopes;
drop policy if exists "Secure delete on envelopes" on public.spending_envelopes;
create policy "Secure select on envelopes" on public.spending_envelopes for select
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure insert on envelopes" on public.spending_envelopes for insert
with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure update on envelopes" on public.spending_envelopes for update
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));
create policy "Secure delete on envelopes" on public.spending_envelopes for delete
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));