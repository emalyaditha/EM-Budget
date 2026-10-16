// GENERATED — do not edit by hand.
// Produced by `node parity/generate_theme.cjs` from `parity/ui-tokens.json`, the
// Chrome-computed measurement of `src/index.css` at tag `pre-flutter`, with the
// curated token lists and phone markers of `parity/UI_SPEC.md` §2.1–§4.
// Every value below is the measurement; UI_SPEC §5 (whose machine "Dart" column
// mis-parses --blur-* / --container-* names as radii) is deliberately not used.

import 'package:flutter/material.dart';

import 'app_radii.dart';
import 'app_shadows.dart';

/// The card face, the wallet deck its peers peek out of, and the three action
/// keys under the hero balance — the three boxes `src/index.css` paints with a
/// gradient of its own rather than with a surface token.
///
/// As for the ledger, the measurement is a `utilityStacks` row: the verbatim
/// class list — plus, where the component writes one, the inline `style` — on the
/// element the component really uses. A §6 probe cannot see a Tailwind utility,
/// and `src/index.css` supplies what a detached element cannot show: a tone's
/// gradient, the `.card-face::before` sheen, a state rule, the deck lip.
///
/// Three laws bind this file. A fact another generated family owns is cited and
/// cross-checked here, never restated: `.card-face`’s corner is AppRadii’s and its
/// float AppShadows’, the gold chip is AppChips’, and the balance figure is the
/// `.money` face AppNumerals ports. A value no pass measured fails generation —
/// there is no default in this file. And a box whose measured height is the
/// mount’s own width over an authored ratio is ported as that ratio, never as
/// the pixels, which is why no `*Px` here names a width.

/// A tone of `CardFace.tsx`’s `FACE_TONES` table, in the order the component
/// declares them. Generation reads the array out of the pinned source and
/// requires it to list exactly the tones whose rows were measured, so an enum
/// here cannot drift from the component without the run failing.
enum AppFaceTone {
  violet('face-violet', 'face-box-violet'),
  blue('face-blue', 'face-box-blue'),
  teal('face-teal', 'face-box-teal'),
  amber('face-amber', 'face-box-amber'),
  rose('face-rose', 'face-box-rose'),
  graphite('face-graphite', 'face-box-graphite');

  const AppFaceTone(this.cssClass, this.stackRow);

  /// The `.face-*` class that paints this tone.
  final String cssClass;

  /// The `utilityStacks` row the tone’s own box was measured on.
  final String stackRow;

  /// The tone `CardFace.tsx` falls back to when the caller passes none — the
  /// prop default the non-interactive arm was measured with, read off the line
  /// that declares it.
  static const AppFaceTone defaultTone = AppFaceTone.violet;
}

/// One stop of a tone’s gradient, as the sheet authors it and as the pass painted
/// it. The two are the same fact from two directions: `authored` is the
/// `color-mix(…)` text in `src/index.css`, and [colour] is what Chrome resolved
/// from it at this brightness, which generation requires a bare anchor stop to
/// equal exactly.
class AppFaceStopSpec {
  const AppFaceStopSpec({
    required this.at,
    required this.colour,
    required this.authored,
    this.hueToken,
    required this.mixPercent,
    required this.anchorToken,
  });

  /// The stop’s position along the gradient, as the recipe authors it: 0% and 100%.
  final double at;

  /// The pixels this pass painted — a `color-mix` is the engine’s arithmetic, so
  /// this is the resolved colour, not a formula.
  final Color colour;

  /// The stop exactly as the rule writes it, so the measurement can be traced back to the stylesheet.
  final String authored;

  /// The `--hue-*` token the stop mixes from, `null` for the stop that is the bare anchor.
  final String? hueToken;

  /// How much of [hueToken] the stop mixes with [anchorToken]; `0` when the stop is the anchor itself.
  final double mixPercent;

  /// The token both stops mix over — `--face-anchor`, the one colour every tone shares.
  final String anchorToken;
}

/// One tone: the gradient `src/index.css` authors for it and the pixels each
/// pass painted from that recipe.
///
/// A tone changes the paint and nothing else. Generation measured a whole box
/// for every tone and refused one whose geometry disagrees with the first, so
/// the widget draws [fillAt] inside [AppCardFaceSpec] rather than picking a
/// different frame.
class AppFaceTintSpec {
  const AppFaceTintSpec({
    required this.cssClass,
    required this.stackRow,
    required this.authoredSrc,
    required this.recipeSrc,
    required this.angleDeg,
    required this.anchorToken,
    required this.light,
    required this.dark,
    required this.fillLight,
    required this.fillDark,
  });

  /// `.face-blue` — the rule that paints this tone.
  final String cssClass;

  /// The measured box this tone was mounted as.
  final String stackRow;

  /// Where the component writes the class list, with the tone filled into its hole.
  final String authoredSrc;

  /// Where the sheet authors the gradient.
  final String recipeSrc;

  /// The authored gradient angle, which every pass measured unchanged.
  final double angleDeg;

  /// The `:root` token both stops mix over.
  final String anchorToken;

  /// The stops as the light pass painted them.
  final List<AppFaceStopSpec> light;

  /// The stops as the dark pass painted them — the same recipe, resolved over the dark anchor.
  final List<AppFaceStopSpec> dark;

  /// The gradient the light pass measured, which is [light] drawn.
  final LinearGradient fillLight;

  /// The gradient the dark pass measured.
  final LinearGradient fillDark;

  /// The gradient this pass painted, which is [light] or [dark] drawn.
  LinearGradient fillAt(Brightness brightness) =>
      brightness == Brightness.dark ? fillDark : fillLight;
}

/// The `.card-face::before` layer, ported as the two gradients the rule authors.
///
/// A detached element cannot show a pseudo-element, so this whole spec is the
/// pinned rule read with `ruleProps` — the same law `.skeleton::after` and the
/// chip ring set. Generation parses every number out of the declaration with two
/// anchored regexes and stops if either layer does not match it, and refuses a
/// rule that sets a property outside the five the sheen is made of.
///
/// It is one spec, not a per-brightness pair: the sheen paints the same white
/// over every tone and both schemes, which is why `.card-face::before` authors no
/// token at all.
class AppFaceSheenSpec {
  const AppFaceSheenSpec({
    required this.cssClass,
    required this.ruleSrc,
    required this.authoredBackground,
    required this.highlightCentreX,
    required this.highlightCentreY,
    required this.highlightRadiusX,
    required this.highlightRadiusY,
    required this.highlightColour,
    required this.highlightFadeAt,
    required this.highlightClearAt,
    required this.stripeAngleDeg,
    required this.stripeClearUntilPx,
    required this.stripeColour,
    required this.stripeFromPx,
    required this.stripeToPx,
  });

  /// The pseudo-element’s own class.
  final String cssClass;

  /// Where the sheet authors it.
  final String ruleSrc;

  /// The two layers exactly as the rule writes them, so the numbers below can be
  /// traced back to the declaration the reader parsed.
  final String authoredBackground;

  /// The ellipse’s centre as a fraction of the box, `at 85% 10%` divided by 100.
  final double highlightCentreX;

  final double highlightCentreY;

  /// The ellipse’s own radius as a fraction of the box, which is why it is larger than the box.
  final double highlightRadiusX;

  final double highlightRadiusY;

  /// The highlight’s white and alpha.
  final Color highlightColour;

  /// Where the colour starts — the rule’s `0%`, so the fade is the whole radius.
  final double highlightFadeAt;

  /// Where it reaches `transparent`, i.e. 50% of that radius.
  final double highlightClearAt;

  /// The `repeating-linear-gradient` angle.
  final double stripeAngleDeg;

  /// The first px the stripe leaves transparent — the same number the coloured stop opens at.
  final double stripeClearUntilPx;

  /// The hairline’s white and alpha.
  final Color stripeColour;

  /// Where the hairline starts.
  final double stripeFromPx;

  /// Where it stops, and therefore the period’s end.
  final double stripeToPx;

  /// The centre as a Flutter alignment, which is the same -1..1 space CSS’s
  /// percentage coordinates describe.
  Alignment get highlightCentre =>
      Alignment(highlightCentreX * 2.0 - 1.0, highlightCentreY * 2.0 - 1.0);

  /// The hairline’s period: the stripe’s `to` minus its `from`, which is why
  /// the two numbers above travel as a pair and not as a width.
  double get stripePeriodPx => stripeToPx - stripeFromPx;
}

/// The press a face takes, from `.pressable`.
///
/// Hover is deliberately absent. Ruling D-U1 drops every hover state in this
/// port because Flutter has no hover on a touch device, so the sheet’s
/// `filter: brightness(…)` rules are measured, recorded and not ported; the
/// press survives because a touch device does have one.
class AppFacePressSpec {
  const AppFacePressSpec({
    required this.cssClass,
    required this.restSrc,
    required this.activeSrc,
    required this.pressScale,
    required this.pressDurationMs,
    required this.easeX1,
    required this.easeY1,
    required this.easeX2,
    required this.easeY2,
    required this.transitionProps,
  });

  /// `.pressable`, the class the face box cites.
  final String cssClass;

  /// Where the rest state’s transition is authored.
  final String restSrc;

  /// Where `:active` is authored.
  final String activeSrc;

  /// The `transform: scale(…)` a press takes. The face and the ledger row cite
  /// the same rule, so this is the same number in both files, read twice rather
  /// than imported.
  final double pressScale;

  /// The authored transition duration.
  final int pressDurationMs;

  /// The `cubic-bezier` control points, in the order CSS writes them.
  final double easeX1;

  final double easeY1;

  final double easeX2;

  final double easeY2;

  /// What the transition animates — `transform` and nothing else, which
  /// `controlTransition` requires before any of this is emitted.
  final String transitionProps;

  /// The authored easing, as the curve Flutter reproduces it.
  Cubic get ease => Cubic(easeX1, easeY1, easeX2, easeY2);
}

/// A named band of the face — one element of `CardFace.tsx`’s tree, measured on
/// the class list the component really writes there. The deck’s badge is not a
/// member: `WalletDeck.tsx` passes the face the same class list, and generation
/// proves the two rows measure identically before it ports one band for both.
enum AppFaceSlot {
  topRow('face-top-row'),
  nameBlock('face-name-block'),
  bankName('face-bank-name'),
  cardName('face-card-name'),
  badge('face-badge'),
  amountBlock('face-amount-block'),
  balanceLabel('face-balance-label'),
  balance('face-balance'),
  numberBlock('face-number-block'),
  chipRow('face-chip-row'),
  cardNumber('face-card-number'),

  /// The word under an action key’s glyph. It is a band of the key, not of the
  /// face, and shares this table because it is measured the same way — as one
  /// detached row that inherits its ink.
  label('action-key-label');

  const AppFaceSlot(this.stackRow);

  /// The `utilityStacks` row this band was measured from.
  final String stackRow;
}

/// One band of the face — or the word under an action key — as the element the
/// component really writes: its class list, and everything the pass measured on
/// it.
///
/// A band is read in both brightnesses and generation refuses one whose geometry
/// moves between them. The face paints its own ink, so a scheme change cannot
/// re-flow these bands, and a band that tried to would be a second design rather
/// than one ported twice. The type classes they cite, though, belong to other
/// families: [authoredTypeClass] is `.money`, `.eyebrow` or `.mono` and those
/// rows stay emitted where they are owned.
class AppFaceSlotSpec {
  const AppFaceSlotSpec({
    required this.stackRow,
    required this.cssClasses,
    required this.authoredSrc,
    required this.displayCss,
    required this.positionCss,
    required this.zIndexCss,
    required this.flexDirectionCss,
    required this.alignItemsCss,
    required this.justifyContentCss,
    this.gapPx,
    required this.marginTopPx,
    required this.marginBottomPx,
    required this.paddingTopPx,
    required this.paddingRightPx,
    required this.paddingBottomPx,
    required this.paddingLeftPx,
    required this.fontFamily,
    required this.fontSizePx,
    required this.fontWeight,
    required this.heightRatio,
    required this.letterSpacingPx,
    required this.letterSpacingEm,
    this.textColor,
    required this.inheritsFaceInk,
    this.textTransformCss,
    this.whiteSpaceCss,
    this.textOverflowCss,
    required this.truncates,
    required this.tabularNums,
    this.authoredTypeClass,
    this.authoredTypeSrc,
    this.radiusPx,
    required this.radiusIsPill,
    required this.borderWidthPx,
    this.borderColor,
    this.minWidthZero,
    required this.flexGrow,
    required this.flexShrink,
    this.leadingUtility,
    this.leadingToken,
    required this.leadingValue,
  });

  /// The `utilityStacks` row this band was measured from.
  final String stackRow;

