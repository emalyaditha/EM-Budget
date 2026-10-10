// GENERATED — do not edit by hand.
// Produced by `node parity/generate_theme.cjs` from `parity/ui-tokens.json`, the
// Chrome-computed measurement of `src/index.css` at tag `pre-flutter`, with the
// curated token lists and phone markers of `parity/UI_SPEC.md` §2.1–§4.
// Every value below is the measurement; UI_SPEC §5 (whose machine "Dart" column
// mis-parses --blur-* / --container-* names as radii) is deliberately not used.

import 'package:flutter/material.dart';

/// One §6 navigation class — the phone’s floating bottom bar, one of its
/// tabs, the selected tab, or the raised centre action — measured on the
/// phone pass, with the authored placement numbers the probe cannot see read
/// from the same pinned `src/index.css` rules. A widget under
/// `lib/presentation/` restates none of it.
///
/// The four rows share one shape because one widget composes them: fields a
/// class does not author are `null` — a measured absence, not a default.
/// In particular:
/// * `.floating-nav` fills with `color-mix(… 82%, transparent)` over a
///   `backdrop-filter: blur(22px) saturate(1.5)`, so [fillColor] carries that
///   alpha and [blurSigmaPx] is the port’s own blur mapping (CSS blur radius
///   halved, as in [AppSurfaceSpec]). The `saturate()` travels as data and is
///   unimplemented — the same recorded finding [AppSurfaceSpec] carries.
/// * `.nav-item-active` is the composed measurement (`.nav-item` carrying the
///   override): identical geometry to a resting tab, the accent ink instead.
/// * `.nav-fab` is the only state the family ports: `:active` scales it on the
///   clock its own rule transitions ([pressScale], [transitionMs], [pressCurve]).
/// * `env(safe-area-inset-bottom)` in the bar’s `bottom` becomes the host’s
///   view padding at paint time, not a number in this table.
class AppNavSpec {
  const AppNavSpec({
    required this.cssClass,
    required this.displayCss,
    required this.position,
    required this.radiusPx,
    required this.borderWidthPx,
    required this.borderColor,
    required this.fillColor,
    required this.fgColor,
    required this.blurPx,
    required this.blurSaturate,
    required this.shadows,
    required this.paddingVerticalPx,
    required this.paddingHorizontalPx,
    required this.fontFamily,
    required this.fontSizePx,
    required this.fontWeight,
    required this.lineHeightPx,
    required this.letterSpacingPx,
    required this.sizePx,
    required this.minWidthPx,
    required this.heightPx,
    required this.gapPx,
    required this.liftPx,
    required this.maxBarWidthPx,
    required this.edgeInsetPx,
    required this.bottomGapPx,
    required this.pressScale,
    required this.transitionMs,
    required this.easeX1,
    required this.easeY1,
    required this.easeX2,
    required this.easeY2,
  });

  /// The CSS class this row was measured from.
  final String cssClass;

  /// The computed `display` and `position`, on the pass that shows the bar.
  /// Carried as data, not applied: the Flutter placement is [AppNav]’s own
  /// composition, and desktop hides this surface entirely.
  final String displayCss;
  final String position;

  final double radiusPx;

  /// Measured on one side; `.nav-item` measures 0px — no frame at all.
  final double borderWidthPx;
  final Color borderColor;

  /// The resting fill: the bar’s translucent 82% mix, the fab’s solid accent,
  /// the tab’s measured transparent.
  final Color fillColor;

  /// The ink (`color`): a tab’s resting `--ink-3`, an active tab’s or the
  /// fab’s `--accent-fg`.
  final Color fgColor;

  /// The `backdrop-filter` blur in CSS px; `0.0` is the measured `none`.
  final double blurPx;

  /// The `saturate()` the same filter carries — recorded, unimplemented.
  final double? blurSaturate;

  /// The measured resting `box-shadow` list, layer for layer: the bar’s
  /// `--shadow-float` and the fab’s `--shadow-float` + 35% accent halo.
  /// Tabs measured `none`.
  final List<BoxShadow>? shadows;

