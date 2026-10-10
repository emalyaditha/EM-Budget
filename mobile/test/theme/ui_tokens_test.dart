// Parity gate for the generated theme layer (Phase 5, playbook 2.4 step 4).
//
// parity/generate_theme.cjs projects parity/ui-tokens.json — the Chrome-computed
// measurement of src/index.css at tag pre-flutter — onto mobile/lib/core/theme/.
// Re-deriving that projection from the JSON here is the only check that a
// generator edit cannot silently move a value: the JSON is the contract, the Dart
// files are a projection of it, and UI_SPEC 5 is deliberately not used because
// its machine "Dart" column mis-parses --blur-* / --container-* names as radii.
//
// Every expectation below is parsed out of the JSON, or out of src/index.css for
// the two states a probe cannot see (the file is byte-identical to the tag the
// measurement was taken at), never copied from the generated output, so the two
// can only agree by both being right.

import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:em_budget/core/theme/app_controls.dart';
import 'package:em_budget/core/theme/app_colors.dart';
import 'package:em_budget/core/theme/app_fields.dart';
import 'package:em_budget/core/theme/app_icon_buttons.dart';
import 'package:em_budget/core/theme/app_radii.dart';
import 'package:em_budget/core/theme/app_shadows.dart';
import 'package:em_budget/core/theme/app_skeletons.dart';
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

/// A `px` length as the number the row carries.
double _pxOf(String value, String label) {
  final RegExpMatch? m = RegExp(r'^(-?[\d.]+)px$').firstMatch(value);
  if (m == null) throw StateError('$label: "$value" is not a px length');
  return double.parse(m.group(1)!);
}

/// Declarations of the CSS rule that starts at `headLine`. `src/index.css` is
/// byte-identical to the tag the probe measurement was taken at (measured:
/// `git diff --stat pre-flutter HEAD -- src/index.css` prints nothing), so this
/// is the same pinned source, read for the states a probe cannot see.
Map<String, String> _cssDecls(List<String> lines, String headLine, String cls) {
  final int start = lines.indexOf(headLine);
  if (start < 0) {
    throw StateError('$cls: no rule head "$headLine" in src/index.css');
  }
  final Map<String, String> decls = <String, String>{};
  for (int j = start + 1; j < lines.length; j++) {
    for (final String part in lines[j].split(';')) {
      final int colon = part.indexOf(':');
      if (colon < 0) {
        continue;
      }
      decls[part.substring(0, colon).trim()] = part.substring(colon + 1).trim();
    }
    if (lines[j].contains('}')) return decls;
  }
  throw StateError('$cls: rule at "$headLine" never closes');
}

