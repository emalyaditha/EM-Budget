// GENERATED — do not edit by hand.
// Produced by `node parity/generate_theme.cjs` from `parity/ui-tokens.json`, the
// Chrome-computed measurement of `src/index.css` at tag `pre-flutter`, with the
// curated token lists and phone markers of `parity/UI_SPEC.md` §2.1–§4.
// Every value below is the measurement; UI_SPEC §5 (whose machine "Dart" column
// mis-parses --blur-* / --container-* names as radii) is deliberately not used.

import 'package:flutter/material.dart';

/// One shared shell — the `ui/Modal.tsx` dialog or the `ui/BottomSheet.tsx`
/// sheet — measured as a whole class stack in every pass of
/// `parity/ui-tokens.json`, with the states and motion the probe cannot see
/// read from the authored non-CSS entries and the pinned sources. A widget
/// under `lib/presentation/` restates none of it.
///
/// Viewport divergence is carried, not averaged: the web switches a value
/// between the phone pass (390x844) and the desktop pass (1440x900) through
/// Tailwind `sm:`/`md:` media queries, whose breakpoint widths are framework
/// knowledge and were never measured (UI_SPEC records none). Each pair
/// below says which side of the split the value was measured on; the widget
/// picks between the sides at a breakpoint the CALLER supplies, so the port
/// invents no threshold the evidence does not back.
class AppModalGripSpec {
  const AppModalGripSpec({
    required this.widthPx,
    required this.heightPx,
    required this.radiusPx,
    required this.marginYPx,
    required this.fill,
    required this.displayWideCss,
    required this.displayNarrowCss,
  });

  final double widthPx;
  final double heightPx;

  /// Chrome’s clamp of `rounded-full` — a full round, kept verbatim.
  final double radiusPx;
  final double marginYPx;
  final Color fill;

  /// The measured `display` of the grip per viewport side:
  /// `sm:hidden` hides it on desktop (`none`) and the phone shows it
  /// (`block`). Carried as CSS text; [shownOnWide]/[shownOnNarrow] read it.
  final String displayWideCss;
  final String displayNarrowCss;

  bool get shownOnWide => displayWideCss != 'none';

  bool get shownOnNarrow => displayNarrowCss != 'none';
}

/// A veil recipe: a measured colour and the blur the class author-ed on it.
class AppVeilRecipe {
  const AppVeilRecipe({required this.color, required this.blurPx});

  final Color color;

  /// The CSS blur radius. Ruling D-U8 converts it to Flutter sigma at the
  /// consumer, so this row keeps the measured px.
  final double blurPx;

  /// CSS blur radius → Flutter sigma, the port’s fixed mapping (see
  /// [AppSurfaceSpec.blurSigma]). Not a number a widget chose.
  double get blurSigmaPx => blurPx / 2;
}

/// The `ledger-rule` hairline both shells draw under their headers.
class AppLedgerRuleSpec {
  const AppLedgerRuleSpec({required this.heightPx, required this.fill});

  final double heightPx;
  final Color fill;
}

/// One shell, measured per brightness pass, with the viewport-divergent
/// geometry carried as explicit wide/narrow pairs.
class AppModalSpec {
  const AppModalSpec({
    required this.cssClass,
    required this.shellPaddingWidePx,
    required this.shellPaddingNarrowPx,
    required this.shellAlignWideCss,
    required this.shellAlignNarrowCss,
    required this.shellOverflowYWideCss,
    required this.shellOverflowYNarrowCss,
    required this.shellZIndexCss,
    required this.panelZIndexCss,
    required this.veilColor,
    required this.veilBlurPx,
    required this.panelMaxWidthPx,
    required this.panelMarginYPx,
    required this.panelRadiusWidePx,
    required this.panelRadiusNarrowTopPx,
    required this.panelRadiusNarrowBottomPx,
    required this.panelBorderWidePx,
    required this.panelBorderNarrowTopPx,
    required this.panelBorderNarrowSidesPx,
    required this.panelBorderNarrowBottomPx,
    required this.panelFill,
    required this.panelBorderColor,
    required this.panelShadow,
    required this.bodyMaxHeightFraction,
    required this.panelMaxHeightFraction,
    required this.headerHeightPx,
    required this.headerPaddingHorizontalPx,
    required this.headerBorderBottomWidthPx,
    required this.headerBorderBottomColor,
    required this.headerFill,
    required this.titleFontSizePx,
    required this.titleFontWeight,
    required this.titleLineHeightPx,
    required this.titleLetterSpacingPx,
    required this.titleColor,
    required this.closeSizePx,
    required this.closeBorderRadiusPx,
    required this.closeFill,
    required this.closeFgColor,
    required this.closeBorderWidthPx,
    required this.closeBorderColor,
    required this.bodyPaddingWidePx,
    required this.bodyPaddingNarrowPx,
    this.grip,
    required this.panelSpringDamping,
    required this.panelSpringStiffness,
    required this.enterOpacityFrom,
    required this.enterScale,
    required this.enterOffsetYPx,
    required this.enterOwnHeightFraction,
    required this.escapeCloses,
    required this.bodyScrollLocks,
  });

