// GENERATED — do not edit by hand.
// Produced by `node parity/generate_theme.cjs` from `parity/ui-tokens.json`, the
// Chrome-computed measurement of `src/index.css` at tag `pre-flutter`, with the
// curated token lists and phone markers of `parity/UI_SPEC.md` §2.1–§4.
// Every value below is the measurement; UI_SPEC §5 (whose machine "Dart" column
// mis-parses --blur-* / --container-* names as radii) is deliberately not used.

import 'package:flutter/material.dart';

import 'app_spacing.dart';

/// One §6 text field: box and type measured at rest, placeholder and focus
/// appearance read out of `src/index.css`. A widget under `lib/presentation/`
/// restates none of it.
class AppFieldSpec {
  const AppFieldSpec({
    required this.cssClass,
    required this.displayCss,
    required this.widthCss,
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
    required this.hintColor,
    required this.focusBorderColor,
    required this.ringColor,
    required this.ringSpreadPx,
    required this.transitionMs,
    required this.easeX1,
    required this.easeY1,
    required this.easeX2,
    required this.easeY2,
  });

  /// The CSS class this row was measured from.
  final String cssClass;

  /// The computed `display` and `width`, carried as data. On the web the box is
  /// `block` and `width: 100%`, which in Flutter is “as wide as the caller gives
  /// me” — the layout, not the paint.
  final String displayCss;
  final String widthCss;

  final double radiusPx;
  final double borderWidthPx;
  final Color borderColor;
  final Color fillColor;
  final Color textColor;

  /// The class’s own measured `font-family` first family: `Inter`, the body
  /// stack — a field is not a `.btn-*` and does not switch to `--font-display`.
  final String fontFamily;
  final double fontSizePx;
  final int fontWeight;
  final double? lineHeightPx;
  final double letterSpacingPx;
  final double paddingVerticalPx;
  final double paddingHorizontalPx;

  /// Authored `::placeholder { color: … }`, substituted from the same pass’s
  /// measured `:root`. A probe cannot see a pseudo-element while the field holds
  /// a value, so this comes from the pinned stylesheet.
  final Color hintColor;

  /// Authored `:focus { border-color: … }` and `:focus { box-shadow: … }`, same
  /// substitution. `:focus { outline: none }` is the third declaration of that
  /// rule and the port drops it on purpose: Flutter paints no UA outline to
  /// suppress, and the generator fails if the rule authors anything else there.
  final Color focusBorderColor;
  final Color ringColor;
  final double ringSpreadPx;

  /// The class’s own authored `transition`, exactly as `AppControlSpec` carries
  /// it: the field runs its focus change on this clock and picks none.
  final int transitionMs;
  final double easeX1;
  final double easeY1;
  final double easeX2;
  final double easeY2;

  BorderRadius get borderRadius => BorderRadius.circular(radiusPx);

  Border get border => Border.all(color: borderColor, width: borderWidthPx);

  Border get focusedBorder =>
      Border.all(color: focusBorderColor, width: borderWidthPx);

  Duration get transitionDuration => Duration(milliseconds: transitionMs);

  Cubic get transitionCurve => Cubic(easeX1, easeY1, easeX2, easeY2);

  EdgeInsetsGeometry get padding => EdgeInsets.symmetric(
    vertical: paddingVerticalPx,
    horizontal: paddingHorizontalPx,
  );

  FontWeight get weight => FontWeight.values[fontWeight ~/ 100 - 1];

  double? get heightRatio =>
      lineHeightPx == null ? null : lineHeightPx! / fontSizePx;

  /// The ring the focused field paints: no offset, no blur, the authored
  /// spread. CSS `box-shadow: none` at rest is the zero-everything shadow
  /// [restRing] returns, so the transition runs between two shadows and the
  /// spread eases with the colour instead of appearing on the first frame.
  BoxShadow get ring => BoxShadow(
    color: ringColor,
    offset: Offset.zero,
    blurRadius: 0.0,
    spreadRadius: ringSpreadPx,
  );

