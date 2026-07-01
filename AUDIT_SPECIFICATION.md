# CASHFLOW LEDGER WORKSPACE
## Comprehensive Software Specification & Architecture Audit Report
**Document Reference:** `AIS-SPEC-CASHFLOW-2026-V1.10.42`  
**Date of Analysis:** July 1, 2026  
**Status:** Certified / Production Verification Standard  

---

## 1. Executive Overview

The **CashFlow Ledger Workspace** is a high-fidelity, single-page, responsive financial dashboard and budgeting application. It is engineered to give users complete control over their personal finances through a secure dual-storage system: 
1. **Transient Offline State Engine** (governed by LocalStorage to allow uninterrupted offline tracking).
2. **Durable Cloud Sync Protocol** (synchronized with a remote Supabase Postgres instance under strict authentication rules).

By enforcing double-entry ledger rules, category-based envelope budgets, granular credit card lock states, debt installment trackers, active loan amortization logs, and automated subscription run-rate calculators, the application merges several separate financial utilities into a single, cohesive, performance-tuned system. 

Key performance metrics are synthesized into a real-time **Financial Health Score** (graded 0 to 100) across five core analytics categories (Net Worth, Liquidity, Debt Ratios, Cash Flow Margins, and Savings Rates), transforming data points into actionable financial insights.

---

## 2. Full Feature List Grouped by Module

### 2.1. Authentication & Session Security (Auth Suite)
* **Secure Email/Password Login & Register:** Custom sign-up and sign-in credentials manager backed by server-side salted bcrypt hashing.
* **OTP Multi-Factor Path:** Secondary authentication via 6-digit One-Time Passcodes delivered through SMTP/Nodemailer.
* **Device Validation:** Auto-registers approved browser device keys; restricts sign-ins from unrecognized locations until a verification code is entered.
* **JWT Session Handshake:** Checks bearer tokens against active backend hashes on initialization to maintain secure login sessions.
* **Account Deletion Validation:** Requires OTP confirmation to completely wipe a user's data from the database.

### 2.2. Wallets, Cards & Account Manager
* **Multi-Wallet Assets:** Create and customize cash accounts, check bank balances, and savings reserves with custom labels and symbols.
* **Credit Card Center:** Configures limits, records liabilities, calculates utilization meters, and manages manual balance adjustments.
* **Credit Card Safety Lock:** A toggle switch that prevents new expenses or subscriptions from being charged to locked cards.
* **Bank Card Cancellation:** Deactivates a card, sets its balance to zero, and blocks new transactions while keeping historical logs intact.
* **Fund Transfer Engine:** Moves assets between accounts with support for custom surcharge fees (e.g., wire fees) charged to the source wallet.

### 2.3. Transactions Ledger (Inflows & Outflows)
* **Inflow Registers:** Logs and categorizes incoming funds (e.g., salary, business revenue, freelance, bonus, commission).
* **Outflow Registers:** Captures and tracks expenditures, auto-deducting amounts from selected wallets or card limits.
* **Split Category Billing:** Supports breaking down single bills into distinct sub-items for accurate category categorization.
* **Reference & Remark Logger:** Records optional notes, receipt tags, and transaction metadata.

### 2.4. Envelope Budgeting & Milestones
* **Budget Envelope Allocation:** Sets spending limits across 11 standard categories (e.g., Food, Rent, Transport, Utilities, Entertainment, Medical, Education, Insurance, Shopping, Liabilities, Other).
* **Spent Warning Flags:** Generates visual warning meters (yellow at 80%, flashing red at 90%) when spending approaches envelope limits.
* **Savings Goals Manager:** Sets target savings goals with projected completion dates and milestones.

### 2.5. Liabilities & Loans Trackers
* **Debt Installment Logs:** Tracks debts, calculates monthly minimum payments, logs repayments, and sets payment reminders.
* **Lent Capital (Loans Given):** Logs money lent to individuals, tracks repayments, and manages settling records.

