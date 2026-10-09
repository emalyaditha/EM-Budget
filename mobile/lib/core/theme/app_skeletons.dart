// GENERATED — do not edit by hand.
// Produced by `node parity/generate_theme.cjs` from `parity/ui-tokens.json`, the
// Chrome-computed measurement of `src/index.css` at tag `pre-flutter`, with the
// curated token lists and phone markers of `parity/UI_SPEC.md` §2.1–§4.
// Every value below is the measurement; UI_SPEC §5 (whose machine "Dart" column
// mis-parses --blur-* / --container-* names as radii) is deliberately not used.

import 'package:flutter/material.dart';

import 'app_spacing.dart';

/// One §6 loading placeholder: the box Chrome measured at rest, and the sweep
/// the class authors on a pseudo-element over it. A widget under
/// `lib/presentation/` restates none of it.
class AppSkeletonSpec {
  const AppSkeletonSpec({
    required this.cssClass,
    required this.displayCss,
    required this.fillColor,
    required this.borderColor,
    required this.borderWidthPx,
    required this.radiusPx,
    required this.sweepColor,
    required this.sweepClearColor,
    required this.sweepBegin,
    required this.sweepEnd,
    required this.sweepMidStop,
    required this.sweepFromPercent,
    required this.sweepToPercent,
    required this.sweepMs,
    required this.easeX1,
    required this.easeY1,
    required this.easeX2,
    required this.easeY2,
    required this.animationName,
    required this.sweepEaseKeyword,
    required this.iterationCss,
  });

  /// The CSS class this row was measured from, and its computed `display`.
  final String cssClass;
  final String displayCss;

  /// `background: var(--surface-2)`, as the same pass’s probe reads it.
  final Color fillColor;

  /// The frame `src/components/ui/Skeleton.tsx` adds with the utilities
  /// `border border-[var(--line)]`. `.skeleton` itself authors no border — the
  /// probe measures `border-top-width: 0px` for the class alone — which is what
  /// makes this 1px frame the utility’s doing rather than the class’s, and
  /// [borderWidthPx] is the width Tailwind’s `border` declaration carries.
  final Color borderColor;
  final double borderWidthPx;

  /// `.skeleton`’s own `border-radius: var(--r-sm)`. It is the radius every
  /// variant ends up with, including the one that asks for `rounded-full`:
  /// see the note on [AppSkeletons.variantClasses].
  final double radiusPx;

  /// Authored `color-mix(in srgb, var(--surface) N%, transparent)` at the
  /// middle of the sweep, and the same colour at zero alpha at its two ends.
  ///
  /// CSS writes those ends as the keyword `transparent`, whose channels a
  /// premultiplied interpolation never reads. Flutter reads them: measured over
  /// a black ground, a `transparent` → white@0.7 ramp came back grey at the
  /// quarter point, so the port hands the transparent stop the sweep’s own
  /// channels. That leaves the ramp constant-hue, which is what Chrome paints —
  /// and it is the same in either interpolation space, so the pixel does not
  /// depend on which one a given engine uses.
  final Color sweepColor;
  final Color sweepClearColor;

  /// The gradient line, from the authored angle: 90deg is
  /// `Alignment(-1, 0) → Alignment(1, 0)`, the box crossed left to right.
  final Alignment sweepBegin;
  final Alignment sweepEnd;
  final double sweepMidStop;

  /// The band starts at the element’s own `transform: translateX(-100%)` and
  /// `@keyframes [animationName]` gives the frame at 100%; the element’s inset
  /// is the whole box, so one percent of it is one box width.
  final double sweepFromPercent;
  final double sweepToPercent;

  /// The authored `animation` shorthand: one loop of [sweepPeriod] on
  /// [sweepCurve], taken from the keyword [sweepEaseKeyword] as css-easing-1
  /// defines it, running forever ([iterationCss]). The class names no
  /// `var(--dur-*)` or `var(--ease-*)` here, and the port takes that literally:
  /// the shimmer is not on the §4 motion scale.
  final int sweepMs;
  final double easeX1;
  final double easeY1;
  final double easeX2;
  final double easeY2;
  final String animationName;
  final String sweepEaseKeyword;
  final String iterationCss;

  BorderRadius get borderRadius => BorderRadius.circular(radiusPx);

