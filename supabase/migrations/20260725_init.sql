-- =========================================================================
-- EM Budget Database Initialization and Security Policies Migration
-- =========================================================================

-- ENABLE CRYPTO EXTENSION
create extension if not exists pgcrypto;

-- 1. DATABASE TABLES SCHEMA SETUP
create table if not exists public.auth_accounts (
  email text not null primary key,
  password_hash text not null,
  name text,
  avatar_url text,
  created_at bigint not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.ledger_states (
  id text not null primary key,
  user_email text not null references public.auth_accounts(email) on delete cascade,
  data jsonb not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint ledger_states_user_email_key unique (user_email)
);

create table if not exists public.bank_cards (
  id text not null primary key,
  user_email text not null references public.auth_accounts(email) on delete cascade,
  card_name text not null,
  bank_name text not null,
  card_type text not null,
  current_balance numeric not null,
  card_number text,
  is_canceled boolean default false,
  "limit" numeric,
  is_limit_locked boolean default true,
  is_frozen boolean default false,
  card_theme text default 'obsidian',
  locked_amount numeric default 0,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.cash_accounts (
  id text not null primary key,
  user_email text not null references public.auth_accounts(email) on delete cascade,
  name text not null,
  balance numeric not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.transactions (
  id text not null primary key,
  user_email text not null references public.auth_accounts(email) on delete cascade,
  type text not null,
  title text not null,
  amount numeric not null,
  charge numeric default 0,
  transfer_charge numeric default 0,
  date text not null,
  category text not null,
  account_id text,
  account_type text,
  target_account_id text,
  target_account_type text,
  reference_id text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.debts (
  id text not null primary key,
  user_email text not null references public.auth_accounts(email) on delete cascade,
  debt_source text not null,
  total_amount numeric not null,
  remaining_amount numeric not null,
  due_date text not null,
  notes text,
  payments jsonb,
  account_id text,
  account_type text,
  account_name text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.incomes (
  id text not null primary key,
  user_email text not null references public.auth_accounts(email) on delete cascade,
  amount numeric not null,
  date text not null,
  source text not null,
  category text not null,
  target_account_id text,
  target_type text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.expenses (
  id text not null primary key,
  user_email text not null references public.auth_accounts(email) on delete cascade,
  title text not null,
  description text,
  amount numeric not null,
  date text not null,
  category text not null,
  payment_method_id text,
  payment_method_type text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.notifications (
  id text not null primary key,
  user_email text not null references public.auth_accounts(email) on delete cascade,
  type text not null,
  message text not null,
  date text not null,
  read boolean default false,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.subscriptions (
  id text not null primary key,
  user_email text not null references public.auth_accounts(email) on delete cascade,
  name text not null,
  amount numeric not null,
  billing_cycle text not null,
  due_date text not null,
  category text not null,
  status text not null,
  payment_method_id text,
  payment_method_type text,
  last_paid_date text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.loans_given (
  id text not null primary key,
  user_email text not null references public.auth_accounts(email) on delete cascade,
  borrower_name text not null,
  total_amount numeric not null,
  remaining_amount numeric not null,
  date_given text not null,
  source_account_id text,
  source_account_type text,
  source_account_name text,
  status text not null,
  notes text,
  settlements jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.spending_envelopes (
  id text not null primary key,
  user_email text not null references public.auth_accounts(email) on delete cascade,
  category text not null,
  "limit" numeric not null,
  spent numeric not null,
  icon text,
  sub_breakdown jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.auth_otps (
  email text not null,
  otp text not null,
  expires_at bigint not null,
  for_deletion boolean default false not null,
  primary key (email, for_deletion)
);

create table if not exists public.auth_device_tokens (
  token text not null primary key,
  hashed_email text not null,
  expires_at bigint not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.auth_rate_limits (
  key text not null primary key,
  count integer not null default 1,
  reset_time timestamp with time zone not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. CRYPTOGRAPHIC VERIFICATION FUNCTIONS Setup (Zero Fallbacks)
create or replace function public.verify_user_token(headers json) returns text as $$
declare
  token text;
  email text;
  parts text[];
  payload_str text;
  signature text;
  expected_signature text;
  payload json;
  expires_at bigint;
  secret text;
begin
  if headers is null then
    return null;
  end if;
  
  token := coalesce(headers->>'x-session-token', headers->>'X-Session-Token', headers->>'x-Session-Token');
  email := coalesce(headers->>'x-user-email', headers->>'X-User-Email', headers->>'x-User-Email');
  if token is null or email is null then
    return null;
  end if;
  
  parts := string_to_array(token, '.');
  if array_length(parts, 1) != 2 then
    return null;
  end if;
  
  payload_str := parts[1];
  signature := parts[2];
  
  -- Get secret strictly from DB configuration with no fallback to hardcoded keys
  secret := nullif(current_setting('app.settings.session_secret', true), '');
  if secret is null then
    return null;
  end if;
  
  expected_signature := encode(hmac(payload_str, secret, 'sha256'), 'hex');
  if signature != expected_signature then
    return null;
  end if;
  
  payload_str := rpad(replace(replace(payload_str, '-', '+'), '_', '/'), (ceil(length(payload_str) / 4.0) * 4)::integer, '=');
  payload := convert_from(decode(payload_str, 'base64'), 'utf-8')::json;
  
  expires_at := (payload->>'expiresAt')::bigint;
  if expires_at < (date_part('epoch', now()) * 1000)::bigint then
    return null;
  end if;
  
  if lower(payload->>'email') = lower(email) then
    return lower(email);
  end if;
  
  return null;
exception
  when others then
    return null;
end;
$$ language plpgsql security definer;

create or replace function public.verify_system_signature(headers json) returns boolean as $$
declare
  token text;
  parts text[];
  payload_str text;
  signature text;
  expected_signature text;
  secret text;
begin
  if headers is null then
    return false;
  end if;
  
  token := headers->>'x-system-token';
  if token is null then
    return false;
  end if;
  
  parts := string_to_array(token, '.');
  if array_length(parts, 1) != 2 then
    return false;
  end if;
  
  payload_str := parts[1];
  signature := parts[2];
  
  secret := nullif(current_setting('app.settings.session_secret', true), '');
  if secret is null then
    return false;
  end if;
  
  expected_signature := encode(hmac(payload_str, secret, 'sha256'), 'hex');
  return signature = expected_signature;
exception
  when others then
    return false;
end;
$$ language plpgsql security definer;

-- 3. ROW LEVEL SECURITY (RLS) ACTIVATION
alter table public.ledger_states enable row level security;
alter table public.bank_cards enable row level security;
alter table public.cash_accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.debts enable row level security;
alter table public.incomes enable row level security;
alter table public.expenses enable row level security;
alter table public.notifications enable row level security;
alter table public.subscriptions enable row level security;
alter table public.loans_given enable row level security;
alter table public.spending_envelopes enable row level security;
alter table public.auth_rate_limits enable row level security;
alter table public.auth_otps enable row level security;
alter table public.auth_device_tokens enable row level security;

-- DROP PERMISSIVE AND LEGACY POLICIES
drop policy if exists "Allow all on states" on public.ledger_states;
drop policy if exists "Allow all on cards" on public.bank_cards;
drop policy if exists "Allow all on cash" on public.cash_accounts;
drop policy if exists "Allow all on tx" on public.transactions;
drop policy if exists "Allow all on debts" on public.debts;
drop policy if exists "Allow all on incomes" on public.incomes;
drop policy if exists "Allow all on expenses" on public.expenses;
drop policy if exists "Allow all on notifications" on public.notifications;
drop policy if exists "Allow all on subscriptions" on public.subscriptions;
drop policy if exists "Allow all on loans_given" on public.loans_given;
drop policy if exists "Allow all on envelopes" on public.spending_envelopes;

-- DROP OTHER LEGACY POLICIES
drop policy if exists "Secure select on states" on public.ledger_states;
drop policy if exists "Secure insert on states" on public.ledger_states;
drop policy if exists "Secure update on states" on public.ledger_states;
drop policy if exists "Secure select on cards" on public.bank_cards;
drop policy if exists "Secure insert on cards" on public.bank_cards;
drop policy if exists "Secure update on cards" on public.bank_cards;
drop policy if exists "Secure delete on cards" on public.bank_cards;
drop policy if exists "Secure select on cash" on public.cash_accounts;
drop policy if exists "Secure insert on cash" on public.cash_accounts;
drop policy if exists "Secure update on cash" on public.cash_accounts;
drop policy if exists "Secure delete on cash" on public.cash_accounts;
drop policy if exists "Secure select on tx" on public.transactions;
drop policy if exists "Secure insert on tx" on public.transactions;
drop policy if exists "Secure update on tx" on public.transactions;
drop policy if exists "Secure delete on tx" on public.transactions;
drop policy if exists "Secure select on debts" on public.debts;
drop policy if exists "Secure insert on debts" on public.debts;
drop policy if exists "Secure update on debts" on public.debts;
drop policy if exists "Secure delete on debts" on public.debts;
drop policy if exists "Secure select on incomes" on public.incomes;
drop policy if exists "Secure insert on incomes" on public.incomes;
drop policy if exists "Secure update on incomes" on public.incomes;
drop policy if exists "Secure delete on incomes" on public.incomes;
drop policy if exists "Secure select on expenses" on public.expenses;
drop policy if exists "Secure insert on expenses" on public.expenses;
drop policy if exists "Secure update on expenses" on public.expenses;
drop policy if exists "Secure delete on expenses" on public.expenses;
drop policy if exists "Secure select on notifications" on public.notifications;
drop policy if exists "Secure insert on notifications" on public.notifications;
drop policy if exists "Secure update on notifications" on public.notifications;
drop policy if exists "Secure delete on notifications" on public.notifications;
drop policy if exists "Secure select on subscriptions" on public.subscriptions;
drop policy if exists "Secure insert on subscriptions" on public.subscriptions;
drop policy if exists "Secure update on subscriptions" on public.subscriptions;
drop policy if exists "Secure delete on subscriptions" on public.subscriptions;
drop policy if exists "Secure select on loans_given" on public.loans_given;
drop policy if exists "Secure insert on loans_given" on public.loans_given;
drop policy if exists "Secure update on loans_given" on public.loans_given;
drop policy if exists "Secure delete on loans_given" on public.loans_given;
drop policy if exists "Secure select on envelopes" on public.spending_envelopes;
drop policy if exists "Secure insert on envelopes" on public.spending_envelopes;
drop policy if exists "Secure update on envelopes" on public.spending_envelopes;
drop policy if exists "Secure delete on envelopes" on public.spending_envelopes;

-- 4. TENANT PRIVACY PRESERVATION POLICIES SETUP (SOUND & VERIFIED)
create policy "Secure select on states" on public.ledger_states for select
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure insert on states" on public.ledger_states for insert
with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure update on states" on public.ledger_states for update
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));


create policy "Secure select on cards" on public.bank_cards for select
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure insert on cards" on public.bank_cards for insert
with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure update on cards" on public.bank_cards for update
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure delete on cards" on public.bank_cards for delete
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));


create policy "Secure select on cash" on public.cash_accounts for select
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure insert on cash" on public.cash_accounts for insert
with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure update on cash" on public.cash_accounts for update
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure delete on cash" on public.cash_accounts for delete
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));


create policy "Secure select on tx" on public.transactions for select
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure insert on tx" on public.transactions for insert
with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure update on tx" on public.transactions for update
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure delete on tx" on public.transactions for delete
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));


create policy "Secure select on debts" on public.debts for select
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure insert on debts" on public.debts for insert
with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure update on debts" on public.debts for update
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure delete on debts" on public.debts for delete
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));


create policy "Secure select on incomes" on public.incomes for select
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure insert on incomes" on public.incomes for insert
with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure update on incomes" on public.incomes for update
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure delete on incomes" on public.incomes for delete
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));


create policy "Secure select on expenses" on public.expenses for select
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure insert on expenses" on public.expenses for insert
with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure update on expenses" on public.expenses for update
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure delete on expenses" on public.expenses for delete
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));


