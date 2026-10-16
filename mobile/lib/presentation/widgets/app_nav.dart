import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';

import '../../core/theme/app_navs.dart';

/// The §6 phone navigation, painted entirely from the UI_SPEC measurement of
/// `.floating-nav` and the `.nav-item` / `.nav-item-active` / `.nav-fab`
/// children it holds. No size, corner, border, colour, fill alpha, blur,
/// shadow, gap, lift, clock or label measurement appears here as a number, and
/// nothing falls back to a Material default.
///
/// [AppNav] is the bar itself, and it places itself like `position: fixed`
/// does: bottom-centred, `bottomGapPx` over the host's
/// `MediaQuery.viewPadding.bottom` (which is what
/// `env(safe-area-inset-bottom, 0px)` becomes), `edgeInsetPx` narrower than its
/// available width and capped at `maxBarWidthPx`. So it belongs in a screen's
/// `Stack`, above the scrolling content — the placement is the class's, and a
/// caller that padded it again would move the measurement.
///
/// `displayCss: 'flex'` and `position: 'fixed'` travel on the row as the
/// measurement they are; the Flutter placement above is what reproduces them.
/// Desktop hides this surface entirely (`src/index.css:1169`), which is why the
/// phone pass is the bar's measurement at all.
///
/// The children are the classes, not a slot list: [AppNavItem] is `.nav-item`,
/// [AppNavItem] with `selected: true` is that same row carrying
/// `.nav-item-active`, and [AppNavFab] is `.nav-fab`. They are given in the
/// order the web writes them, because the bar distributes them with
/// `justify-content: space-between` and `gap: 4px` — the port reads both off
/// the row, the gap as a spacer between children, which is exactly what a flex
/// `gap` plus `space-between` produces: the gap, plus an equal share of the
/// free space on either side of it.
class AppNav extends StatelessWidget {
  const AppNav({required this.children, super.key});

  /// The tabs and the centre action, in bar order.
  final List<Widget> children;

  static const String _barClass = '.floating-nav';

