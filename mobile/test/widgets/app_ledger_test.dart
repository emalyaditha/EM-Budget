import 'package:em_budget/core/theme/app_rows.dart';
import 'package:em_budget/core/theme/app_theme.dart';
import 'package:em_budget/presentation/widgets/app_ledger.dart';
import 'package:em_budget/presentation/widgets/app_tx_row.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Behaviour of [AppLedger], [AppLedgerSection] and the two empty states.
///
/// The numbers this file checks are read from [AppRows] rather than written
/// here, because the point of the widget tier is that the rails, gutters,
/// max-heights, dividers and day-head pins all come from the measured
/// `ledger-*` rows. What only a rendered widget can show: that the rail takes its
/// wide pair above the breakpoint and its narrow pair below, that a `visible`
/// rail does not become a scroll view, that `divide-y` draws N−1 lines and stops
/// at the group boundary, that `space-y-*`’s margin falls on every child after
/// the first, that a day group brings a pinned header, and that the empty box is
/// a child of the rail rather than an overlay.
void main() {
  // The dashboard’s `lg:` and the Reports Centre’s always-on rail, taken from the
  // emitted specs so this file cannot disagree with them.
  const AppLedgerRailSpec dashboard = AppRows.ledgerRail;
  const AppLedgerRailSpec reports = AppRows.reportsRail;

  // A wide viewport for the dashboard rail is its `lg:` pair; the enumeration
  // lives in parity/STATUS.md and is the caller’s to supply, so it is a number
  // this harness picks, not one the port hides.
  const double wideBreakpointPx = 1024.0;

  Widget row(int index, Brightness brightness) => AppTxRow(
    title: 'Row $index',
    category: 'category $index',
    amountText: 'Rs. 1,234.50',
    isIncome: index.isEven,
  );

  Future<void> pumpLedger(
    WidgetTester tester,
    Widget ledger,
    double width,
  ) async {
    await tester.binding.setSurfaceSize(Size(width, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      MaterialApp(
        theme: appThemeData(isDark: false),
        darkTheme: appThemeData(isDark: true),
        home: Scaffold(
          body: Align(alignment: Alignment.topLeft, child: ledger),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  /// The rail’s own `space-y` margins, read where the rail applies them.
  ///
  /// `SliverPadding` is only ever the rail speaking: a row’s own `mt-0.5` is a
  /// `Padding` inside the row, and a group’s rows are a `SliverList` under the
  /// group’s own `SliverPadding`, so this list is exactly the child sequence.
  List<double> railMargins(WidgetTester tester) => <double>[
    for (final SliverPadding pad in tester.widgetList<SliverPadding>(
      find.byType(SliverPadding),
    ))
      (pad.padding as EdgeInsets).top,
  ];

  group('the dashboard rail', () {
    testWidgets(
      'is a plain column below the breakpoint, where it measures `visible`',
      (WidgetTester tester) async {
        await pumpLedger(
          tester,
          AppLedger(
            rail: dashboard,
            wideBreakpointPx: wideBreakpointPx,
            sections: <AppLedgerSection>[
              AppLedgerSection(
                dayLabel: 'Today',
                rows: <Widget>[
                  row(0, Brightness.light),
                  row(1, Brightness.light),
                ],
              ),
            ],
          ),
          360,
        );

        expect(dashboard.narrowOverflowYCss, 'visible');
        expect(find.byType(CustomScrollView), findsNothing);
        expect(
          tester
              .widget<Column>(
                find
                    .descendant(
                      of: find.byType(AppLedger),
                      matching: find.byType(Column),
                    )
                    .first,
              )
              .children,
          isNotEmpty,
        );
        // `lg:pr-1`: the gutter the rail reserves is gated with the same pair.
        expect(
          tester
              .widget<Padding>(
                find
                    .descendant(
                      of: find.byType(AppLedger),
                      matching: find.byType(Padding),
                    )
                    .first,
              )
              .padding,
          EdgeInsets.only(right: dashboard.narrowPaddingRightPx),
        );
      },
    );

    testWidgets('scrolls inside its measured max-height above the breakpoint', (
      WidgetTester tester,
    ) async {
      await pumpLedger(
        tester,
        AppLedger(
          rail: dashboard,
          wideBreakpointPx: wideBreakpointPx,
          sections: <AppLedgerSection>[
            AppLedgerSection(
              dayLabel: 'Today',
              rows: <Widget>[
                for (int i = 0; i < 20; i++) row(i, Brightness.light),
              ],
            ),
          ],
        ),
        1440,
      );

      expect(dashboard.wideOverflowYCss, 'auto');
      expect(dashboard.wideMaxHeightPx, isNotNull);
      final ConstrainedBox bound = tester.widget<ConstrainedBox>(
        find
            .descendant(
              of: find.byType(AppLedger),
              matching: find.byType(ConstrainedBox),
            )
            .first,
      );
      expect(bound.constraints.maxHeight, dashboard.wideMaxHeightPx);
      expect(
        tester
            .widget<Padding>(
              find
                  .descendant(
                    of: find.byType(AppLedger),
                    matching: find.byType(Padding),
                  )
                  .first,
            )
            .padding,
        EdgeInsets.only(right: dashboard.widePaddingRightPx),
      );
      expect(
        tester.getSize(find.byType(AppLedger)).height,
        dashboard.wideMaxHeightPx,
      );
    });

    testWidgets('a day group brings one pinned header and N−1 hairlines', (
      WidgetTester tester,
    ) async {
      await pumpLedger(
        tester,
        AppLedger(
          rail: dashboard,
          wideBreakpointPx: wideBreakpointPx,
          sections: <AppLedgerSection>[
            AppLedgerSection(
              dayLabel: 'Today',
              rows: <Widget>[
                for (int i = 0; i < 3; i++) row(i, Brightness.light),
              ],
            ),
            AppLedgerSection(
              dayLabel: 'Yesterday',
              rows: <Widget>[
                for (int i = 0; i < 2; i++) row(i, Brightness.light),
              ],
            ),
          ],
        ),
        1440,
      );

      // Three pinned headers would be wrong: two groups, two headers.
      final SliverPersistentHeader header = tester
          .widget<SliverPersistentHeader>(
            find
                .descendant(
                  of: find.byType(AppLedger),
                  matching: find.byType(SliverPersistentHeader),
                )
                .first,
          );
      expect(header.pinned, isTrue);
      expect(
        find.descendant(
          of: find.byType(AppLedger),
          matching: find.byType(SliverPersistentHeader),
        ),
        findsNWidgets(2),
      );
      expect(find.byType(AppDayHead), findsNWidgets(2));
      // 3−1 plus 2−1, and nothing between the groups: `divide-y` restarts inside
      // each day, which is what the web’s per-group container does.
      expect(find.byType(AppLedgerDivider), findsNWidgets(3));
      // No `space-y-*` on this rail, so no child asks for a margin.
      expect(dashboard.rowMarginTopPx, isNull);
      expect(railMargins(tester).where((double m) => m != 0.0), isEmpty);
    });

    testWidgets(
      'the header is the measured `.eyebrow`, shouted as the class asks',
      (WidgetTester tester) async {
        final AppDayHeadSpec head = AppRows.dayHead(Brightness.light);
        await pumpLedger(
          tester,
          AppLedger(
            rail: dashboard,
            wideBreakpointPx: wideBreakpointPx,
            sections: <AppLedgerSection>[
              AppLedgerSection(
                dayLabel: 'Today',
                rows: <Widget>[row(0, Brightness.light)],
              ),
            ],
          ),
          1440,
        );
        expect(
          find.text(head.uppercase ? 'TODAY' : 'Today'),
          findsOneWidget,
          reason: 'the screen hands over the day as it reads; `.eyebrow` does the shouting',
        );
        final SliverPersistentHeader pinned = tester
            .widget<SliverPersistentHeader>(
              find.byType(SliverPersistentHeader),
            );
        expect(
          pinned.delegate.maxExtent,
          closeTo(
            head.fontSizePx * head.heightRatio +
                head.padding.top +
                head.padding.bottom,
            1e-9,
          ),
        );
      },
    );

    testWidgets('an empty rail shows the dashed box as its only child', (
      WidgetTester tester,
    ) async {
      final AppLedgerEmptySpec empty = AppRows.empty(Brightness.light);
      await pumpLedger(
        tester,
        AppLedger(
          rail: dashboard,
          wideBreakpointPx: wideBreakpointPx,
          sections: const <AppLedgerSection>[],
          empty: AppLedgerEmpty(
            child: Column(
              children: <Widget>[
                const Text('No activity'),
                const Text('No ledger entries yet.'),
              ],
            ),
          ),
        ),
        1440,
      );

      final Container box = tester.widget<Container>(
        find.descendant(
          of: find.byType(AppLedgerEmpty),
          matching: find.byType(Container),
        ),
      );
      final BoxDecoration deco = box.decoration! as BoxDecoration;
      expect(deco.color, empty.fillColor);
      expect(deco.borderRadius, empty.radius);
      expect(box.padding, empty.padding);
      expect(find.text('No activity'), findsOneWidget);
      expect(find.byType(AppLedgerDivider), findsNothing);
      // The box is a rail child, and a lone one: no `space-y` margin above it.
      expect(railMargins(tester), <double>[0.0]);
    });
  });

  group('the Reports Centre rail', () {
    testWidgets(
      'is bounded and scrollable at a phone width, where it measures auto',
      (WidgetTester tester) async {
        await pumpLedger(
          tester,
          AppLedger(
            rail: reports,
            wideBreakpointPx: wideBreakpointPx,
            sections: <AppLedgerSection>[
              AppLedgerSection(
                divides: false,
                rows: <Widget>[
                  for (int i = 0; i < 5; i++) row(i, Brightness.light),
                ],
              ),
            ],
          ),
          360,
        );

        expect(reports.narrowOverflowYCss, 'auto');
        expect(reports.narrowMaxHeightPx, isNotNull);
        expect(find.byType(CustomScrollView), findsOneWidget);
        expect(
          tester
              .widget<ConstrainedBox>(
                find
                    .descendant(
                      of: find.byType(AppLedger),
                      matching: find.byType(ConstrainedBox),
                    )
                    .first,
              )
              .constraints
              .maxHeight,
          reports.narrowMaxHeightPx,
        );
        // `pr-1` at both viewports on this rail.
        expect(
          (tester
                      .widget<Padding>(
                        find
                            .descendant(
                              of: find.byType(AppLedger),
                              matching: find.byType(Padding),
                            )
                            .first,
                      )
                      .padding
                  as EdgeInsets)
              .right,
          reports.narrowPaddingRightPx,
        );
      },
    );

    testWidgets('`space-y-1` puts its margin on every child after the first', (
      WidgetTester tester,
    ) async {
      await pumpLedger(
        tester,
        AppLedger(
          rail: reports,
          wideBreakpointPx: wideBreakpointPx,
          sections: <AppLedgerSection>[
            AppLedgerSection(
              divides: false,
              rows: <Widget>[
                for (int i = 0; i < 4; i++) row(i, Brightness.light),
              ],
            ),
          ],
        ),
        360,
      );

      expect(reports.rowMarginTopPx, isNotNull);
      // Four rail children: the first takes nothing (`:not(:first-child)`), the
      // other three ask for the margin generation derived from `space-y-1`.
      expect(railMargins(tester), <double>[
        0.0,
        reports.rowMarginTopPx!,
        reports.rowMarginTopPx!,
        reports.rowMarginTopPx!,
      ]);
    });

    testWidgets('its undivided rows draw no hairline, and it has no day head', (
      WidgetTester tester,
    ) async {
      await pumpLedger(
        tester,
        AppLedger(
          rail: reports,
          wideBreakpointPx: wideBreakpointPx,
          sections: <AppLedgerSection>[
            AppLedgerSection(
              divides: false,
              rows: <Widget>[
                for (int i = 0; i < 3; i++) row(i, Brightness.light),
              ],
            ),
          ],
        ),
        360,
      );
      expect(find.byType(AppLedgerDivider), findsNothing);
      expect(find.byType(AppDayHead), findsNothing);
    });

    testWidgets(
      'its empty state is a bare column, because `empty` is declared nowhere',
      (WidgetTester tester) async {
        final AppLedgerEmptyRcSpec spec = AppRows.emptyRc(Brightness.light);
        await pumpLedger(
          tester,
          AppLedger(
            rail: reports,
            wideBreakpointPx: wideBreakpointPx,
            sections: const <AppLedgerSection>[],
            empty: const AppLedgerEmptyRc(
              line: 'No entries match this filter.',
              glyph: Icon(Icons.search),
            ),
          ),
          360,
        );

        final Column column = tester.widget<Column>(
          find.descendant(
            of: find.byType(AppLedgerEmptyRc),
            matching: find.byType(Column),
          ),
        );
        expect(column.crossAxisAlignment, CrossAxisAlignment.center);
        expect(column.mainAxisSize, MainAxisSize.min);
        // The gap and the inset the row measured, and no frame: the class that would
        // have painted one is cited in the component and declared in no stylesheet.
        final List<SizedBox> gaps = tester
            .widgetList<SizedBox>(
              find.descendant(
                of: find.byType(AppLedgerEmptyRc),
                matching: find.byType(SizedBox),
              ),
            )
            .toList();
        expect(gaps.any((SizedBox s) => s.height == spec.gapPx), isTrue);
        final Text line = tester.widget<Text>(
          find.text('No entries match this filter.'),
        );
        expect(line.style!.fontSize, spec.line.fontSizePx);
        expect(line.style!.color, spec.line.textColor);
        expect(find.byType(AppLedgerEmpty), findsNothing);
        expect(tester.takeException(), isNull);
      },
    );
  });

  testWidgets(
    'a rail with nothing in it and no empty state draws no scroll view',
    (WidgetTester tester) async {
      await pumpLedger(
        tester,
        AppLedger(
          rail: reports,
          wideBreakpointPx: wideBreakpointPx,
          sections: const <AppLedgerSection>[],
        ),
        360,
      );
      expect(find.byType(AppLedgerEmpty), findsNothing);
      expect(find.byType(AppTxRow), findsNothing);
      expect(find.byType(CustomScrollView), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('brightness reaches every part of a ledger', (
    WidgetTester tester,
  ) async {
    for (final Brightness brightness in Brightness.values) {
      await tester.binding.setSurfaceSize(Size(1440, 900));
      await tester.pumpWidget(
        MaterialApp(
          theme: appThemeData(isDark: false),
          darkTheme: appThemeData(isDark: true),
          themeMode: brightness == Brightness.dark
              ? ThemeMode.dark
              : ThemeMode.light,
          home: Scaffold(
            body: AppLedger(
              rail: dashboard,
              wideBreakpointPx: wideBreakpointPx,
              sections: <AppLedgerSection>[
                AppLedgerSection(
                  dayLabel: 'Today',
                  rows: <Widget>[row(0, brightness)],
                ),
              ],
              empty: AppLedgerEmpty(child: const Text('No activity')),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        AppRows.divider(brightness).color,
        isNot(
          AppRows.divider(
            brightness == Brightness.light ? Brightness.dark : Brightness.light,
          ).color,
        ),
      );
      expect(
        find.byType(AppLedgerDivider),
        findsNothing,
        reason: 'one row in the group is nothing to divide',
      );
      final Container head = tester.widget<Container>(
        find.descendant(
          of: find.byType(AppDayHead),
          matching: find.byType(Container),
        ),
      );
      expect(head.color, AppRows.dayHead(brightness).fillColor);
    }
    addTearDown(() => tester.binding.setSurfaceSize(null));
  });

  testWidgets('seven-figure figures and long names stay inside 360dp', (
    WidgetTester tester,
  ) async {
    await pumpLedger(
      tester,
      AppLedger(
        rail: reports,
        wideBreakpointPx: wideBreakpointPx,
        sections: <AppLedgerSection>[
          AppLedgerSection(
            divides: false,
            rows: <Widget>[
              for (int i = 0; i < 6; i++)
                AppTxRow(
                  title:
                      'A merchant name long enough to need truncating, in full',
                  subtitle: '12 March 2026 · Card ending 4821',
                  category: 'Shopping',
                  amountText: 'Rs. 1,234,567.00',
                  isIncome: i.isEven,
                  trailing: const AppTxTypePill(text: 'expense'),
                ),
            ],
          ),
        ],
      ),
      360,
    );
    expect(tester.takeException(), isNull);
    expect(find.byType(AppTxRow), findsNWidgets(6));
    expect(
      tester.getSize(find.byType(AppLedger)).width,
      lessThanOrEqualTo(360),
    );
  });
}
