// GENERATED — do not edit by hand.
// Produced by `node parity/generate_theme.cjs` from `parity/ui-tokens.json`, the
// Chrome-computed measurement of `src/index.css` at tag `pre-flutter`, with the
// curated token lists and phone markers of `parity/UI_SPEC.md` §2.1–§4.
// Every value below is the measurement; UI_SPEC §5 (whose machine "Dart" column
// mis-parses --blur-* / --container-* names as radii) is deliberately not used.

import 'package:flutter/material.dart';

/// One §6 control class, measured in its resting state and read out of
/// `src/index.css` in its pressed and disabled states. A widget under
/// `lib/presentation/` restates none of it.
class AppControlSpec {
  const AppControlSpec({
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
    required this.disabledOpacity,
    required this.pressDyPx,
    required this.pressFillColor,
    required this.transitionMs,
    required this.easeX1,
    required this.easeY1,
    required this.easeX2,
    required this.easeY2,
  });

  /// The CSS class this row was measured from.
  final String cssClass;

  /// The computed `display`. Carried as data, not applied: on the web these
  /// classes are flex items and size to their content, which in Flutter is the
  /// caller’s layout, not the widget’s paint.
  final String displayCss;
  final double radiusPx;

  /// Measured on one side; the classes author `border: 1px solid …`, i.e.
  /// uniform, and [border] reproduces that box.
  final double borderWidthPx;
  final Color borderColor;
  final Color fillColor;
  final Color textColor;

  /// The class’s own `font-family` — its measured stack’s first family, so a
  /// button label is `--font-display` and not the theme’s body font.
  final String fontFamily;

  /// §6.3 type: the class sets `font-size`/`font-weight` itself, so the label
  /// cannot inherit the theme ladder and stay faithful.
  final double fontSizePx;
  final int fontWeight;
  final double? lineHeightPx;

  /// CSS `letter-spacing: normal` computes to 0; the measurement prints
  /// `normal`, and that is what `ui_tokens_test.dart` re-checks.
  final double letterSpacingPx;

  /// The `padding` shorthand as one vertical / horizontal pair. The generator
  /// fails rather than flattening an asymmetric box.
  final double paddingVerticalPx;
  final double paddingHorizontalPx;

  /// Authored `:disabled { opacity: … }`, which Chrome’s probe cannot see. See
  /// `src/index.css` for the class; UI_SPEC D-U1 drops `:hover` on purpose.
  final double disabledOpacity;

  /// Authored `:active { transform: translateY(…)px }`.
  final double pressDyPx;

  /// Authored `:active { background: … }`, substituted from the same pass’s
  /// measured `:root` — Chrome’s probe only ever sees the resting state. Null
  /// where the pressed state leaves the fill alone, so [activeFill] is then
  /// [fillColor], which is what the browser keeps painting.
  final Color? pressFillColor;

  /// The class’s own authored `transition`: the measured milliseconds of the
  /// duration token it names, and the four numbers of the easing token’s
  /// `cubic-bezier(…)`. A widget reads its clock from this row and picks none;
  /// `AppTokens` holds the same measurement keyed by token name.
  final int transitionMs;

  /// The four numbers of the class’s `cubic-bezier(…)`, kept verbatim:
  /// `Curves.*` names are not parity targets.
  final double easeX1;
  final double easeY1;
  final double easeX2;
  final double easeY2;

  BorderRadius get borderRadius => BorderRadius.circular(radiusPx);

  Border get border => Border.all(color: borderColor, width: borderWidthPx);

  /// The fill to paint while pressed. `.btn-primary` does not move its fill on
  /// `:active`; `.btn-ghost` repaints it. See [pressFillColor].
  Color get activeFill => pressFillColor ?? fillColor;

  Duration get transitionDuration => Duration(milliseconds: transitionMs);

  Cubic get transitionCurve => Cubic(easeX1, easeY1, easeX2, easeY2);

  EdgeInsetsGeometry get padding => EdgeInsets.symmetric(
    vertical: paddingVerticalPx,
    horizontal: paddingHorizontalPx,
  );

  /// The 100-900 CSS step indexes the Dart enum directly; no weight is retyped.
  FontWeight get weight => FontWeight.values[fontWeight ~/ 100 - 1];

  /// Flutter’s line-height is a multiple of the font size, CSS’s is a length,
  /// so this is the measured pair divided — not a number anyone chose.
  double? get heightRatio =>
      lineHeightPx == null ? null : lineHeightPx! / fontSizePx;
}

