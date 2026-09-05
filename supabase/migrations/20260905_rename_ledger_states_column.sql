-- =========================================================================
-- EM Budget: Fix ledger_states column name drift
-- The init migration created ledger_states.data, but all application code
-- reads/writes column "state" (server.ts, src/supabase.ts, SettingsModal).
-- Rename data -> state for fresh deployments; no-op if already renamed.
-- =========================================================================

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ledger_states'
      and column_name = 'data'
  ) then
    alter table public.ledger_states rename column data to state;
  end if;
end $$;

-- Verify the column is present under the expected name
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'ledger_states'
order by ordinal_position;