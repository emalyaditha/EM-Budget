import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';

import '../../core/theme/app_icon_buttons.dart';

/// The header-chrome icon pill of the design system, painted from the UI_SPEC §6
/// measurement of `.icon-btn` and its authored resting rule: no size, corner,
/// border, colour, fill alpha, padding or blur radius appears here as a number,
/// and nothing falls back to a Material default.
///
/// Two things make this box unlike [AppButton]. Its fill is genuinely
/// translucent — the class authors `color-mix(… 70%, transparent)` — and it
/// carries `backdrop-filter: blur(10px)`, so what sits behind the pill shows
/// through, frosted. The [BackdropFilter] is clipped to the pill's own corner by
/// a [ClipRRect], which is what `backdrop-filter` means on the web: the blur is
/// confined to the element's border-box, not smeared over the page.
///
/// The size is the class's, not the caller's. `.icon-btn` authors a 38×38 square
/// with a 999px corner, i.e. a full circle, and the port draws exactly that. The
/// `.glass-pill .icon-btn` context (a smaller, borderless icon inside the header
/// pill) is a descendant the §6 probe never measured, so it is not ported here —
/// see the note on [AppIconButtons].
///
/// There is no press state and no disabled paint. `.icon-btn` authors only a
/// `:hover` rule, which UI_SPEC D-U1 rules "decoration, not contract" on a touch
/// screen, and no `:active`/`:disabled`; so a `null` [onPressed] removes the
/// action without changing the picture — there is no measured state to change it
/// to. The child is handed the class's icon colour through an [IconTheme], which
/// is how the SVG inherits `color: var(--ink-2)` on the web.
class AppIconButton extends StatelessWidget {
  const AppIconButton({super.key, this.onPressed, required this.child});

  /// The glyph to centre in the pill — usually an [Icon]. It reaches the box
  /// already wrapped in the class's [IconTheme], so an [Icon] with no explicit
  /// `color` picks up `--ink-2`.
  final Widget child;

  /// `null` leaves the button inert. The class describes no disabled look, so
  /// nothing is repainted for it.
  final VoidCallback? onPressed;

  /// The one §6 icon-button class. `AppIconButtons` holds exactly it, and the
  /// drift test that proves it is in `test/theme/ui_tokens_test.dart`.
  static const String _cssClass = '.icon-btn';

  @override
  Widget build(BuildContext context) {
    final AppIconButtonSpec spec = AppIconButtons.resolve(
      _cssClass,
      Theme.of(context).brightness,
    );

    Widget box = Container(
      alignment: Alignment.center,
      padding: EdgeInsets.all(spec.paddingPx),
      decoration: BoxDecoration(
        color: spec.fillColor,
        border: spec.border,
        borderRadius: spec.borderRadius,
      ),
      child: IconTheme(
        data: IconThemeData(color: spec.iconColor),
        child: child,
      ),
    );
    if (spec.blurPx > 0) {
      box = ClipRRect(
        borderRadius: spec.borderRadius,
        child: BackdropFilter(
          filter: ImageFilter.blur(
            sigmaX: spec.blurSigmaPx,
            sigmaY: spec.blurSigmaPx,
          ),
          child: box,
        ),
      );
    }
    box = SizedBox(width: spec.sizePx, height: spec.sizePx, child: box);

    return Semantics(
      button: true,
      enabled: onPressed != null,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onPressed,
        child: box,
      ),
    );
  }
}