  /// The verbatim class list the component writes on this element.
  final String cssClasses;

  /// `file:lines` of that class list, re-checked against the pinned source before emission.
  final String authoredSrc;

  /// The measured `display`, which is what the widget lays out as.
  final String displayCss;

  /// The measured `position`; `static` for a band that lifts nothing above the sheen.
  final String positionCss;

  /// The authored stacking, as the sheet writes it: `10` on the bands that sit over
  /// `.card-face::before`, `auto` on the rest. Flutter needs no z-index for this —
  /// the sheen is painted under the column — so it travels as the record of why the
  /// web needed one.
  final String zIndexCss;

  /// The measured `flex-direction`; a `display: block` row answers `row` and never uses it.
  final String flexDirectionCss;

  /// The measured `align-items`; `normal` where no flex axis asks for one.
  final String alignItemsCss;

  /// The measured `justify-content`; `normal` for a block flow, `space-between` for the two rows that spread.
  final String justifyContentCss;

  /// The measured `gap` in phone px, `null` where the row measures `normal` — which is no gap.
  final double? gapPx;

  /// The measured top offset. Tailwind v4’s `space-y-*` puts its space on the
  /// first child’s bottom margin, so this is `0` for the last child of a spaced
  /// parent; generation requires exactly one of `face-number-block`’s two children
  /// to carry the margin and names it.
  final double marginTopPx;

  /// The measured bottom offset — the `space-y-2` side at the unit every pass
  /// agrees on, and `0` for every other band.
  final double marginBottomPx;

  /// The band’s own inner inset; only the badge asks for any.
  final double paddingTopPx;

  final double paddingRightPx;

  final double paddingBottomPx;

  final double paddingLeftPx;

  /// The first family of the stack this band paints in. A band that cites a type
  /// class takes it from that class’s §6 probe; one that cites none is measured
  /// detached, so it reports the body family and takes the face’s own when mounted.
  final String fontFamily;

  /// The phone font size.
  final double fontSizePx;

  /// The measured numeric weight, carried as a number so [weight] can name it.
  final int fontWeight;

  /// The line box as a multiplier of the size — the band’s own `leading-*` utility
  /// if it authors one (`leading-tight` on the balance figure), the `body`
  /// multiplier generation re-reads and requires to be identical otherwise.
  final double heightRatio;

  /// The phone resolution of the tracking.
  final double letterSpacingPx;

  /// The `em` that produced it, so [styleAt] can re-derive it at another size.
  final double letterSpacingEm;

  /// The colour the band painted, or `null` where it authors none. A band that
  /// names no colour is [inheritsFaceInk] and paints whatever the face hands down,
  /// which is why no colour is guessed for it here.
  final Color? textColor;

  /// True exactly when neither the class list nor an inline style authors a colour.
  final bool inheritsFaceInk;

  /// The measured `text-transform` — `uppercase` for the eyebrow and the badge,
  /// `null` for a band that leaves it `none`.
  final String? textTransformCss;

  /// The measured `white-space`.
  final String? whiteSpaceCss;

  /// The measured `text-overflow`; `null` where the row measures none, which is a detached row’s own answer.
  final String? textOverflowCss;

  /// `truncate`, proven as the trio it actually measures (`nowrap`, `ellipsis`,
  /// `overflow: hidden`) and as a word of the class list.
  final bool truncates;

  /// `font-variant-numeric: tabular-nums`, which the cited type class authors and the
  /// widget answers with [FontFeature.tabularFigures] — a font feature, so it does
  /// nothing in a fallback face and is re-checked when the design-system fonts land.
  final bool tabularNums;

  /// The `src/index.css` type class the band cites — `.mono`, `.eyebrow`, `.money` —
  /// which the family that owns that class ports; `null` where the band sizes itself
  /// with utilities alone.
  final String? authoredTypeClass;

  /// Where that class is authored, so the citation a reader follows is the one generation checked.
  final String? authoredTypeSrc;

  /// The measured corner, `null` for a pill — see [radiusIsPill].
  final double? radiusPx;

  /// `rounded-full`, which Chrome resolves past any box. Generation accepts that
  /// sentinel only when the class list really asks for it, and refuses a pill the
  /// pixels do not show, so this is the class and the measurement agreeing.
  final bool radiusIsPill;

  /// The measured frame width; `0` for every band that draws none.
  final double borderWidthPx;

  /// The frame’s colour, `null` where no frame was measured.
  final Color? borderColor;

  /// `min-w-0`, only where the row asked for it: the web’s hint that a long figure
  /// may shrink below its content width. Flutter gives a `Text` its parent’s max
  /// width already, so this is a record rather than a port; `null` says the property
  /// was never measured and is not a fact about this band.
  final bool? minWidthZero;

  /// The measured `flex-grow`.
  final double flexGrow;

  /// The measured `flex-shrink`.
  final double flexShrink;

  /// The `leading-*` utility the class list names, `null` where the band inherits its line box.
  final String? leadingUtility;

  /// The `:root` token that utility resolves to, `null` for `leading-none`, which authors none.
  final String? leadingToken;

  /// The multiplier the pass measured, which generation requires the utility and the token to produce.
  final double leadingValue;

  /// The weight Flutter names for the measured numeric weight.
  FontWeight get weight => FontWeight.values[fontWeight ~/ 100 - 1];

  /// The space this band asks for around itself. The face’s own inset is
  /// [AppCardFaceSpec]’s padding, never a text child’s margin, so the two never
  /// double-count.
  EdgeInsets get margin =>
      EdgeInsets.only(top: marginTopPx, bottom: marginBottomPx);

  /// The band’s own inner inset — the badge’s `px-2 py-0.5`, and nothing elsewhere.
  EdgeInsets get padding => EdgeInsets.fromLTRB(
    paddingLeftPx,
    paddingTopPx,
    paddingRightPx,
    paddingBottomPx,
  );

  /// Tabular figures where the cited class authors them.
  List<FontFeature> get fontFeatures => tabularNums
      ? const <FontFeature>[FontFeature.tabularFigures()]
      : const <FontFeature>[];

  /// The band as the phone pass measured it.
  TextStyle get textStyle => styleAt(fontSizePx);

  /// The band at another font size. CSS resolves tracking against the used font
  /// size, so a resized band re-derives it from [letterSpacingEm] rather than
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

/// The card face’s box in one brightness: the frame, the padding, the ink and the
/// ratio — the geometry every tone shares, which generation proves by reading all
/// six tone rows and refusing a second that disagrees.
///
/// The paint a tone adds is not here. [AppFaceTintSpec] carries the gradient, and
/// the corner and the float are named by token and resolved through AppRadii and
/// AppShadows, because `.card-face` is a rule in the same stylesheet those families
/// were emitted from and restating it would be a third copy of one fact.
///
/// The box also carries the component’s second arm: the same class list with the
/// cursor hole left empty, and the fixed rather than fluid `style`. Both were
/// measured, and the difference between them is exactly four fields.
class AppCardFaceSpec {
  const AppCardFaceSpec({
    required this.stackRow,
    required this.cssClasses,
    required this.authoredSrc,
    required this.styleSrc,
    required this.ruleSrc,
    required this.radiusToken,
    required this.shadowToken,
    required this.aspectRatio,
    required this.minWidthPx,
    required this.callerOwnsWidth,
    this.widthFullCss,
    required this.interactive,
    required this.cursorCss,
    required this.displayCss,
    required this.positionCss,
    required this.flexDirectionCss,
    required this.alignItemsCss,
    required this.justifyContentCss,
    required this.textAlignCss,
    required this.gapPx,
    required this.marginTopPx,
    required this.marginBottomPx,
    required this.paddingTopPx,
    required this.paddingRightPx,
    required this.paddingBottomPx,
    required this.paddingLeftPx,
    required this.borderWidthPx,
    required this.ink,
    required this.fill,
    required this.overflowXCss,
    required this.overflowYCss,
    required this.backdropFilterCss,
    required this.flexGrow,
    required this.flexShrink,
    required this.plainCssClasses,
    required this.plainStyleSrc,
    required this.plainMinWidthPx,
    this.plainWidthFullCss,
  });

  /// The `utilityStacks` row the box was measured on — the default tone’s.
  final String stackRow;

  /// The verbatim class list, with the tone and the cursor hole already filled.
  final String cssClasses;

  /// The lines that compose and mount that class list, re-checked against the pinned source.
  final String authoredSrc;

  /// The line that writes the inline `style` — the `fluid` arm, which owns the width.
  final String styleSrc;

  /// `.card-face`, the rule every face is under: the frame, the ink and the corner
  /// this file cites rather than restates.
  final String ruleSrc;

  /// The corner, named by the token `.card-face` asks for; [radiusPx] resolves it through AppRadii.
  final String radiusToken;

  /// The float, named by the token `.card-face` asks for; [shadowsAt] resolves it through AppShadows.
  final String shadowToken;

  /// The authored `aspect-ratio`. The box’s height is its own width over this
  /// number, so the port carries the ratio and never the pixels: what the phone
  /// pass measured as a height was a function of the mount.
  final double aspectRatio;

  /// The measured `min-width` of the arm this row was read on — `0` when the caller does not own the width.
  final double minWidthPx;

  /// Whether the inline style gives the box `width: 100%` (the card in a grid) or
  /// leaves the width to its caller (the deck’s fixed peers).
  final bool callerOwnsWidth;

  /// The authored width of that arm, `null` where the style writes none.
  final String? widthFullCss;

  /// `true` for the arm that takes `cursor-pointer` and `false` for the one the component renders as a plain `div`.
  final bool interactive;

  /// The measured `cursor`. A web-only fact, kept as the record of which arm is
  /// clickable; Flutter’s pointer device answers it with [AppFacePressSpec].
  final String cursorCss;

  /// The measured `display`.
  final String displayCss;

  /// The measured `position`, which `.card-face` authors as `relative` for the sheen’s layer.
  final String positionCss;

  /// The measured `flex-direction`: the column of bands.
  final String flexDirectionCss;

  /// The measured `align-items`; `normal` because the column stretches its children instead.
  final String alignItemsCss;

  /// The measured `justify-content`: `space-between` puts the figure at the bottom of the box.
  final String justifyContentCss;

  /// The measured `text-align` from `text-left`.
  final String textAlignCss;

  /// The measured `gap-2` between the bands.
  final double gapPx;

  /// The box’s own outer offset — `0`; the deck, not the face, pulls the stack up.
  final double marginTopPx;

  final double marginBottomPx;

  /// `p-3.5` at the unit all four passes agree on.
  final double paddingTopPx;

  final double paddingRightPx;

  final double paddingBottomPx;

  final double paddingLeftPx;

  /// The measured frame; `.card-face` authors none, so a face has no border to draw.
  final double borderWidthPx;

  /// The colour every band inherits — the `color: white` of `.card-face`, which
  /// generation requires the pass to paint exactly. A band that names its own
  /// transparency is a different alpha of the same white.
  final Color ink;

  /// The measured `background-color`, transparent because the tone paints a `background-image` gradient over it.
  final Color fill;

  /// The measured `overflow-x`, `hidden` by `.card-face`.
  final String overflowXCss;

  /// The measured `overflow-y`.
  final String overflowYCss;

  /// `none`, recorded because a face is a painted box, not a glass panel: the app’s
  /// blur classes are a different family.
  final String backdropFilterCss;

  /// The measured `flex-grow`.
  final double flexGrow;

  /// The measured `flex-shrink`.
  final double flexShrink;

  /// The non-interactive arm’s class list — the same template with the cursor hole
  /// left empty. Generation proves it ends in the space that empty hole writes, so
  /// the two arms are one template and not two designs.
  final String plainCssClasses;

  /// The other arm’s `style` line — the fixed one, which the component uses when the caller owns the width.
  final String plainStyleSrc;

  /// That arm’s measured floor.
  final double plainMinWidthPx;

  /// `null`: the fixed arm authors no width, which is what [callerOwnsWidth] means.
  final String? plainWidthFullCss;

  /// The inset every band sits inside.
  EdgeInsets get padding => EdgeInsets.fromLTRB(
    paddingLeftPx,
    paddingTopPx,
    paddingRightPx,
    paddingBottomPx,
  );

  /// The outer offset, which no face measures.
  EdgeInsets get margin =>
      EdgeInsets.only(top: marginTopPx, bottom: marginBottomPx);

  /// The corner `.card-face` asks for, resolved by the family that owns radii.
  /// This file cites the token and never restates the pixel; generation proved
  /// AppRadii’s value and this box’s measurement are the same number.
  double get radiusPx {
    final double? px = AppRadii.byToken[radiusToken];
    if (px == null) {
      throw ArgumentError('$radiusToken is not an emitted radius token');
    }
    return px;
  }

