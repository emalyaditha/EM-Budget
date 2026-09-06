-- Login brute-force lockout tracking.
-- Accessible only via the server's service-role key; RLS denies everything else.
create table if not exists public.login_attempts (
  email text primary key,
  failed_attempts integer not null default 0,
  locked_until bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.login_attempts enable row level security;

-- No policies: deny all for anon/authenticated. Only the service role
-- (backend, which bypasses RLS) reads/writes this table.