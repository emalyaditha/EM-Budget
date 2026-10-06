# Bugs found during the migration audit

Rule 5 of the Master Prompt: a found bug is **replicated bug-compatible** in the port unless I say
otherwise. This file is the decision queue. Nothing here has been changed as part of the migration;
the web app and the database are read-only for that purpose — with **one exception you have ruled**:
B-23, fixed on the web first and then ported (see its provenance table).

`status` legend:

- **OPEN — replicate** — port it as-is; do not "fix" it in Dart.
- **DECISION** — needs your ruling before Phase 1, because the answer changes what a golden fixture
  is allowed to assert.
- **RULED — fix on the web** — you ruled this one out of replication: the defect is corrected in
  `src/` first, on its own branch, and the corrected behaviour is what the phone ports. B-23 only.
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

|           |                                                                                                                                                                                                                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Evidence  | Engine: `src/lib/creditCards.ts` `interestForCycle` — `round(\|bal\|·apr/100/365·days·100)/100`, with a day guard. UI: a local `calculateInterest` at `src/components/CreditCardManagement.tsx:67-71` — same formula, **no rounding step**.                                                   |
| Behaviour | The card screen can display a number with sub-cent precision that the rollover engine does not charge.                                                                                                                                                                                        |
| Severity  | HIGH — user-visible money                                                                                                                                                                                                                                                                     |
| Status    | **RULED — replicate, do not fix** (Phase 1 gate, D8)                                                                                                                                                                                                                                          |
| Port note | Ruled at the gate: port **both** call sites exactly as they are. The unrounded display interest gets its own fixture set, so mobile keeps showing the same figure web shows even though it is not the figure the engine charges. Fixing it later must change web and mobile in the same move. |

## B-04 — `getMonthlyTotals` bypasses the integer-cent money module

|           |                                                                                                                                                                                                                                                                                  |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Evidence  | `src/services/transactionService.ts` — a naive float `reduce` over amounts, while every other aggregate in `src/lib/money.ts` operates in integer cents via `toMinorUnits = Math.round(n * 100)`. No test file covers this module.                                               |
| Behaviour | Month totals can differ from the sum of the same rows priced through `money.ts` in the last kopeck. Also means this unit has **zero** existing coverage to lean on when generating fixtures.                                                                                     |
| Severity  | HIGH — user-visible money, and untested                                                                                                                                                                                                                                          |
| Status    | **RULED — replicate, do not fix** (Phase 1 gate, D8)                                                                                                                                                                                                                             |
| Port note | Ruled at the gate: Dart reproduces the float reduce exactly, including its error, and the entry stays here. Goldens come from running the real function, so the defect is captured as the contract. Interacts with B-08: the generator output must be read, not merely asserted. |

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

## B-13 — `BankCardSchema` accepts a raw 16-digit PAN

|           |                                                                                                                                                                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Evidence  | `src/validators/index.ts:53-59` — the `cardNumber` regex is `/^(\*\*\*\* \d{4}\|[•*]{4} [•*]{4} [•*]{4} \d{4}\|\d{16})$/`. The third alternative is a full PAN. Golden: `validateData(BankCard raw 16-digit PAN …)` → `ok: true`.                  |
| Why       | The rule exists to keep PANs out of storage, and the field is `.optional()`. What actually enforces it is a database CHECK (`20260831000000_pan_masking.sql`: `card_number is null or card_number !~ '^[0-9]{13,19}$'`), not the client validator. |
| Severity  | HIGH — PCI-adjacent, and it is the only thing standing between a typed PAN and the app state                                                                                                                                                       |
| Status    | **OPEN — replicate** (rule 5)                                                                                                                                                                                                                      |
| Port note | The Dart validator must accept `\d{16}` exactly as the web does; tightening it is a logic change to validation and is out of migration scope. Fixing it properly is a **separate, approved security task** for the web app, not a port decision.   |

## B-14 — Two masked-PAN formats are in use and they disagree

