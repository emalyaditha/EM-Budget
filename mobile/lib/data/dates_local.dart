/// The **local** date regime of `src/utils.ts:22-67`.
///
/// `INVENTORY.md` §5.1 records that this app keeps two incompatible ways of reading a
/// ledger day, deliberately: `src/lib/creditCards.ts` compares `YYYY-MM-DD` as pure UTC
/// strings, while `utils.ts` builds *local* midnights and explicitly refuses
/// `Date.parse` for a bare date. This file is the second of the two. It is not
/// interchangeable with `jsDateToEpochMs` (`lib/data/js_semantics.dart`), which reads a
/// bare date as UTC midnight because that is what `new Date(string)` does; the unit here
/// reads it as local midnight because that is what `new Date(y, m - 1, d)` does.
///
/// Dart's `DateTime` constructor normalises an out-of-range month or day into a later
/// date, exactly as `new Date(y, m, d)` does (`2026-02-31` becomes 3 March on both
/// sides), so no clamping is needed here.
library;

import 'dart:math' as math;

import 'js_semantics.dart';

/// An alert is surfaced for its own day and the one before it, and for nothing older
/// (`ALERT_LOOKBACK_DAYS`, `src/utils.ts:34`).
const int alertLookbackDays = 1;

const int _msPerDay = 86400000;

/// `localDayKey` (`:22-24`). Local, zero-padded `YYYY-MM-DD`.
///
/// The comment on the web side is the reason it exists: `toISOString().split('T')[0]`
/// returns the UTC date, which is *yesterday* for a UTC+5:30 reader in the morning, and
/// that misdated entries into the previous month's totals.
String localDayKey(DateTime d) {
  final String month = d.month.toString().padLeft(2, '0');
  final String day = d.day.toString().padLeft(2, '0');
  return '${d.year}-$month-$day';
}

/// `todayLocal` (`:26-28`). [nowMs] is the seam the tests and the dismissed-alert
/// pruning use; it is an epoch, matching `Date.now()`.
String todayLocal({int? nowMs}) {
  return localDayKey(
    DateTime.fromMillisecondsSinceEpoch(
      nowMs ?? DateTime.now().millisecondsSinceEpoch,
    ),
  );
}

/// `dayStartMs` (`:39-46`), private on the web.
///
/// A bare `YYYY-MM-DD` prefix is taken apart and rebuilt as **local** midnight — the
/// web does this on purpose, because `new Date('2026-10-04')` is UTC midnight and would
/// read as the previous evening for a UTC+5:30 reader. Anything else goes through
/// `Date.parse`, and an unparseable value is `null` (JavaScript's `NaN`).
int? dayStartMs(String value) {
  final String trimmed = value.trim();
  final RegExpMatch? parts = RegExp(r'^(\d{4})-(\d{2})-(\d{2})')
      .firstMatch(trimmed);
  if (parts != null) {
    // `new Date(Y, M - 1, D)` — the web's `- 1` is JavaScript's 0-indexed month, which
    // Dart's 1-indexed month already accounts for. Writing `month - 1` here would put
    // every ledger day one month early, and `isAlertDayRecent("2026-10-04")` would read
    // 4 September. `INVENTORY.md` §5.1 names exactly this trap.
    return DateTime(
      int.parse(parts.group(1)!),
      int.parse(parts.group(2)!),
      int.parse(parts.group(3)!),
    ).millisecondsSinceEpoch;
  }
  final int? instant = jsDateToEpochMs(trimmed);
  if (instant == null) return null;
  return startOfLocalDay(instant);
}

/// `new Date(ms).setHours(0, 0, 0, 0)` — the local midnight that starts [epochMs]'s day.
int startOfLocalDay(int epochMs) {
  final DateTime d = DateTime.fromMillisecondsSinceEpoch(epochMs);
  return DateTime(d.year, d.month, d.day).millisecondsSinceEpoch;
}

/// `isAlertDayRecent` (`:61-67`): today or yesterday, on the device.
///
/// The `!iso` guard treats the empty string as absent, as JavaScript does, and a day
/// that cannot be parsed is not recent rather than an error. The comparison is in raw
/// milliseconds, so a DST day of 23 or 25 hours behaves as it does on the web.
bool isAlertDayRecent(String? iso, {int? nowMs}) {
  if (iso == null || iso.isEmpty) return false;
  final int? day = dayStartMs(iso);
  if (day == null) return false;
  final int today = startOfLocalDay(nowMs ?? _nowMs());
  return day <= today && today - day <= alertLookbackDays * _msPerDay;
}

/// `isInCurrentMonth` (`:51-58`): same calendar month **and** year as the device clock.
///
/// The web's comment is the reason this exists: the code it replaced tested
/// `date.includes('-10-')`, which matched October of every year on record and inflated
/// every monthly total.
bool isInCurrentMonth(String? iso, {int? nowMs}) {
  if (iso == null || iso.isEmpty) return false;
  final int? day = dayStartMs(iso);
  if (day == null) return false;
  final DateTime now = DateTime.fromMillisecondsSinceEpoch(nowMs ?? _nowMs());
  final DateTime then = DateTime.fromMillisecondsSinceEpoch(day);
  return then.year == now.year && then.month == now.month;
}

/// `addMonthsClamped` (`:76-83`) — advance a ledger day by whole months, clamped to the
/// last day of the target month.
///
/// **This is B-02 and it stays broken on purpose.** The clamp is one-way: a schedule due
/// on the 31st becomes 28 February and then advances to 28 March, because nothing in the
/// data model remembers the original anniversary day. `parity/BUGS_FOUND.md` records it;
/// `parity/fixtures/dates-local.json` measures it. Fixing it here would move due dates
/// the web does not move, which is a business-logic change.
///
/// An unparseable day returns the input unchanged (`if (start === null) return iso`),
/// including a value with surrounding whitespace — the web does not trim on that path.
String addMonthsClamped(String iso, int months) {
  final int? start = dayStartMs(iso);
  if (start == null) return iso;
  final DateTime src = DateTime.fromMillisecondsSinceEpoch(start);
  // `new Date(y, m + months, 1)`: JavaScript's `getMonth()` is 0-indexed and its
  // constructor takes a 0-indexed month, so the round trip is a no-op for Dart, whose
  // `DateTime` is 1-indexed on both ends.
  final DateTime target = DateTime(src.year, src.month + months, 1);
  final int lastDayOfTarget = DateTime(target.year, target.month + 1, 0).day;
  return localDayKey(
    DateTime(target.year, target.month, math.min(src.day, lastDayOfTarget)),
  );
}

int _nowMs() => DateTime.now().millisecondsSinceEpoch;
