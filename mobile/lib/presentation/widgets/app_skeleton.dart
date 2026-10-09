import 'package:flutter/material.dart';

import '../../core/theme/app_skeletons.dart';

/// The §6 variant an [AppSkeleton] asks for, named exactly as
/// `src/components/ui/Skeleton.tsx` names it — so a screen porting
/// `<Skeleton variant="rectangular" />` asks for [AppSkeletonVariant.rectangular]
/// and the mapping stays one line.
///
/// [classes] is what the component composes over `.skeleton`, and only its
/// `h-<n>` utility survives: the `rounded-*` every variant asks for loses to the
/// unlayered class's own corner, which is why no variant is round. See the note
/// on [AppSkeletons.variantClasses].
enum AppSkeletonVariant {
  text,
  circular,
  rectangular;

  /// The class list the web writes for this variant.
  String get classes => AppSkeletons.variantClasses[name]!;
}

/// A loading placeholder of the design system, painted from the UI_SPEC §6
/// measurement of `.skeleton` and the sweep that class authors on its
/// `::after`: no colour, radius, border, angle, stop, percentage, duration or
/// curve appears here as a number, and nothing falls back to a Material default.
///
/// The band is the pseudo-element: one box wide, riding the box's own padding
/// box, travelling from one width left of it to one width right. `overflow:
/// hidden` is what keeps it off the frame and off whatever the skeleton is
/// parked next to, so the sweep is clipped to the corner the class authored
/// minus the border the component added — [AppSkeletonSpec.sweepClipRadius].
///
/// A reduced-motion preference stops the run where CSS leaves it: the clamp at
/// `src/index.css:1371` finishes every animation in 0.01ms on one iteration, so
/// the band ends up parked one box width off the right edge — invisible. That is
/// the state [AppSkeleton] paints instead of animating, on
/// `MediaQuery.disableAnimationsOf`, and the frame and fill stay.
///
/// Sizing follows the component. `text` and `rectangular` author a height
/// ([AppSkeletons.textHeightPx], [AppSkeletons.rectangularHeightPx]) and take the
/// containing block's width, which in Flutter means the loose width the caller's
/// layout offers unless [width] says otherwise. `circular` authors neither, so
/// its caller gives both dimensions.
class AppSkeleton extends StatefulWidget {
  const AppSkeleton({
    super.key,
    this.variant = AppSkeletonVariant.text,
    this.width,
    this.height,
  }) : assert(
         variant != AppSkeletonVariant.circular ||
             (width != null && height != null),
         'the circular variant authors neither dimension — Skeleton.tsx gives it '
         '`shrink-0` and asks its caller for the size, so a ported caller has to '
         'supply both',
       );

  final AppSkeletonVariant variant;

  /// Overrides the width. `null` fills the space the caller's layout offers,
  /// which is what `w-full` means.
  final double? width;

  /// Overrides the height, which is how a ported screen sizes a `circular`
  /// skeleton. `null` keeps the variant's own measured height.
  final double? height;

  @override
  State<AppSkeleton> createState() => _AppSkeletonState();
}

class _AppSkeletonState extends State<AppSkeleton>
    with SingleTickerProviderStateMixin {
  /// The one §6 skeleton class. `AppSkeletons` holds exactly it, and the drift
  /// test that proves it is in `test/theme/ui_tokens_test.dart`.
  static const String _cssClass = '.skeleton';

  AnimationController? _controller;
  Duration? _period;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final AppSkeletonSpec spec = AppSkeletons.resolve(
      _cssClass,
      Theme.of(context).brightness,
    );
    final bool moving = !MediaQuery.disableAnimationsOf(context);
    if (_period != spec.sweepPeriod) {
      _controller?.dispose();
      _controller = null;
      _period = spec.sweepPeriod;
    }
    if (moving && _controller == null) {
      _controller = AnimationController(vsync: this, duration: spec.sweepPeriod)
        ..repeat();
    } else if (!moving && _controller != null) {
      _controller!.dispose();
      _controller = null;
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final AppSkeletonSpec spec = AppSkeletons.resolve(
      _cssClass,
      Theme.of(context).brightness,
    );
    final double? height =
        widget.height ??
        switch (widget.variant) {
          AppSkeletonVariant.text => AppSkeletons.textHeightPx,
          AppSkeletonVariant.rectangular => AppSkeletons.rectangularHeightPx,
          AppSkeletonVariant.circular => null,
        };

    // With no run going, the band sits where the reduced-motion clamp leaves it:
    // one box width past the right edge, so the paint is the resting fill and
    // frame alone.
    Widget box = AnimatedBuilder(
      animation: _controller ?? const AlwaysStoppedAnimation<double>(1.0),
      builder: (BuildContext context, Widget? child) {
        final double progress = _controller == null
            ? 1.0
            : spec.sweepCurve.transform(_controller!.value);
        return CustomPaint(
          painter: _AppSkeletonPainter(spec: spec, progress: progress),
          size: Size.infinite,
        );
      },
    );
    if (height != null) {
      box = SizedBox(height: height, child: box);
    }
    if (widget.width != null) {
      box = SizedBox(width: widget.width, child: box);
    }
    return box;
  }
}

class _AppSkeletonPainter extends CustomPainter {
  _AppSkeletonPainter({required this.spec, required this.progress});

  final AppSkeletonSpec spec;

  /// The band's place in its run, already through the authored curve: 0.0 is one
  /// box width left of the box, 1.0 one box width right.
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final Rect outer = Offset.zero & size;
    final RRect outerBox = spec.borderRadius.toRRect(outer);
    canvas.drawRRect(outerBox, Paint()..color = spec.fillColor);

    final double border = spec.borderWidthPx;
    final Rect paddingBox = border == 0.0 ? outer : outer.deflate(border);
    final Rect band = paddingBox.translate(
      spec.sweepShiftPx(paddingBox.width, progress),
      0,
    );
    canvas
      ..save()
      ..clipRRect(spec.sweepClipRadius.toRRect(paddingBox))
      ..drawRect(band, Paint()..shader = spec.sweepGradient.createShader(band))
      ..restore();

    spec.border.paint(canvas, outer, borderRadius: spec.borderRadius);
  }

  @override
  bool shouldRepaint(_AppSkeletonPainter oldDelegate) =>
      oldDelegate.spec != spec || oldDelegate.progress != progress;
}
