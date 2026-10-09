// Parity gate for the generated theme layer (Phase 5, playbook 2.4 step 4).
//
// parity/generate_theme.cjs projects parity/ui-tokens.json — the Chrome-computed
// measurement of src/index.css at tag pre-flutter — onto mobile/lib/core/theme/.
// Re-deriving that projection from the JSON here is the only check that a
// generator edit cannot silently move a value: the JSON is the contract, the Dart
// files are a projection of it, and UI_SPEC 5 is deliberately not used because
// its machine "Dart" column mis-parses --blur-* / --container-* names as radii.
//
// Every expectation below is parsed out of the CSS raw/substituted string in this
// file, never copied from the generated output, so the two can only agree by
// both being right.

import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:em_budget/core/theme/app_colors.dart';
import 'package:em_budget/core/theme/app_radii.dart';
import 'package:em_budget/core/theme/app_shadows.dart';
import 'package:em_budget/core/theme/app_spacing.dart';
import 'package:em_budget/core/theme/app_surfaces.dart';
import 'package:em_budget/core/theme/app_theme.dart';
import 'package:em_budget/core/theme/app_typography.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../data/web_source.dart';

/// Chrome resolves CSS lengths in px and every rem-bearing token in index.css was
/// authored against the 16px root, which is what the measurement recorded.
const double _remPx = 16.0;

Map<String, dynamic> _theme(Map<String, dynamic> measurement, String name) =>
    (measurement['themes']! as Map<String, dynamic>)[name]!
        as Map<String, dynamic>;

Map<String, dynamic> _rootOf(Map<String, dynamic> theme) =>
    theme['root']! as Map<String, dynamic>;

Map<String, dynamic> _probesOf(Map<String, dynamic> theme) =>
    theme['probes']! as Map<String, dynamic>;

Map<String, dynamic> _token(Map<String, dynamic> root, String name) {
  final Object? value = root[name];
  if (value == null) throw StateError('ui-tokens.json has no token $name');
  return value as Map<String, dynamic>;
}

String _raw(Map<String, dynamic> root, String name) =>
    _token(root, name)['raw']! as String;

String _substituted(Map<String, dynamic> root, String name) {
  final Map<String, dynamic> token = _token(root, name);
  return (token['substituted'] ?? token['raw'])! as String;
}

/// Tailwind emits --tw-* plumbing the design system never consumes, so it is not
/// part of the ported set even though Chrome measures it as a colour.
List<String> _colourTokens(Map<String, dynamic> root) {
  final List<String> out = <String>[];
  for (final MapEntry<String, dynamic> entry in root.entries) {
    if (entry.key.startsWith('--tw-')) continue;
    final Object? value = entry.value;
    if (value is Map<String, dynamic> && value.containsKey('srgb')) {
      out.add(entry.key);
    }
  }
  return out..sort();
}

List<String> _tokensMatching(
  Map<String, dynamic> root,
  bool Function(String name) test,
) {
  return root.keys.where(test).toList()..sort();
}

Color _measuredColour(Map<String, dynamic> root, String name) {
  final Map<String, dynamic> srgb =
      _token(root, name)['srgb']! as Map<String, dynamic>;
  return Color.fromRGBO(
    (srgb['r']! as num).round(),
    (srgb['g']! as num).round(),
    (srgb['b']! as num).round(),
    (srgb['alpha']! as num).toDouble(),
  );
}

Color _parseRgba(String text) {
  final String value = text.trim();
  if (value == 'transparent') return const Color(0x00000000);
  final RegExpMatch? m = RegExp(
    r'rgba?\([\s]*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?[\s]*\)',
  ).firstMatch(value);
  if (m == null) throw StateError('Not an rgb colour: $value');
  return Color.fromRGBO(
    num.parse(m.group(1)!).round(),
    num.parse(m.group(2)!).round(),
    num.parse(m.group(3)!).round(),
    m.group(4) == null ? 1.0 : num.parse(m.group(4)!).toDouble(),
  );
}

/// Split a CSS value list on its top-level commas; rgba()/oklch()/calc() carry
/// their own commas inside parentheses and must not split the list.
List<String> _splitTopLevel(String value) {
  final List<String> parts = <String>[];
  final StringBuffer current = StringBuffer();
  int depth = 0;
  for (final int code in value.codeUnits) {
    if (code == 0x28 /* ( */ ) depth++;
    if (code == 0x29 /* ) */ ) depth--;
    if (code == 0x2C /* , */ && depth == 0) {
      parts.add(current.toString());
      current.clear();
    } else {
      current.writeCharCode(code);
    }
  }
  if (current.isNotEmpty) parts.add(current.toString());
  return parts.map((String part) => part.trim()).toList();
}

double _cssLength(String token) {
  final String value = token.trim();
  final RegExpMatch? m = RegExp(r'^(-?[\d.]+)(px|rem)?[\s]*$')
      .firstMatch(value);
  if (m == null) throw StateError('Not a CSS length: $value');
  final double number = num.parse(m.group(1)!).toDouble();
  return m.group(2) == 'rem' ? number * _remPx : number;
}

