import 'dart:convert';
import 'dart:io';
import 'dart:typed_data' show ByteData;

import 'package:em_budget/core/theme/app_numerals.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_test/flutter_test.dart';

import '../data/web_source.dart';

/// The font bundle item 10 landed, checked from four directions at once.
///
/// The web does not merely name fonts, it loads them: `src/index.css:1` asks
/// Google Fonts for three families at specific weights, and the rows of
/// `src/index.css:359-426` pick one of them by name. A port therefore has two
/// separate obligations — that the set of faces shipped is the set asked for,
/// and that `TextStyle(fontFamily: 'Inter')` actually resolves to Inter instead
/// of quietly to a fallback. Nothing in the widget tests can tell those apart:
/// a fallback draws the right string in the right style at the wrong width,
/// which is the failure a design-system port has to be able to see. So this
/// file is the tripwire `test/widgets/app_numeral_test.dart` leans on, and the
/// reason that file asserts relations rather than literals.
///
/// ## Where the integrity check lives, and why it is not in Dart
///
/// `parity/fixtures/fonts.json` records a sha256 and a byte count per file, and
/// `node parity/get_fonts.cjs --check` re-reads the bytes and compares them with
/// what was recorded — one deliberately flipped byte makes it fail. This app has
/// no hashing dependency, and adding `crypto` to recompute a hash the tool that
/// wrote the record already verified would be a second copy of one check rather
/// than a second check. So Dart asserts what drifts silently and without trace:
/// the declared sets, the names the bytes claim, the sizes, and whether a family
/// actually resolves under the harness the suites run in.
void main() {
  String repoFile(String relativePath) {
    final File file = File(
      '${repoRoot()}${Platform.pathSeparator}$relativePath',
    );
    if (!file.existsSync()) throw StateError('Missing $relativePath');
    return file.readAsStringSync();
  }

  final Map<String, Object?> fontsFixture = jsonDecode(
    repoFile('parity/fixtures/fonts.json'),
  ) as Map<String, Object?>;
  final List<Map<String, Object?>> recordedFaces =
      (fontsFixture['faces']! as List<Object?>).cast<Map<String, Object?>>();
  final List<Map<String, Object?>> recordedLicences =
      (fontsFixture['licenses']! as List<Object?>).cast<Map<String, Object?>>();
  final List<DeclaredFace> declaredFaces = parseDeclaredFaces(
    repoFile('mobile${Platform.pathSeparator}pubspec.yaml'),
  );
  final Map<String, List<int>> webAsksFor = webFontRequest(
    webSource('src/index.css'),
  );
  final Set<String> declaredFamilies = declaredFaces
      .map((DeclaredFace f) => f.family)
      .toSet();

  // ------------------------------------------------------- one set, four ways
  group('the bundle is the set the web loads', () {
    test('src/index.css:1 and the pubspec ask for the same faces', () {
      final Map<String, List<int>> fromPubspec = <String, List<int>>{};
      for (final DeclaredFace face in declaredFaces) {
        fromPubspec.putIfAbsent(face.family, () => <int>[]).add(face.weight);
      }
      for (final List<int> weights in fromPubspec.values) {
        weights.sort();
      }
      expect(
        fromPubspec.keys.toSet(),
        webAsksFor.keys.toSet(),
        reason:
            'a family the phone loads that the web does not, or the other way '
            'round — src/index.css:1 is the only statement of the set',
      );
      for (final String family in webAsksFor.keys) {
        final List<int> wanted = webAsksFor[family]!..sort();
        expect(fromPubspec[family], wanted, reason: '$family weights');
      }
      expect(
        declaredFaces,
        hasLength(
          declaredFaces
              .map((DeclaredFace f) => '${f.family}/${f.weight}')
              .toSet()
              .length,
        ),
        reason: 'one family declares the same weight twice',
      );
    });

    test('the bytes on disk are the files the manifest recorded', () {
      expect(recordedFaces, hasLength(declaredFaces.length));
      final Map<String, int> declaredByFile = <String, int>{
        for (final DeclaredFace face in declaredFaces)
          face.asset.split('/').last: face.weight,
      };
      for (final Map<String, Object?> face in recordedFaces) {
        final String fileName = face['fileName']! as String;
        final String family = face['family']! as String;
        final int recordedWeight = face['weight']! as int;
        expect(
          declaredByFile[fileName],
          recordedWeight,
          reason:
              '$fileName is recorded as $family $recordedWeight, but pubspec.yaml '
              'does not declare that file at that weight',
        );
        final File file = File(
          '${repoRoot()}${Platform.pathSeparator}${face['localPath']}',
        );
        expect(file.existsSync(), isTrue, reason: file.path);
        expect(
          file.lengthSync(),
          face['bytes'],
          reason: '$fileName changed size since it was recorded',
        );
        // The file says who it is. `get_fonts.cjs` read these out of the name
        // table and OS/2.usWeightClass; re-asserting them against the path
        // catches a face swapped for another weight of the same family, which
        // is the substitution every path-based check would pass.
        expect(face['nameTableFamily'], family, reason: fileName);
        final String stem = fileName.split('-').last.split('.').first;
        expect(
          face['nameTableSubfamily'],
          stem,
          reason:
              '$fileName: the name table claims '
              '${face['nameTableSubfamily']}, the path claims $stem',
        );
        expect(
          face['os2usWeightClass'],
          recordedWeight,
          reason: '$fileName is not the weight it is filed as',
        );
        expect(face['missingRequired'], isEmpty, reason: fileName);
        expect(face['numGlyphs']! as int, greaterThan(500), reason: fileName);
      }
    });

    test(
      'the runtime FontManifest matches the pubspec it was built from',
      () async {
        final List<Object?> manifest = jsonDecode(
          utf8.decode(
            (await rootBundle.load('FontManifest.json')).buffer.asUint8List(),
          ),
        ) as List<Object?>;
        final Set<String> fromManifest = <String>{};
        for (final Object? raw in manifest) {
          final Map<String, Object?> entry = raw! as Map<String, Object?>;
          final String family = entry['family']! as String;
          if (family == 'MaterialIcons') continue;
          for (final Object? rawFont in entry['fonts']! as List<Object?>) {
            final Map<String, Object?> font = rawFont! as Map<String, Object?>;
            fromManifest.add('${font['asset']}@${font['weight']}');
          }
        }
        expect(
          fromManifest,
          <String>{
            for (final DeclaredFace face in declaredFaces)
              '${face.asset}@${face.weight}',
          },
          reason:
              'the bundle the running app sees must be the bundle pubspec.yaml '
              'declares; a divergence means the harness and the app load '
              'different faces',
        );
      },
    );

    test('the OFL texts travel with the faces', () async {
      expect(recordedLicences, hasLength(declaredFamilies.length));
      for (final Map<String, Object?> licence in recordedLicences) {
        final String fileName = licence['fileName']! as String;
        // The bundle addresses an asset relative to the app root, which is
        // `mobile/`; the record spells the whole repo path.
        final ByteData data = await rootBundle.load(
          (licence['localPath']! as String).replaceFirst('mobile/', ''),
        );
        final String text = utf8.decode(data.buffer.asUint8List());
        expect(
          text,
          contains('SIL OPEN FONT LICENSE Version 1.1'),
          reason: fileName,
        );
        expect(data.lengthInBytes, licence['bytes'], reason: fileName);
        expect(
          licence['sourceUrl']! as String,
          startsWith('https://raw.githubusercontent.com/google/fonts/'),
          reason: '$fileName is not from the upstream licence repo',
        );
        expect(
          licence['upstreamRepo']! as String,
          isNotEmpty,
          reason: '$fileName records no upstream to re-fetch it from',
        );
      }
    });
  });

  // ------------------------------------------------------- the loader is real
  //
  // `flutter test` does not load an app's fonts by itself; the faces only reach
  // a test through `test/flutter_test_config.dart`. Everything below fails if
  // that step is dropped, which is what makes the width assertions in the rest
  // of the suite worth reading.
  group('the faces resolve, and the fallback is measurably different', () {
    const double probePx = 38;
    const String digits = '0123456789';

    test('the harness fallback is one em per glyph — the number every width '
        'assertion in the suite is a relation to', () {
      final double bare = advance(digits, const TextStyle(fontSize: probePx));
      expect(bare, digits.length * probePx);
      expect(
        advance(
          digits,
          const TextStyle(fontFamily: 'NoSuchFamilyAtAll', fontSize: probePx),
        ),
        bare,
        reason: 'an unknown family must land on the same fallback',
      );
    });

    test('every declared family draws something the fallback is not', () {
      final double fallback = advance(
        digits,
        const TextStyle(fontSize: probePx),
      );
      for (final String family in declaredFamilies) {
        final double measured = advance(
          digits,
          TextStyle(fontFamily: family, fontSize: probePx),
        );
        expect(measured, greaterThan(0), reason: family);
        expect(
          measured,
          lessThan(fallback),
          reason:
              '$family is drawing the fallback: declared, but not loaded into '
              'the harness',
        );
      }
    });

    test('a weight nobody bundled lands on the face that brackets it', () {
      // Inter ships 300-600 and the card asks it for 800. The engine does not
      // synthesise a bolder cut: it takes the nearest available face, so the
      // answer is SemiBold, and that is why the Owed line is the width the web
      // measures rather than a heavier one. Below the band the same rule lands
      // on the lightest face. JetBrains Mono is the exception this test has to
      // state rather than discover: its digits are all the same advance, so its
      // bracket cannot be told apart by width — which is why the last assertion
      // requires at least one family whose bracket IS distinguishable.
      final Map<String, Set<int>> bundledByFamily = <String, Set<int>>{};
      for (final DeclaredFace face in declaredFaces) {
        (bundledByFamily[face.family] ??= <int>{}).add(face.weight);
      }
      double widthOf(String family, int weight) => advance(
        digits,
        TextStyle(
          fontFamily: family,
          fontWeight: fontWeightOf(weight),
          fontSize: probePx,
        ),
      );
      int bracketsToldApart = 0;
      for (final String family in bundledByFamily.keys.toList()..sort()) {
        final List<int> weights = bundledByFamily[family]!.toList()..sort();
        final int lightest = weights.first;
        final int heaviest = weights.last;
        final double lightWidth = widthOf(family, lightest);
        final double heavyWidth = widthOf(family, heaviest);
        if (lightWidth != heavyWidth) bracketsToldApart++;
        for (final int below in const <int>[100, 200, 300]) {
          if (below >= lightest) continue;
          expect(
            widthOf(family, below),
            lightWidth,
            reason:
                '$family $below should draw $family $lightest, the lightest '
                'face bundled',
          );
        }
        for (final int above in const <int>[500, 600, 700, 800, 900]) {
          if (above <= heaviest) continue;
          expect(
            widthOf(family, above),
            heavyWidth,
            reason:
                '$family $above should draw $family $heaviest, the heaviest '
                'face bundled',
          );
        }
      }
      expect(
        bracketsToldApart,
        greaterThanOrEqualTo(2),
        reason:
            'the bracket test above only proves anything where two bundled '
            'faces differ; if the bundle ever degenerates to one cut per '
            'family it would pass vacuously',
      );
    });
    test('tabularFigures is a feature of the face, not a wish', () {
      const TextStyle proportional = TextStyle(
        fontFamily: 'Inter',
        fontSize: probePx,
      );
      const TextStyle tabular = TextStyle(
        fontFamily: 'Inter',
        fontSize: probePx,
        fontFeatures: <FontFeature>[FontFeature.tabularFigures()],
      );
      expect(
        advance('1111111111', proportional),
        lessThan(advance('5555555555', proportional)),
        reason: 'a proportional face draws ones narrower than fives',
      );
      expect(
        advance('1111111111', tabular),
        advance('5555555555', tabular),
        reason: 'tnum gives every digit the same advance',
      );
      expect(
        advance(digits, tabular),
        advance('1111111111', tabular),
        reason: 'so ten different digits measure the same as ten of one digit',
      );
      expect(
        advance(digits, tabular),
        isNot(advance(digits, proportional)),
        reason: 'the feature changed the layout, so the face answers it',
      );
    });

    test('JetBrains Mono is monospace without being asked', () {
      const TextStyle mono = TextStyle(
        fontFamily: 'JetBrains Mono',
        fontSize: probePx,
      );
      expect(advance('1111111111', mono), advance(digits, mono));
      expect(advance('5555555555', mono), advance(digits, mono));
    });

    test('the seven-figure amount fits 360dp in the bundled face and does not '
        'in the fallback', () {
      // The fallback arithmetic item 7 quoted is kept alive here rather than in
      // the widget suite, where a wrapped line would otherwise look like design.
      final AppNumeralSpec numeral = AppNumerals.resolve(
        '.numeral',
        Brightness.light,
      );
      const String figure = 'LKR2,588,660';
      final double bundled = advance(figure, numeral.textStyle);
      final double fallback = advance(
        figure,
        numeral.textStyle.copyWith(fontFamily: 'NoSuchFamilyAtAll'),
      );
      expect(
        fallback,
        closeTo(
          figure.length * (numeral.fontSizePx + numeral.letterSpacingPx),
          0.01,
        ),
        reason: 'the arithmetic the numeral suite quotes',
      );
      expect(bundled, lessThan(360), reason: 'one line inside a phone');
      expect(bundled, lessThan(fallback));
      expect(numeral.tabularNums, isTrue);
    });
  });

  // --------------------------------------------------------- what rows name
  group('a row can only name a family the bundle carries', () {
    test('every numeral row, in both passes', () {
      final List<AppNumeralSpec> specs = <AppNumeralSpec>[
        ...AppNumerals.light.values,
        ...AppNumerals.dark.values,
      ];
      expect(specs, isNotEmpty);
      for (final AppNumeralSpec spec in specs) {
        expect(
          declaredFamilies,
          contains(spec.fontFamily),
          reason:
              '${spec.cssClass} names ${spec.fontFamily}, which the bundle does '
              'not carry — it would render in a fallback',
        );
      }
    });

    test('and the face that answers a row is the one the record says', () {
      final Map<String, Set<int>> bundled = <String, Set<int>>{};
      for (final DeclaredFace face in declaredFaces) {
        (bundled[face.family] ??= <int>{}).add(face.weight);
      }
      for (final AppNumeralSpec spec in <AppNumeralSpec>[
        ...AppNumerals.light.values,
        ...AppNumerals.dark.values,
      ]) {
        final int answers = nearestWeight(
          bundled[spec.fontFamily]!,
          spec.fontWeight,
        );
        expect(
          answers,
          spec.fontWeight,
          reason:
              '${spec.cssClass} asks ${spec.fontWeight} of ${spec.fontFamily}, '
              'which has no such face: ${spec.fontFamily} $answers draws it. '
              'Same as the web, but recorded rather than assumed.',
        );
      }
    });
  });

  // ------------------------------------------------------ coverage, honestly
  group('what the bundled faces cannot draw', () {
    // `get_fonts.cjs` read every face's cmap against the codepoints the money
    // fixtures expect. The holes are not a mistake to fix here: these are the
    // same three families `src/index.css:1` loads, and a `unicode-range` subset
    // can only cover less than a whole file, so the web cannot draw a glyph this
    // bundle cannot. The browser answers the rest with a system fallback and so
    // does Flutter, which is the shared behaviour rather than a deviation. What
    // this group pins is that the set of holes is the set on record, and that it
    // never reaches the locales the app is used in.
    final Map<String, Set<int>> missingByFamily = <String, Set<int>>{};
    for (final Map<String, Object?> face in recordedFaces) {
      final Set<int> into = missingByFamily.putIfAbsent(
        face['family']! as String,
        () => <int>{},
      );
      for (final Object? raw
          in face['missingFixtureCodepoints']! as List<Object?>) {
        into.add(int.parse(raw! as String, radix: 16));
      }
    }
    final Set<int> allGaps = <int>{
      for (final Set<int> gaps in missingByFamily.values) ...gaps,
    };
    final FixtureCoverage fixtures = readMoneyFixtures(repoFile, allGaps);

    test('the only holes are the digits and separators of three locales', () {
      const Set<int> documented = <int>{
        0x0660, 0x0661, 0x0662, 0x0663, 0x0664, // Arabic-Indic digits,
        0x0665, 0x0666, 0x0667, 0x0668, 0x0669,
        0x066B, 0x066C, // and their separators: ar-EG
        0x09E6, 0x09E7, 0x09E8, 0x09E9, 0x09EA, // Bengali digits: bn-BD
        0x09EB, 0x09EC, 0x09ED, 0x09EE, 0x09EF,
        0x202F, // narrow no-break space: the fr-FR thousands separator
      };
      expect(allGaps.difference(documented), isEmpty);
      expect(fixtures.localeTags, isNotEmpty);
    });

    test('those holes touch exactly the three locales on record', () {
      expect(
        fixtures.localesNeedingAGap.keys.toSet(),
        <String>{'ar-EG', 'bn-BD', 'fr-FR'},
        reason:
            'a locale whose expected output needs a glyph no bundled face has '
            'must be recorded in UI_SPEC §3.1, not discovered in a screenshot',
      );
    });

    test('every locale the fixtures format in is on record, so a new one '
        'cannot arrive unannounced', () {
      expect(fixtures.localeTags.toSet(), <String>{
        'en-US',
        'en-IN',
        'de-DE',
        'fr-FR',
        'hi-IN',
        'ar-EG',
        'cs-CZ',
        'bn-BD',
        'en-LK',
        'si-LK',
      });
    });

    test('the locales the app is used in are covered by every face', () {
      // en-LK is the locale the mandate named; the rest are what the app shows.
      for (final String locale in <String>[
        'en-LK',
        'si-LK',
        'en-US',
        'en-IN',
      ]) {
        expect(
          fixtures.localesNeedingAGap.containsKey(locale),
          isFalse,
          reason:
              '$locale expects ${fixtures.localesNeedingAGap[locale]} in a '
              'glyph the bundle lacks',
        );
      }
      expect(fixtures.localeTags, contains('en-LK'));
    });

    test(
      'fr-FR hangs on Inter alone, which is why it is a record and not a fix',
      () {
        expect(missingByFamily['Inter'], isNot(contains(0x202F)));
        expect(missingByFamily['Plus Jakarta Sans'], contains(0x202F));
        expect(missingByFamily['JetBrains Mono'], contains(0x202F));
      },
    );

    test('the money figures themselves are covered, in every face', () {
      // `formatMoney` output is what a `.numeral*` row paints, so this is the
      // one coverage question with no fallback answer: a hole here is a tofu box
      // on the phone.
      for (final Map<String, Object?> face in recordedFaces) {
        final Set<int> gaps = missingByFamily[face['family']! as String]!;
        for (final String figure in fixtures.moneyExpectations) {
          for (final int rune in figure.runes) {
            if (gaps.contains(rune)) {
              fail(
                '${face['fileName']} cannot draw '
                'U+${rune.toRadixString(16).toUpperCase()} in "$figure"',
              );
            }
          }
        }
      }
    });
  });
}