  BorderRadius get borderRadius => BorderRadius.circular(radiusPx);

  /// The float, resolved by the family that owns shadows.
  List<BoxShadow> shadowsAt(Brightness brightness) {
    final List<BoxShadow>? layers = (brightness == Brightness.dark
        ? AppShadows.shadowsDark
        : AppShadows.shadowsLight)[shadowToken];
    if (layers == null) {
      throw ArgumentError('$shadowToken is not an emitted shadow token');
    }
    return layers;
  }
}

/// The wallet deck: the container the faces stack in, and the laws their
/// positions, scales and opacities resolve from.
///
/// One number makes this shape: `--deck-lip: 30px`, the
/// container’s own declaration. The deck is two lips tall, the near peer
/// starts one lip down, and every peer is clipped to its own top lip — so the
/// deck shows a 30px band of each back face. Generation reads
/// the declaration, the rules and the 2 measured peers
/// against each other, and stops if the arithmetic and the pixels disagree.
///
/// The budget — how many faces peek, and which — is JavaScript, not CSS, and is
/// recorded in the citation list below rather than as a measured property.
/// How many faces peek, in the component’s own lines:
/// `(src/components/dashboard/WalletDeck.tsx:93)` — `if (wallets.length < 2) return null;`
/// `(src/components/dashboard/WalletDeck.tsx:96)` — `const ordered = selected > 0 ? [...wallets.slice(selected), ...wallets.slice(0, selected)] : wallets;`
/// `(src/components/dashboard/WalletDeck.tsx:98)` — `const peers = [ordered[0], ordered[1]].map((wallet, index) => ({`
/// `(src/components/dashboard/WalletDeck.tsx:100)` — `depth: index === 0 ? 1 : 2,`
/// `(src/components/dashboard/WalletDeck.tsx:106)` — `.slice()`
/// `(src/components/dashboard/WalletDeck.tsx:107)` — `.reverse()`
/// `(src/components/dashboard/WalletDeck.tsx:114)` — `balance={Math.abs(wallet.amount)}`
/// `(src/components/dashboard/WalletDeck.tsx:115)` — `owed={wallet.amount < 0}`
/// `(src/components/dashboard/WalletDeck.tsx:118)` — `tone={faceToneForSeed(wallet.id)}`
class AppDeckSpec {
  const AppDeckSpec({
    required this.stackRow,
    required this.cssClasses,
    required this.authoredSrc,
    required this.ruleSrc,
    required this.lipDeclSrc,
    required this.lipPx,
    required this.heightPx,
    required this.marginBottomPx,
    required this.zIndex,
    required this.frontZIndex,
    required this.displayCss,
    required this.positionCss,
    required this.paddingPx,
    required this.overflowXCss,
    required this.overflowYCss,
    required this.widthCss,
    required this.heightCss,
    required this.marginCss,
    required this.frontCssClass,
    required this.frontAuthoredSrc,
    required this.frontRuleSrc,
    required this.frontPositionCss,
    required this.peerTransitionDurationMs,
    required this.peerEaseX1,
    required this.peerEaseY1,
    required this.peerEaseX2,
    required this.peerEaseY2,
    required this.peerTransformOriginCss,
    required this.peerClipPathCss,
    required this.peerRuleSrc,
  });

  /// The `utilityStacks` row the deck container was measured on.
  final String stackRow;

  /// `.deck`, the only class the container carries.
  final String cssClasses;

  /// Where the component mounts it.
  final String authoredSrc;

  /// Where the sheet authors the container.
  final String ruleSrc;

  /// The `--deck-lip` declaration every other number here resolves from.
  final String lipDeclSrc;

  /// The lip: the band of a back face the deck shows. The container is two lips
  /// tall and every face is clipped to its own top lip, so this one number is the
  /// deck’s size — which is why [heightPx] and [marginBottomPx] are records of
  /// arithmetic rather than separate measurements.
  final double lipPx;

  /// `calc(var(--deck-lip) * 2)`, as the pass measured it.
  final double heightPx;

  /// The deck’s pull-up into the hero balance under it — negative, and authored as
  /// the middle value of a three-value `margin`.
  final double marginBottomPx;

  /// The container’s stacking, which puts the whole deck over the balance block.
  final int zIndex;

  /// `.deck-front`’s stacking, one below the peers it frames.
  final int frontZIndex;

  /// The measured `display`, which makes the lips a block flow.
  final String displayCss;

  /// The measured `position`.
  final String positionCss;

  /// The container’s own inset — none, so the faces span its full width.
  final double paddingPx;

  /// The measured `overflow-x`: the clip is on each face, not on the container.
  final String overflowXCss;

  final String overflowYCss;

  /// The authored `width`, which the pass confirms.
  final String widthCss;

  /// The declaration as the sheet writes it, so the arithmetic above can be traced to it.
  final String heightCss;

  /// The authored three-value `margin`.
  final String marginCss;

  /// `.deck-front`, the face that is not a peer.
  final String frontCssClass;

  /// Where the component mounts it.
  final String frontAuthoredSrc;

  /// Where the sheet gives it its stacking.
  final String frontRuleSrc;

  /// `relative`: the front face is the deck’s only box in flow.
  final String frontPositionCss;

  /// The `--dur` a peer rotates on — the deck’s own motion, not the face press’s `--dur-fast`.
  final int peerTransitionDurationMs;

  /// The `--ease-out` control points, shared by every peer.
  final double peerEaseX1;

  final double peerEaseY1;

  final double peerEaseX2;

  final double peerEaseY2;

  /// `top center`, which the pass resolves to a fraction of the box; Flutter’s
  /// scale is about its centre, so the widget has to shift by this anchor.
  final String peerTransformOriginCss;

  /// The authored `inset(0 0 calc(100% - var(--deck-lip)) 0)`, resolved by the
  /// engine to the pixels in [AppDeckFaceSpec.clipLipPx].
  final String peerClipPathCss;

  /// `.deck-face`, the rule every peer is under.
  final String peerRuleSrc;

  /// The deck’s pull-up, as the inset the hero has to absorb.
  EdgeInsets get margin => EdgeInsets.only(bottom: marginBottomPx);

  /// The peer’s easing.
  Cubic get peerEase => Cubic(peerEaseX1, peerEaseY1, peerEaseX2, peerEaseY2);
}

/// One peer of the deck — a face the wallet data puts behind the front card.
///
/// The pair is not a gradient or a size but a placement: how far down the deck
/// drops it, how small it scales, how far it dims, and how much of it the clip
/// leaves visible. Both were measured on the element the component really mounts,
/// and both are required to answer to the same `--deck-lip` the container does.
class AppDeckFaceSpec {
  const AppDeckFaceSpec({
    required this.depth,
    required this.stackRow,
    required this.cssClasses,
    required this.authoredSrc,
    required this.stateSrc,
    required this.positionCss,
    required this.leftPx,
    required this.rightPx,
    required this.topPx,
    required this.scale,
    required this.opacity,
    required this.clipLipPx,
    required this.placementSrc,
    required this.lipSrc,
    required this.clipSrc,
    required this.originSrc,
  });

  /// The `data-depth` the component writes, which the sheet’s two state rules key off.
  final int depth;

  /// The `utilityStacks` row this peer was measured on.
  final String stackRow;

  /// The class and the attribute the pass resolved together.
  final String cssClasses;

  /// Where `WalletDeck.tsx` mounts the peer.
  final String authoredSrc;

  /// The `[data-depth=…]` rule that places this peer.
  final String stateSrc;

  /// `absolute`: a peer is taken out of the deck’s flow and stacked.
  final String positionCss;

  /// The authored `left: 0`.
  final double leftPx;

  /// The authored `right: 0`, which makes the peer the container’s full width.
  final double rightPx;

  /// How far down the peer sits. The near face is one lip down and the far face is
  /// at the top, which is what puts the far face behind the near one’s band.
  final double topPx;

  /// The peer’s `transform: scale(…)` — a smaller card the further back it is.
  final double scale;

  /// The peer’s opacity, which dims the deeper faces.
  final double opacity;

  /// The clip: this peer shows the top lip of its own box and nothing below it.
  final double clipLipPx;

  /// The lines whose `var(--deck-lip)` arithmetic produced the numbers above.
  final String placementSrc;

  /// The `top` the pass measured this `topPx` from.
  final String lipSrc;

  /// The `clip-path` that produced [clipLipPx].
  final String clipSrc;

  /// The `transform-origin` the scale is anchored to.
  final String originSrc;
}

/// How far back a deck peer sits, in the order the component fills the slots.
enum AppDeckDepth {
  near(1),
  far(2);

  const AppDeckDepth(this.dataDepth);

  /// The `data-depth` value the component writes and the sheet keys its rule off.
  final int dataDepth;
}

/// The row of keys under the hero balance: three equal columns and the gap
/// between them.
///
/// The only viewport-dependent values in this file. Generation read the gap at
/// both viewports, required the two axes of one viewport to agree, and required
/// each pair to be the utility’s multiplier times the unit the class list names.
class AppActionKeyGridSpec {
  const AppActionKeyGridSpec({
    required this.stackRow,
    required this.cssClasses,
    required this.authoredSrc,
    required this.displayCss,
    required this.positionCss,
    required this.tracks,
    required this.columnCountCss,
    required this.gapNarrowPx,
    required this.gapWidePx,
    required this.gapNarrowCss,
    required this.gapWideCss,
    required this.spacingUnitPx,
  });

  /// The `utilityStacks` row the grid was measured on.
  final String stackRow;

  /// The verbatim class list, including the `sm:` variant the wide gap comes from.
  final String cssClasses;

  /// Where the component mounts it.
  final String authoredSrc;

  /// The measured `display`.
  final String displayCss;

  /// The measured `position`: the grid is the family’s only `static` box.
  final String positionCss;

  /// The equal columns `grid-cols-3` compiles to. Generation counts them out of the
  /// measured `grid-template-columns` rather than trusting the class, and requires
  /// the tracks to be equal — which they are down to the 1/64px the engine snaps to.
  final int tracks;

  /// The authored `-webkit-column-count` / track list the pass reported, kept as the record of that count.
  final String columnCountCss;

  /// The phone gap: `gap-2` at the unit every pass agrees on.
  ///
  /// This grid is the family’s only row whose geometry moves with the viewport, and
  /// the pair is ported as two numbers because the movement is the design. Which
  /// viewport takes which number is the `sm:` breakpoint’s business and stays with
  /// the caller — the same ruling that keeps a rail’s breakpoint out of
  /// [AppLedgerRailSpec].
  final double gapNarrowPx;

  /// The `sm:gap-2.5` gap, which the desktop pass measured and the phone pass did not.
  final double gapWidePx;

  /// The multiplier the narrow utility authors.
  final String gapNarrowCss;

  /// The multiplier the wide utility authors.
  final String gapWideCss;

  /// `--spacing`, the unit both multipliers are read against — AppSpacing’s own number, re-read here.
  final double spacingUnitPx;
}

/// One action key in one brightness: the inverted accent box, its notch, its
/// type and the states the sheet gives it.
///
/// A key is the family’s only box whose colour is a token pair rather than a
/// gradient — `--accent` under `--accent-fg`, which is why generation reads both
/// from §2.1 and requires the measured pixels to be what the pass painted.
/// The disabled face is the same box with two numbers moved, proven against a
/// second measured row rather than assumed.
class AppActionKeySpec {
  const AppActionKeySpec({
    required this.stackRow,
    required this.cssClasses,
    required this.authoredSrc,
    required this.tag,
    required this.ruleSrc,
    required this.displayCss,
    required this.positionCss,
    required this.flexDirectionCss,
    required this.alignItemsCss,
    required this.justifyContentCss,
    required this.gapPx,
    required this.paddingCss,
    required this.paddingTopPx,
    required this.paddingRightPx,
    required this.paddingBottomPx,
    required this.paddingLeftPx,
    required this.radiusPx,
    required this.borderWidthPx,
    required this.borderCss,
    required this.fill,
    required this.ink,
    required this.fillToken,
    required this.inkToken,
    required this.fontFamily,
    required this.familyToken,
    required this.fontSizePx,
    required this.sizeToken,
    required this.fontWeight,
    required this.letterSpacingPx,
    required this.letterSpacingEm,
    required this.lineHeightPx,
    required this.minWidthPx,
    required this.flexGrow,
    required this.flexShrink,
    required this.opacity,
    required this.transformCss,
    required this.cursorCss,
    required this.pressScale,
    required this.pressSrc,
    required this.hoverBrightness,
    required this.hoverSrc,
    required this.disabledOpacity,
    required this.disabledCursorCss,
    required this.disabledStackRow,
    required this.disabledAuthoredSrc,
    required this.disabledSrc,
    required this.transitionDurationMs,
    required this.easeX1,
    required this.easeY1,
    required this.easeX2,
    required this.easeY2,
    required this.transitionProps,
    required this.notchWidthPx,
    required this.notchHeightPx,
    required this.notchCentreX,
    required this.notchCentreY,
    required this.notchCutAt,
    required this.notchEdgePx,
    required this.notchAuthored,
    required this.notchSrc,
  });

