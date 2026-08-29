EM Budget — Improvement
Plan & Build Prompt
Based on a full read of the repo ( emalyaditha/EMBudget ) at the time of analysis: server.ts (1,135
lines), src/supabase.ts (2,761 lines, ~1,500 of which
are embedded SQL), src/App.tsx (3,115-line single
component), all components, validators, utils, tests,
config, and a successful tsc / vitest / npm run
build .
Verdict: it runs and typechecks, but as a money app it
has critical auth flaws, three competing sources of
truth for state, float-based money math, and Zod
validators + a test suite that are effectively dead.
Priorities below are tiered. Part 2 is the prompt to hand
to an AI to execute the whole thing.
PART 1 — Everything to improve
P0 — Security (fix before anything else; it's
a finance app on a public repo)
1. Master-PIN universal backdoor. SECURITY_PIN
/ MASTER_PIN (README default 000000 ) is
accepted as a valid OTP for any email across
verify-otp , register , reset-password , and
send/verify-delete-otp . Anyone who knows
the PIN can log in as, register, reset, or delete all
data for any account. Default 000000 is trivially
guessable. → Remove it entirely. If a break-glass
admin path is truly needed, make it a separate, offby-default, audited flow — never a per-user OTP
substitute.
2. Hardcoded fallback HMAC secret shipped in a
public repo.
vault_secure_suite_signature_key_2026_x92
appears in server.ts and inside the RLS SQL
( verify_user_token ,
verify_system_signature ). Since the repo is
public, session tokens and the system-bypass
token are forgeable by anyone → complete RLS
bypass, read/write of any user's data. → Require
SESSION_SECRET at boot (fail hard if unset), rotate
it now, remove every fallback including in SQL.
3. /api/config leaks Supabase URL + anon key
to unauthenticated callers; client caches them in
localStorage . Only safe if RLS is the real
boundary — which #2 breaks. → Stop serving the
key via an open endpoint if avoidable; make RLS
actually sound.
4. Session token, device token, email, and the full
financial blob live in localStorage . Any XSS =
total account + data compromise. CSP allows
script-src 'unsafe-inline' 'unsafe-eval' ,
which guts XSS defense. → Move the session
token to an httpOnly cookie; tighten CSP (drop
unsafe-inline / unsafe-eval ); lock frameancestors to your origin (currently allows
google/run.app/ai.studio — leftover from AI
Studio).
5. Device tokens are global, not bound to a user.
auth_device_tokens stores a bare UUID;
verifyDeviceToken only checks existence. A
stolen token works with no user scoping. → Bind
to (hashed) email, add expiry + rotation.
6. Non-constant-time comparisons. Token
signatures ( signature !== expectedSignature )
and OTP hashes ( saved.otp !== enteredHash )
use !== in JS and != in plpgsql → timing sidechannels. → crypto.timingSafeEqual serverside.
7. OTP uses Math.random() (comment falsely calls
it "crypto-like"). → crypto.randomInt(100000,
1000000) .
8. Auth silently falls back to an in-memory mock
DB in production on any Supabase error
(accounts, OTPs, rate limits, device tokens). On
serverless/multi-instance this means broken,
inconsistent, insecure auth. → Fail closed on authcritical paths; never fall back to mock in prod.
9. Rate limiter fails OPEN ( return true on DB
error) and is keyed partly on client-controlled xforwarded-for (spoofable) and email (rotatable).
→ Fail closed / durable store, trust-proxy config,
add per-account lockout with backoff.
10. isUnlocked is set true even when cloud sync
fails, and the server session ( /api/auth/verifysession ) is never verified on app load. The unlock
gate is cosmetic; the real boundary is RLS (broken
per #2). → Verify session server-side on boot;
treat RLS as the true boundary and fix it.
11. Account enumeration via /api/auth/checkemail + distinct error strings (login itself is
generic, good). → Accept as a UX trade-off or
unify responses/timing.
12. No helmet , no HTTPS enforcement; headers
are hand-rolled. → helmet + HTTPS redirect at the
proxy.
P1 — Architecture & data model (the thing
that will bite users)
13. Three sources of truth for state: localStorage
blob + ledger_states JSON blob + normalized
relational tables ( bank_cards , transactions ,
…). They will drift. → Choose one authoritative
model (recommend normalized tables) and derive
the rest.
14. Balances are stored on entities and there's a
separate transactions ledger —
independently. Net worth is computed from
stored balances, not from the ledger, so they can
desync and there's no way to rebuild balances
from history. → Make balances derivable from an
append-only ledger, or at minimum add
reconciliation + a rebuild function.
15. Overlapping/redundant types: cards:
BankCard[] vs creditCards: CreditCard[] +
creditCardPurchases ; and
incomes[] / expenses[] duplicated by the
unified transactions[] . Same event stored
twice. → Consolidate to one typed transaction
model.
16. Money as JS floats everywhere
( parseFloat / Number feeding arithmetic across
every money component). Rounding errors are
inevitable. → Integer minor units (cents) or a
decimal lib (dinero.js / decimal.js); one central
money module.
17. Client writes directly to the DB with runtime
schema discovery — CSV-header sniffing,
Swagger introspection, fallback column maps,
"strip experimental columns and retry" on schema
mismatch. Huge accidental complexity and
fragility. → Own the schema via migration files;
write a stable typed data-access layer; delete the
guessing.
18. JWT/env "autocorrect" hackery duplicated on
client + server — guessing swapped URL/key,
decoding JWTs to derive the project ref, and a
hardcoded default project URL
( iivdlgbztzthjbjzzjna.supabase.co ,
someone's real project). → Remove; validate
config explicitly and fail with a clear message.
19. Last-write-wins sync, no versioning/conflict
handling; dual path ( sync_complete_ledger
RPC → row-by-row fallback). Multi-device use
silently clobbers data. → Optimistic concurrency
(version / updated_at reconciliation), conflict
handling, idempotent upserts.
20. updateState silently reclassifies transactions
by substring-matching free-text title/category
(income → financing). Corrupts user intent and
net-worth math. → Remove the heuristic; classify
explicitly at entry.
21. God files. App.tsx (3,115 lines, one component,
60+ useState ), supabase.ts (2,761 lines incl.
~1,500 lines of SQL-as-strings), several 30–96 KB
components ( CashCardManagement.tsx is 96
KB). → Decompose: router, state via
reducer/Zustand, custom hooks per domain;
move SQL to /supabase/migrations/*.sql .
P1 — Correctness & bugs
22. Zod validators are never used on the real input
path. validateData /schemas are defined and
unit-tested but imported by zero components; all
form input enters state unvalidated. → Wire
schemas into every create/edit form and into
import/restore.
23. Validator/enum drift. CategoryExpenseSchema
omits 'Bank Charges & Interest' present in
types.ts ; valid data would fail once validators
are wired. → One source of truth for enums.
24. Tests are near-vacuous. 6 tests; several assert
inline JS arithmetic that never calls app code. Only
calculateNetWorth + schemas are exercised;
thousands of lines of balance-mutation logic are
untested. → Real unit tests for every mutation
(income/expense/transfer/debt/loan/subscription),
reconciliation, import/restore, and edge cases
(overdraft, frozen card, negative, zero, locked
amount).
25. CSV export is formula-injection-vulnerable
(cells starting = + - @ execute in Excel) with
inconsistent quote-escaping; header typo "Paid
Form". → Prefix risky cells with ' , escape
uniformly, fix the header.
26. Exports use data: + encodeURIComponent
URIs that can exceed browser URL limits on large
ledgers and fail silently. → Blob +
URL.createObjectURL .
27. Import/restore has no schema validation
beyond reading a version string;
corrupt/malicious JSON crashes or silently reverts
to defaults (= wipes the view). → Validate on
import, back up before overwrite, confirm
destructive restores.
28. showToast is called inside a setState updater
(impure updater; can double-fire in StrictMode).
→ Move side effects out.
29. Minor: window.scrollTo({ behavior:
'instant' }) (use 'auto' ); verify-session
throws 500 if email is undefined ( email.trim()
unguarded).
P2 — Error handling, resilience,
observability
30. Failures are mostly console.warn + silent
fallback. Users aren't clearly told when data didn't
reach the cloud. → Explicit, actionable error UI;
clearly distinguish "saved locally, not synced" vs
"synced".
31. No retry/backoff/offline queue. A transient sync
failure just warns. → Queue pending changes,
retry, surface pending state.
32. Excessive prod logging. [Supabase Debug] logs
URL + key length on every request; [SYNC] logs
payloads that may contain financial data. → Gate
by env; never log payloads/PII.
33. ErrorBoundary copy claims "data fully intact
and saved to cloud" (may be false); Sentry hook
references a window.Sentry that's never loaded.
→ Truthful copy; wire real error reporting or drop
the stub.
P2 — UX / user-centric
34. Accessibility is essentially absent — ~1
aria / role attribute across ~40 components.
Modals lack role="dialog" / aria-modal / arialabelledby /focus-trap/focus-restore; icon-only
buttons (close X, row actions) have no arialabel ; form fields have no associated labels;
toasts and sync-status have no aria-live ; no
visible focus management. → Full WCAG-AA
pass.
35. Mobile performance: 1.46 MB JS (378 KB gzip),
no code splitting, everything eager — bad for a
"mobile-first" app on mobile networks. → Routelevel React.lazy + manualChunks , drop dead
deps.
36. Currency handling is ad hoc: single global string
(default 'Rs.' ), no Intl.NumberFormat , no
locale/multi-currency. → Centralized formatter;
optional multi-currency with a base currency.
37. Confusing auth model: "passwordless" yet has
passwords + OTP + device token + app PIN. →
Streamline and document the intended flow.
38. Destructive actions need consistent confirm +
undo, and deleting an account/card must
reconcile its transactions/balances (avoid
orphans). Cloud purge already has 2FA (good);
soft-delete exists for cards — make it consistent
everywhere.
39. No onboarding / weak empty states. New users
land on empty everything. → First-run setup (first
account, currency), contextual empty-state CTAs.
40. "PDF export" is just window.print() despite
richer implications. Long lists aren't
virtualized/paginated; big histories will lag. → Real
CSV (fixed) + optional PDF; virtualize long lists.
P3 — Feature gaps (validate against your
product intent before building)
Auto-posting recurring transactions from
subscriptions on due date (currently looks
manual); budget period reset/rollover + overbudget alerts; savings-goal contributions tied to
real transactions.
Scheduled/future-dated transactions; automatic
generation of the notifications (reminders)
that the model already has a slot for.
Tags, notes, receipt attachments; category rules;
richer reports (trends over ranges, cash-flow
forecast) — recharts is already a dependency.
Statement/CSV import + reconciliation; multicurrency + FX; encryption-at-rest for the local
blob; proper "delete account" vs "delete data"
separation.
P4 — Repo hygiene, DX, docs, ops
41. Repo is cluttered with generated artifacts /
one-off scripts that shouldn't be committed:
AUDIT_SPECIFICATION.md , ui-auditreport.md , color_report.txt ,
final_color_report.txt ,
rewrite_supabase.ts (a codemod), testdb.ts (dumps all rows to console), test-map.js .
→ Delete or move to /scripts /docs and
gitignore.
42. package.json name is "react-example" (never
renamed from the template). → em-budget + real
metadata.
43. No ESLint/Prettier — only tsc . → Add ESLint
(typescript-eslint, react-hooks, jsx-a11y) +
Prettier.
44. README is inaccurate marketing fluff: claims
Framer Motion (it's motion/react ), D3 visualizers
(it's recharts ), pdfkit (unused; print-only), "100%
reliable" and "OWASP-level" (contradicted by P0).
Naming is inconsistent: EM Budget vs "CashFlow
Ledger Workspace" vs react-example . →
Rewrite factually.
45. .env.example disagrees with README and
code: lists unused GEMINI_API_KEY / APP_URL ,
uses VITE_SUPABASE_* (bundled to the client),
omits SECURITY_PIN ; README omits
SESSION_SECRET entirely — so a user following
the README deploys with the public fallback
secret. → Reconcile; document every var; make
SESSION_SECRET required and prominent; remove
unused.
46. Dead dependencies: @google/genai and
pdfkit are never imported; zod only backs the
unused validators; metadata.json claims a
Gemini capability that doesn't exist. → Remove or
actually use; wire zod.
47. CI is build-only ( verify-build.yml ). → Gate on
typecheck + test + lint + build; add secret
scanning (e.g. gitleaks).
48. CSS: 40 KB hand-written index.css with invalid
Tailwind shade classes (e.g. border-zinc-850 )
and raw hex literals (per the checked-in ui-audit +
the build's CSS parse warnings). Tokens are
inconsistent (CSS vars mixed with hardcoded
hex). → Consolidate to design tokens; fix invalid
classes and the build warnings.
49. Dockerfile runs npm ci --only=production
(deprecated flag) then a full npm ci — installs
twice. → Simplify.
PART 2 — Build prompt (paste this
into Claude / any capable coding AI
with repo access)
Role & context. You are a senior full-stack
engineer improving EM Budget, a personal-finance
app: React 19 + TypeScript + Vite + Tailwind v4 on
the front end, an Express server ( server.ts ) for
auth/OTP/email, and Supabase (Postgres + RLS)
for storage. The codebase currently typechecks,
has 6 passing tests, and builds. Your job is to take it
to production quality across security, correctness,
architecture, UX, and hygiene, working in
prioritized phases and keeping the app shippable
after each phase.
Hard constraints.
This app handles money. Correctness and
security beat features. Never regress a working
user flow.
"Improve X" means fix bugs, security, structure,
and clarity — do not redesign the product or
restyle the UI unless a design token/CSS class
is actually invalid. Preserve existing UX and
visual intent.
Never commit secrets, real project refs, or
hardcoded fallback keys. Any security secret
must come from env and fail loudly if missing.
Before any destructive change (schema
migration, data-shape change, deletion path),
pause and state the migration/rollback plan.
Keep TypeScript strict and green ( tsc --
noEmit ), keep the build passing, and add tests
as you go — every money mutation you touch
must gain real unit tests that call the actual
code (not inline arithmetic).
Small, reviewable commits, one concern each,
with clear messages. After each phase,
summarize what changed and what to verify.
Work in these phases, in order:
Phase 0 — Recon & safety net. Read server.ts ,
src/supabase.ts , src/App.tsx , src/types.ts ,
src/utils.ts , src/validators/* , and the
components. Confirm current behavior. Add
characterization tests around existing balance/networth logic before refactoring so you can prove no
regressions. Remove committed dev cruft:
AUDIT_SPECIFICATION.md , ui-audit-report.md ,
color_report.txt , final_color_report.txt ,
rewrite_supabase.ts , test-db.ts , testmap.js (move anything worth keeping into /docs
or /scripts and gitignore). Rename the package
from react-example to em-budget . Add ESLint
(typescript-eslint + react-hooks + jsx-a11y) and
Prettier.
Phase 1 — Security (P0). Fix, with tests where
testable:
1. Remove the master-PIN universal backdoor
from all auth routes (login, verify-otp, register,
reset, delete). No PIN may substitute for a peruser OTP.
2. Require SESSION_SECRET at boot; fail hard if
unset. Remove every hardcoded fallback
secret, including inside the RLS SQL. Rotate the
secret. Move all SQL out of supabase.ts into
/supabase/migrations/*.sql .
3. Use crypto.randomInt for OTPs and
crypto.timingSafeEqual for all
signature/OTP/hash comparisons (JS and
plpgsql).
4. Move the session token to an httpOnly, Secure,
SameSite cookie; verify the session server-side
on app load; stop trusting localStorage as
the auth boundary. Keep only non-sensitive UI
state in localStorage .
5. Bind device tokens to a (hashed) email, with
expiry + rotation.
6. Make auth-critical paths fail closed on DB
errors (no in-memory mock fallback in
production). Make the rate limiter fail closed,
use a durable store, configure trust proxy
correctly, and add per-account lockout with
backoff.
7. Add helmet , enforce HTTPS at the proxy,
remove unsafe-inline / unsafe-eval from
CSP, and lock frame-ancestors to your own
origin. Gate all debug logging behind env and
never log payloads/PII. Stop serving the anon
key from an open /api/config unless RLS is
confirmed sound.
8. Remove the JWT/env "autocorrect" logic and
the hardcoded default project URL on both
client and server; validate config explicitly and
fail with a clear message.
Phase 2 — Data model & correctness (P1).
1. Introduce a money type: store integer minor
units (or use dinero.js/decimal.js) and route all
arithmetic through one money module. Migrate
existing float data safely.
2. Pick a single source of truth for state
(recommend normalized Postgres tables) and
derive the rest; remove the redundant
ledger_states JSON blob duplication and the
localStorage-as-truth pattern. Make
account/card balances derivable from an
append-only transaction ledger, and add a
reconcile/rebuild function.
3. Collapse overlapping types
( cards / creditCards / creditCardPurchases ;
incomes / expenses vs transactions ) into
one typed transaction model.
4. Replace runtime schema discovery
(CSV/Swagger sniffing, fallback columns, stripand-retry) with a stable, typed data-access
layer backed by the migrations.
5. Add optimistic concurrency to sync
(version/ updated_at reconciliation), real
conflict handling, idempotent upserts, an offline
retry queue, and clear "saved vs synced" status
in the UI.
6. Remove the substring-based transaction
reclassification in updateState ; classify
explicitly at entry.
7. Wire the Zod schemas into every create/edit
form and into import/restore. Fix enum drift by
deriving one source of truth for categories.
Validate imported JSON, back up before
overwrite, and confirm destructive restores.
8. Fix exports: guard CSV against formula
injection, escape uniformly, fix the "Paid Form"
header, and switch downloads to
Blob / URL.createObjectURL .
Phase 3 — Architecture refactor (P1).
Decompose App.tsx into a router + domain
modules; move state into a reducer or Zustand
store with typed actions; extract custom hooks
(auth, sync, accounts, transactions, budgets,
debts, loans, subscriptions). Split supabase.ts
and the largest components
( CashCardManagement.tsx etc.) into focused
units. Add route-level code splitting ( React.lazy
+ manualChunks ) to cut the 1.46 MB bundle.
Remove dead deps ( @google/genai , pdfkit ) or
genuinely use them; fix metadata.json .
Phase 4 — UX & accessibility (P2). Full WCAGAA pass: role="dialog" / aria-modal / arialabelledby + focus trap + focus restore on
modals, aria-label on icon-only buttons, labels
on all form fields, aria-live on toasts/syncstatus, visible focus states, keyboard navigation,
contrast. Centralize currency via
Intl.NumberFormat . Add first-run onboarding and
contextual empty states. Make destructive actions
consistently confirmable and undoable, with proper
orphan/balance reconciliation on delete. Replace
print-only "PDF" with real export; virtualize long
transaction lists.
Phase 5 — Docs, ops, polish (P4). Rewrite the
README to be factual (correct libraries, real
security posture, consistent product name).
Reconcile .env.example with the code, document
every variable, make SESSION_SECRET required
and prominent, remove unused vars. Consolidate
CSS to design tokens, fix invalid Tailwind classes
and the build's CSS parse warnings. Upgrade CI to
gate on typecheck + lint + test + build and add
secret scanning. Simplify the Dockerfile's double
install.
Deliverables per phase: the diffs, new/updated
tests, a short changelog, and a "verify this"
checklist. Do not mark a phase complete while
tsc , tests, lint, or build are failing. Ask me before
making product-level feature decisions (Phase 3
features) or any irreversible data migration.
Tip: run the phases as separate sessions/PRs. Phase 1
(security) is independently shippable and should go
first regardless of the rest.