|           |                                                                                                                                                                                                                                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Evidence  | The app's mask writer produces `•••• •••• •••• 3776` (`src/components/CashCardManagement.tsx:455,502`), which the schema accepts. The QA harness seeds `4520 **** **** 3776` (`qa-shot.cjs:60,70`), which the same schema **rejects** — golden `validateData(BankCard qa-harness mask …)` → `ok: false`. |
| Why       | The only `BankCardSchema` call site is `handleAddCard` (`src/App.tsx:2989-2998`); `validateData` is not called on any card update path. So a row can enter state by a route the create path could never have validated, and nothing re-checks it afterwards.                                             |
| Severity  | MEDIUM — data-integrity/consistency, not a live leak                                                                                                                                                                                                                                                     |
| Status    | **OPEN — replicate**                                                                                                                                                                                                                                                                                     |
| Port note | Port the schema and the mask writer as they are. Parity fixtures must use the `•••• •••• •••• NNNN` form; the harness's form is a harness bug (the harness is not ported) and is recorded so a reviewer is not surprised that it fails validation.                                                       |

## B-15 — `dark:` utilities answer the operating system, not the app's theme toggle

|           |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Evidence  | Four measured browser contexts, in `UI_SPEC.md` §6.5 from `parity/ui-tokens.json → darkVariantMatrix`. With the OS in light mode `dark:` paints on **0 of 17** tokens whether the app is light or dark; with the OS in dark mode it paints on **15 of 17** whether the app is light or dark. `src/index.css` has `@import 'tailwindcss'` (`:2`) and **no** `@custom-variant dark (&:where(.dark, .dark *))` line, so Tailwind v4 keeps its default `prefers-color-scheme` binding, while `ThemeContext.tsx` only writes `html.dark`/`body.dark` and `root.style.colorScheme`.                                |
| Visible   | `bg-[#0A0A0A] dark:bg-[#FAFAF9]` (`CashCardManagement.tsx:556`, consumed by the swatch buttons at `:996` and `:1389`) draws the swatch named _obsidian_ as a near-white dot on an OS-dark device that is showing the **light** app. The status badges at `AuditPanel.tsx:287-299` swap `bg-rose-50`/`text-rose-600` for a `rose-950/40`/`rose-400` pair on the same condition, so a dark badge sits on a light card. The two remaining rows are `dark:hover:` and fall under D-U1.                                                                                                                           |
| Why       | The app has two unconnected dark mechanisms: CSS custom properties driven by the in-app toggle, and `dark:` utilities driven by the OS. The markup reads as though the second were wired to the first. Which of the two was intended is not determinable from the source, so this is a decision, not a defect to fix. See B-16 for the second half of the split.                                                                                                                                                                                                                                             |
| Severity  | MED — user-visible colour and contrast across a whole device class (OS-dark), but no data, no money and no route is affected, and the web baseline behaves this way today.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Status    | **RULED — replicate the split** (D-U13, decided at the Phase 2 gate; see `INVENTORY.md` §13e). Nothing on the web side was changed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Port note | Flutter has one app theme and no OS signal unless the app chooses to read `platformBrightness`, so the phone cannot be neutral. **Bug-compatible** = bind these tokens to `platformBrightness` and let the in-app toggle ignore them, reproducing the split exactly. **Intended-looking** = fold them into the app theme, which is a visible change from the web for OS-dark users in light mode. A golden test can only be written after the ruling, because the two readings disagree on the same screen; until then the Dart side treats a `dark:` colour as an unresolved token rather than as a colour. |

## B-16 — The app's follow-the-OS listener can never fire

|           |                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Evidence  | `src/context/ThemeContext.tsx:53-64` registers a `prefers-color-scheme` listener whose first act is `const hasExplicit = localStorage.getItem(STORAGE_KEY)                                                                                                                                                                                                                                       |     | localStorage.getItem('theme'); if (hasExplicit) return;` (`:58-59`). But the effect at `:49-51`calls`applyTheme(theme)`on mount, and`applyTheme` writes **both** keys there (`:39-40`). Effects run in declaration order, so by the time any OS change could be delivered, both keys already exist. |
| Behaviour | The theme is chosen once — from storage if present, otherwise from `prefers-color-scheme` at `:24` — and never follows a later OS change unless the user clears site storage. The intent stated by the guard ("follow the OS until the user expresses a preference") is unreachable.                                                                                                             |
| Severity  | LOW — one-shot cosmetic; no data, no money, no route. Recorded because it is the other half of B-15 and because it is the reason a phone with a genuine live `platformBrightness` listener would _not_ be bug-compatible even if B-15 is ruled "follow the OS".                                                                                                                                  |
| Status    | **OPEN — replicate** (rule 5)                                                                                                                                                                                                                                                                                                                                                                    |
| Port note | Port the seed-once semantics: read `platformBrightness` for the initial theme only, persist the choice on first build, and do not react to later changes — which is what the web does. If D-U13 is ruled the bug-compatible way, `dark:` utilities must still be read live from the platform brightness, so the phone reproduces **both** halves: variables frozen at first run, utilities live. |

