/**
 * Live-tenant lifecycle for the Phase 4 handler goldens (#64).
 *
 * `INVENTORY.md` D22: a test that touches a real tenant must create it under a
 * unique prefix and delete it in a `finally`. That is harder here than it sounds,
 * because **the app has no account-deletion route** — `server.ts` implements
 * registration, OTP, password login, WebAuthn and app-lock, and nothing removes
 * an account. Auth is also entirely app-owned: `grep` finds no `signUp`,
 * `signInWithPassword` or GoTrue admin call in `server.ts` or `src/supabase.ts`,
 * and `auth_accounts` carries its own `password_hash` (`20260725000000_init.sql:9-16`).
 * So there is no Supabase Auth user to delete, and teardown means deleting rows.
 *
 * The row set below is not guessed. It is every table in `supabase/migrations/`
 * that carries an account column, read out of the DDL: sixteen tables key on
 * `user_email`, three on `email`, `auth_device_tokens` on `hashed_email`
 * (`server.ts:591` — `sha256` of the trimmed, lowercased address, which is why the
 * hash is recomputed here rather than looked up), and
 * `credit_card_installment_payments` has no account column at all — it cascades
 * from `credit_card_installments` (`20260905000000_add_installment_tables.sql:33`),
 * so its ids are captured before the parent delete and counted afterwards.
 * `auth_rate_limits` is keyed by a composite that embeds the email
 * (`server.ts:1504`) and holds no ledger data; it is cleared by that substring so
 * a run cannot leave a limiter behind for the next one.
 *
 * Nothing here prints a value from `.env`: the URL and the service-role key are
 * read, used, and never echoed, and every function returns counts and ids only.
 */

import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** `loadEnv` with an empty prefix: the service-role key is not a `VITE_` variable
 *  and must not be — it reaches client code if it is (`INVENTORY.md` §8). */
const env = loadEnv(process.env.NODE_ENV || 'development', ROOT, '');

const projectUrl = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim();
const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const appUrl = (env.APP_URL || 'http://localhost:3000').trim();

if (!projectUrl || !serviceKey) {
  throw new Error(
    'parity/live/tenant.ts needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env. ' +
      'Names only — neither value is read into a fixture, printed, or returned.',
  );
}

/** The app's own normalisation (`server.ts:674-676`), which the device-token hash
 *  is taken over. A tenant registered as `Foo@Bar` is stored lowercased. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const hashedEmail = (email: string): string => crypto.createHash('sha256').update(normalizeEmail(email)).digest('hex');

/** table → the column that holds the account. */
const BY_USER_EMAIL = [
  'app_lock_credentials',
  'bank_cards',
  'cash_accounts',
  'credit_card_installments',
  'debts',
  'expenses',
  'incomes',
  'ledger_states',
  'loans_given',
  'notifications',
  'spending_envelopes',
  'subscriptions',
  'transactions',
  'trusted_devices',
  'webauthn_challenges',
  'webauthn_credentials',
] as const;
const BY_EMAIL = ['auth_accounts', 'auth_otps', 'login_attempts'] as const;
const BY_HASHED_EMAIL = ['auth_device_tokens'] as const;

