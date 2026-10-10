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
/// with a 999px corner, i.e. a full circle, and the port draws exactly that.
/// [AppIconButton.inGlassPill] is the `.glass-pill .icon-btn` header context:
/// the descendant rule refines the same measured class to a 34×34 box whose fill
/// and frame are literal `transparent`, so the header pill behind it is the
/// frost and the frame still occupies its 1px. Both rows come from
/// [AppIconButtons]; the widget restates no number for either.
///
/// There is no press state and no disabled paint. `.icon-btn` authors only a
/// `:hover` rule, which UI_SPEC D-U1 rules "decoration, not contract" on a touch
/// screen, and no `:active`/`:disabled`; so a `null` [onPressed] removes the
/// action without changing the picture — there is no measured state to change it
/// to. The child is handed the class's icon colour through an [IconTheme], which
/// is how the SVG inherits `color: var(--ink-2)` on the web.
class AppIconButton extends StatelessWidget {
  const AppIconButton({super.key, this.onPressed, required this.child})
    : _cssClass = '.icon-btn';

  /// The `.glass-pill .icon-btn` header context — the same icon pill shrunk to
  /// 34×34 with its own fill and frame written off, inside the header pill that
  /// [AppCard] paints as the `.glass-pill` surface.
  const AppIconButton.inGlassPill({
    super.key,
    this.onPressed,
    required this.child,
  }) : _cssClass = '.glass-pill .icon-btn';

  /// The §6 class this instance paints — one of the two keys of
  /// [AppIconButtons], never a caller-supplied string. `AppIconButtons.resolve`
  /// is the only place a class name meets a number, and the drift test in
  /// `test/theme/ui_tokens_test.dart` proves the key set.
  final String _cssClass;

  /// The glyph to centre in the pill — usually an [Icon]. It reaches the box
  /// already wrapped in the class's [IconTheme], so an [Icon] with no explicit
  /// `color` picks up `--ink-2`.
  final Widget child;

  /// `null` leaves the button inert. The class describes no disabled look, so
  /// nothing is repainted for it.
  final VoidCallback? onPressed;

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