create policy "Secure select on notifications" on public.notifications for select
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure insert on notifications" on public.notifications for insert
with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure update on notifications" on public.notifications for update
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure delete on notifications" on public.notifications for delete
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));


create policy "Secure select on subscriptions" on public.subscriptions for select
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure insert on subscriptions" on public.subscriptions for insert
with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure update on subscriptions" on public.subscriptions for update
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure delete on subscriptions" on public.subscriptions for delete
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));


create policy "Secure select on loans_given" on public.loans_given for select
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure insert on loans_given" on public.loans_given for insert
with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure update on loans_given" on public.loans_given for update
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure delete on loans_given" on public.loans_given for delete
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));


create policy "Secure select on envelopes" on public.spending_envelopes for select
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure insert on envelopes" on public.spending_envelopes for insert
with check (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure update on envelopes" on public.spending_envelopes for update
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

create policy "Secure delete on envelopes" on public.spending_envelopes for delete
using (user_email = public.verify_user_token(nullif(current_setting('request.headers', true), '')::json) or public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));


-- SYSTEM ACCESS ONLY TABLES
drop policy if exists "Secure system access on auth_otps" on public.auth_otps;
create policy "Secure system access on auth_otps" on public.auth_otps for all
using (public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

drop policy if exists "Secure system access on auth_device_tokens" on public.auth_device_tokens;
create policy "Secure system access on auth_device_tokens" on public.auth_device_tokens for all
using (public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

drop policy if exists "Secure system access on auth_rate_limits" on public.auth_rate_limits;
create policy "Secure system access on auth_rate_limits" on public.auth_rate_limits for all
using (public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

drop policy if exists "Secure insert on auth_accounts" on public.auth_accounts;
create policy "Secure insert on auth_accounts" on public.auth_accounts for insert
with check (public.verify_system_signature(nullif(current_setting('request.headers', true), '')::json));

-- 5. PERFORMANCE AND UTILITY INDEXES Setup
create index if not exists idx_ledger_states_user_email on public.ledger_states(user_email);
create index if not exists idx_bank_cards_user_email on public.bank_cards(user_email);
create index if not exists idx_cash_accounts_user_email on public.cash_accounts(user_email);
create index if not exists idx_transactions_user_email on public.transactions(user_email);
create index if not exists idx_debts_user_email on public.debts(user_email);
create index if not exists idx_incomes_user_email on public.incomes(user_email);
create index if not exists idx_expenses_user_email on public.expenses(user_email);
create index if not exists idx_notifications_user_email on public.notifications(user_email);
create index if not exists idx_subscriptions_user_email on public.subscriptions(user_email);
create index if not exists idx_loans_given_user_email on public.loans_given(user_email);
create index if not exists idx_spending_envelopes_user_email on public.spending_envelopes(user_email);
