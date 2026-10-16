// GENERATED — do not edit by hand.
// Produced by `node parity/generate_theme.cjs` from `parity/ui-tokens.json`, the
// Chrome-computed measurement of `src/index.css` at tag `pre-flutter`, with the
// curated token lists and phone markers of `parity/UI_SPEC.md` §2.1–§4.
// Every value below is the measurement; UI_SPEC §5 (whose machine "Dart" column
// mis-parses --blur-* / --container-* names as radii) is deliberately not used.

import 'package:flutter/material.dart';

/// One numeral/money type class of `src/index.css`, measured on a detached
/// element at the phone pass and re-derived from the rule that authored it.
///
/// These classes carry a font size and nothing but a font size: they paint no
/// fill, no border, no shadow and no padding, and every row proves it — the
/// probe measured a transparent box on all four passes. `displayCss` is the
/// detached <div>'s own default, not a design fact: a numeral is a `<p>`
/// at its call sites and `.numeral-sup` an inline `<span>`.
///
/// `letterSpacingEm` is the authored `em` multiplier and `letterSpacingPx` the
/// phone resolution of it, which is why they agree only at 38px or 30px: CSS
/// resolves tracking against the element's used font size, so a row painted at
/// another size has to re-derive it — see [AppNumeralSpec.styleAt].
class AppNumeralSpec {
  const AppNumeralSpec({
    required this.cssClass,
    required this.authoredSrc,
    required this.displayCss,
    required this.fontFamily,
    required this.fontSizePx,
    required this.fontWeight,
    required this.heightRatio,
    required this.letterSpacingPx,
    required this.letterSpacingEm,
    required this.tabularNums,
    required this.overflowWrapAnywhere,
    required this.minWidthZero,
    required this.textColor,
    required this.inheritsColor,
    required this.authoredColorToken,
  });

  final String cssClass;

  /// Where the rule that authored this row lives.
  final String authoredSrc;

  /// The probe element's computed `display` — `block` on a detached `<div>`, so
  /// it says nothing about the call site. Carried as data, never used.
  final String displayCss;

  /// The first family of the measured stack. Item 10 bundled it (UI_SPEC §3.1),
  /// so it is the face that renders; `app_fonts_test.dart` fails if a named family
  /// ever stops resolving, because a fallback would draw this row at the wrong
  /// width while looking exactly like the right design.
  final String fontFamily;
  final double fontSizePx;
  final int fontWeight;

  /// The authored unitless line-height, or the ratio `body` measured (`1.5`) for
  /// the rows that author none — every one of them resolves to it, which the
  /// generator proves per pass. Flutter `TextStyle.height` takes the multiplier
  /// as-is, so a resized row keeps its proportion.
  final double heightRatio;

  /// `letterSpacing` at the phone pass, and the `em` multiplier that produced it
  /// (`0` where the row authors none and the probe measured `normal`).
  final double letterSpacingPx;
  final double letterSpacingEm;

  /// `font-variant-numeric: tabular-nums`, which Flutter answers with
  /// [FontFeature.tabularFigures] — a font feature, so it does nothing in a
  /// fallback and equalises the digit advances in the bundled face. That
  /// difference is what `app_fonts_test.dart` measures, on the face rather than
  /// on a widget, so a row that silently lost tnum would be reported there.
  final bool tabularNums;

  /// `overflow-wrap: anywhere`, which this Flutter SDK has no engine knob for
  /// (`TextStyle` and `Text` carry neither `overflowWrap` nor `WordBreak`). The
  /// flag is the authored fact; [AppNumeral] records the deviation it forces.
  final bool overflowWrapAnywhere;

  /// `min-width: 0` — a flex-item hint that lets a long figure shrink below its
  /// content width. Flutter gives a `Text` its parent's max width already, so
  /// there is nothing to port; the flag records why not.
  final bool minWidthZero;

  final Color textColor;

  /// True when the row's colour is `body`'s, not its own — the numeral faces
  /// never author a colour, so what they measured is the theme’s ink, and a call
  /// site’s own `text-*` utility overrides it exactly as it does on the web.
  final bool inheritsColor;
  final String? authoredColorToken;

  FontWeight get weight => FontWeight.values[fontWeight ~/ 100 - 1];

  List<FontFeature> get fontFeatures => tabularNums
      ? const <FontFeature>[FontFeature.tabularFigures()]
      : const <FontFeature>[];

  /// The row as the phone measured it.
  TextStyle get textStyle => styleAt(fontSizePx);

