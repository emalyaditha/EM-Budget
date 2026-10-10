// GENERATED — do not edit by hand.
// Produced by `node parity/generate_theme.cjs` from `parity/ui-tokens.json`, the
// Chrome-computed measurement of `src/index.css` at tag `pre-flutter`, with the
// curated token lists and phone markers of `parity/UI_SPEC.md` §2.1–§4.
// Every value below is the measurement; UI_SPEC §5 (whose machine "Dart" column
// mis-parses --blur-* / --container-* names as radii) is deliberately not used.

import 'package:flutter/material.dart';

import 'app_colors.dart';
import 'app_radii.dart';
import 'app_shadows.dart';
import 'app_spacing.dart';
import 'app_typography.dart';

/// Custom design tokens `ThemeData` has no slot for: the §2.3 radius/blur/
/// spacing values, the §4 motion values, and the §2.2 gradient and shadow
/// sets resolved for one brightness. The light and dark instances carry the
/// respective measured pass; nothing here falls back to a Material default.
class AppTokens extends ThemeExtension<AppTokens> {
  const AppTokens({
    required this.radii,
    required this.blurs,
    required this.durations,
    required this.curves,
    required this.gradients,
    required this.shadows,
    required this.spacingUnit,
    required this.containers,
  });

  /// `--r-*` / `--radius-*` in px (AppRadii.byToken).
  final Map<String, double> radii;

  /// `--blur-*` in measured CSS px. ImageFilter.blur sigma = px / 2 is the
  /// Material convention (UI_SPEC §5 note); the token itself is the px value.
  final Map<String, double> blurs;
  final Map<String, Duration> durations;
  final Map<String, Curve> curves;
  final Map<String, LinearGradient> gradients;
  final Map<String, List<BoxShadow>> shadows;
  final double spacingUnit;

  /// `--container-*` breakpoints in px.
  final Map<String, double> containers;

  // ------------------------------------------------------------- §4 motion
  /// `--default-transition-duration` — `150ms` (UI_SPEC §4).
  static const Duration defaultTransitionDuration = Duration(milliseconds: 150);

  /// `--dur` — `220ms` (UI_SPEC §4).
  static const Duration dur = Duration(milliseconds: 220);

  /// `--dur-fast` — `130ms` (UI_SPEC §4).
  static const Duration durFast = Duration(milliseconds: 130);

  /// `--dur-slow` — `420ms` (UI_SPEC §4).
  static const Duration durSlow = Duration(milliseconds: 420);

  /// `--default-transition-timing-function` — `cubic-bezier(0.4, 0, 0.2, 1)` (UI_SPEC §4). Kept verbatim as a Cubic;
  /// `Curves.*` names are not parity targets.
  static const Cubic defaultTransitionTimingFunction = Cubic(
    0.4,
    0.0,
    0.2,
    1.0,
  );

  /// `--ease-in` — `cubic-bezier(0.4, 0, 1, 1)` (UI_SPEC §4). Kept verbatim as a Cubic;
  /// `Curves.*` names are not parity targets.
  static const Cubic easeIn = Cubic(0.4, 0.0, 1.0, 1.0);

  /// `--ease-in-out` — `cubic-bezier(0.4, 0, 0.2, 1)` (UI_SPEC §4). Kept verbatim as a Cubic;
  /// `Curves.*` names are not parity targets.
  static const Cubic easeInOut = Cubic(0.4, 0.0, 0.2, 1.0);

  /// `--ease-out` — `cubic-bezier(0.22, 1, 0.36, 1)` (UI_SPEC §4). Kept verbatim as a Cubic;
  /// `Curves.*` names are not parity targets.
  static const Cubic easeOut = Cubic(0.22, 1.0, 0.36, 1.0);

  /// `--ease-spring` — `cubic-bezier(0.34, 1.56, 0.64, 1)` (UI_SPEC §4). Kept verbatim as a Cubic;
  /// `Curves.*` names are not parity targets. This one overshoots past 1.0, which no `Curves.*` equals (§4 note).
  static const Cubic easeSpring = Cubic(0.34, 1.56, 0.64, 1.0);

  /// `--animate-pulse` — `pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite` (UI_SPEC §4). CSS shorthand kept for
  /// provenance; Dart composes the repeat/curve from the same numbers.
  static const String animatePulse =
      'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite';