  Border get border => Border.all(color: borderColor, width: borderWidthPx);

  /// The clip the sweep rides in. CSS `overflow: hidden` clips a box’s
  /// descendants to its **padding** box, whose corner is the authored radius
  /// minus the border width — 13px of a 14px corner. Flutter draws the border
  /// inside the same outline, so reusing [radiusPx] here would let the sweep
  /// paint over the frame it is meant to sit behind.
  double get sweepClipRadiusPx {
    final double inner = radiusPx - borderWidthPx;
    return inner < 0.0 ? 0.0 : inner;
  }

  BorderRadius get sweepClipRadius => BorderRadius.circular(sweepClipRadiusPx);

  Duration get sweepPeriod => Duration(milliseconds: sweepMs);

  Cubic get sweepCurve => Cubic(easeX1, easeY1, easeX2, easeY2);

  LinearGradient get sweepGradient => LinearGradient(
    begin: sweepBegin,
    end: sweepEnd,
    colors: <Color>[sweepClearColor, sweepColor, sweepClearColor],
    stops: <double>[0.0, sweepMidStop, 1.0],
  );

  /// The band’s x-shift at a point in its run. CSS interpolates the element’s
  /// authored `translateX(-100%)` and the keyframe’s `translateX(100%)`
  /// between them, so `t = 0` sits one width left of the box and `t = 1` one
  /// width right; at `t = 0.5` the gradient is where the rule put it.
  double sweepShiftPx(double width, double t) =>
      width *
      (sweepFromPercent + (sweepToPercent - sweepFromPercent) * t) /
      100.0;
}

/// The §6 loading placeholders, keyed by CSS class — one map per measured
/// brightness pass.
abstract final class AppSkeletons {
  /// light pass (UI_SPEC §6.1–§6.2, `light-desktop`; the sweep from `src/index.css`).
  static const Map<String, AppSkeletonSpec> light = <String, AppSkeletonSpec>{
    '.skeleton': AppSkeletonSpec(
      cssClass: '.skeleton',
      displayCss: 'block',
      fillColor: Color.fromRGBO(235, 241, 247, 1.0),
      borderColor: Color.fromRGBO(216, 223, 230, 1.0),
      borderWidthPx: 1.0,
      radiusPx: 14.0,
      sweepColor: Color.fromRGBO(252, 254, 255, 0.7),
      sweepClearColor: Color.fromRGBO(252, 254, 255, 0.0),
      sweepBegin: Alignment(-1.0, 0.0),
      sweepEnd: Alignment(1.0, 0.0),
      sweepMidStop: 0.5,
      sweepFromPercent: -100.0,
      sweepToPercent: 100.0,
      sweepMs: 1400,
      easeX1: 0.42,
      easeY1: 0.0,
      easeX2: 0.58,
      easeY2: 1.0,
      animationName: 'shimmer',
      sweepEaseKeyword: 'ease-in-out',
      iterationCss: 'infinite',
    ),
  };

  /// dark pass (UI_SPEC §6.1–§6.2, `dark-desktop`; the sweep from `src/index.css`).
  static const Map<String, AppSkeletonSpec> dark = <String, AppSkeletonSpec>{
    '.skeleton': AppSkeletonSpec(
      cssClass: '.skeleton',
      displayCss: 'block',
      fillColor: Color.fromRGBO(24, 32, 43, 1.0),
      borderColor: Color.fromRGBO(33, 40, 51, 1.0),
      borderWidthPx: 1.0,
      radiusPx: 14.0,
      sweepColor: Color.fromRGBO(15, 21, 31, 0.7),
      sweepClearColor: Color.fromRGBO(15, 21, 31, 0.0),
      sweepBegin: Alignment(-1.0, 0.0),
      sweepEnd: Alignment(1.0, 0.0),
      sweepMidStop: 0.5,
      sweepFromPercent: -100.0,
      sweepToPercent: 100.0,
      sweepMs: 1400,
      easeX1: 0.42,
      easeY1: 0.0,
      easeX2: 0.58,
      easeY2: 1.0,
      animationName: 'shimmer',
      sweepEaseKeyword: 'ease-in-out',
      iterationCss: 'infinite',
    ),
  };

