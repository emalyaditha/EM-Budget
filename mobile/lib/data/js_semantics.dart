/// JavaScript value semantics the web's sync path depends on, made explicit.
///
/// The port rule for Phase 3 is that a Dart value must mean what the web's value
/// meant, not what Dart would naturally infer. Three places in `src/supabase.ts`
/// decide a column's fate on JS truthiness (`:365`, `:393`, `:414`, `:902`), and
/// JS treats `0`, `''` and `NaN` as falsy while Dart treats them as ordinary
/// values. A naive `??` chain is therefore not a port.
library;

import 'number_locale.dart';

/// `a || b` as JavaScript evaluates it: null, undefined, `false`, `0`, `-0`,
/// `NaN` and `''` are falsy; every other value — including an empty list, an
/// empty map and any object — is truthy.
bool jsTruthy(Object? value) {
  if (value == null) return false;
  if (value is bool) return value;
  if (value is num) {
    // `NaN` is falsy in JavaScript and is the only number that is unequal to itself.
    if (value is double && value.isNaN) return false;
    return value != 0;
  }
  if (value is String) return value.isNotEmpty;
  return true;
}

/// The first of `values` that JavaScript would treat as truthy, or `null`.
/// `src/supabase.ts:365` and `:902` are both `a || b || c || d` chains.
Object? jsFirstTruthy(List<Object?> values) {
  for (final Object? value in values) {
    if (jsTruthy(value)) return value;
  }
  return null;
}

/// `a !== b` — ECMAScript Strict Equality, negated.
///
/// Dart's `!=` is *not* this. `double.nan == double.nan` is `true` in Dart and `false`
/// in JavaScript, so a difference test written with `!=` reports two `NaN` results as
/// identical; `display-interest.json` pins a case where the web's `!==` says the engine
/// and the UI disagree precisely because both are `NaN`. `-0 === 0` holds on both sides,
/// which is why the numeric branch does not special-case the sign bit.
///
/// For the primitives this port compares — numbers, strings, booleans, `null` and
/// [Object]s standing in for `undefined` — Dart's `==` agrees with `===`. It is **not**
/// JS object identity, so never apply this to a map or a list.
bool jsStrictNotEqual(Object? a, Object? b) {
  if (a is num && b is num) {
    final double x = a.toDouble();
    final double y = b.toDouble();
    if (x.isNaN || y.isNaN) return true;
    return x != y;
  }
  return a != b;
}

/// `new Date(value).getTime()`, for the shapes the ledger actually holds.
///
/// Two divergences from Dart's own parsing are reproduced deliberately:
/// - A date-only string (`YYYY-MM-DD`) is **UTC** midnight in JavaScript
///   (ECMA-262 date-time string format), while `DateTime.parse` reads it as
///   *local* midnight. Getting this wrong shifts every ledger date by the
///   device offset, which is `INVENTORY.md` §5.1's first landmine.
/// - Anything JavaScript cannot parse is an Invalid Date whose `getTime()` is
///   `NaN`. Callers must be able to tell that from a real epoch.
int? jsDateToEpochMs(Object? value) {
  if (value is num) {
    if (value is double && (value.isNaN || value.isInfinite)) return null;
    // `new Date(ms)` applies ToInteger, which **truncates toward zero**; it does
    // not round. A fractional epoch is unusual but a float state field makes it
    // reachable, and `1500.7` must become `1500`.
    return value.toInt();
  }
  if (value is! String || value.isEmpty) return null;
  final RegExp dateOnly = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$');
  final RegExpMatch? bare = dateOnly.firstMatch(value);
  if (bare != null) {
    // JavaScript reads a bare date as **UTC**; `DateTime.parse` would have read it
    // as local, so re-anchor it. `DateTime.utc` normalises an out-of-range month
    // or day into a later date, and V8 rejects it as an Invalid Date instead, so
    // the components are checked back against the literal.
    final int year = int.parse(bare.group(1)!);
    final int month = int.parse(bare.group(2)!);
    final int day = int.parse(bare.group(3)!);
    final DateTime anchored = DateTime.utc(year, month, day);
    if (anchored.year != year ||
        anchored.month != month ||
        anchored.day != day) {
      return null;
    }
    return anchored.millisecondsSinceEpoch;
  }
  final DateTime? loose = _jsHeuristicLooseDate(value);
  if (loose != null) return loose.millisecondsSinceEpoch;
  final DateTime? parsed = _tryParse(value);
  if (parsed == null) return null;
  // Date-time forms without an offset are local in JavaScript and local in
  // Dart, so `toUtc()` matches on both sides.
  return parsed.toUtc().millisecondsSinceEpoch;
}