  final double paddingVerticalPx;
  final double paddingHorizontalPx;

  /// The label type, authored only by `.nav-item` (and so by the composed
  /// active row); `null` on the bar and the fab, which author no font.
  final String? fontFamily;
  final double? fontSizePx;
  final int? fontWeight;
  final double? lineHeightPx;
  final double? letterSpacingPx;

  /// Authored placement, the probe’s blind spots: the fab’s square size, the
  /// tab’s `min-width`/`height` floor, the flex `gap`s, the fab’s `-14px`
  /// lift, and the bar’s `min(100% - 24px, 460px)` pair plus its `bottom`
  /// gap over the safe area.
  final double? sizePx;
  final double? minWidthPx;
  final double? heightPx;
  final double? gapPx;
  final double? liftPx;
  final double? maxBarWidthPx;
  final double? edgeInsetPx;
  final double? bottomGapPx;

  /// The fab’s `:active scale(…)` and the `transition` clock its own rule
  /// names; null on every other row, which authors no press state.
  final double? pressScale;
  final int? transitionMs;
  final double? easeX1;
  final double? easeY1;
  final double? easeX2;
  final double? easeY2;

  BorderRadius get borderRadius => BorderRadius.circular(radiusPx);

  /// `null` where the class measured no frame, rather than a zero-width one.
  Border? get border => borderWidthPx == 0
      ? null
      : Border.all(color: borderColor, width: borderWidthPx);

  /// CSS blur radius → Flutter sigma, the port’s fixed mapping (see
  /// [AppSurfaceSpec.blurSigma]); `null` where the filter measured `none`.
  double? get blurSigmaPx => blurPx == 0 ? null : blurPx / 2;

  /// The measured `font-weight`, which the classes author as a number and
  /// Flutter names — the same mapping [AppControlSpec.weight] applies.
  FontWeight get weight => FontWeight.values[fontWeight! ~/ 100 - 1];

  /// The line box the tab measures, as the multiple of its own font size
  /// Flutter wants: the 12px box over the authored 8px, no literal between.
  double? get lineHeightRatio => lineHeightPx == null || fontSizePx == null
      ? null
      : lineHeightPx! / fontSizePx!;

  /// The fab’s press clock, duration and curve both authored by the class.
  Duration? get pressDuration {
    final int? ms = transitionMs;
    return ms == null ? null : Duration(milliseconds: ms);
  }

  Curve? get pressCurve =>
      easeX1 == null ? null : Cubic(easeX1!, easeY1!, easeX2!, easeY2!);
}

