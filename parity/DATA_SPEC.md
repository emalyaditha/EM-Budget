# DATA_SPEC — the data-layer contract

Source of truth: **tag `pre-flutter`** (`41489c6`), i.e. `src/types.ts`, `src/supabase.ts`, `src/utils.ts`,
`src/lib/api.ts`, `src/services/transactionService.ts`, `src/App.tsx`.

This file records **how the phone represents the web's data**, and every place that representation is not
byte-for-byte the web's. It is the contract the ports under `mobile/lib/models/` and `mobile/lib/data/`
were written against, and the list a reviewer checks a new port against before it is accepted.

Three sibling documents, no overlap:

| file             | answers                                                    |
| ---------------- | ---------------------------------------------------------- |
| `INVENTORY.md`   | what exists, what is browser-only, what is decided         |
| `LOGIC_SPEC.md`  | what the arithmetic units compute, including their defects |
| **DATA_SPEC.md** | what a **value** means when it crosses JSON or the wire    |

Found bugs are **not** documented here as divergences — they are in `BUGS_FOUND.md` and are replicated
bug-compatible. Where a rule below exists only because the web is broken, the B-number is named.

Test counts are for `flutter test` at Phase 3 close (443 tests: 66 `auth`, 343 `data`, 33 `models`, 1
scaffold). §13 maps every rule to the file that proves it.

---

## 1. The map convention: absent is not null

Every state object on both platforms is a `Map<String, Object?>` before it is a typed model, and the two
platforms agree on exactly one rule:

| JSON map holds          | JavaScript sees | Dart sees  |
| ----------------------- | --------------- | ---------- |
| key absent              | `undefined`     | `null`     |
| key present, value null | `null`          | `null`     |
| key present, any value  | that value      | that value |

`absent ≡ undefined` is the load-bearing half, and it is why the readers in
`lib/models/json_reader.dart` return `null` for a missing key rather than a sentinel:
`lib/data/map_object_to_columns.dart` decides a **column's** fate on it (`src/supabase.ts:411` tests
`!== undefined`, which a `null` passes). A port that conflated the two would write `null` into a column
the web leaves unset, and would then be unable to fill it from the casing pass at `:407-428`.

`toJson()` **omits null**, which matches `JSON.stringify` on an `undefined` property. It does **not** match
a property the web holds as literal `null` — stringify keeps that, our encoder drops it. That asymmetry is
accepted (§11 D-06) because no state field the app reads back distinguishes the two: every consumer is a
`||`-guard, and `null || x` and `undefined || x` are the same expression.

Two helpers carry the JavaScript truthiness test rather than Dart's:

- `jsTruthy` — `0`, `''`, `null`, `NaN` are false; every other value, including an empty map or list, is
  true. Dart's `if (x)` has no such thing, so a `bool` must be computed.
- `jsFirstTruthy` — the `a || b || c` chain. **All-falsy returns `null`,** which is how the port says
  `undefined`, and not the last operand.

Both live in `lib/data/js_semantics.dart`.

---

## 2. Numbers: `num`, never `double`

App state holds JavaScript numbers; the database's `numeric` can arrive as a **string**. Cents conversion
happens only at `toMinorUnits` (`INVENTORY.md` §5.8), so:

- Every model field that the web types `number` is `num` — never `double`, which would round on the way in
  and move money before the engine is asked to.
- `readNumOpt` (`lib/models/json_reader.dart:32`) parses a numeric string and **returns an `int` when the
  value is integral**: `parsed == parsed.roundToDouble() ? parsed.round() : parsed`. `"1200.00"` → `1200`,
  `"450.50"` → `450.5`. This is not cosmetic — see §3.
- `mapDatabaseResultToState` (`:96 _jsNumber`) applies the same normalisation on the read path, so a row
  that came back as `"1200.00"` and a row that came back as `1200` become the same value.
- No model rounds, clamps or defaults beyond an explicit `fallback:` argument, which mirrors the web's own
  `x || 0`.