  /// The row at another font size — the hero’s `min()` and the sup’s `em` both
  /// need this, because CSS resolves tracking against the used font size. The
  /// line-height is the authored multiplier, so it travels with the size —
  /// except for an inline span, which [AppNumerals.supAt] asks for without it:
  /// a CSS line-height on an inline span never grows its parent’s line box,
  /// while Flutter `TextStyle.height` does.
  TextStyle styleAt(double sizePx, {bool includeLineHeight = true}) =>
      TextStyle(
        fontFamily: fontFamily,
        color: textColor,
        fontSize: sizePx,
        fontWeight: weight,
        height: includeLineHeight ? heightRatio : null,
        letterSpacing: letterSpacingEm * sizePx,
        fontFeatures: fontFeatures,
      );
}

/// What [AppNumerals.supAt] hands back: the sup’s own style plus the two
/// offsets the authored `em` values resolve to at that size.
class AppNumeralSupBox {
  const AppNumeralSupBox({
    required this.style,
    required this.liftPx,
    required this.gapPx,
  });

  final TextStyle style;

  /// `vertical-align: 0.62em`, upward — the span sits above the parent baseline.
  final double liftPx;

  /// `margin-left: 0.28em` of its own font size.
  final double gapPx;
}

/// The numeral/money rows, keyed by CSS class — one map per measured brightness
/// pass, with the metrics taken from that pass’s phone probe (UI_SPEC §3: the
/// port uses the phone column).
abstract final class AppNumerals {
  /// The root font size the measurement resolved against: `body` authors no
  /// font size, so its probe is the 16px every `em` and `vw` in this block
  /// inherits from. A `.money` overlay with no size from its caller is this big.
  static const double rootFontSizePx = 16.0;

  /// `.numeral-hero` authors `font-size: min(var(--text-num), 15cqi)`
  /// (src/index.css:411) — the fraction of its `.hero-face` container the figure
  /// takes when the card is narrower than the numeral’s own size.
  static const double heroWidthFraction = 0.15;

  /// `.numeral-sup` (src/index.css:414) authors all four of its metrics in `em`.
  /// Its standalone probe row is unusable as a call-site value: Chrome floors a
  /// tiny used font size up to 6px while `letter-spacing` keeps resolving from
  /// the specified `0.28 × 16px`, which is what the row’s measured `0.1792px`
  /// says. The hero is a 38px parent, well clear of any floor, so the port
  /// resolves these ratios against the numeral they sit in.
  static const double supFontSizeEm = 0.28;
  static const double supLetterSpacingEm = 0.04;
  static const double supVerticalAlignEm = 0.62;
  static const double supMarginLeftEm = 0.28;

