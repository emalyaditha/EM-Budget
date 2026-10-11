import 'dart:convert';
import 'dart:io';

import 'package:em_budget/core/theme/app_fields.dart';
import 'package:em_budget/core/theme/app_numerals.dart';
import 'package:em_budget/core/theme/app_theme.dart';
import 'package:em_budget/data/number_locale.dart';
import 'package:em_budget/domain/money.dart';
import 'package:em_budget/presentation/widgets/app_numeral.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show RenderParagraph;
import 'package:flutter_test/flutter_test.dart';

import '../data/web_source.dart';

/// Behaviour of [AppNumeral] — the figure rows of `src/index.css:359-426`.
///
/// The metrics themselves are not this file's business: `ui_tokens_test.dart`
/// re-derives every one of them from `parity/ui-tokens.json` and
/// `src/index.css` and fails if [AppNumerals] drifts. What is proved here is
/// what only a rendered widget can show: that the row reaches the paragraph,
/// that the digits arrive exactly as `formatMoney` spelled them, that a call
/// site's utility classes override the row property by property the way the
/// class list does, and that a seven-figure amount stays inside the phone.
///
/// ## The fonts, which item 10 supplied
///
/// The three families these rows name are declared in `mobile/pubspec.yaml`
/// and `mobile/test/flutter_test_config.dart` hands them to the harness,
/// because `flutter test` does not load app fonts by itself. Without that
/// step every glyph here is drawn in the fallback, whose advance is 1em per
/// character and whose `letterSpacing` lands after the last glyph too: the
/// right string in the right style, measured in the wrong face. That is why
/// the width assertions here are relations (one line, inside 360dp,
/// narrower than the fallback) rather than literals, and why
/// `test/theme/app_fonts_test.dart` measures the faces themselves — a bundle
/// that stopped resolving is reported there, not read here as a design change.
void main() {
  // ------------------------------------------------------------ the fixtures
  //
  // Both files are read rather than transcribed, for the reason `money_test.dart`
  // gives: a case added on the web has to show up here as an unconsumed name.
  final Map<String, List<Object?>> moneyInput = <String, List<Object?>>{};
  final Map<String, String> moneyExpected = <String, String>{};
  final Map<String, List<Object?>> localeInput = <String, List<Object?>>{};
  final Map<String, String> localeExpected = <String, String>{};

  Map<String, Object?> decodeCases(
    String path,
    Map<String, List<Object?>> input,
    Map<String, String> expected,
    bool Function(String name, Object? value) accept,
  ) {
    final File file = File(
      '${repoRoot()}${Platform.pathSeparator}parity'
      '${Platform.pathSeparator}fixtures${Platform.pathSeparator}$path',
    );
    if (!file.existsSync()) throw StateError('Missing fixture: ${file.path}');
    final Map<String, Object?> root =
        jsonDecode(file.readAsStringSync()) as Map<String, Object?>;
    final Map<String, Object?> prov =
        root['_provenance']! as Map<String, Object?>;
    if (prov['unitFile'] != 'src/lib/money.ts') {
      throw StateError('$path is not from src/lib/money.ts');
    }
    for (final Object? raw in root['cases']! as List<Object?>) {
      final Map<String, Object?> entry = raw! as Map<String, Object?>;
      final String name = entry['name']! as String;
      final Object? value = entry['expected'];
      // A numeral paints a string, so the cases this file can render are the
      // ones whose expectation is a string. `money.json` also holds the
      // numeric half of `money.ts` (`toMinorUnits` and friends), which belongs
      // to `money_test.dart` and would be a lie to render as digits here.
      if (!accept(name, value)) continue;
      if (expected.containsKey(name)) {
        throw StateError('Duplicate case in $path: $name');
      }
      input[name] = entry['input']! as List<Object?>;
      expected[name] = value! as String;
    }
    return prov;
  }

  final Map<String, Object?> moneyProvenance = decodeCases(
    'money.json',
    moneyInput,
    moneyExpected,
    (String name, Object? value) =>
        name.startsWith('formatMoney(') && value is String,
  );
  decodeCases(
    'number-locale.json',
    localeInput,
    localeExpected,
    (String name, Object? value) => value is String,
  );
  final List<String> localeNames = localeExpected.keys.toList();

  /// `money.json` was measured in one browser locale; the port formats in the
  /// device's (D-12), so the golden's own locale is injected rather than
  /// assumed — the same pin `money_test.dart` sets.
  final JsNumberLocale moneyLocale = () {
    final String tag = moneyProvenance['locale']! as String;
    if (tag != 'en-US') {
      throw StateError(
        'money.json was generated under $tag, which this suite would have to '
        'inject instead of en-US',
      );
    }
    return JsNumberLocale.resolve(tag);
  }();

  /// ‘-0’ is a sentinel in the fixture, not a Dart literal that survives the
  /// round trip, and ‘NaN’/‘±Infinity’ are cases the formatter swallows to zero.
  num amountOf(Object? raw) {
    if (raw is num) return raw;
    if (raw is Map<String, Object?> && raw.containsKey("__sentinel__")) {
      switch (raw["__sentinel__"]! as String) {
        case "-0":
          return -0.0;
        case "NaN":
          return double.nan;
        case "Infinity":
          return double.infinity;
        case "-Infinity":
          return double.negativeInfinity;
      }
    }
    throw StateError("$raw is not an amount");
  }

  FormatMoneyOptions optionsOf(Object? raw) {
    if (raw == null) return const FormatMoneyOptions();
    final Map<String, Object?> o = raw as Map<String, Object?>;
    return FormatMoneyOptions(
      minFractionDigits: (o['minFractionDigits'] as num?)?.toInt() ?? 0,
      maxFractionDigits: (o['maxFractionDigits'] as num?)?.toInt() ?? 2,
      signed: o['signed'] as bool? ?? false,
    );
  }

  /// A `money.json` case replayed: the string the ported formatter produces for
  /// it, which must be the string the fixture recorded.
  String moneyCase(String name) {
    final List<Object?> input = moneyInput[name]!;
    final Object? amount = input[1];
    return formatMoney(
      input[0]! as String,
      amount is num ? amount : num.parse('$amount'),
      optionsOf(input.length > 2 ? input[2] : null),
      moneyLocale,
    );
  }

  /// A `number-locale.json` case replayed, in its own locale.
  String localeCase(String name) {
    final List<Object?> input = localeInput[name]!;
    return formatMoney(
      input[1]! as String,
      amountOf(input[2]),
      optionsOf(input[3]),
      JsNumberLocale.resolve(input[0]! as String),
    );
  }

  List<String> namesForLocale(String tag) =>
      localeNames.where((String n) => localeInput[n]![0] == tag).toList();

  final List<String> localeTags = <String>{
    for (final String n in localeNames) localeInput[n]![0]! as String,
  }.toList();

  // ---------------------------------------------------------------- harness
  Future<void> pumpFigure(
    WidgetTester tester,
    Widget figure, {
    double width = 360,
    bool dark = false,
  }) async {
    await tester.binding.setSurfaceSize(Size(width + 40, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      MaterialApp(
        theme: appThemeData(isDark: false),
        darkTheme: appThemeData(isDark: true),
        themeMode: dark ? ThemeMode.dark : ThemeMode.light,
        home: Scaffold(
          body: Align(
            alignment: Alignment.topLeft,
            child: SizedBox(
              width: width,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[figure],
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final Brightness delivered = Theme.of(
      tester.element(find.byType(AppNumeral).first),
    ).brightness;
    expect(
      delivered,
      dark ? Brightness.dark : Brightness.light,
      reason: 'the harness must deliver the pass the row resolves against',
    );
  }

  /// The [Text] the widget builds for the figure. Depth-first, so this is the
  /// outer one: the `.numeral-sup` tag is a `Text` nested inside it.
  Text figureText(WidgetTester tester) => tester.widget<Text>(
    find
        .descendant(of: find.byType(AppNumeral), matching: find.byType(Text))
        .first,
  );

  /// The digits as the span tree holds them — after the widget, so a
  /// re-formatting anywhere in `AppNumeral` shows up here.
  String renderedDigits(WidgetTester tester) => digitsOf(figureText(tester));

  /// The paragraph the figure lays out into.
  RenderParagraph figureParagraph(WidgetTester tester) =>
      tester.renderObject<RenderParagraph>(find.byType(RichText).first);

  /// The `.numeral-sup` widgets [AppNumeral] put between the digits and the
  /// edge of the line.
  ({EdgeInsets padding, Offset lift, Text tag, WidgetSpan span}) supParts(
    WidgetTester tester,
  ) {
    final TextSpan root = figureText(tester).textSpan! as TextSpan;
    final WidgetSpan span = root.children!.last as WidgetSpan;
    final Padding gap = span.child as Padding;
    final Transform shift = gap.child as Transform;
    return (
      padding: gap.padding as EdgeInsets,
      lift: Offset(shift.transform.storage[12], shift.transform.storage[13]),
      tag: shift.child as Text,
      span: span,
    );
  }

  // ------------------------------------------------- never formats a number
  group('the widget never formats', () {
    test('the widget file has no formatting surface to format with', () {
      final String source = File(
        '${repoRoot()}${Platform.pathSeparator}mobile'
        '${Platform.pathSeparator}lib${Platform.pathSeparator}presentation'
        '${Platform.pathSeparator}widgets${Platform.pathSeparator}app_numeral.dart',
      ).readAsStringSync();
      for (final String forbidden in <String>[
        'NumberFormat',
        'toStringAsFixed',
        'toStringAsPrecision',
        'replaceAll',
        'double.parse',
        'int.parse',
        'intl',
      ]) {
        expect(
          source,
          isNot(contains(forbidden)),
          reason:
              'a numeral that re-formats is a second, locale-divergent copy '
              'of src/lib/money.ts — $forbidden',
        );
      }
    });

    testWidgets('the string it is handed is the string it paints', (
      WidgetTester tester,
    ) async {
      // Grouping the app's own locales never produces, a space as separator,
      // a sign in the middle, an empty fraction: whatever arrives is painted
      // byte for byte, because the formatting decision belongs upstream.
      for (final String digits in <String>[
        'Rs.12,50,000',
        'Rs.1 234,56.7',
        '-Rs.0.02',
        'Rs.',
        'LKR2,588,660',
        '',
      ]) {
        await pumpFigure(tester, AppNumeral(text: digits));
        expect(renderedDigits(tester), digits);
      }
    });

    testWidgets('the ambient locale does not reach the digits', (
      WidgetTester tester,
    ) async {
      await tester.binding.setSurfaceSize(const Size(400, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        MaterialApp(
          locale: const Locale('de', 'DE'),
          theme: appThemeData(isDark: false),
          home: Scaffold(body: const AppNumeral(text: '1.234.567,89')),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        figureText(tester).locale,
        isNull,
        reason: 'AppNumeral passes no locale, so nothing can regroup',
      );
      expect(renderedDigits(tester), '1.234.567,89');
    });
  });

  // ------------------------------------------------- the fixtures, rendered
  group('formatMoney fixtures through the widget', () {
    test('the fixtures still spell what they spelled for the domain tests', () {
      // The premise of everything below: the strings this file renders are the
      // fixture's own expected values, produced by the ported formatter.
      for (final String name in <String>[
        "formatMoney('Rs.',-500)",
        "formatMoney('Rs.',-500,signed)",
        "formatMoney('Rs.',0.015)",
      ]) {
        expect(moneyCase(name), moneyExpected[name], reason: name);
      }
      expect(
        localeCase('formatMoneyIn("en-LK",\'Rs.\',1234567.891)'),
        'Rs.1,234,567.89',
      );
    });

    testWidgets('every case of every locale renders verbatim', (
      WidgetTester tester,
    ) async {
      // 335 cases, ten locales — the mandate's two (en-US and en-LK) and the
      // eight the locale fixture carries for their shapes, because a numeral
      // that mangles one of them would mangle a user's balance.
      for (final String tag in localeTags) {
        final List<String> names = namesForLocale(tag);
        final List<String> rendered = <String>[];
        await pumpFigure(
          tester,
          Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              for (final String name in names)
                AppNumeral(
                  key: Key(name),
                  text: localeCase(name),
                  kind: AppNumeralKind.money,
                ),
            ],
          ),
        );
        for (final String name in names) {
          rendered.add(
            digitsOf(
              tester.widget<Text>(
                find
                    .descendant(
                      of: find.byKey(Key(name)),
                      matching: find.byType(Text),
                    )
                    .first,
              ),
            ),
          );
        }
        expect(
          rendered,
          names.map((String n) => localeExpected[n]).toList(),
          reason: 'locale $tag: the widget changed a formatted amount',
        );
      }
    });

    testWidgets('the en-LK seven-figure amounts the app actually shows', (
      WidgetTester tester,
    ) async {
      for (final String name in namesForLocale(
        'en-LK',
      ).where((String n) => (localeExpected[n]!.length) > 9)) {
        await pumpFigure(
          tester,
          AppNumeral(text: localeCase(name), kind: AppNumeralKind.numeral),
        );
        expect(renderedDigits(tester), localeExpected[name], reason: name);
        expect(tester.takeException(), isNull, reason: name);
      }
    });

    testWidgets('the row it paints with is the row the kind names', (
      WidgetTester tester,
    ) async {
      for (final AppNumeralKind kind in AppNumeralKind.values) {
        final AppNumeralSpec row = AppNumerals.resolve(
          kind.metricsClass,
          Brightness.light,
        );
        await pumpFigure(tester, AppNumeral(text: 'Rs.1,000', kind: kind));
        final TextStyle figure = figureText(tester).style!;
        expect(figure.fontFamily, row.fontFamily, reason: kind.cssClass);
        expect(
          figure.fontSize,
          row.fontSizePx,
          reason: '${kind.cssClass} paints at the measured size',
        );
        expect(figure.fontWeight, row.weight, reason: kind.cssClass);
        expect(figure.height, row.heightRatio, reason: kind.cssClass);
        expect(
          figure.letterSpacing,
          row.letterSpacingEm * row.fontSizePx,
          reason: '${kind.cssClass} tracking is em, resolved at the row size',
        );
        expect(figure.color, row.textColor, reason: kind.cssClass);
        expect(figure.fontFeatures, row.fontFeatures, reason: kind.cssClass);
      }
    });

    testWidgets('brightness moves the ink and no metric', (
      WidgetTester tester,
    ) async {
      for (final AppNumeralKind kind in AppNumeralKind.values) {
        await pumpFigure(tester, AppNumeral(text: 'Rs.1,000', kind: kind));
        final TextStyle light = figureText(tester).style!;
        await pumpFigure(
          tester,
          AppNumeral(text: 'Rs.1,000', kind: kind),
          dark: true,
        );
        final TextStyle dark = figureText(tester).style!;
        final AppNumeralSpec darkRow = AppNumerals.resolve(
          kind.metricsClass,
          Brightness.dark,
        );
        expect(dark.color, darkRow.textColor, reason: kind.cssClass);
        expect(
          light.copyWith(color: dark.color),
          dark,
          reason: '${kind.cssClass}: dark differs by ink alone',
        );
      }
    });
  });

  // --------------------------------------------------------------- negatives
  group('a negative amount', () {
    testWidgets('keeps the sign the formatter put there', (
      WidgetTester tester,
    ) async {
      const List<String> names = <String>[
        "formatMoney('Rs.',-500)",
        "formatMoney('Rs.',-500,signed)",
        "formatMoney('Rs.',-0.015,signed)",
        "formatMoney('Rs.',-2.5,signed)",
        "formatMoney('Rs.',-500,2dp)",
      ];
      for (final String name in names) {
        await pumpFigure(
          tester,
          AppNumeral(text: moneyCase(name), kind: AppNumeralKind.money),
        );
        expect(renderedDigits(tester), moneyExpected[name], reason: name);
        expect(
          renderedDigits(tester).startsWith('-'),
          moneyExpected[name]!.startsWith('-'),
          reason: '$name: the widget invented or lost a minus',
        );
      }
    });

    testWidgets('a minus does not change the colour', (
      WidgetTester tester,
    ) async {
      // `.money` has no negative colour in `src/index.css` — the red lives on
      // `.delta-chip`, which is `AppDeltaChip`'s business. A numeral that
      // tinted its own negatives would colour a debt twice.
      final AppNumeralSpec row = AppNumerals.resolve(
        '.money',
        Brightness.light,
      );
      for (final String digits in <String>['Rs.500', '-Rs.500']) {
        await pumpFigure(
          tester,
          AppNumeral(text: digits, kind: AppNumeralKind.money),
        );
        expect(figureText(tester).style!.color, row.textColor);
      }
    });

    testWidgets('the signed pair is the same figure with one more glyph', (
      WidgetTester tester,
    ) async {
      const double lineHeight = 16.0 * 1.5; // `.money`: 16px at line-height 1.5
      final Map<String, double> heights = <String, double>{};
      for (final String name in <String>[
        "formatMoney('Rs.',-500)",
        "formatMoney('Rs.',-500,signed)",
      ]) {
        await pumpFigure(
          tester,
          AppNumeral(text: moneyCase(name), kind: AppNumeralKind.money),
        );
        heights[name] = figureParagraph(tester).size.height;
        expect(figureParagraph(tester).size.width, lessThanOrEqualTo(360));
      }
      expect(
        heights["formatMoney('Rs.',-500,signed)"],
        heights["formatMoney('Rs.',-500)"],
        reason:
            'both fit one line, so both are $lineHeight tall — the signed '
            'form is one glyph longer and the bundled face still fits 360dp',
      );
      expect(heights.values.first, lineHeight);
    });
  });

  // ------------------------------------------------------ the Owed display
  group('the credit-card Owed display (CardFace.tsx:78)', () {
    /// `text-[19px] font-extrabold text-white leading-tight`, the four classes
    /// that follow `money` on the card's balance line.
    const TextStyle owedOverrides = TextStyle(
      fontSize: 19,
      fontWeight: FontWeight.w800,
      color: Colors.white,
      height: 1.25,
    );

    testWidgets('the four classes override the row property by property', (
      WidgetTester tester,
    ) async {
      await pumpFigure(
        tester,
        const AppNumeral(
          text: 'Rs.4,200',
          kind: AppNumeralKind.money,
          style: owedOverrides,
        ),
      );
      final TextStyle figure = figureText(tester).style!;
      expect(figure.fontSize, 19);
      expect(figure.fontWeight, FontWeight.w800);
      expect(figure.color, Colors.white);
      expect(figure.height, 1.25);
      // What the call site did not name stays the row's, which is the whole
      // point of a merge rather than a replacement.
      expect(figure.fontFamily, 'Inter');
      expect(figure.fontFeatures, const <FontFeature>[
        FontFeature.tabularFigures(),
      ]);
    });

    testWidgets('the row’s em tracking follows the size the call site set', (
      WidgetTester tester,
    ) async {
      // CSS resolves `letter-spacing: -0.01em` against the *used* font size, so
      // `text-[19px]` on `.money` gives -0.19px, not the -0.16px the 16px probe
      // measured. A merged-in size that left the row's px tracking behind would
      // make every card figure read tighter than the web's.
      await pumpFigure(
        tester,
        const AppNumeral(
          text: 'Rs.4,200',
          kind: AppNumeralKind.money,
          style: owedOverrides,
        ),
      );
      final AppNumeralSpec row = AppNumerals.resolve(
        '.money',
        Brightness.light,
      );
      expect(figureText(tester).style!.letterSpacing, closeTo(-0.19, 1e-12));
      expect(figureText(tester).style!.letterSpacing, row.letterSpacingEm * 19);
      expect(
        figureText(tester).style!.letterSpacing,
        isNot(row.letterSpacingPx),
        reason: 'the row measured -0.16px at 16px; the em law re-resolves it',
      );
    });

    testWidgets('the amount is the formatter’s, with maxFractionDigits: 0', (
      WidgetTester tester,
    ) async {
      // `CardFace.tsx:78` renders
      // `formatMoney(currency, balance, { maxFractionDigits: 0 })`, so the
      // rounding that puts a whole number on the card is the domain's, and the
      // numeral only carries it. `money.json` has the cases that prove it.
      for (final String name in <String>[
        "formatMoney('Rs.',1234.5,0dp)",
        "formatMoney('Rs.',125000.005,0dp)",
      ]) {
        expect(moneyCase(name), moneyExpected[name], reason: name);
        await pumpFigure(
          tester,
          AppNumeral(
            text: moneyCase(name),
            kind: AppNumeralKind.money,
            style: owedOverrides,
          ),
        );
        expect(renderedDigits(tester), moneyExpected[name], reason: name);
      }
    });

    testWidgets('the block is an `.eyebrow` line over a `.money` line', (
      WidgetTester tester,
    ) async {
      final AppLabelSpec eyebrow = AppLabels.resolve(
        '.eyebrow',
        Brightness.light,
      );
      await pumpFigure(
        tester,
        Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(eyebrow.uppercase ? 'OWED' : 'Owed', style: eyebrow.textStyle),
            const AppNumeral(
              text: 'Rs.4,201',
              kind: AppNumeralKind.money,
              style: owedOverrides,
            ),
          ],
        ),
      );
      expect(find.text('OWED'), findsOneWidget);
      expect(renderedDigits(tester), 'Rs.4,201');
      // Two lines, the label above: the figure starts below the caption's box.
      expect(
        tester.getTopLeft(find.byType(AppNumeral)).dy,
        greaterThan(tester.getTopLeft(find.text('OWED')).dy),
      );
      expect(
        figureText(tester).style!.color,
        isNot(eyebrow.textColor),
        reason: 'the card paints the figure white over the label’s ink-3',
      );
    });
  });

  // ---------------------------------------------------------------- the hero
  group('the hero figure (DashboardHero.tsx:173)', () {
    testWidgets('is the .numeral row with the hero cap, never the hero probe', (
      WidgetTester tester,
    ) async {
      final AppNumeralSpec numeral = AppNumerals.resolve(
        '.numeral',
        Brightness.light,
      );
      final AppNumeralSpec heroProbe = AppNumerals.resolve(
        '.numeral-hero',
        Brightness.light,
      );
      await pumpFigure(
        tester,
        const AppNumeral(
          text: '1,250,000',
          kind: AppNumeralKind.numeralHero,
          containerInlineSizePx: 900,
        ),
        width: 900,
      );
      final TextStyle figure = figureText(tester).style!;
      expect(figure.fontFamily, numeral.fontFamily);
      expect(figure.fontWeight, numeral.weight);
      expect(figure.height, numeral.heightRatio);
      expect(figure.fontFeatures, numeral.fontFeatures);
      expect(
        figure.fontSize,
        AppNumerals.heroFontSizePx(900, Brightness.light),
      );
      expect(figure.fontFamily, isNot(heroProbe.fontFamily));
      expect(figure.fontWeight, isNot(heroProbe.weight));
    });

    testWidgets('the 15cqi term moves the size and the ems with it', (
      WidgetTester tester,
    ) async {
      final AppNumeralSpec numeral = AppNumerals.resolve(
        '.numeral',
        Brightness.light,
      );
      for (final MapEntry<num, double> entry in <num, double>{
        200: 30,
        120: 18,
      }.entries) {
        await pumpFigure(
          tester,
          AppNumeral(
            text: '4,205',
            kind: AppNumeralKind.numeralHero,
            containerInlineSizePx: entry.key.toDouble(),
          ),
          width: entry.key.toDouble(),
        );
        final TextStyle figure = figureText(tester).style!;
        expect(figure.fontSize, entry.value);
        expect(
          figure.letterSpacing,
          numeral.letterSpacingEm * entry.value,
          reason: 'tracking is em, so a smaller card tracks tighter too',
        );
      }
    });

    test('a container size on a row that does not read one is a bug', () {
      expect(
        () => AppNumeral(
          text: 'Rs.1,000',
          kind: AppNumeralKind.numeral,
          containerInlineSizePx: 400,
        ),
        throwsA(isA<AssertionError>()),
      );
    });
  });

  // ------------------------------------------------------------ the currency tag
  group('the .numeral-sup tag', () {
    test('no face of its own', () {
      expect(
        AppNumeralKind.values.map((AppNumeralKind k) => k.cssClass),
        isNot(contains('.numeral-sup')),
        reason:
            'every metric of `.numeral-sup` is an em of the figure it sits '
            'inside, so it means nothing standalone',
      );
    });

    testWidgets('is an inline box lifted off the figure’s baseline', (
      WidgetTester tester,
    ) async {
      const double figure = 38;
      await pumpFigure(
        tester,
        const AppNumeral(
          text: '1,250,000',
          superscript: 'Rs.',
          containerInlineSizePx: null,
        ),
        width: 600,
      );
      final AppNumeralSupBox sup = AppNumerals.supAt(figure, Brightness.light);
      final ({EdgeInsets padding, Offset lift, Text tag, WidgetSpan span})
      parts = supParts(tester);
      expect(parts.padding, EdgeInsets.only(left: sup.gapPx));
      expect(parts.lift, Offset(0.0, -sup.liftPx));
      expect(parts.tag.style, sup.style);
      // Both of the tag’s own ems resolve against the tag’s font size, which
      // is itself 0.28em of the figure — the nesting CSS does and a constant
      // would not.
      expect(sup.style.fontSize, closeTo(38 * 0.28, 1e-9));
      expect(sup.gapPx, closeTo(38 * 0.28 * 0.28, 1e-9));
      expect(sup.liftPx, closeTo(38 * 0.28 * 0.62, 1e-9));
      final WidgetSpan span =
          (figureText(tester).textSpan! as TextSpan).children!.last
              as WidgetSpan;
      expect(span.alignment, PlaceholderAlignment.aboveBaseline);
      expect(span.baseline, TextBaseline.alphabetic);
    });

    testWidgets('its four ems are the figure’s size, not a constant', (
      WidgetTester tester,
    ) async {
      for (final double size in <double>[38, 30, 19, 16]) {
        await pumpFigure(
          tester,
          AppNumeral(
            text: '1,250,000',
            superscript: 'Rs.',
            kind: size == 30
                ? AppNumeralKind.numeralHero
                : AppNumeralKind.numeral,
            containerInlineSizePx: size == 30 ? 200 : null,
            style: size == 19
                ? const TextStyle(fontSize: 19)
                : size == 16
                ? const TextStyle(fontSize: 16)
                : null,
          ),
          width: 600,
        );
        final double used = figureText(tester).style!.fontSize!;
        expect(used, size);
        final AppNumeralSupBox sup = AppNumerals.supAt(used, Brightness.light);
        final ({EdgeInsets padding, Offset lift, Text tag, WidgetSpan span})
        parts = supParts(tester);
        expect(parts.tag.style!.fontSize, sup.style.fontSize, reason: '$size');
        expect(parts.tag.style!.letterSpacing, sup.style.letterSpacing);
        expect(parts.lift.dx, 0.0);
        expect(parts.lift.dy, -sup.liftPx);
        expect(parts.padding.left, sup.gapPx);
      }
    });

    testWidgets('the digits take the call site’s colour and the tag does not', (
      WidgetTester tester,
    ) async {
      // `DashboardHero.tsx:173` repaints the figure with
      // `!text-[var(--danger)]` when the balance is owed; `.numeral-sup:421`
      // authors its own `color: var(--ink-3)`, and an author override on the
      // parent does not reach it.
      const Color danger = Color(0xFFE5484D);
      await pumpFigure(
        tester,
        const AppNumeral(
          text: '1,250,000',
          superscript: 'Rs.',
          style: TextStyle(color: danger),
        ),
        width: 600,
      );
      expect(figureText(tester).style!.color, danger);
      expect(
        supParts(tester).tag.style!.color,
        AppNumerals.resolve('.numeral-sup', Brightness.light).textColor,
      );
    });
  });

  // ------------------------------------------------------ inside a phone width
  group('a seven-figure amount at 360px', () {
    /// The largest figure the reference puts on a phone: `.numeral` at 38px,
    /// whose line-height is 1, so one line is exactly 38dp tall here.
    const double numeralPx = 38;

    testWidgets('the box stays inside the width and nothing overflows', (
      WidgetTester tester,
    ) async {
      for (final String digits in <String>[
        'LKR2,588,660',
        'Rs.1,234,567.89',
        'Rs.1,250,000.00',
      ]) {
        await pumpFigure(tester, AppNumeral(text: digits, superscript: 'Rs.'));
        expect(tester.takeException(), isNull, reason: digits);
        final Size painted = figureParagraph(tester).size;
        expect(painted.width, lessThanOrEqualTo(360), reason: digits);
      }
    });

    testWidgets('it takes one line, which is what the phone showed', (
      WidgetTester tester,
    ) async {
      // This is the assertion item 10 was booked to flip, and it flipped the
      // way the web behaves. In the harness fallback these twelve glyphs
      // measured 12 × (38 − 1.14) = 442.3px, did not fit 360dp and took a
      // second line; Plus Jakarta Sans Light with `tnum` is far narrower and
      // the figure now stays on one line inside the width. The fallback
      // arithmetic is not lost — app_fonts_test.dart measures it directly, so
      // a bundle that stopped resolving would not hide behind this passing.
      const String digits = 'LKR2,588,660';
      await pumpFigure(tester, const AppNumeral(text: digits));
      final Size painted = figureParagraph(tester).size;
      expect(
        painted.height,
        lineHeight(figureText(tester).style!, digits),
        reason: 'one line, at the row’s own leading',
      );
      expect(
        painted.height,
        closeTo(numeralPx, 0.01),
        reason: 'one line of a row whose line-height is 1',
      );
      expect(painted.width, lessThan(360), reason: digits);
      expect(tester.takeException(), isNull);
    });

    testWidgets('the card figure, which is what the 320px capture showed, '
        'holds one line in the real face as well', (WidgetTester tester) async {
      // Twelve glyphs at the call site’s 19px: this one fitted even in the
      // fallback at ~226px, so it is the case that proves the bundle did not
      // cost the card its single line. What a wider face could have done —
      // push a figure onto a second line — is what the test above now pins.
      const String digits = 'LKR2,588,660';
      await pumpFigure(
        tester,
        const AppNumeral(
          text: digits,
          kind: AppNumeralKind.money,
          style: TextStyle(
            fontSize: 19,
            fontWeight: FontWeight.w800,
            color: Colors.white,
            height: 1.25,
          ),
        ),
      );
      expect(
        figureParagraph(tester).size.height,
        lineHeight(figureText(tester).style!, digits),
        reason: 'one line at the call site’s leading-tight',
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('the hero of a narrow card keeps its min() cap', (
      WidgetTester tester,
    ) async {
      await pumpFigure(
        tester,
        const AppNumeral(
          text: 'LKR2,588,660',
          kind: AppNumeralKind.numeralHero,
          containerInlineSizePx: 340,
          superscript: 'Rs.',
        ),
        width: 340,
      );
      expect(figureText(tester).style!.fontSize, 38);
      expect(tester.takeException(), isNull);
      expect(figureParagraph(tester).size.width, lessThanOrEqualTo(340));
    });
  });

  // ------------------------------------------------------------- unportables
  group('what the engine cannot do', () {
    testWidgets('overflow-wrap: anywhere is carried as data, not a knob', (
      WidgetTester tester,
    ) async {
      final AppNumeralSpec numeral = AppNumerals.resolve(
        '.numeral',
        Brightness.light,
      );
      expect(numeral.overflowWrapAnywhere, isTrue);
      expect(numeral.minWidthZero, isTrue);
      // This SDK offers neither `TextStyle.overflowWrap` nor `Text.wordBreak`,
      // so the widget cannot ask for a break anywhere: a figure breaks at a
      // comma or a space, or it wraps the whole token. The two flags record the
      // authored fact, and the tests above show what the difference costs.
      await pumpFigure(tester, const AppNumeral(text: 'Rs.12345678901234567'));
      expect(tester.takeException(), isNull);
      expect(figureParagraph(tester).size.width, lessThanOrEqualTo(360));
    });
  });
}

/// The height one line of [style] takes in whatever face the harness has.
double lineHeight(TextStyle style, String text) => (TextPainter(
  text: TextSpan(text: text, style: style),
  textDirection: TextDirection.ltr,
)..layout()).height;

/// The digits a figure carries, read back out of its span tree: the plain face
/// holds them on the root span, the one that carries a `.numeral-sup` holds
/// them on the first child of the root.
String digitsOf(Text figure) {
  final TextSpan span = figure.textSpan! as TextSpan;
  return span.text ?? (span.children!.first as TextSpan).text!;
}