  /// The panel class this row was measured under — the map key.
  final String cssClass;

  /// The shell’s `p-4 sm:p-6` (dialog) or its absence (sheet): one uniform
  /// value per measured viewport side.
  final double shellPaddingWidePx;
  final double shellPaddingNarrowPx;

  /// The computed `align-items` of the shell per side. Carried as CSS text:
  /// the sheet is `flex-end` on the phone and `center` on desktop
  /// (`items-end sm:items-center`), the dialog `center` on both.
  final String shellAlignWideCss;
  final String shellAlignNarrowCss;

  /// The measured `overflow-y` of the shell. Carried as data, not applied:
  /// the dialog shell scrolls its content (`auto`) where Flutter’s route
  /// does the equivalent by construction, and the sheet measures `visible`.
  final String shellOverflowYWideCss;
  final String shellOverflowYNarrowCss;

  /// The measured z-indices, carried as data: Flutter has no z-index; the
  /// port stacks veil below panel in one overlay entry, which is the whole
  /// of what 50/10 order on the web.
  final String shellZIndexCss;
  final String panelZIndexCss;

  /// The shell’s own veil — `bg-[var(--ink)]/40 backdrop-blur-[2px]`,
  /// measured per brightness pass (the ink flips with the scheme). Other
  /// recipes live on [AppModals] as explicit widget parameters.
  final Color veilColor;
  final double veilBlurPx;

  /// CSS blur radius → Flutter sigma, ruling D-U8’s fixed mapping — the
  /// same conversion [AppVeilRecipe.blurSigmaPx] applies to the recipes.
  double get veilBlurSigmaPx => veilBlurPx / 2;

  /// The panel’s measured `max-width` — `--container-md` for the dialog
  /// (the prop default), `--container-lg` for the sheet — which matches
  /// the token table, and `my-8` (dialog) or none (sheet).
  final double panelMaxWidthPx;
  final double panelMarginYPx;

  /// `rounded-2xl` on desktop; `rounded-t-2xl sm:rounded-2xl` leaves the
  /// phone sheet flush to the bottom edge, so its bottom radius is 0.
  final double panelRadiusWidePx;
  final double panelRadiusNarrowTopPx;
  final double panelRadiusNarrowBottomPx;

  /// `border-t sm:border`: uniform on desktop, top-only on the phone.
  final double panelBorderWidePx;
  final double panelBorderNarrowTopPx;
  final double panelBorderNarrowSidesPx;
  final double panelBorderNarrowBottomPx;
  final Color panelFill;
  final Color panelBorderColor;

  /// The panel’s measured box-shadow. The dialog is the `.card` twin
  /// (two layers, per pass); the sheet is Tailwind’s `shadow-2xl`, which
  /// the engine serialises as one visible layer plus four transparent
  /// ones — ported verbatim, transparent layers included.
  final List<BoxShadow> panelShadow;

  /// `max-h-[80vh]`/`max-h-[85vh]` as the measured px cap divided by the
  /// pass viewport height — equal on both sides (720/900 = 675.2/844 =
  /// 0.8; 765/900 = 717.4/844 = 0.85). Flutter has no vh: the widget
  /// multiplies the fraction by the live MediaQuery height. Only the
  /// element the class sits on is capped: [bodyMaxHeightFraction] for the
  /// dialog (the body), [panelMaxHeightFraction] for the sheet (the panel
  /// itself, whose body then flexes inside it).
  final double? bodyMaxHeightFraction;
  final double? panelMaxHeightFraction;

  /// The header bar: `h-12 px-5 border-b border-[var(--line)]`, filled
  /// `--surface` on the dialog and transparent on the sheet.
  final double headerHeightPx;
  final double headerPaddingHorizontalPx;
  final double headerBorderBottomWidthPx;
  final Color headerBorderBottomColor;
  final Color headerFill;

