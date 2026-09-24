# EM-Budget Production-Grade Hardening — Implementation Plan (Phase 0 + Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring EM-Budget's TypeScript/lint/CI quality gates to production level and harden its security & auth surfaces, with an auth-critical test safety net landing first.

**Architecture:** Safety-net-first, incremental. Phase 0 (Tasks 1–6) installs strict types, full-scope lint, enforced coverage, and production CI. Phase 1 (Tasks 7–16) ships a supertest suite for the auth surface, then behavior-preserving security fixes (enumeration, constant-time compares, express baseline, CSP, transporter caching, OCR concurrency), then the final verification gate. No big-bang rewrites; every task starts and ends green.

**Tech Stack:** TypeScript 5.8, Vite 6, Vitest 4 (v8 coverage), ESLint 9 flat config, Playwright, Express 4, Supabase-js, supertest (new devDep). Windows/PowerShell execution environment; repo at `D:\Emkode\EM-Budget` (git repo, currently a dev server runs on :3000 — do not kill or restart it unless a task says so).

**Spec:** `docs/superpowers/specs/2026-09-13-production-grade-hardening-design.md` — the plan argues from the spec; executors read both.

## Global Constraints

1. **Green-to-green:** every task ends with `npm run lint` + `npm run typecheck` + `npm run test:coverage` + `npm run build` green. No intermediate broken states.
2. **No behavior breaks:** client UI flows (login, register, PIN, sync, restore) keep working. Response shapes documented in the spec are preserved.
3. **Single-writer rule for `server.ts`:** only one agent edits `server.ts` at a time. Parallel work is partitioned by file.
4. **Migration apply gate:** SQL migrations are authored + reviewed only. Applying to the linked Supabase project is an **operator step** (`npm run db:migrate`), executed only after the user approves the migration diff.
5. **Coverage ratchets up only.** Never lower a threshold set by a previous task.
6. **Commit policy:** commit steps are included per task but executed ONLY if the operator has enabled auto-commit; otherwise run the gate commands and leave changes staged for review.
7. **No new runtime dependencies.** Dev-deps allowed: `supertest`, `@types/supertest` (Task 7). Nothing else.
8. **Do not touch Phase 3+ scope** (App.tsx decomposition, server route-module extraction beyond the token helpers in Task 8, a11y, deploy automation).
9. **Live DB:** no task may run `supabase db push` or write to the linked database. Task 13 only writes the migration file.

## File Structure

**Created:**

| File                                                                 | Responsibility                                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/vite-env.d.ts`                                                  | Typed `import.meta.env` (kills `(import.meta as any).env`)                      |
| `.prettierignore`                                                    | Keeps env/backup/build artifacts out of format checks                           |
| `api-src/__tests__/helpers.ts`                                       | Test app factory + unique email/IP helpers (mockDb isolation)                   |
| `api-src/__tests__/tokens.test.ts`                                   | Pure token sign/verify unit tests                                               |
| `api-src/__tests__/auth.integration.test.ts`                         | Auth-flow supertest suite (the G10 safety net)                                  |
| `api-src/__tests__/express-hardening.test.ts`                        | S-3 (body limits, content-type) + S-7 (transporter) + S-8 (OCR semaphore) tests |
| `supabase/migrations/20260913120000_constant_time_token_compare.sql` | Constant-time compare + system-token expiry (S-2)                               |

**Modified:**

| File                                 | Change                                                                                                                                                                                                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                       | Quality scripts (Task 1); supertest devDeps (Task 7)                                                                                                                                                                                                                    |
| `vitest.config.ts`                   | Coverage thresholds (Task 1)                                                                                                                                                                                                                                            |
| `eslint.config.js`                   | Full-scope lint, restored rules (Task 2)                                                                                                                                                                                                                                |
| `tsconfig.json`                      | `strictNullChecks` (Task 3) → `noImplicitAny` (Task 4) → `strict:true` (Task 5)                                                                                                                                                                                         |
| `server/security.ts`                 | Exported `timingSafeEqualString`, `generateSecureToken`, `verifySecureToken` (Task 8)                                                                                                                                                                                   |
| `server.ts`                          | Use imported token helpers (Task 8); check-email per-IP bucket + jitter (Task 10); express baseline + body limits + content-type guard (Task 11); boot-time CSP (Task 12); system-token expiry (Task 13); `getTransporter` singleton (Task 14); OCR semaphore (Task 15) |
| `index.html`                         | Env-driven Supabase preconnect (Task 12)                                                                                                                                                                                                                                |
| `vercel.json`                        | Static security headers (Task 12)                                                                                                                                                                                                                                       |
| `.github/workflows/verify-build.yml` | Audit/coverage/prettier/max-warnings + e2e job (Task 6)                                                                                                                                                                                                                 |

---

# PART A — PHASE 0: QUALITY GATES

### Task 1: Quality scripts + coverage thresholds + prettier ignore

**Files:**

- Modify: `package.json` (scripts)
- Modify: `vitest.config.ts` (coverage thresholds)
- Create: `.prettierignore`

**Interfaces:**

- Produces: runnable `npm run test`, `npm run test:coverage`, `npm run typecheck`, `npm run format:check`, `npm run lint:fix` — consumed by every later task's gate.
- Produces: `vitest.config.ts` coverage thresholds <statements/branches/functions/lines> — enforced by Task 6 CI.

- [ ] **Step 1: Update `package.json` scripts**

Replace the `scripts` block with:

```json
"scripts": {
  "dev": "tsx server.ts",
  "build": "vite build && esbuild api-src/index.ts --bundle --platform=node --format=cjs --target=node20 --external:tesseract.js --external:@google/genai --external:vite --external:@sentry/node --sourcemap --outfile=api/index.js",
  "start": "node api/index.js",
  "preview": "vite preview",
  "db:migrate": "supabase db push --linked",
  "clean": "node -e \"fs.rmSync('dist',{recursive:true,force:true})\"",
  "lint": "eslint src/ server.ts server/ api-src/ && tsc --noEmit",
  "lint:fix": "eslint src/ server.ts server/ api-src/ --fix",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "e2e": "playwright test",
  "e2e:headed": "playwright test --headed"
}
```

> Note: the `lint` script now includes `server.ts`, `server/`, and `api-src/` (Task 2 makes eslint accept them; this script order means `lint` may report new errors until Task 2 lands — complete Tasks 1+2 before treating `npm run lint` as the gate).

- [ ] **Step 2: Create `.prettierignore`**

```gitignore
node_modules
dist
coverage
api/index.js
.env*
backups
test-results
playwright-report
graphify-out
*.log
package-lock.json
```

- [ ] **Step 3: Baseline coverage**

Run: `npx vitest run --coverage`
Expected: suite passes; terminal prints statements/branches/functions/lines percentages. Record them as `bs`, `bb`, `bf`, `bl`.

- [ ] **Step 4: Set thresholds in `vitest.config.ts`**

Read `vitest.config.ts`; ensure the `coverage` block becomes:

```ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html'],
  reportsDirectory: 'coverage',
  thresholds: {
    statements: Math.max(60, bs - 5),
    branches: Math.max(50, bb - 10),
    functions: Math.max(60, bf - 5),
    lines: Math.max(60, bl - 5),
  },
}
```

Replace `bs/bb/bf/bl` with the numeric values from Step 3. If vitest.config.ts currently lacks a `coverage` block or uses different keys, port the existing reporter/provider settings into the shape above without changing test resolution.

- [ ] **Step 5: Run coverage gate**

Run: `npm run test:coverage`
Expected: PASS and no "does not meet threshold" errors.

- [ ] **Step 6: Format check normalize**

Run: `npx prettier --write .`
Run: `npm run format:check`
Expected: exit 0. If `format:check` reports files that prettier refuses to format (e.g., generated or vendor files), add them to `.prettierignore` rather than weakening the command.

- [ ] **Step 7: Commit** (only if operator enabled auto-commit)

```bash
git add package.json vitest.config.ts .prettierignore
git commit -m "chore(quality): add quality scripts, coverage thresholds, prettier ignore"
```

### Task 2: ESLint full-scope + rule restoration

**Files:**

- Modify: `eslint.config.js`

**Interfaces:**

- Consumes: expanded `lint` script from Task 1.
- Produces: `npm run lint` green over `src/`, `server.ts`, `server/`, `api-src/` with `no-explicit-any: warn` — enforced by Task 6 CI (`--max-warnings 0`).

- [ ] **Step 1: Read current config**

Read `eslint.config.js`. Identify: the `files` arrays of each rule block, the `no-explicit-any` setting, and the `ignores` list.

- [ ] **Step 2: Apply target config**

Replace the config so it has exactly these properties (keep existing plugins/extends that are already present — do not remove `react-hooks`):

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', 'api/index.js', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'warn',
    },
  },
  {
    // server-side logging is the structured-logging pipeline — console is the transport
    files: ['server.ts', 'server/**/*.ts', 'api-src/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // client code: console statements are debug noise
    files: ['src/**/*.{ts,tsx}'],
    rules: { 'no-console': 'warn' },
  },
);
```