  /// The `utilityStacks` row the key was measured on.
  final String stackRow;

  /// The verbatim class list the component writes on the button.
  final String cssClasses;

  /// Where the component mounts it, re-checked against the pinned source.
  final String authoredSrc;

  /// The element the component renders — a `button`, which is why the press state is real.
  final String tag;

  /// Where the sheet authors `.action-key`.
  final String ruleSrc;

  /// The measured `display`.
  final String displayCss;

  /// The measured `position`, which `.action-key` authors for the notch’s mask.
  final String positionCss;

  /// The measured `flex-direction`: the glyph over the word.
  final String flexDirectionCss;

  /// The measured `align-items`, both axes centred.
  final String alignItemsCss;

  final String justifyContentCss;

  /// The authored `gap` between the glyph and its label.
  final double gapPx;

  /// The authored `padding` exactly as the rule writes it — three values, which is
  /// why the key’s inset is asymmetric and the top one is the notch’s room.
  final String paddingCss;

  /// The band the notch cuts out of.
  final double paddingTopPx;

  final double paddingRightPx;

  final double paddingBottomPx;

  final double paddingLeftPx;

  /// The corner `.action-key` authors itself, rather than through a `--r-*` token —
  /// so this one is a pixel and not a citation.
  final double radiusPx;

  /// The measured frame, which the rule’s `border: none` leaves at zero.
  final double borderWidthPx;

  /// The authored `border`.
  final String borderCss;

  /// The key’s background — `var(--accent)`, which in the light scheme is the
  /// near-black ink and in the dark scheme the near-white of the inverted key. The
  /// token is the fact; the pixels are what this pass painted from it.
  final Color fill;

  /// The glyph and label colour, `var(--accent-fg)` — the exact inversion of [fill].
  final Color ink;

  /// The token [fill] resolves from, named so a reader can follow it back to §2.1.
  final String fillToken;

  /// The token [ink] resolves from.
  final String inkToken;

  /// The first family of the stack the `.action-key` probe measured. The row’s own
  /// class list authors no font, so this comes from the rule’s `font-family` and not
  /// from the 45 properties a stack row whitelists.
  final String fontFamily;

  /// The token that stack is authored from.
  final String familyToken;

  /// The measured size.
  final double fontSizePx;

  /// The `--text-*` token it resolves from.
  final String sizeToken;

  /// The measured numeric weight.
  final int fontWeight;

  /// The phone resolution of the tracking.
  final double letterSpacingPx;

  /// The authored `em`, which the measurement had to reproduce.
  final double letterSpacingEm;

  /// The measured line box the label and glyph share.
  final double lineHeightPx;

  /// `min-w-0`, so a long label shrinks rather than pushing the third key out.
  final double minWidthPx;

  /// The measured `flex-grow`.
  final double flexGrow;

  /// The measured `flex-shrink`.
  final double flexShrink;

  /// The measured opacity — `1` at rest, and [disabledOpacity] in the other row.
  final double opacity;

  /// `none` at rest: the scale lives in `:active` and the pass measured the resting key.
  final String transformCss;

  /// The measured `cursor` — a web-only fact, kept as the record of the rule’s own answer.
  final String cursorCss;

  /// The `:active` scale. Ruling D-U1 drops hover, not press: a touch device has one.
  final double pressScale;

  /// The `:active` rule’s head and declaration.
  final String pressSrc;

  /// The `:hover` `filter: brightness(…)`, recorded and deliberately not ported.
  ///
  /// Ruling D-U1 drops every hover state in this port because a touch device has no
  /// hover. The number stays on the spec so the drop is visible rather than silent,
  /// and so a reader can see what the sheet still authors.
  final double hoverBrightness;

  /// The `:hover` rule the drop reads against.
  final String hoverSrc;

  /// The disabled key’s opacity. The disabled row was measured as its own element
  /// and generation proved it differs from the rest row in exactly this and the
  /// cursor — which is why [AppActionKeySpec] is one spec with one extra pair of
  /// numbers rather than two boxes.
  final double disabledOpacity;

  /// The disabled `cursor`, the other half of that difference.
  final String disabledCursorCss;

  /// The row the disabled state was measured on.
  final String disabledStackRow;

  /// Where the component disables it.
  final String disabledAuthoredSrc;

  /// The `:disabled, [disabled]` rule’s head and its three declarations.
  final String disabledSrc;

  /// The `--dur-fast` the rule transitions on.
  final int transitionDurationMs;

  /// The `--ease-out` control points.
  final double easeX1;

  final double easeY1;

  final double easeX2;

  final double easeY2;

  /// `transform filter` — the filter half belongs to the dropped hover, and the
  /// transform half to the press that survives it.
  final String transitionProps;

  /// The ellipse the mask cuts out of the top edge, authored as `--key-notch-w`.
  final double notchWidthPx;

  /// Its height, `--key-notch-h`.
  final double notchHeightPx;

  /// The centre as a fraction of the box — `50%`, the middle of the top edge.
  final double notchCentreX;

  /// `0`, which is what puts the notch on the edge rather than in the box.
  final double notchCentreY;

  /// Where the mask turns opaque, as a fraction of the ellipse’s own radius: 98.5%
  /// of a full ellipse would be the whole notch, so the cut is the ellipse with a
  /// hairline of its own edge left in.
  final double notchCutAt;

  /// That hairline — `calc(98.5% + 1px)`.
  final double notchEdgePx;

  /// The declaration as the sheet writes it, so the numbers above can be traced to it.
  final String notchAuthored;

  /// Where `.action-key` authors the mask.
  final String notchSrc;

  /// The inset the glyph and label sit inside — the top one leaves the notch’s room.
  EdgeInsets get padding => EdgeInsets.fromLTRB(
    paddingLeftPx,
    paddingTopPx,
    paddingRightPx,
    paddingBottomPx,
  );

  BorderRadius get borderRadius => BorderRadius.circular(radiusPx);

  /// The weight Flutter names for the measured numeric weight.
  FontWeight get weight => FontWeight.values[fontWeight ~/ 100 - 1];

  /// The key’s own type: the word it paints in [ink] at the measured size.
  TextStyle get textStyle => TextStyle(
    fontFamily: fontFamily,
    color: ink,
    fontSize: fontSizePx,
    fontWeight: weight,
    height: lineHeightPx / fontSizePx,
    letterSpacing: letterSpacingEm * fontSizePx,
  );

  /// The press easing.
  Cubic get ease => Cubic(easeX1, easeY1, easeX2, easeY2);
}

/// The box around a key’s glyph. It draws nothing itself: it is the web’s
/// leading-killer, ported so the key’s `gap` is the only space between the symbol
/// and the word under it.
class AppActionKeyIconSpec {
  const AppActionKeyIconSpec({
    required this.stackRow,
    required this.cssClasses,
    required this.authoredSrc,
    required this.ruleSrc,
    required this.displayCss,
    required this.lineHeightPx,
    required this.glyphSrc,
  });

  /// The `utilityStacks` row the icon wrapper was measured on.
  final String stackRow;

  /// The class list the component writes around the glyph.
  final String cssClasses;

  /// Where the component mounts it.
  final String authoredSrc;

  /// Where the sheet authors `.action-key-icon`.
  final String ruleSrc;

  /// `block`, which is what lets the wrapper take `line-height: 0`.
  final String displayCss;

  /// `0`, authored so the glyph’s box is the glyph and nothing more — the gap
  /// between the symbol and its label is the key’s `gap`, not leading the wrapper
  /// adds to it.
  final double lineHeightPx;