## B-23 — A re-hydration silently erases every recorded credit-card purchase

Numbered to match the register on `flutter-migration`, where this defect was found during the Phase 3
sync port. The B-17…B-22 entries that sit between the two numbers live on that branch only, so this
entry is written self-contained rather than as a back-reference.

|           |                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Evidence  | `src/supabase.ts` builds the pulled `AppState` field by field from the `ledger_states` snapshot. Before this fix it read `savingsGoals`, `budgets` and the installment arrays, and **never read `creditCardPurchases`**, so that key fell through to `DEFAULT_APP_STATE.creditCardPurchases` — `[]` (`src/initialData.ts:35`).                                                                                                            |
| Mechanism | `credit_card_purchases` has **no relational table** and is **not a `sync_complete_ledger` parameter**, so the JSON snapshot in `ledger_states.state` is its only cloud copy (`supabase/migrations/20260929120000_tier2_rpc_constant_time.sql:106` inserts the whole `p_state` there). Reading it back as `[]` therefore does not merely lose the display list: the debounced auto-push then writes that emptiness **over the only copy**. |
| Behaviour | Sign in on a second device, or reload after the hydration gate re-pulls, and every purchase recorded on the card-management screen disappears — permanently, for every device. localStorage still holds them (`src/utils.ts:288` reads the key back), which is why the loss is invisible until the next cloud pull wins.                                                                                                                  |
| Severity  | **HIGH** — silent, self-persisting data loss. The only entry in this register that destroys user data rather than mis-displaying it.                                                                                                                                                                                                                                                                                                      |
| Status    | **RULED — fix on the web, then port the fix.** You ruled this at the Phase 3 gate as the single exception to "the existing web app and database files are read-only", on its own branch off `main` (`bugfix/b23-credit-card-purchases`), separate from `flutter-migration`.                                                                                                                                                               |
| Port note | The Dart pull (`mobile/lib/data/ledger_repository.dart`) had the same omission, inherited from the web; the same fallback now exists there too, with a parity test.                                                                                                                                                                                                                                                                       |

### Provenance of the fix

|                                            |                                                                                                                                                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Branch                                     | `bugfix/b23-credit-card-purchases`, based on `origin/main` = `85c10c9`                                                                                                                                                                                 |
| Fix commit                                 | `1d1efe8` — `src/supabase.ts` and `src/supabase.test.ts` only. **Not merged and not pushed**; the diff is shown for your approval first.                                                                                                               |
| Baseline tag                               | `pre-flutter` = `41489c659af29fdd3ea3ac12cf78f6ffc2c39799` — **not moved**, so all 661 goldens still resolve to it                                                                                                                                     |
| Red test (before the fix)                  | `src/supabase.test.ts:284` `syncStateFromSupabase — creditCardPurchases round-trips > restores creditCardPurchases from the ledger_states snapshot` failed with `- [ { id: 'cp-1', amount: 4999, … } ] / + []`                                         |
| Green test (after the fix)                 | same file, plus `:307` `leaves the default when the snapshot holds no purchases` — 25 tests pass                                                                                                                                                       |
| `src/supabase.ts` blob before → after      | `ffc4c734a65aee34e277932368096fa03e6f2bee` → `a0f2031e067b42256aa10aaf6797dd2087f78969`                                                                                                                                                                |
| `src/supabase.test.ts` blob before → after | `ad3df626fce966a5e9f644dad49c0eb2b4a4251d` → `e88206a32f12da91c4f084d70538a8910650831a`                                                                                                                                                                |
| The change                                 | 9 added lines at `src/supabase.ts:1150-1158`, the `Array.isArray` snapshot fallback in the idiom the file already uses for `savingsGoals`. No line was removed, no other file in `src/` touched.                                                       |
| Checks                                     | lint (eslint `--max-warnings 0` + `tsc --noEmit`) clean · `npx vitest run` **459 passed / 33 files** (457 before + the 2 new) · Playwright e2e **24 passed** · `npx prettier --check src/` clean · Phase 1 fixture gate **PASS, 12 units / 661 cases** |

