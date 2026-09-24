# EM-Budget Production-Grade Hardening — Spec: Phase 0 (Quality Gates) + Phase 1 (Security & Auth)

Date: 2026-09-13
Status: Draft — pending user review
Owner: Sisyphus orchestration session
Approach (approved): **Safety-net-first, incremental (strangler)** — every behavioral change lands behind a verification gate. No big-bang rewrites.

---

## 1. Context

EM-Budget is a React 19 + TypeScript + Vite SPA with an Express backend (`server.ts`, single-file, 3,334 lines) deployed to Vercel (single serverless function) with Supabase (PostgreSQL + custom cryptographic RLS). It is a personal finance app: OTP auth, HMAC-signed sessions, WebAuthn, app-lock PIN, SMTP 2FA, direct-to-Supabase ledger sync, OCR (Gemini + Tesseract).

Assessment findings (5 parallel audits, 2026-09-13) established:

**Already strong:** timing-safe HMAC tokens, OTP hashing + consume-on-failure, bcrypt + lockout, DB-level RLS with SECURITY DEFINER verifiers, CSP/HSTS, WebAuthn origin pinning, fail-closed prod DB posture, service-role key absent from client, zero secrets in logs, 30 timestamped migrations, INFRA.md/SECRETS.md runbooks.

**Critical gaps targeted by THIS spec:**

| #   | Gap                                                                                                                         | Severity |
| --- | --------------------------------------------------------------------------------------------------------------------------- | -------- |
| G1  | TypeScript `strict` fully off; 55 `as any` / 78 `: any`                                                                     | CRITICAL |
| G2  | ESLint covers only `src/`; `server.ts`, `api-src/`, `server/` unlinted; `no-explicit-any` off                               | HIGH     |
| G3  | Coverage configured but never enforced (no thresholds, no CI flag); no `test`/`typecheck`/`format` scripts                  | HIGH     |
| G4  | CI missing: `npm audit`, coverage, prettier check, e2e job                                                                  | MEDIUM   |
| G5  | `/api/auth/check-email` account enumeration (per-email rate bucket bypassable; raw `exists` boolean)                        | MEDIUM   |
| G6  | `sync_complete_ledger` (SQL) uses non-constant-time plain compare `v_signature != v_expected`; system token has no expiry   | MEDIUM   |
| G7  | Express baseline: `x-powered-by` leaked; global 20 MB body limit on auth routes; no Content-Type enforcement                | MEDIUM   |
| G8  | CSP `connect-src 'self' https: wss:` overly broad; Vercel static assets lack security headers                               | MEDIUM   |
| G9  | Nodemailer transporter + (kept) Supabase client created per-request; Tesseract worker per OCR request (resource exhaustion) | MEDIUM   |
| G10 | Server auth surface (OTP/session/WebAuthn/lockout) has **zero tests**                                                       | CRITICAL |

## 2. Goals & Non-Goals

Goals (this spec covers Phase 0 + Phase 1 only):

- G1–G4 closed: strict types, full lint scope, enforced coverage, production CI.
- G5–G9 closed with behavior-preserving fixes.
- G10 an auth-critical supertest safety net shipped **before** the G5–G9 behavior changes land (TDD order).

Non-goals (deferred, explicitly out of scope — later phases):

- `server.ts` module extraction, App.tsx decomposition, `any` eradication, a11y, bundle/perf work → Phase 3.
- Deploy automation, graceful shutdown, Docker HEALTHCHECK, backups cron, Sentry/uptime verification → Phase 4.
- Docs/ADRs, spec-to-code compliance audit → Phase 5.

## 3. Working Principles

1. **Green-to-green.** Every step starts from a passing `npm run lint && npx vitest run && npm run build` baseline and ends green. No intermediate broken states.
2. **Tests before behavior change.** Any G5–G9 fix that alters request/response behavior ships with a failing test first (red), then the fix (green).
3. **Non-breaking.** Client UI flows (login, register, PIN, sync, restore) keep working. The `exists` field of check-email and all documented API response shapes are preserved unless a test explicitly re-defines them.
4. **Delegation boundaries.** Files are partitioned so parallel worker agents never edit the same file concurrently. `server.ts` is single-writer per step; mechanical per-file fixes are parallel.
5. **Live DB safety.** SQL migrations are _authored and reviewed_ in this phase. Applying them to the linked Supabase project is an operator step executed only after the user approves the migration diff (`supabase db push --linked`).
6. **No new runtime deps** unless listed in this spec. Dev-deps: `supertest`, `@types/supertest` (required for G10).

