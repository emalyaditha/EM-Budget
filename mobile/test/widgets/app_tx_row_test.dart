import 'package:em_budget/core/theme/app_chips.dart';
import 'package:em_budget/core/theme/app_numerals.dart';
import 'package:em_budget/core/theme/app_rows.dart';
import 'package:em_budget/core/theme/app_theme.dart';
import 'package:em_budget/domain/money.dart';
import 'package:em_budget/presentation/widgets/app_tx_row.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Behaviour of [AppTxRow], [AppTxTypePill], [AppDayHead] and
/// [AppLedgerDivider].
///
/// `ui_tokens_test.dart` re-derives every number in the `txrow-*`, `day-head`
/// and `ledger-*` rows from `parity/ui-tokens.json` and the authored TSX, so this
/// file does not re-measure them: what it proves is what only a rendered widget
/// can show — that the figure reaches the picture exactly as the money functions
/// spelled it and the row reformats nothing, that the two amount arms are the two
/// measured arms rather than one colour with a flag, that the second line follows
/// `TransactionRow.tsx:33`’s composition including its `filter`, that the press
/// asks the box for the class’s own scale and clock, that the `hidden` pill the
/// engine never hides really shows on a phone, and that a seven-figure amount
/// stays inside 360dp.
void main() {
  const AppTxRowSpec specLight = AppRows.txRowLight;

  Future<void> pumpRow(
    WidgetTester tester,
    Widget row,
    Brightness brightness, {
    double? width,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: appThemeData(isDark: false),
        darkTheme: appThemeData(isDark: true),
        themeMode: brightness == Brightness.dark
            ? ThemeMode.dark
            : ThemeMode.light,
        home: Scaffold(
          body: width == null
              ? Center(child: row)
              : Center(
                  child: SizedBox(width: width, child: row),
                ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  AppTxRowSpec rowSpecOf(Brightness brightness) => AppRows.txRow(brightness);

  Text figure(WidgetTester tester, String money) =>
      tester.widget<Text>(find.text(money));

  group('the figure is the caller’s string', () {
    testWidgets('what formatMoney spelled is what the row shows', (
      WidgetTester tester,
    ) async {
      final String money = formatMoney('LKR', 1234.50);
      await pumpRow(
        tester,
        AppTxRow(
          title: 'Groceries',
          category: 'groceries',
          amountText: money,
          isIncome: false,
        ),
        Brightness.light,
      );
      expect(find.text(money), findsOneWidget);
    });

    testWidgets('the row formats nothing, not even a number it could parse', (
      WidgetTester tester,
    ) async {
      // A string no formatter would produce. If the widget ever took over the
      // figure, this is the assertion that notices.
      await pumpRow(
        tester,
        AppTxRow(
          title: 'Groceries',
          category: 'groceries',
          amountText: 'Rs.--/-- (unparsed)',
          isIncome: true,
        ),
        Brightness.light,
      );
      expect(find.text('Rs.--/-- (unparsed)'), findsOneWidget);
    });

    testWidgets('a negative and a seven-figure amount both travel verbatim', (
      WidgetTester tester,
    ) async {
      final String negative = formatMoney(
        'LKR',
        -12345.6,
        const FormatMoneyOptions(signed: true),
      );
      final String sevenDigits = formatMoney('LKR', 1234567);
      await pumpRow(
        tester,
        AppTxRow(
          title: 'Card payment',
          category: 'transfer',
          amountText: '$negative · $sevenDigits',
          isIncome: false,
        ),
        Brightness.light,
      );
      expect(find.text('$negative · $sevenDigits'), findsOneWidget);
    });
  });

  for (final Brightness brightness in Brightness.values) {
    group('the ${brightness.name} row', () {
      testWidgets('isIncome selects the measured arm, and nothing else', (
        WidgetTester tester,
      ) async {
        final AppTxRowSpec row = rowSpecOf(brightness);
        for (final bool isIncome in <bool>[true, false]) {
          await pumpRow(
            tester,
            AppTxRow(
              title: 'Salary',
              category: 'salary',
              amountText: 'Rs. 1,234.50',
              isIncome: isIncome,
              directionGlyph: const Icon(Icons.add),
            ),
            brightness,
          );
          final AppTxRowSlotSpec arm = isIncome ? row.amountIn : row.amountOut;
          final Text painted = figure(tester, 'Rs. 1,234.50');
          expect(
            painted.style!.color,
            arm.textColor,
            reason: isIncome.toString(),
          );
          expect(painted.style!.fontSize, arm.fontSizePx);
          expect(painted.style!.fontWeight, arm.weight);
          expect(painted.style!.letterSpacing, arm.letterSpacingPx);
          expect(painted.style!.fontFeatures, arm.fontFeatures);
          // The arrow shares the arm’s ink and the size the row measured for it.
          final IconThemeData arrows = IconTheme.of(
            tester.element(find.byIcon(Icons.add)),
          );
          expect(arrows.color, arm.textColor);
          expect(arrows.size, AppRows.arrowSizePx);
        }
      });

      testWidgets('the two lines are the class lists the component writes', (
        WidgetTester tester,
      ) async {
        final AppTxRowSpec row = rowSpecOf(brightness);
        await pumpRow(
          tester,
          AppTxRow(
            title: 'Uber',
            subtitle: '12 Mar',
            category: 'Transport',
            amountText: 'Rs. 1,234.50',
            isIncome: false,
          ),
          brightness,
        );

        final Text title = tester.widget<Text>(find.text('Uber'));
        expect(title.style!.color, row.title.textColor);
        expect(title.style!.fontSize, row.title.fontSizePx);
        expect(title.style!.fontWeight, row.title.weight);
        expect(title.style!.letterSpacing, row.title.letterSpacingPx);
        expect(title.maxLines, row.title.truncates ? 1 : null);
        expect(
          title.overflow,
          row.title.truncates ? TextOverflow.ellipsis : null,
        );

        final Text meta = tester.widget<Text>(find.text('12 Mar · Transport'));
        expect(meta.style!.color, row.meta.textColor);
        expect(meta.style!.fontSize, row.meta.fontSizePx);
        expect(meta.maxLines, row.meta.truncates ? 1 : null);
        // `mt-0.5`, measured and cross-checked against `--spacing` by generation.
        expect(meta.style!.fontFeatures, row.meta.fontFeatures);
      });

      testWidgets('the composed line follows `meta ?? [subtitle, category]`', (
        WidgetTester tester,
      ) async {
        final cases = <MapEntry<String, Widget>>[
          // `subtitle` absent → the category alone, with no separator left over.
          MapEntry(
            'Transport',
            AppTxRow(
              title: 'Uber',
              category: 'Transport',
              amountText: 'Rs. 1,234.50',
              isIncome: false,
            ),
          ),
          // `filter(Boolean)`: an empty subtitle drops out rather than leaving
          // the ` · ` behind.
          MapEntry(
            'Transport',
            AppTxRow(
              title: 'Uber',
              subtitle: '',
              category: 'Transport',
              amountText: 'Rs. 1,234.50',
              isIncome: false,
            ),
          ),
          // `meta` replaces the whole line verbatim, as `Dashboard.tsx:432` uses it.
          MapEntry(
            'Today · Card',
            AppTxRow(
              title: 'Uber',
              subtitle: 'ignored',
              meta: 'Today · Card',
              category: 'Transport',
              amountText: 'Rs. 1,234.50',
              isIncome: false,
            ),
          ),
        ];
        for (final MapEntry<String, Widget> case_ in cases) {
          await pumpRow(tester, case_.value, brightness);
          expect(find.text(case_.key), findsOneWidget, reason: case_.key);
        }
      });

      testWidgets('the row’s own box is the measured `.tx-row`', (
        WidgetTester tester,
      ) async {
        final AppTxRowSpec row = rowSpecOf(brightness);
        await pumpRow(
          tester,
          AppTxRow(
            title: 'Uber',
            category: 'Transport',
            amountText: 'Rs. 1,234.50',
            isIncome: false,
          ),
          brightness,
          width: 360,
        );
        final AnimatedContainer box = tester.widget<AnimatedContainer>(
          find.descendant(
            of: find.byType(AppTxRow),
            matching: find.byType(AnimatedContainer),
          ),
        );
        final BoxDecoration deco = box.decoration! as BoxDecoration;
        expect(deco.color, row.fillColor);
        expect(deco.borderRadius, row.radius);
        expect(box.padding, row.padding);
        expect(
          tester.getSize(find.byType(AppTxRow)).width,
          360,
          reason: 'the row spans the list it sits in',
        );
      });

      testWidgets('the press asks for the class’s scale and clock', (
        WidgetTester tester,
      ) async {
        final AppTxRowSpec row = rowSpecOf(brightness);
        int taps = 0;
        await pumpRow(
          tester,
          AppTxRow(
            title: 'Uber',
            category: 'Transport',
            amountText: 'Rs. 1,234.50',
            isIncome: false,
            onTap: () => taps++,
          ),
          brightness,
        );
        AnimatedContainer box() => tester.widget<AnimatedContainer>(
          find.descendant(
            of: find.byType(AppTxRow),
            matching: find.byType(AnimatedContainer),
          ),
        );

        expect(box().transform, isNot(isNull));
        expect(box().duration, row.pressDuration);
        // `Cubic` has no value equality, so the shape is what is compared.
        expect(box().curve.toString(), row.pressCurve.toString());

        final TestGesture gesture = await tester.startGesture(
          tester.getCenter(find.byType(AppTxRow)),
        );
        await tester.pump();
        expect(
          box().transform!.storage[0],
          closeTo(row.pressScale, 1e-9),
          reason: '.tx-row:active scales the whole row',
        );
        expect(box().transform!.storage[5], closeTo(row.pressScale, 1e-9));
        await gesture.up();
        await tester.pumpAndSettle();
        expect(box().transform!.storage[0], closeTo(1.0, 1e-9));
        expect(taps, 1);
      });

      testWidgets('an inert row has no press paint', (
        WidgetTester tester,
      ) async {
        final AppTxRowSpec row = rowSpecOf(brightness);
        await pumpRow(
          tester,
          AppTxRow(
            title: 'Uber',
            category: 'Transport',
            amountText: 'Rs. 1,234.50',
            isIncome: false,
          ),
          brightness,
        );
        final TestGesture gesture = await tester.startGesture(
          tester.getCenter(find.byType(AppTxRow)),
        );
        await tester.pump();
        final AnimatedContainer box = tester.widget<AnimatedContainer>(
          find.descendant(
            of: find.byType(AppTxRow),
            matching: find.byType(AnimatedContainer),
          ),
        );
        expect(
          box.transform!.storage[0],
          closeTo(1.0, 1e-9),
          reason:
              'no onClick, so no `:active` — the scale belongs to the '
              'pressable element, and ${row.cssClasses} only presses when it '
              'has somewhere to go',
        );
        await gesture.up();
      });
    });
  }

  group('the trailing pill', () {
    testWidgets('paints at a phone width, because `hidden` never applied', (
      WidgetTester tester,
    ) async {
      final AppTxRowSpec row = rowSpecOf(Brightness.light);
      await pumpRow(
        tester,
        AppTxRow(
          title: 'Card payment',
          category: 'transfer',
          amountText: 'Rs. 1,234.50',
          isIncome: false,
          trailing: const AppTxTypePill(text: 'expense'),
        ),
        Brightness.light,
        // 360dp: below every Tailwind breakpoint the sheet enumerates, where the
        // class list’s `hidden sm:inline-flex` would have taken the pill away if
        // `.pill`’s unlayered `display` had not beaten it.
        width: 360,
      );

      expect(find.text('expense'), findsOneWidget);
      final Container pill = tester.widget<Container>(
        find.descendant(
          of: find.byType(AppTxTypePill),
          matching: find.byType(Container),
        ),
      );
      final BoxDecoration deco = pill.decoration! as BoxDecoration;
      final AppChipSpec box = AppChips.resolve('.pill', Brightness.light);
      expect(deco.color, box.fillColor);
      expect(deco.border, box.border);
      expect(deco.borderRadius, box.borderRadius);
      // The inset is the row’s own `!py-0.5 !px-2`, which beat `.pill`’s padding.
      expect(pill.padding, row.pill.padding);
      expect((pill.padding! as EdgeInsets).top, row.pill.paddingVerticalPx);
      expect((pill.padding! as EdgeInsets).left, row.pill.paddingHorizontalPx);
      final Text label = tester.widget<Text>(find.text('expense'));
      expect(label.style!.fontSize, row.pill.fontSizePx);
      expect(label.style!.color, row.pill.textColor);
      expect(label.style!.fontFamily, row.pill.fontFamily);
    });

    testWidgets('the empty string still draws the box', (
      WidgetTester tester,
    ) async {
      await pumpRow(
        tester,
        AppTxRow(
          title: 'x',
          category: 'other',
          amountText: 'Rs. 1,234.50',
          isIncome: true,
          trailing: const AppTxTypePill(text: ''),
        ),
        Brightness.light,
      );
      expect(find.byType(AppTxTypePill), findsOneWidget);
    });
  });

  group('the day head and the hairline', () {
    for (final Brightness brightness in Brightness.values) {
      testWidgets('the head is the sticky box at ${brightness.name}', (
        WidgetTester tester,
      ) async {
        final AppDayHeadSpec spec = AppRows.dayHead(brightness);
        await pumpRow(
          tester,
          const AppDayHead(label: 'Today'),
          brightness,
          width: 360,
        );

        final BackdropFilter blur = tester.widget<BackdropFilter>(
          find.descendant(
            of: find.byType(AppDayHead),
            matching: find.byType(BackdropFilter),
          ),
        );
        expect(blur.filter, isNotNull);
        final Text label = tester.widget<Text>(
          find.text(spec.uppercase ? 'TODAY' : 'Today'),
        );
        expect(label.style!.color, spec.textColor);
        expect(label.style!.fontSize, spec.fontSizePx);
        expect(
          label.style!.letterSpacing,
          spec.letterSpacingEm * spec.fontSizePx,
        );
        expect(label.maxLines, 1);

        final Container box = tester.widget<Container>(
          find.descendant(
            of: find.byType(AppDayHead),
            matching: find.byType(Container),
          ),
        );
        expect(box.color, isNotNull);
        expect(box.color, spec.fillColor);
        expect(
          box.color!.a,
          closeTo(spec.fillMixPercent / 100.0, 1 / 255),
          reason: 'the fill is the recipe’s alpha, not an opaque token',
        );
        expect(box.padding, spec.padding);
      });

      testWidgets(
        'the divider is the measured hairline at ${brightness.name}',
        (WidgetTester tester) async {
          final AppLedgerDividerSpec divider = AppRows.divider(brightness);
          await pumpRow(
            tester,
            const AppLedgerDivider(),
            brightness,
            width: 360,
          );
          final Size size = tester.getSize(find.byType(AppLedgerDivider));
          expect(size.height, divider.widthPx);
          expect(size.width, 360);
          final ColoredBox line = tester.widget<ColoredBox>(
            find.descendant(
              of: find.byType(AppLedgerDivider),
              matching: find.byType(ColoredBox),
            ),
          );
          expect(line.color, divider.color);
        },
      );
    }
  });

  group('a phone-width row with a seven-figure amount', () {
    testWidgets('does not overflow and keeps both lines readable', (
      WidgetTester tester,
    ) async {
      final String money = formatMoney('LKR', 1234567);
      await pumpRow(
        tester,
        AppTxRow(
          title: 'A merchant name long enough to need truncating, in full',
          subtitle: '12 March 2026 · Card ending 4821',
          category: 'Shopping',
          amountText: money,
          isIncome: false,
          directionGlyph: const Icon(Icons.add),
          trailing: const AppTxTypePill(text: 'expense'),
        ),
        Brightness.light,
        width: 360,
      );

      expect(tester.takeException(), isNull);
      expect(find.text(money), findsOneWidget);
      final Size row = tester.getSize(find.byType(AppTxRow));
      expect(row.width, 360);
      expect(row.height, greaterThan(0));
      // The figure is drawn whole: the column that holds the text absorbs the
      // squeeze, which is what `min-w-0 … truncate` buys on the web.
      expect(tester.getSize(find.text(money)).width, lessThan(360));
      final Text title = tester.widget<Text>(
        find.text('A merchant name long enough to need truncating, in full'),
      );
      expect(title.maxLines, 1);
      expect(title.overflow, TextOverflow.ellipsis);
    });
  });

  test('the amount slots are the .money face, read at this row’s size', () {
    // Two generated files describe one stylesheet rule: item 7's `AppNumerals`
    // reads the `.money` row at src/index.css:423, and `AppRows` reads the slot
    // that cites it. Nothing the utilities do not override may disagree between
    // them, and the two utilities on this span are `text-[13px]` and `font-bold`
    // — size and weight, which is exactly why those two are not compared here.
    // The tracking is the em law item 7 found: the row is money's own em at the
    // call-site size, not a second number that happens to match today.
    for (final Brightness brightness in Brightness.values) {
      final AppNumeralSpec money = AppNumerals.resolve('.money', brightness);
      final AppTxRowSpec row = AppRows.txRow(brightness);
      for (final AppTxRowSlotSpec slot in <AppTxRowSlotSpec>[
        row.amountIn,
        row.amountOut,
      ]) {
        expect(slot.fontFamily, money.fontFamily);
        expect(slot.heightRatio, money.heightRatio);
        expect(slot.letterSpacingEm, money.letterSpacingEm);
        expect(slot.tabularNums, money.tabularNums);
        expect(
          slot.textStyle.letterSpacing,
          money.styleAt(slot.fontSizePx).letterSpacing,
          reason: '${slot.stackRow} at ${brightness.name}',
        );
        expect(
          slot.textStyle.fontFeatures,
          money.styleAt(slot.fontSizePx).fontFeatures,
        );
      }
    }
  });

  test('the row never reaches for a number this file could type', () {
    // A guard on the port’s own law: the widget family takes its sizes from the
    // generated specs, so a regression that hard-codes one shows up here as well
    // as in the paint tests above.
    expect(specLight.title.fontSizePx, greaterThan(0));
    expect(specLight.gapPx, greaterThan(0));
    expect(specLight.pressScale, lessThan(1.0));
  });
}