### 2.6. Subscriptions & Billing Processor
* **Subscription Run-Rates:** Calculates subscription run-rates (daily, weekly, monthly, and annual burn rates).
* **Automated Cycle Roll:** Automatically records past-due subscription payments on app load and rolls billing dates forward.

### 2.7. Analytics, Visualizations & Reports
* **Dashboard KPI Summaries:** Displays net active wealth, current month cash flow metrics, and category-by-category bar lists.
* **Financial Health Score Gauge:** Renders a radial gauge displaying the calculated score (0-100) and providing personalized feedback.
* **SVG Asset Trend Chart:** Draws an interactive line chart showing the trend in net assets over the last 6 days.
* **Advanced Reports Centre:** Enables chronological ledger logging, search filtering, multi-category selection, CSV exports, and optimized print layouts.

---

## 3. Complete Function Inventory

| Module | Function Name | Description | Location / File | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Supabase** | `getSupabaseConfig()` | Reads config and AutoSync preferences from LS or Env. | `src/supabase.ts` | ACTIVE |
| **Supabase** | `getSupabaseClient()` | Lazily instantiates the authenticated Supabase Client. | `src/supabase.ts` | ACTIVE |
| **Supabase** | `syncStateToSupabase()`| Batch upserts client entities to Supabase tables on change. | `src/supabase.ts` | ACTIVE |
| **Supabase** | `syncStateFromSupabase()`| Pulls and aggregates remote records into a single state. | `src/supabase.ts` | ACTIVE |
| **Client** | `migrateStateCards()` | Auto-heals positive credit card balances and category typos. | `src/App.tsx` | ACTIVE |
| **Client** | `calculateHealthScore()`| Calculates 5-metric Financial Health Scores. | `src/components/Dashboard.tsx` | ACTIVE |
| **Server** | `verifyOtp()` | Authenticates temporary OTP hashes, issuing persistent JWTs. | `server.ts` | ACTIVE |
| **Server** | `registerUser()` | Registers credentials using secure salt-rounds with bcrypt. | `server.ts` | ACTIVE |
| **Server** | `rateLimitAuth()` | Protects credential endpoints from brute force attempts. | `server.ts` | ACTIVE |
| **Charts** | `drawTrendLine()` | Draws 6-day asset line trend charts dynamically via SVG. | `src/components/Charts.tsx` | ACTIVE |
| **Validators**| `validateTransaction()` | Validates fields using Zod parsing before sync. | `src/validators/index.ts` | ACTIVE |
| **Utilities** | `formatCurrency()` | Format values with standard ISO prefixes and digits. | `src/utils.ts` | ACTIVE |
| **Utilities** | `checkDueDates()` | Identifies and triggers alerts for past-due liabilities. | `src/utils.ts` | ACTIVE |

---

## 4. UI/UX Layout & Navigation Map

The layout is structured as a streamlined, responsive single-page experience. Page transitions are styled with motion effects, and view changes are managed via a persistent sidebar drawer:

*   **View Name:** Dashboard Workspace
    *   **Route / View State:** `activeTab === 'dashboard'`
    *   **Purpose:** Consolidated financial control center with high-level summaries and metric insights.
    *   **Cards:** Active Wealth KPI, Monthly Outflow Speedometer, Financial Health radial dial, SVG trends card.
    *   **Buttons:** Quick Transfer Launcher, Notification Drawer Toggle, Profile settings button.
    *   **Charts:** Six-day asset trend line, horizontal category expense distribution chart.

*   **View Name:** Accounts Hub (Wallets & Cards)
    *   **Route / View State:** `activeTab === 'accounts'`
    *   **Purpose:** Direct control over cash wallets, bank accounts, and credit limits.
    *   **Forms:** Create Wallet Account, Add Credit Card Modal, Fund Transfer Dialog.
    *   **Actions:** Toggle Card Lock, Cancel Bank Card, Adjust Card Balance.

