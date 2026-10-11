# STATUS.md — migration state at a glance

**Repo:** `D:\Emcode\EM-Budget` · **Playbook:** `D:\Emcode\MIGRATION_PLAYBOOK.md`
**Updated:** 2026-10-11 — Phase 5 in flight on `phase5-design-system` (**PR #8, draft**, green at
`43c02f9`): the generator ships 16 theme files, fourteen widgets are ported, and the #56 Modal/Sheet
port landed in `5d0df70` — one `AppModal` primitive with a dialog and a sheet variant, deviations
1–11 accepted by the user. **This commit records the items 2–6 small-chrome batch** — icon chip ·
pill/chip cluster · segmented · progress bars, one batch, one gate, one commit set — with the glass
panel resolved as `AppCard`’s measured `.glass-panel` surface rather than a second paint stack, and
bug **B-29** (Reports Centre’s phantom `delta-chip-up`/`delta-chip-down` classes) entered in
`BUGS_FOUND.md`. Item 1 (breakpoint enumeration) closed as `43c02f9`. Earlier: Phase 4 **gate rulings
D36–D41 recorded**; D40 defers OCR out of mobile v1 and parks #65, D41 fixes the `.gitattributes`
rule that would corrupt the screenshot baselines and its
follow-up `7fac3fa` restores the seven samples already damaged by it. Branch `chore/d35-srcTree-restamp`, PR #9 open.

## Tasks

| #       | Task                                                                                                                                       | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| —       | Phases 0–3 (inventory, specs+goldens, scaffold, data/auth layer)                                                                           | DONE — merged to `origin/main` via PR #2/#4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| #60–#63 | money port · five mid-size units · cycle engine · net-worth aggregates                                                                     | DONE — `049b772`, `cc8b247`, `fe8102d`, `5485b7f`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| #64a    | transaction-service re-record, `PROJECTION_DEBT` emptied, D35 `srcTree` stamps                                                             | DONE — in `98ac2b8`; `validate.ts` PASS 14/1108                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| #64b    | live harness `parity/live/` (D34), 16-case `app-handlers.json`, Dart port of the nine `App.tsx` handlers                                   | DONE — in `98ac2b8`; `flutter test` 769/769                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| #64c    | INVENTORY §13m write-up                                                                                                                    | DONE — `INVENTORY.md:1326-1392`, pushed with the gate docs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| #64     | Phase 4 logic port as a whole                                                                                                              | DONE — this is the last gate commit on the branch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| #65     | Three-way OCR contract (D28/D32)                                                                                                           | **PARKED — D40.** OCR deferred out of mobile v1. Recorder scaffold lives on `feature/ocr-three-way-contract` (local commit, no push, no PR). Re-opened only when OCR returns to scope                                                                                                                                                                                                                                                                                                                                                                                    |
| —       | `fix/audit-lockfile` — lockfile-only refresh of `compression`, `proxy-addr`, `source-map-js`                                               | **MERGED** as PR #6 — never `npm audit fix`, no `package.json` change; 24/24 e2e green, audit exit 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| —       | Coverage option 2 — `AuditPanel.test.tsx`                                                                                                  | DONE — 35 behaviour tests, `67dfdc9` → `307b5df`; all four thresholds pass with margin; D35 `srcTree` unmoved                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| —       | D35 re-stamp after B-23 landed — branch `chore/d35-srcTree-restamp`                                                                        | OPEN — fourteen fixtures move `srcTree` `9921f3a4…` → `b5e5bcc8…` and **no case in any of them moves**; `app-handlers.json` re-measured by a live harness run, all sixteen `expected` ledgers byte-identical; `validate.ts` PASS 14 units / 1108 cases. Pushed as **PR #9**, open, **not merged**                                                                                                                                                                                                                                                                        |
| —       | Phase 4 gate → Phase 5 (design system)                                                                                                     | OPEN — the gate has nothing outstanding on it; #65 was the last item and D40 removed it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| #46–#49 | `parity/generate_theme.cjs` + generated `mobile/lib/core/theme/` (13 files) + `ui_tokens_test.dart` drift suite                            | DONE — fail-rather-than-guess emitter, idempotent across all 13 outputs by sha256, drift tests re-derive every value from `ui-tokens.json`/`index.css` — no pinned literals                                                                                                                                                                                                                                                                                                                                                                                              |
| #50–#60 | AppCard · AppButton · AppFormField · AppSkeleton · AppIconButton (+ `.glass-pill` context) · AppNav                                        | DONE — each from its measured row with pixel/behaviour tests on the same pipeline                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| #61–#62 | Toast and Modal/Sheet utility-stack measurement tiers                                                                                      | DONE — `66c5e91`, `b7759d1`; the toast rows stay Phase 6, the modal rows feed the port below                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| #63–#68 | **Modal/Sheet port — one `AppModal` primitive, dialog + sheet variants**                                                                   | **DONE — `5d0df70`.** Gates: format 0-changed, `--fatal-infos` clean, `flutter test` **1062** (baseline 1041: +9 drift re-derivations, +12 behaviour tests), generator idempotent, prettier clean, `UI_SPEC.md` unchanged, the 12 older generated files byte-identical to HEAD. Deviations 1–11 accepted; see the section below                                                                                                                                                                                                                                          |
| —       | **Items 2–6 batch — `AppIconChip` · `AppPill` + `AppChipSelect` + `AppDeltaChip` + `AppCardFaceChip` · `AppSegmented` · `AppProgressBar`** | **DONE — this commit.** Glass panel (item 5) is `AppCard`’s `.glass-panel` surface, not a second widget — decision below. New generated rows: `app_chips.dart`, `app_segments.dart`, `app_bars.dart`. Gates: format 0-changed, `--fatal-infos` clean (one generator-template fix), `flutter test` **1193** (baseline 1062: +57 drift re-derivations — `ui_tokens_test.dart` is 198 — and +74 behaviour tests in seven new files), generator idempotent by sha256, the 13 older generated files byte-identical, prettier clean. B-29 entered. See the batch section below |