/// One `fonts:` entry of `mobile/pubspec.yaml`.
class DeclaredFace {
  const DeclaredFace({
    required this.family,
    required this.asset,
    required this.weight,
  });

  final String family;
  final String asset;
  final int weight;
}

/// The `flutter:` -> `fonts:` block as declared faces.
///
/// A scanner rather than a regex, and it throws on what it cannot read: a
/// family skipped silently by this parser is exactly the drift these checks
/// exist to catch.
List<DeclaredFace> parseDeclaredFaces(String pubspec) {
  final List<String> lines = const LineSplitter().convert(pubspec);
  final int from = lines.indexOf('flutter:');
  if (from < 0) {
    throw StateError('pubspec.yaml has no top-level flutter: block');
  }
  final List<DeclaredFace> out = <DeclaredFace>[];
  String? family;
  String? asset;
  int? weight;
  void closeFace() {
    if (asset == null) {
      if (weight != null) throw StateError('a weight with no asset behind it');
      return;
    }
    if (family == null) throw StateError('$asset declared outside a family');
    if (weight == null) throw StateError('$asset declares no weight');
    out.add(DeclaredFace(family: family, asset: asset!, weight: weight!));
    asset = null;
    weight = null;
  }

  // Shape-tested rather than column-counted: the YAML has to read as a family
  // item with asset items under it and a weight beside each asset, but the
  // indent itself is not the point, and re-flowing pubspec.yaml must not turn
  // this parser into one that silently finds nothing.
  final RegExp familyAt = RegExp(r'^ +- family: (.+)$');
  final RegExp assetAt = RegExp(r'^ +- asset: (.+)$');
  final RegExp weightAt = RegExp(r'^ +weight: ([0-9]+)$');
  for (final String line in lines.skip(from + 1)) {
    if (line.startsWith(RegExp(r'^[a-zA-Z]'))) break;
    final RegExpMatch? fam = familyAt.firstMatch(line);
    if (fam != null) {
      closeFace();
      family = fam.group(1)!.trim();
      continue;
    }
    final RegExpMatch? ast = assetAt.firstMatch(line);
    if (ast != null) {
      closeFace();
      asset = ast.group(1)!.trim();
      continue;
    }
    final RegExpMatch? wgt = weightAt.firstMatch(line);
    if (wgt != null) {
      if (asset == null) throw StateError('a weight above no asset: $line');
      weight = int.parse(wgt.group(1)!);
    }
  }
  closeFace();
  if (out.isEmpty) throw StateError('parsed no faces — the parser is stale');
  return out;
}

