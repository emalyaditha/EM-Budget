# EM Budget — Personal Finance & Ledger Manager

EM Budget is a mobile-oriented personal finance application for cash flow logging, bank card management, subscription tracking, debt tracking, and ledger sync. Built with **React 19**, **TypeScript**, **Tailwind CSS v4**, and **Express + Vite**.

---

## Features

- **Email-based auth with 2FA OTP**: Login via OTP sent through SMTP, with session tokens signed by HMAC-SHA256.
- **Cash accounts & card management**: Track debit/credit card balances, limits, and transaction histories.
- **Income/expense ledger**: Categorized transaction logging with search and filters.
- **Debt & loan tracking**: Structured debt overview with payment amortization.
- **Subscription management**: Track recurring bills sorted by due date.
- **Asset transfers**: Transfer between cash accounts and cards.
- **JSON export/restore**: Full ledger backup and restore with schema validation.
- **CSV export**: Download transaction history as CSV.
- **Supabase cloud sync**: Optional database sync with Row-Level Security.
- **Receipt scanning**: OCR via Tesseract.js + Gemini API analysis.

---

## Technology Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons, motion/react, Recharts
- **Server**: Express.js, tsx, esbuild
- **Database**: Supabase (PostgreSQL) with RLS policies
- **Email**: Nodemailer (SMTP)
- **Auth**: bcryptjs, custom HMAC-SHA256 token signing
- **OCR**: Tesseract.js, Google Gemini API

---

## Environment Variables

See `.env.example` for all variables. Required:

```env
SESSION_SECRET=         # Required — generate with: openssl rand -hex 32
VITE_SUPABASE_URL=      # Required for cloud sync
VITE_SUPABASE_ANON_KEY= # Required for cloud sync
```

Optional:

```env
GEMINI_API_KEY=         # For receipt scanning
SMTP_HOST=              # For OTP email delivery
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
PORT=3000               # Server port (default: 3000)
```

---

## Quick Start

```bash
npm install
npm run dev      # Development (Vite HMR + Express API on :3000)
npm run build    # Production build
npm run start    # Start production server
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server with HMR |
| `npm run build` | Build client + compile server |
| `npm run start` | Start production server |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
| `npm run lint` | TypeScript check (alias for typecheck) |
| `npm run eslint` | Run ESLint on src/ |
| `npm test` | Run Vitest unit tests |