**There was no pull fixture to regenerate.** `parity/fixtures/generate.ts` imports eight units — `money`,
`creditCards`, `installments`, `utils`, `alerts`, `transactionService`, `download`, `validators` — and
**`src/supabase.ts` is not among them**; no file in `parity/fixtures/` mentions `supabase` or
`creditCardPurchases`. All 12 goldens are pure-logic units, so the sync path has never had a golden and
this fix cannot change one. The instruction to regenerate the affected fixture therefore has no target:
the executable proof is the pair of vitest cases above, and the fixture gap is recorded here rather than
papered over with a hand-written golden — which Phase 4's rule forbids. Re-running the gate after the fix
is what demonstrates no fixture drifted.

**One flake, not caused by this change.** `api-src/__tests__/auth.integration.test.ts > app-lock PIN >
sets a PIN, verifies it and locks out after 5 bad attempts` exceeded vitest's 5000 ms budget on the first
full run (it measured 5005 ms; a clean base checkout of the same file measured 4758 ms). The test does six
bcrypt-12 rounds against the live server, so it sits within 5 % of its timeout on this machine. Raising
only the timeout (`--testTimeout=60000`) passes 18/18, and it passes inside the default budget on the
final full run above. `src/supabase.ts` is client code and is not imported by that suite.

---

## Found and fixed before this audit (PRE-BASELINE, for the record)

Two defects were corrected during the chrome/deck work that preceded this migration brief. Both are
listed so that fixtures are understood to be generated against **post-fix** code. Blocker B1 is now
closed: that working set was committed as `41489c6` and tagged `pre-flutter`, and every golden in
`parity/fixtures/` is generated from that tag under the provenance guard (D7).

|          |                                                                                                                                                                                                                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P-01** | `src/components/ui/CardFace.tsx` announced `•••• •••• •••• 0000` for cash wallets, i.e. a last-four the app does not know, inside the deck button's accessible name. Now renders the masked line only when a card number exists. Screen-reader behaviour changed; visual behaviour did not. |
| **P-02** | `src/components/dashboard/WalletDeck.test.tsx` asserted against a non-existent prop (`aggregateActiveWorth`) and so silently exercised the wrong field. Renamed to `aggregateActiveWealth`. Root cause is B-08.                                                                             |

---

## Summary

|                                                         | count                                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| OPEN — replicate                                        | 8 (B-01, B-02, B-05, B-07, B-12, B-13, B-14, B-16)                            |
| RULED at a gate                                         | 6 (B-03, B-04, B-09, B-11, B-15, **B-23 — fix on the web**)                   |
| DECISION still needed                                   | 3 (B-06, B-08, B-10)                                                          |
| PRE-BASELINE                                            | 2                                                                             |
| Web-app **logic/UI/UX** files changed by this migration | **1 — `src/supabase.ts`, and only because you ruled B-23 a web-side fix**     |
| Web-app **test** files changed under the same ruling    | 1 (`src/supabase.test.ts`, 2 cases: one red before the fix, both green after) |
| Non-web-app files changed under explicit authorisation  | 2 (`qa-shot.cjs`, `.env.example`)                                             |

B-03 and B-04 were ruled **replicate, do not fix** at the Phase 1 gate, so both are now fixture targets
that encode the defect as the contract. B-06/B-07 defer to Phase 3 and B-10 to any fresh database; B-08
is live because it degrades the fixture generator itself, which is why D8 requires every emitted golden
to be schema-validated and case-counted rather than trusted to a passing test.

`qa-shot.cjs` is a local screenshot harness and `.env.example` a template; neither is imported by the web
app, and both were changed only on your explicit instruction. No screen, handler, or SQL file has been
touched. B-23 is the one exception to that last sentence and it is bounded: `src/supabase.ts` gained the
snapshot fallback for `creditCardPurchases` and nothing else changed — no component, no handler, no
route, no SQL, no dependency, and the `pre-flutter` tag was not moved.
