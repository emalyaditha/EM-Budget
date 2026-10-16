import 'dart:ui' as ui;

import 'package:em_budget/core/theme/app_segments.dart';
import 'package:em_budget/core/theme/app_theme.dart';
import 'package:em_budget/presentation/widgets/app_segmented.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Structural assertions for [AppSegmented]. The track row and the item row
/// are re-read from [AppSegments] in both passes; the selected state is
/// asserted as the authored rule and its measured probe describe it — the
/// fill, ink and 1px inset ring of `aria-selected="true"`, drawn *inside* the
/// item box, on the item’s own transition clock. Selection itself is the
/// screen’s: the widget is controlled, exactly like the web’s `aria-selected`
/// plus click handler, so a tap must land in the parent and only the parent
/// moving `selectedIndex` moves the paint — eased, never snapped.
void main() {
  AppSegmentSpec track(Brightness b) => AppSegments.resolve('.segment', b);
  AppSegmentSpec item(Brightness b) => AppSegments.resolve('.segment-item', b);

  Future<void> pumpTrack(
    WidgetTester tester,
    Widget segmented,
    Brightness brightness,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: appThemeData(isDark: false),
        darkTheme: appThemeData(isDark: true),
        themeMode: brightness == Brightness.dark
            ? ThemeMode.dark
            : ThemeMode.light,
        home: Scaffold(body: Center(child: segmented)),
      ),
    );
    await tester.pumpAndSettle();
    final ThemeData delivered = Theme.of(
      tester.element(find.byType(AppSegmented)),
    );
    expect(
      delivered.brightness,
      brightness,
      reason: 'the harness must deliver the pass the track resolves against',
    );
  }

  Widget three(int? selected, {ValueChanged<int>? onSelected}) => AppSegmented(
    selectedIndex: selected,
    onSelected: onSelected ?? _noop1,
    children: const <Widget>[Text('Week'), Text('Month'), Text('Year')],
  );

  /// The track’s own `Container`. `AnimatedContainer` builds a `Container`
  /// internally for each item, so the items’ wrappers are excluded by the
  /// ancestor check — and if that ever stops being true, the `hasLength(1)`
  /// fails rather than silently reading an item as the track.
  Container trackBox(WidgetTester tester) {
    final List<Container> boxes = tester
        .widgetList<Container>(
          find.descendant(
            of: find.byType(AppSegmented),
            matching: find.byType(Container),
          ),
        )
        .where(
          (Container c) => find
              .ancestor(
                of: find.byWidget(c),
                matching: find.byType(AnimatedContainer),
              )
              .evaluate()
              .isEmpty,
        )
        .toList();
    expect(
      boxes,
      hasLength(1),
      reason: 'one track box, the item boxes animate',
    );
    return boxes.single;
  }

  List<AnimatedContainer> itemBoxes(WidgetTester tester) => tester
      .widgetList<AnimatedContainer>(
        find.descendant(
          of: find.byType(AppSegmented),
          matching: find.byType(AnimatedContainer),
        ),
      )
      .toList();

  for (final Brightness brightness in Brightness.values) {
    testWidgets('the track paints its measured frost in ${brightness.name}', (
      WidgetTester tester,
    ) async {
      final AppSegmentSpec spec = track(brightness);
      await pumpTrack(tester, three(0), brightness);
      final Container box = trackBox(tester);
      final BoxDecoration painted = box.decoration! as BoxDecoration;
      expect(
        painted.color,
        spec.fillColor,
        reason: 'the color-mix substitution the probe measured',
      );
      expect(painted.borderRadius, spec.borderRadius);
      expect(
        painted.border,
        spec.border,
        reason: 'the track measured no frame',
      );
      expect(box.padding, spec.padding);
      expect(
        painted.gradient,
        isNull,
        reason: 'the track authors no background-image',
      );

      final Finder frostFinder = find.descendant(
        of: find.byType(AppSegmented),
        matching: find.byType(BackdropFilter),
      );
      expect(frostFinder, findsOneWidget);
      final BackdropFilter frost = tester.widget(frostFinder);
      expect(
        frost.filter,
        ui.ImageFilter.blur(
          sigmaX: spec.blurSigmaPx!,
          sigmaY: spec.blurSigmaPx!,
        ),
        reason: 'D-U8: half the measured CSS blur',
      );
      expect(
        spec.blurSaturate,
        isNull,
        reason:
            'the segment track measured no saturate — if the web ever '
            'grows one, this pin says the row changed',
      );
      final ClipRRect corner = tester.widget<ClipRRect>(
        find.descendant(
          of: find.byType(AppSegmented),
          matching: find.byType(ClipRRect),
        ),
      );
      expect(
        corner.borderRadius,
        spec.borderRadius,
        reason: 'backdrop-filter is confined to the element’s border box',
      );
    });

    testWidgets(
      'the track row carries no type: the item’s ink arrives through the '
      'track that declares none, in ${brightness.name}',
      (WidgetTester tester) async {
        final AppSegmentSpec rail = track(brightness);
        expect(rail.textColor, isNull);
        expect(rail.fontSizePx, isNull);
        expect(rail.fontFamily, isNull);
        await pumpTrack(tester, three(1), brightness);
        final TextStyle label = DefaultTextStyle.of(
          tester.element(find.text('Month')),
        ).style;
        expect(
          label.color,
          item(brightness).selectedTextColor,
          reason: 'only the item authors colours, resting or selected',
        );
        expect(label.fontSize, item(brightness).fontSizePx);
      },
    );

    testWidgets(
      'a selected item paints the authored state and the others rest in '
      '${brightness.name}',
      (WidgetTester tester) async {
        final AppSegmentSpec rest = item(brightness);
        final AppSegmentSpec rail = track(brightness);
        await pumpTrack(tester, three(1), brightness);
        final List<AnimatedContainer> boxes = itemBoxes(tester);
        expect(boxes, hasLength(3));

        for (int i = 0; i < boxes.length; i++) {
          final bool selected = i == 1;
          final BoxDecoration painted = boxes[i].decoration! as BoxDecoration;
          expect(
            painted.color,
            selected ? rest.selectedFillColor : rest.fillColor,
            reason: selected
                ? 'background: var(--surface-3) from the selected rule'
                : 'the resting item measured background: transparent',
          );
          expect(
            painted.border,
            selected
                ? Border.all(
                    color: rest.selectedRingColor!,
                    width: rest.selectedRingWidthPx!,
                  )
                : null,
            reason: selected
                ? '`box-shadow: inset 0 0 0 1px` is a ring drawn inside the '
                      'box, which is exactly a Flutter border'
                : 'the resting item authors border: none',
          );
          expect(painted.borderRadius, rest.borderRadius);
          expect(boxes[i].padding, rest.padding);
          expect(
            boxes[i].duration,
            rest.transitionDuration,
            reason: 'the swap runs on the item’s own authored clock',
          );
        }

        expect(
          DefaultTextStyle.of(tester.element(find.text('Month'))).style.color,
          rest.selectedTextColor,
        );
        expect(
          DefaultTextStyle.of(tester.element(find.text('Year'))).style.color,
          rest.textColor,
        );

        expect(
          rail.selectedFillColor,
          isNull,
          reason:
              'the states live on the item row; if the track grew one, '
              'the table changed and this widget’s story did',
        );
      },
    );
  }

  testWidgets('items are separated by the track’s authored gap', (
    WidgetTester tester,
  ) async {
    final AppSegmentSpec spec = track(Brightness.light);
    expect(spec.gapPx, isNotNull);
    expect(
      item(Brightness.light).gapPx,
      isNull,
      reason: 'the gap is authored on the track, not the item',
    );
    await pumpTrack(tester, three(0), Brightness.light);
    final Finder boxes = find.descendant(
      of: find.byType(AppSegmented),
      matching: find.byType(AnimatedContainer),
    );
    expect(
      tester.getRect(boxes.at(1)).left - tester.getRect(boxes.first).right,
      spec.gapPx,
      reason:
          'the gap between the item boxes — the labels themselves sit '
          'inside boxes the flex has stretched to a common width',
    );
  });

  testWidgets('a tap reports the index; the widget changes nothing itself', (
    WidgetTester tester,
  ) async {
    int? index;
    await pumpTrack(
      tester,
      three(0, onSelected: (int i) => index = i),
      Brightness.light,
    );
    await tester.tap(find.text('Year'));
    await tester.pump();
    expect(index, 2, reason: 'the handler learns which item was picked');
    final BoxDecoration third =
        itemBoxes(tester)[2].decoration! as BoxDecoration;
    expect(
      third.border,
      isNull,
      reason: 'a controlled widget: nothing selects itself because it was hit',
    );
    expect(
      third.color,
      item(Brightness.light).fillColor,
      reason: 'and that holds until the screen moves selectedIndex',
    );
  });

  testWidgets('selection follows the screen, landing on the measured paint', (
    WidgetTester tester,
  ) async {
    final AppSegmentSpec rest = item(Brightness.light);
    await pumpTrack(tester, _Picked(initial: 0), Brightness.light);
    expect(
      (itemBoxes(tester)[2].decoration! as BoxDecoration).border,
      isNull,
      reason: 'the third item rests before the screen picks it',
    );

    await tester.tap(find.text('Year'));
    await tester.pump();
    // The widget tree after the pick: the animation is running toward the
    // selected paint on the measured clock — the clock and curve the earlier
    // box test pins to `--dur-fast`/`--ease-out` — so the landing, not a
    // snap, is what the harness then settles into.
    final AnimatedContainer aimed = itemBoxes(tester)[2];
    expect(
      (aimed.decoration! as BoxDecoration).border,
      isNotNull,
      reason:
          'after the tap the box is aimed at the selected state’s ring, '
          'not the resting none',
    );
    expect(aimed.duration, rest.transitionDuration);

    await tester.pumpAndSettle();
    final BoxDecoration landed =
        itemBoxes(tester)[2].decoration! as BoxDecoration;
    expect(landed.color, rest.selectedFillColor);
    expect(landed.border!.top.color, rest.selectedRingColor);
    expect(
      (itemBoxes(tester)[0].decoration! as BoxDecoration).border,
      isNull,
      reason: 'the previous pick released, as a radio group does',
    );
    expect(
      DefaultTextStyle.of(tester.element(find.text('Year'))).style.color,
      rest.selectedTextColor,
    );
  });

  testWidgets('semantics mark exactly the picked item', (
    WidgetTester tester,
  ) async {
    await pumpTrack(tester, three(2), Brightness.light);
    final List<Semantics> labels = tester
        .widgetList<Semantics>(
          find.descendant(
            of: find.byType(AppSegmented),
            matching: find.byType(Semantics),
          ),
        )
        .toList();
    expect(labels, hasLength(3));
    for (int i = 0; i < labels.length; i++) {
      expect(labels[i].properties.button, true);
      expect(
        labels[i].properties.selected,
        i == 2,
        reason: 'aria-selected is the state the screen holds, mirrored once',
      );
    }
  });

  testWidgets(
    'with no selection every item rests, and a null handler is inert',
    (WidgetTester tester) async {
      await pumpTrack(
        tester,
        AppSegmented(
          selectedIndex: null,
          onSelected: null,
          children: const <Widget>[Text('Week'), Text('Month')],
        ),
        Brightness.light,
      );
      final AppSegmentSpec rest = item(Brightness.light);
      expect(itemBoxes(tester), hasLength(2));
      for (final AnimatedContainer box in itemBoxes(tester)) {
        final BoxDecoration painted = box.decoration! as BoxDecoration;
        expect(painted.color, rest.fillColor);
        expect(painted.border, isNull);
      }
      await tester.tap(find.text('Week'));
      await tester.pump();
      expect(
        (itemBoxes(tester).first.decoration! as BoxDecoration).border,
        isNull,
        reason: 'nothing to fire — and no crash either',
      );
    },
  );

  testWidgets('no ink anywhere', (WidgetTester tester) async {
    await pumpTrack(tester, three(0), Brightness.light);
    for (final Type ink in <Type>[Ink, InkWell, Material]) {
      expect(
        find.descendant(
          of: find.byType(AppSegmented),
          matching: find.byType(ink),
        ),
        findsNothing,
      );
    }
  });
}

/// A screen holding the picked index: the tap goes through [AppSegmented]’s
/// handler into this state, and this widget answers by moving `selectedIndex`
/// — which is how the web’s `aria-selected` works and what lets the item’s
/// [AnimatedContainer] run its measured clock instead of snapping.
class _Picked extends StatefulWidget {
  const _Picked({required this.initial});

  final int initial;

  @override
  State<_Picked> createState() => _PickedState();
}

class _PickedState extends State<_Picked> {
  late int _selected = widget.initial;

  @override
  Widget build(BuildContext context) {
    return AppSegmented(
      selectedIndex: _selected,
      onSelected: (int i) => setState(() => _selected = i),
      children: const <Widget>[Text('Week'), Text('Month'), Text('Year')],
    );
  }
}

void _noop1(int _) {}
