/// `src/lib/money.ts` — the integer-cent core every financial number in the app
/// passes through.
///
/// The web's rule (`INVENTORY.md` §5.2, `parity/LOGIC_SPEC.md` §1): round to cents
/// **on input**, add as integers, divide by 100 **on output**. Nothing here is new
/// arithmetic; each function is the twin of the exported one at the line cited, and
/// `parity/fixtures/money.json` (200 cases measured from `src/lib/money.ts` at the
/// `pre-flutter` tag) replays them all.
///
/// Two things about the port's types are deliberate:
///
/// - **Return type is `num`, never `int`.** A JavaScript number is a double, and
///   `toMinorUnits(1e21)` is `1e+23` — a value `int` cannot hold and `double` would
///   spell differently in JSON. `parity/DATA_SPEC.md` §2 fixes state as `num` for the
///   same reason.
/// - **A value that leaves here and can land in app state is normalised to an `int`
///   when it is integral** ([asJsonSafeNumber], §3). `JSON.stringify(3)` writes `3`
///   while Dart's `jsonEncode(3.0)` writes `3.0`, and `canonicalStateJson` compares
///   those strings to decide whether a push is a no-op — so an unnormalised money
///   result would both defeat the skip and send the server a snapshot string the web
///   never writes.
library;

import '../data/js_semantics.dart';
import '../data/number_locale.dart';

/// `toMinorUnits` (`src/lib/money.ts:5-11`).
///
/// `null`/`undefined` → `0`; a string goes through [jsParseFloat], which is lenient
/// (`"12abc"` → `1200`, `"0x10"` → `0`, `"1,250"` → `100`); `NaN` → `0`; and
/// **`Infinity` is not caught**, because the web's guard is `isNaN` rather than
/// `isFinite`, so `toMinorUnits(Infinity)` is `Infinity`.
///
/// Rounding is [jsMathRound] — ties break toward +∞ — which is exactly where Dart's
/// own `.round()` diverges: `toMinorUnits(-0.005)` is `-0` on the web (`-1` in Dart)
/// and `toMinorUnits(-0.125)` is `-12` (`-13` in Dart). Both are fixtures.
num toMinorUnits(Object? amount) {
  if (amount == null) return 0;
  // `typeof amount === 'string'` (`:7`). A bool or a list is outside the web's own
  // `number | string | null | undefined` type, so it has no measured behaviour; it
  // lands on `NaN` here and therefore on `0`, which is the safer of the two guesses.
  final double value = amount is String
      ? jsParseFloat(amount)
      : (amount is num ? amount.toDouble() : double.nan);
  if (value.isNaN) return 0;
  return jsMathRound(value * 100);
}

/// `toMajorUnits` (`src/lib/money.ts:17-20`).
///
/// `null`/`undefined`/`NaN` → `"0.00"`, otherwise `(cents / 100).toFixed(2)` — and
/// non-integer cents round **again** here, on the exact binary value, which is why
/// `toMajorUnits(1.5)` is `"0.01"` while `formatMoney` of `0.015` is `"0.02"`.
/// `Infinity` → `"Infinity"` (the guard is `isNaN`), and `-0` → `"0.00"` because
/// `toFixed` adds a sign only when `x < 0`, which `-0` is not.
String toMajorUnits(num? cents) {
  if (cents == null) return '0.00';
  final double value = cents.toDouble();
  if (value.isNaN) return '0.00';
  return jsToFixed(value / 100, 2);
}

/// `addMoney` (`src/lib/money.ts:22-24`).
///
/// The three `/ 100` functions — `addMoney`, `subtractMoney`, `sumMoney`,
/// `multiplyMoney` — return [asJsonSafeNumber]'s normalised value, because their result
/// is a **major-unit amount** and major-unit amounts are what the app stores.
/// `toMinorUnits` and `compareMoney` do not: a cent count and a cent difference are
/// arithmetic intermediates, and normalising `-0` there would erase the very thing
/// `money.json` measures.
num addMoney(num a, num b) =>
    asJsonSafeNumber((toMinorUnits(a) + toMinorUnits(b)) / 100);

/// `subtractMoney` (`src/lib/money.ts:26-28`).
num subtractMoney(num a, num b) =>
    asJsonSafeNumber((toMinorUnits(a) - toMinorUnits(b)) / 100);

/// `sumMoney` (`src/lib/money.ts:30-33`) — `reduce` from `0`, one cent conversion per
/// element, one division at the end. `sumMoney([])` is `0`.
num sumMoney(List<num> amounts) {
  double totalCents = 0;
  for (final num amount in amounts) {
    totalCents += toMinorUnits(amount).toDouble();
  }
  return asJsonSafeNumber(totalCents / 100);
}

/// `compareMoney` (`src/lib/money.ts:35-37`).
///
/// Returns the **cent difference**, not `-1/0/1`, so it cannot be handed to a Dart
/// `Comparable` or a `sort` callback unchanged. `INVENTORY.md` §5.7 makes the same
/// point about the web's own sort comparators.
num compareMoney(num a, num b) => toMinorUnits(a) - toMinorUnits(b);

