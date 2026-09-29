-- =========================================================================
-- EM Budget: Tier-2 hardening — constant-time signature compare in
-- sync_complete_ledger (2026-09-29)
--
-- The RPC compared the raw HMAC hex signature with a plain `!=`, which
-- short-circuits byte-by-byte and leaks matched-prefix length through
-- response timing. This replaces it with the same HMAC-digest comparison
-- used by verify_user_token (20260906000000): both candidate strings are
-- re-HMACed with the session secret and the fixed-length outputs compared,
-- so the work performed no longer depends on where the strings differ.
--
-- Everything else in the function is byte-identical to 20260905240000.
-- Idempotent: CREATE OR REPLACE FUNCTION + owner set can run any number of
-- times.
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

  -- Secret: prefer the vault seed, then the platform GUC fallback.
  v_secret := nullif((select v.value from public.vault v where v.key = 'session_secret'), '');
  if v_secret is null then
    v_secret := nullif(current_setting('app.settings.session_secret', true), '');
  end if;
  if v_secret is null then
    return jsonb_build_object('success', false, 'error', 'Unauthorized: session secret not configured.');
  end if;

  v_expected := encode(extensions.hmac(v_payload_str, v_secret, 'sha256'), 'hex');
  -- Constant-time comparison (see verify_user_token, 20260906000000): HMAC both
  -- candidate strings and compare the fixed-length digests so the work
  -- performed does not depend on the matched prefix of the raw signature.
  if encode(extensions.hmac(v_signature, v_secret, 'sha256'), 'hex')
     != encode(extensions.hmac(v_expected, v_secret, 'sha256'), 'hex') then
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

alter function public.sync_complete_ledger(text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) owner to postgres;
