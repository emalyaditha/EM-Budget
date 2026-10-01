# 💳 EM Budget — Secure Personal Finance & Ledger Manager

EM Budget is a premium, minimalist, and mobile-oriented personal finance application designed for meticulous cash flow logging, bank card limits management, subscription tracking, debt payback cycles, credit-card installment plans, budgets and goals, and secure ledger database synchronizations. Built with a robust **React 19**, **TypeScript**, **Tailwind CSS v4**, and **Express + Vite full-stack architecture**, it integrates high-fidelity financial features with state-of-the-art security patterns.

---

## ✨ Features

### 🔐 1. Identity, 2FA & Device Trust

- **Email + Password Auth with OTP Verification**: Account access is controlled through email/password login reinforced by ephemeral 6-digit OTP passcodes delivered over email, plus a dedicated password-reset flow.
- **Google SSO**: Optional one-tap sign-in via Google Identity Services; the ID token is verified server-side as the OAuth audience (`GOOGLE_CLIENT_ID`).
- **App Lock PIN & Passkeys**: An optional per-user app-lock PIN gates the ledger on shared devices, with email-OTP self-reset. Unlock is further accelerated by **WebAuthn/passkey biometrics** and trusted-device tokens, with configurable always-lock mode and a **seconds- or minutes-granularity idle auto-lock** — the lock screen is enforced both on app open and after inactivity.
- **Identity-Linked Operations**: All financial cards, cash vaults, and transactions are securely coupled with your normalized (lower-case) email identity.

### 💾 2. Transferable JSON Export & Restore

- **Transferable Ledger Backup**: Export your complete historical financial journals as a cryptographically self-sufficient `.json` archive (`Version: EM_BUDGET_SECURE_EX_V1`).
- **Metadata Enriched**: Exports preserve user context with `exportedBy` email stamps, precise `exportedAt` ISO dates, and complete dynamic `AppState` structural indices.
- **Smart Adaptive Restore**: Instantly re-hydrate and restore all account ledgers, balances, and categories on any clean device. Restored payloads are validated with strict **Zod** schemas (`LedgerExportV1Schema` / `LedgerRestorePayloadSchema`) and automatically re-bound to your active identity session on import.

### 🛡️ 3. High-Security Cloud Database Purge (With 2FA)

- **Zero-Trust Hard Purge**: An advanced, multi-step cloud-wipe security module to securely sanitize database records.
- **Critical Deletion OTP**: When triggered, a dedicated deletion 2FA token is dispatched to your verified email via the **Resend HTTP API**, accompanied by an urgent, responsive HTML security notice.
- **Volatile Verifier**: OTP codes are captured and processed securely with hashed values, strict expiration windows, and single-use consumption (a wrong attempt burns the code).
- **Scoped User-Only Purge**: Upon confirmation, the backend deletes _only_ database rows registered under the executing user's email, leaving other global ledger assets secure, and cleanly resets local reactive states.

### 📊 4. Personal Asset & Ledger Registry

- **Cash Accounts & Card Management**: Dynamic balances listing for both physical cash drawers and debit/credit cards with interactive credit limits, soft-cancel protections, and PAN masking at rest.
- **Unified Journal Logs**: High-density, real-time audit list showing interactive historical entries, searchable categories, and granular source filters (Salary, Freelance, Food, Utilities, Medical, etc.).
- **Debts, Loans & Payback Ledger**: Structured overviews for outstanding debts and loans given, with progress meters, targeted paydown actions, and associated amortization logs.
- **Credit-Card Installment Plans**: Tenure-bounded (6/12/24/48 month) installment schedules with per-payment tracking, enforced by database CHECK constraints.
- **Auto Sorted Subscriptions**: Interactive manager tracking recurring active, closed, or paused monthly and yearly plans (Netflix, AWS, Rent, etc.) sorted automatically by impending due dates.
- **Budgets & Goals**: Spending envelopes and savings-goal tracking alongside the ledger.
- **Smart Asset Transfers**: Securely transfer funds between cash containers and digital credit/debit bank cards.
- **Snapshot-Based Net Worth**: Net worth is computed directly from current account/card/debt/loan balances, not recomputed from the transaction ledger. This is a deliberate design decision (ledger-derived recalculation is a documented follow-up).