  /// `--animate-spin` — `spin 1s linear infinite` (UI_SPEC §4). CSS shorthand kept for
  /// provenance; Dart composes the repeat/curve from the same numbers.
  static const String animateSpin = 'spin 1s linear infinite';

  // ------------------------------------------------------------- §2.3 blur (filter input, not a radius)
  /// `--blur-2xl` — `40px` of CSS blur.
  static const double blur2xl = 40.0;

  /// `--blur-md` — `12px` of CSS blur.
  static const double blurMd = 12.0;

  /// `--blur-sm` — `8px` of CSS blur.
  static const double blurSm = 8.0;

  /// `--blur-xl` — `24px` of CSS blur.
  static const double blurXl = 24.0;

  /// `--blur-xs` — `4px` of CSS blur.
  static const double blurXs = 4.0;

  /// Motion durations keyed by CSS token name.
  static const Map<String, Duration> durationsByToken = <String, Duration>{
    '--default-transition-duration': defaultTransitionDuration,
    '--dur': dur,
    '--dur-fast': durFast,
    '--dur-slow': durSlow,
  };

  /// Motion timing functions keyed by CSS token name.
  static const Map<String, Curve> curvesByToken = <String, Curve>{
    '--default-transition-timing-function': defaultTransitionTimingFunction,
    '--ease-in': easeIn,
    '--ease-in-out': easeInOut,
    '--ease-out': easeOut,
    '--ease-spring': easeSpring,
  };

  /// Blur tokens keyed by CSS token name (measured px).
  static const Map<String, double> blursByToken = <String, double>{
    '--blur-2xl': 40.0,
    '--blur-md': 12.0,
    '--blur-sm': 8.0,
    '--blur-xl': 24.0,
    '--blur-xs': 4.0,
  };

  /// The light-pass instance.
  static const AppTokens light = AppTokens(
    radii: AppRadii.byToken,
    blurs: blursByToken,
    durations: durationsByToken,
    curves: curvesByToken,
    gradients: AppColors.gradientsLight,
    shadows: AppShadows.shadowsLight,
    spacingUnit: AppSpacing.spacing,
    containers: AppSpacing.containersByToken,
  );

  /// The dark-pass instance.
  static const AppTokens dark = AppTokens(
    radii: AppRadii.byToken,
    blurs: blursByToken,
    durations: durationsByToken,
    curves: curvesByToken,
    gradients: AppColors.gradientsDark,
    shadows: AppShadows.shadowsDark,
    spacingUnit: AppSpacing.spacing,
    containers: AppSpacing.containersByToken,
  );

  @override
  AppTokens copyWith({
    Map<String, double>? radii,
    Map<String, double>? blurs,
    Map<String, Duration>? durations,
    Map<String, Curve>? curves,
    Map<String, LinearGradient>? gradients,
    Map<String, List<BoxShadow>>? shadows,
    double? spacingUnit,
    Map<String, double>? containers,
  }) {
    return AppTokens(
      radii: radii ?? this.radii,
      blurs: blurs ?? this.blurs,
      durations: durations ?? this.durations,
      curves: curves ?? this.curves,
      gradients: gradients ?? this.gradients,
      shadows: shadows ?? this.shadows,
      spacingUnit: spacingUnit ?? this.spacingUnit,
      containers: containers ?? this.containers,
    );
  }

  @override
  AppTokens lerp(covariant AppTokens? other, double t) =>
      t < 0.5 ? this : other ?? this;

  /// Resolve a §2.1 colour token for a brightness — the lookup the widgets layer uses.
  static Color colorOf(String token, {required bool isDark}) =>
      (isDark ? AppColors.darkByToken : AppColors.lightByToken)[token]!;
}