  /// light pass (UI_SPEC §3/§6, `light-phone`).
  static const Map<String, AppNumeralSpec> light = <String, AppNumeralSpec>{
    '.money-display': AppNumeralSpec(
      cssClass: '.money-display',
      authoredSrc: 'src/index.css:379',
      displayCss: 'block',
      fontFamily: 'Plus Jakarta Sans',
      fontSizePx: 30.0,
      fontWeight: 800,
      heightRatio: 1.05,
      letterSpacingPx: -0.6,
      letterSpacingEm: -0.02,
      tabularNums: true,
      overflowWrapAnywhere: true,
      minWidthZero: true,
      textColor: Color.fromRGBO(13, 22, 36, 1.0),
      inheritsColor: true,
      authoredColorToken: null,
    ),
    '.numeral': AppNumeralSpec(
      cssClass: '.numeral',
      authoredSrc: 'src/index.css:389',
      displayCss: 'block',
      fontFamily: 'Plus Jakarta Sans',
      fontSizePx: 38.0,
      fontWeight: 300,
      heightRatio: 1.0,
      letterSpacingPx: -1.14,
      letterSpacingEm: -0.03,
      tabularNums: true,
      overflowWrapAnywhere: true,
      minWidthZero: true,
      textColor: Color.fromRGBO(13, 22, 36, 1.0),
      inheritsColor: true,
      authoredColorToken: null,
    ),
    '.numeral-md': AppNumeralSpec(
      cssClass: '.numeral-md',
      authoredSrc: 'src/index.css:399',
      displayCss: 'block',
      fontFamily: 'Inter',
      fontSizePx: 26.0,
      fontWeight: 400,
      heightRatio: 1.5,
      letterSpacingPx: 0.0,
      letterSpacingEm: 0.0,
      tabularNums: false,
      overflowWrapAnywhere: false,
      minWidthZero: false,
      textColor: Color.fromRGBO(13, 22, 36, 1.0),
      inheritsColor: true,
      authoredColorToken: null,
    ),
    '.numeral-hero': AppNumeralSpec(
      cssClass: '.numeral-hero',
      authoredSrc: 'src/index.css:411',
      displayCss: 'block',
      fontFamily: 'Inter',
      fontSizePx: 38.0,
      fontWeight: 400,
      heightRatio: 1.5,
      letterSpacingPx: 0.0,
      letterSpacingEm: 0.0,
      tabularNums: false,
      overflowWrapAnywhere: false,
      minWidthZero: false,
      textColor: Color.fromRGBO(13, 22, 36, 1.0),
      inheritsColor: true,
      authoredColorToken: null,
    ),
    '.numeral-sup': AppNumeralSpec(
      cssClass: '.numeral-sup',
      authoredSrc: 'src/index.css:414',
      displayCss: 'block',
      fontFamily: 'Inter',
      fontSizePx: 6.0,
      fontWeight: 500,
      heightRatio: 1.5,
      letterSpacingPx: 0.1792,
      letterSpacingEm: 0.04,
      tabularNums: false,
      overflowWrapAnywhere: false,
      minWidthZero: false,
      textColor: Color.fromRGBO(123, 135, 153, 1.0),
      inheritsColor: false,
      authoredColorToken: '--ink-3',
    ),
    '.money': AppNumeralSpec(
      cssClass: '.money',
      authoredSrc: 'src/index.css:423',
      displayCss: 'block',
      fontFamily: 'Inter',
      fontSizePx: 16.0,
      fontWeight: 400,
      heightRatio: 1.5,
      letterSpacingPx: -0.16,
      letterSpacingEm: -0.01,
      tabularNums: true,
      overflowWrapAnywhere: false,
      minWidthZero: false,
      textColor: Color.fromRGBO(13, 22, 36, 1.0),
      inheritsColor: true,
      authoredColorToken: null,
    ),
    '.mono': AppNumeralSpec(
      cssClass: '.mono',
      authoredSrc: 'src/index.css:362',
      displayCss: 'block',
      fontFamily: 'JetBrains Mono',
      fontSizePx: 16.0,
      fontWeight: 400,
      heightRatio: 1.5,
      letterSpacingPx: 0.0,
      letterSpacingEm: 0.0,
      tabularNums: true,
      overflowWrapAnywhere: false,
      minWidthZero: false,
      textColor: Color.fromRGBO(13, 22, 36, 1.0),
      inheritsColor: true,
      authoredColorToken: null,
    ),
  };