/// A clamp() resolves to its floor, which is the value the phone viewport
/// measured and the value the generated constants were taken from.
double _lengthToPx(String raw) {
  final String value = raw.trim();
  final RegExpMatch? clamp = RegExp(r'^clamp\([\s]*(-?[\d.]+(?:px|rem))')
      .firstMatch(value);
  if (clamp != null) return _cssLength(clamp.group(1)!);
  return _cssLength(value);
}

/// calc(a / b) as index.css authors its line-heights: a unitless multiplier, so
/// it reaches Dart without touching the font size.
double _ratio(String raw) {
  final String value = raw.trim();
  final RegExpMatch? calc = RegExp(
    r'^calc\([\s]*([\d.]+)[\s]*/[\s]*([\d.]+)[\s]*\)$',
  ).firstMatch(value);
  if (calc != null) {
    return num.parse(calc.group(1)!) / num.parse(calc.group(2)!);
  }
  final RegExpMatch? bare = RegExp(r'^([\d.]+)[\s]*$').firstMatch(value);
  if (bare != null) return num.parse(bare.group(1)!).toDouble();
  throw StateError('Not a line-height multiplier: $value');
}

/// A probe class's computed line-height over its computed font-size — the ratio
/// .money-display and .numeral actually rendered, which root never exposes.
double _probeRatio(Map<String, dynamic> probes, String selector) {
  final Object? measured = probes[selector];
  if (measured == null) {
    throw StateError('No probe $selector in the measurement');
  }
  final Map<String, dynamic> probe = measured as Map<String, dynamic>;
  final double size = _lengthToPx(probe['fontSize']! as String);
  final double line = _lengthToPx(probe['lineHeight']! as String);
  return line / size;
}

Duration _duration(String raw) {
  final RegExpMatch? m = RegExp(r'^([\d.]+)(ms|s)$').firstMatch(raw.trim());
  if (m == null) throw StateError('Not a duration: $raw');
  final double value = num.parse(m.group(1)!).toDouble();
  return m.group(2) == 's'
      ? Duration(milliseconds: (value * 1000).round())
      : Duration(milliseconds: value.round());
}

Cubic _cubic(String raw) {
  final RegExpMatch? m = RegExp(r'^cubic-bezier\(([-\d.,\s]+)\)')
      .firstMatch(raw.trim());
  if (m == null) throw StateError('Not a cubic-bezier: $raw');
  final List<double> parts = m
      .group(1)!
      .split(',')
      .map((String piece) => num.parse(piece.trim()).toDouble())
      .toList();
  if (parts.length != 4) throw StateError('Not a 4-point cubic: $raw');
  return Cubic(parts[0], parts[1], parts[2], parts[3]);
}

List<BoxShadow> _boxShadows(Map<String, dynamic> root, String name) {
  final List<BoxShadow> out = <BoxShadow>[];
  for (final String layer in _splitTopLevel(_substituted(root, name))) {
    final RegExpMatch? colour = RegExp(r'(rgba\([^)]*\)|transparent)\s*$')
        .firstMatch(layer);
    if (colour == null) {
      throw StateError('Shadow layer without a colour: $layer');
    }
    final List<String> lengths = layer
        .substring(0, colour.start)
        .trim()
        .split(RegExp(r'\s+'))
        .where((String part) => part.isNotEmpty)
        .toList();
    if (lengths.length < 2 || lengths.length > 4) {
      throw StateError('Shadow layer has ${lengths.length} lengths: $layer');
    }
    out.add(
      BoxShadow(
        color: _parseRgba(colour.group(1)!),
        offset: Offset(_cssLength(lengths[0]), _cssLength(lengths[1])),
        blurRadius: lengths.length > 2 ? _cssLength(lengths[2]) : 0.0,
        spreadRadius: lengths.length > 3 ? _cssLength(lengths[3]) : 0.0,
      ),
    );
  }
  return out;
}

class _GradientExpectation {
  const _GradientExpectation(this.begin, this.end, this.colors, this.stops);

  final Alignment begin;
  final Alignment end;
  final List<Color> colors;
  final List<double>? stops;
}

/// CSS angles run clockwise from "to top"; Flutter runs its gradient line between
/// two Alignments in a unit box. Scaling the unit direction by |sin| + |cos| is
/// what lands the endpoints on the box corners for the diagonals, which is the
/// behaviour index.css asks for (135deg -> topLeft to bottomRight).
/// The §2.2 tokens and a §6 probe gradient are the same CSS string, so they
/// share one derivation.
_GradientExpectation _gradient(Map<String, dynamic> root, String name) =>
    _gradientValue(_substituted(root, name));

