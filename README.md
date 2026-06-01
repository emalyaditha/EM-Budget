# 💳 EM Budget — Secure Personal Finance & Ledger Manager

EM Budget is a premium, minimalist, and mobile-oriented personal finance application designed for meticulous cash flow logging, bank card limits management, subscription tracking, debt payback cycles, and secure ledger database synchronizations. Built with **React 19**, **TypeScript**, **Tailwind CSS**, and an **Express+Vite full-stack architecture**, it combines speed with robust security features.

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
- **Auto-Sorted Subscriptions**: Interactive manager tracking recurring active, paused, or cancelled monthly and yearly plans (Netflix, AWS, Rent, etc.) sorted automatically by impending due dates.
- **Smart Asset Transfers**: Securely transfer funds between cash containers and digital credit/debit bank cards.

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
- Uses named imports for types and strict object-destructuring safeguards (e.g. `import { useNotifications } from './context/NotificationContext'`).
- Follows rigorous mobile-first responsive layout structures mapped continuously with Tailwind units.
