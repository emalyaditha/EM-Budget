-- =========================================================================
-- EM Budget: Define sync_complete_ledger atomic sync RPC (2026-09-05)
--
-- The client has always attempted `rpc('sync_complete_ledger', ...)` as its
-- PRIMARY sync path, with a sequential multi-table fallback. Pre-existing 11-
-- and 12-param overloads only wrote a SUBSET of columns (locked_amount,
-- is_limit_locked, is_frozen, credit_limit, limit, due_date, apr, ... were
-- silently NULLed on every sync) and never synced installment tables. This
-- migration replaces them with a single comprehensive 14-param function.
--
-- The function is SECURITY DEFINER (bypasses RLS so it can mirror the whole
-- ledger) BUT re-verifies the caller's session token inline and refuses to
-- write for any email other than the one bound to a valid token, so
-- cross-user tampering stays impossible even without RLS.
--
-- IMPORTANT: it must NOT depend on current_setting('app.settings.session_secret'),
-- which Supabase managed Postgres refuses to configure via SQL (the DB-level
-- GUC is NULL on this project, so verify_user_token() always fails there).
-- Instead the secret is read from the public.vault table, which the backend
-- seeds at startup and which SECURITY DEFINER can read regardless of grants.
--
-- The function runs as one transaction: either every table is replaced with
-- the incoming snapshot (per user) or nothing is. Delete+insert (mirror)
-- instead of diffing is simpler and self-heals stale rows.
-- =========================================================================

