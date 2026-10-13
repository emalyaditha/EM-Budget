// GENERATED — do not edit by hand.
// Produced by `node parity/generate_theme.cjs` from `parity/ui-tokens.json`, the
// Chrome-computed measurement of `src/index.css` at tag `pre-flutter`, with the
// curated token lists and phone markers of `parity/UI_SPEC.md` §2.1–§4.
// Every value below is the measurement; UI_SPEC §5 (whose machine "Dart" column
// mis-parses --blur-* / --container-* names as radii) is deliberately not used.

import 'package:flutter/material.dart';

/// One text-bearing slot of the transaction row, measured as the class list the
/// component really writes on the element it really uses (`utilityStacks`), not as
/// a detached probe: a §6 probe cannot see a Tailwind utility, so for this family
/// the stack row *is* the measurement and `src/index.css` supplies only the authored
/// facts a detached element never shows — a state rule, a `gap`, the `em` a
/// measured tracking came from.
///
/// Nothing here is a default. A value no pass measured fails generation, and every
/// number the phone read has to agree with the desktop pass, or the pair is ported
/// explicitly as [AppLedgerRailSpec]’s wide/narrow instead of one averaged value.
class AppTxRowSlotSpec {
  const AppTxRowSlotSpec({
    required this.stackRow,
    required this.cssClasses,
    required this.authoredSrc,
    required this.displayCss,
    required this.alignItemsCss,
    this.gapPx,
    required this.fontFamily,
    required this.fontSizePx,
    required this.fontWeight,
    required this.heightRatio,
    required this.letterSpacingPx,
    required this.letterSpacingEm,
    required this.textColor,
    this.authoredColorToken,
    required this.truncates,
    required this.flexGrow,
    required this.flexShrink,
    this.minWidthZero,
    this.textAlignCss,
    required this.tabularNums,
  });

  /// The `utilityStacks` row this slot was measured from.
  final String stackRow;

  /// The verbatim class list the component writes on this element.
  final String cssClasses;

  /// `file:lines` of that class list, re-checked against the pinned source before emission.
  final String authoredSrc;

  /// The measured `display`, which is what the widget lays out as.
  final String displayCss;

  /// The measured `align-items`; `normal` where no flex axis asks for one.
  final String alignItemsCss;

  /// The measured `gap` in phone px, `null` where the row measures `normal` — which is no gap.
  final double? gapPx;

  /// The first family of the stack this slot paints in — the §6 probe that authors it
  /// (`.mono` for a slot that cites the class, `body` for one that inherits), never the
  /// 45 measured properties, which do not carry a font stack.
  final String fontFamily;

  /// The phone font size.
  final double fontSizePx;

  /// The measured numeric weight, carried as a number so [weight] can name it.
  final int fontWeight;

  /// The line box as a multiplier of the size. No slot here authors a line-height,
  /// so every one of them sits on `body`’s inherited multiplier — which generation
  /// re-reads from the §6 `body` probe and requires to be byte-identical to the
  /// ratio the row measured, in both brightnesses.
  final double heightRatio;

  /// The phone resolution of the tracking.
  final double letterSpacingPx;

  /// The `em` that produced it, so [styleAt] can re-derive it at another size.
  final double letterSpacingEm;

  /// The colour the slot painted.
  final Color textColor;

  /// The `:root` token the cited class or inline style selects, which the measurement
  /// had to reproduce exactly; `null` where the slot inherits and paints `body`’s ink.
  final String? authoredColorToken;

  /// `truncate`, proven as the trio it actually measures (`white-space: nowrap`,
  /// `text-overflow: ellipsis`, `overflow: hidden`) and as a word of the class list.
  final bool truncates;

  /// The measured `flex-grow`.
  final double flexGrow;

  /// The measured `flex-shrink`.
  final double flexShrink;

  /// `min-w-0`, only where the row asked for the property: a flex-item hint that lets a
  /// long figure shrink below its content width. Flutter already gives a `Text` its
  /// parent's max width, so there is nothing to port — `null` says the property was
  /// never measured and is therefore not a fact about this slot.
  final bool? minWidthZero;

  /// The measured `text-align` where the row asked for it, else `null`.
  final String? textAlignCss;

  /// `font-variant-numeric: tabular-nums`, which the cited family authors and the
  /// widget answers with [FontFeature.tabularFigures] — a font feature, so it does
  /// nothing in a fallback face.
  final bool tabularNums;

  /// The weight Flutter names for the measured numeric weight.
  FontWeight get weight => FontWeight.values[fontWeight ~/ 100 - 1];

  /// Tabular figures where the cited class authors them.
  List<FontFeature> get fontFeatures => tabularNums
      ? const <FontFeature>[FontFeature.tabularFigures()]
      : const <FontFeature>[];

  /// The slot as the phone pass measured it.
  TextStyle get textStyle => styleAt(fontSizePx);

  /// The slot at another font size. CSS resolves tracking against the used font
  /// size, so a resized slot re-derives it from [letterSpacingEm] rather than
  /// keeping the phone pixels; the line box travels as its multiplier.
  TextStyle styleAt(double sizePx) => TextStyle(
    fontFamily: fontFamily,
    color: textColor,
    fontSize: sizePx,
    fontWeight: weight,
    height: heightRatio,
    letterSpacing: letterSpacingEm * sizePx,
    fontFeatures: fontFeatures,
  );
}

/// The transaction row: one `.tx-row pressable` box and the seven text slots it
/// lays out, as each brightness measured them.
///
/// The box owns nothing but its inset, its radius, its `gap` and its press. It
/// paints no fill, no frame, no shadow and no backdrop at rest — all four are
/// asserted empty rather than assumed — and its padding and `--r-sm` radius are
/// byte-equal to the §6 `.tx-row` probe, which is what says no utility moved it.
///
/// Unported authored state, dropped for the reason AppControls drops it (UI_SPEC
/// D-U1): `.tx-row:hover` at src/index.css:1128 paints `--surface-2`,
/// a paint-only decoration. The press is not decoration and is ported: two
/// unlayered rules claim this box: `.tx-row:active`
/// (src/index.css:1131) scales to [overriddenPressScale] and
/// `.pressable:active`
/// (src/index.css:1342) scales to [pressScale], and
/// because the later unlayered rule wins outright the row paints the second.
/// Generation reads that order off the sheet rather than assuming it, and fails if
/// the rules are ever reordered.
///
/// The row formats nothing. Money strings come from the already-ported formatters
/// and the meta line is a string its caller composes, exactly as the web composes
/// it; the signed/absolute amount and the `isIncome` flag are the caller’s too,
/// because the web’s two predicates disagree and a port must not pick a side.
class AppTxRowSpec {
  const AppTxRowSpec({
    required this.stackRow,
    required this.cssClasses,
    required this.authoredSrc,
    required this.displayCss,
    required this.alignItemsCss,
    required this.justifyContentCss,
    required this.gapPx,
    required this.paddingVerticalPx,
    required this.paddingHorizontalPx,
    required this.radiusPx,
    required this.radiusToken,
    required this.fillColor,
    required this.inkColor,
    required this.cursorCss,
    required this.flexShrink,
    required this.pressScale,
    required this.overriddenPressScale,
    required this.pressDurationMs,
    required this.easeX1,
    required this.easeY1,
    required this.easeX2,
    required this.easeY2,
    required this.title,
    required this.meta,
    required this.textWrap,
    required this.amountWrap,
    required this.amountIn,
    required this.amountOut,
    required this.pill,
  });

  /// The `utilityStacks` row the box was measured from.
  final String stackRow;

  /// The verbatim class list of the row element.
  final String cssClasses;

  /// `file:line` of that class list.
  final String authoredSrc;

  /// `display`, byte-equal to the §6 `.tx-row` probe: no utility moved the box.
  final String displayCss;

  /// The measured `align-items`.
  final String alignItemsCss;

  /// The measured `justify-content`.
  final String justifyContentCss;

  /// `gap`, identical on both axes and equal to what `.tx-row` authors.
  final double gapPx;

  /// The symmetric pair `.tx-row` authors, which the composed row reproduces exactly.
  final double paddingVerticalPx;

