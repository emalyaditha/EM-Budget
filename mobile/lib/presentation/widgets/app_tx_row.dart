import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';

import '../../core/theme/app_chips.dart';
import '../../core/theme/app_rows.dart';
import 'app_category_chip.dart';

/// One transaction row, painted from the measured `txrow-*` stack rows: no size,
/// weight, tracking, colour, gap, inset, corner, press scale or clock appears
/// here as a number.
///
/// The measurement is the utility stack, not a detached probe — the class list
/// the component really writes on the element it really uses — so what this
/// widget draws includes every Tailwind utility on that element (`.tx-row`
/// authors the gap and the padding; `text-[13px]`, `font-semibold` and
/// `tracking-tight` author the title) and nothing that sits beside it.
///
/// **The row formats nothing.** [amountText] is the string a caller got from
/// `mobile/lib/domain/money.dart`, exactly as the web passes `formatMoney(…)`’s
/// output straight through `TransactionRow.tsx:41`, and the second line is
/// either the [meta] the screen composed or, as `TransactionRow.tsx:33` does it,
/// the subtitle and category joined with ` · `. `isIncome` is the caller’s
/// verdict too: the web has two different predicates for it
/// (`Dashboard.tsx:425` and `ReportsCentre.tsx:500`) and a port must not pick a
/// side, so it selects one of the two measured arms and nothing else.
///
/// Two things the row leads with are the caller’s, because `lucide-react` is not
/// a Flutter dependency: [categoryGlyph] for the chip and [directionGlyph] for
/// the amount. The widget owns both boxes — [AppCategoryChip] paints the chip
/// from the tint tables, and the arrow is sized and coloured from
/// [AppRows.arrowSizePx] and the arm’s measured ink, which is what the web’s
/// `size={12}` and `color: var(--success)` do.
class AppTxRow extends StatefulWidget {
  const AppTxRow({
    required this.title,
    required this.category,
    required this.amountText,
    required this.isIncome,
    super.key,
    this.subtitle,
    this.meta,
    this.categoryGlyph,
    this.directionGlyph,
    this.trailing,
    this.chipSize = AppChipSize.md,
    this.onTap,
  });

  /// The first line.
  final String title;

  /// The category — the chip’s tone and (on the web) its glyph, and half of the
  /// default second line.
  final String category;

  /// The figure, already formatted by the ported money functions.
  final String amountText;

  /// Which of the two measured amount arms paints [amountText].
  final bool isIncome;

  /// The optional first half of the composed second line.
  final String? subtitle;

  /// A second line the screen composed itself, which replaces the composition.
  final String? meta;

  /// The glyph inside the leading chip.
  final Widget? categoryGlyph;

  /// The direction arrow that leads the figure.
  final Widget? directionGlyph;

  /// A widget after the figure — on the web a `<span className="pill …">`,
  /// which this port draws with [AppTxTypePill].
  final Widget? trailing;

  /// The chip’s size. `TransactionRow.tsx:29` writes no `size`, so the default
  /// is the component’s own `size = 'md'`.
  final AppChipSize chipSize;

  /// `null` leaves the row inert, as an absent `onClick` does.
  final VoidCallback? onTap;

  @override
  State<AppTxRow> createState() => _AppTxRowState();
}

class _AppTxRowState extends State<AppTxRow> {
  bool _pressed = false;

  void _pressDown() {
    if (widget.onTap != null) setState(() => _pressed = true);
  }

  void _pressRelease() {
    if (_pressed) setState(() => _pressed = false);
  }

