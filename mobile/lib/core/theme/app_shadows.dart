// GENERATED — do not edit by hand.
// Produced by `node parity/generate_theme.cjs` from `parity/ui-tokens.json`, the
// Chrome-computed measurement of `src/index.css` at tag `pre-flutter`, with the
// curated token lists and phone markers of `parity/UI_SPEC.md` §2.1–§4.
// Every value below is the measurement; UI_SPEC §5 (whose machine "Dart" column
// mis-parses --blur-* / --container-* names as radii) is deliberately not used.

import 'package:flutter/material.dart';

/// The shadow tokens of UI_SPEC §2.2. Each layer measured as
/// `offset-x offset-y blur-radius rgba(r, g, b, a)`; the resolved rgba is used
/// whole (colour AND alpha) exactly as the note under §2.2 requires — not
/// composed over the surface underneath. CSS blur radius is carried as Flutter
/// blurRadius unchanged; spread is 0 wherever none was measured.
abstract final class AppShadows {
  /// `--shadow` (UI_SPEC §2.2).
  /// light `0 1px 2px rgba(13, 22, 36, 0.05), 0 8px 26px rgba(13, 22, 36, 0.06)`.
  /// dark  `0 1px 0 rgba(255, 255, 255, 0.07), 0 2px 6px rgba(0, 0, 0, 0.35), 0 10px 30px rgba(0, 0, 0, 0.32)`.
  static const List<BoxShadow> shadowLight = <BoxShadow>[
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
  ];
  static const List<BoxShadow> shadowDark = <BoxShadow>[
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
  ];

  /// `--shadow-float` (UI_SPEC §2.2).
  /// light `0 2px 6px rgba(13, 22, 36, 0.07), 0 22px 52px rgba(13, 22, 36, 0.16)`.
  /// dark  `0 1px 0 rgba(255, 255, 255, 0.07), 0 8px 20px rgba(0, 0, 0, 0.45), 0 28px 70px rgba(0, 0, 0, 0.55)`.
  static const List<BoxShadow> shadowFloatLight = <BoxShadow>[
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
  ];
  static const List<BoxShadow> shadowFloatDark = <BoxShadow>[
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
  ];

  /// `--shadow-hover` (UI_SPEC §2.2).
  /// light `0 1px 2px rgba(13, 22, 36, 0.06), 0 14px 38px rgba(13, 22, 36, 0.1)`.
  /// dark  `0 1px 0 rgba(255, 255, 255, 0.07), 0 4px 10px rgba(0, 0, 0, 0.4), 0 18px 44px rgba(0, 0, 0, 0.42)`.
  static const List<BoxShadow> shadowHoverLight = <BoxShadow>[
    BoxShadow(
      color: Color.fromRGBO(13, 22, 36, 0.06),
      offset: Offset(0.0, 1.0),
      blurRadius: 2.0,
    ),
    BoxShadow(
      color: Color.fromRGBO(13, 22, 36, 0.1),
      offset: Offset(0.0, 14.0),
      blurRadius: 38.0,
    ),
  ];
  static const List<BoxShadow> shadowHoverDark = <BoxShadow>[
    BoxShadow(
      color: Color.fromRGBO(255, 255, 255, 0.07),
      offset: Offset(0.0, 1.0),
      blurRadius: 0.0,
    ),
    BoxShadow(
      color: Color.fromRGBO(0, 0, 0, 0.4),
      offset: Offset(0.0, 4.0),
      blurRadius: 10.0,
    ),
    BoxShadow(
      color: Color.fromRGBO(0, 0, 0, 0.42),
      offset: Offset(0.0, 18.0),
      blurRadius: 44.0,
    ),
  ];

  /// The shadow tokens per CSS name — light pass.
  static const Map<String, List<BoxShadow>> shadowsLight =
      <String, List<BoxShadow>>{
        '--shadow': shadowLight,
        '--shadow-float': shadowFloatLight,
        '--shadow-hover': shadowHoverLight,
      };

  /// The shadow tokens per CSS name — dark pass.
  static const Map<String, List<BoxShadow>> shadowsDark =
      <String, List<BoxShadow>>{
        '--shadow': shadowDark,
        '--shadow-float': shadowFloatDark,
        '--shadow-hover': shadowHoverDark,
      };

  /// The §2.2 split this generator emits: 17 gradients (in
  /// AppColors) and these 3 shadow tokens.
}
