# STATUS.md — migration state at a glance

**Repo:** `D:\Emcode\EM-Budget` · **Playbook:** `D:\Emcode\MIGRATION_PLAYBOOK.md`
**Updated:** 2026-10-09 — Phase 4 **gate rulings D36–D41 recorded**; D40 defers OCR out of mobile v1
and parks #65, D41 fixes the `.gitattributes` rule that would corrupt the screenshot baselines and its
follow-up `7fac3fa` restores the seven samples already damaged by it. Branch `phase4-logic-units`, PR #5 open.

## Tasks

| #       | Task                                                                                                     | State                                                                                                                                                                                                                                                                                             |
| ------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —       | Phases 0–3 (inventory, specs+goldens, scaffold, data/auth layer)                                         | DONE — merged to `origin/main` via PR #2/#4                                                                                                                                                                                                                                                       |
| #60–#63 | money port · five mid-size units · cycle engine · net-worth aggregates                                   | DONE — `049b772`, `cc8b247`, `fe8102d`, `5485b7f`                                                                                                                                                                                                                                                 |
| #64a    | transaction-service re-record, `PROJECTION_DEBT` emptied, D35 `srcTree` stamps                           | DONE — in `98ac2b8`; `validate.ts` PASS 14/1108                                                                                                                                                                                                                                                   |
| #64b    | live harness `parity/live/` (D34), 16-case `app-handlers.json`, Dart port of the nine `App.tsx` handlers | DONE — in `98ac2b8`; `flutter test` 769/769                                                                                                                                                                                                                                                       |
| #64c    | INVENTORY §13m write-up                                                                                  | DONE — `INVENTORY.md:1326-1392`, pushed with the gate docs                                                                                                                                                                                                                                        |
| #64     | Phase 4 logic port as a whole                                                                            | DONE — this is the last gate commit on the branch                                                                                                                                                                                                                                                 |
| #65     | Three-way OCR contract (D28/D32)                                                                         | **PARKED — D40.** OCR deferred out of mobile v1. Recorder scaffold lives on `feature/ocr-three-way-contract` (local commit, no push, no PR). Re-opened only when OCR returns to scope                                                                                                             |
| —       | `fix/audit-lockfile` — lockfile-only refresh of `compression`, `proxy-addr`, `source-map-js`             | PR OPEN — never `npm audit fix`, no `package.json` change; 24/24 e2e green, audit exit 0                                                                                                                                                                                                          |
| —       | Coverage option 2 — `AuditPanel.test.tsx`                                                                | DONE — 35 behaviour tests, `67dfdc9` → `307b5df`; all four thresholds pass with margin; D35 `srcTree` unmoved                                                                                                                                                                                     |
| —       | D35 re-stamp after B-23 landed — branch `chore/d35-srcTree-restamp`                                      | OPEN — fourteen fixtures move `srcTree` `9921f3a4…` → `b5e5bcc8…` and **no case in any of them moves**; `app-handlers.json` re-measured by a live harness run, all sixteen `expected` ledgers byte-identical; `validate.ts` PASS 14 units / 1108 cases. Diff prepared, **not pushed, not merged** |
| —       | Phase 4 gate → Phase 5 (design system)                                                                   | OPEN — the gate has nothing outstanding on it; #65 was the last item and D40 removed it                                                                                                                                                                                                           |

## Branches & PRs