/// V8's non-ISO date heuristic for `YYYY-M-D` / `YYYY-MM-D`, which Dart's
/// `DateTime.parse` refuses outright: its grammar wants two digits for the month
/// and the day, so `2026-9-5` is a `FormatException` in Dart and **local midnight
/// on 5 September** in the browser the ledger was built against.
///
/// Two things make this a separate branch rather than a widening of [jsDateToEpochMs]'s
/// ISO arm: the heuristic is *local* while the ISO date-only form is UTC (ECMA-262
/// splits on whether the string is in the date-time grammar), and V8 still rejects an
/// out-of-range component (`2026-13-45` is an Invalid Date), which is why the parsed
/// parts are checked back against the literal the way the ISO arm does it.
///
/// The heuristic covers much more than this in V8 (`M/D/Y`, month names, two-digit
/// years). Only the shape `src/utils.ts:39-46` and `src/services/transactionService.ts`
/// are measured handing over is reproduced; the rest is recorded in
/// `parity/DATA_SPEC.md` as a known divergence, not guessed at.
DateTime? _jsHeuristicLooseDate(String value) {
  final RegExpMatch? parts = RegExp(r'^(\d{4})-(\d{1,2})-(\d{1,2})$')
      .firstMatch(value);
  if (parts == null) return null;
  final int year = int.parse(parts.group(1)!);
  final int month = int.parse(parts.group(2)!);
  final int day = int.parse(parts.group(3)!);
  final DateTime local = DateTime(year, month, day);
  if (local.year != year || local.month != month || local.day != day) {
    return null;
  }
  return local;
}

/// `new Date(value).toISOString()` — or `null` when JavaScript would have
/// produced an Invalid Date and the caller must fall back to the raw value,
/// which is exactly what `src/supabase.ts:369-377` does.
String? jsDateToIso(Object? value) {
  final int? ms = jsDateToEpochMs(value);
  if (ms == null) return null;
  return _isoWithMillis(DateTime.fromMillisecondsSinceEpoch(ms, isUtc: true));
}

DateTime? _tryParse(String value) {
  try {
    return DateTime.parse(value);
  } on FormatException {
    return null;
  }
}

/// `String(num)` — i.e. `Number.prototype.toString()` with radix 10, which is what
/// `tx.amount.toString()` is in the search filter (`src/services/transactionService.ts:16`).
///
/// The two languages disagree about an integral double: JavaScript writes `20000`
/// where Dart writes `20000.0`. Since the state holds JavaScript floats
/// (`INVENTORY.md` §5.8), a search for `"20000"` must match an amount of `20000.0`.
/// Outside the double-exponential range Dart's shortest-round-trip repr agrees with
/// the ECMAScript `Number::toString` algorithm, so only that case is corrected.
String jsNumberToString(num value) {
  if (value is int) return value.toString();
  final double d = value.toDouble();
  if (d.isNaN) return 'NaN';
  if (d.isInfinite) return d > 0 ? 'Infinity' : '-Infinity';
  // `-0` prints as `0`, as in JavaScript.
  if (d == 0) return '0';
  // `1e21` and above (and their negatives) go exponential on both sides, so the
  // integral fix-up is limited to the range JavaScript writes in plain decimal.
  if (d == d.roundToDouble() && d.abs() < 1e21) {
    // ECMAScript `Number::toString` step 5 writes the shortest digits padded out with
    // zeros. Padding them by hand rather than going through `toInt()` matters: a whole
    // double above `2^63` has no 64-bit `int`, and `1e20` wrapped to a negative number
    // — which the CSV export then quoted as a formula cell.
    final _ShortestDecimal dec = _ShortestDecimal.of(d.abs());
    final int zeros = dec.pointPos - dec.digits.length;
    final String digits = dec.digits + '0' * (zeros > 0 ? zeros : 0);
    return d < 0 ? '-$digits' : digits;
  }
  return d.toString();
}

/// `String(value)` for the values a cell of the CSV export can actually hold.
///
/// `src/lib/download.ts` types its cells `string | number` and then calls `String(value)`
/// anyway, which is what makes `null` and `undefined` observable in the golden: the web's
/// type was a lie and the runtime printed them. Dart collapses both into one absent value
/// (`DATA_SPEC.md` §1: *absent ≡ `undefined`*), so this renders a Dart `null` the way the
/// web renders `null` — the value a **nullable model field** holds — and the
/// `String(undefined)` half of that case is not reachable from a ported model at all.
String jsToString(Object? value) {
  if (value == null) return 'null';
  if (value is num) return jsNumberToString(value);
  // Dart interpolates `String` and `bool` exactly as `String()` prints them.
  return '$value';
}

