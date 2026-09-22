# Graph Report - EM-Budget  (2026-08-29)

## Corpus Check
- 79 files · ~73,069 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 467 nodes · 855 edges · 31 communities (24 shown, 7 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- types.ts
- devDependencies
- dependencies
- App.tsx
- supabase.ts
- NotificationContext.tsx
- startServer
- Card.tsx
- Charts.tsx
- compilerOptions
- AppState
- 💳 EM Budget — Secure Personal Finance & Ledger Manager
- TelemetryLogger
- initialData.ts
- lib/authSession.ts
- CategoryExpense
- EmptyState.tsx
- security.ts
- currency.ts
- Select.tsx
- download.ts
- BottomSheet.tsx
- Input.tsx
- Modal.tsx
- Skeleton.tsx

## God Nodes (most connected - your core abstractions)
1. `CashAccount` - 33 edges
2. `BankCard` - 32 edges
3. `useNotifications()` - 28 edges
4. `startServer()` - 22 edges
5. `Transaction` - 18 edges
6. `App()` - 16 edges
7. `AppState` - 15 edges
8. `compilerOptions` - 15 edges
9. `Debt` - 13 edges
10. `DatePicker()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `SettingsModalProps` --references--> `AppState`  [EXTRACTED]
  src/components/SettingsModal.tsx → src/types.ts
- `DashboardHeroProps` --references--> `Transaction`  [EXTRACTED]
  src/components/dashboard/DashboardHero.tsx → src/types.ts
- `App()` --calls--> `useNotifications()`  [EXTRACTED]
  src/App.tsx → src/context/NotificationContext.tsx
- `App()` --calls--> `useTheme()`  [EXTRACTED]
  src/App.tsx → src/context/ThemeContext.tsx
- `App()` --calls--> `getSupabaseConfig()`  [EXTRACTED]
  src/App.tsx → src/supabase.ts

## Import Cycles
- None detected.

## Communities (31 total, 7 thin omitted)

### Community 0 - "types.ts"
Cohesion: 0.08
Nodes (51): AuditPanel(), AuditPanelProps, CashCardListProps, CashCardManagement(), CashCardManagementProps, InteractiveBankCard(), InteractiveBankCardProps, themeAccent() (+43 more)

### Community 1 - "devDependencies"
Cohesion: 0.05
Nodes (41): autoprefixer, esbuild, eslint, eslint-plugin-jsx-a11y, eslint-plugin-react-hooks, jsdom, devDependencies, autoprefixer (+33 more)

### Community 2 - "dependencies"
Cohesion: 0.05
Nodes (38): bcryptjs, dotenv, express, @google/genai, lucide-react, motion, nodemailer, dependencies (+30 more)

### Community 3 - "App.tsx"
Cohesion: 0.09
Nodes (36): App(), BottomNavigation(), BottomNavigationProps, CommandItem, CommandPalette(), CommandPaletteProps, NotificationDrawer(), NotificationDrawerProps (+28 more)

### Community 4 - "supabase.ts"
Cohesion: 0.13
Nodes (21): AuthStep, EmailLogin(), EmailLoginProps, SettingsModal(), SettingsModalProps, useTheme(), authSession, FALLBACK_COLUMNS (+13 more)

### Community 5 - "NotificationContext.tsx"
Cohesion: 0.09
Nodes (19): ErrorBoundary, Props, State, ReceiptScanner(), ReceiptScannerProps, ConfirmOptions, NotificationContext, NotificationContextType (+11 more)

### Community 6 - "startServer"
Cohesion: 0.09
Nodes (8): RFC-5322, startServer(), getTokenFromRequest(), hashOtp(), parseCookies(), storeOtpInDb(), timingSafeEqualString(), verifySecureToken()

### Community 7 - "Card.tsx"
Cohesion: 0.11
Nodes (9): Badge(), BadgeProps, Card(), CardProps, ChartContainerProps, StatCardProps, TimelineItemProps, Tooltip() (+1 more)

### Community 8 - "Charts.tsx"
Cohesion: 0.24
Nodes (7): CategorySpreadAnalysis(), CategorySum, hexForPastel(), IncomeVsExpenseBar(), PASTEL_PALETTE, pastelClass(), TrendAnalysisChart()

### Community 9 - "compilerOptions"
Cohesion: 0.11
Nodes (18): DOM, DOM.Iterable, ES2022, compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules (+10 more)

### Community 10 - "AppState"
Cohesion: 0.11
Nodes (19): Dashboard(), DashboardHero(), DashboardHeroProps, getFirstName(), PASTEL_CLASSES, DashboardMetricsGrid(), DashboardMetricsGridProps, EnvelopeItem (+11 more)

### Community 11 - "💳 EM Budget — Secure Personal Finance & Ledger Manager"
Cohesion: 0.11
Nodes (17): 🔐 1. Identity & 2FA Core, 1. Installation, 2. Development Mode, 💾 2. Transferable JSON Export & Restore, 🛡️ 3. High-Security Cloud Database Purge (With 2FA), 3. Production Compilation, 4. Cold Start, 📊 4. Personal Asset & Ledger Registry (+9 more)

### Community 13 - "TelemetryLogger"
Cohesion: 0.19
Nodes (5): generateCorrelationId(), LogEntry, logger, LogLevel, TelemetryLogger

### Community 14 - "initialData.ts"
Cohesion: 0.14
Nodes (12): DEFAULT_APP_STATE, INITIAL_CARDS, INITIAL_CASH_ACCOUNTS, INITIAL_CREDIT_CARD_PURCHASES, INITIAL_CREDIT_CARDS, INITIAL_DEBTS, INITIAL_EXPENSES, INITIAL_INCOMES (+4 more)

### Community 15 - "lib/authSession.ts"
Cohesion: 0.32
Nodes (4): clearAuthSession(), fetchSessionFromServer(), logoutSession(), setAuthSession()

### Community 16 - "CategoryExpense"
Cohesion: 0.53
Nodes (5): BudgetsSection(), BudgetsSectionProps, pastelForCategory(), Budget, CategoryExpense

### Community 17 - "EmptyState.tsx"
Cohesion: 0.40
Nodes (3): Button, ButtonProps, EmptyStateProps

### Community 20 - "Select.tsx"
Cohesion: 0.50
Nodes (3): Select, SelectOption, SelectProps

## Knowledge Gaps
- **137 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+132 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `devDependencies` to `dependencies`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `CashAccount` connect `types.ts` to `AppState`, `App.tsx`, `initialData.ts`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _137 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07723855092276145 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.04878048780487805 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05128205128205128 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08985507246376812 - nodes in this community are weakly interconnected._