_GradientExpectation _gradientValue(String value) {
  final RegExpMatch? angle = RegExp(r'^linear-gradient\(\s*(-?[\d.]+)deg\b')
      .firstMatch(value);
  if (angle == null) {
    throw StateError('Not a deg-angled linear-gradient: $value');
  }
  final List<String> args = _splitTopLevel(
    value.substring(value.indexOf('(') + 1, value.lastIndexOf(')')),
  );
  final List<Color> colors = <Color>[];
  final List<double> stops = <double>[];
  for (final String arg in args.skip(1)) {
    colors.add(_parseRgba(arg));
    final RegExpMatch? percent = RegExp(r'(-?[\d.]+)%\s*$').firstMatch(arg);
    if (percent != null) stops.add(num.parse(percent.group(1)!) / 100.0);
  }
  final double radians =
      num.parse(angle.group(1)!).toDouble() * math.pi / 180.0;
  final double dx = math.sin(radians);
  final double dy = -math.cos(radians);
  final double scale = dx.abs() + dy.abs();
  return _GradientExpectation(
    Alignment(-dx * scale, -dy * scale),
    Alignment(dx * scale, dy * scale),
    colors,
    stops.length == colors.length ? stops : null,
  );
}

/// One §6 probe row: the detached element that carried this CSS class.
Map<String, dynamic> _probe(
  Map<String, dynamic> probes,
  String selector,
  String pass,
) {
  final Object? measured = probes[selector];
  if (measured == null) {
    throw StateError('No $pass probe $selector in the measurement');
  }
  return measured as Map<String, dynamic>;
}

/// A probe colour field, read from the same `srgb` block UI_SPEC 1.1 documents.
Color _probeColour(Map<String, dynamic> probe, String field, String cls) {
  final Map<String, dynamic> value = probe[field]! as Map<String, dynamic>;
  final Map<String, dynamic> srgb = value['srgb']! as Map<String, dynamic>;
  return Color.fromRGBO(
    (srgb['r']! as num).round(),
    (srgb['g']! as num).round(),
    (srgb['b']! as num).round(),
    (srgb['alpha']! as num).toDouble(),
  );
}

String _probeValue(Map<String, dynamic> probe, String field, String cls) {
  final Object? value = probe[field];
  if (value == null) throw StateError('$cls: no measured $field');
  if (value is String) return value;
  final Map<String, dynamic> object = value as Map<String, dynamic>;
  return (object['substituted'] ?? object['raw'])! as String;
}

/// A §6 probe `box-shadow` is Chrome's COMPUTED value: colour first, and all
/// four lengths even when the spread is zero. The authored §2.2 tokens are the
/// opposite order, so this is a second reader by design, not a retry of the
/// first with a looser pattern.
List<BoxShadow> _probeShadowLayers(Map<String, dynamic> probe, String cls) {
  final String raw = _probeValue(probe, 'boxShadow', cls);
  if (raw == 'none') return const <BoxShadow>[];
  final List<BoxShadow> out = <BoxShadow>[];
  for (final String layer in _splitTopLevel(raw)) {
    final RegExpMatch? m = RegExp(
      r'^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)'
      r'\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px$',
    ).firstMatch(layer);
    if (m == null) {
      throw StateError('$cls: not "rgba(…) x y blur spread": $layer');
    }
    out.add(
      BoxShadow(
        color: Color.fromRGBO(
          int.parse(m.group(1)!),
          int.parse(m.group(2)!),
          int.parse(m.group(3)!),
          double.parse(m.group(4)!),
        ),
        offset: Offset(double.parse(m.group(5)!), double.parse(m.group(6)!)),
        blurRadius: double.parse(m.group(7)!),
        spreadRadius: double.parse(m.group(8)!),
      ),
    );
  }
  return out;
}

/// `backdrop-filter` as measured. Flutter expresses the blur as a sigma of
/// px / 2; CSS saturate() has no Flutter equivalent and stays unimplemented.
class _BackdropExpectation {
  const _BackdropExpectation(this.blurPx, this.saturate);

  final double? blurPx;
  final double? saturate;

  static _BackdropExpectation measure(Map<String, dynamic> probe, String cls) {
    final String raw = _probeValue(probe, 'backdropFilter', cls);
    if (raw == 'none') return const _BackdropExpectation(null, null);
    final RegExpMatch? blur = RegExp(r'blur\(([\d.]+)px\)').firstMatch(raw);
    final RegExpMatch? sat = RegExp(r'saturate\(([\d.]+)\)').firstMatch(raw);
    if (blur == null || sat == null) {
      throw StateError('$cls: unportable backdrop-filter $raw');
    }
    return _BackdropExpectation(
      double.parse(blur.group(1)!),
      double.parse(sat.group(1)!),
    );
  }
}