  /// §6.3 type of the title: the class sets `text-[13px] font-bold
  /// tracking-tight` itself, measured identically on all four passes.
  final double titleFontSizePx;
  final int titleFontWeight;
  final double titleLineHeightPx;
  final double titleLetterSpacingPx;
  final Color titleColor;

  /// The close target: `w-7 h-7` (28 square), full round, `--surface-2`
  /// on a `--line` border, glyph `--ink-2`. The 13px glyph it centres is
  /// authored JS (`<X size={13} />`) and sits on [AppModals] as
  /// [AppModals.closeGlyphSizePx] — the glyph itself is the caller’s.
  final double closeSizePx;
  final double closeBorderRadiusPx;
  final Color closeFill;
  final Color closeFgColor;
  final double closeBorderWidthPx;
  final Color closeBorderColor;

  /// The body’s `p-6 sm:p-5` — a `sm:` padding step on both shells, so one
  /// uniform value per measured viewport side, never a blend.
  final double bodyPaddingWidePx;
  final double bodyPaddingNarrowPx;

  /// The phone-only grab bar. Null on the dialog, which measures none.
  final AppModalGripSpec? grip;

  /// The panel’s authored `transition={{ type: "spring", … }}` — the two
  /// numbers the shells print, kept verbatim. motion’s spring default
  /// mass is 1 (`node_modules/motion-dom/dist/es/animation/
  /// generators/spring.mjs`), so [panelSpring] maps the pair one-to-one;
  /// the browser’s own integrator has no pixel evidence and the port does
  /// not claim its exact frames — only settle behaviour.
  final double panelSpringDamping;
  final double panelSpringStiffness;

  /// The authored initial keyframe, per variant: the dialog fades from
  /// `opacity: enterOpacityFrom` with `scale: enterScale` and a
  /// `enterOffsetYPx` lift; the sheet slides up a full
  /// `enterOwnHeightFraction` of its own height and never fades or
  /// scales (those fields are then null). Exit restates initial.
  final double? enterOpacityFrom;
  final double? enterScale;
  final double? enterOffsetYPx;
  final double? enterOwnHeightFraction;

  /// Authored behaviour: `if (e.key === "Escape") onClose()` is in
  /// Modal.tsx and verifiably NOT in BottomSheet.tsx.
  final bool escapeCloses;

  /// Both shells lock `document.body.style.overflow` while open. Flutter
  /// has no document body: the port’s analogue is hosting the shell in a
  /// route/overlay entry, which the widget cannot itself enforce; carried
  /// so the behaviour test can name what the web does.
  final bool bodyScrollLocks;

  EdgeInsets get shellPaddingWide => EdgeInsets.all(shellPaddingWidePx);

  EdgeInsets get shellPaddingNarrow => EdgeInsets.all(shellPaddingNarrowPx);

  bool get docksNarrowToBottom => shellAlignNarrowCss == 'flex-end';

  BorderRadius get panelRadiusWide => BorderRadius.circular(panelRadiusWidePx);

  BorderRadius get panelRadiusNarrow => BorderRadius.vertical(
    top: Radius.circular(panelRadiusNarrowTopPx),
    bottom: Radius.circular(panelRadiusNarrowBottomPx),
  );

  Border get panelBorderWide =>
      Border.all(color: panelBorderColor, width: panelBorderWidePx);

  Border get panelBorderNarrow => Border(
    top: BorderSide(color: panelBorderColor, width: panelBorderNarrowTopPx),
    left: BorderSide(color: panelBorderColor, width: panelBorderNarrowSidesPx),
    right: BorderSide(color: panelBorderColor, width: panelBorderNarrowSidesPx),
    bottom: BorderSide(
      color: panelBorderColor,
      width: panelBorderNarrowBottomPx,
    ),
  );

  EdgeInsets get headerPadding =>
      EdgeInsets.symmetric(horizontal: headerPaddingHorizontalPx);

  Border get headerBorderBottom => Border(
    bottom: BorderSide(
      color: headerBorderBottomColor,
      width: headerBorderBottomWidthPx,
    ),
  );

  EdgeInsets get bodyPaddingWide => EdgeInsets.all(bodyPaddingWidePx);

  EdgeInsets get bodyPaddingNarrow => EdgeInsets.all(bodyPaddingNarrowPx);