### 📸 5. Receipt OCR Scanning

- **AI-Assisted Scans**: Server-side receipt analysis via Google Gemini (`/api/gemini/analyze-image`) turns photographed receipts into structured transactions.
- **Free On-Demand Scan**: A privacy-friendlier `tesseract.js` OCR route (`/api/ocr/free-scan`) with a bounded concurrency semaphore — overflow requests receive a clean `503 OcrBusy` instead of degrading the server.

---

## 🔒 Deep Dive: Cryptographic RLS Sync Engine

To secure user data across client/server boundaries without forcing full OAuth sign-ins inside minimalist workflows, EM Budget employs a **custom cryptographic signature verification system** running at the database level inside PostgreSQL Row-Level Security (RLS) policies.

### ⚙️ How It Works:

1. **Token Generation**: On successful OTP verification, the backend generates an ephemeral session token consisting of a base64url-encoded payload (`{email, expiresAt}`) signed via an HMAC-SHA256 signature using a server-side `SESSION_SECRET`. A companion system-signature scheme validates server-issued tokens.
2. **Secure Transport**: The client attaches the current session credentials to all database sync requests under the extra headers `X-Session-Token` and `X-User-Email`.
3. **DB-Level Verification (`verify_user_token`)**: When the query is evaluated by PostgreSQL, RLS policies call the custom `verify_user_token(headers)` SECURITY DEFINER function to reconstruct, parse, and verify the token signature cryptographically via `pgcrypto`. The secret is read strictly from the `app.settings.session_secret` GUC (no hardcoded fallback), compared in constant time, and checked for expiry and lower-cased email ownership.
4. **Secret Vaulting**: On boot the server re-seeds the session secret into the protected `public.vault` table so database-side verification stays in sync with the runtime.

### 🛠️ Key Bugfixes & Intermittent Failure Resolutions:

During a rigorous root-cause investigation, several deep-seated middleware and transport-layer compatibility issues were resolved to make upserts and deletes reliable across environments:

- **Case-Insensitive Header Resolution**: PostgreSQL custom settings headers from PostgREST/Supabase are occasionally transformed into mixed-case or lowercase counterparts (e.g. `X-Session-Token` vs `x-session-token`). The cryptographic analyzer now uses a safe, multi-case `COALESCE` pattern (extracting `x-session-token`, `X-Session-Token`, and `x-Session-Token`) to guarantee authentication succeeds across all environments.
- **Case-Insensitive Email Normalization**: Emails supplied as login credentials could vary in case depending on mobile autocomplete features. The RLS policies and verification engine now strictly force lower-case comparison (`return lower(email)`) when matching the token's authenticated owner against row ownership, avoiding silent auth denials.
- **Zero-Failure RPC Transaction Engine**: Implemented seamless transactional fallbacks. If single-trip Postgres bulk synchronization (`sync_complete_ledger`, an atomic 12-table SECURITY DEFINER RPC covering state, cards, cash, transactions, debts, incomes, expenses, notifications, subscriptions, loans, envelopes, and installments + payments) experiences locks or schema drifts, the client seamlessly downgrades to safe, row-by-row table synchronizations with detailed, structural logs.

### 🧱 Hardened Server & Rate Limiting

- Express is fronted with strict security headers (CSP derived from the Supabase/Google origins, HSTS, `nosniff`, `X-Frame-Options: DENY`), HTTPS redirect, a same-origin CSRF guard, and per-route Content-Type/`415` enforcement.
- Auth endpoints are rate-limited (5–10 req/min) through a database-backed `auth_rate_limits` table with an explicit, documented in-memory fail-open for local development; production fails closed.
- The server refuses to start in production without `SESSION_SECRET`, `APP_ORIGIN`, and a service-role Supabase key — it never degrades to the public anon key.

---

## 🛠️ Technology Stack