  /// `meta ?? [subtitle, category].filter(Boolean).join(' · ')` — the web’s line,
  /// including its `filter`: an absent or empty subtitle drops out rather than
  /// leaving the separator behind.
  String get _secondLine {
    final String? composed = widget.meta;
    if (composed != null) return composed;
    return <String>[
      if ((widget.subtitle ?? '') != '') widget.subtitle!,
      if (widget.category != '') widget.category,
    ].join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    final Brightness brightness = Theme.of(context).brightness;
    final AppTxRowSpec spec = AppRows.txRow(brightness);
    final AppTxRowSlotSpec arm = widget.isIncome
        ? spec.amountIn
        : spec.amountOut;
    final bool pressed = _pressed && widget.onTap != null;

    final Widget content = Row(
      // `justify-content: normal` is a flex row that starts at the leading edge
      // and lets the text column take what is left, which is what
      // `Expanded` below asks for.
      crossAxisAlignment: spec.alignItemsCss == 'center'
          ? CrossAxisAlignment.center
          : CrossAxisAlignment.start,
      children: <Widget>[
        AppCategoryChip(
          category: widget.category,
          size: widget.chipSize,
          glyph: widget.categoryGlyph,
        ),
        SizedBox(width: spec.gapPx),
        // `min-w-0 flex-1`: the column that holds both text lines grows into
        // what the fixed children leave and is allowed to shrink below its
        // content — which in Flutter is exactly `Expanded`, since a `Text` is
        // already offered its parent’s max width. `truncate` then does the rest.
        Expanded(
          child: Column(
            // Both slots are `display: block`, so they stack at the leading
            // edge with no gap of their own; the second line’s `mt-0.5` is its
            // measured margin. `min`, because the row is only as tall as the
            // two lines the web gives it — and a `max` column in a row would
            // ask for infinite height inside a scroll view.
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                widget.title,
                style: spec.title.textStyle,
                maxLines: spec.title.truncates ? 1 : null,
                overflow: spec.title.truncates ? TextOverflow.ellipsis : null,
                softWrap: !spec.title.truncates,
              ),
              Padding(
                padding: spec.meta.margin,
                child: Text(
                  _secondLine,
                  style: spec.meta.textStyle,
                  maxLines: spec.meta.truncates ? 1 : null,
                  overflow: spec.meta.truncates ? TextOverflow.ellipsis : null,
                  softWrap: !spec.meta.truncates,
                ),
              ),
            ],
          ),
        ),
        SizedBox(width: spec.gapPx),
        // `text-right shrink-0`: a fixed child, laid out at its content width
        // before the text column takes the remainder — which is what keeps a
        // long figure off the title instead of under it.
        Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment:
              arm.textAlignCss == 'right' ||
                  spec.amountWrap.textAlignCss == 'right'
              ? CrossAxisAlignment.end
              : CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              // `inline-flex items-center gap-1`
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: arm.alignItemsCss == 'center'
                  ? CrossAxisAlignment.center
                  : CrossAxisAlignment.start,
              children: <Widget>[
                if (widget.directionGlyph != null) ...<Widget>[
                  IconTheme.merge(
                    data: IconThemeData(
                      size: AppRows.arrowSizePx,
                      color: arm.textColor,
                    ),
                    child: widget.directionGlyph!,
                  ),
                  SizedBox(width: arm.gapPx ?? 0.0),
                ],
                Text(widget.amountText, style: arm.textStyle),
              ],
            ),
            if (widget.trailing != null) widget.trailing!,
          ],
        ),
      ],
    );

    final Widget box = AnimatedContainer(
      duration: spec.pressDuration,
      curve: spec.pressCurve,
      // The resting transform is identity rather than absent: `AnimatedContainer`
      // builds its first tween from the value it is given. `.tx-row` is
      // `w-full`, so the box spans the list either way.
      transform: pressed
          ? Matrix4.diagonal3Values(spec.pressScale, spec.pressScale, 1.0)
          : Matrix4.identity(),
      width: double.infinity,
      padding: spec.padding,
      decoration: BoxDecoration(
        color: spec.fillColor,
        borderRadius: spec.radius,
      ),
      child: content,
    );

    return Semantics(
      button: true,
      enabled: widget.onTap != null,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: widget.onTap,
        onTapDown: (_) => _pressDown(),
        onTapUp: (_) => _pressRelease(),
        onTapCancel: _pressRelease,
        child: box,
      ),
    );
  }
}

/// The trailing type pill of a transaction row — the span
/// `ReportsCentre.tsx:521` passes as `trailing`.
///
/// It is the `.pill` box and the row’s own measured label: the §6 `.pill` probe
/// supplies fill, frame and corner, while the `txrow-trailing-pill` stack row
/// supplies the family, the `!text-[9px] !py-0.5 !px-2` inset and the ink. That
/// split is what the web is: `.pill` authors the box, the utilities on the
/// element author the type and the padding that beats `.pill`’s own.
///
/// The `hidden sm:inline-flex` pair in its class list is **inert**, and this
/// widget paints the pill at every width because of it: `.pill` authors an
/// unlayered `display`, which beats a utility in a layer, and both passes of the
/// measurement — 320px and desktop — found the pill displayed. Hiding it below
/// the breakpoint would copy a rule the engine never applied.
class AppTxTypePill extends StatelessWidget {
  const AppTxTypePill({required this.text, super.key});