/// The §6 controls, keyed by CSS class — one map per measured brightness pass.
abstract final class AppControls {
  /// light pass (UI_SPEC §6.1–§6.3, `light-desktop`; states from `src/index.css`).
  static const Map<String, AppControlSpec> light = <String, AppControlSpec>{
    '.btn-primary': AppControlSpec(
      cssClass: '.btn-primary',
      displayCss: 'block',
      radiusPx: 999.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(15, 25, 39, 1.0),
      fillColor: Color.fromRGBO(15, 25, 39, 1.0),
      textColor: Color.fromRGBO(250, 252, 254, 1.0),
      fontFamily: 'Plus Jakarta Sans',
      fontSizePx: 13.0,
      fontWeight: 700,
      lineHeightPx: 19.5,
      letterSpacingPx: 0.0,
      paddingVerticalPx: 11.0,
      paddingHorizontalPx: 20.0,
      disabledOpacity: 0.45,
      pressDyPx: 1.0,
      pressFillColor: null,
      transitionMs: 130,
      easeX1: 0.22,
      easeY1: 1.0,
      easeX2: 0.36,
      easeY2: 1.0,
    ),
    '.btn-ghost': AppControlSpec(
      cssClass: '.btn-ghost',
      displayCss: 'block',
      radiusPx: 999.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(216, 223, 230, 1.0),
      fillColor: Color.fromRGBO(252, 254, 255, 1.0),
      textColor: Color.fromRGBO(13, 22, 36, 1.0),
      fontFamily: 'Plus Jakarta Sans',
      fontSizePx: 13.0,
      fontWeight: 600,
      lineHeightPx: 19.5,
      letterSpacingPx: 0.0,
      paddingVerticalPx: 11.0,
      paddingHorizontalPx: 20.0,
      disabledOpacity: 0.45,
      pressDyPx: 1.0,
      pressFillColor: Color.fromRGBO(220, 228, 236, 1.0),
      transitionMs: 130,
      easeX1: 0.22,
      easeY1: 1.0,
      easeX2: 0.36,
      easeY2: 1.0,
    ),
  };

  /// dark pass (UI_SPEC §6.1–§6.3, `dark-desktop`; states from `src/index.css`).
  static const Map<String, AppControlSpec> dark = <String, AppControlSpec>{
    '.btn-primary': AppControlSpec(
      cssClass: '.btn-primary',
      displayCss: 'block',
      radiusPx: 999.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(243, 245, 249, 1.0),
      fillColor: Color.fromRGBO(243, 245, 249, 1.0),
      textColor: Color.fromRGBO(6, 11, 20, 1.0),
      fontFamily: 'Plus Jakarta Sans',
      fontSizePx: 13.0,
      fontWeight: 700,
      lineHeightPx: 19.5,
      letterSpacingPx: 0.0,
      paddingVerticalPx: 11.0,
      paddingHorizontalPx: 20.0,
      disabledOpacity: 0.45,
      pressDyPx: 1.0,
      pressFillColor: null,
      transitionMs: 130,
      easeX1: 0.22,
      easeY1: 1.0,
      easeX2: 0.36,
      easeY2: 1.0,
    ),
    '.btn-ghost': AppControlSpec(
      cssClass: '.btn-ghost',
      displayCss: 'block',
      radiusPx: 999.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(33, 40, 51, 1.0),
      fillColor: Color.fromRGBO(15, 21, 31, 1.0),
      textColor: Color.fromRGBO(247, 248, 251, 1.0),
      fontFamily: 'Plus Jakarta Sans',
      fontSizePx: 13.0,
      fontWeight: 600,
      lineHeightPx: 19.5,
      letterSpacingPx: 0.0,
      paddingVerticalPx: 11.0,
      paddingHorizontalPx: 20.0,
      disabledOpacity: 0.45,
      pressDyPx: 1.0,
      pressFillColor: Color.fromRGBO(36, 44, 56, 1.0),
      transitionMs: 130,
      easeX1: 0.22,
      easeY1: 1.0,
      easeX2: 0.36,
      easeY2: 1.0,
    ),
  };

  /// The state rules, printed once because both passes author them identically:
  /// `.btn-primary` — disabled src/index.css:1014, active src/index.css:996,
  /// `.btn-ghost` — disabled src/index.css:1044, active src/index.css:1040,
  /// and the `:hover` rules the port drops (UI_SPEC D-U1):
  /// `.btn-primary:hover` at src/index.css:993.
  /// `.btn-ghost:hover` at src/index.css:1036.
  /// The fill each pressed state paints, straight from the authored rules:
  /// `.btn-primary:active` → its resting fill
  /// `.btn-ghost:active` → --surface-3

  /// The clock each class runs its state changes on, from its own rule:
  /// `.btn-primary` transitions background-color, border-color, transform on
  /// `--dur-fast` / `--ease-out` (src/index.css:977).
  /// `.btn-ghost` transitions background-color, border-color, transform on
  /// `--dur-fast` / `--ease-out` (src/index.css:1020).

  /// The measured control for a class and brightness. An unknown class is a
  /// programming error, not a fallback: nothing in this layer may quietly
  /// become a Material default.
  static AppControlSpec resolve(String cssClass, Brightness brightness) {
    final Map<String, AppControlSpec> table = brightness == Brightness.dark
        ? dark
        : light;
    final AppControlSpec? spec = table[cssClass];
    if (spec == null) throw ArgumentError('$cssClass is not a §6 control');
    return spec;
  }
}
