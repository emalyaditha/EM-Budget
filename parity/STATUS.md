# STATUS.md — migration state at a glance

**Repo:** `D:\Emcode\EM-Budget` · **Playbook:** `D:\Emcode\MIGRATION_PLAYBOOK.md`
**Updated:** 2026-10-08 · **Phase:** 4 (logic port) — branch `phase4-logic-units`, HEAD `98ac2b8` (pushed), PR #5 open.

## Tasks

| # | Task | State |
| --- | --- | --- |
| — | Phases 0–3 (inventory, specs+goldens, scaffold, data/auth layer) | DONE — merged to `origin/main` via PR #2/#4 |
| #60–#63 | money port · five mid-size units · cycle engine · net-worth aggregates | DONE — `049b772`, `cc8b247`, `fe8102d`, `5485b7f` |
| #64a | transaction-service re-record, `PROJECTION_DEBT` emptied, D35 `srcTree` stamps | DONE — in `98ac2b8`; `validate.ts` PASS 14/1108 |
| #64b | live harness `parity/live/` (D34), 16-case `app-handlers.json`, Dart port of the nine `App.tsx` handlers | DONE — in `98ac2b8`; `flutter test` 769/769 |
| #64c | INVENTORY §13m write-up | OPEN — the only part of #64 still owed |
| #65 | Three-way OCR contract (D28/D32) | OPEN — own branch, **synthetic receipts only** |
| — | Phase 4 gate: B-26 count query + read-only audit report | DONE — `parity/sql/b26_double_rollover_count.sql` (unexecuted; user runs it) |
| — | `fix/audit-lockfile` — lockfile-only refresh of `compression`, `proxy-addr`, `source-map-js` | IN PROGRESS — never `npm audit fix`, no `package.json` change |
| — | Phase 4 gate → Phase 5 (design system) | BLOCKED on §13m + the five rulings below |

## Branches & PRs

| Ref | What |
| --- | --- |
| `main` @ `337bd4a` (local == origin) | Phases 0–3 + money port. **Enterprise CI FAILS here** at `npm audit --audit-level=high` (28 adv: 25 moderate, 2 high, 1 critical) |
| `phase4-logic-units` @ `98ac2b8` | PR #5. Mobile Parity CI **green** (fixes the dart lint); Enterprise still red on npm audit; Vercel green |
| `bugfix/b23-credit-card-purchases` @ `1f6a1ce` | PR #3. **Already contains `origin/main`** (`524bbb4`), so re-testing against main cannot help — its Mobile Parity failure is the same dart lint only PR #5 fixes |

## Open decisions waiting for the user

1. **Merge order (user merges on GitHub; the assistant never merges)** — PR #5 first, then `bugfix/b23` is updated onto the new main and pushed, Mobile Parity green awaited, then "MERGE" for PR #3.
2. **`fix/audit-lockfile`** — review only; not merged. Merging it is what turns Enterprise CI (and therefore the gated `e2e` job) green.
3. **B-26 phone-side trigger design** — roll only after a completed pull, inside `syncChains`. Awaits ruling.
4. **Tenants** — no deletions. 16 `qa-*@example.com` still live, re-matched IDENTICAL to `D:\Emcode\backups\qa-export-20261006.json`. **457 `e2e-*@example.com` exist and are outside D18's scope** (448 pre-existing + 9 from the local b23 e2e run); no spec destroys its tenant.
5. **Rulings owed:** B-08, B-10, B-19, B-20, B-25. Default for logic bugs is *replicate*.

## Exact next step

Write INVENTORY §13m, then re-run the gate set (`validate.ts`, `tz-proof.ts`, `flutter test`, `npm run lint`) and ask for commit authorization on an explicit path list. #65 starts on its own branch after `98ac2b8` + this gate commit are pushed. Nothing is committed, pushed, merged or deleted without the user's word.
