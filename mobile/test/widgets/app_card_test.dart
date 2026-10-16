import 'dart:ui' as ui;

import 'package:em_budget/core/theme/app_surfaces.dart';
import 'package:em_budget/core/theme/app_theme.dart';
import 'package:em_budget/presentation/widgets/app_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Structural assertions for [AppCard]: every value checked here is re-read
/// from [AppSurfaces], so a passing test proves the card drew the measured row
/// rather than a number someone typed.
void main() {
  const List<AppCardSurface> surfaces = AppCardSurface.values;

  /// MaterialApp lerps its theme, so a brightness switch is only visible once the
  /// animation lands; reading Theme.of before that returns the previous pass.
  Future<ThemeData> pumpCard(
    WidgetTester tester,
    Widget card,
    Brightness brightness,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: appThemeData(isDark: false),
        darkTheme: appThemeData(isDark: true),
        themeMode: brightness == Brightness.dark
            ? ThemeMode.dark
            : ThemeMode.light,
        home: Scaffold(body: card),
      ),
    );
    await tester.pumpAndSettle();
    final ThemeData delivered = Theme.of(tester.element(find.byType(AppCard)));
    expect(
      delivered.brightness,
      brightness,
      reason: "the harness must deliver the pass the card resolves against",
    );
    return delivered;
  }

  List<DecoratedBox> boxes(WidgetTester tester) => tester
      .widgetList<DecoratedBox>(
        find.descendant(
          of: find.byType(AppCard),
          matching: find.byType(DecoratedBox),
        ),
      )
      .toList();

  /// The box that paints fill, gradient and border. A card with a backdrop is
  /// two boxes: an unclipped one carrying the shadow, then the clipped paint box.
  DecoratedBox paintBox(WidgetTester tester, AppSurfaceSpec spec) {
    final List<DecoratedBox> painted = boxes(tester);
    if (spec.blurPx == null) {
      expect(painted, hasLength(1), reason: '${spec.cssClass} is one box');
      return painted.single;
    }
    expect(
      painted,
      hasLength(2),
      reason: '${spec.cssClass} splits shadow from fill',
    );
    return painted.last;
  }

  group('AppCardSurface', () {
    test('names exactly the classes AppSurfaces measured', () {
      final List<String> expected = surfaces
          .map((AppCardSurface s) => s.cssClass)
          .toList();
      expected.sort();
      expect(AppSurfaces.light.keys.toList()..sort(), expected);
      expect(AppSurfaces.dark.keys.toList()..sort(), expected);
    });

    test('resolves in both passes', () {
      for (final AppCardSurface surface in surfaces) {
        for (final Brightness brightness in Brightness.values) {
          expect(
            AppSurfaces.resolve(surface.cssClass, brightness).cssClass,
            surface.cssClass,
          );
        }
      }
    });
  });

  group('the painted box', () {
    for (final AppCardSurface surface in surfaces) {
      for (final Brightness brightness in Brightness.values) {
        testWidgets(
          '${surface.cssClass} in ${brightness == Brightness.dark ? 'dark' : 'light'} draws its measured row',
          (WidgetTester tester) async {
            await pumpCard(
              tester,
              AppCard(surface: surface, child: const SizedBox.shrink()),
              brightness,
            );
            final AppSurfaceSpec spec = AppSurfaces.resolve(
              surface.cssClass,
              brightness,
            );
            final BoxDecoration painted =
                paintBox(tester, spec).decoration as BoxDecoration;

            expect(painted.borderRadius, spec.borderRadius);
            expect(painted.gradient, spec.fillGradient);
            expect(
              painted.color,
              spec.paintsFill ? spec.fillColor : null,
              reason: 'a transparent fill paints nothing behind it',
            );

            if (spec.borderWidthPx == 0) {
              expect(
                painted.border,
                isNull,
                reason: '${spec.cssClass} declares no border',
              );
            } else {
              expect(painted.border, isNotNull);
              expect(painted.border!.top.width, spec.borderWidthPx);
              expect(painted.border!.top.color, spec.borderColor);
            }

            final DecoratedBox shadowed = spec.blurPx == null
                ? paintBox(tester, spec)
                : boxes(tester).first;
            expect(
              (shadowed.decoration as BoxDecoration).boxShadow,
              spec.shadows,
              reason: spec.blurPx == null
                  ? 'the box carries its own shadow'
                  : 'the shadow rides the unclipped outer box',
            );
          },
        );
      }
    }
  });

  group('the backdrop', () {
    for (final AppCardSurface surface in surfaces) {
      testWidgets(
        '${surface.cssClass} blurs only what the measurement blurred',
        (WidgetTester tester) async {
          for (final Brightness brightness in Brightness.values) {
            await pumpCard(
              tester,
              AppCard(surface: surface, child: const SizedBox.shrink()),
              brightness,
            );
            final AppSurfaceSpec spec = AppSurfaces.resolve(
              surface.cssClass,
              brightness,
            );
            final Finder filters = find.descendant(
              of: find.byType(AppCard),
              matching: find.byType(BackdropFilter),
            );
            if (spec.blurPx == null) {
              expect(
                filters,
                findsNothing,
                reason: '${surface.cssClass} has no backdrop-filter',
              );
              continue;
            }
            expect(filters, findsOneWidget);
            final BackdropFilter backdrop = tester.widget(filters);
            expect(backdrop.filter, isA<ui.ImageFilter>());
            final double sigma = spec.blurSigma!;
            expect(
              backdrop.filter.toString(),
              ui.ImageFilter.blur(sigmaX: sigma, sigmaY: sigma).toString(),
              reason:
                  'CSS blurs in pixels, Flutter in sigmas: sigma = blurPx / 2',
            );
            expect(
              backdrop.filter.toString(),
              isNot(
                ui.ImageFilter.blur(
                  sigmaX: sigma + 1,
                  sigmaY: sigma + 1,
                ).toString(),
              ),
              reason: 'the comparison above must be able to fail: the string carries the sigmas',
            );
            expect(
              find.descendant(
                of: find.byType(AppCard),
                matching: find.byType(ClipRRect),
              ),
              findsOneWidget,
              reason: 'the filter is clipped to the measured radius',
            );
          }
        },
      );
    }
  });

  group('padding', () {
    for (final AppCardSurface surface in surfaces) {
      testWidgets('${surface.cssClass} pads itself with its measured padding', (
        WidgetTester tester,
      ) async {
        await pumpCard(
          tester,
          AppCard(surface: surface, child: const SizedBox.shrink()),
          Brightness.light,
        );
        final Padding padding = tester.widget(
          find
              .descendant(
                of: find.byType(AppCard),
                matching: find.byType(Padding),
              )
              .first,
        );
        expect(
          padding.padding,
          EdgeInsets.all(
            AppSurfaces.resolve(surface.cssClass, Brightness.light).paddingPx,
          ),
        );
      });
    }

    testWidgets('a caller-supplied padding wins', (WidgetTester tester) async {
      const EdgeInsets mine = EdgeInsets.all(17.0);
      await pumpCard(
        tester,
        AppCard(padding: mine, child: const SizedBox.shrink()),
        Brightness.light,
      );
      final Padding padding = tester.widget(
        find
            .descendant(
              of: find.byType(AppCard),
              matching: find.byType(Padding),
            )
            .first,
      );
      expect(padding.padding, mine);
    });
  });

  group('radius override', () {
    testWidgets('replaces the radius and nothing else', (
      WidgetTester tester,
    ) async {
      final AppSurfaceSpec spec = AppSurfaces.resolve(
        '.card',
        Brightness.light,
      );
      await pumpCard(
        tester,
        AppCard(radius: 7.0, child: const SizedBox.shrink()),
        Brightness.light,
      );
      final BoxDecoration painted =
          paintBox(tester, spec).decoration as BoxDecoration;
      expect(painted.borderRadius, BorderRadius.circular(7.0));
      expect(painted.boxShadow, spec.shadows);
      expect(painted.border!.top.width, spec.borderWidthPx);
      expect(painted.border!.top.color, spec.borderColor);
    });
  });

  group('text colour', () {
    for (final AppCardSurface surface in surfaces) {
      testWidgets(
        '${surface.cssClass} repaints text only where the class does',
        (WidgetTester tester) async {
          for (final Brightness brightness in Brightness.values) {
            await pumpCard(
              tester,
              AppCard(surface: surface, child: const SizedBox.shrink()),
              brightness,
            );
            final AppSurfaceSpec spec = AppSurfaces.resolve(
              surface.cssClass,
              brightness,
            );
            final ThemeData theme = Theme.of(
              tester.element(find.byType(AppCard)),
            );
            final Finder merged = find.descendant(
              of: find.byType(AppCard),
              matching: find.byType(DefaultTextStyle),
            );
            if (spec.textColor == theme.colorScheme.onSurface) {
              expect(
                merged,
                findsNothing,
                reason:
                    '${surface.cssClass} inherits ink: merging a style would '
                    'freeze a colour the screen above it is still choosing',
              );
              continue;
            }
            expect(merged, findsOneWidget);
            final DefaultTextStyle style = tester.widget(merged);
            expect(style.style.color, spec.textColor);
          }
        },
      );
    }
  });

  testWidgets('the child survives the paint', (WidgetTester tester) async {
    final Key marker = UniqueKey();
    await pumpCard(
      tester,
      AppCard(
        surface: AppCardSurface.glassPanel,
        child: SizedBox(key: marker, width: 4, height: 4),
      ),
      Brightness.light,
    );
    expect(find.byKey(marker), findsOneWidget);
  });
}
