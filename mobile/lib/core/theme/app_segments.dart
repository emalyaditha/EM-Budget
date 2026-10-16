// GENERATED — do not edit by hand.
// Produced by `node parity/generate_theme.cjs` from `parity/ui-tokens.json`, the
// Chrome-computed measurement of `src/index.css` at tag `pre-flutter`, with the
// curated token lists and phone markers of `parity/UI_SPEC.md` §2.1–§4.
// Every value below is the measurement; UI_SPEC §5 (whose machine "Dart" column
// mis-parses --blur-* / --container-* names as radii) is deliberately not used.

import 'package:flutter/material.dart';

/// The §6 segmented control: the track and a resting item, each measured
/// on a detached element carrying exactly that class, plus the selected
/// state — the one §6 chrome reading whose resting probe carries an inset
/// ring. The selected rule’s background, colour and ring token are
/// cross-checked against that probe at generation, per pass; the ring
/// travels as a colour and width, painted inside the item’s own box.
///
/// Two rows share one shape because one widget composes them:
/// * `.segment` authors no type and no text: its font fields are `null` —
///   the probe’s 16px/24px is body inheritance, not a fact about the track.
///   Its `gap` travels from the authored rule (Chrome computed `gap` is not
///   in the probe field set), as in [AppChipSpec].
/// * `.segment-item` carries the selected state; the track row leaves those
///   fields `null` because the selector cannot match it.
/// * `.segment-item:hover` (at
/// src/index.css:686) changes only
///   `color` to `--ink` — decoration, dropped per UI_SPEC D-U1; the selected
///   rule’s own ink is ported.
///
/// The family has no call sites under `src/` today (a comment at
/// `src/components/ReportsCentre.tsx:161` is its only mention); it is ported
/// because the phase ruling orders it, exactly as the measurement shows.
class AppSegmentSpec {
  const AppSegmentSpec({
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
    required this.blurPx,
    required this.blurSaturate,
    required this.selectedFillColor,
    required this.selectedTextColor,
    required this.selectedRingColor,
    required this.selectedRingWidthPx,
    required this.transitionMs,
    required this.transitionProps,
    required this.easeX1,
    required this.easeY1,
    required this.easeX2,
    required this.easeY2,
  });

  final String cssClass;
  final String displayCss;
  final double radiusPx;
  final double borderWidthPx;
  final Color borderColor;

  /// The resting fill and ink. The track measured
  /// `color-mix(… var(--surface-2) 72%, transparent)`; the item measured
  /// transparent over its `--ink-2`.
  final Color fillColor;
  final Color? textColor;

  final String? fontFamily;
  final double? fontSizePx;
  final int? fontWeight;
  final double? lineHeightPx;
  final double? letterSpacingPx;

  final double paddingVerticalPx;
  final double paddingHorizontalPx;
  final double? gapPx;

  /// The track’s `blur(10px)`; null on the item, which measured `none`.
  final double? blurPx;
  final double? blurSaturate;

  /// The [aria-selected='true'] / [data-active='true'] state: fill,
  /// ink, and the inset ring (`box-shadow: inset 0 0 0 1px
  /// var(--line-strong)` measured as one layer). Null on the track row.
  final Color? selectedFillColor;
  final Color? selectedTextColor;
  final Color? selectedRingColor;
  final double? selectedRingWidthPx;

  /// The item’s `transition` (background-colour and colour on the
  /// `--dur-fast`/`--ease-out` clock); null on the track.
  final int? transitionMs;
  final String? transitionProps;
  final double? easeX1;
  final double? easeY1;
  final double? easeX2;
  final double? easeY2;

  BorderRadius get borderRadius => BorderRadius.circular(radiusPx);
  Border? get border => borderWidthPx == 0
      ? null
      : Border.all(color: borderColor, width: borderWidthPx);
  EdgeInsets get padding => EdgeInsets.symmetric(
    vertical: paddingVerticalPx,
    horizontal: paddingHorizontalPx,
  );
  FontWeight? get weight =>
      fontWeight == null ? null : FontWeight.values[fontWeight! ~/ 100 - 1];
  double? get blurSigmaPx => blurPx == null ? null : blurPx! / 2;
  Duration? get transitionDuration {
    final int? ms = transitionMs;
    return ms == null ? null : Duration(milliseconds: ms);
  }

  Curve? get transitionCurve =>
      easeX1 == null ? null : Cubic(easeX1!, easeY1!, easeX2!, easeY2!);
}