/// The §6 floating-navigation rows, keyed by CSS class — one map per
/// measured phone pass.
abstract final class AppNavs {
  /// light pass (UI_SPEC §6, `light-phone`; placement from the resting rules).
  static const Map<String, AppNavSpec> light = <String, AppNavSpec>{
    '.floating-nav': AppNavSpec(
      cssClass: '.floating-nav',
      displayCss: 'flex',
      position: 'fixed',
      radiusPx: 999.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(216, 223, 230, 1.0),
      fillColor: Color.fromRGBO(252, 254, 255, 0.82),
      fgColor: Color.fromRGBO(13, 22, 36, 1.0),
      blurPx: 22.0,
      blurSaturate: 1.5,
      shadows: <BoxShadow>[
        BoxShadow(
          color: Color.fromRGBO(13, 22, 36, 0.07),
          offset: Offset(0.0, 2.0),
          blurRadius: 6.0,
        ),
        BoxShadow(
          color: Color.fromRGBO(13, 22, 36, 0.16),
          offset: Offset(0.0, 22.0),
          blurRadius: 52.0,
        ),
      ],
      paddingVerticalPx: 8.0,
      paddingHorizontalPx: 10.0,
      fontFamily: null,
      fontSizePx: null,
      fontWeight: null,
      lineHeightPx: null,
      letterSpacingPx: null,
      sizePx: null,
      minWidthPx: null,
      heightPx: null,
      gapPx: 4.0,
      liftPx: null,
      maxBarWidthPx: 460.0,
      edgeInsetPx: 24.0,
      bottomGapPx: 12.0,
      pressScale: null,
      transitionMs: null,
      easeX1: null,
      easeY1: null,
      easeX2: null,
      easeY2: null,
    ),
    '.nav-item': AppNavSpec(
      cssClass: '.nav-item',
      displayCss: 'flex',
      position: 'relative',
      radiusPx: 999.0,
      borderWidthPx: 0.0,
      borderColor: Color.fromRGBO(123, 135, 153, 1.0),
      fillColor: Color.fromRGBO(0, 0, 0, 0.0),
      fgColor: Color.fromRGBO(123, 135, 153, 1.0),
      blurPx: 0.0,
      blurSaturate: null,
      shadows: null,
      paddingVerticalPx: 0.0,
      paddingHorizontalPx: 6.0,
      fontFamily: 'Inter',
      fontSizePx: 8.0,
      fontWeight: 700,
      lineHeightPx: 12.0,
      letterSpacingPx: 0.16,
      sizePx: null,
      minWidthPx: 44.0,
      heightPx: 48.0,
      gapPx: 2.0,
      liftPx: null,
      maxBarWidthPx: null,
      edgeInsetPx: null,
      bottomGapPx: null,
      pressScale: null,
      transitionMs: null,
      easeX1: null,
      easeY1: null,
      easeX2: null,
      easeY2: null,
    ),
    '.nav-item-active': AppNavSpec(
      cssClass: '.nav-item-active',
      displayCss: 'flex',
      position: 'relative',
      radiusPx: 999.0,
      borderWidthPx: 0.0,
      borderColor: Color.fromRGBO(250, 252, 254, 1.0),
      fillColor: Color.fromRGBO(0, 0, 0, 0.0),
      fgColor: Color.fromRGBO(250, 252, 254, 1.0),
      blurPx: 0.0,
      blurSaturate: null,
      shadows: null,
      paddingVerticalPx: 0.0,
      paddingHorizontalPx: 6.0,
      fontFamily: 'Inter',
      fontSizePx: 8.0,
      fontWeight: 700,
      lineHeightPx: 12.0,
      letterSpacingPx: 0.16,
      sizePx: null,
      minWidthPx: null,
      heightPx: null,
      gapPx: null,
      liftPx: null,
      maxBarWidthPx: null,
      edgeInsetPx: null,
      bottomGapPx: null,
      pressScale: null,
      transitionMs: null,
      easeX1: null,
      easeY1: null,
      easeX2: null,
      easeY2: null,
    ),
    '.nav-fab': AppNavSpec(
      cssClass: '.nav-fab',
      displayCss: 'flex',
      position: 'static',
      radiusPx: 999.0,
      borderWidthPx: 3.0,
      borderColor: Color.fromRGBO(239, 244, 249, 1.0),
      fillColor: Color.fromRGBO(15, 25, 39, 1.0),
      fgColor: Color.fromRGBO(250, 252, 254, 1.0),
      blurPx: 0.0,
      blurSaturate: null,
      shadows: <BoxShadow>[
        BoxShadow(
          color: Color.fromRGBO(13, 22, 36, 0.07),
          offset: Offset(0.0, 2.0),
          blurRadius: 6.0,
        ),
        BoxShadow(
          color: Color.fromRGBO(13, 22, 36, 0.16),
          offset: Offset(0.0, 22.0),
          blurRadius: 52.0,
        ),
        BoxShadow(
          color: Color.fromRGBO(15, 25, 39, 0.35),
          offset: Offset(0.0, 0.0),
          blurRadius: 0.0,
          spreadRadius: 2.0,
        ),
      ],
      paddingVerticalPx: 0.0,
      paddingHorizontalPx: 0.0,
      fontFamily: null,
      fontSizePx: null,
      fontWeight: null,
      lineHeightPx: null,
      letterSpacingPx: null,
      sizePx: 48.0,
      minWidthPx: null,
      heightPx: null,
      gapPx: null,
      liftPx: 14.0,
      maxBarWidthPx: null,
      edgeInsetPx: null,
      bottomGapPx: null,
      pressScale: 0.92,
      transitionMs: 130,
      easeX1: 0.34,
      easeY1: 1.56,
      easeX2: 0.64,
      easeY2: 1.0,
    ),
  };

