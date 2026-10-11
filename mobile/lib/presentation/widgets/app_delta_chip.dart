import 'package:flutter/material.dart';

import '../../core/theme/app_chips.dart';

/// The direction a [AppDeltaChip] paints: the `.delta-up`/`.delta-down` tint
/// row whose fill and ink ride on the `.delta-chip` box.
enum AppDeltaDirection {
  up('.delta-up'),
  down('.delta-down');

  const AppDeltaDirection(this.cssClass);

  /// The key [AppChips] stores the measured tint under.
  final String cssClass;
}

/// The §6 delta chip of the design system, painted from the UI_SPEC §6
/// measurement: the `.delta-chip` row supplies the box — radius, padding,
/// type, the 4px `gap` and the `tabular-nums` — and the direction's tint row
/// supplies only the fill and ink, exactly as on the web, where an element
/// carries both classes and the tint authors `background` and `color` alone.
///
/// The tint rows were measured standalone (`display: block`, no radius — the
/// drift test records that), so taking their colours onto the chip's own
/// geometry is the composition the class list describes, not a guess: the
/// tint authors no box of its own to disagree with. Its `borderColor` is the
/// measured `currentcolor` at a `0px` width — no frame — so the box stays the
/// chip's, which authors none either.
class AppDeltaChip extends StatelessWidget {
  const AppDeltaChip({
    required this.children,
    required this.direction,
    super.key,
  });

  /// The chip's contents — on the web an arrow glyph and the delta text —
  /// laid in a row separated by the class's authored `gap`.
  final List<Widget> children;

  /// Which tint paints the chip.
  final AppDeltaDirection direction;

  static const String _cssClass = '.delta-chip';

  @override
  Widget build(BuildContext context) {
    final Brightness brightness = Theme.of(context).brightness;
    final AppChipSpec chip = AppChips.resolve(_cssClass, brightness);
    final AppChipSpec tint = AppChips.resolve(direction.cssClass, brightness);

    Widget content = Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        for (int i = 0; i < children.length; i++) ...<Widget>[
          if (i > 0) SizedBox(width: chip.gapPx ?? 0.0),
          children[i],
        ],
      ],
    );
    content = DefaultTextStyle.merge(
      style: TextStyle(
        fontFamily: chip.fontFamily,
        color: tint.textColor,
        fontSize: chip.fontSizePx,
        fontWeight: chip.weight,
        height: chip.lineHeightRatio,
        letterSpacing: chip.letterSpacingPx,
        // `font-variant-numeric: tabular-nums`, authored by `.delta-chip`
        // alone: the digits share a cell so two deltas line up.
        fontFeatures: chip.tabularNums
            ? const <FontFeature>[FontFeature.tabularFigures()]
            : null,
      ),
      child: IconTheme.merge(
        data: IconThemeData(color: tint.textColor),
        child: content,
      ),
    );

    return Container(
      padding: chip.padding,
      decoration: BoxDecoration(
        color: tint.fillColor,
        borderRadius: chip.borderRadius,
        border: chip.border,
      ),
      child: content,
    );
  }
}
