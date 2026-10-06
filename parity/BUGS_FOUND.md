# Bugs found during the migration audit

Rule 5 of the Master Prompt: a found bug is **replicated bug-compatible** in the port unless I say
otherwise. This file is the decision queue. Nothing here has been changed as part of the migration;
the web app and the database are read-only for that purpose.

`status` legend:

- **OPEN — replicate** — port it as-is; do not "fix" it in Dart.
- **DECISION** — needs your ruling before Phase 1, because the answer changes what a golden fixture
  is allowed to assert.
- **PRE-BASELINE** — already changed before this audit, so fixtures will be generated against the
  fixed behaviour. Listed for the record only.

Severity is about the port, not about the product: **BLOCKER** = a fixture would encode the wrong
answer; **HIGH** = user-visible numbers or data can differ; **MED** = accessibility / robustness;
**LOW** = cosmetic or dead code.

---

## B-01 — Command palette "Transactions" goes to the wrong screen

|           |                                                                                                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Evidence  | `src/App.tsx:4821-4822` — `actionId === 'nav-transactions'` runs `setActiveTab('reports')`                                                                                            |
| Behaviour | Two palette entries reach Reports Centre. The transaction ledger screen (`inflow_outflow`) has no palette route at all.                                                               |
| Severity  | MED                                                                                                                                                                                   |
| Status    | **OPEN — replicate**                                                                                                                                                                  |
| Port note | `inflow_outflow` is reachable from the bottom nav, so this is a routing alias error, not an unreachable screen. Reproduce the same mis-mapping in `mobile/` unless you rule it a fix. |

## B-02 — Most overlays do not trap focus

|                     |                                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Evidence            | `useFocusTrap` has 6 consumers (`QuickActionModal`, `NotificationDrawer`, `SettingsModal`, `TransactionEditModal`, `ui/Modal`, `NotificationContext`). Approximately 20 overlay components exist.                        |
| Untapped            | `CommandPalette`, `ProfileModal`, the mobile nav drawer, `LockScreen`, `EmailLogin`, `DebtDetailModal`, the installment modals, the sidebar "More" popover, and every screen-local dialog not routed through `ui/Modal`. |
| Why it matters here | `LockScreen` and `EmailLogin` are gates — a screen that replaces the whole workspace. Tabbing out of the lock screen behind a `aria-hidden` workspace is the worst instance.                                             |
| Severity            | MED (accessibility / WCAG 2.4.3)                                                                                                                                                                                         |
| Status              | **OPEN — replicate**                                                                                                                                                                                                     |
| Port note           | Flutter focus scope will want to trap by default. Decide per screen whether to match the web's inconsistency or raise it; matching is the default under rule 5. Logged in `INVENTORY.md` §3 as a scope item, not a fix.  |

## B-03 — Credit-card interest is computed twice, and only one of the two is the billed figure

|           |                                                                                                                                                                                                                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Evidence  | Engine: `src/lib/creditCards.ts` `interestForCycle` — `round(\|bal\|·apr/100/365·days·100)/100`, with a day guard. UI: a local `calculateInterest` at `src/components/CreditCardManagement.tsx:67-71` — same formula, **no rounding step**.                                                  |
| Behaviour | The card screen can display a number with sub-cent precision that the rollover engine does not charge.                                                                                                                                                                                       |
| Severity  | HIGH — user-visible money                                                                                                                                                                                                                                                                    |
| Status    | **DECISION**                                                                                                                                                                                                                                                                                 |
| Port note | If we port the engine only, the mobile screen disagrees with the web screen and golden tests fail on the UI. If we port both, we ship the discrepancy twice. Either way Phase 1 needs a fixture set covering both call sites, so pick: replicate both, or fix the display to use the engine. |

## B-04 — `getMonthlyTotals` bypasses the integer-cent money module

|           |                                                                                                                                                                                                                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Evidence  | `src/services/transactionService.ts` — a naive float `reduce` over amounts, while every other aggregate in `src/lib/money.ts` operates in integer cents via `toMinorUnits = Math.round(n * 100)`. No test file covers this module.                                                                                                          |
| Behaviour | Month totals can differ from the sum of the same rows priced through `money.ts` in the last kopeck. Also means this unit has **zero** existing coverage to lean on when generating fixtures.                                                                                                                                                |
| Severity  | HIGH — user-visible money, and untested                                                                                                                                                                                                                                                                                                     |
| Status    | **DECISION**                                                                                                                                                                                                                                                                                                                                |
| Port note | The fixture generator must run the _real_ function, so a float-summing unit will produce float-precision goldens that Dart cannot reproduce by accident. Options: (a) port as float and assert against JS floats exactly, (b) treat this as the one place where a shared Node implementation is justified. I need your call before Phase 1. |

