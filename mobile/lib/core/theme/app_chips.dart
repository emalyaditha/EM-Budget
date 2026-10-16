// GENERATED — do not edit by hand.
// Produced by `node parity/generate_theme.cjs` from `parity/ui-tokens.json`, the
// Chrome-computed measurement of `src/index.css` at tag `pre-flutter`, with the
// curated token lists and phone markers of `parity/UI_SPEC.md` §2.1–§4.
// Every value below is the measurement; UI_SPEC §5 (whose machine "Dart" column
// mis-parses --blur-* / --container-* names as radii) is deliberately not used.

import 'package:flutter/material.dart';

/// One §6 chrome chip — the icon chip, the pill, the pill’s active
/// composite, the chip-select, the delta box and its two tints — measured
/// on a detached element carrying exactly that class, plus the authored
/// facts the probe cannot see (flex `gap`, `tabular-nums`, the `.icon-chip`
/// square, `:active`/`:disabled`) read from the same pinned `src/index.css`.
/// A widget under `lib/presentation/` restates none of it.
///
/// Rows are honest per class, and composition is the widget’s job:
/// * `.pill-active` is the composed measurement — a `.pill` carrying the
///   override (probe key `.pill.pill-active`). Its three authored tokens are
///   cross-checked against that composite at generation.
/// * `.delta-up`/`.delta-down` are measured standalone (display `block`, no
///   radius) because that is what the probe saw; in the app they ride on the
///   same element as `.delta-chip`, which supplies the pill geometry. The
///   widget paints the chip row’s box with the tint row’s fill and ink.
/// * `.delta-chip` itself authors no colour: its measured transparent fill
///   and inherited ink are exactly that fact, not a colour to paint.
/// * `.icon-chip` authors no type; its 16px/400 row is the inherited body
///   font, and the widget paints an icon, not text, into the box.
/// * `.icon-chip-lg` is deliberately absent: its rule authors only a
///   44px square override and no element under `src/` carries the class —
///   asserted at generation, the `.card-sm` precedent.
class AppChipSpec {
  const AppChipSpec({
    required this.cssClass,
    required this.displayCss,
    required this.radiusPx,
    required this.borderWidthPx,
    required this.borderColor,
    required this.fillColor,
    required this.textColor,
    required this.fontFamily,
    required this.fontSizePx,
    required this.fontWeight,
    required this.lineHeightPx,
    required this.letterSpacingPx,
    required this.paddingVerticalPx,
    required this.paddingHorizontalPx,
    required this.gapPx,
    required this.tabularNums,
    required this.blurPx,
    required this.blurSaturate,
    required this.sizePx,
    required this.pressFillColor,
    required this.disabledOpacity,
    required this.transitionMs,
    required this.transitionProps,
    required this.easeX1,
    required this.easeY1,
    required this.easeX2,
    required this.easeY2,
  });

  /// The CSS class this row was measured from.
  final String cssClass;

  /// The computed `display`, carried as data; the widget composes the row.
  final String displayCss;

  final double radiusPx;
  final double borderWidthPx;
  final Color borderColor;

  /// The resting fill and ink, from the detached probe of exactly this class
  /// (`.pill-active` via its `.pill.pill-active` composite). Where a bare
  /// `var(--token)` authored the colour, the probe and the token’s measured
  /// substitution were checked equal at generation.
  final Color fillColor;
  final Color textColor;

  /// Measured type — the first family of the computed stack, as everywhere
  /// in the generated theme. Rows whose class authors no type carry the
  /// inherited body font as measured; see the class comment.
  final String fontFamily;
  final double fontSizePx;
  final int fontWeight;
  final double? lineHeightPx;
  final double letterSpacingPx;

  final double paddingVerticalPx;
  final double paddingHorizontalPx;

  /// The authored flex `gap`; null where the rule authors none. Chrome’s
  /// computed `gap` was not in the detached-element field set, so this is
  /// read from the resting rule — a documented authored fact, not a default.
  final double? gapPx;

  /// `font-variant-numeric: tabular-nums`, authored by `.delta-chip` alone.
  final bool tabularNums;