  final double paddingHorizontalPx;

  /// `border-radius`, as `--r-sm` resolves at the phone pass.
  final double radiusPx;

  /// The token that radius names.
  final String radiusToken;

  /// Always transparent: the row paints nothing until `:hover`, which the port drops
  /// (UI_SPEC D-U1). Generation fails if a fill ever appears in the resting measurement.
  final Color fillColor;

  /// `--ink`, the colour the slots inherit unless one names its own token.
  final Color inkColor;

  /// The measured `cursor`, a web-only fact the port has no knob for.
  final String cursorCss;

  /// The measured `flex-shrink` of the row in its list.
  final double flexShrink;

  /// `.pressable:active`’s scale (`src/index.css:1342`) — the one the
  /// row really paints, because both unlayered active rules claim it and the later
  /// one wins outright.
  final double pressScale;

  /// `.tx-row:active`’s scale (`src/index.css:1131`), recorded as the
  /// loser so a reordering of the sheet cannot silently change what the press paints.
  final double overriddenPressScale;

  /// The clock both pressable rules name (--dur-fast,
  /// `src/index.css:1339`), which generation requires to be the same
  /// duration and curve `.tx-row` would have run.
  final int pressDurationMs;

  /// --ease-out as the four cubic points.
  final double easeX1;

  final double easeY1;

  final double easeX2;

  final double easeY2;

  /// The category name.
  final AppTxRowSlotSpec title;

  /// The second line — a string its caller composes, never something the row works out.
  final AppTxRowSlotSpec meta;

  /// The column the two text lines share.
  final AppTxRowSlotSpec textWrap;

  /// The right-hand column, aligned by measurement rather than by assumption.
  final AppTxRowSlotSpec amountWrap;

  /// The amount as painted for income (`--success`).
  final AppTxRowSlotSpec amountIn;

  /// The amount as painted for expense (`--danger`) — the same row, one property different.
  final AppTxRowSlotSpec amountOut;

  /// The trailing type pill: `.pill`’s box with `!py-0.5 !px-2` over it, `.mono`’s
  /// family, and a `hidden sm:inline-flex` pair that is inert because `.pill` authors
  /// an unlayered `display` — so both viewports measure it painted.
  final AppTxRowSlotSpec pill;

  /// The inset `.tx-row` authors, which the composed row reproduces byte for byte.
  EdgeInsets get padding => EdgeInsets.symmetric(
    vertical: paddingVerticalPx,
    horizontal: paddingHorizontalPx,
  );

  /// `--r-sm` as painted.
  BorderRadius get radius => BorderRadius.circular(radiusPx);

  /// --dur-fast — the clock both pressable rules name.
  Duration get pressDuration => Duration(milliseconds: pressDurationMs);

  /// --ease-out — the easing both pressable rules name.
  Cubic get pressCurve => Cubic(easeX1, easeY1, easeX2, easeY2);
}

/// The sticky day header above a run of rows: a `.day-head` box whose only job is
/// to hold text back while the list scrolls under it, and the `.eyebrow` label
/// inside it.
///
/// Its fill is a recipe, not a token — [fillMixPercent] of [fillToken] over
/// transparent — and its blur is the authored `backdrop-filter` of `.day-head`.
/// Its type is `.eyebrow`’s own label row, re-read here and cross-checked against
/// that class’s §6 probe rather than copied from it, which is also why
/// [redundantSizeOverride] is only a record: the `!text-[10px]` beside the class
/// restates a size the class already authors.
class AppDayHeadSpec {
  const AppDayHeadSpec({
    required this.stackRow,
    required this.cssClasses,
    required this.authoredSrc,
    required this.displayCss,
    required this.zIndexCss,
    required this.paddingVerticalPx,
    required this.paddingHorizontalPx,
    required this.blurPx,
    required this.fillColor,
    required this.fillToken,
    required this.fillMixPercent,
    required this.labelCssClass,
    required this.labelAuthoredSrc,
    required this.uppercase,
    required this.redundantSizeOverride,
    required this.textColor,
    required this.fontSizePx,
    required this.fontWeight,
    required this.heightRatio,
    required this.letterSpacingPx,
    required this.letterSpacingEm,
  });

  /// The `utilityStacks` row the header label was measured from.
  final String stackRow;

  /// The verbatim class list of the sticky label.
  final String cssClasses;

  /// `file:lines` of that class list.
  final String authoredSrc;

  final String displayCss;

  /// `z-index`, measured and required equal to what `.day-head` authors.
  final String zIndexCss;

  /// `.day-head`’s authored padding, which the composed header reproduces.
  final double paddingVerticalPx;

  final double paddingHorizontalPx;

  /// `backdrop-filter: blur(…)` as authored by `.day-head`, in CSS radius units.
  final double blurPx;

  /// The pixels the header painted.
  final Color fillColor;

  /// `fillMixPercent` of this `:root` token over transparent, which is the recipe
  /// `.day-head` authors and which the measurement had to match in hex and in alpha
  /// in both brightnesses.
  final String fillToken;

  final double fillMixPercent;

  /// The class the header’s type comes from — `.eyebrow`, read from its §6 probe.
  final String labelCssClass;

  /// Where that rule lives.
  final String labelAuthoredSrc;

  /// `text-transform: uppercase`, which `.eyebrow` authors and the header measures.
  /// Flutter has no text-transform, so the widget answers it with `toUpperCase()` at
  /// the label — a deviation the port records rather than hides.
  final bool uppercase;

  /// The class list also writes `!text-[10px]` beside `.eyebrow`, which re-states the
  /// size the class already authors. Recorded because it is inert, not because the
  /// port needs a second size.
  final bool redundantSizeOverride;

  /// `.eyebrow`’s colour (`--ink-3`), which the header painted.
  final Color textColor;

  final double fontSizePx;

  final int fontWeight;

  /// `body`’s inherited multiplier — `.eyebrow` authors no line-height of its own.
  final double heightRatio;

  final double letterSpacingPx;

  /// `.eyebrow`’s authored `em`, which generation proves against the measured px.
  final double letterSpacingEm;

  /// CSS blur radius → Flutter sigma, ruling D-U8’s fixed mapping.
  double get blurSigmaPx => blurPx / 2;

  EdgeInsets get padding => EdgeInsets.symmetric(
    vertical: paddingVerticalPx,
    horizontal: paddingHorizontalPx,
  );

  FontWeight get weight => FontWeight.values[fontWeight ~/ 100 - 1];

  /// The label as the phone measured it.
  TextStyle get textStyle => styleAt(fontSizePx);

  /// The label at another size, with its tracking re-derived from the authored `em`.
  TextStyle styleAt(double sizePx) => TextStyle(
    color: textColor,
    fontSize: sizePx,
    fontWeight: weight,
    height: heightRatio,
    letterSpacing: letterSpacingEm * sizePx,
  );
}

/// The hairline `divide-y` paints between rows.
///
/// It is a pair of recipes, measured on two siblings: a divided child that keeps
/// the line and `[&:last-child]:border-b-0` on the last one, which generation
/// requires to move nothing else in that child's measurement.
class AppLedgerDividerSpec {
  const AppLedgerDividerSpec({
    required this.widthPx,
    required this.color,
    required this.token,
  });

  /// `divide-y`’s hairline, measured on a divided child that keeps it.
  final double widthPx;

  /// The line the parent’s own `currentColor` resolves to.
  final Color color;

  /// `--line`, which the measurement had to reproduce exactly.
  final String token;
}

/// The dashboard’s empty state: a dashed `--line` frame over `--surface-2`,
/// rounded with `--r-sm`, inset vertically and centred.
class AppLedgerEmptySpec {
  const AppLedgerEmptySpec({
    required this.stackRow,
    required this.cssClasses,
    required this.authoredSrc,
    required this.radiusPx,
    required this.borderWidthPx,
    required this.borderColor,
    required this.fillColor,
    required this.paddingVerticalPx,
    required this.textAlignCss,
  });

  final String stackRow;

  final String cssClasses;

  final String authoredSrc;

  /// `--r-sm`, as it resolves at the phone pass.
  final double radiusPx;