## 4. PHASE 0 — Quality Gates

### T-1 TypeScript strict mode (incremental)

Location: `tsconfig.json`, all `.ts`/`.tsx` (tsc has no `include`, covers everything incl. server).

Sequence (each sub-step is a completed, green unit):

1. `strictNullChecks: true` → fix all errors (typed `null`/`undefined` handling everywhere).
2. `noImplicitAny: true` → type every implicit param/return (large scrub of `(item as any)`, `(err as any)`, `: any` in `src/`, `api-src/`, `server.ts`, `server/`).
3. `strict: true` (master switch incl. strictFunctionTypes / strictBindCallApply / strictPropertyInitialization / useUnknownInCatchVariables) → fix remainder.

Explicit decisions:

- `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are **deferred to Phase 3** (decomposition) to avoid churn on monoliths.
- New file `src/vite-env.d.ts`: declare `ImportMetaEnv` interface for `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `VITE_API_URL` / `DEV` — eliminates the `(import.meta as any).env` pattern.
- `(window as any)` & `(mql as any)` casts get typed via proper local interfaces instead of `any`.
- Where a cast is genuinely required, use `unknown`-bridging (`as unknown as T`) only with a comment; `no-explicit-any` (T-4) flags the rest.

Acceptance: `tsc --noEmit` exits 0 with `strict: true`; `npm run lint` green; count of `: any` / `as any` reduced to zero in application code (allowlist documented if exceptional).

Risk control: if a single sub-step exceeds ~40 changed files, stop, report, and split into per-area passes (src/lib, src/components, api-src, server.ts) rather than force-merging.

### T-2 Quality scripts

`package.json` scripts:

- `"test": "vitest run"`
- `"test:watch": "vitest"`
- `"test:coverage": "vitest run --coverage"`
- `"typecheck": "tsc --noEmit"`
- `"format": "prettier --write ."`
- `"format:check": "prettier --check ."`
- `"lint": "eslint src/ server.ts server/ api-src/ && tsc --noEmit"` (scope expanded — see T-4)
- `"lint:fix": "eslint src/ server.ts server/ api-src/ --fix"`

Dev-deps added: none new here (supertest comes in G10).

### T-3 Coverage enforcement

1. Baseline: run `npx vitest run --coverage`; record statement/branch/function/line percentages.
2. `vitest.config.ts`: add `coverage.thresholds` starting at `max(60%, baseline − 5%)` for statements/functions/lines and `max(50%, baseline − 10%)` for branches.
3. Ratchet: Phase 2 raises thresholds to ≥ 80/70/75/75 as server tests land. (Ratchet-up only, never down.)

Acceptance: `npm run test:coverage` green with thresholds; CI runs it (T-5).

### T-4 ESLint expansion + rule restoration

`eslint.config.js`:

- Extend `files` scope to `src/**/*.{ts,tsx}`, `server.ts`, `server/**/*.ts`, `api-src/**/*.ts`.
- `@typescript-eslint/no-explicit-any: warn` (both rule variants configured for non-type-aware pass).
- `@typescript-eslint/no-unused-vars: warn` stays (already `_`-tolerant).
- Add `@typescript-eslint/consistent-type-imports: warn` (mechanical, safe).
- Add `no-console: warn` **only for `src/`** via an override block — server logging is the structured-logging pipeline and stays exempt. Exempt `logger`/`console.error` in `api-src/log.ts` explicitly.
- **Deferred:** type-aware linting (`@typescript-eslint/strict` family, `no-floating-promises`) until Phase 2 lands, when extracted route modules can be type-checked in isolation.

Acceptance: `npm run lint` green over the full scope; `--max-warnings 0` in CI (T-5).

### T-5 CI expansion (`.github/workflows/verify-build.yml`)

Extend the existing `validate` job and add one job:

- `validate` job additions:
  - `npm audit --audit-level=high` (blocks on high/critical).
  - Replace `npx vitest run` with `npm run test:coverage` (enforces T-3).
  - `npx prettier --check .` (format gate).
  - Add `--max-warnings 0` to the lint step (full-scope eslint).
- New `e2e` job (ubuntu-latest):
  - checkout → setup-node (Node 22, npm cache) → `npm ci`.
  - Install Google Chrome: `sudo apt-get update && sudo apt-get install -y google-chrome-stable` (playwright config uses `channel: 'chrome'`).
  - `npx playwright install --with-deps` (browser deps only as configured).
  - `npm run e2e` with `DEV_OTP_RESPONSE=true` env (already how the local webserver runs).
  - Runs after `validate` passes.

