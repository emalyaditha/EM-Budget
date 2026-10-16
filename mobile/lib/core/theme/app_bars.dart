// GENERATED — do not edit by hand.
// Produced by `node parity/generate_theme.cjs` from `parity/ui-tokens.json`, the
// Chrome-computed measurement of `src/index.css` at tag `pre-flutter`, with the
// curated token lists and phone markers of `parity/UI_SPEC.md` §2.1–§4.
// Every value below is the measurement; UI_SPEC §5 (whose machine "Dart" column
// mis-parses --blur-* / --container-* names as radii) is deliberately not used.

import 'package:flutter/material.dart';

/// One §6 progress-bar class, measured on a detached element carrying it.
/// The five pastels author a flat colour and nothing else: size and
/// rounding at the call site are Tailwind utilities, so the row’s
/// `radiusPx` is the measured `0px` and `heightPx` is `null` — the caller’s
/// own geometry, never a default invented here.
///
/// `.rainbow-bar` is the one class that brings its own box: 3px tall,
/// fully round, painted with the measured `--rainbow` gradient (lavender →
/// blue at 45% → transparent), which was cross-checked against the §2.2
/// gradient token’s measured substitution, per pass.
class AppBarSpec {
  const AppBarSpec({
    required this.cssClass,
    required this.displayCss,
    required this.radiusPx,
    required this.fillColor,
    required this.fillGradient,
    required this.heightPx,
  });

  final String cssClass;

  /// The computed `display` — `block` on every bar; carried as data.
  final String displayCss;
  final double radiusPx;

  /// Exactly one of these two is non-null, because the probe is either a
  /// flat colour or a gradient, never both.
  final Color? fillColor;
  final LinearGradient? fillGradient;

  /// Authored height — 3px for `.rainbow-bar`, `null` for the pastels,
  /// which author none.
  final double? heightPx;

  BorderRadius get borderRadius => BorderRadius.circular(radiusPx);
}

/// The §6 bar rows, keyed by CSS class — one map per measured pass.
abstract final class AppBars {
  /// light pass (UI_SPEC §6, `light-desktop`).
  static const Map<String, AppBarSpec> light = <String, AppBarSpec>{
    '.bar-pink': AppBarSpec(
      cssClass: '.bar-pink',
      displayCss: 'block',
      radiusPx: 0.0,
      fillColor: Color.fromRGBO(239, 172, 181, 1.0),
      fillGradient: null,
      heightPx: null,
    ),
    '.bar-mint': AppBarSpec(
      cssClass: '.bar-mint',
      displayCss: 'block',
      radiusPx: 0.0,
      fillColor: Color.fromRGBO(188, 231, 202, 1.0),
      fillGradient: null,
      heightPx: null,
    ),
    '.bar-yellow': AppBarSpec(
      cssClass: '.bar-yellow',
      displayCss: 'block',
      radiusPx: 0.0,
      fillColor: Color.fromRGBO(242, 225, 165, 1.0),
      fillGradient: null,
      heightPx: null,
    ),
    '.bar-lavender': AppBarSpec(
      cssClass: '.bar-lavender',
      displayCss: 'block',
      radiusPx: 0.0,
      fillColor: Color.fromRGBO(195, 195, 238, 1.0),
      fillGradient: null,
      heightPx: null,
    ),
    '.bar-blue': AppBarSpec(
      cssClass: '.bar-blue',
      displayCss: 'block',
      radiusPx: 0.0,
      fillColor: Color.fromRGBO(168, 209, 238, 1.0),
      fillGradient: null,
      heightPx: null,
    ),
    '.rainbow-bar': AppBarSpec(
      cssClass: '.rainbow-bar',
      displayCss: 'block',
      radiusPx: 999.0,
      fillColor: null,
      fillGradient: LinearGradient(
        begin: Alignment(-1.0, 0.0),
        end: Alignment(1.0, 0.0),
        colors: <Color>[
          Color.fromRGBO(195, 195, 238, 1.0),
          Color.fromRGBO(168, 209, 238, 1.0),
          Color.fromRGBO(0, 0, 0, 0.0),
        ],
        stops: <double>[0.0, 0.45, 1.0],
      ),
      heightPx: 3.0,
    ),
  };

  /// dark pass (UI_SPEC §6, `dark-desktop`).
  static const Map<String, AppBarSpec> dark = <String, AppBarSpec>{
    '.bar-pink': AppBarSpec(
      cssClass: '.bar-pink',
      displayCss: 'block',
      radiusPx: 0.0,
      fillColor: Color.fromRGBO(244, 153, 167, 1.0),
      fillGradient: null,
      heightPx: null,
    ),
    '.bar-mint': AppBarSpec(
      cssClass: '.bar-mint',
      displayCss: 'block',
      radiusPx: 0.0,
      fillColor: Color.fromRGBO(155, 220, 177, 1.0),
      fillGradient: null,
      heightPx: null,
    ),
    '.bar-yellow': AppBarSpec(
      cssClass: '.bar-yellow',
      displayCss: 'block',
      radiusPx: 0.0,
      fillColor: Color.fromRGBO(231, 209, 122, 1.0),
      fillGradient: null,
      heightPx: null,
    ),
    '.bar-lavender': AppBarSpec(
      cssClass: '.bar-lavender',
      displayCss: 'block',
      radiusPx: 0.0,
      fillColor: Color.fromRGBO(177, 176, 239, 1.0),
      fillGradient: null,
      heightPx: null,
    ),
    '.bar-blue': AppBarSpec(
      cssClass: '.bar-blue',
      displayCss: 'block',
      radiusPx: 0.0,
      fillColor: Color.fromRGBO(129, 191, 235, 1.0),
      fillGradient: null,
      heightPx: null,
    ),
    '.rainbow-bar': AppBarSpec(
      cssClass: '.rainbow-bar',
      displayCss: 'block',
      radiusPx: 999.0,
      fillColor: null,
      fillGradient: LinearGradient(
        begin: Alignment(-1.0, 0.0),
        end: Alignment(1.0, 0.0),
        colors: <Color>[
          Color.fromRGBO(177, 176, 239, 1.0),
          Color.fromRGBO(129, 191, 235, 1.0),
          Color.fromRGBO(0, 0, 0, 0.0),
        ],
        stops: <double>[0.0, 0.45, 1.0],
      ),
      heightPx: 3.0,
    ),
  };

  /// Sources: every rule is a one-or-three-declaration authored rule;
  /// (.bar-pink @ src/index.css:962; .bar-mint @ src/index.css:965; .bar-yellow @ src/index.css:968; .bar-lavender @ src/index.css:971; .bar-blue @ src/index.css:974; .rainbow-bar @ src/index.css:948).
  ///
  /// The measured rows for a class and brightness. An unknown class is a
  /// programming error, not a fallback.
  static AppBarSpec resolve(String cssClass, Brightness brightness) {
    final Map<String, AppBarSpec> table = brightness == Brightness.dark
        ? dark
        : light;
    final AppBarSpec? spec = table[cssClass];
    if (spec == null) throw ArgumentError('$cssClass is not a §6 bar class');
    return spec;
  }
}
