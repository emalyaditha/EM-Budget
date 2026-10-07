import 'dart:io';

/// Locating the web source is the whole point of the parity tests in `test/data`:
/// they compare the Dart port against the file it was generated from, on the same
/// checkout, instead of against a hand-copied expectation that can drift with it.
///
/// `flutter test` runs with the package root as CWD, so the repo is one level up.
/// The walk-up fallback keeps the tests working when they are invoked from
/// elsewhere (an IDE runner, a script in `parity/`).
String repoRoot() {
  Directory dir = Directory.current;
  for (int i = 0; i < 6; i++) {
    if (File(
      '${dir.path}${Platform.pathSeparator}src${Platform.pathSeparator}supabase.ts',
    ).existsSync()) {
      return dir.path;
    }
    final Directory parent = dir.parent;
    if (parent.path == dir.path) break;
    dir = parent;
  }
  throw StateError(
    'Could not locate the web source above ${Directory.current.path}',
  );
}

String webSource(String relativePath) {
  final File file = File('${repoRoot()}${Platform.pathSeparator}$relativePath');
  if (!file.existsSync()) throw StateError('Missing web source: ${file.path}');
  return file.readAsStringSync();
}

/// The declared field names of `interface X { … }` (`src/types.ts`), in source
/// order, with the `?` and the type text stripped.
///
/// `DebtPayment` and `UserProfile` are declared without `export`, so the keyword
/// is optional here — matching only exported interfaces would silently throw on a
/// real type instead of checking it.
List<String> parseInterfaceFields(String typesTs, String interfaceName) {
  final RegExp block = RegExp(
    '(?:export )?interface $interfaceName \\{([\\s\\S]*?)\\n\\}',
  );
  final RegExpMatch? m = block.firstMatch(typesTs);
  if (m == null) {
    throw StateError('interface $interfaceName not found in src/types.ts');
  }
  final List<String> fields = <String>[];
  for (final String raw in m.group(1)!.split('\n')) {
    final String line = raw.trim();
    if (line.isEmpty ||
        line.startsWith('//') ||
        line.startsWith('/*') ||
        line.startsWith('*')) {
      continue;
    }
    final RegExpMatch? field = RegExp(r'^([A-Za-z_][A-Za-z0-9_]*)\??\s*:')
        .firstMatch(line);
    if (field != null) fields.add(field.group(1)!);
  }
  if (fields.isEmpty) {
    throw StateError('interface $interfaceName parsed no fields');
  }
  return fields;
}

/// A string-literal union: `export type CategoryIncome = 'A' | 'B';`
/// (`src/types.ts:1-14`). Returns the members in declaration order.
///
/// The web's category lists are hand-synced across four places
/// (`INVENTORY.md` §5.11), so the union is the only place all of them are
/// reconcilable against; a Dart `enum` would have been a fifth copy.
List<String> parseStringUnion(String typesTs, String typeName) {
  final RegExp union = RegExp('export type $typeName =([\\s\\S]*?);');
  final RegExpMatch? m = union.firstMatch(typesTs);
  if (m == null) throw StateError('union $typeName not found in src/types.ts');
  final List<String> members = RegExp(r"'([^']*)'")
      .allMatches(m.group(1)!)
      .map((RegExpMatch q) => q.group(1)!)
      .toList();
  if (members.isEmpty) throw StateError('union $typeName parsed empty');
  return members;
}

/// An inline string-literal union on an interface field:
/// `export interface Transaction { type: 'income' | 'expense'; … }`.
///
/// The web declares several of these inside the interface rather than as a named
/// type, so the field text is what has to be read.
List<String> parseFieldUnion(
  String typesTs,
  String interfaceName,
  String fieldName,
) {
  final RegExp block = RegExp(
    'export interface $interfaceName \\{([\\s\\S]*?)\\n\\}',
  );
  final RegExpMatch? iface = block.firstMatch(typesTs);
  if (iface == null) {
    throw StateError('interface $interfaceName not found in src/types.ts');
  }
  final RegExp field = RegExp("\\b$fieldName\\??\\s*:\\s*([^;]*);");
  final RegExpMatch? m = field.firstMatch(iface.group(1)!);
  if (m == null) {
    throw StateError('field $fieldName not found on $interfaceName');
  }
  final List<String> members = RegExp(r"'([^']*)'")
      .allMatches(m.group(1)!)
      .map((RegExpMatch q) => q.group(1)!)
      .toList();
  if (members.isEmpty) {
    throw StateError('$interfaceName.$fieldName is not a string union');
  }
  return members;
}