async function rest<T>(search: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${projectUrl}/rest/v1/${search}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    // The body is PostgREST's error, which names tables and columns — never user
    // data — so it is safe to surface.
    throw new Error(`${response.status} ${response.statusText} — ${search}: ${await response.text()}`);
  }
  // A successful DELETE is 204 with no body. Measured, not assumed: the first
  // teardown ran exactly this far and then threw in `JSON.parse`.
  const text = await response.text();
  if (text.length === 0) return null as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${search}: response was not JSON (${text.slice(0, 120)})`);
  }
}

/** HEAD + `Prefer: count=exact`: the total comes back in `content-range`, so no
 *  row is ever transferred. This is the only way to count a tenant's data without
 *  reading it. */
async function countBy(table: string, column: string, value: string): Promise<number> {
  const response = await fetch(
    `${projectUrl}/rest/v1/${table}?${column}=eq.${encodeURIComponent(value)}&select=${column}`,
    {
      method: 'HEAD',
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        prefer: 'count=exact',
        range: '0/0',
        'range-unit': 'items',
      },
    },
  );
  if (!response.ok) throw new Error(`${response.status} counting ${table}: ${await response.text()}`);
  const match = /\/(\d+)$/.exec(response.headers.get('content-range') || '');
  if (!match) throw new Error(`${table}: no content-range total returned`);
  return Number(match[1]);
}

/** Every row this tenant owns, by table. Includes the payments that only the
 *  parent cascade can reach, via the installment ids captured first. */
export async function inspect(email: string): Promise<Record<string, number>> {
  const normalized = normalizeEmail(email);
  const out: Record<string, number> = {};
  for (const table of BY_USER_EMAIL) out[table] = await countBy(table, 'user_email', normalized);
  for (const table of BY_EMAIL) out[table] = await countBy(table, 'email', normalized);
  out.auth_device_tokens = await countBy('auth_device_tokens', 'hashed_email', hashedEmail(email));
  const parents = await rest<{ id: string }[]>(
    `credit_card_installments?select=id&user_email=eq.${encodeURIComponent(normalized)}`,
  );
  out.credit_card_installment_payments = parents.length ? await countPayments(parents.map((p) => p.id)) : 0;
  return out;
}

/** `countBy` is one-value; the payments need an `in` list, so this is the same
 *  HEAD trick with a different filter. */
async function countPayments(ids: string[]): Promise<number> {
  const list = ids.map((i) => encodeURIComponent(i)).join(',');
  const response = await fetch(
    `${projectUrl}/rest/v1/credit_card_installment_payments?select=installment_id&installment_id=in.(${list})`,
    {
      method: 'HEAD',
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        prefer: 'count=exact',
        range: '0/0',
        'range-unit': 'items',
      },
    },
  );
  if (!response.ok) throw new Error(`${response.status} counting payments: ${await response.text()}`);
  return Number(/\/(\d+)$/.exec(response.headers.get('content-range') || '0/0')![1]);
}

/**
 * Delete everything the tenant owns, then prove it. The proof is the point:
 * `destroyTenant` throws if a single row survives, because a `finally` that
 * quietly leaks is how the QA addresses in D18/D19 accumulated.
 */
export async function destroyTenant(email: string): Promise<Record<string, number>> {
  const normalized = normalizeEmail(email);
  const before = await inspect(email);
  const parents = await rest<{ id: string }[]>(
    `credit_card_installments?select=id&user_email=eq.${encodeURIComponent(normalized)}`,
  );
  const paymentIds = parents.map((p) => p.id);

  for (const table of BY_USER_EMAIL) {
    await rest(`${table}?user_email=eq.${encodeURIComponent(normalized)}`, { method: 'DELETE' });
  }
  for (const table of BY_HASHED_EMAIL) {
    await rest(`${table}?hashed_email=eq.${encodeURIComponent(hashedEmail(email))}`, { method: 'DELETE' });
  }
  // `auth_accounts` last: it is the parent of the FK-cascading tables, and deleting
  // it first would hide a table whose own filter did not match.
  for (const table of BY_EMAIL) {
    await rest(`${table}?email=eq.${encodeURIComponent(normalized)}`, { method: 'DELETE' });
  }
  // Ephemeral limiter rows, keyed `${ip}:${path}:${email}` (`server.ts:1504`).
  await rest(`auth_rate_limits?key=like.*${encodeURIComponent(normalized)}*`, { method: 'DELETE' });

  const after = await inspect(email);
  const residualPayments = paymentIds.length ? await countPayments(paymentIds) : 0;
  const leaked = Object.entries(after).filter(([, n]) => n !== 0);
  if (residualPayments !== 0) leaked.push(['credit_card_installment_payments', residualPayments]);
  if (leaked.length > 0) {
    throw new Error(
      `destroyTenant left rows behind for ${normalized}: ${leaked.map(([t, n]) => `${t}=${n}`).join(', ')}. ` +
        'Every table this tenant can write must be in this module’s registry.',
    );
  }
  return before;
}

/**
 * Register through the app's own routes — `send-otp` → `verify-otp` → `register`,
 * exactly as `e2e/auth.ts` does, so the tenant is a real account created by real
 * code rather than a row inserted behind the app's back.
 *
 * Requires the dev server to run with `DEV_OTP_RESPONSE=true`, which returns the
 * passcode to the caller instead of mailing it. That is the only reason this can
 * be automated, and the only reason it must never be pointed at production.
 *
 * Measured on the first self-test, against the assumption I wrote it with:
 * `rememberMe: false` **still writes an `auth_device_tokens` row** — the register
 * path issues a device token regardless. `BY_HASHED_EMAIL` is therefore not
 * defensive padding; without it every tenant would leak one row, which is exactly
 * the accumulation D18/D19 is already sitting on.
 */
export async function createTenant(baseUrl: string, email: string, password: string): Promise<{ token: string }> {
  const post = async (route: string, body: unknown): Promise<{ status: number; data: any }> => {
    const response = await fetch(`${baseUrl}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl, referer: `${baseUrl}/` },
      body: JSON.stringify(body),
    });
    return { status: response.status, data: await response.json().catch(() => ({})) };
  };

  const send = await post('/api/auth/send-otp', { email });
  if (send.status !== 200 || !send.data?.success) throw new Error(`send-otp failed: ${send.status}`);
  const otp: string = send.data.devOtp || '';
  if (!/^\d{6}$/.test(otp)) {
    throw new Error('send-otp returned no dev passcode — the server is not running with DEV_OTP_RESPONSE=true');
  }
  const verify = await post('/api/auth/verify-otp', { email, otp, forRegistrationOrReset: true });
  if (verify.status !== 200 || !verify.data?.success) throw new Error(`verify-otp failed: ${verify.status}`);
  const register = await post('/api/auth/register', { email, password, otp, rememberMe: false });
  if (register.status !== 200 || !register.data?.success) throw new Error(`register failed: ${register.status}`);
  return { token: register.data.token };
}