  /// `backdrop-filter` blur in CSS px; null is the measured `none`
  /// (`.chip-select` blurs 10px; the rest of the family does not). The
  /// `saturate()` travels as recorded data, unimplemented — the same finding
  /// [AppSurfaceSpec] and [AppNavSpec] carry.
  final double? blurPx;
  final double? blurSaturate;

  /// `.icon-chip`’s authored square side; null on every other row.
  final double? sizePx;

  /// `.pill:active`’s repaint — `var(--surface-3)` substituted from each
  /// pass’s measured `:root`, because the probe only sees the resting box.
  /// Null where the class authors no press state. The rule moves no box
  /// (a `transform` here would have failed generation).
  final Color? pressFillColor;

  /// `.pill:disabled` opacity (`cursor: not-allowed` travels with it as the
  /// same fact); null where the class authors no disabled face.
  final double? disabledOpacity;

  /// The one clock the class’s own `transition` names (duration token,
  /// easing token, and the properties it covers); null where the rule
  /// transitions nothing. `.pill` animates fill, border and colour;
  /// `.chip-select` animates fill and border.
  final int? transitionMs;
  final String? transitionProps;
  final double? easeX1;
  final double? easeY1;
  final double? easeX2;
  final double? easeY2;

  BorderRadius get borderRadius => BorderRadius.circular(radiusPx);

  /// `null` where the class measured no frame, rather than a zero-width one.
  Border? get border => borderWidthPx == 0
      ? null
      : Border.all(color: borderColor, width: borderWidthPx);

  EdgeInsets get padding => EdgeInsets.symmetric(
    vertical: paddingVerticalPx,
    horizontal: paddingHorizontalPx,
  );

  /// The measured `font-weight`, mapped the way [AppControlSpec.weight] does.
  FontWeight get weight => FontWeight.values[fontWeight ~/ 100 - 1];

  double? get lineHeightRatio =>
      lineHeightPx == null ? null : lineHeightPx! / fontSizePx;

  /// CSS blur radius → Flutter sigma (UI_SPEC D-U8); null where no backdrop.
  double? get blurSigmaPx => blurPx == null ? null : blurPx! / 2;

  Duration? get pressDuration {
    final int? ms = transitionMs;
    return ms == null ? null : Duration(milliseconds: ms);
  }

  Curve? get pressCurve =>
      easeX1 == null ? null : Cubic(easeX1!, easeY1!, easeX2!, easeY2!);
}

/// The card-face gold chip: the box, the probe-substituted
/// `--chip-gold → --chip-gold-deep` 135° gradient, and the inset ring the
/// authored `::after` paints 4px inside it. Both measured passes print the
/// same gold and the same box (asserted at generation), so there is one
/// spec, not a per-brightness table.
class AppFaceChipSpec {
  const AppFaceChipSpec({
    required this.cssClass,
    required this.widthPx,
    required this.heightPx,
    required this.radiusPx,
    required this.fillGradient,
    required this.ringInsetPx,
    required this.ringBorderWidthPx,
    required this.ringColor,
    required this.ringRadiusPx,
  });

  final String cssClass;
  final double widthPx;
  final double heightPx;
  final double radiusPx;
  final LinearGradient fillGradient;

  /// The `::after` ring: `inset: 4px`, `border: 1px solid rgba(0, 0, 0,
  /// 0.25)`, `border-radius: 3px` (src/index.css read because a pseudo-
  /// element is invisible to a detached-element probe).
  final double ringInsetPx;
  final double ringBorderWidthPx;
  final Color ringColor;
  final double ringRadiusPx;

  BorderRadius get borderRadius => BorderRadius.circular(radiusPx);
  BorderRadius get ringBorderRadius => BorderRadius.circular(ringRadiusPx);
  Border get ringBorder =>
      Border.all(color: ringColor, width: ringBorderWidthPx);
}