/// `a.localeCompare(b)` with no arguments — the comparator
/// `src/services/transactionService.ts:42,53` uses for the date and id
/// tie-breaks.
///
/// ECMAScript leaves the collation of the bare call implementation-defined, and in
/// practice it is an ICU primary/secondary comparison: case and accent are
/// *secondary*, so `'a'.localeCompare('B')` is `-1` while `'a'.compareTo('B')` is
/// `+1`. The two fields it is used on are a `YYYY-MM-DD` string and an id, both
/// ASCII digits/letters/hyphen in every fixture and every generated id in the web,
/// so the comparison is: fold case first (primary), then fall back to code units
/// (secondary). Deviations are confined to non-ASCII and are recorded in
/// `parity/DATA_SPEC.md`.
int jsLocaleCompare(String a, String b) {
  final int primary = a.toLowerCase().compareTo(b.toLowerCase());
  if (primary != 0) return primary < 0 ? -1 : 1;
  final int secondary = a.compareTo(b);
  if (secondary != 0) return secondary < 0 ? -1 : 1;
  return 0;
}

/// `parseInt(s.replace(/\D/g, ''), 10)` — the third tie-break of
/// `sortTransactionsByDate` (`src/services/transactionService.ts:47-48`).
///
/// The web strips every non-digit first, so `NaN` happens exactly when nothing is
/// left; Dart's `int.tryParse` also fails on a value too large for 64 bits, where
/// JavaScript would have kept an imprecise double. An id long enough to hit that is
/// not a uuid, so it is reported as absent rather than approximated.
int? jsDigitParse(String? value) {
  if (value == null) return null;
  final String digits = value.replaceAll(RegExp(r'\D'), '');
  if (digits.isEmpty) return null;
  return int.tryParse(digits);
}

/// `Date.prototype.toISOString`, which always carries three fractional digits
/// and a literal `Z`. Dart's `toIso8601String` drops `.000` when the millis are
/// zero, so the format the web writes cannot be taken from it directly.
String _isoWithMillis(DateTime utc) {
  final DateTime u = utc.toUtc();
  String two(int n) => n.toString().padLeft(2, '0');
  String three(int n) => n.toString().padLeft(3, '0');
  // `toISOString` pads a year in 0..9999 to four digits and writes an expanded
  // `±YYYYYY` outside it. Every ledger date is in range, so the out-of-range
  // branch is unreachable and is left loud rather than silently wrong.
  assert(
    u.year >= 0 && u.year <= 9999,
    'toISOString expanded year form is not ported: ${u.year}',
  );
  final String year = u.year.toString().padLeft(4, '0');
  return '$year-${two(u.month)}-${two(u.day)}'
      'T${two(u.hour)}:${two(u.minute)}:${two(u.second)}.${three(u.millisecond)}Z';
}

/// The web's clock, injectable so a golden can pin `updated_at`
/// (`parity/fixtures/*.json → _provenance.pinnedNow`).
String nowIso([DateTime? fixedNow]) {
  final DateTime now = (fixedNow ?? DateTime.now()).toUtc();
  return _isoWithMillis(now);
}

/// `parseFloat(s)` — V8's longest-valid-prefix number scan, which is **not**
/// `double.tryParse`.
///
/// Three differences matter to `src/lib/money.ts:7`, whose input is a user-typed
/// string that has already been through a `<input type="number">`:
/// - it stops instead of failing: `"12abc"` is `12`, `"1,250"` is `1` (the comma is
///   not a digit), `"1e"` is `1` (an exponent needs at least one digit);
/// - it accepts leading whitespace and a leading `+`, and `"0x10"` is `0` — hex is
///   not in `parseFloat`'s grammar, so it stops at the `x`;
/// - `"Infinity"` is a number here, so `toMinorUnits('Infinity')` is `Infinity` and
///   not `NaN`.
/// Everything it cannot start parsing is `NaN`, which the caller's `isNaN` guard turns
/// into `0` — the same landing as Dart's `null` would, but reached by the web's route.
double jsParseFloat(String input) {
  final RegExpMatch? match = _parseFloatPattern.firstMatch(input);
  if (match == null) return double.nan;
  final String token = match.group(0)!;
  final String unsigned = token.startsWith('-') || token.startsWith('+')
      ? token.substring(1)
      : token;
  if (unsigned == 'Infinity') {
    return token.startsWith('-') ? double.negativeInfinity : double.infinity;
  }
  // Dart's grammar wants at least one digit after the point; V8's does not.
  final String normalized = token.endsWith('.') ? '${token}0' : token;
  final double? value = double.tryParse(normalized);
  // Unreachable for a token this pattern produced, but a `null` here would be a
  // silent `0` one frame up, which is the opposite of what V8 does.
  return value ?? double.nan;
}

