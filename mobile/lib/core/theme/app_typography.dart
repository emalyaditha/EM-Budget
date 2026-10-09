// GENERATED — do not edit by hand.
// Produced by `node parity/generate_theme.cjs` from `parity/ui-tokens.json`, the
// Chrome-computed measurement of `src/index.css` at tag `pre-flutter`, with the
// curated token lists and phone markers of `parity/UI_SPEC.md` §2.1–§4.
// Every value below is the measurement; UI_SPEC §5 (whose machine "Dart" column
// mis-parses --blur-* / --container-* names as radii) is deliberately not used.

import 'package:flutter/material.dart';

/// Type tokens from UI_SPEC §2.3 and the §3 type scale. `rem` sizes are
/// converted to px at the 16px root font size of the measurement environment;
/// `lineHeights` are the CSS multipliers (`calc(a / b)` evaluated as a/b), which
/// Flutter `TextStyle.height` consumes directly. The §3 probe classes carry the
/// PHONE column — UI_SPEC §3: "the port must use the phone column".
abstract final class AppTypography {
  /// `--text-2xl` — `1.5rem` (UI_SPEC §2.3).
  static const double text2xl = 24.0;

  /// `--text-2xs` — `11px` (UI_SPEC §2.3).
  static const double text2xs = 11.0;

  /// `--text-3xl` — `1.875rem` (UI_SPEC §2.3).
  static const double text3xl = 30.0;

  /// `--text-4xl` — `2.25rem` (UI_SPEC §2.3).
  static const double text4xl = 36.0;

  /// `--text-base` — `1rem` (UI_SPEC §2.3).
  static const double textBase = 16.0;

  /// `--text-lg` — `20px` (UI_SPEC §2.3).
  static const double textLg = 20.0;

  /// `--text-sm` — `15px` (UI_SPEC §2.3).
  static const double textSm = 15.0;

  /// `--text-xl` — `1.25rem` (UI_SPEC §2.3).
  static const double textXl = 20.0;

  /// `--text-xs` — `13px` (UI_SPEC §2.3).
  static const double textXs = 13.0;

  /// `--text-display` — `clamp(30px, 6vw, 46px)`; §3 says the port uses the phone column,
  /// and the probe `.money-display` measured 30px at innerWidth 390.
  static const double textDisplay = 30.0;

  /// `--text-num` — `clamp(38px, 8vw, 62px)`; §3 says the port uses the phone column,
  /// and the probe `.numeral` measured 38px at innerWidth 390.
  static const double textNum = 38.0;

  /// `--text-2xl--line-height` — line-height multiplier `calc(2 / 1.5)` (UI_SPEC §2.3).
  static const double text2xlLineHeight = 1.3333333333333333;

  /// `--text-3xl--line-height` — line-height multiplier `calc(2.25 / 1.875)` (UI_SPEC §2.3).
  static const double text3xlLineHeight = 1.2;

  /// `--text-4xl--line-height` — line-height multiplier `calc(2.5 / 2.25)` (UI_SPEC §2.3).
  static const double text4xlLineHeight = 1.1111111111111112;

  /// `--text-lg--line-height` — line-height multiplier `calc(1.75 / 1.125)` (UI_SPEC §2.3).
  static const double textLgLineHeight = 1.5555555555555556;

  /// `--text-sm--line-height` — line-height multiplier `calc(1.25 / 0.875)` (UI_SPEC §2.3).
  static const double textSmLineHeight = 1.4285714285714286;

  /// `--text-xl--line-height` — line-height multiplier `calc(1.75 / 1.25)` (UI_SPEC §2.3).
  static const double textXlLineHeight = 1.4;

  /// `--text-xs--line-height` — line-height multiplier `calc(1 / 0.75)` (UI_SPEC §2.3).
  static const double textXsLineHeight = 1.3333333333333333;

  /// `--leading-normal` — line-height multiplier `1.5`.
  static const double leadingNormal = 1.5;

  /// `--leading-relaxed` — line-height multiplier `1.625`.
  static const double leadingRelaxed = 1.625;

  /// `--leading-tight` — line-height multiplier `1.25`.
  static const double leadingTight = 1.25;

  /// `--tracking-normal` — `0em`. CSS letter-spacing is an em multiplier; Flutter
  /// TextStyle.letterSpacing is px, so multiply by the font size. The §3
  /// class styles below already embed the phone-resolved px values.
  static const double trackingNormalEm = 0.0;

  /// `--tracking-tight` — `-0.025em`. CSS letter-spacing is an em multiplier; Flutter
  /// TextStyle.letterSpacing is px, so multiply by the font size. The §3
  /// class styles below already embed the phone-resolved px values.
  static const double trackingTightEm = -0.025;

  /// `--tracking-wide` — `0.025em`. CSS letter-spacing is an em multiplier; Flutter
  /// TextStyle.letterSpacing is px, so multiply by the font size. The §3
  /// class styles below already embed the phone-resolved px values.
  static const double trackingWideEm = 0.025;

  /// `--tracking-wider` — `0.05em`. CSS letter-spacing is an em multiplier; Flutter
  /// TextStyle.letterSpacing is px, so multiply by the font size. The §3
  /// class styles below already embed the phone-resolved px values.
  static const double trackingWiderEm = 0.05;

  /// `--tracking-widest` — `0.1em`. CSS letter-spacing is an em multiplier; Flutter
  /// TextStyle.letterSpacing is px, so multiply by the font size. The §3
  /// class styles below already embed the phone-resolved px values.
  static const double trackingWidestEm = 0.1;