/// The §6 chip rows, keyed by CSS class — one map per measured pass.
abstract final class AppChips {
  /// light pass (UI_SPEC §6, `light-desktop`; states, gap and
  /// tabular-nums from the authored rules of the same pinned file).
  static const Map<String, AppChipSpec> light = <String, AppChipSpec>{
    '.icon-chip': AppChipSpec(
      cssClass: '.icon-chip',
      displayCss: 'flex',
      radiusPx: 999.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(216, 223, 230, 1.0),
      fillColor: Color.fromRGBO(235, 241, 247, 1.0),
      textColor: Color.fromRGBO(73, 86, 105, 1.0),
      fontFamily: 'Inter',
      fontSizePx: 16.0,
      fontWeight: 400,
      lineHeightPx: 24.0,
      letterSpacingPx: 0.0,
      paddingVerticalPx: 0.0,
      paddingHorizontalPx: 0.0,
      gapPx: null,
      tabularNums: false,
      blurPx: null,
      blurSaturate: null,
      sizePx: 40.0,
      pressFillColor: null,
      disabledOpacity: null,
      transitionMs: null,
      transitionProps: null,
      easeX1: null,
      easeY1: null,
      easeX2: null,
      easeY2: null,
    ),
    '.pill': AppChipSpec(
      cssClass: '.pill',
      displayCss: 'inline-flex',
      radiusPx: 999.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(216, 223, 230, 1.0),
      fillColor: Color.fromRGBO(252, 254, 255, 1.0),
      textColor: Color.fromRGBO(13, 22, 36, 1.0),
      fontFamily: 'Inter',
      fontSizePx: 12.0,
      fontWeight: 600,
      lineHeightPx: 18.0,
      letterSpacingPx: 0.0,
      paddingVerticalPx: 8.0,
      paddingHorizontalPx: 14.0,
      gapPx: 6.0,
      tabularNums: false,
      blurPx: null,
      blurSaturate: null,
      sizePx: null,
      pressFillColor: Color.fromRGBO(220, 228, 236, 1.0),
      disabledOpacity: 0.5,
      transitionMs: 130,
      transitionProps: 'border-color, background-color, color',
      easeX1: 0.22,
      easeY1: 1.0,
      easeX2: 0.36,
      easeY2: 1.0,
    ),
    '.pill-active': AppChipSpec(
      cssClass: '.pill-active',
      displayCss: 'inline-flex',
      radiusPx: 999.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(13, 22, 36, 1.0),
      fillColor: Color.fromRGBO(13, 22, 36, 1.0),
      textColor: Color.fromRGBO(250, 252, 254, 1.0),
      fontFamily: 'Inter',
      fontSizePx: 12.0,
      fontWeight: 600,
      lineHeightPx: 18.0,
      letterSpacingPx: 0.0,
      paddingVerticalPx: 8.0,
      paddingHorizontalPx: 14.0,
      gapPx: null,
      tabularNums: false,
      blurPx: null,
      blurSaturate: null,
      sizePx: null,
      pressFillColor: null,
      disabledOpacity: null,
      transitionMs: null,
      transitionProps: null,
      easeX1: null,
      easeY1: null,
      easeX2: null,
      easeY2: null,
    ),
    '.chip-select': AppChipSpec(
      cssClass: '.chip-select',
      displayCss: 'inline-flex',
      radiusPx: 999.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(216, 223, 230, 1.0),
      fillColor: Color.fromRGBO(235, 241, 247, 0.8),
      textColor: Color.fromRGBO(13, 22, 36, 1.0),
      fontFamily: 'Inter',
      fontSizePx: 13.0,
      fontWeight: 600,
      lineHeightPx: 19.5,
      letterSpacingPx: 0.0,
      paddingVerticalPx: 7.0,
      paddingHorizontalPx: 13.0,
      gapPx: 8.0,
      tabularNums: false,
      blurPx: 10.0,
      blurSaturate: null,
      sizePx: null,
      pressFillColor: null,
      disabledOpacity: null,
      transitionMs: 130,
      transitionProps: 'border-color, background-color',
      easeX1: 0.22,
      easeY1: 1.0,
      easeX2: 0.36,
      easeY2: 1.0,
    ),
    '.delta-chip': AppChipSpec(
      cssClass: '.delta-chip',
      displayCss: 'inline-flex',
      radiusPx: 999.0,
      borderWidthPx: 0.0,
      borderColor: Color.fromRGBO(13, 22, 36, 1.0),
      fillColor: Color.fromRGBO(0, 0, 0, 0.0),
      textColor: Color.fromRGBO(13, 22, 36, 1.0),
      fontFamily: 'Inter',
      fontSizePx: 11.0,
      fontWeight: 700,
      lineHeightPx: 16.5,
      letterSpacingPx: 0.0,
      paddingVerticalPx: 4.0,
      paddingHorizontalPx: 10.0,
      gapPx: 4.0,
      tabularNums: true,
      blurPx: null,
      blurSaturate: null,
      sizePx: null,
      pressFillColor: null,
      disabledOpacity: null,
      transitionMs: null,
      transitionProps: null,
      easeX1: null,
      easeY1: null,
      easeX2: null,
      easeY2: null,
    ),
    '.delta-up': AppChipSpec(
      cssClass: '.delta-up',
      displayCss: 'block',
      radiusPx: 0.0,
      borderWidthPx: 0.0,
      borderColor: Color.fromRGBO(0, 140, 83, 1.0),
      fillColor: Color.fromRGBO(0, 140, 83, 0.11),
      textColor: Color.fromRGBO(0, 140, 83, 1.0),
      fontFamily: 'Inter',
      fontSizePx: 16.0,
      fontWeight: 400,
      lineHeightPx: 24.0,
      letterSpacingPx: 0.0,
      paddingVerticalPx: 0.0,
      paddingHorizontalPx: 0.0,
      gapPx: null,
      tabularNums: false,
      blurPx: null,
      blurSaturate: null,
      sizePx: null,
      pressFillColor: null,
      disabledOpacity: null,
      transitionMs: null,
      transitionProps: null,
      easeX1: null,
      easeY1: null,
      easeX2: null,
      easeY2: null,
    ),
    '.delta-down': AppChipSpec(
      cssClass: '.delta-down',
      displayCss: 'block',
      radiusPx: 0.0,
      borderWidthPx: 0.0,
      borderColor: Color.fromRGBO(204, 49, 67, 1.0),
      fillColor: Color.fromRGBO(204, 49, 67, 0.09),
      textColor: Color.fromRGBO(204, 49, 67, 1.0),
      fontFamily: 'Inter',
      fontSizePx: 16.0,
      fontWeight: 400,
      lineHeightPx: 24.0,
      letterSpacingPx: 0.0,
      paddingVerticalPx: 0.0,
      paddingHorizontalPx: 0.0,
      gapPx: null,
      tabularNums: false,
      blurPx: null,
      blurSaturate: null,
      sizePx: null,
      pressFillColor: null,
      disabledOpacity: null,
      transitionMs: null,
      transitionProps: null,
      easeX1: null,
      easeY1: null,
      easeX2: null,
      easeY2: null,
    ),
  };

