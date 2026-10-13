import 'package:flutter/material.dart';

import '../../core/theme/app_rows.dart';
import 'app_tx_row.dart';

/// A run of rows, optionally under a day header and optionally divided.
///
/// This is the shape the two ledgers disagree on, and nothing else: the
/// dashboard groups its activity by day, headers each group while
/// `activityView === 'all'` and divides the rows inside a group; the Reports
/// Centre writes one header-less, undivided run of rows. Both are the same list
/// with a different answer here, so the caller states the shape and
/// [AppLedger] lays it out.
class AppLedgerSection {
  const AppLedgerSection({
    required this.rows,
    this.dayLabel,
    this.dayLabelStyle,
    this.divides = true,
  });

  /// The rows of the run — normally [AppTxRow]s. Content stays with the screen:
  /// which figure to format, which amount arm paints and what the second line
  /// says are all decided in `Dashboard.tsx` and `ReportsCentre.tsx`, beside the
  /// date arithmetic that produced [dayLabel].
  final List<Widget> rows;

  /// The day to header the run with, or `null` for a run that has no header.
  ///
  /// The label is the screen’s string; [AppDayHead] applies the `text-transform`
  /// that `.eyebrow` authors, so a day arrives as it reads (`Today`), not
  /// pre-shouted.
  final String? dayLabel;

  /// Whatever the screen adds beside the class, merged over the measured label.
  final TextStyle? dayLabelStyle;

  /// Whether the run is a `divide-y` container.
  ///
  /// `Dashboard.tsx:419` wraps each group’s rows in
  /// `divide-y divide-[var(--line)]` whose children carry
  /// `[&:last-child]:border-b-0`; the Reports Centre’s list cites neither, so it
  /// passes `false` and its rows sit on the rail’s `space-y` margin instead.
  final bool divides;

  /// Whether this section is a day group — the case that brings a header the
  /// rail has to keep pinned while its rows pass under it.
  bool get isDayGroup => dayLabel != null;
}

/// The ledger: a scroll rail, its sections and its empty state, painted from the
/// measured `ledger-*` rows and the row family they carry.
///
/// The rail is the only part of this port the two viewports disagree about, and
/// the disagreement is the design: [AppLedgerRailSpec] holds a pair of
/// max-heights, overflow modes and right gutters, and [wideBreakpointPx] picks
/// between them the way the `lg:` gating does. That width comes from the caller
/// for the same reason [AppModal]’s does — the breakpoint enumeration is a fact
/// about the sheet, not a property of these rows, and nothing here guesses it.
///
/// What the rail then does follows from the measured `overflow-y`: `auto` becomes
/// a scroll view bounded by that viewport’s `max-height`, `visible` (the
/// dashboard below the breakpoint) becomes a column that takes the page’s own
/// scroll. A sticky header pinned to a list that does not scroll is pinned to the
/// page, so in the column case [AppDayHead] rides at the top of its group and the
/// screen’s scroll view owns the pinning; in the scrolling case the header is a
/// pinned sliver, which is the same fact arrived at the Flutter way.
///
/// Three measured facts lay out the children:
/// * `space-y-*` authors [AppLedgerRailSpec.rowMarginTopPx] on every rail child
///   after the first. A header-less section is a grouping of convenience — on the
///   web the rail’s children *are* its rows — so such a section hands its rows to
///   that sequence directly, which is how the Reports Centre gets 4px between
///   rows without the port inventing a second scale. Day groups are one child
///   each, which is what the dashboard’s unspaced rail measures.
/// * `divide-y` is [AppLedgerDivider]: one line between neighbours, none after the
///   last, and each group starts again.
/// * the empty state is a child, not an overlay — both screens swap the rows for
///   one box, first and only, so it takes no rail margin.
///
/// The dashboard rail also cites `min-h-0`, a CSS flex reset that lets a flex
/// child shrink below its content so `max-height` can bind. A Flutter scroll view
/// is not a flex child and needs no such reset, so there is nothing here to draw
/// for it.
class AppLedger extends StatelessWidget {
  const AppLedger({
    required this.sections,
    required this.rail,
    required this.wideBreakpointPx,
    super.key,
    this.empty,
    this.controller,
    this.physics,
  });

  /// The runs of rows the rail holds.
  final List<AppLedgerSection> sections;

  /// Which rail this is — [AppRows.ledgerRail] for the dashboard’s activity list,
  /// [AppRows.reportsRail] for the Reports Centre’s filtered history. Taken as a
  /// value because the two disagree on every pair in it.
  final AppLedgerRailSpec rail;

  /// The width at which the rail switches from its narrow pair to its wide pair.
  final double wideBreakpointPx;

  /// The box that replaces the rows when there are none: [AppLedgerEmpty] for the
  /// dashboard, [AppLedgerEmptyRc] for the Reports Centre.
  final Widget? empty;

  /// The scroll position, for a screen that restores it.
  final ScrollController? controller;