/// The `mappingRules` object literal passed to `mapObjectToColumns` by one
/// fan-out block: `const recordsCards = (state.cards || []).map((card) => { …
/// mapObjectToColumns(card, cardsCols, email, { … }) …`.
///
/// Returns the rule's top-level keys in source order. The keys are what the third
/// pass of `mapObjectToColumns` writes (`src/supabase.ts:399-404`), so comparing
/// them against what the Dart builder produces is a drift test on the write
/// contract: a rule added on the web shows up here as a key the phone never
/// writes.
List<String> parseMappingRuleKeys(String supabaseTs, String recordsVar) {
  final int at = supabaseTs.indexOf('const $recordsVar =');
  if (at < 0) throw StateError('$recordsVar not found in src/supabase.ts');
  final int call = supabaseTs.indexOf('mapObjectToColumns(', at);
  if (call < 0) {
    throw StateError('$recordsVar does not call mapObjectToColumns');
  }
  // The rules literal is the last `{…}` argument of that call.
  final int rulesOpen = supabaseTs.indexOf(
    '{',
    supabaseTs.indexOf('email,', call),
  );
  if (rulesOpen < 0) throw StateError('no rules literal after $recordsVar');
  int depth = 0;
  int end = -1;
  for (int i = rulesOpen; i < supabaseTs.length; i++) {
    final int code = supabaseTs.codeUnitAt(i);
    if (code == 0x7B /* { */ ) {
      depth++;
    } else if (code == 0x7D /* } */ ) {
      depth--;
      if (depth == 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw StateError('unbalanced rules literal after $recordsVar');
  final String body = supabaseTs.substring(rulesOpen + 1, end);

  final List<String> keys = <String>[];
  depth = 0;
  for (final String line in body.split('\n')) {
    final String trimmed = line.trim();
    final RegExp key = RegExp(r'^([A-Za-z_][A-Za-z0-9_]*)\s*:');
    if (depth == 0) {
      final RegExpMatch? m = key.firstMatch(trimmed);
      if (m != null) keys.add(m.group(1)!);
    }
    depth += '{'.allMatches(line).length - '}'.allMatches(line).length;
    depth += '['.allMatches(line).length - ']'.allMatches(line).length;
  }
  if (keys.isEmpty) throw StateError('parsed no rule keys for $recordsVar');
  return keys;
}

/// `const SCHEMA_COLUMNS: { [tableName: string]: string[] } = { … };`
/// (`src/supabase.ts:197-331`) parsed out of the web source.
///
/// Deliberately dumb: it takes the object literal between the first `=` and the
/// terminating `};`, then reads `key: [ 'a', 'b' ]` entries. Anything it cannot
/// read makes the test throw rather than silently compare nothing, which is the
/// failure mode that would let a real drift pass.
Map<String, List<String>> parseWebSchemaColumns(String supabaseTs) {
  final int start = supabaseTs.indexOf('const SCHEMA_COLUMNS');
  if (start < 0) throw StateError('SCHEMA_COLUMNS not found in the web source');
  final int open = supabaseTs.indexOf('{', supabaseTs.indexOf('=', start));
  if (open < 0) throw StateError('SCHEMA_COLUMNS literal has no opening brace');
  final int close = supabaseTs.indexOf('};', open);
  if (close < 0) throw StateError('SCHEMA_COLUMNS literal is unterminated');
  final String body = supabaseTs.substring(open + 1, close);

  final RegExp entry = RegExp(
    r"""([a-z_][a-z0-9_]*)\s*:\s*\[([^\]]*)\]""",
    multiLine: true,
  );
  final Map<String, List<String>> out = <String, List<String>>{};
  for (final RegExpMatch m in entry.allMatches(body)) {
    final String table = m.group(1)!;
    final List<String> columns = RegExp(r"'([^']*)'")
        .allMatches(m.group(2)!)
        .map((RegExpMatch q) => q.group(1)!)
        .toList();
    if (out.containsKey(table)) {
      throw StateError('Duplicate table in SCHEMA_COLUMNS: $table');
    }
    out[table] = columns;
  }
  if (out.isEmpty) {
    throw StateError(
      'Parsed zero tables out of SCHEMA_COLUMNS — the parser is stale',
    );
  }
  return out;
}