/// The `family=…:wght@…` pairs of the one `@import` on `src/index.css:1`.
Map<String, List<int>> webFontRequest(String indexCss) {
  final String firstLine = const LineSplitter().convert(indexCss).first;
  final RegExpMatch? imported = RegExp(
    "@import url\\('https://fonts\\.googleapis\\.com/css2\\?([^']*)'\\)",
  ).firstMatch(firstLine);
  if (imported == null) {
    throw StateError('src/index.css:1 is no longer a Google Fonts @import');
  }
  final Map<String, List<int>> out = <String, List<int>>{};
  for (final String param in imported.group(1)!.split('&')) {
    final List<String> kv = param.split('=');
    if (kv.first != 'family') continue;
    final List<String> head = kv[1].split(':');
    final String family = Uri.decodeQueryComponent(head.first);
    if (head.length != 2 || !head[1].startsWith('wght@')) {
      throw StateError(
        '$family is requested without an explicit wght list: this check cannot '
        'prove the bundle matches the web for an axis the web leaves to the '
        'browser, so it refuses to guess',
      );
    }
    out[family] = head[1]
        .substring('wght@'.length)
        .split(';')
        .map((String w) => int.parse(w))
        .toList();
  }
  if (out.isEmpty) throw StateError('the @import carries no family= parameter');
  return out;
}

