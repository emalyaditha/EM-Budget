import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter/physics.dart' show SpringSimulation;
import 'package:flutter/services.dart';

import '../../core/theme/app_modals.dart';

/// Which of the two measured shells to paint. Each variant is the key of its
/// own utility-stack row in [AppModals]: the dialog is `ui/Modal.tsx`
/// measured as `.modal-panel`, the sheet is `ui/BottomSheet.tsx` measured as
/// `.sheet-panel`. One primitive, because the shells are one design — feature
/// modals differ only in what they compose inside it, and InstallmentPlan
/// delegates to the very same dialog shell.
enum AppModalVariant {
  dialog('.modal-panel'),
  sheet('.sheet-panel');

  const AppModalVariant(this.cssClass);

  /// The panel class [AppModals.resolve] takes — never a caller-supplied
  /// string, the same convention [AppIconButton] sets for its §6 classes.
  final String cssClass;
}

/// The shared modal shell — the `.modal-panel` dialog or the `.sheet-panel`
/// bottom sheet — painted entirely from the UI_SPEC measurement in
/// [AppModals]: no colour, corner, border, blur radius, cap fraction, padding
/// step, spring number or fade clock appears here as a literal, and nothing
/// falls back to a Material default.
///
/// The two shells diverge only where their classes do, and every divergence
/// is an explicit wide/narrow pair on [AppModalSpec] — the shell's padding
/// step and docking (`items-end sm:items-center`), the phone sheet's square
/// bottom corners and top-only border, its grip's `sm:hidden` state, the
/// body's `sm:` padding step. Which side of each pair to paint is decided by
/// [wideBreakpointPx]: the web switches these through Tailwind `sm:`/`md:`
/// media queries whose breakpoint widths UI_SPEC measured nowhere, so this
/// port invents no threshold — the caller supplies it, and the behaviour
/// tests run at exactly the measured 390 and 1440 capture widths.
///
/// Presence is `AnimatePresence`-like, because the shells mount and unmount
/// inside one: flipping [isOpen] plays the measured enter or exit without
/// rebuilding the tree, and nothing renders while the shell is away. The
/// panel rides its row's authored spring (mass 1 by motion's default,
/// [AppModalSpec.panelSpring]); the veil fades on the shells' authored clock
/// with motion's unset-curve default [AppModals.veilFadeEase]. The browser's
/// own integrator has no pixel evidence, so the port's tests assert settle
/// and end state, not frame-exact motion.
///
/// Flutter has no `vh`, no `z-index` and no document body to lock. The height
/// cap is the row's measured fraction times the live viewport height; veil
/// and panel share one stack entry in the measured order, which is all the
/// `50`/`10` pair ever did; [AppModalSpec.bodyScrollLocks] names the web
/// behaviour whose route-hosting analogue the caller provides by putting the
/// shell in a route. [veil] lets a composition swap the shell's own measured
/// ink/40 + 2px-blur recipe for another recorded one — the black/60 + 8px of
/// the feature veils, or that colour over [AppModals.debtVeilBlurPx].
class AppModal extends StatefulWidget {
  const AppModal({
    super.key,
    required this.isOpen,
    required this.onClose,
    required this.title,
    required this.closeGlyph,
    required this.child,
    required this.wideBreakpointPx,
    this.variant = AppModalVariant.dialog,
    this.veil,
    this.widthToken,
  });

  /// Whether the shell is present. Flipping it plays the measured enter or
  /// exit; while false and settled, this widget renders nothing at all.
  final bool isOpen;

  /// Called on a veil tap — and on Escape for the dialog only.
  /// [AppModalSpec.escapeCloses] is the measured fact, not a parameter.
  final VoidCallback onClose;

  /// The header title, painted with the row's measured §6.3 type.
  final String title;

  /// The glyph centred in the measured close target. The shells author
  /// `<X size={13} />` and no icon package is bundled, so the caller supplies
  /// the widget; [AppModals.closeGlyphSizePx] is its authored size. The row's
  /// foreground colour reaches it through an [IconTheme], the way the SVG
  /// inherits `color` on the web and the way [AppIconButton] hands it over.
  final Widget closeGlyph;