  /// The lines that choose the symbol. Which Lucide glyph each key draws is the
  /// component’s mapping, not a measured property; the icon dependency has not
  /// landed, so this is a citation and not a name.
  final String glyphSrc;
}

/// The face, the deck and the keys, indexed the way the widgets ask for them.
///
/// Every value below is one the reader measured on the class list the component
/// really writes. Nothing here has a default and no lookup falls back: a key that
/// was never measured throws, because a substitute would be a second design.
abstract final class AppFaces {
  /// The gradient of each tone, in the order `CardFace.tsx` declares them. One
  /// entry carries both passes, because a tone is one recipe resolved twice.
  static const Map<AppFaceTone, AppFaceTintSpec>
  tints = <AppFaceTone, AppFaceTintSpec>{
    AppFaceTone.violet: AppFaceTintSpec(
      cssClass: '.face-violet',
      stackRow: 'face-box-violet',
      authoredSrc: 'src/components/ui/CardFace.tsx:59,60,61',
      recipeSrc: 'src/index.css:1256',
      angleDeg: 135.0,
      anchorToken: '--face-anchor',
      light: <AppFaceStopSpec>[
        AppFaceStopSpec(
          at: 0.0,
          colour: Color.fromRGBO(87, 88, 189, 1.0),
          authored:
              'color-mix(in oklab, var(--hue-indigo) 82%, var(--face-anchor))',
          hueToken: '--hue-indigo',
          mixPercent: 82.0,
          anchorToken: '--face-anchor',
        ),
        AppFaceStopSpec(
          at: 1.0,
          colour: Color.fromRGBO(117, 95, 169, 1.0),
          authored:
              'color-mix(in oklab, var(--hue-violet) 70%, var(--face-anchor))',
          hueToken: '--hue-violet',
          mixPercent: 70.0,
          anchorToken: '--face-anchor',
        ),
      ],
      dark: <AppFaceStopSpec>[
        AppFaceStopSpec(
          at: 0.0,
          colour: Color.fromRGBO(81, 80, 179, 1.0),
          authored:
              'color-mix(in oklab, var(--hue-indigo) 82%, var(--face-anchor))',
          hueToken: '--hue-indigo',
          mixPercent: 82.0,
          anchorToken: '--face-anchor',
        ),
        AppFaceStopSpec(
          at: 1.0,
          colour: Color.fromRGBO(105, 82, 153, 1.0),
          authored:
              'color-mix(in oklab, var(--hue-violet) 70%, var(--face-anchor))',
          hueToken: '--hue-violet',
          mixPercent: 70.0,
          anchorToken: '--face-anchor',
        ),
      ],
      fillLight: LinearGradient(
        begin: Alignment(-1.0, -1.0),
        end: Alignment(1.0, 1.0),
        colors: <Color>[
          Color.fromRGBO(87, 88, 189, 1.0),
          Color.fromRGBO(117, 95, 169, 1.0),
        ],
        stops: <double>[0.0, 1.0],
      ),
      fillDark: LinearGradient(
        begin: Alignment(-1.0, -1.0),
        end: Alignment(1.0, 1.0),
        colors: <Color>[
          Color.fromRGBO(81, 80, 179, 1.0),
          Color.fromRGBO(105, 82, 153, 1.0),
        ],
        stops: <double>[0.0, 1.0],
      ),
    ),
    AppFaceTone.blue: AppFaceTintSpec(
      cssClass: '.face-blue',
      stackRow: 'face-box-blue',
      authoredSrc: 'src/components/ui/CardFace.tsx:59,60,61',
      recipeSrc: 'src/index.css:1263',
      angleDeg: 135.0,
      anchorToken: '--face-anchor',
      light: <AppFaceStopSpec>[
        AppFaceStopSpec(
          at: 0.0,
          colour: Color.fromRGBO(62, 119, 192, 1.0),
          authored:
              'color-mix(in oklab, var(--hue-blue) 80%, var(--face-anchor))',
          hueToken: '--hue-blue',
          mixPercent: 80.0,
          anchorToken: '--face-anchor',
        ),
        AppFaceStopSpec(
          at: 1.0,
          colour: Color.fromRGBO(62, 140, 164, 1.0),
          authored:
              'color-mix(in oklab, var(--hue-cyan) 68%, var(--face-anchor))',
          hueToken: '--hue-cyan',
          mixPercent: 68.0,
          anchorToken: '--face-anchor',
        ),
      ],
      dark: <AppFaceStopSpec>[
        AppFaceStopSpec(
          at: 0.0,
          colour: Color.fromRGBO(53, 110, 181, 1.0),
          authored:
              'color-mix(in oklab, var(--hue-blue) 80%, var(--face-anchor))',
          hueToken: '--hue-blue',
          mixPercent: 80.0,
          anchorToken: '--face-anchor',
        ),
        AppFaceStopSpec(
          at: 1.0,
          colour: Color.fromRGBO(47, 126, 148, 1.0),
          authored:
              'color-mix(in oklab, var(--hue-cyan) 68%, var(--face-anchor))',
          hueToken: '--hue-cyan',
          mixPercent: 68.0,
          anchorToken: '--face-anchor',
        ),
      ],
      fillLight: LinearGradient(
        begin: Alignment(-1.0, -1.0),
        end: Alignment(1.0, 1.0),
        colors: <Color>[
          Color.fromRGBO(62, 119, 192, 1.0),
          Color.fromRGBO(62, 140, 164, 1.0),
        ],
        stops: <double>[0.0, 1.0],
      ),
      fillDark: LinearGradient(
        begin: Alignment(-1.0, -1.0),
        end: Alignment(1.0, 1.0),
        colors: <Color>[
          Color.fromRGBO(53, 110, 181, 1.0),
          Color.fromRGBO(47, 126, 148, 1.0),
        ],
        stops: <double>[0.0, 1.0],
      ),
    ),
    AppFaceTone.teal: AppFaceTintSpec(
      cssClass: '.face-teal',
      stackRow: 'face-box-teal',
      authoredSrc: 'src/components/ui/CardFace.tsx:59,60,61',
      recipeSrc: 'src/index.css:1270',
      angleDeg: 135.0,
      anchorToken: '--face-anchor',
      light: <AppFaceStopSpec>[
        AppFaceStopSpec(
          at: 0.0,
          colour: Color.fromRGBO(49, 161, 155, 1.0),
          authored:
              'color-mix(in oklab, var(--hue-teal) 80%, var(--face-anchor))',
          hueToken: '--hue-teal',
          mixPercent: 80.0,
          anchorToken: '--face-anchor',
        ),
        AppFaceStopSpec(
          at: 1.0,
          colour: Color.fromRGBO(55, 140, 112, 1.0),
          authored:
              'color-mix(in oklab, var(--hue-emerald) 68%, var(--face-anchor))',
          hueToken: '--hue-emerald',
          mixPercent: 68.0,
          anchorToken: '--face-anchor',
        ),
      ],
      dark: <AppFaceStopSpec>[
        AppFaceStopSpec(
          at: 0.0,
          colour: Color.fromRGBO(37, 152, 144, 1.0),
          authored:
              'color-mix(in oklab, var(--hue-teal) 80%, var(--face-anchor))',
          hueToken: '--hue-teal',
          mixPercent: 80.0,
          anchorToken: '--face-anchor',
        ),
        AppFaceStopSpec(
          at: 1.0,
          colour: Color.fromRGBO(40, 126, 96, 1.0),
          authored:
              'color-mix(in oklab, var(--hue-emerald) 68%, var(--face-anchor))',
          hueToken: '--hue-emerald',
          mixPercent: 68.0,
          anchorToken: '--face-anchor',
        ),
      ],
      fillLight: LinearGradient(
        begin: Alignment(-1.0, -1.0),
        end: Alignment(1.0, 1.0),
        colors: <Color>[
          Color.fromRGBO(49, 161, 155, 1.0),
          Color.fromRGBO(55, 140, 112, 1.0),
        ],
        stops: <double>[0.0, 1.0],
      ),
      fillDark: LinearGradient(
        begin: Alignment(-1.0, -1.0),
        end: Alignment(1.0, 1.0),
        colors: <Color>[
          Color.fromRGBO(37, 152, 144, 1.0),
          Color.fromRGBO(40, 126, 96, 1.0),
        ],
        stops: <double>[0.0, 1.0],
      ),
    ),
    AppFaceTone.amber: AppFaceTintSpec(
      cssClass: '.face-amber',
      stackRow: 'face-box-amber',
      authoredSrc: 'src/components/ui/CardFace.tsx:59,60,61',
      recipeSrc: 'src/index.css:1277',
      angleDeg: 135.0,
      anchorToken: '--face-anchor',
      light: <AppFaceStopSpec>[
        AppFaceStopSpec(
          at: 0.0,
          colour: Color.fromRGBO(179, 140, 69, 1.0),
          authored:
              'color-mix(in oklab, var(--hue-amber) 78%, var(--face-anchor))',
          hueToken: '--hue-amber',
          mixPercent: 78.0,
          anchorToken: '--face-anchor',
        ),
        AppFaceStopSpec(
          at: 1.0,
          colour: Color.fromRGBO(178, 105, 77, 1.0),
          authored:
              'color-mix(in oklab, var(--hue-orange) 70%, var(--face-anchor))',
          hueToken: '--hue-orange',
          mixPercent: 70.0,
          anchorToken: '--face-anchor',
        ),
      ],
      dark: <AppFaceStopSpec>[
        AppFaceStopSpec(
          at: 0.0,
          colour: Color.fromRGBO(169, 129, 56, 1.0),
          authored:
              'color-mix(in oklab, var(--hue-amber) 78%, var(--face-anchor))',
          hueToken: '--hue-amber',
          mixPercent: 78.0,
          anchorToken: '--face-anchor',
        ),
        AppFaceStopSpec(
          at: 1.0,
          colour: Color.fromRGBO(164, 91, 62, 1.0),
          authored:
              'color-mix(in oklab, var(--hue-orange) 70%, var(--face-anchor))',
          hueToken: '--hue-orange',
          mixPercent: 70.0,
          anchorToken: '--face-anchor',
        ),
      ],
      fillLight: LinearGradient(
        begin: Alignment(-1.0, -1.0),
        end: Alignment(1.0, 1.0),
        colors: <Color>[
          Color.fromRGBO(179, 140, 69, 1.0),
          Color.fromRGBO(178, 105, 77, 1.0),
        ],
        stops: <double>[0.0, 1.0],
      ),
      fillDark: LinearGradient(
        begin: Alignment(-1.0, -1.0),
        end: Alignment(1.0, 1.0),
        colors: <Color>[
          Color.fromRGBO(169, 129, 56, 1.0),
          Color.fromRGBO(164, 91, 62, 1.0),
        ],
        stops: <double>[0.0, 1.0],
      ),
    ),
    AppFaceTone.rose: AppFaceTintSpec(
      cssClass: '.face-rose',
      stackRow: 'face-box-rose',
      authoredSrc: 'src/components/ui/CardFace.tsx:59,60,61',
      recipeSrc: 'src/index.css:1284',
      angleDeg: 135.0,
      anchorToken: '--face-anchor',
      light: <AppFaceStopSpec>[
        AppFaceStopSpec(
          at: 0.0,
          colour: Color.fromRGBO(187, 87, 104, 1.0),
          authored:
              'color-mix(in oklab, var(--hue-rose) 78%, var(--face-anchor))',
          hueToken: '--hue-rose',
          mixPercent: 78.0,
          anchorToken: '--face-anchor',
        ),
        AppFaceStopSpec(
          at: 1.0,
          colour: Color.fromRGBO(113, 93, 163, 1.0),
          authored:
              'color-mix(in oklab, var(--hue-violet) 66%, var(--face-anchor))',
          hueToken: '--hue-violet',
          mixPercent: 66.0,
          anchorToken: '--face-anchor',
        ),
      ],
      dark: <AppFaceStopSpec>[
        AppFaceStopSpec(
          at: 0.0,
          colour: Color.fromRGBO(176, 77, 93, 1.0),
          authored:
              'color-mix(in oklab, var(--hue-rose) 78%, var(--face-anchor))',
          hueToken: '--hue-rose',
          mixPercent: 78.0,
          anchorToken: '--face-anchor',
        ),
        AppFaceStopSpec(
          at: 1.0,
          colour: Color.fromRGBO(99, 78, 145, 1.0),
          authored:
              'color-mix(in oklab, var(--hue-violet) 66%, var(--face-anchor))',
          hueToken: '--hue-violet',
          mixPercent: 66.0,
          anchorToken: '--face-anchor',
        ),
      ],
      fillLight: LinearGradient(
        begin: Alignment(-1.0, -1.0),
        end: Alignment(1.0, 1.0),
        colors: <Color>[
          Color.fromRGBO(187, 87, 104, 1.0),
          Color.fromRGBO(113, 93, 163, 1.0),
        ],
        stops: <double>[0.0, 1.0],
      ),
      fillDark: LinearGradient(
        begin: Alignment(-1.0, -1.0),
        end: Alignment(1.0, 1.0),
        colors: <Color>[
          Color.fromRGBO(176, 77, 93, 1.0),
          Color.fromRGBO(99, 78, 145, 1.0),
        ],
        stops: <double>[0.0, 1.0],
      ),
    ),
    AppFaceTone.graphite: AppFaceTintSpec(
      cssClass: '.face-graphite',
      stackRow: 'face-box-graphite',
      authoredSrc: 'src/components/ui/CardFace.tsx:59,60,61',
      recipeSrc: 'src/index.css:1291',
      angleDeg: 135.0,
      anchorToken: '--face-anchor',
      light: <AppFaceStopSpec>[
        AppFaceStopSpec(
          at: 0.0,
          colour: Color.fromRGBO(89, 100, 119, 1.0),
          authored:
              'color-mix(in oklab, var(--hue-slate) 60%, var(--face-anchor))',
          hueToken: '--hue-slate',
          mixPercent: 60.0,
          anchorToken: '--face-anchor',
        ),
        AppFaceStopSpec(
          at: 1.0,
          colour: Color.fromRGBO(46, 59, 80, 1.0),
          authored: 'var(--face-anchor)',
          hueToken: null,
          mixPercent: 0.0,
          anchorToken: '--face-anchor',
        ),
      ],
      dark: <AppFaceStopSpec>[
        AppFaceStopSpec(
          at: 0.0,
          colour: Color.fromRGBO(74, 83, 100, 1.0),
          authored:
              'color-mix(in oklab, var(--hue-slate) 60%, var(--face-anchor))',
          hueToken: '--hue-slate',
          mixPercent: 60.0,
          anchorToken: '--face-anchor',
        ),
        AppFaceStopSpec(
          at: 1.0,
          colour: Color.fromRGBO(13, 22, 36, 1.0),
          authored: 'var(--face-anchor)',
          hueToken: null,
          mixPercent: 0.0,
          anchorToken: '--face-anchor',
        ),
      ],
      fillLight: LinearGradient(
        begin: Alignment(-1.0, -1.0),
        end: Alignment(1.0, 1.0),
        colors: <Color>[
          Color.fromRGBO(89, 100, 119, 1.0),
          Color.fromRGBO(46, 59, 80, 1.0),
        ],
        stops: <double>[0.0, 1.0],
      ),
      fillDark: LinearGradient(
        begin: Alignment(-1.0, -1.0),
        end: Alignment(1.0, 1.0),
        colors: <Color>[
          Color.fromRGBO(74, 83, 100, 1.0),
          Color.fromRGBO(13, 22, 36, 1.0),
        ],
        stops: <double>[0.0, 1.0],
      ),
    ),
  };

  /// The tone’s paint. The caller chooses a tone; nothing here infers one.
  static AppFaceTintSpec tint(AppFaceTone tone) {
    final AppFaceTintSpec? spec = tints[tone];
    if (spec == null) {
      throw ArgumentError('no gradient was measured for ${tone.name}');
    }
    return spec;
  }

  /// The `.card-face::before` sheen every tone draws over its gradient — the
  /// highlight and the hairline, as the sheet layers them.
  static const AppFaceSheenSpec sheen = AppFaceSheenSpec(
    cssClass: '::before',
    ruleSrc: 'src/index.css:1233',
    authoredBackground: 'radial-gradient(120% 90% at 85% 10%, rgba(255, 255, 255, 0.22) 0%, transparent 50%), repeating-linear-gradient(115deg, transparent 0 34px, rgba(255, 255, 255, 0.04) 34px 36px)',
    highlightCentreX: 0.85,
    highlightCentreY: 0.1,
    highlightRadiusX: 1.2,
    highlightRadiusY: 0.9,
    highlightColour: Color.fromRGBO(255, 255, 255, 0.22),
    highlightFadeAt: 0.0,
    highlightClearAt: 0.5,
    stripeAngleDeg: 115.0,
    stripeClearUntilPx: 34.0,
    stripeColour: Color.fromRGBO(255, 255, 255, 0.04),
    stripeFromPx: 34.0,
    stripeToPx: 36.0,
  );

  /// The press a face takes, from the `.pressable` class its own box cites.
  ///
  /// Hover is not ported anywhere in this family: ruling D-U1 drops it because
  /// a touch device has no hover, and `.pressable` authors none to drop.
  static const AppFacePressSpec press = AppFacePressSpec(
    cssClass: '.pressable',
    restSrc: 'src/index.css:1339',
    activeSrc: 'src/index.css:1342',
    pressScale: 0.97,
    pressDurationMs: 130,
    easeX1: 0.22,
    easeY1: 1.0,
    easeX2: 0.36,
    easeY2: 1.0,
    transitionProps: 'transform',
  );