  /// dark pass (UI_SPEC §6, `dark-desktop`; states, gap and
  /// tabular-nums from the authored rules of the same pinned file).
  static const Map<String, AppChipSpec> dark = <String, AppChipSpec>{
    '.icon-chip': AppChipSpec(
      cssClass: '.icon-chip',
      displayCss: 'flex',
      radiusPx: 999.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(33, 40, 51, 1.0),
      fillColor: Color.fromRGBO(24, 32, 43, 1.0),
      textColor: Color.fromRGBO(162, 172, 185, 1.0),
      fontFamily: 'Inter',
      fontSizePx: 16.0,
      fontWeight: 400,
      lineHeightPx: 24.0,
      letterSpacingPx: 0.0,
      paddingVerticalPx: 0.0,
      paddingHorizontalPx: 0.0,
      gapPx: null,
      tabularNums: false,
      blurPx: null,
      blurSaturate: null,
      sizePx: 40.0,
      pressFillColor: null,
      disabledOpacity: null,
      transitionMs: null,
      transitionProps: null,
      easeX1: null,
      easeY1: null,
      easeX2: null,
      easeY2: null,
    ),
    '.pill': AppChipSpec(
      cssClass: '.pill',
      displayCss: 'inline-flex',
      radiusPx: 999.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(33, 40, 51, 1.0),
      fillColor: Color.fromRGBO(15, 21, 31, 1.0),
      textColor: Color.fromRGBO(247, 248, 251, 1.0),
      fontFamily: 'Inter',
      fontSizePx: 12.0,
      fontWeight: 600,
      lineHeightPx: 18.0,
      letterSpacingPx: 0.0,
      paddingVerticalPx: 8.0,
      paddingHorizontalPx: 14.0,
      gapPx: 6.0,
      tabularNums: false,
      blurPx: null,
      blurSaturate: null,
      sizePx: null,
      pressFillColor: Color.fromRGBO(36, 44, 56, 1.0),
      disabledOpacity: 0.5,
      transitionMs: 130,
      transitionProps: 'border-color, background-color, color',
      easeX1: 0.22,
      easeY1: 1.0,
      easeX2: 0.36,
      easeY2: 1.0,
    ),
    '.pill-active': AppChipSpec(
      cssClass: '.pill-active',
      displayCss: 'inline-flex',
      radiusPx: 999.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(247, 248, 251, 1.0),
      fillColor: Color.fromRGBO(247, 248, 251, 1.0),
      textColor: Color.fromRGBO(6, 11, 20, 1.0),
      fontFamily: 'Inter',
      fontSizePx: 12.0,
      fontWeight: 600,
      lineHeightPx: 18.0,
      letterSpacingPx: 0.0,
      paddingVerticalPx: 8.0,
      paddingHorizontalPx: 14.0,
      gapPx: null,
      tabularNums: false,
      blurPx: null,
      blurSaturate: null,
      sizePx: null,
      pressFillColor: null,
      disabledOpacity: null,
      transitionMs: null,
      transitionProps: null,
      easeX1: null,
      easeY1: null,
      easeX2: null,
      easeY2: null,
    ),
    '.chip-select': AppChipSpec(
      cssClass: '.chip-select',
      displayCss: 'inline-flex',
      radiusPx: 999.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(33, 40, 51, 1.0),
      fillColor: Color.fromRGBO(24, 32, 43, 0.8),
      textColor: Color.fromRGBO(247, 248, 251, 1.0),
      fontFamily: 'Inter',
      fontSizePx: 13.0,
      fontWeight: 600,
      lineHeightPx: 19.5,
      letterSpacingPx: 0.0,
      paddingVerticalPx: 7.0,
      paddingHorizontalPx: 13.0,
      gapPx: 8.0,
      tabularNums: false,
      blurPx: 10.0,
      blurSaturate: null,
      sizePx: null,
      pressFillColor: null,
      disabledOpacity: null,
      transitionMs: 130,
      transitionProps: 'border-color, background-color',
      easeX1: 0.22,
      easeY1: 1.0,
      easeX2: 0.36,
      easeY2: 1.0,
    ),
    '.delta-chip': AppChipSpec(
      cssClass: '.delta-chip',
      displayCss: 'inline-flex',
      radiusPx: 999.0,
      borderWidthPx: 0.0,
      borderColor: Color.fromRGBO(247, 248, 251, 1.0),
      fillColor: Color.fromRGBO(0, 0, 0, 0.0),
      textColor: Color.fromRGBO(247, 248, 251, 1.0),
      fontFamily: 'Inter',
      fontSizePx: 11.0,
      fontWeight: 700,
      lineHeightPx: 16.5,
      letterSpacingPx: 0.0,
      paddingVerticalPx: 4.0,
      paddingHorizontalPx: 10.0,
      gapPx: 4.0,
      tabularNums: true,
      blurPx: null,
      blurSaturate: null,
      sizePx: null,
      pressFillColor: null,
      disabledOpacity: null,
      transitionMs: null,
      transitionProps: null,
      easeX1: null,
      easeY1: null,
      easeX2: null,
      easeY2: null,
    ),
    '.delta-up': AppChipSpec(
      cssClass: '.delta-up',
      displayCss: 'block',
      radiusPx: 0.0,
      borderWidthPx: 0.0,
      borderColor: Color.fromRGBO(73, 219, 166, 1.0),
      fillColor: Color.fromRGBO(73, 219, 166, 0.14),
      textColor: Color.fromRGBO(73, 219, 166, 1.0),
      fontFamily: 'Inter',
      fontSizePx: 16.0,
      fontWeight: 400,
      lineHeightPx: 24.0,
      letterSpacingPx: 0.0,
      paddingVerticalPx: 0.0,
      paddingHorizontalPx: 0.0,
      gapPx: null,
      tabularNums: false,
      blurPx: null,
      blurSaturate: null,
      sizePx: null,
      pressFillColor: null,
      disabledOpacity: null,
      transitionMs: null,
      transitionProps: null,
      easeX1: null,
      easeY1: null,
      easeX2: null,
      easeY2: null,
    ),
    '.delta-down': AppChipSpec(
      cssClass: '.delta-down',
      displayCss: 'block',
      radiusPx: 0.0,
      borderWidthPx: 0.0,
      borderColor: Color.fromRGBO(236, 115, 128, 1.0),
      fillColor: Color.fromRGBO(236, 115, 128, 0.14),
      textColor: Color.fromRGBO(236, 115, 128, 1.0),
      fontFamily: 'Inter',
      fontSizePx: 16.0,
      fontWeight: 400,
      lineHeightPx: 24.0,
      letterSpacingPx: 0.0,
      paddingVerticalPx: 0.0,
      paddingHorizontalPx: 0.0,
      gapPx: null,
      tabularNums: false,
      blurPx: null,
      blurSaturate: null,
      sizePx: null,
      pressFillColor: null,
      disabledOpacity: null,
      transitionMs: null,
      transitionProps: null,
      easeX1: null,
      easeY1: null,
      easeX2: null,
      easeY2: null,
    ),
  };