  /// The 100-900 CSS step indexes the Dart enum directly; no weight is retyped.
  FontWeight get titleWeight => FontWeight.values[titleFontWeight ~/ 100 - 1];

  /// Flutter’s line-height is a multiple of the font size, CSS’s is a length,
  /// so this is the measured pair divided — not a number anyone chose.
  double get titleHeightRatio => titleLineHeightPx / titleFontSizePx;

  TextStyle get titleStyle => TextStyle(
    fontSize: titleFontSizePx,
    fontWeight: titleWeight,
    height: titleHeightRatio,
    letterSpacing: titleLetterSpacingPx,
    color: titleColor,
  );

  /// motion’s spring is mass 1, so Flutter’s mass is the same 1.0 — nothing
  /// here is tuned. The integrator differs (see the field doc); behaviour
  /// tests assert settle and end state, not frame-exact motion.
  SpringDescription get panelSpring => SpringDescription(
    mass: 1.0,
    damping: panelSpringDamping,
    stiffness: panelSpringStiffness,
  );

  /// The cap applied to the body (dialog) or the panel (sheet), as the
  /// measured fraction of a live viewport height.
  double? get capOnBody => bodyMaxHeightFraction;
  double? get capOnPanel => panelMaxHeightFraction;
}

/// The two shared shells, keyed by panel class — one map per measured
/// brightness pass, the same convention `AppControls` sets.
///
/// Row provenance for the dialog:
///   shell: `modal-shell` (src/components/ui/Modal.tsx:49)
///   veil: `modal-veil` (src/components/ui/Modal.tsx:56)
///   panel: `modal-panel` (src/components/ui/Modal.tsx:68,41,68)
///   header: `modal-header` (src/components/ui/Modal.tsx:71)
///   title: `modal-title` (src/components/ui/Modal.tsx:74)
///   close: `modal-close` (src/components/ui/Modal.tsx:84)
///   body: `modal-body` (src/components/ui/Modal.tsx:92)
///   Measured viewports: desktop 1440x900, phone 390x844.
///
/// Row provenance for the sheet:
///   shell: `sheet-shell` (src/components/ui/BottomSheet.tsx:23)
///   veil: `sheet-veil` (src/components/ui/BottomSheet.tsx:30)
///   panel: `sheet-panel` (src/components/ui/BottomSheet.tsx:40)
///   header: `sheet-header` (src/components/ui/BottomSheet.tsx:44)
///   title: `sheet-title` (src/components/ui/BottomSheet.tsx:47)
///   close: `sheet-close` (src/components/ui/BottomSheet.tsx:56)
///   body: `sheet-body` (src/components/ui/BottomSheet.tsx:63)
///   Measured viewports: desktop 1440x900, phone 390x844.
abstract final class AppModals {
  /// light pass (utility stacks `light-desktop`/`light-phone`; states and
  /// motion from the authored non-CSS entries and the pinned sources).
  static const Map<String, AppModalSpec> light = <String, AppModalSpec>{
    '.modal-panel': AppModalSpec(
      cssClass: '.modal-panel',
      shellPaddingWidePx: 24.0,
      shellPaddingNarrowPx: 16.0,
      shellAlignWideCss: 'center',
      shellAlignNarrowCss: 'center',
      shellOverflowYWideCss: 'auto',
      shellOverflowYNarrowCss: 'auto',
      shellZIndexCss: '50',
      panelZIndexCss: '10',
      veilColor: Color.fromRGBO(13, 22, 36, 0.4),
      veilBlurPx: 2.0,
      panelMaxWidthPx: 448.0,
      panelMarginYPx: 32.0,
      panelRadiusWidePx: 24.0,
      panelRadiusNarrowTopPx: 24.0,
      panelRadiusNarrowBottomPx: 24.0,
      panelBorderWidePx: 1.0,
      panelBorderNarrowTopPx: 1.0,
      panelBorderNarrowSidesPx: 1.0,
      panelBorderNarrowBottomPx: 1.0,
      panelFill: Color.fromRGBO(252, 254, 255, 1.0),
      panelBorderColor: Color.fromRGBO(216, 223, 230, 1.0),
      panelShadow: <BoxShadow>[
        BoxShadow(
          color: Color.fromRGBO(13, 22, 36, 0.05),
          offset: Offset(0.0, 1.0),
          blurRadius: 2.0,
        ),
        BoxShadow(
          color: Color.fromRGBO(13, 22, 36, 0.06),
          offset: Offset(0.0, 8.0),
          blurRadius: 26.0,
        ),
      ],
      bodyMaxHeightFraction: 0.8,
      panelMaxHeightFraction: null,
      headerHeightPx: 48.0,
      headerPaddingHorizontalPx: 20.0,
      headerBorderBottomWidthPx: 1.0,
      headerBorderBottomColor: Color.fromRGBO(216, 223, 230, 1.0),
      headerFill: Color.fromRGBO(252, 254, 255, 1.0),
      titleFontSizePx: 13.0,
      titleFontWeight: 700,
      titleLineHeightPx: 19.5,
      titleLetterSpacingPx: -0.325,
      titleColor: Color.fromRGBO(13, 22, 36, 1.0),
      closeSizePx: 28.0,
      closeBorderRadiusPx: 33554400.0,
      closeFill: Color.fromRGBO(235, 241, 247, 1.0),
      closeFgColor: Color.fromRGBO(73, 86, 105, 1.0),
      closeBorderWidthPx: 1.0,
      closeBorderColor: Color.fromRGBO(216, 223, 230, 1.0),
      bodyPaddingWidePx: 24.0,
      bodyPaddingNarrowPx: 20.0,
      grip: null,
      panelSpringDamping: 26.0,
      panelSpringStiffness: 280.0,
      enterOpacityFrom: 0.0,
      enterScale: 0.98,
      enterOffsetYPx: 6.0,
      enterOwnHeightFraction: null,
      escapeCloses: true,
      bodyScrollLocks: true,
    ),
    '.sheet-panel': AppModalSpec(
      cssClass: '.sheet-panel',
      shellPaddingWidePx: 0.0,
      shellPaddingNarrowPx: 0.0,
      shellAlignWideCss: 'center',
      shellAlignNarrowCss: 'flex-end',
      shellOverflowYWideCss: 'visible',
      shellOverflowYNarrowCss: 'visible',
      shellZIndexCss: '50',
      panelZIndexCss: '10',
      veilColor: Color.fromRGBO(13, 22, 36, 0.4),
      veilBlurPx: 2.0,
      panelMaxWidthPx: 512.0,
      panelMarginYPx: 0.0,
      panelRadiusWidePx: 16.0,
      panelRadiusNarrowTopPx: 16.0,
      panelRadiusNarrowBottomPx: 0.0,
      panelBorderWidePx: 1.0,
      panelBorderNarrowTopPx: 1.0,
      panelBorderNarrowSidesPx: 0.0,
      panelBorderNarrowBottomPx: 0.0,
      panelFill: Color.fromRGBO(252, 254, 255, 1.0),
      panelBorderColor: Color.fromRGBO(216, 223, 230, 1.0),
      panelShadow: <BoxShadow>[
        BoxShadow(
          color: Color.fromRGBO(0, 0, 0, 0.0),
          offset: Offset(0.0, 0.0),
          blurRadius: 0.0,
        ),
        BoxShadow(
          color: Color.fromRGBO(0, 0, 0, 0.0),
          offset: Offset(0.0, 0.0),
          blurRadius: 0.0,
        ),
        BoxShadow(
          color: Color.fromRGBO(0, 0, 0, 0.0),
          offset: Offset(0.0, 0.0),
          blurRadius: 0.0,
        ),
        BoxShadow(
          color: Color.fromRGBO(0, 0, 0, 0.0),
          offset: Offset(0.0, 0.0),
          blurRadius: 0.0,
        ),
        BoxShadow(
          color: Color.fromRGBO(0, 0, 0, 0.251),
          offset: Offset(0.0, 25.0),
          blurRadius: 50.0,
          spreadRadius: -12.0,
        ),
      ],
      bodyMaxHeightFraction: null,
      panelMaxHeightFraction: 0.85,
      headerHeightPx: 48.0,
      headerPaddingHorizontalPx: 20.0,
      headerBorderBottomWidthPx: 1.0,
      headerBorderBottomColor: Color.fromRGBO(216, 223, 230, 1.0),
      headerFill: Color.fromRGBO(0, 0, 0, 0.0),
      titleFontSizePx: 13.0,
      titleFontWeight: 700,
      titleLineHeightPx: 19.5,
      titleLetterSpacingPx: -0.325,
      titleColor: Color.fromRGBO(13, 22, 36, 1.0),
      closeSizePx: 28.0,
      closeBorderRadiusPx: 33554400.0,
      closeFill: Color.fromRGBO(235, 241, 247, 1.0),
      closeFgColor: Color.fromRGBO(73, 86, 105, 1.0),
      closeBorderWidthPx: 1.0,
      closeBorderColor: Color.fromRGBO(216, 223, 230, 1.0),
      bodyPaddingWidePx: 24.0,
      bodyPaddingNarrowPx: 20.0,
      grip: AppModalGripSpec(
        widthPx: 40.0,
        heightPx: 4.0,
        radiusPx: 33554400.0,
        marginYPx: 12.0,
        fill: Color.fromRGBO(188, 197, 208, 1.0),
        displayWideCss: 'none',
        displayNarrowCss: 'block',
      ),
      panelSpringDamping: 26.0,
      panelSpringStiffness: 220.0,
      enterOpacityFrom: null,
      enterScale: null,
      enterOffsetYPx: null,
      enterOwnHeightFraction: 1.0,
      escapeCloses: false,
      bodyScrollLocks: true,
    ),
  };