  /// The box every face is: the frame, the inset, the ink and the ratio.
  /// Its corner is `--r-md` and its float is
  /// `--shadow-float` — resolved through [AppRadii] and [AppShadows]
  /// rather than restated, because generation proved the passes measured
  /// 24px of corner and the token’s own layers in both
  /// brightnesses. A face drawn here is the frame the theme names.
  static const AppCardFaceSpec face = AppCardFaceSpec(
    stackRow: 'face-box-violet',
    cssClasses: 'card-face face-violet w-full text-left p-3.5 flex flex-col justify-between gap-2 pressable cursor-pointer',
    authoredSrc: 'src/components/ui/CardFace.tsx:59,60,61',
    styleSrc: 'src/components/ui/CardFace.tsx:61',
    ruleSrc: 'src/index.css:1226',
    radiusToken: '--r-md',
    shadowToken: '--shadow-float',
    aspectRatio: 1.586,
    minWidthPx: 0.0,
    callerOwnsWidth: false,
    widthFullCss: '100%',
    interactive: true,
    cursorCss: 'pointer',
    displayCss: 'flex',
    positionCss: 'relative',
    flexDirectionCss: 'column',
    alignItemsCss: 'normal',
    justifyContentCss: 'space-between',
    textAlignCss: 'left',
    gapPx: 8.0,
    marginTopPx: 0.0,
    marginBottomPx: 0.0,
    paddingTopPx: 14.0,
    paddingRightPx: 14.0,
    paddingBottomPx: 14.0,
    paddingLeftPx: 14.0,
    borderWidthPx: 0.0,
    ink: Color.fromRGBO(255, 255, 255, 1.0),
    fill: Color.fromRGBO(0, 0, 0, 0.0),
    overflowXCss: 'hidden',
    overflowYCss: 'hidden',
    backdropFilterCss: 'none',
    flexGrow: 0.0,
    flexShrink: 1.0,
    plainCssClasses: 'card-face face-violet w-full text-left p-3.5 flex flex-col justify-between gap-2 pressable ',
    plainStyleSrc: 'src/components/ui/CardFace.tsx:62',
    plainMinWidthPx: 250.0,
    plainWidthFullCss: null,
  );

  /// The bands and words of a face, plus the word under an action key, each
  /// keyed by the `utilityStacks` row it was measured on. Every band is read in
  /// both brightnesses and generation refuses one whose geometry moves with the
  /// scheme, which is why this is one table and not two.
  ///
  /// The gold chip is not here: the row `face-chip`, measured
  /// at src/components/ui/CardFace.tsx:84, is the box AppChips already paints.
  /// Generation stops if the two disagree rather than port one chip twice.
  static const Map<AppFaceSlot, AppFaceSlotSpec>
  slots = <AppFaceSlot, AppFaceSlotSpec>{
    AppFaceSlot.topRow: AppFaceSlotSpec(
      stackRow: 'face-top-row',
      cssClasses: 'flex items-start justify-between gap-2 relative z-10',
      authoredSrc: 'src/components/ui/CardFace.tsx:65',
      displayCss: 'flex',
      positionCss: 'relative',
      zIndexCss: '10',
      flexDirectionCss: 'row',
      alignItemsCss: 'flex-start',
      justifyContentCss: 'space-between',
      gapPx: 8.0,
      marginTopPx: 0.0,
      marginBottomPx: 0.0,
      paddingTopPx: 0.0,
      paddingRightPx: 0.0,
      paddingBottomPx: 0.0,
      paddingLeftPx: 0.0,
      fontFamily: 'Inter',
      fontSizePx: 16.0,
      fontWeight: 400,
      heightRatio: 1.5,
      letterSpacingPx: 0.0,
      letterSpacingEm: 0.0,
      textColor: null,
      inheritsFaceInk: true,
      textTransformCss: null,
      whiteSpaceCss: 'normal',
      textOverflowCss: 'clip',
      truncates: false,
      tabularNums: false,
      authoredTypeClass: null,
      authoredTypeSrc: null,
      radiusPx: 0.0,
      radiusIsPill: false,
      borderWidthPx: 0.0,
      borderColor: null,
      minWidthZero: null,
      flexGrow: 0.0,
      flexShrink: 1.0,
      leadingUtility: null,
      leadingToken: null,
      leadingValue: 1.5,
    ),
    AppFaceSlot.nameBlock: AppFaceSlotSpec(
      stackRow: 'face-name-block',
      cssClasses: 'min-w-0',
      authoredSrc: 'src/components/ui/CardFace.tsx:66',
      displayCss: 'block',
      positionCss: 'static',
      zIndexCss: 'auto',
      flexDirectionCss: 'row',
      alignItemsCss: 'normal',
      justifyContentCss: 'normal',
      gapPx: null,
      marginTopPx: 0.0,
      marginBottomPx: 0.0,
      paddingTopPx: 0.0,
      paddingRightPx: 0.0,
      paddingBottomPx: 0.0,
      paddingLeftPx: 0.0,
      fontFamily: 'Inter',
      fontSizePx: 16.0,
      fontWeight: 400,
      heightRatio: 1.5,
      letterSpacingPx: 0.0,
      letterSpacingEm: 0.0,
      textColor: null,
      inheritsFaceInk: true,
      textTransformCss: null,
      whiteSpaceCss: 'normal',
      textOverflowCss: 'clip',
      truncates: false,
      tabularNums: false,
      authoredTypeClass: null,
      authoredTypeSrc: null,
      radiusPx: 0.0,
      radiusIsPill: false,
      borderWidthPx: 0.0,
      borderColor: null,
      minWidthZero: true,
      flexGrow: 0.0,
      flexShrink: 1.0,
      leadingUtility: null,
      leadingToken: null,
      leadingValue: 1.5,
    ),
    AppFaceSlot.bankName: AppFaceSlotSpec(
      stackRow: 'face-bank-name',
      cssClasses: 'text-[11px] font-bold uppercase tracking-wide text-white/75 truncate',
      authoredSrc: 'src/components/ui/CardFace.tsx:67',
      displayCss: 'block',
      positionCss: 'static',
      zIndexCss: 'auto',
      flexDirectionCss: 'row',
      alignItemsCss: 'normal',
      justifyContentCss: 'normal',
      gapPx: null,
      marginTopPx: 0.0,
      marginBottomPx: 0.0,
      paddingTopPx: 0.0,
      paddingRightPx: 0.0,
      paddingBottomPx: 0.0,
      paddingLeftPx: 0.0,
      fontFamily: 'Inter',
      fontSizePx: 11.0,
      fontWeight: 700,
      heightRatio: 1.5,
      letterSpacingPx: 0.275,
      letterSpacingEm: 0.025,
      textColor: Color.fromRGBO(255, 255, 255, 0.75),
      inheritsFaceInk: false,
      textTransformCss: 'uppercase',
      whiteSpaceCss: 'nowrap',
      textOverflowCss: 'ellipsis',
      truncates: true,
      tabularNums: false,
      authoredTypeClass: null,
      authoredTypeSrc: null,
      radiusPx: 0.0,
      radiusIsPill: false,
      borderWidthPx: 0.0,
      borderColor: null,
      minWidthZero: null,
      flexGrow: 0.0,
      flexShrink: 1.0,
      leadingUtility: null,
      leadingToken: null,
      leadingValue: 1.5,
    ),
    AppFaceSlot.cardName: AppFaceSlotSpec(
      stackRow: 'face-card-name',
      cssClasses: 'text-[10px] text-white/55 truncate mt-0.5',
      authoredSrc: 'src/components/ui/CardFace.tsx:68',
      displayCss: 'block',
      positionCss: 'static',
      zIndexCss: 'auto',
      flexDirectionCss: 'row',
      alignItemsCss: 'normal',
      justifyContentCss: 'normal',
      gapPx: null,
      marginTopPx: 2.0,
      marginBottomPx: 0.0,
      paddingTopPx: 0.0,
      paddingRightPx: 0.0,
      paddingBottomPx: 0.0,
      paddingLeftPx: 0.0,
      fontFamily: 'Inter',
      fontSizePx: 10.0,
      fontWeight: 400,
      heightRatio: 1.5,
      letterSpacingPx: 0.0,
      letterSpacingEm: 0.0,
      textColor: Color.fromRGBO(255, 255, 255, 0.55),
      inheritsFaceInk: false,
      textTransformCss: null,
      whiteSpaceCss: 'nowrap',
      textOverflowCss: 'ellipsis',
      truncates: true,
      tabularNums: false,
      authoredTypeClass: null,
      authoredTypeSrc: null,
      radiusPx: 0.0,
      radiusIsPill: false,
      borderWidthPx: 0.0,
      borderColor: null,
      minWidthZero: null,
      flexGrow: 0.0,
      flexShrink: 1.0,
      leadingUtility: null,
      leadingToken: null,
      leadingValue: 1.5,
    ),
    AppFaceSlot.badge: AppFaceSlotSpec(
      stackRow: 'face-badge',
      cssClasses: 'text-[9px] font-extrabold uppercase tracking-widest text-white/70 border border-white/25 rounded-full px-2 py-0.5',
      authoredSrc: 'src/components/ui/CardFace.tsx:71',
      displayCss: 'block',
      positionCss: 'static',
      zIndexCss: 'auto',
      flexDirectionCss: 'row',
      alignItemsCss: 'normal',
      justifyContentCss: 'normal',
      gapPx: null,
      marginTopPx: 0.0,
      marginBottomPx: 0.0,
      paddingTopPx: 2.0,
      paddingRightPx: 8.0,
      paddingBottomPx: 2.0,
      paddingLeftPx: 8.0,
      fontFamily: 'Inter',
      fontSizePx: 9.0,
      fontWeight: 800,
      heightRatio: 1.5,
      letterSpacingPx: 0.9,
      letterSpacingEm: 0.1,
      textColor: Color.fromRGBO(255, 255, 255, 0.7),
      inheritsFaceInk: false,
      textTransformCss: 'uppercase',
      whiteSpaceCss: 'normal',
      textOverflowCss: 'clip',
      truncates: false,
      tabularNums: false,
      authoredTypeClass: null,
      authoredTypeSrc: null,
      radiusPx: null,
      radiusIsPill: true,
      borderWidthPx: 1.0,
      borderColor: Color.fromRGBO(255, 255, 255, 0.25),
      minWidthZero: null,
      flexGrow: 0.0,
      flexShrink: 1.0,
      leadingUtility: null,
      leadingToken: null,
      leadingValue: 1.5,
    ),
    AppFaceSlot.amountBlock: AppFaceSlotSpec(
      stackRow: 'face-amount-block',
      cssClasses: 'relative z-10',
      authoredSrc: 'src/components/ui/CardFace.tsx:76',
      displayCss: 'block',
      positionCss: 'relative',
      zIndexCss: '10',
      flexDirectionCss: 'row',
      alignItemsCss: 'normal',
      justifyContentCss: 'normal',
      gapPx: null,
      marginTopPx: 0.0,
      marginBottomPx: 0.0,
      paddingTopPx: 0.0,
      paddingRightPx: 0.0,
      paddingBottomPx: 0.0,
      paddingLeftPx: 0.0,
      fontFamily: 'Inter',
      fontSizePx: 16.0,
      fontWeight: 400,
      heightRatio: 1.5,
      letterSpacingPx: 0.0,
      letterSpacingEm: 0.0,
      textColor: null,
      inheritsFaceInk: true,
      textTransformCss: null,
      whiteSpaceCss: 'normal',
      textOverflowCss: 'clip',
      truncates: false,
      tabularNums: false,
      authoredTypeClass: null,
      authoredTypeSrc: null,
      radiusPx: 0.0,
      radiusIsPill: false,
      borderWidthPx: 0.0,
      borderColor: null,
      minWidthZero: null,
      flexGrow: 0.0,
      flexShrink: 1.0,
      leadingUtility: null,
      leadingToken: null,
      leadingValue: 1.5,
    ),
    AppFaceSlot.balanceLabel: AppFaceSlotSpec(
      stackRow: 'face-balance-label',
      cssClasses: 'eyebrow !text-white/55',
      authoredSrc: 'src/components/ui/CardFace.tsx:77',
      displayCss: 'block',
      positionCss: 'static',
      zIndexCss: 'auto',
      flexDirectionCss: 'row',
      alignItemsCss: 'normal',
      justifyContentCss: 'normal',
      gapPx: null,
      marginTopPx: 0.0,
      marginBottomPx: 0.0,
      paddingTopPx: 0.0,
      paddingRightPx: 0.0,
      paddingBottomPx: 0.0,
      paddingLeftPx: 0.0,
      fontFamily: 'Inter',
      fontSizePx: 10.0,
      fontWeight: 700,
      heightRatio: 1.5,
      letterSpacingPx: 1.2,
      letterSpacingEm: 0.12,
      textColor: Color.fromRGBO(255, 255, 255, 0.55),
      inheritsFaceInk: false,
      textTransformCss: 'uppercase',
      whiteSpaceCss: 'normal',
      textOverflowCss: 'clip',
      truncates: false,
      tabularNums: false,
      authoredTypeClass: '.eyebrow',
      authoredTypeSrc: 'src/index.css:366',
      radiusPx: 0.0,
      radiusIsPill: false,
      borderWidthPx: 0.0,
      borderColor: null,
      minWidthZero: null,
      flexGrow: 0.0,
      flexShrink: 1.0,
      leadingUtility: null,
      leadingToken: null,
      leadingValue: 1.5,
    ),
    AppFaceSlot.balance: AppFaceSlotSpec(
      stackRow: 'face-balance',
      cssClasses:
          'money text-[19px] font-extrabold text-white leading-tight mt-0.5',
      authoredSrc: 'src/components/ui/CardFace.tsx:78',
      displayCss: 'block',
      positionCss: 'static',
      zIndexCss: 'auto',
      flexDirectionCss: 'row',
      alignItemsCss: 'normal',
      justifyContentCss: 'normal',
      gapPx: null,
      marginTopPx: 2.0,
      marginBottomPx: 0.0,
      paddingTopPx: 0.0,
      paddingRightPx: 0.0,
      paddingBottomPx: 0.0,
      paddingLeftPx: 0.0,
      fontFamily: 'Inter',
      fontSizePx: 19.0,
      fontWeight: 800,
      heightRatio: 1.25,
      letterSpacingPx: -0.19,
      letterSpacingEm: -0.01,
      textColor: Color.fromRGBO(255, 255, 255, 1.0),
      inheritsFaceInk: false,
      textTransformCss: null,
      whiteSpaceCss: 'normal',
      textOverflowCss: 'clip',
      truncates: false,
      tabularNums: true,
      authoredTypeClass: '.money',
      authoredTypeSrc: 'src/index.css:423',
      radiusPx: 0.0,
      radiusIsPill: false,
      borderWidthPx: 0.0,
      borderColor: null,
      minWidthZero: null,
      flexGrow: 0.0,
      flexShrink: 1.0,
      leadingUtility: 'tight',
      leadingToken: '--leading-tight',
      leadingValue: 1.25,
    ),
    AppFaceSlot.numberBlock: AppFaceSlotSpec(
      stackRow: 'face-number-block',
      cssClasses: 'relative z-10 space-y-2',
      authoredSrc: 'src/components/ui/CardFace.tsx:82',
      displayCss: 'block',
      positionCss: 'relative',
      zIndexCss: '10',
      flexDirectionCss: 'row',
      alignItemsCss: 'normal',
      justifyContentCss: 'normal',
      gapPx: null,
      marginTopPx: 0.0,
      marginBottomPx: 0.0,
      paddingTopPx: 0.0,
      paddingRightPx: 0.0,
      paddingBottomPx: 0.0,
      paddingLeftPx: 0.0,
      fontFamily: 'Inter',
      fontSizePx: 16.0,
      fontWeight: 400,
      heightRatio: 1.5,
      letterSpacingPx: 0.0,
      letterSpacingEm: 0.0,
      textColor: null,
      inheritsFaceInk: true,
      textTransformCss: null,
      whiteSpaceCss: 'normal',
      textOverflowCss: 'clip',
      truncates: false,
      tabularNums: false,
      authoredTypeClass: null,
      authoredTypeSrc: null,
      radiusPx: 0.0,
      radiusIsPill: false,
      borderWidthPx: 0.0,
      borderColor: null,
      minWidthZero: null,
      flexGrow: 0.0,
      flexShrink: 1.0,
      leadingUtility: null,
      leadingToken: null,
      leadingValue: 1.5,
    ),
    AppFaceSlot.chipRow: AppFaceSlotSpec(
      stackRow: 'face-chip-row',
      cssClasses: 'flex items-center justify-between',
      authoredSrc: 'src/components/ui/CardFace.tsx:83',
      displayCss: 'flex',
      positionCss: 'static',
      zIndexCss: 'auto',
      flexDirectionCss: 'row',
      alignItemsCss: 'center',
      justifyContentCss: 'space-between',
      gapPx: null,
      marginTopPx: 0.0,
      marginBottomPx: 8.0,
      paddingTopPx: 0.0,
      paddingRightPx: 0.0,
      paddingBottomPx: 0.0,
      paddingLeftPx: 0.0,
      fontFamily: 'Inter',
      fontSizePx: 16.0,
      fontWeight: 400,
      heightRatio: 1.5,
      letterSpacingPx: 0.0,
      letterSpacingEm: 0.0,
      textColor: null,
      inheritsFaceInk: true,
      textTransformCss: null,
      whiteSpaceCss: 'normal',
      textOverflowCss: 'clip',
      truncates: false,
      tabularNums: false,
      authoredTypeClass: null,
      authoredTypeSrc: null,
      radiusPx: 0.0,
      radiusIsPill: false,
      borderWidthPx: 0.0,
      borderColor: null,
      minWidthZero: null,
      flexGrow: 0.0,
      flexShrink: 1.0,
      leadingUtility: null,
      leadingToken: null,
      leadingValue: 1.5,
    ),
    AppFaceSlot.cardNumber: AppFaceSlotSpec(
      stackRow: 'face-card-number',
      cssClasses:
          'mono text-[10px] tracking-[0.14em] text-white/80 whitespace-nowrap',
      authoredSrc: 'src/components/ui/CardFace.tsx:91',
      displayCss: 'block',
      positionCss: 'static',
      zIndexCss: 'auto',
      flexDirectionCss: 'row',
      alignItemsCss: 'normal',
      justifyContentCss: 'normal',
      gapPx: null,
      marginTopPx: 0.0,
      marginBottomPx: 0.0,
      paddingTopPx: 0.0,
      paddingRightPx: 0.0,
      paddingBottomPx: 0.0,
      paddingLeftPx: 0.0,
      fontFamily: 'JetBrains Mono',
      fontSizePx: 10.0,
      fontWeight: 400,
      heightRatio: 1.5,
      letterSpacingPx: 1.4,
      letterSpacingEm: 0.13999999999999999,
      textColor: Color.fromRGBO(255, 255, 255, 0.8),
      inheritsFaceInk: false,
      textTransformCss: null,
      whiteSpaceCss: 'nowrap',
      textOverflowCss: 'clip',
      truncates: false,
      tabularNums: true,
      authoredTypeClass: '.mono',
      authoredTypeSrc: 'src/index.css:362',
      radiusPx: 0.0,
      radiusIsPill: false,
      borderWidthPx: 0.0,
      borderColor: null,
      minWidthZero: true,
      flexGrow: 0.0,
      flexShrink: 1.0,
      leadingUtility: null,
      leadingToken: null,
      leadingValue: 1.5,
    ),
    AppFaceSlot.label: AppFaceSlotSpec(
      stackRow: 'action-key-label',
      cssClasses: 'text-[10px] leading-none whitespace-nowrap',
      authoredSrc: 'src/components/dashboard/DashboardHero.tsx:47',
      displayCss: 'block',
      positionCss: 'static',
      zIndexCss: 'auto',
      flexDirectionCss: 'row',
      alignItemsCss: 'normal',
      justifyContentCss: 'normal',
      gapPx: null,
      marginTopPx: 0.0,
      marginBottomPx: 0.0,
      paddingTopPx: 0.0,
      paddingRightPx: 0.0,
      paddingBottomPx: 0.0,
      paddingLeftPx: 0.0,
      fontFamily: 'Inter',
      fontSizePx: 10.0,
      fontWeight: 400,
      heightRatio: 1.0,
      letterSpacingPx: 0.0,
      letterSpacingEm: 0.0,
      textColor: null,
      inheritsFaceInk: true,
      textTransformCss: null,
      whiteSpaceCss: 'nowrap',
      textOverflowCss: 'clip',
      truncates: false,
      tabularNums: false,
      authoredTypeClass: null,
      authoredTypeSrc: null,
      radiusPx: 0.0,
      radiusIsPill: false,
      borderWidthPx: 0.0,
      borderColor: null,
      minWidthZero: null,
      flexGrow: 0.0,
      flexShrink: 1.0,
      leadingUtility: 'none',
      leadingToken: null,
      leadingValue: 1.0,
    ),
  };

