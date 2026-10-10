// GENERATED — do not edit by hand.
// Produced by `node parity/generate_theme.cjs` from `parity/ui-tokens.json`, the
// Chrome-computed measurement of `src/index.css` at tag `pre-flutter`, with the
// curated token lists and phone markers of `parity/UI_SPEC.md` §2.1–§4.
// Every value below is the measurement; UI_SPEC §5 (whose machine "Dart" column
// mis-parses --blur-* / --container-* names as radii) is deliberately not used.

import 'package:flutter/material.dart';

/// One UI_SPEC §6 component class resolved for one brightness: what a detached
/// element carrying that CSS class was measured to paint. `AppCard` renders these;
/// a screen widget must not restate any of it. Every value is a §6 probe row of
/// `parity/ui-tokens.json` — not UI_SPEC §5, and never a Material default.
///
/// Conventions the measurement forces:
/// * `fillGradient == null` with a zero-alpha `fillColor` is UI_SPEC `(none)`: the
///   class paints no background of its own and the surface behind shows through.
/// * A zero-alpha `borderColor` is a *transparent* border, not an absent one —
///   `.card-flat` carries a real 1px frame of `rgba(0,0,0,0)` that occupies layout.
///   Where the measured width is 0px the printed colour is whatever the element
///   inherited, which is why `.card-lg` and `.card-face` name an ink border they
///   never draw.
/// * `blurPx` is the measured CSS blur; Flutter renders it as
///   `ImageFilter.blur(sigmaX: blurPx / 2, sigmaY: blurPx / 2)`. The CSS
///   `saturate(1.4)` has no Flutter equivalent, so it travels here as data and is
///   unimplemented — recorded rather than silently dropped.
/// * `.gradient-card` measures transparent in the dark pass: the `!important`
///   repaint layer of §6.3 forces the gradient on the light theme only. That is
///   the web app’s behaviour, ported as measured on the D16 bug-compatible
///   precedent rather than “fixed”.
class AppSurfaceSpec {
  const AppSurfaceSpec({
    required this.cssClass,
    required this.radiusPx,
    required this.borderWidthPx,
    required this.borderColor,
    required this.fillColor,
    required this.fillGradient,
    required this.shadows,
    required this.blurPx,
    required this.saturate,
    required this.paddingPx,
    required this.textColor,
  });

  /// The CSS class this row was measured from.
  final String cssClass;
  final double radiusPx;

  /// Measured on one side; `src/index.css` authors every one of these classes as
  /// `border: 1px solid …`, i.e. uniform, and [border] reproduces that box.
  final double borderWidthPx;
  final Color borderColor;
  final Color fillColor;
  final LinearGradient? fillGradient;
  final List<BoxShadow>? shadows;

  /// `backdrop-filter` blur in measured CSS px; the sigma is `blurPx / 2`.
  final double? blurPx;
  final double? saturate;

  /// The class’s own padding. `.card` measures `0px` because on the web the
  /// utilities (`p-4`, `p-5`, `p-6`) supply it, so `AppCard` takes padding as a
  /// parameter and `AppSpacing.scale(n)` is that same utility multiplication.
  final double paddingPx;

  /// The text colour the class paints, which is not always the inherited one:
  /// `.card-face` and `.card-dark` force white.
  final Color textColor;

  BorderRadius get borderRadius => BorderRadius.circular(radiusPx);

  Border get border => Border.all(color: borderColor, width: borderWidthPx);

  List<BoxShadow> get boxShadowList => shadows ?? const <BoxShadow>[];

  /// UI_SPEC `(none)`: paints nothing of its own behind the content.
  bool get paintsFill =>
      fillGradient != null || fillColor != const Color(0x00000000);

  double? get blurSigma => blurPx == null ? null : blurPx! / 2;
}