  /// dark pass (UI_SPEC §6, `dark-phone`; placement from the resting rules).
  static const Map<String, AppNavSpec> dark = <String, AppNavSpec>{
    '.floating-nav': AppNavSpec(
      cssClass: '.floating-nav',
      displayCss: 'flex',
      position: 'fixed',
      radiusPx: 999.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(33, 40, 51, 1.0),
      fillColor: Color.fromRGBO(15, 21, 31, 0.82),
      fgColor: Color.fromRGBO(247, 248, 251, 1.0),
      blurPx: 22.0,
      blurSaturate: 1.5,
      shadows: <BoxShadow>[
        BoxShadow(
          color: Color.fromRGBO(255, 255, 255, 0.07),
          offset: Offset(0.0, 1.0),
          blurRadius: 0.0,
        ),
        BoxShadow(
          color: Color.fromRGBO(0, 0, 0, 0.45),
          offset: Offset(0.0, 8.0),
          blurRadius: 20.0,
        ),
        BoxShadow(
          color: Color.fromRGBO(0, 0, 0, 0.55),
          offset: Offset(0.0, 28.0),
          blurRadius: 70.0,
        ),
      ],
      paddingVerticalPx: 8.0,
      paddingHorizontalPx: 10.0,
      fontFamily: null,
      fontSizePx: null,
      fontWeight: null,
      lineHeightPx: null,
      letterSpacingPx: null,
      sizePx: null,
      minWidthPx: null,
      heightPx: null,
      gapPx: 4.0,
      liftPx: null,
      maxBarWidthPx: 460.0,
      edgeInsetPx: 24.0,
      bottomGapPx: 12.0,
      pressScale: null,
      transitionMs: null,
      easeX1: null,
      easeY1: null,
      easeX2: null,
      easeY2: null,
    ),
    '.nav-item': AppNavSpec(
      cssClass: '.nav-item',
      displayCss: 'flex',
      position: 'relative',
      radiusPx: 999.0,
      borderWidthPx: 0.0,
      borderColor: Color.fromRGBO(103, 114, 131, 1.0),
      fillColor: Color.fromRGBO(0, 0, 0, 0.0),
      fgColor: Color.fromRGBO(103, 114, 131, 1.0),
      blurPx: 0.0,
      blurSaturate: null,
      shadows: null,
      paddingVerticalPx: 0.0,
      paddingHorizontalPx: 6.0,
      fontFamily: 'Inter',
      fontSizePx: 8.0,
      fontWeight: 700,
      lineHeightPx: 12.0,
      letterSpacingPx: 0.16,
      sizePx: null,
      minWidthPx: 44.0,
      heightPx: 48.0,
      gapPx: 2.0,
      liftPx: null,
      maxBarWidthPx: null,
      edgeInsetPx: null,
      bottomGapPx: null,
      pressScale: null,
      transitionMs: null,
      easeX1: null,
      easeY1: null,
      easeX2: null,
      easeY2: null,
    ),
    '.nav-item-active': AppNavSpec(
      cssClass: '.nav-item-active',
      displayCss: 'flex',
      position: 'relative',
      radiusPx: 999.0,
      borderWidthPx: 0.0,
      borderColor: Color.fromRGBO(6, 11, 20, 1.0),
      fillColor: Color.fromRGBO(0, 0, 0, 0.0),
      fgColor: Color.fromRGBO(6, 11, 20, 1.0),
      blurPx: 0.0,
      blurSaturate: null,
      shadows: null,
      paddingVerticalPx: 0.0,
      paddingHorizontalPx: 6.0,
      fontFamily: 'Inter',
      fontSizePx: 8.0,
      fontWeight: 700,
      lineHeightPx: 12.0,
      letterSpacingPx: 0.16,
      sizePx: null,
      minWidthPx: null,
      heightPx: null,
      gapPx: null,
      liftPx: null,
      maxBarWidthPx: null,
      edgeInsetPx: null,
      bottomGapPx: null,
      pressScale: null,
      transitionMs: null,
      easeX1: null,
      easeY1: null,
      easeX2: null,
      easeY2: null,
    ),
    '.nav-fab': AppNavSpec(
      cssClass: '.nav-fab',
      displayCss: 'flex',
      position: 'static',
      radiusPx: 999.0,
      borderWidthPx: 3.0,
      borderColor: Color.fromRGBO(3, 8, 16, 1.0),
      fillColor: Color.fromRGBO(243, 245, 249, 1.0),
      fgColor: Color.fromRGBO(6, 11, 20, 1.0),
      blurPx: 0.0,
      blurSaturate: null,
      shadows: <BoxShadow>[
        BoxShadow(
          color: Color.fromRGBO(255, 255, 255, 0.07),
          offset: Offset(0.0, 1.0),
          blurRadius: 0.0,
        ),
        BoxShadow(
          color: Color.fromRGBO(0, 0, 0, 0.45),
          offset: Offset(0.0, 8.0),
          blurRadius: 20.0,
        ),
        BoxShadow(
          color: Color.fromRGBO(0, 0, 0, 0.55),
          offset: Offset(0.0, 28.0),
          blurRadius: 70.0,
        ),
        BoxShadow(
          color: Color.fromRGBO(243, 245, 249, 0.35),
          offset: Offset(0.0, 0.0),
          blurRadius: 0.0,
          spreadRadius: 2.0,
        ),
      ],
      paddingVerticalPx: 0.0,
      paddingHorizontalPx: 0.0,
      fontFamily: null,
      fontSizePx: null,
      fontWeight: null,
      lineHeightPx: null,
      letterSpacingPx: null,
      sizePx: 48.0,
      minWidthPx: null,
      heightPx: null,
      gapPx: null,
      liftPx: 14.0,
      maxBarWidthPx: null,
      edgeInsetPx: null,
      bottomGapPx: null,
      pressScale: 0.92,
      transitionMs: 130,
      easeX1: 0.34,
      easeY1: 1.56,
      easeX2: 0.64,
      easeY2: 1.0,
    ),
  };

