import 'package:flutter/material.dart';

import '../../core/theme/app_controls.dart';

/// The §6 control class an [AppButton] paints.
enum AppButtonControl {
  btnPrimary('.btn-primary'),
  btnGhost('.btn-ghost');

  const AppButtonControl(this.cssClass);

  /// The key [AppControls] stores the measured row under.
  final String cssClass;
}

/// A button of the design system, painted from the UI_SPEC §6 measurement and its
/// authored state rules: no colour, radius, border, size, weight, padding,
/// opacity or offset appears here as a number.
///
/// What the web does, and what this does: the resting paint is the probe, the
/// pressed state is `:active { transform: translateY(…) }` plus the `:active
/// background` `.btn-ghost` authors, and the disabled state is
/// `:disabled { opacity: … }` with the offset cleared. Each state change runs
/// on the duration and curve the class itself transitions. `:hover` is NOT ported —
/// UI_SPEC D-U1 rules it "decoration, not contract" on a touch screen — and there
/// is no Material ripple either, because the measurement shows no ink layer on
/// these classes.
///
/// Sizing is the caller's business. Both classes compute `display: block`, but on
/// the web they are flex items that shrink to their content, so the recorded
/// [AppControlSpec.displayCss] is data rather than a Flutter width constraint.
///
/// Keyboard focus is not here yet: it needs the router and a focus traversal
/// scope, which come with the screens.
class AppButton extends StatefulWidget {
  const AppButton({
    required this.child,
    required this.onPressed,
    super.key,
    this.control = AppButtonControl.btnPrimary,
    this.padding,
  });

  final Widget child;

  /// `null` is the disabled state, matching the web's `disabled` attribute.
  final VoidCallback? onPressed;

  final AppButtonControl control;

  /// Defaults to the class's own measured `padding` shorthand.
  final EdgeInsetsGeometry? padding;

  @override
  State<AppButton> createState() => _AppButtonState();
}

class _AppButtonState extends State<AppButton> {
  bool _pressed = false;

  bool get _enabled => widget.onPressed != null;

  void _pressDown() {
    if (_enabled) setState(() => _pressed = true);
  }

  void _pressRelease() {
    if (_pressed) setState(() => _pressed = false);
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final AppControlSpec spec = AppControls.resolve(
      widget.control.cssClass,
      theme.brightness,
    );
    final bool offset = _pressed && _enabled;
    // The pressed fill is the class's own `:active { background }` where it authors
    // one and the resting fill where it does not; AppControlSpec resolves that, so
    // nothing here asks which control it is.
    final Color fill = offset ? spec.activeFill : spec.fillColor;

    Widget content = Padding(
      padding: widget.padding ?? spec.padding,
      child: widget.child,
    );
    // The class sets its own type: `--font-display` at a measured size and step,
    // so the label cannot inherit the theme ladder and stay faithful.
    content = DefaultTextStyle.merge(
      style: TextStyle(
        fontFamily: spec.fontFamily,
        color: spec.textColor,
        fontSize: spec.fontSizePx,
        fontWeight: spec.weight,
        height: spec.heightRatio,
        letterSpacing: spec.letterSpacingPx,
      ),
      child: content,
    );

    final Widget box = AnimatedContainer(
      duration: spec.transitionDuration,
      curve: spec.transitionCurve,
      // The resting transform is identity rather than null: `AnimatedContainer`
      // builds its first tween from the value it is given, so with nothing to
      // lerp away from the press would snap into place on the first frame. CSS
      // `transform: none` is the same resting state, reached through the class’s
      // own transition.
      transform: offset
          ? Matrix4.translationValues(0.0, spec.pressDyPx, 0.0)
          : Matrix4.identity(),
      decoration: BoxDecoration(
        color: fill,
        borderRadius: spec.borderRadius,
        border: spec.border,
      ),
      child: content,
    );

    return Semantics(
      button: true,
      enabled: _enabled,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: _enabled ? widget.onPressed : null,
        onTapDown: (_) => _pressDown(),
        onTapUp: (_) => _pressRelease(),
        onTapCancel: _pressRelease,
        child: _enabled
            ? box
            : Opacity(opacity: spec.disabledOpacity, child: box),
      ),
    );
  }
}