  // ------------------------------------------------------------- §3 probe classes, phone column
  /// `.money-display` at the phone viewport (§3): 30px / lh 31.5px / ls -0.6px / weight 800.
  /// Font family `Plus Jakarta Sans` only renders once the §3.1 font-bundle approval lands;
  /// until then Flutter falls back to the system font. height = lineHeight px / font-size px.
  static const TextStyle moneyDisplay = TextStyle(
    fontSize: 30.0,
    height: 1.05,
    letterSpacing: -0.6,
    fontWeight: FontWeight.w800,
    fontFamily: 'Plus Jakarta Sans',
  );

  /// `.numeral` at the phone viewport (§3): 38px / lh 38px / ls -1.14px / weight 300.
  /// Font family `Plus Jakarta Sans` only renders once the §3.1 font-bundle approval lands;
  /// until then Flutter falls back to the system font. height = lineHeight px / font-size px.
  static const TextStyle numeral = TextStyle(
    fontSize: 38.0,
    height: 1.0,
    letterSpacing: -1.14,
    fontWeight: FontWeight.w300,
    fontFamily: 'Plus Jakarta Sans',
  );

  /// `.numeral-hero` at the phone viewport (§3): 38px / lh 57px / ls normal / weight 400.
  /// Font family `Inter` only renders once the §3.1 font-bundle approval lands;
  /// until then Flutter falls back to the system font. height = lineHeight px / font-size px.
  static const TextStyle numeralHero = TextStyle(
    fontSize: 38.0,
    height: 1.5,
    letterSpacing: 0.0,
    fontWeight: FontWeight.w400,
    fontFamily: 'Inter',
  );

  /// `.numeral-md` at the phone viewport (§3): 26px / lh 39px / ls normal / weight 400.
  /// Font family `Inter` only renders once the §3.1 font-bundle approval lands;
  /// until then Flutter falls back to the system font. height = lineHeight px / font-size px.
  static const TextStyle numeralMd = TextStyle(
    fontSize: 26.0,
    height: 1.5,
    letterSpacing: 0.0,
    fontWeight: FontWeight.w400,
    fontFamily: 'Inter',
  );

  /// `.numeral-sup` at the phone viewport (§3): 6px / lh 9px / ls 0.1792px / weight 500.
  /// Font family `Inter` only renders once the §3.1 font-bundle approval lands;
  /// until then Flutter falls back to the system font. height = lineHeight px / font-size px.
  static const TextStyle numeralSup = TextStyle(
    fontSize: 6.0,
    height: 1.5,
    letterSpacing: 0.1792,
    fontWeight: FontWeight.w500,
    fontFamily: 'Inter',
  );

  // ------------------------------------------------------------- font stacks + weights (§2.3)
  /// `--default-font-family` — `'Inter', system-ui, sans-serif`.
  static const String defaultFontFamily = '\'Inter\', system-ui, sans-serif';

  /// `--default-mono-font-family` — `'JetBrains Mono', monospace`.
  static const String defaultMonoFontFamily = '\'JetBrains Mono\', monospace';

  /// `--font-display` — `'Plus Jakarta Sans', 'Inter', system-ui, sans-serif`.
  static const String fontDisplay =
      '\'Plus Jakarta Sans\', \'Inter\', system-ui, sans-serif';

  /// `--font-mono` — `'JetBrains Mono', monospace`.
  static const String fontMono = '\'JetBrains Mono\', monospace';

  /// `--font-sans` — `'Inter', system-ui, sans-serif`.
  static const String fontSans = '\'Inter\', system-ui, sans-serif';

  /// `--font-serif` — `ui-serif, Georgia, Cambria, "Times New Roman", Times, serif`.
  static const String fontSerif =
      'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';

  /// `--font-weight-black` — CSS font-weight 900.
  static const FontWeight fontWeightBlack = FontWeight.w900;

  /// `--font-weight-bold` — CSS font-weight 700.
  static const FontWeight fontWeightBold = FontWeight.w700;

  /// `--font-weight-extrabold` — CSS font-weight 800.
  static const FontWeight fontWeightExtrabold = FontWeight.w800;

  /// `--font-weight-medium` — CSS font-weight 500.
  static const FontWeight fontWeightMedium = FontWeight.w500;

  /// `--font-weight-normal` — CSS font-weight 400.
  static const FontWeight fontWeightNormal = FontWeight.w400;

  /// `--font-weight-semibold` — CSS font-weight 600.
  static const FontWeight fontWeightSemibold = FontWeight.w600;

  /// Every measured text size in px, keyed by CSS token name; clamp tokens carry
  /// their phone-column resolution from the §3 probes.
  static const Map<String, double> sizesByToken = <String, double>{
    '--text-2xl': 24.0,
    '--text-2xs': 11.0,
    '--text-3xl': 30.0,
    '--text-4xl': 36.0,
    '--text-base': 16.0,
    '--text-lg': 20.0,
    '--text-sm': 15.0,
    '--text-xl': 20.0,
    '--text-xs': 13.0,
    '--text-display': 30.0,
    '--text-num': 38.0,
  };

  /// Line-height multiplier per text token, from the measured
  /// `--text-*--line-height` calcs (§2.3) and, for the clamp tokens, the §3 phone
  /// probes (lineHeight px / fontSize px). `--text-base` measured no line-height
  /// utility, so it has no entry — the doc records the absence.
  static const Map<String, double> lineHeightsByToken = <String, double>{
    '--text-2xl--line-height': 1.3333333333333333,
    '--text-3xl--line-height': 1.2,
    '--text-4xl--line-height': 1.1111111111111112,
    '--text-display': 1.05,
    '--text-lg--line-height': 1.5555555555555556,
    '--text-num': 1.0,
    '--text-sm--line-height': 1.4285714285714286,
    '--text-xl--line-height': 1.4,
    '--text-xs--line-height': 1.3333333333333333,
  };
}
