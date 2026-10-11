import 'package:em_budget/core/theme/app_chips.dart';
import 'package:em_budget/core/theme/app_theme.dart';
import 'package:em_budget/presentation/widgets/app_icon_chip.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Structural assertions for [AppIconChip]: every expectation re-reads its
/// value from [AppChips] — the measured §6 `.icon-chip` row — so a pass proves
/// the chip painted the row rather than a number typed here. The row's own
/// fidelity to `parity/ui-tokens.json` is the drift test's job
/// (`test/theme/ui_tokens_test.dart`); these tests cover the behaviour the
/// measurement says the class has, which is: a fixed circle, an inherited
/// glyph colour, a tap, and — because the class authors no `:active` and no
/// `:disabled` — nothing else.
void main() {
  const String cssClass = '.icon-chip';

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
      tester.element(find.byType(AppIconChip)),
    );
    expect(
      delivered.brightness,
      brightness,
      reason: 'the harness must deliver the pass the chip resolves against',
    );
  }

  AppChipSpec row(Brightness brightness) =>
      AppChips.resolve(cssClass, brightness);

  BoxDecoration paintBox(WidgetTester tester) {
    final Container box = tester.widget<Container>(
      find.descendant(
        of: find.byType(AppIconChip),
        matching: find.byType(Container),
      ),
    );
    return box.decoration! as BoxDecoration;
  }

  testWidgets('the chip is the measured 40×40 circle in both passes', (
    WidgetTester tester,
  ) async {
    for (final Brightness brightness in Brightness.values) {
      final AppChipSpec spec = row(brightness);
      await pumpChip(
        tester,
        const AppIconChip(child: SizedBox.shrink()),
        brightness,
      );
      expect(
        tester.getSize(find.byType(AppIconChip)),
        Size(spec.sizePx!, spec.sizePx!),
        reason:
            '${brightness.name}: the size is the class’s authored square, not a caller’s',
      );
      final BoxDecoration box = paintBox(tester);
      expect(box.color, spec.fillColor);
      expect(box.border, spec.border);
      expect(box.borderRadius, spec.borderRadius);
      expect(
        box.gradient,
        isNull,
        reason: 'the row measures no background-image',
      );
    }
  });

  for (final Brightness brightness in Brightness.values) {
    testWidgets(
      'the glyph inherits the class ink through an IconTheme in ${brightness.name}',
      (WidgetTester tester) async {
        final AppChipSpec spec = row(brightness);
        Color? seen;
        await pumpChip(
          tester,
          AppIconChip(
            child: Builder(
              builder: (BuildContext context) {
                seen = IconTheme.of(context).color;
                return const SizedBox.shrink();
              },
            ),
          ),
          brightness,
        );
        expect(
          seen,
          spec.textColor,
          reason:
              '${brightness.name}: the SVG takes `color: var(--ink-2)` as measured, '
              'not a Material default',
        );
      },
    );
  }

  testWidgets('a tap fires, and a null callback is inert with no repaint', (
    WidgetTester tester,
  ) async {
    final AppChipSpec spec = row(Brightness.light);
    int taps = 0;
    await pumpChip(
      tester,
      AppIconChip(onPressed: () => taps++, child: const SizedBox.shrink()),
      Brightness.light,
    );
    await tester.tap(find.byType(AppIconChip));
    await tester.pump();
    expect(taps, 1);

    await pumpChip(
      tester,
      AppIconChip(onPressed: null, child: const SizedBox.shrink()),
      Brightness.light,
    );
    final BoxDecoration before = paintBox(tester);
    await tester.tap(find.byType(AppIconChip));
    await tester.pump();
    expect(
      paintBox(tester).color,
      before.color,
      reason:
          'the class authors no :disabled, so an inert chip must not dim or move — '
          'and drift here would mean the widget invented a state',
    );
    expect(
      spec.pressFillColor,
      isNull,
      reason: 'the row carries no press paint for the widget to have hidden',
    );
    expect(spec.disabledOpacity, isNull, reason: 'nor a fade');
  });

  testWidgets('the chip exposes button semantics only when it acts', (
    WidgetTester tester,
  ) async {
    for (final bool enabled in <bool>[true, false]) {
      await pumpChip(
        tester,
        AppIconChip(
          onPressed: enabled ? () {} : null,
          child: const SizedBox.shrink(),
        ),
        Brightness.light,
      );
      final Semantics label = tester.widget<Semantics>(
        find.descendant(
          of: find.byType(AppIconChip),
          matching: find.byType(Semantics),
        ),
      );
      expect(
        label.properties.button,
        enabled,
        reason: 'a chip with no action is not a button to a screen reader',
      );
      expect(label.properties.enabled, enabled);
    }
  });

  testWidgets('there is no ink and no blur: the row measured neither', (
    WidgetTester tester,
  ) async {
    await pumpChip(
      tester,
      const AppIconChip(onPressed: _noop, child: SizedBox.shrink()),
      Brightness.light,
    );
    for (final Type absent in <Type>[
      Ink,
      InkWell,
      Material,
      BackdropFilter,
      ClipRRect,
      AnimatedContainer,
    ]) {
      expect(
        find.descendant(
          of: find.byType(AppIconChip),
          matching: find.byType(absent),
        ),
        findsNothing,
        reason:
            '$absent would paint a state or a frost the class does not carry',
      );
    }
  });
}

void _noop() {}