  /// The body content, inside the row's measured body padding and scroll cap.
  final Widget child;

  /// At or above this viewport width the wide (desktop-measured) side of every
  /// divergent pair is painted. Caller-supplied because the evidence measures
  /// no breakpoint — see the class doc.
  final double wideBreakpointPx;

  /// Dialog or sheet. Selects the measured row; nothing else changes.
  final AppModalVariant variant;

  /// `null` paints the shell's own measured veil. A recipe swaps colour and
  /// blur, both staying measured values from [AppModals].
  final AppVeilRecipe? veil;

  /// `sm`, `md` or `lg` from [AppModals.widthPx]; `null` is the prop default
  /// the generator proves the dialog's own row matches. A sheet given a token
  /// is a programming error: its row measures one width and no map.
  final String? widthToken;

  @override
  State<AppModal> createState() => _AppModalState();
}

class _AppModalState extends State<AppModal> with TickerProviderStateMixin {
  late final AnimationController _veilController;
  late final AnimationController _panelController;
  bool _present = false;
  bool _mountEnterPlayed = false;

  @override
  void initState() {
    super.initState();
    _veilController = AnimationController(vsync: this, value: 0.0);
    _panelController = AnimationController(vsync: this, value: 0.0);
    _present = widget.isOpen;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // AnimatePresence plays initial→animate on mount too: an already-open
    // shell enters rather than appearing settled. This cannot happen in
    // initState — the enter reads the theme, and depending on the Theme
    // inherited widget there is illegal. didChangeDependencies is the first
    // hook where that read is allowed, and runs right after initState.
    if (!_mountEnterPlayed && widget.isOpen) {
      _mountEnterPlayed = true;
      _enter();
    }
  }

