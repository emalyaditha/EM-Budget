# 💳 EM Budget — Secure Personal Finance & Ledger Manager

EM Budget is a premium, minimalist, and mobile-oriented personal finance application designed for meticulous cash flow logging, bank card limits management, subscription tracking, debt payback cycles, and secure ledger database synchronizations. Built with a robust **React 19**, **TypeScript**, **Tailwind CSS**, and **Express+Vite full-stack architecture**, it integrates high-fidelity financial features with state-of-the-art security patterns.

---

## ✨ Features

### 🔐 1. Identity & 2FA Core
- **Email-Based Passwordless Auth & Ledger Lockdown**: Access control using ephemeral login OTPs and custom system-wide master pin-codes.
- **Identity-Linked Operations**: All financial cards, cash vaults, and transactions are securely coupled with your normalized email identity.

### 💾 2. Transferable JSON Export & Restore
- **Transferable Ledger Backup**: Export your complete historical financial journals as a cryptographically self-sufficient `.json` archive (`Version: EM_BUDGET_SECURE_EX_V1`).
- **Metadata Enriched**: Exports preserve user context with `exportedBy` email stamps, precise `exportedAt` ISO dates, and complete dynamic `AppState` structural indices.
- **Smart Adaptive Restore**: Instantly re-hydrate and restore all account ledgers, balances, and categories on any clean device. The restorer automatically binds raw historical records to your active identity session upon import.

### 🛡️ 3. High-Security Cloud Database Purge (With 2FA)
- **Zero-Trust Hard Purge**: An advanced, multi-step cloud-wipe security module to securely sanitize database records.
- **Critical Deletion OTP**: When triggered, a dedicated deletion 2FA token is dispatched to your verified physical email via **Nodemailer (SMTP)**, accompanied by an urgent, responsive HTML security notice.
- **In-Memory Volatile Verifier**: OTP codes are captured and processed inside a state-isolated `deleteOtpStore` server micro-cache with clean, 5-minute decay windows.
- **Scoped User-Only Purge**: Upon confirmation, the backend deletes *only* database rows registered under the executing user's email, leaving other global ledger assets secure, and cleanly resets local reactive states.

### 📊 4. Personal Asset & Ledger Registry
- **Cash Accounts & Card Management**: Dynamic balances listing for both physical cash drawers and debit/credit cards with interactive credit limits and soft-cancel protections.
- **Unified Journal Logs**: High-density, real-time audit list showing interactive historical entries, searchable categories, and granular source filters (Salary, Freelance, Food, Utilities, Medical, etc.).
- **Debts Track & Payback Ledger**: Structured overview for outstanding loans or credits with progress meters, targeted paydown actions, and associated amortization logs.
- **Auto Sorted Subscriptions**: Interactive manager tracking recurring active, closed, or paused monthly and yearly plans (Netflix, AWS, Rent, etc.) sorted automatically by impending due dates.
- **Smart Asset Transfers**: Securely transfer funds between cash containers and digital credit/debit bank cards.

---

## 🔒 Deep Dive: Cryptographic RLS Sync Engine

To secure user data across client/server boundaries without forcing full OAuth sign-ins inside minimalist workflows, EM Budget employs a **custom cryptographic signature verification system** running at the database level inside PostgreSQL Row-Level Security (RLS) policies.

### ⚙️ How It Works:
1. **Token Generation**: On successful OTP verification, the backend generates an ephemeral session token consisting of a base64url-encoded payload signed via an HMAC-SHA256 signature using a server-side `session_secret`.
2. **Secure Transport**: The client attaches the current session credentials to all database sync requests under the extra headers `X-Session-Token` and `X-User-Email`.
3. **DB-Level Verification (`verify_user_token`)**: When the query is evaluated by PostgreSQL, RLS policies call the custom `verify_user_token(headers)` function to reconstruct, parse, and verify the token signature cryptographically via `pgcrypto`.

### 🛠️ Key Bugfixes & Intermittent Failure Resolutions:
During a rigorous root-cause investigation, several deep-seated middleware and transport-layer compatibility issues were resolved to guarantee **100% reliable upserts and deletes**:
- **Case-Insensitive Header Resolution**: PostgreSQL custom settings headers from PostgREST/Supabase are occasionally transformed into mixed-case or lowercase counterparts (e.g., `X-Session-Token` vs `x-session-token`). The cryptographic analyzer now uses a safe, multi-case `COALESCE` pattern (extracting `x-session-token`, `X-Session-Token`, and `x-Session-Token`) to guarantee authentication succeeds across all environments.
- **Case-Insensitive Email Normalization**: Emails supplied as login credentials could vary in case depending on mobile autocomplete features. The RLS policies and verification engine now strictly force lower-case comparison (`return lower(email)`) when matching the token's authenticated owner against row ownership, avoiding silent auth denials.
- **Zero-Failure RPC Transaction Engine**: Implemented seamless transactional fallbacks. If single-trip Postgres bulk synchronization (`sync_complete_ledger`) experiences locks or schema drifts, the client seamlessly downgrades to safe, row-by-row table synchronizations with detailed, structural logs.

---

## 🛠️ Technology Stack

- **Client App**: React 19, TypeScript, Tailwind CSS, Lucide Icons, Framer Motion
- **Visual Analytics**: Direct D3-inspired custom layout visualizers & expressive data charts
- **Server Engine**: Express.js (Node.js full-stack proxy), tsx transpilers
- **Sync & Storage**: PostgreSQL Cloud Sync (Supabase integration Client)
- **SMTP Gateway**: Direct SMTP Nodemailer configurations with custom rich media template layouts
- **Bundler**: Production-compiled CommonJS optimized server bundles driven by **esbuild**

---

## ⚙️ Environment Configuration

Define the following environment variables in your local `.env` file (see `.env.example` as a template):

```env
# Server Configuration
PORT=3000

# Security Configurations
SECURITY_PIN=000000

# SMTP / Email Configuration for 2FA Delivery
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=ledger@example.com
SMTP_PASS=your-secure-password
SMTP_FROM="EM Budget Vault <ledger@example.com>"

# Cloud Sync Database Configuration (Supabase / Postgres Client)
SUPABASE_URL=https://your-supabase-project.supabase.co
SUPABASE_KEY=your-supabase-public-anon-key
```

---

## 🏃 Quick-Start Guide

### 1. Installation
Pull down the project dependencies:
```bash
npm install
```

### 2. Development Mode
Launches the dual-purpose Express-Vite development runtime mapping real-time HMR and server APIs:
```bash
npm run dev
```
The server will bind and expose the interface on **`http://localhost:3000`**.

### 3. Production Compilation
Bundle Vite client modules together with esbuild Node compilation assets:
```bash
npm run build
```
This writes standalone production distributions inside the directory `/dist/` and compiles server assets to a single-file, dependency-resolved server model `/dist/server.cjs`.

### 4. Cold Start
Boot the production CJS runtime directly:
```bash
npm run start
```

---

## 📜 Standard Code Quality

All styles conform strictly to modern functional standards:
- Runs static TypeScript validations natively on CLI compile routines.
- Uses named imports for types and strict object-destructuring safeguards.
- Follows rigorous mobile-first responsive layout structures mapped continuously with Tailwind units.
