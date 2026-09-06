-- =========================================================================
-- EM Budget: Mask plaintext credit-card PANs (security hardening, 2026-08-31)
--
-- WHY: The `bank_cards.card_number` column historically stored full 16-digit
-- card numbers in plaintext (DB + localStorage + ledger_states JSON). Even
-- though Row Level Security protects access, storing a full PAN is PCI-DSS
-- non-compliant. If any anon-key or service-role leak ever occurs, a full PAN
-- must never be recoverable from the database.
--
-- WHAT THIS DOES (SAFE, ONE-WAY, NO RLS CHANGE):
--   1. Masks any existing full numeric PAN (13-19 digits) down to the last 4
--      digits: `**** 1234`. This is one-way and intentional.
--   2. Adds a CHECK constraint that REJECTS any future attempt to store a full
--      13-19 digit PAN. Masked formats (`**** 1234`, the client's own
--      `•••• •••• •••• 1234`) and NULL remain allowed.
--
-- The client already masks on save (`CashCardManagement.tsx` persists
-- `•••• •••• •••• ${last4}`), so normal app writes are unaffected.
--
-- SAFE TO RUN. Does not alter any RLS policy and cannot make the app empty.
-- =========================================================================

-- 1) Mask any legacy full PANs still stored. One-way, intentionally loses the
--    middle digits but preserves the last 4 for identification.
update public.bank_cards
   set card_number = '**** ' || right(card_number, 4),
       updated_at   = now()
 where card_number ~ '^[0-9]{13,19}$';

-- 2) Guard rail: reject any future full-PAN insert/update.
--    Allows `**** 1234`, `•••• •••• •••• 1234`, arbitrary labels, and NULL.
alter table public.bank_cards
  drop constraint if exists bank_cards_card_number_no_full_pan_check;

alter table public.bank_cards
  add constraint bank_cards_card_number_no_full_pan_check
  check (card_number is null or card_number !~ '^[0-9]{13,19}$');

-- =========================================================================
-- VERIFY (run in the SQL editor and confirm 0 rows):
--   select card_number from public.bank_cards
--    where card_number ~ '^[0-9]{13,19}$';
--   => must return 0 rows (no full PANs remain)
-- =========================================================================