  /// 1px on all four sides.
  final double borderWidthPx;

  /// `--line`.
  final Color borderColor;

  /// `--surface-2`.
  final Color fillColor;

  /// Vertical only — the measurement has no horizontal inset.
  final double paddingVerticalPx;

  final String textAlignCss;

  /// The CSS frame is `dashed`; Flutter `Border` has no dash pattern, so the port
  /// paints a solid hairline of the same width and colour. Recorded deviation, not
  /// a token disagreement.
  Border get border => Border.all(color: borderColor, width: borderWidthPx);

  BorderRadius get radius => BorderRadius.circular(radiusPx);

  EdgeInsets get padding => EdgeInsets.symmetric(vertical: paddingVerticalPx);
}

/// The Reports Centre’s empty state: a bare flex column, with the web's own
/// oddity carried as data (see [cssClasses]).
class AppLedgerEmptyRcSpec {
  const AppLedgerEmptyRcSpec({
    required this.stackRow,
    required this.cssClasses,
    required this.authoredSrc,
    required this.gapPx,
    required this.paddingVerticalPx,
    required this.line,
  });

  final String stackRow;

  /// The class list, which cites `empty` — a class applied in `ReportsCentre.tsx` and
  /// declared nowhere in `src/index.css`. The box therefore measures no fill, no frame
  /// and no padding beyond its own utilities, and generation asserts the rule is still
  /// absent rather than trusting the record forever.
  final String cssClasses;

  final String authoredSrc;

  /// Identical on both axes.
  final double gapPx;

  final double paddingVerticalPx;

  /// The figure under the headline, read the same way as a row slot.
  final AppTxRowSlotSpec line;
}

/// A scroll rail, ported as the one pair the two viewports genuinely disagree on.
///
/// These are the only values in this file that are read at both viewports instead
/// of required to agree, because the rail’s `lg:` gating is the design: the
/// dashboard list is bounded and scrollable only past the breakpoint, the Reports
/// Centre’s list is bounded at both. Brightness changes nothing about a rail, so
/// generation proves all four passes read as two pairs.
///
/// The breakpoint itself stays with the caller — the same ruling that keeps
/// `AppModal.wideBreakpointPx` a caller-supplied number: the enumeration of
/// `sm`/`md`/`lg`/`xl` is a fact about the sheet (UI_SPEC/STATUS.md), not a
/// measured property of these rows, so a widget takes the px rather than this
/// file guessing it.
class AppLedgerRailSpec {
  const AppLedgerRailSpec({
    required this.stackRow,
    required this.cssClasses,
    required this.authoredSrc,
    this.wideMaxHeightPx,
    this.narrowMaxHeightPx,
    required this.wideOverflowYCss,
    required this.narrowOverflowYCss,
    required this.wideOverflowXCss,
    required this.narrowOverflowXCss,
    required this.widePaddingRightPx,
    required this.narrowPaddingRightPx,
  });

  final String stackRow;

  final String cssClasses;

  final String authoredSrc;

  /// `max-height` at the desktop pass — `null` where the rail is unbounded there.
  final double? wideMaxHeightPx;

  /// `max-height` at the phone pass.
  final double? narrowMaxHeightPx;

  final String wideOverflowYCss;

  final String narrowOverflowYCss;

  final String wideOverflowXCss;

  final String narrowOverflowXCss;

  /// The scrollbar gutter the rail reserves on one side only, nothing on the other three.
  final double widePaddingRightPx;

  final double narrowPaddingRightPx;
}

/// The row, its header and the chrome the ledger builds around them.
///
/// Values are per brightness; a rail is not, and lives outside the pair. An unknown
/// key is a programming error, never a fallback — the same law every other generated
/// family follows.
abstract final class AppRows {
  static const AppTxRowSpec txRowLight = AppTxRowSpec(
    stackRow: 'txrow-box',
    cssClasses: 'tx-row w-full text-left pressable',
    authoredSrc: 'src/components/ui/TransactionRow.tsx:28',
    displayCss: 'flex',
    alignItemsCss: 'center',
    justifyContentCss: 'normal',
    gapPx: 12.0,
    paddingVerticalPx: 12.0,
    paddingHorizontalPx: 10.0,
    radiusPx: 14.0,
    radiusToken: '--r-sm',
    fillColor: Color.fromRGBO(0, 0, 0, 0.0),
    inkColor: Color.fromRGBO(13, 22, 36, 1.0),
    cursorCss: 'pointer',
    flexShrink: 1.0,
    pressScale: 0.97,
    overriddenPressScale: 0.995,
    pressDurationMs: 130,
    easeX1: 0.22,
    easeY1: 1.0,
    easeX2: 0.36,
    easeY2: 1.0,
    title: AppTxRowSlotSpec(
      stackRow: 'txrow-title',
      cssClasses: 'block text-[13px] font-semibold tracking-tight text-[var(--ink)] truncate',
      authoredSrc: 'src/components/ui/TransactionRow.tsx:31',
      displayCss: 'block',
      alignItemsCss: 'normal',
      gapPx: null,
      fontFamily: 'Inter',
      fontSizePx: 13.0,
      fontWeight: 600,
      heightRatio: 1.5,
      letterSpacingPx: -0.325,
      letterSpacingEm: -0.025,
      textColor: Color.fromRGBO(13, 22, 36, 1.0),
      authoredColorToken: '--ink',
      truncates: true,
      flexGrow: 0.0,
      flexShrink: 1.0,
      minWidthZero: null,
      textAlignCss: null,
      tabularNums: false,
    ),
    meta: AppTxRowSlotSpec(
      stackRow: 'txrow-meta',
      cssClasses: 'block text-[11px] text-[var(--ink-3)] mt-0.5 truncate',
      authoredSrc: 'src/components/ui/TransactionRow.tsx:32',
      displayCss: 'block',
      alignItemsCss: 'normal',
      gapPx: null,
      fontFamily: 'Inter',
      fontSizePx: 11.0,
      fontWeight: 400,
      heightRatio: 1.5,
      letterSpacingPx: 0.0,
      letterSpacingEm: 0.0,
      textColor: Color.fromRGBO(123, 135, 153, 1.0),
      authoredColorToken: '--ink-3',
      truncates: true,
      flexGrow: 0.0,
      flexShrink: 1.0,
      minWidthZero: null,
      textAlignCss: null,
      tabularNums: false,
    ),
    textWrap: AppTxRowSlotSpec(
      stackRow: 'txrow-text-wrap',
      cssClasses: 'min-w-0 flex-1',
      authoredSrc: 'src/components/ui/TransactionRow.tsx:30',
      displayCss: 'block',
      alignItemsCss: 'normal',
      gapPx: null,
      fontFamily: 'Inter',
      fontSizePx: 16.0,
      fontWeight: 400,
      heightRatio: 1.5,
      letterSpacingPx: 0.0,
      letterSpacingEm: 0.0,
      textColor: Color.fromRGBO(13, 22, 36, 1.0),
      authoredColorToken: null,
      truncates: false,
      flexGrow: 1.0,
      flexShrink: 1.0,
      minWidthZero: true,
      textAlignCss: null,
      tabularNums: false,
    ),
    amountWrap: AppTxRowSlotSpec(
      stackRow: 'txrow-amount-wrap',
      cssClasses: 'text-right shrink-0',
      authoredSrc: 'src/components/ui/TransactionRow.tsx:36',
      displayCss: 'block',
      alignItemsCss: 'normal',
      gapPx: null,
      fontFamily: 'Inter',
      fontSizePx: 16.0,
      fontWeight: 400,
      heightRatio: 1.5,
      letterSpacingPx: 0.0,
      letterSpacingEm: 0.0,
      textColor: Color.fromRGBO(13, 22, 36, 1.0),
      authoredColorToken: null,
      truncates: false,
      flexGrow: 0.0,
      flexShrink: 0.0,
      minWidthZero: null,
      textAlignCss: 'right',
      tabularNums: false,
    ),
    amountIn: AppTxRowSlotSpec(
      stackRow: 'txrow-amount-in',
      cssClasses: 'money inline-flex items-center gap-1 text-[13px] font-bold',
      authoredSrc: 'src/components/ui/TransactionRow.tsx:38,39',
      displayCss: 'inline-flex',
      alignItemsCss: 'center',
      gapPx: 4.0,
      fontFamily: 'Inter',
      fontSizePx: 13.0,
      fontWeight: 700,
      heightRatio: 1.5,
      letterSpacingPx: -0.13,
      letterSpacingEm: -0.01,
      textColor: Color.fromRGBO(0, 140, 83, 1.0),
      authoredColorToken: '--success',
      truncates: false,
      flexGrow: 0.0,
      flexShrink: 1.0,
      minWidthZero: null,
      textAlignCss: null,
      tabularNums: true,
    ),
    amountOut: AppTxRowSlotSpec(
      stackRow: 'txrow-amount-out',
      cssClasses: 'money inline-flex items-center gap-1 text-[13px] font-bold',
      authoredSrc: 'src/components/ui/TransactionRow.tsx:38,39',
      displayCss: 'inline-flex',
      alignItemsCss: 'center',
      gapPx: 4.0,
      fontFamily: 'Inter',
      fontSizePx: 13.0,
      fontWeight: 700,
      heightRatio: 1.5,
      letterSpacingPx: -0.13,
      letterSpacingEm: -0.01,
      textColor: Color.fromRGBO(204, 49, 67, 1.0),
      authoredColorToken: '--danger',
      truncates: false,
      flexGrow: 0.0,
      flexShrink: 1.0,
      minWidthZero: null,
      textAlignCss: null,
      tabularNums: true,
    ),
    pill: AppTxRowSlotSpec(
      stackRow: 'txrow-trailing-pill',
      cssClasses: 'pill mono !text-[9px] !py-0.5 !px-2 hidden sm:inline-flex',
      authoredSrc: 'src/components/ReportsCentre.tsx:522',
      displayCss: 'inline-flex',
      alignItemsCss: 'center',
      gapPx: 6.0,
      fontFamily: 'JetBrains Mono',
      fontSizePx: 9.0,
      fontWeight: 600,
      heightRatio: 1.5,
      letterSpacingPx: 0.0,
      letterSpacingEm: 0.0,
      textColor: Color.fromRGBO(13, 22, 36, 1.0),
      authoredColorToken: '--ink',
      truncates: false,
      flexGrow: 0.0,
      flexShrink: 1.0,
      minWidthZero: null,
      textAlignCss: null,
      tabularNums: true,
    ),
  );