/// The width [text] takes in [style], laid out unconstrained.
///
/// Unconstrained on purpose: a wrapped paragraph measures the width of its
/// widest line, which would let the fallback look as though it fitted. Where
/// a line count is the question the widget suite asks it of a real paragraph.
double advance(String text, TextStyle style) {
  final TextPainter painter = TextPainter(
    text: TextSpan(text: text, style: style),
    textDirection: TextDirection.ltr,
  )..layout();
  return painter.width;
}

/// The bundled weight closest to [asked], which is how CSS picks a face when the
/// requested one is not there.
int nearestWeight(Set<int> available, int asked) => available.reduce(
  (int a, int b) => (a - asked).abs() <= (b - asked).abs() ? a : b,
);

FontWeight fontWeightOf(int weight) => FontWeight.values[weight ~/ 100 - 1];

/// What the two money fixtures expect, and how much of it a bundled face cannot
/// draw. `money.json` is single-locale — its `_provenance` says which — while
/// `number-locale.json` names the locale inside each case name.
class FixtureCoverage {
  FixtureCoverage({
    required this.localeTags,
    required this.moneyExpectations,
    required this.localesNeedingAGap,
  });

  final List<String> localeTags;
  final List<String> moneyExpectations;
  final Map<String, Set<String>> localesNeedingAGap;
}