## Branches & PRs

| Ref                                            | What                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main` @ `5c64158` (`origin/main`)             | **Enterprise CI green** at `5c64158` and at `96a200f` (`gh api …/actions/runs?branch=main`, `event=push`, `success`), so `npm audit --audit-level=high` exits 0 on main — PR #6's lockfile-only refresh is what closed the 28 advisories. Local `main` sits at `96a200f`, **three commits behind** (`0010ecc`, `82eed70`, then PR #7's merge `5c64158`); not fast-forwarded without your word. |
| `phase4-logic-units`                           | PR #5 **MERGED**. It was green on Mobile Parity and red on Enterprise only because it branched before PR #6; main is now green on both                                                                                                                                                                                                                                                         |
| `bugfix/b23-credit-card-purchases` @ `1f6a1ce` | **MERGED** into `main` as `96a200f`. The fixture cost of that merge is the `D35 re-stamp` Tasks row, and `INVENTORY.md` §13m carries the measurement                                                                                                                                                                                                                                           |
| `fix/audit-lockfile` @ `307b5df`               | **MERGED** as PR #6 — its two commits are the lockfile-only 9-line refresh `67dfdc9` and `AuditPanel.test.tsx` `307b5df`, both ancestors of `origin/main`. This is the merge that turned Enterprise green above                                                                                                                                                                                |
| `feature/ocr-three-way-contract` @ `7fac3fa`   | Parked #65 recorder scaffold, **local only** (no push, no PR). `83aa220` committed its 7 sample PNGs under the pre-D41 rule and damaged them; `7fac3fa` carries the `binary` lines and restores them — no history rewrite                                                                                                                                                                      |
| `phase5-design-system`                         | **OPEN as draft PR #8** — the Flutter design system: generator, fourteen ported widgets, the modal/sheet port `5d0df70` and the items 2–6 small-chrome batch (CI green at `43c02f9`). Pushed; only the user merges                                                                                                                                                                             |

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

## The Modal/Sheet port (#63–#68, user-approved deviations 1–11)

One primitive — `AppModal` with `AppModalVariant.dialog` (`ui/Modal.tsx`, measured `.modal-panel`)
and `.sheet` (`ui/BottomSheet.tsx`, measured `.sheet-panel`) — because InstallmentPlan delegates to
the same dialog shell. Every value is a measured row or an authored-non-CSS entry re-derived by the
drift group; the public parameters are `isOpen, onClose, title, closeGlyph, child,
wideBreakpointPx, variant, veil, widthToken`.

Accepted deviations, as ruled: (1) **breakpoint caller-supplied** — no evidence measures the Tailwind
`sm:` width; resolved by the breakpoint enumeration run below, never hardcoded to a Tailwind
default; (2) shell `overflow-y` kept as row data only — the measured caps keep the shell column inside
every captured viewport, and a Flutter scroll port would coat the veil with an opaque hit target and
break outside-tap dismissal; (3) mount-while-open plays the enter from `didChangeDependencies`;
(4) measured `0px` border sides painted as `BorderStyle.none` (Flutter's rounded painter rejects
zero-width solid sides; colours and widths otherwise verbatim); (5) the grip wrapped in `Align` —
the web authors `mx-auto` and the panel column would otherwise stretch it panel-wide;
(6) `SpringSimulation(snapToEnd: true)` — settle at the authored target exactly; frame-exact motion
is claimed nowhere (no pixel evidence for the browser integrator); (7) `veilFadeEase =
Cubic(0.42, 0, 0.58, 1)` and spring `mass = 1.0` asserted explicitly as framework/motion defaults;
(8) `92dvh == 92vh` recorded as a capture coincidence — caps are fraction × `MediaQuery` height,
reproducing the measured 720/765/810/828 desktop and 675.2/717.4/759.6/776.48 phone pixels;
(9) body-scroll-lock kept as a measured flag, its Flutter analogue is route hosting by the caller;
(10) close radius kept verbatim `33554400.0` (Chrome's rounded-full clamp); (11) the sheet shadow's
four transparent layers ported verbatim and z-index carried as data (one Stack, measured order).

**xl/2xl audit (read-only, this gate):** `ui/Modal` has exactly one call site in `src/` —
`InstallmentPlanModal.tsx:39` with `maxWidth="md"`. **No modal uses `xl` or `2xl`.** The only
`max-w-xl` outside `Modal.tsx`'s map is `App.tsx:4309`, a hero text paragraph (`hidden md:block`),
not a modal; `max-w-2xl` appears nowhere but the map. `AppModals.widthPx` therefore carries exactly
`{sm, md, lg}` per the authored map default `md`, and the unported `xl`/`2xl` entries are recorded as
reachable-by-default only, unused.

**Side-by-side images:** none possible from existing evidence — all 72 web baselines
(`parity/screenshots/web/`) are closed-modal page states at 360/390/430; no capture shows a modal or
sheet open. Produced instead by the pixel-free route: geometry assertions at the captured 390/1440 in
the behaviour suite. A visual pair needs a new capture run on both sides, which this gate did not
authorize.

## Breakpoint enumeration (item 1 — closes modal deviation 1)

Read-only run on 2026-10-11, measured rather than assumed, per the gate ruling.

| Breakpoint | Source truth                                                                                                                | px at the capture root |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `sm`       | `--breakpoint-sm: 40rem` — installed Tailwind `4.3.0` defaults (`node_modules/tailwindcss/theme.css:327-331`)               | `640`                  |
| `md`       | `48rem`                                                                                                                     | `768`                  |
| `lg`       | `64rem`                                                                                                                     | `1024`                 |
| `xl`       | `80rem`                                                                                                                     | `1280`                 |
| `2xl`      | `96rem` — **emitted once, by `.container{max-width:96rem}` (`DatePicker.tsx`); no `2xl:` variant utility exists in `src/`** | `1536`                 |

The chain, each link checked: `@theme` in `src/index.css:286-290` defines only the three font
families — **no `--breakpoint-*` override**; the `html`/`body` BASE rules (`src/index.css:295-309`)
set **no `font-size`**, so `1rem = 16px` of the harness Chromium default, the same condition every
baseline was captured under (the only `font-size: 10px` near the top of the cascade is `.eyebrow`,
`:367`). The shipped stylesheet — `npx vite build` (8.64 s, frontend only; the `build` script's
esbuild step was deliberately not run so `api/index.js` stays untouched), then
`grep '@media' dist/assets/index-*.css`, 116,227 bytes — contains exactly these min-width preludes:
`(min-width:40rem)` ×2, `48rem` ×2, `64rem` ×2, `80rem` ×2, `96rem` ×1, plus two hand-authored px
queries: `(min-width:1024px)` hiding `.floating-nav` (`src/index.css:1166-1172`, whose own comment
demands it "match the sidebar's `lg` breakpoint exactly" — it does), and `(min-width:420px)` for a
single arbitrary variant `min-[420px]:grid-cols-3` (`ReportsCentre.tsx:263`) — a one-off grid
toggle, **not a theme breakpoint**.

**What this fixes for the port.** Every divergent pair on the two modal shells switches at `sm` —
`p-4 sm:p-6` (shell `Modal.tsx:49`, body `:92`, `BottomSheet.tsx:63`), `items-end
sm:items-center` (`BottomSheet.tsx:23`), `border-t sm:border` / `rounded-t-2xl sm:rounded-2xl` /
grip `sm:hidden` (`:40`, `:42`) — so `AppModal`'s `wideBreakpointPx` is **640**, still
caller-supplied (the widget stays evidence-driven; callers now pass the measured number), and the
behaviour suite's 390/1440 pair straddles it. The nav surface flips at `lg` = **1024**. The
wide-baseline plan reads from this table: a 1440 set is past `sm`/`md`/`lg` and inside `xl`
(`xl:` utilities are in live use — `hidden xl:flex`, `xl:grid`, `xl:col-span-*`); a 1280 set sits
exactly at the `xl` edge; `2xl` changes nothing in this app.

## Items 2–6 batch — the small chrome widgets (one batch, one gate)

The scope ruling ran items 2–6 as a single batch on the established pipeline: measure → emit →
drift tests → widget → behaviour tests. Seven new widgets, three new generated row files
(`app_chips.dart`, `app_segments.dart`, `app_bars.dart`), 57 new drift re-derivations and 74 new
behaviour tests; every value re-derived from `ui-tokens.json` / `index.css`, no pinned literals.

| Item | Widget(s)                 | Measured rows                                                                                                                                                                                                                                     |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2    | `AppIconChip`             | `.icon-chip` — the only chip class that authors its own box (40×40); plate fill/frame/radius, press absent (null fields asserted)                                                                                                                 |
| 3    | `AppPill` (`filter-chip`) | `.pill` + `.pill-active` — the pair composes one box: geometry/type/clock from `.pill`, colour swap from the active row; press fill, disabled fade and 130 ms release all on the resting row                                                      |
| 3    | `AppChipSelect`           | `.chip-select` — frost (blur 10, `saturate` not authored → null asserted), press fill, inert-with-no-callback repaints nothing                                                                                                                    |
| 3    | `AppDeltaChip`            | `.delta-chip` + tint from `.delta-up`/`.delta-down` — fill on chip geometry, ink from the tint, tabular figures on; a label, not a control (no gesture/ink anywhere)                                                                              |
| 3    | `AppCardFaceChip`         | the face chip — outer gradient + inset ring, theme-independent rows, alpha-bearing ring asserted `< 1.0`                                                                                                                                          |
| 4    | `AppSegmented`            | `.segment` track + `.segment-item` — track owns frost/gap, carries no type (its font fields null); selected fill/ring live on the item; eased landing tested through a caller-owned `selected` harness, because the widget changes nothing itself |
| 6    | `AppProgressBar`          | `.bar-pink/mint/yellow/lavender/blue` + `.rainbow-bar`                                                                                                                                                                                            |

**Item 5 — glass panel: no widget, and that is the port.** `AppCard` already paints the measured
`.glass-panel` row: `AppCardSurface.glassPanel` carries r24 / hairline frame / 0.62 wash / two-and-
three-layer shadow stack / blur σ 11 (= 22px ÷ 2, D-U8), and `app_card_test.dart` asserts fill,
shadows, `BackdropFilter` sigma, `ClipRRect` and border per pass. A second widget over the same row
would give one measurement two owners — the drift suite and the card tests stay the single source.
Recorded so a later screen cannot “discover” the missing class.

**Item 6 — the bar named a progress bar refuses to be one.** No §6 bar class measures a layout box
(the probe rows carry computed paint only), no class in `src/` measures or animates a value, and the
call sites split by utility, not by class: `.bar-*` fills go on `w-9 h-9` plates, legend swatches and
`h-full` meters with inline `style={{ width: pct }}`; `.rainbow-bar` is a decorative 3px hairline,
spanning or absolutely placed, overridden with `!h-1`/`!h-1.5`. So `AppProgressBar` paints the row
into the caller’s box — defaulting to the authored hairline for `.rainbow-bar`, authoring no height
for the pastels (`spec.heightPx` null is asserted, so no screen can inherit an invented default),
and expressing percentage by sizing the box, exactly as the web resolves the inline percentage. The
absence of `ProgressIndicator`/`Material`/`AnimatedContainer`/`TweenAnimationBuilder` in its tree is
a test, not a comment.

**Harness constraint learned this batch (kept for every future geometry test).** Flutter’s
`RenderConstrainedBox` enforces its additional constraints _against the parent_: a **tight** parent
constraint beats the child’s authored size (`proxy_box.dart`, `performLayout`). A
`Center(child: SizedBox(frame, child: bar))` harness therefore let the test frame’s 24px beat the
hairline’s authored 3px — a harness bug, not a widget bug. Faithful harness: frame **outside**,
`Center` **inside** (loose world, like the web’s line box); `tight: true` only for the `w-9 h-9`
call sites that genuinely size their child. Gap tests likewise measure between UniqueKey-marked
boxes, not `find.byType(SizedBox)`, which also matches the widgets’ own internals.

**B-29.** The §6 measurement walked the classes call sites actually apply and found
`ReportsCentre.tsx:250` applying `delta-chip-up`/`delta-chip-down` — defined nowhere in `src/`.
The Reports Centre delta chip renders untinted; the dashboard’s identical chip (`delta-up`/
`delta-down`) does not. Entered **OPEN — replicate**; the port note pins the untinted render when
that screen is ported.

**Gates at this batch:** `dart format` 0-changed · `flutter analyze --fatal-infos` clean — after
one generator-template fix (`app_segments.dart`’s `resolve` threw braceless once formatted; the
emitter now uses the braced form and the regenerated bytes pass) · `flutter test` **1193** ·
generator idempotent by sha256 across re-runs · the 13 older generated theme files byte-identical
to HEAD · prettier clean · secret sweep + D41 triple-hash below.

## Item 7 — numeral/money typography (one gate)

The ruling of 2026-10-11 fixed the order at **7 → 10 → 8, 9 → 14**: item 7 lands on its own gate,
then the fonts (so later widgets use the real glyphs), then the transaction row and the card faces.

**What landed.** The generator's 17th file, `app_numerals.dart` — the seven `src/index.css:359-426`
rows × the two phone passes, with `styleAt(sizePx)` for the em law below and `heroFontSizePx` for
the `min(--text-num, 15cqi)` cap. `mobile/lib/presentation/widgets/app_numeral.dart` with `AppNumeral` and `AppNumeralKind`
(six faces; `.numeral-sup` is deliberately not a face); `app_numeral_test.dart` with **28**
behaviour tests; and **+24** numeral drift tests in `ui_tokens_test.dart`. The suite went
1193 → **1248**.

**The first requirement is a test, not a comment.** The widget never formats: a static-source ban
asserts `NumberFormat`, `toStringAsFixed`, `replaceAll`, `parse` and `intl` are absent from the
widget file, and a pass-through test paints `'Rs.12,50,000'`, `'Rs.'` and `''` verbatim. Pumping the
tree under `Locale('de','DE')` leaves `Text.locale` null — the ambient locale does **not** reach the
digits, because choosing the formatter's locale is the screen's decision (D-12), not the widget's.
An `AppMoneyText` that owned the formatting was considered and rejected: it would be a second,
locale-divergent copy of `formatMoney`.

**Fixtures rendered through the widget.** All **101** `formatMoney(` string cases of
`money.json` and all **335** string cases of `number-locale.json`, i.e. **every tag the fixtures
carry** — en-US, en-IN, de-DE, fr-FR, hi-IN, ar-EG, cs-CZ, bn-BD, en-LK, si-LK — not the two the
ruling asked for as a minimum. The 99 non-string `money.json` expectations are the numeric half of
that unit and are skipped by an `accept` predicate rather than assumed away.

**The `em` law, which is the finding worth keeping.** Every one of these rows authors its tracking
in `em`, and CSS resolves an `em` against the element's _used_ font size. So a call site's
`text-[19px]` moves the row's tracking with it: `.money` at 19px is −0.19px, not the measured
−0.16px. `AppNumeral` re-derives the row through `styleAt(usedFontSizePx)` instead of trusting
`letterSpacingPx`, and a test pins `letterSpacing == letterSpacingEm × fontSize` for every kind.
The tag's four ems are a second order of the same law: `font-size: .28em` of the figure, then
`letter-spacing`/`margin-left`/`vertical-align` resolving against _that_ — at a 38px figure, size
10.64, tracking 0.4256, gap 2.9792 = 0.28×10.64, lift 6.5968 = 0.62×10.64. The tests derive these
from `AppNumerals.supAt(used)` rather than hard-coding them, so item 10 breaks the font bundle, not
this suite twice.

**`.numeral-sup` has no face.** Its standalone §6 probe row is 6px because Chrome floors a tiny used
font size at 6px while `letter-spacing` keeps resolving from the _specified_ 0.28 × 16px — which is
exactly what the row's measured 0.1792px is. That row is therefore unusable as a call-site value;
the four ratios are carried as `supFontSizeEm`/`supLetterSpacingEm`/`supVerticalAlignEm`/
`supMarginLeftEm` and resolved against the numeral the tag sits in. `.numeral-hero` is the other
half-row: it authors only `font-size`, and its only call site carries `numeral numeral-hero`, so
`metricsClass` lets `.numeral` supply everything the hero does not.

**The superscript, given this SDK.** `WidgetSpan` has no `margin`, so `margin-left` is a `Padding`
and `vertical-align: 0.62em` is a `Transform.translate` inside it, with
`PlaceholderAlignment.aboveBaseline` + `TextBaseline.alphabetic`. `vertical-align` is a paint-time
raise of an inline box — it does not give the span room, it moves the span within the room the
parent's line box already has — and `RenderShiftedBox.computeDistanceToActualBaseline` forwards the
`Text`'s real baseline through both wrappers, so the line flows around the baseline and not the
lifted glyphs. Measured: sup box 33.1968×11.0, baseline 7.98 = 0.75em.

**Two deviations, both carried as data.**

1. **`overflow-wrap: anywhere`** (rows `.money-display`, `.numeral`, `.numeral-md`,
   `.numeral-hero`) — this Flutter SDK exposes neither `TextStyle.overflowWrap` nor `Text.wordBreak`,
   so a figure breaks only at a space. `AppNumeralSpec.overflowWrapAnywhere` records the authored
   fact and a test asserts it is data, not a knob. Nothing in item 7 depends on it: the hero keeps
   its `min()` cap and `CardFace` keeps `maxFractionDigits: 0`.
2. **`min-width: 0`** — a flex-item hint with no analogue here; Flutter already offers a `Text` its
   parent's max width. Recorded on the spec, nothing to port.

**360px, and the 320px capture that does not exist.** The seven-figure demand is covered for
`LKR2,588,660`, `Rs.1,234,567.89` and `Rs.1,250,000.00`: box ≤ 360 and `takeException()` null, plus
one-line heights derived from a `TextPainter` on the composed style rather than hard-coded, so a
line-height claim cannot turn into a font-metrics claim. Whether the digits _wrap_ is glyph-
dependent, because the harness fallback advances 1em per glyph and applies `letterSpacing` after the
last one too — 12 characters at 38px measure 442.3px, so the 360px case wraps rather than clips.
That is recorded as the fallback's arithmetic, not the web's. **The "320px screenshot" named in the
ruling is not in the capture set**: `parity/screenshots/web/*` has 360, 390 and 430 only. The
testable core of the request — a 7-digit amount inside a phone-width card — is covered at 360px; a
320px baseline would be a new capture-set decision, not an item-7 finding.

**Item-10 re-check list.** Every glyph-dependent assertion is tagged `ITEM-10 RECHECK`, and there
are five, all in `app_numeral_test.dart`: the suite header (line 32), the signed/unsigned one-line
height equality (511 — a wider face could push the longer string to a second line and make that the
wrong shape of assertion), the 360px wrap tripwire (845 — expected to flip to one line when
Plus Jakarta Sans lands), the `CardFace` one-line fit (870, in the other direction), and the pubspec
gate (949) that asserts `'Plus Jakarta Sans'` is **not** yet named, so item 10 has to fail something
to prove it happened. Beyond the markers, item 10 re-checks the hero `15cqi` cap's rendered width
and every row's `heightRatio`, both currently measured in Roboto.

**Gates at this batch:** `dart format --set-exit-if-changed lib test` clean · `flutter analyze
--fatal-infos` clean · `flutter test` **1248** · generator re-run idempotent — the 16 older theme
files byte-identical to HEAD, `app_numerals.dart` the only new file, `generate_theme.cjs` prettier
clean at 598 added / 0 deleted lines (a pure addition) · secret sweep + D41 triple-hash below.

## Phase 6 checklist (recorded at this gate, nothing built here)

- Feature-modal compositions on `AppModal`: QuickAction, DebtDetail (its literal 6px veil blur is
  already a recorded entry), TransactionEdit, Settings, InstallmentPlan.
- Toast widget: the 19 `.toast`/`.toast-*` rows from #61 plus springs 25/220, 26/240, 28/260 and the
  8s error-toast lock, with behaviour tests for settle timing and the lock duration.
- **Keyboard-open over a form inside a modal, for every modal with inputs** — scroll-into-view and
  veil re-layout behaviour, measured or explicitly deviated.
- **Large system font setting, for every modal with inputs** — the caps are viewport fractions, so a
  text-scale pass must be re-measured against the 80/85vh behaviour before shipping.
- ~~The breakpoint enumeration run, closing deviation 1.~~ **Done in Phase 5** — see the
  Breakpoint enumeration section above; `sm` = 640 is the shells' answer.

## Exact next step

Phase 5 under the scope ruling of 2026-10-11: item 1 done (`43c02f9`); items 2–6 done as one
batch; **item 7 done (this commit)**; and the ruling reorders what follows as
**10 → 8, 9 → 14**. Next is **item 10 — fonts**: Plus Jakarta Sans 300–800, Inter 300–600 and
JetBrains Mono 400/500/700 (SIL OFL 1.1), official upstream only, per-file sha256 + source URL
recorded in UI_SPEC.md, the OFL texts shipped, the pubspec `fonts:` section plus a FontLoader step
in the golden harness, and the file list + hashes **shown before committing**. Item 10 closes #58
and re-checks every `ITEM-10 RECHECK` marker and both font-dependent readings recorded above. Then
item 8 (transaction row + ledger) and item 9 (card faces + action keys), one gate each, over the
real glyphs; items 11–12 move to Phase 6 (Dashboard/Wallets screens), item 13 to Phase 9; item 14
(golden CI job, Linux path only) last, over the final widget set.
The ruling of 2026-10-11 (re-confirmed same-day) is the governing text for all of it, including
the `AppCard` = glass-panel and `AppProgressBar` = paint-row-with-no-value decisions recorded
above. Nothing is committed, pushed, merged or deleted without the user's word.