/// The `StringNumericLiteral` prefix `parseFloat` accepts, minus the parts of the
/// grammar it does not reach: no hex, no trailing `d`/`f`, and the exponent branch is
/// optional *including* its digits, which is why `"1e"` stops at `1`. Ordered so the
/// exponent is consumed whenever it is followed by digits — a leading
/// `\d+` alternative alone would match `"1"` out of `"1e3"`.
///
/// The leading run is ECMAScript's `WhiteSpace` plus `ZWNBSP`: Dart's `\s` is that
/// category set already, and `U+2007 FIGURE SPACE` is in it — measured, since a
/// corpus of 4,057 typed strings diverged on exactly that character when the class
/// listed the ASCII spaces by hand.
final RegExp _parseFloatPattern = RegExp(
  r'^[\s\uFEFF]*[+-]?(?:\d+(?:\.\d*)?(?:[eE][+-]?\d+)?'
  r'|\.\d+(?:[eE][+-]?\d+)?|Infinity)',
);

/// `Math.round(x)` — **round half toward +∞**, which is not Dart's `round()` and not
/// banker's rounding either.
///
/// `Math.round(-2.5)` is `-2` while `(-2.5).round()` is `-3`, and `INVENTORY.md` §5.6
/// lists this as the trap that reaches all four rounding sites in the app, so it is
/// implemented once and reused rather than written inline at each call.
///
/// The band `-0.5 ≤ x < 0` returns `-0`, not `0`: measured in V8 (`Math.round(-0.5)`
/// and `Math.round(-0.4)` are both `-0`), and `parity/fixtures/money.json` proves it
/// is load-bearing — `toMinorUnits(-0.005)` and `toMinorUnits("-0.005")` are
/// `{"__sentinel__": "-0"}`. `floor(x + 0.5)` alone loses that sign, so a zero result
/// is re-signed from a negative input.
double jsMathRound(num value) {
  final double x = value.toDouble();
  if (x.isNaN || x.isInfinite) return x;
  final double rounded = (x + 0.5).floorToDouble();
  if (rounded == 0.0 && x.isNegative) return -0.0;
  return rounded;
}

/// `Number.prototype.toFixed(digits)`.
///
/// Dart's `toStringAsFixed` was swept against Node's `toFixed` over 79,824 values
/// (the cents grid at ±200000, every negative power of two to 2^-63, eighth-place
/// ties, 20,000 random magnitudes across 21 decimal orders, and `±0`/`NaN`/`±∞` at
/// digits 0, 2 and 17) and agrees on all of them **except negative zero**, where V8
/// prints `"0.00"` and Dart prints `"-0.00"`. That is the spec, not a bug: `toFixed`
/// adds the sign only `if x < 0`, and `-0 < 0` is false, while Dart reads the sign
/// bit. So the whole algorithm is Dart's, with that one case corrected.
///
/// The tie is therefore decided by the **exact binary value**, not by the digits a
/// reader would write — and Dart's `toStringAsFixed` uses that same rule. So
/// `toMajorUnits(1.5)` formats the double nearest `0.015`, whose exact value is
/// `0.01499999999999999944…`, and prints `"0.01"`, while `toMajorUnits(2.5)` prints
/// `"0.03"` because the double nearest `0.025` sits just *above* it. `money.json`
/// pins those two plus `-0.5` → `"-0.01"` and `1234.5` → `"12.35"` as measured.
///
/// Do **not** reuse this for `toLocaleString`: [jsToLocaleStringFixed] rounds on the
/// shortest decimal instead and the two disagree on `0.015`.
String jsToFixed(num value, int digits) {
  final double x = value.toDouble();
  // `NaN`, `Infinity` and `-Infinity` print as those words on both engines.
  if (x == 0) return x.abs().toStringAsFixed(digits);
  return x.toStringAsFixed(digits);
}