## B-05 — `addMonthsClamped` loses the anniversary

|           |                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Evidence  | `src/utils.ts` — 2026-01-31 + 1 month → 2026-02-28, and the sequence does not return to the 31st in March.                                                               |
| Behaviour | A subscription or cycle anchored to the 29th/30th/31st drifts to a shorter month and stays there.                                                                        |
| Severity  | MED                                                                                                                                                                      |
| Status    | **OPEN — replicate**                                                                                                                                                     |
| Port note | Dart's month arithmetic clamps differently. This unit needs fixtures on every month length × leap × the 29th–31st, i.e. the single densest fixture set in the migration. |

## B-06 — The session token lives in `localStorage` despite a memory-only module existing

|           |                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Evidence  | `auth_session_token` written to `localStorage` at `src/App.tsx:4201`, read at `src/App.tsx:509` and `src/components/ReceiptScanner.tsx:211`. Meanwhile `src/lib/authSession.ts` exists as an in-memory holder (used by `appLock.ts`) and `src/services/authSession.ts` is a **second, separate** module with the same job (used by `supabase.ts`).                                                                               |
| Behaviour | Three representations of "who is authenticated", with different lifetimes. A refresh keeps the session; the memory module does not.                                                                                                                                                                                                                                                                                              |
| Severity  | HIGH (security posture + port correctness)                                                                                                                                                                                                                                                                                                                                                                                       |
| Status    | **DECISION**                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Port note | Two sub-questions. (1) Is the `localStorage` copy intended, or is it the leak? (2) Which of the two `authSession` modules is authoritative — merging them in the port silently stales one consumer. On the Flutter side `localStorage` maps to `flutter_secure_storage`, which is a _change_ in persistence semantics, so I cannot decide this for you. Also see `INVENTORY.md` §7 — httpOnly cookies have no native equivalent. |

## B-07 — Two modules named `authSession` with different contracts

|           |                                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------- |
| Evidence  | `src/lib/authSession.ts` (memory) vs `src/services/authSession.ts` (supabase consumer)                   |
| Severity  | HIGH for the port, not runtime                                                                           |
| Status    | **OPEN — replicate** (as two units)                                                                      |
| Port note | Port both as two files. A "clean up the duplication" merge is exactly the kind of change rule 4 forbids. |

## B-08 — The type-checker never sees test files

|                         |                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Evidence                | `tsconfig.json` `exclude` contains `**/*.test.ts` and `**/*.test.tsx`, while `lint` runs `tsc --noEmit` (`package.json:16`). A wrong prop name in a test therefore passes CI. This already happened: `WalletDeck.test.tsx` passed `aggregateActiveWorth` where the component takes `aggregateActiveWealth`.                                |
| Why the migration cares | Phase 1 goldens and Phase 4 fixture tests are _tests_. A fixture test with a typo'd field asserts nothing and reports green.                                                                                                                                                                                                               |
| Severity                | BLOCKER for Phase 1/4 methodology                                                                                                                                                                                                                                                                                                          |
| Status                  | **DECISION**                                                                                                                                                                                                                                                                                                                               |
| Port note               | Recommendation: the Dart fixture suite is unaffected (different toolchain), but the JS-side golden _generator_ must be verified by reading the emitted `expected` values, not by trusting a passing test. If you want the hole closed for the duration, say so explicitly — that is a web-app change and needs your approval under rule 3. |

## B-09 — `App.tsx` handler-level money maths is only smoke-tested

|           |                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Evidence  | ~4883 lines of `src/App.tsx` hold interest application, card deductions, debt repayments and ledger restore, with a small smoke test file. `src/utils.ts` +227, `src/lib/alerts.ts`, `src/lib/installments.ts` are currently uncommitted.                                                                                                                                                              |
| Severity  | BLOCKER for scope                                                                                                                                                                                                                                                                                                                                                                                      |
| Status    | **RULED — port to Dart + fixtures** (Phase 0 gate, D1)                                                                                                                                                                                                                                                                                                                                                 |
| Port note | Ruled at the gate: the web app stays read-only and every unit is re-implemented in Dart, proven identical against fixtures generated from the current TS. `App.tsx` handler math therefore needs fixture extraction **before** any port (Phase 1), because it is the largest untested money surface in the app. No Node layer is created — that removes the `server/` collision (blocker B2) entirely. |