  /// dark pass (UI_SPEC §3/§6, `dark-phone`).
  static const Map<String, AppNumeralSpec> dark = <String, AppNumeralSpec>{
    '.money-display': AppNumeralSpec(
      cssClass: '.money-display',
      authoredSrc: 'src/index.css:379',
      displayCss: 'block',
      fontFamily: 'Plus Jakarta Sans',
      fontSizePx: 30.0,
      fontWeight: 800,
      heightRatio: 1.05,
      letterSpacingPx: -0.6,
      letterSpacingEm: -0.02,
      tabularNums: true,
      overflowWrapAnywhere: true,
      minWidthZero: true,
      textColor: Color.fromRGBO(247, 248, 251, 1.0),
      inheritsColor: true,
      authoredColorToken: null,
    ),
    '.numeral': AppNumeralSpec(
      cssClass: '.numeral',
      authoredSrc: 'src/index.css:389',
      displayCss: 'block',
      fontFamily: 'Plus Jakarta Sans',
      fontSizePx: 38.0,
      fontWeight: 300,
      heightRatio: 1.0,
      letterSpacingPx: -1.14,
      letterSpacingEm: -0.03,
      tabularNums: true,
      overflowWrapAnywhere: true,
      minWidthZero: true,
      textColor: Color.fromRGBO(247, 248, 251, 1.0),
      inheritsColor: true,
      authoredColorToken: null,
    ),
    '.numeral-md': AppNumeralSpec(
      cssClass: '.numeral-md',
      authoredSrc: 'src/index.css:399',
      displayCss: 'block',
      fontFamily: 'Inter',
      fontSizePx: 26.0,
      fontWeight: 400,
      heightRatio: 1.5,
      letterSpacingPx: 0.0,
      letterSpacingEm: 0.0,
      tabularNums: false,
      overflowWrapAnywhere: false,
      minWidthZero: false,
      textColor: Color.fromRGBO(247, 248, 251, 1.0),
      inheritsColor: true,
      authoredColorToken: null,
    ),
    '.numeral-hero': AppNumeralSpec(
      cssClass: '.numeral-hero',
      authoredSrc: 'src/index.css:411',
      displayCss: 'block',
      fontFamily: 'Inter',
      fontSizePx: 38.0,
      fontWeight: 400,
      heightRatio: 1.5,
      letterSpacingPx: 0.0,
      letterSpacingEm: 0.0,
      tabularNums: false,
      overflowWrapAnywhere: false,
      minWidthZero: false,
      textColor: Color.fromRGBO(247, 248, 251, 1.0),
      inheritsColor: true,
      authoredColorToken: null,
    ),
    '.numeral-sup': AppNumeralSpec(
      cssClass: '.numeral-sup',
      authoredSrc: 'src/index.css:414',
      displayCss: 'block',
      fontFamily: 'Inter',
      fontSizePx: 6.0,
      fontWeight: 500,
      heightRatio: 1.5,
      letterSpacingPx: 0.1792,
      letterSpacingEm: 0.04,
      tabularNums: false,
      overflowWrapAnywhere: false,
      minWidthZero: false,
      textColor: Color.fromRGBO(103, 114, 131, 1.0),
      inheritsColor: false,
      authoredColorToken: '--ink-3',
    ),
    '.money': AppNumeralSpec(
      cssClass: '.money',
      authoredSrc: 'src/index.css:423',
      displayCss: 'block',
      fontFamily: 'Inter',
      fontSizePx: 16.0,
      fontWeight: 400,
      heightRatio: 1.5,
      letterSpacingPx: -0.16,
      letterSpacingEm: -0.01,
      tabularNums: true,
      overflowWrapAnywhere: false,
      minWidthZero: false,
      textColor: Color.fromRGBO(247, 248, 251, 1.0),
      inheritsColor: true,
      authoredColorToken: null,
    ),
    '.mono': AppNumeralSpec(
      cssClass: '.mono',
      authoredSrc: 'src/index.css:362',
      displayCss: 'block',
      fontFamily: 'JetBrains Mono',
      fontSizePx: 16.0,
      fontWeight: 400,
      heightRatio: 1.5,
      letterSpacingPx: 0.0,
      letterSpacingEm: 0.0,
      tabularNums: true,
      overflowWrapAnywhere: false,
      minWidthZero: false,
      textColor: Color.fromRGBO(247, 248, 251, 1.0),
      inheritsColor: true,
      authoredColorToken: null,
    ),
  };

  /// The measured row for a class. An unknown class is a programming error,
  /// not a fallback.
  static AppNumeralSpec resolve(String cssClass, Brightness brightness) {
    final Map<String, AppNumeralSpec> table = brightness == Brightness.dark
        ? dark
        : light;
    final AppNumeralSpec? spec = table[cssClass];
    if (spec == null) throw ArgumentError('$cssClass is not a numeral class');
    return spec;
  }

  /// The `numeral numeral-hero` stack’s font size at the width its `.hero-face`
  /// container offers: `.numeral`'s own measured size, capped by
  /// [heroWidthFraction] of the container. An unbounded box keeps the numeral
  /// size, which is what CSS does when the query container is the viewport at
  /// the phone column — the probe this was checked against.
  static double heroFontSizePx(
    double containerInlineSizePx,
    Brightness brightness,
  ) {
    final double cap = resolve('.numeral', brightness).fontSizePx;
    final double cqi = heroWidthFraction * containerInlineSizePx;
    return cqi < cap ? cqi : cap;
  }

  /// The `.numeral-sup` span as the hero composes it, at the parent numeral’s
  /// font size. `height` is dropped: CSS line-height on an inline span never
  /// grows the parent's line box, while Flutter `TextStyle.height` does, so the
  /// figure’s own height is the one that has to stand.
  static AppNumeralSupBox supAt(
    double parentFontSizePx,
    Brightness brightness,
  ) {
    final AppNumeralSpec sup = resolve('.numeral-sup', brightness);
    final double size = supFontSizeEm * parentFontSizePx;
    return AppNumeralSupBox(
      style: sup.styleAt(size, includeLineHeight: false),
      liftPx: supVerticalAlignEm * size,
      gapPx: supMarginLeftEm * size,
    );
  }
}