FixtureCoverage readMoneyFixtures(
  String Function(String path) repoFile,
  Set<int> gaps,
) {
  final Map<String, Set<String>> touched = <String, Set<String>>{};
  final Set<String> locales = <String>{};
  final List<String> money = <String>[];

  void read(String path, String Function(String caseName)? tagOf) {
    final Map<String, Object?> root =
        jsonDecode(repoFile(path)) as Map<String, Object?>;
    final String provenanceLocale =
        (root['_provenance']! as Map<String, Object?>)['locale']! as String;
    for (final Object? raw in root['cases']! as List<Object?>) {
      final Map<String, Object?> entry = raw! as Map<String, Object?>;
      final Object? expected = entry['expected'];
      if (expected is! String) continue;
      final String name = entry['name']! as String;
      final String tag = tagOf?.call(name) ?? provenanceLocale;
      locales.add(tag);
      if (path.endsWith('money.json')) money.add(expected);
      if (expected.runes.any(gaps.contains)) {
        (touched[tag] ??= <String>{}).add(expected);
      }
    }
  }

  final String sep = Platform.pathSeparator;
  read('parity${sep}fixtures${sep}money.json', null);
  read('parity${sep}fixtures${sep}number-locale.json', (String caseName) {
    final RegExpMatch? m = RegExp('"([A-Za-z-]+)"').firstMatch(caseName);
    if (m == null) {
      throw StateError('number-locale case names no locale: $caseName');
    }
    return m.group(1)!;
  });
  return FixtureCoverage(
    localeTags: locales.toList()..sort(),
    moneyExpectations: money,
    localesNeedingAGap: touched,
  );
}