  /// The type label, verbatim as the web writes `t.type` into the span.
  final String text;

  @override
  Widget build(BuildContext context) {
    final Brightness brightness = Theme.of(context).brightness;
    final AppTxRowSlotSpec slot = AppRows.txRow(brightness).pill;
    // The box comes from the same `.pill` row the standalone [AppPill] paints;
    // `slot.padding` is the measured override of `.pill`’s own inset, which is
    // why it is applied here instead of the chip row’s.
    final AppChipSpec box = AppChips.resolve('.pill', brightness);
    return Container(
      padding: slot.padding,
      decoration: BoxDecoration(
        color: box.fillColor,
        border: box.border,
        borderRadius: box.borderRadius,
      ),
      child: Text(text, style: slot.textStyle),
    );
  }
}

/// The sticky header above a run of rows: `.day-head`’s box and the
/// `.eyebrow` label inside it, painted from the measured `day-head-label` row.
///
/// The header holds its text back while the list scrolls under it: the fill is
/// `fillMixPercent` of [AppDayHeadSpec.fillToken] over transparent and the blur is
/// the authored `backdrop-filter`, converted to a sigma by [AppDayHeadSpec.blurSigmaPx]
/// under ruling D-U8. Both are the measured recipe, not a Material surface —
/// there is no `Material`, no ink and no elevation here.
///
/// [AppDayHeadSpec.uppercase] is `text-transform`, which Flutter has no knob
/// for, so the label is transformed at the text itself. That is a deviation the
/// port records rather than hides, and it is why a screen should hand over the
/// day as it would read it (`Today`, `Yesterday`) rather than pre-shouted: the
/// transformation belongs to the row, and a caller that upper-cased first would
/// make the flag a decoration instead of the paint.
///
/// The `!text-[10px]` beside the class list restates the size `.eyebrow` already
/// authors; [AppDayHeadSpec.redundantSizeOverride] carries that as data and this
/// widget still draws one size, the measured one.
///
/// Stickiness itself is the list’s doing — a header that must stay pinned is a
/// sliver, and [AppLedgerSection] asks for one; painted on its own this is the
/// same box at the top of a column.
class AppDayHead extends StatelessWidget {
  const AppDayHead({required this.label, super.key, this.style});

  /// The day, as the screen composed it.
  final String label;

  /// A caller’s overrides — the channel for whatever a screen adds beside the
  /// class, merged over the measured label.
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    final Brightness brightness = Theme.of(context).brightness;
    final AppDayHeadSpec spec = AppRows.dayHead(brightness);
    final TextStyle type = spec.textStyle.merge(style);

    final Widget label_ = Text(
      spec.uppercase ? label.toUpperCase() : label,
      style: type,
      maxLines: 1,
      softWrap: false,
    );

    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(
          sigmaX: spec.blurSigmaPx,
          sigmaY: spec.blurSigmaPx,
        ),
        child: Container(
          // `z-index: 5` orders the header above the rows it covers; in a
          // scroll view a pinned sliver paints after the content it overlaps,
          // which is the same fact arrived at differently.
          color: spec.fillColor,
          padding: spec.padding,
          child: label_,
        ),
      ),
    );
  }
}

/// The hairline `divide-y divide-[var(--line)]` paints between rows.
///
/// It is a bottom border on each divided child, and `[&:last-child]:border-b-0`
/// takes it off the last one — so a group of N rows draws N−1 of these, and each
/// day group starts again. [AppLedgerSection] and [AppLedgerList] lay that out;
/// this widget is one line, for a screen that composes rows itself.
class AppLedgerDivider extends StatelessWidget {
  const AppLedgerDivider({super.key});

  @override
  Widget build(BuildContext context) {
    final AppLedgerDividerSpec spec = AppRows.divider(
      Theme.of(context).brightness,
    );
    return SizedBox(
      width: double.infinity,
      height: spec.widthPx,
      child: ColoredBox(color: spec.color),
    );
  }
}