  /// dark pass (utility stacks `dark-desktop`/`dark-phone`; states and
  /// motion from the authored non-CSS entries and the pinned sources).
  static const Map<String, AppModalSpec> dark = <String, AppModalSpec>{
    '.modal-panel': AppModalSpec(
      cssClass: '.modal-panel',
      shellPaddingWidePx: 24.0,
      shellPaddingNarrowPx: 16.0,
      shellAlignWideCss: 'center',
      shellAlignNarrowCss: 'center',
      shellOverflowYWideCss: 'auto',
      shellOverflowYNarrowCss: 'auto',
      shellZIndexCss: '50',
      panelZIndexCss: '10',
      veilColor: Color.fromRGBO(247, 248, 251, 0.4),
      veilBlurPx: 2.0,
      panelMaxWidthPx: 448.0,
      panelMarginYPx: 32.0,
      panelRadiusWidePx: 24.0,
      panelRadiusNarrowTopPx: 24.0,
      panelRadiusNarrowBottomPx: 24.0,
      panelBorderWidePx: 1.0,
      panelBorderNarrowTopPx: 1.0,
      panelBorderNarrowSidesPx: 1.0,
      panelBorderNarrowBottomPx: 1.0,
      panelFill: Color.fromRGBO(15, 21, 31, 1.0),
      panelBorderColor: Color.fromRGBO(33, 40, 51, 1.0),
      panelShadow: <BoxShadow>[
        BoxShadow(
          color: Color.fromRGBO(255, 255, 255, 0.07),
          offset: Offset(0.0, 1.0),
          blurRadius: 0.0,
        ),
        BoxShadow(
          color: Color.fromRGBO(0, 0, 0, 0.35),
          offset: Offset(0.0, 2.0),
          blurRadius: 6.0,
        ),
        BoxShadow(
          color: Color.fromRGBO(0, 0, 0, 0.32),
          offset: Offset(0.0, 10.0),
          blurRadius: 30.0,
        ),
      ],
      bodyMaxHeightFraction: 0.8,
      panelMaxHeightFraction: null,
      headerHeightPx: 48.0,
      headerPaddingHorizontalPx: 20.0,
      headerBorderBottomWidthPx: 1.0,
      headerBorderBottomColor: Color.fromRGBO(33, 40, 51, 1.0),
      headerFill: Color.fromRGBO(15, 21, 31, 1.0),
      titleFontSizePx: 13.0,
      titleFontWeight: 700,
      titleLineHeightPx: 19.5,
      titleLetterSpacingPx: -0.325,
      titleColor: Color.fromRGBO(247, 248, 251, 1.0),
      closeSizePx: 28.0,
      closeBorderRadiusPx: 33554400.0,
      closeFill: Color.fromRGBO(24, 32, 43, 1.0),
      closeFgColor: Color.fromRGBO(162, 172, 185, 1.0),
      closeBorderWidthPx: 1.0,
      closeBorderColor: Color.fromRGBO(33, 40, 51, 1.0),
      bodyPaddingWidePx: 24.0,
      bodyPaddingNarrowPx: 20.0,
      grip: null,
      panelSpringDamping: 26.0,
      panelSpringStiffness: 280.0,
      enterOpacityFrom: 0.0,
      enterScale: 0.98,
      enterOffsetYPx: 6.0,
      enterOwnHeightFraction: null,
      escapeCloses: true,
      bodyScrollLocks: true,
    ),
    '.sheet-panel': AppModalSpec(
      cssClass: '.sheet-panel',
      shellPaddingWidePx: 0.0,
      shellPaddingNarrowPx: 0.0,
      shellAlignWideCss: 'center',
      shellAlignNarrowCss: 'flex-end',
      shellOverflowYWideCss: 'visible',
      shellOverflowYNarrowCss: 'visible',
      shellZIndexCss: '50',
      panelZIndexCss: '10',
      veilColor: Color.fromRGBO(247, 248, 251, 0.4),
      veilBlurPx: 2.0,
      panelMaxWidthPx: 512.0,
      panelMarginYPx: 0.0,
      panelRadiusWidePx: 16.0,
      panelRadiusNarrowTopPx: 16.0,
      panelRadiusNarrowBottomPx: 0.0,
      panelBorderWidePx: 1.0,
      panelBorderNarrowTopPx: 1.0,
      panelBorderNarrowSidesPx: 0.0,
      panelBorderNarrowBottomPx: 0.0,
      panelFill: Color.fromRGBO(15, 21, 31, 1.0),
      panelBorderColor: Color.fromRGBO(33, 40, 51, 1.0),
      panelShadow: <BoxShadow>[
        BoxShadow(
          color: Color.fromRGBO(0, 0, 0, 0.0),
          offset: Offset(0.0, 0.0),
          blurRadius: 0.0,
        ),
        BoxShadow(
          color: Color.fromRGBO(0, 0, 0, 0.0),
          offset: Offset(0.0, 0.0),
          blurRadius: 0.0,
        ),
        BoxShadow(
          color: Color.fromRGBO(0, 0, 0, 0.0),
          offset: Offset(0.0, 0.0),
          blurRadius: 0.0,
        ),
        BoxShadow(
          color: Color.fromRGBO(0, 0, 0, 0.0),
          offset: Offset(0.0, 0.0),
          blurRadius: 0.0,
        ),
        BoxShadow(
          color: Color.fromRGBO(0, 0, 0, 0.251),
          offset: Offset(0.0, 25.0),
          blurRadius: 50.0,
          spreadRadius: -12.0,
        ),
      ],
      bodyMaxHeightFraction: null,
      panelMaxHeightFraction: 0.85,
      headerHeightPx: 48.0,
      headerPaddingHorizontalPx: 20.0,
      headerBorderBottomWidthPx: 1.0,
      headerBorderBottomColor: Color.fromRGBO(33, 40, 51, 1.0),
      headerFill: Color.fromRGBO(0, 0, 0, 0.0),
      titleFontSizePx: 13.0,
      titleFontWeight: 700,
      titleLineHeightPx: 19.5,
      titleLetterSpacingPx: -0.325,
      titleColor: Color.fromRGBO(247, 248, 251, 1.0),
      closeSizePx: 28.0,
      closeBorderRadiusPx: 33554400.0,
      closeFill: Color.fromRGBO(24, 32, 43, 1.0),
      closeFgColor: Color.fromRGBO(162, 172, 185, 1.0),
      closeBorderWidthPx: 1.0,
      closeBorderColor: Color.fromRGBO(33, 40, 51, 1.0),
      bodyPaddingWidePx: 24.0,
      bodyPaddingNarrowPx: 20.0,
      grip: AppModalGripSpec(
        widthPx: 40.0,
        heightPx: 4.0,
        radiusPx: 33554400.0,
        marginYPx: 12.0,
        fill: Color.fromRGBO(53, 62, 75, 1.0),
        displayWideCss: 'none',
        displayNarrowCss: 'block',
      ),
      panelSpringDamping: 26.0,
      panelSpringStiffness: 220.0,
      enterOpacityFrom: null,
      enterScale: null,
      enterOffsetYPx: null,
      enterOwnHeightFraction: 1.0,
      escapeCloses: false,
      bodyScrollLocks: true,
    ),
  };

