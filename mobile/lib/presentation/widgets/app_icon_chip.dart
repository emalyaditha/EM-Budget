import 'package:flutter/material.dart';

import '../../core/theme/app_chips.dart';

/// The §6 icon chip of the design system, painted from the UI_SPEC measurement
/// of `.icon-chip`: no size, corner, border, fill, ink or padding appears here
/// as a number, and nothing falls back to a Material default.
///
/// `.icon-chip` is the 40×40 circle the chrome rows put glyphs in. It authors
/// no type (the measured 16px/400 row is body inheritance, which the drift test
/// records as exactly that) and no icon size: the glyph arrives through an
/// [IconTheme] carrying the class's measured ink, the same way the SVG inherits
/// `color: var(--ink-2)` on the web.
///
/// There is no press or disabled paint: the class authors no `:active` and no
/// `:disabled` (the drift test pins which chip classes do), so a `null`
/// [onPressed] removes the action without changing the picture.
class AppIconChip extends StatelessWidget {
  const AppIconChip({required this.child, super.key, this.onPressed});

  /// The glyph to centre in the chip — usually an [Icon].
  final Widget child;

  /// `null` leaves the chip inert; the class describes no disabled look.
  final VoidCallback? onPressed;

  static const String _cssClass = '.icon-chip';

  @override
  Widget build(BuildContext context) {
    final AppChipSpec spec = AppChips.resolve(
      _cssClass,
      Theme.of(context).brightness,
    );
    return Semantics(
      button: onPressed != null,
      enabled: onPressed != null,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onPressed,
        child: SizedBox(
          width: spec.sizePx,
          height: spec.sizePx,
          child: Container(
            alignment: Alignment.center,
            padding: spec.padding,
            decoration: BoxDecoration(
              color: spec.fillColor,
              border: spec.border,
              borderRadius: spec.borderRadius,
            ),
            child: IconTheme(
              data: IconThemeData(color: spec.textColor),
              child: child,
            ),
          ),
        ),
      ),
    );
  }
}
