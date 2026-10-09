-- =============================================================================
-- B-26 — "was any card's cycle ever rolled twice?"  COUNT-ONLY, READ-ONLY.
--
-- Run in the Supabase SQL editor. Edit the one email below. Every statement is a
-- SELECT; nothing is written and no row's contents are returned — only numbers.
--
-- What counts as a double roll, and why the obvious test is wrong:
--   A rollover writes `reference_id = 'rollover::<card>::<cycleEnd>'`
--   (src/App.tsx:837, minted from src/lib/creditCards.ts:308-378) and one fresh
--   `generateUniqueId('trans')` id per row. A SINGLE legitimate roll can emit TWO
--   rows under the same reference_id — `Revolving Interest` (creditCards.ts:342)
--   and `Late Payment Fee` (:354) — so `count(*) > 1` per reference_id does NOT
--   prove a double roll; it is what a normal interest+fee cycle looks like.
--   The real signature is the same reference_id carrying the SAME title twice:
--   one cycle cannot produce two rows of one charge kind (charges.push happens at
--   most once per kind), while a second roll over the same pre-roll balance does.
--   Hence: group by (reference_id, title) and look for count > 1.
--
-- Money bounds are given as a range rather than a number because which duplicate
-- is "the real one" is not recoverable from the data: if a cycle holds amounts a
-- and b, the excess is between min(a,b) and max(a,b).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. This account, as the relational tables hold it (what every push writes:
--    sync_complete_ledger deletes the account's rows and re-inserts them —
--    supabase/migrations/20260905240000_sync_complete_ledger_rpc.sql:132-134 —
--    so these tables mirror the last successful push, not the last roll).
-- -----------------------------------------------------------------------------
with params as (
  select 'REPLACE-WITH-YOUR-EMAIL@example.com'::text as email
),
rolls as (
  select t.reference_id,
         t.title,
         t.amount
  from public.transactions t
  join params p on p.email = t.user_email
  where t.type = 'credit_card_charge'
    and t.reference_id like 'rollover::%'
),
per_charge as (
  select reference_id,
         title,
         count(*)        as times_charged,
         sum(amount)     as total_amount,
         min(amount)     as least_amount,
         max(amount)     as greatest_amount
  from rolls
  group by reference_id, title
)
select
  (select count(*) from rolls)                                    as charge_rows,
  (select count(distinct reference_id) from rolls)                as cycles_rolled,
  (select count(*) from per_charge where times_charged > 1)       as charges_applied_twice,
  (select count(distinct reference_id)
     from per_charge where times_charged > 1)                     as cycles_doubled,
  (select coalesce(sum(times_charged - 1), 0)
     from per_charge where times_charged > 1)                     as duplicate_rows,
  (select coalesce(sum(total_amount - greatest_amount), 0)
     from per_charge where times_charged > 1)                     as double_charged_rs_at_least,
  (select coalesce(sum(total_amount - least_amount), 0)
     from per_charge where times_charged > 1)                     as double_charged_rs_at_most;


-- -----------------------------------------------------------------------------
-- 2. This account, as the app actually reads it: the JSON snapshot.
--    ledger_states.state is the array the UI renders and the merge keys on `id`,
--    not on referenceId (src/App.tsx:213-224, :231), so a pair of duplicate rows
--    survives every later sync here even if the relational projection is clean.
--    A `0` in statement 1 with a non-`0` here means the damage is real and the
--    relational table is simply not where it shows.
--    No amount arithmetic: jsonb ->> yields text, and this account's stored values
--    may be grouped strings ("1,250"), which B-27 makes a cast error rather than a
--    number. Counts only, on purpose.
-- -----------------------------------------------------------------------------
with params as (
  select 'REPLACE-WITH-YOUR-EMAIL@example.com'::text as email
),
snap as (
  select l.state
  from public.ledger_states l
  join params p on p.email = l.user_email
  where jsonb_typeof(l.state -> 'transactions') = 'array'
),
tx as (
  select e.value ->> 'referenceId' as reference_id,
         e.value ->> 'id'          as tx_id,
         e.value ->> 'title'       as title
  from snap
  cross join jsonb_array_elements(snap.state -> 'transactions') as e(value)
  where e.value ->> 'type' = 'credit_card_charge'
    and e.value ->> 'referenceId' like 'rollover::%'
),
per_charge as (
  select reference_id, title, count(*) as times_charged
  from tx
  group by reference_id, title
)
select
  (select count(*) from tx)                                       as snapshot_charge_rows,
  (select count(distinct reference_id) from tx)                   as snapshot_cycles_rolled,
  (select count(*) from per_charge where times_charged > 1)       as snapshot_charges_applied_twice,
  (select count(distinct reference_id)
     from per_charge where times_charged > 1)                     as snapshot_cycles_doubled,
  (select coalesce(sum(times_charged - 1), 0)
     from per_charge where times_charged > 1)                     as snapshot_duplicate_rows;


-- -----------------------------------------------------------------------------
-- 3. Optional, whole project: how many ACCOUNTS are affected. Aggregate only —
--    it names no email and returns no row. Run it only if you want the blast
--    radius beyond your own account.
-- -----------------------------------------------------------------------------
with rolls as (
  select t.user_email, t.reference_id, t.title
  from public.transactions t
  where t.type = 'credit_card_charge'
    and t.reference_id like 'rollover::%'
),
per_charge as (
  select user_email, reference_id, title, count(*) as times_charged
  from rolls
  group by user_email, reference_id, title
)
select
  count(distinct user_email)                                            as accounts_with_any_roll,
  count(distinct user_email) filter (where times_charged > 1)           as accounts_with_a_double,
  count(distinct reference_id) filter (where times_charged > 1)         as doubled_cycles_project_wide,
  coalesce(sum(times_charged - 1) filter (where times_charged > 1), 0)  as duplicate_rows_project_wide
from per_charge;