  /// The rules the port does NOT reproduce, printed once because every
  /// measured pass authors them identically:
  /// * `.floating-nav` is hidden on desktop at src/index.css:1169
  ///   (`@media (min-width: 1024px) { … display: none }`); the desktop chrome
  ///   that replaces it (`.nav-link` at src/index.css:854, `.nav-pill` at
  ///   src/index.css:1070) is a surface no phone screen writes, so it is not
  ///   ported. The phone pass is therefore the bar’s measurement.
  /// * `.nav-item:hover` at src/index.css:1191 and
  ///   `.nav-item-active:hover`/`:focus-visible` (src/index.css:1197) change
  ///   only `color` — decoration, not contract, dropped per UI_SPEC D-U1.

  /// `.nav-fab` is the family’s one ported state: `:active` at
  /// src/index.css:1219 scales the action,
  /// animating the `transform` its resting rule transitions — the same one
  /// clock AppControls ports, no colour repaint beneath it.

  /// The measured rows for a class and brightness. An unknown class is a
  /// programming error, not a fallback: nothing in this layer may quietly
  /// become a Material default.
  static AppNavSpec resolve(String cssClass, Brightness brightness) {
    final Map<String, AppNavSpec> table = brightness == Brightness.dark
        ? dark
        : light;
    final AppNavSpec? spec = table[cssClass];
    if (spec == null) throw ArgumentError('$cssClass is not a §6 nav class');
    return spec;
  }
}