/// The text of a rule, joined. [_cssDecls] splits line by line on `;`, so a
/// shorthand authored one item per line arrives from it as an empty value: the
/// `transition` of every §6 control is written that way.
String _cssRuleText(List<String> lines, String headLine, String cls) {
  final int start = lines.indexOf(headLine);
  if (start < 0) {
    throw StateError('$cls: no rule head "$headLine" in src/index.css');
  }
  final List<String> body = <String>[];
  for (int j = start; j < lines.length; j++) {
    body.add(lines[j]);
    if (lines[j].contains('}')) return body.join(' ');
  }
  throw StateError('$cls: rule at "$headLine" never closes');
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

  final List<String> cssLines = webSource('src/index.css')
      .split(RegExp(r'\r?\n'));

  group('UI_SPEC 6 controls', () {
    /// The classes `AppButton` can be. `.icon-btn` is absent on purpose: it is a
    /// sized (38x38, and 34x34 inside `.glass-pill`) icon target whose paint comes
    /// from `width`/`height` the probe does not measure, so it is its own increment.
    const List<String> controlClasses = <String>['.btn-primary', '.btn-ghost'];

    test(
      'AppControls holds exactly the measured control classes, per pass',
      () {
        final List<String> expected = controlClasses.toList()..sort();
        expect(AppControls.light.keys.toList()..sort(), expected);
        expect(AppControls.dark.keys.toList()..sort(), expected);
      },
    );

    for (final String cls in controlClasses) {
      for (final Brightness brightness in Brightness.values) {
        final String pass = brightness == Brightness.light
            ? 'light-desktop'
            : 'dark-desktop';
        test('$cls $pass matches its probe row', () {
          final Map<String, dynamic> p = _probe(
            brightness == Brightness.light ? lightProbes : darkProbes,
            cls,
            pass,
          );
          final AppControlSpec spec = AppControls.resolve(cls, brightness);
          expect(spec.cssClass, cls);
          expect(spec.displayCss, _probeValue(p, 'display', cls));
          expect(
            spec.radiusPx,
            _pxOf(_probeValue(p, 'borderRadius', cls), '$cls radius'),
          );
          expect(
            spec.borderWidthPx,
            _pxOf(_probeValue(p, 'borderTopWidth', cls), '$cls border width'),
          );
          expect(spec.borderColor, _probeColour(p, 'borderTopColor', cls));
          expect(spec.fillColor, _probeColour(p, 'backgroundColor', cls));
          expect(spec.textColor, _probeColour(p, 'color', cls));
          expect(
            spec.fontFamily,
            _probeValue(
              p,
              'fontFamily',
              cls,
            ).split(',').first.replaceAll(RegExp("[\"']"), '').trim(),
            reason:
                'Flutter takes one family name where CSS takes a fallback stack, '
                'so the port keeps the first family — the rule app_typography.dart '
                'was generated with. These classes author --font-display, so a label '
                'that inherits the theme body font is not the measured control.',
          );
          expect(
            spec.fontSizePx,
            _pxOf(_probeValue(p, 'fontSize', cls), '$cls font-size'),
          );
          expect(spec.fontWeight, int.parse(_probeValue(p, 'fontWeight', cls)));
          expect(
            spec.lineHeightPx,
            _pxOf(_probeValue(p, 'lineHeight', cls), '$cls line-height'),
          );
          final String spacing = _probeValue(p, 'letterSpacing', cls);
          expect(
            spec.letterSpacingPx,
            spacing == 'normal' ? 0.0 : _pxOf(spacing, '$cls letter-spacing'),
            reason: 'CSS prints `normal` where the used value is zero',
          );
          final List<double> pad = _probeValue(p, 'padding', cls)
              .split(RegExp(r'\s+'))
              .map((String s) => _pxOf(s, '$cls padding'))
              .toList();
          expect(spec.paddingVerticalPx, pad.first);
          expect(spec.paddingHorizontalPx, pad[1]);
          expect(
            _probeValue(p, 'boxShadow', cls),
            'none',
            reason: 'AppControlSpec carries no shadow field, so a shadowed control must not silently lose it',
          );
        });
      }

      test('$cls keeps its box and padding on the phone', () {
        for (final String pass in <String>['light-phone', 'dark-phone']) {
          final Map<String, dynamic> p = _probe(
            pass.startsWith('light') ? lightPhoneProbes : darkPhoneProbes,
            cls,
            pass,
          );
          final Brightness brightness = pass.startsWith('light')
              ? Brightness.light
              : Brightness.dark;
          final AppControlSpec spec = AppControls.resolve(cls, brightness);
          expect(
            spec.radiusPx,
            _pxOf(_probeValue(p, 'borderRadius', cls), '$cls radius'),
            reason: '$pass must not move the box',
          );
          expect(
            _probeValue(p, 'padding', cls),
            _probeValue(
              _probe(lightProbes, cls, 'light-desktop'),
              'padding',
              cls,
            ),
            reason: '$pass pads it the same way',
          );
        }
      });

      test('$cls carries the same row on the phone as on the desktop', () {
        const List<String> fields = <String>[
          'display',
          'fontFamily',
          'fontSize',
          'fontWeight',
          'lineHeight',
          'letterSpacing',
          'padding',
          'borderRadius',
          'borderTopWidth',
          'borderTopColor',
          'backgroundColor',
          'color',
          'boxShadow',
        ];
        final Map<String, List<Map<String, dynamic>>> pairs =
            <String, List<Map<String, dynamic>>>{
              'light-phone': <Map<String, dynamic>>[
                lightPhoneProbes,
                lightProbes,
              ],
              'dark-phone': <Map<String, dynamic>>[darkPhoneProbes, darkProbes],
            };
        for (final MapEntry<String, List<Map<String, dynamic>>> entry
            in pairs.entries) {
          final String phonePass = entry.key;
          final String desktopPass = phonePass.replaceAll('-phone', '-desktop');
          for (final String field in fields) {
            expect(
              _probeValue(_probe(entry.value[0], cls, phonePass), field, cls),
              _probeValue(_probe(entry.value[1], cls, desktopPass), field, cls),
              reason:
                  '$phonePass moves $field for $cls and AppControls ports '
                  'one row per brightness to paint it from',
            );
          }
        }
      });

      test('$cls states come from the authored rule, not from a guess', () {
        final Map<String, String> off = _cssDecls(
          cssLines,
          '$cls:disabled,',
          cls,
        );
        final Map<String, String> act = _cssDecls(
          cssLines,
          '$cls:active {',
          cls,
        );
        // The exact property set, not a subset: a state rule the web widens is a
        // phone that disagrees the moment it is pressed or disabled, and the only
        // way to hear about it is to compare against the whole authored rule.
        expect(off.keys.toList()..sort(), <String>[
          'cursor',
          'opacity',
          'transform',
        ], reason: '$cls :disabled must set exactly what AppButton can port');
        expect(
          act.keys.toSet().difference(<String>{'transform', 'background'}),
          isEmpty,
          reason: '$cls :active sets something AppControlSpec cannot hold',
        );
        final AppControlSpec lightSpec = AppControls.resolve(
          cls,
          Brightness.light,
        );
        final AppControlSpec darkSpec = AppControls.resolve(
          cls,
          Brightness.dark,
        );
        expect(lightSpec.disabledOpacity, double.parse(off['opacity']!));
        expect(
          darkSpec.disabledOpacity,
          lightSpec.disabledOpacity,
          reason:
              'the rule is unlayered, so both passes compute the same opacity',
        );
        expect(
          off['transform'],
          'none',
          reason: 'the disabled rule clears the offset, which is why AppButton must not press while disabled',
        );
        // The parens are part of the CSS function and have to be escaped: the
        // unescaped pattern below parses them as groups and would only match a
        // hypothetical `translateY1px`.
        final RegExpMatch? m = RegExp(r'^translateY\((-?[\d.]+)px\)$')
            .firstMatch(act['transform']!);
        expect(m, isNotNull, reason: '$cls :active must be a plain translateY');
        expect(lightSpec.pressDyPx, double.parse(m!.group(1)!));
        expect(
          darkSpec.pressDyPx,
          lightSpec.pressDyPx,
          reason: 'the offset is not themed',
        );
        final String? bg = act['background'];
        if (bg == null) {
          expect(
            lightSpec.pressFillColor,
            isNull,
            reason:
                '$cls authors no pressed fill; AppButton must not invent one',
          );
          expect(darkSpec.pressFillColor, isNull);
          expect(lightSpec.activeFill, lightSpec.fillColor);
        } else {
          final RegExpMatch? varRef = RegExp(r'^var\((--[a-z0-9-]+)\)$')
              .firstMatch(bg);
          expect(
            varRef,
            isNotNull,
            reason: '$cls :active background "$bg" is not a bare var(--token)',
          );
          final String token = varRef!.group(1)!;
          expect(
            lightSpec.pressFillColor,
            _measuredColour(light, token),
            reason: '$cls pressed fill is $token as the light pass measures it',
          );
          expect(
            darkSpec.pressFillColor,
            _measuredColour(dark, token),
            reason: '$cls pressed fill is $token as the dark pass measures it',
          );
          expect(
            lightSpec.pressFillColor,
            isNot(lightSpec.fillColor),
            reason: 'a pressed fill equal to the resting one is a no-op rule',
          );
        }
        expect(
          darkSpec.activeFill,
          darkSpec.pressFillColor ?? darkSpec.fillColor,
        );
        // How long a state change runs is authored by the class itself, out of two
        // §4 tokens. `AnimatedContainer` drives the whole box on one clock, so the
        // port needs every item of the shorthand to name the same pair, and needs
        // the pair to be the measurement `AppTokens` already holds for those names.
        final RegExpMatch? tRaw = RegExp(r'transition:\s*([^;]+);')
            .firstMatch(_cssRuleText(cssLines, '$cls {', cls));
        expect(
          tRaw,
          isNotNull,
          reason:
              '$cls authors no transition, so AppButton would ease a change the web snaps',
        );
        final List<String> items = tRaw!
            .group(1)!
            .trim()
            .split(',')
            .map((String s) => s.trim())
            .where((String s) => s.isNotEmpty)
            .toList();
        final Set<String> props = <String>{};
        final Set<String> durTokens = <String>{};
        final Set<String> easeTokens = <String>{};
        for (final String item in items) {
          final List<String> parts = item
              .split(RegExp(r'\s+'))
              .where((String s) => s.isNotEmpty)
              .toList();
          expect(
            parts,
            hasLength(3),
            reason: '"$item" is not `property var(--dur) var(--ease)`',
          );
          props.add(parts[0]);
          final RegExpMatch? d = RegExp(r'^var\((--[a-z0-9-]+)\)$')
              .firstMatch(parts[1]);
          final RegExpMatch? e = RegExp(r'^var\((--[a-z0-9-]+)\)$')
              .firstMatch(parts[2]);
          expect(
            d,
            isNotNull,
            reason: '${parts[1]} is not a bare duration token',
          );
          expect(
            e,
            isNotNull,
            reason: '${parts[2]} is not a bare easing token',
          );
          durTokens.add(d!.group(1)!);
          easeTokens.add(e!.group(1)!);
        }
        expect(
          props,
          <String>{'background-color', 'border-color', 'transform'},
          reason:
              'exactly the properties one AnimatedContainer carries: a state '
              'change the web animates and the phone snaps — or the reverse — is a '
              'button that disagrees with the browser in motion',
        );
        expect(durTokens, hasLength(1), reason: 'one box runs one clock');
        expect(easeTokens, hasLength(1), reason: 'one box runs one curve');
        final String durToken = durTokens.single;
        final String easeToken = easeTokens.single;
        expect(
          lightSpec.transitionDuration,
          _duration(_raw(light, durToken)),
          reason: '$cls transitions on $durToken as the light pass measures it',
        );
        expect(
          darkSpec.transitionDuration,
          _duration(_raw(dark, durToken)),
          reason: 'and on the dark pass’s own copy of the same token',
        );
        final Cubic authored = _cubic(_raw(light, easeToken));
        expect(
          <double>[
            lightSpec.easeX1,
            lightSpec.easeY1,
            lightSpec.easeX2,
            lightSpec.easeY2,
          ],
          <double>[authored.a, authored.b, authored.c, authored.d],
          reason: '$cls runs on $easeToken as the light pass measures it',
        );
        expect(
          lightSpec.easeX1,
          darkSpec.easeX1,
          reason: 'the curve is one authored rule, not a per-pass row',
        );
        expect(
          AppTokens.durationsByToken[durToken],
          lightSpec.transitionDuration,
          reason: 'the control row and the §4 token table are one measurement',
        );
        final Cubic tableCurve = AppTokens.curvesByToken[easeToken]! as Cubic;
        expect(
          <double>[tableCurve.a, tableCurve.b, tableCurve.c, tableCurve.d],
          <double>[
            lightSpec.easeX1,
            lightSpec.easeY1,
            lightSpec.easeX2,
            lightSpec.easeY2,
          ],
          reason: 'Cubic has no value equality, so the four numbers are what compare',
        );
      });
    }

    test('the derived getters divide measured numbers, never invent one', () {
      for (final String cls in controlClasses) {
        for (final Brightness brightness in Brightness.values) {
          final AppControlSpec spec = AppControls.resolve(cls, brightness);
          expect(spec.borderRadius, BorderRadius.circular(spec.radiusPx));
          expect(
            spec.padding,
            EdgeInsets.symmetric(
              vertical: spec.paddingVerticalPx,
              horizontal: spec.paddingHorizontalPx,
            ),
          );
          expect(
            spec.weight,
            FontWeight.values[spec.fontWeight ~/ 100 - 1],
            reason: 'the 100-900 step indexes the Dart enum; out of range would throw',
          );
          expect(
            spec.heightRatio,
            spec.lineHeightPx! / spec.fontSizePx,
            reason:
                'Flutter line-height is a multiple, CSS line-height a length',
          );
          expect(
            spec.transitionDuration,
            Duration(milliseconds: spec.transitionMs),
            reason: 'the getter is the measured milliseconds, unchanged',
          );
          expect(
            <double>[
              spec.transitionCurve.a,
              spec.transitionCurve.b,
              spec.transitionCurve.c,
              spec.transitionCurve.d,
            ],
            <double>[spec.easeX1, spec.easeY1, spec.easeX2, spec.easeY2],
            reason: 'the four numbers reach Cubic in the order the function writes them',
          );
        }
      }
    });

    test('an unknown control class is an error, not a Material default', () {
      for (final Brightness brightness in Brightness.values) {
        expect(
          () => AppControls.resolve('.btn-imaginary', brightness),
          throwsArgumentError,
        );
      }
    });
  });

  group('UI_SPEC 6 fields and labels', () {
    /// `AppFormField`'s two classes: the measured box, and the `.eyebrow` label
    /// `src/components/ui/Input.tsx` puts above it. `.input` has no `:active` and
    /// no `:disabled` rule — its interesting state is focus — and the label has no
    /// states at all, which is what the two tests at the end of this group prove.
    const List<String> fieldClasses = <String>['.input'];
    const List<String> labelClasses = <String>['.eyebrow'];

    Map<String, dynamic> probesFor(Brightness brightness) =>
        brightness == Brightness.light ? lightProbes : darkProbes;
    Map<String, dynamic> rootFor(Brightness brightness) =>
        brightness == Brightness.light ? light : dark;

    test(
      'AppFields and AppLabels hold exactly the measured classes, per pass',
      () {
        expect(AppFields.light.keys.toList(), fieldClasses);
        expect(AppFields.dark.keys.toList(), fieldClasses);
        expect(AppLabels.light.keys.toList(), labelClasses);
        expect(AppLabels.dark.keys.toList(), labelClasses);
      },
    );

    for (final String cls in fieldClasses) {
      for (final Brightness brightness in Brightness.values) {
        final String pass = brightness == Brightness.light
            ? 'light-desktop'
            : 'dark-desktop';
        test('$cls $pass matches its probe row', () {
          final Map<String, dynamic> p = _probe(
            probesFor(brightness),
            cls,
            pass,
          );
          final AppFieldSpec spec = AppFields.resolve(cls, brightness);
          expect(spec.cssClass, cls);
          expect(spec.displayCss, _probeValue(p, 'display', cls));
          expect(
            spec.widthCss,
            '100%',
            reason:
                'the authored rule is the only source of `width`; the port gives '
                'the box its caller’s width, and the widget test proves it does',
          );
          expect(
            spec.radiusPx,
            _pxOf(_probeValue(p, 'borderRadius', cls), '$cls radius'),
          );
          expect(
            spec.borderWidthPx,
            _pxOf(_probeValue(p, 'borderTopWidth', cls), '$cls border width'),
          );
          expect(spec.borderColor, _probeColour(p, 'borderTopColor', cls));
          expect(spec.fillColor, _probeColour(p, 'backgroundColor', cls));
          expect(spec.textColor, _probeColour(p, 'color', cls));
          expect(
            spec.fontFamily,
            _probeValue(
              p,
              'fontFamily',
              cls,
            ).split(',').first.replaceAll(RegExp('["\']'), '').trim(),
            reason:
                'a field carries the body stack it measured; only the .btn-* '
                'classes author --font-display, and this one does not',
          );
          expect(
            spec.fontSizePx,
            _pxOf(_probeValue(p, 'fontSize', cls), '$cls font-size'),
          );
          expect(spec.fontWeight, int.parse(_probeValue(p, 'fontWeight', cls)));
          expect(
            spec.lineHeightPx,
            _pxOf(_probeValue(p, 'lineHeight', cls), '$cls line-height'),
          );
          final String spacing = _probeValue(p, 'letterSpacing', cls);
          expect(
            spec.letterSpacingPx,
            spacing == 'normal' ? 0.0 : _pxOf(spacing, '$cls letter-spacing'),
            reason: 'CSS prints `normal` where the used value is zero',
          );
          final List<double> pad = _probeValue(p, 'padding', cls)
              .split(RegExp(r'\s+'))
              .map((String s) => _pxOf(s, '$cls padding'))
              .toList();
          expect(spec.paddingVerticalPx, pad.first);
          expect(spec.paddingHorizontalPx, pad[1]);
          expect(
            _probeValue(p, 'boxShadow', cls),
            'none',
            reason:
                'the probe must rest with nothing painted behind the box: the '
                'ring AppFieldSpec carries is the :focus rule’s, not a resting shadow',
          );
        });
      }

      test('$cls keeps one row between the desktop and phone passes', () {
        const List<String> fields = <String>[
          'display',
          'fontFamily',
          'fontSize',
          'fontWeight',
          'lineHeight',
          'letterSpacing',
          'padding',
          'borderRadius',
          'borderTopWidth',
          'borderTopColor',
          'backgroundColor',
          'color',
          'boxShadow',
        ];
        final Map<String, List<Map<String, dynamic>>> pairs =
            <String, List<Map<String, dynamic>>>{
              'light-phone': <Map<String, dynamic>>[
                lightPhoneProbes,
                lightProbes,
              ],
              'dark-phone': <Map<String, dynamic>>[darkPhoneProbes, darkProbes],
            };
        for (final MapEntry<String, List<Map<String, dynamic>>> entry
            in pairs.entries) {
          final String phonePass = entry.key;
          final String desktopPass = phonePass.replaceAll('-phone', '-desktop');
          for (final String field in fields) {
            expect(
              _probeValue(_probe(entry.value[0], cls, phonePass), field, cls),
              _probeValue(_probe(entry.value[1], cls, desktopPass), field, cls),
              reason:
                  '$phonePass moves $field for $cls and AppFields ports one row '
                  'per brightness to paint it from',
            );
          }
        }
      });

      test('$cls focus and placeholder come from the authored rule, not a guess', () {
        final Map<String, String> rest = _cssDecls(cssLines, '$cls {', cls);
        expect(
          rest.keys.toSet().difference(<String>{
            'background',
            'border',
            'border-radius',
            'padding',
            'font-size',
            'color',
            'width',
            'transition',
          }),
          isEmpty,
          reason: '$cls rests with a property AppFieldSpec cannot hold',
        );
        // The resting text and the probe are two readings of one stylesheet.
        // If they ever disagree, the measurement is stale and every colour in
        // this file is a guess, so the disagreement has to stop the run.
        final RegExpMatch? bgVar = RegExp(r'^var\((--[a-z0-9-]+)\)$')
            .firstMatch(rest['background']!);
        final RegExpMatch? colourVar = RegExp(r'^var\((--[a-z0-9-]+)\)$')
            .firstMatch(rest['color']!);
        expect(
          bgVar,
          isNotNull,
          reason: '${rest['background']} is not a bare token',
        );
        expect(
          colourVar,
          isNotNull,
          reason: '${rest['color']} is not a bare token',
        );
        final RegExpMatch? border = RegExp(
          r'^([\d.]+)px solid var\((--[a-z0-9-]+)\)$',
        ).firstMatch(rest['border']!);
        expect(
          border,
          isNotNull,
          reason:
              '${rest['border']} is not `Npx solid var(--token)` — AppFieldSpec ports a uniform solid border only',
        );
        for (final Brightness brightness in Brightness.values) {
          final Map<String, dynamic> root = rootFor(brightness);
          final AppFieldSpec spec = AppFields.resolve(cls, brightness);
          expect(
            spec.fillColor,
            _measuredColour(root, bgVar!.group(1)!),
            reason: 'the authored fill and the probe are one declaration',
          );
          expect(
            spec.textColor,
            _measuredColour(root, colourVar!.group(1)!),
            reason:
                'the authored text colour and the probe are one declaration',
          );
          expect(
            spec.borderColor,
            _measuredColour(root, border!.group(2)!),
            reason: 'the authored border and the probe are one declaration',
          );
          expect(
            spec.borderWidthPx,
            double.parse(border.group(1)!),
            reason:
                'the authored border width and the probe are one declaration',
          );
        }

        final Map<String, String> focus = _cssDecls(
          cssLines,
          '$cls:focus {',
          cls,
        );
        expect(
          focus.keys.toSet().difference(<String>{
            'outline',
            'border-color',
            'box-shadow',
          }),
          isEmpty,
          reason:
              '$cls:focus sets something AppFieldSpec cannot hold — a focused '
              'field the phone paints differently',
        );
        expect(
          focus['outline'],
          'none',
          reason:
              'the rule clears the browser’s own focus outline; Flutter paints '
              'no UA outline, and AppFormField sets every Material border to '
              'none so the decorator cannot add one either',
        );
        final Map<String, String> placeholder = _cssDecls(
          cssLines,
          '$cls::placeholder {',
          cls,
        );
        expect(placeholder.keys.toList(), <String>[
          'color',
        ], reason: '$cls::placeholder ports a colour and nothing else');
        // :focus and ::placeholder are the two states AppFormField ports. A third
        // would be a field the phone paints differently, and the only way to hear
        // about it is to look for it in the pinned stylesheet.
        for (final String state in <String>[
          ':hover',
          ':focus-visible',
          ':active',
          ':disabled',
          '[disabled]',
          '::selection',
        ]) {
          expect(
            cssLines.any((String line) => line.startsWith('$cls$state')),
            isFalse,
            reason:
                '$cls$state exists in src/index.css; AppFieldSpec carries a '
                'resting row and a focused one, and a field with more states is a '
                'phone that disagrees in a state nobody measured',
          );
        }
        final AppFieldSpec lightSpec = AppFields.resolve(cls, Brightness.light);
        final AppFieldSpec darkSpec = AppFields.resolve(cls, Brightness.dark);

        final RegExpMatch? hintRef = RegExp(r'^var\((--[a-z0-9-]+)\)$')
            .firstMatch(placeholder['color']!);
        expect(hintRef, isNotNull, reason: 'the hint is not a bare token');
        expect(
          lightSpec.hintColor,
          _measuredColour(light, hintRef!.group(1)!),
          reason:
              'the hint is ${hintRef.group(1)} as the light pass measures it',
        );
        expect(
          darkSpec.hintColor,
          _measuredColour(dark, hintRef.group(1)!),
          reason: 'and as the dark pass measures the same token',
        );
        expect(
          lightSpec.hintColor,
          isNot(lightSpec.textColor),
          reason: 'a hint in the text colour is not a hint',
        );

        final RegExpMatch? focusRef = RegExp(r'^var\((--[a-z0-9-]+)\)$')
            .firstMatch(focus['border-color']!);
        expect(
          focusRef,
          isNotNull,
          reason: 'the focused border is not a bare token',
        );
        expect(
          lightSpec.focusBorderColor,
          _measuredColour(light, focusRef!.group(1)!),
          reason:
              'the focused border is ${focusRef.group(1)} in the light pass',
        );
        expect(
          darkSpec.focusBorderColor,
          _measuredColour(dark, focusRef.group(1)!),
          reason: 'and in the dark pass’s own copy of the token',
        );
        expect(
          lightSpec.focusBorderColor,
          isNot(lightSpec.borderColor),
          reason: 'a focused border equal to the resting one is a no-op rule',
        );

        // `box-shadow: 0 0 0 3px color-mix(in srgb, var(--glow) 30%, transparent)`
        // — the mix against `transparent` scales the measured token’s alpha, so
        // the ring is that token at that percentage. Anything else in this
        // position (a blur, an offset, a two-colour mix) is arithmetic the port
        // would have to invent, so the shape is matched before the numbers are.
        final RegExpMatch? ring = RegExp(
          r'^0 0 0 ([\d.]+)px color-mix\(in srgb,\s*var\((--[a-z0-9-]+)\)\s+([\d.]+)%,\s*transparent\)$',
        ).firstMatch(focus['box-shadow']!);
        expect(
          ring,
          isNotNull,
          reason:
              '${focus['box-shadow']} is not the hard spread ring of one token '
              'against transparent that AppFieldSpec can port',
        );
        expect(lightSpec.ringSpreadPx, double.parse(ring!.group(1)!));
        expect(
          darkSpec.ringSpreadPx,
          lightSpec.ringSpreadPx,
          reason: 'the ring is sized by the rule, not by the colour scheme',
        );
        final String ringToken = ring.group(2)!;
        final double ringAlpha = double.parse(ring.group(3)!) / 100;
        expect(
          lightSpec.ringColor,
          _measuredColour(light, ringToken).withValues(alpha: ringAlpha),
          reason: 'the light ring is $ringToken at ${ring.group(3)}%',
        );
        expect(
          darkSpec.ringColor,
          _measuredColour(dark, ringToken).withValues(alpha: ringAlpha),
          reason:
              'the dark ring is the same percentage of the dark pass’s token',
        );
      });
    }

    test('a field rests with nothing painted, and the resting shadow is the computed form of `none`', () {
      for (final Brightness brightness in Brightness.values) {
        final AppFieldSpec spec = AppFields.resolve('.input', brightness);
        expect(
          _probeValue(
            _probe(
              probesFor(brightness),
              '.input',
              brightness == Brightness.light ? 'light-desktop' : 'dark-desktop',
            ),
            'boxShadow',
            '.input',
          ),
          'none',
        );
        expect(
          spec.restRing.color,
          const Color(0x00000000),
          reason: 'CSS `box-shadow: none` is a zero-everything shadow',
        );
        expect(spec.restRing.spreadRadius, 0.0);
        expect(spec.restRing.blurRadius, 0.0);
        expect(spec.restRing.offset, Offset.zero);
        expect(
          spec.ring.blurRadius,
          0.0,
          reason: 'the authored ring has no blur',
        );
        expect(spec.ring.offset, Offset.zero, reason: 'and no offset');
      }
    });

    test('the field runs focus on its own authored transition', () {
      const String cls = '.input';
      final RegExpMatch? tRaw = RegExp(r'transition:\s*([^;]+);')
          .firstMatch(_cssRuleText(cssLines, '$cls {', cls));
      expect(tRaw, isNotNull, reason: '$cls authors no transition');
      final List<String> items = tRaw!
          .group(1)!
          .trim()
          .split(',')
          .map((String s) => s.trim())
          .where((String s) => s.isNotEmpty)
          .toList();
      final Set<String> props = <String>{};
      final Set<String> durTokens = <String>{};
      final Set<String> easeTokens = <String>{};
      for (final String item in items) {
        final List<String> parts = item
            .split(RegExp(r'\s+'))
            .where((String s) => s.isNotEmpty)
            .toList();
        expect(
          parts,
          hasLength(3),
          reason: '"$item" is not `property var(--dur) var(--ease)`',
        );
        props.add(parts[0]);
        durTokens.add(
          RegExp(r'^var\((--[a-z0-9-]+)\)$').firstMatch(parts[1])!.group(1)!,
        );
        easeTokens.add(
          RegExp(r'^var\((--[a-z0-9-]+)\)$').firstMatch(parts[2])!.group(1)!,
        );
      }
      expect(
        props,
        <String>{'border-color', 'box-shadow'},
        reason:
            'the field animates exactly what :focus changes; a property the web '
            'starts transitioning without a row for it lands here as a phone that '
            'snaps while the browser eases',
      );
      expect(durTokens, hasLength(1), reason: 'one box runs one clock');
      expect(easeTokens, hasLength(1), reason: 'one box runs one curve');
      final String durToken = durTokens.single;
      final String easeToken = easeTokens.single;
      final AppFieldSpec lightSpec = AppFields.resolve(
        '.input',
        Brightness.light,
      );
      final AppFieldSpec darkSpec = AppFields.resolve(
        '.input',
        Brightness.dark,
      );
      expect(
        lightSpec.transitionDuration,
        _duration(_raw(light, durToken)),
        reason: '.input transitions on $durToken as the light pass measures it',
      );
      expect(
        darkSpec.transitionDuration,
        _duration(_raw(dark, durToken)),
        reason: 'and on the dark pass’s own copy of the same token',
      );
      expect(
        darkSpec.transitionMs,
        lightSpec.transitionMs,
        reason: 'the rule is unlayered, so both passes run the same clock',
      );
      final Cubic authored = _cubic(_raw(light, easeToken));
      expect(
        <double>[
          lightSpec.easeX1,
          lightSpec.easeY1,
          lightSpec.easeX2,
          lightSpec.easeY2,
        ],
        <double>[authored.a, authored.b, authored.c, authored.d],
        reason: '.input transitions on $easeToken as the pass measures it',
      );
      expect(
        AppTokens.durationsByToken[durToken],
        lightSpec.transitionDuration,
        reason: 'the field row and the §4 token table are one measurement',
      );
      final Cubic tableCurve = AppTokens.curvesByToken[easeToken]! as Cubic;
      expect(
        <double>[tableCurve.a, tableCurve.b, tableCurve.c, tableCurve.d],
        <double>[
          lightSpec.easeX1,
          lightSpec.easeY1,
          lightSpec.easeX2,
          lightSpec.easeY2,
        ],
        reason:
            'Cubic has no value equality, so the four numbers are what compare',
      );
    });

    for (final String cls in labelClasses) {
      for (final Brightness brightness in Brightness.values) {
        final String pass = brightness == Brightness.light
            ? 'light-desktop'
            : 'dark-desktop';
        test('$cls $pass is the label the probe measured', () {
          final Map<String, dynamic> p = _probe(
            probesFor(brightness),
            cls,
            pass,
          );
          final AppLabelSpec spec = AppLabels.resolve(cls, brightness);
          expect(spec.cssClass, cls);
          expect(spec.displayCss, _probeValue(p, 'display', cls));
          expect(spec.textColor, _probeColour(p, 'color', cls));
          expect(
            spec.fontFamily,
            _probeValue(
              p,
              'fontFamily',
              cls,
            ).split(',').first.replaceAll(RegExp('["\']'), '').trim(),
          );
          expect(
            spec.fontSizePx,
            _pxOf(_probeValue(p, 'fontSize', cls), '$cls font-size'),
          );
          expect(spec.fontWeight, int.parse(_probeValue(p, 'fontWeight', cls)));
          expect(
            spec.lineHeightPx,
            _pxOf(_probeValue(p, 'lineHeight', cls), '$cls line-height'),
          );
          expect(
            spec.letterSpacingPx,
            _pxOf(_probeValue(p, 'letterSpacing', cls), '$cls letter-spacing'),
          );
          expect(
            _probeValue(p, 'borderTopWidth', cls),
            '0px',
            reason:
                'AppLabelSpec has no box fields, and that is only honest while the '
                'probe measures no box — a bordered label is a different row',
          );
          expect(_probeValue(p, 'borderRadius', cls), '0px');
          expect(_probeValue(p, 'padding', cls), '0px');
        });
      }

      test('$cls is a resting-only class, and its case is authored', () {
        final Map<String, String> rest = _cssDecls(cssLines, '$cls {', cls);
        expect(
          rest.keys.toSet().difference(<String>{
            'font-size',
            'font-weight',
            'letter-spacing',
            'text-transform',
            'color',
          }),
          isEmpty,
          reason:
              '$cls grew a property AppLabelSpec does not hold — a label that '
              'became a box, or gained a state the phone would not repaint',
        );
        for (final String state in <String>[
          ':hover',
          ':focus',
          ':focus-visible',
          ':active',
          ':disabled',
          '::placeholder',
          '::selection',
        ]) {
          expect(
            cssLines.any((String line) => line.startsWith('$cls$state')),
            isFalse,
            reason:
                '$cls$state exists in src/index.css; AppLabelSpec ports a '
                'resting-only row and a label with states is a different control',
          );
        }
        // `letter-spacing: 0.12em` is authored in the font size and measured in
        // px: 0.12 × 10px = 1.2px. The two readings have to be the same number.
        final RegExpMatch? em = RegExp(r'^([\d.]+)em$')
            .firstMatch(rest['letter-spacing']!);
        expect(
          em,
          isNotNull,
          reason:
              '${rest['letter-spacing']} is not the `em` tracking the class authors',
        );
        for (final Brightness brightness in Brightness.values) {
          final AppLabelSpec spec = AppLabels.resolve(cls, brightness);
          expect(
            spec.letterSpacingPx,
            double.parse(em!.group(1)!) * spec.fontSizePx,
            reason:
                'the measured px tracking is the authored em times the measured '
                'font size — one declaration, two readings',
          );
        }
        expect(
          AppLabels.resolve(cls, Brightness.light).uppercase,
          rest['text-transform'] == 'uppercase',
          reason:
              'CSS applies text-transform after layout, so the string never '
              'changes on the web; in Flutter the label has to say so',
        );
        expect(
          AppLabels.resolve(cls, Brightness.dark).uppercase,
          AppLabels.resolve(cls, Brightness.light).uppercase,
          reason: 'case is not themed',
        );
        final RegExpMatch? colourVar = RegExp(r'^var\((--[a-z0-9-]+)\)$')
            .firstMatch(rest['color']!);
        expect(
          colourVar,
          isNotNull,
          reason: 'the label colour is not a bare token',
        );
        expect(
          AppLabels.resolve(cls, Brightness.light).textColor,
          _measuredColour(light, colourVar!.group(1)!),
          reason:
              'the label is ${colourVar.group(1)} as the light pass measures it',
        );
        expect(
          AppLabels.resolve(cls, Brightness.dark).textColor,
          _measuredColour(dark, colourVar.group(1)!),
          reason: 'and as the dark pass measures it',
        );
      });
    }

    test('AppFields.labelGap is the gap the Input composition authors', () {
      // `src/components/ui/Input.tsx` is the label-plus-field wrapper the phone
      // reproduces. Like the stylesheet it is byte-identical to the tag the
      // measurement was taken at, so its `gap-*` utility is a ported fact and the
      // multiplier below is re-derived from it rather than trusted from the row.
      final String composition = webSource('src/components/ui/Input.tsx');
      final RegExpMatch? wrapper = RegExp(
        r'<div className="flex flex-col gap-([\d.]+) w-full text-left">',
      ).firstMatch(composition);
      expect(
        wrapper,
        isNotNull,
        reason:
            'Input.tsx no longer opens with the wrapper AppFormField ports, so the '
            'gap it authors has to be re-read before it is painted',
      );
      expect(AppFields.labelGapScale, double.parse(wrapper!.group(1)!));
      expect(
        AppFields.labelGap,
        double.parse(wrapper.group(1)!) * _lengthToPx(_raw(light, '--spacing')),
        reason:
            'Tailwind composes the utility as calc(n * --spacing), and the unit is '
            'the measurement AppSpacing already carries — not a number the port chose',
      );
      expect(
        AppFields.labelGap,
        AppSpacing.scale(AppFields.labelGapScale),
        reason: 'the getter is that multiplication and nothing else',
      );
    });

    test('the field and label getters derive from their own row', () {
      for (final Brightness brightness in Brightness.values) {
        final AppFieldSpec field = AppFields.resolve('.input', brightness);
        expect(field.borderRadius, BorderRadius.circular(field.radiusPx));
        expect(
          field.padding,
          EdgeInsets.symmetric(
            vertical: field.paddingVerticalPx,
            horizontal: field.paddingHorizontalPx,
          ),
        );
        expect(
          field.border,
          Border.all(color: field.borderColor, width: field.borderWidthPx),
        );
        expect(
          field.focusedBorder,
          Border.all(color: field.focusBorderColor, width: field.borderWidthPx),
          reason:
              'focus repaints the colour only — the rule never moves the width',
        );
        expect(field.weight, FontWeight.values[field.fontWeight ~/ 100 - 1]);
        expect(field.heightRatio, field.lineHeightPx! / field.fontSizePx);
        expect(
          field.transitionDuration,
          Duration(milliseconds: field.transitionMs),
        );
        expect(
          <double>[
            field.transitionCurve.a,
            field.transitionCurve.b,
            field.transitionCurve.c,
            field.transitionCurve.d,
          ],
          <double>[field.easeX1, field.easeY1, field.easeX2, field.easeY2],
        );
        expect(
          field.ring,
          BoxShadow(
            color: field.ringColor,
            offset: Offset.zero,
            blurRadius: 0.0,
            spreadRadius: field.ringSpreadPx,
          ),
          reason:
              'BoxShadow has value equality, so the ring is compared outright',
        );
        expect(field.textStyle.color, field.textColor);
        expect(field.textStyle.fontSize, field.fontSizePx);
        expect(field.textStyle.fontFamily, field.fontFamily);
        expect(field.textStyle.letterSpacing, field.letterSpacingPx);
        expect(field.textStyle.height, field.heightRatio);
        expect(field.hintStyle.color, field.hintColor);
        expect(
          field.hintStyle.fontSize,
          field.textStyle.fontSize,
          reason: 'a hint in another size would be another measurement',
        );

        final AppLabelSpec label = AppLabels.resolve('.eyebrow', brightness);
        expect(label.weight, FontWeight.values[label.fontWeight ~/ 100 - 1]);
        expect(label.heightRatio, label.lineHeightPx! / label.fontSizePx);
        expect(label.textStyle.color, label.textColor);
        expect(label.textStyle.letterSpacing, label.letterSpacingPx);
        expect(
          label.transform('Amount'),
          label.uppercase ? 'AMOUNT' : 'Amount',
        );
      }
    });

    test(
      'an unknown field or label class is an error, not a Material default',
      () {
        for (final Brightness brightness in Brightness.values) {
          expect(
            () => AppFields.resolve('.btn-primary', brightness),
            throwsArgumentError,
            reason:
                'a button is a measured class but not a field: AppFields refusing it '
                'is what keeps AppFormField from painting a pill with a caret in it',
          );
          expect(
            () => AppLabels.resolve('.no-such-label', brightness),
            throwsArgumentError,
          );
        }
      },
    );
  });

  group('UI_SPEC 6 skeletons', () {
    /// `.skeleton` is the only class `src/components/ui/Skeleton.tsx` composes its
    /// variants over, and the sweep that makes it a loading placeholder lives on
    /// `.skeleton::after` — a pseudo-element a detached probe cannot carry. So the
    /// resting box below is Chrome's measurement, and everything that moves is the
    /// pinned stylesheet's own words.
    const List<String> skeletonClasses = <String>['.skeleton'];

    /// The five curves css-easing-1 gives the CSS keywords. `.skeleton::after`
    /// names the keyword `ease-in-out` and no `var(--ease-*)`, and the two are not
    /// one number: the design system's own `--ease-in-out` token is
    /// `cubic-bezier(0.4, 0, 0.2, 1)`.
    const Map<String, List<double>> keywordCurves = <String, List<double>>{
      'linear': <double>[0, 0, 1, 1],
      'ease': <double>[0.25, 0.1, 0.25, 1],
      'ease-in': <double>[0.42, 0, 1, 1],
      'ease-out': <double>[0, 0, 0.58, 1],
      'ease-in-out': <double>[0.42, 0, 0.58, 1],
    };

    Map<String, dynamic> probesFor(Brightness brightness) =>
        brightness == Brightness.light ? lightProbes : darkProbes;
    Map<String, dynamic> rootFor(Brightness brightness) =>
        brightness == Brightness.light ? light : dark;

    /// `headLine` to the line that closes it, brace-matched and joined.
    /// [_cssRuleText] stops at the first `}`, which inside `@keyframes` and
    /// `@media` is a nested rule's, not the block's.
    String blockOf(String headLine) {
      final int start = cssLines.indexOf(headLine);
      if (start < 0) {
        throw StateError('no block head "$headLine" in src/index.css');
      }
      final List<String> body = <String>[];
      int depth = 0;
      for (int j = start; j < cssLines.length; j++) {
        body.add(cssLines[j]);
        depth +=
            '{'.allMatches(cssLines[j]).length -
            '}'.allMatches(cssLines[j]).length;
        if (depth == 0) return body.join(' ');
      }
      throw StateError('"$headLine" never closes in src/index.css');
    }

    /// Whitespace run together, so a selector authored over three lines
    /// (`*`, `*::before`, `*::after`) compares as one string.
    String flat(String text) => text.replaceAll(RegExp(r'\s+'), ' ').trim();

    /// The declarations of `… { … }` body text, as the shorthand the rule was
    /// written in rather than the line it was written on.
    Map<String, String> declsOf(String body) {
      final Map<String, String> decls = <String, String>{};
      for (final String part in body.split(';')) {
        final int colon = part.indexOf(':');
        if (colon < 0) continue;
        decls[part.substring(0, colon).trim()] = part
            .substring(colon + 1)
            .trim();
      }
      return decls;
    }

    test(
      'AppSkeletons holds exactly the measured skeleton classes, per pass',
      () {
        expect(AppSkeletons.light.keys.toList(), skeletonClasses);
        expect(AppSkeletons.dark.keys.toList(), skeletonClasses);
      },
    );

    for (final String cls in skeletonClasses) {
      for (final Brightness brightness in Brightness.values) {
        final String pass = brightness == Brightness.light
            ? 'light-desktop'
            : 'dark-desktop';

        test('$cls $pass matches the box Chrome measured', () {
          final Map<String, dynamic> p = _probe(
            probesFor(brightness),
            cls,
            pass,
          );
          final AppSkeletonSpec spec = AppSkeletons.resolve(cls, brightness);
          expect(spec.cssClass, cls);
          expect(spec.displayCss, _probeValue(p, 'display', cls));
          expect(spec.fillColor, _probeColour(p, 'backgroundColor', cls));
          expect(
            spec.radiusPx,
            _pxOf(_probeValue(p, 'borderRadius', cls), '$cls radius'),
          );
          expect(
            _probeValue(p, 'position', cls),
            'relative',
            reason:
                'the box is the sweep’s containing block: `inset: 0` on the '
                'pseudo-element resolves against it and nothing else',
          );
          expect(
            _pxOf(_probeValue(p, 'borderTopWidth', cls), '$cls border width'),
            0.0,
            reason:
                'the class alone has no frame. The 1px AppSkeletonSpec carries is '
                'Skeleton.tsx’s utility to add, which is what the frame test below '
                'accounts for — and if this ever measures non-zero, the row would '
                'be painting two',
          );
          expect(
            _probeValue(p, 'boxShadow', cls),
            'none',
            reason: 'a skeleton at rest has nothing painted behind its fill',
          );
        });
      }

      test('$cls keeps one row between the desktop and phone passes', () {
        const List<String> fields = <String>[
          'display',
          'position',
          'backgroundColor',
          'backgroundImage',
          'borderRadius',
          'borderTopWidth',
          'boxShadow',
          'opacity',
        ];
        const List<List<String>> pairs = <List<String>>[
          <String>['light-phone', 'light-desktop'],
          <String>['dark-phone', 'dark-desktop'],
        ];
        for (final List<String> pair in pairs) {
          final Map<String, dynamic> phone = _probe(
            pair[0].startsWith('light') ? lightPhoneProbes : darkPhoneProbes,
            cls,
            pair[0],
          );
          final Map<String, dynamic> desktop = _probe(
            pair[0].startsWith('light') ? lightProbes : darkProbes,
            cls,
            pair[1],
          );
          for (final String field in fields) {
            expect(
              _probeValue(phone, field, cls),
              _probeValue(desktop, field, cls),
              reason:
                  '${pair[0]} moves $field for $cls and AppSkeletons ports one '
                  'row per brightness to paint it from',
            );
          }
        }
      });

      test('$cls rests as the authored rule writes it', () {
        final Map<String, String> rest = _cssDecls(cssLines, '$cls {', cls);
        expect(
          rest.keys.toSet(),
          <String>{'position', 'overflow', 'background', 'border-radius'},
          reason:
              '$cls rests with a property AppSkeletonSpec cannot hold — a phone '
              'that ignores it is a phone that disagrees with the browser',
        );
        expect(rest['position'], 'relative');
        expect(
          rest['overflow'],
          'hidden',
          reason:
              'the sweep travels one box width past the box on both sides, so '
              'without the clip it paints over whatever sits next to the skeleton',
        );
        final RegExpMatch? fill = RegExp(r'^var\((--[a-z0-9-]+)\)$')
            .firstMatch(rest['background']!);
        expect(
          fill,
          isNotNull,
          reason: '${rest['background']} is not a bare token',
        );
        final RegExpMatch? radius = RegExp(r'^var\((--[a-z0-9-]+)\)$')
            .firstMatch(rest['border-radius']!);
        expect(
          radius,
          isNotNull,
          reason: '${rest['border-radius']} is not a bare token',
        );
        for (final Brightness brightness in Brightness.values) {
          final Map<String, dynamic> root = rootFor(brightness);
          final AppSkeletonSpec spec = AppSkeletons.resolve(cls, brightness);
          expect(
            spec.fillColor,
            _measuredColour(root, fill!.group(1)!),
            reason: 'the authored fill and the probe are one declaration',
          );
          expect(
            spec.radiusPx,
            _lengthToPx(_raw(root, radius!.group(1)!)),
            reason:
                'the authored `border-radius: ${radius.group(1)}` and the probe '
                'corner are one declaration',
          );
        }
        expect(
          cssLines.where((String line) => line.startsWith(cls)).toList(),
          <String>['$cls {', '$cls::after {'],
          reason:
              '$cls now has a rule head AppSkeletons does not read — a state the '
              'phone would paint without anyone measuring it',
        );
      });

      test('$cls sweeps exactly what its pseudo-element authors', () {
        final Map<String, String> after = _cssDecls(
          cssLines,
          '$cls::after {',
          cls,
        );
        expect(
          after.keys.toSet(),
          <String>{
            'content',
            'position',
            'inset',
            'background',
            'animation',
            'transform',
          },
          reason:
              '$cls::after sets something AppSkeletonSpec cannot port — the row '
              'carries a fill, a sweep and a clock, and no other paint',
        );
        expect(
          after['content'],
          anyOf("''", '""'),
          reason: 'a pseudo-element with text in it is not this sweep',
        );
        expect(after['position'], 'absolute');
        expect(
          after['inset'],
          '0',
          reason:
              'the band is one box wide, which is what makes translateX(±100%) '
              'mean ±one box width and the port’s percentages exact',
        );
        final RegExpMatch? from = RegExp(r'^translateX\(([-\d.]+)%\)$')
            .firstMatch(after['transform']!);
        expect(
          from,
          isNotNull,
          reason:
              'the sweep starts at `${after['transform']}`, which is not a '
              'percentage of the box the port can interpolate from',
        );
        final String rule = _cssRuleText(cssLines, '$cls::after {', cls);
        final RegExpMatch? gradient = RegExp(
          r'background:\s*linear-gradient\((.*?)\)\s*;',
        ).firstMatch(rule);
        expect(
          gradient,
          isNotNull,
          reason: '$cls::after has no linear-gradient to sweep',
        );
        final List<String> parts = _splitTopLevel(gradient!.group(1)!);
        expect(
          parts,
          hasLength(4),
          reason:
              '${parts.join(' | ')} is not an angle and three stops: the port '
              'reads one band, not a multi-stop ramp',
        );
        final RegExpMatch? angle = RegExp(r'^([\d.]+)deg$')
            .firstMatch(parts[0]);
        expect(
          angle,
          isNotNull,
          reason: '${parts[0]} is not a plain authored angle',
        );
        expect(
          double.parse(angle!.group(1)!),
          90.0,
          reason:
              'the begin/end Alignment pair AppSkeletonSpec emits is the 90deg '
              'one — the box crossed left to right — and a different angle needs '
              'its own mapping, not this one',
        );
        expect(
          parts[1],
          'transparent 0%',
          reason: 'the ramp’s leading end is the keyword, not a colour',
        );
        expect(
          parts[3],
          'transparent 100%',
          reason: 'and so is its trailing end',
        );
        final RegExpMatch? mid = RegExp(
          r'^color-mix\(in srgb,\s*var\((--[a-z0-9-]+)\)\s+([\d.]+)%,\s*transparent\)\s+([\d.]+)%$',
        ).firstMatch(parts[2]);
        expect(
          mid,
          isNotNull,
          reason:
              '${parts[2]} is not one token mixed against transparent at one '
              'stop — the arithmetic AppSkeletonSpec can carry',
        );
        final String sweepToken = mid!.group(1)!;
        final double sweepAlpha = double.parse(mid.group(2)!) / 100.0;
        expect(
          double.parse(mid.group(3)!),
          50.0,
          reason:
              'the band is authored to peak at the middle of the box, which is '
              'what puts it there at half the period',
        );
        for (final Brightness brightness in Brightness.values) {
          final Map<String, dynamic> root = rootFor(brightness);
          final AppSkeletonSpec spec = AppSkeletons.resolve(cls, brightness);
          expect(spec.sweepFromPercent, double.parse(from!.group(1)!));
          expect(
            spec.sweepColor,
            _measuredColour(root, sweepToken).withValues(alpha: sweepAlpha),
            reason:
                'the band is $sweepToken at ${mid.group(2)}% as this pass measures it',
          );
          expect(
            spec.sweepClearColor,
            _measuredColour(root, sweepToken).withValues(alpha: 0.0),
            reason:
                'CSS writes the ends as `transparent`, whose channels a '
                'premultiplied interpolation never reads. Flutter reads them, so '
                'the port hands the transparent stop the sweep’s own channels and '
                'leaves the ramp constant-hue — which is what Chrome paints, in '
                'either interpolation space',
          );
          expect(spec.sweepMidStop, double.parse(mid.group(3)!) / 100.0);
          expect(
            <Alignment>[spec.sweepBegin, spec.sweepEnd],
            <Alignment>[const Alignment(-1.0, 0.0), const Alignment(1.0, 0.0)],
          );
          expect(
            spec.fillColor,
            isNot(spec.sweepColor),
            reason:
                'a band in the resting fill’s own colour is a skeleton that '
                'never shimmers',
          );
        }
      });

      test('$cls runs the clock its animation shorthand authors', () {
        final String animation = _cssDecls(
          cssLines,
          '$cls::after {',
          cls,
        )['animation']!;
        expect(
          animation,
          isNot(contains('var(')),
          reason:
              'the shimmer is authored off the §4 token scale, and the port keeps '
              'it there: the row carries the numbers this shorthand spells',
        );
        final RegExpMatch? m = RegExp(
          r'^([a-z][a-z0-9-]+)\s+([\d.]+)(ms|s)\s+([a-z-]+)\s+(infinite)$',
        ).firstMatch(animation.trim());
        expect(
          m,
          isNotNull,
          reason:
              '"$animation" is not `name duration ease infinite` — one band, one '
              'clock, forever',
        );
        final Duration period = _duration('${m!.group(2)}${m.group(3)}');
        final Cubic tokenCurve =
            AppTokens.curvesByToken['--ease-in-out']! as Cubic;
        for (final Brightness brightness in Brightness.values) {
          final AppSkeletonSpec spec = AppSkeletons.resolve(cls, brightness);
          expect(spec.animationName, m.group(1)!);
          expect(spec.sweepEaseKeyword, m.group(4)!);
          expect(
            spec.iterationCss,
            m.group(5)!,
            reason:
                'a finite shimmer ends, and a placeholder that stops moving '
                'while the work it stands for is still running is worse than a '
                'static one',
          );
          expect(spec.sweepPeriod, period);
          expect(spec.sweepMs, period.inMilliseconds);
          expect(
            <double>[spec.easeX1, spec.easeY1, spec.easeX2, spec.easeY2],
            keywordCurves[m.group(4)!],
            reason:
                '${m.group(4)} is a CSS keyword, and css-easing-1 says what it is',
          );
          expect(
            <double>[spec.easeX1, spec.easeY1, spec.easeX2, spec.easeY2],
            isNot(<double>[
              tokenCurve.a,
              tokenCurve.b,
              tokenCurve.c,
              tokenCurve.d,
            ]),
            reason:
                'the class named the keyword, not var(--ease-in-out). Swapping '
                'the design system’s curve in would be the port inventing a '
                'preference the web never stated — and the two are measurably '
                'different numbers',
          );
        }
        expect(
          AppTokens.durationsByToken.values,
          isNot(contains(period)),
          reason:
              '$period is on no §4 token today. If a token ever measures this '
              'same period the two need reconciling, and this is where the run '
              'stops to ask',
        );
      });

      test('$cls ends its run one box width off the right edge', () {
        final String frames = blockOf(
          '@keyframes ${AppSkeletons.resolve(cls, Brightness.light).animationName} {',
        );
        final String body = frames.substring(frames.indexOf('{') + 1);
        expect(
          RegExp(r'\b(from|to|[\d.]+%)\s*\{')
              .allMatches(body)
              .map((RegExpMatch s) => s.group(1)!)
              .toList(),
          <String>['100%'],
          reason:
              'the port takes the element’s own authored transform as the start '
              'of the ramp; a `from` or `0%` frame here would give it two '
              'starting positions and no way to choose',
        );
        final RegExpMatch? end = RegExp(r'100%\s*\{([^}]*)\}')
            .firstMatch(frames);
        expect(end, isNotNull, reason: 'the 100% frame has no body');
        final Map<String, String> endDecls = declsOf(end!.group(1)!);
        expect(
          endDecls.keys.toList(),
          <String>['transform'],
          reason:
              'the keyframe animates ${endDecls.keys.toList()}; AppSkeletonSpec '
              'ports one position and nothing else, so anything more is paint the '
              'phone never learned',
        );
        final RegExpMatch? to = RegExp(r'^translateX\(([-\d.]+)%\)$')
            .firstMatch(endDecls['transform']!);
        expect(
          to,
          isNotNull,
          reason:
              'the run ends at `${endDecls['transform']}`. CSS interpolates two '
              'functions of the same name; a px translate or a `translate()` '
              'would not share the port’s one-box-width percentage',
        );
        for (final Brightness brightness in Brightness.values) {
          final AppSkeletonSpec spec = AppSkeletons.resolve(cls, brightness);
          expect(spec.sweepToPercent, double.parse(to!.group(1)!));
        }
      });

      test('$cls frame is the utility Skeleton.tsx adds, not the class’s', () {
        final String component = webSource('src/components/ui/Skeleton.tsx');
        final RegExpMatch? base = RegExp(
          r"""^\s*const base = '(skeleton border border-\[var\(--[a-z0-9-]+\)\] motion-reduce:animate-none)';$""",
          multiLine: true,
        ).firstMatch(component);
        expect(
          base,
          isNotNull,
          reason:
              'src/components/ui/Skeleton.tsx no longer opens every skeleton with '
              'the class list AppSkeleton ports',
        );
        expect(AppSkeletons.baseClasses, base!.group(1));
        final RegExpMatch? frameToken = RegExp(
          r'border-\[var\((--[a-z0-9-]+)\)\]',
        ).firstMatch(base.group(1)!);
        expect(
          frameToken,
          isNotNull,
          reason: 'the frame the component adds names no token',
        );
        expect(
          base.group(1),
          contains('motion-reduce:animate-none'),
          reason:
              'the component does ask for a reduced-motion off — but the utility '
              'sets `animation: none` on the element, while the animation lives on '
              '`.skeleton::after`, which the element’s own class cannot reach. The '
              'stylesheet block the test above reads is what actually stops it',
        );
        for (final Brightness brightness in Brightness.values) {
          final AppSkeletonSpec spec = AppSkeletons.resolve(cls, brightness);
          expect(
            spec.borderColor,
            _measuredColour(rootFor(brightness), frameToken!.group(1)!),
            reason:
                'the frame is ${frameToken.group(1)} as this pass measures it — '
                'the probe reads a 0px border on the class alone, so this colour '
                'can only have come from the utility’s own bracket',
          );
          expect(
            spec.borderWidthPx,
            1.0,
            reason:
                'Tailwind’s `border` utility is `border-width: 1px` with '
                '`border-style: var(--tw-border-style)`, which its theme layer '
                'sets to `solid`. That is a fact of the generated stylesheet, which '
                'is a build product this checkout does not carry, so it is the one '
                'number in the row that is named rather than measured — and the '
                'probe keeps it honest, because the class it measured has none',
          );
          expect(
            spec.sweepClipRadiusPx,
            spec.radiusPx - spec.borderWidthPx,
            reason:
                'CSS `overflow: hidden` clips a box’s descendants to its padding '
                'box, whose corner is the authored radius minus the border width',
          );
        }
      });

      test('$cls reduced motion parks the band instead of slowing it', () {
        final String media = flat(
          blockOf('@media (prefers-reduced-motion: reduce) {'),
        );
        expect(
          media,
          contains('*, *::before, *::after {'),
          reason: 'the clamp no longer covers pseudo-elements',
        );
        expect(media, contains('animation-duration: 0.01ms !important;'));
        expect(media, contains('animation-iteration-count: 1 !important;'));
        expect(
          media,
          isNot(contains('$cls { animation: none')),
          reason:
              '$cls is now taken off its animation outright, so there is no run '
              'left to park one box width off the edge and the resting-only paint '
              'AppSkeleton documents is no longer the answer — it is the question',
        );
        expect(
          media,
          contains('.rise { animation: none;'),
          reason:
              'the block does single some classes out, which is what makes the '
              'skeleton’s silence a clamp it shares with everything else rather '
              'than a rule written for it',
        );
        for (final Brightness brightness in Brightness.values) {
          final AppSkeletonSpec spec = AppSkeletons.resolve(cls, brightness);
          expect(
            spec.sweepShiftPx(100.0, 1.0),
            100.0,
            reason:
                'at the end of the run the band sits one box width right of the '
                'box, which is off it — that is the position a reduced-motion '
                'preference leaves it in, and the port paints the fill and frame '
                'and nothing else',
          );
        }
      });
    }

    test('the variants Skeleton.tsx composes are the ones AppSkeletons carries', () {
      final String component = webSource('src/components/ui/Skeleton.tsx');
      final Map<String, String> authored = <String, String>{};
      for (final String name in <String>['text', 'circular', 'rectangular']) {
        final RegExpMatch? variant = RegExp(
          """^\\s*$name: '([^']+)',\$""",
          multiLine: true,
        ).firstMatch(component);
        expect(
          variant,
          isNotNull,
          reason:
              'src/components/ui/Skeleton.tsx no longer writes a $name variant as '
              'one class list, so AppSkeletons.variantClasses is a paraphrase',
        );
        authored[name] = variant!.group(1)!;
      }
      expect(
        AppSkeletons.variantClasses,
        authored,
        reason:
            'the ported variants are the component’s own strings, word for word — '
            'a screen that asks for `rectangular` must be asking for what the web '
            'asks for',
      );

      final RegExpMatch? fallback = RegExp(r"variant = '([a-z]+)'")
          .firstMatch(component);
      expect(
        fallback,
        isNotNull,
        reason: 'the component no longer defaults to a variant by name',
      );
      expect(AppSkeletons.defaultVariant, fallback!.group(1));
      expect(
        AppSkeletons.variantClasses.keys,
        contains(AppSkeletons.defaultVariant),
      );

      final double spacing = _lengthToPx(_raw(light, '--spacing'));
      expect(
        spacing,
        AppSpacing.spacing,
        reason: 'the unit the utilities compose against is the measured one',
      );
      for (final String name in <String>['text', 'rectangular']) {
        final RegExpMatch? height = RegExp(r'\bh-([\d.]+)\b')
            .firstMatch(authored[name]!);
        expect(
          height,
          isNotNull,
          reason: 'the $name variant no longer authors an h-<n> utility',
        );
        expect(
          authored[name],
          contains('w-full'),
          reason:
              'the $name variant no longer asks for the containing block’s width, '
              'which is the only width rule AppSkeleton can honour',
        );
        final double scale = double.parse(height!.group(1)!);
        if (name == AppSkeletons.defaultVariant) {
          expect(AppSkeletons.textHeightScale, scale);
          expect(
            AppSkeletons.textHeightPx,
            scale * spacing,
            reason:
                'h-<n> is calc(n * --spacing): $scale of $spacing px, not a '
                'height someone typed here',
          );
          expect(
            AppSkeletons.textHeightPx,
            AppSpacing.scale(AppSkeletons.textHeightScale),
          );
        } else {
          expect(AppSkeletons.rectangularHeightScale, scale);
          expect(AppSkeletons.rectangularHeightPx, scale * spacing);
          expect(
            AppSkeletons.rectangularHeightPx,
            AppSpacing.scale(AppSkeletons.rectangularHeightScale),
          );
        }
      }
      expect(
        RegExp(r'\bh-([\d.]+)\b').hasMatch(authored['circular']!),
        isFalse,
        reason:
            'the circular variant now authors a height, and the port expects its '
            'caller for both dimensions',
      );
      expect(
        authored['circular'],
        contains('shrink-0'),
        reason:
            'without it the flex row the web drops a circular skeleton into '
            'squashes it, and the caller’s dimensions stop being its own',
      );
    });

    test('the radius every variant asks for is the class’s — circular included', () {
      for (final String classes in AppSkeletons.variantClasses.values) {
        expect(
          RegExp(r'\brounded\b').hasMatch(classes),
          isTrue,
          reason:
              '"$classes" no longer asks for a radius, so the note below is stale',
        );
      }
      for (final Brightness brightness in Brightness.values) {
        final Map<String, dynamic> root = rootFor(brightness);
        final AppSkeletonSpec spec = AppSkeletons.resolve(
          '.skeleton',
          brightness,
        );
        expect(
          spec.radiusPx,
          _lengthToPx(_raw(root, '--r-sm')),
          reason: 'the class authors --r-sm and the probe measures it',
        );
        expect(
          spec.radiusPx,
          isNot(_lengthToPx(_raw(root, '--r-md'))),
          reason:
              'rectangular asks for rounded-[var(--r-md)] and does not get it: '
              'src/index.css authors .skeleton unlayered, and an unlayered '
              'declaration outranks every layer, including the utilities layer '
              'Tailwind emits the rounded-* rules into',
        );
        expect(
          spec.radiusPx,
          isNot(greaterThan(100.0)),
          reason:
              'circular asks for rounded-full and does not get it either. A phone '
              'that painted a circle here would be porting the component’s intent '
              'instead of the browser’s result — and the two differ measurably',
        );
      }
    });

    test('.skeleton getters are its own row, re-expressed', () {
      for (final Brightness brightness in Brightness.values) {
        final AppSkeletonSpec spec = AppSkeletons.resolve(
          '.skeleton',
          brightness,
        );
        expect(spec.borderRadius, BorderRadius.circular(spec.radiusPx));
        expect(
          spec.border,
          Border.all(color: spec.borderColor, width: spec.borderWidthPx),
        );
        expect(
          spec.sweepClipRadius,
          BorderRadius.circular(spec.sweepClipRadiusPx),
        );
        expect(spec.sweepPeriod, Duration(milliseconds: spec.sweepMs));
        expect(
          <double>[
            spec.sweepCurve.a,
            spec.sweepCurve.b,
            spec.sweepCurve.c,
            spec.sweepCurve.d,
          ],
          <double>[spec.easeX1, spec.easeY1, spec.easeX2, spec.easeY2],
          reason: 'Cubic has no value equality, so the four numbers are what compare',
        );
        expect(spec.sweepGradient.colors, <Color>[
          spec.sweepClearColor,
          spec.sweepColor,
          spec.sweepClearColor,
        ]);
        expect(spec.sweepGradient.stops, <double>[0.0, spec.sweepMidStop, 1.0]);
        expect(spec.sweepGradient.begin, spec.sweepBegin);
        expect(spec.sweepGradient.end, spec.sweepEnd);
        const double width = 240.0;
        expect(spec.sweepShiftPx(width, 0.0), -width);
        expect(spec.sweepShiftPx(width, 0.5), 0.0);
        expect(spec.sweepShiftPx(width, 1.0), width);
      }
    });

    test('an unknown skeleton class is an error, not a Material default', () {
      for (final Brightness brightness in Brightness.values) {
        expect(
          () => AppSkeletons.resolve('.card', brightness),
          throwsArgumentError,
          reason:
              'a card is a measured §6 class but not a placeholder: AppSkeletons '
              'refusing it is what keeps a skeleton from painting a surface',
        );
        expect(
          () => AppSkeletons.resolve('.no-such-skeleton', brightness),
          throwsArgumentError,
        );
      }
    });
  });

  group('UI_SPEC 6 icon buttons', () {
    /// `.icon-btn` is the standalone header-chrome pill. Its resting box is a
    /// §6 probe like every class above, but the generator reads it with its
    /// own reader (generate_theme.cjs) rather than the controls or surfaces
    /// table: it carries a `backdrop-filter` the control row rejects, and that
    /// filter is a `blur(10px)` with no `saturate()`, the shape the shared
    /// `probeBackdrop` calls unportable. Its `width`/`height` are not in the
    /// probe either — the pill size is authored, so it is read from the same
    /// pinned `src/index.css` rule the transition is, exactly as the skeleton
    /// reads its heights from the `h-<n>` rule rather than a measured box.
    const List<String> iconClasses = <String>['.icon-btn'];

    Map<String, dynamic> probesFor(Brightness brightness) =>
        brightness == Brightness.light ? lightProbes : darkProbes;
    Map<String, dynamic> rootFor(Brightness brightness) =>
        brightness == Brightness.light ? light : dark;

    /// One root token's measured srgb as the four numbers that build a Color —
    /// read straight off the JSON so a colour-mix check can rebuild the fill at
    /// the mix's own alpha without pulling apart a generated `Color`'s float
    /// components (which run through the colour space, not the authored bytes).
    List<num> srgbInts(Map<String, dynamic> root, String name) {
      final Map<String, dynamic> srgb =
          _token(root, name)['srgb']! as Map<String, dynamic>;
      return <num>[
        srgb['r']! as num,
        srgb['g']! as num,
        srgb['b']! as num,
        srgb['alpha']! as num,
      ];
    }

    test(
      'AppIconButtons holds exactly the measured icon classes, per pass',
      () {
        expect(AppIconButtons.light.keys.toList(), iconClasses);
        expect(AppIconButtons.dark.keys.toList(), iconClasses);
      },
    );

    for (final String cls in iconClasses) {
      for (final Brightness brightness in Brightness.values) {
        final String pass = brightness == Brightness.light
            ? 'light-desktop'
            : 'dark-desktop';

        test('$cls $pass matches the pill Chrome measured', () {
          final Map<String, dynamic> p = _probe(
            probesFor(brightness),
            cls,
            pass,
          );
          final AppIconButtonSpec spec = AppIconButtons.resolve(
            cls,
            brightness,
          );
          expect(spec.cssClass, cls);
          expect(spec.displayCss, _probeValue(p, 'display', cls));
          expect(
            spec.radiusPx,
            _pxOf(_probeValue(p, 'borderRadius', cls), '$cls radius'),
          );
          expect(
            spec.borderWidthPx,
            _pxOf(_probeValue(p, 'borderTopWidth', cls), '$cls border width'),
          );
          expect(spec.borderColor, _probeColour(p, 'borderTopColor', cls));
          expect(spec.fillColor, _probeColour(p, 'backgroundColor', cls));
          expect(spec.iconColor, _probeColour(p, 'color', cls));
          expect(
            spec.paddingPx,
            _pxOf(_probeValue(p, 'padding', cls), '$cls padding'),
          );
          // The pill blurs without saturating, so the shared
          // `_BackdropExpectation` — which demands both together — is the wrong
          // reader here; the blur is matched alone and the absence of a
          // saturate is itself an assertion.
          final RegExpMatch? blur = RegExp(r'^blur\(([\d.]+)px\)$')
              .firstMatch(_probeValue(p, 'backdropFilter', cls));
          expect(
            blur,
            isNotNull,
            reason:
                '$cls backdrop-filter must be a bare blur(): the port carries '
                'a blur-only filter and a saturate() would be a different shape',
          );
          expect(spec.blurPx, double.parse(blur!.group(1)!));
          expect(
            spec.blurSaturate,
            isNull,
            reason: '$cls blurs without saturating',
          );
          expect(
            spec.blurSigmaPx,
            spec.blurPx / 2,
            reason: 'CSS blur radius → Flutter sigma: halved, not chosen',
          );
          expect(
            _probeValue(p, 'boxShadow', cls),
            'none',
            reason:
                '$cls rests with nothing painted behind it; no §6 row ports a resting shadow',
          );
          expect(
            _probeValue(p, 'backgroundImage', cls),
            'none',
            reason: '$cls has a flat color-mix fill, not a gradient',
          );
        });
      }

      test('$cls keeps one row between the desktop and phone passes', () {
        const List<String> fields = <String>[
          'display',
          'padding',
          'borderRadius',
          'borderTopWidth',
          'borderTopColor',
          'backgroundColor',
          'color',
          'boxShadow',
          'backgroundImage',
          'backdropFilter',
        ];
        const List<List<String>> pairs = <List<String>>[
          <String>['light-phone', 'light-desktop'],
          <String>['dark-phone', 'dark-desktop'],
        ];
        for (final List<String> pair in pairs) {
          final Map<String, dynamic> phone = pair[0] == 'light-phone'
              ? lightPhoneProbes
              : darkPhoneProbes;
          final Map<String, dynamic> desktop = pair[0] == 'light-phone'
              ? lightProbes
              : darkProbes;
          for (final String field in fields) {
            expect(
              _probeValue(_probe(phone, cls, pair[0]), field, cls),
              _probeValue(_probe(desktop, cls, pair[1]), field, cls),
              reason:
                  '${pair[0]} moves $field for $cls and AppIconButtons ports '
                  'one row per brightness to paint it from',
            );
          }
        }
      });

      test('$cls geometry is one row across the light and dark passes', () {
        final AppIconButtonSpec lightSpec = AppIconButtons.resolve(
          cls,
          Brightness.light,
        );
        final AppIconButtonSpec darkSpec = AppIconButtons.resolve(
          cls,
          Brightness.dark,
        );
        for (final Object? Function(AppIconButtonSpec) read
            in <Object? Function(AppIconButtonSpec)>[
              (AppIconButtonSpec s) => s.displayCss,
              (AppIconButtonSpec s) => s.sizePx,
              (AppIconButtonSpec s) => s.radiusPx,
              (AppIconButtonSpec s) => s.borderWidthPx,
              (AppIconButtonSpec s) => s.paddingPx,
              (AppIconButtonSpec s) => s.blurPx,
              (AppIconButtonSpec s) => s.blurSaturate,
            ]) {
          expect(
            read(lightSpec),
            read(darkSpec),
            reason:
                '$cls: only the colours change between the schemes; §6 prints '
                'one geometry row, so anything else must not move either',
          );
        }
      });

      test('$cls size and colours come from the pinned rule, not a guess', () {
        final Map<String, String> rest = _cssDecls(cssLines, '$cls {', cls);
        // Every property `.icon-btn` authors is either carried by
        // AppIconButtonSpec or consciously dropped (the centring pair, cursor,
        // flex-shrink and the -webkit- alias). This line catches a NEW property
        // slipping into the rule unaccounted for.
        expect(
          rest.keys.toSet().difference(<String>{
            'display',
            'align-items',
            'justify-content',
            'width',
            'height',
            'border-radius',
            'background',
            'border',
            'color',
            'cursor',
            'flex-shrink',
            'backdrop-filter',
            '-webkit-backdrop-filter',
            'transition',
          }),
          isEmpty,
          reason:
              '$cls authors a property AppIconButtons can neither hold nor account for',
        );
        // The size is authored, not measured: the probe carries no width.
        expect(
          rest['width'],
          rest['height'],
          reason: '$cls draws one square pill, so width and height must agree',
        );
        for (final Brightness brightness in Brightness.values) {
          final AppIconButtonSpec spec = AppIconButtons.resolve(
            cls,
            brightness,
          );
          final Map<String, dynamic> root = rootFor(brightness);
          expect(
            spec.sizePx,
            _pxOf(rest['width']!, '$cls width'),
            reason:
                '$cls width is an authored length and the port squares the box to it',
          );
          expect(
            spec.size,
            Size(spec.sizePx, spec.sizePx),
            reason: 'the pill is square',
          );
          expect(spec.radiusPx, _pxOf(rest['border-radius']!, '$cls radius'));
          // radius ≥ half the box is a full circle — which is why every border
          // pixel is anti-aliased and the widget test samples the ring on-axis.
          expect(
            spec.radiusPx >= spec.sizePx / 2,
            isTrue,
            reason: '$cls is drawn as a full circle',
          );

          final RegExpMatch? border = RegExp(
            r'^([\d.]+)px solid var\((--[a-z0-9-]+)\)$',
          ).firstMatch(rest['border']!);
          expect(
            border,
            isNotNull,
            reason:
                '${rest['border']} is not `Npx solid var(--token)`; the port '
                'paints a uniform solid ring',
          );
          expect(spec.borderWidthPx, double.parse(border!.group(1)!));
          expect(
            spec.borderColor,
            _measuredColour(root, border.group(2)!),
            reason:
                '$cls: the authored border token and the probe are one colour',
          );

          final RegExpMatch? inkVar = RegExp(r'^var\((--[a-z0-9-]+)\)$')
              .firstMatch(rest['color']!);
          expect(
            inkVar,
            isNotNull,
            reason: '${rest['color']} is not a bare token',
          );
          expect(
            spec.iconColor,
            _measuredColour(root, inkVar!.group(1)!),
            reason:
                '$cls: the authored icon token and the probe are one colour',
          );

          // The fill is a translucent color-mix, so the token it mixes, the
          // mix percentage and the measured alpha must agree with each other —
          // this is what proves the port kept the pill translucent rather than
          // flattening it to an opaque surface.
          final RegExpMatch? mix = RegExp(
            r'^color-mix\(in srgb, var\((--[a-z0-9-]+)\) ([\d.]+)%, transparent\)$',
          ).firstMatch(rest['background']!);
          expect(
            mix,
            isNotNull,
            reason:
                '${rest['background']} is not '
                '`color-mix(in srgb, var(--token) N%, transparent)`',
          );
          final List<num> base = srgbInts(root, mix!.group(1)!);
          final double mixAlpha = double.parse(mix.group(2)!) / 100.0;
          expect(
            mixAlpha,
            lessThan(1.0),
            reason:
                '$cls fill is a partial mix with transparent, so it is translucent',
          );
          expect(
            spec.fillColor,
            Color.fromRGBO(
              base[0].round(),
              base[1].round(),
              base[2].round(),
              mixAlpha,
            ),
            reason:
                '$cls: the fill is the mix token’s colour at the mix percentage '
                'as alpha, and that alpha is the whole point of the translucent pill',
          );

          final RegExpMatch? bd = RegExp(r'^blur\(([\d.]+)px\)$')
              .firstMatch(rest['backdrop-filter']!);
          expect(
            bd,
            isNotNull,
            reason: '${rest['backdrop-filter']} is not a bare blur()',
          );
          expect(
            spec.blurPx,
            double.parse(bd!.group(1)!),
            reason: '$cls: the authored blur and the probe are one radius',
          );
        }
      });

      test('$cls hover is decoration only, which is why D-U1 drops it', () {
        final Map<String, String> hover = _cssDecls(
          cssLines,
          '$cls:hover {',
          cls,
        );
        // Hover touches colour and paint only — no size, radius or blur — so on
        // a touch screen (no pointer to hover) dropping it is safe. If this rule
        // ever authors a geometry property, that assumption is no longer true
        // and the drop needs re-justifying.
        expect(
          hover.keys.toSet().difference(<String>{
            'color',
            'border-color',
            'background',
          }),
          isEmpty,
          reason:
              '$cls:hover authors a non-decorative property; UI_SPEC D-U1 '
              'dropped it on the assumption hover was paint-only',
        );
      });
    }

    test('the unmeasured .glass-pill context is a finding, not a number', () {
      // `.glass-pill .icon-btn` shrinks the pill and drops its fill/border
      // inside the header glass pill. The §6 probe measured the standalone
      // `.icon-btn` element, not that descendant, so AppIconButtons can only
      // carry the standalone pill. This test pins the descendant’s existence so
      // the gap is visible in the suite rather than silently omitted.
      final Map<String, String> pill = _cssDecls(
        cssLines,
        '.glass-pill .icon-btn {',
        '.icon-btn',
      );
      expect(
        _pxOf(pill['width']!, 'glass-pill icon width'),
        lessThan(AppIconButtons.resolve('.icon-btn', Brightness.light).sizePx),
        reason:
            'the glass-pill context makes a smaller pill than the measured '
            'standalone; being unmeasured it is recorded as a finding, not ported',
      );
    });

    test('an unknown icon class is an error, not a Material default', () {
      for (final Brightness brightness in Brightness.values) {
        expect(
          () => AppIconButtons.resolve('.btn-primary', brightness),
          throwsArgumentError,
          reason:
              'a button is a measured §6 class but not an icon pill: '
              'AppIconButtons refusing it keeps the header chrome from quietly '
              'becoming a filled button',
        );
        expect(
          () => AppIconButtons.resolve('.no-such-icon', brightness),
          throwsArgumentError,
        );
      }
    });
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
