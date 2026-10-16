import 'dart:ui' as ui;

import 'package:em_budget/core/theme/app_chips.dart';
import 'package:em_budget/core/theme/app_theme.dart';
import 'package:em_budget/presentation/widgets/app_chip_select.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Structural assertions for [AppChipSelect] — the one §6 chrome chip that
/// frosts what sits behind it. Every value is re-read from the measured
/// `.chip-select` row, and the frost is asserted as the web means it: a
/// [BackdropFilter] clipped to the chip’s own corner by a [ClipRRect], with
/// the CSS blur carried at half its radius (UI_SPEC D-U8), because the class
/// authors `backdrop-filter: blur(10px)` and no `saturate()`.
void main() {
  const String cssClass = '.chip-select';

  Future<void> pumpChip(
    WidgetTester tester,
    Widget chip,
    Brightness brightness,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: appThemeData(isDark: false),
        darkTheme: appThemeData(isDark: true),
        themeMode: brightness == Brightness.dark
            ? ThemeMode.dark
            : ThemeMode.light,
        home: Scaffold(body: Center(child: chip)),
      ),
    );
    await tester.pumpAndSettle();
    final ThemeData delivered = Theme.of(
      tester.element(find.byType(AppChipSelect)),
    );
    expect(
      delivered.brightness,
      brightness,
      reason: 'the harness must deliver the pass the chip resolves against',
    );
  }

  AppChipSpec row(Brightness brightness) =>
      AppChips.resolve(cssClass, brightness);

  BoxDecoration paint(WidgetTester tester) {
    final AnimatedContainer box = tester.widget<AnimatedContainer>(
      find.descendant(
        of: find.byType(AppChipSelect),
        matching: find.byType(AnimatedContainer),
      ),
    );
    return box.decoration! as BoxDecoration;
  }

  for (final Brightness brightness in Brightness.values) {
    testWidgets('the chip draws its measured row in ${brightness.name}', (
      WidgetTester tester,
    ) async {
      final AppChipSpec spec = row(brightness);
      await pumpChip(
        tester,
        AppChipSelect(onPressed: _noop, children: <Widget>[const Text('Tag')]),
        brightness,
      );
      final BoxDecoration box = paint(tester);
      expect(box.color, spec.fillColor);
      expect(box.borderRadius, spec.borderRadius);
      expect(box.border, spec.border);

      final AnimatedContainer anim = tester.widget<AnimatedContainer>(
        find.descendant(
          of: find.byType(AppChipSelect),
          matching: find.byType(AnimatedContainer),
        ),
      );
      expect(anim.padding, spec.padding);
      expect(
        anim.duration,
        spec.pressDuration,
        reason:
            'the border/fill transition the class authors runs on the '
            'class’s own clock',
      );

      final TextStyle label = DefaultTextStyle.of(
        tester.element(find.text('Tag')),
      ).style;
      expect(label.fontFamily, spec.fontFamily);
      expect(label.color, spec.textColor);
      expect(label.fontSize, spec.fontSizePx);
      expect(label.fontWeight, spec.weight);
    });
  }

  for (final Brightness brightness in Brightness.values) {
    testWidgets('the chip frosts its backdrop in ${brightness.name}', (
      WidgetTester tester,
    ) async {
      final AppChipSpec spec = row(brightness);
      await pumpChip(
        tester,
        AppChipSelect(onPressed: _noop, children: <Widget>[const Text('Tag')]),
        brightness,
      );
      expect(
        spec.blurPx,
        isNotNull,
        reason:
            'the probe measured the blur; if it ever stops to, this '
            'test must fail here rather than paint a frost that left the web',
      );
      final Finder filter = find.descendant(
        of: find.byType(AppChipSelect),
        matching: find.byType(BackdropFilter),
      );
      expect(filter, findsOneWidget);
      final BackdropFilter frost = tester.widget(filter);
      expect(
        frost.filter,
        ui.ImageFilter.blur(
          sigmaX: spec.blurSigmaPx!,
          sigmaY: spec.blurSigmaPx!,
        ),
        reason: 'D-U8: sigma is the measured CSS blur halved',
      );
      expect(spec.blurSaturate, isNull);

      final Finder clip = find.descendant(
        of: find.byType(AppChipSelect),
        matching: find.byType(ClipRRect),
      );
      expect(clip, findsOneWidget);
      final ClipRRect corner = tester.widget(clip);
      expect(
        corner.borderRadius,
        spec.borderRadius,
        reason:
            'backdrop-filter is confined to the element’s border box, '
            'so the clip is the chip’s own corner',
      );
    });
  }

  testWidgets('children sit the authored gap apart', (
    WidgetTester tester,
  ) async {
    final AppChipSpec spec = row(Brightness.light);
    final Key marker = UniqueKey();
    await pumpChip(
      tester,
      AppChipSelect(
        onPressed: _noop,
        children: <Widget>[
          SizedBox(key: marker, width: 8, height: 8),
          const Text('Tag'),
        ],
      ),
      Brightness.light,
    );
    expect(
      tester.getRect(find.text('Tag')).left -
          tester.getRect(find.byKey(marker)).right,
      spec.gapPx,
    );
  });

  testWidgets('a tap fires; with no callback the chip is inert and unchanged', (
    WidgetTester tester,
  ) async {
    int taps = 0;
    await pumpChip(
      tester,
      AppChipSelect(
        onPressed: () => taps++,
        children: <Widget>[const Text('Tag')],
      ),
      Brightness.light,
    );
    await tester.tap(find.byType(AppChipSelect));
    await tester.pump();
    expect(taps, 1);

    await pumpChip(
      tester,
      AppChipSelect(onPressed: null, children: <Widget>[const Text('Tag')]),
      Brightness.light,
    );
    final BoxDecoration before = paint(tester);
    await tester.tap(find.byType(AppChipSelect));
    await tester.pump();
    expect(
      paint(tester).color,
      before.color,
      reason:
          'the class authors no :active and no :disabled — there is no '
          'measured state for an inert chip to move to',
    );
    expect(row(Brightness.light).pressFillColor, isNull);
    expect(row(Brightness.light).disabledOpacity, isNull);
  });

  testWidgets('semantics say button, enabled only with an action', (
    WidgetTester tester,
  ) async {
    for (final bool enabled in <bool>[true, false]) {
      await pumpChip(
        tester,
        AppChipSelect(
          onPressed: enabled ? _noop : null,
          children: <Widget>[const Text('Tag')],
        ),
        Brightness.light,
      );
      final Semantics label = tester.widget<Semantics>(
        find.descendant(
          of: find.byType(AppChipSelect),
          matching: find.byType(Semantics),
        ),
      );
      expect(label.properties.button, true);
      expect(label.properties.enabled, enabled);
    }
  });

  testWidgets('no Material ink', (WidgetTester tester) async {
    await pumpChip(
      tester,
      const AppChipSelect(onPressed: _noop, children: <Widget>[Text('Tag')]),
      Brightness.light,
    );
    for (final Type ink in <Type>[Ink, InkWell, Material]) {
      expect(
        find.descendant(
          of: find.byType(AppChipSelect),
          matching: find.byType(ink),
        ),
        findsNothing,
      );
    }
  });
}

void _noop() {}