/// Every field of one generated surface row against its probe. Nothing here is
/// compared to another generated row: each assertion re-derives the value from
/// the measurement string, which is the only way a generator edit that moves a
/// number can be caught.
void _expectSurface(
  Map<String, dynamic> probes,
  String pass,
  String cls,
  AppSurfaceSpec spec,
) {
  final Map<String, dynamic> probe = _probe(probes, cls, pass);
  expect(spec.cssClass, cls, reason: '$pass $cls class name');
  expect(
    spec.radiusPx,
    _lengthToPx(probe['borderRadius']! as String),
    reason: '$pass $cls radius',
  );
  expect(
    spec.borderWidthPx,
    _lengthToPx(probe['borderTopWidth']! as String),
    reason: '$pass $cls border width',
  );
  expect(
    spec.borderColor,
    _probeColour(probe, 'borderTopColor', cls),
    reason: '$pass $cls border colour',
  );
  expect(
    spec.fillColor,
    _probeColour(probe, 'backgroundColor', cls),
    reason: '$pass $cls fill',
  );
  expect(
    spec.textColor,
    _probeColour(probe, 'color', cls),
    reason: '$pass $cls text colour',
  );
  expect(
    spec.paddingPx,
    _lengthToPx(probe['padding']! as String),
    reason: '$pass $cls padding',
  );

  final String image = _probeValue(probe, 'backgroundImage', cls);
  if (image == 'none') {
    expect(spec.fillGradient, isNull, reason: '$pass $cls paints no gradient');
  } else {
    final _GradientExpectation gradient = _gradientValue(image);
    final LinearGradient painted = spec.fillGradient!;
    // Gradient.begin is an AlignmentGeometry; the measurement always lands on a
    // concrete Alignment, which is what the §2.2 group already assumes.
    final Alignment begin = painted.begin as Alignment;
    final Alignment end = painted.end as Alignment;
    expect(
      begin.x,
      closeTo(gradient.begin.x, 1e-9),
      reason: '$pass $cls begin.x',
    );
    expect(
      begin.y,
      closeTo(gradient.begin.y, 1e-9),
      reason: '$pass $cls begin.y',
    );
    expect(end.x, closeTo(gradient.end.x, 1e-9), reason: '$pass $cls end.x');
    expect(end.y, closeTo(gradient.end.y, 1e-9), reason: '$pass $cls end.y');
    expect(
      painted.colors,
      gradient.colors,
      reason: '$pass $cls gradient stops',
    );
    expect(painted.stops, gradient.stops, reason: '$pass $cls stop positions');
  }

  final List<BoxShadow> layers = _probeShadowLayers(probe, cls);
  if (layers.isEmpty) {
    expect(spec.shadows, isNull, reason: '$pass $cls shadows: none measured');
  } else {
    expect(spec.boxShadowList, layers, reason: '$pass $cls box-shadow');
  }

  final _BackdropExpectation backdrop = _BackdropExpectation.measure(
    probe,
    cls,
  );
  expect(spec.blurPx, backdrop.blurPx, reason: '$pass $cls backdrop blur');
  expect(
    spec.saturate,
    backdrop.saturate,
    reason: '$pass $cls backdrop saturate',
  );
  if (backdrop.blurPx != null) {
    expect(
      spec.blurSigma,
      backdrop.blurPx! / 2,
      reason: '$pass $cls sigma is the CSS blur halved',
    );
  }
}