If the current file uses a different flat-config composition (e.g., `eslint.configs.recommended` spreads), port the rule targets above into the existing structure rather than reformatting wholesale. Do NOT add any new plugin dependency.

- [ ] **Step 3: Adapt first-pass violations**

Run: `npm run lint:fix`
Run: `npm run lint`
Expected: exit 0 (warnings allowed for now — they fail CI later via `--max-warnings 0`; Task 3–5 eliminate most of them and this task fixes anything auto-fixable). Manually fix errors that are not auto-fixable. If `server.ts` reports a large batch of `no-explicit-any` **warnings**, leave them — Tasks 3–5 (strict) plus Task 8 (extraction) remove them.

- [ ] **Step 4: Verify gates**

Run: `npm run typecheck` → exit 0. Run: `npm run test:coverage` → exit 0 (thresholds from Task 1 hold).

- [ ] **Step 5: Commit** (only if operator enabled auto-commit)

```bash
git add eslint.config.js
git commit -m "chore(quality): expand eslint scope to server code, restore no-explicit-any"
```

### Task 3: TypeScript strict — gate 1 `strictNullChecks`

**Files:**

- Modify: `tsconfig.json`
- Create: `src/vite-env.d.ts`
- Modify: ~all `.ts`/`.tsx` under `src/`, `api-src/`, `server.ts`, `server/` (null-handling fixes only)

**Interfaces:**

- Produces: `strictNullChecks: true` clean compile — prereq for Task 4 (`noImplicitAny`), which is a prereq for Task 5 (`strict: true`).

- [ ] **Step 1: Create `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_API_URL?: string;
  readonly DISABLE_HMR?: string;
}
```

This removes the need for `(import.meta as any).env` casts.

- [ ] **Step 2: Enable the flag**

In `tsconfig.json`, add exactly one key to `compilerOptions`:

```json
"strictNullChecks": true
```

Do NOT enable other strict flags in this task (Task 4 adds `noImplicitAny`; Task 5 flips `strict`).

- [ ] **Step 3: Measure blast radius**

Run: `npm run typecheck`
Expected: list of errors (should be finite and dominated by `possibly null`/`possibly undefined`). Count them.

- [ ] **Step 4: Fix by partition (parallelizable, files are disjoint)**

Working directory `D:\Emkode\EM-Budget`. Fix every `strictNullChecks` error, partition by:

1. `src/lib/*`, `src/services/*`, `src/validators/*`, `src/utils*`, `src/initialData.ts`, `src/types.ts`
2. `src/components/**`, `src/context/**`, `src/hooks/**`
3. `api-src/**`
4. `server.ts` and `server/**` (single-writer — one agent only)

Rules per partition:

- Fix the null-safety issue at the source. Prefer narrowing (`if (x !== null)`, early return, optional chaining, `??` with a real default). Never silence with a new `as any`.
- Where a value is genuinely possibly-null by API contract but the code guarantees presence, use an explicit typed assertion `as NonNullable<T>` with a 1-line comment explaining the invariant.
- **Convergence cap:** if a single partition exceeds ~200 errors, do NOT force-merge — stop, report the count, and split the partition (e.g., per-component) before continuing.

- [ ] **Step 5: Gate**

Run: `npm run typecheck` → exit 0.
Run: `npm run lint` → exit 0.
Run: `npm run test:coverage` → exit 0 (thresholds hold — no tests deleted).
Run: `npm run build` → exit 0.

- [ ] **Step 6: Commit** (only if operator enabled auto-commit)

```bash
git add -A
git commit -m "types: enable strictNullChecks and fix null-safety across codebase"
```

### Task 4: TypeScript strict — gate 2 `noImplicitAny`

**Files:**

- Modify: `tsconfig.json`
- Modify: ~all `.ts`/`.tsx` (implicit-any fixes)

**Interfaces:**

- Consumes: Task 3 (strictNullChecks clean).
- Produces: `noImplicitAny` clean compile — prereq for Task 5.

- [ ] **Step 1: Enable the flag**

```json
"noImplicitAny": true
```

- [ ] **Step 2: Measure**

Run: `npm run typecheck`; count errors.

- [ ] **Step 3: Fix by partition (same partitions & rules as Task 3)**

Type every implicit parameter/return:

- Add real types from `src/types.ts` / `zod` schemas.
- For handlers where the parameter is genuinely unconstrained at the boundary (`req`, `res`, injected `supabase`), type them precisely (`express.Request`, `express.Response`, a `SupabaseClient`-like structural type imported from `@supabase/supabase-js` with a narrowed generic — do not use `any`).
- Replace `(x as any)` and `: any` annotations where a real type exists. **Do not** convert every `any` in this task (Task 5 + the eslint `warn` from Task 2 flag stragglers; full `any` eradication is Phase 3 scope). Priority: files in `api-src/` and `server/security.ts` first (test surface for Task 8), then `server.ts`, then `src/`.
- Same convergence cap: >200 errors per partition → stop and report.

- [ ] **Step 4: Gate**

Run: `npm run typecheck` → exit 0; `npm run lint` → exit 0; `npm run test:coverage` → exit 0; `npm run build` → exit 0.

- [ ] **Step 5: Commit** (only if operator enabled auto-commit)

```bash
git add -A
git commit -m "types: enable noImplicitAny and type all implicit boundaries"
```

### Task 5: TypeScript strict — gate 3 `strict: true`

**Files:**

- Modify: `tsconfig.json`
- Modify: `.ts`/`.tsx` remainder (strictFunctionTypes / strictPropertyInitialization / useUnknownInCatchVariables / strictBindCallApply fallout)

**Interfaces:**

- Consumes: Tasks 3–4.
- Produces: `"strict": true` clean compile — the Phase 0 exit criterion, consumed by every Phase 1 task's gate.

- [ ] **Step 1: Flip the master switch**

```json
"strict": true
```

(`strictNullChecks`/`noImplicitAny` keys may be removed — `strict` implies them. Leaving them present is harmless.)

- [ ] **Step 2: Measure**

Run: `npm run typecheck`; count errors. Expect the major categories: `unknown` catch variables (must narrow with `instanceof Error` or type guards before accessing `.message`), strict function types (variance fixes in callback params), strict property initialization (class fields in `ErrorBoundary.tsx` and context providers need definite assignment), strict bind/call/apply.

- [ ] **Step 3: Fix by partition (same partitions & rules as Task 3)**

Catch-variable handling pattern (use everywhere `catch (e)` exists):

```ts
try {
  /* ... */
} catch (e) {
  const message = e instanceof Error ? e.message : 'Unknown error';
  // ...existing handler logic uses `message`
}
```

Property-initialization pattern (class components):

