-- Fix the credit-card auto-deduction date and remove the pre-15th charge it created.
--
-- Background:
--   The app used the card's due date (the 7th) as the rollover cycle end, so on
--   the day AFTER the 7th it auto-applied revolving interest + a late fee and
--   wrote a credit_card_charge with reference_id
--   'rollover::card-1781028399253::2026-09-07' (dated 2026-09-07).
--
--   The deduction rule is now the 15th (see DEDUCTION_DAY in src/lib/creditCards.ts):
--   a cycle closes on the 15th of the month containing the due date, charges are
--   dated that 15th, and the reference key embeds that 15th. The wrong 2026-09-07
--   charge must not exist, the card must show the corrected balance / due date /
--   minimum, and the ledger_states.state mirror must match.
--
-- This migration is idempotent: every statement is guarded so it only acts on
-- rows that still hold the pre-fix values.

-- 1) Remove the wrong pre-15th charge (exact row only).
DELETE FROM transactions
WHERE id = 'trans-b56a0a28-5fef-496b-a42c-71a728e0ca42'
  AND reference_id = 'rollover::card-1781028399253::2026-09-07'
  AND type = 'credit_card_charge'
  AND account_id = 'card-1781028399253';

-- 2) Restore the card to the post-payment balance with the 15th-anchored due date.
--      -47477.63 (wrong, included the 1025.76 charge) -> -46451.87 (post 6300.00 payment)
--      dueDate  2026-10-07 (advanced by the wrong rollover)  -> 2026-09-15 (deduction day)
--      minPayment 5% of 46451.87 = 2322.59
UPDATE bank_cards
SET current_balance = -46451.87,
    due_date        = '2026-09-15',
    min_payment     = 2322.59
WHERE id = 'card-1781028399253'
  AND current_balance = -47477.63
  AND due_date = '2026-10-07';

-- 3) Mirror: fix ledger_states.state for the owning account row.
--      a) drop the wrong charge from state->'transactions'
--      b) set the mirror card's currentBalance / dueDate / minPayment
UPDATE ledger_states
SET state = jsonb_set(
      jsonb_set(
        state,
        '{transactions}',
        COALESCE(
          (SELECT jsonb_agg(t)
             FROM jsonb_array_elements(state->'transactions') t
            WHERE t->>'referenceId' <> 'rollover::card-1781028399253::2026-09-07'),
          '[]'::jsonb
        ),
        false
      ),
      '{cards}',
      (SELECT jsonb_agg(
                CASE WHEN c->>'id' = 'card-1781028399253'
                     THEN c || jsonb_build_object(
                                'currentBalance', -46451.87,
                                'dueDate',         '2026-09-15',
                                'minPayment',      2322.59
                              )
                     ELSE c
                END)
         FROM jsonb_array_elements(state->'cards') c),
      false
    )
WHERE id = '84448b01-ab55-4359-b6cb-91380889a531'
  AND state->'transactions' @> '[{"referenceId": "rollover::card-1781028399253::2026-09-07"}]'::jsonb;