  /// `null` leaves the platform default. A rail that shrinks to its content
  /// inside a page usually wants the page to answer for the physics, which is why
  /// this is a parameter rather than a choice made here.
  final ScrollPhysics? physics;

  @override
  Widget build(BuildContext context) {
    final Brightness brightness = Theme.of(context).brightness;
    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        final bool wide =
            constraints.maxWidth.isFinite &&
            constraints.maxWidth >= wideBreakpointPx;
        final double? maxHeight = wide
            ? rail.wideMaxHeightPx
            : rail.narrowMaxHeightPx;
        final bool scrolls =
            (wide ? rail.wideOverflowYCss : rail.narrowOverflowYCss) == 'auto';
        // `pr-1` reserves the scrollbar gutter on the right edge alone: an inset
        // of the rail, never a padding on the rows.
        final double gutter = wide
            ? rail.widePaddingRightPx
            : rail.narrowPaddingRightPx;

        final List<_RailChild> children = _railChildren();
        if (children.isEmpty) {
          // Nothing to lay out: an empty scroll view is an error in Flutter and a
          // zero-height block on the web, so the rail draws nothing and lets the
          // screen’s own chrome hold the space.
          return const SizedBox.shrink();
        }
        final Widget body = scrolls
            ? CustomScrollView(
                slivers: _railSlivers(brightness, children),
                controller: controller,
                physics: physics,
                // `max-height` sizes the web’s box to its content and only scrolls
                // past it, which is `shrinkWrap`. A rail with no max-height at this
                // viewport is bounded by its parent and fills it instead.
                shrinkWrap: maxHeight != null,
                primary: false,
              )
            : Column(
                // A block: full width, height by content, headers unpinned
                // because nothing here scrolls to pin them against.
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: _boxChildren(brightness, children),
              );

        return Padding(
          padding: EdgeInsets.only(right: gutter),
          child: maxHeight == null
              ? body
              : ConstrainedBox(
                  constraints: BoxConstraints(maxHeight: maxHeight),
                  child: body,
                ),
        );
      },
    );
  }

  /// The rail’s child sequence: day groups whole, header-less sections as their
  /// rows, and the empty state as the single child when there is nothing else.
  List<_RailChild> _railChildren() {
    final List<_RailChild> out = <_RailChild>[];
    for (final AppLedgerSection section in sections) {
      if (section.isDayGroup) {
        out.add(_RailChild.dayGroup(section));
      } else {
        for (final Widget row in section.rows) {
          out.add(_RailChild.loose(row));
        }
      }
    }
    if (out.isEmpty && empty != null) {
      out.add(_RailChild.loose(empty!));
    }
    return out;
  }

  /// `space-y-*` as a margin above each child after the first — which is what the
  /// utility’s `:not(:first-child)` selector does, and why the first child of an
  /// empty state or a single-row list measures no inset.
  EdgeInsets _marginAbove(List<_RailChild> children, int index) =>
      EdgeInsets.only(top: index == 0 ? 0.0 : (rail.rowMarginTopPx ?? 0.0));

  List<Widget> _boxChildren(Brightness brightness, List<_RailChild> children) =>
      <Widget>[
        for (int i = 0; i < children.length; i++)
          Padding(
            padding: _marginAbove(children, i),
            child: _content(brightness, children[i]),
          ),
      ];

  List<Widget> _railSlivers(Brightness brightness, List<_RailChild> children) =>
      <Widget>[
        for (int i = 0; i < children.length; i++)
          SliverPadding(
            padding: _marginAbove(children, i),
            sliver: _sliver(brightness, children[i]),
          ),
      ];

  /// A day group is its header plus its rows; anything else is the row itself.
  Widget _content(Brightness brightness, _RailChild child) {
    final AppLedgerSection? group = child.group;
    if (group == null) return child.row!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        AppDayHead(label: group.dayLabel!, style: group.dayLabelStyle),
        ..._divided(group),
      ],
    );
  }

  Widget _sliver(Brightness brightness, _RailChild child) {
    final AppLedgerSection? group = child.group;
    if (group == null) return SliverToBoxAdapter(child: child.row!);
    return SliverMainAxisGroup(
      slivers: <Widget>[
        SliverPersistentHeader(
          // `.day-head` is `position: sticky; top: 0`: the header holds the
          // rail’s top edge while its group’s rows pass under it.
          pinned: true,
          delegate: _AppDayHeadSliver(
            spec: AppRows.dayHead(brightness),
            label: group.dayLabel!,
            style: group.dayLabelStyle,
          ),
        ),
        SliverList(delegate: SliverChildListDelegate(_divided(group))),
      ],
    );
  }

  /// N rows and N−1 hairlines, the line taken off the last child exactly as
  /// `[&:last-child]:border-b-0` does. A section that cites no `divide-y` gets
  /// its rows whole, which is the Reports Centre’s list.
  List<Widget> _divided(AppLedgerSection group) => <Widget>[
    for (int i = 0; i < group.rows.length; i++) ...<Widget>[
      if (i > 0 && group.divides) AppLedgerDivider(),
      group.rows[i],
    ],
  ];
}

