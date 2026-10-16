import 'package:flutter/material.dart';

import '../../core/theme/app_rows.dart';

/// The circle that leads a transaction row, painted from the measured
/// `cat-chip-*` rows: no fill, frame, ink, square, corner or glyph size appears
/// here as a number.
///
/// The tint is [AppCategoryChips.toneFor]’s answer for the category — the web’s
/// own hash over `category.toLowerCase().trim()`, walked through `TONE_CYCLE` —
/// unless the caller names a [tone] the way `CategoryChip.tsx:87` lets
/// `tone ??` do. A caller that needs a row to look like another row passes the
/// same category string and gets the same tone without either side choosing it.
///
/// The two `color-mix(in oklab, …)` recipes are not re-derived here: Flutter has
/// no oklab mixer and this port does not approximate a browser’s colour arithmetic
/// by hand. [AppCategoryChipTintSpec] carries the pixels the engine actually
/// painted, which is what the row has to reproduce.
///
/// The glyph is the caller’s, exactly as in `AppIconButton` and `AppIconChip`:
/// `lucide-react` is not a Flutter dependency, so this widget sizes and colours
/// the box and the screen hands over the drawing. [AppCategoryChips.glyphSymbols]
/// is the component’s own `CATEGORY_ICONS` table, keyed the same way and falling
/// back to the same symbol, so the caller resolves a name rather than restating
/// the map.
///
/// One authored fact has no Flutter knob here: the component draws its icon with
/// `strokeWidth={2}` ([AppCategoryChips.glyphStrokeWidth]), a property of the SVG
/// stroke that a `Icon`-shaped widget cannot express. A caller supplying a
/// hand-drawn glyph is expected to draw it at that weight; the number is carried
/// by the spec so the requirement is recorded rather than forgotten.
class AppCategoryChip extends StatelessWidget {
  const AppCategoryChip({
    required this.category,
    super.key,
    this.size = AppChipSize.md,
    this.tone,
    this.glyph,
  });

  /// The category the tone and the glyph are looked up from. Painted nowhere —
  /// on the web the chip is `aria-hidden` and carries no text.
  final String category;

  /// The `size` prop, whose two ternaries give the square and the glyph size.
  final AppChipSize size;

  /// An explicit `tone`, which on the web beats the hash.
  final AppChipTone? tone;

  /// The icon to centre in the circle.
  final Widget? glyph;

  @override
  Widget build(BuildContext context) {
    final Brightness brightness = Theme.of(context).brightness;
    final AppCategoryChipTintSpec tint = AppCategoryChips.tint(
      tone ?? AppCategoryChips.toneFor(category),
      brightness,
    );
    // `aria-hidden`: the row’s own label is the accessible name, and the circle
    // is decoration.
    return ExcludeSemantics(
      child: SizedBox(
        width: size.sidePx,
        height: size.sidePx,
        child: Container(
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: tint.fillColor,
            borderRadius: tint.radius,
            border: Border.all(
              color: tint.borderColor,
              width: tint.borderWidthPx,
            ),
          ),
          child: glyph == null
              ? null
              : IconTheme.merge(
                  // `Icon` takes its colour from the theme, and on the web the
                  // SVG inherits `color: var(--ink)` from the chip’s inline
                  // style — the same channel, so the size still comes from the
                  // caller and the colour from the measurement.
                  data: IconThemeData(
                    color: tint.iconColor,
                    size: size.glyphPx,
                  ),
                  child: glyph!,
                ),
        ),
      ),
    );
  }
}