export const uniqueEmail = (prefix: string): string => `${prefix}-${Date.now()}@example.com`;

/**
 * `npx tsx parity/live/tenant.ts --destroy <email>` — delete a tenant by name and
 * prove it. This exists because the first `--selftest` threw halfway through
 * teardown: the create had committed, `destroyTenant` had already deleted the
 * `user_email` tables when a parse error stopped it, and with no route to call
 * and no other way to name a row, the only repair for an orphan was this flag.
 *
 * It is deliberately not a bulk cleaner. One exact address per call, and
 * `destroyTenant` counts before and after, so a typo deletes nothing and reports
 * a tenant of zero rows rather than reaching for a pattern (D18/D19).
 *
 * Since the #64 gate it is also narrower: the address must be one a harness run
 * minted — `uniqueEmail`'s exact grammar, `<prefix>-<millis>@example.com`, the
 * stamp from `Date.now()`. Un-stamped names (`qa-harness@example.com`), other
 * domains, and anything a human typed are refused outright. Those tenants belong
 * to the D18 decision and its GO, not to this tool.
 */
if (process.argv.includes('--destroy')) {
  const email = process.argv[process.argv.indexOf('--destroy') + 1] || '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('usage: npx tsx parity/live/tenant.ts --destroy <exact email address>');
  }
  const local = normalizeEmail(email).split('@')[0];
  if (!/^[a-z0-9._-]+-\d{10,}$/.test(local) || !normalizeEmail(email).endsWith('@example.com')) {
    throw new Error(
      `--destroy refuses ${normalizeEmail(email)}: not a harness-minted tenant. ` +
        'Only addresses created by a run match <prefix>-<millis>@example.com (uniqueEmail). ' +
        'Everything else — including the older un-stamped qa-* names — is D18 scope and needs the user GO, not this tool.',
    );
  }
  const before = await inspect(email);
  const listed = Object.entries(before).filter(([, n]) => n > 0);
  console.log(`${normalizeEmail(email)}: ${listed.map(([t, n]) => `${t}=${n}`).join(', ') || '(no rows)'}`);
  await destroyTenant(email);
  const after = await inspect(email);
  const left = Object.entries(after).filter(([, n]) => n > 0);
  console.log(
    left.length === 0
      ? `destroyed ${normalizeEmail(email)} — every table back to zero`
      : `LEAK: ${JSON.stringify(left)}`,
  );
  if (left.length > 0) process.exitCode = 1;
}