/// The §6 card surfaces, keyed by CSS class — one map per measured brightness pass.
abstract final class AppSurfaces {
  /// Light pass (UI_SPEC §6.1–§6.2, `light-desktop`).
  static const Map<String, AppSurfaceSpec> light = <String, AppSurfaceSpec>{
    '.card': AppSurfaceSpec(
      cssClass: '.card',
      radiusPx: 24.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(216, 223, 230, 1.0),
      fillColor: Color.fromRGBO(252, 254, 255, 1.0),
      fillGradient: null,
      shadows: <BoxShadow>[
        BoxShadow(
          color: Color.fromRGBO(13, 22, 36, 0.05),
          offset: Offset(0.0, 1.0),
          blurRadius: 2.0,
        ),
        BoxShadow(
          color: Color.fromRGBO(13, 22, 36, 0.06),
          offset: Offset(0.0, 8.0),
          blurRadius: 26.0,
        ),
      ],
      blurPx: null,
      saturate: null,
      paddingPx: 0.0,
      textColor: Color.fromRGBO(13, 22, 36, 1.0),
    ),
    '.card-flat': AppSurfaceSpec(
      cssClass: '.card-flat',
      radiusPx: 14.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(0, 0, 0, 0.0),
      fillColor: Color.fromRGBO(235, 241, 247, 1.0),
      fillGradient: null,
      shadows: null,
      blurPx: null,
      saturate: null,
      paddingPx: 0.0,
      textColor: Color.fromRGBO(13, 22, 36, 1.0),
    ),
    '.card-lg': AppSurfaceSpec(
      cssClass: '.card-lg',
      radiusPx: 32.0,
      borderWidthPx: 0.0,
      borderColor: Color.fromRGBO(13, 22, 36, 1.0),
      fillColor: Color.fromRGBO(0, 0, 0, 0.0),
      fillGradient: null,
      shadows: null,
      blurPx: null,
      saturate: null,
      paddingPx: 0.0,
      textColor: Color.fromRGBO(13, 22, 36, 1.0),
    ),
    '.card-dark': AppSurfaceSpec(
      cssClass: '.card-dark',
      radiusPx: 24.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(216, 223, 230, 1.0),
      fillColor: Color.fromRGBO(0, 0, 0, 0.0),
      fillGradient: LinearGradient(
        begin: Alignment(-0.20116376127, -1.140856382056),
        end: Alignment(0.20116376127, 1.140856382056),
        colors: <Color>[
          Color.fromRGBO(252, 254, 255, 1.0),
          Color.fromRGBO(235, 241, 247, 1.0),
        ],
        stops: <double>[0.0, 1.0],
      ),
      shadows: null,
      blurPx: null,
      saturate: null,
      paddingPx: 0.0,
      textColor: Color.fromRGBO(13, 22, 36, 1.0),
    ),
    '.gradient-card': AppSurfaceSpec(
      cssClass: '.gradient-card',
      radiusPx: 24.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(216, 223, 230, 1.0),
      fillColor: Color.fromRGBO(0, 0, 0, 0.0),
      fillGradient: LinearGradient(
        begin: Alignment(-0.20116376127, -1.140856382056),
        end: Alignment(0.20116376127, 1.140856382056),
        colors: <Color>[
          Color.fromRGBO(252, 254, 255, 1.0),
          Color.fromRGBO(235, 241, 247, 1.0),
        ],
        stops: <double>[0.0, 1.0],
      ),
      shadows: null,
      blurPx: null,
      saturate: null,
      paddingPx: 0.0,
      textColor: Color.fromRGBO(13, 22, 36, 1.0),
    ),
    '.glass-panel': AppSurfaceSpec(
      cssClass: '.glass-panel',
      radiusPx: 24.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(216, 223, 230, 1.0),
      fillColor: Color.fromRGBO(252, 254, 255, 0.62),
      fillGradient: null,
      shadows: <BoxShadow>[
        BoxShadow(
          color: Color.fromRGBO(13, 22, 36, 0.05),
          offset: Offset(0.0, 1.0),
          blurRadius: 2.0,
        ),
        BoxShadow(
          color: Color.fromRGBO(13, 22, 36, 0.06),
          offset: Offset(0.0, 8.0),
          blurRadius: 26.0,
        ),
      ],
      blurPx: 22.0,
      saturate: 1.4,
      paddingPx: 0.0,
      textColor: Color.fromRGBO(13, 22, 36, 1.0),
    ),
    '.glass-pill': AppSurfaceSpec(
      cssClass: '.glass-pill',
      radiusPx: 999.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(216, 223, 230, 1.0),
      fillColor: Color.fromRGBO(235, 241, 247, 0.62),
      fillGradient: null,
      shadows: null,
      blurPx: 14.0,
      saturate: 1.4,
      paddingPx: 5.0,
      textColor: Color.fromRGBO(13, 22, 36, 1.0),
    ),
    '.card-face': AppSurfaceSpec(
      cssClass: '.card-face',
      radiusPx: 24.0,
      borderWidthPx: 0.0,
      borderColor: Color.fromRGBO(255, 255, 255, 1.0),
      fillColor: Color.fromRGBO(0, 0, 0, 0.0),
      fillGradient: null,
      shadows: <BoxShadow>[
        BoxShadow(
          color: Color.fromRGBO(13, 22, 36, 0.07),
          offset: Offset(0.0, 2.0),
          blurRadius: 6.0,
        ),
        BoxShadow(
          color: Color.fromRGBO(13, 22, 36, 0.16),
          offset: Offset(0.0, 22.0),
          blurRadius: 52.0,
        ),
      ],
      blurPx: null,
      saturate: null,
      paddingPx: 0.0,
      textColor: Color.fromRGBO(255, 255, 255, 1.0),
    ),
  };

