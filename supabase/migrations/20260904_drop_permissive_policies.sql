-- =========================================================================
-- EM Budget: Drop ALL permissive using(true) RLS policies
-- These expose data to the anon key (any unauthenticated request).
-- After this, only the strict "Secure ..." policies remain.
-- Applied: 2026-09-04 via security audit
-- =========================================================================

-- auth_accounts: SELECT, UPDATE permissives
DROP POLICY IF EXISTS "Allow read accessibility on auth_accounts" ON public.auth_accounts;
DROP POLICY IF EXISTS "Allow update accessibility on auth_accounts" ON public.auth_accounts;
DROP POLICY IF EXISTS "Allow insert accessibility on auth_accounts" ON public.auth_accounts;

-- bank_cards: DELETE, SELECT, UPDATE permissives + duplicate INSERT
DROP POLICY IF EXISTS "Allow delete accessibility on cards" ON public.bank_cards;
DROP POLICY IF EXISTS "Allow read accessibility on cards" ON public.bank_cards;
DROP POLICY IF EXISTS "Allow update accessibility on cards" ON public.bank_cards;
DROP POLICY IF EXISTS "Allow insert/upsert accessibility on cards" ON public.bank_cards;
DROP POLICY IF EXISTS "cards_delete" ON public.bank_cards;
DROP POLICY IF EXISTS "cards_select" ON public.bank_cards;
DROP POLICY IF EXISTS "cards_update" ON public.bank_cards;
DROP POLICY IF EXISTS "cards_insert" ON public.bank_cards;

-- cash_accounts: DELETE, SELECT, UPDATE permissives + duplicate INSERT
DROP POLICY IF EXISTS "Allow delete accessibility on cash" ON public.cash_accounts;
DROP POLICY IF EXISTS "Allow read accessibility on cash" ON public.cash_accounts;
DROP POLICY IF EXISTS "Allow update accessibility on cash" ON public.cash_accounts;
DROP POLICY IF EXISTS "Allow insert/upsert accessibility on cash" ON public.cash_accounts;
DROP POLICY IF EXISTS "cash_delete" ON public.cash_accounts;
DROP POLICY IF EXISTS "cash_select" ON public.cash_accounts;
DROP POLICY IF EXISTS "cash_update" ON public.cash_accounts;
DROP POLICY IF EXISTS "cash_insert" ON public.cash_accounts;

-- debts: DELETE, SELECT, UPDATE permissives + INSERT
DROP POLICY IF EXISTS "Allow delete accessibility on debts" ON public.debts;
DROP POLICY IF EXISTS "Allow read accessibility on debts" ON public.debts;
DROP POLICY IF EXISTS "Allow update accessibility on debts" ON public.debts;
DROP POLICY IF EXISTS "Allow insert/upsert accessibility on debts" ON public.debts;

-- expenses: DELETE, SELECT, UPDATE permissives + INSERT
DROP POLICY IF EXISTS "Allow delete accessibility on expenses" ON public.expenses;
DROP POLICY IF EXISTS "Allow read accessibility on expenses" ON public.expenses;
DROP POLICY IF EXISTS "Allow update accessibility on expenses" ON public.expenses;
DROP POLICY IF EXISTS "Allow insert/upsert accessibility on expenses" ON public.expenses;

-- incomes: DELETE, SELECT, UPDATE permissives + INSERT
DROP POLICY IF EXISTS "Allow delete accessibility on incomes" ON public.incomes;
DROP POLICY IF EXISTS "Allow read accessibility on incomes" ON public.incomes;
DROP POLICY IF EXISTS "Allow update accessibility on incomes" ON public.incomes;
DROP POLICY IF EXISTS "Allow insert/upsert accessibility on incomes" ON public.incomes;

-- ledger_states: SELECT, UPDATE permissives + duplicate INSERT
DROP POLICY IF EXISTS "Allow read accessibility on states" ON public.ledger_states;
DROP POLICY IF EXISTS "Allow update accessibility on states" ON public.ledger_states;
DROP POLICY IF EXISTS "Allow insert/upsert accessibility on states" ON public.ledger_states;
DROP POLICY IF EXISTS "states_update" ON public.ledger_states;
DROP POLICY IF EXISTS "states_insert" ON public.ledger_states;

-- notifications: DELETE, SELECT, UPDATE permissives + INSERT
DROP POLICY IF EXISTS "Allow delete accessibility on notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow read accessibility on notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow update accessibility on notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow insert/upsert accessibility on notifications" ON public.notifications;

-- transactions: DELETE, SELECT, UPDATE permissives + duplicate INSERT
DROP POLICY IF EXISTS "Allow delete accessibility on tx" ON public.transactions;
DROP POLICY IF EXISTS "Allow update accessibility on tx" ON public.transactions;
DROP POLICY IF EXISTS "Allow insert/upsert accessibility on tx" ON public.transactions;
DROP POLICY IF EXISTS "tx_delete" ON public.transactions;
DROP POLICY IF EXISTS "tx_update" ON public.transactions;
DROP POLICY IF EXISTS "tx_insert" ON public.transactions;

-- Verify: only Secure policies should remain on financial tables
SELECT schemaname, tablename, policyname, permissive, roles, cmd,
  CASE WHEN qual = 'true' THEN 'LEAKED' ELSE 'secure' END as status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('transactions','ledger_states','bank_cards','cash_accounts',
                     'debts','incomes','expenses','notifications','subscriptions',
                     'loans_given','spending_envelopes','auth_accounts')
ORDER BY tablename, policyname;