/// `multiplyMoney` (`src/lib/money.ts:39-41`).
///
/// The factor is **not** rounded to cents first, so `multiplyMoney(10, 1/3)` is `3.33`
/// and `multiplyMoney(10, Infinity)` is `Infinity`.
num multiplyMoney(num amount, num factor) {
  return asJsonSafeNumber(
    jsMathRound(toMinorUnits(amount).toDouble() * factor.toDouble()) / 100,
  );
}

/// The web's `FormatMoneyOptions` (`src/lib/money.ts:43-51`).
class FormatMoneyOptions {
  const FormatMoneyOptions({
    this.minFractionDigits = 0,
    this.maxFractionDigits = 2,
    this.signed = false,
  });

  final int minFractionDigits;
  final int maxFractionDigits;

  /// Off by default: the app conveys direction with red/green colour, never with a
  /// sign glyph (`INVENTORY.md` §5.5). Rendering a negative as `"Rs.-500"` is a UI
  /// change, not a formatting choice.
  final bool signed;
}

/// `formatMoney` (`src/lib/money.ts:58-67`) — the single place a money value becomes
/// the string a user reads: `"Rs.1,234.50"`.
///
/// Four properties of the web's version are load-bearing and easy to "improve" into a
/// divergence:
/// - the sign is stripped from the number itself, and when `signed` is set the minus
///   goes **before the currency** (`"-Rs.500"`), with no space anywhere;
/// - a `minFractionDigits` above `maxFractionDigits` is silently clamped by `Math.min`;
/// - non-finite input becomes `0`, not `"NaN"` (this one *does* use `isFinite`);
/// - grouping comes from `toLocaleString`, **not** from `String()` or `toFixed`:
///   [jsToLocaleStringFixed] rounds `0.015` up to `0.02` where [jsToFixed] rounds it
///   down to `0.01`, and it expands `1e21` into grouped digits where `toFixed` would
///   write `"1e+21"`.
///
/// **Locale.** The web passes `undefined` as the locale, so a browser in `en-IN`
/// renders `"Rs.1,25,000"` and one in `de-DE` renders `"Rs.1.234,50"`. The port does the
/// same with the phone's own locale: leave [locale] out and the separators, grouping and
/// digits come from `JsNumberLocale.device()`. A test that must reproduce a golden
/// measured under one locale passes that locale in, which is how `money_test.dart` pins
/// the `en-US` shape of `money.json` (`_provenance.locale`) without the app ever
/// inheriting it. `parity/DATA_SPEC.md` §11 D-12 records the ruling.
String formatMoney(
  String currency,
  num amount, [
  FormatMoneyOptions options = const FormatMoneyOptions(),
  JsNumberLocale? locale,
]) {
  final double value = amount.toDouble();
  final double safe = value.isFinite ? value : 0;
  final int digits = options.minFractionDigits < options.maxFractionDigits
      ? options.minFractionDigits
      : options.maxFractionDigits;
  final String body = jsToLocaleStringFixed(
    safe.abs(),
    digits,
    options.maxFractionDigits,
    locale ?? JsNumberLocale.device(),
  );
  final String sign = options.signed && safe < 0 ? '-' : '';
  return '$sign$currency$body';
}

/// A money result that can reach app state, in the spelling `JSON.stringify` would
/// give it: an integral double becomes an `int`, everything else stays a `double`.
///
/// `parity/DATA_SPEC.md` §2 already applies this on the read path
/// (`json_reader.dart`'s `readNumOpt`, `map_database_result_to_state.dart`'s
/// `_jsNumber`); this is the same rule for the values the *phone* computes, and the
/// reason it is a rule rather than a nicety is §3's table: `jsonEncode(3.0)` is
/// `"3.0"`, `JSON.stringify(3.0)` is `"3"`, and `canonicalStateJson`'s string is what
/// the no-op-push skip and the server snapshot compare.
///
/// Negative zero becomes `0`, which is what `JSON.stringify(-0)` writes too — the
/// `-0` that [jsMathRound] produces on a half-cent input is a rounding-rule artefact,
/// not a value any consumer can observe through JSON.
num asJsonSafeNumber(num value) {
  if (value is int) return value;
  final double d = value as double;
  if (!d.isFinite) return d;
  // `2^52` is the largest integer a double represents exactly, so a whole number
  // beyond it is not "integral" in any usable sense and is left as a double — the same
  // bound `map_database_result_to_state.dart`'s `_jsNumber` uses, and the reason
  // `toMinorUnits(1e21)` stays `1e23`. Without it Dart does not throw: `double.round()`
  // saturates at `maxInt`, so `1e30` would become `9223372036854775807`.
  if (d == d.roundToDouble() && d.abs() < 4503599627370496) return d.round();
  return d;
}
