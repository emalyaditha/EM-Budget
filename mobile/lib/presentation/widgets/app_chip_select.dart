import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';

import '../../core/theme/app_chips.dart';

/// The §6 selectable chip of the design system, painted from the UI_SPEC
/// measurement of `.chip-select`: no colour, radius, border, padding, type,
/// blur or clock appears here as a number.
///
/// This is the one §6 chrome chip that frosts what sits behind it: the class
/// authors `backdrop-filter: blur(10px)` (no `saturate()` — the drift test
/// pins what the probe measured), so the blur is clipped to the chip's own
/// corner by a [ClipRRect], which is what `backdrop-filter` means on the web.
///
/// `.chip-select` transitions its border and fill on the measured clock, so
/// the box is an [AnimatedContainer] and a state change a screen drives (the
/// `--surface-2` alpha, the `--line` frame) arrives eased, exactly as the
/// browser would run it. The class authors no `:active` and no `:disabled` —
/// the drift test pins which chip classes do — so a `null` [onPressed] removes
/// the action without changing the picture, and `:hover` is decoration
/// dropped per UI_SPEC D-U1.
class AppChipSelect extends StatelessWidget {
  const AppChipSelect({required this.children, super.key, this.onPressed});

  /// The chip's contents, laid in a row separated by the class's authored
  /// `gap` — on the web a label and its trailing icon are flex children.
  final List<Widget> children;

  /// `null` leaves the chip inert; the class describes no disabled look.
  final VoidCallback? onPressed;

  static const String _cssClass = '.chip-select';

  @override
  Widget build(BuildContext context) {
    final AppChipSpec spec = AppChips.resolve(
      _cssClass,
      Theme.of(context).brightness,
    );

    Widget content = Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        for (int i = 0; i < children.length; i++) ...<Widget>[
          if (i > 0) SizedBox(width: spec.gapPx ?? 0.0),
          children[i],
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

    final BoxDecoration paint = BoxDecoration(
      color: spec.fillColor,
      borderRadius: spec.borderRadius,
      border: spec.border,
    );
    Widget box = AnimatedContainer(
      duration: spec.pressDuration ?? Duration.zero,
      curve: spec.pressCurve ?? Curves.linear,
      padding: spec.padding,
      decoration: paint,
      child: content,
    );
    if (spec.blurPx != null) {
      box = ClipRRect(
        borderRadius: spec.borderRadius,
        child: BackdropFilter(
          filter: ImageFilter.blur(
            sigmaX: spec.blurSigmaPx!,
            sigmaY: spec.blurSigmaPx!,
          ),
          child: box,
        ),
      );
    }

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