  static const AppTxRowSpec txRowDark = AppTxRowSpec(
    stackRow: 'txrow-box',
    cssClasses: 'tx-row w-full text-left pressable',
    authoredSrc: 'src/components/ui/TransactionRow.tsx:28',
    displayCss: 'flex',
    alignItemsCss: 'center',
    justifyContentCss: 'normal',
    gapPx: 12.0,
    paddingVerticalPx: 12.0,
    paddingHorizontalPx: 10.0,
    radiusPx: 14.0,
    radiusToken: '--r-sm',
    fillColor: Color.fromRGBO(0, 0, 0, 0.0),
    inkColor: Color.fromRGBO(247, 248, 251, 1.0),
    cursorCss: 'pointer',
    flexShrink: 1.0,
    pressScale: 0.97,
    overriddenPressScale: 0.995,
    pressDurationMs: 130,
    easeX1: 0.22,
    easeY1: 1.0,
    easeX2: 0.36,
    easeY2: 1.0,
    title: AppTxRowSlotSpec(
      stackRow: 'txrow-title',
      cssClasses: 'block text-[13px] font-semibold tracking-tight text-[var(--ink)] truncate',
      authoredSrc: 'src/components/ui/TransactionRow.tsx:31',
      displayCss: 'block',
      alignItemsCss: 'normal',
      gapPx: null,
      fontFamily: 'Inter',
      fontSizePx: 13.0,
      fontWeight: 600,
      heightRatio: 1.5,
      letterSpacingPx: -0.325,
      letterSpacingEm: -0.025,
      textColor: Color.fromRGBO(247, 248, 251, 1.0),
      authoredColorToken: '--ink',
      truncates: true,
      flexGrow: 0.0,
      flexShrink: 1.0,
      minWidthZero: null,
      textAlignCss: null,
      tabularNums: false,
    ),
    meta: AppTxRowSlotSpec(
      stackRow: 'txrow-meta',
      cssClasses: 'block text-[11px] text-[var(--ink-3)] mt-0.5 truncate',
      authoredSrc: 'src/components/ui/TransactionRow.tsx:32',
      displayCss: 'block',
      alignItemsCss: 'normal',
      gapPx: null,
      fontFamily: 'Inter',
      fontSizePx: 11.0,
      fontWeight: 400,
      heightRatio: 1.5,
      letterSpacingPx: 0.0,
      letterSpacingEm: 0.0,
      textColor: Color.fromRGBO(103, 114, 131, 1.0),
      authoredColorToken: '--ink-3',
      truncates: true,
      flexGrow: 0.0,
      flexShrink: 1.0,
      minWidthZero: null,
      textAlignCss: null,
      tabularNums: false,
    ),
    textWrap: AppTxRowSlotSpec(
      stackRow: 'txrow-text-wrap',
      cssClasses: 'min-w-0 flex-1',
      authoredSrc: 'src/components/ui/TransactionRow.tsx:30',
      displayCss: 'block',
      alignItemsCss: 'normal',
      gapPx: null,
      fontFamily: 'Inter',
      fontSizePx: 16.0,
      fontWeight: 400,
      heightRatio: 1.5,
      letterSpacingPx: 0.0,
      letterSpacingEm: 0.0,
      textColor: Color.fromRGBO(247, 248, 251, 1.0),
      authoredColorToken: null,
      truncates: false,
      flexGrow: 1.0,
      flexShrink: 1.0,
      minWidthZero: true,
      textAlignCss: null,
      tabularNums: false,
    ),
    amountWrap: AppTxRowSlotSpec(
      stackRow: 'txrow-amount-wrap',
      cssClasses: 'text-right shrink-0',
      authoredSrc: 'src/components/ui/TransactionRow.tsx:36',
      displayCss: 'block',
      alignItemsCss: 'normal',
      gapPx: null,
      fontFamily: 'Inter',
      fontSizePx: 16.0,
      fontWeight: 400,
      heightRatio: 1.5,
      letterSpacingPx: 0.0,
      letterSpacingEm: 0.0,
      textColor: Color.fromRGBO(247, 248, 251, 1.0),
      authoredColorToken: null,
      truncates: false,
      flexGrow: 0.0,
      flexShrink: 0.0,
      minWidthZero: null,
      textAlignCss: 'right',
      tabularNums: false,
    ),
    amountIn: AppTxRowSlotSpec(
      stackRow: 'txrow-amount-in',
      cssClasses: 'money inline-flex items-center gap-1 text-[13px] font-bold',
      authoredSrc: 'src/components/ui/TransactionRow.tsx:38,39',
      displayCss: 'inline-flex',
      alignItemsCss: 'center',
      gapPx: 4.0,
      fontFamily: 'Inter',
      fontSizePx: 13.0,
      fontWeight: 700,
      heightRatio: 1.5,
      letterSpacingPx: -0.13,
      letterSpacingEm: -0.01,
      textColor: Color.fromRGBO(73, 219, 166, 1.0),
      authoredColorToken: '--success',
      truncates: false,
      flexGrow: 0.0,
      flexShrink: 1.0,
      minWidthZero: null,
      textAlignCss: null,
      tabularNums: true,
    ),
    amountOut: AppTxRowSlotSpec(
      stackRow: 'txrow-amount-out',
      cssClasses: 'money inline-flex items-center gap-1 text-[13px] font-bold',
      authoredSrc: 'src/components/ui/TransactionRow.tsx:38,39',
      displayCss: 'inline-flex',
      alignItemsCss: 'center',
      gapPx: 4.0,
      fontFamily: 'Inter',
      fontSizePx: 13.0,
      fontWeight: 700,
      heightRatio: 1.5,
      letterSpacingPx: -0.13,
      letterSpacingEm: -0.01,
      textColor: Color.fromRGBO(236, 115, 128, 1.0),
      authoredColorToken: '--danger',
      truncates: false,
      flexGrow: 0.0,
      flexShrink: 1.0,
      minWidthZero: null,
      textAlignCss: null,
      tabularNums: true,
    ),
    pill: AppTxRowSlotSpec(
      stackRow: 'txrow-trailing-pill',
      cssClasses: 'pill mono !text-[9px] !py-0.5 !px-2 hidden sm:inline-flex',
      authoredSrc: 'src/components/ReportsCentre.tsx:522',
      displayCss: 'inline-flex',
      alignItemsCss: 'center',
      gapPx: 6.0,
      fontFamily: 'JetBrains Mono',
      fontSizePx: 9.0,
      fontWeight: 600,
      heightRatio: 1.5,
      letterSpacingPx: 0.0,
      letterSpacingEm: 0.0,
      textColor: Color.fromRGBO(247, 248, 251, 1.0),
      authoredColorToken: '--ink',
      truncates: false,
      flexGrow: 0.0,
      flexShrink: 1.0,
      minWidthZero: null,
      textAlignCss: null,
      tabularNums: true,
    ),
  );

