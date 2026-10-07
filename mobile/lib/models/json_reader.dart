/// Map readers shared by every typed model in `lib/models/`.
///
/// They exist so that a model's `fromJson` says what the web does when it reads
/// the same property, and nothing more. Two rules are load-bearing:
///
/// - **absent ≡ `undefined`.** A key missing from the map is `null` here, which is
///   how `lib/data/map_object_to_columns.dart` documents the same idea for the
///   write path.
/// - **`num`, not `double`.** The app's state holds JavaScript numbers and the
///   database's `numeric` can arrive as a string; `INVENTORY.md` §5.8 records that
///   cents conversion happens later, at `toMinorUnits`, so a model must not round
///   on the way in. Whole numbers stay `int` so that `jsonEncode` writes `1200`
///   where `JSON.stringify` writes `1200`.
library;

/// `Object?` read with no expectation: whatever the web would have held.
Object? readAny(Map<String, Object?> json, String key) => json[key];

String? readStringOpt(Map<String, Object?> json, String key) {
  final Object? value = json[key];
  return value is String ? value : null;
}

/// A required string. The web does not check these — `tx.title.toLowerCase()`
/// throws on a row with no title, which `parity/fixtures/transaction-service.json`
/// records as a case. A typed model cannot throw the same way, so the empty
/// string is the ported stand-in and the difference is listed in
/// `parity/DATA_SPEC.md`.
String readString(Map<String, Object?> json, String key) {
  final Object? value = json[key];
  return value is String ? value : (value == null ? '' : '$value');
}

num? readNumOpt(Map<String, Object?> json, String key) {
  final Object? value = json[key];
  if (value is num) return value;
  if (value is String) {
    final double? parsed = double.tryParse(value.trim());
    if (parsed == null) return null;
    return parsed == parsed.roundToDouble() ? parsed.round() : parsed;
  }
  return null;
}

num readNum(Map<String, Object?> json, String key, {num fallback = 0}) {
  return readNumOpt(json, key) ?? fallback;
}

bool? readBoolOpt(Map<String, Object?> json, String key) {
  final Object? value = json[key];
  if (value is bool) return value;
  if (value == null) return null;
  // `Boolean(x)` in the web's card and freeze guards: any non-empty string and
  // any non-zero number is true.
  if (value is num) return value != 0;
  if (value is String) return value.isNotEmpty;
  return true;
}

bool readBool(Map<String, Object?> json, String key, {bool fallback = false}) {
  return readBoolOpt(json, key) ?? fallback;
}

/// `updated_at || updatedAt || created_at || createdAt` (`src/supabase.ts:365`,
/// repeated verbatim at `:902`). A non-string stamp is read as absent, because
/// every consumer of the result is a string-typed date field.
String? readTimestamp(Map<String, Object?> json) {
  return readStringOpt(json, 'updated_at') ??
      readStringOpt(json, 'updatedAt') ??
      readStringOpt(json, 'created_at') ??
      readStringOpt(json, 'createdAt');
}

/// `updated_at || updatedAt`, the shorter form the write path stamps.
String? readUpdatedAt(Map<String, Object?> json) {
  return readStringOpt(json, 'updated_at') ?? readStringOpt(json, 'updatedAt');
}

/// `created_at || createdAt`.
String? readCreatedAt(Map<String, Object?> json) {
  return readStringOpt(json, 'created_at') ?? readStringOpt(json, 'createdAt');
}

/// A list of plain maps — used where the web stores an inline structure rather
/// than an entity (`Budget.subBreakdown`, `Charge` inside a card).
List<Map<String, Object?>> readMapList(Map<String, Object?> json, String key) {
  final Object? value = json[key];
  if (value is! List) return const <Map<String, Object?>>[];
  return value.whereType<Map<String, Object?>>().toList();
}

/// A list whose elements are themselves state objects, decoded by the element
/// model. A non-list (or absent key) yields the empty list, matching every
/// `state.x || []` guard in the web's sync path.
List<T> readList<T>(
  Map<String, Object?> json,
  String key,
  T Function(Map<String, Object?> row) decode,
) {
  final Object? value = json[key];
  if (value is! List) return <T>[];
  return value
      .whereType<Map<String, Object?>>()
      .map(decode)
      .toList(growable: false);
}
