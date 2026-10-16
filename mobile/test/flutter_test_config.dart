import 'dart:async';
import 'dart:convert';

import 'package:flutter/services.dart' show FontLoader, rootBundle;
import 'package:flutter_test/flutter_test.dart';

/// Item 10 — the reason this file exists.
///
/// `flutter test` does not load the faces an app declares in `pubspec.yaml`:
/// every family name resolves to the harness's test font, whose advance is
/// exactly 1em per glyph. Measured before this loader ran, `'Inter'`,
/// `'Plus Jakarta Sans'`, `'JetBrains Mono'` and a family that does not exist
/// all returned the same width for `'0123456789'` at 38px — 380.0 — because
/// none of them had been read. So a suite that measures text would have been
/// measuring the harness, while the app shipped something else.
///
/// The set to load is read from `FontManifest.json`, which the build generates
/// from the `fonts:` section, rather than from a second list here: a hand-copied
/// list is how a harness ends up testing a font the app does not use.
///
/// `MaterialIcons` is skipped because it is not a design-system face and its
/// bundle entry carries no `asset` key the way the family entries do.
Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  // `rootBundle` is a ServicesBinding accessor, and testExecutable runs before
  // any test's binding is constructed.
  TestWidgetsFlutterBinding.ensureInitialized();
  final List<Object?> manifest = jsonDecode(
    utf8.decode(
      (await rootBundle.load('FontManifest.json')).buffer.asUint8List(),
    ),
  ) as List<Object?>;
  for (final Object? rawFamily in manifest) {
    final Map<String, Object?> family = rawFamily! as Map<String, Object?>;
    final String name = family['family']! as String;
    if (name == 'MaterialIcons') continue;
    final List<Object?> assets = family['fonts']! as List<Object?>;
    if (assets.isEmpty) throw StateError('$name declares no font asset');
    final FontLoader loader = FontLoader(name);
    for (final Object? rawAsset in assets) {
      loader.addFont(
        rootBundle.load(
          (rawAsset! as Map<String, Object?>)['asset']! as String,
        ),
      );
    }
    await loader.load();
  }
  await testMain();
}
