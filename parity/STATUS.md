# STATUS.md — migration state at a glance

**Repo:** `D:\Emcode\EM-Budget` · **Playbook:** `D:\Emcode\MIGRATION_PLAYBOOK.md`
**Updated:** 2026-10-08 — Phase 4 **gate rulings D36–D40 recorded**; D40 defers OCR out of mobile v1
and parks #65. Branch `phase4-logic-units`, PR #5 open.

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

| Ref                                            | What                                                                                                                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main` @ `337bd4a` (local == origin)           | Phases 0–3 + money port. **Enterprise CI FAILS here** at `npm audit --audit-level=high` (28 adv: 25 moderate, 2 high, 1 critical)                                |
| `phase4-logic-units`                           | PR #5. Mobile Parity CI **green**; Enterprise still red on npm audit; Vercel green                                                                               |
| `bugfix/b23-credit-card-purchases` @ `1f6a1ce` | PR #3. **Already contains `origin/main`** (`524bbb4`), so re-testing against main cannot help — its Mobile Parity failure is the same dart lint only PR #5 fixes |
| `fix/audit-lockfile` @ `307b5df`               | Two commits: lockfile-only 9-line refresh `67dfdc9`, then `AuditPanel.test.tsx` `307b5df`. **Do not merge** — the user merges.                                   |

## Open decisions waiting for the user

1. **Merge order (user merges on GitHub; the assistant never merges)** — PR #5 first. **Wait for the message "PR5 merged"** before updating `bugfix/b23-credit-card-purchases` onto the new main; then push, await Mobile Parity green, then "MERGE" for PR #3.
2. **B-10 is now the only entry awaiting a ruling** (DECISION count 4 → 1). It waits on the **user's own `schema_migrations` query** — answerable only from the live DB, and it blocks any fresh DB.
3. **B-26 phone-side trigger design** — roll only after a completed pull, inside `syncChains`. Awaits ruling.
4. **Tenants** — **no deletions, and no `e2e-*`/`qa-*` teardown work until Phase 4 closes.** 16 `qa-*@example.com` live, re-matched IDENTICAL to `D:\Emcode\backups\qa-export-20261006.json`. **466 `e2e-*@example.com`** (457 pre-existing + 9 from the audit-branch e2e run) are outside D18's scope; no spec destroys its tenant. The proposed `e2e/auth.ts` teardown and separate test Supabase project are **text only, not implemented**.
5. **`fix/audit-lockfile`** — review only. Merging it makes `npm audit` pass but **does not turn Enterprise CI green on its own**: at `307b5df` the run clears audit, lint and unit-coverage and then fails at **Format check** on `parity/fixtures/generate.ts`, which is unformatted on `main` and identical in both blobs. The fix for that file, and the `parity/** text eol=lf` rule, arrive with PR #5 — so green needs the item-1 order (merge #5, then update #6 onto main), after which the gated `e2e` job runs for the first time.

## Ruled at this gate (D36–D40)

| Bug  | Ruling                                                                                                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-08 | **Leave** the `tsconfig.json` exclude hole open (D36); `validate.ts` + `dart analyze --fatal-infos` stay the defence                                                                              |
| B-19 | **Option (a)** — Bearer stays on (D37); seam retained                                                                                                                                             |
| B-20 | **Replicate**, do not send `instance_type` (D38); web fix → post-parity list                                                                                                                      |
| B-25 | **Deliberate deviation approved** (D39) — re-enable the control on timeout and show the error; recorded in `UI_SPEC.md`; web fix → post-parity list                                               |
| OCR  | **Deferred out of mobile v1 (D40).** #65 parked; the `/api/ocr/free-scan` plan stands for when it is added; `freeOcrParser.ts` stays server-side. Recorded as `UI_SPEC.md` §7 deviation **D-U16** |

## Exact next step

Close the Phase 4 gate. Nothing on it is outstanding: #64 shipped, coverage passes on
`fix/audit-lockfile`, and D40 took the last open item off the checklist. Then Phase 5 (design system),
after the user merges PR #5 and the audit-lockfile PR lands the green `npm audit`.
Nothing is committed, pushed, merged or deleted without the user's word.
