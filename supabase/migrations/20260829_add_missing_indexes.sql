-- =========================================================================
-- EM Budget: Missing indexes (DB review 2026-08-29)
-- Adds composite indexes for filtered queries, RLS-optimized lookups,
-- and TTL/cleanup scans. Idempotent via IF NOT EXISTS.
-- =========================================================================

-- TRANSACTIONS (hot table: filtered by user + date/category/type)
create index if not exists idx_tx_user_date
  on public.transactions (user_email, date);
create index if not exists idx_tx_user_category
  on public.transactions (user_email, category);
create index if not exists idx_tx_user_type
  on public.transactions (user_email, type);
-- account lookups used in transfers / reconciliation
create index if not exists idx_tx_user_account
  on public.transactions (user_email, account_id);
create index if not exists idx_tx_user_target_account
  on public.transactions (user_email, target_account_id);

-- EXPENSES
create index if not exists idx_expenses_user_date
  on public.expenses (user_email, date);
create index if not exists idx_expenses_user_category
  on public.expenses (user_email, category);

-- INCOMES
create index if not exists idx_incomes_user_date
  on public.incomes (user_email, date);
create index if not exists idx_incomes_user_category
  on public.incomes (user_email, category);

-- DEBTS (due_date range scans, dashboard overdue)
create index if not exists idx_debts_user_due
  on public.debts (user_email, due_date);

-- LOANS GIVEN (status filters, settlement queues)
create index if not exists idx_loans_given_user_status
  on public.loans_given (user_email, status);
create index if not exists idx_loans_given_user_date_given
  on public.loans_given (user_email, date_given);

-- SUBSCRIPTIONS (billing status + due_date scheduler)
create index if not exists idx_subscriptions_user_status
  on public.subscriptions (user_email, status);
create index if not exists idx_subscriptions_user_due
  on public.subscriptions (user_email, due_date);

-- NOTIFICATIONS (timeline + unread badge)
create index if not exists idx_notifications_user_date
  on public.notifications (user_email, date);
create index if not exists idx_notifications_user_read
  on public.notifications (user_email, read) where read = false;

-- SPENDING ENVELOPES (category rollups)
create index if not exists idx_spending_envelopes_user_category
  on public.spending_envelopes (user_email, category);

-- BANK / CASH updated_at for sync reconciliations (equality on user_email, range on updated_at)
create index if not exists idx_bank_cards_user_updated_at
  on public.bank_cards (user_email, updated_at desc);
create index if not exists idx_cash_accounts_user_updated_at
  on public.cash_accounts (user_email, updated_at desc);

-- LEDGER STATES (single row per user but keep for consistency)
create index if not exists idx_ledger_states_updated_at
  on public.ledger_states (updated_at desc);

-- AUTH OTPS (TTL + lookup by email)
create index if not exists idx_auth_otps_expires
  on public.auth_otps (expires_at);
create index if not exists idx_auth_otps_email
  on public.auth_otps (email);

-- AUTH RATE LIMITS (GC of expired buckets)
create index if not exists idx_auth_rate_limits_reset
  on public.auth_rate_limits (reset_time);
-- key is PK already; reset_time index helps `delete ... where reset_time < now()`

-- DEVICE TOKENS (lookup by hashed_email + expiry sweep)
create index if not exists idx_device_tokens_hashed
  on public.auth_device_tokens (hashed_email);
create index if not exists idx_device_tokens_expires
  on public.auth_device_tokens (expires_at);

-- AUTH ACCOUNTS (email PK already indexed; add updated_at for admin scans if needed)
create index if not exists idx_auth_accounts_updated_at
  on public.auth_accounts (updated_at desc);
