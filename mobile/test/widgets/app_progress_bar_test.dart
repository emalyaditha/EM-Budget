import 'package:em_budget/core/theme/app_bars.dart';
import 'package:em_budget/core/theme/app_theme.dart';
import 'package:em_budget/presentation/widgets/app_progress_bar.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Structural assertions for [AppProgressBar]. Every fill, corner and height
/// is re-read from [AppBars] — the measured §6 bar rows — and the tests hold
/// the widget to what the measurement and the `src/` call sites jointly prove:
/// these classes paint a flat fill (or the one authored rainbow gradient) and
/// own no value, no animation and, for the pastels, no geometry at all. The
/// bar that is named a progress bar therefore refuses to invent being one.
void main() {
  Future<void> pumpBar(
    WidgetTester tester,
    Widget bar,
    Brightness brightness, {
    Size frame = const Size(200, 24),
    bool tight = false,
  }) async {
    // The frame is the outer box and `Center` is inside it: a `SizedBox`
    // hands its child a TIGHT box, and Flutter’s `RenderConstrainedBox`
    // lets a tight parent constraint beat the child’s authored height
    // (`_additionalConstraints.enforce(constraints)` — the parent wins). The
    // web has no such precedence: the class paints its own 3px whatever the
    // wrapper’s line box, so loose is the faithful harness. `tight: true`
    // is the `w-9 h-9` call sites, which really do size their child.
    await tester.pumpWidget(
      MaterialApp(
        theme: appThemeData(isDark: false),
        darkTheme: appThemeData(isDark: true),
        themeMode: brightness == Brightness.dark
            ? ThemeMode.dark
            : ThemeMode.light,
        home: Scaffold(
          body: SizedBox(
            width: frame.width,
            height: frame.height,
            child: tight ? bar : Center(child: bar),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final ThemeData delivered = Theme.of(
      tester.element(find.byType(AppProgressBar)),
    );
    expect(
      delivered.brightness,
      brightness,
      reason: 'the harness must deliver the pass the bar resolves against',
    );
  }

  BoxDecoration paint(WidgetTester tester) {
    final DecoratedBox box = tester.widget<DecoratedBox>(
      find.descendant(
        of: find.byType(AppProgressBar),
        matching: find.byType(DecoratedBox),
      ),
    );
    return box.decoration as BoxDecoration;
  }

  /// The painted box in the tree. `getSize` on the stateless widget’s own
  /// finder measures whatever the root render object of that subtree is,
  /// which is the framework’s choice, not this widget’s contract; the
  /// `DecoratedBox` is the box the row paints, so its rect is the fact.
  Size paintedSize(WidgetTester tester) => tester.getSize(
    find.descendant(
      of: find.byType(AppProgressBar),
      matching: find.byType(DecoratedBox),
    ),
  );

  group('AppBarStyle', () {
    test('names exactly the classes AppBars measured', () {
      final List<String> expected =
          AppBarStyle.values.map((AppBarStyle s) => s.cssClass).toList()
            ..sort();
      expect(AppBars.light.keys.toList()..sort(), expected);
      expect(AppBars.dark.keys.toList()..sort(), expected);
    });

    test('the named pastels pick exactly their class', () {
      expect(const AppProgressBar.pink().style, AppBarStyle.barPink);
      expect(const AppProgressBar.mint().style, AppBarStyle.barMint);
      expect(const AppProgressBar.yellow().style, AppBarStyle.barYellow);
      expect(const AppProgressBar.lavender().style, AppBarStyle.barLavender);
      expect(const AppProgressBar.blue().style, AppBarStyle.barBlue);
      expect(const AppProgressBar().style, AppBarStyle.rainbowBar);
    });
  });

  for (final AppBarStyle style in AppBarStyle.values) {
    for (final Brightness brightness in Brightness.values) {
      testWidgets(
        '${style.cssClass} in ${brightness.name} paints its measured row',
        (WidgetTester tester) async {
          final AppBarSpec spec = AppBars.resolve(style.cssClass, brightness);
          await pumpBar(tester, AppProgressBar(style: style), brightness);
          final BoxDecoration box = paint(tester);

          expect(
            box.color,
            spec.fillColor,
            reason: 'the row’s fill — a flat pastel, or the rainbow’s null',
          );
          expect(
            box.gradient,
            spec.fillGradient,
            reason: 'and exactly one of the two is set',
          );
          expect(
            box.gradient == null || box.color == null,
            isTrue,
            reason: 'a bar with both would paint over its own measurement',
          );
          expect(box.borderRadius, spec.borderRadius);
          expect(
            box.border,
            isNull,
            reason: 'no §6 bar class measures a border',
          );
          expect(
            box.boxShadow,
            isNull,
            reason: 'no §6 bar class measures a box-shadow',
          );
        },
      );
    }
  }

  testWidgets('the five pastels differ, per pass, as the tokens differ', (
    WidgetTester tester,
  ) async {
    for (final Brightness brightness in Brightness.values) {
      final Set<Color> seen = <Color>{};
      for (final AppBarStyle style in AppBarStyle.values) {
        if (style == AppBarStyle.rainbowBar) continue;
        seen.add(AppBars.resolve(style.cssClass, brightness).fillColor!);
      }
      expect(seen, hasLength(5));
    }
  });

  group('the geometry the rows did author — or did not', () {
    for (final Brightness brightness in Brightness.values) {
      testWidgets(
        '.rainbow-bar keeps its measured 3px hairline in ${brightness.name}',
        (WidgetTester tester) async {
          final AppBarSpec spec = AppBars.resolve('.rainbow-bar', brightness);
          await pumpBar(tester, const AppProgressBar(), brightness);
          expect(spec.heightPx, isNotNull);
          expect(
            paintedSize(tester).height,
            spec.heightPx,
            reason: 'the authored height, typed nowhere here',
          );
          expect(
            paintedSize(tester).width,
            200.0,
            reason:
                'every src/ call site spans its container '
                '(absolute left-0 right-0), so that is the default',
          );
        },
      );

      testWidgets(
        'the 3px can be overridden the way the web overrides it with !h-1, '
        'in ${brightness.name}',
        (WidgetTester tester) async {
          const double webUtility = 4.0;
          await pumpBar(
            tester,
            const AppProgressBar(height: webUtility),
            brightness,
          );
          expect(paintedSize(tester).height, webUtility);
        },
      );

      testWidgets('the pastels own no height: the caller’s box rules, in '
          '${brightness.name}', (WidgetTester tester) async {
        for (final AppBarStyle style in AppBarStyle.values) {
          if (style == AppBarStyle.rainbowBar) continue;
          final AppBarSpec spec = AppBars.resolve(style.cssClass, brightness);
          expect(
            spec.heightPx,
            isNull,
            reason:
                'the class authors none — the row must stay null so a '
                'future screen cannot inherit an invented default',
          );
          await pumpBar(
            tester,
            AppProgressBar(style: style),
            brightness,
            frame: const Size(36, 36),
            tight: true,
          );
          expect(
            paintedSize(tester),
            const Size(36, 36),
            reason:
                '${style.cssClass} fills the tight box the port builds '
                '— h-9 w-9 at the src/ call sites are utilities, not '
                'the class',
          );
          await pumpBar(
            tester,
            AppProgressBar(style: style, height: 8),
            brightness,
            frame: const Size(36, 36),
          );
          expect(paintedSize(tester).height, 8.0);
        }
      });
    }

    testWidgets('a percentage is expressed by sizing, as on the web', (
      WidgetTester tester,
    ) async {
      // src/components/Charts.tsx sets the meter with an inline
      // `style={{ width: pct }}` on an `h-full` div: the browser resolves
      // that percentage against the track, and the fill class itself never
      // sees it. The port has the same split — the screen narrows the box,
      // the bar just fills it — so a quarter-meter is a 50px box in a 200px
      // track, with no value semantics on the widget.
      await pumpBar(
        tester,
        const SizedBox(
          width: 200 * 0.25,
          height: 10,
          child: AppProgressBar.mint(),
        ),
        Brightness.light,
        frame: const Size(200, 24),
      );
      expect(
        paintedSize(tester),
        const Size(50, 10),
        reason:
            'a quarter of the container is a quarter, because the bar '
            'fills whatever box the screen gives it',
      );
    });
  });

  testWidgets('there is no value, no animation and no Material gauge', (
    WidgetTester tester,
  ) async {
    await pumpBar(
      tester,
      const AppProgressBar(style: AppBarStyle.barBlue),
      Brightness.light,
    );
    for (final Type gauge in <Type>[
      LinearProgressIndicator,
      ProgressIndicator,
      Material,
      AnimatedContainer,
      TweenAnimationBuilder,
    ]) {
      expect(
        find.descendant(
          of: find.byType(AppProgressBar),
          matching: find.byType(gauge),
        ),
        findsNothing,
        reason:
            '$gauge would give the bar semantics the §6 rows never '
            'measured: these classes paint a fill and nothing else',
      );
    }
  });
}