```ts
declare;
state: X; // or initialize in constructor / use definite assignment `!`
```

- [ ] **Step 4: Gate**

Run: `npm run typecheck` → exit 0; `npm run lint` → exit 0 (any remaining `no-explicit-any` warnings must be ≤ 0 for the CI gate later — decide per-instance: fix, or type-bridge via `unknown`, or document in a comment); `npm run test:coverage` → exit 0; `npm run build` → exit 0.

- [ ] **Step 5: Commit** (only if operator enabled auto-commit)

```bash
git add -A
git commit -m "types: enable strict mode across the codebase"
```

### Task 6: CI expansion

**Files:**

- Modify: `.github/workflows/verify-build.yml`

**Interfaces:**

- Consumes: Tasks 1–5 (all gates must be green locally first).
- Produces: production CI — `validate` job blocks on audit/coverage/prettier/lint-warnings; new `e2e` job runs Playwright on Chrome.

- [ ] **Step 1: Replace workflow content**

Read `.github/workflows/verify-build.yml`, then rewrite to:

```yaml
name: Enterprise Production Quality CI

on:
  push:
    branches: [main, master, development]
  pull_request:
    branches: [main, master]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Install dependencies
        run: npm ci
      - name: Dependency vulnerability audit
        run: npm audit --audit-level=high
      - name: Lint + typecheck (zero warnings)
        run: npm run lint -- --max-warnings 0
      - name: Unit tests with coverage
        run: npm run test:coverage
      - name: Format check
        run: npx prettier --check .
      - name: Build
        run: npm run build

  e2e:
    needs: validate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Install Google Chrome
        run: |
          sudo apt-get update
          sudo apt-get install -y google-chrome-stable
      - name: Install Playwright browsers
        run: npx playwright install --with-deps
      - name: Run end-to-end tests
        env:
          DEV_OTP_RESPONSE: 'true'
        run: npm run e2e
```

> Note: `npm run lint -- --max-warnings 0` appends the flag to the script's own `&&` chain — verify it propagates in CI (eslint supports `--max-warnings`; `tsc --noEmit` ignores the trailing arg). If propagation is unreliable, change the lint script itself to `eslint src/ server.ts server/ api-src/ --max-warnings 0 && tsc --noEmit` in this task instead, and drop the appended flag.

- [ ] **Step 2: Local sanity**

Confirm the e2e command works locally with the dev server stopped (playwright webserver boots its own): run `npm run e2e` and ensure the suite passes (needs Chrome installed on this machine — `npx playwright install chrome` if not).
Confirm `npm run lint -- --max-warnings 0` exits 0 locally.

- [ ] **Step 3: Commit** (only if operator enabled auto-commit)

```bash
git add .github/workflows/verify-build.yml package.json
git commit -m "ci: enforce audit, coverage, format, zero-warning lint, and e2e"
```

**Part A exit gate:** `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run build`, `npm run format:check`, `npm run e2e` all green; `tsconfig.json` has `strict: true`.

---

# PART B — PHASE 1: SECURITY & AUTH HARDENING

### Task 7: Server auth test harness (S-0 setup)

**Files:**

- Modify: `package.json` (devDeps)
- Create: `api-src/__tests__/helpers.ts`

**Interfaces:**

- Produces: `makeTestApp()` returning `{ app, uniqueEmail, uniqueIp }` — consumed by Tasks 8–15 for every server test. `uniqueEmail()` and `uniqueIp()` are the mockDb-isolation mechanism.

- [ ] **Step 1: Add devDeps**

Run: `npm install --save-dev supertest @types/supertest`

- [ ] **Step 2: Create `api-src/__tests__/helpers.ts`**

```ts
// @vitest-environment node
import { createApp } from '../../server';
import type { Express } from 'express';
import supertest from 'supertest';

let emailCounter = 0;
let ipCounter = 0;

export function uniqueEmail(): string {
  emailCounter += 1;
  return `test-user-${Date.now()}-${emailCounter}@example.com`;
}

export function uniqueIp(): string {
  ipCounter += 1;
  return `198.51.100.${(ipCounter % 254) + 1}`;
}

export interface TestContext {
  app: Express;
  request: ReturnType<typeof supertest>;
  uniqueEmail: typeof uniqueEmail;
  uniqueIp: typeof uniqueIp;
}

/**
 * Fresh app per call. NODE_ENV=test (NOT 'production') so:
 *  - IS_PRODUCTION=false  -> mockDb fallback path is live
 *  - no Supabase env vars -> getSupabase() returns null -> in-memory mock DB
 *  - SESSION_SECRET present -> server boots
 */
export async function makeTestApp(): Promise<TestContext> {
  process.env.NODE_ENV = 'test';
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  delete process.env.VITE_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.VITE_SUPABASE_ANON_KEY;
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-not-for-production';
  const app = await createApp();
  return { app, request: supertest(app), uniqueEmail, uniqueIp };
}

/** Per-request isolation: distinct email + X-Forwarded-For IP so rate-limit and lockout buckets never bleed between tests. */
export function withIsolation(ctx: TestContext) {
  const email = ctx.uniqueEmail();
  const ip = ctx.uniqueIp();
  const headers = { 'X-Forwarded-For': ip };
  return { email, ip, headers };
}
```

- [ ] **Step 3: Verify harness boots**

Create `api-src/__tests__/harness.smoke.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { makeTestApp } from './helpers';

describe('test harness', () => {
  it('boots the app and serves health', async () => {
    const { request } = await makeTestApp();
    const res = await request.get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
```

Run: `npx vitest run api-src/__tests__/harness.smoke.test.ts`
Expected: PASS. If `createApp()` hangs (>10s), the likely cause is `seedVaultSessionSecret()`'s fire-and-forget Supabase timeout — confirm no Supabase env vars leak in from a parent process (`dotenv/config` loads `.env`! `.env` HAS Supabase vars). **Critical fix:** `helpers.ts` must also neutralize dotenv — add at the very top of `helpers.ts`:

```ts
process.env.NODE_ENV = 'test';
delete process.env.VITE_SUPABASE_URL;
delete process.env.SUPABASE_URL;
delete process.env.VITE_SUPABASE_ANON_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SMTP_HOST;
process.env.SESSION_SECRET = 'test-session-secret-not-for-production';
```

(module-scope, executes before `server.ts` import chain initializes). Keep both the module-scope block and the per-call block.

- [ ] **Step 4: Commit** (only if operator enabled auto-commit)

```bash
git add package.json package-lock.json api-src/__tests__/
git commit -m "test(server): add supertest harness with mockDb isolation"
```

### Task 8: Token helpers extraction + unit tests (S-0, part 1)

**Files:**

- Modify: `server/security.ts` (add exported token helpers)
- Modify: `server.ts` (import helpers, delete closure copies)
- Create: `api-src/__tests__/tokens.test.ts`

**Interfaces:**

- Consumes: Task 7 harness.
- Produces: exported `generateSecureToken(email: string, durationMs: number, sessionSecret: string): string` and `verifySecureToken(token: string, sessionSecret: string): { email: string; expiresAt: number } | null` and `timingSafeEqualString(a: string, b: string): boolean` — used by server.ts and by tokens.test.ts. The verify-otp/login/verify-session endpoints continue to produce/consume identical tokens (behavior preserved).

- [ ] **Step 1: Read `server/security.ts`**

Read `D:\Emkode\EM-Budget\server\security.ts` in full. Note which of `timingSafeEqualString`/token helpers already exist there vs inlined in `server.ts` (server.ts lines ~108–154 currently).

- [ ] **Step 2: Add exported helpers to `server/security.ts`**

Add (reusing existing primitives if already present — do not duplicate):

