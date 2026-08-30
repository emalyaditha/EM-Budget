# EM Budget — Database runbook / manual steps

**Decision (2026-08-30): code fixes are applied in the repo and deployed
automatically by Vercel. The two items below are DATABASE-level changes that are
NOT applied automatically — run them yourself in the Supabase SQL editor when
you're ready.**

## Prerequisite context

- Supabase project: `iivdlgbztzthjbjzzjna`
- The DB currently uses **permissive** `SELECT` policies on the financial tables
  (`cash_accounts`, `transactions`, `debts`, `ledger_states`, `subscriptions`),
  so the app can read its own rows with the public anon key. That is why the app
  works today.
- `bank_cards.card_number` historically held full card numbers in plaintext.

## Step 1 — Mask plaintext card numbers (recommended, safe, one-way)

Open the SQL editor and run the contents of:

```
supabase/migrations/20260831_pan_masking.sql
```

What it does:
- Masks any full 13–19 digit PAN down to `**** 1234` (keeps last 4 only).
- Adds a `CHECK` constraint so a full PAN can never be stored again.
- **Does NOT change any RLS policy** — it cannot make the app empty.

Verify after running:

```sql
select count(*) from public.bank_cards where card_number ~ '^[0-9]{13,19}$';
-- must return 0
```

## Step 2 — See your current RLS posture (optional, read-only)

Run SECTION A (diagnostics only) of:

```
supabase/migrations/20260831_rls_posture.sql
```

This lists which tables have a permissive `SELECT ... using(true)` policy and
counts rows per table. It changes nothing.

## Step 3 — Optional: move to the strict (per-owner) RLS posture

Only do this if you want the most restrictive security. **Read the full header
of `20260831_rls_posture.sql` first.** Critical prerequisite:

```sql
alter database postgres
  set app.settings.session_secret to '<YOUR BACKEND SESSION_SECRET>';
```

Do **not** uncomment/run Section B until that secret matches the backend
`SESSION_SECRET`. If it does not match, `verify_user_token` fails closed and the
**entire app appears empty**. Test in a staging project before touching live.

## Step 4 — Confirm subscriptions still load

After any DB change, log out and back in on https://em-budget.vercel.app and
confirm all 6 subscriptions still appear. If they don't, revert the DB change
(the app reads subscriptions through the service-role backend endpoint at
`/api/sync/refresh-subscriptions` plus the `ledger_states.state` JSON fallback).
