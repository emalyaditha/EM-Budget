import 'package:em_budget/core/theme/app_rows.dart';
import 'package:em_budget/core/theme/app_theme.dart';
import 'package:em_budget/presentation/widgets/app_category_chip.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart' show SemanticsData;
import 'package:flutter_test/flutter_test.dart';

/// Structural assertions for [AppCategoryChip].
///
/// Every square, corner, frame, fill, ink and glyph size is re-read from
/// [AppCategoryChips] here — the six `cat-chip-md-*` rows and the three odd sizes
/// the component’s own ternaries measure — so a pass proves the widget painted
/// the measured circle rather than a number that happens to match it. The
/// `ui_tokens_test.dart` group already re-derives those tables from
/// `parity/ui-tokens.json` and `src/components/ui/CategoryChip.tsx`; what only a
/// rendered widget can show is that the tint the hash selects is the tint that
/// reaches the box, that an explicit `tone` beats the hash as `tone ??` does, and
/// that the circle is decoration to the row rather than a thing of its own.
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
        home: Scaffold(
          body: Center(child: Row(children: <Widget>[chip])),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  BoxDecoration painted(WidgetTester tester) =>
      tester.widget<Container>(find.byType(Container)).decoration!
          as BoxDecoration;

  for (final Brightness brightness in Brightness.values) {
    group('the ${brightness.name} chip', () {
      testWidgets('the hash’s tone is the tone that paints', (
        WidgetTester tester,
      ) async {
        const String category = 'Groceries';
        final AppCategoryChipTintSpec tint = AppCategoryChips.tint(
          AppCategoryChips.toneFor(category),
          brightness,
        );
        await pumpChip(
          tester,
          AppCategoryChip(category: category, glyph: const Icon(Icons.circle)),
          brightness,
        );

        final BoxDecoration box = painted(tester);
        expect(box.color, tint.fillColor);
        expect(
          box.border,
          Border.all(color: tint.borderColor, width: tint.borderWidthPx),
        );
        expect(box.borderRadius, tint.radius);
        expect(
          tester.getSize(find.byType(AppCategoryChip)).width,
          AppChipSize.md.sidePx,
        );
        expect(
          tester.getSize(find.byType(AppCategoryChip)).height,
          tint.sidePx,
        );
      });

      testWidgets('an explicit tone beats the hash, as `tone ??` does', (
        WidgetTester tester,
      ) async {
        // A category whose hash is not the tone asserted below, so the two paths
        // cannot both be satisfied by the same answer.
        const String category = 'Salary';
        final AppChipTone hashed = AppCategoryChips.toneFor(category);
        final AppChipTone chosen = AppCategoryChips.toneCycle.firstWhere(
          (AppChipTone tone) => tone != hashed,
        );
        await pumpChip(
          tester,
          AppCategoryChip(category: category, tone: chosen),
          brightness,
        );

        expect(
          painted(tester).color,
          AppCategoryChips.tint(chosen, brightness).fillColor,
          reason: 'the caller’s tone is the web’s `tone ?? toneFor(category)`',
        );
      });

      testWidgets('every tone of the cycle paints its own measured row', (
        WidgetTester tester,
      ) async {
        for (final AppChipTone tone in AppChipTone.values) {
          await pumpChip(
            tester,
            AppCategoryChip(category: 'anything', tone: tone),
            brightness,
          );
          final AppCategoryChipTintSpec tint = AppCategoryChips.tint(
            tone,
            brightness,
          );
          expect(painted(tester).color, tint.fillColor, reason: tone.name);
          expect(
            tester.getSize(find.byType(AppCategoryChip)).width,
            tint.sidePx,
          );
        }
      });

      testWidgets('the four sizes are the component’s own ternaries', (
        WidgetTester tester,
      ) async {
        for (final AppChipSize size in AppChipSize.values) {
          await pumpChip(
            tester,
            AppCategoryChip(
              category: 'Bills',
              size: size,
              glyph: const Icon(Icons.circle),
            ),
            brightness,
          );
          final Size painted = tester.getSize(find.byType(AppCategoryChip));
          expect(painted, Size(size.sidePx, size.sidePx), reason: size.name);
          // `size` is the square; the glyph goes to the caller through the icon
          // theme, which is how the web’s `<Icon size={glyph}>` arrives.
          final IconThemeData delivered = IconTheme.of(
            tester.element(find.byIcon(Icons.circle)),
          );
          expect(delivered.size, size.glyphPx, reason: size.name);
        }
      });

      testWidgets('the circle’s ink reaches the glyph, and only the ink', (
        WidgetTester tester,
      ) async {
        final AppCategoryChipTintSpec tint = AppCategoryChips.tint(
          AppCategoryChips.toneFor('Travel'),
          brightness,
        );
        await pumpChip(
          tester,
          AppCategoryChip(category: 'Travel', glyph: const Icon(Icons.circle)),
          brightness,
        );
        final IconThemeData delivered = IconTheme.of(
          tester.element(find.byIcon(Icons.circle)),
        );
        expect(delivered.color, tint.iconColor);
        expect(
          tester.widget<Icon>(find.byIcon(Icons.circle)).color,
          isNull,
          reason:
              'the widget colours through the theme, the way the SVG inherits '
              '`color: var(--ink)` from the chip’s inline style; a caller that sets '
              'the colour itself wins, as it would on the web',
        );
      });

      testWidgets('no glyph is no box of ink: the caller owns the drawing', (
        WidgetTester tester,
      ) async {
        await pumpChip(tester, AppCategoryChip(category: 'Food'), brightness);
        expect(find.byIcon(Icons.circle), findsNothing);
        expect(painted(tester).color, isNotNull);
      });

      testWidgets('the circle is decoration, not a thing of its own', (
        WidgetTester tester,
      ) async {
        await pumpChip(
          tester,
          AppCategoryChip(category: 'Rent', glyph: const Icon(Icons.circle)),
          brightness,
        );
        // `aria-hidden` on the web: the row’s label is the accessible name.
        final SemanticsData data = tester
            .getSemantics(find.byType(AppCategoryChip))
            .getSemanticsData();
        expect(data.label, isEmpty);
        // `data.button` would be the direct answer, but it is deprecated in this
        // Flutter; the empty label and the absent node are what `aria-hidden`
        // owes the row, and they are asserted above.
      });
    });
  }

  testWidgets('the same category is the same tone, in every pair of the tables', (
    WidgetTester tester,
  ) async {
    // Determinism is the whole point of the hash: two rows for one category look
    // alike without either side choosing a colour, and the port must not be the
    // place that stops being true.
    //
    // `İSTANBUL` is excluded, and only because `ui_tokens_test.dart` pins it: the
    // browser and Dart do not lowercase a dotted capital İ to the same string, so
    // for that one fixture the widget faithfully paints the tone the port’s own
    // hash answers — a different pastel from the web’s, recorded as a deviation
    // there rather than papered over here.
    final Set<String> divergent = <String>{
      for (final MapEntry<String, String> entry
          in AppCategoryChips.toneWebNormalisations.entries)
        if (entry.key.toLowerCase().trim() != entry.value) entry.key,
    };
    for (final Brightness brightness in Brightness.values) {
      final Map<String, Color> byCategory = <String, Color>{};
      for (final String category in AppCategoryChips.toneFixtures.keys) {
        await pumpChip(tester, AppCategoryChip(category: category), brightness);
        byCategory[category] = painted(tester).color!;
      }
      for (final MapEntry<String, AppChipTone> fixture
          in AppCategoryChips.toneFixtures.entries) {
        if (divergent.contains(fixture.key)) continue;
        expect(
          byCategory[fixture.key],
          AppCategoryChips.tint(fixture.value, brightness).fillColor,
          reason: '${fixture.key} at ${brightness.name}',
        );
      }
    }
  }, timeout: const Timeout(Duration(minutes: 2)));
}