/// `n.toLocaleString(tag, {minimumFractionDigits, maximumFractionDigits})` for the
/// locale in [locale]: grouping by that locale's digit runs and separator, its decimal
/// separator, its digits, and trailing zeros dropped to `minimumFractionDigits` — but
/// above all, rounding **half-expand on the shortest decimal representation**, not on
/// the exact binary value.
///
/// That rounding difference is real and reachable: `(0.015).toFixed(2)` is `"0.01"`
/// while `(0.015).toLocaleString(undefined, {min:2, max:2})` is `"0.02"`, and `1.005` is
/// `"1.00"` vs `"1.01"`. `src/lib/money.ts:61` uses the latter, so `formatMoney` rounds
/// the number the *user typed* while `toMajorUnits` rounds the number the machine
/// *holds*. Porting one as the other moves a displayed rupee by a paisa, so the two are
/// separate functions and the difference is asserted in
/// `test/domain/js_semantics_format_test.dart`.
///
/// The rounding is reimplemented here rather than taken from `intl`, but the *locale
/// metadata* is taken from it, because it is the same CLDR table ICU reads: see
/// `parity/DATA_SPEC.md` §11 D-12.
///
/// Unlike `toFixed`, this expands `1e21` to its grouped integer digits
/// (`"1,000,000,000,000,000,000,000"`), which is why it does not share [jsToFixed].
String jsToLocaleStringFixed(
  num value,
  int minDigits,
  int maxDigits,
  JsNumberLocale locale,
) {
  final double x = value.toDouble();
  // `formatMoney` guards non-finite input before it reaches the formatter
  // (`src/lib/money.ts:60`), so this branch is defensive, not reachable.
  if (x.isNaN || x.isInfinite) return jsNumberToString(x);
  // `Intl` *does* sign a negative zero (`(-0).toLocaleString(...,{min:2,max:2})` is
  // `"-0.00"`), unlike `toFixed`. `formatMoney` calls `Math.abs` first, which turns
  // `-0` into `0`, so the case is unreachable there — but this function is the twin of
  // `toLocaleString`, not of `formatMoney`, so it reproduces `toLocaleString`.
  final bool negative = x < 0 || (x == 0 && x.isNegative);
  final _ShortestDecimal decimal = _ShortestDecimal.of(x.abs());
  final List<String> parts = decimal.roundToFractionDigits(maxDigits);
  String intPart = parts[0];
  String fracPart = parts[1];
  while (fracPart.length > minDigits && fracPart.endsWith('0')) {
    fracPart = fracPart.substring(0, fracPart.length - 1);
  }
  if (fracPart.length < minDigits) {
    fracPart = fracPart.padRight(minDigits, '0');
  }
  intPart = intPart.replaceFirst(RegExp('^0+'), '');
  final String grouped = _group(intPart.isEmpty ? '0' : intPart, locale);
  final String body = fracPart.isEmpty
      ? grouped
      : '$grouped${locale.decimalSeparator}${_localeDigits(fracPart, locale)}';
  if (!negative) return body;
  return '${locale.negativePrefix}$body${locale.negativeSuffix}';
}

/// The locale's digit runs: [JsNumberLocale.primaryGroup] digits at the right, then
/// [JsNumberLocale.secondaryGroup] for every group left of it, with a short left-over
/// run — `1,234,567` for `en-US`, `12,34,567` for `en-IN`, and a `primaryGroup` of `0`
/// meaning the locale does not group at all.
String _group(String digits, JsNumberLocale locale) {
  final int primary = locale.primaryGroup;
  if (primary <= 0 || digits.length <= primary) {
    return _localeDigits(digits, locale);
  }
  final int secondary = locale.secondaryGroup <= 0
      ? primary
      : locale.secondaryGroup;
  final List<String> groups = <String>[
    digits.substring(digits.length - primary),
  ];
  int end = digits.length - primary;
  while (end > secondary) {
    groups.add(digits.substring(end - secondary, end));
    end -= secondary;
  }
  if (end > 0) groups.add(digits.substring(0, end));
  return _localeDigits(groups.reversed.join(locale.groupSeparator), locale);
}

/// ASCII digits re-spelled in the locale's number system, leaving separators alone.
String _localeDigits(String digits, JsNumberLocale locale) {
  final int zero = locale.zeroDigit.isEmpty
      ? 0x30
      : locale.zeroDigit.runes.first;
  if (zero == 0x30) return digits;
  final StringBuffer out = StringBuffer();
  for (final int rune in digits.runes) {
    out.writeCharCode(rune >= 0x30 && rune <= 0x39 ? rune - 0x30 + zero : rune);
  }
  return out.toString();
}