Acceptance: CI green across both jobs on a test push; job durations documented.

## 5. PHASE 1 — Security & Auth Hardening

Ordering note: **G10 (tests) runs first** — the safety net that makes behavior changes verifiable. Then G5→G9.

### S-0 Server auth tests (prereq safety net) — resolves G10

- Add devDeps: `supertest`, `@types/supertest`.
- New dir: `api-src/__tests__/` (vitest picks it up via default include).
- Test harness: import `createApp()` from `server.ts`; run with `NODE_ENV=test`, `SESSION_SECRET` set, and **no Supabase env vars** → `getSupabase()` returns null → in-memory `mockDb` path activates (IS_PRODUCTION=false). This tests the real handlers end-to-end through Express without touching the live DB.
- **Test isolation (mandatory):** supertest hits `127.0.0.1` and `mockDb` is a closure (not externally resettable), so rate-limit and lockout counters persist across tests in one process. Every test uses a **unique email** and a **per-test `X-Forwarded-For` IP** (trusted via `trust proxy = 1`) so buckets and lockout cooldowns never bleed between tests. Assert any per-test state reset only through app re-creation (`createApp()` fresh per describe block where needed).
- Suite (auth-critical ≥ 60% of the security surface):
  1. `check-email`: 200 shape for valid email; 400 for invalid; success/error responses identical in shape.
  2. `send-otp` → `verify-otp` happy path issues session token (cookie + body).
  3. `verify-otp` wrong OTP → consumed (second attempt with same OTP fails); 429 after burst.
  4. `register` (OTP-gated): full happy path; duplicate email rejected.
  5. `login-password`: correct login; wrong password × 5 → lockout (423/429 with Retry-After) and cooldown respected.
  6. `verify-session`: valid token passes + rotation; tampered token rejected; expired token rejected.
  7. App-lock: PIN set/verify happy; PIN wrong × 5 → lockout; PIN validation rejects 1234/sequential.
  8. Device trust: issue → check (cookie) → revoke; revoke-all clears cookie.
  9. Token unit tests: `generateSecureToken`/`verifySecureToken` — valid, tampered-signature, expired, malformed, wrong-email.
- These tests **lock the behavior contract** that S-1…S-8 must not break.

Acceptance: new suite ≥ 40 tests green; `npm run test:coverage` still green.

### S-1 check-email enumeration fix — resolves G5

Location: `server.ts` `/api/auth/check-email` (line ~1443) + `rateLimitAuth` (line ~1342).

Fixes (non-breaking; `exists` and response shape preserved — EmailLogin.tsx:133 depends on it):

1. New `rateLimitIp(limit, windowMs)` factory in `server.ts` beside `rateLimitAuth`: key = `${req.ip}:${req.path}` (email-independent). Apply on top of the existing per-email limit at `20/min/email` + `60/min/IP`.
2. Uniform response timing: after the account-existence lookup (and on the error path too), wait `60 + Math.random() * 140` ms before responding — removes the timing side-channel between existing/non-existing accounts.
3. WARN log line (not error — this is expected probing) when the IP bucket trips.

Tests: same-IP burst of 61 different emails → 429; verify responses for existing vs non-existing emails are shape-identical; jitter present in both paths.

### S-2 Constant-time SQL compare + system-token expiry — resolves G6

Two coordinated changes:

1. `server.ts` `generateSystemToken()` (~line 326): add `expiresAt: Date.now() + 5 * 60 * 1000` to the payload.
2. New migration `supabase/migrations/20260913120000_constant_time_token_compare.sql`:
   - Rewrite the signature check in `sync_complete_ledger` (migration `20260905240000`, line ~90-93) from `v_signature != v_expected` to comparing freshly-computed digests of both sides:
     `extensions.hmac(v_signature, v_secret, 'sha256') = extensions.hmac(v_expected, v_secret, 'sha256')`
     (both sides hashed with the same key → fixed-length, attacker-controlled length/prefix removed).
   - `verify_user_token()` and `verify_system_signature()` (migration `20260906000000`): verify the same digest-compare pattern is used (they currently use `hmac()` on the payload — align any remaining plain compares); extend `verify_system_signature` to reject tokens whose `expiresAt` is in the past (new required claim).
   - No data changes; function-body replaces only (same signatures).

Apply procedure: **operator step.** Review the migration diff, run `npm run db:migrate` (`supabase db push --linked`), then smoke-test: dev server start (vault seeding logs `[Vault] session_secret synced`), full ledger sync from the app UI, subscription refresh RPC.

