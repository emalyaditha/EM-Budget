-- Fix the credit-card rollover treatment (see DEDUCTION_DAY / paymentsInCycle in src/lib/creditCards.ts).
--
-- Background:
--   The old rollover logic used the card's due date (the 7th) as the cycle end,
--   so on the day after the 7th it wrote a credit_card_charge dated 2026-09-07
--   with reference_id 'rollover::card-1781028399253::2026-09-07'.
--
--   The cycle actually closes on the 15th of the month containing the due date
--   (the deduction day), while the payment deadline stays on the 7th. State at
--   the time this file is applied:
--     - the wrong charge has already been deleted, and the card balance was
--       restored to -46451.87 / min_payment 2322.59 by an earlier manual run;
--     - but the card's due_date was left at '2026-09-15' — the deduction day,
--       not the deadline. With the fixed logic a deadline on the 15th would
--       permanently drift every future deadline to the 15th
--       (advanceDueDate('2026-09-15') -> '2026-10-15').
--
--   This migration converges the card and its ledger_states mirror to the
--   corrected state. Every statement is guarded and idempotent: it only acts on
--   rows that still hold the wrong values.

-- 1) Remove the wrong pre-15th charge if it still exists (exact row only).
DELETE FROM transactions
WHERE id = 'trans-b56a0a28-5fef-496b-a42c-71a728e0ca42'
  AND reference_id = 'rollover::card-1781028399253::2026-09-07'
  AND type = 'credit_card_charge'
  AND account_id = 'card-1781028399253';

-- 2) Converge the card to the corrected state: post-payment balance,
--    7th-anchored deadline, 5% minimum.
UPDATE bank_cards
SET current_balance = -46451.87,
    due_date        = '2026-10-07',
    min_payment     = 2322.59
WHERE id = 'card-1781028399253'
  AND (current_balance <> -46451.87 OR due_date <> '2026-10-07' OR min_payment <> 2322.59);

-- 3) Mirror the same state into ledger_states.state: drop the wrong charge from
--    state->'transactions' and set the mirror card's currentBalance / dueDate /
--    minPayment to the same values as the bank_cards UPDATE above.
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
                                'dueDate',         '2026-10-07',
                                'minPayment',      2322.59
                              )
                     ELSE c
                END)
         FROM jsonb_array_elements(state->'cards') c),
      false
    )
WHERE id = '84448b01-ab55-4359-b6cb-91380889a531'
  AND NOT state->'cards' @> '[{"id": "card-1781028399253", "currentBalance": -46451.87, "dueDate": "2026-10-07", "minPayment": 2322.59}]'::jsonb;