## B-10 — Duplicate migration filenames

|           |                                                                                                                                                                                                                                     |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Evidence  | `fix_auth_accounts_rls`, `add_missing_indexes`, `fix_subscriptions_rls`, `rls_posture` each exist both with and without a timestamp suffix in the migrations folder.                                                                |
| Severity  | HIGH for any fresh database                                                                                                                                                                                                         |
| Status    | **DECISION**                                                                                                                                                                                                                        |
| Port note | Which copy is authoritative in production? A parity environment built from the wrong copy will show different RLS behaviour from live, and every data fixture inherits that error. Outside Phase 0's read-only remit; flagged only. |

## B-11 — Cycle rollover only happens while a browser tab is open

|           |                                                                                                                                                                                                                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Evidence  | `src/App.tsx:800-883` — rollover runs on mount and on a 60-second interval.                                                                                                                                                                                                                                   |
| Behaviour | A closed app stops rolling cycles. There is no server cron.                                                                                                                                                                                                                                                   |
| Severity  | HIGH                                                                                                                                                                                                                                                                                                          |
| Status    | **RULED — on-open catch-up** (Phase 0 gate, D3)                                                                                                                                                                                                                                                               |
| Port note | Ruled at the gate: replay missed cycles on `AppLifecycleState.resumed`, porting the existing logic rather than adding a server cron. No new infra. Web keeps its 60s timer, so an open web tab still rolls cycles; the phone simply catches up when opened. Behavioural delta recorded in `INVENTORY.md` §13. |

## B-12 — Same date string can be "overdue" on one screen and not on another

|           |                                                                                                                                                                                                                                                                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Evidence  | `reconcileSubscriptionsWithTransactions` (`src/App.tsx:319-379`) builds its [−15d, +25d] window with `new Date(string)` (UTC midnight) but steps months with the local-clamped helper. `AuditPanel.tsx` compares against `src/lib/alerts.ts` `parseDay`, which is local and rejects `Date.parse`. `creditCards.ts` is pure-UTC string comparison with `>=`. |
| Severity  | HIGH                                                                                                                                                                                                                                                                                                                                                        |
| Status    | **OPEN — replicate**                                                                                                                                                                                                                                                                                                                                        |
| Port note | Two (really three) deliberate date regimes. No global fix. Each unit gets fixtures on both sides of local midnight and on leap days. See `INVENTORY.md` §5 items 1, 10.                                                                                                                                                                                     |

---

## Found and fixed before this audit (PRE-BASELINE, for the record)

Two defects were corrected during the chrome/deck work that preceded this migration brief. Both are
listed so that fixtures are understood to be generated against **post-fix** code, and so that a
`pre-flutter` tag is known to be still pending (blocker B1).

|          |                                                                                                                                                                                                                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P-01** | `src/components/ui/CardFace.tsx` announced `•••• •••• •••• 0000` for cash wallets, i.e. a last-four the app does not know, inside the deck button's accessible name. Now renders the masked line only when a card number exists. Screen-reader behaviour changed; visual behaviour did not. |
| **P-02** | `src/components/dashboard/WalletDeck.test.tsx` asserted against a non-existent prop (`aggregateActiveWorth`) and so silently exercised the wrong field. Renamed to `aggregateActiveWealth`. Root cause is B-08.                                                                             |

---

## Summary

|                                      | count                                        |
| ------------------------------------ | -------------------------------------------- |
| OPEN — replicate                     | 5 (B-01, B-02, B-05, B-07, B-12)             |
| RULED at the Phase 0 gate            | 2 (B-09 port-to-Dart, B-11 on-open catch-up) |
| DECISION still needed                | 5 (B-03, B-04, B-06, B-08, B-10)             |
| PRE-BASELINE                         | 2                                            |
| Web-app files modified by this audit | **0**                                        |

Three of the five remaining DECISIONs are deferred to the gate where they first bite (B-06/B-07 →
Phase 3, B-03 → Phase 6, B-04 → Phase 4). B-08 affects the fixture _generator_ and so is live now:
the recommended handling is to verify emitted `expected` values by reading them, not by trusting a
passing test. B-10 needs production migration history, which is outside this repo's read-only remit.
