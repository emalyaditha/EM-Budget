import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../../core/theme/app_surfaces.dart';

/// The §6 card surface an [AppCard] paints, named by the CSS class it was
/// measured from rather than by an invented role: the web writes `card-flat`,
/// so a ported screen writes [AppCardSurface.cardFlat] and the mapping stays
/// one line.
enum AppCardSurface {
  card('.card'),
  cardFlat('.card-flat'),
  cardLg('.card-lg'),
  cardDark('.card-dark'),
  gradientCard('.gradient-card'),
  glassPanel('.glass-panel'),
  glassPill('.glass-pill'),
  cardFace('.card-face');

  const AppCardSurface(this.cssClass);

  /// The key [AppSurfaces] stores the measured row under.
  final String cssClass;
}

/// A card of the design system, painted entirely from the UI_SPEC §6 measurement:
/// no colour, radius, border, shadow, blur or padding literal appears here, and
/// nothing falls back to a Material default. The brightness comes from
/// [Theme.of], so one widget is correct in both measured passes.
///
/// `.card-lg` is a radius-only companion — on the web it is written *with*
/// `.card` (`className="card card-lg"`), never alone, so a ported screen asks
/// for it with [radius] over [AppCardSurface.card] rather than as a surface.
class AppCard extends StatelessWidget {
  const AppCard({
    required this.child,
    super.key,
    this.surface = AppCardSurface.card,
    this.padding,
    this.radius,
  });

  final Widget child;
  final AppCardSurface surface;

  /// Defaults to the class's own measured padding, which for `.card` is zero:
  /// on the web the spacing utilities (`p-4`, `p-5`, `p-6`) sit beside the class
  /// and the surface itself carries none. A ported screen passes the utility it
  /// wrote, as `EdgeInsets.all(AppSpacing.scale(n))`.
  final EdgeInsetsGeometry? padding;

  /// Overrides the class's measured radius, which is how `card card-lg` is
  /// expressed. `null` keeps the measurement.
  final double? radius;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final AppSurfaceSpec spec = AppSurfaces.resolve(
      surface.cssClass,
      theme.brightness,
    );
    final BorderRadius borderRadius = radius == null
        ? spec.borderRadius
        : BorderRadius.circular(radius!);

    Widget content = Padding(
      padding: padding ?? EdgeInsets.all(spec.paddingPx),
      child: child,
    );

    // A class that declares its own `color` repaints the text under it; one that
    // merely inherits says the theme's ink and must not merge a style, or it
    // would freeze a colour the screen above it is still choosing.
    final Color ink = theme.colorScheme.onSurface;
    if (spec.textColor != ink) {
      content = DefaultTextStyle.merge(
        style: TextStyle(color: spec.textColor),
        child: content,
      );
    }

    final BoxDecoration paint = BoxDecoration(
      color: spec.paintsFill ? spec.fillColor : null,
      gradient: spec.fillGradient,
      borderRadius: borderRadius,
      // A measured 0px width is no border at all; a 1px transparent one is a
      // frame that occupies layout, exactly as UI_SPEC distinguishes them.
      border: spec.borderWidthPx == 0
          ? null
          : Border.fromBorderSide(
              BorderSide(color: spec.borderColor, width: spec.borderWidthPx),
            ),
    );

    final double? sigma = spec.blurSigma;
    if (sigma == null) {
      return DecoratedBox(
        decoration: paint.copyWith(boxShadow: spec.shadows),
        child: content,
      );
    }

    // CSS paints a box-shadow outside the element and blurs what is *behind*
    // it, which one Flutter box cannot do: a ClipRRect that hosts the
    // BackdropFilter clips the filter to the radius, and would clip the shadow
    // with it. So the shadow rides on an unclipped outer box and the
    // semi-transparent fill composites over the blurred backdrop inside.
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: borderRadius,
        boxShadow: spec.shadows,
      ),
      child: ClipRRect(
        borderRadius: borderRadius,
        child: BackdropFilter(
          filter: ui.ImageFilter.blur(sigmaX: sigma, sigmaY: sigma),
          child: DecoratedBox(decoration: paint, child: content),
        ),
      ),
    );
  }
}