  /// The rules the row was read from, printed once because both passes share
  /// them:
  /// `.skeleton` (src/index.css:1302) sets `position: relative`,
  /// `overflow: hidden`, the fill and `border-radius: --r-sm`.
  /// `.skeleton::after` (src/index.css:1308) fills the box (`inset: 0`,
  /// `content: ''`), sweeps a `90deg` gradient that
  /// peaks at `--surface 70%` across `50%` of
  /// the box, starts at `translateX(-100%)`, and runs
  /// `shimmer 1400ms ease-in-out infinite`.
  /// `@keyframes shimmer` (src/index.css:1321) ends at
  /// `translateX(100%)` and authors nothing else.
  ///
  /// A reduced-motion preference stops the sweep rather than slowing it.
  /// `.skeleton` is not taken off its
  /// animation there; what stops it is the block at
  /// src/index.css:1371, which sets
  /// `animation-duration: 0.01ms !important` and
  /// `animation-iteration-count: 1 !important` on `*`, `*::before` and
  /// `*::after`, so the run finishes in an instant parked one box width off the
  /// right edge — no band visible, only the resting fill and frame. That is the
  /// answer the port gives. Flutter names that preference
  /// `MediaQuery.disableAnimationsOf`: `MediaQueryData` carries no `reduceMotion`
  /// flag of its own (`dart:ui.AccessibilityFeatures.reduceMotion` is the closer
  /// primitive, but it is not routed through MediaQuery and a widget cannot
  /// rebuild on it), and `disableAnimations` is the channel the framework already
  /// treats as "stop animating this for me".

  /// The variants `src/components/ui/Skeleton.tsx` composes over the class,
  /// as that file writes them. They are Tailwind utilities, so they exist in
  /// the generated stylesheet rather than in `src/index.css`, and the
  /// component is the source that says what a skeleton is asked to look like.
  static const Map<String, String> variantClasses = <String, String>{
    'text': 'rounded-[var(--r-sm)] h-4 w-full',
    'circular': 'rounded-full shrink-0',
    'rectangular': 'rounded-[var(--r-md)] w-full h-24',
  };

  /// The variant a skeleton gets when its caller asks for none — the default
  /// the component’s own signature carries (`variant = 'text'`).
  static const String defaultVariant = 'text';

  /// Every variant asks for a radius and none of them gets it.
  /// `src/index.css` authors `.skeleton` *unlayered*, while Tailwind emits
  /// `rounded-*` inside `@layer utilities`, and in the cascade an unlayered
  /// declaration outranks every layer regardless of where either appears. The
  /// compiled stylesheet puts `@layer utilities{…}` before the component
  /// classes for exactly that reason. Measured in Chrome: `rounded-full`,
  /// `rounded-[var(--r-md)]` and `rounded-[var(--r-sm)]` all compute the
  /// class’s 14px corner. So [AppSkeletonSpec.radiusPx] is the whole story,
  /// and a phone that painted a circle here would be porting the component’s
  /// intent instead of the browser’s result.

  /// `h-<n>` is `calc(n * --spacing)`, which [AppSpacing.scale] implements on
  /// the measured unit: the text row is 16px tall and the rectangular block
  /// 96px. `circular` sizes by neither — the component gives it no height and
  /// asks its caller for both dimensions (`shrink-0`).
  static const double textHeightScale = 4.0;
  static const double rectangularHeightScale = 24.0;

  static double get textHeightPx => AppSpacing.scale(textHeightScale);

  static double get rectangularHeightPx =>
      AppSpacing.scale(rectangularHeightScale);

  /// The class list every skeleton carries, including the frame
  /// [AppSkeletonSpec.borderColor] and [AppSkeletonSpec.borderWidthPx] come
  /// from, and the `motion-reduce:animate-none` that does not reach the sweep:
  /// it applies `animation: none` to the element, and the animation lives on
  /// `.skeleton::after`, which the element’s own class cannot set.
  static const String baseClasses =
      'skeleton border border-[var(--line)] motion-reduce:animate-none';

  static AppSkeletonSpec resolve(String cssClass, Brightness brightness) {
    final Map<String, AppSkeletonSpec> table = brightness == Brightness.dark
        ? dark
        : light;
    final AppSkeletonSpec? spec = table[cssClass];
    if (spec == null) throw ArgumentError('$cssClass is not a §6 skeleton');
    return spec;
  }
}