  BoxShadow get restRing => const BoxShadow(
    color: Color(0x00000000),
    offset: Offset.zero,
    blurRadius: 0.0,
    spreadRadius: 0.0,
  );

  /// The text the field paints, from the class’s own type declarations — never
  /// from the theme’s body style.
  TextStyle get textStyle => TextStyle(
    fontFamily: fontFamily,
    color: textColor,
    fontSize: fontSizePx,
    fontWeight: weight,
    height: heightRatio,
    letterSpacing: letterSpacingPx,
  );

  TextStyle get hintStyle => textStyle.copyWith(color: hintColor);
}

/// One §6 label class, measured at rest. It has no box of its own and no
/// states: `text-transform` is the one declaration that changes what the
/// browser shows without changing the string, so it is ported as a flag.
class AppLabelSpec {
  const AppLabelSpec({
    required this.cssClass,
    required this.displayCss,
    required this.textColor,
    required this.fontFamily,
    required this.fontSizePx,
    required this.fontWeight,
    required this.lineHeightPx,
    required this.letterSpacingPx,
    required this.uppercase,
  });

  final String cssClass;
  final String displayCss;
  final Color textColor;
  final String fontFamily;
  final double fontSizePx;
  final int fontWeight;
  final double? lineHeightPx;
  final double letterSpacingPx;

  /// Authored `text-transform`. CSS applies this after layout, so the element’s
  /// own text never changes; a port that leaves the string alone prints a label
  /// in the wrong case.
  final bool uppercase;

  FontWeight get weight => FontWeight.values[fontWeight ~/ 100 - 1];

  double? get heightRatio =>
      lineHeightPx == null ? null : lineHeightPx! / fontSizePx;

  TextStyle get textStyle => TextStyle(
    fontFamily: fontFamily,
    color: textColor,
    fontSize: fontSizePx,
    fontWeight: weight,
    height: heightRatio,
    letterSpacing: letterSpacingPx,
  );

  String transform(String text) => uppercase ? text.toUpperCase() : text;
}

/// The §6 fields, keyed by CSS class — one map per measured brightness pass.
abstract final class AppFields {
  /// light pass (UI_SPEC §6.1–§6.2, `light-desktop`; states from `src/index.css`).
  static const Map<String, AppFieldSpec> light = <String, AppFieldSpec>{
    '.input': AppFieldSpec(
      cssClass: '.input',
      displayCss: 'block',
      widthCss: '100%',
      radiusPx: 14.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(216, 223, 230, 1.0),
      fillColor: Color.fromRGBO(252, 254, 255, 1.0),
      textColor: Color.fromRGBO(13, 22, 36, 1.0),
      fontFamily: 'Inter',
      fontSizePx: 13.5,
      fontWeight: 400,
      lineHeightPx: 20.25,
      letterSpacingPx: 0.0,
      paddingVerticalPx: 11.0,
      paddingHorizontalPx: 14.0,
      hintColor: Color.fromRGBO(123, 135, 153, 1.0),
      focusBorderColor: Color.fromRGBO(188, 197, 208, 1.0),
      ringColor: Color.fromRGBO(90, 163, 236, 0.3),
      ringSpreadPx: 3.0,
      transitionMs: 130,
      easeX1: 0.22,
      easeY1: 1.0,
      easeX2: 0.36,
      easeY2: 1.0,
    ),
  };

