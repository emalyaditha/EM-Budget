// GENERATED — do not edit by hand.
// Produced by `node parity/generate_theme.cjs` from `parity/ui-tokens.json`, the
// Chrome-computed measurement of `src/index.css` at tag `pre-flutter`, with the
// curated token lists and phone markers of `parity/UI_SPEC.md` §2.1–§4.
// Every value below is the measurement; UI_SPEC §5 (whose machine "Dart" column
// mis-parses --blur-* / --container-* names as radii) is deliberately not used.

/// Spacing tokens from UI_SPEC §2.3. `rem` is converted to px at a 16px root
/// font size — the root size of the measurement environment. Tailwind composes
/// every spacing utility as `calc(<n> * --spacing)`, so `scale(n)` is that same
/// multiplication and adds no new design value.
abstract final class AppSpacing {
  /// `--spacing` — `0.25rem` = 4.0px at the 16px root font size.
  static const double spacing = 4.0;

  /// Tailwind spacing utilities are multiples of `--spacing`; this is that math.
  static double scale(double multiplier) => multiplier * spacing;

  /// `--container-*` (§2.3): content max-widths / breakpoints in px, rem
  /// converted at 16px. These are lengths, NOT corner radii — the machine
  /// "Dart" column of UI_SPEC §5 printed them as `Radius.circular(...)`
  /// because it parsed the token NAME, and that column is not used here.
  static const Map<String, double> containersByToken = <String, double>{
    '--container-2xl': 672.0,
    '--container-3xl': 768.0,
    '--container-lg': 512.0,
    '--container-md': 448.0,
    '--container-sm': 384.0,
    '--container-xl': 576.0,
    '--container-xs': 320.0,
  };

  /// The spacing base keyed by its CSS token name.
  static const Map<String, double> spacingByToken = <String, double>{
    '--spacing': 4.0,
  };
}
