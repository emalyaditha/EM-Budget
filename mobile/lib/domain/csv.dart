import '../data/js_semantics.dart';

/// Port of the pure half of `src/lib/download.ts` at the `pre-flutter` tag, specified by
/// `parity/LOGIC_SPEC.md` §10 and pinned by `parity/fixtures/csv.json` (15 cases).
///
/// `downloadBlob` is **not** here. It builds a `Blob`, hangs an `<a>` off `document.body`,
/// clicks it and revokes the URL — none of which exists on a phone — and `INVENTORY.md`
/// §13h D29 rules that this unit is ported as content only, with the save-or-share step
/// going to Phase 7 and the difference being recorded in `UI_SPEC.md` as a deviation. A
/// fixture could not tell the two apart anyway: the bytes are the same on both platforms.

/// `/^[=+\-@\t\r]/` — the formula-injection guard, tested on the **first character only**.
final RegExp _formulaPrefix = RegExp(r'^[=+\-@\t\r]');

/// `sanitizeCsvCell`.
///
/// The two branches are not interchangeable and the order is the whole behaviour: a cell
/// that starts with a formula character is prefixed with `'` and returned **immediately**,
/// so the quotes inside it are never doubled — `=a"b` comes out as `'=a"b`, while `say
/// "hi"` comes out as `say ""hi""`. A `1+1` is left alone, because only the first
/// character is looked at.
///
/// A negative number is treated as a formula (`-500` → `'-500`). That is the guard being
/// blunt about a value the app exports constantly, and it stays blunt.
String _sanitizeCsvCell(Object? value) {
  final String str = jsToString(value);
  if (_formulaPrefix.hasMatch(str)) return "'$str";
  return str.replaceAll('"', '""');
}

/// `escapeCsvRow` — every cell quoted, joined with a comma, **no trailing newline**. The
/// caller joins rows.
///
/// The cell type is `Object?` rather than `String | num` because that is what the web's
/// own runtime accepts despite its declared union: `String(value)` prints `null` and
/// `undefined`, and `csv.json` measures both. Dart cannot tell those two apart — an absent
/// value is `null` here and `undefined` there (`DATA_SPEC.md` §1) — so this renders a Dart
/// `null` as `"null"`, which is the case a nullable model field actually produces. The
/// `"undefined"` half of the measured case has no Dart producer and the replay says so.
String escapeCsvRow(List<Object?> cells) =>
    cells.map((Object? c) => '"${_sanitizeCsvCell(c)}"').join(',');
