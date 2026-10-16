import 'package:flutter/material.dart';

import '../../core/theme/app_chips.dart';

/// The card-face gold chip, painted from the UI_SPEC §6 measurement of
/// `.card-face-chip`: the 30×22 rounded box, the `--chip-gold →
/// --chip-gold-deep` 135° gradient the class authors, and the inset hairline
/// ring its `::after` paints 4px inside — no number appears here as a literal.
///
/// There is one spec, not a per-brightness table, because both measured
/// passes printed the same gold on the same box (the drift test pins that
/// equality); the widget resolves nothing from the theme. A pseudo-element is
/// invisible to a detached probe, so the ring travels as authored facts on
/// [AppFaceChipSpec] — this widget is the composition that paints them: the
/// box, then a border laid at the inset, which is what `inset: 4px` with a
/// 1px frame means.
class AppCardFaceChip extends StatelessWidget {
  const AppCardFaceChip({super.key});

  static const AppFaceChipSpec _spec = AppFaceChips.spec;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: _spec.widthPx,
      height: _spec.heightPx,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: _spec.fillGradient,
          borderRadius: _spec.borderRadius,
        ),
        child: Padding(
          padding: EdgeInsets.all(_spec.ringInsetPx),
          child: DecoratedBox(
            decoration: BoxDecoration(
              border: _spec.ringBorder,
              borderRadius: _spec.ringBorderRadius,
            ),
          ),
        ),
      ),
    );
  }
}