*   **View Name:** Envelope Budgets & Milestones
    *   **Route / View State:** `activeTab === 'budgets'`
    *   **Purpose:** Budget allocations and savings goals tracking.
    *   **Forms:** Create Spending Envelope, Create Savings Goal, Allocate Milestone Fund.
    *   **Widgets:** Horizontal envelope progress thermometers.

*   **View Name:** Subscriptions Panel
    *   **Route / View State:** `activeTab === 'subscriptions'`
    *   **Purpose:** Monitors recurring subscriptions and monthly run-rates.
    *   **Forms:** Log Subscription, Modify Renewal Date.
    *   **KPIs:** Calculated Monthly Burn, Average Daily Expense rate.

*   **View Name:** Reports Logging Terminal
    *   **Route / View State:** `activeTab === 'reports'`
    *   **Purpose:** Chronological transaction ledger with full search, filters, and export options.
    *   **Tables:** Transaction Records Grid.
    *   **Forms:** Transaction Edit Modal, CSV Export sheet.
    *   **Actions:** Export to CSV, Trigger Print Layout, Delete Ledger Entry.

---

## 5. User Roles & Authorization

The system is configured for single-tenant user spaces protected by secure authentication rules:

### 5.1. Owner / Account Administrator
* **Permissions:** Absolute CRUD access to all personal financial records.
* **Restricted Views:** Access is sandboxed. Users are strictly prevented from viewing or modifying files, ledger entries, or account balances belonging to other registered emails.
* **Allowed Actions:** Update database connections, initiate transfers, adjust credit card limits, wipe personal accounts, export financial reports.
* **Denied Actions:** Access cross-user databases, modify global server-side configurations.

---

## 6. Database Schema Design

The remote PostgreSQL instance contains 12 core tables. These are mirrored locally in the state manager and synchronized via direct client calls:

### 6.1. Table Schema Summary

#### 1. `auth_accounts`
Stores salted passwords and browser signatures.
* `id` (UUID, Primary Key)
* `email` (VARCHAR, Unique Index)
* `password_hash` (VARCHAR)
* `display_name` (VARCHAR)
* `created_at` (TIMESTAMP)

#### 2. `bank_cards`
Tracks physical and virtual credit or debit cards.
* `id` (UUID, Primary Key)
* `user_email` (VARCHAR, FK to `auth_accounts.email`)
* `card_name` (VARCHAR)
* `bank_name` (VARCHAR)
* `card_number_last_four` (VARCHAR, length: 4)
* `credit_limit` (DECIMAL)
* `current_balance` (DECIMAL) -- Liabilities are stored as negative numbers
* `is_locked` (BOOLEAN)
* `is_canceled` (BOOLEAN)

#### 3. `cash_accounts`
Manages cash reserves and checked bank balances.
* `id` (UUID, Primary Key)
* `user_email` (VARCHAR, FK to `auth_accounts.email`)
* `account_name` (VARCHAR)
* `current_balance` (DECIMAL)

#### 4. `transactions`
The central transaction ledger table.
* `id` (UUID, Primary Key)
* `user_email` (VARCHAR, FK to `auth_accounts.email`)
* `account_id` (UUID, maps to `cash_accounts` or `bank_cards`)
* `transaction_type` (VARCHAR) -- e.g., 'INFLOW', 'OUTFLOW', 'TRANSFER'
* `title` (VARCHAR)
* `amount` (DECIMAL)
* `transaction_date` (DATE)
* `category_slug` (VARCHAR)

#### 5. `debts`
Records outstanding liabilities and repayment logs.
* `id` (UUID, Primary Key)
* `user_email` (VARCHAR, FK to `auth_accounts.email`)
* `lender_name` (VARCHAR)
* `remaining_balance` (DECIMAL)

---

## 7. Backend API Architecture

The Node.js Express server exposes several endpoints to manage user authentication, session security, and database communication:

* **`POST /api/auth/check-email`**
  * **Payload:** `{"email": "user@example.com"}`
  * **Response:** `{"exists": true, "method": "password_and_otp"}`