  /// The sources, printed once: resting rules
  /// (.icon-chip @ src/index.css:1101; .pill @ src/index.css:909; .pill-active @ src/index.css:939; .chip-select @ src/index.css:638; .delta-chip @ src/index.css:1083; .delta-up @ src/index.css:1093; .delta-down @ src/index.css:1097);
  /// `.pill:active` and `.pill:disabled` are ported as fields above.
  ///
  /// Unported authored states — decoration, dropped per UI_SPEC D-U1:
  /// * `.pill:hover` at src/index.css:927 and
  ///   `.chip-select:hover` at src/index.css:657 lift the border to
  ///   `--line-strong` and repaint the fill (`--surface-2` / plain
  ///   `--surface-2`); both sit on the clock the row already ports.
  /// * `.pill-active:hover` at src/index.css:944 mixes
  ///   `color-mix(in srgb, var(--ink) 90%, var(--surface))` for fill and
  ///   border — a hover-only mix the port evaluates nowhere.
  ///
  /// The measured rows for a class and brightness. An unknown class is a
  /// programming error, not a fallback: nothing in this layer may quietly
  /// become a Material default.
  static AppChipSpec resolve(String cssClass, Brightness brightness) {
    final Map<String, AppChipSpec> table = brightness == Brightness.dark
        ? dark
        : light;
    final AppChipSpec? spec = table[cssClass];
    if (spec == null) throw ArgumentError('$cssClass is not a §6 chip class');
    return spec;
  }
}

/// The card-face chip, once per the note on [AppFaceChipSpec]. Sources:
/// resting src/index.css:1242, ring src/index.css:1249.
abstract final class AppFaceChips {
  static const AppFaceChipSpec spec = AppFaceChipSpec(
    cssClass: '.card-face-chip',
    widthPx: 30.0,
    heightPx: 22.0,
    radiusPx: 5.0,
    fillGradient: LinearGradient(
      begin: Alignment(-1.0, -1.0),
      end: Alignment(1.0, 1.0),
      colors: <Color>[
        Color.fromRGBO(221, 176, 73, 1.0),
        Color.fromRGBO(183, 118, 17, 1.0),
      ],
      stops: <double>[0.0, 1.0],
    ),
    ringInsetPx: 4.0,
    ringBorderWidthPx: 1.0,
    ringColor: Color.fromRGBO(0, 0, 0, 0.25),
    ringRadiusPx: 3.0,
  );
}
