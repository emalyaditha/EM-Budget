import 'package:flutter/material.dart';

import '../../core/theme/app_numerals.dart';

/// The figure rows of `src/index.css:359-426` — the classes the design system
/// puts on a money number.
///
/// `.numeral-sup` is deliberately absent: it authors every metric in `em`
/// against the numeral it sits inside, so it only means something as
/// [AppNumeral.superscript] and never as a face of its own. `.eyebrow` is the
/// caption row and lives with `AppLabels`, which owns the `text-transform`.
enum AppNumeralKind {
  /// `src/index.css:379` — the largest row: display face, 800 weight, 1.05.
  moneyDisplay('.money-display'),

  /// `src/index.css:389` — the reference's defining move: large, light, tight.
  numeral('.numeral'),

  /// `src/index.css:399` — `.numeral` at a mid clamp, 400 weight. No call site
  /// in `src/` today; ported because the row is part of the type scale.
  numeralMd('.numeral-md'),

  /// `src/index.css:411` — the hero figure, capped by its own card.
  numeralHero('.numeral-hero'),

  /// `src/index.css:423` — the money overlay: tabular figures and −0.01em.
  money('.money'),

  /// `src/index.css:362` — mono, for a masked card number.
  mono('.mono');

  const AppNumeralKind(this.cssClass);

  /// The key [AppNumerals] stores the measured row under.
  final String cssClass;

  /// The row whose metrics render at the call site. `.numeral-hero` authors a
  /// `font-size` and nothing else, and its only call site
  /// (`src/components/dashboard/DashboardHero.tsx:173`) carries
  /// `numeral numeral-hero`, so the hero contributes the cap and `.numeral`
  /// contributes family, weight, line-height, tracking and tabular figures.
  String get metricsClass => this == numeralHero ? '.numeral' : cssClass;
}

/// One money figure, painted from the measured row that [kind] names.
///
/// This widget takes its digits already formatted. `src/` formats every amount
/// through `formatMoney` (`src/lib/money.ts`) before it reaches a numeral, and
/// the port is no different: pass the string the domain functions returned —
/// `mobile/lib/domain/money.dart` — and this widget will not touch it. A
/// numeral that re-formatted would be a second, locale-divergent copy of that
/// logic.
///
/// `style` is the channel for a call site's own utility classes, which on the
/// web sit after the row in the class list and win property by property
/// (`CardFace.tsx:78`'s `text-[19px] font-extrabold text-white leading-tight`).
/// [TextStyle.merge] reproduces exactly that: only the fields a caller sets are
/// overridden, so `text-[19px]` moves the size without dropping the row's
/// tabular figures, its family or its colour. It also moves the row's tracking,
/// because every tracking value here is authored in `em` and CSS resolves an
/// `em` against the used font size — see `build`.
///
/// Two authored facts have no engine knob here and are carried as data on
/// [AppNumeralSpec] instead, both re-checked when the fonts land:
///
/// * `overflow-wrap: anywhere` — this Flutter SDK exposes neither
///   `TextStyle.overflowWrap` nor `Text.wordBreak`, so a figure breaks only at
///   a space. Nothing in the ported screens relies on it: the hero keeps its
///   `min()` cap and the card face keeps `maxFractionDigits: 0`, and the
///   behaviour test pins every fixture amount inside its box at 360px.
/// * `min-width: 0` — a flex-item hint. Flutter already offers a `Text` its
///   parent's max width, so there is nothing to port.
class AppNumeral extends StatelessWidget {
  const AppNumeral({
    required this.text,
    super.key,
    this.kind = AppNumeralKind.numeral,
    this.superscript,
    this.containerInlineSizePx,
    this.style,
    this.textAlign,
    this.maxLines,
    this.softWrap = true,
  }) : assert(
         containerInlineSizePx == null || kind == AppNumeralKind.numeralHero,
         'containerInlineSizePx is the hero’s min() input; no other row reads a container',
       );

  /// The figure, formatted by `mobile/lib/domain/money.dart`. Never parsed,
  /// re-rounded or re-localised here.
  final String text;

  /// Which measured row paints it.
  final AppNumeralKind kind;

  /// The `.numeral-sup` tag that follows the digits — on the web the currency
  /// code at `DashboardHero.tsx:180`. Its size, tracking, lift and gap are all
  /// `em` values of this figure's font size, so they move with [style]'s
  /// `fontSize` just as they do in the browser.
  final String? superscript;

  /// The inline size of the `.hero-face` container ([kind] sits in), which
  /// `container-type: inline-size` (`src/index.css:408`) makes the hero's
  /// `15cqi` resolve against. Read only by [AppNumeralKind.numeralHero]; the
  /// assert rejects it anywhere else.
  final double? containerInlineSizePx;

  /// The call site's own overrides, merged over the measured row.
  final TextStyle? style;

  final TextAlign? textAlign;
  final int? maxLines;

  /// `white-space` is `normal` on every one of these rows, so soft wrapping is
  /// the authored behaviour.
  final bool softWrap;

  @override
  Widget build(BuildContext context) {
    final Brightness brightness = Theme.of(context).brightness;
    final AppNumeralSpec row = AppNumerals.resolve(
      kind.metricsClass,
      brightness,
    );
    final double? container = containerInlineSizePx;
    final double rowFontSizePx =
        kind == AppNumeralKind.numeralHero && container != null
        ? AppNumerals.heroFontSizePx(container, brightness)
        : row.fontSizePx;
    // Every one of these rows authors its tracking in `em`
    // (`src/index.css:379-426`: -0.02, -0.03, -0.01, 0.04), and CSS resolves an
    // `em` against the *used* font size — which a call site's `text-[19px]`
    // moves. So the size a caller sets is the size the row's own metrics are
    // re-resolved at, and only then are the caller's remaining properties
    // merged over the top.
    final double usedFontSizePx = style?.fontSize ?? rowFontSizePx;
    final TextStyle figure = row.styleAt(usedFontSizePx).merge(style);

    final String? tag = superscript;
    if (tag == null) {
      return Text.rich(
        TextSpan(text: text),
        style: figure,
        textAlign: textAlign,
        maxLines: maxLines,
        softWrap: softWrap,
      );
    }

    final AppNumeralSupBox sup = AppNumerals.supAt(usedFontSizePx, brightness);
    return Text.rich(
      TextSpan(
        children: <InlineSpan>[
          TextSpan(text: text),
          // `vertical-align: 0.62em` is a paint-time raise of an inline box: it
          // does not give the span room in the line, it moves the span within
          // the room the parent's line box already has. So the tag starts where
          // CSS starts it — its own alphabetic baseline on the figure's — and
          // the translate lifts the glyphs without moving the box the line
          // flows around: `RenderShiftedBox.computeDistanceToActualBaseline`
          // forwards the `Text`'s real baseline through both wrappers, so
          // `aboveBaseline` still measures from the baseline and not the box
          // bottom. `margin-left` is inline space, so it is layout padding
          // rather than part of the shift.
          WidgetSpan(
            alignment: PlaceholderAlignment.aboveBaseline,
            baseline: TextBaseline.alphabetic,
            child: Padding(
              padding: EdgeInsets.only(left: sup.gapPx),
              child: Transform.translate(
                offset: Offset(0.0, -sup.liftPx),
                child: Text(tag, style: sup.style),
              ),
            ),
          ),
        ],
      ),
      style: figure,
      textAlign: textAlign,
      maxLines: maxLines,
      softWrap: softWrap,
    );
  }
}
