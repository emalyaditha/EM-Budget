import 'casing.dart';
import 'js_semantics.dart';

/// `mapObjectToColumns` (`src/supabase.ts:346-431`) — the write contract between
/// the app's state objects and the relational tables.
///
/// **Representation convention, used by every port in `lib/data/`:** these maps
/// model JavaScript objects, so an *absent key* means `undefined` and a key
/// present with value `null` means `null`. The distinction is not pedantry — the
/// function decides a column's fate on it. A mapping rule that yields `undefined`
/// leaves the column unfilled and the casing pass at `:407-428` can still fill it,
/// while a rule that yields `null` occupies the column and blocks that pass
/// (`:411` tests `!== undefined`, which `null` passes).
///
/// The order of the four passes is the algorithm and must not be tidied:
/// 1. identity (`user_email`), 2. `updated_at` with a four-step timestamp hunt and a
/// wall-clock fallback, 3. the explicit mapping rules, 4. a fill-by-casing pass over
/// the allowed columns that skips anything already set.
Map<String, Object?> mapObjectToColumns({
  required Map<String, Object?> item,
  required List<String> columns,
  required String email,
  required Map<String, Object?> mappingRules,

  /// `new Date().toISOString()` at `:393`. Injectable because a golden has to pin
  /// it (`parity/fixtures/* → _provenance.pinnedNow`); production callers pass
  /// nothing and get the wall clock, exactly as the web does.
  String? Function()? now,
}) {
  final Map<String, Object?> result = <String, Object?>{};

  // 1. Identity binding (`:356-360`).
  if (columns.contains('user_email')) {
    result['user_email'] = email;
  } else if (columns.contains('userEmail')) {
    result['userEmail'] = email;
  }

  // 2. Timestamp marker (`:362-396`). The web's comment is the reason the
  // existing value wins: a re-push must not move `updated_at` forward.
  final String? found = _existingTimestamp(item);
  // The `||` on `:393` is a truthiness test, so a hunt that returned `''` (an
  // empty `date` reaches the caller unfiltered) still falls back to the clock.
  final String? existingTimestamp = (found != null && jsTruthy(found))
      ? found
      : null;
  if (columns.contains('updated_at')) {
    result['updated_at'] = existingTimestamp ?? (now ?? _defaultNow)();
  } else if (columns.contains('updatedAt')) {
    result['updatedAt'] = existingTimestamp ?? (now ?? _defaultNow)();
  }

  // 3. Explicit mapping overrides (`:399-404`). A rule naming a column the
  // allow-list does not have is dropped here — this single line is B-20.
  for (final MapEntry<String, Object?> entry in mappingRules.entries) {
    if (columns.contains(entry.key)) {
      result[entry.key] = entry.value;
    }
  }

  // 4. Property fill by exact name, then camel, then snake (`:407-428`).
  for (final String col in columns) {
    if (col == 'user_email' ||
        col == 'userEmail' ||
        col == 'updated_at' ||
        col == 'updatedAt') {
      continue;
    }
    if (result.containsKey(col)) {
      continue;
    }
    if (item.containsKey(col)) {
      result[col] = item[col];
      continue;
    }
    final String camel = toCamelCase(col);
    final String snake = toSnakeCase(col);
    if (item.containsKey(camel)) {
      result[col] = item[camel];
    } else if (item.containsKey(snake)) {
      result[col] = item[snake];
    }
  }

  return result;
}

String _defaultNow() => nowIso();

/// `getExistingTs` (`src/supabase.ts:363-389`), including its three escape
/// hatches. Note that `date` is read **without** a truthiness gate, so an empty
/// string returns an empty string here and only becomes the wall clock at the
/// `||` on `:393`.
String? _existingTimestamp(Map<String, Object?> obj) {
  final Object? ts = jsFirstTruthy(<Object?>[
    obj['updated_at'],
    obj['updatedAt'],
    obj['created_at'],
    obj['createdAt'],
  ]);
  if (ts is String && ts.isNotEmpty) return ts;
  if (ts is num) {
    final String? iso = jsDateToIso(ts);
    if (iso != null) return iso;
  }

  final Object? dateVal = obj['date'];
  if (dateVal is String || dateVal is num) {
    final String? iso = jsDateToIso(dateVal);
    if (iso != null) return iso;
    if (dateVal is String) return dateVal;
  }

  final Object? dateGiven = obj['dateGiven'];
  if (dateGiven is String || dateGiven is num) {
    final String? iso = jsDateToIso(dateGiven);
    if (iso != null) return iso;
    if (dateGiven is String) return dateGiven;
  }

  return null;
}