  /// Dark pass (UI_SPEC §6.1–§6.2, `dark-desktop`).
  static const Map<String, AppSurfaceSpec> dark = <String, AppSurfaceSpec>{
    '.card': AppSurfaceSpec(
      cssClass: '.card',
      radiusPx: 24.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(33, 40, 51, 1.0),
      fillColor: Color.fromRGBO(15, 21, 31, 1.0),
      fillGradient: null,
      shadows: <BoxShadow>[
        BoxShadow(
          color: Color.fromRGBO(255, 255, 255, 0.07),
          offset: Offset(0.0, 1.0),
          blurRadius: 0.0,
        ),
        BoxShadow(
          color: Color.fromRGBO(0, 0, 0, 0.35),
          offset: Offset(0.0, 2.0),
          blurRadius: 6.0,
        ),
        BoxShadow(
          color: Color.fromRGBO(0, 0, 0, 0.32),
          offset: Offset(0.0, 10.0),
          blurRadius: 30.0,
        ),
      ],
      blurPx: null,
      saturate: null,
      paddingPx: 0.0,
      textColor: Color.fromRGBO(247, 248, 251, 1.0),
    ),
    '.card-flat': AppSurfaceSpec(
      cssClass: '.card-flat',
      radiusPx: 14.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(0, 0, 0, 0.0),
      fillColor: Color.fromRGBO(24, 32, 43, 1.0),
      fillGradient: null,
      shadows: null,
      blurPx: null,
      saturate: null,
      paddingPx: 0.0,
      textColor: Color.fromRGBO(247, 248, 251, 1.0),
    ),
    '.card-lg': AppSurfaceSpec(
      cssClass: '.card-lg',
      radiusPx: 32.0,
      borderWidthPx: 0.0,
      borderColor: Color.fromRGBO(247, 248, 251, 1.0),
      fillColor: Color.fromRGBO(0, 0, 0, 0.0),
      fillGradient: null,
      shadows: null,
      blurPx: null,
      saturate: null,
      paddingPx: 0.0,
      textColor: Color.fromRGBO(247, 248, 251, 1.0),
    ),
    '.card-dark': AppSurfaceSpec(
      cssClass: '.card-dark',
      radiusPx: 24.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(33, 40, 51, 1.0),
      fillColor: Color.fromRGBO(0, 0, 0, 0.0),
      fillGradient: LinearGradient(
        begin: Alignment(-0.20116376127, -1.140856382056),
        end: Alignment(0.20116376127, 1.140856382056),
        colors: <Color>[
          Color.fromRGBO(24, 32, 43, 1.0),
          Color.fromRGBO(15, 21, 31, 1.0),
        ],
        stops: <double>[0.0, 1.0],
      ),
      shadows: null,
      blurPx: null,
      saturate: null,
      paddingPx: 0.0,
      textColor: Color.fromRGBO(255, 255, 255, 1.0),
    ),
    '.gradient-card': AppSurfaceSpec(
      cssClass: '.gradient-card',
      radiusPx: 24.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(33, 40, 51, 1.0),
      fillColor: Color.fromRGBO(0, 0, 0, 0.0),
      fillGradient: null,
      shadows: null,
      blurPx: null,
      saturate: null,
      paddingPx: 0.0,
      textColor: Color.fromRGBO(255, 255, 255, 1.0),
    ),
    '.glass-panel': AppSurfaceSpec(
      cssClass: '.glass-panel',
      radiusPx: 24.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(33, 40, 51, 1.0),
      fillColor: Color.fromRGBO(15, 21, 31, 0.62),
      fillGradient: null,
      shadows: <BoxShadow>[
        BoxShadow(
          color: Color.fromRGBO(255, 255, 255, 0.07),
          offset: Offset(0.0, 1.0),
          blurRadius: 0.0,
        ),
        BoxShadow(
          color: Color.fromRGBO(0, 0, 0, 0.35),
          offset: Offset(0.0, 2.0),
          blurRadius: 6.0,
        ),
        BoxShadow(
          color: Color.fromRGBO(0, 0, 0, 0.32),
          offset: Offset(0.0, 10.0),
          blurRadius: 30.0,
        ),
      ],
      blurPx: 22.0,
      saturate: 1.4,
      paddingPx: 0.0,
      textColor: Color.fromRGBO(247, 248, 251, 1.0),
    ),
    '.glass-pill': AppSurfaceSpec(
      cssClass: '.glass-pill',
      radiusPx: 999.0,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(33, 40, 51, 1.0),
      fillColor: Color.fromRGBO(24, 32, 43, 0.62),
      fillGradient: null,
      shadows: null,
      blurPx: 14.0,
      saturate: 1.4,
      paddingPx: 5.0,
      textColor: Color.fromRGBO(247, 248, 251, 1.0),
    ),
    '.card-face': AppSurfaceSpec(
      cssClass: '.card-face',
      radiusPx: 24.0,
      borderWidthPx: 0.0,
      borderColor: Color.fromRGBO(255, 255, 255, 1.0),
      fillColor: Color.fromRGBO(0, 0, 0, 0.0),
      fillGradient: null,
      shadows: <BoxShadow>[
        BoxShadow(
          color: Color.fromRGBO(255, 255, 255, 0.07),
          offset: Offset(0.0, 1.0),
          blurRadius: 0.0,
        ),
        BoxShadow(
          color: Color.fromRGBO(0, 0, 0, 0.45),
          offset: Offset(0.0, 8.0),
          blurRadius: 20.0,
        ),
        BoxShadow(
          color: Color.fromRGBO(0, 0, 0, 0.55),
          offset: Offset(0.0, 28.0),
          blurRadius: 70.0,
        ),
      ],
      blurPx: null,
      saturate: null,
      paddingPx: 0.0,
      textColor: Color.fromRGBO(255, 255, 255, 1.0),
    ),
  };

  /// The measured surface for a class and brightness. An unknown class is a
  /// programming error, not a fallback: nothing in this layer may quietly
  /// become a Material default.
  static AppSurfaceSpec resolve(String cssClass, Brightness brightness) {
    final Map<String, AppSurfaceSpec> table = brightness == Brightness.dark
        ? dark
        : light;
    final AppSurfaceSpec? spec = table[cssClass];
    if (spec == null) throw ArgumentError('$cssClass is not a §6 surface');
    return spec;
  }
}
