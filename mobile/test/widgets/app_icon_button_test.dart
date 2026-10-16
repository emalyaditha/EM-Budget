import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:em_budget/core/theme/app_icon_buttons.dart';
import 'package:em_budget/core/theme/app_theme.dart';
import 'package:em_budget/presentation/widgets/app_icon_button.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

/// Pixel and behaviour assertions for [AppIconButton], each computed from the
/// measured §6 row it checks — the pill's size, its translucent fill, its opaque
/// hairline ring and its icon colour — so a pass proves the box painted the row
/// and a row that moved fails.
///
/// The pill is a full circle (`border-radius: 999px` clamped to half its 38px
/// box), so there is no straight border run to sample: the ring is read at the
/// top and left tangent points, where the arc is locally horizontal or vertical
/// and covers its pixel fully. The centre is read for the thing the whole widget
/// turns on — that the `color-mix(… 70%, transparent)` fill is painted at 0.7
/// alpha, translucent, and NOT flattened to an opaque colour.
///
/// The second row is the composed `.glass-pill .icon-btn` header context: the
/// descendant rule authors only size, `background: transparent` and
/// `border-color: transparent`, so its tests prove the box shrank, that the
/// written-off fill and frame paint NOTHING over what sits behind, and that the
/// transparent frame still occupies its 1px of layout.
void main() {
  const String cssClass = '.icon-btn';
  const String pillCssClass = '.glass-pill .icon-btn';

  /// A colour no §6 row contains, so any read-through of it is provably the
  /// backdrop and any deviation is provably the icon painting something.
  const Color backdropColour = Color(0xFF00FF00);
  const double backdropSide = 200.0;

  final Key boundaryKey = UniqueKey();

  AppIconButtonSpec row(Brightness brightness) =>
      AppIconButtons.resolve(cssClass, brightness);

  AppIconButtonSpec pillRow(Brightness brightness) =>
      AppIconButtons.resolve(pillCssClass, brightness);

  Future<void> pumpButton(
    WidgetTester tester, {
    required Widget child,
    Brightness brightness = Brightness.light,
    VoidCallback? onPressed,
    bool inGlassPill = false,
    bool onBackdrop = false,
  }) async {
    final AppIconButton button = inGlassPill
        ? AppIconButton.inGlassPill(onPressed: onPressed, child: child)
        : AppIconButton(onPressed: onPressed, child: child);
    await tester.pumpWidget(
      MaterialApp(
        theme: appThemeData(isDark: false),
        darkTheme: appThemeData(isDark: true),
        themeMode: brightness == Brightness.dark
            ? ThemeMode.dark
            : ThemeMode.light,
        home: Scaffold(
          body: Center(
            child: RepaintBoundary(
              key: boundaryKey,
              child: onBackdrop
                  ? SizedBox(
                      width: backdropSide,
                      height: backdropSide,
                      child: Stack(
                        alignment: Alignment.center,
                        children: <Widget>[
                          const Positioned.fill(
                            child: ColoredBox(color: backdropColour),
                          ),
                          button,
                        ],
                      ),
                    )
                  : button,
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

  testWidgets('the pill is the authored 38×38 box in both passes', (
    WidgetTester tester,
  ) async {
    for (final Brightness brightness in Brightness.values) {
      final AppIconButtonSpec spec = row(brightness);
      await pumpButton(
        tester,
        child: const SizedBox.shrink(),
        brightness: brightness,
      );
      expect(
        tester.getSize(find.byType(AppIconButton)),
        Size(spec.sizePx, spec.sizePx),
        reason:
            '${brightness.name}: the size is the class’s authored 38px square, not a caller’s',
      );
    }
  });

  for (final Brightness brightness in Brightness.values) {
    testWidgets(
      'the child inherits the class icon colour through an IconTheme in ${brightness.name}',
      (WidgetTester tester) async {
        final AppIconButtonSpec spec = row(brightness);
        Color? seen;
        await pumpButton(
          tester,
          brightness: brightness,
          child: Builder(
            builder: (BuildContext context) {
              seen = IconTheme.of(context).color;
              return const SizedBox.shrink();
            },
          ),
        );
        expect(
          seen,
          spec.iconColor,
          reason:
              '${brightness.name}: the glyph takes `color: var(--ink-2)` as measured, '
              'not a Material default',
        );
      },
    );
  }

  for (final Brightness brightness in Brightness.values) {
    testWidgets(
      'the pill paints the translucent fill and hairline ring in ${brightness.name}',
      (WidgetTester tester) async {
        final AppIconButtonSpec spec = row(brightness);
        await pumpButton(
          tester,
          child: const SizedBox.shrink(),
          brightness: brightness,
        );
        final _Surface surface = await paint(tester);

        expect(
          surface.width,
          spec.sizePx.round(),
          reason: 'the layer is the authored square, nothing wider',
        );
        expect(surface.height, spec.sizePx.round());

        // Centre: the color-mix fill, painted at its own 0.7 alpha over the
        // transparent boundary layer — the whole reason this is a frosted pill.
        final int c = (spec.sizePx / 2).floor();
        _expectSemiFill(surface, c, c, spec.fillColor);
        // A little off-centre is still interior fill, clear of the ring.
        _expectSemiFill(surface, c, c + 4, spec.fillColor);

        // The opaque 1px `--line` ring, read at the two tangent points where the
        // arc lies flat against a pixel edge and so covers it fully.
        _expectRing(surface, c, 0, spec.borderColor);
        _expectRing(surface, 0, c, spec.borderColor);

        // And the corner Chrome measured as a circle: outside the arc there is no
        // paint at all — a square radius would paint here instead.
        _expectClear(surface, 0, 0);
      },
    );
  }

  testWidgets('the header context takes the authored 34×34, not the 38×38', (
    WidgetTester tester,
  ) async {
    for (final Brightness brightness in Brightness.values) {
      final AppIconButtonSpec pill = pillRow(brightness);
      final AppIconButtonSpec base = row(brightness);
      await pumpButton(
        tester,
        child: const SizedBox.shrink(),
        brightness: brightness,
        inGlassPill: true,
      );
      expect(
        tester.getSize(find.byType(AppIconButton)),
        Size(pill.sizePx, pill.sizePx),
        reason:
            '${brightness.name}: the descendant rule authors the size, and the widget obeys it',
      );
      expect(
        pill.sizePx,
        lessThan(base.sizePx),
        reason: 'the composition is the smaller box the css writes, not a copy of the base',
      );
    }
  });

  for (final Brightness brightness in Brightness.values) {
    testWidgets(
      'the transparent frame still occupies its pixel, painted or not, in ${brightness.name}',
      (WidgetTester tester) async {
        for (final (bool inPill, AppIconButtonSpec Function(Brightness) pick)
            in <(bool, AppIconButtonSpec Function(Brightness))>[
              (false, row),
              (true, pillRow),
            ]) {
          late BoxConstraints inner;
          await pumpButton(
            tester,
            brightness: brightness,
            inGlassPill: inPill,
            child: LayoutBuilder(
              builder: (BuildContext context, BoxConstraints constraints) {
                inner = constraints;
                return const SizedBox.shrink();
              },
            ),
          );
          final AppIconButtonSpec spec = pick(brightness);
          final double inset = spec.borderWidthPx + spec.paddingPx;
          expect(
            inner.maxWidth,
            spec.sizePx - 2 * inset,
            reason:
                '${spec.cssClass}: a transparent border is not a missing one — it still costs a pixel per side',
          );
          expect(inner.maxHeight, spec.sizePx - 2 * inset);
        }
      },
    );
  }

  for (final Brightness brightness in Brightness.values) {
    testWidgets(
      'in the header context the icon paints no fill and no frame over what sits behind, in ${brightness.name}',
      (WidgetTester tester) async {
        final AppIconButtonSpec pill = pillRow(brightness);
        await pumpButton(
          tester,
          child: const SizedBox.shrink(),
          brightness: brightness,
          inGlassPill: true,
          onBackdrop: true,
        );
        final _Surface surface = await paint(tester);
        expect(surface.width, backdropSide.round());
        expect(surface.height, backdropSide.round());

        final int mid = (backdropSide / 2).round();
        final int edge = mid - (pill.sizePx / 2).round();
        // Centre: the written-off `background: transparent` paints nothing, and
        // a blur of a flat backdrop is that same flat colour.
        _expectBackdrop(surface, mid, mid);
        // The two tangent points: the `border-color: transparent` frame is not
        // repainted with the base row's --line ring here.
        _expectBackdrop(surface, mid, edge);
        _expectBackdrop(surface, edge, mid);
        // Outside the circle: a full 999px corner, so no square paint either.
        _expectBackdrop(surface, edge, edge);
      },
    );
  }

  testWidgets(
    'the header context keeps frosting: the descendant rule never touches backdrop-filter',
    (WidgetTester tester) async {
      await pumpButton(
        tester,
        child: const SizedBox.shrink(),
        inGlassPill: true,
      );
      expect(pillRow(Brightness.light).blurPx, row(Brightness.light).blurPx);
      expect(
        find.descendant(
          of: find.byType(AppIconButton),
          matching: find.byType(BackdropFilter),
        ),
        findsOneWidget,
        reason: 'the blur the base row measured still applies inside the pill',
      );
      expect(
        find.descendant(
          of: find.byType(AppIconButton),
          matching: find.byType(ClipRRect),
        ),
        findsOneWidget,
      );
    },
  );

  for (final Brightness brightness in Brightness.values) {
    testWidgets(
      'the header context hands the glyph the same --ink-2 as the base row in ${brightness.name}',
      (WidgetTester tester) async {
        final AppIconButtonSpec pill = pillRow(brightness);
        Color? seen;
        await pumpButton(
          tester,
          brightness: brightness,
          inGlassPill: true,
          child: Builder(
            builder: (BuildContext context) {
              seen = IconTheme.of(context).color;
              return const SizedBox.shrink();
            },
          ),
        );
        expect(seen, pill.iconColor);
        expect(
          pill.iconColor,
          row(brightness).iconColor,
          reason: 'the descendant rule writes no colour, so the ink stays the probed --ink-2',
        );
        expect(
          seen,
          row(brightness).iconColor,
          reason: '${brightness.name}: the glyph takes the composed row’s ink',
        );
      },
    );
  }

  testWidgets('a tap fires the callback, and a null callback is inert', (
    WidgetTester tester,
  ) async {
    int taps = 0;
    await pumpButton(
      tester,
      child: const SizedBox.shrink(),
      onPressed: () => taps++,
    );
    await tester.tap(find.byType(AppIconButton));
    await tester.pump();
    expect(
      taps,
      1,
      reason: 'the pill is the header button, so it takes the tap',
    );

    await pumpButton(tester, child: const SizedBox.shrink(), onPressed: null);
    await tester.tap(find.byType(AppIconButton));
    await tester.pump();
    expect(
      taps,
      1,
      reason: 'with no callback there is nothing to fire — and no repaint, because the class authors no disabled look',
    );

    taps = 0;
    await pumpButton(
      tester,
      child: const SizedBox.shrink(),
      inGlassPill: true,
      onPressed: () => taps++,
    );
    await tester.tap(find.byType(AppIconButton));
    await tester.pump();
    expect(
      taps,
      1,
      reason:
          'the named constructor changes the row it paints, not the behaviour',
    );
  });

  test('an unknown class is refused, not painted', () {
    expect(
      () => AppIconButtons.resolve('.card', Brightness.light),
      throwsArgumentError,
    );
    expect(
      () => AppIconButtons.resolve('.glass-pill', Brightness.light),
      throwsArgumentError,
      reason: 'the pill container is a surface, painted by AppCard’s .glass-pill row — it is not an icon-button class',
    );
  });
}

/// The pixels one painted pill covers.
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

/// A ring pixel: the class's border colour, painted solidly enough to prove the
/// hairline is there. The pill is a full circle, so there is no straight border
/// run — every perimeter pixel the arc passes through is anti-aliased against the
/// transparent layer (measured here in the low 240s), and the capture is
/// premultiplied. Dividing each channel by the pixel's own alpha recovers the
/// straight colour, so the assertion holds whatever the coverage, and identifies
/// the ring by the colour the class authored. The 200 gate clears the ring from
/// the 0.7-alpha fill (179), which is the one thing the centre already proves.
void _expectRing(
  _Surface surface,
  int x,
  int y,
  Color want, {
  double tolerance = 8.0,
}) {
  final List<int> have = surface.rgbaAt(x, y);
  final int alpha = have[3];
  expect(
    alpha,
    greaterThanOrEqualTo(200),
    reason: '($x,$y) ring pixel is barely painted',
  );
  final List<double> wantChannels = <double>[
    want.r * 255,
    want.g * 255,
    want.b * 255,
  ];
  for (int channel = 0; channel < 3; channel++) {
    final double straight = have[channel] * 255.0 / alpha;
    expect(
      straight,
      closeTo(wantChannels[channel], tolerance),
      reason:
          'ring pixel ($x,$y) channel $channel is not the row’s border colour',
    );
  }
}

/// An interior pixel: the fill's colour at the fill's OWN alpha — not opaque.
/// Proving `alpha ≈ 0.7·255` is what shows the port carried the
/// `color-mix(… 70%, transparent)` through to the raster instead of flattening
/// the pill to a solid surface.
///
/// The boundary layer the pill sits in is transparent, so the captured bytes are
/// premultiplied: each channel is the fill's colour × its alpha. That product
/// fixes the colour and the alpha at once — a flattened opaque fill would read
/// 255 here rather than 0.7·255, and a different hue would miss the product.
void _expectSemiFill(
  _Surface surface,
  int x,
  int y,
  Color want, {
  double tolerance = 4.0,
}) {
  final List<int> have = surface.rgbaAt(x, y);
  final int wantAlpha = (want.a * 255).round();
  expect(
    have[3],
    closeTo(wantAlpha, tolerance),
    reason:
        '($x,$y) is not the translucent fill — alpha ${have[3]}, want ~$wantAlpha',
  );
  expect(
    have[3],
    lessThan(250),
    reason: 'the fill must stay translucent, not paint opaque',
  );
  final List<double> wantPremultiplied = <double>[
    want.r * 255 * want.a,
    want.g * 255 * want.a,
    want.b * 255 * want.a,
  ];
  for (int channel = 0; channel < 3; channel++) {
    expect(
      have[channel].toDouble(),
      closeTo(wantPremultiplied[channel], tolerance),
      reason:
          'fill pixel ($x,$y) channel $channel is the row’s colour × its alpha',
    );
  }
}

void _expectClear(_Surface surface, int x, int y) => expect(
  surface.alphaAt(x, y),
  lessThan(8),
  reason: '($x,$y) is outside the circle and must carry no paint',
);

/// A pixel of the flat green backdrop showing through the header-context icon:
/// the layer is opaque there, so anything the icon itself painted — the base
/// row's fill, its ring, or a flattened colour — would move the pixel off pure
/// green. Blurring a flat backdrop is the same flat colour, so a pass reads the
/// backdrop exactly, while the composition's whole point is that the icon adds
/// no paint of its own.
void _expectBackdrop(_Surface surface, int x, int y) {
  final List<int> have = surface.rgbaAt(x, y);
  expect(
    have[3],
    closeTo(255, 4),
    reason:
        '($x,$y): the backdrop is opaque, so a shortfall means the clip ate paint',
  );
  const List<int> want = <int>[0, 255, 0];
  for (int channel = 0; channel < 3; channel++) {
    expect(
      have[channel],
      closeTo(want[channel], 4),
      reason:
          '($x,$y) channel $channel is not the backdrop reading through — the icon painted something here',
    );
  }
}
