import 'dart:convert';
import 'dart:io';

import 'package:em_budget/data/js_semantics.dart';
import 'package:em_budget/data/number_locale.dart';
import 'package:em_budget/domain/money.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';

import '../data/web_source.dart';

/// The locale half of `src/lib/money.ts:61` — the `toLocaleString` that takes the
/// runtime's locale and with it the separators, the grouping runs, the digits and the
/// negative glyph.
///
/// Ruled at the Phase 4 gate (`parity/DATA_SPEC.md` §11 D-12): the phone formats in the
/// **device's** locale, exactly as the browser formats in the **browser's**, so this is
/// not a divergence to record but a behaviour to port. Which means it needs goldens for
/// locales the web app was never measured under, and `money.json` — one locale, the one
/// the generator happened to run in — cannot show them. `number-locale.json` is those
/// goldens: ten locales × the same amounts the web's own formatter produces when the
/// `undefined` locale argument is replaced by a tag, plus a baseline block of LKR
/// figures the web actually rendered into `parity/screenshots/web/`.
///
/// The ten include `en-LK` and `si-LK`, the two tags a Sri Lankan phone reports, added
/// at the same gate: the app's currency is LKR, so those are the only two locales whose
/// correctness a user can notice.
///
/// The rounding is *not* part of this file's contract; `money_test.dart` and
/// `js_semantics_format_test.dart` pin it. What is tested here is that the digits that
/// rounding produces are put into the right groups, between the right separators, in the
/// right number system, under the right sign — the four things a locale can change.
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

  void loadFixture() {
    final File file = File(
      '${repoRoot()}${Platform.pathSeparator}parity'
      '${Platform.pathSeparator}fixtures${Platform.pathSeparator}number-locale.json',
    );
    if (!file.existsSync()) {
      throw StateError('Missing fixture file: ${file.path}');
    }
    final Map<String, Object?> root =
        jsonDecode(file.readAsStringSync()) as Map<String, Object?>;
    final Map<String, Object?> prov =
        root['_provenance']! as Map<String, Object?>;
    if (prov['unitFile'] != 'src/lib/money.ts') {
      throw StateError('number-locale.json is not from src/lib/money.ts');
    }
    for (final Object? raw in root['cases']! as List<Object?>) {
      final Map<String, Object?> entry = raw! as Map<String, Object?>;
      final String name = entry['name']! as String;
      if (expectedByName.containsKey(name)) {
        throw StateError('Duplicate fixture case: $name');
      }
      expectedByName[name] = entry['expected'];
      inputByName[name] = entry['input']! as List<Object?>;
      fixtureNames.add(name);
    }
    if (fixtureNames.isEmpty) {
      throw StateError('number-locale.json carries no cases');
    }
    // The whole point of the file is that it holds more than one locale. A run that
    // generated it under, say, a de-DE-only set would look identical in shape and prove
    // nothing. Ten is the list in `generate.ts`: eight measured for their shapes, and
    // `en-LK`/`si-LK` because they are the ones this product's users get.
    final Set<String> tags = fixtureNames
        .map((String n) => inputByName[n]![0]! as String)
        .toSet();
    if (tags.length < 10) {
      throw StateError(
        'number-locale.json covers ${tags.length} locales: $tags',
      );
    }
    for (final String needed in <String>['en-LK', 'si-LK']) {
      if (!tags.contains(needed)) {
        throw StateError(
          'number-locale.json is missing $needed, the locale a Sri Lankan '
          'device reports — the app formats in the device locale (D25), so this '
          'file is the only thing standing between a wrong grouping and a release.',
        );
      }
    }
  }

  loadFixture();

  FormatMoneyOptions optionsOf(Map<String, Object?> raw) => FormatMoneyOptions(
    minFractionDigits: (raw['minFractionDigits'] as num?)?.toInt() ?? 0,
    maxFractionDigits: (raw['maxFractionDigits'] as num?)?.toInt() ?? 2,
    signed: raw['signed'] as bool? ?? false,
  );

  num amountOf(Object? raw) {
    if (raw is num) return raw;
    if (raw is Map<String, Object?> && raw.containsKey('__sentinel__')) {
      switch (raw['__sentinel__']! as String) {
        case '-0':
          return -0.0;
        case 'NaN':
          return double.nan;
        case 'Infinity':
          return double.infinity;
        case '-Infinity':
          return double.negativeInfinity;
      }
    }
    throw StateError('$raw is not an amount');
  }

  group('number-locale.json', () {
    test('every case, in its own locale', () {
      for (final String name in fixtureNames) {
        final List<Object?> input = inputOf(name);
        final String tag = input[0]! as String;
        final String currency = input[1]! as String;
        final num amount = amountOf(input[2]);
        final FormatMoneyOptions options = optionsOf(
          input[3]! as Map<String, Object?>,
        );
        expect(
          formatMoney(currency, amount, options, JsNumberLocale.resolve(tag)),
          expected(name) as String,
          reason: name,
        );
      }
    });

    test('every case was consumed', () {
      expect(
        fixtureNames.where((String n) => !consumed.contains(n)).toList(),
        isEmpty,
        reason: 'cases the port did not run',
      );
      expect(consumed.length, fixtureNames.length);
    });
  });

  group('what the locale actually changes', () {
    // Each of these is one of the four knobs, isolated: the same amount and the same
    // rounding everywhere, so a difference can only have come from the locale.
    test('grouping runs: three-and-three against the lakh three-and-two', () {
      expect(
        jsToLocaleStringFixed(1250000, 0, 2, JsNumberLocale.resolve('en-US')),
        '1,250,000',
      );
      expect(
        jsToLocaleStringFixed(1250000, 0, 2, JsNumberLocale.resolve('en-IN')),
        '12,50,000',
      );
      expect(
        jsToLocaleStringFixed(1234567, 0, 0, JsNumberLocale.resolve('hi-IN')),
        '12,34,567',
      );
      // Seven digits is where the secondary run first becomes visible, so a port that
      // read only the primary size still gets the six-digit case right by accident.
      expect(
        jsToLocaleStringFixed(123456, 0, 0, JsNumberLocale.resolve('en-IN')),
        '1,23,456',
      );
    });

    test('separators swap, they do not translate', () {
      expect(
        jsToLocaleStringFixed(
          1234567.89,
          2,
          2,
          JsNumberLocale.resolve('de-DE'),
        ),
        '1.234.567,89',
      );
      expect(
        jsToLocaleStringFixed(
          1234567.89,
          2,
          2,
          JsNumberLocale.resolve('nl-NL'),
        ),
        '1.234.567,89',
      );
    });

    test('some locales group with a space, and it is not one ASCII space', () {
      // fr-FR is U+202F NARROW NO-BREAK SPACE, cs-CZ U+00A0 NO-BREAK SPACE. Both are
      // invisible in a diff and both are what the web shows, so the code points are
      // asserted rather than the glyphs.
      final String fr = jsToLocaleStringFixed(
        1234567.89,
        2,
        2,
        JsNumberLocale.resolve('fr-FR'),
      );
      final String cs = jsToLocaleStringFixed(
        1234567.89,
        2,
        2,
        JsNumberLocale.resolve('cs-CZ'),
      );
      expect(fr.runes.contains(0x202F), isTrue, reason: fr);
      expect(cs.runes.contains(0x00A0), isTrue, reason: cs);
      expect(fr.contains(' '), isFalse, reason: fr);
    });

    test('digits belong to the locale, separators to nobody', () {
      final String ar = jsToLocaleStringFixed(
        1250000.5,
        2,
        2,
        JsNumberLocale.resolve('ar-EG'),
      );
      expect(ar, '١٬٢٥٠٬٠٠٠٫٥٠');
      expect(
        jsToLocaleStringFixed(0, 0, 2, JsNumberLocale.resolve('ar-EG')),
        '٠',
      );
      expect(
        jsToLocaleStringFixed(1250000, 2, 2, JsNumberLocale.resolve('bn-BD')),
        '১২,৫০,০০০.০০',
      );
      // The zero digit is a whole number system, not a glyph substitution: a port that
      // mapped only `0` would leave `١` unwritten.
      expect(JsNumberLocale.resolve('ar-EG').zeroDigit, '٠');
      expect(JsNumberLocale.resolve('my-MM').zeroDigit, '၀');
    });

    test(
      'the negative sign is the locale\'s, including its invisible marks',
      () {
        // ar-EG prefixes U+061C ARABIC LETTER MARK before the hyphen. V8 emits it, and a
        // port that wrote a bare `-` would render a different string in the same browser.
        final String neg = jsToLocaleStringFixed(
          -2.5,
          2,
          2,
          JsNumberLocale.resolve('ar-EG'),
        );
        expect(neg.runes.first, 0x061C);
        expect(neg, '؜-٢٫٥٠');
        expect(
          jsToLocaleStringFixed(-2.5, 2, 2, JsNumberLocale.resolve('de-DE')),
          '-2,50',
        );
      },
    );
  });

  group('the device locale is what the app formats in', () {
    test('the default is the platform locale, not a constant', () {
      // This is the ruling itself, so it is asserted rather than assumed: omitting the
      // locale must resolve to the phone's tag, whatever tag the host happens to carry.
      final String tag = deviceLocaleTag();
      expect(JsNumberLocale.device().tag, tag);
      expect(
        formatMoney('Rs.', 1234567.891),
        formatMoney(
          'Rs.',
          1234567.891,
          const FormatMoneyOptions(),
          JsNumberLocale.resolve(tag),
        ),
      );
    });

    test('resolving is cached per tag and normalises the separator', () {
      expect(
        identical(
          JsNumberLocale.resolve('en-US'),
          JsNumberLocale.resolve('en-US'),
        ),
        isTrue,
      );
      // `intl` keys its data with underscores while BCP-47, `PlatformDispatcher` and the
      // goldens all use hyphens, so the tag is translated before the lookup.
      expect(
        JsNumberLocale.resolve('en_US').decimalSeparator,
        JsNumberLocale.resolve('en-US').decimalSeparator,
      );
    });

    test('an unknown tag falls back rather than throwing', () {
      // The app cannot validate the device's tag, and a locale with no CLDR data must
      // not take the display path down with it. V8's own answer to an unparseable tag is
      // its runtime default, measured here as `en-US`, so that is the shape ported.
      final JsNumberLocale weird = JsNumberLocale.resolve('zzy-ZZ');
      expect(weird.tag, 'zzy-ZZ');
      expect(weird.decimalSeparator, '.');
      expect(weird.groupSeparator, ',');
      expect(weird.primaryGroup, 3);
      expect(weird.secondaryGroup, 3);
      expect(jsToLocaleStringFixed(1234567.891, 0, 3, weird), '1,234,567.891');
      // …and a tag that merely has extra subtags is normalised, not rejected, exactly
      // as V8's `Intl` does.
      expect(JsNumberLocale.resolve('en-GB').groupSeparator, ',');
      expect(JsNumberLocale.resolve('en-GB-u-nu-latn').decimalSeparator, '.');
    });
  });

  group('the two locales this product actually ships in', () {
    // `en-LK` and `si-LK` are measured, not assumed, in V8: both resolve to comma
    // grouping, full-stop decimal, ASCII digits and a plain `-` — so a Sinhala phone
    // groups `Rs.1,250,000` the way an English one does, and *not* the way `en-IN`
    // does. That is the difference between this pair and the other eight: the others
    // are shape coverage, these are the ones a user can see.
    test('both are real CLDR data, so neither reaches the fallback path', () {
      // `intl` throws for a tag it has no data for, which is what the `zzy-ZZ` case
      // above exists to survive. If either of these ever starts throwing, the phone
      // would be silently formatting Sri Lanka's two locales out of `en-US`.
      for (final String tag in <String>['en_LK', 'si_LK']) {
        expect(() => NumberFormat.decimalPattern(tag), returnsNormally);
      }
      // …and the port reads the same four knobs the browser reports for them.
      for (final String tag in <String>['en-LK', 'si-LK']) {
        final JsNumberLocale l = JsNumberLocale.resolve(tag);
        expect(l.tag, tag);
        expect(l.decimalSeparator, '.');
        expect(l.groupSeparator, ',');
        expect(l.primaryGroup, 3);
        expect(l.secondaryGroup, 3);
        expect(l.zeroDigit, '0');
        expect(l.negativePrefix, '-');
      }
    });

    test('they group three-and-three, not the lakh three-and-two', () {
      // The one wrong answer that is easy to ship: `en-IN` is the other English-plus-
      // rupee locale, and its grouping is visibly different at seven digits.
      expect(
        jsToLocaleStringFixed(1250000, 0, 0, JsNumberLocale.resolve('en-LK')),
        '1,250,000',
      );
      expect(
        jsToLocaleStringFixed(1250000, 0, 0, JsNumberLocale.resolve('si-LK')),
        '1,250,000',
      );
      expect(
        jsToLocaleStringFixed(1250000, 0, 0, JsNumberLocale.resolve('en-IN')),
        '12,50,000',
      );
    });

    test('an LKR amount on the phone is the string in the web baseline screenshot', () {
      // These four figures are read off `parity/screenshots/web/light/390/overviewhub
      // .png` — the hero balance, the ▲ delta, the "Net worth" line and "SPENT ·
      // TODAY" — and every one of them is `formatMoney(currency, x,
      // { maxFractionDigits: 0 })` with `currency` = the seeded state's `'LKR'`
      // (`qa-shot.cjs:320`, `DashboardHero.tsx:194-228`). The strings are pinned here
      // as well as in the golden so that a change to either side has to be noticed by
      // someone who has looked at the picture.
      const Map<num, String> onScreen = <num, String>{
        750500: 'LKR750,500',
        488820: 'LKR488,820',
        2588660: 'LKR2,588,660',
        13680: 'LKR13,680',
      };
      const FormatMoneyOptions hero = FormatMoneyOptions(maxFractionDigits: 0);
      for (final String tag in <String>['en-US', 'en-LK', 'si-LK']) {
        for (final MapEntry<num, String> e in onScreen.entries) {
          expect(
            formatMoney('LKR', e.key, hero, JsNumberLocale.resolve(tag)),
            e.value,
            reason: '$tag ${e.key}',
          );
          // …and V8 measured the same string for the same amount, in the same shape.
          expect(
            expectedByName['baseline("$tag",\'LKR\',${e.key})'],
            e.value,
            reason: 'golden for $tag ${e.key}',
          );
        }
      }
    });

    test('all fifteen baseline amounts agree across the three locales', () {
      // The screenshot was shot in `en-US` (the harness passes no `locale`, so Chromium
      // inherits the OS); the phone will be in `en-LK` or `si-LK`. They agree on every
      // amount the harness seeds, which is what lets the picture stand as the reference
      // for both.
      final Map<String, Map<num, String>> byTag = <String, Map<num, String>>{};
      for (final String name in fixtureNames) {
        if (!name.startsWith('baseline(')) continue;
        final List<Object?> input = inputOf(name);
        byTag.putIfAbsent(
          input[0]! as String,
          () => <num, String>{},
        )[input[2]! as num] = expected(name) as String;
      }
      expect(byTag.keys.toSet(), <String>{'en-US', 'en-LK', 'si-LK'});
      expect(byTag['en-US']!.length, 15);
      expect(byTag['en-LK'], byTag['en-US']);
      expect(byTag['si-LK'], byTag['en-US']);
    });
  });
}