  /// The band as the component writes it.
  static AppFaceSlotSpec slot(AppFaceSlot slot) {
    final AppFaceSlotSpec? spec = slots[slot];
    if (spec == null) {
      throw ArgumentError('no band was measured for ${slot.name}');
    }
    return spec;
  }

  /// The wallet deck: the container, the lip every other number in it
  /// resolves from, and the laws its peers are placed by.
  static const AppDeckSpec deck = AppDeckSpec(
    stackRow: 'deck-box',
    cssClasses: 'deck',
    authoredSrc: 'src/components/dashboard/WalletDeck.tsx:104',
    ruleSrc: 'src/index.css:796',
    lipDeclSrc: 'src/index.css:797',
    lipPx: 30.0,
    heightPx: 60.0,
    marginBottomPx: -16.0,
    zIndex: 2,
    frontZIndex: 1,
    displayCss: 'block',
    positionCss: 'relative',
    paddingPx: 0.0,
    overflowXCss: 'visible',
    overflowYCss: 'visible',
    widthCss: '100%',
    heightCss: 'calc(var(--deck-lip) * 2)',
    marginCss: '0 auto -16px',
    frontCssClass: 'deck-front',
    frontAuthoredSrc: 'src/components/dashboard/DashboardHero.tsx:125',
    frontRuleSrc: 'src/index.css:824',
    frontPositionCss: 'relative',
    peerTransitionDurationMs: 220,
    peerEaseX1: 0.22,
    peerEaseY1: 1.0,
    peerEaseX2: 0.36,
    peerEaseY2: 1.0,
    peerTransformOriginCss: 'top center',
    peerClipPathCss: 'inset(0 0 calc(100% - var(--deck-lip)) 0)',
    peerRuleSrc: 'src/index.css:804',
  );

  /// One peer per `data-depth` the sheet has a rule for. How many peers a deck
  /// builds is the component’s own budget, cited on [AppDeckSpec]; what is
  /// measured here is where a peer of that depth sits.
  static const Map<AppDeckDepth, AppDeckFaceSpec> deckFaces =
      <AppDeckDepth, AppDeckFaceSpec>{
        AppDeckDepth.near: AppDeckFaceSpec(
          depth: 1,
          stackRow: 'deck-face-depth-1',
          cssClasses: 'deck-face data-depth="1"',
          authoredSrc: 'src/components/dashboard/WalletDeck.tsx:109',
          stateSrc: 'src/index.css:819',
          positionCss: 'absolute',
          leftPx: 0.0,
          rightPx: 0.0,
          topPx: 30.0,
          scale: 0.94,
          opacity: 0.78,
          clipLipPx: 30.0,
          placementSrc: '.deck:796 (.deck --deck-lip 30px) + src/index.css:820 + src/index.css:821 + src/index.css:822',
          lipSrc: 'src/index.css:820',
          clipSrc: 'src/index.css:809',
          originSrc: 'src/index.css:808',
        ),
        AppDeckDepth.far: AppDeckFaceSpec(
          depth: 2,
          stackRow: 'deck-face-depth-2',
          cssClasses: 'deck-face data-depth="2"',
          authoredSrc: 'src/components/dashboard/WalletDeck.tsx:109',
          stateSrc: 'src/index.css:814',
          positionCss: 'absolute',
          leftPx: 0.0,
          rightPx: 0.0,
          topPx: 0.0,
          scale: 0.88,
          opacity: 0.42,
          clipLipPx: 30.0,
          placementSrc: '.deck:796 (.deck --deck-lip 30px) + src/index.css:815 + src/index.css:816 + src/index.css:817',
          lipSrc: 'src/index.css:815',
          clipSrc: 'src/index.css:809',
          originSrc: 'src/index.css:808',
        ),
      };

  /// The placement a peer of this depth takes.
  static AppDeckFaceSpec deckFace(AppDeckDepth depth) {
    final AppDeckFaceSpec? spec = deckFaces[depth];
    if (spec == null) {
      throw ArgumentError(
        'no deck peer was measured at depth ${depth.dataDepth}',
      );
    }
    return spec;
  }