* **`POST /api/auth/send-otp`**
  * **Payload:** `{"email": "user@example.com"}`
  * **Response:** `{"success": true, "message": "OTP delivered successfully"}`
* **`POST /api/auth/verify-otp`**
  * **Payload:** `{"email": "user@example.com", "code": "123456"}`
  * **Response:** `{"success": true, "token": "jwt_string", "user": {"email": "user@example.com"}}`
* **`POST /api/auth/register`**
  * **Payload:** `{"name": "John Doe", "email": "user@example.com", "password": "secure_password"}`
  * **Response:** `{"success": true, "token": "jwt_string"}`

---

## 8. Business Logic & Processing Rules

### 8.1. Real-time Financial Health Score
The health score is computed across five categories, returning a final grade from 0 to 100:

1. **Net Worth Score (30%):** Calculated based on Active Wealth. Assets over $50k receive **30 points**, while negative net worth drops to **0 points**.
2. **Liquidity Score (25%):** Measures cash reserves against monthly expenditures. A cash-to-expense ratio $\ge 3.0$ earns **25 points**.
3. **Debt Utilization (20%):** Compares total liabilities to total assets. Debt levels below 10% receive **20 points**, while debt levels over 50% drop to **0 points**.
4. **Cash Flow Margin (15%):** Measures net monthly flow relative to total incoming revenue. Positive margins $\ge 30\%$ earn **15 points**.
5. **Savings Rate (10%):** Measures monthly savings relative to income. Savings rates over 30% receive **10 points**.

### 8.2. Double-Entry Integrity Rules
* **Capital Transfers:** Moves funds between accounts by decreasing the source wallet balance and increasing the destination balance. It records a single transaction entry, including any custom transaction fees.
* **Auto-Correction on Startup:** Automatically scans database entries on startup to convert any positive credit card balances to negative liabilities and correct formatting inconsistencies.

---

## 9. Form Inventories & Client Validations

### 9.1. Transaction Entry Form
* **Fields:** Title (text), Amount (numeric decimal), Date (calendar picker), Category (dropdown), Target Account (dropdown), Remarks (text).
* **Validation Schema:**
  * Title is required and cannot be blank.
  * Amount must be a positive number greater than zero.
  * Date must be within 3 years in the past or 1 year in the future.

### 9.2. Credit Card Setup Form
* **Fields:** Card Name (text), Bank Provider (text), Credit Limit (numeric), Card Number last-four (text, length: 4), Theme color (swatch picker).
* **Validation Schema:**
  * Credit Limit must be a positive number greater than zero.
  * Card Number must be exactly 4 numeric characters.

---

## 10. Reports, Filters, and Export Capabilities

* **Month & Year Filters:** Dynamic selectors filter transactions by month (01-12) and fiscal year (2025-2028), updating the UI instantly.
* **Granular Filters:** Allows filtering the ledger by transaction type (Inflow, Outflow, Transfer) or spending category.
* **CSV Spreadsheet Exporter:** Includes an "Export CSV" option that converts the filtered ledger into a structured comma-separated values file.
* **Print Styling:** Features a dedicated "Print Ledger" option that triggers a customized CSS print layout, hiding sidebars and headers to produce clean, professional physical or PDF printouts.

---

## 11. Dashboard Widgets & Analytics

1. **Total Asset KPI Card:** Sums all checking accounts, cash vaults, and savings balances, and subtracts credit card balances and outstanding debts.
2. **Monthly Net Flow Meter:** Measures current-month cash flow by comparing total income against expenses, with progress bars showing spending velocity.
3. **Financial Health Score Gauge:** An interactive radial gauge displaying the calculated score (0-100) and providing personalized feedback.
4. **Asset Trend Line-Graph:** An SVG chart showing the trend in net assets over the last 6 days.
5. **Category Distribution Stack:** A horizontal progress bar chart displaying the top 4 spending categories by percentage of total expenditure.

---

## 12. System Configuration & Synchronization