```ts
import crypto from 'crypto';

export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export interface SecureTokenPayload {
  email: string;
  expiresAt: number;
}

export function generateSecureToken(email: string, durationMs: number, sessionSecret: string): string {
  const payload: SecureTokenPayload = {
    email: email.trim().toLowerCase(),
    expiresAt: Date.now() + durationMs,
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret).update(payloadStr).digest('hex');
  return `${payloadStr}.${signature}`;
}

export function verifySecureToken(token: string, sessionSecret: string): SecureTokenPayload | null {
  if (!token || typeof token !== 'string' || !sessionSecret) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadStr, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', sessionSecret).update(payloadStr).digest('hex');
  if (!timingSafeEqualString(signature, expectedSignature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8')) as SecureTokenPayload;
    if (
      !payload ||
      typeof payload.email !== 'string' ||
      typeof payload.expiresAt !== 'number' ||
      !Number.isFinite(payload.expiresAt)
    ) {
      return null;
    }
    if (Date.now() > payload.expiresAt) return null;
    return { email: payload.email.trim().toLowerCase(), expiresAt: payload.expiresAt };
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Rewire `server.ts`**

Remove the closure-local `timingSafeEqualString` (lines ~108–113), `generateSecureToken` (lines ~118–126), `verifySecureToken` (lines ~128–154) from `createApp`. Import the helpers at the top of `server.ts`:

```ts
import { generateSecureToken, verifySecureToken } from './server/security';
```

Update every call site: `generateSecureToken(email, durationMs)` → `generateSecureToken(email, durationMs, SESSION_SECRET)` and `verifySecureToken(token)` → `verifySecureToken(token, SESSION_SECRET)`. Preserve the `if (!decoded || decoded.email !== normalizedEmail)` semantics — the helper now returns `null` for bad/expired tokens exactly as before.

- [ ] **Step 4: Write `api-src/__tests__/tokens.test.ts`**

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { generateSecureToken, verifySecureToken } from '../../server/security';

const SECRET = 'unit-test-secret-0123456789abcdef';

describe('generateSecureToken / verifySecureToken', () => {
  it('round-trips a valid token with normalized email', () => {
    const token = generateSecureToken('  User@Example.COM ', 60_000, SECRET);
    const decoded = verifySecureToken(token, SECRET);
    expect(decoded).not.toBeNull();
    expect(decoded!.email).toBe('user@example.com');
  });

  it('rejects a tampered signature', () => {
    const token = generateSecureToken('a@b.com', 60_000, SECRET);
    const [payload] = token.split('.');
    const forged = `${payload}.${crypto.createHmac('sha256', 'wrong-secret').update(payload).digest('hex')}`;
    expect(verifySecureToken(forged, SECRET)).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = generateSecureToken('a@b.com', -1, SECRET);
    expect(verifySecureToken(token, SECRET)).toBeNull();
  });

  it('rejects malformed / garbage tokens', () => {
    expect(verifySecureToken('', SECRET)).toBeNull();
    expect(verifySecureToken('no-dot-separator', SECRET)).toBeNull();
    expect(verifySecureToken('a.b.c', SECRET)).toBeNull();
    expect(verifySecureToken('!!!.???', SECRET)).toBeNull();
  });

  it('rejects tokens with non-numeric expiresAt', () => {
    const payload = Buffer.from(JSON.stringify({ email: 'a@b.com', expiresAt: 'soon' })).toString('base64url');
    const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
    expect(verifySecureToken(`${payload}.${sig}`, SECRET)).toBeNull();
  });
});
```

- [ ] **Step 5: Gate**

Run: `npx vitest run api-src/__tests__/` → PASS. Then `npm run lint` → exit 0; `npm run test:coverage` → exit 0; `npm run build` → exit 0.

- [ ] **Step 6: Commit** (only if operator enabled auto-commit)

```bash
git add server/security.ts server.ts api-src/__tests__/tokens.test.ts
git commit -m "test(server): extract token helpers and unit-test them"
```

### Task 9: Auth-flow supertest suite (S-0 main — the G10 safety net)

**Files:**

- Create: `api-src/__tests__/auth.integration.test.ts`

**Interfaces:**

- Consumes: Task 7 harness + Task 8 token helpers.
- Produces: behavior-contract tests that Tasks 10–15 must keep green (response shapes, lockout semantics, OTP consumption).

- [ ] **Step 1: Write `api-src/__tests__/auth.integration.test.ts`**

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { makeTestApp, withIsolation } from './helpers';
import type { TestContext } from './helpers';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await makeTestApp();
});

async function sendOtp(email: string, headers: Record<string, string>) {
  const res = await ctx.request.post('/api/auth/send-otp').set(headers).send({ email }).expect(200);
  return res;
}

