import 'package:em_budget/core/theme/app_fields.dart';
import 'package:em_budget/core/theme/app_theme.dart';
import 'package:em_budget/presentation/widgets/app_form_field.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';

/// Structural assertions for [AppFormField]. Every expectation re-reads its value
/// from [AppFields] and [AppLabels] — the measured §6 row plus the authored
/// `:focus` and `::placeholder` rules — so a passing test proves the field painted
/// the row rather than a number someone typed here.
void main() {
  /// The width the harness gives the field. `.input` is `width: 100%`, so what it
  /// paints is this number, and the assertion below is that it is *exactly* it.
  const double harnessWidth = 300.0;

  Future<void> pumpField(
    WidgetTester tester,
    AppFormField field,
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
          body: Center(
            child: SizedBox(width: harnessWidth, child: field),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final ThemeData delivered = Theme.of(
      tester.element(find.byType(AppFormField)),
    );
    expect(
      delivered.brightness,
      brightness,
      reason: 'the harness must deliver the pass the field resolves against',
    );
  }

  /// A controller the harness made, so the harness disposes it.
  TextEditingController ownedController() {
    final TextEditingController created = TextEditingController();
    addTearDown(created.dispose);
    return created;
  }

  AppFormField formField({
    String? label = 'Amount',
    TextEditingController? controller,
    FocusNode? focusNode,
    bool obscureText = false,
    String? hintText,
    ValueChanged<String>? onChanged,
    ValueChanged<String>? onSubmitted,
    TextInputType? keyboardType,
    TextInputAction? textInputAction,
  }) => AppFormField(
    controller: controller ?? ownedController(),
    label: label,
    focusNode: focusNode,
    obscureText: obscureText,
    hintText: hintText,
    onChanged: onChanged,
    onSubmitted: onSubmitted,
    keyboardType: keyboardType,
    textInputAction: textInputAction,
  );

  AppFieldSpec fieldSpec(Brightness brightness) =>
      AppFields.resolve(AppFieldControl.input.cssClass, brightness);

  AppLabelSpec labelSpec(Brightness brightness) =>
      AppLabels.resolve(AppFieldLabel.eyebrow.cssClass, brightness);

  /// AppFormField's own box, isolated from any `DecoratedBox` the shell paints.
  Finder boxFinder(WidgetTester tester) => find.descendant(
    of: find.byType(AppFormField),
    matching: find.byType(DecoratedBox),
  );

  /// The one box the field paints. A second `DecoratedBox` would mean the widget
  /// grew a layer the measurement never saw.
  BoxDecoration paintBox(WidgetTester tester) {
    final List<DecoratedBox> painted = tester
        .widgetList<DecoratedBox>(boxFinder(tester))
        .toList();
    expect(painted, hasLength(1), reason: 'AppFormField is one box');
    final BoxDecoration? decoration =
        painted.single.decoration as BoxDecoration?;
    if (decoration == null) {
      throw StateError('the AppFormField box carries no decoration');
    }
    return decoration;
  }

  AnimatedContainer animBox(WidgetTester tester) =>
      tester.widget<AnimatedContainer>(
        find.descendant(
          of: find.byType(AppFormField),
          matching: find.byType(AnimatedContainer),
        ),
      );

  TextField theField(WidgetTester tester) => tester.widget<TextField>(
    find.descendant(
      of: find.byType(AppFormField),
      matching: find.byType(TextField),
    ),
  );

  InputDecoration theDecoration(WidgetTester tester) {
    final InputDecoration? decoration = theField(tester).decoration;
    if (decoration == null) throw StateError('the field carries no decoration');
    return decoration;
  }

  /// The insets between the painted box and the text. One of them: `Container`
  /// derives it from the decoration's border, which is how CSS
  /// `box-sizing: border-box` keeps the content inside the frame. The field's own
  /// `padding` shorthand is the decorator's `contentPadding`, asserted there.
  List<EdgeInsetsGeometry> insetsOf(WidgetTester tester) => tester
      .widgetList<Padding>(
        find.descendant(
          of: find.byType(AppFormField),
          matching: find.byType(Padding),
        ),
      )
      .map((Padding p) => p.padding)
      .toList();

  group('the measured classes', () {
    test('AppFieldControl names exactly the classes AppFields measured', () {
      final List<String> expected =
          AppFieldControl.values.map((AppFieldControl c) => c.cssClass).toList()
            ..sort();
      expect(AppFields.light.keys.toList()..sort(), expected);
      expect(AppFields.dark.keys.toList()..sort(), expected);
    });

    test('AppFieldLabel names exactly the classes AppLabels measured', () {
      final List<String> expected =
          AppFieldLabel.values.map((AppFieldLabel l) => l.cssClass).toList()
            ..sort();
      expect(AppLabels.light.keys.toList()..sort(), expected);
      expect(AppLabels.dark.keys.toList()..sort(), expected);
    });

    test('both rows resolve in both passes', () {
      for (final Brightness brightness in Brightness.values) {
        expect(fieldSpec(brightness).cssClass, AppFieldControl.input.cssClass);
        expect(labelSpec(brightness).cssClass, AppFieldLabel.eyebrow.cssClass);
      }
    });
  });

  group('the resting box', () {
    for (final Brightness brightness in Brightness.values) {
      final String pass = brightness == Brightness.dark ? 'dark' : 'light';

      testWidgets('$pass paints its measured row at rest', (
        WidgetTester tester,
      ) async {
        await pumpField(tester, formField(), brightness);
        final AppFieldSpec spec = fieldSpec(brightness);
        final BoxDecoration box = paintBox(tester);

        expect(box.color, spec.fillColor);
        expect(box.borderRadius, spec.borderRadius);
        expect(box.border, spec.border);
        expect(
          box.boxShadow,
          <BoxShadow>[spec.restRing],
          reason:
              'the probe rests with box-shadow: none, whose computed form is a '
              'shadow with nothing about it — not null, which could not ease',
        );
        expect(box.gradient, isNull, reason: 'the §6 field paints no gradient');

        final TextStyle painted = theField(tester).style!;
        expect(
          painted,
          spec.textStyle,
          reason: 'the value text is the class’s own measured type',
        );
        expect(
          theDecoration(tester).hintStyle,
          spec.hintStyle,
          reason: 'the hint is the authored ::placeholder colour',
        );
        expect(
          theField(tester).cursorColor,
          spec.textColor,
          reason:
              'CSS caret-color: auto is the used `color`, and .input authors no '
              'caret colour of its own',
        );

        expect(
          insetsOf(tester),
          <EdgeInsetsGeometry>[EdgeInsets.all(spec.borderWidthPx)],
          reason:
              'the text sits inside the painted border, and the field’s own '
              'padding is the decorator’s contentPadding',
        );
        expect(
          theDecoration(tester).contentPadding,
          spec.padding,
          reason: 'the measured padding shorthand pads the text',
        );

        expect(
          animBox(tester).duration,
          spec.transitionDuration,
          reason:
              '${spec.cssClass} runs its own authored clock, not a duration the '
              'widget chose',
        );
        final Cubic curve = animBox(tester).curve as Cubic;
        expect(
          <double>[curve.a, curve.b, curve.c, curve.d],
          <double>[spec.easeX1, spec.easeY1, spec.easeX2, spec.easeY2],
          reason: 'Cubic has no value equality, so the four numbers are what compare',
        );
      });

      testWidgets('$pass gives the Material decorator nothing to paint', (
        WidgetTester tester,
      ) async {
        await pumpField(tester, formField(), brightness);
        final InputDecoration decoration = theDecoration(tester);
        for (final InputBorder border in <InputBorder>[
          decoration.border!,
          decoration.enabledBorder!,
          decoration.focusedBorder!,
          decoration.errorBorder!,
          decoration.focusedErrorBorder!,
          decoration.disabledBorder!,
        ]) {
          expect(
            border,
            InputBorder.none,
            reason:
                'a Material border left in place would draw a line the §6 field '
                'does not have, and `.input:focus { outline: none }` is the web '
                'removing one too',
          );
        }
        expect(
          decoration.filled,
          isFalse,
          reason: 'the box colour is the AppFieldSpec’s, not the decorator’s',
        );
        expect(
          decoration.isDense,
          isTrue,
          reason:
              'the non-dense decorator enforces a Material minimum height, and '
              'the height test below is what proves this field has none',
        );
        for (final Type ink in <Type>[InkWell, Ink, Material]) {
          expect(
            find.descendant(
              of: find.byType(AppFormField),
              matching: find.byType(ink),
            ),
            findsNothing,
            reason: '$ink would paint feedback the §6 row does not carry',
          );
        }
      });
    }

    testWidgets('the box adds the border and the padding and nothing else', (
      WidgetTester tester,
    ) async {
      for (final Brightness brightness in Brightness.values) {
        await pumpField(tester, formField(), brightness);
        final AppFieldSpec spec = fieldSpec(brightness);
        final Size box = tester.getSize(boxFinder(tester));
        final Size text = tester.getSize(find.byType(EditableText));
        expect(
          box.height - text.height,
          2 * (spec.borderWidthPx + spec.paddingVerticalPx),
          reason:
              'what AppFormField adds around the line box is `1px solid` plus '
              '`padding: 11px 14px`. The line box itself is the engine’s reading '
              'of the measured 1.5 height ratio — 20.0 in the test font where '
              'Chrome measured 20.25 — and this asserts the composition, not the '
              'text engine. Material’s own field minimum is what it catches: a '
              'non-dense decorator makes this 30.0 instead of 24.0.',
        );
        expect(
          box.width - text.width,
          2 * (spec.borderWidthPx + spec.paddingHorizontalPx),
          reason: 'the same two pieces, horizontally',
        );
      }
    });

    testWidgets('width: 100% is the width the caller gives', (
      WidgetTester tester,
    ) async {
      for (final String? label in <String?>['Amount', null]) {
        await pumpField(tester, formField(label: label), Brightness.light);
        expect(
          tester.getSize(boxFinder(tester)).width,
          harnessWidth,
          reason: label == null
              ? 'a field with no label still fills its wrapper'
              : 'the wrapper stretches both children',
        );
      }
    });

    testWidgets(
      'a field with no label paints the same box and nothing above it',
      (WidgetTester tester) async {
        await pumpField(tester, formField(label: null), Brightness.light);
        expect(find.text('AMOUNT'), findsNothing);
        expect(
          tester.getRect(find.byType(AppFormField)),
          tester.getRect(boxFinder(tester)),
          reason:
              'the label and its gap are the only children the wrapper adds, so '
              'without one the field is the whole widget — same top edge, same '
              'everything',
        );
        final AppFieldSpec spec = fieldSpec(Brightness.light);
        expect(paintBox(tester).border, spec.border);
        expect(paintBox(tester).boxShadow, <BoxShadow>[spec.restRing]);
      },
    );
  });

  group('the label', () {
    for (final Brightness brightness in Brightness.values) {
      final String pass = brightness == Brightness.dark ? 'dark' : 'light';

      testWidgets(
        '$pass paints the measured .eyebrow row, in the case it authors',
        (WidgetTester tester) async {
          await pumpField(tester, formField(), brightness);
          final AppLabelSpec spec = labelSpec(brightness);
          expect(spec.uppercase, isTrue, reason: 'the row authors the case');
          expect(
            find.text(spec.transform('Amount')),
            findsOneWidget,
            reason:
                'the string the author wrote is not the string that is painted',
          );
          final Text painted = tester.widget<Text>(
            find.descendant(
              of: find.byType(AppFormField),
              matching: find.byType(Text),
            ),
          );
          expect(
            painted.style,
            spec.textStyle,
            reason: 'the label takes its own row, not the theme’s body ladder',
          );
        },
      );

      testWidgets('$pass sits labelGap above the field box', (
        WidgetTester tester,
      ) async {
        await pumpField(tester, formField(), brightness);
        final Rect label = tester.getRect(find.text('AMOUNT'));
        final Rect box = tester.getRect(boxFinder(tester));
        expect(
          box.top - label.bottom,
          AppFields.labelGap,
          reason:
              'the wrapper’s `gap-1.5` is the only space between them, and it is '
              'AppSpacing.scale of the measured unit',
        );
        expect(
          label.left,
          box.left,
          reason: 'flex-col stretches both, so they share an edge',
        );
      });
    }

    testWidgets('a tap on the label focuses the field', (
      WidgetTester tester,
    ) async {
      await pumpField(tester, formField(), Brightness.light);
      final AppFieldSpec spec = fieldSpec(Brightness.light);
      expect(paintBox(tester).border, spec.border);

      await tester.tap(find.text('AMOUNT'));
      await tester.pumpAndSettle();
      expect(
        paintBox(tester).border,
        spec.focusedBorder,
        reason: '<label for> is a second way into the input',
      );
    });
  });

  group('the focus state', () {
    for (final Brightness brightness in Brightness.values) {
      final String pass = brightness == Brightness.dark ? 'dark' : 'light';

      testWidgets(
        '$pass eases the border and grows the ring on the class’s clock',
        (WidgetTester tester) async {
          final FocusNode node = FocusNode();
          addTearDown(node.dispose);
          await pumpField(tester, formField(focusNode: node), brightness);
          final AppFieldSpec spec = fieldSpec(brightness);

          await tester.tap(find.byType(EditableText));
          await tester.pump();
          await tester.pump(spec.transitionDuration ~/ 2);

          final BoxDecoration partway = paintBox(tester);
          final Color border = partway.border!.top.color;
          expect(
            border,
            isNot(spec.borderColor),
            reason: 'the border has left the resting colour',
          );
          expect(
            border,
            isNot(spec.focusBorderColor),
            reason: 'and has not landed: a snap would already be there',
          );
          final BoxShadow ring = partway.boxShadow!.single;
          expect(
            ring.spreadRadius,
            greaterThan(spec.restRing.spreadRadius),
            reason: 'the ring grows out of the computed `none`',
          );
          expect(
            ring.spreadRadius,
            lessThan(spec.ringSpreadPx),
            reason: 'and is still on its way at half the measured duration',
          );

          await tester.pumpAndSettle();
          final BoxDecoration focused = paintBox(tester);
          expect(focused.border, spec.focusedBorder);
          expect(focused.boxShadow, <BoxShadow>[spec.ring]);
          expect(
            focused.color,
            spec.fillColor,
            reason: ':focus changes the frame, not the fill',
          );

          // A tap outside the field does not blur it in Flutter the way it does
          // on the web — that is the focus traversal the screens own, not this
          // widget — so the way back to rest is the node the field is painted
          // from losing focus.
          node.unfocus();
          await tester.pumpAndSettle();
          expect(
            paintBox(tester).border,
            spec.border,
            reason: 'blur puts the resting row back',
          );
          expect(paintBox(tester).boxShadow, <BoxShadow>[spec.restRing]);
        },
      );

      testWidgets('$pass focuses on the caller’s own node, and lets it go', (
        WidgetTester tester,
      ) async {
        final FocusNode node = FocusNode();
        addTearDown(node.dispose);
        await pumpField(tester, formField(focusNode: node), brightness);
        final AppFieldSpec spec = fieldSpec(brightness);

        node.requestFocus();
        await tester.pumpAndSettle();
        expect(
          paintBox(tester).border,
          spec.focusedBorder,
          reason: 'the box paints the focus of whichever node the caller gave',
        );

        node.unfocus();
        await tester.pumpAndSettle();
        expect(paintBox(tester).border, spec.border);
      });
    }

    testWidgets(
      'swapping the node follows the field, and the old node survives',
      (WidgetTester tester) async {
        final FocusNode first = FocusNode();
        final FocusNode second = FocusNode();
        addTearDown(first.dispose);
        addTearDown(second.dispose);

        await pumpField(tester, formField(focusNode: first), Brightness.light);
        first.requestFocus();
        await tester.pumpAndSettle();
        expect(
          paintBox(tester).border,
          fieldSpec(Brightness.light).focusedBorder,
        );

        await pumpField(tester, formField(focusNode: second), Brightness.light);
        expect(
          paintBox(tester).border,
          fieldSpec(Brightness.light).border,
          reason: 'the field rebound, so the node it dropped cannot hold it focused',
        );

        second.requestFocus();
        await tester.pumpAndSettle();
        expect(
          paintBox(tester).border,
          fieldSpec(Brightness.light).focusedBorder,
          reason: 'and the node it took up drives the paint',
        );

        expect(
          first.hasFocus,
          isFalse,
          reason:
              'a node the caller owns is never disposed here, so the caller can '
              'still read it after AppFormField let go',
        );
      },
    );

    testWidgets('a focused field paints one box, not a ring outside the tree', (
      WidgetTester tester,
    ) async {
      await pumpField(tester, formField(), Brightness.light);
      await tester.tap(find.byType(EditableText));
      await tester.pumpAndSettle();
      expect(
        tester.widgetList<DecoratedBox>(boxFinder(tester)),
        hasLength(1),
        reason: 'the ring is the box’s own shadow, not a second layer',
      );
    });
  });

  group('typing', () {
    testWidgets('the value lands in the controller and onChanged', (
      WidgetTester tester,
    ) async {
      final TextEditingController controller = TextEditingController();
      addTearDown(controller.dispose);
      final List<String> seen = <String>[];
      await pumpField(
        tester,
        formField(
          controller: controller,
          onChanged: (String value) => seen.add(value),
        ),
        Brightness.light,
      );

      await tester.enterText(find.byType(EditableText), '42');
      await tester.pumpAndSettle();
      expect(controller.text, '42');
      expect(seen, <String>['42']);
      expect(
        find.text('42'),
        findsOneWidget,
        reason: 'what was typed is what the measured text style paints',
      );
    });

    testWidgets('onSubmitted fires on the keyboard action', (
      WidgetTester tester,
    ) async {
      String? submitted;
      await pumpField(
        tester,
        formField(
          textInputAction: TextInputAction.done,
          onSubmitted: (String value) => submitted = value,
        ),
        Brightness.light,
      );
      await tester.enterText(find.byType(EditableText), 'rent');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      expect(submitted, 'rent');
    });

    testWidgets('the hint is painted until there is a value', (
      WidgetTester tester,
    ) async {
      await pumpField(
        tester,
        formField(hintText: 'Monthly rent'),
        Brightness.light,
      );
      expect(find.text('Monthly rent'), findsOneWidget);
      final AppFieldSpec spec = fieldSpec(Brightness.light);
      expect(
        spec.hintColor,
        isNot(spec.textColor),
        reason: 'the row itself proves a hint is not the value',
      );
    });

    testWidgets('obscureText reaches the editable', (
      WidgetTester tester,
    ) async {
      await pumpField(tester, formField(obscureText: true), Brightness.light);
      expect(theField(tester).obscureText, isTrue);
      expect(
        tester
            .widget<EditableText>(
              find.descendant(
                of: find.byType(AppFormField),
                matching: find.byType(EditableText),
              ),
            )
            .obscureText,
        isTrue,
      );
    });

    testWidgets('keyboardType reaches the field', (WidgetTester tester) async {
      await pumpField(
        tester,
        formField(keyboardType: TextInputType.number),
        Brightness.light,
      );
      expect(theField(tester).keyboardType, TextInputType.number);
    });
  });

  group('semantics', () {
    testWidgets('the label is read, and the field is an editable', (
      WidgetTester tester,
    ) async {
      final SemanticsHandle handle = tester.ensureSemantics();
      await pumpField(tester, formField(), Brightness.light);

      expect(
        tester.getSemantics(find.text('AMOUNT')).label,
        'AMOUNT',
        reason:
            'the case is part of the paint, so it is part of what is read; the '
            'web transforms after layout and reads the same glyphs',
      );
      final SemanticsNode editable = tester.getSemantics(
        find.byType(EditableText),
      );
      expect(
        editable.flagsCollection.isTextField,
        isTrue,
        reason: 'the row is a field to a screen reader, not a label',
      );
      handle.dispose();
    });
  });
}