---

## 3. `jsonEncode` is not `JSON.stringify`

`canonicalStateJson` (`lib/data/ledger_repository.dart:244`) is the equality test that decides whether a
push is a no-op, so the encoder's number spelling matters. Measured on Dart 3.13.5 against
`JSON.stringify`:

| value        | `JSON.stringify`      | `jsonEncode` | verdict                                    |
| ------------ | --------------------- | ------------ | ------------------------------------------ |
| whole number | `1200`                | `1200`       | same **only because** §2 keeps it an `int` |
| `1.0`        | `1`                   | `1.0`        | differs — hence §2's normalisation         |
| `-0.0`       | `-0`                  | `-0.0`       | differs; nothing in the app holds a `-0`   |
| `NaN`        | `null`                | **throws**   | §11 D-03                                   |
| `Infinity`   | `null`                | **throws**   | §11 D-03                                   |
| `0.1+0.2`    | `0.30000000000000004` | same         | same — both are the IEEE-754 double        |
| `1e21`       | `1e+21`               | `1e+21`      | same                                       |
| `null` value | `{"u":null}`          | `{"u":null}` | same (explicit nulls are kept)             |

Consequences, both of them deliberate:

1. **The equality skip is phone-internal.** Both sides of `lastSyncedStatesCache` are produced by
   `canonicalStateJson` from the same Dart models, so a state that round-tripped through the local mirror
   or through the pull compares correctly against the state that is about to be pushed. It is never
   compared against a string the web wrote.
2. **Key order is declaration order.** `toJson()` builds its map literal-field-by-field, `jsonEncode`
   writes a `Map` in iteration order, and every collection keeps its list order. The string is therefore
   stable for a given model shape — which is the whole reason a model that **forgets** a field is a data
   bug rather than a tidy-up problem (§8).

---

## 4. Strings, booleans, and the throws/defaults class

`readString` is the one reader that knowingly diverges. The web does not check its required strings —
`tx.title.toLowerCase()` **throws** on a row with no title, and `parity/fixtures/transaction-service.json`
records that as a case. A typed model cannot throw the same way from a reader, so:

- absent → `''`; a non-string → `'$value'` (JS's `String(x)` shape for numbers and booleans);
- `readStringOpt` → `null` unless the value really is a `String`, which is what every `x || fallback` on
  the web sees.

This is the **"web throws / phone defaults"** class: the same input produces a thrown `TypeError` on the
web and a plausible empty value on the phone. It is listed at §11 D-04 and each instance is a test case in
`test/data/transaction_service_test.dart:639`, not a silent difference.

`readBoolOpt` reproduces `Boolean(x)` for the card/freeze guards: a non-zero number and a non-empty string
are true, `null` stays absent, and anything else present is true. A `bool` field never guesses — the
`fallback:` argument is the web's own `?? false` or `|| false`, named at the call site.

---

## 5. Time: two regimes, kept separate on purpose

`INVENTORY.md` §5 calls this the top JS→Dart trap and the port treats it that way. There are two regimes
in the web and **no global fix is allowed**, because the app's visible behaviour depends on the
difference.

| regime                     | helpers                      | reads a `YYYY-MM-DD` as | used by                         |
| -------------------------- | ---------------------------- | ----------------------- | ------------------------------- |
| pure-UTC string arithmetic | `lib/data/js_semantics.dart` | UTC midnight            | `creditCards.ts` cycle engine   |
| local-midnight arithmetic  | `lib/data/dates_local.dart`  | device-local midnight   | `utils.ts`, `alerts.ts`, the UI |

The Dart rules that make them portable:

- **`DateTime.parse` refuses what V8 accepts.** `2026-9-5` is a `FormatException` in Dart and local
  midnight on 5 September in the browser. `_jsHeuristicLooseDate` (`js_semantics.dart:94`) reproduces
  **only** the `YYYY-M-D` shape, because that is the only shape `src/utils.ts:39-46` and
  `src/services/transactionService.ts` are measured handing over. V8's wider heuristics — `M/D/Y`, month
  names, two-digit years — are **not** reproduced (§11 D-05). Out-of-range components are checked back
  against the literal, because V8 still rejects `2026-13-45` as an Invalid Date.
- The heuristic arm is **local**, while the ISO date-only arm is **UTC**. That split is ECMAScript's own,
  not an accident of the port, and `test/data/dates_local_test.dart` (80 cases, all from
  `parity/fixtures/dates-local.json`) pins both sides of midnight and the leap days.
- `jsDateToIso` / `jsDateToEpochMs` accept what `new Date(x)` accepts from the types the app actually
  holds (`String` and `num`), and return `null` where V8 would produce an Invalid Date — because every
  consumer of those results is behind a truthiness test on the web.
- `nowIso()` is the single wall-clock call. A golden pins it: `mapObjectToColumns` takes `now:` because
  `src/supabase.ts:393` evaluates `new Date().toISOString()` **per column**, and the push evaluates it
  again for the snapshot mirror (`:828`) — never once per push. Injecting one pinned clock makes the three
  sites agree, which is what `test/data/ledger_repository_test.dart:990` asserts row by row.
- `addMonthsClamped` (`dates_local.dart:117`) keeps the web's defect: 2026-01-31 → 02-28, and a 31st due
  date never returns to the 31st. B-02 in `BUGS_FOUND.md`; replicated, not fixed.

---

## 6. Ordering, comparison, stability

- **Sort stability.** `Array.prototype.sort` is stable; `List.sort` is not specified to be.
  `sortTransactionsByDate` (`lib/data/transaction_service.dart:68`) sorts a list of **indexes** and breaks
  a tie on the index, so the web's stability is an assertion in the comparator rather than a property the
  runtime happens to provide. `INVENTORY.md` §5.7 called this a landmine; the port defuses it explicitly.
- **`localeCompare`.** `src/services/transactionService.ts:42,53` uses the bare one-argument call, whose
  collation ECMAScript leaves implementation-defined and V8 implements as an ICU primary/secondary
  compare — case and accent are _secondary_, so `'a'.localeCompare('B')` is `-1` while Dart's
  `'a'.compareTo('B')` is `+1`. `jsLocaleCompare` (`js_semantics.dart:159`) folds case first, then falls
  back to code units. Divergence is confined to non-ASCII (§11 D-07); the two fields it is used on are a
  `YYYY-MM-DD` string and an id, and both are ASCII in every fixture and every generated id in the web.
- **The id tie-break** `parseInt(s.replace(/\D/g, ''), 10)` becomes `jsDigitParse`. The web strips
  non-digits first, so `NaN` happens exactly when nothing is left. Dart's `int.tryParse` additionally
  fails past 2^63 where JavaScript would have kept an imprecise double (§11 D-08).
- **Rounding** stays the money engine's problem, documented in `LOGIC_SPEC.md` §1 — but the data layer
  repeats the warning because `readNum` is where a `2.5` first lands on a phone: `Math.round(-2.5)` is
  `-2`, `(-2.5).round()` is `-3`.

---

## 7. Keys, owners, and what is stored where

`localStorage`'s 14 keys become a `KeyValueStore` (`lib/data/key_value_store.dart`) with the **web's own
names retained**, so a device that has ever run the web can be reasoned about, and so a bug report naming a
key names something real.

| concern       | rule                                                                                                     | source                                          |
| ------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| owner key     | `email.trim().toLowerCase()`, applied to the argument **and** to a value read back                       | `src/supabase.ts:545`, `utils.ts` normalisation |
| dirty marker  | one key, holding the owner it names; `clearStateDirty` removes **only** when the marker names this owner | `utils.ts:98-116`                               |
| tombstones    | one key, a JSON object keyed by owner; a body that is not a JSON object yields empty                     | `utils.ts:127-181`                              |
| store failure | swallowed with a log — the web has no other recovery path (`_guard`)                                     | `utils.ts` every writer                         |
| secrets       | never in this store; `flutter_secure_storage 11.2.0` holds the identity and the cookie jar               | `INVENTORY.md` §13b D-13/D-21                   |

The backing is `FileKeyValueStore` (`lib/data/file_key_value_store.dart`): **one file per key** under an
injected app-support directory, written as create-temp-then-rename. It is not a database and not a
key-value plugin, because `localStorage` is neither — the six entries are independent string values that
the durability layer overwrites wholesale, and the owner-guard branch removes one key without touching
another, which a single-blob store cannot express. Rename rather than truncate is a data-safety choice:
`dart:io` maps rename to `MOVEFILE_REPLACE_EXISTING` on Windows and `rename(2)` on POSIX, both of which
have **no window in which a key reads as absent**, whereas truncating in place does — and a `null` read of
`dirtyOwnerKey` inside that window means "nothing pending" to the hydration gate, which is R4. The root is
injected because locating it needs `path_provider`, which is not yet an approved dependency; nothing
outside tests constructs the class until Phase 5 supplies it.

`test/data/durability_restart_test.dart` is the proof the question asks for: each case writes through one
store and reads through a **second instance over the same directory**, so what survives is only the bytes —
the dirty marker (still naming its owner, and still not naming anyone else), the tombstones (ids and order,
per owner, one owner's clear leaving the other's), and the mirror with its owner tag.

`StateStorage.ownerKey` normalising **both sides** is deliberate: normalising only the argument would treat
a marker written by an older build, or by hand, as someone else's, and the dirty flag would never clear.

The web's page-lifetime flush (`pagehide` / `beforeunload` / `visibilitychange`) has no phone equivalent;
it moves to `AppLifecycleState.paused` in Phase 5, which is a listed adaptation, not a data rule.

---

## 8. The column allow-list is the write contract

`SCHEMA_COLUMNS` (`src/supabase.ts:197-331`, 11 tables) is ported verbatim to
`lib/data/schema_columns.dart` as a `const Map`. It is **not** documentation and **not** a cache:

- `mapObjectToColumns` drops every mapping rule whose column is not in the list (`:399-404`), so a field
  missing from these lists is a field the app **cannot** persist to the relational side however loudly the
  state object holds it. That is B-20: `subscriptions.instance_type` is dropped, and the boot refresh then
  wipes it from the snapshot.
- `getSchemaColumns` returns `.slice()` on the web to stop a caller mutating the canonical list. The Dart
  port returns the `const` list, where mutation is a compile-time impossibility — a non-divergence, noted
  so nobody "restores" a copy.
- `test/data/schema_columns_test.dart` (8 cases) compares the ported map against the web source textually,
  so an edit to `src/supabase.ts` that is not matched here fails rather than drifts.

**Fields the interfaces declare but the tables do not have, and vice versa**, are recorded by
`test/models/type_drift_test.dart` (16 cases):

- seven interfaces declare **no timestamp at all**, yet their rows carry `updated_at` — the pull therefore
  keeps the stamp on the model even though `src/types.ts` does not ask for it, because the stamp is
  load-bearing for §3's equality test. A model that forgets `updatedAt` makes two different states compare
  equal, and the skip path then clears the tombstones for a state the server has never seen.
- `created_at` is declared by six interfaces and exists in **no** ledger table.
- `CreditCard` and `CreditCardPurchase` are declared in the types but are in neither `SCHEMA_COLUMNS` nor
  the sync fan-out. They are JSON-only state: nothing reaches them through the relational path whatever the
  snapshot holds. `creditCards` therefore returns the seed on both clients, forever — no web code reads the
  field. `creditCardPurchases` **no longer does**: B-23 was ruled a web-side fix, and the pull now honours
  `jsonState.creditCardPurchases` on both clients (`src/supabase.ts:1155-1158` as fixed on
  `bugfix/b23-credit-card-purchases` = `1d1efe8`, which is **not merged yet**;
  `ledger_repository.dart:_snapshotPurchases`, which is), because the snapshot is that
  collection's only cloud copy and returning the seed meant pushing `[]` over it.

`readTimestamp` reads `updated_at || updatedAt || created_at || createdAt`
(`src/supabase.ts:365`, repeated verbatim at `:902`) — the order is the rule, and a non-string stamp is
read as absent because every consumer of the result is a string-typed date field.

---

## 9. Sync contracts the port may not improve

`INVENTORY.md` §6 and R4: the sync is whole-state, last-write-wins, with **no per-record merge anywhere**.
These are the properties the fixtures prove, in the order the code applies them.

### Push — `syncStateToSupabase` (`src/supabase.ts:526-853`)

| step            | web        | phone                               | rule that must not be "modernised"                                                             |
| --------------- | ---------- | ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| hydration gate  | `:531-537` | `isEmailLoadedFromCloud`            | a push is **refused** until a pull has succeeded for this account in this session              |
| equality skip   | `:544-552` | `canonicalStateJson`                | skip **releases** the dirty marker and the tombstones                                          |
| durable marker  | `:554-557` | `markStateDirty` before the attempt | set before, cleared only on a server confirmation                                              |
| per-email chain | `:841-851` | `syncChains[ownerKey]`              | commits in initiation order; a rejected sync must not poison it                                |
| RPC             | `:787-812` | `syncCompleteLedger`                | the only write path (B2); **only a throw retries** — `{success:false}` is returned, not thrown |
| mirror          | `:820-833` | `upsertLedgerSnapshot`              | best-effort: a mirror failure does not fail the push                                           |

Retry budgets (`src/lib/api.ts:60-70`, `lib/data/api_policy.dart`):

| budget          | maxRetries | base    | cap      | live on the phone?                       |
| --------------- | ---------- | ------- | -------- | ---------------------------------------- |
| `defaults`      | 3          | 1000 ms | 10000 ms | transport calls                          |
| `syncRpc`       | 2          | 500 ms  | 10000 ms | **yes** — the only retry that ever fires |
| `syncRoundTrip` | 2          | 2000 ms | 5000 ms  | no — `_pushOnce` never throws (B-22)     |

The delay is `base · 2^attempt` on the 0-based index of the attempt that failed, there is no delay after
the final attempt, `onRetry` fires **before** the sleep, and the error rethrown is the **last** one.
`retrySleep` is injectable so the schedule is asserted without waiting.

The web wraps every individual query in `withTimeout(…, 5000, …)` (`:942`, `:993`, `:1006`, `:1022`,
`:1059`); on the phone that budget belongs to the transport (`lib/auth/api_client.dart`), not to the
repository, because it does not cancel the underlying request on either platform. The one timeout the
repository **does** own is the 15-second wall over the whole pull (`:922`, `:1167`), because that is a
property of the sync rather than of a call — and it sits _outside_ the pull's try, so a timeout escapes as
a `TimeoutException` exactly as the rejected promise does for `App.tsx:599`.

### Pull — `syncStateFromSupabase` (`:914-1172`)

- Ten relational reads (`:927-954`): a missing table is **no rows**, and only a `42P01` code or a
  **non-empty** message containing `does not exist` / `schema cache` qualifies (`:944-947`). The
  `error.message &&` guard is a truthiness test, so the substring branch never fires on an empty message,
  and any other error aborts the whole pull. `test/data/ledger_repository_test.dart` pins all four
  branches.
- Four side reads (`:976-1072`) started in the web's `Promise.all` order — subs, profile, ledger, loans —
  which is also the order their warnings appear when all four fail. Each swallows its own error with a
  warning; `hasLedgerStateRecord` is set at `:1036` **before** the JSON body is read, so a row holding an
  unparseable string still tells the pull this account has a database, and its envelopes and jars then do
  not fall back to the seed.
- Two sources of truth: `getListField` (`:1081-1089`) prefers the table when it returned anything,
  otherwise the JSON snapshot. `subscriptions` is the exception — the snapshot's copy is concatenated
  **last**, so it wins a shared id whatever the comment claims (B-24) — and `loansGiven` resolves
  table-first while the web races two writes to the same local (`:1048` then `:1065`).
- `mergeSubscriptions` (`ledger_repository.dart:_mergeSubscriptions`) is last-wins over one concatenation,
  and a relational duplicate therefore keeps **its own last** row. A first-wins `putIfAbsent` here is a
  bug, not a tidy-up.

### Boot merge — `mergeCloudIntoLocal` (`src/App.tsx:213-250`)

`lib/data/cloud_merge.dart` ports it field-for-field and `test/data/cloud_merge_test.dart` (16 cases)
proves the shape against the **source text** as well as the behaviour:

- union is **by id, local wins** — `putIfAbsent` over `[...localArr, ...cloudArr]`.
  `INVENTORY.md` §6's one-line summary said "cloud wins", which is wrong for the collections and is
  corrected there (§11 D-09).
- a row with no id is dropped **whole**, from either side; a tombstoned id never returns, from either side.
- `creditCards` is **not** unioned — it is taken from the cloud wholesale, which is why the drift guard
  asserts the unioned-key list and that `creditCards` is absent from it.
- scalars are cloud-wins **except `currency`**, which is `local.currency || cloud.currency`.
- the profile merges **field-wise**: cloud name and avatar, local email if it has one.

---

## 10. Failure surfaces: what a message says

The web builds error strings three different ways and the port keeps them distinct, because the UI shows
them:

| site                          | web                                                                  | phone                                                                                 |
| ----------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| inner RPC catch `:809`        | `err instanceof Error ? err.message : String(err)`                   | `_messageOf`: `LedgerErrorException.message`, else `toString()` — **keeps** the value |
| outer doPush catch `:835-838` | `err instanceof Error ? err.message : 'Database transaction error.'` | same **fixed** fallback for a value that is neither `Exception` nor `Error`           |
| pull catch `:1160-1165`       | same shape as the inner catch                                        | same                                                                                  |

The reachable divergence is a Dart `Error`/`Exception`: `StateError('socket hang up').toString()` is
`'Bad state: socket hang up'` while JS's `.message` is `'socket hang up'`. Recorded at §11 D-01 and
asserted in `test/data/ledger_repository_test.dart:1071`; the ported code does not strip the prefix,
because stripping it would invent a message the web never produces either.

The outer fixed fallback is unreachable through the storage layer (every writer is guarded) or through the
gateway (each call has a nearer catch). The test reaches it with the injected clock, which is the last
thing inside the try.

**The 15-second wall** (`SYNC_TIMEOUT`, `supabase.ts:922`) is a fourth surface, and the only one the web
builds with `new Error(message)` rather than reading off a caught value: `withTimeout` rejects
`` `${label} timed out after ${ms}ms` `` (`api.ts:38`) **outside** `doSync`'s try, so the message never
becomes a `PullOutcome.error` — it rejects the promise the caller awaited. Two consequences, both now
settled rather than open:

- the phone throws `JsError` (`lib/data/api_policy.dart`), whose `toString()` **is** its message, so the
  text in front of a user is the web's string verbatim and not `TimeoutException`'s
  `'TimeoutException after 0:00:15.000000: …'` prefix. Deviation 2 ruling; pinned by
  `test/data/api_policy_test.dart` and `test/data/ledger_repository_test.dart`.
- the web's own UI does not show it. `SettingsModal.handlePullSync` (`:210-228`) awaits
  `syncStateFromSupabase` with **no try/catch**, so a timed-out pull is an unhandled rejection and
  `syncStatus` stays `'loading'` — which disables the pull button (`:626`) until the modal remounts. That
  is **B-25**, not a message the phone can copy; the phone's copy for a failed pull remains
  `error ?? 'No backup found.'` (`:226`), reached only when the pull _returns_.

---

## 11. Divergence register

Each of these is a place where the phone **cannot** or **does not** do what V8 does. None of them is a bug
in the web; none of them is silently different, and each is either pinned by a test or by a ruling.

| id   | subject                         | web                                           | phone                                                                                                                                  | why accepted                                                                                                                                                                                   |
| ---- | ------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-01 | error message                   | `err.message` for an `Error`                  | `err.toString()`, which carries a `Bad state: `-style prefix for a Dart `Error` (not for `JsError`, whose `toString()` is the message) | detail is _kept_, not lost; stripping the prefix would invent a string the web does not produce                                                                                                |
| D-02 | `retryWithBackoff` rethrow      | wraps a non-Error in `new Error(String(err))` | propagates the original object                                                                                                         | the wrap is a no-op for every consumer, which reads the message                                                                                                                                |
| D-03 | `NaN`/`Infinity` in state       | `JSON.stringify` → `null`                     | `jsonEncode` **throws**                                                                                                                | nothing in the app can hold a NaN: every producer is a guard or `toMinorUnits`, and a throw that fails a push loudly is safer than a silent `null` reaching the server                         |
| D-04 | required strings                | throws a `TypeError`                          | `''` (§4)                                                                                                                              | the "web throws / phone defaults" class; the fixture records the throw, the port records the stand-in                                                                                          |
| D-05 | loose date strings              | full V8 heuristics                            | `YYYY-M-D` only                                                                                                                        | the wider shapes are not produced by this app; a shape outside the arm is `null`, which every consumer already handles                                                                         |
| D-06 | literal `null` in a state field | kept by `JSON.stringify`                      | dropped by `toJson()`                                                                                                                  | every consumer is a `                                                                                                                                                                          |     | `-guard, where absent and null behave the same |
| D-07 | `localeCompare` collation       | ICU primary/secondary                         | case-fold then code units                                                                                                              | identical on the ASCII-only fields it is used on; non-ASCII titles are a sort-order difference only                                                                                            |
| D-08 | `parseInt` on a 20-digit id     | imprecise double                              | `null`                                                                                                                                 | no generated id in the web is that long                                                                                                                                                        |
| D-09 | `INVENTORY.md` §6 wording       | —                                             | —                                                                                                                                      | the summary said "cloud wins" for the boot merge; the code is **local wins by id**. Corrected in `INVENTORY.md`, not in the port                                                               |
| D-10 | page-lifetime flush             | `pagehide`/`beforeunload`/`visibilitychange`  | `AppLifecycleState.paused`                                                                                                             | no phone equivalent exists; `INVENTORY.md` §7                                                                                                                                                  |
| D-11 | per-call 5 s timeout            | inside `supabase.ts`                          | inside the transport                                                                                                                   | same budget, different owner; the 15 s wall stays in the repository (§9) and throws `JsError`, whose message is the web's `syncStateFromSupabase timed out after 15000ms` with no prefix (§10) |

Bug-compatible **defects** are deliberately absent from this table. They are B-01 … B-25 in
`BUGS_FOUND.md`, and where a rule above says "keep the defect" (B-02 `addMonthsClamped`, B-20 dropped
column, B-22 inert retry, B-24 snapshot-wins subscriptions) the port replicates it and names it. B-23 is the
exception: ruled at this gate as a **web-side fix on its own branch**, after which the phone follows the
fixed web rather than the old behaviour.

---

## 12. What Phase 3 did **not** port

| thing                                                                      | status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `freezed`, `json_serializable`, `build_runner`, `drift`                    | **removed** from `pubspec.yaml` on the gate ruling. The models are hand-written because codegen cannot express §1–§2: `fromJson` must distinguish absent from null, `toJson` must omit null and keep integral numbers as `int`, and the key order is the canonical string. `drift` appeared only in comments, never in an import, and its table would have needed the codegen this ruling removes; the local store is `FileKeyValueStore` (§7). `drift_dev` and `drift_flutter` went with it. |
| WebAuthn / passkey enrollment                                              | not ported on mobile (D-19 ruling). Recorded in `UI_SPEC.md`; the server is unchanged.                                                                                                                                                                                                                                                                                                                                                                                                        |
| `auth_session_token` in plaintext                                          | not ported. The phone holds one identity in `flutter_secure_storage` (D-13/D-23) and the web's `localStorage` copy is untouched — rule 3.                                                                                                                                                                                                                                                                                                                                                     |
| `src/lib/authSession.ts`                                                   | not ported: dead on the web (B-19) and its one live consumer can never see a token.                                                                                                                                                                                                                                                                                                                                                                                                           |
| OCR, canvas pre-processing, `URL.createObjectURL` download, `window.print` | Phase 6/7 concerns, `INVENTORY.md` §7.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| The 12 orphaned components                                                 | out of scope (R12).                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

---

## 13. Where each rule is proved

| rule                                                                             | unit                                                                   | tests                                                                                               |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| §1 map convention, `jsTruthy`/`jsFirstTruthy`, `jsLocaleCompare`, `jsDigitParse` | `lib/data/js_semantics.dart`                                           | `test/data/js_semantics_test.dart` — 14                                                             |
| §2, §4 readers                                                                   | `lib/models/json_reader.dart`                                          | `test/models/app_state_test.dart` — 17                                                              |
| §2 number normalisation on the read path                                         | `lib/data/map_database_result_to_state.dart`                           | `test/data/map_database_result_to_state_test.dart` — 14                                             |
| §3 canonical string, §8 stamps                                                   | `lib/models/{app_state,entities,entities_ledger}.dart`                 | `test/models/app_state_test.dart`, `test/models/type_drift_test.dart` — 33 combined                 |
| §5 the two date regimes                                                          | `lib/data/dates_local.dart`                                            | `test/data/dates_local_test.dart` — 80, all from `parity/fixtures/dates-local.json`                 |
| §6 sort stability and tie-breaks                                                 | `lib/data/transaction_service.dart`                                    | `test/data/transaction_service_test.dart` — 46, all from `parity/fixtures/transaction-service.json` |
| §7 owner keys, marker, tombstones                                                | `lib/data/state_storage.dart`                                          | `test/data/state_storage_test.dart` — 35                                                            |
| §7 the backing store and what survives a restart                                 | `lib/data/file_key_value_store.dart`                                   | `test/data/durability_restart_test.dart` — 11                                                       |
| §8 allow-list                                                                    | `lib/data/schema_columns.dart`                                         | `test/data/schema_columns_test.dart` — 8 (source-textual)                                           |
| §8 write contract, per-row clock                                                 | `lib/data/map_object_to_columns.dart`, `lib/data/record_builders.dart` | 23 + 17                                                                                             |
| §6 casing pass                                                                   | `lib/data/casing.dart`                                                 | `test/data/casing_test.dart` — 5                                                                    |
| §9 push/pull/retry/chain                                                         | `lib/data/ledger_repository.dart`                                      | `test/data/ledger_repository_test.dart` — 55                                                        |
| §9 boot merge                                                                    | `lib/data/cloud_merge.dart`                                            | `test/data/cloud_merge_test.dart` — 16 (behaviour **and** `src/App.tsx` drift guards)               |
| §9 transport budgets                                                             | `lib/data/api_policy.dart`                                             | `test/data/api_policy_test.dart` — 19                                                               |
| §10 message shapes                                                               | `lib/data/ledger_repository.dart`                                      | `test/data/ledger_repository_test.dart` group "the error message shape"                             |
| auth: cookie persistence, encryption at rest, logout clearing                    | `lib/auth/*`                                                           | `test/auth/*` — 66                                                                                  |

The two source-reading helpers, `test/data/web_source.dart` and the fixture loaders, exist so a rule that
only the web's text can prove is proved against the text rather than against a comment.
