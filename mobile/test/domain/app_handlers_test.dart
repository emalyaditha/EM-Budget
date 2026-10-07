import 'dart:convert';
import 'dart:io';

import 'package:em_budget/data/dates_local.dart';
import 'package:em_budget/data/js_semantics.dart';
import 'package:em_budget/data/number_locale.dart';
import 'package:em_budget/domain/handlers.dart';
import 'package:em_budget/models/app_state.dart';
import 'package:flutter_test/flutter_test.dart';

import '../data/web_source.dart';

/// `src/App.tsx` handler goldens, replayed against `parity/fixtures/app-handlers.json`
/// (16 cases measured from the running web app at the `pre-flutter` tag).
///
/// **Why this file is shaped differently from every other replay test.** The nine
/// handlers are closures inside the component body — `handleAddExpense` at `:1136`,
/// `handlePayCreditCard` at `:2381` — so `parity/LOGIC_SPEC.md` §0's method (import the
/// module, call the function) cannot reach them, and `INVENTORY.md` R7 flags them as the
/// least-tested money surface in the app. `parity/live/handlers.spec.ts` therefore drives
/// the real UI in a real browser against a real tenant and reads the localStorage mirror
/// back. The golden is what that mirror held; this file runs the Dart port and must leave
/// the same mirror behind.
///
/// **The state is a `Map`, not an `AppState`.** A handler receives the state object and
/// returns a new one; the thing that is observable — and the thing that is synced, diffed
/// and stored — is its JSON. So the port is written at that boundary
/// (`lib/domain/handlers.dart`) and the replay compares whole collections. Two
/// consequences the assertions below make visible: a key the web's `JSON.stringify` drops
/// (`undefined`) must be *absent* here rather than `null`, and a value it writes without a
/// decimal point (`3.0` → `3`) must come out an `int`.
///
/// **Normalisation is the harness's, ported.** `Date.now()`-derived ids, ISO stamps and
/// `crypto.randomUUID()` are not reproducible, so `handlers.spec.ts` replaces them with
/// `<now>`, `<today>` and `gen-N` handed out in first-seen traversal order over the whole
/// run — one alias map for all sixteen cases, walked in `SLICES` order. That is why these
/// tests are declared from the fixture's own case list and run in order: an id two cases
/// mint from the same pinned millisecond (`nt-<now>` appears in three of them) must land
/// on the same `gen-N` here exactly as it does there, and a `referenceId` must still point
/// at its own row.
///
/// **The clock is injected, never read.** `HandlerDeps.nowMs` is pinned to
/// `_provenance.pinnedNow`; `_today` is then `todayLocal(nowMs: pinned)`, i.e. the *host's*
/// zone, and the normaliser's `<today>` placeholder is derived from the same call — so the
/// replay is zone-independent by construction, the way the harness's was zone-fixed.
/// Colombo read `2026-10-04` at that instant; a host on the far side of local midnight
/// still matches, because both halves of the comparison move together.
void main() {
  final String repo = repoRoot();
  final String sep = Platform.pathSeparator;
  final File fixtureFile = File(
    '$repo$sep'
    'parity$sep'
    'fixtures$sep'
    'app-handlers.json',
  );
  if (!fixtureFile.existsSync()) {
    throw StateError('Missing fixture file: ${fixtureFile.path}');
  }
  final Map<String, Object?> doc =
      jsonDecode(fixtureFile.readAsStringSync()) as Map<String, Object?>;
  final Map<String, Object?> prov = doc['_provenance']! as Map<String, Object?>;

  // D7: a golden may only come from the baseline tag, and only from the file under test.
  if (prov['unitFile'] != 'src/App.tsx') {
    throw StateError(
      'app-handlers.json is from ${prov['unitFile']}, not src/App.tsx',
    );
  }
  if (prov['generatedFrom'] != 'pre-flutter') {
    throw StateError(
      'app-handlers.json claims generatedFrom ${prov['generatedFrom']}; '
      'fixtures are measured from the pre-flutter tag only',
    );
  }
  // The harness recorded the browser's locale; the `toLocaleString()` grouping in every
  // handler message was measured under it, so the replay injects it rather than inheriting
  // one from the machine running the test.
  if (prov['locale'] != 'en-US') {
    throw StateError(
      'app-handlers.json was measured under ${prov['locale']}; the golden '
      'grouping below is en-US and would have to be injected differently',
    );
  }

  final List<Map<String, Object?>> cases = (doc['cases']! as List<Object?>)
      .map((Object? c) => c! as Map<String, Object?>)
      .toList();
  // The harness refuses to emit a golden that dropped a flow. 16 is the sum of its
  // `EXPECTED_CASES` groups, not a number to relax when a case starts failing.
  if (cases.length != 16) {
    throw StateError(
      'app-handlers.json carries ${cases.length} cases, expected 16',
    );
  }
  final List<String> fixtureNames = cases
      .map((Map<String, Object?> c) => c['name']! as String)
      .toList();
  for (final String name in fixtureNames) {
    if (fixtureNames.where((String n) => n == name).length > 1) {
      throw StateError('Duplicate fixture case: $name');
    }
  }

  /// Every ledger collection the harness recorded, in its traversal order. The order is
  /// how `gen-N` gets allocated, so it is part of the protocol rather than a convenience.
  const List<String> slices = <String>[
    'cashAccounts',
    'cards',
    'creditCards',
    'creditCardPurchases',
    'creditCardInstallments',
    'creditCardInstallmentPayments',
    'incomes',
    'expenses',
    'debts',
    'loansGiven',
    'subscriptions',
    'transactions',
    'notifications',
  ];

  /// The ledger the browser booted from. `input.before` below is the *aliasing pass* over
  /// this file, so it serves as an assertion and not as the input — its stamps are
  /// placeholders, and a handler needs the real ones to reverse.
  final Map<String, Object?> seed = jsonDecode(
    File(
      '$repo$sep'
      'parity$sep'
      'live$sep'
      'seed-state.json',
    ).readAsStringSync(),
  ) as Map<String, Object?>;

  Map<String, Object?> freshSeed() =>
      jsonDecode(jsonEncode(seed)) as Map<String, Object?>;

  final Set<String> seedIds = <String>{};
  void collectIds(Object? value) {
    if (value is List) {
      for (final Object? item in value) {
        collectIds(item);
      }
    } else if (value is Map<String, Object?>) {
      for (final MapEntry<String, Object?> entry in value.entries) {
        if (entry.key == 'id' && entry.value is String) {
          seedIds.add(entry.value! as String);
        }
        collectIds(entry.value);
      }
    }
  }

  collectIds(seed);

  // ------------------------------------------------------------------ normalisation
  const Set<String> idKeys = <String>{
    'id',
    'referenceId',
    'chargeExpenseId',
    'installmentId',
    'purchaseId',
    'debtId',
    'loanId',
    'paymentId',
  };
  const Set<String> stampKeys = <String>{
    'updated_at',
    'updatedAt',
    'created_at',
    'createdAt',
  };
  const Set<String> dayKeys = <String>{
    'date',
    'appliedDate',
    'lastPaymentDate',
    'lastPaidDate',
    'paidDate',
    'dueDate',
    'nextPaymentDate',
    'startDate',
    'dateGiven',
  };

  final int pinnedMs = DateTime.parse(prov['pinnedNow']! as String)
      .toUtc()
      .millisecondsSinceEpoch;
  final String todayKey = todayLocal(nowMs: pinnedMs);

  /// `makeNormalizer(todayKey)` from the harness, with one shared alias map for the run.
  /// This is not a convenience rewrite of the golden: it is the function that made the
  /// browser's output byte-stable, so applying it to the port's output compares the two
  /// under exactly one equivalence.
  final Map<String, String> aliases = <String, String>{};
  String aliasFor(String raw) {
    if (seedIds.contains(raw)) return raw;
    return aliases.putIfAbsent(raw, () => 'gen-${aliases.length + 1}');
  }

  Object? walk(Object? value, String? key) {
    if (value is List) return value.map((Object? v) => walk(v, key)).toList();
    if (value is Map<String, Object?>) {
      return <String, Object?>{
        for (final MapEntry<String, Object?> e in value.entries)
          e.key: walk(e.value, e.key),
      };
    }
    if (value is! String) return value;
    if (stampKeys.contains(key)) return '<now>';
    if (idKeys.contains(key)) return aliasFor(value);
    if (dayKeys.contains(key) && value == todayKey) return '<today>';
    return value;
  }

  Map<String, Object?> pick(Map<String, Object?> state) => <String, Object?>{
    for (final String key in slices) key: (state[key] ?? const <Object?>[]),
  };

  /// `JSON.stringify` writes `null` for a `NaN`/`Infinity` it cannot represent, and the
  /// mirror the harness read is exactly that text. Dart's encoder throws instead.
  String stringify(Object? value) => jsonEncode(
    value,
    toEncodable: (Object? o) => o is double && !o.isFinite ? null : o,
  );

  String firstDifference(String got, String want) {
    int i = 0;
    while (i < got.length && i < want.length && got[i] == want[i]) {
      i++;
    }
    final int from = i > 160 ? i - 160 : 0;
    int end(int n) => n > i + 200 ? i + 200 : n;
    return 'differs at offset $i\n'
        '  port   ${got.substring(from, end(got.length))}\n'
        '  golden ${want.substring(from, end(want.length))}';
  }

  // ------------------------------------------------------------------- injected world
  /// What one click did beyond the ledger: the toasts it raised, the tombstones it wrote,
  /// whether it marked the state dirty. `INVENTORY.md` §6 makes the dirty flag part of
  /// every write, so a handler that runs without setting it is a handler whose edit will
  /// silently never reach the cloud.
  final List<String> toasts = <String>[];
  final List<String> dirtyMarks = <String>[];
  final List<List<String>> tombstones = <List<String>>[];
  final Set<String> casesThatReadTheClock = <String>{};
  int uuidCounter = 0;

  HandlerDeps depsFor(String caseName) {
    toasts.clear();
    dirtyMarks.clear();
    tombstones.clear();
    return HandlerDeps(
      // The browser pinned one instant for the whole session, so every `Date.now()` in a
      // case is the same number — including the calls that mint `nt-*`, `exp-*` and
      // `trans-*` side by side.
      nowMs: () {
        casesThatReadTheClock.add(caseName);
        return pinnedMs;
      },
      uuid: () {
        uuidCounter++;
        return '00000000-0000-4000-8000-${uuidCounter.toString().padLeft(12, '0')}';
      },
      locale: JsNumberLocale.resolve(prov['locale']! as String),
      email: 'port-replay@example.invalid',
      onToast: (String first, [String? second]) {
        // `showToast` self-normalises its two arguments
        // (`context/NotificationContext.tsx:32-46`), and the port mirrors call sites
        // positionally instead of correcting them, so the record keeps both as sent.
        toasts.add(second == null ? first : '$first|$second');
      },
      onMarkStateDirty: (String? email) => dirtyMarks.add(email ?? ''),
      onRecordDeletions: (String? email, List<String> ids) =>
          tombstones.add(ids),
    );
  }

  // ---------------------------------------------------------------------- the dispatch
  num argNum(Object? value) => value is num ? value : jsToNumber(value);
  String argStr(Object? value) => value is String ? value : jsToString(value);
  Map<String, Object?> argMap(Object? value) => <String, Object?>{
    ...(value! as Map<String, Object?>),
  };

  /// The dialog returns `undefined` when it refuses and the new state when it pays, so a
  /// refusal is measured as a ledger that did not move.
  Map<String, Object?> authorizeFromDialog(
    HandlerDeps deps,
    Map<String, Object?> state,
    List<Object?> args,
  ) {
    final Object? result = subscriptionPayDialogAuthorize(
      deps,
      state,
      argStr(args[0]),
      argStr(args[1]),
      argStr(args[2]),
      argStr(args[3]),
      argStr(args[4]),
    );
    return result is Map<String, Object?> ? result : state;
  }

  Map<String, Object?> runCase(
    String handler,
    List<Object?> args,
    Map<String, Object?> state,
    HandlerDeps deps,
  ) {
    return switch (handler) {
      'handleAddIncome' => handleAddIncome(
        deps,
        state,
        argNum(args[0]),
        argStr(args[1]),
        argStr(args[2]),
        argStr(args[3]),
        argStr(args[4]),
        argStr(args[5]),
      ),
      'handleAddExpense' => handleAddExpense(
        deps,
        state,
        argStr(args[0]),
        argStr(args[1]),
        argNum(args[2]),
        argStr(args[3]),
        argStr(args[4]),
        argStr(args[5]),
        argStr(args[6]),
        argNum(args[7]),
      ),
      'handlePayCreditCard' => handlePayCreditCard(
        deps,
        state,
        argStr(args[0]),
        argNum(args[1]),
        argStr(args[2]),
        argStr(args[3]),
      ),
      'handleEditTransaction' => handleEditTransaction(
        deps,
        state,
        argStr(args[0]),
        argMap(args[1]),
      ),
      'handleDeleteTransaction' => handleDeleteTransaction(
        deps,
        state,
        argStr(args[0]),
      ),
      'handleTransferFunds' => handleTransferFunds(
        deps,
        state,
        argStr(args[0]),
        argStr(args[1]),
        argStr(args[2]),
        argStr(args[3]),
        argNum(args[4]),
        argStr(args[5]),
        argStr(args[6]),
        argNum(args[7]),
      ),
      'handleMakeDebtPayment' => handleMakeDebtPayment(
        deps,
        state,
        argStr(args[0]),
        argNum(args[1]),
        argStr(args[2]),
        argStr(args[3]),
        argNum(args[4]),
      ),
      'handleMakeLoanSettlement' => handleMakeLoanSettlement(
        deps,
        state,
        argStr(args[0]),
        argNum(args[1]),
        argStr(args[2]),
        argStr(args[3]),
        argStr(args[4]),
        argNum(args[5]),
      ),
      'handlePaySubscription' => handlePaySubscription(
        deps,
        state,
        argStr(args[0]),
        argStr(args[1]),
        argStr(args[2]),
        argStr(args[3]),
        argNum(args[4]),
      ),
      // The screen that stands in front of `handlePaySubscription`, measured as its own
      // case because it is the one flow whose golden is a ledger that does not move.
      'subscriptionPayDialog.authorize' => authorizeFromDialog(
        deps,
        state,
        args,
      ),
      _ => throw StateError('No port dispatch for handler: $handler'),
    };
  }

  /// `handleAddExpense(…)` → `handleAddExpense`, the callee the harness grouped by.
  String handlerOf(String caseName) {
    final int paren = caseName.indexOf('(');
    if (paren <= 0) {
      throw StateError('Fixture case name is not `handler(args)`: $caseName');
    }
    return caseName.substring(0, paren);
  }

  final Map<String, Map<String, Object?>> outputs =
      <String, Map<String, Object?>>{};
  final Map<String, List<String>> toastsByCase = <String, List<String>>{};
  final Map<String, List<List<String>>> tombstonesByCase =
      <String, List<List<String>>>{};
  final Map<String, int> dirtyCountByCase = <String, int>{};
  final Map<String, bool> movedByCase = <String, bool>{};

  for (final Map<String, Object?> entry in cases) {
    final String name = entry['name']! as String;
    final Map<String, Object?> input = entry['input']! as Map<String, Object?>;
    final List<Object?> args = input['args']! as List<Object?>;
    final String wantLedger = stringify(entry['expected']);

    test(name, () {
      final Map<String, Object?> before = freshSeed();
      // Each case re-boots from the pristine seed (`addInitScript` rewrites the mirror on
      // every navigation), so `input.before` is that seed normalised — walked here first,
      // exactly as the harness walked it, which is also what allocates the aliases this
      // case's output will reuse.
      final String bootLedger = stringify(walk(pick(before), null));
      expect(
        bootLedger,
        stringify(input['before']),
        reason:
            '${firstDifference(bootLedger, stringify(input['before']))}\n'
            'the ledger this replay boots from is not the ledger the browser '
            'booted from',
      );

      final HandlerDeps deps = depsFor(name);
      final Map<String, Object?> after = runCase(
        handlerOf(name),
        args,
        before,
        deps,
      );

      final String got = stringify(walk(pick(after), null));
      expect(got, wantLedger, reason: firstDifference(got, wantLedger));

      outputs[name] = after;
      toastsByCase[name] = List<String>.from(toasts);
      tombstonesByCase[name] = List<List<String>>.from(tombstones);
      dirtyCountByCase[name] = dirtyMarks.length;
      movedByCase[name] = stringify(pick(after)) != stringify(pick(before));
    });
  }

  // ------------------------------------------------------------------------- guards
  test('the typed AppState round-trips every handler result unchanged', () {
    // #64's condition. The handlers work on raw JSON so the port cannot quietly invent a
    // typed shape — but the app *reads* that JSON through `AppState.fromJson`, and a model
    // that forgets a field would drop it from the next push while every golden above stayed
    // green. So: run each result through the typed layer and demand the same ledger back.
    // Compared as parsed values, not as text, because `toJson()` writes keys in declaration
    // order and that order is not data at this layer.
    expect(outputs.length, cases.length, reason: 'a case never ran');
    for (final Map<String, Object?> entry in cases) {
      final String name = entry['name']! as String;
      final Map<String, Object?> result =
          outputs[name] ?? (throw StateError('No recorded output for $name'));
      final Map<String, Object?> rebound = AppState.fromJson(result).toJson();
      expect(
        pick(rebound),
        equals(pick(result)),
        reason:
            '$name: AppState.fromJson → toJson did not return the ledger it was '
            'given — the typed layer is dropping or inventing a field',
      );
    }
  });

  test('every write marks the owner dirty, and every delete tombstones its rows', () {
    for (final Map<String, Object?> entry in cases) {
      final String name = entry['name']! as String;
      if (movedByCase[name] == true) {
        expect(
          dirtyCountByCase[name],
          1,
          reason:
              '$name changed the ledger but did not run markStateDirty exactly '
              'once — the push would be skipped and the edit lost (INVENTORY.md §6)',
        );
      } else {
        // The refusal case: the dialog rejected before the handler ran, so nothing was
        // written and nothing is dirty. A failure here means the port paid something the
        // web refuses to pay.
        expect(
          dirtyCountByCase[name],
          0,
          reason: '$name left the ledger alone but still marked it dirty',
        );
      }
    }
    // A deleted row must be tombstoned or the cloud resurrects it on the next pull
    // (`utils.ts:133-181`). The income/expense legs are tombstoned under both the
    // transaction id and the record it points at.
    expect(
      tombstonesByCase['handleDeleteTransaction(withdrawal row)'],
      isNot(isEmpty),
    );
    expect(
      tombstonesByCase['handleDeleteTransaction(transfer row, both legs)'],
      isNot(isEmpty),
    );
  });

  test('the B-28 refusal is the dialog talking, not the handler', () {
    const String name =
        'subscriptionPayDialog.authorize(credit card as the funding source — B-28)';
    final List<String> raised =
        toastsByCase[name] ?? (throw StateError('$name never ran'));
    // `executePayment` (`SubscriptionManagement.tsx:119-137`) calls a credit card's
    // `currentBalance` its spendable money, so Travel Credit at -40,406.29 against a
    // 250,000 limit refuses a payment the user can absolutely make. Replicated
    // bug-compatible per rule 5 — the exact text, including the negative balance quoted as
    // the money available, is the point. See parity/BUGS_FOUND.md B-28.
    expect(raised, <String>[
      'error|Insufficient Rs.2,450.5, have Rs.-40,406.29',
    ]);
    expect(movedByCase[name], isFalse);
  });

  test('no handler reaches for a real clock', () {
    // `lib/domain/handlers.dart` takes its time from `HandlerDeps.nowMs` and holds no
    // `DateTime.now()`, so a golden cannot depend on the day it is replayed. Every case
    // that moved the ledger consulted the pinned instant; the refusal consulted nothing,
    // because it rejected before the handler ran.
    //
    // Comments are stripped first: the file's own doc header names the forbidden call to
    // explain why it is absent, and a guard that matches prose would fail on the very
    // thing it is praising.
    final String handlerSource = File(
      '$repo$sep'
      'mobile$sep'
      'lib$sep'
      'domain$sep'
      'handlers.dart',
    ).readAsStringSync();
    final List<String> code = handlerSource
        .split('\n')
        .where(
          (String line) =>
              !line.trimLeft().startsWith('//') &&
              !line.trimLeft().startsWith('*'),
        )
        .toList();
    expect(
      code.join('\n'),
      isNot(contains('DateTime.now()')),
      reason: code
          .asMap()
          .entries
          .where(
            (MapEntry<int, String> e) => e.value.contains('DateTime.now()'),
          )
          .map((MapEntry<int, String> e) => '${e.key + 1}: ${e.value.trim()}')
          .join('\n'),
    );
    for (final Map<String, Object?> entry in cases) {
      final String name = entry['name']! as String;
      final bool moved =
          movedByCase[name] ?? (throw StateError('$name never ran'));
      expect(
        casesThatReadTheClock.contains(name),
        moved,
        reason:
            '$name: the clock was ${casesThatReadTheClock.contains(name) ? 'read' : 'not read'} but the ledger ${moved ? 'moved' : 'did not move'}',
      );
    }
  });

  test('every case recorded by the harness was replayed', () {
    expect(outputs.length, cases.length);
    for (final String name in fixtureNames) {
      expect(
        outputs.containsKey(name),
        isTrue,
        reason: 'unconsumed case: $name',
      );
    }
  });
}
