// GENERATED — do not edit by hand.
// Produced by `node parity/generate_theme.cjs` from `parity/ui-tokens.json`, the
// Chrome-computed measurement of `src/index.css` at tag `pre-flutter`, with the
// curated token lists and phone markers of `parity/UI_SPEC.md` §2.1–§4.
// Every value below is the measurement; UI_SPEC §5 (whose machine "Dart" column
// mis-parses --blur-* / --container-* names as radii) is deliberately not used.

import 'package:flutter/material.dart';

/// The §6 icon-button rows: the standalone header-chrome pill, measured at
/// rest by the §6 probe with its size read from the same pinned
/// `src/index.css` rule, and the `.glass-pill .icon-btn` header context,
/// composed from that probe and the descendant rule that refines it.
/// A widget under `lib/presentation/` restates none of it.
///
/// `.icon-btn` is filled with `color-mix(… 70%, transparent)` and blurs
/// `backdrop-filter: blur(10px)`, so its fill is genuinely translucent:
/// [fillColor] carries that alpha rather than being flattened to an opaque
/// colour, and [blurSigmaPx] is the port’s own blur mapping (CSS blur radius
/// halved), the same one [AppSurfaceSpec] uses.
class AppIconButtonSpec {
  const AppIconButtonSpec({
    required this.cssClass,
    required this.displayCss,
    required this.sizePx,
    required this.radiusPx,
    required this.borderWidthPx,
    required this.borderColor,
    required this.fillColor,
    required this.iconColor,
    required this.paddingPx,
    required this.blurPx,
    required this.blurSaturate,
  });

  /// The CSS class this row was measured from.
  final String cssClass;

  /// The computed `display`. Carried as data, not applied: the pill centres its
  /// icon, which in Flutter is [AppIconButton]’s own `Alignment.center`.
  final String displayCss;

  /// The authored `width`/`height` of the square pill — the resting rule for
  /// `.icon-btn`, the descendant rule for the header-pill context.
  final double sizePx;
  final double radiusPx;

  /// Measured on one side; the class authors `border: 1px solid …`, i.e. uniform,
  /// and [border] reproduces that ring. In the pill context the colour is
  /// `transparent`: the frame still occupies its 1px of layout, it just paints
  /// nothing — what §6 calls a transparent border, not a missing one.
  final double borderWidthPx;
  final Color borderColor;

  /// The `color-mix(… 70%, transparent)` fill — translucent, as measured. The
  /// pill-context row authors `background: transparent` instead: the header
  /// pill behind it is the frost, the icon adds no fill of its own.
  final Color fillColor;

  /// The icon colour (`color: var(--ink-2)`), which the SVG inherits on the web
  /// and the widget hands to its child through an IconTheme.
  final Color iconColor;
  final double paddingPx;

  /// The `backdrop-filter` blur radius, in measured CSS px.
  final double blurPx;

  /// The `saturate()` the same filter would carry — `null` for `.icon-btn`,
  /// which blurs alone. Recorded so the absence is measured, not a guess.
  final double? blurSaturate;

  BorderRadius get borderRadius => BorderRadius.circular(radiusPx);

  Border get border => Border.all(color: borderColor, width: borderWidthPx);

  /// CSS blur radius → Flutter sigma, the port’s fixed mapping (see
  /// [AppSurfaceSpec.blurSigma]). Not a number a widget chose.
  double get blurSigmaPx => blurPx / 2;

  Size get size => Size(sizePx, sizePx);
}

