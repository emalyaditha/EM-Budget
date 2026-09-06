# EM-Budget Infrastructure Reference

Production stack: **Vite + React SPA** on Vercel, **Express** serverless API
(`api/index.js` bundling `api-src/index.ts`), **Supabase** (Postgres + Auth)
with a shared `vaults` secret stored in a DB function. SMTP email OTP via
Gmail app password. Sentry error monitoring (opt-in, off unless `SENTRY_DSN`).

---

## Environment variables

Set all of these in the **Vercel** project settings (Production + Preview).
None are committed to the repo except `.env.example` placeholders.

| Variable | Purpose | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL (public) | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Public anon key | Safe to embed client-side |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key for server API | Server-only, never bundle client-side |
| `SESSION_SECRET` | Signs `session_token` cookies | 64-hex; rotate = invalidates all sessions + re-seeds vault secret |
| `SESSION_TTL_HOURS` | Session lifetime (default 24) | Optional |
| `APP_ORIGIN` | Allowed CORS origin | e.g. `https://em-budget.vercel.app` |
| `SMTP_HOST` | SMTP server (e.g. `smtp.gmail.com`) | Leave blank to disable OTP email |
| `SMTP_PORT` | SMTP port | `465` for Gmail SSL |
| `SMTP_USER` | SMTP account | |
| `SMTP_PASS` | SMTP app password | Gmail app password, not the account password |
| `IDENTITY_ENV` | Identity provider env name | `prod` / `dev`; enables dev-OTP passthrough when `=` `dev` |
| `SENTRY_DSN` | Sentry error stream | Unset = Sentry disabled (lazy import skipped) |

Also set `VITE_SENTRY_DSN` if client-side error reporting is desired (not yet
wired in the client build).

### Setting them

```bash
# requires `vercel` CLI + auth (owner account)
cd <project>
vercel env add <NAME> production   # paste value
# preview/latest as needed
cat .env.vercel.placeholder         # do NOT copy .env (contains the live SMTP app password)
```

`SESSION_SECRET` must be a fresh 64-char hex string; do not reuse the value in
git history or on any other environment.

---

## API surface

| Route | Method | Purpose |
|---|---|---|
| `/healthz` | GET | Unauthenticated liveness probe (no DB/side effects) |
| `/api/diagnostics` | GET | Authed request-id + env diagnostics (rate-limited 60/min/account) |
| `/api/*` (auth, vault, accounts, cards, loans, installments, ledger, receipts, audit) | POST/GET/DELETE | JSON API, all sessions cookie/Bearer authed |

Instrumentation baked into the server:

- Every request gets `<uuid>` **request-id**, returned in `x-request-id` and
  echoed in structured JSON logs (`api-src/log.ts`).
- Request log line per request: `request-id, method, path, status, remote`,
  plus a `time` field measured from query-param start when present.
- Query params are scrubbed from logs (`client_data`, `code_challenge`,
  `token`). Login responses never log the OTP secret server-side.
- Rate limiter is **per-account** (memory Map, 60 req/min, 429s count).
- Errors route to Sentry via lazily-imported `@sentry/node` when `SENTRY_DSN`
  is set; otherwise logged only. `@sentry/node` is an optional dependency and
  is excluded from the serverless bundle at build time (esbuild
  `--external:@sentry/node`).

---

## Supabase

### Local config

Project linked via `supabase link --project-ref <ref>`. `db push` targets the
linked project (Management API; no local Postgres needed for pushes).

### Migrations

All migrations are timestamped `YYYYMMDDHHMMSS_name.sql` and applied with:

```bash
npm run db:migrate      # supabase db push --linked
```

> History note: migrations were **renamed** from human-readable names to the
> current `YYYYMMDDHHMMSS_` scheme on 2026-09-06. The remote remote-tracking
> history was rebased so push remains clean ("Remote database is up to date").
> Future work: add new migrations, never edit applied ones.

Rename map (old → new) for reference:

```
20260725_init                            -> 20260725000000
20260829_add_missing_indexes             -> 20260829000000
20260829_fix_auth_accounts_rls           -> 20260829120000
20260830_fix_subscriptions_rls           -> 20260830000000
20260831_pan_masking                     -> 20260831000000
20260831_rls_posture                     -> 20260831120000
20260902_app_lock                        -> 20260902000000
20260902_sync_schema_drift               -> 20260902120000
20260903_always_lock_on_open             -> 20260903000000
20260903_idle_lock_minutes               -> 20260903120000
20260903_secure_rls_posture              -> 20260903180000
20260904_drop_permissive_policies        -> 20260904000000
20260904_vault_secret_and_rls_fix        -> 20260904120000
20260904_vault_security_fix              -> 20260904180000
20260905_add_installment_tables          -> 20260905000000
20260905_add_login_lockout               -> 20260905060000
20260905_create_vault_table              -> 20260905120000
20260905_rename_ledger_states_column     -> 20260905180000
20260905_sync_complete_ledger_rpc        -> 20260905240000
20260906_fix_verify_functions_vault_secret -> 20260906000000
```

### Backups

One-shot backups live in `backups/` (git-ignored). They are full
`schema + data` `pg_dump` outputs obtained through the Supabase CLI, which
launches a Docker container, so Docker Desktop must be running (the script
tries to start it).

```bash
.\scripts\backup-db.ps1                          # write full-<stamp>.sql + manifest
.\scripts\restore-db.ps1 -Latest                  # DRY-RUN preview
.\scripts\restore-db.ps1 -Latest -Execute -Confirm  # destructive apply
```

Restore applies the dump through the Management API (`supabase db query
--linked`), which replaces the dumped objects + data. It does not need Docker.

Known cosmetic issue: `supabase migration list --linked` can fail with
`password authentication failed for user "cli_login_postgres"`; `db push
--linked` is unaffected.

---

## Local & CI

```bash
npm run lint          # eslint src + tsc --noEmit
npm test              # vitest unit/integration (jsdom)
npm run build         # vite build + esbuild serverless bundle (excludes @sentry/node)
npm run e2e           # playwright (uses system Chrome; e2e forces SMTP off)
```

E2E key facts (for writing new tests):

- `e2e/auth.ts` has helpers: `loginUser`, `signupUnsafe`, `resetData` etc.
- Wrong OTP is consumed server-side (fixed count-down), and `getTokenFromRequest`
  prefers the Bearer header then the `session_token` cookie.
- Tests run against a dev server started by the Playwright webServer config; a
  locally rotated `SESSION_SECRET` invalidates old sessions but the server
  re-seeds the shared vault secret on boot.

Formatting: Prettier via `.prettierrc.json` (2-space, single quotes, semicolons,
120 cols). Only session-touched files were reformatted this round to keep the
diff reviewable; format new files as you edit them (`npx prettier --write <path>`).

## Onboarding checklist

1. Clone; `npm ci`; create `.env` from `.env.example` (SMTP_PASS = real Gmail
   app password, never share; SESSION_SECRET = fresh 64-hex).
2. Unlock the vault with the seeded secret (default PIN flow) or run
   `supabase db push --linked` to sync seed.
3. `npm run dev` (tsx server on :3000) for local; `npm run lint` before committing.
4. Deploy: `vercel` after `npm run build` sets `api/index.js`.