  /// dark pass (UI_SPEC §6.1–§6.2, `dark-desktop`; states from `src/index.css`).
  static const Map<String, AppFieldSpec> dark = <String, AppFieldSpec>{
    '.input': AppFieldSpec(
      cssClass: '.input',
      displayCss: 'block',
      widthCss: '100%',
      radiusPx: 14.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(33, 40, 51, 1.0),
      fillColor: Color.fromRGBO(15, 21, 31, 1.0),
      textColor: Color.fromRGBO(247, 248, 251, 1.0),
      fontFamily: 'Inter',
      fontSizePx: 13.5,
      fontWeight: 400,
      lineHeightPx: 20.25,
      letterSpacingPx: 0.0,
      paddingVerticalPx: 11.0,
      paddingHorizontalPx: 14.0,
      hintColor: Color.fromRGBO(103, 114, 131, 1.0),
      focusBorderColor: Color.fromRGBO(53, 62, 75, 1.0),
      ringColor: Color.fromRGBO(24, 112, 194, 0.3),
      ringSpreadPx: 3.0,
      transitionMs: 130,
      easeX1: 0.22,
      easeY1: 1.0,
      easeX2: 0.36,
      easeY2: 1.0,
    ),
  };

  /// The state rules and the clock, printed once because both passes author
  /// them identically:
  /// `.input:focus` (src/index.css:1065) sets the border to `--line-strong`
  /// and paints a `3px` ring of `--glow 30%`;
  /// `.input::placeholder` (src/index.css:1062) sets `--ink-3`.
  /// `.input` transitions border-color, box-shadow on
  /// `--dur-fast` / `--ease-out` (src/index.css:1050).

  /// The label-to-field gap the web’s Input composition authors: the wrapper’s
  /// `gap-1.5`, which is Tailwind’s
  /// `calc(1.5 * --spacing)` — [AppSpacing.scale] on the measured
  /// unit, not a number the port chose.
  static const double labelGapScale = 1.5;

  static double get labelGap => AppSpacing.scale(labelGapScale);

  /// The measured field for a class and brightness. An unknown class is a
  /// programming error, not a fallback: nothing in this layer may quietly
  /// become a Material default.
  static AppFieldSpec resolve(String cssClass, Brightness brightness) {
    final Map<String, AppFieldSpec> table = brightness == Brightness.dark
        ? dark
        : light;
    final AppFieldSpec? spec = table[cssClass];
    if (spec == null) throw ArgumentError('$cssClass is not a §6 field');
    return spec;
  }
}

/// The §6 label classes, keyed the same way.
abstract final class AppLabels {
  /// light pass (UI_SPEC §6.1–§6.2, `light-desktop`).
  static const Map<String, AppLabelSpec> light = <String, AppLabelSpec>{
    '.eyebrow': AppLabelSpec(
      cssClass: '.eyebrow',
      displayCss: 'block',
      textColor: Color.fromRGBO(123, 135, 153, 1.0),
      fontFamily: 'Inter',
      fontSizePx: 10.0,
      fontWeight: 700,
      lineHeightPx: 15.0,
      letterSpacingPx: 1.2,
      uppercase: true,
    ),
  };

  /// dark pass (UI_SPEC §6.1–§6.2, `dark-desktop`).
  static const Map<String, AppLabelSpec> dark = <String, AppLabelSpec>{
    '.eyebrow': AppLabelSpec(
      cssClass: '.eyebrow',
      displayCss: 'block',
      textColor: Color.fromRGBO(103, 114, 131, 1.0),
      fontFamily: 'Inter',
      fontSizePx: 10.0,
      fontWeight: 700,
      lineHeightPx: 15.0,
      letterSpacingPx: 1.2,
      uppercase: true,
    ),
  };

  /// The resting rule each label was read from — a label has no state rules,
  /// and the generator fails if one appears:
  /// `.eyebrow` at src/index.css:366, with `text-transform: uppercase`.

  static AppLabelSpec resolve(String cssClass, Brightness brightness) {
    final Map<String, AppLabelSpec> table = brightness == Brightness.dark
        ? dark
        : light;
    final AppLabelSpec? spec = table[cssClass];
    if (spec == null) throw ArgumentError('$cssClass is not a §6 label');
    return spec;
  }
}