/// The §6 icon buttons, keyed by CSS class — one map per measured pass.
abstract final class AppIconButtons {
  /// light pass (UI_SPEC §6, `light-desktop`; sizes from the rules that author them).
  static const Map<String, AppIconButtonSpec> light =
      <String, AppIconButtonSpec>{
        '.icon-btn': AppIconButtonSpec(
          cssClass: '.icon-btn',
          displayCss: 'inline-flex',
          sizePx: 38.0,
          radiusPx: 999.0,
          borderWidthPx: 1.0,
          borderColor: Color.fromRGBO(216, 223, 230, 1.0),
          fillColor: Color.fromRGBO(235, 241, 247, 0.7),
          iconColor: Color.fromRGBO(73, 86, 105, 1.0),
          paddingPx: 0.0,
          blurPx: 10.0,
          blurSaturate: null,
        ),
        '.glass-pill .icon-btn': AppIconButtonSpec(
          cssClass: '.glass-pill .icon-btn',
          displayCss: 'inline-flex',
          sizePx: 34.0,
          radiusPx: 999.0,
          borderWidthPx: 1.0,
          borderColor: Color.fromRGBO(0, 0, 0, 0.0),
          fillColor: Color.fromRGBO(0, 0, 0, 0.0),
          iconColor: Color.fromRGBO(73, 86, 105, 1.0),
          paddingPx: 0.0,
          blurPx: 10.0,
          blurSaturate: null,
        ),
      };

  /// dark pass (UI_SPEC §6, `dark-desktop`; sizes from the rules that author them).
  static const Map<String, AppIconButtonSpec> dark =
      <String, AppIconButtonSpec>{
        '.icon-btn': AppIconButtonSpec(
          cssClass: '.icon-btn',
          displayCss: 'inline-flex',
          sizePx: 38.0,
          radiusPx: 999.0,
          borderWidthPx: 1.0,
          borderColor: Color.fromRGBO(33, 40, 51, 1.0),
          fillColor: Color.fromRGBO(24, 32, 43, 0.7),
          iconColor: Color.fromRGBO(162, 172, 185, 1.0),
          paddingPx: 0.0,
          blurPx: 10.0,
          blurSaturate: null,
        ),
        '.glass-pill .icon-btn': AppIconButtonSpec(
          cssClass: '.glass-pill .icon-btn',
          displayCss: 'inline-flex',
          sizePx: 34.0,
          radiusPx: 999.0,
          borderWidthPx: 1.0,
          borderColor: Color.fromRGBO(0, 0, 0, 0.0),
          fillColor: Color.fromRGBO(0, 0, 0, 0.0),
          iconColor: Color.fromRGBO(162, 172, 185, 1.0),
          paddingPx: 0.0,
          blurPx: 10.0,
          blurSaturate: null,
        ),
      };

  /// The rules the port does NOT reproduce, printed once because both passes
  /// author them identically:
  /// `.icon-btn:hover` at src/index.css:716 — dropped per UI_SPEC D-U1;

  /// `.glass-pill .icon-btn:hover` at src/index.css:743 — dropped per UI_SPEC D-U1;

  /// `.icon-btn` authors no `:active`/`:disabled`, so there is no press state or
  /// clock here — unlike AppControls, which has both.

  /// The `.glass-pill .icon-btn` row is composed, not probed: the descendant
  /// rule at src/index.css:737 authors exactly four literals — 34px width and
  /// height, `background: transparent`, `border-color: transparent` — and every
  /// other field is the standalone measurement it refines. §6’s column
  /// conventions keep the transparent frame occupying its 1px of layout and the
  /// untouched `backdrop-filter` blurring, so the pill-context icon frosts
  /// without filling; its `:hover` is paint-only and dropped per D-U1, asserted
  /// by the generator rather than trusted.

  /// The measured pill for a class and brightness. An unknown class is a
  /// programming error, not a fallback: nothing in this layer may quietly
  /// become a Material default.
  static AppIconButtonSpec resolve(String cssClass, Brightness brightness) {
    final Map<String, AppIconButtonSpec> table = brightness == Brightness.dark
        ? dark
        : light;
    final AppIconButtonSpec? spec = table[cssClass];
    if (spec == null) throw ArgumentError('$cssClass is not a §6 icon button');
    return spec;
  }
}
