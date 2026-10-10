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
import 'package:em_budget/core/theme/app_navs.dart';
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
    ///
    /// The second row AppIconButtons carries is not a probe but a composition:
    /// `.glass-pill .icon-btn` refines the standalone pill with four literal
    /// declarations and inherits every field the rule does not author, so it
    /// rides the same evidence tier the nav bar’s authored placement numbers
    /// ride — pinned rule text over a measured base, never a guess.
    const List<String> iconClasses = <String>['.icon-btn'];
    const String iconPillClass = '.glass-pill .icon-btn';

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

    test('AppIconButtons holds the measured pill and its composed context, per pass', () {
      final List<String> rows = <String>[...iconClasses, iconPillClass];
      expect(AppIconButtons.light.keys.toList(), rows);
      expect(AppIconButtons.dark.keys.toList(), rows);
    });

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

    test('the .glass-pill context is composed, and only from four literals', () {
      // The descendant rule is the whole evidence for the fields it changes —
      // and it must stay a closed set. A fifth declaration would mean the
      // generated row silently ignored part of the web’s pill-context button;
      // a vanished one, that the port paints something the web no longer does.
      final Map<String, String> pill = _cssDecls(
        cssLines,
        '.glass-pill .icon-btn {',
        iconPillClass,
      );
      expect(
        pill.keys.toSet(),
        <String>{'width', 'height', 'background', 'border-color'},
        reason:
            'AppIconButtons composes the header context from exactly these '
            'four authored declarations; the row does not carry anything else',
      );
      expect(
        pill['width'],
        pill['height'],
        reason: 'the context stays a square, so the port squares the box to it',
      );
      expect(pill['background'], 'transparent');
      expect(pill['border-color'], 'transparent');
      for (final Brightness brightness in Brightness.values) {
        final AppIconButtonSpec base = AppIconButtons.resolve(
          '.icon-btn',
          brightness,
        );
        final AppIconButtonSpec spec = AppIconButtons.resolve(
          iconPillClass,
          brightness,
        );
        expect(spec.cssClass, iconPillClass);
        expect(spec.sizePx, _pxOf(pill['width']!, '$iconPillClass width'));
        expect(
          spec.sizePx < base.sizePx,
          isTrue,
          reason: 'the descendant shrinks the pill inside the header pill',
        );
        // §6’s column convention: a transparent *border* still occupies its
        // width — the frame is inherited, only its colour becomes nothing.
        expect(spec.fillColor, _parseRgba(pill['background']!));
        expect(spec.borderColor, _parseRgba(pill['border-color']!));
        expect(spec.borderWidthPx, base.borderWidthPx);
        // Everything the rule leaves alone keeps the probe’s value — that is
        // what composition means, pinned field by field rather than assumed.
        expect(spec.iconColor, base.iconColor);
        expect(spec.radiusPx, base.radiusPx);
        expect(spec.paddingPx, base.paddingPx);
        expect(
          spec.blurPx,
          base.blurPx,
          reason:
              'the untouched backdrop-filter keeps blurring: the pill-context '
              'icon frosts what is behind it while painting no fill of its own',
        );
        expect(spec.blurSaturate, base.blurSaturate);
        expect(spec.displayCss, base.displayCss);
      }
    });

    test(
      '.glass-pill .icon-btn:hover is paint-only, so D-U1 still drops it',
      () {
        final Map<String, String> hover = _cssDecls(
          cssLines,
          '.glass-pill .icon-btn:hover {',
          '$iconPillClass hover',
        );
        expect(
          hover.keys.toSet().difference(<String>{'background', 'border-color'}),
          isEmpty,
          reason:
              'the context hover authors geometry or ink beyond paint; D-U1 '
              'dropped it on the assumption it was decoration only',
        );
      },
    );

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

  group('UI_SPEC 6 nav', () {
    /// The phone floating-nav family: the bar, one tab, the selected tab and
    /// the raised centre action. The generator reads these rows from the PHONE
    /// passes (desktop hides the bar behind a `display: none` media rule at
    /// `src/index.css:1168`), and the active row from the COMPOSED
    /// `.nav-item.nav-item-active` probe — the bare `.nav-item-active` probe
    /// measures a class nothing ever writes alone. Both choices are pinned
    /// here against the JSON, not trusted from the generator.
    const List<String> navClasses = <String>[
      '.floating-nav',
      '.nav-item',
      '.nav-item-active',
      '.nav-fab',
    ];
    const Map<String, String> navGeometryProbe = <String, String>{
      '.nav-item-active': '.nav-item.nav-item-active',
    };

    Map<String, dynamic> phoneProbes(Brightness brightness) =>
        brightness == Brightness.light ? lightPhoneProbes : darkPhoneProbes;
    Map<String, dynamic> phoneRoot(Brightness brightness) => _rootOf(
      _theme(
        measurement,
        brightness == Brightness.light ? 'light-phone' : 'dark-phone',
      ),
    );

    Map<String, dynamic> navProbe(Map<String, dynamic> probes, String cls) =>
        _probe(probes, navGeometryProbe[cls] ?? cls, 'nav');

    /// The symmetric `padding` shorthand as the pair the spec carries.
    List<double> navPadding(Map<String, dynamic> probe, String cls) {
      final List<String> parts = _probeValue(
        probe,
        'padding',
        cls,
      ).split(RegExp(r'\s+'));
      final List<double> n = parts.map((String p) => _cssLength(p)).toList();
      final double top = n[0];
      final double right = n.length > 1 ? n[1] : top;
      final double bottom = n.length > 2 ? n[2] : top;
      final double left = n.length > 3 ? n[3] : right;
      if (top != bottom || left != right) {
        throw StateError('$cls: asymmetric padding the port does not model');
      }
      return <double>[top, left];
    }

    /// Declarations of a rule whose head is a GROUPED selector. The active
    /// hover is written `.nav-item-active:hover,\n.nav-item-active:focus-visible
    /// {`, and [_cssDecls] — which starts reading at the line AFTER the head —
    /// parses the selector continuation as if it were a declaration. This reads
    /// from the head itself and skips every line that ends the selector rather
    /// than a declaration.
    Map<String, String> navRule(
      List<String> lines,
      String headLine,
      String cls,
    ) {
      final int start = lines.indexOf(headLine);
      if (start < 0) {
        throw StateError('$cls: no rule head "$headLine" in src/index.css');
      }
      final Map<String, String> decls = <String, String>{};
      for (int j = start; j < lines.length; j++) {
        final String line = lines[j].trim();
        if (line.endsWith('{') || line.endsWith(',')) continue;
        for (final String part in line.split(';')) {
          final int colon = part.indexOf(':');
          if (colon <= 0) continue;
          decls[part.substring(0, colon).trim()] = part
              .substring(colon + 1)
              .trim();
        }
        if (line.contains('}')) return decls;
      }
      throw StateError('$cls: rule at "$headLine" never closes');
    }

    test('AppNavs holds exactly the measured nav classes, per pass', () {
      expect(AppNavs.light.keys.toList(), navClasses);
      expect(AppNavs.dark.keys.toList(), navClasses);
    });

    for (final Brightness brightness in Brightness.values) {
      final String pass = brightness == Brightness.light
          ? 'light-phone'
          : 'dark-phone';

      test(
        'the $pass rows match the phone probes Chrome measured, field by field',
        () {
          final Map<String, dynamic> probes = phoneProbes(brightness);
          for (final String cls in navClasses) {
            final Map<String, dynamic> p = navProbe(probes, cls);
            final AppNavSpec spec = AppNavs.resolve(cls, brightness);
            expect(spec.cssClass, cls);
            expect(
              spec.displayCss,
              _probeValue(p, 'display', cls),
              reason: '$pass $cls display',
            );
            expect(
              spec.position,
              _probeValue(p, 'position', cls),
              reason: '$pass $cls position',
            );
            expect(
              spec.radiusPx,
              _pxOf(_probeValue(p, 'borderRadius', cls), '$cls radius'),
            );
            expect(
              spec.borderWidthPx,
              _pxOf(_probeValue(p, 'borderTopWidth', cls), '$cls border width'),
            );
            expect(
              spec.borderColor,
              _probeColour(p, 'borderTopColor', cls),
              reason: '$pass $cls border colour',
            );
            expect(
              spec.fillColor,
              _probeColour(p, 'backgroundColor', cls),
              reason: '$pass $cls fill',
            );
            expect(
              spec.fgColor,
              _probeColour(p, 'color', cls),
              reason: '$pass $cls ink',
            );
            final List<double> pad = navPadding(p, cls);
            expect(
              spec.paddingVerticalPx,
              pad[0],
              reason: '$pass $cls padding v',
            );
            expect(
              spec.paddingHorizontalPx,
              pad[1],
              reason: '$pass $cls padding h',
            );
            // Backdrop: the bar blurs AND saturates (the shared
            // `_BackdropExpectation` shape); every other row measured `none`,
            // which the port carries as blurPx 0.0 with sigma null — a
            // measured absence, never a widget’s choice.
            final String backdrop = _probeValue(p, 'backdropFilter', cls);
            if (backdrop == 'none') {
              expect(spec.blurPx, 0.0, reason: '$pass $cls measured no filter');
              expect(spec.blurSaturate, isNull);
              expect(
                spec.blurSigmaPx,
                isNull,
                reason: '$cls must not blur what measured none',
              );
            } else {
              final _BackdropExpectation want = _BackdropExpectation.measure(
                p,
                cls,
              );
              expect(spec.blurPx, want.blurPx, reason: '$pass $cls blur');
              expect(
                spec.blurSaturate,
                want.saturate,
                reason: '$pass $cls saturate travels as recorded data',
              );
              expect(
                spec.blurSigmaPx,
                want.blurPx! / 2,
                reason:
                    '$cls CSS blur radius → sigma, the port’s fixed mapping',
              );
            }
            final List<BoxShadow> layers = _probeShadowLayers(p, cls);
            if (layers.isEmpty) {
              expect(spec.shadows, isNull, reason: '$pass $cls measured none');
            } else {
              expect(spec.shadows!, layers, reason: '$pass $cls shadow list');
            }
            expect(
              _probeValue(p, 'backgroundImage', cls),
              'none',
              reason: '$pass $cls carries no gradient under the flat fill',
            );
            // Type follows authorship: only `.nav-item` (and so the composed
            // active row) writes font properties; the bar and the fab carry
            // nulls because the measurement was never theirs to make.
            final bool authoredType =
                cls == '.nav-item' || cls == '.nav-item-active';
            if (authoredType) {
              expect(
                spec.fontFamily,
                (_probeValue(
                  p,
                  'fontFamily',
                  cls,
                ).split(',').first).replaceAll(RegExp('["]'), '').trim(),
                reason: '$pass $cls first family of the measured stack',
              );
              expect(
                spec.fontSizePx,
                _pxOf(_probeValue(p, 'fontSize', cls), '$cls font size'),
              );
              expect(
                spec.fontWeight,
                int.parse(_probeValue(p, 'fontWeight', cls)),
              );
              expect(
                spec.lineHeightPx,
                _pxOf(_probeValue(p, 'lineHeight', cls), '$cls line height'),
                reason: '$cls line height is measured, not authored',
              );
              expect(
                spec.letterSpacingPx,
                _pxOf(
                  _probeValue(p, 'letterSpacing', cls),
                  '$cls letter spacing',
                ),
              );
            } else {
              expect(
                spec.fontFamily,
                isNull,
                reason: '$pass $cls authors no type',
              );
              expect(spec.fontSizePx, isNull);
              expect(spec.fontWeight, isNull);
              expect(spec.lineHeightPx, isNull);
              expect(spec.letterSpacingPx, isNull);
            }
          }
        },
      );
    }

    test(
      'the bar is a phone surface: the media split is measured, not assumed',
      () {
        // Desktop probe displays none, phone probe displays flex — and the
        // generated row carries the FLEX, because the port is the phone. The
        // hiding itself is the indented rule inside the 1024px media block.
        final int hiddenAt = cssLines.indexWhere(
          (String l) => RegExp(r'^\s+\.floating-nav \{$').hasMatch(l),
        );
        expect(
          hiddenAt,
          isNonNegative,
          reason: 'no indented .floating-nav rule',
        );
        // The untrimmed line is the lookup key: the FIRST `.floating-nav {` is
        // the unindented authoring, the indented one inside the 1024px block is
        // the hide, and _cssDecls takes the exact head string.
        final Map<String, String> hide = _cssDecls(
          cssLines,
          cssLines[hiddenAt],
          '.floating-nav',
        );
        expect(
          hide['display'],
          'none',
          reason: 'src/index.css:${hiddenAt + 1} must be the display:none hide',
        );
        expect(
          _probeValue(
            _probe(
              _probesOf(_theme(measurement, 'light-desktop')),
              '.floating-nav',
              'light-desktop',
            ),
            'display',
            '.floating-nav',
          ),
          'none',
        );
        expect(
          AppNavs.resolve('.floating-nav', Brightness.light).displayCss,
          'flex',
        );
        // Everything the row carries beyond display agrees between passes —
        // except the bar, whose agreement was just split on purpose.
        for (final List<String> pair in <List<String>>[
          <String>['light-phone', 'light-desktop'],
          <String>['dark-phone', 'dark-desktop'],
        ]) {
          final Map<String, dynamic> phone = _probesOf(
            _theme(measurement, pair[0]),
          );
          final Map<String, dynamic> desk = _probesOf(
            _theme(measurement, pair[1]),
          );
          for (final String cls in navClasses) {
            final Map<String, dynamic> f = navProbe(phone, cls);
            final Map<String, dynamic> d = navProbe(desk, cls);
            for (final String field in <String>[
              'position',
              'color',
              'backgroundColor',
              'borderTopColor',
              'borderTopWidth',
              'boxShadow',
              'backdropFilter',
              'borderRadius',
              'padding',
              'fontSize',
              'fontWeight',
              'letterSpacing',
              'lineHeight',
              'fontFamily',
            ]) {
              expect(
                _probeValue(d, field, cls),
                _probeValue(f, field, cls),
                reason: '$cls $field moves between ${pair[1]} and ${pair[0]}',
              );
            }
            final String deskDisplay = _probeValue(d, 'display', cls);
            if (cls == '.floating-nav') {
              expect(deskDisplay, 'none');
            } else {
              expect(
                deskDisplay,
                _probeValue(f, 'display', cls),
                reason: '$cls display moves between ${pair[1]} and ${pair[0]}',
              );
            }
          }
        }
      },
    );

    test('.nav-item-active is the composed colour-only override of .nav-item', () {
      // The generator refuses a row whose non-colour fields moved; the drift
      // check here is that the REFUSAL has teeth: against the probes, the
      // composed active row equals the item row in every measured field except
      // `color` — and `borderTopColor` only follows it because both classes
      // leave the border colour at its computed initial value, currentColor.
      for (final Brightness brightness in Brightness.values) {
        final Map<String, dynamic> probes = phoneProbes(brightness);
        final Map<String, dynamic> item = navProbe(probes, '.nav-item');
        final Map<String, dynamic> active = navProbe(
          probes,
          '.nav-item-active',
        );
        final AppNavSpec itemSpec = AppNavs.resolve('.nav-item', brightness);
        final AppNavSpec activeSpec = AppNavs.resolve(
          '.nav-item-active',
          brightness,
        );
        expect(
          _probeValue(active, 'color', '.nav-item-active') ==
              _probeValue(item, 'color', '.nav-item'),
          isFalse,
          reason: 'the active ink must differ from the resting ink',
        );
        for (final String field in <String>[
          'display',
          'position',
          'borderTopWidth',
          'backgroundColor',
          'boxShadow',
          'backdropFilter',
          'borderRadius',
          'padding',
          'fontSize',
          'fontWeight',
          'letterSpacing',
          'lineHeight',
          'fontFamily',
        ]) {
          expect(
            _probeValue(active, field, '.nav-item-active'),
            _probeValue(item, field, '.nav-item'),
            reason: 'active differs in $field; the class is colour-only',
          );
        }
        // The bare probe — the class on an element of its own — still carries
        // the same colour the composed row paints: the one field the class
        // changes is the one field it changes identically.
        expect(
          _probeColour(
            _probe(probes, '.nav-item-active', 'nav-bare'),
            'color',
            '.nav-item-active',
          ),
          activeSpec.fgColor,
        );
        // currentColor chase: an unauthored border paints the ink.
        expect(
          activeSpec.borderColor,
          activeSpec.fgColor,
          reason: 'the active frame should follow the active ink',
        );
        expect(
          itemSpec.borderColor,
          itemSpec.fgColor,
          reason: 'the resting frame should follow the resting ink',
        );
        // And the authored rule really is colour-only.
        expect(
          _cssDecls(cssLines, '.nav-item-active {', '.nav-item-active').keys,
          <String>['color'],
        );
      }
    });

    test('the two brightnesses share one nav geometry, colour by contrast', () {
      Map<String, Object?> stable(AppNavSpec s) => <String, Object?>{
        'display': s.displayCss,
        'position': s.position,
        'radius': s.radiusPx,
        'borderWidth': s.borderWidthPx,
        'blur': s.blurPx,
        'saturate': s.blurSaturate,
        'padV': s.paddingVerticalPx,
        'padH': s.paddingHorizontalPx,
        'family': s.fontFamily,
        'size': s.fontSizePx,
        'weight': s.fontWeight,
        'line': s.lineHeightPx,
        'space': s.letterSpacingPx,
        'minWidth': s.minWidthPx,
        'height': s.heightPx,
        'gap': s.gapPx,
        'lift': s.liftPx,
        'max': s.maxBarWidthPx,
        'edge': s.edgeInsetPx,
        'bottom': s.bottomGapPx,
        'press': s.pressScale,
        'ms': s.transitionMs,
      };
      for (final String cls in navClasses) {
        expect(
          stable(AppNavs.resolve(cls, Brightness.light)),
          stable(AppNavs.resolve(cls, Brightness.dark)),
          reason: '$cls geometry moved with the colour scheme',
        );
        if (cls == '.nav-item' || cls == '.nav-item-active') {
          // The tabs author no `background` at all: on the web they are the
          // bar’s translucent fill showing through, so the measured fill is
          // transparent in BOTH passes — a pair would mean a class had grown a
          // background the CSS does not declare.
          expect(
            AppNavs.resolve(cls, Brightness.light).fillColor,
            AppNavs.resolve(cls, Brightness.dark).fillColor,
            reason: '$cls paints no fill; only its ink is themed',
          );
          expect(
            AppNavs.resolve(cls, Brightness.light).fgColor ==
                AppNavs.resolve(cls, Brightness.dark).fgColor,
            isFalse,
            reason: '$cls ink is identical in both passes: §6.1 prints a pair',
          );
        } else {
          expect(
            AppNavs.resolve(cls, Brightness.light).fillColor ==
                AppNavs.resolve(cls, Brightness.dark).fillColor,
            isFalse,
            reason: '$cls fill is identical in both passes: §6.1 prints a pair',
          );
        }
      }
    });

    for (final Brightness brightness in Brightness.values) {
      final String passName = brightness == Brightness.light ? 'light' : 'dark';
      final Map<String, dynamic> root = phoneRoot(brightness);

      test('the authored $passName nav rules substitute to the emitted rows', () {
        final Map<String, String> bar = _cssDecls(
          cssLines,
          '.floating-nav {',
          '.floating-nav',
        );
        final AppNavSpec barSpec = AppNavs.resolve('.floating-nav', brightness);
        expect(
          bar['bottom'],
          'calc(12px + env(safe-area-inset-bottom, 0px))',
          reason: 'the bar pins itself 12px over the safe area',
        );
        expect(barSpec.bottomGapPx, _cssLength('12px'));
        expect(bar['width'], 'min(100% - 24px, 460px)');
        expect(barSpec.edgeInsetPx, _cssLength('24px'));
        expect(barSpec.maxBarWidthPx, _cssLength('460px'));
        expect(bar['gap'], '4px');
        expect(barSpec.gapPx, _cssLength('4px'));
        expect(bar['padding'], '8px 10px');
        expect(bar['border-radius'], '999px');
        expect(barSpec.radiusPx, _cssLength('999px'));
        expect(bar['backdrop-filter'], 'blur(22px) saturate(1.5)');
        expect(barSpec.blurPx, 22.0);
        expect(barSpec.blurSaturate, 1.5);
        expect(bar['border'], '1px solid var(--line)');
        expect(barSpec.borderWidthPx, 1.0);
        expect(
          barSpec.borderColor,
          _measuredColour(root, '--line'),
          reason: 'the bar frame is the substituted --line',
        );
        expect(bar['box-shadow'], 'var(--shadow-float)');
        expect(
          barSpec.shadows,
          _boxShadows(root, '--shadow-float'),
          reason: 'the measured bar shadow list is the token’s own layers',
        );
        // background: color-mix(in srgb, var(--surface) 82%, transparent) —
        // rebuilt from the root token at the mix’s own alpha, the same
        // substitution proof AppIconButton carries for its 70% fill.
        expect(bar['background'], isNotNull);
        final RegExpMatch? mix = RegExp(
          r'^color-mix\(in srgb, var\(--([a-z0-9-]+)\) ([\d.]+)%, transparent\)$',
        ).firstMatch(bar['background']!);
        expect(
          mix,
          isNotNull,
          reason: 'bar background is not the authored mix',
        );
        final List<num> base = <num>[
          (_token(root, '--${mix![1]}')['srgb']! as Map<String, dynamic>)['r']!
              as num,
          (_token(root, '--${mix[1]}')['srgb']! as Map<String, dynamic>)['g']!
              as num,
          (_token(root, '--${mix[1]}')['srgb']! as Map<String, dynamic>)['b']!
              as num,
        ];
        final double mixAlpha = double.parse(mix.group(2)!) / 100.0;
        expect(
          barSpec.fillColor,
          Color.fromRGBO(
            base[0].round(),
            base[1].round(),
            base[2].round(),
            mixAlpha,
          ),
          reason:
              'the 82% mix substitutes to the token’s channels at 0.82 — the '
              'bar is translucent exactly as authored',
        );
        expect(barSpec.fillColor.a, lessThan(1.0));

        final Map<String, String> item = _cssDecls(
          cssLines,
          '.nav-item {',
          '.nav-item',
        );
        final AppNavSpec itemSpec = AppNavs.resolve('.nav-item', brightness);
        expect(item['min-width'], '44px');
        expect(itemSpec.minWidthPx, _cssLength('44px'));
        expect(item['height'], '48px');
        expect(itemSpec.heightPx, _cssLength('48px'));
        expect(item['gap'], '2px');
        expect(itemSpec.gapPx, _cssLength('2px'));
        expect(item['padding'], '0 6px');
        expect(item['border-radius'], '999px');
        expect(item['font-size'], '8px');
        expect(itemSpec.fontSizePx, 8.0);
        expect(item['font-weight'], '700');
        expect(itemSpec.fontWeight, 700);
        expect(item['letter-spacing'], '0.02em');
        expect(
          itemSpec.letterSpacingPx,
          closeTo(0.02 * itemSpec.fontSizePx!, 1e-9),
          reason: '0.02em of the authored 8px is the measured 0.16px',
        );
        expect(
          item.containsKey('line-height'),
          isFalse,
          reason: 'the 12px line box is measured, not authored',
        );
        expect(itemSpec.lineHeightPx, 12.0);
        expect(item['color'], 'var(--ink-3)');
        expect(
          itemSpec.fgColor,
          _measuredColour(root, '--ink-3'),
          reason: 'the resting tab ink is the substituted --ink-3',
        );
        expect(
          item['border'],
          isNull,
          reason:
              '.nav-item authors no border: its measured frame is currentColor',
        );
        expect(item['transition'], 'color var(--dur-fast) var(--ease-out)');

        final Map<String, String> active = _cssDecls(
          cssLines,
          '.nav-item-active {',
          '.nav-item-active',
        );
        expect(active['color'], 'var(--accent-fg)');
        expect(
          AppNavs.resolve('.nav-item-active', brightness).fgColor,
          _measuredColour(root, '--accent-fg'),
          reason: 'the selected tab ink is the substituted --accent-fg',
        );

        final Map<String, String> fab = _cssDecls(
          cssLines,
          '.nav-fab {',
          '.nav-fab',
        );
        final AppNavSpec fabSpec = AppNavs.resolve('.nav-fab', brightness);
        expect(fab['width'], fab['height']);
        expect(fabSpec.sizePx, _cssLength(fab['width']!));
        expect(fabSpec.sizePx, 48.0);
        expect(fab['border-radius'], '999px');
        expect(fab['background'], 'var(--accent)');
        expect(
          fabSpec.fillColor,
          _measuredColour(root, '--accent'),
          reason: 'the fab fill is the substituted --accent',
        );
        expect(fab['color'], 'var(--accent-fg)');
        expect(
          fabSpec.fgColor,
          _measuredColour(root, '--accent-fg'),
          reason: 'the fab shares its ink with the selected tab',
        );
        expect(fab['border'], '3px solid var(--bg)');
        expect(fabSpec.borderWidthPx, 3.0);
        expect(
          fabSpec.borderColor,
          _measuredColour(root, '--bg'),
          reason: 'the ring that bites the fab out of the bar is --bg',
        );
        expect(fab['margin-top'], '-14px');
        expect(
          fabSpec.liftPx,
          14.0,
          reason: 'the lift is stored as the positive magnitude it paints',
        );
        // The fab shadow is authored one layer per line, so [_cssDecls] (which
        // splits per line) sees the value end at its first `,`; read the whole
        // rule text and collapse its whitespace to the single line the token
        // substitution would have produced.
        final String fabShadow = RegExp(r'box-shadow:\s*([^;]+);')
            .firstMatch(
              _cssRuleText(
                cssLines,
                '.nav-fab {',
                '.nav-fab',
              ).replaceAll(RegExp(r'\s+'), ' '),
            )!
            .group(1)!
            .trim();
        expect(
          fabShadow,
          'var(--shadow-float), '
          '0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent)',
        );
        final List<BoxShadow> floatLayers = _boxShadows(root, '--shadow-float');
        expect(
          fabSpec.shadows!.length,
          floatLayers.length + 1,
          reason: 'the fab halo rides on top of the bar’s own float shadow',
        );
        expect(
          fabSpec.shadows!.take(floatLayers.length),
          floatLayers,
          reason: 'prefix-equal to the substituted --shadow-float token',
        );
        final Map<String, dynamic> accentSrgb =
            _token(root, '--accent')['srgb']! as Map<String, dynamic>;
        expect(
          fabSpec.shadows!.last,
          BoxShadow(
            color: Color.fromRGBO(
              (accentSrgb['r']! as num).round(),
              (accentSrgb['g']! as num).round(),
              (accentSrgb['b']! as num).round(),
              0.35,
            ),
            offset: Offset.zero,
            blurRadius: 0.0,
            spreadRadius: 2.0,
          ),
          reason: 'the 35% accent halo substitutes, layer and numbers intact',
        );
        expect(
          fab['transition'],
          'transform var(--dur-fast) var(--ease-spring)',
        );
        expect(
          fabSpec.pressDuration,
          _duration(_raw(root, '--dur-fast')),
          reason: 'the fab press runs on the class’s own measured clock',
        );
        final Cubic spring = _cubic(_raw(root, '--ease-spring'));
        expect(
          <double>[
            fabSpec.easeX1!,
            fabSpec.easeY1!,
            fabSpec.easeX2!,
            fabSpec.easeY2!,
          ],
          <double>[spring.a, spring.b, spring.c, spring.d],
          reason:
              '…and on its own spring, which is a curve no widget chose '
              '(Cubic has no value equality, so the four numbers compare)',
        );
        final Map<String, String> fabActive = _cssDecls(
          cssLines,
          '.nav-fab:active {',
          '.nav-fab',
        );
        expect(fabActive['transform'], 'scale(0.92)');
        expect(fabSpec.pressScale, 0.92);
        expect(fabActive.keys, <String>[
          'transform',
        ], reason: 'a second fab press property would need a field it lacks');
      });
    }

    test('the nav hovers are decoration-only, which is why they are droppable', () {
      // D-U1 drops `:hover` on touch only because every rule that carries it
      // touches colour alone. `.nav-item:hover` and the
      // `.nav-item-active:hover/:focus-visible` list must stay checked against
      // that promise — a future geometry hover would be a port gap, not a
      // droppable decoration.
      final Map<String, String> itemHover = navRule(
        cssLines,
        '.nav-item:hover {',
        '.nav-item',
      );
      expect(itemHover.keys, <String>['color']);
      final Map<String, String> activeHover = navRule(
        cssLines,
        '.nav-item-active:hover,',
        '.nav-item-active',
      );
      expect(activeHover.keys, <String>['color']);
      expect(
        activeHover['color'],
        'var(--accent-fg)',
        reason:
            'the active hover re-states the active ink — a no-op the port '
            'does not need to model even on the web',
      );
    });

    test(
      'the desktop chrome that replaces the bar is a finding, not a row',
      () {
        // `.nav-link` (sidebar) and `.nav-pill` (header) are the ≥1024px
        // surfaces. They are authored and probed, but no phone screen writes
        // them, so AppNavs must not carry them — and this test pins that the
        // classes really exist as CSS so the exclusion is a decision, not an
        // oversight.
        expect(
          cssLines.any((String l) => RegExp(r'^\.nav-link \{$').hasMatch(l)),
          isTrue,
        );
        expect(
          cssLines.any((String l) => RegExp(r'^\.nav-pill \{$').hasMatch(l)),
          isTrue,
        );
        expect(AppNavs.light.keys, isNot(contains('.nav-link')));
        expect(AppNavs.dark.keys, isNot(contains('.nav-pill')));
      },
    );

    test('an unknown nav class is an error, not a Material default', () {
      for (final Brightness brightness in Brightness.values) {
        expect(
          () => AppNavs.resolve('.icon-btn', brightness),
          throwsArgumentError,
          reason:
              'the header pill is a measured §6 class but not the navigation: '
              'AppNavs refusing it keeps a tab from quietly becoming chrome',
        );
        expect(
          () => AppNavs.resolve('.no-such-nav', brightness),
          throwsArgumentError,
        );
      }
    });
  });

  group('utility stacks — the #55 toast and confirm rows measured whole', () {
    // The tier the #55 ruling asked for: NotificationContext toasts have no
    // .toast class — their look is a stack of Tailwind utilities written into
    // className strings. Each row puts its verbatim class list on one detached
    // element and reads the computed style against an unclassed control; the
    // JSON carries the source file and line for every fragment so a drift test
    // can re-read the component and prove the slice is still the component's.
    // Nothing here builds a widget: the ruling stops at the measurement.
    final Map<String, dynamic> stacks =
        measurement['utilityStacks']! as Map<String, dynamic>;
    final List<dynamic> rows = stacks['rows']! as List<dynamic>;
    final List<dynamic> nonCss = stacks['authoredNonCss']! as List<dynamic>;
    const List<String> stackPasses = <String>[
      'light-desktop',
      'dark-desktop',
      'light-phone',
      'dark-phone',
    ];

    Map<String, dynamic> record(String pass, String row) {
      final Object? r =
          (_theme(measurement, pass)['stacks']! as Map<String, dynamic>)[row];
      if (r == null) throw StateError('no stack $row in $pass');
      return r as Map<String, dynamic>;
    }

    Map<String, dynamic> props(String pass, String row) =>
        record(pass, row)['props']! as Map<String, dynamic>;

    List<String> changed(String pass, String row) =>
        (record(pass, row)['changed']! as List<dynamic>).cast<String>();

    /// A stack property carrying a colour arrives as {raw, srgb}; this is the
    /// same reader `_measuredColour` uses on root tokens, so a stack colour and
    /// a token colour are compared as the two engine serialisations of one
    /// colour rather than as two hand-parsed strings.
    Color colourOf(Map<String, dynamic> value) {
      final Map<String, dynamic> srgb = value['srgb']! as Map<String, dynamic>;
      return Color.fromRGBO(
        (srgb['r']! as num).round(),
        (srgb['g']! as num).round(),
        (srgb['b']! as num).round(),
        (srgb['alpha']! as num).toDouble(),
      );
    }

    /// The engine-rounded channel ints of any colour-bearing record — a stack
    /// prop or a root token — for comparisons that want the base colour and
    /// the alpha asserted as separate facts (the `/30` and `/60` modifiers).
    List<int> channelsOf(Map<String, dynamic> value) {
      final Map<String, dynamic> srgb = value['srgb']! as Map<String, dynamic>;
      return <int>[
        (srgb['r']! as num).round(),
        (srgb['g']! as num).round(),
        (srgb['b']! as num).round(),
      ];
    }

    /// How Chrome serialises an integer-px computed length, which is what
    /// every utility in these stacks resolves to at the 16px root.
    String px(num n) => n == n.roundToDouble() ? '${n.toInt()}px' : '$n';

    double spacingOf(Map<String, dynamic> root) =>
        _lengthToPx(_raw(root, '--spacing'));

    test('the tier names a source per fragment and every fragment is that source verbatim', () {
      // #56 made the tier multi-file: modal rows carry their own `src`, the
      // top-level `source` is only the fallback for the rows authored before
      // the extension. A part may even cite a different file than its row,
      // so the fallback chain is part.src ?? row.src ?? stacks.source.
      final Map<String, List<String>> fileLines = <String, List<String>>{};
      List<String> linesOf(String src) =>
          fileLines.putIfAbsent(src, () => webSource(src).split('\n'));

      void check(
        Map<String, dynamic> part,
        String textKey,
        String src,
        String name,
      ) {
        final List<String> lines = linesOf(src);
        final int line = (part['line']! as num).toInt();
        expect(
          line,
          inInclusiveRange(1, lines.length),
          reason:
              '$name cites line $line of $src, which has '
              '${lines.length} lines',
        );
        expect(
          lines[line - 1],
          contains(part[textKey]! as String),
          reason:
              'the JSON slice "${part[textKey]}" must still be verbatim at '
              'line $line of $src — the component moved, the tier has to '
              'move with it',
        );
      }

      for (final dynamic rowAny in rows) {
        final Map<String, dynamic> row = rowAny as Map<String, dynamic>;
        final String src = (row['src'] ?? stacks['source'])! as String;
        for (final dynamic p in row['parts']! as List<dynamic>) {
          final Map<String, dynamic> part = p as Map<String, dynamic>;
          check(
            part,
            'cls',
            (part['src'] ?? src)! as String,
            row['name']! as String,
          );
        }
      }
      for (final dynamic entryAny in nonCss) {
        final Map<String, dynamic> entry = entryAny as Map<String, dynamic>;
        final Object? tier = entry['tier'];
        expect(
          <String>['authored-js', 'authored-inline'],
          contains(tier),
          reason:
              '${entry['name']} is tier $tier — JS or an inline style the '
              'port must copy literally, never something to re-measure',
        );
        final String src = (entry['src'] ?? stacks['source'])! as String;
        for (final dynamic p in entry['parts']! as List<dynamic>) {
          final Map<String, dynamic> part = p as Map<String, dynamic>;
          check(
            part,
            'text',
            (part['src'] ?? src)! as String,
            entry['name']! as String,
          );
        }
      }
    });

    test('every pass measured exactly the authored rows', () {
      final Set<String> names = rows
          .map((dynamic r) => (r as Map<String, dynamic>)['name']! as String)
          .toSet();
      expect(names.length, rows.length, reason: 'row names are unique');
      for (final String pass in stackPasses) {
        expect(
          (_theme(measurement, pass)['stacks']! as Map<String, dynamic>).keys
              .toSet(),
          names,
          reason: '$pass measured a different row set than the tier declares',
        );
        for (final String name in names) {
          for (final String key in changed(pass, name)) {
            expect(
              props(pass, name).containsKey(key),
              isTrue,
              reason:
                  '$name in $pass: "changed" named $key, which was never read',
            );
          }
        }
      }
    });

    test(
      'the toast container is the fixed offset flex column its classes say',
      () {
        for (final String pass in stackPasses) {
          final Map<String, dynamic> p = props(pass, 'toast-container');
          final Map<String, dynamic> root = _rootOf(_theme(measurement, pass));
          final double s = spacingOf(root);
          expect(p['position'], 'fixed', reason: '$pass: fixed L73');
          expect(p['display'], 'flex');
          expect(p['flexDirection'], 'column', reason: 'flex-col');
          expect(p['zIndex'], '9999', reason: 'the z-[9999] arbitrary literal');
          expect(p['top'], px(4 * s), reason: 'top-4 is 4×--spacing');
          expect(
            p['right'],
            px(4 * s),
            reason: 'right-4 AND md:right-4 — 16px either way',
          );
          expect(
            p['rowGap'],
            px(2 * s),
            reason: 'gap-2 is 2×--spacing; columnGap travels with it',
          );
          expect(p['columnGap'], px(2 * s));
          if (pass.endsWith('desktop')) {
            expect(
              p['alignItems'],
              'flex-end',
              reason: '$pass (≥1024px): md:items-end is live here',
            );
            expect(
              p['left'],
              isNot(px(4 * s)),
              reason: 'md:left-auto retakes left-4 in this pass',
            );
          } else {
            expect(
              p['alignItems'],
              'center',
              reason:
                  '$pass (390px): the md: variant is silent, items-center wins',
            );
            expect(p['left'], px(4 * s), reason: 'left-4 is unconditional');
          }
        }
      },
    );

    test('the four toast boxes share one measured pill geometry', () {
      const List<String> boxes = <String>[
        'toast-success',
        'toast-error',
        'toast-warning',
        'toast-info',
      ];
      for (final String pass in stackPasses) {
        final Map<String, dynamic> root = _rootOf(_theme(measurement, pass));
        final double s = spacingOf(root);
        for (final String box in boxes) {
          final Map<String, dynamic> p = props(pass, box);
          expect(p['display'], 'flex');
          expect(p['alignItems'], 'center');
          expect(p['padding'], px(4 * s), reason: '$box: p-4 is 4×--spacing');
          expect(p['rowGap'], px(3 * s), reason: 'gap-3');
          expect(
            p['borderRadius'],
            px(_lengthToPx(_raw(root, '--radius-xl'))),
            reason: '$box: rounded-xl is --radius-xl, wherever it points',
          );
          for (final String side in <String>[
            'borderTopWidth',
            'borderRightWidth',
            'borderBottomWidth',
            'borderLeftWidth',
          ]) {
            expect(p[side], '1px', reason: '$box: bare `border` on $side');
          }
          expect(
            p['maxWidth'],
            '300px',
            reason: '$box: the max-w-[300px] arbitrary literal',
          );
          expect(
            p['width'],
            p['maxWidth'],
            reason:
                '$box: w-full is percentage semantics — here it resolves '
                'against the detached parent and lands on the 300px cap',
          );
          expect(
            p['backdropFilter']!['raw'],
            'blur(${px(_lengthToPx(_raw(root, '--blur-sm')))})',
            reason:
                '$box: backdrop-blur-sm is --blur-sm (D-U8 divides later, '
                'the tier records the CSS px)',
          );
        }
      }
    });

    test(
      'the toast type colours are named root tokens at the authored alpha',
      () {
        for (final String pass in stackPasses) {
          final Map<String, dynamic> root = _rootOf(_theme(measurement, pass));
          final Color surface = _measuredColour(root, '--surface');
          for (final String box in <String>[
            'toast-success',
            'toast-error',
            'toast-warning',
            'toast-info',
          ]) {
            expect(
              colourOf(
                props(pass, box)['backgroundColor']! as Map<String, dynamic>,
              ),
              surface,
              reason:
                  '$box: bg-[var(--surface)] is the token, not a palette entry',
            );
          }
          expect(
            colourOf(
              props(pass, 'toast-success')['color']! as Map<String, dynamic>,
            ),
            _measuredColour(root, '--color-emerald-700'),
            reason: 'text-emerald-700 is the palette token this pass measures',
          );
          expect(
            colourOf(
              props(pass, 'toast-warning')['color']! as Map<String, dynamic>,
            ),
            _measuredColour(root, '--color-amber-700'),
          );
          final Color danger = _measuredColour(root, '--danger');
          expect(
            colourOf(
              props(pass, 'toast-error')['color']! as Map<String, dynamic>,
            ),
            danger,
            reason: 'text-[var(--danger)]',
          );
          final Color infoInk = _measuredColour(root, '--ink');
          expect(
            colourOf(
              props(pass, 'toast-info')['color']! as Map<String, dynamic>,
            ),
            infoInk,
            reason:
                'text-[var(--ink)] — quiet in this pass, so absent from '
                '"changed": the control already reads it',
          );
          for (final List<String> pair in <List<String>>[
            <String>['toast-success', '--color-emerald-500'],
            <String>['toast-error', '--danger'],
            <String>['toast-warning', '--color-amber-500'],
          ]) {
            final Map<String, dynamic> borderRec =
                props(pass, pair[0])['borderTopColor']! as Map<String, dynamic>;
            expect(
              channelsOf(borderRec),
              channelsOf(_token(root, pair[1])),
              reason: '${pair[0]}: the /30 border is ${pair[1]}’s channels',
            );
            expect(
              colourOf(borderRec).a,
              closeTo(0.3, 0.002),
              reason: '${pair[0]}: /30 is 30% alpha, and nothing else',
            );
          }
          expect(
            colourOf(
              props(pass, 'toast-info')['borderTopColor']!
                  as Map<String, dynamic>,
            ),
            _measuredColour(root, '--line'),
            reason: 'border-[var(--line)] carries no modifier — alpha 1',
          );
        }
      },
    );

    test('the icon and close inks are their tokens, unmodified', () {
      for (final String pass in stackPasses) {
        final Map<String, dynamic> root = _rootOf(_theme(measurement, pass));
        final Map<String, String> want = <String, String>{
          'toast-icon-success': '--color-emerald-500',
          'toast-icon-error': '--danger',
          'toast-icon-warning': '--color-amber-500',
          'toast-icon-info': '--ink-2',
          'toast-close': '--ink-2',
        };
        for (final MapEntry<String, String> e in want.entries) {
          expect(
            colourOf(props(pass, e.key)['color']! as Map<String, dynamic>),
            _measuredColour(root, e.value),
            reason: '${e.key} paints ${e.value} at full alpha',
          );
        }
      }
    });

    test('dark: and hover: fragments moved nothing in any pass', () {
      // The detached probe never carries the app's html.dark class and the
      // dark OS-preference is not what these passes paint, so dark:text-*
      // fragments answer to nothing here — exactly as darkVariantMatrix found
      // for the utility tier. hover:text-[var(--ink)] needs a pointer the
      // probe has no way to fake. Both are findings, and D-U1 drops hover
      // anyway; what this test pins is that the tier did NOT quietly absorb
      // a value from a fragment that cannot fire in the pass it is recorded in.
      for (final String pass in stackPasses) {
        final Map<String, dynamic> root = _rootOf(_theme(measurement, pass));
        final Color success = colourOf(
          props(pass, 'toast-success')['color']! as Map<String, dynamic>,
        );
        expect(
          success,
          _measuredColour(root, '--color-emerald-700'),
          reason: '$pass: dark:text-emerald-100 is silent — even here',
        );
        expect(success, isNot(_measuredColour(root, '--color-emerald-100')));
        expect(
          colourOf(
            props(pass, 'toast-warning')['color']! as Map<String, dynamic>,
          ),
          isNot(_measuredColour(root, '--color-amber-100')),
          reason: '$pass: dark:text-amber-100 never painted',
        );
        expect(
          colourOf(
            props(pass, 'toast-close')['color']! as Map<String, dynamic>,
          ),
          _measuredColour(root, '--ink-2'),
          reason:
              'the hover target is --ink; the resting state is what was '
              'measured and is what the tier records',
        );
      }
    });

    test('the toast message is the app-overridden --text-sm at its ratio', () {
      for (final String pass in stackPasses) {
        final Map<String, dynamic> root = _rootOf(_theme(measurement, pass));
        final Map<String, dynamic> p = props(pass, 'toast-message');
        expect(
          p['fontSize'],
          _raw(root, '--text-sm'),
          reason:
              'text-sm resolves through the ROOT, where index.css has '
              'overridden Tailwind’s 14px to 15px — the drift test follows '
              'the override instead of hard-coding either',
        );
        expect(
          p['fontWeight'],
          _raw(root, '--font-weight-medium'),
          reason: 'font-medium is --font-weight-medium verbatim',
        );
        expect(
          _lengthToPx(p['lineHeight']! as String),
          closeTo(
            _lengthToPx(_raw(root, '--text-sm')) *
                _ratio(_raw(root, '--text-sm--line-height')),
            0.001,
          ),
          reason:
              '$pass: line-height is calc(1.25 / 0.875) × font-size, '
              'which serialises as 21.4286px at 15px',
        );
      }
    });

    test('the confirm sheet is the overlay/panel pair its classes say', () {
      for (final String pass in stackPasses) {
        final Map<String, dynamic> root = _rootOf(_theme(measurement, pass));
        final double s = spacingOf(root);
        final Map<String, dynamic> o = props(pass, 'confirm-overlay');
        expect(o['position'], 'fixed');
        expect(o['zIndex'], '10000', reason: 'the z-[10000] literal');
        for (final String side in <String>['top', 'right', 'bottom', 'left']) {
          expect(o[side], '0px', reason: 'inset-0 on $side');
        }
        expect(o['alignItems'], 'center');
        expect(o['justifyContent'], 'center');
        expect(o['padding'], px(4 * s), reason: 'p-4');
        final Map<String, dynamic> veilRec =
            o['backgroundColor']! as Map<String, dynamic>;
        expect(
          channelsOf(veilRec),
          channelsOf(_token(root, '--color-black')),
          reason: 'bg-black/60 is --color-black’s channels',
        );
        expect(colourOf(veilRec).a, closeTo(0.6, 0.002), reason: '/60 is 60%');
        expect(
          o['backdropFilter']!['raw'],
          'blur(${px(_lengthToPx(_raw(root, '--blur-sm')))})',
        );

        final Map<String, dynamic> panel = props(pass, 'confirm-panel');
        expect(
          panel['padding'],
          px(6 * s),
          reason: 'p-6 overrode the card’s own padding',
        );
        expect(
          panel['maxWidth'],
          px(_lengthToPx(_raw(root, '--container-sm'))),
          reason: 'max-w-sm is --container-sm',
        );
        expect(panel['width'], panel['maxWidth']);

        expect(
          props(pass, 'confirm-title')['marginBottom'],
          px(2 * s),
          reason: 'mb-2',
        );
        expect(
          props(pass, 'confirm-title')['fontWeight'],
          _raw(root, '--font-weight-bold'),
          reason: 'font-bold',
        );
        expect(
          props(pass, 'confirm-rule')['marginBottom'],
          px(4 * s),
          reason: 'mb-4',
        );
        expect(
          props(pass, 'confirm-message')['marginBottom'],
          px(6 * s),
          reason: 'mb-6',
        );
        expect(
          props(pass, 'confirm-actions')['columnGap'],
          px(3 * s),
          reason: 'gap-3',
        );
        for (final String b in <String>['confirm-cancel', 'confirm-confirm']) {
          expect(props(pass, b)['flexGrow'], '1', reason: '$b: flex-1');
        }
      }
    });

    test('the class-carried stacks equal their §probe twins', () {
      // btn-ghost, btn-primary, card and ledger-rule ARE stylesheet classes with
      // probe rows of their own. If a stack built from them disagrees with the
      // probe — measured six days earlier at the pinned tag — one of the two
      // captures moved, and this test refuses both until it is explained.
      final Map<String, List<String>> twins = <String, List<String>>{
        'confirm-cancel': <String>[
          '.btn-ghost',
          'padding',
          'borderRadius',
          'borderTopWidth',
          'fontSize',
          'fontWeight',
          'lineHeight',
          'color',
          'backgroundColor',
          'borderTopColor',
        ],
        'confirm-confirm': <String>[
          '.btn-primary',
          'padding',
          'borderRadius',
          'borderTopWidth',
          'fontSize',
          'fontWeight',
          'lineHeight',
          'color',
          'backgroundColor',
          'borderTopColor',
        ],
        'confirm-panel': <String>[
          '.card',
          'borderRadius',
          'borderTopWidth',
          'backgroundColor',
          'borderTopColor',
          'boxShadow',
        ],
        'confirm-rule': <String>['.ledger-rule', 'backgroundColor'],
      };
      const List<String> colourKeys = <String>[
        'color',
        'backgroundColor',
        'borderTopColor',
      ];
      for (final String pass in stackPasses) {
        final Map<String, dynamic> probes = _probesOf(
          _theme(measurement, pass),
        );
        twins.forEach((String row, List<String> spec) {
          final String cls = spec[0];
          final Map<String, dynamic> p = props(pass, row);
          final Map<String, dynamic>? probe =
              probes[cls] as Map<String, dynamic>?;
          expect(probe, isNotNull, reason: '$pass lost probe $cls');
          for (final String key in spec.sublist(1)) {
            if (colourKeys.contains(key)) {
              expect(
                colourOf(p[key]! as Map<String, dynamic>),
                colourOf(probe![key]! as Map<String, dynamic>),
                reason: '$row.$key disagrees with $cls in $pass',
              );
            } else if (key == 'boxShadow') {
              expect(
                p[key]!['raw'],
                probe![key]!['raw'],
                reason: '$row.$key disagrees with $cls in $pass',
              );
            } else {
              expect(
                p[key],
                probe![key],
                reason: '$row.$key disagrees with $cls in $pass',
              );
            }
          }
        });
      }
    });

    test(
      'shadow-lg arrives as engine output with no root token to re-derive it',
      () {
        // Tailwind 4.3 inlines shadow utilities: --shadow-lg is not in the
        // measured root, so the box-shadow below is the ONLY copy of the value
        // the tier has. It is recorded as measured, this test pins its shape,
        // and if a future toolchain re-exposes the token the absent-token
        // assertion fails and forces the tier to grow the derivation it lacks.
        for (final String pass in stackPasses) {
          final Map<String, dynamic> root = _rootOf(_theme(measurement, pass));
          expect(
            root.containsKey('--shadow-lg'),
            isFalse,
            reason:
                '$pass: --shadow-lg reappeared in root — this tier’s '
                'engine-only finding is stale; re-read it against the token',
          );
          for (final String box in <String>[
            'toast-success',
            'toast-error',
            'toast-warning',
            'toast-info',
          ]) {
            expect(
              changed(pass, box),
              contains('boxShadow'),
              reason:
                  '$box in $pass: shadow-lg moved nothing, which would '
                  'mean the utility stopped emitting',
            );
            final String raw = props(pass, box)['boxShadow']!['raw']! as String;
            expect(
              raw,
              allOf(
                contains('0px 10px 15px -3px'),
                contains('0px 4px 6px -4px'),
              ),
              reason:
                  '$box: the two Tailwind default shadow-lg layers, '
                  'as the engine serialised them',
            );
          }
        }
      },
    );

    test('authoredNonCss names never collide with measured rows', () {
      // The JS tier is provenance, not measurement: it must stay impossible to
      // read one of these out of themes.<pass>.stacks.
      final Set<String> measured = rows
          .map((dynamic r) => (r as Map<String, dynamic>)['name']! as String)
          .toSet();
      for (final dynamic e in nonCss) {
        expect(
          measured,
          isNot(contains((e as Map<String, dynamic>)['name']! as String)),
        );
      }
      expect(nonCss, isNotEmpty);
    });

    test(
      'the section says when IT was measured, separately from the pinned tiers',
      () {
        expect(stacks['measuredAt'], isA<String>());
        expect(stacks['base'], 'http://localhost:3000');
        expect(stacks['toolchain'], isA<String>());
        expect(
          (stacks['note']! as String),
          contains('THIS section only'),
          reason:
              'the note must keep saying stacks can postdate the pinned '
              'root/probe tiers — that is the provenance caveat of this whole item',
        );
      },
    );
  });

  group('modal/sheet stacks — the #56 family measured whole', () {
    // #56 extended the utility-stack tier from NotificationContext to the six
    // modal/sheet components: each shell tier (veil, shell, panel, header,
    // title, close, grip, body) is one authored class list measured on a
    // detached element against an unclassed control, in all four passes.
    // Rows from the newer files carry their own src; the drift test above
    // re-reads every cited line. Nothing here builds a widget.
    final Map<String, dynamic> stacks =
        measurement['utilityStacks']! as Map<String, dynamic>;
    final List<dynamic> rows = stacks['rows']! as List<dynamic>;
    final String fallbackSource = stacks['source']! as String;
    const List<String> passes = <String>[
      'light-desktop',
      'dark-desktop',
      'light-phone',
      'dark-phone',
    ];

    Map<String, dynamic> record(String pass, String row) {
      final Object? r =
          (_theme(measurement, pass)['stacks']! as Map<String, dynamic>)[row];
      if (r == null) throw StateError('no stack $row in $pass');
      return r as Map<String, dynamic>;
    }

    Map<String, dynamic> props(String pass, String row) =>
        record(pass, row)['props']! as Map<String, dynamic>;

    List<String> changed(String pass, String row) =>
        (record(pass, row)['changed']! as List<dynamic>).cast<String>();

    Color colourOf(Map<String, dynamic> value) {
      final Map<String, dynamic> srgb = value['srgb']! as Map<String, dynamic>;
      return Color.fromRGBO(
        (srgb['r']! as num).round(),
        (srgb['g']! as num).round(),
        (srgb['b']! as num).round(),
        (srgb['alpha']! as num).toDouble(),
      );
    }

    List<int> channelsOf(Map<String, dynamic> value) {
      final Map<String, dynamic> srgb = value['srgb']! as Map<String, dynamic>;
      return <int>[
        (srgb['r']! as num).round(),
        (srgb['g']! as num).round(),
        (srgb['b']! as num).round(),
      ];
    }

    String rawOf(Object? value) =>
        (value! as Map<String, dynamic>)['raw']! as String;

    String px(num n) => n == n.roundToDouble() ? '${n.toInt()}px' : '$n';

    double spacingOf(Map<String, dynamic> root) =>
        _lengthToPx(_raw(root, '--spacing'));

    double viewportH(String pass) =>
        ((_theme(measurement, pass)['viewport']!
                    as Map<String, dynamic>)['height']!
                as num)
            .toDouble();

    double viewportW(String pass) =>
        ((_theme(measurement, pass)['viewport']!
                    as Map<String, dynamic>)['width']!
                as num)
            .toDouble();

    // Chrome serialises rounded-full's calc(infinity * 1px) as this float —
    // recorded verbatim because that is what any reader of the tier sees.
    const String fullRadius = '3.35544e+07px';

    test('the family is 19 toast rows plus 32 rows from six modal files', () {
      final Map<String, int> bySource = <String, int>{};
      for (final dynamic r in rows) {
        final Map<String, dynamic> row = r as Map<String, dynamic>;
        final String src = (row['src'] ?? fallbackSource)! as String;
        bySource[src] = (bySource[src] ?? 0) + 1;
      }
      expect(
        bySource,
        <String, int>{
          'src/context/NotificationContext.tsx': 19,
          'src/components/ui/Modal.tsx': 7,
          'src/components/ui/BottomSheet.tsx': 8,
          'src/components/dashboard/QuickActionModal.tsx': 6,
          'src/components/DebtDetailModal.tsx': 4,
          'src/components/TransactionEditModal.tsx': 4,
          'src/components/SettingsModal.tsx': 3,
        },
        reason:
            'a component joining or leaving the family means the tier '
            'was re-measured against a different source set',
      );
    });

    test('the veils are two recipes: --ink at 40% or black at 60%', () {
      for (final String pass in passes) {
        final Map<String, dynamic> root = _rootOf(_theme(measurement, pass));
        for (final String veil in <String>[
          'modal-veil',
          'sheet-veil',
          'settings-veil',
        ]) {
          final Map<String, dynamic> bg =
              props(pass, veil)['backgroundColor']! as Map<String, dynamic>;
          expect(
            channelsOf(bg),
            channelsOf(_token(root, '--ink')),
            reason: '$veil: bg-[var(--ink)]/40 is the token’s own channels',
          );
          expect(
            colourOf(bg).a,
            closeTo(0.4, 0.002),
            reason: '$veil: /40 is 40% alpha',
          );
          expect(
            rawOf(props(pass, veil)['backdropFilter']),
            'blur(2px)',
            reason: '$veil: the literal backdrop-blur-[2px]',
          );
        }
        for (final String veil in <String>['qa-veil', 'tem-veil']) {
          final Map<String, dynamic> p = props(pass, veil);
          final Map<String, dynamic> bg =
              p['backgroundColor']! as Map<String, dynamic>;
          expect(channelsOf(bg), <int>[
            0,
            0,
            0,
          ], reason: '$veil: bg-black/60 has no token to borrow');
          expect(colourOf(bg).a, closeTo(0.6, 0.002));
          expect(
            rawOf(p['backdropFilter']),
            'blur(${px(_lengthToPx(_raw(root, '--blur-sm')))})',
            reason:
                '$veil: bare backdrop-blur — it lands on the same 8px the '
                '--blur-sm token names, but the class asked for no token',
          );
        }
        final Map<String, dynamic> debt = props(pass, 'debt-veil');
        final Map<String, dynamic> debtBg =
            debt['backgroundColor']! as Map<String, dynamic>;
        expect(channelsOf(debtBg), <int>[0, 0, 0], reason: 'bg-black/60');
        expect(colourOf(debtBg).a, closeTo(0.6, 0.002));
        expect(
          rawOf(debt['backdropFilter']),
          'blur(6px)',
          reason: 'debt-veil: the literal backdrop-blur-[6px]',
        );
        expect(
          props(pass, 'settings-veil')['zIndex'],
          '40',
          reason: 'the drawer veil sits a level under every modal z-50',
        );
      }
    });

    test(
      'the shells are fixed inset frames whose z, padding and anchor vary',
      () {
        for (final String pass in passes) {
          final Map<String, dynamic> root = _rootOf(_theme(measurement, pass));
          final double s = spacingOf(root);
          final bool phone = pass.endsWith('phone');
          for (final String shell in <String>[
            'modal-shell',
            'sheet-shell',
            'qa-shell',
            'tem-shell',
            'debt-veil',
          ]) {
            final Map<String, dynamic> p = props(pass, shell);
            expect(p['position'], 'fixed', reason: '$shell: fixed inset-0');
            for (final String side in <String>[
              'top',
              'right',
              'bottom',
              'left',
            ]) {
              expect(p[side], '0px', reason: '$shell: inset-0 on $side');
            }
            expect(p['display'], 'flex');
            expect(p['justifyContent'], 'center');
            expect(
              p['width'],
              px(viewportW(pass)),
              reason: '$shell: inset-0 spans the recorded viewport',
            );
            expect(p['height'], px(viewportH(pass)));
          }
          expect(props(pass, 'modal-shell')['zIndex'], '50');
          expect(props(pass, 'sheet-shell')['zIndex'], '50');
          expect(props(pass, 'qa-shell')['zIndex'], '50');
          expect(props(pass, 'debt-veil')['zIndex'], '50');
          expect(
            props(pass, 'tem-shell')['zIndex'],
            '200',
            reason:
                'the z-[200] arbitrary literal — the edit modal outranks '
                'every z-50 shell in the app',
          );
          expect(
            props(pass, 'modal-shell')['padding'],
            phone ? px(4 * s) : px(6 * s),
            reason: 'p-4 sm:p-6 — sm is live only on the desktop passes',
          );
          expect(
            props(pass, 'qa-shell')['padding'],
            phone ? '0px' : px(4 * s),
            reason: 'p-0 md:p-4 — md silent at 390px',
          );
          expect(
            props(pass, 'tem-shell')['padding'],
            phone ? '0px' : px(4 * s),
            reason: 'p-0 md:p-4',
          );
          expect(props(pass, 'sheet-shell')['padding'], '0px');
          expect(
            props(pass, 'debt-veil')['padding'],
            px(4 * s),
            reason: 'p-4 with no responsive sibling — 16px either way',
          );
          expect(
            props(pass, 'modal-shell')['alignItems'],
            'center',
            reason: 'items-center is unconditional on the modal shell',
          );
          expect(props(pass, 'debt-veil')['alignItems'], 'center');
          for (final String bottom in <String>[
            'sheet-shell',
            'qa-shell',
            'tem-shell',
          ]) {
            expect(
              props(pass, bottom)['alignItems'],
              phone ? 'flex-end' : 'center',
              reason:
                  '$bottom: items-end becomes sm:/md:items-centre — '
                  'sheet on sm, the two panels on md',
            );
          }
          final Map<String, dynamic> modalShell = props(pass, 'modal-shell');
          expect(modalShell['overflowY'], 'auto', reason: 'overflow-y-auto');
          expect(
            modalShell['overflowX'],
            'auto',
            reason:
                'overflow-x stays visible in the sheet but the engine '
                'computes it auto once the other axis is scrollable',
          );
          expect(
            props(pass, 'sheet-shell')['overflowY'],
            'visible',
            reason: 'sheet-shell authored no overflow utility at all',
          );
        }
      },
    );

    test('the sm:/md: variants sound only in the passes they are live in', () {
      for (final String pass in passes) {
        final Map<String, dynamic> root = _rootOf(_theme(measurement, pass));
        final double s = spacingOf(root);
        final bool phone = pass.endsWith('phone');
        for (final String body in <String>['modal-body', 'sheet-body']) {
          expect(
            props(pass, body)['padding'],
            phone ? px(5 * s) : px(6 * s),
            reason: '$body: p-5 sm:p-6',
          );
        }
        for (final String grip in <String>['sheet-grip', 'tem-grip']) {
          expect(
            props(pass, grip)['display'],
            phone ? 'block' : 'none',
            reason:
                '$grip: the handle is sm:hidden / md:hidden — it only '
                'exists where the panel docks to the bottom edge',
          );
        }
        expect(
          props(pass, 'qa-panel')['maxWidth'],
          phone ? 'none' : px(_lengthToPx(_raw(root, '--container-md'))),
          reason:
              'md:max-w-md — the cap is a container token, and only '
              'from md up',
        );
        expect(
          props(pass, 'tem-panel')['maxWidth'],
          phone ? 'none' : px(_lengthToPx(_raw(root, '--container-sm'))),
          reason: 'md:max-w-sm',
        );
        expect(
          props(pass, 'qa-panel')['borderTopWidth'],
          '1px',
          reason: 'border-t is unconditional',
        );
        expect(
          props(pass, 'qa-panel')['borderLeftWidth'],
          phone ? '0px' : '1px',
          reason: 'md:border — the side borders appear with the variant',
        );
        expect(
          props(pass, 'tem-panel')['borderBottomWidth'],
          phone ? '0px' : '1px',
          reason: 'border-t md:border',
        );
        expect(
          props(pass, 'sheet-panel')['borderRightWidth'],
          phone ? '0px' : '1px',
          reason: 'border-t sm:border',
        );
        expect(
          props(pass, 'qa-panel')['borderRadius'],
          phone ? '24px 24px 0px 0px' : '16px',
          reason:
              'rounded-t-[24px] md:rounded-[16px] — per-corner radii '
              'serialise in tl tr br bl order',
        );
        final double rLg = _lengthToPx(_raw(root, '--r-lg'));
        expect(
          props(pass, 'tem-panel')['borderRadius'],
          phone ? '${px(rLg)} ${px(rLg)} 0px 0px' : px(rLg),
          reason:
              'rounded-t-[var(--r-lg)] md:rounded-[var(--r-lg)] — the '
              'arbitrary token radius resolves identically on both corners '
              'of the pair',
        );
        expect(
          props(pass, 'sheet-panel')['borderRadius'],
          phone ? '16px 16px 0px 0px' : '16px',
          reason: 'rounded-t-2xl sm:rounded-2xl',
        );
      }
    });

    test('the capped panels are viewport fractions, not fixed heights', () {
      final Map<String, double> caps = <String, double>{
        'modal-body': 0.80,
        'sheet-panel': 0.85,
        'qa-panel': 0.90,
        'debt-panel': 0.92,
        'tem-panel': 0.92,
      };
      for (final String pass in passes) {
        caps.forEach((String row, double fraction) {
          expect(
            _lengthToPx(props(pass, row)['maxHeight']! as String),
            closeTo(viewportH(pass) * fraction, 0.05),
            reason:
                '$row in $pass: the vh-family cap re-derived from the '
                'viewport the pass recorded — 92dvh measured the same as '
                '92vh because no browser chrome moved between captures',
          );
        });
      }
    });

    test('modal and debt panels are .card twins; the sheet panel is not', () {
      const List<String> colourKeys = <String>[
        'backgroundColor',
        'borderTopColor',
      ];
      for (final String pass in passes) {
        final Map<String, dynamic> probes = _probesOf(
          _theme(measurement, pass),
        );
        final Map<String, dynamic> card =
            probes['.card']! as Map<String, dynamic>;
        for (final String row in <String>['modal-panel', 'debt-panel']) {
          final Map<String, dynamic> p = props(pass, row);
          expect(
            p['borderRadius'],
            card['borderRadius'],
            reason: '$row carries the card class — its radius is the probe’s',
          );
          expect(p['borderTopWidth'], card['borderTopWidth']);
          for (final String key in colourKeys) {
            expect(
              colourOf(p[key]! as Map<String, dynamic>),
              colourOf(card[key]! as Map<String, dynamic>),
              reason: '$row.$key disagrees with the .card probe in $pass',
            );
          }
          expect(
            rawOf(p['boxShadow']),
            rawOf(card['boxShadow']),
            reason: '$row: the card shadow, byte for byte',
          );
        }
        final Map<String, dynamic> sheet = props(pass, 'sheet-panel');
        final Map<String, dynamic> root = _rootOf(_theme(measurement, pass));
        expect(
          sheet['borderRadius'],
          isNot(props(pass, 'modal-panel')['borderRadius']),
          reason:
              'the utility rounded-2xl is 1rem where .card is bigger — '
              'the sheet is a look-alike, not a card',
        );
        expect(
          sheet['borderRadius'],
          contains(px(_lengthToPx(_raw(root, '--radius-2xl')))),
          reason: 'even the divergent corner is --radius-2xl, re-derived',
        );
        expect(
          root.containsKey('--shadow-2xl'),
          isFalse,
          reason:
              '$pass: --shadow-2xl reappeared in root — the sheet/drawer '
              'shadow was pinned as engine-only output; re-read the finding',
        );
        for (final String row in <String>['sheet-panel', 'settings-drawer']) {
          expect(
            changed(pass, row),
            contains('boxShadow'),
            reason:
                '$row in $pass: shadow-2xl moved nothing, which would '
                'mean the utility stopped emitting',
          );
          expect(
            rawOf(props(pass, row)['boxShadow']),
            contains('rgba(0, 0, 0, 0.25) 0px 25px 50px -12px'),
            reason:
                '$row: the one non-empty layer of the engine-serialised '
                'shadow-2xl, four transparent siblings included',
          );
        }
      }
    });

    test('the settings drawer is the right-edge panel its classes say', () {
      for (final String pass in passes) {
        final Map<String, dynamic> root = _rootOf(_theme(measurement, pass));
        final Map<String, dynamic> p = props(pass, 'settings-drawer');
        expect(p['position'], 'fixed');
        expect(p['top'], '0px');
        expect(p['right'], '0px');
        expect(p['bottom'], '0px');
        expect(p['zIndex'], '50');
        expect(p['display'], 'flex');
        expect(p['flexDirection'], 'column');
        expect(p['borderLeftWidth'], '1px', reason: 'border-l only');
        expect(p['borderTopWidth'], '0px');
        expect(
          colourOf(p['borderLeftColor']! as Map<String, dynamic>),
          _measuredColour(root, '--line'),
        );
        expect(
          colourOf(p['backgroundColor']! as Map<String, dynamic>),
          _measuredColour(root, '--surface'),
        );
        expect(
          p['maxWidth'],
          '600px',
          reason: 'the max-w-[600px] arbitrary literal, both passes',
        );
        if (pass.endsWith('phone')) {
          expect(p['left'], '0px');
          expect(
            p['width'],
            px(viewportW(pass)),
            reason: 'w-full under the cap — the phone drawer IS the screen',
          );
        } else {
          expect(
            p['left'],
            px(viewportW(pass) - 600),
            reason:
                'fixed right-0 + max-w-[600px]: left lands where the '
                'cap pins it',
          );
          expect(p['width'], '600px');
        }
        expect(
          p['height'],
          px(viewportH(pass)),
          reason: 'top-0 bottom-0 spans the recorded viewport',
        );

        final Map<String, dynamic> header = props(pass, 'settings-header');
        final double s = spacingOf(root);
        expect(header['height'], px(14 * s), reason: 'h-14 is 14×--spacing');
        expect(
          header['padding'],
          '0px ${px(6 * s)}',
          reason: 'px-6 with no vertical padding',
        );
        expect(header['borderBottomWidth'], '1px');
        expect(header['flexShrink'], '0', reason: 'shrink-0');
        final Map<String, dynamic> bg =
            header['backgroundColor']! as Map<String, dynamic>;
        expect(
          channelsOf(bg),
          channelsOf(_token(root, '--surface')),
          reason: 'bg-[var(--surface)]/80 is the token’s channels',
        );
        expect(colourOf(bg).a, closeTo(0.8, 0.002));
        expect(
          rawOf(header['backdropFilter']),
          'blur(${px(_lengthToPx(_raw(root, '--blur-sm')))})',
          reason: 'bare backdrop-blur coincides with --blur-sm here',
        );
      }
    });

    test('headers, titles and closes carry spacing multiples and tokens', () {
      for (final String pass in passes) {
        final Map<String, dynamic> root = _rootOf(_theme(measurement, pass));
        final double s = spacingOf(root);
        final double tight = double.parse(
          _raw(root, '--tracking-tight').replaceAll('em', ''),
        );
        for (final String header in <String>['modal-header', 'sheet-header']) {
          final Map<String, dynamic> p = props(pass, header);
          expect(p['display'], 'flex');
          expect(p['alignItems'], 'center');
          expect(p['justifyContent'], 'space-between');
          expect(p['height'], px(12 * s), reason: '$header: h-12');
          expect(p['padding'], '0px ${px(5 * s)}', reason: 'px-5');
          expect(p['borderBottomWidth'], '1px', reason: 'border-b');
          expect(
            colourOf(p['borderTopColor']! as Map<String, dynamic>),
            _measuredColour(root, '--line'),
            reason: '$header: border-[var(--line)]',
          );
        }
        expect(
          colourOf(
            props(pass, 'modal-header')['backgroundColor']!
                as Map<String, dynamic>,
          ),
          _measuredColour(root, '--surface'),
          reason: 'the modal header paints the surface',
        );
        expect(
          colourOf(
            props(pass, 'sheet-header')['backgroundColor']!
                as Map<String, dynamic>,
          ).a,
          0.0,
          reason: 'the sheet header does not — bare border-b carries no bg',
        );
        expect(
          props(pass, 'sheet-header')['flexShrink'],
          '0',
          reason: 'shrink-0 in the column chain',
        );
        expect(
          props(pass, 'sheet-body')['flexGrow'],
          '1',
          reason: 'flex-1 grows the body under the capped panel',
        );

        for (final String title in <String>['modal-title', 'sheet-title']) {
          final Map<String, dynamic> p = props(pass, title);
          expect(
            p['fontSize'],
            '13px',
            reason: '$title: the text-[13px] arbitrary literal',
          );
          expect(
            p['fontWeight'],
            _raw(root, '--font-weight-bold'),
            reason: '$title: font-bold is the token',
          );
          expect(
            _lengthToPx(p['letterSpacing']! as String),
            closeTo(tight * _lengthToPx(p['fontSize']! as String), 0.005),
            reason:
                '$title: tracking-tight is --tracking-tight × THIS '
                'font-size, not the 16px root — the em unit binds to the '
                'element, the tier must not forget that',
          );
        }
        final Map<String, dynamic> qa = props(pass, 'qa-title');
        final double textSm = _lengthToPx(_raw(root, '--text-sm'));
        expect(
          qa['fontSize'],
          px(textSm),
          reason:
              'qa-title: text-sm is --text-sm, the app’s 15px override '
              'of Tailwind’s 14',
        );
        expect(
          qa['fontWeight'],
          _raw(root, '--font-weight-semibold'),
          reason: 'font-semibold',
        );
        expect(
          _lengthToPx(qa['letterSpacing']! as String),
          closeTo(tight * textSm, 0.005),
        );
        expect(
          _lengthToPx(qa['lineHeight']! as String),
          closeTo(textSm * _ratio(_raw(root, '--text-sm--line-height')), 0.005),
          reason: 'text-sm brings its paired line-height token',
        );
        final Map<String, dynamic> debt = props(pass, 'debt-title');
        expect(debt['fontSize'], '18px', reason: 'text-[18px] literal');
        expect(debt['fontWeight'], _raw(root, '--font-weight-bold'));
        expect(
          _lengthToPx(debt['letterSpacing']! as String),
          closeTo(tight * 18, 0.005),
        );
        expect(debt['marginTop'], px(s), reason: 'mt-1');
        expect(debt['whiteSpace'], 'nowrap', reason: 'truncate');
        expect(debt['textOverflow'], 'ellipsis', reason: 'truncate');
        expect(debt['overflowX'], 'hidden', reason: 'truncate');

        for (final String close in <String>['modal-close', 'sheet-close']) {
          final Map<String, dynamic> p = props(pass, close);
          expect(
            p['width'],
            px(7 * s),
            reason: '$close: w-7 h-7 is a 7×--spacing square',
          );
          expect(p['height'], px(7 * s));
          expect(
            p['borderRadius'],
            fullRadius,
            reason: '$close: rounded-full serialises as calc(infinity×1px)',
          );
          expect(
            channelsOf(p['backgroundColor']! as Map<String, dynamic>),
            channelsOf(_token(root, '--surface-2')),
            reason: '$close: bg-[var(--surface-2)]',
          );
          expect(
            colourOf(p['color']! as Map<String, dynamic>),
            _measuredColour(root, '--ink-2'),
            reason:
                '$close: the resting text-[var(--ink-2)] — hover: is a '
                'variant this detached probe cannot enter, so the quiet '
                'reading IS the finding',
          );
          expect(
            colourOf(p['color']! as Map<String, dynamic>),
            isNot(_measuredColour(root, '--ink')),
          );
          expect(p['borderTopWidth'], '1px');
          expect(
            colourOf(p['borderTopColor']! as Map<String, dynamic>),
            _measuredColour(root, '--line'),
          );
        }
        final Map<String, dynamic> qaClose = props(pass, 'qa-close');
        expect(qaClose['width'], px(8 * s), reason: 'w-8 h-8');
        expect(qaClose['height'], px(8 * s));
        expect(qaClose['borderRadius'], fullRadius);
      }
    });

    test('the grips are one pill measured twice, centred per pass', () {
      for (final String pass in passes) {
        final Map<String, dynamic> root = _rootOf(_theme(measurement, pass));
        final double s = spacingOf(root);
        final bool phone = pass.endsWith('phone');
        for (final String grip in <String>['sheet-grip', 'tem-grip']) {
          final Map<String, dynamic> p = props(pass, grip);
          expect(p['width'], px(10 * s), reason: '$grip: w-10');
          expect(p['height'], px(s), reason: '$grip: h-1');
          expect(p['borderRadius'], fullRadius, reason: '$grip: rounded-full');
          expect(
            channelsOf(p['backgroundColor']! as Map<String, dynamic>),
            channelsOf(_token(root, '--line-strong')),
            reason: '$grip: bg-[var(--line-strong)]',
          );
          if (phone) {
            expect(
              p['marginRight'],
              px((viewportW(pass) - 10 * s) / 2),
              reason:
                  '$grip: mx-auto computes to the used side margin '
                  '(390−40)/2 on the phone pass',
            );
          } else {
            expect(
              p['marginRight'],
              'auto',
              reason:
                  '$grip: a display:none element never resolves its auto '
                  'margins — the raw keyword is the honest reading',
            );
          }
        }
        expect(
          props(pass, 'sheet-grip')['marginTop'],
          px(3 * s),
          reason: 'my-3',
        );
        expect(props(pass, 'sheet-grip')['marginBottom'], px(3 * s));
        expect(props(pass, 'tem-grip')['marginTop'], '0px');
        expect(
          props(pass, 'tem-grip')['marginBottom'],
          px(4 * s),
          reason: 'mb-4',
        );
        expect(
          props(pass, 'sheet-grip')['flexShrink'],
          '0',
          reason: 'shrink-0 — only the sheet grip asks for it',
        );
        expect(props(pass, 'tem-grip')['flexShrink'], '1');
      }
    });

    test('the flex chains and overflow readings match the class lists', () {
      for (final String pass in passes) {
        final Map<String, dynamic> root = _rootOf(_theme(measurement, pass));
        final double s = spacingOf(root);
        for (final String column in <String>[
          'sheet-panel',
          'qa-panel',
          'debt-panel',
          'settings-drawer',
        ]) {
          expect(
            props(pass, column)['flexDirection'],
            'column',
            reason: '$column: flex-col',
          );
        }
        for (final String raised in <String>[
          'modal-panel',
          'sheet-panel',
          'qa-panel',
          'tem-panel',
        ]) {
          expect(
            props(pass, raised)['zIndex'],
            '10',
            reason: '$raised: z-10 above the veil',
          );
        }
        expect(
          props(pass, 'debt-panel')['zIndex'],
          'auto',
          reason: 'the debt panel authored no z — it rides DOM order',
        );
        expect(
          props(pass, 'modal-panel')['padding'],
          '0px',
          reason: 'p-0 cancels the card padding',
        );
        expect(
          props(pass, 'modal-panel')['marginTop'],
          px(8 * s),
          reason: 'my-8',
        );
        expect(props(pass, 'modal-panel')['marginBottom'], px(8 * s));
        expect(
          props(pass, 'modal-panel')['maxWidth'],
          px(_lengthToPx(_raw(root, '--container-md'))),
          reason: 'max-w-md is --container-md at the prop default',
        );
        expect(
          props(pass, 'sheet-panel')['maxWidth'],
          px(_lengthToPx(_raw(root, '--container-lg'))),
          reason: 'max-w-lg is --container-lg',
        );
        expect(
          props(pass, 'debt-panel')['maxWidth'],
          '560px',
          reason: 'the max-w-[560px] arbitrary literal',
        );
        final Map<String, dynamic> debtHeader = props(pass, 'debt-header');
        expect(debtHeader['alignItems'], 'flex-start');
        expect(debtHeader['justifyContent'], 'space-between');
        expect(debtHeader['padding'], '${px(5 * s)} ${px(6 * s)} ${px(4 * s)}');
        expect(debtHeader['rowGap'], px(4 * s), reason: 'gap-4');
        expect(debtHeader['flexShrink'], '0', reason: 'shrink-0');
        expect(
          props(pass, 'qa-header')['padding'],
          '0px 0px ${px(4 * s)}',
          reason: 'pb-4 only',
        );
        expect(props(pass, 'qa-header')['borderBottomWidth'], '1px');
        for (final String clipped in <String>[
          'modal-panel',
          'sheet-panel',
          'debt-panel',
        ]) {
          expect(
            props(pass, clipped)['overflowY'],
            'hidden',
            reason: '$clipped: overflow-hidden',
          );
          expect(props(pass, clipped)['overflowX'], 'hidden');
        }
        for (final String scrolled in <String>[
          'modal-body',
          'sheet-body',
          'qa-panel',
          'tem-panel',
        ]) {
          expect(
            props(pass, scrolled)['overflowY'],
            'auto',
            reason: '$scrolled: overflow-y-auto',
          );
        }
        // shadow-[var(--shadow-float)] is theme-dependent: the dark pass
        // redefines the token with three different layers. Each authored
        // layer `offX offY blur colour` serialises as `colour offXpx offYpx
        // blurpx 0px` (spread omitted → 0px), so the layers are re-derived
        // from the token of THIS pass, never pinned to light literals.
        final List<String> floatLayers = _splitTopLevel(
          _raw(root, '--shadow-float'),
        );
        expect(floatLayers, isNotEmpty);
        for (final String panel in <String>['qa-panel', 'tem-panel']) {
          final String panelShadow = rawOf(props(pass, panel)['boxShadow']);
          for (final String layer in floatLayers) {
            final Match? m = RegExp(
              r'^\s*(-?[\d.]+(?:px|em|rem)?)\s+'
              r'(-?[\d.]+(?:px|em|rem)?)\s+'
              r'(-?[\d.]+(?:px|em|rem)?)',
            ).firstMatch(layer);
            expect(m, isNotNull, reason: '$panel: unparsable layer $layer');
            final Match hit = m!;
            String toPx(String v) => v.endsWith('px') ? v : '${v}px';
            final String offsets =
                '${toPx(hit[1]!)} '
                '${toPx(hit[2]!)} ${toPx(hit[3]!)} 0px';
            expect(
              panelShadow,
              contains(offsets),
              reason:
                  '$panel in $pass must carry the $offsets layer that '
                  '--shadow-float names in this pass',
            );
          }
        }
      }
    });

    test('the extended stack props are read in every pass, not just moved', () {
      // The #56 rows asked stackProps for marginTop/marginRight/flexShrink/
      // height/maxHeight/overflowX/overflowY/letterSpacing/whiteSpace/
      // textOverflow. The full readout must carry them wherever they exist,
      // whether or not `changed` lists them — the changed set is movement
      // against the control, the props map is the record.
      const List<String> extended = <String>[
        'marginTop',
        'marginRight',
        'flexShrink',
        'height',
        'maxHeight',
        'overflowX',
        'overflowY',
        'letterSpacing',
        'whiteSpace',
        'textOverflow',
      ];
      final List<String> modalNames = rows
          .map((dynamic r) => (r as Map<String, dynamic>)['name']! as String)
          .where(
            (String name) => !<String>[
              'toast-container',
              'toast-success',
              'toast-error',
              'toast-warning',
              'toast-info',
              'toast-message',
              'toast-close',
              'toast-icon-success',
              'toast-icon-error',
              'toast-icon-warning',
              'toast-icon-info',
              'confirm-overlay',
              'confirm-panel',
              'confirm-title',
              'confirm-rule',
              'confirm-message',
              'confirm-actions',
              'confirm-cancel',
              'confirm-confirm',
            ].contains(name),
          )
          .toList();
      expect(modalNames.length, 32);
      for (final String pass in passes) {
        for (final String name in modalNames) {
          for (final String key in extended) {
            expect(
              props(pass, name).containsKey(key),
              isTrue,
              reason: '$name in $pass has no $key readout',
            );
          }
        }
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
