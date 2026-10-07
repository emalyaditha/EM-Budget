# STATUS.md — migration state at a glance

**Repo:** `D:\Emcode\EM-Budget` · **Playbook:** `D:\Emcode\MIGRATION_PLAYBOOK.md`
**Updated:** 2026-10-07 (after session crash; recon re-verified against the tree, not memory)
**Phase:** 4 (logic port) — branch `phase4-logic-units`, HEAD `5485b7f`, PR #5 open.

## Tasks

| # | Task | State |
| --- | --- | --- |
| — | Phases 0–3 (inventory, specs+goldens, scaffold, data/auth layer) | DONE — merged to `origin/main` via PR #2/#4 |
| #60 | `money` port + locale ruling (D25) | DONE — committed `049b772` |
| #61 | Five mid-size units (installments, alerts, csv, validators, display-interest) | DONE — committed `cc8b247` |
| #63 | Credit-card cycle engine | DONE — committed `fe8102d` |
| #62 | Net-worth aggregates + second coercion | DONE — committed `5485b7f` |
| #64a | transaction-service re-record; `PROJECTION_DEBT` emptied; D35 `srcTree` stamps | DONE **uncommitted** — all 14 fixtures + `src-tree.ts`, `validate.ts` PASS 14/1108 |
| #64b | Live harness `parity/live/` (D34), `app-handlers.json` (16 cases), Dart port of the nine `App.tsx` handlers | CODE DONE **uncommitted** — `flutter test` 769/769, analyze + format clean; **INVENTORY §13m write-up not yet written** |
| #65 | Three-way OCR contract (D28/D32) | OPEN — ruled 2026-10-07: its own branch after #64 is pushed; **synthetic receipts only**. `parity/live/ocr/` scaffold + `.qa_ocr_*` scratch stay untracked. |
| — | Phase 4 gate deliverables | OPEN — the **B-26 count query** and the **read-only audit report** are owed to the user at the gate. |
| — | Phase 4 gate → Phase 5 (design system) | OPEN |

## Open decisions waiting for the user

1. **#64 commit authorization** — needs §13m written, then one commit by explicit path (D27 style). Never pushed without approval.
2. **PR #3 (B-23 web fix)** — awaits "MERGE". Both CI jobs currently FAIL on it (Enterprise = known `npm audit`; Mobile Parity CI failure needs a look before merge).
3. **PR #5** — Mobile Parity CI green at HEAD; merge decision after #64 lands.
4. **B-26** — rollover double-charge: phone-side trigger design (roll only after completed pull, inside `syncChains`) awaits ruling.
5. **QA cleanup (D18)** — 16 `qa-*@example.com` tenants still exist; the current `--leftover qa-` list must be re-matched against the approved 16 in `D:\Emcode\backups\qa-export-20261006.json` before any "GO".
6. Standing DECISIONs: B-08, B-10, B-20 (recommendation: send `instance_type`), B-25 (recommendation: re-enable), B-19 bearer deviation.

## Branches & PRs

| Ref | What |
| --- | --- |
| `origin/main` @ `337bd4a` | Phases 0–3 + money port (PR #4 merged). Local `main` is stale at `a35bf61`. |
| `phase4-logic-units` @ `5485b7f` + dirty tree | PR #5. Dirty = all of #64 + D34/D35/§13l doc records (uncommitted). |
| `bugfix/b23-credit-card-purchases` @ `1f6a1ce` | PR #3. Contains `1d1efe8` (9-line `src/supabase.ts` fix) + docs. Not merged. |
| `flutter-migration` | historical; already merged. |

## Exact next step

Finish #64: write INVENTORY §13m (harness + nine-handler port + B-28 ruling evidence), re-run the full
gate set (`validate.ts`, `tz-proof.ts`, `flutter test`, `npm run lint`), then ask for commit authorization
on the explicit path list — do not commit or push without it.