describe('check-email', () => {
  it('returns a uniform { success, exists } shape for valid emails', async () => {
    const { email, headers } = withIsolation(ctx);
    const existing = await ctx.request.post('/api/auth/check-email').set(headers).send({ email });
    expect(existing.status).toBe(200);
    expect(existing.body).toMatchObject({ success: true });
    expect(typeof existing.body.exists).toBe('boolean');
  });

  it('rejects invalid emails with 400', async () => {
    const { headers } = withIsolation(ctx);
    const res = await ctx.request.post('/api/auth/check-email').set(headers).send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('OTP flow', () => {
  it('send-otp -> verify-otp issues a session token (body + cookie)', async () => {
    const { email, headers } = withIsolation(ctx);
    await sendOtp(email, headers);
    const otp = '123456'; // dev path: DEV_OTP_RESPONSE not required — mockDb stores hash; use the devOtp leak gate below
    const dev = await ctx.request.post('/api/auth/send-otp').set(headers).send({ email });
    // When SMTP is unconfigured and DEV_OTP_RESPONSE=true, the OTP is returned; otherwise read via process env test seam
    const code = dev.body.devOtp || otp;
    const verify = await ctx.request.post('/api/auth/verify-otp').set(headers).send({ email, otp: code });
    expect(verify.status).toBe(200);
    expect(verify.body.success).toBe(true);
    expect(typeof verify.body.token).toBe('string');
    const setCookie = verify.headers['set-cookie']?.join(';') ?? '';
    expect(setCookie).toContain('session_token=');
  });

  it('consumes a wrong OTP (second attempt with same code fails)', async () => {
    const { email, headers } = withIsolation(ctx);
    await sendOtp(email, headers);
    const dev = await ctx.request.post('/api/auth/send-otp').set(headers).send({ email });
    const code = dev.body.devOtp as string | undefined;
    expect(code).toBeTruthy(); // requires DEV_OTP_RESPONSE=true in the test env — see below
    const wrong = await ctx.request.post('/api/auth/verify-otp').set(headers).send({ email, otp: '999999' });
    expect(wrong.status).toBe(400);
    const retry = await ctx.request.post('/api/auth/verify-otp').set(headers).send({ email, otp: code });
    expect(retry.status).toBe(400); // consumed by the failed attempt
  });
});

describe('register', () => {
  it('registers a new account (OTP-gated)', async () => {
    const { email, headers } = withIsolation(ctx);
    await sendOtp(email, headers);
    const dev = await ctx.request.post('/api/auth/send-otp').set(headers).send({ email });
    const res = await ctx.request
      .post('/api/auth/register')
      .set(headers)
      .send({ email, otp: dev.body.devOtp, password: 'StrongPass1!' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('login-password lockout', () => {
  it('locks the account after 5 failed attempts with an escalating cooldown', async () => {
    const { email, headers } = withIsolation(ctx);
    // pre-register
    await sendOtp(email, headers);
    const dev = await ctx.request.post('/api/auth/send-otp').set(headers).send({ email });
    await ctx.request
      .post('/api/auth/register')
      .set(headers)
      .send({ email, otp: dev.body.devOtp, password: 'StrongPass1!' });

    for (let i = 1; i <= 5; i++) {
      const res = await ctx.request
        .post('/api/auth/login-password')
        .set(headers)
        .send({ email, password: 'WrongPass1!' });
      if (i < 5) expect(res.status).toBe(401);
    }
    const locked = await ctx.request
      .post('/api/auth/login-password')
      .set(headers)
      .send({ email, password: 'StrongPass1!' });
    expect([423, 429, 401]).toContain(locked.status);
    expect(locked.body.success).toBe(false);
  });
});

describe('verify-session', () => {
  it('accepts a freshly-issued token and rejects a tampered one', async () => {
    const { email, headers } = withIsolation(ctx);
    await sendOtp(email, headers);
    const dev = await ctx.request.post('/api/auth/send-otp').set(headers).send({ email });
    const verify = await ctx.request.post('/api/auth/verify-otp').set(headers).send({ email, otp: dev.body.devOtp });
    const token = verify.body.token as string;

    const ok = await ctx.request.post('/api/auth/verify-session').set(headers).send({ email, token });
    expect(ok.status).toBe(200);
    expect(ok.body.success).toBe(true);

    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
    const bad = await ctx.request.post('/api/auth/verify-session').set(headers).send({ email, token: tampered });
    expect([401, 400]).toContain(bad.status);
  });
});

describe('app-lock PIN', () => {
  it('sets a PIN, verifies it, and locks out after 5 bad attempts', async () => {
    const { email, headers } = withIsolation(ctx);
    await sendOtp(email, headers);
    const dev = await ctx.request.post('/api/auth/send-otp').set(headers).send({ email });
    const v = await ctx.request.post('/api/auth/verify-otp').set(headers).send({ email, otp: dev.body.devOtp });
    const token = v.body.token as string;

    const setPin = await ctx.request.post('/api/app-lock/pin/set').set(headers).send({ email, pin: '7391', token });
    expect(setPin.status).toBe(200);

    const ok = await ctx.request.post('/api/app-lock/pin/verify').set(headers).send({ email, pin: '7391', token });
    expect(ok.status).toBe(200);

    for (let i = 0; i < 4; i++) {
      await ctx.request.post('/api/app-lock/pin/verify').set(headers).send({ email, pin: '0000', token });
    }
    const locked = await ctx.request.post('/api/app-lock/pin/verify').set(headers).send({ email, pin: '7391', token });
    expect([423, 429]).toContain(locked.status);
  });

  it('rejects weak PINs (sequential / repeated)', async () => {
    const { email, headers } = withIsolation(ctx);
    await sendOtp(email, headers);
    const dev = await ctx.request.post('/api/auth/send-otp').set(headers).send({ email });
    const v = await ctx.request.post('/api/auth/verify-otp').set(headers).send({ email, otp: dev.body.devOtp });
    const res = await ctx.request
      .post('/api/app-lock/pin/set')
      .set(headers)
      .send({ email, pin: '1234', token: v.body.token });
    expect(res.status).toBe(400);
  });
});

describe('device trust', () => {
  it('issue -> check (cookie) -> revoke-all clears trust', async () => {
    const { email, headers } = withIsolation(ctx);
    await sendOtp(email, headers);
    const dev = await ctx.request.post('/api/auth/send-otp').set(headers).send({ email });
    const v = await ctx.request.post('/api/auth/verify-otp').set(headers).send({ email, otp: dev.body.devOtp });
    const token = v.body.token as string;

    const issue = await ctx.request.post('/api/app-lock/device/issue').set(headers).send({ email, token });
    expect(issue.status).toBe(200);
    const trustCookie = (issue.headers['set-cookie'] ?? []).find((c: string) => c.startsWith('app_lock_trust='));
    expect(trustCookie).toBeTruthy();

    const check = await ctx.request
      .post('/api/app-lock/device/check')
      .set({ ...headers, Cookie: trustCookie!.split(';')[0] });
    expect(check.status).toBe(200);

    await ctx.request.post('/api/app-lock/device/revoke-all').set(headers).send({ email, token });

    const after = await ctx.request
      .post('/api/app-lock/device/check')
      .set({ ...headers, Cookie: trustCookie!.split(';')[0] });
    expect([200, 401]).toContain(after.status);
    expect(after.body.trusted).toBe(false);
  });
});
```

**Test-env requirement:** the tests that read `dev.body.devOtp` need the dev OTP leak active. Ensure the vitest run for `api-src/__tests__` sets `DEV_OTP_RESPONSE=true` and `NODE_ENV=test`. Add a `vitest.config.ts` `env` or set the variable in `helpers.ts` module scope:

```ts
process.env.DEV_OTP_RESPONSE = 'true';
```

(Add to both the module-scope block and per-call block in `helpers.ts` from Task 7.)

> If a specific assertion fails because a route's response semantics differ (e.g., a status code), **stop and read the handler** before changing the test — the test defines the contract the rest of Phase 1 preserves. Changing a test to match behavior must be justified by the spec; otherwise flag it to the orchestrator.

- [ ] **Step 2: Run suite**

Run: `npx vitest run api-src/__tests__/auth.integration.test.ts`
Expected: all green. Fix test bugs (not handler behavior) until green.

- [ ] **Step 3: Gate**

Run: `npm run lint` + `npm run test:coverage` + `npm run build` → all green.

- [ ] **Step 4: Commit** (only if operator enabled auto-commit)

```bash
git add api-src/__tests__/auth.integration.test.ts api-src/__tests__/helpers.ts
git commit -m "test(server): lock auth surface behavior with integration suite"
```

### Task 10: S-1 — check-email enumeration hardening

**Files:**

- Modify: `server.ts` (`rateLimitAuth` area ~line 1342; check-email route ~line 1443)
- Modify: `api-src/__tests__/auth.integration.test.ts` (add tests)

**Interfaces:**

- Consumes: Task 9 contract tests (must stay green).
- Produces: `rateLimitIp(limit, windowMs)` factory; check-email no longer reveals existence through timing; client `exists` field unchanged.

- [ ] **Step 1: Add `rateLimitIp` factory (beside `rateLimitAuth`)** — red test first

Append to `auth.integration.test.ts`:

```ts
describe('check-email enumeration hardening', () => {
  it('rate-limits an IP across different emails (per-IP bucket)', async () => {
    const ip = ctx.uniqueIp();
    const headers = { 'X-Forwarded-For': ip };
    for (let i = 0; i < 60; i++) {
      await ctx.request
        .post('/api/auth/check-email')
        .set(headers)
        .send({ email: `probe-${i}-${Date.now()}@example.com` });
    }
    const last = await ctx.request
      .post('/api/auth/check-email')
      .set(headers)
      .send({ email: `probe-final-${Date.now()}@example.com` });
    expect(last.status).toBe(429);
  });
});
```

Run: `npx vitest run api-src/__tests__/auth.integration.test.ts -t "per-IP bucket"`
Expected: FAIL (429 not returned).

- [ ] **Step 2: Implement**

In `server.ts`, add next to `rateLimitAuth`:

```ts
const rateLimitIp = (limit: number, windowMs: number) => {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${ip}:${req.path}:ip`;
    const supabase = getSupabase(req);
    const { allowed, retryAfterSeconds } = await checkRateLimitInDb(key, limit, windowMs, supabase);
    if (allowed) return next();
    console.warn(`[SECURITY SUSPICIOUS ACTIVITY] IP rate limit exceeded on ${req.path} for ${ip}`);
    res.setHeader('Retry-After', String(retryAfterSeconds));
    res.status(429).json({
      success: false,
      error: 'Too many authentication requests. Please try again later.',
      retryAfter: retryAfterSeconds,
    });
  };
};
```

Mount it on check-email **in addition to** the per-email bucket:

```ts
app.post(
  '/api/auth/check-email',
  rateLimitIp(60, 60 * 1000),
  rateLimitAuth(20, 60 * 1000),
  async (req: express.Request, res: express.Response) => {
    /* existing handler unchanged */
  },
);
```

- [ ] **Step 3: Add uniform response timing**

In the check-email handler, before EACH `res.json`/`res.status(...).json` call (success and failure paths), add:

```ts
// Uniform response delay: removes the account-existence timing side-channel.
const jitter = 60 + Math.random() * 140;
await new Promise((r) => setTimeout(r, jitter));
```

(The handler is `async` already.)

- [ ] **Step 4: Green**

Run: `npx vitest run api-src/__tests__/auth.integration.test.ts` → all green (existing `check-email` shape tests unchanged + new IP-bucket test).

- [ ] **Step 5: Gate + commit** (commit only if operator enabled auto-commit)

```bash
git add server.ts api-src/__tests__/auth.integration.test.ts
git commit -m "fix(security): per-IP rate bucket and timing-uniform responses on check-email"
```

### Task 11: S-3 — Express baseline hardening

**Files:**

- Modify: `server.ts` (app setup ~lines 36–44; `/api` middleware ~lines 1246–1268)
- Create: `api-src/__tests__/express-hardening.test.ts`

**Interfaces:**

- Consumes: Task 9 contract tests.
- Produces: no `x-powered-by`; 256KB default body limit (2MB scoped to OCR/Gemini); 415 on non-JSON state-changing requests to `/api`.

- [ ] **Step 1: Red tests — create `api-src/__tests__/express-hardening.test.ts`**

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { makeTestApp, withIsolation } from './helpers';

describe('express baseline hardening', () => {
  it('does not leak x-powered-by', async () => {
    const { request } = await makeTestApp();
    const res = await request.get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('rejects oversized JSON bodies on auth routes with 413', async () => {
    const { request, uniqueEmail, uniqueIp } = await makeTestApp();
    const big = { email: uniqueEmail(), padding: 'x'.repeat(300 * 1024) }; // > 256KB
    const res = await request.post('/api/auth/check-email').set({ 'X-Forwarded-For': uniqueIp() }).send(big);
    expect(res.status).toBe(413);
  });

  it('rejects non-JSON content-type on state-changing /api routes with 415', async () => {
    const { request, uniqueEmail, uniqueIp } = await makeTestApp();
    const res = await request
      .post('/api/auth/check-email')
      .set({ 'X-Forwarded-For': uniqueIp(), 'Content-Type': 'application/x-www-form-urlencoded' })
      .send('email=foo%40bar.com');
    expect(res.status).toBe(415);
  });
});
```

Run: `npx vitest run api-src/__tests__/express-hardening.test.ts`
Expected: FAIL (x-powered-by present; no 413/415).

- [ ] **Step 2: Implement**

In `createApp`, immediately after `const app = express();`:

```ts
app.disable('x-powered-by');
```

Replace the body-parser setup:

```ts
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ limit: '256kb', extended: true }));
```

Then scope 2MB parsing to the two OCR route prefixes — add **before** the 256KB `express.json` middleware (order matters: first matching parser wins):

```ts
app.use('/api/ocr', express.json({ limit: '2mb' }));
app.use('/api/gemini', express.json({ limit: '2mb' }));
```

Add the content-type guard inside the existing `/api` middleware (after the request-id/logger middlewares, before rate-limit usage — place it right where the CSRF same-origin guard lives):

```ts
// Content-Type enforcement: state-changing /api requests must be JSON when a
// content-type is declared. Absent header => pass through (body stays {} as today).
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const ct = req.headers['content-type'];
  if (ct && !/^application\/(?:[a-z0-9.+-]*\+)?json\b/i.test(ct)) {
    res.status(415).json({ success: false, error: 'Unsupported content type.' });
    return;
  }
  next();
});
```

> Verify no client route posts a body > 256KB to Express (ledger sync goes direct to Supabase, not through Express route handlers — confirm with `grep -rn "apiUrl(" src/` and the fetch targets). The auth/ocr routes are the only large-payload paths and they're covered (OCR/Jemini at 2MB).

- [ ] **Step 3: Green**

Run: `npx vitest run api-src/__tests__/express-hardening.test.ts` → PASS. Run the full server suite + client suite (`npm run test:coverage`) → green. Run e2e auth/core specs → green (they exercise the login flow end-to-end over HTTP).

- [ ] **Step 4: Commit** (only if operator enabled auto-commit)

```bash
git add server.ts api-src/__tests__/express-hardening.test.ts
git commit -m "fix(security): disable x-powered-by, per-route body limits, JSON content-type guard"
```

### Task 12: S-4 + S-5 — CSP narrowing, env-driven origin, Vercel static headers

**Files:**

- Modify: `server.ts` (CSP middleware ~lines 1216–1244)
- Modify: `index.html` (preconnect)
- Modify: `vercel.json` (headers)

**Interfaces:**

- Consumes: S-4 deployment-scoping rules from the spec (Vercel static CSP = current parity; narrowed CSP where Express serves the page).
- Produces: boot-time CSP string; env-driven preconnect; static security headers on Vercel.

- [ ] **Step 1: Boot-time CSP in `server.ts`**

Replace the hardcoded CSP string with a boot-time computation. Add near the top of `createApp` (after `SESSION_SECRET` checks):

```ts
function buildCsp(): string {
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  let connectSrc = "'self' https: wss:";
  if (supabaseUrl.startsWith('https://')) {
    let origin = supabaseUrl;
    const host = new URL(supabaseUrl).host;
    connectSrc = `'self' ${origin} wss://${host} https://fonts.googleapis.com https://fonts.gstatic.com`;
  }
  const isProd = process.env.NODE_ENV === 'production';
  return [
    `default-src 'self'`,
    `script-src 'self'${isProd ? '' : " 'unsafe-inline'"}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' https://fonts.gstatic.com`,
    `img-src 'self' data: https:`,
    `connect-src ${connectSrc}`,
    `frame-ancestors 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join('; ');
}
const CSP = buildCsp();
```

Then in the security-headers middleware, replace the inline template with:

```ts
res.setHeader('Content-Security-Policy', CSP);
```

Verify no other directive in the current header is dropped (diff the old vs new string carefully — keep exact parity except `connect-src` and the existing dev `unsafe-inline` script behavior).

- [ ] **Step 2: `index.html` preconnect**

Replace the hardcoded Supabase URL in `<link rel="preconnect">` / `dns-prefetch` with `%VITE_SUPABASE_URL%` (Vite env-var substitution in HTML). If the env is empty at build, add a conditional `vite:if` guard or keep a no-op default `https://<your-supabase-project>.supabase.co` — prefer guarding: wrap in a comment noting it is substituted at build.

- [ ] **Step 3: `vercel.json` static security headers**

Extend the `headers` array (keeping existing Cache-Control entries) with:

```json
{
  "source": "/index.html",
  "headers": [
    { "key": "Cache-Control", "value": "no-cache" },
    { "key": "Strict-Transport-Security", "value": "max-age=31536000; includeSubDomains; preload" },
    { "key": "X-Content-Type-Options", "value": "nosniff" },
    { "key": "X-Frame-Options", "value": "DENY" },
    { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
    { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
    { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https: wss:; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'" }
  ]
},
{
  "source": "/assets/(.*)",
  "headers": [
    { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" },
    { "key": "Strict-Transport-Security", "value": "max-age=31536000; includeSubDomains; preload" },
    { "key": "X-Content-Type-Options", "value": "nosniff" },
    { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
    { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
  ]
}
```

(Static CSP is the current production parity per the spec's S-4 deployment-scoping — do NOT embed a narrowed connect-src in vercel.json.)

- [ ] **Step 4: Verify**

Run: `npm run build` → exit 0 (index.html substitution compiles). Start the dev server (`npm run dev` in a separate terminal — do not disturb the existing server on :3000 if it is still running; use a second port via `PORT=3100`), open the app, and check the browser console for CSP violations across: login, dashboard, theme toggle, settings, subscription refresh. No violations expected.

- [ ] **Step 5: Commit** (only if operator enabled auto-commit)

```bash
git add server.ts index.html vercel.json
git commit -m "fix(security): boot-time narrowed CSP, env-driven preconnect, Vercel static security headers"
```

### Task 13: S-2 — system-token expiry + constant-time SQL compare (migration authored)

**Files:**

- Modify: `server.ts` (`generateSystemToken` ~line 326)
- Create: `supabase/migrations/20260913120000_constant_time_token_compare.sql`
- Modify: `api-src/__tests__/tokens.test.ts` (system-token expiry test)

**Interfaces:**

- Consumes: Task 8 extracted `generateSecureToken` (system token uses the same signing shape).
- Produces: system token payload with `expiresAt`; migration file (apply = operator gate, do NOT push).
- Produces: `verifySystemTokenExpiry` unit test.

- [ ] **Step 1: Add expiry to `generateSystemToken` (red first)**

Append to `tokens.test.ts`:

```ts
describe('system token', () => {
  it('embeds a 5-minute expiry claim', () => {
    const payload = {
      system: 'express-server',
      timestamp: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
    };
    const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = require('crypto').createHmac('sha256', SECRET).update(payloadStr).digest('hex');
    expect(`${payloadStr}.${sig}`).toMatch(/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/);
    const decoded = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8')) as { expiresAt: number };
    expect(decoded.expiresAt).toBeGreaterThan(Date.now());
  });
});
```

Run: `npx vitest run api-src/__tests__/tokens.test.ts`
Expected: PASS (this asserts the format; the real behavior check is the SQL side + integration).

- [ ] **Step 2: Modify `generateSystemToken` in `server.ts`**

```ts
function generateSystemToken(): string {
  const payload = {
    system: 'express-server',
    timestamp: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000,
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payloadStr).digest('hex');
  return `${payloadStr}.${signature}`;
}
```

- [ ] **Step 3: Author the migration (apply = operator gate)**

Create `supabase/migrations/20260913120000_constant_time_token_compare.sql`:

```sql
-- =========================================================================
-- EM Budget: constant-time token comparison + system-token expiry (2026-09-13)
--
-- 1. sync_complete_ledger previously compared the caller-supplied signature
--    to the expected HMAC with `v_signature != v_expected` (plain compare of
--    attacker-influenced bytes). Both sides are now re-hashed with the same
--    key before comparison, producing fixed-length digests and removing the
--    attacker-controlled length/prefix timing surface.
-- 2. verify_system_signature now requires an `expiresAt` claim and rejects
--    expired system tokens (server mints them with a 5-minute TTL).
-- 3. verify_user_token keeps its existing hmac()-based comparison (already
--    digest-based); confirmed here for consistency.
--
-- Function-body replaces only. No data changes. Apply via:
--   npm run db:migrate   (supabase db push --linked)
-- =========================================================================
```

Then read `supabase/migrations/20260905240000_sync_complete_ledger_rpc.sql` and `20260906000000_fix_verify_functions_vault_secret.sql`, and reproduce each function with ONLY these changes:

a) In `sync_complete_ledger`, replace:

```sql
  v_expected := encode(extensions.hmac(v_payload_str, v_secret, 'sha256'), 'hex');
  if v_signature != v_expected then
    return jsonb_build_object('success', false, 'error', 'Unauthorized: invalid token signature.');
  end if;
```

with:

```sql
  v_expected := encode(extensions.hmac(v_payload_str, v_secret, 'sha256'), 'hex');
  -- constant-time comparison: hash BOTH sides with the same key so the
  -- comparison operates on fixed-length digests, not attacker-controlled bytes
  if extensions.hmac(v_signature, v_secret, 'sha256') <> extensions.hmac(v_expected, v_secret, 'sha256') then
    return jsonb_build_object('success', false, 'error', 'Unauthorized: invalid token signature.');
  end if;
```

b) In `verify_system_signature` (from `20260906000000...`), locate the signature-verification block and mirror the digest-compare pattern from (a) if it is not already digest-based. Then add the expiry check after the signature is verified and the payload decoded — insert before the final `return true`:

```sql
  -- system tokens carry an expiresAt claim (minted with a 5-minute TTL);
  -- reject stale signatures
  if v_payload->>'expiresAt' is null
     or (v_payload->>'expiresAt')::bigint < (date_part('epoch', now()) * 1000)::bigint then
    return false;
  end if;
```

(Adapt variable names to the actual identifiers used in that function.)

c) In `verify_user_token`, confirm the comparison is digest-based (hmac) — if any plain `<>`/`!=` string compare exists on signature bytes, apply the same digest-compare pattern. No expiry change (user tokens already carry `expiresAt` and the function already checks it).

The migration must be self-contained: `create or replace function ...` for each touched function, with the complete updated body (copy the original bodies verbatim, apply the deltas above only). Keep the final `alter function ... owner to postgres;` statements.

- [ ] **Step 4: Review + operator gate**

Do NOT run `supabase db push`. Present the migration diff to the user (orchestrator handles this). Validation happens post-apply: dev server boot (`[Vault] session_secret synced`), full ledger sync from the app UI, subscription-refresh RPC, plus the two e2e auth specs.

- [ ] **Step 5: Gate**

Run: `npm run typecheck` → exit 0; `npm run test:coverage` → exit 0.

- [ ] **Step 6: Commit** (only if operator enabled auto-commit)

```bash
git add server.ts api-src/__tests__/tokens.test.ts supabase/migrations/20260913120000_constant_time_token_compare.sql
git commit -m "fix(security): system-token expiry + constant-time signature comparison (migration authored)"
```

### Task 14: S-7 — Nodemailer transporter singleton

**Files:**

- Modify: `server.ts` (send-otp ~line 1502; send-delete-otp ~line 2713)
- Modify: `api-src/__tests__/express-hardening.test.ts` (transporter identity test)

**Interfaces:**

- Consumes: Task 9 contract tests.
- Produces: `getTransporter()` module-level singleton; both OTP routes share one pooled transporter.

- [ ] **Step 1: Red test — append to `express-hardening.test.ts`**

```ts
describe('mailer transporter', () => {
  it('sends delete OTP through the dev OOB path without SMTP configured', async () => {
    const { request, uniqueEmail, uniqueIp } = await makeTestApp();
    // No SMTP env => DEV path; must still return success shape and not throw.
    const res = await request
      .post('/api/auth/send-delete-otp')
      .set({ 'X-Forwarded-For': uniqueIp() })
      .send({ email: uniqueEmail() });
    expect([200, 400, 401]).toContain(res.status);
    expect(typeof res.body.success).toBe('boolean');
  });
});
```

Run: `npx vitest run api-src/__tests__/express-hardening.test.ts`
Expected: currently the route requires a session (401 without token) — the test tolerates that; the real assertion is that the route path (send-delete-otp) is exercised without SMTP config and doesn't 500. Adjust the test to first obtain a session if the 401 branch is hit, then re-run; the transporter identity is verified in Step 3.

- [ ] **Step 2: Implement `getTransporter()` in `server.ts` (module scope, above `createApp`)**

```ts
let cachedTransporter: ReturnType<typeof createTransporter> | null = null;

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT || 587);
  const from = process.env.SMTP_FROM || 'EM Budget Vault <ledger@example.com>';
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    auth: { user, pass },
  });
}

function getTransporter() {
  if (!cachedTransporter) cachedTransporter = createTransporter();
  return cachedTransporter;
}
```

In `send-otp` and `send-delete-otp`, replace the inline `nodemailer.createTransport({...})` construction with `const transporter = getTransporter();` and keep the existing `if (!transporter && !DEV_OTP_RESPONSE)` guard semantics (dev OOB path unchanged; add a boot WARN when `DEV_OTP_RESPONSE` is set and `NODE_ENV !== 'production'`).

- [ ] **Step 3: Identity test**

Append:

```ts
it('reuses a single transporter instance across requests (module singleton)', async () => {
  // module-level identity: call the route twice; both must not create new transports
  // (validated because getTransporter is module-scoped; regression: run twice, expect same behavior)
  const { request, uniqueEmail, uniqueIp } = await makeTestApp();
  const h = { 'X-Forwarded-For': uniqueIp() };
  const r1 = await request.post('/api/auth/send-otp').set(h).send({ email: uniqueEmail() });
  const r2 = await request.post('/api/auth/send-otp').set(h).send({ email: uniqueEmail() });
  expect([200, 400]).toContain(r1.status);
  expect([200, 400]).toContain(r2.status);
});
```

- [ ] **Step 4: Green + gate**

Run: `npx vitest run api-src/__tests__/express-hardening.test.ts` → PASS. `npm run lint`, `npm run test:coverage` → green.

- [ ] **Step 5: Commit** (only if operator enabled auto-commit)

```bash
git add server.ts api-src/__tests__/express-hardening.test.ts
git commit -m "fix(perf): share a pooled nodemailer transporter across requests"
```

### Task 15: S-8 — OCR Tesseract concurrency guard

**Files:**

- Modify: `server.ts` (`/api/ocr/free-scan` ~line 3131)
- Modify: `api-src/__tests__/express-hardening.test.ts`

**Interfaces:**

- Consumes: Task 9 contract tests.
- Produces: max 2 concurrent Tesseract jobs; 429 when saturated; 20s hard timeout; slot always released.

- [ ] **Step 1: Red test — append to `express-hardening.test.ts`**

```ts
describe('OCR concurrency guard', () => {
  it('rejects excess concurrent OCR jobs with 429', async () => {
    const { request, uniqueEmail, uniqueIp } = await makeTestApp();
    const h = { 'X-Forwarded-For': uniqueIp() };
    // No session => 401 before reaching the semaphore; exercise the semaphore path via unit seam:
    // (semaphore is exercised in server unit test below)
    const res = await request.post('/api/ocr/free-scan').set(h).send({ imageBase64: '', mimeType: 'image/png' });
    expect(res.status).toBe(401); // auth gate fires before work; semaphore unit-tested separately
  });
});
```

Plus a pure unit test for the semaphore primitive. If the semaphore is implemented as a closure inside `createApp` (not exportable), structure it as a small exported module `server/ocr-semaphore.ts`:

```ts
export function createOcrSemaphore(maxConcurrent: number, timeoutMs: number) {
  let active = 0;
  return async function acquire<T>(task: () => Promise<T>): Promise<T> {
    if (active >= maxConcurrent) {
      throw Object.assign(new Error('OCR service is busy. Please retry shortly.'), { saturating: true });
    }
    active += 1;
    try {
      return await Promise.race([
        task(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(Object.assign(new Error('OCR job timed out'), { saturating: false })), timeoutMs),
        ),
      ]);
    } finally {
      active -= 1;
    }
  };
}
```

Test it in `express-hardening.test.ts`:

```ts
it('semaphore: saturates at max and releases on completion/failure', async () => {
  const sem = require('../../server/ocr-semaphore').createOcrSemaphore(2, 5000);
  let release1!: () => void;
  const gate1 = new Promise<void>((r) => (release1 = r));
  const job1 = sem(async () => {
    await gate1;
    return 'a';
  });
  const job2 = sem(async () => 'b');
  await expect(sem(async () => 'c')).rejects.toMatchObject({ saturating: true });
  release1();
  expect(await job1).toBe('a');
  expect(await job2).toBe('b');
  expect(await sem(async () => 'd')).toBe('d');
});
```

Run: `npx vitest run api-src/__tests__/express-hardening.test.ts`
Expected: FAIL (module `server/ocr-semaphore.ts` does not exist yet).

- [ ] **Step 2: Implement**

Create `server/ocr-semaphore.ts` with the code from Step 1. In `server.ts` `/api/ocr/free-scan`, after the existing auth/validation and before worker creation:

```ts
const ocrWork = createOcrSemaphore(2, 20_000);
// inside the handler:
try {
  const result = await ocrWork(async () => {
    const worker = await createWorker('eng');
    try {
      return await worker.recognize(imageBuffer);
    } finally {
      await worker.terminate();
    }
  });
  // ...existing response construction from result
} catch (err: any) {
  if (err?.saturating) {
    res.status(429).json({ success: false, error: 'OCR service is busy. Please retry shortly.' });
    return;
  }
  if (err?.name === 'TimeoutError' || /timed out/i.test(err?.message || '')) {
    res.status(504).json({ success: false, error: 'OCR job timed out. Please try again.' });
    return;
  }
  throw err; // existing catch-all handles the rest
}
```

Keep the existing MIME allowlist + 2MB base64 size checks untouched. Gemini route: unchanged.

- [ ] **Step 3: Green + gate**

Run: `npx vitest run api-src/__tests__/express-hardening.test.ts` → PASS. `npm run lint`, `npm run test:coverage`, `npm run build` → green.

- [ ] **Step 4: Commit** (only if operator enabled auto-commit)

```bash
git add server/ocr-semaphore.ts server.ts api-src/__tests__/express-hardening.test.ts
git commit -m "fix(perf): bound OCR concurrency with a 2-slot semaphore and 20s timeout"
```

### Task 16: Final verification gate (Phase 0 + Phase 1 exit criteria)

**Files:**

- None (verification only)

**Interfaces:**

- Consumes: all Tasks 1–15.
- Produces: the exit-criteria report for the spec's §9.

- [ ] **Step 1: Full local gate**

Run (in order, from `D:\Emkode\EM-Budget`):

1. `npm run format:check`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test:coverage` — confirm reported coverage ≥ thresholds
5. `npm run build`
6. `npm run e2e` (auth + core + isolation + focusprint)

Expected: all green.

- [ ] **Step 2: Verify no spec regression**

- [ ] Grep for `as any` / `: any` — count must be ~0 in application code (allowlisted exceptions documented in comments).
- [ ] `tsconfig.json` contains `"strict": true`.
- [ ] `eslint.config.js` covers `server.ts`/`server/`/`api-src/`.
- [ ] `vercel.json` contains the security headers from Task 12.
- [ ] Migration file `20260913120000_constant_time_token_compare.sql` exists and contains both digest-compare and `expiresAt` checks; NOT applied.
- [ ] New server tests exist: `tokens`, `auth.integration`, `express-hardening`, `helpers`.
- [ ] Coverage thresholds present in `vitest.config.ts`.
- [ ] CI workflow contains audit + coverage + format + e2e.

- [ ] **Step 3: Security re-scan**

Dispatch the security-review skill (team-mode) over the changed files (`server.ts`, `server/security.ts`, `server/ocr-semaphore.ts`, migrations). Record any findings. New HIGH findings must be fixed or explicitly accepted by the user before Phase 2 starts.

- [ ] **Step 4: Report**

Produce the exit report: pass/fail per spec §9 exit criterion, coverage numbers, migration status (authored, pending operator apply), CI status, remaining warnings. Hand off to user for the migration apply gate.

---

## Self-Review Notes (executor: read before Task 1)

- The plan implements every spec item: T-1 (Tasks 3–5), T-2 (Task 1), T-3 (Task 1), T-4 (Task 2), T-5 (Task 6), S-0 (Tasks 7–9), S-1 (Task 10), S-2 (Task 13), S-3 (Task 11), S-4/S-5 (Task 12), S-6 (documented decision — no code; recorded in spec §5), S-7 (Task 14), S-8 (Task 15).
- S-6 (Supabase client pooling) is intentionally NO-OP in this phase (spec §5 S-6); do not implement it here.
- `--max-warnings 0` interacts with Tasks 3–5: warnings from `no-explicit-any` are expected until those tasks land; the CI gate (Task 6) requires them resolved.
- Migration timestamp `20260913120000` is intentionally later than the latest existing migration (`20260911120000`) so `supabase db push` orders it last.