| Ref                                            | What                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main` @ `5c64158` (`origin/main`)             | **Enterprise CI green** at `5c64158` and at `96a200f` (`gh api …/actions/runs?branch=main`, `event=push`, `success`), so `npm audit --audit-level=high` exits 0 on main — PR #6's lockfile-only refresh is what closed the 28 advisories. Local `main` sits at `96a200f`, **one fast-forward behind**; not moved without your word. |
| `phase4-logic-units`                           | PR #5 **MERGED**. It was green on Mobile Parity and red on Enterprise only because it branched before PR #6; main is now green on both                                                                                                                                                                                              |
| `bugfix/b23-credit-card-purchases` @ `1f6a1ce` | **MERGED** into `main` as `96a200f`. The fixture cost of that merge is the `D35 re-stamp` Tasks row, and `INVENTORY.md` §13m carries the measurement                                                                                                                                                                                |
| `fix/audit-lockfile` @ `307b5df`               | **MERGED** as PR #6 — its two commits are the lockfile-only 9-line refresh `67dfdc9` and `AuditPanel.test.tsx` `307b5df`, both ancestors of `origin/main`. This is the merge that turned Enterprise green above                                                                                                                     |
| `feature/ocr-three-way-contract` @ `7fac3fa`   | Parked #65 recorder scaffold, **local only** (no push, no PR). `83aa220` committed its 7 sample PNGs under the pre-D41 rule and damaged them; `7fac3fa` carries the `binary` lines and restores them — no history rewrite                                                                                                           |

## Open decisions waiting for the user

1. **Merge order (user merges on GitHub; the assistant never merges)** — PR #5 first. **Wait for the message "PR5 merged"** before updating `bugfix/b23-credit-card-purchases` onto the new main; then push, await Mobile Parity green, then "MERGE" for PR #3.
2. **B-10 is now the only entry awaiting a ruling** (DECISION count 4 → 1). It waits on the **user's own `schema_migrations` query** — answerable only from the live DB, and it blocks any fresh DB.
3. **B-26 phone-side trigger design** — roll only after a completed pull, inside `syncChains`. Awaits ruling.
4. **Tenants** — **no deletions, and no `e2e-*`/`qa-*` teardown work until Phase 4 closes.** 16 `qa-*@example.com` live, re-matched IDENTICAL to `D:\Emcode\backups\qa-export-20261006.json`. **466 `e2e-*@example.com`** (457 pre-existing + 9 from the audit-branch e2e run) are outside D18's scope; no spec destroys its tenant. The proposed `e2e/auth.ts` teardown and separate test Supabase project are **text only, not implemented**.
5. **`fix/audit-lockfile`** — review only. Merging it makes `npm audit` pass but **does not turn Enterprise CI green on its own**: at `307b5df` the run clears audit, lint and unit-coverage and then fails at **Format check** on `parity/fixtures/generate.ts`, which is unformatted on `main` and identical in both blobs. The fix for that file, and the `parity/** text eol=lf` rule, arrive with PR #5 — so green needs the item-1 order (merge #5, then update #6 onto main), after which the gated `e2e` job runs for the first time.
6. ~~**The 7 corrupt sample PNGs on the parked OCR branch**~~ — **DONE as `7fac3fa`, local only** (no push, no PR, no history rewrite): the four D41 `binary` lines plus the seven restored working copies, verified `staged OID == hash-object == hash-object --no-filters == file bytes` and a valid IHDR/IEND on each. It exposed the rule below.

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

| Claim                            | Test                                                                                                                    | Result                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| The rule rewrites PNG check-in   | `git hash-object --` (filters) vs `--no-filters` on `ledgerregistry.png`                                                | `352b5546…` (stored) vs `bc695095…` (would-be) — **the filter is lossy here**   |
| The 48 are content-unchanged     | `cmp` of each working file vs its blob                                                                                  | 48 byte-identical, 0 differing — the `M` entries were pure stat/filter noise    |
| CI checks them out stripped      | `core.autocrlf=false` clone (Linux-shaped), re-checkout via `checkout-index`                                            | **False.** 339 CRs, 79,072 bytes, intact signature — checkout is not lossy      |
| The fix resolves it              | `check-attr text binary` → `unset / set`; `hash-object --` == blob for all 48; `git status -- parity/screenshots` empty | all four hold, in both the working tree and the clone with the new lines        |
| No baseline blob moves           | `git diff --stat -- parity/screenshots/`                                                                                | empty                                                                           |
| Already-committed PNGs are valid | first 8 bytes of all 48 blobs, and of the 7 samples in `83aa220`                                                        | 48/48 valid; the 7 samples were **corrupt** there and are restored in `7fac3fa` |

**Correction to what I asserted at the previous gate:** I said CI "already checks them out in that
form". It does not — only check-in strips. The baselines were never damaged on disk or in the object
store; the exposure was a future `git add`, which is exactly what a Phase 5 re-record would have done.

**On the parked branch (`feature/ocr-three-way-contract`):** all seven sample PNGs were committed
under the rule in `83aa220`, so their blobs carried `89 50 4e 47 0a 1a 0a 00` — signature CR
stripped, file short by 1–2 bytes each — while the working copies stayed intact. Repaired on top by
`7fac3fa`, which adds the four `binary` lines and re-stages those seven files; no history rewrite,
still local only, no PR. That repair is also where the rule below came from: the first `git add`
staged nothing, because git believed those blobs were current content.

## Standing rule from D41

**After any `.gitattributes` change, `git add` on files git thinks are clean needs
`--renormalize`, and verification compares the staged OID to the file's own hash — never
`git status`.** The index caches stat data, so removing the filter that damaged a file leaves git
reporting it clean, and a plain add becomes a silent no-op. The check that catches it is
`git ls-files -s -- <path>` == `git hash-object -- <path>` == `git hash-object --no-filters --
<path>`, and after the commit the same comparison against `HEAD:<path>`.

## Exact next step

Close the Phase 4 gate. Nothing on it is outstanding: #64 shipped, coverage passes on
`fix/audit-lockfile`, and D40 took the last open item off the checklist. Then Phase 5 (design system),
after the user merges PR #5 and the audit-lockfile PR lands the green `npm audit`.
**One edit is deliberately uncommitted:** the D41-follow-up wording approved on 2026-10-09 (decision 6
closed, `7fac3fa` in the branch table, the standing rule above) sits in the working tree and must be
folded into the next commit that moves `phase4-logic-units`, never committed standalone. A dirty
`parity/STATUS.md` here is expected, not drift.
Nothing is committed, pushed, merged or deleted without the user's word.
