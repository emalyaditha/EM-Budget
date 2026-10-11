import 'package:em_budget/core/theme/app_chips.dart';
import 'package:em_budget/core/theme/app_theme.dart';
import 'package:em_budget/presentation/widgets/app_card_face_chip.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Structural assertions for [AppCardFaceChip] — the box the `.card-face-chip`
/// probe measured plus the ring its `::after` authors, which a detached
/// element can never show. [AppFaceChips.spec] carries both as authored facts
/// (the drift test re-derives them from `parity/ui-tokens.json` and
/// `src/index.css`); these tests prove the widget paints them as the CSS
/// composition means: a gradient box, a border laid 4px inside it, and —
/// because both measured passes printed the identical gold — the same tree
/// under either theme, resolved from nothing.
void main() {
  const AppFaceChipSpec spec = AppFaceChips.spec;

  Future<void> pumpChip(WidgetTester tester, Brightness brightness) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: appThemeData(isDark: false),
        darkTheme: appThemeData(isDark: true),
        themeMode: brightness == Brightness.dark
            ? ThemeMode.dark
            : ThemeMode.light,
        home: const Scaffold(body: Center(child: AppCardFaceChip())),
      ),
    );
    await tester.pumpAndSettle();
  }

  List<DecoratedBox> boxes(WidgetTester tester) => tester
      .widgetList<DecoratedBox>(
        find.descendant(
          of: find.byType(AppCardFaceChip),
          matching: find.byType(DecoratedBox),
        ),
      )
      .toList();

  testWidgets('the chip is the authored box, gradient and inset ring', (
    WidgetTester tester,
  ) async {
    await pumpChip(tester, Brightness.light);

    expect(
      tester.getSize(find.byType(AppCardFaceChip)),
      Size(spec.widthPx, spec.heightPx),
      reason: 'the 30×22 the class authors, not a caller’s',
    );

    final List<DecoratedBox> painted = boxes(tester);
    expect(
      painted,
      hasLength(2),
      reason:
          'one box for the gradient, one for the ::after ring — '
          'a third layer would paint something the CSS does not',
    );

    final BoxDecoration outer = painted.first.decoration as BoxDecoration;
    expect(outer.gradient, spec.fillGradient);
    expect(
      outer.color,
      isNull,
      reason: 'the class paints the chip with background-image alone',
    );
    expect(outer.borderRadius, spec.borderRadius);

    final Padding inset = tester.widget<Padding>(
      find.descendant(
        of: find.byType(AppCardFaceChip),
        matching: find.byType(Padding),
      ),
    );
    expect(
      inset.padding,
      EdgeInsets.all(spec.ringInsetPx),
      reason: '`inset: 4px` is a border laid four pixels off the edge',
    );

    final BoxDecoration ring = painted.last.decoration as BoxDecoration;
    expect(ring.border, spec.ringBorder);
    expect(ring.borderRadius, spec.ringBorderRadius);
    expect(
      ring.gradient,
      isNull,
      reason: 'the pseudo-element frames; it does not repaint',
    );

    expect(
      tester.getSize(
        find.descendant(
          of: find.byType(Padding),
          matching: find.byType(DecoratedBox),
        ),
      ),
      Size(
        spec.widthPx - 2 * spec.ringInsetPx,
        spec.heightPx - 2 * spec.ringInsetPx,
      ),
      reason: 'the ring box really sits at the inset',
    );
  });

  testWidgets('the chip is theme-independent, because the gold measures '
      'identical in both passes', (WidgetTester tester) async {
    await pumpChip(tester, Brightness.light);
    final BoxDecoration light = boxes(tester).first.decoration as BoxDecoration;
    await pumpChip(tester, Brightness.dark);
    final BoxDecoration dark = boxes(tester).first.decoration as BoxDecoration;
    expect(
      light.gradient,
      dark.gradient,
      reason:
          'the drift test proves the probe rows match; here the widget '
          'must not consult the theme at all',
    );
    expect(tester.getSize(find.byType(AppCardFaceChip)), isNot(Size.zero));
  });

  test('the ring is the authored hairline', () {
    expect(
      spec.ringBorder,
      Border.all(color: spec.ringColor, width: spec.ringBorderWidthPx),
    );
    expect(
      spec.ringColor.a,
      lessThan(1.0),
      reason: 'rgba(0,0,0,.25) is translucent',
    );
    expect(spec.ringBorderWidthPx, 1.0);
  });
}