  @override
  Widget build(BuildContext context) {
    final AppNavSpec bar = AppNavs.resolve(
      _barClass,
      Theme.of(context).brightness,
    );
    final EdgeInsets viewPadding = MediaQuery.viewPaddingOf(context);
    final double gap = bar.gapPx!;

    final List<Widget> spaced = <Widget>[];
    for (int i = 0; i < children.length; i++) {
      if (i > 0) spaced.add(SizedBox(width: gap));
      spaced.add(children[i]);
    }

    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) => Align(
        alignment: Alignment.bottomCenter,
        child: Padding(
          padding: EdgeInsets.only(
            bottom: bar.bottomGapPx! + viewPadding.bottom,
          ),
          child: SizedBox(
            width: math.min(
              constraints.maxWidth - bar.edgeInsetPx!,
              bar.maxBarWidthPx!,
            ),
            child: _NavBar(
              spec: bar,
              child: Row(
                // `display: flex; align-items: center`.
                crossAxisAlignment: CrossAxisAlignment.center,
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: spaced,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The measured bar surface under unclipped children.
///
/// `.floating-nav` paints a translucent `color-mix(… 82%, transparent)` fill
/// over `backdrop-filter: blur(22px)` and casts `--shadow-float`, but authors
/// no `overflow`, so its lifted `.nav-fab` — and that fab's own shadow —
/// escape the box. One Flutter box cannot do both: a [ClipRRect] is what
/// confines the blur to the element (that is what `backdrop-filter` means), and
/// the same clip would cut the escaping child. So the shadow rides on an
/// unclipped outer box, the frosted fill is clipped behind, and the children
/// paint over both, unclipped — the web's paint order, in three layers.
///
/// `saturate(1.5)` rides on the same filter and is unimplemented here, the
/// recorded finding [AppSurfaceSpec] and [AppIconButton] already carry.
class _NavBar extends StatelessWidget {
  const _NavBar({required this.spec, required this.child});

  final AppNavSpec spec;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final BorderRadius radius = spec.borderRadius;

    Widget surface = DecoratedBox(
      decoration: BoxDecoration(
        color: spec.fillColor,
        border: spec.border,
        borderRadius: radius,
      ),
      child: const SizedBox.shrink(),
    );
    final double? sigma = spec.blurSigmaPx;
    if (sigma != null) {
      surface = ClipRRect(
        borderRadius: radius,
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: sigma, sigmaY: sigma),
          child: surface,
        ),
      );
    }

    return DecoratedBox(
      decoration: BoxDecoration(boxShadow: spec.shadows, borderRadius: radius),
      child: Stack(
        children: <Widget>[
          Positioned.fill(child: surface),
          Padding(
            // The CSS box puts the content inside border *and* padding, and the
            // bar has no authored height, so its box is the 48px tab plus both
            // insets on each side; [AppNavSpec.border] draws in the outermost
            // of them rather than overlapping the padding band.
            padding: EdgeInsets.symmetric(
              vertical: spec.paddingVerticalPx + spec.borderWidthPx,
              horizontal: spec.paddingHorizontalPx + spec.borderWidthPx,
            ),
            child: child,
          ),
        ],
      ),
    );
  }
}

/// One tab of [AppNav]: the measured `.nav-item`, carrying `.nav-item-active`
/// when [selected].
///
/// The two rows are identical except in ink — that is what the composed probe
/// measured, and the drift test proves the generator refused any other
/// difference — so the resting row supplies every geometry and the selected
/// row is asked for nothing but its colour. The tab authors no `background`
/// and no border width: what shows behind a tab is the bar's own translucent
/// fill, so [AppNavSpec.fillColor] is measured transparent and paints nothing,
/// and the frame it would have had is `currentColor` at 0px — [AppNavSpec.border]
/// is null rather than a hairline that occupies layout.
///
/// The label's type is the class's, not the theme's ladder: `--font-display`
/// at a measured 8px/700, the 12px line box and the `0.02em` step. [icon] is
/// handed [AppNavSpec.fgColor] through an [IconTheme], which is how the SVG
/// inherits `color` on the web; its size is the markup's, because no §6 nav
/// rule authors one.
///
/// There is no press paint. `.nav-item` transitions `color` on `:hover` and
/// authors no `:active`, and UI_SPEC D-U1 drops the hover as decoration.
class AppNavItem extends StatelessWidget {
  const AppNavItem({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
    super.key,
  });

  final Widget icon;
  final String label;
  final bool selected;

  /// `null` leaves the tab inert; the class describes no disabled look, so
  /// nothing is repainted for it.
  final VoidCallback? onTap;

  static const String _itemClass = '.nav-item';
  static const String _activeClass = '.nav-item-active';

  @override
  Widget build(BuildContext context) {
    final Brightness brightness = Theme.of(context).brightness;
    final AppNavSpec item = AppNavs.resolve(_itemClass, brightness);
    final AppNavSpec active = AppNavs.resolve(_activeClass, brightness);
    final AppNavSpec ink = selected ? active : item;

    return Semantics(
      button: true,
      selected: selected,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: ConstrainedBox(
          // `min-width` and `height` are border-box numbers (Tailwind's
          // preflight sets `box-sizing: border-box`), so the padding the class
          // authors sits inside the 44px floor rather than adding to it, and
          // the 48px height is the box's own, not its content's.
          constraints: BoxConstraints(
            minWidth: item.minWidthPx!,
            minHeight: item.heightPx!,
            maxHeight: item.heightPx!,
          ),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: item.fillColor,
              border: item.border,
              borderRadius: item.borderRadius,
            ),
            child: Padding(
              padding: EdgeInsets.symmetric(
                vertical: item.paddingVerticalPx,
                horizontal: item.paddingHorizontalPx,
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                // `flex-direction: column; gap: 2px`.
                children: <Widget>[
                  IconTheme(
                    data: IconThemeData(color: ink.fgColor),
                    child: icon,
                  ),
                  SizedBox(height: item.gapPx!),
                  DefaultTextStyle.merge(
                    style: TextStyle(
                      fontFamily: item.fontFamily,
                      color: ink.fgColor,
                      fontSize: item.fontSizePx,
                      fontWeight: item.weight,
                      height: item.lineHeightRatio,
                      letterSpacing: item.letterSpacingPx,
                    ),
                    child: Text(label),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The raised centre action of [AppNav]: the measured `.nav-fab`.
///
/// The 48px circle is the class's, its 3px `--bg` ring is what bites it out of
/// the bar, and the ink is the same `--accent-fg` the selected tab wears. The
/// bar authors no `overflow`, so the fab escapes its top edge; that is the
/// `margin-top: -14px` the row's `align-items: center` then splits — the fab's
/// box sits [AppNavSpec.liftPx] halved above where a centred child would sit,
/// while the bar's content height stays the 48px tab it measured.
///
/// This is the one state in the family the port reproduces: `:active` scales
/// the action on the duration and curve its own `transition` names, and nothing
/// else changes — no colour, no shadow swap. The scale is centred because CSS
/// `transform-origin` is the box centre. `flex-shrink: 0` is what keeps the
/// circle round when the bar is crowded; a [Row] child has no analogous
/// squeeze, so it travels as the measurement it is.
class AppNavFab extends StatefulWidget {
  const AppNavFab({required this.child, this.onTap, super.key});

  /// The glyph to centre in the circle — usually an [Icon], which picks up the
  /// class's `--accent-fg` from the [IconTheme] this widget provides.
  final Widget child;

  /// `null` leaves the action inert; the class describes no disabled look.
  final VoidCallback? onTap;

  @override
  State<AppNavFab> createState() => _AppNavFabState();
}

class _AppNavFabState extends State<AppNavFab> {
  bool _pressed = false;

  static const String _fabClass = '.nav-fab';

  void _pressDown() {
    if (widget.onTap != null) setState(() => _pressed = true);
  }

  void _pressRelease() {
    if (_pressed) setState(() => _pressed = false);
  }

  @override
  Widget build(BuildContext context) {
    final AppNavSpec fab = AppNavs.resolve(
      _fabClass,
      Theme.of(context).brightness,
    );

    // The translate is OUTSIDE the action so the hit region travels with the
    // paint: the box the row lays out is the measured 48px square, and the
    // lifted picture is what the finger finds.
    return Transform.translate(
      offset: Offset(0.0, -fab.liftPx! / 2.0),
      child: Semantics(
        button: true,
        enabled: widget.onTap != null,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: widget.onTap,
          onTapDown: (_) => _pressDown(),
          onTapUp: (_) => _pressRelease(),
          onTapCancel: _pressRelease,
          child: AnimatedScale(
            scale: _pressed ? fab.pressScale! : 1.0,
            duration: fab.pressDuration!,
            curve: fab.pressCurve!,
            child: SizedBox(
              width: fab.sizePx,
              height: fab.sizePx,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: fab.fillColor,
                  border: fab.border,
                  borderRadius: fab.borderRadius,
                  boxShadow: fab.shadows,
                ),
                child: Padding(
                  // `width: 48` on this class is border-box, so the 3px ring
                  // takes its 3px off the content on every side.
                  padding: EdgeInsets.symmetric(
                    vertical: fab.paddingVerticalPx + fab.borderWidthPx,
                    horizontal: fab.paddingHorizontalPx + fab.borderWidthPx,
                  ),
                  child: Center(
                    child: IconTheme(
                      data: IconThemeData(color: fab.fgColor),
                      child: widget.child,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
