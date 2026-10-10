import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:em_budget/core/theme/app_skeletons.dart';
import 'package:em_budget/core/theme/app_theme.dart';
import 'package:em_budget/presentation/widgets/app_skeleton.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

/// Pixel assertions for [AppSkeleton]. Every expectation is computed from the
/// measured §6 row it is checking — the fill, the frame, the ramp and the clock
/// `AppSkeletons` carries — so a passing test proves the box painted the row
/// rather than a number someone typed here, and a row that moved fails.
///
/// `pumpAndSettle` never appears in this file: the sweep runs forever, exactly as
/// the authored `infinite` iteration count says, and settling on it would hang.
void main() {
  /// The containing block the harness offers a skeleton that asks for `w-full`.
  const double harnessWidth = 240.0;

  /// The one §6 skeleton class, which `test/theme/ui_tokens_test.dart` proves
  /// `AppSkeletons` holds alone.
  const String cssClass = '.skeleton';

  final Key boundaryKey = UniqueKey();

  AppSkeletonSpec row(Brightness brightness) =>
      AppSkeletons.resolve(cssClass, brightness);

  /// [AppSkeleton] under a scaffold, with the pass and the user's motion
  /// preference set explicitly, inside the [RepaintBoundary] [paint] reads.
  Future<void> pumpSkeleton(
    WidgetTester tester, {
    required Widget skeleton,
    Brightness brightness = Brightness.light,
    bool disableAnimations = false,
    double? offerWidth = harnessWidth,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: appThemeData(isDark: false),
        darkTheme: appThemeData(isDark: true),
        themeMode: brightness == Brightness.dark
            ? ThemeMode.dark
            : ThemeMode.light,
        home: Scaffold(
          body: Center(
            child: MediaQuery(
              data: MediaQueryData(disableAnimations: disableAnimations),
              child: ConstrainedBox(
                // The containing block offers a width; it does not force one.
                // `w-full` is a skeleton filling this cap, and a skeleton whose
                // caller states a width is that width even though more was
                // offered — a tight `SizedBox` here would erase the second case.
                constraints: BoxConstraints(
                  maxWidth: offerWidth ?? double.infinity,
                ),
                child: RepaintBoundary(key: boundaryKey, child: skeleton),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// The layer the skeleton painted, as bytes. A [RepaintBoundary] holds its own
  /// layer, so anything outside the painted box is transparent rather than the
  /// scaffold's colour — which is what makes the corners testable.
  ///
  /// The capture runs inside `runAsync`: `toImage` completes on a real composited
  /// frame, and the fake clock a `testWidgets` body otherwise runs on never
  /// delivers it. Everything the assertions need is copied out into a
  /// [_Surface] before the real-async block returns, so no image escapes it.
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

  /// Advance the fake clock to a fraction of the authored period, from wherever
  /// the run already stands.
  Future<void> advance(
    WidgetTester tester,
    AppSkeletonSpec spec,
    double from,
    double to,
  ) =>
      tester.pump(Duration(milliseconds: ((to - from) * spec.sweepMs).round()));

  test('every variant name is a variant the generated table carries', () {
    expect(
      AppSkeletonVariant.values.map((AppSkeletonVariant v) => v.name).toSet(),
      AppSkeletons.variantClasses.keys.toSet(),
      reason:
          'the enum is the ported half of `variant={…}`: a variant the component '
          'renames has to fail here rather than paint the wrong class list',
    );
    for (final AppSkeletonVariant variant in AppSkeletonVariant.values) {
      expect(
        variant.classes,
        AppSkeletons.variantClasses[variant.name],
        reason: '${variant.name} restates the class list instead of reading it',
      );
    }
    expect(
      const AppSkeleton().variant.name,
      AppSkeletons.defaultVariant,
      reason:
          'a screen that asks for no variant gets the one the component defaults '
          'to, which is `text`',
    );
  });

  for (final Brightness brightness in Brightness.values) {
    final AppSkeletonSpec spec = row(brightness);

    testWidgets(
      'a parked skeleton is the measured fill and frame in ${brightness.name}',
      (WidgetTester tester) async {
        await pumpSkeleton(
          tester,
          skeleton: const AppSkeleton(),
          brightness: brightness,
          disableAnimations: true,
        );
        final _Surface surface = await paint(tester);
        final int midY = (surface.height / 2).floor();

        expect(
          surface.width,
          harnessWidth.round(),
          reason: 'w-full is the width the harness offered, not a width the widget chose',
        );
        expect(
          surface.height,
          AppSkeletons.textHeightPx.round(),
          reason: 'the text variant is its h-4 utility and nothing else',
        );

        // The padding box, clear of the frame and of either corner.
        _expectPixel(surface, 40, midY, spec.fillColor);
        _expectPixel(surface, 120, midY, spec.fillColor);
        _expectPixel(surface, 200, midY, spec.fillColor);
        // The frame `Skeleton.tsx` adds with its `border` utility, on the top
        // and bottom runs. `radiusPx` (14) exceeds half this box's height (8),
        // so the left and right edges are two tangent points and carry no straight
        // stroke to sample — the frame is one `Border.all`, and the two crisp
        // horizontal runs prove its colour and that the fill sits inside it.
        _expectPixel(surface, 60, 0, spec.borderColor);
        _expectPixel(surface, 60, surface.height - 1, spec.borderColor);
        // And the corner Chrome measured: outside the arc there is no paint at all.
        _expectClear(surface, 0, 0);
        _expectPainted(surface, 40, 0);
      },
    );

    testWidgets(
      'the sweep crosses the box on the authored ramp in ${brightness.name}',
      (WidgetTester tester) async {
        await pumpSkeleton(
          tester,
          skeleton: const AppSkeleton(),
          brightness: brightness,
        );
        final _Surface atStart = await paint(tester);
        final int midY = (atStart.height / 2).floor();
        final int midX = (atStart.width / 2).floor();

        // The band starts one box width left of the box and `overflow: hidden`
        // clips it there, so at t = 0 the whole padding box is the resting fill.
        _expectPixel(atStart, midX, midY, spec.fillColor);
        _expectPixel(atStart, 20, midY, spec.fillColor);

        // A quarter of the period. The curve is symmetric and eases in, so this
        // is not a quarter of the travel — what it proves is direction: the lit
        // end has reached the left of the box and nothing has reached the right.
        await advance(tester, spec, 0.0, 0.25);
        final _Surface atFirst = await paint(tester);
        expect(
          atFirst.litAt(20, midY, spec.fillColor),
          greaterThan(atFirst.litAt(atFirst.width - 21, midY, spec.fillColor)),
          reason: 'the band enters from the left, so the left is lit first',
        );

        // Half a period, where the authored 50% stop sits. Both ends of the box
        // are back at the fill, because the ramp's ends are the keyword
        // `transparent` — and the port hands them the sweep's own channels, so
        // the ramp reaches them without changing hue.
        await advance(tester, spec, 0.25, 0.5);
        final _Surface atMiddle = await paint(tester);
        _expectBlend(
          atMiddle,
          midX,
          midY,
          under: spec.fillColor,
          over: spec.sweepColor,
        );
        _expectPixel(atMiddle, 2, midY, spec.fillColor);
        _expectPixel(atMiddle, atMiddle.width - 3, midY, spec.fillColor);

        // Three quarters: travelling out of the right edge, so the right of the
        // box is now its lit half.
        await advance(tester, spec, 0.5, 0.75);
        final _Surface atLast = await paint(tester);
        expect(
          atLast.litAt(20, midY, spec.fillColor),
          lessThan(atLast.litAt(atLast.width - 21, midY, spec.fillColor)),
          reason:
              'the angle is 90deg, so the band leaves the way it came in — a sweep '
              'that lit the left edge last is a mirrored port',
        );

        // The frame is never painted over: the band is clipped to the padding box,
        // one border-width inside the outer box, so even mid-run — when the lit
        // half spans the centre — the top stroke is still its own colour.
        _expectPixel(atMiddle, 60, 0, spec.borderColor);
      },
    );

    testWidgets(
      'a reduced-motion preference stops the sweep instead of slowing it in ${brightness.name}',
      (WidgetTester tester) async {
        await pumpSkeleton(
          tester,
          skeleton: const AppSkeleton(),
          brightness: brightness,
          disableAnimations: true,
        );
        final _Surface first = await paint(tester);
        final int midY = (first.height / 2).floor();
        final int midX = (first.width / 2).floor();

        // The clamp at src/index.css:1371 runs every animation to its end in
        // 0.01ms on one iteration, and the end of this one is a box width past
        // the right edge — so there is no band to see and no clock left to move
        // it. Three periods of pumping change nothing.
        _expectPixel(first, midX, midY, spec.fillColor);
        for (int i = 0; i < 3; i++) {
          await tester.pump(spec.sweepPeriod);
        }
        final _Surface later = await paint(tester);
        _expectPixel(later, midX, midY, spec.fillColor);
        expect(
          later.litAt(midX, midY, spec.fillColor),
          0.0,
          reason: 'a parked band must not be even partly visible anywhere',
        );
        // The resting box keeps its frame and its fill while it waits.
        _expectPixel(later, 60, 0, spec.borderColor);
        _expectPixel(later, 120, midY, spec.fillColor);
      },
    );
  }

  testWidgets('the box takes its size from the variant and its caller', (
    WidgetTester tester,
  ) async {
    final Map<AppSkeletonVariant, double> authored =
        <AppSkeletonVariant, double>{
          AppSkeletonVariant.text: AppSkeletons.textHeightPx,
          AppSkeletonVariant.rectangular: AppSkeletons.rectangularHeightPx,
        };
    for (final MapEntry<AppSkeletonVariant, double> entry in authored.entries) {
      await pumpSkeleton(tester, skeleton: AppSkeleton(variant: entry.key));
      expect(
        tester.getSize(find.byType(AppSkeleton)),
        Size(harnessWidth, entry.value),
        reason:
            '${entry.key.name} is ${entry.value}px tall — its own h-<n> utility '
            'on the measured --spacing — and takes the width it is offered',
      );
    }

    await pumpSkeleton(
      tester,
      skeleton: const AppSkeleton(
        variant: AppSkeletonVariant.circular,
        width: 40,
        height: 40,
      ),
    );
    expect(
      tester.getSize(find.byType(AppSkeleton)),
      const Size(40, 40),
      reason:
          'the circular variant authors neither dimension, so both come from the '
          'caller that sits in the flex row with it',
    );

    await pumpSkeleton(tester, skeleton: const AppSkeleton(width: 64));
    expect(
      tester.getSize(find.byType(AppSkeleton)),
      Size(64, AppSkeletons.textHeightPx),
      reason: 'a width the caller states beats the width the layout offers',
    );
  });

  testWidgets('circular is the class corner, not the rounded-full it asked for', (
    WidgetTester tester,
  ) async {
    await pumpSkeleton(
      tester,
      skeleton: const AppSkeleton(
        variant: AppSkeletonVariant.circular,
        width: 40,
        height: 40,
      ),
      disableAnimations: true,
    );
    final _Surface surface = await paint(tester);

    _expectClear(surface, 0, 0);
    // At y = 2 the 14px arc still covers x = 8. The `rounded-full` the component
    // asks for would be a 20px circle inscribed in the box, whose edge at that
    // row is past x = 11. `src/index.css` authors `.skeleton` unlayered, so the
    // utility never wins — and the port paints what the browser paints, not what
    // the component meant.
    _expectPainted(surface, 8, 2);
  });
}

/// The pixels one painted skeleton covers.
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

  /// How far this pixel sits from the resting fill, in bytes summed over the
  /// three channels — 0 where no part of the band has reached the column, and
  /// larger the further the ramp has travelled through it.
  double litAt(int x, int y, Color fill) {
    final List<int> have = rgbaAt(x, y);
    final List<double> want = <double>[
      fill.r * 255,
      fill.g * 255,
      fill.b * 255,
    ];
    return (have[0] - want[0]).abs() +
        (have[1] - want[1]).abs() +
        (have[2] - want[2]).abs();
  }
}

/// The pixel as the row says it, within the 8-bit quantisation the canvas writes.
///
/// The opacity gate is `250`, not `255`: a pixel on the rounded frame — and on a
/// box this short, the left and right edges are nothing but the two tangent
/// points where the corner arcs meet — is anti-aliased against the transparent
/// outside, so it lands a couple of units under full opacity. That is still
/// proof it is painted; only the outside (which [_expectClear] reads) is at 0.
void _expectPixel(
  _Surface surface,
  int x,
  int y,
  Color want, {
  double tolerance = 2.0,
}) {
  final List<int> have = surface.rgbaAt(x, y);
  expect(
    have[3],
    greaterThanOrEqualTo(250),
    reason: '($x,$y) is not painted opaque',
  );
  final List<double> wantChannels = <double>[
    want.r * 255,
    want.g * 255,
    want.b * 255,
  ];
  for (int channel = 0; channel < 3; channel++) {
    expect(
      have[channel].toDouble(),
      closeTo(wantChannels[channel], tolerance),
      reason: 'pixel ($x,$y) channel $channel is not the row’s',
    );
  }
}

/// The pixel a `color-mix(… N%, transparent)` band leaves over an opaque ground:
/// the band's own channels at N%, over the fill's. Both ends of the ramp carry
/// those same channels, which is what makes the blend the same number in either
/// interpolation space.
void _expectBlend(
  _Surface surface,
  int x,
  int y, {
  required Color under,
  required Color over,
  double tolerance = 3.0,
}) {
  final List<int> have = surface.rgbaAt(x, y);
  expect(
    have[3],
    greaterThanOrEqualTo(250),
    reason: '($x,$y) is not painted opaque',
  );
  final List<double> underChannels = <double>[
    under.r * 255,
    under.g * 255,
    under.b * 255,
  ];
  final List<double> overChannels = <double>[
    over.r * 255,
    over.g * 255,
    over.b * 255,
  ];
  for (int channel = 0; channel < 3; channel++) {
    final double want =
        overChannels[channel] * over.a + underChannels[channel] * (1 - over.a);
    expect(
      have[channel].toDouble(),
      closeTo(want, tolerance),
      reason: 'pixel ($x,$y) channel $channel is the band over the fill',
    );
  }
}

void _expectPainted(_Surface surface, int x, int y) => expect(
  surface.alphaAt(x, y),
  greaterThanOrEqualTo(250),
  reason: '($x,$y) should be painted',
);

void _expectClear(_Surface surface, int x, int y) => expect(
  surface.alphaAt(x, y),
  lessThan(8),
  reason: '($x,$y) should be outside the box',
);
