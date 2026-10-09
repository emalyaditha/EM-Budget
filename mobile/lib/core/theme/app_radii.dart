// GENERATED — do not edit by hand.
// Produced by `node parity/generate_theme.cjs` from `parity/ui-tokens.json`, the
// Chrome-computed measurement of `src/index.css` at tag `pre-flutter`, with the
// curated token lists and phone markers of `parity/UI_SPEC.md` §2.1–§4.
// Every value below is the measurement; UI_SPEC §5 (whose machine "Dart" column
// mis-parses --blur-* / --container-* names as radii) is deliberately not used.

import 'package:flutter/material.dart';

/// Corner-radius tokens from UI_SPEC §2.3 — the app's own `--r-*` set and
/// Tailwind's `--radius-*` set — in px (`rem` converted at the 16px root font
/// size). Blur tokens are NOT here: `--blur-*` feeds a filter sigma, not a
/// corner. `byToken` keys each value by its CSS name; the BorderRadius
/// conveniences are the same numbers, not new ones.
abstract final class AppRadii {
  /// `--r-lg` — `32px`.
  static const double rLg = 32.0;

  /// `--r-md` — `24px`.
  static const double rMd = 24.0;

  /// `--r-sm` — `14px`.
  static const double rSm = 14.0;

  /// `--r-xl` — `40px`.
  static const double rXl = 40.0;

  /// `--r-xs` — `10px`.
  static const double rXs = 10.0;

  /// `--radius-2xl` — `1rem`.
  static const double radius2xl = 16.0;

  /// `--radius-lg` — `0.5rem`.
  static const double radiusLg = 8.0;

  /// `--radius-md` — `0.375rem`.
  static const double radiusMd = 6.0;

  /// `--radius-xl` — `0.75rem`.
  static const double radiusXl = 12.0;

  /// Every radius token in px, keyed by its CSS custom property name.
  static const Map<String, double> byToken = <String, double>{
    '--r-lg': 32.0,
    '--r-md': 24.0,
    '--r-sm': 14.0,
    '--r-xl': 40.0,
    '--r-xs': 10.0,
    '--radius-2xl': 16.0,
    '--radius-lg': 8.0,
    '--radius-md': 6.0,
    '--radius-xl': 12.0,
  };

  /// The two app card sizes as BorderRadius — convenience over the constants above.
  static const BorderRadius cardRadius = BorderRadius.all(Radius.circular(rSm));
  static const BorderRadius panelRadius = BorderRadius.all(
    Radius.circular(rMd),
  );
}