  /// The state and motion rules, printed once because both passes author them
  /// identically (they are JS, not CSS):
  ///   veil fade 180ms — src/components/ui/Modal.tsx:54 and src/components/ui/BottomSheet.tsx:28:
  ///   `transition={{ duration: 0.18 }}`, with no easing authored; motion’s
  ///   own tween default applies ([veilFadeEase], a framework default read
  ///   from the shipped package, not a measurement).
  ///   dialog spring 26/280 — src/components/ui/Modal.tsx:67;
  ///   sheet spring 26/220 — src/components/ui/BottomSheet.tsx:39;
  ///   both mass 1 by motion’s default.
  ///   Escape closes the dialog only — src/components/ui/Modal.tsx:28; BottomSheet.tsx
  ///   has no Escape handler (generation fails if one appears).
  ///   both shells lock the document body while open — src/components/ui/Modal.tsx:31, src/components/ui/BottomSheet.tsx:15;
  ///   Flutter’s analogue is route hosting, see
  ///   [AppModalSpec.bodyScrollLocks].

  /// The clock the veils fade on, authored without a curve:
  static const int veilFadeMs = 180;

  static const Duration veilFadeDuration = Duration(milliseconds: veilFadeMs);

  /// The `ease = "easeInOut"` default of the tween the shells leave unset —
  /// motion's own cubic(0.42, 0, 0.58, 1), read from the package the app
  /// ships, not measured on the web. A framework default, logged as a
  /// deliberate deviation.
  static const Cubic veilFadeEase = Cubic(0.42, 0.0, 0.58, 1.0);