  static AppTxRowSpec txRow(Brightness brightness) =>
      brightness == Brightness.dark ? txRowDark : txRowLight;

  static const AppDayHeadSpec dayHeadLight = AppDayHeadSpec(
    stackRow: 'day-head-label',
    cssClasses: 'day-head eyebrow !text-[10px]',
    authoredSrc: 'src/components/Dashboard.tsx:422',
    displayCss: 'block',
    zIndexCss: '5',
    paddingVerticalPx: 6.0,
    paddingHorizontalPx: 4.0,
    blurPx: 14.0,
    fillColor: Color.fromRGBO(239, 244, 249, 0.78),
    fillToken: '--bg',
    fillMixPercent: 78.0,
    labelCssClass: '.eyebrow',
    labelAuthoredSrc: 'src/index.css:366',
    uppercase: true,
    redundantSizeOverride: true,
    textColor: Color.fromRGBO(123, 135, 153, 1.0),
    fontSizePx: 10.0,
    fontWeight: 700,
    heightRatio: 1.5,
    letterSpacingPx: 1.2,
    letterSpacingEm: 0.12,
  );

  static const AppDayHeadSpec dayHeadDark = AppDayHeadSpec(
    stackRow: 'day-head-label',
    cssClasses: 'day-head eyebrow !text-[10px]',
    authoredSrc: 'src/components/Dashboard.tsx:422',
    displayCss: 'block',
    zIndexCss: '5',
    paddingVerticalPx: 6.0,
    paddingHorizontalPx: 4.0,
    blurPx: 14.0,
    fillColor: Color.fromRGBO(3, 8, 16, 0.78),
    fillToken: '--bg',
    fillMixPercent: 78.0,
    labelCssClass: '.eyebrow',
    labelAuthoredSrc: 'src/index.css:366',
    uppercase: true,
    redundantSizeOverride: true,
    textColor: Color.fromRGBO(103, 114, 131, 1.0),
    fontSizePx: 10.0,
    fontWeight: 700,
    heightRatio: 1.5,
    letterSpacingPx: 1.2,
    letterSpacingEm: 0.12,
  );

  static AppDayHeadSpec dayHead(Brightness brightness) =>
      brightness == Brightness.dark ? dayHeadDark : dayHeadLight;

  static const AppLedgerDividerSpec dividerLight = AppLedgerDividerSpec(
    widthPx: 1.0,
    color: Color.fromRGBO(216, 223, 230, 1.0),
    token: '--line',
  );

  static const AppLedgerDividerSpec dividerDark = AppLedgerDividerSpec(
    widthPx: 1.0,
    color: Color.fromRGBO(33, 40, 51, 1.0),
    token: '--line',
  );

  static AppLedgerDividerSpec divider(Brightness brightness) =>
      brightness == Brightness.dark ? dividerDark : dividerLight;

  static const AppLedgerEmptySpec emptyLight = AppLedgerEmptySpec(
    stackRow: 'ledger-empty',
    cssClasses: 'py-10 text-center rounded-[var(--r-sm)] border border-dashed border-[var(--line)] bg-[var(--surface-2)]',
    authoredSrc: 'src/components/Dashboard.tsx:408',
    radiusPx: 14.0,
    borderWidthPx: 1.0,
    borderColor: Color.fromRGBO(216, 223, 230, 1.0),
    fillColor: Color.fromRGBO(235, 241, 247, 1.0),
    paddingVerticalPx: 40.0,
    textAlignCss: 'center',
  );

  static const AppLedgerEmptySpec emptyDark = AppLedgerEmptySpec(
    stackRow: 'ledger-empty',
    cssClasses: 'py-10 text-center rounded-[var(--r-sm)] border border-dashed border-[var(--line)] bg-[var(--surface-2)]',
    authoredSrc: 'src/components/Dashboard.tsx:408',
    radiusPx: 14.0,
    borderWidthPx: 1.0,
    borderColor: Color.fromRGBO(33, 40, 51, 1.0),
    fillColor: Color.fromRGBO(24, 32, 43, 1.0),
    paddingVerticalPx: 40.0,
    textAlignCss: 'center',
  );

  static AppLedgerEmptySpec empty(Brightness brightness) =>
      brightness == Brightness.dark ? emptyDark : emptyLight;

  static const AppLedgerEmptyRcSpec emptyRcLight = AppLedgerEmptyRcSpec(
    stackRow: 'ledger-empty-rc',
    cssClasses: 'empty py-10 flex flex-col items-center gap-2',
    authoredSrc: 'src/components/ReportsCentre.tsx:494',
    gapPx: 8.0,
    paddingVerticalPx: 40.0,
    line: AppTxRowSlotSpec(
      stackRow: 'ledger-empty-rc-line',
      cssClasses: 'mono text-[12px]',
      authoredSrc: 'src/components/ReportsCentre.tsx:496',
      displayCss: 'block',
      alignItemsCss: 'normal',
      gapPx: null,
      fontFamily: 'JetBrains Mono',
      fontSizePx: 12.0,
      fontWeight: 400,
      heightRatio: 1.5,
      letterSpacingPx: 0.0,
      letterSpacingEm: 0.0,
      textColor: Color.fromRGBO(13, 22, 36, 1.0),
      authoredColorToken: '--ink',
      truncates: false,
      flexGrow: 0.0,
      flexShrink: 1.0,
      minWidthZero: false,
      textAlignCss: null,
      tabularNums: true,
    ),
  );

  static const AppLedgerEmptyRcSpec emptyRcDark = AppLedgerEmptyRcSpec(
    stackRow: 'ledger-empty-rc',
    cssClasses: 'empty py-10 flex flex-col items-center gap-2',
    authoredSrc: 'src/components/ReportsCentre.tsx:494',
    gapPx: 8.0,
    paddingVerticalPx: 40.0,
    line: AppTxRowSlotSpec(
      stackRow: 'ledger-empty-rc-line',
      cssClasses: 'mono text-[12px]',
      authoredSrc: 'src/components/ReportsCentre.tsx:496',
      displayCss: 'block',
      alignItemsCss: 'normal',
      gapPx: null,
      fontFamily: 'JetBrains Mono',
      fontSizePx: 12.0,
      fontWeight: 400,
      heightRatio: 1.5,
      letterSpacingPx: 0.0,
      letterSpacingEm: 0.0,
      textColor: Color.fromRGBO(247, 248, 251, 1.0),
      authoredColorToken: '--ink',
      truncates: false,
      flexGrow: 0.0,
      flexShrink: 1.0,
      minWidthZero: false,
      textAlignCss: null,
      tabularNums: true,
    ),
  );

  static AppLedgerEmptyRcSpec emptyRc(Brightness brightness) =>
      brightness == Brightness.dark ? emptyRcDark : emptyRcLight;

