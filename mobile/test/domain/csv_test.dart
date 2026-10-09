import 'dart:convert';
import 'dart:io';

import 'package:em_budget/domain/csv.dart';
import 'package:flutter_test/flutter_test.dart';

import '../data/web_source.dart';

/// `src/lib/download.ts` replayed against `parity/fixtures/csv.json` — 16 cases measured
/// from that file at the `pre-flutter` tag (`LOGIC_SPEC.md` §10).
///
/// **Content only.** `downloadBlob` builds a `Blob`, hangs an `<a>` off `document.body`,
/// clicks it and revokes the URL; none of that exists on a phone. `INVENTORY.md` §13h D29
/// rules this unit is ported as the CSV text, the save-or-share step is Phase 7, and the
/// difference belongs in `UI_SPEC.md`. The bytes are identical on both platforms, so a
/// fixture could never have told a correct port from a missing one anyway — which is why
/// the guard below (that the file has exactly the cases `escapeCsvRow` produced and no
/// `downloadBlob` ones) is the load-bearing assertion in this suite.
///
/// **Filenames are not here either.** `download.ts` takes the name as a parameter; the
/// strings `finance_statement_${stamp}.csv` and `${filename}_${stamp}.csv` are built at
/// `src/utils.ts:338-370` and are part of the `utils.ts` port (task #62).
void main() {
  final List<String> fixtureNames = <String>[];
  final Map<String, Object?> expectedByName = <String, Object?>{};
  final Map<String, List<Object?>> inputByName = <String, List<Object?>>{};
  final Set<String> consumed = <String>{};

  Object? expected(String name) {
    if (!expectedByName.containsKey(name)) {
      throw StateError('No such fixture case: $name');
    }
    consumed.add(name);
    return expectedByName[name];
  }

  List<Object?> inputOf(String name) => inputByName[name]!;

  /// The measured case is `escapeCsvRow([cells])`: one argument, the cell list.
  List<Object?> cellsOf(String name) => inputOf(name).first! as List<Object?>;

  Object? runCase(String name) =>
      escapeCsvRow(cellsOf(name).map(_derefCell).toList());

  void loadFixture() {
    final File file = File(
      '${repoRoot()}${Platform.pathSeparator}parity'
      '${Platform.pathSeparator}fixtures${Platform.pathSeparator}csv.json',
    );
    if (!file.existsSync()) {
      throw StateError('Missing fixture file: ${file.path}');
    }
    final Map<String, Object?> root =
        jsonDecode(file.readAsStringSync()) as Map<String, Object?>;
    final Map<String, Object?> prov =
        root['_provenance']! as Map<String, Object?>;
    if (prov['unitFile'] != 'src/lib/download.ts') {
      throw StateError('csv.json is not from src/lib/download.ts');
    }
    if (prov['generatedFrom'] != 'pre-flutter') {
      throw StateError(
        'csv.json claims generatedFrom ${prov['generatedFrom']}; '
        'fixtures are measured from the pre-flutter tag only',
      );
    }
    for (final Object? raw in root['cases']! as List<Object?>) {
      final Map<String, Object?> entry = raw! as Map<String, Object?>;
      final String name = entry['name']! as String;
      if (expectedByName.containsKey(name)) {
        throw StateError('Duplicate fixture case: $name');
      }
      if (!name.startsWith('escapeCsvRow(')) {
        throw StateError(
          'csv.json carries $name, which is not an escapeCsvRow case; '
          'the pure half of download.ts has no other export',
        );
      }
      expectedByName[name] = entry['expected'];
      inputByName[name] = entry['input']! as List<Object?>;
      fixtureNames.add(name);
    }
    if (fixtureNames.length != 16) {
      throw StateError(
        'csv.json carries ${fixtureNames.length} cases, expected 16',
      );
    }
  }

  loadFixture();

  group('escapeCsvRow against csv.json', () {
    test('plain cells are quoted and comma-joined', () {
      expect(runCase('escapeCsvRow(plain)'), expected('escapeCsvRow(plain)'));
    });

    test('each formula-leading character is prefixed with a quote', () {
      // `-` is its own named case, because the finding is that a *negative number* is
      // treated as a formula, not that a dash is a prefix.
      for (final String suffix in <String>['=', '+', '@', 'tab', 'CR']) {
        final String name = 'escapeCsvRow(leading $suffix)';
        expect(runCase(name), expected(name), reason: name);
      }
    });

    test('the name of the negative-number case is the finding, not a joke', () {
      const String name =
          'escapeCsvRow(leading - (a negative number is treated as a formula))';
      expect(runCase(name), expected(name));
      // Exported amounts are built as `Rs. 500` strings upstream, but a raw negative
      // number cell is the one shape the guard flags wrongly and the app produces.
      expect(escapeCsvRow(<Object?>[-500]), "\"'-500\"");
    });

    test('an operator that is not the first character is left alone', () {
      const String name = 'escapeCsvRow(operator in the middle is left alone)';
      expect(runCase(name), expected(name));
    });

    test('a quote is doubled outside the formula branch', () {
      const String name =
          'escapeCsvRow(inner quote outside the formula branch)';
      expect(runCase(name), expected(name));
    });

    test('a quote is NOT doubled inside the formula branch (early return)', () {
      const String name =
          'escapeCsvRow(inner quote INSIDE the formula branch (early return, not escaped))';
      expect(runCase(name), expected(name));
    });

    test('an empty string is still a quoted empty cell', () {
      const String name = 'escapeCsvRow(empty string cell)';
      expect(runCase(name), expected(name));
    });

    test(
      'a null cell prints "null"; the "undefined" half has no Dart producer',
      () {
        const String name = 'escapeCsvRow(null and undefined)';
        // The web measured `"null","undefined"`. Dart has one absent value where JS has
        // two (`DATA_SPEC.md` §1), so the second cell cannot render as `undefined` from
        // any ported model — a nullable field decodes to `null`. The `null` half is the
        // reachable behaviour and is what this asserts, while the measured string stays
        // consumed so the case-count test still covers it.
        expect(expected(name), '"null","undefined"');
        expect(escapeCsvRow(<Object?>[null]), '"null"');
        expect(escapeCsvRow(<Object?>[null, null]), '"null","null"');
      },
    );

    test('numbers keep JS formatting', () {
      const String name = 'escapeCsvRow(numbers keep JS formatting)';
      expect(runCase(name), expected(name));
    });

    test(
      'a whole double prints digits below 1e21 and an exponent at or above',
      () {
        // The regression this case exists to catch: `String(1e20)` is
        // `"100000000000000000000"`, and the first Dart version printed a **negative**
        // number there by going through `toInt()` past 2^63 — which the formula guard then
        // quoted as if the cell started with `-`.
        const String name =
            'escapeCsvRow(whole doubles either side of the exponent threshold)';
        expect(runCase(name), expected(name));
      },
    );

    test(
      'no cells yields the empty string, not a newline or a pair of quotes',
      () {
        const String name = 'escapeCsvRow(no cells at all)';
        expect(runCase(name), expected(name));
        expect(escapeCsvRow(<Object?>[]), '');
      },
    );

    test('a long value is passed through unbroken', () {
      const String name = 'escapeCsvRow(long value)';
      expect(runCase(name), expected(name));
    });
  });

  group('properties a refactor would change', () {
    test('no trailing newline, ever', () {
      expect(escapeCsvRow(<Object?>['a']).contains('\n'), isFalse);
      expect(escapeCsvRow(<Object?>['a', 'b']).contains('\n'), isFalse);
      // Callers join rows with `\n` themselves (`src/utils.ts:360`).
      expect(
        <String>[
          escapeCsvRow(<Object?>['a']),
          escapeCsvRow(<Object?>['b']),
        ].join('\n'),
        '"a"\n"b"',
      );
    });

    test('every cell is quoted, including one that needed no escaping', () {
      expect(escapeCsvRow(<Object?>['plain']), '"plain"');
    });

    test(
      'the prefix is added before quoting, so it lands inside the quotes',
      () {
        expect(escapeCsvRow(<Object?>['=1']), "\"'=1\"");
      },
    );

    test('a single quote in the input is not doubled — only `"` is', () {
      expect(escapeCsvRow(<Object?>["it's"]), '"it\'s"');
    });

    test(
      'a formula character appearing after the first is not escaped twice',
      () {
        expect(escapeCsvRow(<Object?>['a=b']), '"a=b"');
        expect(escapeCsvRow(<Object?>['=="x']), '"\'=="x"');
      },
    );

    test('1e21 is written in exponential form, as JS `String` writes it', () {
      expect(escapeCsvRow(<Object?>[1e21]), '"1e+21"');
      expect(escapeCsvRow(<Object?>[1e20]), '"100000000000000000000"');
    });

    test('a non-finite number is a string — and a negative one is a formula cell', () {
      expect(escapeCsvRow(<Object?>[double.infinity]), '"Infinity"');
      // `String(-Infinity)` is `-Infinity`, which starts with `-`, so the guard quotes
      // it. Same rule that catches `-500`, reached from a different direction.
      expect(
        escapeCsvRow(<Object?>[double.negativeInfinity]),
        "\"'-Infinity\"",
      );
      expect(escapeCsvRow(<Object?>[double.nan]), '"NaN"');
    });

    test('a negative zero is a plain "0"', () {
      expect(escapeCsvRow(<Object?>[-0.0]), '"0"');
    });

    test('an integer-valued double does not gain a decimal point', () {
      // Dart interpolates `100.0` where `String(100)` gives `100`; this is the porting
      // trap in `INVENTORY.md` §5 landmine 8 surfacing in an exported row.
      expect(escapeCsvRow(<Object?>[100.0]), '"100"');
      expect(escapeCsvRow(<Object?>[1200.5]), '"1200.5"');
    });
  });

  test('every fixture case was consumed', () {
    expect(consumed.length, fixtureNames.length);
    expect(consumed.toSet().difference(fixtureNames.toSet()), isEmpty);
    expect(fixtureNames.where((String n) => !consumed.contains(n)), isEmpty);
  });
}

/// Turns one fixture cell into the value the web actually passed to `String()`: a
/// non-finite or negative-zero **number**, or `undefined`.
///
/// `undefined` becomes `null`, and that collapse is the one thing this port cannot undo
/// (`DATA_SPEC.md` §1); the `null and undefined` test documents what it means for the
/// exported row instead of pretending the sentinel is reachable.
Object? _derefCell(Object? raw) {
  if (raw is Map<String, Object?> && raw.containsKey('__sentinel__')) {
    final String sentinel = raw['__sentinel__']! as String;
    switch (sentinel) {
      case 'undefined':
        return null;
      case 'NaN':
        return double.nan;
      case 'Infinity':
        return double.infinity;
      case '-Infinity':
        return double.negativeInfinity;
      case '-0':
        return -0.0;
      default:
        throw StateError('Unknown sentinel: $sentinel');
    }
  }
  return raw;
}