/// Light/dark `ThemeData` built from the measured tokens — playbook §2.4 step 4.
///
/// Every ColorScheme slot is pinned to a §2.1 token (the table is the
/// generator-side `schemeMap`): the web authors no Material-specific
/// secondary/fixed/scrim colours, so those slots are PINS, not new design
/// values — they exist so no Material baseline (e.g. the M3 purple) can
/// surface where the spec never measured one. Text roles map monotonically
/// onto the measured `--text-*` ladder, each rung a §2.3 value and the clamp
/// rungs the §3 phone column; weights are not attached to Material roles
/// because the measurement attaches them to §3 classes, not to text tokens.
/// Font families are intentionally NOT set: §3.1 makes bundling the three
/// web families an open approval, and a missing family silently re-glyphs
/// every golden screenshot.
ThemeData appThemeData({required bool isDark}) {
  Color c(String token) => AppTokens.colorOf(token, isDark: isDark);
  final ColorScheme scheme =
      (isDark ? const ColorScheme.dark() : const ColorScheme.light()).copyWith(
        primary: c('--accent'),
        onPrimary: c('--accent-fg'),
        primaryContainer: c('--bg-2'),
        onPrimaryContainer: c('--ink'),
        primaryFixed: c('--surface-2'),
        primaryFixedDim: c('--surface-3'),
        onPrimaryFixed: c('--ink'),
        onPrimaryFixedVariant: c('--ink'),
        secondary: c('--glow'),
        onSecondary: c('--accent-fg'),
        secondaryContainer: c('--bg-2'),
        onSecondaryContainer: c('--ink'),
        secondaryFixed: c('--surface-2'),
        secondaryFixedDim: c('--surface-3'),
        onSecondaryFixed: c('--ink'),
        onSecondaryFixedVariant: c('--ink'),
        tertiary: c('--hero-deep'),
        onTertiary: c('--accent-fg'),
        tertiaryContainer: c('--bg-2'),
        onTertiaryContainer: c('--ink'),
        tertiaryFixed: c('--surface-2'),
        tertiaryFixedDim: c('--surface-3'),
        onTertiaryFixed: c('--ink'),
        onTertiaryFixedVariant: c('--ink'),
        error: c('--danger'),
        onError: c('--accent-fg'),
        errorContainer: c('--danger-bg'),
        onErrorContainer: c('--ink'),
        surface: c('--surface'),
        onSurface: c('--ink'),
        surfaceDim: c('--bg'),
        surfaceBright: c('--bg-2'),
        surfaceContainerLowest: c('--surface'),
        surfaceContainerLow: c('--surface'),
        surfaceContainer: c('--surface-2'),
        surfaceContainerHigh: c('--surface-2'),
        surfaceContainerHighest: c('--surface-3'),
        onSurfaceVariant: c('--ink-2'),
        outline: c('--line-strong'),
        outlineVariant: c('--line'),
        surfaceTint: c('--accent'),
        inverseSurface: c('--ink'),
        onInverseSurface: c('--surface'),
        inversePrimary: c('--accent-fg'),
        shadow: c('--ink'),
        scrim: c('--face-anchor'),
      );
  final Color ink = c('--ink');
  final Color ink2 = c('--ink-2');
  return ThemeData(
    brightness: isDark ? Brightness.dark : Brightness.light,
    colorScheme: scheme,
    scaffoldBackgroundColor: c('--bg'),
    canvasColor: c('--bg'),
    cardColor: c('--surface'),
    dialogTheme: DialogThemeData(backgroundColor: c('--surface')),
    textTheme: appTextTheme(ink: ink, muted: ink2),
    extensions: <ThemeExtension<dynamic>>[
      isDark ? AppTokens.dark : AppTokens.light,
    ],
  );
}

/// The §2.3 text ladder wired into the Material roles — see appThemeData doc.
/// `--text-base` measured no line-height utility, so its styles inherit Flutter
/// line metrics; every other rung carries the measured multiplier.
TextTheme appTextTheme({required Color ink, required Color muted}) {
  TextStyle r(String token, Color color) => TextStyle(
    fontSize: AppTypography.sizesByToken[token],
    height: AppTypography.lineHeightsByToken[token],
    color: color,
  );
  return TextTheme(
    displayLarge: r('--text-num', ink),
    displayMedium: r('--text-4xl', ink),
    displaySmall: r('--text-3xl', ink),
    headlineLarge: r('--text-display', ink),
    headlineMedium: r('--text-2xl', ink),
    headlineSmall: r('--text-xl', ink),
    titleLarge: r('--text-lg', ink),
    titleMedium: r('--text-base', ink),
    titleSmall: r('--text-sm', ink),
    bodyLarge: r('--text-base', ink),
    bodyMedium: r('--text-sm', ink),
    bodySmall: r('--text-xs', ink),
    labelLarge: r('--text-sm', muted),
    labelMedium: r('--text-xs', muted),
    labelSmall: r('--text-2xs', muted),
  );
}
