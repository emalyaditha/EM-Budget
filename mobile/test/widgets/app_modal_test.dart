import 'package:em_budget/core/theme/app_modals.dart';
import 'package:em_budget/core/theme/app_theme.dart';
import 'package:em_budget/presentation/widgets/app_modal.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// The widget must hand Flutter's rounded painter the measured-off (0px)
/// sides as [BorderStyle.none]; the expectation applies the same spelling to
/// the raw row so the comparison is like-for-like — colours and non-zero
/// widths are the measured ones either way.
Border _paintable(Border b) => Border(
  top: b.top.width == 0.0 ? b.top.copyWith(style: BorderStyle.none) : b.top,
  right: b.right.width == 0.0
      ? b.right.copyWith(style: BorderStyle.none)
      : b.right,
  bottom: b.bottom.width == 0.0
      ? b.bottom.copyWith(style: BorderStyle.none)
      : b.bottom,
  left: b.left.width == 0.0 ? b.left.copyWith(style: BorderStyle.none) : b.left,
);

/// Behaviour and geometry for [AppModal], exercised at exactly the two viewports
/// the measurement captured — phone 390x844 and desktop 1440x900 — so every
/// wide/narrow pair the rows carry is selected under the same numbers Chrome
/// saw. Assertions about motion assert settle and end state only: the browser's
/// spring integrator has no pixel evidence, and no golden is claimed to cover
/// it. No value here is a new number: each expectation reuses the generated
/// row or the test viewport the row's fraction was divided against.
///
/// [AppModal.wideBreakpointPx] is caller-supplied precisely because the
/// evidence measured no Tailwind breakpoint. These tests pick 700 — the value
/// proves nothing about the web; it only says that any threshold between the
/// 390 and 1440 capture widths selects the same side at both, which is what
/// the wide/narrow pairs were measured against.
void main() {
  const Size phone = Size(390, 844);
  const Size desktop = Size(1440, 900);
  const double wideBreakpoint = 700;

  final Key contentKey = UniqueKey();
  final Key glyphKey = UniqueKey();

  AppModalSpec row(AppModalVariant variant, {bool dark = false}) =>
      AppModals.resolve(
        variant.cssClass,
        dark ? Brightness.dark : Brightness.light,
      );

  /// The panel box is the one Container in the shell whose decoration carries
  /// the row's measured shadow — no key needed, the row identifies it.
  final Finder panelFinder = find.byWidgetPredicate(
    (Widget w) =>
        w is Container &&
        (w.decoration is BoxDecoration) &&
        ((w.decoration! as BoxDecoration).boxShadow?.isNotEmpty ?? false),
  );

  /// [Container] keeps its `width`/`height` constructor arguments private, so
  /// these finders identify each part by the exact decoration the row paints
  /// it with, and the tests assert the measured size on top of the match.
  Finder gripFinder(AppModalGripSpec grip) {
    final BoxDecoration built = BoxDecoration(
      color: grip.fill,
      borderRadius: BorderRadius.circular(grip.radiusPx),
    );
    return find.byWidgetPredicate(
      (Widget w) => w is Container && w.decoration == built,
    );
  }

  Finder variantCloseFinder(AppModalSpec spec) {
    final BoxDecoration built = BoxDecoration(
      color: spec.closeFill,
      border: Border.all(
        color: spec.closeBorderColor,
        width: spec.closeBorderWidthPx,
      ),
      borderRadius: BorderRadius.circular(spec.closeBorderRadiusPx),
    );
    return find.byWidgetPredicate(
      (Widget w) => w is Container && w.decoration == built,
    );
  }

  Finder variantHeaderFinder(AppModalSpec spec) {
    final BoxDecoration built = BoxDecoration(
      color: spec.headerFill,
      border: spec.headerBorderBottom,
    );
    return find.byWidgetPredicate(
      (Widget w) => w is Container && w.decoration == built,
    );
  }

  Future<void> pumpShell(
    WidgetTester tester, {
    required bool isOpen,
    AppModalVariant variant = AppModalVariant.dialog,
    Size viewport = phone,
    VoidCallback? onClose,
    Widget? child,
    String? widthToken,
    AppVeilRecipe? veil,
    bool dark = false,
  }) async {
    tester.view.physicalSize = viewport;
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        theme: appThemeData(isDark: false),
        darkTheme: appThemeData(isDark: true),
        themeMode: dark ? ThemeMode.dark : ThemeMode.light,
        home: Scaffold(
          body: AppModal(
            isOpen: isOpen,
            onClose: onClose ?? () {},
            title: 'Shell title',
            wideBreakpointPx: wideBreakpoint,
            variant: variant,
            veil: veil,
            widthToken: widthToken,
            closeGlyph: Icon(Icons.close, key: glyphKey, size: 13.0),
            // `Colors.transparent` so the box is a real hit target for the
            // inside-panel tap test — a bare sized Container is not.
            child:
                child ??
                Container(
                  key: contentKey,
                  height: 40,
                  color: Colors.transparent,
                ),
          ),
        ),
      ),
    );
  }

  testWidgets('a closed shell paints nothing and an open shell its panel', (
    WidgetTester tester,
  ) async {
    await pumpShell(tester, isOpen: false);
    expect(find.byType(AppModal), findsOneWidget);
    expect(
      find.descendant(of: find.byType(AppModal), matching: panelFinder),
      findsNothing,
      reason: 'nothing renders while the shell is away',
    );
    expect(
      find.descendant(
        of: find.byType(AppModal),
        matching: find.byType(BackdropFilter),
      ),
      findsNothing,
    );

    await pumpShell(tester, isOpen: true);
    await tester.pump();
    expect(
      find.descendant(of: find.byType(AppModal), matching: panelFinder),
      findsOneWidget,
    );
  });

  testWidgets('the dialog centres on both sides; the sheet docks the phone '
      'bottom and centres on desktop', (WidgetTester tester) async {
    for (final (AppModalVariant variant, Size viewport)
        in <(AppModalVariant, Size)>[
          (AppModalVariant.dialog, phone),
          (AppModalVariant.dialog, desktop),
          (AppModalVariant.sheet, phone),
          (AppModalVariant.sheet, desktop),
        ]) {
      await pumpShell(
        tester,
        isOpen: true,
        variant: variant,
        viewport: viewport,
      );
      await tester.pumpAndSettle();
      final Rect panel = tester.getRect(
        find.descendant(of: find.byType(AppModal), matching: panelFinder),
      );
      if (variant == AppModalVariant.sheet && viewport == phone) {
        expect(
          panel.bottom,
          closeTo(viewport.height, 0.01),
          reason:
              'items-end on the phone docks the sheet flush to the bottom edge',
        );
      } else {
        expect(
          panel.center.dy,
          closeTo(viewport.height / 2, 0.01),
          reason: '$variant at ${viewport.width}: centred, as measured',
        );
        expect(panel.center.dx, closeTo(viewport.width / 2, 0.01));
      }
    }
  });

  testWidgets('the measured caps survive as fractions of the live viewport', (
    WidgetTester tester,
  ) async {
    // The dialog caps its BODY (max-h-[80vh]); the sheet caps its PANEL
    // (max-h-[85vh]) — the 675.2/717.4 phone px and 720/765 desktop px the
    // passes measured, divided back out of the test viewport.
    Widget tall() => Container(key: contentKey, height: 3000, color: null);
    for (final Size viewport in <Size>[phone, desktop]) {
      await pumpShell(tester, isOpen: true, viewport: viewport, child: tall());
      await tester.pumpAndSettle();
      final double fraction = row(AppModalVariant.dialog)
          .bodyMaxHeightFraction!;
      final Finder bodyScroll = find.ancestor(
        of: find.byKey(contentKey),
        matching: find.byType(SingleChildScrollView),
      );
      expect(
        tester.getSize(bodyScroll.last).height,
        closeTo(fraction * viewport.height, 0.01),
        reason: 'the body cap is the fraction over ${viewport.height}',
      );
    }
    for (final Size viewport in <Size>[phone, desktop]) {
      await pumpShell(
        tester,
        isOpen: true,
        variant: AppModalVariant.sheet,
        viewport: viewport,
        child: tall(),
      );
      await tester.pumpAndSettle();
      final double fraction = row(AppModalVariant.sheet)
          .panelMaxHeightFraction!;
      expect(
        tester
            .getSize(
              find.descendant(of: find.byType(AppModal), matching: panelFinder),
            )
            .height,
        closeTo(fraction * viewport.height, 0.01),
        reason: 'the sheet panel cap is the fraction over ${viewport.height}',
      );
    }
  });

  testWidgets('the grip appears only where its display was measured', (
    WidgetTester tester,
  ) async {
    final AppModalGripSpec grip = row(AppModalVariant.sheet).grip!;
    await pumpShell(tester, isOpen: true, variant: AppModalVariant.sheet);
    await tester.pumpAndSettle();
    final Finder paintedGrip = find.descendant(
      of: find.byType(AppModal),
      matching: gripFinder(grip),
    );
    expect(
      paintedGrip,
      findsOneWidget,
      reason: 'the phone sheet shows the sm:block grip',
    );
    expect(
      tester.getSize(paintedGrip),
      Size(grip.widthPx, grip.heightPx),
      reason: 'the grip is the measured bar, at its measured size',
    );
    await pumpShell(
      tester,
      isOpen: true,
      variant: AppModalVariant.sheet,
      viewport: desktop,
    );
    await tester.pumpAndSettle();
    expect(
      find.descendant(of: find.byType(AppModal), matching: gripFinder(grip)),
      findsNothing,
      reason: 'sm:hidden writes the grip out on desktop',
    );
    await pumpShell(tester, isOpen: true, viewport: desktop);
    await tester.pumpAndSettle();
    expect(
      find.descendant(of: find.byType(AppModal), matching: gripFinder(grip)),
      findsNothing,
      reason: 'the dialog measures no grip at either width',
    );
  });

  testWidgets('radius and border paint the side the row diverges on', (
    WidgetTester tester,
  ) async {
    for (final (AppModalVariant variant, Size viewport)
        in <(AppModalVariant, Size)>[
          (AppModalVariant.dialog, phone),
          (AppModalVariant.dialog, desktop),
          (AppModalVariant.sheet, phone),
          (AppModalVariant.sheet, desktop),
        ]) {
      await pumpShell(
        tester,
        isOpen: true,
        variant: variant,
        viewport: viewport,
      );
      await tester.pumpAndSettle();
      final AppModalSpec spec = row(variant);
      final bool wide = viewport.width >= wideBreakpoint;
      final BoxDecoration painted =
          tester
                  .widget<Container>(
                    find.descendant(
                      of: find.byType(AppModal),
                      matching: panelFinder,
                    ),
                  )
                  .decoration!
              as BoxDecoration;
      expect(
        painted.borderRadius,
        wide ? spec.panelRadiusWide : spec.panelRadiusNarrow,
        reason:
            '${variant.name} at ${viewport.width}: the widget picks the side '
            'the row measured, not a blend',
      );
      expect(
        painted.border! as Border,
        _paintable(wide ? spec.panelBorderWide : spec.panelBorderNarrow),
        reason:
            '${variant.name} at ${viewport.width}: every measured side paints, '
            'with the 0px sides in Flutter\u2019s no-paint spelling',
      );
      if (variant == AppModalVariant.sheet && !wide) {
        final Border narrow = spec.panelBorderNarrow;
        expect(narrow.bottom.width, 0.0, reason: 'the phone sheet is top-only');
        expect(narrow.left.width, 0.0);
        expect(narrow.right.width, 0.0);
        final BorderRadius narrowRadius = spec.panelRadiusNarrow;
        expect(narrowRadius.bottomLeft, Radius.zero);
        expect(narrowRadius.bottomRight, Radius.zero);
      }
    }
  });

  testWidgets('the header bar, the title type and the close target are the '
      'row painted', (WidgetTester tester) async {
    for (final AppModalVariant variant in AppModalVariant.values) {
      await pumpShell(tester, isOpen: true, variant: variant);
      await tester.pumpAndSettle();
      final AppModalSpec spec = row(variant);
      expect(find.text('Shell title'), findsOneWidget);
      expect(
        tester.widget<Text>(find.text('Shell title')).style,
        spec.titleStyle,
        reason: '${variant.name}: §6.3 type off the row, no Material default',
      );
      final Finder header = find.descendant(
        of: find.byType(AppModal),
        matching: variantHeaderFinder(spec),
      );
      expect(
        header,
        findsOneWidget,
        reason:
            '${variant.name}: the header is painted with exactly the row’s '
            'fill and hairline — and nothing else in the shell is',
      );
      expect(
        tester.getSize(header).height,
        spec.headerHeightPx,
        reason: '${variant.name}: the measured header height',
      );
      expect(
        tester.getSize(
          find.descendant(
            of: find.byType(AppModal),
            matching: variantCloseFinder(spec),
          ),
        ),
        Size(spec.closeSizePx, spec.closeSizePx),
      );
      expect(
        (tester
                    .widget<Container>(
                      find.descendant(
                        of: find.byType(AppModal),
                        matching: variantCloseFinder(spec),
                      ),
                    )
                    .decoration!
                as BoxDecoration)
            .borderRadius,
        BorderRadius.circular(spec.closeBorderRadiusPx),
        reason: 'Chrome’s rounded-full clamp rides verbatim; Flutter paints the circle',
      );
      final IconTheme iconTheme = tester.widget<IconTheme>(
        find
            .descendant(
              of: find.byType(AppModal),
              matching: find.byType(IconTheme),
            )
            .last,
      );
      expect(
        iconTheme.data.color,
        spec.closeFgColor,
        reason: 'the glyph inherits --ink-2 as the SVG does on the web',
      );
    }
  });

  testWidgets('a veil tap closes and the close target closes; the panel body '
      'does not', (WidgetTester tester) async {
    int closes = 0;
    await pumpShell(tester, isOpen: true, onClose: () => closes++);
    await tester.pumpAndSettle();
    // Top-left corner is veil at both capture widths.
    await tester.tapAt(const Offset(4, 4));
    await tester.pump();
    expect(closes, 1, reason: 'the veil is the shells’ authored dismiss');
    await tester.tap(
      find.descendant(
        of: find.byType(AppModal),
        matching: variantCloseFinder(row(AppModalVariant.dialog)),
      ),
    );
    await tester.pump();
    expect(closes, 2, reason: 'the close target dismisses too');
    await tester.tap(find.byKey(contentKey));
    await tester.pump();
    expect(closes, 2, reason: 'a tap inside the panel is not a dismiss');
  });

  testWidgets('Escape closes the dialog only — the sheet measures no handler', (
    WidgetTester tester,
  ) async {
    int closes = 0;
    await pumpShell(tester, isOpen: true, onClose: () => closes++);
    await tester.pumpAndSettle();
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pump();
    expect(closes, 1, reason: 'Modal.tsx authors the Escape part');

    closes = 0;
    await pumpShell(
      tester,
      isOpen: true,
      variant: AppModalVariant.sheet,
      onClose: () => closes++,
    );
    await tester.pumpAndSettle();
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pump();
    expect(
      closes,
      0,
      reason: 'BottomSheet.tsx does not — the flag is measured, not shared',
    );
  });

  testWidgets('the veil recipe is the shell’s own unless a recorded one is '
      'swapped in', (WidgetTester tester) async {
    final AppModalSpec spec = row(AppModalVariant.dialog);
    await pumpShell(tester, isOpen: true);
    await tester.pumpAndSettle();
    final BackdropFilter defaultVeil = tester.widget<BackdropFilter>(
      find.descendant(
        of: find.byType(AppModal),
        matching: find.byType(BackdropFilter),
      ),
    );
    expect(
      defaultVeil.filter.toString(),
      contains('blur(${spec.veilBlurSigmaPx}, ${spec.veilBlurSigmaPx}'),
      reason: 'ink/40 + the 2px blur halved (D-U8) is the shell’s recipe',
    );
    expect(
      tester
          .widget<ColoredBox>(
            find.descendant(
              of: find.byType(BackdropFilter),
              matching: find.byType(ColoredBox),
            ),
          )
          .color,
      spec.veilColor,
    );

    await pumpShell(tester, isOpen: true, veil: AppModals.dimVeilLight);
    await tester.pumpAndSettle();
    final BackdropFilter dimVeil = tester.widget<BackdropFilter>(
      find.descendant(
        of: find.byType(AppModal),
        matching: find.byType(BackdropFilter),
      ),
    );
    expect(
      dimVeil.filter.toString(),
      contains(
        'blur(${AppModals.dimVeilLight.blurSigmaPx}, '
        '${AppModals.dimVeilLight.blurSigmaPx}',
      ),
      reason: 'the swapped recipe brings its own --blur-sm halved',
    );
    expect(
      tester
          .widget<ColoredBox>(
            find.descendant(
              of: find.byType(BackdropFilter),
              matching: find.byType(ColoredBox),
            ),
          )
          .color,
      AppModals.dimVeilLight.color,
    );
    expect(
      AppModals.dimVeilLight.color,
      isNot(spec.veilColor),
      reason: 'and the two recipes are genuinely different rows',
    );
  });

  testWidgets('widthToken selects a recorded container width; the sheet '
      'refuses one', (WidgetTester tester) async {
    double panelWidth() => tester
        .getSize(
          find.descendant(of: find.byType(AppModal), matching: panelFinder),
        )
        .width;
    // Desktop room: the token is the whole story.
    await pumpShell(tester, isOpen: true, widthToken: 'sm', viewport: desktop);
    await tester.pumpAndSettle();
    expect(
      panelWidth(),
      AppModals.widthPx['sm'],
      reason: 'max-w-sm is the --container-sm row, chosen per render',
    );
    await pumpShell(tester, isOpen: true, viewport: desktop);
    await tester.pumpAndSettle();
    expect(
      panelWidth(),
      row(AppModalVariant.dialog).panelMaxWidthPx,
      reason:
          'null keeps the prop default the generator proves the row matches',
    );
    // On the phone the token is still a MAX width, not a fixed one — the web
    // max-w-* clamps the same way: the panel takes the padded shell width.
    await pumpShell(tester, isOpen: true, widthToken: 'sm');
    await tester.pumpAndSettle();
    final EdgeInsets narrowShellPad = row(AppModalVariant.dialog)
        .shellPaddingNarrow;
    expect(
      panelWidth(),
      closeTo(phone.width - narrowShellPad.left - narrowShellPad.right, 0.01),
      reason: '390 − the measured phone shell padding fits under 384 and wins',
    );

    await pumpShell(
      tester,
      isOpen: true,
      variant: AppModalVariant.sheet,
      widthToken: 'sm',
    );
    expect(
      tester.takeException(),
      isA<ArgumentError>(),
      reason:
          'the sheet measures one width and no map; handing it a token is a '
          'programming error, not a fallback',
    );
  });

  testWidgets('presence: the exit runs to its end before the shell goes away, '
      'and a re-open interrupts it cleanly', (WidgetTester tester) async {
    tester.view.physicalSize = phone;
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(const _Harness());
    await tester.pumpAndSettle();
    final _HarnessState harness = tester.state<_HarnessState>(
      find.byType(_Harness),
    );
    Finder panel() =>
        find.descendant(of: find.byType(AppModal), matching: panelFinder);
    expect(panel(), findsOneWidget);

    harness.setOpen(false);
    await tester.pump(); // rebuild with isOpen false: the exit starts
    expect(
      panel(),
      findsOneWidget,
      reason: 'AnimatePresence-like: the shell leaves only after its exit',
    );
    await tester.pump(const Duration(milliseconds: 100));
    expect(panel(), findsOneWidget);
    await tester.pumpAndSettle();
    expect(
      panel(),
      findsNothing,
      reason: 'settled: now, and only now, is nothing painted',
    );

    harness.setOpen(true);
    await tester.pump();
    expect(panel(), findsOneWidget);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull, reason: 'no TickerCanceled escapes');

    // Interrupt mid-exit: closing then re-opening before the spring settles.
    harness.setOpen(false);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    harness.setOpen(true);
    await tester.pump();
    await tester.pumpAndSettle();
    expect(
      panel(),
      findsOneWidget,
      reason: 'the interruption leaves the shell present, not vanished',
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('motion: the veil fades on the authored clock and the spring '
      'settles — end state and settle time, not frames', (
    WidgetTester tester,
  ) async {
    await pumpShell(tester, isOpen: false);
    await pumpShell(tester, isOpen: true);

    final FadeTransition veil = tester.widget<FadeTransition>(
      find.descendant(
        of: find.byType(AppModal),
        matching: find.byType(FadeTransition),
      ),
    );
    expect(
      veil.opacity.value,
      0.0,
      reason: 'mount plays the authored initial: the veil starts clear',
    );
    await tester.pump(const Duration(milliseconds: 90));
    expect(veil.opacity.value, greaterThan(0.0));
    expect(veil.opacity.value, lessThan(1.0));
    await tester.pump(const Duration(milliseconds: 90));
    expect(
      veil.opacity.value,
      1.0,
      reason:
          'exactly one authored ${AppModals.veilFadeMs}ms clock later the fade '
          'is done — a record value, not a tuned one',
    );

    // The panel rides the row's spring. The browser's own integrator has no
    // pixel evidence, so nothing here checks a frame: the assertions are that
    // the ride ends at the authored full state and settles within a bounded
    // budget. The Opacity widget is re-read every iteration — a captured one
    // goes stale as the tree rebuilds under the animation.
    final Finder panelOpacity = find.descendant(
      of: find.byType(AppModal),
      matching: find.byType(Opacity),
    );
    double painted() => tester.widget<Opacity>(panelOpacity).opacity;
    int elapsedMs = 0;
    while (painted() < 1.0 && elapsedMs < 3000) {
      await tester.pump(const Duration(milliseconds: 50));
      elapsedMs += 50;
    }
    expect(
      painted(),
      1.0,
      reason: 'the 26/280 spring settles to full (took ${elapsedMs}ms)',
    );
    expect(
      elapsedMs,
      lessThan(2000),
      reason: 'a damped spring at these numbers must not crawl',
    );
    await tester.pumpAndSettle();
    expect(painted(), 1.0, reason: 'and stays settled');
  });
}

/// The presence test needs a live `isOpen` it can flip from the test body;
/// this is the smallest stateful harness that mirrors it into [AppModal].
class _Harness extends StatefulWidget {
  const _Harness();

  @override
  State<_Harness> createState() => _HarnessState();
}

class _HarnessState extends State<_Harness> {
  bool _open = true;

  void setOpen(bool value) => setState(() => _open = value);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: appThemeData(isDark: false),
      home: Scaffold(
        body: AppModal(
          isOpen: _open,
          onClose: () {},
          title: 'Shell title',
          wideBreakpointPx: 700,
          closeGlyph: const Icon(Icons.close, size: 13.0),
          child: const SizedBox(height: 40),
        ),
      ),
    );
  }
}