- **Client App**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Motion (animation), Zod (validation)
- **Visual Analytics**: Interactive data charts built on **Recharts** (D3-powered) plus hand-rolled SVG charts
- **Server Engine**: Express.js (Node.js full-stack proxy), tsx dev transpiler
- **Sync & Storage**: PostgreSQL Cloud Sync (Supabase integration client)
- **Auth**: Email OTP via **Resend HTTP API**, Google Identity Services SSO, **WebAuthn/passkeys** (`@simplewebauthn`), bcryptjs password hashing
- **OCR & AI**: `tesseract.js` (free scan) and `@google/genai` (Gemini receipt analysis)
- **Observability**: Sentry (optional, via `SENTRY_DSN`), structured JSON request logging with request IDs
- **Bundler**: Vite client build + production-compiled CommonJS server bundle driven by **esbuild**
- **Deployment**: Vercel serverless (`api/index.js`) or Docker (`node:22-alpine`, non-root) for any container host

---

## ⚙️ Environment Configuration

Define the following environment variables in your local `.env` file (see `.env.example` for the fully commented template):

```env
# Server Configuration
PORT=3000
NODE_ENV=production

# Required: random 32-byte hex secret for HMAC session tokens.
# Rotate immediately if ever committed — rotation revokes every issued token.
SESSION_SECRET=your-random-64-hex-character-secret

# Same-origin / WebAuthn origin validation (required in production)
APP_ORIGIN=https://app.example.com

# WebAuthn Relying Party ID (bare hostname, e.g. app.example.com)
WEB_AUTHN_RP_ID=app.example.com

# Email OTP delivery via the Resend HTTP API (no SMTP needed)
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_FROM="EM Budget <onboarding@resend.dev>"

# Optional Google SSO (server audience + browser button, same value)
GOOGLE_CLIENT_ID=
VITE_GOOGLE_CLIENT_ID=

# Receipt OCR (Gemini-powered analyze route; free scan works without it)
GEMINI_API_KEY=your-gemini-api-key

# Cloud Sync Database Configuration (Supabase / Postgres Client)
VITE_SUPABASE_URL=https://your-supabase-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-public-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Optional error tracking
SENTRY_DSN=

# Development only: expose OTP codes in API responses when email is unconfigured
DEV_OTP_RESPONSE=true
```

---

## 🏃 Quick-Start Guide

### 1. Installation

Pull down the project dependencies (Node.js >= 20 required):

```bash
npm install
```

### 2. Development Mode

Launches the dual-purpose Express-Vite development runtime mapping real-time HMR and server APIs:

```bash
npm run dev
```

The server will bind and expose the interface on **`http://localhost:3000`**. In dev mode, email delivery failures fall back to on-screen passcodes when `DEV_OTP_RESPONSE=true`.

### 3. Production Compilation

Bundle Vite client modules together with the esbuild Node server compilation:

```bash
npm run build
```

This writes the standalone client distribution inside `/dist/` and compiles the server to a single-file, dependency-resolved CommonJS bundle at **`/api/index.js`** (generated — never hand-edit it).

### 4. Cold Start

Boot the production CJS runtime directly:

```bash
npm start
```

On Vercel, `vercel.json` routes `/api/*` to `api/index.js` and serves `/dist` statically; the same bundle runs in a Docker container (`docker build -t em-budget .`) on container hosts.

### 5. Database Migrations

Supabase schema changes are versioned SQL migrations in `supabase/migrations/`, applied with:

```bash
npm run db:migrate   # supabase db push --linked
```

---

## 🧪 Testing & Quality

- **Unit / integration**: `npm test` (Vitest; 16 client suites plus server suites for tokens, auth integration, Express hardening and the OCR semaphore) and `npm run test:coverage`.
- **End-to-end**: `npm run e2e` (Playwright, Chromium) covering OTP auth flows, multi-account data isolation, core dashboard mounting, and focus-trap/print accessibility smoke tests.
- **Linting & types**: `npm run lint` (ESLint with react-hooks/a11y rules at zero warnings, plus `tsc --noEmit`).

All styles conform strictly to modern functional standards: named imports for types, strict object-destructuring safeguards, Zod validation at ingestion boundaries, and rigorous mobile-first responsive layouts mapped continuously with Tailwind units.