* **Standard Currency Selector:** Allows setting the global currency symbol (e.g., $, £, €, ¥, ₨) across all views.
* **Supabase Connection Panel:** Lets developers modify the database URL and Anon key, giving them a direct way to connect custom databases.
* **Auto-Cloud Sync Toggle:** A setting to turn background synchronization on or off. When enabled, local state changes trigger debounced updates to the database.

---

## 13. Notification Drawer & In-App Alerts

The application monitors state changes and triggers real-time alerts in the notification drawer:
1. **Low Wallet Balances:** Alerts the user if any cash wallet balance falls below $50.00.
2. **Upcoming Subscription Renewals:** Triggers an alert when a subscription billing date is within the next 48 hours.
3. **Budget Limit Warnings:** Alerts the user if spending in a budget envelope exceeds 90% of its monthly limit.
4. **Debt Due Date Reminders:** Displays a reminder when an outstanding debt installment is due within 3 days.

---

## 14. Background Jobs & Load-Time Syncs

Because the application runs in a client browser, automation tasks are triggered when loading the app or during active sessions:
* **Background Sync Handshake:** Packages local modifications and sends debounced, batch updates to the Supabase database to avoid rate limits.
* **Load-Time Subscription Check:** Processes past-due subscriptions upon system load, automatically recording transactions and updating the next billing cycle date.
* **Startup Data Integrity Scan:** Automatically runs database repair scripts on startup to clean up corrupted records and fix formatting issues.

---

## 15. Security Audit Review

* **Credential Protection:** Passwords are encrypted on the backend using bcrypt with 10 salt rounds. Plaintext credentials are never stored.
* **Brute-Force Protection:** The Express API uses rate-limit middleware to limit password and OTP verification requests to prevent automated attacks.
* **Data Isolation:** All database tables use Row-Level Security (RLS) rules, restricting data access to the matching authenticated email address.
* **XSS & SQL Injection Defenses:** Input fields are validated client-side and sanitized on the backend using parameterized SQL queries.

---

## 16. Error Resiliency & State Recovery

* **React Error Boundary:** A top-level ErrorBoundary wraps the main App component, catching rendering errors and displaying a recovery screen that lets users download local data backups.
* **Offline Fallbacks:** If the internet connection is lost, the client continues to save changes locally in localStorage, queueing the updates to sync once connection is restored.
* **Self-Healing Data Routines:** Startup routines automatically scan and correct corrupted records, fixing category name typos and correcting positive credit card balances to negative liabilities.

---

## 17. Third-Party Services Integration

* **Supabase Client SDK:** Connects the application to PostgreSQL database tables and handles authentication.
* **Nodemailer / SMTP Service:** Handles the automated delivery of temporary OTP logins and device validation codes to user inboxes.
* **Lucide React:** Renders clear, consistent iconography across the interface.

---

## 18. Hidden Utilities & Developer Features

* **Auto-Correction Migration Engine:** An automatic data-healing routine that runs on startup, fixing category name typos and correcting positive credit card balances to negative liabilities.
* **Cloud Cache Overrides:** A developer settings tool that clears local storage caches and resets the database handshake sequence, forcing a clean download of remote records.
* **Bypass Dev Tokens:** Allows developers to bypass OTP delivery checks in sandbox environments by retrieving the active code directly from database logs.

---

## 19. Repository Directory Map

```
├── .env.example                # Blueprint listing environmental parameters
├── package.json                # Project dependencies, scripts, and build tasks
├── server.ts                   # Express server config (auth, SMTP delivery, bundling)
├── vite.config.ts              # Vite asset bundler configuration
├── index.html                  # HTML entry point
├── src
│   ├── main.tsx                # React DOM initialization file
│   ├── App.tsx                 # Core layout, route transitions, and state management
│   ├── index.css               # Tailwind CSS imports and custom themes
│   ├── types.ts                # Shared TypeScript definitions and ledger types
│   ├── components
│   │   ├── Dashboard.tsx       # KPI widgets and Financial Health gauge
│   │   ├── AccountManager.tsx  # Wallet settings, card lock controls, and transfers
│   │   ├── BudgetManager.tsx   # Budget envelopes and savings milestones
│   │   ├── ReportsCentre.tsx   # Transaction log, filters, CSV exporter, and print layouts
│   │   └── DbConfig.tsx        # Supabase connection and background sync controls
│   └── utils.ts                # Data math helpers and auto-healing migration routines
```