  /// The row of keys under the hero balance: three equal columns and the two
  /// gaps the `sm:` variant switches between. Which viewport takes which gap
  /// stays with the caller — the same ruling that keeps a rail’s breakpoint
  /// out of [AppLedgerRailSpec].
  static const AppActionKeyGridSpec grid = AppActionKeyGridSpec(
    stackRow: 'action-key-grid',
    cssClasses: 'grid grid-cols-3 gap-2 sm:gap-2.5',
    authoredSrc: 'src/components/dashboard/DashboardHero.tsx:209',
    displayCss: 'grid',
    positionCss: 'static',
    tracks: 3,
    columnCountCss: '3',
    gapNarrowPx: 8.0,
    gapWidePx: 10.0,
    gapNarrowCss: '2',
    gapWideCss: '2.5',
    spacingUnitPx: 4.0,
  );

  /// An action key as the light pass painted it: `--accent`
  /// under `--accent-fg` — the app’s accent, inverted against the
  /// page.
  static const AppActionKeySpec keyLight = AppActionKeySpec(
    stackRow: 'action-key',
    cssClasses: 'action-key min-w-0',
    authoredSrc: 'src/components/dashboard/DashboardHero.tsx:43',
    tag: 'button',
    ruleSrc: 'src/index.css:556',
    displayCss: 'flex',
    positionCss: 'relative',
    flexDirectionCss: 'column',
    alignItemsCss: 'center',
    justifyContentCss: 'center',
    gapPx: 7.0,
    paddingCss: '27px 10px 16px',
    paddingTopPx: 27.0,
    paddingRightPx: 10.0,
    paddingBottomPx: 16.0,
    paddingLeftPx: 10.0,
    radiusPx: 18.0,
    borderWidthPx: 0.0,
    borderCss: 'none',
    fill: Color.fromRGBO(15, 25, 39, 1.0),
    ink: Color.fromRGBO(250, 252, 254, 1.0),
    fillToken: '--accent',
    inkToken: '--accent-fg',
    fontFamily: 'Plus Jakarta Sans',
    familyToken: '--font-display',
    fontSizePx: 13.0,
    sizeToken: '--text-xs',
    fontWeight: 700,
    letterSpacingPx: -0.13,
    letterSpacingEm: -0.01,
    lineHeightPx: 19.5,
    minWidthPx: 0.0,
    flexGrow: 0.0,
    flexShrink: 1.0,
    opacity: 1.0,
    transformCss: 'none',
    cursorCss: 'pointer',
    pressScale: 0.965,
    pressSrc: 'src/index.css:592,593',
    hoverBrightness: 0.94,
    hoverSrc: 'src/index.css:589,590',
    disabledOpacity: 0.45,
    disabledCursorCss: 'not-allowed',
    disabledStackRow: 'action-key-disabled',
    disabledAuthoredSrc: 'src/components/dashboard/DashboardHero.tsx:43',
    disabledSrc: 'src/index.css:595 (597,598,599)',
    transitionDurationMs: 130,
    easeX1: 0.22,
    easeY1: 1.0,
    easeX2: 0.36,
    easeY2: 1.0,
    transitionProps: 'transform filter',
    notchWidthPx: 26.0,
    notchHeightPx: 15.0,
    notchCentreX: 0.5,
    notchCentreY: 0.0,
    notchCutAt: 0.985,
    notchEdgePx: 1.0,
    notchAuthored: 'radial-gradient(ellipse var(--key-notch-w) var(--key-notch-h) at 50% 0%, transparent 98.5%, #000 calc(98.5% + 1px))',
    notchSrc: 'src/index.css:556',
  );

  /// The same key as the dark pass painted it.
  static const AppActionKeySpec keyDark = AppActionKeySpec(
    stackRow: 'action-key',
    cssClasses: 'action-key min-w-0',
    authoredSrc: 'src/components/dashboard/DashboardHero.tsx:43',
    tag: 'button',
    ruleSrc: 'src/index.css:556',
    displayCss: 'flex',
    positionCss: 'relative',
    flexDirectionCss: 'column',
    alignItemsCss: 'center',
    justifyContentCss: 'center',
    gapPx: 7.0,
    paddingCss: '27px 10px 16px',
    paddingTopPx: 27.0,
    paddingRightPx: 10.0,
    paddingBottomPx: 16.0,
    paddingLeftPx: 10.0,
    radiusPx: 18.0,
    borderWidthPx: 0.0,
    borderCss: 'none',
    fill: Color.fromRGBO(243, 245, 249, 1.0),
    ink: Color.fromRGBO(6, 11, 20, 1.0),
    fillToken: '--accent',
    inkToken: '--accent-fg',
    fontFamily: 'Plus Jakarta Sans',
    familyToken: '--font-display',
    fontSizePx: 13.0,
    sizeToken: '--text-xs',
    fontWeight: 700,
    letterSpacingPx: -0.13,
    letterSpacingEm: -0.01,
    lineHeightPx: 19.5,
    minWidthPx: 0.0,
    flexGrow: 0.0,
    flexShrink: 1.0,
    opacity: 1.0,
    transformCss: 'none',
    cursorCss: 'pointer',
    pressScale: 0.965,
    pressSrc: 'src/index.css:592,593',
    hoverBrightness: 0.94,
    hoverSrc: 'src/index.css:589,590',
    disabledOpacity: 0.45,
    disabledCursorCss: 'not-allowed',
    disabledStackRow: 'action-key-disabled',
    disabledAuthoredSrc: 'src/components/dashboard/DashboardHero.tsx:43',
    disabledSrc: 'src/index.css:595 (597,598,599)',
    transitionDurationMs: 130,
    easeX1: 0.22,
    easeY1: 1.0,
    easeX2: 0.36,
    easeY2: 1.0,
    transitionProps: 'transform filter',
    notchWidthPx: 26.0,
    notchHeightPx: 15.0,
    notchCentreX: 0.5,
    notchCentreY: 0.0,
    notchCutAt: 0.985,
    notchEdgePx: 1.0,
    notchAuthored: 'radial-gradient(ellipse var(--key-notch-w) var(--key-notch-h) at 50% 0%, transparent 98.5%, #000 calc(98.5% + 1px))',
    notchSrc: 'src/index.css:556',
  );

  /// The disabled key, measured as its own row: generation proved it differs
  /// from the rest row in [AppActionKeySpec.disabledOpacity] and
  /// [AppActionKeySpec.disabledCursorCss] and nothing else.
  static const AppActionKeySpec keyOffLight = AppActionKeySpec(
    stackRow: 'action-key-disabled',
    cssClasses: 'action-key min-w-0',
    authoredSrc: 'src/components/dashboard/DashboardHero.tsx:43',
    tag: 'button',
    ruleSrc: 'src/index.css:556',
    displayCss: 'flex',
    positionCss: 'relative',
    flexDirectionCss: 'column',
    alignItemsCss: 'center',
    justifyContentCss: 'center',
    gapPx: 7.0,
    paddingCss: '27px 10px 16px',
    paddingTopPx: 27.0,
    paddingRightPx: 10.0,
    paddingBottomPx: 16.0,
    paddingLeftPx: 10.0,
    radiusPx: 18.0,
    borderWidthPx: 0.0,
    borderCss: 'none',
    fill: Color.fromRGBO(15, 25, 39, 1.0),
    ink: Color.fromRGBO(250, 252, 254, 1.0),
    fillToken: '--accent',
    inkToken: '--accent-fg',
    fontFamily: 'Plus Jakarta Sans',
    familyToken: '--font-display',
    fontSizePx: 13.0,
    sizeToken: '--text-xs',
    fontWeight: 700,
    letterSpacingPx: -0.13,
    letterSpacingEm: -0.01,
    lineHeightPx: 19.5,
    minWidthPx: 0.0,
    flexGrow: 0.0,
    flexShrink: 1.0,
    opacity: 0.45,
    transformCss: 'none',
    cursorCss: 'not-allowed',
    pressScale: 0.965,
    pressSrc: 'src/index.css:592,593',
    hoverBrightness: 0.94,
    hoverSrc: 'src/index.css:589,590',
    disabledOpacity: 0.45,
    disabledCursorCss: 'not-allowed',
    disabledStackRow: 'action-key-disabled',
    disabledAuthoredSrc: 'src/components/dashboard/DashboardHero.tsx:43',
    disabledSrc: 'src/index.css:595 (597,598,599)',
    transitionDurationMs: 130,
    easeX1: 0.22,
    easeY1: 1.0,
    easeX2: 0.36,
    easeY2: 1.0,
    transitionProps: 'transform filter',
    notchWidthPx: 26.0,
    notchHeightPx: 15.0,
    notchCentreX: 0.5,
    notchCentreY: 0.0,
    notchCutAt: 0.985,
    notchEdgePx: 1.0,
    notchAuthored: 'radial-gradient(ellipse var(--key-notch-w) var(--key-notch-h) at 50% 0%, transparent 98.5%, #000 calc(98.5% + 1px))',
    notchSrc: 'src/index.css:556',
  );

  /// The disabled key in the dark pass.
  static const AppActionKeySpec keyOffDark = AppActionKeySpec(
    stackRow: 'action-key-disabled',
    cssClasses: 'action-key min-w-0',
    authoredSrc: 'src/components/dashboard/DashboardHero.tsx:43',
    tag: 'button',
    ruleSrc: 'src/index.css:556',
    displayCss: 'flex',
    positionCss: 'relative',
    flexDirectionCss: 'column',
    alignItemsCss: 'center',
    justifyContentCss: 'center',
    gapPx: 7.0,
    paddingCss: '27px 10px 16px',
    paddingTopPx: 27.0,
    paddingRightPx: 10.0,
    paddingBottomPx: 16.0,
    paddingLeftPx: 10.0,
    radiusPx: 18.0,
    borderWidthPx: 0.0,
    borderCss: 'none',
    fill: Color.fromRGBO(243, 245, 249, 1.0),
    ink: Color.fromRGBO(6, 11, 20, 1.0),
    fillToken: '--accent',
    inkToken: '--accent-fg',
    fontFamily: 'Plus Jakarta Sans',
    familyToken: '--font-display',
    fontSizePx: 13.0,
    sizeToken: '--text-xs',
    fontWeight: 700,
    letterSpacingPx: -0.13,
    letterSpacingEm: -0.01,
    lineHeightPx: 19.5,
    minWidthPx: 0.0,
    flexGrow: 0.0,
    flexShrink: 1.0,
    opacity: 0.45,
    transformCss: 'none',
    cursorCss: 'not-allowed',
    pressScale: 0.965,
    pressSrc: 'src/index.css:592,593',
    hoverBrightness: 0.94,
    hoverSrc: 'src/index.css:589,590',
    disabledOpacity: 0.45,
    disabledCursorCss: 'not-allowed',
    disabledStackRow: 'action-key-disabled',
    disabledAuthoredSrc: 'src/components/dashboard/DashboardHero.tsx:43',
    disabledSrc: 'src/index.css:595 (597,598,599)',
    transitionDurationMs: 130,
    easeX1: 0.22,
    easeY1: 1.0,
    easeX2: 0.36,
    easeY2: 1.0,
    transitionProps: 'transform filter',
    notchWidthPx: 26.0,
    notchHeightPx: 15.0,
    notchCentreX: 0.5,
    notchCentreY: 0.0,
    notchCutAt: 0.985,
    notchEdgePx: 1.0,
    notchAuthored: 'radial-gradient(ellipse var(--key-notch-w) var(--key-notch-h) at 50% 0%, transparent 98.5%, #000 calc(98.5% + 1px))',
    notchSrc: 'src/index.css:556',
  );

  /// The key as one brightness painted it, at rest or disabled.
  static AppActionKeySpec keyAt(Brightness brightness, {bool enabled = true}) {
    if (enabled) {
      return brightness == Brightness.dark ? keyDark : keyLight;
    }
    return brightness == Brightness.dark ? keyOffDark : keyOffLight;
  }

  /// The box around a key’s glyph. It draws nothing: it is the web’s
  /// leading-killer, ported so the key’s gap is the only space between the
  /// symbol and the word under it.
  static const AppActionKeyIconSpec icon = AppActionKeyIconSpec(
    stackRow: 'action-key-icon',
    cssClasses: 'action-key-icon',
    authoredSrc: 'src/components/dashboard/DashboardHero.tsx:44',
    ruleSrc: 'src/index.css:601',
    displayCss: 'block',
    lineHeightPx: 0.0,
    glyphSrc: 'src/components/dashboard/DashboardHero.tsx:45,33,39',
  );
}
