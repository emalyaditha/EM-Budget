# STATUS.md — migration state at a glance

**Repo:** `D:\Emcode\EM-Budget` · **Playbook:** `D:\Emcode\MIGRATION_PLAYBOOK.md`
**Updated:** 2026-10-08 — Phase 4 **gate rulings D36–D41 recorded**; D40 defers OCR out of mobile v1
and parks #65, D41 fixes the `.gitattributes` rule that would corrupt the screenshot baselines.
Branch `phase4-logic-units`, PR #5 open.

## Tasks

| #       | Task                                                                                                     | State                                                                                                                                                                                 |
| ------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —       | Phases 0–3 (inventory, specs+goldens, scaffold, data/auth layer)                                         | DONE — merged to `origin/main` via PR #2/#4                                                                                                                                           |
| #60–#63 | money port · five mid-size units · cycle engine · net-worth aggregates                                   | DONE — `049b772`, `cc8b247`, `fe8102d`, `5485b7f`                                                                                                                                     |
| #64a    | transaction-service re-record, `PROJECTION_DEBT` emptied, D35 `srcTree` stamps                           | DONE — in `98ac2b8`; `validate.ts` PASS 14/1108                                                                                                                                       |
| #64b    | live harness `parity/live/` (D34), 16-case `app-handlers.json`, Dart port of the nine `App.tsx` handlers | DONE — in `98ac2b8`; `flutter test` 769/769                                                                                                                                           |
| #64c    | INVENTORY §13m write-up                                                                                  | DONE — `INVENTORY.md:1326-1392`, pushed with the gate docs                                                                                                                            |
| #64     | Phase 4 logic port as a whole                                                                            | DONE — this is the last gate commit on the branch                                                                                                                                     |
| #65     | Three-way OCR contract (D28/D32)                                                                         | **PARKED — D40.** OCR deferred out of mobile v1. Recorder scaffold lives on `feature/ocr-three-way-contract` (local commit, no push, no PR). Re-opened only when OCR returns to scope |
| —       | `fix/audit-lockfile` — lockfile-only refresh of `compression`, `proxy-addr`, `source-map-js`             | PR OPEN — never `npm audit fix`, no `package.json` change; 24/24 e2e green, audit exit 0                                                                                              |
| —       | Coverage option 2 — `AuditPanel.test.tsx`                                                                | DONE — 35 behaviour tests, `67dfdc9` → `307b5df`; all four thresholds pass with margin; D35 `srcTree` unmoved                                                                         |
| —       | Phase 4 gate → Phase 5 (design system)                                                                   | OPEN — the gate has nothing outstanding on it; #65 was the last item and D40 removed it                                                                                               |

## Branches & PRs