Tests: token unit tests extended for system-token expiry; migration validated by successful post-apply sync smoke (behavioral, manual).

### S-3 Express baseline hardening — resolves G7

Location: `server.ts` top of `createApp` (~line 36-44) + `/api` middleware chain.

1. `app.disable('x-powered-by')`.
2. Replace global `express.json({ limit: '20mb' })` / `urlencoded({ limit: '20mb' })` with `limit: '256kb'`.
3. Mount dedicated `express.json({ limit: '2mb' })` instances only on the two OCR routes: `app.use('/api/ocr', ...)` and `app.use('/api/gemini', ...)` (currently global 20MB covers them; they enforce their own 2MB base64 check — the parser limit now matches).
4. Content-Type middleware on `/api` state-changing methods: if `content-type` header is present and is not `application/json` (or `application/*+json`), respond 415 `{ success:false, error:'Unsupported content type.' }`. Absent header → pass (current body-parser behavior: `req.body` stays empty/undefined-shape as today).

Risk note: reduce the default limit, then rely on e2e (`core.spec.ts` + restore/import flows) + the S-0 supertest to catch any legitimate >256KB POST; if a flow legitimately exceeds 256KB it is raised to the user before this change lands.

Tests: supertest asserts 415 on form-encoded POST to auth routes; 413 on oversized JSON body to auth routes; OCR routes still accept 2MB.

### S-4 CSP narrowing + env-driven origin — resolves G8

Location: `server.ts` security-headers middleware (~line 1216-1244); `index.html`.

**Deployment-scoping (critical to read first):** who serves `index.html` determines whose CSP governs the page:

- **Docker / plain Node deploy:** Express serves the SPA. The S-4 narrowed CSP (built at boot from env) governs the page → safe to narrow because the Supabase origin is known at boot.
- **Vercel deploy:** Vercel edge serves `index.html` and `/assets/*` directly (rewrite `/api/*` → function). Express headers only reach `/api` responses and do **not** govern the page. The page's CSP comes from S-5's `vercel.json` headers, which cannot interpolate env. Therefore S-5 ships the **current working production policy verbatim** (broad, parity — no regression), and S-4's narrowing is effective only on non-Vercel deployments. This is a deliberate, documented split.

Changes:

1. Build the CSP string at **app boot** from `process.env.VITE_SUPABASE_URL` (fallback `SUPABASE_URL`):
   - parse origin + host; `connect-src 'self' <supabaseOrigin> wss://<supabaseHost> https://fonts.googleapis.com https://fonts.gstatic.com`
   - when no Supabase URL configured (dev without sync): keep current `'self' https: wss:` (cannot narrow — documented).
   - Keep all other directives unchanged (script-src, style-src, img-src, frame-ancestors, object-src, base-uri, form-action).
2. `index.html`: replace the hardcoded Supabase URL in `preconnect`/`dns-prefetch` with Vite env substitution (`%VITE_SUPABASE_URL%`).

