import 'package:em_budget/core/theme/app_chips.dart';
import 'package:em_budget/core/theme/app_theme.dart';
import 'package:em_budget/presentation/widgets/app_delta_chip.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Structural assertions for [AppDeltaChip] — the composition the web’s class
/// list describes: an element carries `delta-chip delta-up` (or `-down`), so
/// the box, type, gap and `tabular-nums` come from the measured `.delta-chip`
/// row and only the fill and ink come from the measured tint row. Every value
/// is re-read from [AppChips]; the tests also pin the two facts that make the
/// composition honest — the tint rows author no box to disagree with, and the
/// chip row authors no fill of its own to compete with the tint.
void main() {
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
      tester.element(find.byType(AppDeltaChip)),
    );
    expect(
      delivered.brightness,
      brightness,
      reason: 'the harness must deliver the pass the chip resolves against',
    );
  }

  AppChipSpec chip(Brightness brightness) =>
      AppChips.resolve('.delta-chip', brightness);

  AppChipSpec tint(AppDeltaDirection direction, Brightness brightness) =>
      AppChips.resolve(direction.cssClass, brightness);

  BoxDecoration paint(WidgetTester tester) {
    final Container box = tester.widget<Container>(
      find.descendant(
        of: find.byType(AppDeltaChip),
        matching: find.byType(Container),
      ),
    );
    return box.decoration! as BoxDecoration;
  }

  test('the directions are exactly the two measured tint rows', () {
    final List<String> classes = AppDeltaDirection.values
        .map((AppDeltaDirection d) => d.cssClass)
        .toList();
    expect(classes, <String>['.delta-up', '.delta-down']);
    for (final AppDeltaDirection direction in AppDeltaDirection.values) {
      for (final Brightness brightness in Brightness.values) {
        expect(
          AppChips.resolve(direction.cssClass, brightness).cssClass,
          direction.cssClass,
        );
      }
    }
  });

  for (final AppDeltaDirection direction in AppDeltaDirection.values) {
    for (final Brightness brightness in Brightness.values) {
      testWidgets(
        '${direction.cssClass} on the chip box in ${brightness.name}',
        (WidgetTester tester) async {
          final AppChipSpec box = chip(brightness);
          final AppChipSpec fill = tint(direction, brightness);
          await pumpChip(
            tester,
            AppDeltaChip(
              direction: direction,
              children: <Widget>[const Text('+2.4%')],
            ),
            brightness,
          );

          final BoxDecoration painted = paint(tester);
          expect(
            painted.color,
            fill.fillColor,
            reason: 'the tint row authors background alone',
          );
          expect(
            painted.borderRadius,
            box.borderRadius,
            reason:
                'the corner is the chip row’s; the standalone tint '
                'measures 0px, which is not the composition’s',
          );
          expect(
            painted.border,
            box.border,
            reason:
                'neither row frames the delta: the chip authors no border '
                'and the tint’s measured frame is 0px currentcolor',
          );

          final TextStyle label = DefaultTextStyle.of(
            tester.element(find.text('+2.4%')),
          ).style;
          expect(
            label.color,
            fill.textColor,
            reason: 'and color alone, from the same row',
          );
          expect(label.fontFamily, box.fontFamily);
          expect(label.fontSize, box.fontSizePx);
          expect(label.fontWeight, box.weight);
          expect(
            label.fontFeatures,
            box.tabularNums
                ? const <FontFeature>[FontFeature.tabularFigures()]
                : null,
            reason: '`font-variant-numeric: tabular-nums` is authored by .delta-chip',
          );
        },
      );
    }
  }

  testWidgets('the two tints are different colours in both passes', (
    WidgetTester tester,
  ) async {
    for (final Brightness brightness in Brightness.values) {
      final AppChipSpec up = tint(AppDeltaDirection.up, brightness);
      final AppChipSpec down = tint(AppDeltaDirection.down, brightness);
      expect(up.fillColor, isNot(down.fillColor));
      expect(up.textColor, isNot(down.textColor));
    }
  });

  testWidgets('children sit the chip’s authored gap apart', (
    WidgetTester tester,
  ) async {
    final AppChipSpec box = chip(Brightness.light);
    final Key marker = UniqueKey();
    await pumpChip(
      tester,
      AppDeltaChip(
        direction: AppDeltaDirection.up,
        children: <Widget>[
          SizedBox(key: marker, width: 8, height: 8),
          const Text('+2.4%'),
        ],
      ),
      Brightness.light,
    );
    expect(
      tester.getRect(find.text('+2.4%')).left -
          tester.getRect(find.byKey(marker)).right,
      box.gapPx,
    );
  });

  testWidgets('the glyph inherits the tint ink too', (
    WidgetTester tester,
  ) async {
    for (final AppDeltaDirection direction in AppDeltaDirection.values) {
      await pumpChip(
        tester,
        AppDeltaChip(
          direction: direction,
          children: <Widget>[
            Builder(
              builder: (BuildContext context) {
                expect(
                  IconTheme.of(context).color,
                  tint(direction, Brightness.light).textColor,
                  reason:
                      'the arrow is an SVG on the web and takes the same '
                      'inherited `color` as the text',
                );
                return const SizedBox.shrink();
              },
            ),
            const Text('+2.4%'),
          ],
        ),
        Brightness.light,
      );
    }
  });

  testWidgets('a delta chip is a label, not a control', (
    WidgetTester tester,
  ) async {
    await pumpChip(
      tester,
      const AppDeltaChip(
        direction: AppDeltaDirection.up,
        children: <Widget>[Text('+2.4%')],
      ),
      Brightness.light,
    );
    for (final Type control in <Type>[
      GestureDetector,
      Ink,
      InkWell,
      Material,
    ]) {
      expect(
        find.descendant(
          of: find.byType(AppDeltaChip),
          matching: find.byType(control),
        ),
        findsNothing,
        reason:
            '$control would make a read-only figure tappable — the web '
            'delta carries no handler',
      );
    }
  });
}