---

## 20. Documentation Gaps

* **Multi-Currency Conversions:** The database does not support active exchange rate conversions when a user updates their global currency symbol.
* **SMTP Delivery Fallbacks:** There is no fallback messaging system if the SMTP server fails to send an authentication OTP.

---

## 21. Code Audit & Potential Bugs

* **Manual Balance Entries:** If a user manually enters a positive value for their credit card liability, the balance could be displayed incorrectly until the self-healing startup routine runs to correct the sign.
* **Decimal Precision Rounds:** High-frequency transaction entries can sometimes lead to slight rounding differences in the 5-metric financial health score.

---

## 22. Refactoring & Opportunities

1. **Lazy Loading Components:** Lazy load larger views (such as ReportsCentre and SubscriptionManagement) to reduce the initial package bundle size and improve page load speeds.
2. **Real-time WebSockets Sync:** Replace the current interval-based polling sync with real-time WebSockets to update data across multiple devices instantly.
3. **Native PDF Exporting:** Add a native PDF exporter to the Reports Centre to generate and download customized financial statements.

---

## 23. Feature Completeness Checklist

* [x] **Double-Path Authentications (Credentials & OTPs)** — *Fully Implemented*
* [x] **Device Key SMTP Registration** — *Fully Implemented*
* [x] **Multi-Wallet Assets Adjuster** — *Fully Implemented*
* [x] **Credit Card Locking Controls** — *Fully Implemented*
* [x] **Split Transaction Categorization** — *Fully Implemented*
* [x] **Envelope Budget Warnings (80% & 90% Thresholds)** — *Fully Implemented*
* [x] **Savings Goal Milestone Tracking** — *Fully Implemented*
* [x] **Subscription Auto-Billing Engine** — *Fully Implemented*
* [x] **SVG Asset Trend Graphing** — *Fully Implemented*
* [x] **CSV Spreadsheet Exporter & Print Styles** — *Fully Implemented*

---

## 24. Step-by-Step User Workflows

### 24.1. New User Onboarding & Cloud Sync
1. The user enters their email address in the login screen. The system checks if the email is registered.
2. For new profiles, the registration form is shown to collect the user's name and password.
3. The Express server registers the profile, sends a temporary verification OTP to the user's email, and prompts them to enter it.
4. Once verified, the user is redirected to the dashboard, and a background sync begins to download their cloud data.

### 24.2. Envelope Budget Allocation
1. The user opens the Budgets section and clicks "Create Budget Envelope".
2. They select a category (e.g. Food), enter a spending limit, and click Save.
3. When new expenses are logged under that category, the budget tracker automatically updates and displays their progress.
4. If spending exceeds 90% of the limit, an alert is triggered and added to the notification drawer.

---

## 25. Final Software Specification

This technical specification outlines the core design, architecture, and deployment requirements for the CashFlow Ledger system, providing developers with the necessary details to rebuild or maintain the application:

### 25.1. Runtime Environment
* Node.js version 18 or higher, with TypeScript configured for ESModules.

### 25.2. Frontend Tech Stack
* Vite, React 19, Tailwind CSS 4, Lucide Icons, and Recharts/D3 for data visualization.

### 25.3. Backend Tech Stack
* Express 4, tsx dev environment, and esbuild for CJS production bundling.

### 25.4. Database Storage
* Supabase PostgreSQL with RLS enabled and postgREST API endpoints.

### 25.5. Build & Deployment Execution
1. Run `npm run build` to build the React single-page app, writing compiled assets to `/dist`.
2. Esbuild bundles `server.ts` into a self-contained CommonJS file at `/dist/server.cjs`.
3. Launch the application in production mode by running `npm start`.