void main() {
  final Map<String, dynamic> measurement =
      jsonDecode(webSource('parity/ui-tokens.json'))! as Map<String, dynamic>;
  final Map<String, dynamic> light = _rootOf(
    _theme(measurement, 'light-desktop'),
  );
  final Map<String, dynamic> dark = _rootOf(
    _theme(measurement, 'dark-desktop'),
  );
  final Map<String, dynamic> lightProbes = _probesOf(
    _theme(measurement, 'light-desktop'),
  );
  final Map<String, dynamic> darkProbes = _probesOf(
    _theme(measurement, 'dark-desktop'),
  );
  final Map<String, dynamic> lightPhoneProbes = _probesOf(
    _theme(measurement, 'light-phone'),
  );
  final Map<String, dynamic> darkPhoneProbes = _probesOf(
    _theme(measurement, 'dark-phone'),
  );

  final List<String> lightColours = _colourTokens(light);
  final List<String> darkColours = _colourTokens(dark);
  final List<String> gradientTokens = _tokensMatching(
    light,
    (String name) => _raw(light, name).startsWith('linear-gradient'),
  );
  final List<String> shadowTokens = _tokensMatching(
    light,
    (String name) => name.startsWith('--shadow'),
  );

  test('the measurement is the one UI_SPEC was curated from', () {
    expect(lightColours.length, 90, reason: 'UI_SPEC 2.1 colour token count');
    expect(
      gradientTokens.length + shadowTokens.length,
      20,
      reason: 'UI_SPEC 2.2 gradient + shadow token count',
    );
  });

  group('UI_SPEC 2.1 colours', () {
    test('both passes carry exactly the non-Tailwind colour tokens', () {
      expect(AppColors.lightByToken.keys.toList()..sort(), lightColours);
      expect(AppColors.darkByToken.keys.toList()..sort(), darkColours);
    });

    test('every light value is the measured sRGB of light-desktop', () {
      for (final String token in lightColours) {
        expect(
          AppColors.lightByToken[token],
          _measuredColour(light, token),
          reason: token,
        );
      }
    });

    test('every dark value is the measured sRGB of dark-desktop', () {
      for (final String token in darkColours) {
        expect(
          AppColors.darkByToken[token],
          _measuredColour(dark, token),
          reason: token,
        );
      }
    });

    test('a token whose two passes measured equal is ported equal', () {
      int equal = 0;
      for (final String token in lightColours) {
        final bool measuredEqual =
            _measuredColour(light, token) == _measuredColour(dark, token);
        if (measuredEqual) equal++;
        expect(
          AppColors.lightByToken[token] == AppColors.darkByToken[token],
          measuredEqual,
          reason: '$token does not preserve its light/dark equality',
        );
      }
      expect(equal, greaterThan(0));
    });
  });

  group('UI_SPEC 2.2 gradients and shadows', () {
    test('the gradient key set is the measured linear-gradients', () {
      expect(gradientTokens.length, 17);
      expect(AppColors.gradientsLight.keys.toList()..sort(), gradientTokens);
      expect(AppColors.gradientsDark.keys.toList()..sort(), gradientTokens);
    });

    test('each gradient is the measured angle, stops and colours', () {
      final Map<String, Map<String, LinearGradient>> maps =
          <String, Map<String, LinearGradient>>{
            'light': AppColors.gradientsLight,
            'dark': AppColors.gradientsDark,
          };
      final Map<String, Map<String, dynamic>> roots =
          <String, Map<String, dynamic>>{'light': light, 'dark': dark};
      for (final MapEntry<String, Map<String, LinearGradient>> passEntry
          in maps.entries) {
        final String pass = passEntry.key;
        final Map<String, LinearGradient> map = passEntry.value;
        for (final String token in gradientTokens) {
          final _GradientExpectation want = _gradient(roots[pass]!, token);
          final LinearGradient got = map[token]!;
          final String why = '$token ($pass pass)';
          expect(got.colors, want.colors, reason: why);
          expect(got.stops, want.stops, reason: why);
          final Alignment begin = got.begin as Alignment;
          final Alignment end = got.end as Alignment;
          expect(begin.x, closeTo(want.begin.x, 1e-9), reason: why);
          expect(begin.y, closeTo(want.begin.y, 1e-9), reason: why);
          expect(end.x, closeTo(want.end.x, 1e-9), reason: why);
          expect(end.y, closeTo(want.end.y, 1e-9), reason: why);
          expect(got.tileMode, TileMode.clamp, reason: why);
        }
      }
    });

    test('the shadow key set is the measured --shadow tokens', () {
      expect(shadowTokens.length, 3);
      expect(AppShadows.shadowsLight.keys.toList()..sort(), shadowTokens);
      expect(AppShadows.shadowsDark.keys.toList()..sort(), shadowTokens);
    });

    test('each shadow is the measured layer list', () {
      for (final String token in shadowTokens) {
        expect(
          AppShadows.shadowsLight[token],
          _boxShadows(light, token),
          reason: '$token light layers',
        );
        expect(
          AppShadows.shadowsDark[token],
          _boxShadows(dark, token),
          reason: '$token dark layers',
        );
      }
    });
  });

  group('UI_SPEC 2.3 geometry tokens', () {
    final List<String> radiiTokens = _tokensMatching(
      light,
      (String name) => name.startsWith('--r-') || name.startsWith('--radius-'),
    );
    final List<String> containerTokens = _tokensMatching(
      light,
      (String name) => name.startsWith('--container-'),
    );
    final List<String> blurTokens = _tokensMatching(
      light,
      (String name) => name.startsWith('--blur-'),
    );

    test('radii are the nine measured corner radii in px', () {
      expect(radiiTokens.length, 9);
      expect(AppRadii.byToken.keys.toList()..sort(), radiiTokens);
      for (final String token in radiiTokens) {
        expect(
          AppRadii.byToken[token],
          _lengthToPx(_raw(light, token)),
          reason: token,
        );
      }
    });

    test('containers are the seven measured breakpoints in px', () {
      expect(containerTokens.length, 7);
      expect(
        AppSpacing.containersByToken.keys.toList()..sort(),
        containerTokens,
      );
      for (final String token in containerTokens) {
        expect(
          AppSpacing.containersByToken[token],
          _lengthToPx(_raw(light, token)),
          reason: token,
        );
      }
    });

    test('blurs are the five measured blur radii in px', () {
      expect(blurTokens.length, 5);
      expect(AppTokens.blursByToken.keys.toList()..sort(), blurTokens);
      for (final String token in blurTokens) {
        expect(
          AppTokens.blursByToken[token],
          _lengthToPx(_raw(light, token)),
          reason: token,
        );
      }
    });

    test('the spacing base is --spacing', () {
      expect(AppSpacing.spacingByToken.keys.toList()..sort(), <String>[
        '--spacing',
      ]);
      expect(AppSpacing.spacing, _lengthToPx(_raw(light, '--spacing')));
      expect(AppSpacing.spacingByToken['--spacing'], AppSpacing.spacing);
    });
  });

  group('UI_SPEC 3 type scale', () {
    final List<String> sizeTokens = _tokensMatching(
      light,
      (String name) =>
          name.startsWith('--text-') && !name.contains('--line-height'),
    );
    final List<String> lineHeightTokens = _tokensMatching(
      light,
      (String name) => name.contains('--line-height'),
    );

    test('sizes are the eleven measured font sizes in px', () {
      expect(sizeTokens.length, 11);
      expect(AppTypography.sizesByToken.keys.toList()..sort(), sizeTokens);
      for (final String token in sizeTokens) {
        expect(
          AppTypography.sizesByToken[token],
          _lengthToPx(_raw(light, token)),
          reason: token,
        );
      }
    });

    test(
      'line-heights are seven authored ratios plus the two probe classes',
      () {
        expect(lineHeightTokens.length, 7);
        final Map<String, double> want = <String, double>{
          for (final String token in lineHeightTokens)
            token: _ratio(_raw(light, token)),
          '--text-display': _probeRatio(lightProbes, '.money-display'),
          '--text-num': _probeRatio(lightProbes, '.numeral'),
        };
        expect(
          AppTypography.lineHeightsByToken.keys.toList()..sort(),
          want.keys.toList()..sort(),
        );
        for (final MapEntry<String, double> entry in want.entries) {
          expect(
            AppTypography.lineHeightsByToken[entry.key],
            closeTo(entry.value, 1e-9),
            reason: entry.key,
          );
        }
      },
    );

    test('weights match the six measured --font-weight tokens', () {
      final List<String> weightTokens = _tokensMatching(
        light,
        (String name) => name.startsWith('--font-weight-'),
      );
      expect(weightTokens.length, 6);
      final Map<String, FontWeight> ported = <String, FontWeight>{
        '--font-weight-normal': AppTypography.fontWeightNormal,
        '--font-weight-medium': AppTypography.fontWeightMedium,
        '--font-weight-semibold': AppTypography.fontWeightSemibold,
        '--font-weight-bold': AppTypography.fontWeightBold,
        '--font-weight-extrabold': AppTypography.fontWeightExtrabold,
        '--font-weight-black': AppTypography.fontWeightBlack,
      };
      expect(ported.keys.toList()..sort(), weightTokens);
      for (final String token in weightTokens) {
        expect(
          ported[token]!.value,
          num.parse(_raw(light, token)).round(),
          reason: token,
        );
      }
    });

    test('leading and tracking match the measured multipliers', () {
      final Map<String, double> ported = <String, double>{
        '--leading-normal': AppTypography.leadingNormal,
        '--leading-relaxed': AppTypography.leadingRelaxed,
        '--leading-tight': AppTypography.leadingTight,
        '--tracking-normal': AppTypography.trackingNormalEm,
        '--tracking-tight': AppTypography.trackingTightEm,
        '--tracking-wide': AppTypography.trackingWideEm,
        '--tracking-wider': AppTypography.trackingWiderEm,
        '--tracking-widest': AppTypography.trackingWidestEm,
      };
      for (final MapEntry<String, double> entry in ported.entries) {
        final String raw = _raw(light, entry.key).trim();
        final double want = double.parse(
          raw.endsWith('em') ? raw.substring(0, raw.length - 2) : raw,
        );
        expect(entry.value, closeTo(want, 1e-9), reason: entry.key);
      }
    });
  });

  group('UI_SPEC 4 motion', () {
    final List<String> durationTokens = _tokensMatching(
      light,
      (String name) =>
          name == '--default-transition-duration' || name.startsWith('--dur'),
    );
    final List<String> curveTokens = _tokensMatching(
      light,
      (String name) =>
          name == '--default-transition-timing-function' ||
          name.startsWith('--ease-'),
    );

    test('durations and curves are the measured token sets', () {
      expect(durationTokens.length, 4);
      expect(curveTokens.length, 5);
      expect(AppTokens.durationsByToken.keys.toList()..sort(), durationTokens);
      expect(AppTokens.curvesByToken.keys.toList()..sort(), curveTokens);
      for (final String token in durationTokens) {
        expect(
          AppTokens.durationsByToken[token],
          _duration(_raw(light, token)),
          reason: token,
        );
      }
      for (final String token in curveTokens) {
        final Cubic got = AppTokens.curvesByToken[token]! as Cubic;
        final Cubic wantCurve = _cubic(_raw(light, token));
        expect(got.a, closeTo(wantCurve.a, 1e-9), reason: token);
        expect(got.b, closeTo(wantCurve.b, 1e-9), reason: token);
        expect(got.c, closeTo(wantCurve.c, 1e-9), reason: token);
        expect(got.d, closeTo(wantCurve.d, 1e-9), reason: token);
      }
    });

    test('the two animation shorthands are kept verbatim for provenance', () {
      expect(AppTokens.animatePulse, _raw(light, '--animate-pulse'));
      expect(AppTokens.animateSpin, _raw(light, '--animate-spin'));
    });
  });

  group('ThemeExtension wiring', () {
    test('AppTokens.light and .dark expose exactly the generated maps', () {
      const AppTokens lightTokens = AppTokens.light;
      const AppTokens darkTokens = AppTokens.dark;
      expect(lightTokens.radii, AppRadii.byToken);
      expect(darkTokens.radii, AppRadii.byToken);
      expect(lightTokens.blurs, AppTokens.blursByToken);
      expect(lightTokens.durations, AppTokens.durationsByToken);
      expect(lightTokens.curves, AppTokens.curvesByToken);
      expect(lightTokens.containers, AppSpacing.containersByToken);
      expect(lightTokens.spacingUnit, AppSpacing.spacing);
      expect(lightTokens.gradients, AppColors.gradientsLight);
      expect(darkTokens.gradients, AppColors.gradientsDark);
      expect(lightTokens.shadows, AppShadows.shadowsLight);
      expect(darkTokens.shadows, AppShadows.shadowsDark);
    });

    test('the display line-height does not depend on the colour pass', () {
      expect(
        _probeRatio(darkProbes, '.money-display'),
        closeTo(_probeRatio(lightProbes, '.money-display'), 1e-9),
      );
    });
  });

  group('UI_SPEC 6 card surfaces', () {
    /// The classes `AppCard` can be. `.card-sm` is absent on purpose: it is
    /// written nowhere under `src/` and measures as no paint at all.
    const List<String> surfaceClasses = <String>[
      '.card',
      '.card-flat',
      '.card-lg',
      '.card-dark',
      '.gradient-card',
      '.glass-panel',
      '.glass-pill',
      '.card-face',
    ];

    test('AppSurfaces holds exactly the measured card classes, per pass', () {
      final List<String> expected = surfaceClasses.toList()..sort();
      expect(AppSurfaces.light.keys.toList()..sort(), expected);
      expect(AppSurfaces.dark.keys.toList()..sort(), expected);
    });

    for (final String cls in surfaceClasses) {
      test('$cls light row is the light-desktop probe', () {
        _expectSurface(
          lightProbes,
          'light',
          cls,
          AppSurfaces.resolve(cls, Brightness.light),
        );
      });

      test('$cls dark row is the dark-desktop probe', () {
        _expectSurface(
          darkProbes,
          'dark',
          cls,
          AppSurfaces.resolve(cls, Brightness.dark),
        );
      });
    }

    test('no card box moves between the desktop and phone passes', () {
      for (final String cls in surfaceClasses) {
        for (final MapEntry<String, Map<String, dynamic>> pass
            in <String, Map<String, dynamic>>{
              'light': lightPhoneProbes,
              'dark': darkPhoneProbes,
            }.entries) {
          final Map<String, dynamic> probe = _probe(
            pass.value,
            cls,
            '${pass.key}-phone',
          );
          expect(
            AppSurfaces.resolve(
              cls,
              pass.key == 'dark' ? Brightness.dark : Brightness.light,
            ).radiusPx,
            _lengthToPx(probe['borderRadius']! as String),
            reason: '${pass.key}-phone $cls radius',
          );
        }
      }
    });

    test('resolve() refuses a class the measurement does not carry', () {
      expect(
        () => AppSurfaces.resolve('.no-such-class', Brightness.light),
        throwsArgumentError,
      );
    });

    // The §6 classes are authored from the §2 tokens; the probe proves it and
    // this pins it, so a token edit cannot silently leave a card behind.
    test('the card paint is the tokens it was authored from', () {
      final AppSurfaceSpec card = AppSurfaces.resolve(
        '.card',
        Brightness.light,
      );
      expect(
        card.fillColor,
        AppColors.lightByToken['--surface'],
        reason: '.card background: var(--surface)',
      );
      expect(
        card.borderColor,
        AppColors.lightByToken['--line'],
        reason: '.card border: var(--line)',
      );
      expect(
        card.boxShadowList,
        AppShadows.shadowsLight['--shadow'],
        reason: '.card box-shadow: var(--shadow)',
      );
      expect(
        card.radiusPx,
        AppRadii.byToken['--r-md'],
        reason: '.card border-radius: var(--r-md)',
      );

      final AppSurfaceSpec cardDarkMode = AppSurfaces.resolve(
        '.card',
        Brightness.dark,
      );
      expect(cardDarkMode.fillColor, AppColors.darkByToken['--surface']);
      expect(cardDarkMode.borderColor, AppColors.darkByToken['--line']);
      expect(cardDarkMode.boxShadowList, AppShadows.shadowsDark['--shadow']);

      final AppSurfaceSpec flat = AppSurfaces.resolve(
        '.card-flat',
        Brightness.light,
      );
      expect(
        flat.fillColor,
        AppColors.lightByToken['--surface-2'],
        reason: '.card-flat background: var(--surface-2)',
      );
      expect(
        flat.radiusPx,
        AppRadii.byToken['--r-sm'],
        reason: '.card-flat border-radius: var(--r-sm)',
      );
      expect(
        flat.borderWidthPx,
        1.0,
        reason: 'the transparent frame is still 1px',
      );
      expect(
        flat.borderColor,
        const Color(0x00000000),
        reason: 'UI_SPEC prints a transparent border, not an absent one',
      );
      expect(flat.shadows, isNull, reason: '.card-flat has no box-shadow');

      expect(
        AppSurfaces.resolve('.card-lg', Brightness.light).radiusPx,
        AppRadii.byToken['--r-lg'],
        reason: '.card-lg border-radius: var(--r-lg)',
      );
      expect(
        AppSurfaces.resolve('.card-face', Brightness.light).boxShadowList,
        AppShadows.shadowsLight['--shadow-float'],
        reason: '.card-face box-shadow: var(--shadow-float)',
      );
    });

    test('the glass fills are their surface token at the measured 62%', () {
      for (final MapEntry<String, String> entry in <String, String>{
        '.glass-panel': '--surface',
        '.glass-pill': '--surface-2',
      }.entries) {
        final Map<String, dynamic> srgb =
            _token(light, entry.value)['srgb']! as Map<String, dynamic>;
        final Color expected = Color.fromRGBO(
          (srgb['r']! as num).round(),
          (srgb['g']! as num).round(),
          (srgb['b']! as num).round(),
          0.62,
        );
        expect(
          AppSurfaces.resolve(entry.key, Brightness.light).fillColor,
          expected,
          reason:
              '${entry.key} is color-mix(in srgb, ${entry.value} 62%, transparent)',
        );
      }
    });

    test('the gradient cards carry the §2.2 gradient they were forced to', () {
      final LinearGradient light = AppSurfaces.resolve(
        '.card-dark',
        Brightness.light,
      ).fillGradient!;
      expect(
        light.colors,
        AppColors.gradientsLight['--gradient-card-light']!.colors,
      );
      final LinearGradient dark = AppSurfaces.resolve(
        '.card-dark',
        Brightness.dark,
      ).fillGradient!;
      expect(
        dark.colors,
        AppColors.gradientsDark['--gradient-card-dark']!.colors,
      );
      // §6.3: the !important repaint forces the light gradient only, so the dark
      // pass of .gradient-card measures as nothing. Ported as measured.
      expect(
        AppSurfaces.resolve('.gradient-card', Brightness.dark).paintsFill,
        isFalse,
        reason: '.gradient-card paints no fill in the dark pass',
      );
      expect(
        AppSurfaces.resolve('.gradient-card', Brightness.light).fillGradient,
        isNotNull,
      );
    });

    test('a 0px measured border width never becomes a painted border', () {
      for (final String cls in <String>['.card-lg', '.card-face']) {
        for (final Brightness brightness in Brightness.values) {
          final AppSurfaceSpec spec = AppSurfaces.resolve(cls, brightness);
          expect(spec.borderWidthPx, 0.0, reason: '$cls declares no border');
          expect(
            spec.border.top.width,
            0.0,
            reason: 'and so draws none, whatever colour was inherited',
          );
        }
      }
    });

    test(
      'classes that force their own text colour are the ones that paint it',
      () {
        final Map<Brightness, Set<String>> forcing =
            <Brightness, Set<String>>{};
        for (final Brightness brightness in Brightness.values) {
          final Map<String, Color> tokens = brightness == Brightness.light
              ? AppColors.lightByToken
              : AppColors.darkByToken;
          final Color? ink = tokens['--ink'];
          final Set<String> set = <String>{};
          for (final String cls in surfaceClasses) {
            if (AppSurfaces.resolve(cls, brightness).textColor != ink) {
              set.add(cls);
            }
          }
          forcing[brightness] = set;
        }
        expect(
          forcing[Brightness.light],
          <String>{'.card-face'},
          reason:
              'the light pass forces var(--ink) on .gradient-card and .card-dark, '
              'which is what they inherit anyway; only .card-face stays white',
        );
        expect(
          forcing[Brightness.dark],
          <String>{'.card-face', '.card-dark', '.gradient-card'},
          reason:
              'in dark those three are the classes that paint white over ink',
        );
      },
    );
  });

  group('the no-hard-coded-style rule (playbook 2.4)', () {
    test('nothing outside lib/core/theme/ spells out a colour literal', () {
      final Directory lib = Directory(
        '${repoRoot()}${Platform.pathSeparator}mobile'
        '${Platform.pathSeparator}lib',
      );
      final List<String> offenders = <String>[];
      for (final FileSystemEntity entity in lib.listSync(recursive: true)) {
        if (entity is! File || !entity.path.endsWith('.dart')) continue;
        final String path = entity.path.replaceAll('\\', '/');
        if (path.contains('/lib/core/theme/')) continue;
        final RegExp literal = RegExp(
          r'Color\s*\(\s*0x|Color\.fromRGBO|Color\.fromARGB',
        );
        if (literal.hasMatch(entity.readAsStringSync())) {
          offenders.add(path.substring(path.indexOf('/mobile/')));
        }
      }
      expect(
        offenders,
        isEmpty,
        reason: 'colour literals belong in the generated theme folder',
      );
    });
  });
}