Verification: e2e run + browser console filtered for CSP violations on the dev server (Express-served → narrowed policy is what's tested); Gemini OCR is server-side (unaffected); direct Supabase sync still works.

### S-5 Vercel security headers for static assets — resolves G8(-tail)

Location: `vercel.json` headers block.

Add for `/assets/(.*)` and `/index.html` (fill the gap where Vercel serves static files directly without the Express middleware):

- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- CSP: **the current production directive set verbatim** (see S-4 deployment-scoping — parity, not the narrowed boot-time policy; vercel.json cannot interpolate env, so no Supabase-origin-specific value is embedded):
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https: wss:; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'`

Keep existing Cache-Control headers. `/api` responses keep Express headers too (duplicate values are identical — harmless; on Vercel they don't govern the page anyway).

### S-6 Supabase client & system token strategy

Decision (documented, not a code change in this phase): keep per-request `getSupabase()` client creation — `createClient` is cheap; correctness of the freshly-minted system token per request is preferred over pooling, and the S-2 system-token expiry removes the stale-token risk that would otherwise force pooling. Client pooling + request-context token injection is deferred to Phase 2 (after server module extraction) where it is testable in isolation.

### S-7 Nodemailer transporter caching — resolves G9(-a)

Location: `server.ts` `send-otp` (~line 1502) and `send-delete-otp` (~line 2713).

New `getTransporter()` singleton in `server.ts`: created once on first use, cached module-level;
`{ pool: true, maxConnections: 3, maxMessages: 100, secure: SMTP_PORT === '465', ...env-config }`.
Both routes call it. On transporter create/send failure: log via `logError` (Sentry path) and return the existing 500 shape.
Keep the `DEV_OTP_RESPONSE` path intact (dev OTP leak stays gated behind `NODE_ENV !== 'production'` — add a boot-time WARN when the flag is on).

Tests: supertest asserts `send-otp` with SMTP env vars absent still returns the dev-OOB code path (mock-friendly); unit test asserts the transporter is created once (module-level identity).

### S-8 OCR concurrency guard — resolves G9(-b)

Location: `server.ts` `/api/ocr/free-scan` (~line 3131).

- In-memory semaphore: `const OCR_SLOTS = 2` concurrent Tesseract jobs.
- On saturation: immediate 429 `{ success:false, error:'OCR service is busy. Please retry shortly.' }` (serverless-friendly — no queue).
- Worker create/run/terminate wrapped with a 20s hard timeout; `finally` releases the slot and terminates the worker.
- Gemini route: unchanged (external API; its own 10/min rate limit suffices — no memory risk).

Tests: unit test for the semaphore (saturated → 429, release → accepted); existing OCR route 2MB + MIME allowlist tests from S-0 extend to cover the 429 path.

## 6. Verification Strategy (every step)

1. **Gate:** `npm run lint` (full scope, --max-warnings 0) + `npm run typecheck` + `npm run test:coverage` + `npm run build` must be green.
2. **Runtime smoke:** dev server starts on :3000; `/healthz` and `/api/health` 200; e2e `auth.spec.ts` + `core.spec.ts` pass (real Chrome via playwright).
3. **Regression:** all pre-existing 16 unit files + 4 e2e specs remain green; no pre-existing test deleted or weakened (constraint-driven-development guard: coverage thresholds ratchet up only).
4. **Security re-check:** after S-1…S-8, re-run the security survey tooling (team-mode security-review skill) over changed files; no new HIGH findings introduced.

## 7. Execution Strategy (how the work gets done)

- Phase 0 T-1 strict passes: parallel per-area workers (src/lib, src/components, context+hooks, api-src, server.ts single-writer) each fixing their partition against the flag step; orchestrator merges, runs the gate, advances the flag.
- G10 tests authored first (TDD red), then S-1…S-8 fixes (green).
- Skills loaded per workstream: `security-and-hardening`, `test-driven-development`, `code-review-and-quality`, `constraint-driven-development`, `differential-review` (post-change verification).
- `server.ts` edits are strictly serialized (one writer at a time) to avoid merge chaos on the monolith.
- Migrations: authored + reviewed, then **operator-apply gate** (user approves diff → `supabase db push --linked` → smoke).

## 8. Risks & Mitigations

| Risk                                                               | Mitigation                                                                                                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TS strict on 4k-line monoliths produces unmanageable error surface | Incremental flags; per-area splits; 40-file convergence cap per sub-step with escalation                                                               |
| CSP narrowing breaks an unseen client integration                  | e2e + browser console violation check; fall back to current broad policy if broken                                                                     |
| Body-limit reduction rejects a legit flow                          | e2e + S-0 supertest; escalate to user before landing if a legit >256KB POST exists                                                                     |
| Migration breaks live sync                                         | Function-body replaces only (no data change); operator-apply gate + post-apply sync smoke; migration can be rolled back by re-pushing previous version |
| Parallel agents collide on `server.ts`                             | Single-writer rule; all other parallelism is file-partitioned                                                                                          |
| Scope creep into Phase 3+                                          | Explicit non-goals section; momus plan review gate before execution                                                                                    |

## 9. Exit Criteria

Phase 0: `strict:true` green; full-scope lint green (@max-warnings 0); coverage thresholds set + green; CI runs audit/coverage/prettier/e2e; quality scripts present.
Phase 1: S-0 suite green (auth surface ≥ 60% covered); S-1…S-8 implemented + tests green; both new migrations authored + reviewed (apply = operator gate); e2e green; no new HIGH security findings.

## 10. Out of Scope (explicit)

- `server.ts` / `App.tsx` decomposition, `any` eradication beyond T-1, component tests, a11y, bundle/perf → Phase 3.
- Deploy automation, graceful shutdown, Docker HEALTHCHECK, backup scheduling, monitoring verification → Phase 4.
- ADRs, compliance audit, coverage ratchet-up beyond Phase 0 targets → Phase 2/5.
- Express 4→5 upgrade, native `bcrypt` swap, dependency upgrades beyond what `npm audit --audit-level=high` demands.
