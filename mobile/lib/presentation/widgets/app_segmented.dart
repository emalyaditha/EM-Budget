import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';

import '../../core/theme/app_segments.dart';

/// The §6 segmented control of the design system, painted from the UI_SPEC §6
/// measurement of `.segment` and `.segment-item`: the track's frost, gap and
/// box, the item's resting paint and type, the selected state's fill, ink and
/// inset ring, and the one clock the item's own `transition` names — no value
/// appears here as a number.
///
/// The control is controlled: [selectedIndex] and [onSelected] are the web's
/// `aria-selected` and its click handler. A selection change is exactly what
/// the measured transition animates — fill and ink on the item's own
/// duration and curve — so the swap runs as an [AnimatedContainer], and the
/// selected ring arrives as a border drawn *inside* the item's box, which is
/// what `box-shadow: inset 0 0 0 1px` means; the resting item authors no
/// frame, so an unselected item carries none.
///
/// `.segment-item:hover` lifts the ink to `--ink` — decoration dropped per
/// UI_SPEC D-U1, and the selected rule's own ink is ported in its place.
/// The family has no call sites under `src/` today; it is ported because the
/// phase ruling orders it, exactly as the measurement shows.
class AppSegmented extends StatelessWidget {
  const AppSegmented({
    required this.children,
    required this.selectedIndex,
    required this.onSelected,
    super.key,
  });

  /// One [Widget] per `.segment-item` — the track lays them in a row with its
  /// authored 2px gap.
  final List<Widget> children;

  /// The picked item, or `null` when nothing is — the web's unselected state.
  final int? selectedIndex;

  /// Called with the item's index when one is picked.
  final ValueChanged<int>? onSelected;

  static const String _trackClass = '.segment';
  static const String _itemClass = '.segment-item';

  @override
  Widget build(BuildContext context) {
    final Brightness brightness = Theme.of(context).brightness;
    final AppSegmentSpec track = AppSegments.resolve(_trackClass, brightness);
    final AppSegmentSpec item = AppSegments.resolve(_itemClass, brightness);

    Widget content = Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        for (int i = 0; i < children.length; i++) ...<Widget>[
          if (i > 0) SizedBox(width: track.gapPx ?? 0.0),
          _segment(
            item: item,
            index: i,
            child: children[i],
            selected: i == selectedIndex,
            onTap: onSelected == null ? null : () => onSelected!(i),
          ),
        ],
      ],
    );

    content = Container(
      padding: track.padding,
      decoration: BoxDecoration(
        color: track.fillColor,
        border: track.border,
        borderRadius: track.borderRadius,
      ),
      child: content,
    );
    if (track.blurPx != null) {
      content = ClipRRect(
        borderRadius: track.borderRadius,
        child: BackdropFilter(
          filter: ImageFilter.blur(
            sigmaX: track.blurSigmaPx!,
            sigmaY: track.blurSigmaPx!,
          ),
          child: content,
        ),
      );
    }
    return content;
  }

  Widget _segment({
    required AppSegmentSpec item,
    required int index,
    required Widget child,
    required bool selected,
    VoidCallback? onTap,
  }) {
    Widget content = DefaultTextStyle.merge(
      style: TextStyle(
        fontFamily: item.fontFamily,
        color: selected ? item.selectedTextColor : item.textColor,
        fontSize: item.fontSizePx,
        fontWeight: item.weight,
        height: item.lineHeightPx == null
            ? null
            : item.lineHeightPx! / item.fontSizePx!,
        letterSpacing: item.letterSpacingPx,
      ),
      child: IconTheme.merge(
        data: IconThemeData(
          color: selected ? item.selectedTextColor : item.textColor,
        ),
        child: child,
      ),
    );
    content = AnimatedContainer(
      duration: item.transitionDuration ?? Duration.zero,
      curve: item.transitionCurve ?? Curves.linear,
      padding: item.padding,
      decoration: BoxDecoration(
        color: selected ? item.selectedFillColor : item.fillColor,
        borderRadius: item.borderRadius,
        // The resting item authors `border: none`; only the selected state
        // frames, and its ring is drawn inside the box, as inset is.
        border: selected
            ? Border.all(
                color: item.selectedRingColor!,
                width: item.selectedRingWidthPx!,
              )
            : null,
      ),
      child: content,
    );
    return Semantics(
      button: true,
      selected: selected,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: content,
      ),
    );
  }
}