/// A finite non-negative double as ECMAScript's `Number::toString` would write it:
/// the **shortest digit sequence that round-trips**, plus where the decimal point sits
/// in it. Dart's `double.toString` produces the same digit sequence (both are
/// shortest-round-trip; only the choice of exponential notation differs, and this reads
/// either), so it is parsed rather than recomputed.
class _ShortestDecimal {
  _ShortestDecimal._(this.digits, this.pointPos);

  final String digits;

  /// Digits of [digits] before the decimal point; `0` means the value is below 1 and
  /// a negative count is the leading zeros after the point.
  final int pointPos;

  static _ShortestDecimal of(double magnitude) {
    if (magnitude == 0) return _ShortestDecimal._('0', 1);
    final String text = magnitude.toString();
    final int e = text.indexOf('e');
    final String mantissa = e < 0 ? text : text.substring(0, e);
    final int exp = e < 0 ? 0 : int.parse(text.substring(e + 1));
    final int dot = mantissa.indexOf('.');
    final String intDigits = dot < 0 ? mantissa : mantissa.substring(0, dot);
    final String fracDigits = dot < 0 ? '' : mantissa.substring(dot + 1);
    final String all = intDigits + fracDigits;
    final int firstSignificant = all.indexOf(RegExp('[1-9]'));
    // `pointPos` is measured from the first significant digit, so the leading zeros of
    // `0.015` belong to the position rather than to the digits. Removing trailing zeros
    // shortens the digits without moving the point: `1000000.0` is digits `1` at
    // position `7`, which the caller expands back with zeros.
    final String stripped = all.substring(firstSignificant);
    final int point = intDigits.length - firstSignificant + exp;
    final String trimmed = stripped.replaceFirst(RegExp(r'0+$'), '');
    return _ShortestDecimal._(trimmed, point);
  }

  /// `[integerDigits, fractionDigits]` after rounding half-expand to [fraction] places,
  /// where a dropped digit of `5` or more always rounds up — with the remaining dropped
  /// digits treated as the zeros `Intl` assumes, which is what makes `0.015` an `0.02`.
  List<String> roundToFractionDigits(int fraction) {
    String whole = digits;
    int point = pointPos;
    final int keep = point + fraction;
    if (keep < whole.length) {
      final int head = keep > 0 ? keep : 0;
      final String kept = whole.substring(0, head);
      final int firstDropped = keep >= 0
          ? whole.codeUnitAt(keep) - 0x30
          // The dropped run starts before the first digit: at most one of those
          // positions is the digit itself, and it is the first dropped one.
          : (keep == 0 ? whole.codeUnitAt(0) - 0x30 : 0);
      if (firstDropped >= 5) {
        final String incremented = _incrementDecimalString(kept);
        point += incremented.length - kept.length;
        whole = incremented;
      } else {
        whole = kept;
      }
    } else if (keep > whole.length) {
      whole = whole.padRight(keep, '0');
    }
    if (point <= 0) {
      // Below 1: the integer part is `0` and `-point` zeros lead the fraction. A
      // fraction longer than `fraction` digits only happens when everything below the
      // rounding position was dropped as zeros, so the excess is zeros and trimming is
      // the same value.
      final String frac = ('0' * -point + whole);
      return <String>[
        '0',
        frac.length > fraction ? frac.substring(0, fraction) : frac,
      ];
    }
    if (whole.length < point) whole = whole.padRight(point, '0');
    final String intPart = whole.substring(0, point);
    final String fracPart = whole.substring(point);
    return <String>[
      intPart,
      fracPart.length > fraction ? fracPart.substring(0, fraction) : fracPart,
    ];
  }
}

/// `+1` on a decimal digit string, growing the length on an all-nines run so the
/// caller can move the decimal point with it.
String _incrementDecimalString(String digits) {
  if (digits.isEmpty) return '1';
  final List<int> codeUnits = List<int>.of(digits.codeUnits);
  int i = codeUnits.length - 1;
  while (i >= 0 && codeUnits[i] == 0x39) {
    codeUnits[i] = 0x30;
    i--;
  }
  if (i < 0) return '1${String.fromCharCodes(codeUnits)}';
  codeUnits[i] = codeUnits[i] + 1;
  return String.fromCharCodes(codeUnits);
}