  /// The dashboard list: bounded at `544px` past the breakpoint (`lg:max-h-[34rem]`,
  /// which generation re-derives as `34 × 16`), unbounded below it.
  static const AppLedgerRailSpec ledgerRail = AppLedgerRailSpec(
    stackRow: 'ledger-scroll',
    cssClasses: 'min-h-0 lg:max-h-[34rem] lg:overflow-y-auto lg:pr-1',
    authoredSrc: 'src/components/Dashboard.tsx:419',
    wideMaxHeightPx: 544.0,
    narrowMaxHeightPx: null,
    wideOverflowYCss: 'auto',
    narrowOverflowYCss: 'visible',
    wideOverflowXCss: 'auto',
    narrowOverflowXCss: 'visible',
    widePaddingRightPx: 4.0,
    narrowPaddingRightPx: 0.0,
  );

  /// The Reports Centre list: the same `max-height` at both viewports (460px),
  /// because nothing gates it.
  static const AppLedgerRailSpec reportsRail = AppLedgerRailSpec(
    stackRow: 'ledger-list-scroll',
    cssClasses: 'space-y-1 max-h-[460px] overflow-y-auto pr-1',
    authoredSrc: 'src/components/ReportsCentre.tsx:492',
    wideMaxHeightPx: 460.0,
    narrowMaxHeightPx: 460.0,
    wideOverflowYCss: 'auto',
    narrowOverflowYCss: 'auto',
    wideOverflowXCss: 'auto',
    narrowOverflowXCss: 'auto',
    widePaddingRightPx: 4.0,
    narrowPaddingRightPx: 4.0,
  );

  /// The direction glyph the amount span leads with, named at
  /// src/components/ui/TransactionRow.tsx:41. Both arrows are the same
  /// size, and the icon dependency has not landed, so the widget draws the box and
  /// the caller hands over the glyph — exactly as `AppIconButton` does. The names
  /// are the Lucide symbols `parity/icon-map.tsv` maps for the web’s two.
  static const double arrowSizePx = 12.0;

  static const String arrowInName = 'ArrowDownLeft';

  static const String arrowOutName = 'ArrowUpRight';

  static const String arrowInSymbol = 'LucideIcons.arrowDownLeft';

  static const String arrowOutSymbol = 'LucideIcons.arrowUpRight';
}

/// A pastel tone of `CategoryChip.tsx`’s `ChipTone` union, in the order the union
/// declares them. Generation requires the union, the `TONE_BG` table and the
/// measured tone rows to name the same set, so an enum here cannot drift from the
/// component without the run failing.
enum AppChipTone {
  pink('--pastel-pink'),
  mint('--pastel-mint'),
  yellow('--pastel-yellow'),
  lavender('--pastel-lavender'),
  blue('--pastel-blue'),
  ink('--surface-3');

  const AppChipTone(this.toneToken);

  /// The `:root` token `TONE_BG` selects for this tone — one of the five pastels
  /// for those tones, `--surface-3` for the neutral one. The chip mixes
  /// `AppCategoryChipTintSpec.mixFillPercent` of it with the surface it sits on.
  final String toneToken;
}

/// A chip size. `sidePx` is the authored `dims` ternary and `glyphPx` the `glyph`
/// ternary, both parsed out of `CategoryChip.tsx` rather than retyped; generation
/// proves each measured square equals the table at all four passes, `md` included
/// (it is the ternary's default arm, cited at the line that falls through to it).
enum AppChipSize {
  xs(22.0, 12.0),
  sm(32.0, 14.0),
  md(40.0, 17.0),
  lg(44.0, 19.0);

  const AppChipSize(this.sidePx, this.glyphPx);

  /// The box edge — the chip is a square, measured identical in width and height.
  final double sidePx;

  /// The size the glyph is drawn at.
  final double glyphPx;

  static AppChipSize sizeFor(String cssSize) => switch (cssSize) {
    'xs' => AppChipSize.xs,
    'sm' => AppChipSize.sm,
    'lg' => AppChipSize.lg,
    _ => AppChipSize.md,
  };
}

/// One tone of the chip, as one brightness painted it.
///
/// `md` is the size each tone was sampled at, so [sidePx] is the `md` square and
/// the other sizes share the tint — the measurement is of a colour, and a
/// `color-mix` does not move with the box it paints.
class AppCategoryChipTintSpec {
  const AppCategoryChipTintSpec({
    required this.tone,
    required this.rowName,
    required this.cssClasses,
    required this.authoredSrc,
    required this.toneToken,
    required this.mixFillPercent,
    required this.mixFillWithToken,
    required this.mixBorderPercent,
    required this.mixBorderWithToken,
    required this.fillColor,
    required this.borderColor,
    required this.borderWidthPx,
    required this.iconColor,
    required this.sidePx,
  });

  /// The tone this tint is.
  final AppChipTone tone;

  /// The `utilityStacks` row the tint was measured from.
  final String rowName;

  final String cssClasses;

  final String authoredSrc;

  /// The token the inline style names, as `TONE_BG` declares it: one of the five
  /// pastels, or `--surface-3` for the neutral tone.
  final String toneToken;

  /// `background: color-mix(in oklab, <pastel> N%, <surface>)`.
  final double mixFillPercent;

  final String mixFillWithToken;

  /// `border: 1px solid color-mix(in oklab, …)`.
  final double mixBorderPercent;

  final String mixBorderWithToken;

  /// What the engine painted, not a re-derivation: oklab mixing is the browser’s
  /// arithmetic and this port does not reproduce it. Generation proves the mix really
  /// moved (the painted hex differs from the token’s own), that the frame is not the
  /// fill, and that no two tones of one pass collide.
  final Color fillColor;

  final Color borderColor;

  final double borderWidthPx;

  /// `--ink`, the glyph colour the inline style writes for every tone alike.
  final Color iconColor;

  /// The measured square this tone was sampled at.
  final double sidePx;

  /// `rounded-full`, which is the engine’s own clamp rather than a radius anyone
  /// chose: see [AppCategoryChips.fullRoundRadiusPx].
  BorderRadius get radius =>
      BorderRadius.circular(AppCategoryChips.fullRoundRadiusPx);
}

/// The chip that leads every row: its tone tables, the hash that picks a tone, and
/// the glyph the web paints in it.
abstract final class AppCategoryChips {
  /// Chrome’s clamp of `rounded-full` (`3.35544e+07px`). Any radius at least half
  /// the side paints the same circle, so the widget can clamp it however it likes;
  /// the number is kept because it is what was measured, and generation fails if a
  /// chip ever measures smaller than half its side.
  static const double fullRoundRadiusPx = 33554400.0;

  /// The `strokeWidth` the component draws its glyph with.
  static const double glyphStrokeWidth = 2.0;

  /// `TONE_CYCLE`, in the order the component declares it: the list a category
  /// hashes into.
  static const List<AppChipTone> toneCycle = <AppChipTone>[
    AppChipTone.lavender,
    AppChipTone.blue,
    AppChipTone.mint,
    AppChipTone.yellow,
    AppChipTone.pink,
  ];

  /// `hashString` as the web writes it: `h = (h * M + s.charCodeAt(i)) >>> 0` over
  /// `category.toLowerCase().trim()`. `>>> 0` is a mod-2^32 for the non-negative
  /// values this reaches, which Dart’s 64-bit `int` answers with a mask.
  static const int toneHashMultiplier = 31;

  static const int toneHashMask = 0xFFFFFFFF;

  /// The tone a category string selects. Identical in both brightnesses, because the
  /// hash reads the name and nothing else.
  ///
  /// One recorded deviation. A browser lowercases a dotted capital `İ` with
  /// Unicode’s *full* mapping (`i` + U+0307, two UTF-16 units) and Dart with
  /// the *simple* one (`i`, one), so a category whose name carries it hashes to
  /// a different index here than on the web. The tone is decorative and the
  /// name is user-typed, so the port keeps Dart’s normalisation rather than
  /// carrying a case table for its own sake; [toneWebNormalisations] holds the
  /// evidence and the drift test pins the divergence so closing it stays a
  /// decision.
  static AppChipTone toneFor(String category) {
    final String s = category.toLowerCase().trim();
    int h = 0;
    for (int i = 0; i < s.length; i++) {
      h = (h * toneHashMultiplier + s.codeUnitAt(i)) & toneHashMask;
    }
    return toneCycle[h % toneCycle.length];
  }

