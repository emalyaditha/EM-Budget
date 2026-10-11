import 'package:em_budget/core/theme/app_chips.dart';
import 'package:em_budget/core/theme/app_theme.dart';
import 'package:em_budget/presentation/widgets/app_pill.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Structural assertions for [AppPill]. Every colour, inset, gap, fade and
/// clock is re-read from [AppChips] — the measured `.pill` row and the
/// measured `.pill pill-active` composite — so a pass proves the pill painted
/// those rows, and the composition rule the widget claims (the `.pill` element
/// is present in both variants, so it owns the gap, the press repaint, the
/// fade and the transition; the override authors only three colours) is
/// asserted, not assumed.
void main() {
  Future<void> pumpPill(
    WidgetTester tester,
    Widget pill,
    Brightness brightness,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: appThemeData(isDark: false),
        darkTheme: appThemeData(isDark: true),
        themeMode: brightness == Brightness.dark
            ? ThemeMode.dark
            : ThemeMode.light,
        home: Scaffold(body: Center(child: pill)),
      ),
    );
    await tester.pumpAndSettle();
    final ThemeData delivered = Theme.of(tester.element(find.byType(AppPill)));
    expect(
      delivered.brightness,
      brightness,
      reason: 'the harness must deliver the pass the pill resolves against',
    );
  }

  AppChipSpec rest(Brightness brightness) =>
      AppChips.resolve('.pill', brightness);

  AppChipSpec active(Brightness brightness) =>
      AppChips.resolve('.pill-active', brightness);

  AnimatedContainer animBox(WidgetTester tester) =>
      tester.widget<AnimatedContainer>(
        find.descendant(
          of: find.byType(AppPill),
          matching: find.byType(AnimatedContainer),
        ),
      );

  BoxDecoration paint(WidgetTester tester) =>
      animBox(tester).decoration! as BoxDecoration;

  TextStyle labelStyle(WidgetTester tester) =>
      DefaultTextStyle.of(tester.element(find.text('Filter'))).style;

  group('the resting pill', () {
    for (final Brightness brightness in Brightness.values) {
      testWidgets('draws its measured row in ${brightness.name}', (
        WidgetTester tester,
      ) async {
        final AppChipSpec spec = rest(brightness);
        await pumpPill(
          tester,
          const AppPill(onPressed: _noop, children: <Widget>[Text('Filter')]),
          brightness,
        );
        final BoxDecoration box = paint(tester);
        expect(box.color, spec.fillColor);
        expect(box.borderRadius, spec.borderRadius);
        expect(box.border, spec.border);
        expect(
          animBox(tester).padding,
          spec.padding,
          reason: 'the label sits the measured shorthand inside the frame',
        );

        final TextStyle label = labelStyle(tester);
        expect(label.fontFamily, spec.fontFamily);
        expect(label.color, spec.textColor);
        expect(label.fontSize, spec.fontSizePx);
        expect(label.fontWeight, spec.weight);
        expect(label.height, spec.lineHeightRatio);
        expect(label.letterSpacing, spec.letterSpacingPx);

        expect(
          animBox(tester).duration,
          spec.pressDuration,
          reason:
              'the pill runs its own authored 130ms-class clock, '
              'typed nowhere here',
        );
        final Cubic curve = animBox(tester).curve as Cubic;
        expect(
          <double>[curve.a, curve.b, curve.c, curve.d],
          <double>[spec.easeX1!, spec.easeY1!, spec.easeX2!, spec.easeY2!],
        );
      });
    }

    testWidgets('children are separated by the class’s authored gap', (
      WidgetTester tester,
    ) async {
      final AppChipSpec spec = rest(Brightness.light);
      final Key first = UniqueKey();
      final Key last = UniqueKey();
      await pumpPill(
        tester,
        AppPill(
          onPressed: _noop,
          children: <Widget>[
            SizedBox(key: first, width: 10, height: 10),
            const Text('Filter'),
            SizedBox(key: last, width: 10, height: 10),
          ],
        ),
        Brightness.light,
      );
      expect(
        tester.getRect(find.text('Filter')).left -
            tester.getRect(find.byKey(first)).right,
        spec.gapPx,
        reason: 'flex gap before the label',
      );
      expect(
        tester.getRect(find.byKey(last)).left -
            tester.getRect(find.text('Filter')).right,
        spec.gapPx,
        reason: 'and after it',
      );
    });
  });

  group('the active variant is the measured composite', () {
    for (final Brightness brightness in Brightness.values) {
      testWidgets('.pill pill-active paints the override colours on the '
          'pill box in ${brightness.name}', (WidgetTester tester) async {
        final AppChipSpec pill = rest(brightness);
        final AppChipSpec spec = active(brightness);
        await pumpPill(
          tester,
          AppPill.active(
            onPressed: _noop,
            children: <Widget>[const Text('Filter')],
          ),
          brightness,
        );
        final BoxDecoration box = paint(tester);
        expect(
          box.color,
          spec.fillColor,
          reason: 'the override authors background: var(--ink)',
        );
        expect(
          box.border,
          Border.all(color: spec.borderColor, width: pill.borderWidthPx),
        );
        expect(
          labelStyle(tester).color,
          spec.textColor,
          reason: 'and color: var(--accent-fg)',
        );
        expect(
          box.borderRadius,
          spec.borderRadius,
          reason:
              'the composite measures the same radius as the rest — '
              'the override authors none',
        );
        expect(spec.paddingHorizontalPx, pill.paddingHorizontalPx);
        expect(spec.paddingVerticalPx, pill.paddingVerticalPx);
        expect(
          animBox(tester).duration,
          pill.pressDuration,
          reason: 'the clock travels on the .pill row in both variants',
        );
      });
    }

    testWidgets('an active pill still presses to the .pill :active fill', (
      WidgetTester tester,
    ) async {
      final AppChipSpec pill = rest(Brightness.light);
      final AppChipSpec spec = active(Brightness.light);
      await pumpPill(
        tester,
        AppPill.active(
          onPressed: _noop,
          children: <Widget>[const Text('Filter')],
        ),
        Brightness.light,
      );
      final TestGesture down = await tester.startGesture(
        tester.getCenter(find.byType(AppPill)),
      );
      await tester.pump();
      await tester.pump(pill.pressDuration!);
      expect(
        paint(tester).color,
        pill.pressFillColor,
        reason:
            ':active is authored on .pill, so it wins even over the '
            'active variant’s resting ink — the widget must not resolve '
            'the press from the override row, which carries none',
      );
      expect(paint(tester).color, isNot(spec.fillColor));
      await down.up();
      await tester.pumpAndSettle();
      expect(paint(tester).color, spec.fillColor);
    });
  });

  group('press, release and the tap', () {
    testWidgets('the press repaints to :active and release restores it', (
      WidgetTester tester,
    ) async {
      final AppChipSpec spec = rest(Brightness.light);
      int taps = 0;
      await pumpPill(
        tester,
        AppPill(
          onPressed: () => taps++,
          children: <Widget>[const Text('Filter')],
        ),
        Brightness.light,
      );
      final TestGesture down = await tester.startGesture(
        tester.getCenter(find.byType(AppPill)),
      );
      await tester.pump();
      await tester.pump(spec.pressDuration!);
      expect(
        paint(tester).color,
        spec.pressFillColor,
        reason:
            'the authored `:active { background: var(--surface-3) }`, '
            'landed through the pill’s own clock',
      );
      await down.up();
      await tester.pumpAndSettle();
      expect(paint(tester).color, spec.fillColor);
      expect(taps, 1, reason: 'the click fires on release inside the box');
    });

    testWidgets('a slide off the pill cancels the action and the paint', (
      WidgetTester tester,
    ) async {
      final AppChipSpec spec = rest(Brightness.light);
      int taps = 0;
      await pumpPill(
        tester,
        AppPill(
          onPressed: () => taps++,
          children: <Widget>[const Text('Filter')],
        ),
        Brightness.light,
      );
      final TestGesture down = await tester.startGesture(
        tester.getCenter(find.byType(AppPill)),
      );
      await tester.pump();
      await down.moveTo(
        tester.getCenter(find.byType(AppPill)) - const Offset(0, 200),
      );
      await down.up();
      await tester.pumpAndSettle();
      expect(taps, 0);
      expect(
        paint(tester).color,
        spec.fillColor,
        reason: 'the released-outside press must leave no paint behind',
      );
    });
  });

  group('the disabled pill', () {
    for (final Brightness brightness in Brightness.values) {
      testWidgets('fades by the measured :disabled opacity and will not '
          'press, in ${brightness.name}', (WidgetTester tester) async {
        final AppChipSpec spec = rest(brightness);
        await pumpPill(
          tester,
          AppPill(onPressed: null, children: <Widget>[const Text('Filter')]),
          brightness,
        );
        final List<Opacity> dim = tester
            .widgetList<Opacity>(
              find.descendant(
                of: find.byType(AppPill),
                matching: find.byType(Opacity),
              ),
            )
            .toList();
        expect(
          dim,
          hasLength(1),
          reason: 'one opacity layer, the measured one',
        );
        expect(dim.single.opacity, spec.disabledOpacity);

        final GestureDetector tap = tester.widget<GestureDetector>(
          find.descendant(
            of: find.byType(AppPill),
            matching: find.byType(GestureDetector),
          ),
        );
        expect(tap.onTap, isNull);

        final TestGesture down = await tester.startGesture(
          tester.getCenter(find.byType(AppPill)),
        );
        await tester.pump();
        expect(
          find
              .descendant(
                of: find.byType(AppPill),
                matching: find.byType(Opacity),
              )
              .evaluate()
              .length,
          1,
          reason: 'a disabled press adds no second state',
        );
        await down.up();
        await tester.pump();
      });
    }

    testWidgets('an enabled pill carries no opacity layer', (
      WidgetTester tester,
    ) async {
      await pumpPill(
        tester,
        const AppPill(onPressed: _noop, children: <Widget>[Text('Filter')]),
        Brightness.light,
      );
      expect(
        find.descendant(
          of: find.byType(AppPill),
          matching: find.byType(Opacity),
        ),
        findsNothing,
        reason: 'the fade belongs to the :disabled state alone',
      );
    });
  });

  group('semantics and economy', () {
    testWidgets('a pill is a button, and only the active one is selected', (
      WidgetTester tester,
    ) async {
      for (final bool isActive in <bool>[false, true]) {
        await pumpPill(
          tester,
          isActive
              ? AppPill.active(
                  onPressed: _noop,
                  children: <Widget>[const Text('Filter')],
                )
              : AppPill(
                  onPressed: _noop,
                  children: <Widget>[const Text('Filter')],
                ),
          Brightness.light,
        );
        final Semantics label = tester.widget<Semantics>(
          find.descendant(
            of: find.byType(AppPill),
            matching: find.byType(Semantics),
          ),
        );
        expect(label.properties.button, true);
        expect(
          label.properties.selected,
          isActive,
          reason: 'aria-pressed/selected is the active class’s meaning',
        );
      }
    });

    testWidgets('no ink, no blur, one box', (WidgetTester tester) async {
      await pumpPill(
        tester,
        const AppPill(onPressed: _noop, children: <Widget>[Text('Filter')]),
        Brightness.light,
      );
      for (final Type ink in <Type>[Ink, InkWell, Material]) {
        expect(
          find.descendant(of: find.byType(AppPill), matching: find.byType(ink)),
          findsNothing,
          reason: '$ink would paint feedback the §6 row does not carry',
        );
      }
      expect(
        find.descendant(
          of: find.byType(AppPill),
          matching: find.byType(AnimatedContainer),
        ),
        findsOneWidget,
      );
      expect(
        rest(Brightness.light).blurPx,
        isNull,
        reason:
            'the row measured no backdrop-filter, so the pill must not frost',
      );
      expect(
        find.descendant(
          of: find.byType(AppPill),
          matching: find.byType(BackdropFilter),
        ),
        findsNothing,
      );
    });
  });
}

void _noop() {}