  /// Authored `<X size={13} />` in both shells (src/components/ui/Modal.tsx:86, src/components/ui/BottomSheet.tsx:58) —
  /// a px size prop, not CSS. The glyph stays the
  /// caller's widget; this is the size it is authored to render at.
  static const double closeGlyphSizePx = 13.0;

  /// The dialog’s prop default (`maxWidth = "md"`) and the
  /// map it selects, scoped to the three tokens this port
  /// was approved for. Each value is the measured `--container-*` token,
  /// equal on all four passes; the sheet ignores the map and keeps its own
  /// measured `max-w-lg` row.
  /// The web map also offers xl (src/components/ui/Modal.tsx:43), 2xl (src/components/ui/Modal.tsx:44) — outside this
  /// approved scope, so the port records their absence instead of
  /// exposing unpinned widths.
  static const String defaultWidthToken = 'md';

  static const Map<String, double> widthPx = <String, double>{
    'sm': 384.0,
    'md': 448.0,
    'lg': 512.0,
  };

  /// The alternate veil recipes the shells’ compositions parameterise:
  /// `bg-[var(--ink)]/40 backdrop-blur-[2px]` measured on both primitive
  /// veils (their own row default), and the `bg-black/60
  /// backdrop-blur-sm` of the feature-modal veils (`qa-veil`/`tem-veil`,
  /// black 0/0/0 at 0.6 on every pass, blur = the `--blur-sm` 8px token).
  /// DebtDetailModal authors the same black/60 over a literal
  /// `backdrop-blur-[6px]` — [debtVeilBlurPx].
  static const AppVeilRecipe inkVeilLight = AppVeilRecipe(
    color: Color.fromRGBO(13, 22, 36, 0.4),
    blurPx: 2.0,
  );

