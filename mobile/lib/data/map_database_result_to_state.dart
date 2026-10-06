import 'casing.dart';
import 'js_semantics.dart';

/// The eleven fields `mapDatabaseResultToState` coerces to a number
/// (`src/supabase.ts:860-872`), in the web's declaration order and with the
/// web's camelCase spelling — the set is tested against the camel form of the
/// incoming key, so `total_amount` is coerced because it camelizes to
/// `totalAmount`.
const Set<String> _numericFields = <String>{
  'totalAmount',
  'remainingAmount',
  'amount',
  'balance',
  'currentBalance',
  'limit',
  'charge',
  'transferCharge',
  'lockedAmount',
  'apr',
  'minPayment',
};

/// `mapDatabaseResultToState` (`src/supabase.ts:858-909`) — the read contract.
///
/// Every key is renamed to camelCase, so a row's `user_email` becomes
/// `userEmail` in state; nothing in this function preserves the snake form
/// except the two timestamp aliases at the end. That is load-bearing: the write
/// path later looks a column up by exact name first and only then by casing
/// (`:414`), and the round trip through this pair is what keeps a pulled row and
/// a pushed row agreeing.
///
/// Postgres `numeric` can arrive as a **string** over PostgREST, which is why the
/// coercion exists. The web's rule is `NaN`-or-null → `0`, so a NULL `limit`
/// becomes the number `0` rather than staying absent — and a real `0` amount and
/// a missing one are indistinguishable in the result. Ported as-is; it is a
/// data-shape fact, not a defect to silently improve.
Map<String, Object?> mapDatabaseResultToState(Map<String, Object?> item) {
  final Map<String, Object?> result = <String, Object?>{};

  for (final String key in item.keys) {
    final String camelKey = toCamelCase(key);
    Object? val = item[key];
    if (_numericFields.contains(camelKey)) {
      if (val is String) {
        final num? parsed = _jsNumber(val);
        val = parsed ?? 0;
      } else if (val is num) {
        if (val is double && val.isNaN) val = 0;
      } else {
        // `val === null || val === undefined` (`:884`). Anything else the web's
        // `typeof` does not recognise — a bool, a list — is left untouched.
        val ??= 0;
      }
    }
    result[camelKey] = val;
  }

  // Alias guards (`:892-900`). `isCancelled` is the common typo the web has
  // carried forward; `isFrozen` is defaulted rather than left absent, which is
  // why a row with no `is_frozen` reads back as `false` and pushes back as
  // `false`.
  if (result.containsKey('isCancelled') && !result.containsKey('isCanceled')) {
    result['isCanceled'] = result['isCancelled'];
  }
  if (!result.containsKey('isFrozen')) {
    result['isFrozen'] = false;
  } else {
    result['isFrozen'] = jsTruthy(result['isFrozen']);
  }

  // Both spellings of the timestamp are written (`:902-906`) so that whichever
  // one a later reader checks, it finds the row's own stamp instead of a fresh
  // one from the write path.
  final Object? timestamp = jsFirstTruthy(<Object?>[
    item['updated_at'],
    item['updatedAt'],
    item['created_at'],
    item['createdAt'],
  ]);
  if (timestamp != null) {
    result['updated_at'] = timestamp;
    result['updatedAt'] = timestamp;
  }

  return result;
}

/// `Number(val)` for the decimal strings Postgres emits. An unparseable string
/// is `NaN` in JavaScript and is turned into `0` by the caller, so `null` here
/// means "JavaScript would have said NaN".
///
/// Whole numbers come back as `int`, because JavaScript's single number type
/// serialises `1200` as `1200` while Dart's `jsonEncode` writes an integral
/// `double` as `1200.0`. The snapshot in `ledger_states.state` is compared as
/// text, so the difference would show up as drift that is not there.
num? _jsNumber(String value) {
  final String trimmed = value.trim();
  if (trimmed.isEmpty) return 0; // `Number('')` is 0, not NaN.
  final double? parsed = double.tryParse(trimmed);
  if (parsed == null) return null;
  return parsed == parsed.roundToDouble() && parsed.abs() < 4503599627370496
      ? parsed.round()
      : parsed;
}
