import 'package:flutter/material.dart';

import '../../core/theme/app_chips.dart';

/// A pill of the design system, painted from the UI_SPEC §6 measurement of
/// `.pill` and its authored state rules: no colour, radius, border, padding,
/// type, fade or clock appears here as a number.
///
/// The web composes `.pill pill-active`, and so does this: [AppPill.active]
/// paints the `.pill-active` row (the ink-over-accent-fg composite the probe
/// measured) on the `.pill` box — the gap, the press repaint
/// (`:active { background: var(--surface-3) }`), the `:disabled` fade and the
/// one transition clock all travel on the `.pill` row whatever the variant,
/// because on the web `.pill` authors them and the override names none.
/// `:hover` is not ported — UI_SPEC D-U1 rules it decoration on a touch
/// screen — and the `.pill-active:hover` colour-mix with it.
///
/// Like [AppButton] there is no Material ink: the measurement shows these
/// classes painting their own press state and nothing else.
class AppPill extends StatefulWidget {
  /// The resting `.pill`.
  const AppPill({required this.children, super.key, this.onPressed})
    : active = false;

  /// The `.pill pill-active` composite: the measured override colours on the
  /// same pill box.
  const AppPill.active({required this.children, super.key, this.onPressed})
    : active = true;

  /// The pill's contents, laid in a row separated by the class's authored
  /// `gap` — on the web the label and its icon are flex children.
  final List<Widget> children;

  /// `null` is the disabled state: the measured `:disabled` fade, no action.
  final VoidCallback? onPressed;

  /// Whether this pill paints the `.pill-active` override row.
  final bool active;

  @override
  State<AppPill> createState() => _AppPillState();
}

class _AppPillState extends State<AppPill> {
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
    final Brightness brightness = Theme.of(context).brightness;
    // `.pill` is the element on the web in both variants, so its row owns the
    // gap, the press token, the fade and the clock; the active variant only
    // swaps the three colours the override authors.
    final AppChipSpec pill = AppChips.resolve('.pill', brightness);
    final AppChipSpec spec = widget.active
        ? AppChips.resolve('.pill-active', brightness)
        : pill;
    final bool pressed = _pressed && _enabled;
    final Color fill = pressed && pill.pressFillColor != null
        ? pill.pressFillColor!
        : spec.fillColor;

    Widget content = Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        for (int i = 0; i < widget.children.length; i++) ...<Widget>[
          if (i > 0) SizedBox(width: pill.gapPx ?? 0.0),
          widget.children[i],
        ],
      ],
    );
    content = DefaultTextStyle.merge(
      style: TextStyle(
        fontFamily: spec.fontFamily,
        color: spec.textColor,
        fontSize: spec.fontSizePx,
        fontWeight: spec.weight,
        height: spec.lineHeightRatio,
        letterSpacing: spec.letterSpacingPx,
      ),
      child: content,
    );

    final Widget box = AnimatedContainer(
      duration: pill.pressDuration ?? Duration.zero,
      curve: pill.pressCurve ?? Curves.linear,
      padding: spec.padding,
      decoration: BoxDecoration(
        color: fill,
        borderRadius: spec.borderRadius,
        border: spec.border,
      ),
      child: content,
    );

    return Semantics(
      button: true,
      selected: widget.active,
      enabled: _enabled,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: _enabled ? widget.onPressed : null,
        onTapDown: (_) => _pressDown(),
        onTapUp: (_) => _pressRelease(),
        onTapCancel: _pressRelease,
        child: _enabled
            ? box
            : Opacity(opacity: pill.disabledOpacity ?? 1.0, child: box),
      ),
    );
  }
}
