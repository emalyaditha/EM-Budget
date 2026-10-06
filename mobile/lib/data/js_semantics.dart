/// JavaScript value semantics the web's sync path depends on, made explicit.
///
/// The port rule for Phase 3 is that a Dart value must mean what the web's value
/// meant, not what Dart would naturally infer. Three places in `src/supabase.ts`
/// decide a column's fate on JS truthiness (`:365`, `:393`, `:414`, `:902`), and
/// JS treats `0`, `''` and `NaN` as falsy while Dart treats them as ordinary
/// values. A naive `??` chain is therefore not a port.
library;

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
  // `1e21` and above (and their negatives) go exponential on both sides, so the
  // integral fix-up is limited to the range JavaScript writes in plain decimal.
  if (d == d.roundToDouble() && d.abs() < 1e21) {
    // `-0` prints as `0`, as in JavaScript.
    return d.round().toInt().toString();
  }
  return d.toString();
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
