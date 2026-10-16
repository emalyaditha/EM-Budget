import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:em_budget/core/theme/app_navs.dart';
import 'package:em_budget/core/theme/app_theme.dart';
import 'package:em_budget/presentation/widgets/app_nav.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

import 'package:flutter_test/flutter_test.dart';

/// Pixel and behaviour assertions for [AppNav], [AppNavItem] and [AppNavFab],
/// each computed from the measured §6 row it checks. A pass proves the box
/// painted that row; a row that moved fails.
///
/// The geometry is stated in the terms the CSS is: the bar's box is
/// `min(100% − 24px, 460px)` wide, its height is the 48px tab plus the border
/// and padding insets on each side, and it sits `12px + env(safe-area-inset-
/// bottom)` above the bottom of the area it is given. Nothing in the row records
/// a box height — the web computes it from those pieces — so these read the
/// numbers back out of the layout instead of comparing a recorded one.
///
/// Every pixel assertion is made on a transparent [RepaintBoundary] layer, so
/// the capture is premultiplied: a translucent pixel reads as the colour × its
/// own alpha, which is what identifies the bar's 82% `color-mix` fill as
/// translucent rather than a surface flattened to opaque. Sample points are
/// placed where no other paint lands: the padding band above the tabs, the
/// straight run of the pill clear of the lifted fab's own shadow.
void main() {
  const double boxWidth = 300;
  const double boxHeight = 120;

  final Key boundaryKey = UniqueKey();

  AppNavSpec row(String cssClass, Brightness brightness) =>
      AppNavs.resolve(cssClass, brightness);

  double barWidth(AppNavSpec bar, double width) =>
      math.min(width - bar.edgeInsetPx!, bar.maxBarWidthPx!);

  /// The content inset the box model gives: `box-sizing: border-box` (Tailwind
  /// preflight) puts the content inside the border *and* the padding.
  EdgeInsets barInset(AppNavSpec bar) => EdgeInsets.symmetric(
    vertical: bar.paddingVerticalPx + bar.borderWidthPx,
    horizontal: bar.paddingHorizontalPx + bar.borderWidthPx,
  );

  double barTop(AppNavSpec bar, AppNavSpec item, double height) =>
      height -
      bar.bottomGapPx! -
      (item.heightPx! + 2 * (bar.paddingVerticalPx + bar.borderWidthPx));

  /// The rect the bar's children occupy, in the box [AppNav] was given.
  Rect contentRect({
    required AppNavSpec bar,
    required AppNavSpec item,
    double width = boxWidth,
    double height = boxHeight,
    double safeArea = 0,
  }) {
    final EdgeInsets inset = barInset(bar);
    return Rect.fromLTWH(
      (width - barWidth(bar, width)) / 2 + inset.left,
      barTop(bar, item, height - safeArea) + inset.top,
      barWidth(bar, width) - inset.left - inset.right,
      item.heightPx!,
    );
  }

  Future<void> pumpNav(
    WidgetTester tester, {
    required List<Widget> children,
    double width = boxWidth,
    double height = boxHeight,
    double safeArea = 0,
    Brightness brightness = Brightness.light,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: appThemeData(isDark: false),
        darkTheme: appThemeData(isDark: true),
        themeMode: brightness == Brightness.dark
            ? ThemeMode.dark
            : ThemeMode.light,
        home: Scaffold(
          body: Builder(
            builder: (BuildContext context) => MediaQuery(
              // `env(safe-area-inset-bottom, 0px)` reaches the port as the
              // host's view padding; the test sets it rather than trusting the
              // 0 the fake window carries.
              data: MediaQuery.of(context)
                  .copyWith(viewPadding: EdgeInsets.only(bottom: safeArea)),
              child: Center(
                child: SizedBox(
                  width: width,
                  height: height,
                  child: RepaintBoundary(
                    key: boundaryKey,
                    child: AppNav(children: children),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// See [AppSkeleton]'s test for why the capture must run inside `runAsync`:
  /// `toImage` completes on a real composited frame, and the test fake clock
  /// never delivers one.
  Future<_Surface> paint(WidgetTester tester) async {
    final _Surface? surface = await tester.runAsync<_Surface>(() async {
      final RenderRepaintBoundary boundary = tester.renderObject(
        find.byKey(boundaryKey),
      );
      final ui.Image image = await boundary.toImage(pixelRatio: 1);
      try {
        final ByteData? data = await image.toByteData(
          format: ui.ImageByteFormat.rawRgba,
        );
        expect(data, isNotNull);
        return _Surface(
          bytes: data!.buffer.asUint8List(),
          width: image.width,
          height: image.height,
        );
      } finally {
        image.dispose();
      }
    });
    expect(surface, isNotNull, reason: 'runAsync returned no surface');
    return surface!;
  }

  /// Two tabs and the centre action, in the order the web writes them, so the
  /// fab lands on the area's vertical centre line.
  List<Widget> barChildren({
    int selected = 0,
    void Function(int index)? onTab,
    VoidCallback? onFab,
  }) => <Widget>[
    AppNavItem(
      icon: const SizedBox.shrink(),
      label: 'A',
      selected: selected == 0,
      onTap: onTab == null ? null : () => onTab(0),
    ),
    AppNavFab(onTap: onFab, child: const SizedBox.shrink()),
    AppNavItem(
      icon: const SizedBox.shrink(),
      label: 'B',
      selected: selected == 1,
      onTap: onTab == null ? null : () => onTab(1),
    ),
  ];

  Finder barRow() =>
      find.descendant(of: find.byType(AppNav), matching: find.byType(Row));

  /// A rect in the boundary's own coordinates — the frame every geometry helper
  /// above computes in, and the frame the captured pixels are indexed by.
  /// `tester.getRect` answers in screen coordinates, and the centred test box
  /// puts the boundary's origin at (250, 240) of those.
  Rect localRect(WidgetTester tester, Finder finder) =>
      tester.getRect(finder).shift(-tester.getTopLeft(find.byKey(boundaryKey)));

  /// The style a label's paragraph actually paints with: the class's type as it
  /// reached the text, read off the render tree rather than claimed by some
  /// ancestor of it.
  TextStyle labelStyle(WidgetTester tester, String label) {
    final InlineSpan span = tester
        .renderObject<RenderParagraph>(find.text(label))
        .text;
    return (span as TextSpan).style!;
  }

  testWidgets('the bar is the measured box, bottom-centred in its area', (
    WidgetTester tester,
  ) async {
    final AppNavSpec bar = row('.floating-nav', Brightness.light);
    final AppNavSpec item = row('.nav-item', Brightness.light);
    await pumpNav(tester, children: barChildren());

    expect(
      localRect(tester, barRow()),
      contentRect(bar: bar, item: item),
      reason:
          'width min(100% − 24px, 460px), centred, 12px over the bottom, and '
          'the content inset by the 1px frame plus the 8/10px padding',
    );
  });

  testWidgets('the 460px cap binds before the inset does', (
    WidgetTester tester,
  ) async {
    final AppNavSpec bar = row('.floating-nav', Brightness.light);
    const double wide = 700;
    await pumpNav(tester, width: wide, children: barChildren());

    expect(barWidth(bar, wide), bar.maxBarWidthPx);
    expect(
      localRect(tester, barRow()).width,
      bar.maxBarWidthPx! - barInset(bar).left - barInset(bar).right,
      reason: 'a 700px area would give 676px of bar; the class caps it at 460',
    );
  });

  testWidgets('the safe area moves the bar, as env() does', (
    WidgetTester tester,
  ) async {
    const double safeArea = 20;
    final AppNavSpec bar = row('.floating-nav', Brightness.light);
    final AppNavSpec item = row('.nav-item', Brightness.light);
    await pumpNav(tester, safeArea: safeArea, children: barChildren());

    expect(
      localRect(tester, barRow()),
      contentRect(bar: bar, item: item, safeArea: safeArea),
      reason:
          'bottom: calc(12px + env(safe-area-inset-bottom, 0px)) is 12px plus '
          'the host view padding, not 12px alone',
    );
  });

  testWidgets('gap is a floor and space-between shares what is free', (
    WidgetTester tester,
  ) async {
    final AppNavSpec bar = row('.floating-nav', Brightness.light);
    final AppNavSpec item = row('.nav-item', Brightness.light);
    final AppNavSpec fab = row('.nav-fab', Brightness.light);
    final Rect content = contentRect(bar: bar, item: item);
    await pumpNav(tester, children: barChildren());

    final Rect first = localRect(tester, find.byType(AppNavItem).first);
    final Rect last = localRect(tester, find.byType(AppNavItem).last);
    final double gap = bar.gapPx!;
    final double share =
        (content.width - 2 * item.minWidthPx! - fab.sizePx! - 2 * gap) / 4;

    expect(
      first.left,
      moreOrLessEquals(content.left, epsilon: 0.01),
      reason: 'space-between puts nothing before the first child',
    );
    expect(
      last.right,
      moreOrLessEquals(content.right, epsilon: 0.01),
      reason: '…or after the last',
    );
    expect(
      last.left - first.right,
      moreOrLessEquals(4 * share + 2 * gap + fab.sizePx!, epsilon: 0.51),
      reason:
          'the ported flex `gap` is a spacer CHILD, so space-between cuts its '
          'free space four ways and each neighbour pair still lands gap + 2×'
          'share apart — 59px either side of the circle, what the web measures',
    );
  });

  testWidgets('the tab is the authored 48px box on a 44px floor', (
    WidgetTester tester,
  ) async {
    final AppNavSpec item = row('.nav-item', Brightness.light);
    await pumpNav(tester, children: barChildren());

    for (final Finder finder in <Finder>[
      find.byType(AppNavItem).first,
      find.byType(AppNavItem).last,
    ]) {
      expect(
        tester.getSize(finder),
        Size(item.minWidthPx!, item.heightPx!),
        reason:
            'min-width 44 / height 48 are border-box numbers: a short label '
            'sits on the floor and the 6px padding is inside it, not added',
      );
    }
  });

  testWidgets('the fab is the 48px square and lifts half its margin', (
    WidgetTester tester,
  ) async {
    final AppNavSpec bar = row('.floating-nav', Brightness.light);
    final AppNavSpec item = row('.nav-item', Brightness.light);
    final AppNavSpec fab = row('.nav-fab', Brightness.light);
    await pumpNav(tester, children: barChildren());

    expect(
      tester.getSize(find.byType(AppNavFab)),
      Size(fab.sizePx!, fab.sizePx!),
      reason: 'width and height are the same authored 48px',
    );
    // The layout box stays 48 tall so the bar's content height remains the
    // 48px tab it measured; only the paint travels, `align-items: center`
    // splitting the -14px margin between above and below.
    final Rect laid = localRect(tester, find.byType(AppNavFab));
    final Rect painted = localRect(tester, find.byType(AnimatedScale));
    expect(
      laid.top,
      moreOrLessEquals(contentRect(bar: bar, item: item).top, epsilon: 0.01),
      reason: 'centred in the 48px content band the tabs set',
    );
    expect(
      painted.top - laid.top,
      moreOrLessEquals(-fab.liftPx! / 2.0, epsilon: 0.01),
      reason: 'the box rises liftPx/2 above the row it is laid out in',
    );
  });

  for (final Brightness brightness in Brightness.values) {
    final String tag = brightness.name;

    testWidgets('the bar paints its 82% fill and its --line ring in $tag', (
      WidgetTester tester,
    ) async {
      final AppNavSpec bar = row('.floating-nav', brightness);
      final AppNavSpec item = row('.nav-item', brightness);
      await pumpNav(tester, brightness: brightness, children: barChildren());
      final _Surface surface = await paint(tester);

      expect(
        surface.width,
        boxWidth.round(),
        reason: 'the area, nothing wider',
      );
      expect(surface.height, boxHeight.round());

      final double top = barTop(bar, item, boxHeight);
      final double left = (boxWidth - barWidth(bar, boxWidth)) / 2;
      // The top padding band, clear of the tabs below and of the lifted fab's
      // shadow to the right: nothing painted over the fill, so the capture is
      // the fill itself.
      _expectPremultipliedFill(
        surface,
        (left + 48).round(),
        (top + 4).round(),
        bar.fillColor,
      );

      // The 1px `--line` ring on the straight top run, and the corner Chrome
      // measured as a pill: where the arc curves out of the bounding box there
      // is no border and no fill at all — a square radius would paint both.
      final int ringX = (left + 60).round();
      final int ringY = top.round();
      _expectSolid(
        surface,
        ringX,
        ringY,
        bar.borderColor,
        reason: 'the bar frame is the substituted --line',
      );
      expect(
        surface.alphaAt(left.round(), top.round()),
        lessThan((bar.fillColor.a * 255) / 2),
        reason:
            'the bounding-box corner is outside the 999px arc: neither frame '
            'nor fill reaches it, only the shadow’s faint floor',
      );
    });

    testWidgets('the tab paints no fill, so the bar shows through in $tag', (
      WidgetTester tester,
    ) async {
      final AppNavSpec bar = row('.floating-nav', brightness);
      await pumpNav(tester, brightness: brightness, children: barChildren());
      final _Surface surface = await paint(tester);

      final Rect tab = localRect(tester, find.byType(AppNavItem).first);
      // Inside the tab's own box, in the 6px padding band left of its icon
      // column, at the bar's mid-height: the bar's translucent fill, at the
      // fill's own alpha — a tab that painted a background would read 255.
      _expectPremultipliedFill(
        surface,
        (tab.left + 3).round(),
        tab.center.dy.round(),
        bar.fillColor,
      );
    });

    testWidgets('the fab paints the accent circle with its --bg ring in $tag', (
      WidgetTester tester,
    ) async {
      final AppNavSpec bar = row('.floating-nav', brightness);
      final AppNavSpec item = row('.nav-item', brightness);
      final AppNavSpec fab = row('.nav-fab', brightness);
      await pumpNav(tester, brightness: brightness, children: barChildren());
      final _Surface surface = await paint(tester);

      final int centreX = (boxWidth / 2).round();
      final double fabTop =
          contentRect(bar: bar, item: item).top - fab.liftPx! / 2.0;
      // Mid-band of the 3px frame at the top tangent. That row is above the
      // content band, where an unlifted box would still leave the bar's fill:
      // reading --bg here proves the -14px margin travelled.
      _expectSolid(
        surface,
        centreX,
        (fabTop + 1.5).round(),
        fab.borderColor,
        reason: 'the --bg ring is what bites the fab out of the bar',
      );
      _expectSolid(
        surface,
        centreX,
        (fabTop + fab.sizePx! / 2.0).round(),
        fab.fillColor,
        reason: 'the fill is the substituted --accent, opaque',
      );
    });

    testWidgets('the selected tab is the same box in the active ink in $tag', (
      WidgetTester tester,
    ) async {
      final AppNavSpec item = row('.nav-item', brightness);
      final AppNavSpec active = row('.nav-item-active', brightness);
      await pumpNav(
        tester,
        brightness: brightness,
        children: barChildren(selected: 1),
      );

      final TextStyle resting = labelStyle(tester, 'A');
      expect(
        resting.color,
        item.fgColor,
        reason: 'the unselected tab keeps the measured resting --ink-3',
      );
      expect(
        resting.fontSize,
        item.fontSizePx,
        reason: 'the 8px the class authors, not the theme ladder',
      );
      expect(resting.fontWeight, item.weight);
      expect(resting.height, item.lineHeightRatio);
      expect(resting.letterSpacing, item.letterSpacingPx);
      expect(resting.fontFamily, item.fontFamily);
      expect(
        tester.getSize(find.text('A')).height,
        moreOrLessEquals(item.lineHeightPx!, epsilon: 0.01),
        reason: 'the measured 12px line box, reached as 12/8 × 8',
      );

      final TextStyle chosen = labelStyle(tester, 'B');
      expect(
        chosen.color,
        active.fgColor,
        reason: 'the active row swaps the ink and nothing else',
      );
      expect(chosen.fontSize, item.fontSizePx);
      expect(chosen.fontWeight, item.weight);
      for (final Finder finder in <Finder>[
        find.byType(AppNavItem).first,
        find.byType(AppNavItem).last,
      ]) {
        expect(
          tester.getSize(finder),
          Size(item.minWidthPx!, item.heightPx!),
          reason: 'selected or not, the box is the class’s, unchanged',
        );
      }
    });
  }

  testWidgets('the child glyph takes its class ink through an IconTheme', (
    WidgetTester tester,
  ) async {
    final AppNavSpec item = row('.nav-item', Brightness.light);
    final AppNavSpec active = row('.nav-item-active', Brightness.light);
    final AppNavSpec fab = row('.nav-fab', Brightness.light);
    Color? restingInk;
    Color? chosenInk;
    Color? fabInk;
    Widget inkProbe(void Function(Color?) record) => Builder(
      builder: (BuildContext context) {
        record(IconTheme.of(context).color);
        return const SizedBox.shrink();
      },
    );

    await pumpNav(
      tester,
      children: <Widget>[
        AppNavItem(
          icon: inkProbe((Color? c) => restingInk = c),
          label: 'A',
          selected: false,
          onTap: () {},
        ),
        AppNavFab(onTap: () {}, child: inkProbe((Color? c) => fabInk = c)),
        AppNavItem(
          icon: inkProbe((Color? c) => chosenInk = c),
          label: 'B',
          selected: true,
          onTap: () {},
        ),
      ],
    );

    expect(
      restingInk,
      item.fgColor,
      reason: 'the tab hands its --ink-3 to the glyph, as `color` inherits',
    );
    expect(chosenInk, active.fgColor);
    expect(
      fabInk,
      fab.fgColor,
      reason: 'and the action its --accent-fg, which the selected tab shares',
    );
  });

  testWidgets('taps reach the tabs and the action; a null callback is inert', (
    WidgetTester tester,
  ) async {
    final List<int> tapped = <int>[];
    int fabTaps = 0;
    await pumpNav(
      tester,
      children: barChildren(onTab: tapped.add, onFab: () => fabTaps++),
    );

    await tester.tap(find.byType(AppNavItem).last);
    await tester.pump();
    await tester.tap(find.byType(AppNavFab));
    await tester.pump();
    expect(tapped, <int>[1], reason: 'the second tab is the one tapped');
    expect(fabTaps, 1, reason: 'the centre action takes its tap');

    await pumpNav(tester, children: barChildren());
    // `warnIfMissed: false` because inertness is the point: with every
    // handler null the gesture detector claims nothing, and the miss is the
    // proof, not a test artefact.
    await tester.tap(find.byType(AppNavItem).first, warnIfMissed: false);
    await tester.tap(find.byType(AppNavFab), warnIfMissed: false);
    await tester.pump();
    expect(tapped, <int>[1], reason: 'no callback, nothing to fire');
    expect(
      fabTaps,
      1,
      reason: 'and no repaint, because the class authors no disabled look',
    );
  });

  testWidgets('the press scales the action on the class’s own clock', (
    WidgetTester tester,
  ) async {
    final AppNavSpec fab = row('.nav-fab', Brightness.light);
    await pumpNav(tester, children: barChildren(onFab: () {}));

    double scale() =>
        tester.widget<AnimatedScale>(find.byType(AnimatedScale)).scale;
    expect(scale(), 1.0, reason: 'the resting transform is identity');

    final TestGesture gesture = await tester.startGesture(
      tester.getCenter(find.byType(AppNavFab)),
    );
    await tester.pump();
    await tester.pump(fab.pressDuration!);
    expect(
      scale(),
      fab.pressScale,
      reason: 'the one pressed state the family authors, at its own 130ms',
    );

    // AnimatedScale reports its target, not its tween — the clock itself is
    // what carries the class’s 130ms and its spring cubic into the picture.
    // Cubic has no value equality, so the four numbers are compared.
    final AnimatedScale presser = tester.widget<AnimatedScale>(
      find.byType(AnimatedScale),
    );
    expect(presser.duration, fab.pressDuration);
    final Cubic curve = presser.curve as Cubic;
    final Cubic authored = fab.pressCurve! as Cubic;
    expect(
      (curve.a, curve.b, curve.c, curve.d),
      (authored.a, authored.b, authored.c, authored.d),
      reason: 'the press runs on the cubic-bezier the transition names',
    );

    await gesture.up();
    await tester.pumpAndSettle();
    expect(scale(), 1.0, reason: 'release returns to the resting transform');
  });

  testWidgets('the bar announces its tabs, and which one is selected', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle handle = tester.ensureSemantics();
    await pumpNav(tester, children: barChildren(selected: 1, onTab: (_) {}));

    SemanticsData data(Finder finder) =>
        tester.getSemantics(finder).getSemanticsData();
    for (final Finder finder in <Finder>[
      find.byType(AppNavItem).first,
      find.byType(AppNavItem).last,
    ]) {
      expect(
        data(finder).flagsCollection.isButton,
        isTrue,
        reason: '${finder.toString()} is a button to a screen reader',
      );
      expect(
        data(finder).hasAction(SemanticsAction.tap),
        isTrue,
        reason: 'with a callback, the tab offers its tap action',
      );
    }
    expect(
      data(find.byType(AppNavItem).last).flagsCollection.isSelected,
      ui.Tristate.isTrue,
      reason: 'the selected tab says so; the resting one must not',
    );
    expect(
      data(find.byType(AppNavItem).first).flagsCollection.isSelected,
      ui.Tristate.isFalse,
    );
    handle.dispose();
  });
}

/// The pixels one painted bar covers, in the coordinates of the box it was
/// given — the same frame the geometry helpers above compute in.
class _Surface {
  _Surface({required this.bytes, required this.width, required this.height});

  final Uint8List bytes;
  final int width;
  final int height;

  List<int> rgbaAt(int x, int y) {
    final int i = (y * width + x) * 4;
    return <int>[bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]];
  }

  int alphaAt(int x, int y) => rgbaAt(x, y)[3];
}

/// A translucent pixel: at least the row's own coverage, and its colour. The
/// boundary layer is transparent, so the captured bytes are premultiplied.
/// What lands under this fill is the bar's own `--shadow-float` — the web
/// composites an outer box-shadow behind a translucent background the same
/// way, so the port matching it is correct, not noise — which means the pixel
/// carries strictly MORE coverage than the fill alone and its colour is the
/// fill biased by the shadow's dark ink. So: alpha only gets a floor (the
/// fill's own 82·255 coverage) and a ceiling that a flattened-to-opaque paint
/// would break, and the hue is checked after dividing the pixel's alpha out.
void _expectPremultipliedFill(
  _Surface surface,
  int x,
  int y,
  Color want, {
  double tolerance = 24.0,
}) {
  final List<int> have = surface.rgbaAt(x, y);
  final int wantAlpha = (want.a * 255).round();
  expect(
    have[3],
    greaterThanOrEqualTo(wantAlpha - 2),
    reason:
        '($x,$y) carries less than the fill’s own coverage — '
        '${have[3]} < ~$wantAlpha: the fill was not painted here',
  );
  expect(
    have[3],
    lessThan(250),
    reason: 'the 82% mix must stay translucent, not paint opaque',
  );
  for (final (int channel, double wantChannel) in <(int, double)>[
    (0, want.r * 255),
    (1, want.g * 255),
    (2, want.b * 255),
  ]) {
    expect(
      have[channel] * 255.0 / have[3],
      closeTo(wantChannel, tolerance),
      reason:
          'pixel ($x,$y) channel $channel is the row’s colour, shadow bleed '
          'aside — never the bar over a flattened fill or a wrong ink',
    );
  }
}

/// An opaque pixel: the row's colour, recovered from the premultiplied capture
/// by dividing out the pixel's own alpha, so the assertion holds whatever
/// coverage the anti-aliasing left and identifies the paint by its colour.
void _expectSolid(
  _Surface surface,
  int x,
  int y,
  Color want, {
  double tolerance = 8.0,
  String reason = 'the pixel is not the colour the class authored',
}) {
  final List<int> have = surface.rgbaAt(x, y);
  final int alpha = have[3];
  expect(alpha, greaterThanOrEqualTo(240), reason: '($x,$y) is barely painted');
  for (final (int channel, double wantChannel) in <(int, double)>[
    (0, want.r * 255),
    (1, want.g * 255),
    (2, want.b * 255),
  ]) {
    expect(
      have[channel] * 255.0 / alpha,
      closeTo(wantChannel, tolerance),
      reason: '$reason — pixel ($x,$y) channel $channel',
    );
  }
}