| Ref                                            | What                                                                                                                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main` @ `337bd4a` (local == origin)           | Phases 0–3 + money port. **Enterprise CI FAILS here** at `npm audit --audit-level=high` (28 adv: 25 moderate, 2 high, 1 critical)                                          |
| `phase4-logic-units`                           | PR #5. Mobile Parity CI **green**; Enterprise still red on npm audit; Vercel green                                                                                         |
| `bugfix/b23-credit-card-purchases` @ `1f6a1ce` | PR #3. **Already contains `origin/main`** (`524bbb4`), so re-testing against main cannot help — its Mobile Parity failure is the same dart lint only PR #5 fixes           |
| `fix/audit-lockfile` @ `307b5df`               | Two commits: lockfile-only 9-line refresh `67dfdc9`, then `AuditPanel.test.tsx` `307b5df`. **Do not merge** — the user merges.                                             |
| `feature/ocr-three-way-contract` @ `83aa220`   | Parked #65 recorder scaffold, **local only** (no push, no PR). Its 7 sample PNG blobs were committed under the pre-D41 rule and are corrupt; the working copies are intact |

## Open decisions waiting for the user

1. **Merge order (user merges on GitHub; the assistant never merges)** — PR #5 first. **Wait for the message "PR5 merged"** before updating `bugfix/b23-credit-card-purchases` onto the new main; then push, await Mobile Parity green, then "MERGE" for PR #3.
2. **B-10 is now the only entry awaiting a ruling** (DECISION count 4 → 1). It waits on the **user's own `schema_migrations` query** — answerable only from the live DB, and it blocks any fresh DB.
3. **B-26 phone-side trigger design** — roll only after a completed pull, inside `syncChains`. Awaits ruling.
4. **Tenants** — **no deletions, and no `e2e-*`/`qa-*` teardown work until Phase 4 closes.** 16 `qa-*@example.com` live, re-matched IDENTICAL to `D:\Emcode\backups\qa-export-20261006.json`. **466 `e2e-*@example.com`** (457 pre-existing + 9 from the audit-branch e2e run) are outside D18's scope; no spec destroys its tenant. The proposed `e2e/auth.ts` teardown and separate test Supabase project are **text only, not implemented**.
5. **`fix/audit-lockfile`** — review only. Merging it makes `npm audit` pass but **does not turn Enterprise CI green on its own**: at `307b5df` the run clears audit, lint and unit-coverage and then fails at **Format check** on `parity/fixtures/generate.ts`, which is unformatted on `main` and identical in both blobs. The fix for that file, and the `parity/** text eol=lf` rule, arrive with PR #5 — so green needs the item-1 order (merge #5, then update #6 onto main), after which the gated `e2e` job runs for the first time.
6. **The 7 corrupt sample PNGs on the parked OCR branch** — the repair is `git add` of the intact working copies once that branch carries the D41 `binary` lines, committed **on top** of `83aa220`. Local-only commit, still no push, no PR. Awaiting the word; no history rewrite.

## Ruled at this gate (D36–D41)

| Bug  | Ruling                                                                                                                                                                                                                                                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B-08 | **Leave** the `tsconfig.json` exclude hole open (D36); `validate.ts` + `dart analyze --fatal-infos` stay the defence                                                                                                                                                                                                                                                                       |
| B-19 | **Option (a)** — Bearer stays on (D37); seam retained                                                                                                                                                                                                                                                                                                                                      |
| B-20 | **Replicate**, do not send `instance_type` (D38); web fix → post-parity list                                                                                                                                                                                                                                                                                                               |
| B-25 | **Deliberate deviation approved** (D39) — re-enable the control on timeout and show the error; recorded in `UI_SPEC.md`; web fix → post-parity list                                                                                                                                                                                                                                        |
| OCR  | **Deferred out of mobile v1 (D40).** #65 parked; the `/api/ocr/free-scan` plan stands for when it is added; `freeOcrParser.ts` stays server-side. Recorded as `UI_SPEC.md` §7 deviation **D-U16**                                                                                                                                                                                          |
| PNGs | **D41 — `parity/** text eol=lf` is a catch-all and applies to images.** `text` is not `text=auto`, so git's check-in filter strips every CRLF pair from a PNG; the signature itself contains one (`89 50 4E 47 0D 0A 1A 0A`). Four `binary` lines, one per extension, now follow it. Baseline blobs are untouched and were already valid; the rule only ever threatened the next `git add` |

## The D41 measurement

| Claim                            | Test                                                                                                                    | Result                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| The rule rewrites PNG check-in   | `git hash-object --` (filters) vs `--no-filters` on `ledgerregistry.png`                                                | `352b5546…` (stored) vs `bc695095…` (would-be) — **the filter is lossy here** |
| The 48 are content-unchanged     | `cmp` of each working file vs its blob                                                                                  | 48 byte-identical, 0 differing — the `M` entries were pure stat/filter noise  |
| CI checks them out stripped      | `core.autocrlf=false` clone (Linux-shaped), re-checkout via `checkout-index`                                            | **False.** 339 CRs, 79,072 bytes, intact signature — checkout is not lossy    |
| The fix resolves it              | `check-attr text binary` → `unset / set`; `hash-object --` == blob for all 48; `git status -- parity/screenshots` empty | all four hold, in both the working tree and the clone with the new lines      |
| No baseline blob moves           | `git diff --stat -- parity/screenshots/`                                                                                | empty                                                                         |
| Already-committed PNGs are valid | first 8 bytes of all 48 blobs, and of the 7 samples in `83aa220`                                                        | 48/48 valid; the 7 samples are **corrupt** (see below)                        |

**Correction to what I asserted at the previous gate:** I said CI "already checks them out in that
form". It does not — only check-in strips. The baselines were never damaged on disk or in the object
store; the exposure was a future `git add`, which is exactly what a Phase 5 re-record would have done.

**On the parked branch (`feature/ocr-three-way-contract`, `83aa220`):** all seven sample PNGs were
committed under the rule, so their blobs carry `89 50 4e 47 0a 1a 0a 00` — signature CR stripped, file
short by 1–2 bytes each. The working copies on disk are intact (`89 50 4e 47 0d 0a 1a 0a`, valid IEND).
Fix = re-add the working copies once that branch carries the `binary` lines, as a commit **on top**; no
history rewrite. Not done — awaiting the word.

## Exact next step

Close the Phase 4 gate. Nothing on it is outstanding: #64 shipped, coverage passes on
`fix/audit-lockfile`, and D40 took the last open item off the checklist. Then Phase 5 (design system),
after the user merges PR #5 and the audit-lockfile PR lands the green `npm audit`.
Nothing is committed, pushed, merged or deleted without the user's word.