/** The `auth_accounts` emails whose local part begins `<prefix>-`. Read-only
 *  inventory (D17): a prefix is allowed to *find* tenants, never to delete them
 *  (D19), and each one returned is then destroyed by its exact address. */
export async function listTenantsByPrefix(prefix: string): Promise<string[]> {
  if (!/^[A-Za-z0-9._-]+$/.test(prefix)) {
    throw new Error(`--leftover takes a plain prefix (letters, digits, dot, dash, underscore), got "${prefix}"`);
  }
  const rows = await rest<{ email: string }[]>(`auth_accounts?select=email&email=like.${prefix}*&order=email.asc`);
  return rows.map((r) => r.email);
}

/**
 * `npx tsx parity/live/tenant.ts --leftover <prefix>` — how many harness
 * tenants outlived their run. A teardown that lives in a hook still does not
 * run if the worker is killed outright, so the claim "the tenant is gone" is
 * only worth the count that proves it. Prints a number and the addresses
 * (nothing else — no table is even named), and deletes nothing.
 */
if (process.argv.includes('--leftover')) {
  const prefix = process.argv[process.argv.indexOf('--leftover') + 1] || '';
  const found = await listTenantsByPrefix(prefix);
  console.log(`${prefix}: ${found.length} leftover tenant(s)`);
  for (const email of found) {
    const minted =
      /^[a-z0-9._-]+-\d{10,}$/.test(normalizeEmail(email).split('@')[0]) &&
      normalizeEmail(email).endsWith('@example.com');
    console.log(
      minted
        ? `  ${email}  — destroy with: --destroy ${email}`
        : `  ${email}  — NOT destroyable here (no run stamp; D18 scope, needs the user GO)`,
    );
  }
  if (found.length > 0) process.exitCode = 1;
}

/** `npx tsx parity/live/tenant.ts --selftest` — create, count, delete, prove.
 *  Prints table counts and nothing else; this is the gate that lets #64 create
 *  tenants at all. */
if (process.argv.includes('--selftest')) {
  const base = process.env.QA_APP_URL || 'http://localhost:3000';
  const email = uniqueEmail('p64-selftest');
  const password = `Str0ngP@ss${Date.now()}`;
  let created = false;
  try {
    await createTenant(base, email, password);
    created = true;
    const rows = await inspect(email);
    const nonzero = Object.entries(rows).filter(([, n]) => n > 0);
    console.log(`created ${email}`);
    console.log(`rows after create: ${nonzero.map(([t, n]) => `${t}=${n}`).join(', ') || '(none)'}`);
    console.log(`auth_accounts row: ${rows.auth_accounts}`);
  } finally {
    if (created) {
      const before = await destroyTenant(email);
      const after = await inspect(email);
      const left = Object.entries(after).filter(([, n]) => n > 0);
      console.log(`rows at teardown: ${before['auth_accounts']}`);
      console.log(left.length === 0 ? 'TEARDOWN CLEAN — every table back to zero' : `LEAK: ${JSON.stringify(left)}`);
      if (left.length > 0) process.exitCode = 1;
    }
  }
}