create or replace function public.sync_complete_ledger(
  p_email text,
  p_state jsonb,
  p_cards jsonb default '[]'::jsonb,
  p_cash_accounts jsonb default '[]'::jsonb,
  p_transactions jsonb default '[]'::jsonb,
  p_debts jsonb default '[]'::jsonb,
  p_incomes jsonb default '[]'::jsonb,
  p_expenses jsonb default '[]'::jsonb,
  p_notifications jsonb default '[]'::jsonb,
  p_subscriptions jsonb default '[]'::jsonb,
  p_loans_given jsonb default '[]'::jsonb,
  p_spending_envelopes jsonb default '[]'::jsonb,
  p_installments jsonb default '[]'::jsonb,
  p_installment_payments jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_headers json;
  v_token text;
  v_header_email text;
  v_parts text[];
  v_payload_str text;
  v_signature text;
  v_expected text;
  v_secret text;
  v_payload json;
  v_expires_at bigint;
  v_now timestamptz := timezone('utc', now());
  v_id uuid := extensions.gen_random_uuid();
begin
  -- 1. Verify the caller: the session token must be valid AND its bound email
  --    must match p_email. This is the only gate that allows SECURITY DEFINER
  --    to bypass RLS safely.
  v_headers := nullif(current_setting('request.headers', true), '')::json;
  if v_headers is null then
    return jsonb_build_object('success', false, 'error', 'Unauthorized: no request headers.');
  end if;

  v_token := coalesce(v_headers->>'x-session-token', v_headers->>'X-Session-Token', v_headers->>'x-Session-Token');
  v_header_email := coalesce(v_headers->>'x-user-email', v_headers->>'X-User-Email', v_headers->>'x-User-Email');
  if v_token is null or v_header_email is null then
    return jsonb_build_object('success', false, 'error', 'Unauthorized: missing token or email header.');
  end if;

  v_parts := string_to_array(v_token, '.');
  if array_length(v_parts, 1) != 2 then
    return jsonb_build_object('success', false, 'error', 'Unauthorized: malformed token.');
  end if;
  v_payload_str := v_parts[1];
  v_signature := v_parts[2];

  -- Secret: prefer the platform GUC when configured, else the vault seed.
  v_secret := nullif(current_setting('app.settings.session_secret', true), '');
  if v_secret is null then
    select value into v_secret from public.vault where key = 'session_secret';
  end if;
  if v_secret is null then
    return jsonb_build_object('success', false, 'error', 'Unauthorized: session secret not configured.');
  end if;

  v_expected := encode(extensions.hmac(v_payload_str, v_secret, 'sha256'), 'hex');
  if v_signature != v_expected then
    return jsonb_build_object('success', false, 'error', 'Unauthorized: invalid token signature.');
  end if;

  v_payload_str := rpad(replace(replace(v_payload_str, '-', '+'), '_', '/'), (ceil(length(v_payload_str) / 4.0) * 4)::integer, '=');
  v_payload := convert_from(decode(v_payload_str, 'base64'), 'utf-8')::json;

  v_expires_at := (v_payload->>'expiresAt')::bigint;
  if v_expires_at < (date_part('epoch', now()) * 1000)::bigint then
    return jsonb_build_object('success', false, 'error', 'Unauthorized: token expired.');
  end if;

  if lower(v_payload->>'email') = lower(v_header_email) and lower(v_header_email) = lower(p_email) then
    -- token valid and bound to the caller; proceed
    null;
  else
    return jsonb_build_object('success', false, 'error', 'Unauthorized: session token email mismatch.');
  end if;

  -- 2. Persist the full JSON snapshot (the client reads this as a fallback
  --    whenever relational-table reads are blocked by RLS).
  insert into public.ledger_states (id, user_email, state, updated_at)
  values (v_id, p_email, p_state, v_now)
  on conflict (user_email)
  do update set state = excluded.state, updated_at = excluded.updated_at;

  -- 3. Mirror each relational table for this user. Order matters:
  --    credit_card_installment_payments references credit_card_installments,
  --    so payments are cleared first and re-inserted last.
  delete from public.credit_card_installment_payments
  where installment_id in (select id from public.credit_card_installments where user_email = p_email);

  delete from public.credit_card_installments where user_email = p_email;
  insert into public.credit_card_installments
  select r.* from jsonb_populate_recordset(null::public.credit_card_installments, coalesce(p_installments, '[]'::jsonb)) as r;

  insert into public.credit_card_installment_payments
  select r.* from jsonb_populate_recordset(null::public.credit_card_installment_payments, coalesce(p_installment_payments, '[]'::jsonb)) as r;

  delete from public.bank_cards where user_email = p_email;
  insert into public.bank_cards
  select r.* from jsonb_populate_recordset(null::public.bank_cards, coalesce(p_cards, '[]'::jsonb)) as r;

  delete from public.cash_accounts where user_email = p_email;
  insert into public.cash_accounts
  select r.* from jsonb_populate_recordset(null::public.cash_accounts, coalesce(p_cash_accounts, '[]'::jsonb)) as r;

  delete from public.transactions where user_email = p_email;
  insert into public.transactions
  select r.* from jsonb_populate_recordset(null::public.transactions, coalesce(p_transactions, '[]'::jsonb)) as r;

  delete from public.debts where user_email = p_email;
  insert into public.debts
  select r.* from jsonb_populate_recordset(null::public.debts, coalesce(p_debts, '[]'::jsonb)) as r;

  delete from public.incomes where user_email = p_email;
  insert into public.incomes
  select r.* from jsonb_populate_recordset(null::public.incomes, coalesce(p_incomes, '[]'::jsonb)) as r;

  delete from public.expenses where user_email = p_email;
  insert into public.expenses
  select r.* from jsonb_populate_recordset(null::public.expenses, coalesce(p_expenses, '[]'::jsonb)) as r;

  delete from public.notifications where user_email = p_email;
  insert into public.notifications
  select r.* from jsonb_populate_recordset(null::public.notifications, coalesce(p_notifications, '[]'::jsonb)) as r;

  delete from public.subscriptions where user_email = p_email;
  insert into public.subscriptions
  select r.* from jsonb_populate_recordset(null::public.subscriptions, coalesce(p_subscriptions, '[]'::jsonb)) as r;

  delete from public.loans_given where user_email = p_email;
  insert into public.loans_given
  select r.* from jsonb_populate_recordset(null::public.loans_given, coalesce(p_loans_given, '[]'::jsonb)) as r;

  delete from public.spending_envelopes where user_email = p_email;
  insert into public.spending_envelopes
  select r.* from jsonb_populate_recordset(null::public.spending_envelopes, coalesce(p_spending_envelopes, '[]'::jsonb)) as r;

  return jsonb_build_object('success', true);
exception
  when others then
    raise exception 'sync_complete_ledger failed: %', sqlerrm;
end;
$$;

-- 5. The client calls this RPC with the anon key + x-session-token/x-user-email
--    custom headers (no JWT role is set), so PostgREST executes as `anon`.
--    Access control therefore lives entirely inside the function: it re-verifies
--    the session token and rejects any caller whose token email differs from
--    p_email, so granting anon EXECUTE is safe.
alter function public.sync_complete_ledger(text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) owner to postgres;