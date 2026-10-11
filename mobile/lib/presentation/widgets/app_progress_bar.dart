import 'package:flutter/material.dart';

import '../../core/theme/app_bars.dart';

/// The §6 bar class an [AppProgressBar] paints.
enum AppBarStyle {
  barPink('.bar-pink'),
  barMint('.bar-mint'),
  barYellow('.bar-yellow'),
  barLavender('.bar-lavender'),
  barBlue('.bar-blue'),
  rainbowBar('.rainbow-bar');

  const AppBarStyle(this.cssClass);

  /// The key [AppBars] stores the measured row under.
  final String cssClass;
}

/// A bar of the design system, painted from the UI_SPEC §6 measurement: the five
/// pastels carry only their measured `--pastel-*` fill, and `.rainbow-bar` only
/// its measured 3px height, 999px corner and `--rainbow` gradient. No colour,
/// corner or height appears here as a literal, and nothing falls back to a
/// Material default.
///
/// The name says what the web proves it is NOT: on every `src/` call site a
/// `.bar-*` div is a flat fill — an icon plate, a legend swatch, or a budget
/// meter whose *percentage width* the caller sets with an inline `style` and
/// Tailwind `h-full` (`src/components/Charts.tsx:161`) — and `.rainbow-bar` is
/// a decorative hairline, usually `absolute … left-0 right-0` with `!h-1`
/// overriding its authored 3px. Neither class measures or animates a value, so
/// this widget does not either: it paints the measured row, and a ported screen
/// expresses a fraction the way the web does — by sizing the box, e.g.
/// `Align(widthFactor: pct, child: AppProgressBar(...))`.
///
/// Size is the call site's, because the probe rows carry no layout box: the
/// measurement never saw a width on any class and the generated `heightPx` is
/// re-derived from the authored rule, so the pastel rows report `null`. A
/// pastel bar therefore takes the [height] the port gives it, or fills its
/// parent when it passes none — `h-full` and `h-9` are utilities, not the
/// class. `.rainbow-bar` authors 3px, which is its default [height]; the web's
/// own `!h-1`/`!h-1.5` overrides (`AuditPanel.tsx:381`, `DebtDetailModal.tsx:133`)
/// are why [height] overrides it rather than the box being hard-wired to 3px.
/// Unspecified width follows the web's unanimous usage: every `.rainbow-bar`
/// call site spans its container, so that is the default, while a pastel is
/// never given one and simply fills whatever box the caller built.
class AppProgressBar extends StatelessWidget {
  const AppProgressBar({
    super.key,
    this.style = AppBarStyle.rainbowBar,
    this.height,
  });

  /// The 3px default is the row's measured `heightPx` read through
  /// [AppBars.resolve] at paint time — these constructors only fix the class,
  /// exactly as the default [style] does.
  const AppProgressBar.pink({super.key, this.height})
    : style = AppBarStyle.barPink;

  const AppProgressBar.mint({super.key, this.height})
    : style = AppBarStyle.barMint;

  const AppProgressBar.yellow({super.key, this.height})
    : style = AppBarStyle.barYellow;

  const AppProgressBar.lavender({super.key, this.height})
    : style = AppBarStyle.barLavender;

  const AppProgressBar.blue({super.key, this.height})
    : style = AppBarStyle.barBlue;

  final AppBarStyle style;

  /// `null` lets the measured row decide: its authored 3px for `.rainbow-bar`,
  /// the parent's box for the pastels, which author none.
  final double? height;

  @override
  Widget build(BuildContext context) {
    final AppBarSpec spec = AppBars.resolve(
      style.cssClass,
      Theme.of(context).brightness,
    );
    // The bar’s own paint box. Its child fills whatever constraints the box
    // is given without demanding tight ones — an empty `Align` with both
    // factors at 1.0 is Flutter’s “take the offered box”, where
    // `SizedBox.expand` would refuse a loose parent and `SizedBox.shrink`
    // would collapse the paint to nothing.
    final Widget box = DecoratedBox(
      decoration: BoxDecoration(
        // The row guarantees exactly one of these is set — a flat pastel or
        // the rainbow gradient — so no branch here needs a fallback colour.
        color: spec.fillColor,
        gradient: spec.fillGradient,
        borderRadius: spec.borderRadius,
      ),
      child: const Align(
        widthFactor: 1.0,
        heightFactor: 1.0,
        child: SizedBox.shrink(),
      ),
    );
    if (height != null) {
      return SizedBox(height: height, width: double.infinity, child: box);
    }
    if (spec.heightPx != null) {
      // The authored hairline spans its container unless the caller is
      // building a box for it — see the class doc for the web usage.
      return SizedBox(
        height: spec.heightPx,
        width: double.infinity,
        child: box,
      );
    }
    return box;
  }
}
