/// The two casing transforms `src/supabase.ts` applies when it matches a column
/// name to a state property, ported character-for-character.
library;

/// `col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())`
/// (`src/supabase.ts:420`, and the same expression at `:875`).
///
/// Only an underscore followed by a **lowercase** letter is rewritten, so
/// `is_CANCELED` and `a__b` survive partially, and a trailing underscore is left
/// alone. A general "snake to camel" helper would differ on exactly those inputs.
String toCamelCase(String column) {
  final StringBuffer out = StringBuffer();
  for (int i = 0; i < column.length; i++) {
    final int code = column.codeUnitAt(i);
    if (code == 0x5F /* _ */ &&
        i + 1 < column.length &&
        column.codeUnitAt(i + 1) >= 0x61 /* a */ &&
        column.codeUnitAt(i + 1) <= 0x7A /* z */ ) {
      out.writeCharCode(column.codeUnitAt(i + 1) - 0x20);
      i++;
    } else {
      out.write(column[i]);
    }
  }
  return out.toString();
}

/// `col.replace(/([A-Z])/g, '_$1').toLowerCase()` (`src/supabase.ts:421`).
///
/// Applied to an already-snake column this is the identity, which is why the
/// web's second lookup usually finds nothing; it is ported anyway because it is
/// what the algorithm does, not what it appears to mean.
String toSnakeCase(String column) {
  final StringBuffer out = StringBuffer();
  for (int i = 0; i < column.length; i++) {
    final String ch = column[i];
    if (ch.codeUnitAt(0) >= 0x41 /* A */ && ch.codeUnitAt(0) <= 0x5A /* Z */ ) {
      out.write('_$ch');
    } else {
      out.write(ch);
    }
  }
  return out.toString().toLowerCase();
}