/// The §6 segmented rows, keyed by CSS class — one map per measured pass.
abstract final class AppSegments {
  /// light pass (UI_SPEC §6, `light-desktop`; the selected state and
  /// the track gap from the authored rules of the same pinned file).
  static const Map<String, AppSegmentSpec> light = <String, AppSegmentSpec>{
    '.segment': AppSegmentSpec(
      cssClass: '.segment',
      displayCss: 'inline-flex',
      radiusPx: 999.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(216, 223, 230, 1.0),
      fillColor: Color.fromRGBO(235, 241, 247, 0.72),
      textColor: null,
      fontFamily: null,
      fontSizePx: null,
      fontWeight: null,
      lineHeightPx: null,
      letterSpacingPx: null,
      paddingVerticalPx: 4.0,
      paddingHorizontalPx: 4.0,
      gapPx: 2.0,
      blurPx: 10.0,
      blurSaturate: null,
      selectedFillColor: null,
      selectedTextColor: null,
      selectedRingColor: null,
      selectedRingWidthPx: null,
      transitionMs: null,
      transitionProps: null,
      easeX1: null,
      easeY1: null,
      easeX2: null,
      easeY2: null,
    ),
    '.segment-item': AppSegmentSpec(
      cssClass: '.segment-item',
      displayCss: 'block',
      radiusPx: 999.0,
      borderWidthPx: 0.0,
      borderColor: Color.fromRGBO(73, 86, 105, 1.0),
      fillColor: Color.fromRGBO(0, 0, 0, 0.0),
      textColor: Color.fromRGBO(73, 86, 105, 1.0),
      fontFamily: 'Inter',
      fontSizePx: 13.0,
      fontWeight: 600,
      lineHeightPx: 19.5,
      letterSpacingPx: 0.0,
      paddingVerticalPx: 7.0,
      paddingHorizontalPx: 14.0,
      gapPx: null,
      blurPx: null,
      blurSaturate: null,
      selectedFillColor: Color.fromRGBO(220, 228, 236, 1.0),
      selectedTextColor: Color.fromRGBO(13, 22, 36, 1.0),
      selectedRingColor: Color.fromRGBO(188, 197, 208, 1.0),
      selectedRingWidthPx: 1.0,
      transitionMs: 130,
      transitionProps: 'background-color, color',
      easeX1: 0.22,
      easeY1: 1.0,
      easeX2: 0.36,
      easeY2: 1.0,
    ),
  };

  /// dark pass (UI_SPEC §6, `dark-desktop`; the selected state and
  /// the track gap from the authored rules of the same pinned file).
  static const Map<String, AppSegmentSpec> dark = <String, AppSegmentSpec>{
    '.segment': AppSegmentSpec(
      cssClass: '.segment',
      displayCss: 'inline-flex',
      radiusPx: 999.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(33, 40, 51, 1.0),
      fillColor: Color.fromRGBO(24, 32, 43, 0.72),
      textColor: null,
      fontFamily: null,
      fontSizePx: null,
      fontWeight: null,
      lineHeightPx: null,
      letterSpacingPx: null,
      paddingVerticalPx: 4.0,
      paddingHorizontalPx: 4.0,
      gapPx: 2.0,
      blurPx: 10.0,
      blurSaturate: null,
      selectedFillColor: null,
      selectedTextColor: null,
      selectedRingColor: null,
      selectedRingWidthPx: null,
      transitionMs: null,
      transitionProps: null,
      easeX1: null,
      easeY1: null,
      easeX2: null,
      easeY2: null,
    ),
    '.segment-item': AppSegmentSpec(
      cssClass: '.segment-item',
      displayCss: 'block',
      radiusPx: 999.0,
      borderWidthPx: 0.0,
      borderColor: Color.fromRGBO(162, 172, 185, 1.0),
      fillColor: Color.fromRGBO(0, 0, 0, 0.0),
      textColor: Color.fromRGBO(162, 172, 185, 1.0),
      fontFamily: 'Inter',
      fontSizePx: 13.0,
      fontWeight: 600,
      lineHeightPx: 19.5,
      letterSpacingPx: 0.0,
      paddingVerticalPx: 7.0,
      paddingHorizontalPx: 14.0,
      gapPx: null,
      blurPx: null,
      blurSaturate: null,
      selectedFillColor: Color.fromRGBO(36, 44, 56, 1.0),
      selectedTextColor: Color.fromRGBO(247, 248, 251, 1.0),
      selectedRingColor: Color.fromRGBO(53, 62, 75, 1.0),
      selectedRingWidthPx: 1.0,
      transitionMs: 130,
      transitionProps: 'background-color, color',
      easeX1: 0.22,
      easeY1: 1.0,
      easeX2: 0.36,
      easeY2: 1.0,
    ),
  };

  /// Sources: resting rules
  /// (.segment @ src/index.css:661; .segment-item @ src/index.css:672);
  /// selected `.segment-item[aria-selected='true']` at src/index.css:689.
  ///
  /// The measured rows for a class and brightness. An unknown class is a
  /// programming error, not a fallback.
  static AppSegmentSpec resolve(String cssClass, Brightness brightness) {
    final Map<String, AppSegmentSpec> table = brightness == Brightness.dark
        ? dark
        : light;
    final AppSegmentSpec? spec = table[cssClass];
    if (spec == null) {
      throw ArgumentError('$cssClass is not a §6 segment class');
    }
    return spec;
  }
}