  /// The web’s own answer for these strings, generated by running its hash over
  /// them at the same time as this table was. `toLowerCase()` and UTF-16 indexing
  /// are where a Dart port can diverge (a Turkish dotted capital, an astral plane
  /// character), so [toneFor] is asserted against this table in
  /// `test/theme/ui_tokens_test.dart` rather than trusted.
  static const Map<String, AppChipTone> toneFixtures = <String, AppChipTone>{
    '': AppChipTone.lavender,
    '  GROCERIES ': AppChipTone.blue,
    'Salary': AppChipTone.mint,
    'Transfer In': AppChipTone.lavender,
    'a𝕏b': AppChipTone.pink,
    'bills': AppChipTone.pink,
    'bonus': AppChipTone.blue,
    'business': AppChipTone.pink,
    'commission': AppChipTone.blue,
    'dining': AppChipTone.yellow,
    'education': AppChipTone.lavender,
    'entertainment': AppChipTone.mint,
    'food': AppChipTone.pink,
    'freelance': AppChipTone.mint,
    'fuel': AppChipTone.yellow,
    'gift': AppChipTone.blue,
    'groceries': AppChipTone.blue,
    'health': AppChipTone.lavender,
    'housing': AppChipTone.yellow,
    'investing': AppChipTone.yellow,
    'loan': AppChipTone.blue,
    'medical': AppChipTone.blue,
    'other': AppChipTone.blue,
    'rent': AppChipTone.blue,
    'salary': AppChipTone.mint,
    'shopping': AppChipTone.pink,
    'subscriptions': AppChipTone.mint,
    'transfer': AppChipTone.mint,
    'transfer in': AppChipTone.lavender,
    'transport': AppChipTone.pink,
    'travel': AppChipTone.pink,
    'uber': AppChipTone.lavender,
    'unknown': AppChipTone.lavender,
    'utilities': AppChipTone.pink,
    'İSTANBUL': AppChipTone.mint,
    '彩票': AppChipTone.lavender,
  };

  /// The web’s `category.toLowerCase().trim()` for each fixture key, as the
  /// engine that paints the app answered it. A browser follows Unicode’s
  /// *full* lowercase mappings and Dart follows the *simple* ones, so the two
  /// normalisations can differ in length — a dotted capital `İ` is the case
  /// that does. This is the evidence that says which side of the hash a
  /// divergence lives on: hash these strings with the component’s own
  /// multiplier, mask and cycle and every [toneFixtures] entry reproduces,
  /// so any remaining disagreement is a normalisation difference rather than
  /// a wrong hash. Asserted key by key in `test/theme/ui_tokens_test.dart`.
  static const Map<String, String> toneWebNormalisations = <String, String>{
    '': '',
    '  GROCERIES ': 'groceries',
    'Salary': 'salary',
    'Transfer In': 'transfer in',
    'a𝕏b': 'a𝕏b',
    'bills': 'bills',
    'bonus': 'bonus',
    'business': 'business',
    'commission': 'commission',
    'dining': 'dining',
    'education': 'education',
    'entertainment': 'entertainment',
    'food': 'food',
    'freelance': 'freelance',
    'fuel': 'fuel',
    'gift': 'gift',
    'groceries': 'groceries',
    'health': 'health',
    'housing': 'housing',
    'investing': 'investing',
    'loan': 'loan',
    'medical': 'medical',
    'other': 'other',
    'rent': 'rent',
    'salary': 'salary',
    'shopping': 'shopping',
    'subscriptions': 'subscriptions',
    'transfer': 'transfer',
    'transfer in': 'transfer in',
    'transport': 'transport',
    'travel': 'travel',
    'uber': 'uber',
    'unknown': 'unknown',
    'utilities': 'utilities',
    'İSTANBUL': 'i̇stanbul',
    '彩票': '彩票',
  };

  /// light pass tints.
  static const Map<AppChipTone, AppCategoryChipTintSpec>
  light = <AppChipTone, AppCategoryChipTintSpec>{
    AppChipTone.pink: AppCategoryChipTintSpec(
      tone: AppChipTone.pink,
      rowName: 'cat-chip-md-pink',
      cssClasses: 'grid place-items-center rounded-full shrink-0',
      authoredSrc: 'src/components/ui/CategoryChip.tsx:55,90,92,93,94,95,96',
      toneToken: '--pastel-pink',
      mixFillPercent: 55.0,
      mixFillWithToken: '--surface',
      mixBorderPercent: 70.0,
      mixBorderWithToken: '--line',
      fillColor: Color.fromRGBO(247, 209, 214, 1.0),
      borderColor: Color.fromRGBO(234, 188, 196, 1.0),
      borderWidthPx: 1.0,
      iconColor: Color.fromRGBO(13, 22, 36, 1.0),
      sidePx: 40.0,
    ),
    AppChipTone.mint: AppCategoryChipTintSpec(
      tone: AppChipTone.mint,
      rowName: 'cat-chip-md-mint',
      cssClasses: 'grid place-items-center rounded-full shrink-0',
      authoredSrc: 'src/components/ui/CategoryChip.tsx:56,90,92,93,94,95,96',
      toneToken: '--pastel-mint',
      mixFillPercent: 55.0,
      mixFillWithToken: '--surface',
      mixBorderPercent: 70.0,
      mixBorderWithToken: '--line',
      fillColor: Color.fromRGBO(217, 241, 226, 1.0),
      borderColor: Color.fromRGBO(197, 229, 210, 1.0),
      borderWidthPx: 1.0,
      iconColor: Color.fromRGBO(13, 22, 36, 1.0),
      sidePx: 40.0,
    ),
    AppChipTone.yellow: AppCategoryChipTintSpec(
      tone: AppChipTone.yellow,
      rowName: 'cat-chip-md-yellow',
      cssClasses: 'grid place-items-center rounded-full shrink-0',
      authoredSrc: 'src/components/ui/CategoryChip.tsx:57,90,92,93,94,95,96',
      toneToken: '--pastel-yellow',
      mixFillPercent: 55.0,
      mixFillWithToken: '--surface',
      mixBorderPercent: 70.0,
      mixBorderWithToken: '--line',
      fillColor: Color.fromRGBO(246, 238, 207, 1.0),
      borderColor: Color.fromRGBO(234, 225, 186, 1.0),
      borderWidthPx: 1.0,
      iconColor: Color.fromRGBO(13, 22, 36, 1.0),
      sidePx: 40.0,
    ),
    AppChipTone.lavender: AppCategoryChipTintSpec(
      tone: AppChipTone.lavender,
      rowName: 'cat-chip-md-lavender',
      cssClasses: 'grid place-items-center rounded-full shrink-0',
      authoredSrc: 'src/components/ui/CategoryChip.tsx:58,90,92,93,94,95,96',
      toneToken: '--pastel-lavender',
      mixFillPercent: 55.0,
      mixFillWithToken: '--surface',
      mixBorderPercent: 70.0,
      mixBorderWithToken: '--line',
      fillColor: Color.fromRGBO(220, 221, 246, 1.0),
      borderColor: Color.fromRGBO(201, 203, 236, 1.0),
      borderWidthPx: 1.0,
      iconColor: Color.fromRGBO(13, 22, 36, 1.0),
      sidePx: 40.0,
    ),
    AppChipTone.blue: AppCategoryChipTintSpec(
      tone: AppChipTone.blue,
      rowName: 'cat-chip-md-blue',
      cssClasses: 'grid place-items-center rounded-full shrink-0',
      authoredSrc: 'src/components/ui/CategoryChip.tsx:59,90,92,93,94,95,96',
      toneToken: '--pastel-blue',
      mixFillPercent: 55.0,
      mixFillWithToken: '--surface',
      mixBorderPercent: 70.0,
      mixBorderWithToken: '--line',
      fillColor: Color.fromRGBO(206, 229, 247, 1.0),
      borderColor: Color.fromRGBO(183, 213, 236, 1.0),
      borderWidthPx: 1.0,
      iconColor: Color.fromRGBO(13, 22, 36, 1.0),
      sidePx: 40.0,
    ),
    AppChipTone.ink: AppCategoryChipTintSpec(
      tone: AppChipTone.ink,
      rowName: 'cat-chip-md-ink',
      cssClasses: 'grid place-items-center rounded-full shrink-0',
      authoredSrc: 'src/components/ui/CategoryChip.tsx:60,90,92,93,94,95,96',
      toneToken: '--surface-3',
      mixFillPercent: 55.0,
      mixFillWithToken: '--surface',
      mixBorderPercent: 70.0,
      mixBorderWithToken: '--line',
      fillColor: Color.fromRGBO(234, 239, 245, 1.0),
      borderColor: Color.fromRGBO(219, 226, 234, 1.0),
      borderWidthPx: 1.0,
      iconColor: Color.fromRGBO(13, 22, 36, 1.0),
      sidePx: 40.0,
    ),
  };

