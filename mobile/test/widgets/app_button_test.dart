import 'package:em_budget/core/theme/app_controls.dart';
import 'package:em_budget/core/theme/app_theme.dart';
import 'package:em_budget/presentation/widgets/app_button.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Structural assertions for [AppButton]. Every expectation re-reads its value
/// from [AppControls] — the measured §6 row plus the authored `:active` and
/// `:disabled` rules — so a passing test proves the button painted the row rather
/// than a number someone typed here.
void main() {
  const List<AppButtonControl> controls = AppButtonControl.values;

  /// MaterialApp lerps its theme, so a brightness switch is only visible once the
  /// animation lands; reading `Theme.of` before that returns the previous pass.
  Future<void> pumpButton(
    WidgetTester tester,
    Widget button,
    Brightness brightness,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: appThemeData(isDark: false),
        darkTheme: appThemeData(isDark: true),
        themeMode: brightness == Brightness.dark
            ? ThemeMode.dark
            : ThemeMode.light,
        home: Scaffold(body: Center(child: button)),
      ),
    );
    await tester.pumpAndSettle();
    final ThemeData delivered = Theme.of(
      tester.element(find.byType(AppButton)),
    );
    expect(
      delivered.brightness,
      brightness,
      reason: 'the harness must deliver the pass the button resolves against',
    );
  }

  AppControlSpec specOf(AppButtonControl control, Brightness brightness) =>
      AppControls.resolve(control.cssClass, brightness);

  /// AppButton’s own box, isolated from any `DecoratedBox` the shell paints.
  Finder boxFinder(WidgetTester tester) => find.descendant(
    of: find.byType(AppButton),
    matching: find.byType(DecoratedBox),
  );

  /// The one box AppButton paints. `Container` clips nothing here (no
  /// `clipBehavior`) and has no foreground decoration, so a second `DecoratedBox`
  /// would mean the widget grew a layer the measurement never saw.
  BoxDecoration paintBox(WidgetTester tester) {
    final List<DecoratedBox> painted = tester
        .widgetList<DecoratedBox>(boxFinder(tester))
        .toList();
    expect(painted, hasLength(1), reason: 'AppButton is one box');
    // `DecoratedBox.decoration` is typed `Decoration`, the base class.
    final BoxDecoration? decoration =
        painted.single.decoration as BoxDecoration?;
    if (decoration == null) {
      throw StateError('the AppButton box carries no decoration');
    }
    return decoration;
  }

  /// How far the box is translated on the Y axis. `Container` applies `transform`
  /// outside `DecoratedBox`, so the whole box moves — which is what CSS
  /// `transform` does. `Matrix4` stores the translation in column 3: index 13 is Y.
  double translatedBy(WidgetTester tester) {
    final List<Transform> moved = tester
        .widgetList<Transform>(
          find.descendant(
            of: find.byType(AppButton),
            matching: find.byType(Transform),
          ),
        )
        .toList();
    if (moved.isEmpty) return 0.0;
    expect(
      moved,
      hasLength(1),
      reason: 'one transform, or two moved the box twice',
    );
    return moved.single.transform.storage[13];
  }

  /// The insets between the painted box and the label. Two of them, and both are
  /// part of the port: `Container` derives the border inset from the decoration
  /// (`BoxDecoration.padding` is `border.dimensions`), which is how CSS
  /// `box-sizing: border-box` keeps content inside the frame, and AppButton
  /// applies the measured `padding` inside it, in that order.
  List<EdgeInsetsGeometry> insetsOf(WidgetTester tester) => tester
      .widgetList<Padding>(
        find.descendant(
          of: find.byType(AppButton),
          matching: find.byType(Padding),
        ),
      )
      .map((Padding p) => p.padding)
      .toList();

  /// The one box the button animates, read off the widget rather than assumed.
  AnimatedContainer animBox(WidgetTester tester) =>
      tester.widget<AnimatedContainer>(
        find.descendant(
          of: find.byType(AppButton),
          matching: find.byType(AnimatedContainer),
        ),
      );

  Future<TestGesture> pressDown(WidgetTester tester) =>
      tester.startGesture(tester.getCenter(find.byType(AppButton)));

  group('AppButtonControl', () {
    test('names exactly the classes AppControls measured', () {
      final List<String> expected =
          controls.map((AppButtonControl c) => c.cssClass).toList()..sort();
      expect(AppControls.light.keys.toList()..sort(), expected);
      expect(AppControls.dark.keys.toList()..sort(), expected);
    });

    test('resolves in both passes', () {
      for (final AppButtonControl control in controls) {
        for (final Brightness brightness in Brightness.values) {
          expect(
            AppControls.resolve(control.cssClass, brightness).cssClass,
            control.cssClass,
          );
        }
      }
    });
  });

  group('the resting box', () {
    for (final AppButtonControl control in controls) {
      for (final Brightness brightness in Brightness.values) {
        testWidgets('${control.cssClass} in '
            '${brightness == Brightness.dark ? 'dark' : 'light'} draws its '
            'measured row', (WidgetTester tester) async {
          await pumpButton(
            tester,
            AppButton(
              control: control,
              onPressed: _noop,
              child: const Text('Save'),
            ),
            brightness,
          );
          final AppControlSpec spec = specOf(control, brightness);
          final BoxDecoration box = paintBox(tester);

          expect(box.color, spec.fillColor);
          expect(box.borderRadius, spec.borderRadius);
          expect(box.border, spec.border);
          expect(
            box.boxShadow,
            isNull,
            reason:
                '${spec.cssClass} measures box-shadow: none, and '
                'AppControlSpec carries no shadow to paint',
          );
          expect(
            box.gradient,
            isNull,
            reason: 'neither §6 control paints a gradient',
          );
          expect(
            translatedBy(tester),
            0.0,
            reason: 'the box is at rest until it is pressed',
          );

          expect(
            insetsOf(tester),
            <EdgeInsetsGeometry>[
              EdgeInsets.all(spec.borderWidthPx),
              spec.padding,
            ],
            reason:
                'the label sits the measured padding inside the painted '
                'border, which is what CSS border-box does',
          );
          expect(
            animBox(tester).duration,
            spec.transitionDuration,
            reason:
                '${spec.cssClass} runs its own authored clock, '
                'not a duration the widget chose',
          );
          final Cubic curve = animBox(tester).curve as Cubic;
          expect(
            <double>[curve.a, curve.b, curve.c, curve.d],
            <double>[spec.easeX1, spec.easeY1, spec.easeX2, spec.easeY2],
            reason: 'Cubic has no value equality, so the four numbers are what compare',
          );

          final TextStyle painted = DefaultTextStyle.of(
            tester.element(find.text('Save')),
          ).style;
          expect(
            painted.fontFamily,
            spec.fontFamily,
            reason:
                'the class sets '
                'its own --font-display; inheriting the theme body font would '
                'quietly repaint the label',
          );
          expect(painted.color, spec.textColor);
          expect(painted.fontSize, spec.fontSizePx);
          expect(painted.fontWeight, spec.weight);
          expect(painted.height, spec.heightRatio);
          expect(painted.letterSpacing, spec.letterSpacingPx);
        });
      }
    }

    testWidgets(
      'padding is the measured shorthand unless the caller names one',
      (WidgetTester tester) async {
        for (final AppButtonControl control in controls) {
          await pumpButton(
            tester,
            AppButton(
              control: control,
              onPressed: _noop,
              child: const Text('Save'),
            ),
            Brightness.light,
          );
          expect(
            insetsOf(tester).last,
            specOf(control, Brightness.light).padding,
            reason: '${control.cssClass} pads itself',
          );
        }
        const EdgeInsets caller = EdgeInsets.fromLTRB(3, 4, 5, 6);
        await pumpButton(
          tester,
          const AppButton(
            onPressed: _noop,
            padding: caller,
            child: Text('Save'),
          ),
          Brightness.light,
        );
        expect(
          insetsOf(tester).last,
          caller,
          reason: 'a caller’s padding wins, the way a utility beats the class',
        );
      },
    );

    testWidgets('there is no ink: no ripple, no highlight, no Material layer', (
      WidgetTester tester,
    ) async {
      await pumpButton(
        tester,
        const AppButton(onPressed: _noop, child: Text('Save')),
        Brightness.light,
      );
      for (final Type ink in <Type>[InkWell, Ink, Material]) {
        expect(
          find.descendant(
            of: find.byType(AppButton),
            matching: find.byType(ink),
          ),
          findsNothing,
          reason: '$ink would paint feedback the §6 row does not carry',
        );
      }
    });
  });

  group('the pressed state', () {
    for (final AppButtonControl control in controls) {
      for (final Brightness brightness in Brightness.values) {
        testWidgets('${control.cssClass} in '
            '${brightness == Brightness.dark ? 'dark' : 'light'} presses like '
            ':active', (WidgetTester tester) async {
          await pumpButton(
            tester,
            AppButton(
              control: control,
              onPressed: () {},
              child: const Text('Save'),
            ),
            brightness,
          );
          final AppControlSpec spec = specOf(control, brightness);

          final TestGesture down = await pressDown(tester);
          await tester.pump();
          // Half the class’s own measured duration: the offset is on its way, not
          // there. A snap reads the full value on the first frame; no animation at
          // all reads zero.
          await tester.pump(spec.transitionDuration ~/ 2);
          final double partway = translatedBy(tester);
          expect(
            partway,
            greaterThan(0.0),
            reason: 'the press eases in over ${spec.cssClass}’s own transition',
          );
          expect(
            partway,
            lessThan(spec.pressDyPx),
            reason: 'and has not landed yet at half the measured duration',
          );

          await tester.pumpAndSettle();
          expect(
            translatedBy(tester),
            spec.pressDyPx,
            reason: ':active translates the box by the authored offset',
          );
          expect(
            paintBox(tester).color,
            spec.pressFillColor ?? spec.fillColor,
            reason: spec.pressFillColor == null
                ? '${spec.cssClass} authors no pressed fill, so the button '
                      'must not invent one'
                : '${spec.cssClass} repaints the `:active` background',
          );

          await down.up();
          await tester.pumpAndSettle();
          expect(
            translatedBy(tester),
            0.0,
            reason: 'release clears the offset',
          );
          expect(paintBox(tester).color, spec.fillColor);
        });
      }
    }

    testWidgets('the press moves what is painted, not only what is queued', (
      WidgetTester tester,
    ) async {
      await pumpButton(
        tester,
        AppButton(onPressed: () {}, child: const Text('Save')),
        Brightness.light,
      );
      final AppControlSpec spec = specOf(
        AppButtonControl.btnPrimary,
        Brightness.light,
      );
      final double restingTop = tester.getRect(boxFinder(tester)).top;
      final TestGesture down = await pressDown(tester);
      await tester.pumpAndSettle();
      expect(
        tester.getRect(boxFinder(tester)).top,
        restingTop + spec.pressDyPx,
        reason: 'the painted rect moves with the transform',
      );
      await down.up();
      await tester.pumpAndSettle();
    });
  });

  group('the disabled state', () {
    for (final AppButtonControl control in controls) {
      for (final Brightness brightness in Brightness.values) {
        testWidgets('${control.cssClass} in '
            '${brightness == Brightness.dark ? 'dark' : 'light'} dims like '
            ':disabled and will not press', (WidgetTester tester) async {
          await pumpButton(
            tester,
            AppButton(
              control: control,
              onPressed: null,
              child: const Text('Save'),
            ),
            brightness,
          );
          final AppControlSpec spec = specOf(control, brightness);

          final List<Opacity> dim = tester
              .widgetList<Opacity>(
                find.descendant(
                  of: find.byType(AppButton),
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
              of: find.byType(AppButton),
              matching: find.byType(GestureDetector),
            ),
          );
          expect(
            tap.onTap,
            isNull,
            reason: 'a disabled control exposes no action at all',
          );

          final TestGesture down = await pressDown(tester);
          await tester.pumpAndSettle();
          expect(
            translatedBy(tester),
            0.0,
            reason:
                'the disabled rule clears the offset, so a press must not '
                'apply it either',
          );
          expect(paintBox(tester).color, spec.fillColor);
          await down.up();
          await tester.pumpAndSettle();
        });
      }
    }

    testWidgets('an enabled button carries no opacity layer', (
      WidgetTester tester,
    ) async {
      await pumpButton(
        tester,
        const AppButton(onPressed: _noop, child: Text('Save')),
        Brightness.light,
      );
      expect(
        find.descendant(
          of: find.byType(AppButton),
          matching: find.byType(Opacity),
        ),
        findsNothing,
        reason: 'the :disabled opacity is applied only in that state',
      );
    });
  });

  group('the tap', () {
    testWidgets('calls onPressed once, on release inside the box', (
      WidgetTester tester,
    ) async {
      int taps = 0;
      await pumpButton(
        tester,
        AppButton(onPressed: () => taps++, child: const Text('Save')),
        Brightness.light,
      );
      await tester.tap(find.byType(AppButton));
      await tester.pumpAndSettle();
      expect(taps, 1);
    });

    testWidgets('a slide off the box cancels, and clears the press', (
      WidgetTester tester,
    ) async {
      int taps = 0;
      await pumpButton(
        tester,
        AppButton(onPressed: () => taps++, child: const Text('Save')),
        Brightness.light,
      );
      final AppControlSpec spec = specOf(
        AppButtonControl.btnPrimary,
        Brightness.light,
      );
      final TestGesture down = await pressDown(tester);
      await tester.pumpAndSettle();
      expect(
        translatedBy(tester),
        spec.pressDyPx,
        reason: 'the press lands on touch-down, over the class’s own clock',
      );
      await down.moveTo(
        tester.getCenter(find.byType(AppButton)) - const Offset(0, 200),
      );
      await down.up();
      await tester.pumpAndSettle();
      expect(
        taps,
        0,
        reason: 'the web fires no click on a released-outside press',
      );
      expect(
        translatedBy(tester),
        0.0,
        reason: 'and the offset clears with it',
      );
    });

    testWidgets('the child survives the paint', (WidgetTester tester) async {
      await pumpButton(
        tester,
        const AppButton(onPressed: _noop, child: Text('Save')),
        Brightness.light,
      );
      expect(find.text('Save'), findsOneWidget);
    });
  });

  group('semantics', () {
    for (final AppButtonControl control in controls) {
      testWidgets('${control.cssClass} is a button to a screen reader', (
        WidgetTester tester,
      ) async {
        for (final bool enabled in <bool>[true, false]) {
          await pumpButton(
            tester,
            AppButton(
              control: control,
              onPressed: enabled ? _noop : null,
              child: const Text('Save'),
            ),
            Brightness.light,
          );
          final Semantics label = tester.widget<Semantics>(
            find
                .descendant(
                  of: find.byType(AppButton),
                  matching: find.byType(Semantics),
                )
                .first,
          );
          expect(label.properties.button, true);
          expect(label.properties.enabled, enabled);
        }
      });
    }
  });
}

void _noop() {}