/// The dashboard’s empty state: a framed box over `--surface-2` whose content the
/// screen writes.
///
/// The box is the measured `ledger-empty` row — `py-10`, `rounded-[var(--r-sm)]`,
/// `border border-dashed border-[var(--line)]`, `bg-[var(--surface-2)]`,
/// `text-center` — and nothing more: `Dashboard.tsx:408` fills it with an
/// `.eyebrow` line and a `text-xs` line, which are that screen’s message, so they
/// arrive as [child].
///
/// [AppLedgerEmptySpec.border] is a solid hairline. The CSS frame is `dashed` and
/// Flutter’s `Border` has no dash pattern; the width, colour and radius all
/// travel from the measurement, and the missing dash is the deviation the spec
/// records rather than an approximation this widget invents.
///
/// The alignment is the class’s `text-align`, which in Flutter only reaches text
/// that the child lets inherit — a `Text` with its own `textAlign` answers for
/// itself, exactly as on the web.
class AppLedgerEmpty extends StatelessWidget {
  const AppLedgerEmpty({required this.child, super.key});

  /// The screen’s message, laid in the box.
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final AppLedgerEmptySpec spec = AppRows.empty(Theme.of(context).brightness);
    return Container(
      padding: spec.padding,
      decoration: BoxDecoration(
        color: spec.fillColor,
        border: spec.border,
        borderRadius: spec.radius,
      ),
      child: DefaultTextStyle.merge(
        textAlign: switch (spec.textAlignCss) {
          'center' => TextAlign.center,
          'right' => TextAlign.right,
          _ => null,
        },
        child: child,
      ),
    );
  }
}

/// The Reports Centre’s empty state: a bare column of glyph and line.
///
/// `ReportsCentre.tsx:494` writes `empty py-10 flex flex-col items-center gap-2`,
/// and the measured `ledger-empty-rc` row carries that gap and that inset. The
/// `empty` class is cited there and declared nowhere in the stylesheet, so this
/// box has no fill and no frame — generation asserts the rule is still absent
/// rather than trusting the record, and the box stays what the utilities measure.
///
/// [line] is the figure under the headline, drawn in the measured `mono
/// text-[12px]` of the `ledger-empty-rc-line` row. The glyph above it is the
/// caller’s, as everywhere else in this port (`lucide-react` is not a Flutter
/// dependency) — and it is a caller’s [size] too: the web’s `size={20}` and
/// `style={{color: 'var(--ink-3)'}}` are inline SVG attributes on an icon, which
/// no measured row of this family carries, so the port leaves both with the
/// drawing rather than typing either here.
class AppLedgerEmptyRc extends StatelessWidget {
  const AppLedgerEmptyRc({required this.line, super.key, this.glyph});

  /// The headline’s subject — on the web `No entries match this filter.`.
  final String line;

  /// The icon above the line.
  final Widget? glyph;

  @override
  Widget build(BuildContext context) {
    final Brightness brightness = Theme.of(context).brightness;
    final AppLedgerEmptyRcSpec spec = AppRows.emptyRc(brightness);
    return Column(
      // `flex flex-col items-center gap-2`: content-sized, centred, with the
      // measured gap between whatever the two children are.
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: <Widget>[
        if (glyph != null) ...<Widget>[
          ExcludeSemantics(child: glyph!),
          SizedBox(height: spec.gapPx),
        ],
        Text(line, style: spec.line.textStyle),
      ],
    );
  }
}

/// One child of the rail, after the day-grouping is resolved.
class _RailChild {
  const _RailChild.dayGroup(this.group) : row = null;

  const _RailChild.loose(this.row) : group = null;

  /// A day group, or `null` for a loose row.
  final AppLedgerSection? group;

  /// A loose row or the empty state, or `null` inside a group.
  final Widget? row;
}

/// The sticky header as a sliver: [AppDayHead]’s box at a height the same label
/// takes on its own.
///
/// The extent is arithmetic rather than a measured layout: `.eyebrow` lines the
/// label at a fixed multiplier of its size, and the header is one line, so the
/// height is that line plus the class’s own vertical inset — every term read from
/// [spec], none typed.
class _AppDayHeadSliver extends SliverPersistentHeaderDelegate {
  _AppDayHeadSliver({required this.spec, required this.label, this.style});

  final AppDayHeadSpec spec;
  final String label;
  final TextStyle? style;

  double get _extent =>
      spec.fontSizePx * spec.heightRatio +
      spec.padding.top +
      spec.padding.bottom;

  @override
  double get minExtent => _extent;

  @override
  double get maxExtent => _extent;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) => AppDayHead(label: label, style: style);

  @override
  bool shouldRebuild(covariant _AppDayHeadSliver oldDelegate) =>
      oldDelegate.label != label ||
      oldDelegate.style != style ||
      oldDelegate.spec.fillColor != spec.fillColor;
}