  static const AppVeilRecipe inkVeilDark = AppVeilRecipe(
    color: Color.fromRGBO(247, 248, 251, 0.4),
    blurPx: 2.0,
  );

  static const AppVeilRecipe dimVeilLight = AppVeilRecipe(
    color: Color.fromRGBO(0, 0, 0, 0.6),
    blurPx: 8.0,
  );

  static const AppVeilRecipe dimVeilDark = AppVeilRecipe(
    color: Color.fromRGBO(0, 0, 0, 0.6),
    blurPx: 8.0,
  );

  static const double debtVeilBlurPx = 6.0;

  /// The hairline under both headers: authored height in
  /// `src/index.css:373`, fill measured `.ledger-rule` in
  /// every pass (it tracks `--line` with the scheme).
  static const AppLedgerRuleSpec ledgerLight = AppLedgerRuleSpec(
    heightPx: 1.0,
    fill: Color.fromRGBO(216, 223, 230, 1.0),
  );

  static const AppLedgerRuleSpec ledgerDark = AppLedgerRuleSpec(
    heightPx: 1.0,
    fill: Color.fromRGBO(33, 40, 51, 1.0),
  );

  static AppLedgerRuleSpec ledger(Brightness brightness) =>
      brightness == Brightness.dark ? ledgerDark : ledgerLight;

  /// The measured shell for a panel class and brightness. An unknown class
  /// is a programming error, not a fallback: nothing in this layer may
  /// quietly become a Material default.
  static AppModalSpec resolve(String cssClass, Brightness brightness) {
    final Map<String, AppModalSpec> table = brightness == Brightness.dark
        ? dark
        : light;
    final AppModalSpec? spec = table[cssClass];
    if (spec == null) {
      throw ArgumentError('$cssClass is not a modal/sheet shell row');
    }
    return spec;
  }
}