  @override
  void didUpdateWidget(AppModal oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.isOpen != widget.isOpen) {
      if (widget.isOpen) {
        _show();
      } else {
        _hide();
      }
    }
  }

  AppModalSpec _spec() =>
      AppModals.resolve(widget.variant.cssClass, Theme.of(context).brightness);

  void _enter() {
    _veilController.animateTo(
      1.0,
      duration: AppModals.veilFadeDuration,
      curve: AppModals.veilFadeEase,
    );
    _panelController.animateWith(
      // `snapToEnd` stops the ride exactly at the authored target once the
      // spring is within physics' default 1e-3 tolerance — the shell settles
      // fully opaque, not asymptotically close to it.
      SpringSimulation(
        _spec().panelSpring,
        _panelController.value,
        1.0,
        0.0,
        snapToEnd: true,
      ),
    );
  }

  void _show() {
    setState(() => _present = true);
    _enter();
  }

  Future<void> _hide() async {
    _veilController.animateTo(
      0.0,
      duration: AppModals.veilFadeDuration,
      curve: AppModals.veilFadeEase,
    );
    final SpringSimulation exit = SpringSimulation(
      _spec().panelSpring,
      _panelController.value,
      0.0,
      0.0,
      snapToEnd: true,
    );
    // A re-open interrupts this exit simulation; `orCancel` then throws and
    // the shell simply stays present for the new enter to ride.
    try {
      await _panelController.animateWith(exit).orCancel;
    } on TickerCanceled {
      return;
    }
    if (!mounted || widget.isOpen) {
      return;
    }
    setState(() => _present = false);
  }

  @override
  void dispose() {
    _panelController.dispose();
    _veilController.dispose();
    super.dispose();
  }

  Widget _closeTarget(AppModalSpec spec) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: widget.onClose,
      child: Container(
        width: spec.closeSizePx,
        height: spec.closeSizePx,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: spec.closeFill,
          border: Border.all(
            color: spec.closeBorderColor,
            width: spec.closeBorderWidthPx,
          ),
          borderRadius: BorderRadius.circular(spec.closeBorderRadiusPx),
        ),
        child: IconTheme(
          data: IconThemeData(color: spec.closeFgColor),
          child: widget.closeGlyph,
        ),
      ),
    );
  }

  Widget _header(AppModalSpec spec) {
    return Container(
      height: spec.headerHeightPx,
      padding: spec.headerPadding,
      decoration: BoxDecoration(
        color: spec.headerFill,
        border: spec.headerBorderBottom,
      ),
      child: Row(
        children: [
          Expanded(child: Text(widget.title, style: spec.titleStyle)),
          _closeTarget(spec),
        ],
      ),
    );
  }

  Widget _body(AppModalSpec spec, bool wide, double viewportHeight) {
    final Widget scroll = SingleChildScrollView(
      child: Padding(
        padding: wide ? spec.bodyPaddingWide : spec.bodyPaddingNarrow,
        child: widget.child,
      ),
    );
    if (spec.bodyMaxHeightFraction != null) {
      return ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: spec.bodyMaxHeightFraction! * viewportHeight,
        ),
        child: scroll,
      );
    }
    return Flexible(child: scroll);
  }

  Widget _panel(AppModalSpec spec, bool wide, double viewportHeight) {
    final AppModalGripSpec? grip = spec.grip;
    final bool showGrip =
        grip != null && (wide ? grip.shownOnWide : grip.shownOnNarrow);
    final BorderRadius radius = wide
        ? spec.panelRadiusWide
        : spec.panelRadiusNarrow;
    final Border border = _paintableBorder(
      wide ? spec.panelBorderWide : spec.panelBorderNarrow,
    );
    Widget panel = Container(
      decoration: BoxDecoration(
        color: spec.panelFill,
        border: border,
        borderRadius: radius,
        boxShadow: spec.panelShadow,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (showGrip)
            Padding(
              padding: EdgeInsets.symmetric(vertical: grip.marginYPx),
              // The authored `mx-auto`: the panel column stretches its
              // children, so the bar needs an explicit centring pass to keep
              // its measured 40px instead of the column's full width.
              child: Align(
                alignment: Alignment.center,
                child: Container(
                  width: grip.widthPx,
                  height: grip.heightPx,
                  decoration: BoxDecoration(
                    color: grip.fill,
                    borderRadius: BorderRadius.circular(grip.radiusPx),
                  ),
                ),
              ),
            ),
          _header(spec),
          _body(spec, wide, viewportHeight),
        ],
      ),
    );
    if (spec.panelMaxHeightFraction != null) {
      panel = ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: spec.panelMaxHeightFraction! * viewportHeight,
        ),
        child: panel,
      );
    }
    return panel;
  }

  /// The dialog's authored keyframe: fade from `enterOpacityFrom`, scale from
  /// `enterScale`, lift from `enterOffsetYPx` — all lerped by the panel's
  /// spring value, all read off the row, none restated here.
  Widget _enteringPanel(AppModalSpec spec, bool wide, double viewportHeight) {
    return AnimatedBuilder(
      animation: _panelController,
      builder: (BuildContext context, Widget? built) {
        final double t = _panelController.value;
        return Opacity(
          opacity: (spec.enterOpacityFrom! + (1 - spec.enterOpacityFrom!) * t)
              .clamp(0.0, 1.0),
          child: Transform.scale(
            scale: spec.enterScale! + (1 - spec.enterScale!) * t,
            child: Transform.translate(
              offset: Offset(0.0, spec.enterOffsetYPx! * (1 - t)),
              child: built,
            ),
          ),
        );
      },
      child: _panel(spec, wide, viewportHeight),
    );
  }

  /// The sheet's authored `initial={{ y: '100%' }}`: a slide of the panel's
  /// OWN height — which is exactly what [FractionalTranslation] means, so no
  /// LayoutBuilder detour is needed and the row's fraction is the only number.
  Widget _sliding(AppModalSpec spec, bool wide, double viewportHeight) {
    return AnimatedBuilder(
      animation: _panelController,
      builder: (BuildContext context, Widget? built) {
        final double t = _panelController.value;
        return FractionalTranslation(
          translation: Offset(0.0, (1 - t) * spec.enterOwnHeightFraction!),
          child: built,
        );
      },
      child: _panel(spec, wide, viewportHeight),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!_present) {
      return const SizedBox.shrink();
    }
    final AppModalSpec spec = _spec();
    final Size viewport = MediaQuery.sizeOf(context);
    final bool wide = viewport.width >= widget.wideBreakpointPx;
    if (widget.widthToken != null && spec.grip != null) {
      throw ArgumentError(
        'the sheet panel keeps its measured max-width row; widthToken is dialog-only',
      );
    }
    final double maxWidthPx = widget.widthToken == null
        ? spec.panelMaxWidthPx
        : AppModals.widthPx[widget.widthToken]!;
    final AppVeilRecipe? veil = widget.veil;
    final double veilSigma = veil != null
        ? veil.blurSigmaPx
        : spec.veilBlurSigmaPx;

    final Widget shellColumn = ConstrainedBox(
      constraints: BoxConstraints(maxWidth: maxWidthPx),
      child: Padding(
        padding: spec.panelMarginYPx > 0
            ? EdgeInsets.symmetric(vertical: spec.panelMarginYPx)
            : EdgeInsets.zero,
        child: _movingPanel(spec, wide, viewport.height),
      ),
    );

    // The shell's measured `overflow-y` is carried as row data but not
    // ported: the measured caps (panel 0.85·vh on the sheet, body 0.8·vh plus
    // header and grips on the dialog, at every captured viewport) keep the
    // shell column inside the shell, so the web's shell scroll never engages
    // and the body cap's own scroll is the port. A scroll view here would
    // additionally coat the veil with an opaque hit target and break both
    // outside-tap dismissal and centring.
    final EdgeInsets shellPadding = wide
        ? spec.shellPaddingWide
        : spec.shellPaddingNarrow;
    final Widget shellArea = Padding(
      padding: shellPadding,
      child: Align(
        alignment: wide || !spec.docksNarrowToBottom
            ? Alignment.center
            : Alignment.bottomCenter,
        child: shellColumn,
      ),
    );

    return Focus(
      canRequestFocus: spec.escapeCloses,
      autofocus: true,
      onKeyEvent: (FocusNode node, KeyEvent event) {
        if (event is KeyDownEvent &&
            event.logicalKey == LogicalKeyboardKey.escape) {
          widget.onClose();
          return KeyEventResult.handled;
        }
        return KeyEventResult.ignored;
      },
      child: Stack(
        fit: StackFit.expand,
        children: [
          FadeTransition(
            opacity: _veilController,
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: widget.onClose,
              child: ClipRect(
                child: BackdropFilter(
                  filter: ImageFilter.blur(
                    sigmaX: veilSigma,
                    sigmaY: veilSigma,
                  ),
                  child: ColoredBox(
                    color: veil != null ? veil.color : spec.veilColor,
                  ),
                ),
              ),
            ),
          ),
          shellArea,
        ],
      ),
    );
  }

  Widget _movingPanel(AppModalSpec spec, bool wide, double viewportHeight) {
    if (spec.enterOwnHeightFraction != null) {
      return _sliding(spec, wide, viewportHeight);
    }
    return _enteringPanel(spec, wide, viewportHeight);
  }
}

/// A CSS side measured at `border-*-width: 0px` paints nothing and occupies
/// nothing. Flutter's rounded-rect border painter asserts against a
/// zero-width *solid* side, so the port spells the measured-off sides
/// [BorderStyle.none] — identical semantics, the only spelling Flutter
/// accepts next to a corner radius. Colours and widths carry over unchanged.
BorderSide _paintableSide(BorderSide side) =>
    side.width == 0.0 ? side.copyWith(style: BorderStyle.none) : side;

Border _paintableBorder(Border border) => Border(
  top: _paintableSide(border.top),
  right: _paintableSide(border.right),
  bottom: _paintableSide(border.bottom),
  left: _paintableSide(border.left),
);