  /// dark pass tints.
  static const Map<AppChipTone, AppCategoryChipTintSpec>
  dark = <AppChipTone, AppCategoryChipTintSpec>{
    AppChipTone.pink: AppCategoryChipTintSpec(
      tone: AppChipTone.pink,
      rowName: 'cat-chip-md-pink',
      cssClasses: 'grid place-items-center rounded-full shrink-0',
      authoredSrc: 'src/components/ui/CategoryChip.tsx:55,90,92,93,94,95,96',
      toneToken: '--pastel-pink',
      mixFillPercent: 55.0,
      mixFillWithToken: '--surface',
      mixBorderPercent: 70.0,
      mixBorderWithToken: '--line',
      fillColor: Color.fromRGBO(132, 90, 102, 1.0),
      borderColor: Color.fromRGBO(176, 118, 130, 1.0),
      borderWidthPx: 1.0,
      iconColor: Color.fromRGBO(247, 248, 251, 1.0),
      sidePx: 40.0,
    ),
    AppChipTone.mint: AppCategoryChipTintSpec(
      tone: AppChipTone.mint,
      rowName: 'cat-chip-md-mint',
      cssClasses: 'grid place-items-center rounded-full shrink-0',
      authoredSrc: 'src/components/ui/CategoryChip.tsx:56,90,92,93,94,95,96',
      toneToken: '--pastel-mint',
      mixFillPercent: 55.0,
      mixFillWithToken: '--surface',
      mixBorderPercent: 70.0,
      mixBorderWithToken: '--line',
      fillColor: Color.fromRGBO(86, 123, 107, 1.0),
      borderColor: Color.fromRGBO(115, 162, 137, 1.0),
      borderWidthPx: 1.0,
      iconColor: Color.fromRGBO(247, 248, 251, 1.0),
      sidePx: 40.0,
    ),
    AppChipTone.yellow: AppCategoryChipTintSpec(
      tone: AppChipTone.yellow,
      rowName: 'cat-chip-md-yellow',
      cssClasses: 'grid place-items-center rounded-full shrink-0',
      authoredSrc: 'src/components/ui/CategoryChip.tsx:57,90,92,93,94,95,96',
      toneToken: '--pastel-yellow',
      mixFillPercent: 55.0,
      mixFillWithToken: '--surface',
      mixBorderPercent: 70.0,
      mixBorderWithToken: '--line',
      fillColor: Color.fromRGBO(124, 117, 82, 1.0),
      borderColor: Color.fromRGBO(166, 154, 103, 1.0),
      borderWidthPx: 1.0,
      iconColor: Color.fromRGBO(247, 248, 251, 1.0),
      sidePx: 40.0,
    ),
    AppChipTone.lavender: AppCategoryChipTintSpec(
      tone: AppChipTone.lavender,
      rowName: 'cat-chip-md-lavender',
      cssClasses: 'grid place-items-center rounded-full shrink-0',
      authoredSrc: 'src/components/ui/CategoryChip.tsx:58,90,92,93,94,95,96',
      toneToken: '--pastel-lavender',
      mixFillPercent: 55.0,
      mixFillWithToken: '--surface',
      mixBorderPercent: 70.0,
      mixBorderWithToken: '--line',
      fillColor: Color.fromRGBO(97, 100, 137, 1.0),
      borderColor: Color.fromRGBO(130, 132, 178, 1.0),
      borderWidthPx: 1.0,
      iconColor: Color.fromRGBO(247, 248, 251, 1.0),
      sidePx: 40.0,
    ),
    AppChipTone.blue: AppCategoryChipTintSpec(
      tone: AppChipTone.blue,
      rowName: 'cat-chip-md-blue',
      cssClasses: 'grid place-items-center rounded-full shrink-0',
      authoredSrc: 'src/components/ui/CategoryChip.tsx:59,90,92,93,94,95,96',
      toneToken: '--pastel-blue',
      mixFillPercent: 55.0,
      mixFillWithToken: '--surface',
      mixBorderPercent: 70.0,
      mixBorderWithToken: '--line',
      fillColor: Color.fromRGBO(73, 108, 136, 1.0),
      borderColor: Color.fromRGBO(98, 142, 175, 1.0),
      borderWidthPx: 1.0,
      iconColor: Color.fromRGBO(247, 248, 251, 1.0),
      sidePx: 40.0,
    ),
    AppChipTone.ink: AppCategoryChipTintSpec(
      tone: AppChipTone.ink,
      rowName: 'cat-chip-md-ink',
      cssClasses: 'grid place-items-center rounded-full shrink-0',
      authoredSrc: 'src/components/ui/CategoryChip.tsx:60,90,92,93,94,95,96',
      toneToken: '--surface-3',
      mixFillPercent: 55.0,
      mixFillWithToken: '--surface',
      mixBorderPercent: 70.0,
      mixBorderWithToken: '--line',
      fillColor: Color.fromRGBO(26, 33, 45, 1.0),
      borderColor: Color.fromRGBO(35, 43, 55, 1.0),
      borderWidthPx: 1.0,
      iconColor: Color.fromRGBO(247, 248, 251, 1.0),
      sidePx: 40.0,
    ),
  };

  /// The tone as one brightness painted it.
  static AppCategoryChipTintSpec tint(AppChipTone tone, Brightness brightness) {
    final AppCategoryChipTintSpec? spec = (brightness == Brightness.dark
        ? dark
        : light)[tone];
    if (spec == null) {
      throw ArgumentError(
        'no ${tone.name} tint was measured at ${brightness.name}',
      );
    }
    return spec;
  }

  /// category → the Lucide symbol `CategoryChip.tsx` paints for it, as
  /// `parity/icon-map.tsv` names it. The keys are the component's own lower-case
  /// lookup keys; an unlisted category falls back to [fallbackGlyphSymbol], as the
  /// component does. The icon dependency has not landed, so these are strings the
  /// caller resolves, not symbols this file draws.
  static const Map<String, String> glyphSymbols = <String, String>{
    'salary': 'LucideIcons.coins',
    'freelance': 'LucideIcons.briefcase',
    'business': 'LucideIcons.briefcase',
    'bonus': 'LucideIcons.gift',
    'commission': 'LucideIcons.coins',
    'other': 'LucideIcons.wallet',
    'food': 'LucideIcons.utensils',
    'groceries': 'LucideIcons.shoppingCart',
    'dining': 'LucideIcons.utensils',
    'transport': 'LucideIcons.car',
    'fuel': 'LucideIcons.car',
    'shopping': 'LucideIcons.shoppingCart',
    'bills': 'LucideIcons.receipt',
    'utilities': 'LucideIcons.zap',
    'rent': 'LucideIcons.house',
    'housing': 'LucideIcons.house',
    'entertainment': 'LucideIcons.partyPopper',
    'subscriptions': 'LucideIcons.partyPopper',
    'health': 'LucideIcons.heart',
    'medical': 'LucideIcons.heart',
    'education': 'LucideIcons.graduationCap',
    'travel': 'LucideIcons.plane',
    'transfer': 'LucideIcons.send',
    'loan': 'LucideIcons.piggyBank',
    'investing': 'LucideIcons.piggyBank',
    'gift': 'LucideIcons.gift',
  };

  static const String fallbackGlyphSymbol = 'LucideIcons.receipt';
}
