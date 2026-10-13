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

import 'package:em_budget/core/theme/app_bars.dart';
import 'package:em_budget/core/theme/app_chips.dart';
import 'package:em_budget/core/theme/app_colors.dart';
import 'package:em_budget/core/theme/app_controls.dart';
import 'package:em_budget/core/theme/app_fields.dart';
import 'package:em_budget/core/theme/app_icon_buttons.dart';
import 'package:em_budget/core/theme/app_modals.dart';
import 'package:em_budget/core/theme/app_navs.dart';
import 'package:em_budget/core/theme/app_numerals.dart';
import 'package:em_budget/core/theme/app_radii.dart';
import 'package:em_budget/core/theme/app_rows.dart';
import 'package:em_budget/core/theme/app_segments.dart';
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

      /// The line a fragment cites, or a failure that names the record and the
      /// file rather than a range check that says nothing.
      String readAt(
        Object? line,
        String src,
        String text,
        String name,
        String label,
      ) {
        expect(
          line,
          isNotNull,
          reason: '$label cites no line of $src for "$text"',
        );
        final List<String> lines = linesOf(src);
        final int at = (line! as num).toInt();
        expect(
          at,
          inInclusiveRange(1, lines.length),
          reason:
              '$name cites line $at of $src, which has ${lines.length} lines',
        );
        return lines[at - 1];
      }

      void check(
        Map<String, dynamic> part,
        String textKey,
        String src,
        String name,
      ) {
        final String text = part[textKey]! as String;
        expect(
          readAt(part['line'], src, text, name, name),
          contains(text),
          reason:
              'the JSON slice "$text" must still be verbatim at the line the '
              'tier cites in $src — the component moved, the tier has to move '
              'with it',
        );
      }

      /// An inline-style fragment is not one source line: the probe froze the
      /// declarations the component writes, each with the line it was read from,
      /// plus the table line the tone variable comes off. So the verbatim test
      /// for these is per declaration, and the computed style's custom properties
      /// must all be named by the lines the fragment cites.
      void checkStyle(Map<String, dynamic> part, String src, String name) {
        final List<String> citedTexts = <String>[];
        for (final dynamic sAny
            in (part['styleSrc'] ?? const <dynamic>[]) as List<dynamic>) {
          final Map<String, dynamic> dec = sAny as Map<String, dynamic>;
          citedTexts.add(
            readAt(
              dec['line'],
              src,
              '"${dec['text']}"',
              name,
              '$name ${dec['prop']}',
            ),
          );
          expect(
            citedTexts.last,
            contains(dec['text']! as String),
            reason:
                'the declaration "${dec['text']}" must still be verbatim at '
                'the line $name cites it from in $src',
          );
        }
        final Object? single = part['styleSrcLine'];
        if (single != null) {
          citedTexts.add(
            readAt(single, src, part['style']! as String, name, name),
          );
        }
        final Object? toneVar = part['toneVar'];
        final Object? toneVarLine = part['toneVarLine'];
        if (toneVar != null) {
          expect(
            toneVarLine,
            isNotNull,
            reason:
                '$name gives a tone variable without naming the table line it '
                'was read from',
          );
          final String line = readAt(
            toneVarLine,
            src,
            toneVar as String,
            name,
            name,
          );
          expect(
            line,
            contains(toneVar),
            reason:
                '$name: ${part['tone']} resolves to $toneVar at the line the '
                'record cites, which no longer says so',
          );
          citedTexts.add(line);
        }
        for (final RegExpMatch m in RegExp(
          r'var\((--[a-z0-9-]+)\)',
        ).allMatches(part['style']! as String)) {
          final String token = m.group(1)!;
          expect(
            citedTexts.any((String l) => l.contains(token)),
            isTrue,
            reason:
                '$name computed $token, but none of the lines it cites in $src '
                'names it — the style came from somewhere the record does not '
                'point at',
          );
        }
      }

      for (final dynamic rowAny in rows) {
        final Map<String, dynamic> row = rowAny as Map<String, dynamic>;
        final String src = (row['src'] ?? stacks['source'])! as String;
        for (final dynamic p in row['parts']! as List<dynamic>) {
          final Map<String, dynamic> part = p as Map<String, dynamic>;
          final String name = row['name']! as String;
          expect(
            part['cls'] != null || part['style'] != null,
            isTrue,
            reason:
                '$name carries a fragment that is neither a className nor an '
                'inline style, so the tier cannot say what it was read from',
          );
          if (part['cls'] != null) {
            check(part, 'cls', (part['src'] ?? src)! as String, name);
          } else {
            checkStyle(part, (part['src'] ?? src)! as String, name);
          }
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

    test('the family is 19 toast rows, 32 from six modal files and 26 from the ledger’s four', () {
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
          'src/components/ui/CategoryChip.tsx': 9,
          'src/components/ui/TransactionRow.tsx': 7,
          'src/components/Dashboard.tsx': 6,
          'src/components/ReportsCentre.tsx': 4,
        },
        reason:
            'a component joining or leaving the family means the tier was '
            're-measured against a different source set. #76 added the four '
            'ledger files to the seven the chrome families already named.',
      );
      expect(
        bySource.values.fold(0, (int a, int b) => a + b),
        rows.length,
        reason: 'and every row belongs to one of them',
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
      // textOverflow, and #76 asked the ledger rows for the same. The full
      // readout must carry them wherever they exist, whether or not `changed`
      // lists them — the changed set is movement against the control, the props
      // map is the record.
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
      expect(
        modalNames.length,
        58,
        reason:
            'the 32 rows the #56 family brought plus the 26 #76 brought for '
            'the ledger — both asked for the same readout, so both get it',
      );
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

  group('AppModals — the ported shells re-derived from the #56 stacks', () {
    // #63 emits `mobile/lib/core/theme/app_modals.dart` from the utility-stack
    // tier's modal/sheet rows, the authored non-CSS entries and the pinned
    // `.ledger-rule`. This group reads the same evidence back independently:
    // every field of every generated row is re-derived here from a JSON
    // string, an authored line or a stylesheet declaration — never copied
    // out of the generated file, so the two can only agree by both being
    // right.
    final Map<String, dynamic> modStacks =
        measurement['utilityStacks']! as Map<String, dynamic>;

    const Map<String, Map<String, String>> modShells =
        <String, Map<String, String>>{
          '.modal-panel': <String, String>{
            'shell': 'modal-shell',
            'veil': 'modal-veil',
            'panel': 'modal-panel',
            'header': 'modal-header',
            'title': 'modal-title',
            'close': 'modal-close',
            'body': 'modal-body',
          },
          '.sheet-panel': <String, String>{
            'shell': 'sheet-shell',
            'veil': 'sheet-veil',
            'panel': 'sheet-panel',
            'header': 'sheet-header',
            'title': 'sheet-title',
            'close': 'sheet-close',
            'body': 'sheet-body',
            'grip': 'sheet-grip',
          },
        };

    Map<String, dynamic> modProps(String pass, String row) {
      final Object? r =
          (_theme(measurement, pass)['stacks']! as Map<String, dynamic>)[row];
      if (r == null) throw StateError('no stack row $row in $pass');
      return (r as Map<String, dynamic>)['props']! as Map<String, dynamic>;
    }

    String modVal(String pass, String row, String field) =>
        _probeValue(modProps(pass, row), field, '$pass $row');

    Color modColour(String pass, String row, String field) =>
        _probeColour(modProps(pass, row), field, '$pass $row');

    /// A px length Chrome may print in exponential form — the full-round
    /// radius (`3.35544e+07px`, the engine's clamp of `rounded-full`) among
    /// them. Recorded verbatim is what the port is checked against.
    double modPx(String pass, String row, String field) {
      final String raw = modVal(pass, row, field);
      final RegExpMatch? m = RegExp(r'^(-?[\d.]+(?:e\+\d+)?)px$')
          .firstMatch(raw);
      if (m == null) {
        throw StateError('$pass $row: "$raw" for $field is not a px length');
      }
      return double.parse(m.group(1)!);
    }

    double modUniformPad(String pass, String row) {
      final String raw = modVal(pass, row, 'padding');
      final RegExpMatch? m = RegExp(r'^([\d.]+)px$').firstMatch(raw);
      if (m == null) {
        throw StateError('$pass $row: padding "$raw" is not one uniform px');
      }
      return double.parse(m.group(1)!);
    }

    double modHeaderPadH(String pass, String row) {
      final String raw = modVal(pass, row, 'padding');
      final RegExpMatch? m = RegExp(r'^0px ([\d.]+)px$').firstMatch(raw);
      if (m == null) {
        throw StateError(
          '$pass $row: padding "$raw" is not the "0 A" pair a flex header authors',
        );
      }
      return double.parse(m.group(1)!);
    }

    List<double> modRadii(String pass, String row) {
      final List<double> out = <double>[];
      for (final String part in modVal(pass, row, 'borderRadius').split(' ')) {
        final RegExpMatch? m = RegExp(r'^(-?[\d.]+(?:e\+\d+)?)px$')
            .firstMatch(part);
        if (m == null) {
          throw StateError('$pass $row: radius part "$part" is not px');
        }
        out.add(double.parse(m.group(1)!));
      }
      return out;
    }

    double modBlurPx(String pass, String row) {
      final RegExpMatch? m = RegExp(r'^blur\(([\d.]+)px\)$')
          .firstMatch(modVal(pass, row, 'backdropFilter'));
      if (m == null) {
        throw StateError(
          '$pass $row: backdrop-filter is not a bare blur(), so the row '
          'could not be ported as one',
        );
      }
      return double.parse(m.group(1)!);
    }

    double modViewportH(String pass) =>
        ((_theme(measurement, pass)['viewport']!
                    as Map<String, dynamic>)['height']!
                as num)
            .toDouble();

    Map<String, dynamic> modAuthored(String name) {
      for (final dynamic e in modStacks['authoredNonCss']! as List<dynamic>) {
        final Map<String, dynamic> entry = e as Map<String, dynamic>;
        if (entry['name'] == name) return entry;
      }
      throw StateError('ui-tokens.json records no authored entry "$name"');
    }

    List<String> modAuthoredTexts(String name) => <String>[
      for (final dynamic p in modAuthored(name)['parts']! as List<dynamic>)
        (p as Map<String, dynamic>)['text']! as String,
    ];

    String modAuthoredTextWith(String name, String needle) {
      for (final String text in modAuthoredTexts(name)) {
        if (text.contains(needle)) return text;
      }
      throw StateError(
        'authored entry "$name" records no part containing "$needle"',
      );
    }

    double modGroupNum(String text, String label, String pattern) {
      final RegExpMatch? m = RegExp(pattern).firstMatch(text);
      if (m == null) {
        throw StateError('$label: "$text" does not carry $pattern');
      }
      return double.parse(m.group(1)!);
    }

    test('AppModals holds exactly the two measured shells, per pass', () {
      final List<String> keys = modShells.keys.toList();
      expect(AppModals.light.keys.toList(), keys);
      expect(AppModals.dark.keys.toList(), keys);
      for (final Brightness brightness in Brightness.values) {
        expect(
          () => AppModals.resolve('.card', brightness),
          throwsA(isA<ArgumentError>()),
          reason: 'a §6 card class is not a shell and must not resolve',
        );
      }
    });

    for (final String cls in modShells.keys) {
      final Map<String, String> rows = modShells[cls]!;
      final bool isSheet = rows.containsKey('grip');
      for (final Brightness brightness in Brightness.values) {
        final String wide = brightness == Brightness.light
            ? 'light-desktop'
            : 'dark-desktop';
        final String narrow = brightness == Brightness.light
            ? 'light-phone'
            : 'dark-phone';

        test(
          '$cls ${brightness.name} — every generated field re-derives from the stacks',
          () {
            final AppModalSpec spec = AppModals.resolve(cls, brightness);
            final String shell = rows['shell']!;
            final String veil = rows['veil']!;
            final String panel = rows['panel']!;
            final String header = rows['header']!;
            final String title = rows['title']!;
            final String close = rows['close']!;
            final String body = rows['body']!;

            expect(spec.cssClass, cls);
            expect(spec.shellPaddingWidePx, modUniformPad(wide, shell));
            expect(spec.shellPaddingNarrowPx, modUniformPad(narrow, shell));
            expect(spec.shellAlignWideCss, modVal(wide, shell, 'alignItems'));
            expect(
              spec.shellAlignNarrowCss,
              modVal(narrow, shell, 'alignItems'),
            );
            expect(
              spec.docksNarrowToBottom,
              modVal(narrow, shell, 'alignItems') == 'flex-end',
              reason: 'the getter is the measured flex-end read back',
            );
            expect(
              spec.shellOverflowYWideCss,
              modVal(wide, shell, 'overflowY'),
            );
            expect(
              spec.shellOverflowYNarrowCss,
              modVal(narrow, shell, 'overflowY'),
            );
            expect(spec.shellZIndexCss, modVal(wide, shell, 'zIndex'));
            expect(spec.panelZIndexCss, modVal(wide, panel, 'zIndex'));

            expect(spec.veilColor, modColour(wide, veil, 'backgroundColor'));
            expect(
              spec.veilColor,
              modColour(narrow, veil, 'backgroundColor'),
              reason: '$veil: the veil colour does not move with the viewport',
            );
            expect(spec.veilBlurPx, modBlurPx(wide, veil));
            expect(
              spec.veilBlurSigmaPx,
              spec.veilBlurPx / 2,
              reason: 'ruling D-U8: the CSS blur radius halved is the sigma',
            );

            expect(spec.panelMaxWidthPx, modPx(wide, panel, 'maxWidth'));
            expect(
              modPx(narrow, panel, 'maxWidth'),
              spec.panelMaxWidthPx,
              reason: '$panel: max-width is one row across the viewports',
            );
            expect(spec.panelMarginYPx, modPx(wide, panel, 'marginTop'));
            expect(
              modPx(wide, panel, 'marginBottom'),
              spec.panelMarginYPx,
              reason: '$panel: the authored `my-*` is symmetric',
            );

            final List<double> wideRadii = modRadii(wide, panel);
            expect(
              wideRadii.toSet().length,
              1,
              reason: '$panel: desktop authors one uniform corner set',
            );
            expect(spec.panelRadiusWidePx, wideRadii.first);
            final List<double> narrowRadii = modRadii(narrow, panel);
            expect(
              narrowRadii.length == 1 || narrowRadii.length == 4,
              isTrue,
              reason: '$panel: a radius is one uniform value or four corners',
            );
            final double narrowTop = narrowRadii.first;
            final double narrowBottom = narrowRadii.length == 1
                ? narrowTop
                : narrowRadii[2];
            expect(spec.panelRadiusNarrowTopPx, narrowTop);
            expect(spec.panelRadiusNarrowBottomPx, narrowBottom);

            final List<double> wideBorders = <double>[
              modPx(wide, panel, 'borderTopWidth'),
              modPx(wide, panel, 'borderRightWidth'),
              modPx(wide, panel, 'borderBottomWidth'),
              modPx(wide, panel, 'borderLeftWidth'),
            ];
            expect(
              wideBorders.toSet().length,
              1,
              reason: '$panel: desktop authors a uniform frame',
            );
            expect(spec.panelBorderWidePx, wideBorders.first);
            expect(
              spec.panelBorderNarrowTopPx,
              modPx(narrow, panel, 'borderTopWidth'),
            );
            expect(
              spec.panelBorderNarrowSidesPx,
              modPx(narrow, panel, 'borderLeftWidth'),
            );
            expect(
              modPx(narrow, panel, 'borderRightWidth'),
              spec.panelBorderNarrowSidesPx,
              reason: '$panel: the phone frame is left-right symmetric',
            );
            expect(
              spec.panelBorderNarrowBottomPx,
              modPx(narrow, panel, 'borderBottomWidth'),
            );
            expect(spec.panelFill, modColour(wide, panel, 'backgroundColor'));
            expect(
              spec.panelBorderColor,
              modColour(wide, panel, 'borderTopColor'),
            );

            expect(
              spec.panelShadow,
              _probeShadowLayers(modProps(wide, panel), panel),
            );
            expect(
              _probeShadowLayers(modProps(narrow, panel), panel),
              spec.panelShadow,
              reason: '$panel: the shadow does not move with the viewport',
            );

            final String capRow = isSheet ? panel : body;
            final double? capFraction = isSheet
                ? spec.panelMaxHeightFraction
                : spec.bodyMaxHeightFraction;
            expect(
              capFraction! * modViewportH(wide),
              closeTo(modPx(wide, capRow, 'maxHeight'), 0.05),
              reason:
                  'the fraction over the desktop pass reproduces the '
                  'measured px cap',
            );
            expect(
              capFraction * modViewportH(narrow),
              closeTo(modPx(narrow, capRow, 'maxHeight'), 0.05),
              reason:
                  '…and over the phone pass too — Flutter has no vh, the port '
                  'sizes the cap from the live viewport',
            );
            if (isSheet) {
              expect(
                spec.bodyMaxHeightFraction,
                isNull,
                reason: 'the sheet caps its panel, not its body',
              );
            } else {
              expect(
                spec.panelMaxHeightFraction,
                isNull,
                reason: 'the dialog caps its body, not its panel',
              );
            }

            expect(spec.headerHeightPx, modPx(wide, header, 'height'));
            expect(spec.headerPaddingHorizontalPx, modHeaderPadH(wide, header));
            expect(
              spec.headerBorderBottomWidthPx,
              modPx(wide, header, 'borderBottomWidth'),
            );
            expect(
              spec.headerBorderBottomColor,
              modColour(wide, header, 'borderTopColor'),
              reason: 'the frame colour is one authoring across the sides',
            );
            expect(
              modColour(wide, header, 'borderLeftColor'),
              modColour(wide, header, 'borderTopColor'),
            );
            expect(spec.headerFill, modColour(wide, header, 'backgroundColor'));

            expect(spec.titleFontSizePx, modPx(wide, title, 'fontSize'));
            expect(
              spec.titleFontWeight,
              int.parse(modVal(wide, title, 'fontWeight')),
            );
            expect(spec.titleLineHeightPx, modPx(wide, title, 'lineHeight'));
            expect(
              spec.titleLetterSpacingPx,
              modPx(wide, title, 'letterSpacing'),
            );
            expect(spec.titleColor, modColour(wide, title, 'color'));
            expect(spec.titleStyle.fontSize, spec.titleFontSizePx);
            expect(
              spec.titleStyle.height,
              closeTo(spec.titleLineHeightPx / spec.titleFontSizePx, 1e-12),
              reason: 'the ratio getter is the measured pair divided',
            );

            expect(spec.closeSizePx, modPx(wide, close, 'width'));
            expect(
              modPx(wide, close, 'height'),
              spec.closeSizePx,
              reason: '$close: the target is square',
            );
            expect(
              spec.closeBorderRadiusPx,
              modPx(wide, close, 'borderRadius'),
            );
            expect(spec.closeFill, modColour(wide, close, 'backgroundColor'));
            expect(spec.closeFgColor, modColour(wide, close, 'color'));
            expect(
              spec.closeBorderWidthPx,
              modPx(wide, close, 'borderTopWidth'),
            );
            expect(
              modPx(wide, close, 'borderBottomWidth'),
              spec.closeBorderWidthPx,
              reason: '$close: the ring is uniform',
            );
            expect(
              spec.closeBorderColor,
              modColour(wide, close, 'borderTopColor'),
            );

            expect(spec.bodyPaddingWidePx, modUniformPad(wide, body));
            expect(spec.bodyPaddingNarrowPx, modUniformPad(narrow, body));

            final String motionName = isSheet
                ? 'sheet-panel-motion'
                : 'modal-panel-motion';
            final String springText = modAuthoredTextWith(
              motionName,
              'damping',
            );
            expect(
              spec.panelSpringDamping,
              modGroupNum(springText, motionName, r'damping: ([\d.]+)'),
            );
            expect(
              spec.panelSpringStiffness,
              modGroupNum(springText, motionName, r'stiffness: ([\d.]+)'),
            );
            expect(
              spec.panelSpring.mass,
              1.0,
              reason:
                  'motion’s spring default mass is 1 — a documented package '
                  'default, not a measured value (logged deviation)',
            );

            final String initialText = modAuthoredTextWith(
              motionName,
              'initial=',
            );
            if (isSheet) {
              expect(
                spec.enterOwnHeightFraction,
                modGroupNum(initialText, motionName, r"\by: '([\d.]+)%'") / 100,
                reason: 'the authored 100% offset is a full own-height slide',
              );
              expect(spec.enterOpacityFrom, isNull);
              expect(spec.enterScale, isNull);
              expect(spec.enterOffsetYPx, isNull);
            } else {
              expect(
                spec.enterOpacityFrom,
                modGroupNum(initialText, motionName, r'opacity: ([\d.]+)'),
              );
              expect(
                spec.enterScale,
                modGroupNum(initialText, motionName, r'scale: ([\d.]+)'),
              );
              expect(
                spec.enterOffsetYPx,
                modGroupNum(initialText, motionName, r'\by: ([\d.]+)'),
              );
              expect(spec.enterOwnHeightFraction, isNull);
            }

            expect(
              spec.bodyScrollLocks,
              isTrue,
              reason:
                  'both entries record the authored '
                  '`overflow = \'hidden\'` part while open',
            );
            if (isSheet) {
              expect(
                modAuthoredTexts('sheet-panel-motion')
                    .any((String t) => t.contains('Escape')),
                isFalse,
                reason: 'BottomSheet.tsx authors no Escape key handler',
              );
              expect(
                spec.escapeCloses,
                isFalse,
                reason: 'only the dialog records an Escape part',
              );
            } else {
              expect(
                modAuthoredTexts('modal-behaviour')
                    .any((String t) => t.contains('Escape')),
                isTrue,
              );
              expect(spec.escapeCloses, isTrue);
            }

            if (isSheet) {
              final AppModalGripSpec grip = spec.grip!;
              expect(grip.widthPx, modPx(narrow, 'sheet-grip', 'width'));
              expect(grip.heightPx, modPx(narrow, 'sheet-grip', 'height'));
              expect(
                grip.radiusPx,
                modPx(narrow, 'sheet-grip', 'borderRadius'),
              );
              expect(grip.marginYPx, modPx(narrow, 'sheet-grip', 'marginTop'));
              expect(
                modPx(narrow, 'sheet-grip', 'marginBottom'),
                grip.marginYPx,
                reason: 'the authored grip margin is symmetric',
              );
              expect(
                grip.fill,
                modColour(narrow, 'sheet-grip', 'backgroundColor'),
              );
              expect(
                grip.displayWideCss,
                modVal(wide, 'sheet-grip', 'display'),
                reason: 'the `sm:hidden` side measures none',
              );
              expect(
                grip.displayNarrowCss,
                modVal(narrow, 'sheet-grip', 'display'),
              );
              expect(grip.shownOnWide, isFalse);
              expect(grip.shownOnNarrow, isTrue);
            } else {
              expect(
                spec.grip,
                isNull,
                reason: 'the dialog measures no grab bar',
              );
            }
          },
        );
      }
    }

    test(
      'both veils fade on one authored clock with motion’s unset easing',
      () {
        for (final String name in <String>[
          'modal-veil-motion',
          'sheet-veil-motion',
        ]) {
          final String transition = modAuthoredTextWith(name, 'duration:');
          expect(
            transition,
            isNot(contains('ease')),
            reason:
                '$name leaves motion’s easing unset; the port’s Cubic is that '
                'default, not an authored curve (logged deviation)',
          );
          expect(
            AppModals.veilFadeMs,
            (modGroupNum(transition, name, r'duration: ([\d.]+)') * 1000)
                .round(),
            reason: '$name: the authored seconds are the ported milliseconds',
          );
        }
        expect(
          AppModals.veilFadeEase,
          const Cubic(0.42, 0.0, 0.58, 1.0),
          reason:
              'CSS `ease` is cubic-bezier(0.25, 0.1, 0.25, 1) in authoring and '
              'Flutter names its resolved curve exactly this — the one number '
              'pair the port carries with no measurement behind it',
        );
      },
    );

    test(
      'the width table is the recorded container tokens, not new numbers',
      () {
        expect(AppModals.widthPx.keys.toList(), <String>['sm', 'md', 'lg']);
        for (final Map<String, dynamic> root in <Map<String, dynamic>>[
          light,
          dark,
        ]) {
          for (final String token in <String>['sm', 'md', 'lg']) {
            expect(
              AppModals.widthPx[token],
              _lengthToPx(_raw(root, '--container-$token')),
              reason: '--container-$token names the same px the table carries',
            );
          }
        }
        final String defaultPart = modAuthoredTextWith(
          'modal-width-prop',
          'maxWidth =',
        );
        expect(
          AppModals.defaultWidthToken,
          RegExp(r"maxWidth = '(\w+)'").firstMatch(defaultPart)!.group(1)!,
          reason: 'the prop default line is the table’s key the port names',
        );
        expect(
          AppModals.resolve('.modal-panel', Brightness.light).panelMaxWidthPx,
          AppModals.widthPx[AppModals.defaultWidthToken],
          reason: 'the dialog row measures its default token’s width',
        );
        expect(
          AppModals.resolve('.sheet-panel', Brightness.light).panelMaxWidthPx,
          AppModals.widthPx['lg'],
          reason:
              'the sheet’s measured 512 is the --container-lg row, not another '
              'number anyone chose',
        );
      },
    );

    test(
      'the recorded close glyph and the recipes keep their measured rows',
      () {
        final List<String> glyphTexts = modAuthoredTexts('sheet-icon-sizes');
        expect(
          glyphTexts.length,
          2,
          reason: 'both shells author the close glyph',
        );
        for (final String text in glyphTexts) {
          expect(
            AppModals.closeGlyphSizePx,
            modGroupNum(text, 'sheet-icon-sizes', r'size=\{(\d+)\}'),
          );
        }
        for (final Brightness brightness in Brightness.values) {
          final String pass = brightness == Brightness.light
              ? 'light-desktop'
              : 'dark-desktop';
          final AppModalSpec dialog = AppModals.resolve(
            '.modal-panel',
            brightness,
          );
          final AppVeilRecipe ink = brightness == Brightness.light
              ? AppModals.inkVeilLight
              : AppModals.inkVeilDark;
          expect(
            ink.color,
            dialog.veilColor,
            reason: '$pass: the shell’s own veil',
          );
          expect(ink.blurPx, dialog.veilBlurPx);
          final AppVeilRecipe dim = brightness == Brightness.light
              ? AppModals.dimVeilLight
              : AppModals.dimVeilDark;
          expect(
            dim.color,
            modColour(pass, 'qa-veil', 'backgroundColor'),
            reason: '$pass qa-veil: the black/60 recipe as measured',
          );
          expect(
            dim.blurPx,
            _lengthToPx(_raw(_rootOf(_theme(measurement, pass)), '--blur-sm')),
            reason: '$pass: the bare backdrop-blur lands on --blur-sm',
          );
          expect(
            dim.blurSigmaPx,
            dim.blurPx / 2,
            reason: 'ruling D-U8 applies to the swapped recipe too',
          );
          expect(AppModals.debtVeilBlurPx, modBlurPx(pass, 'debt-veil'));
          expect(
            modBlurPx(
              brightness == Brightness.light ? 'dark-desktop' : 'light-desktop',
              'debt-veil',
            ),
            AppModals.debtVeilBlurPx,
            reason: 'the literal 6px is the same row in the other scheme',
          );
        }
      },
    );

    test('AppModals.ledger is the pinned rule over the measured fill', () {
      final Map<String, String> rule = _cssDecls(
        cssLines,
        '.ledger-rule {',
        '.ledger-rule',
      );
      expect(
        AppModals.ledgerLight.heightPx,
        _pxOf(rule['height']!, '.ledger-rule height'),
      );
      expect(
        AppModals.ledgerDark.heightPx,
        AppModals.ledgerLight.heightPx,
        reason: 'the hairline height does not move with the scheme',
      );
      for (final Brightness brightness in Brightness.values) {
        final String desktop = brightness == Brightness.light
            ? 'light-desktop'
            : 'dark-desktop';
        final String phone = brightness == Brightness.light
            ? 'light-phone'
            : 'dark-phone';
        final Color fill = _probeColour(
          _probe(
            _probesOf(_theme(measurement, desktop)),
            '.ledger-rule',
            desktop,
          ),
          'backgroundColor',
          '.ledger-rule',
        );
        expect(AppModals.ledger(brightness).fill, fill);
        expect(
          _probeColour(
            _probe(
              _probesOf(_theme(measurement, phone)),
              '.ledger-rule',
              phone,
            ),
            'backgroundColor',
            '.ledger-rule',
          ),
          fill,
          reason: 'the fill does not move with the viewport',
        );
      }
    });
  });

  group('UI_SPEC 6 chips', () {
    /// The §6 chrome chip family `AppIconChip`, `AppPill`, `AppChipSelect`,
    /// `AppDeltaChip` and their theme rows are generated from. `.pill-active`
    /// is read through its `.pill.pill-active` composite probe — a bare
    /// `.pill-active` element has the override without the geometry the app
    /// composes it onto, which is exactly why the generator keyed the row to
    /// the composite; the standalone probe is asserted against that below.
    const List<String> chipClasses = <String>[
      '.icon-chip',
      '.pill',
      '.pill-active',
      '.chip-select',
      '.delta-chip',
      '.delta-up',
      '.delta-down',
    ];
    const Map<String, String> chipProbeKey = <String, String>{
      '.pill-active': '.pill.pill-active',
    };
    String probeKeyFor(String cls) => chipProbeKey[cls] ?? cls;
    Map<String, dynamic> probesFor(Brightness brightness) =>
        brightness == Brightness.light ? lightProbes : darkProbes;
    Map<String, dynamic> rootFor(Brightness brightness) =>
        brightness == Brightness.light ? light : dark;
    Map<String, String> restDecls(String cls) =>
        _cssDecls(cssLines, '$cls {', cls);
    String srgbRgba(Map<String, dynamic> root, String token) =>
        (_token(root, token)['srgb']! as Map<String, dynamic>)['rgba']!
            as String;

    test('AppChips holds exactly the measured chip classes, per pass', () {
      final List<String> expected = chipClasses.toList()..sort();
      expect(AppChips.light.keys.toList()..sort(), expected);
      expect(AppChips.dark.keys.toList()..sort(), expected);
      expect(
        AppChips.light.containsKey('.icon-chip-lg'),
        isFalse,
        reason: '.icon-chip-lg authors only a size override no element uses',
      );
    });

    for (final String cls in chipClasses) {
      for (final Brightness brightness in Brightness.values) {
        final String pass = brightness == Brightness.light
            ? 'light-desktop'
            : 'dark-desktop';
        test('$cls $pass matches its probe row', () {
          final Map<String, dynamic> p = _probe(
            probesFor(brightness),
            probeKeyFor(cls),
            pass,
          );
          final AppChipSpec spec = AppChips.resolve(cls, brightness);
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
            reason: 'the first family of the measured stack, as everywhere',
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
          expect(
            spec.paddingHorizontalPx,
            pad.length > 1 ? pad[1] : pad.first,
            reason: 'a one-value padding shorthand is symmetric',
          );
          expect(
            _probeValue(p, 'boxShadow', cls),
            'none',
            reason:
                'AppChipSpec carries no shadow field; no §6 chip authors one',
          );
          expect(
            _probeValue(p, 'backgroundImage', cls),
            'none',
            reason:
                'no §6 chip paints a gradient; the face chip is its own spec',
          );
        });
      }
    }

    test('chip rows do not move on the phone', () {
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
        'backgroundImage',
        'backdropFilter',
      ];
      final Map<String, List<Map<String, dynamic>>> pairs =
          <String, List<Map<String, dynamic>>>{
            'light-phone': <Map<String, dynamic>>[
              lightPhoneProbes,
              lightProbes,
            ],
            'dark-phone': <Map<String, dynamic>>[darkPhoneProbes, darkProbes],
          };
      for (final String cls in chipClasses) {
        for (final MapEntry<String, List<Map<String, dynamic>>> entry
            in pairs.entries) {
          final String phonePass = entry.key;
          final String desktopPass = phonePass.replaceAll('-phone', '-desktop');
          for (final String field in fields) {
            expect(
              _probeValue(
                _probe(entry.value[0], probeKeyFor(cls), phonePass),
                field,
                cls,
              ),
              _probeValue(
                _probe(entry.value[1], probeKeyFor(cls), desktopPass),
                field,
                cls,
              ),
              reason:
                  '$phonePass moves $field for $cls and AppChips ports one '
                  'row per brightness to paint it from',
            );
          }
        }
      }
    });

    for (final String cls in chipClasses) {
      test(
        '$cls gap and tabular-nums travel as the authored facts they are',
        () {
          final Map<String, String> decls = restDecls(cls);
          final AppChipSpec lightSpec = AppChips.resolve(cls, Brightness.light);
          final AppChipSpec darkSpec = AppChips.resolve(cls, Brightness.dark);
          // Chrome computed `gap` is not in the detached-element field set, so
          // the probe cannot confirm or deny it; the resting rule is the
          // source, and both passes read the same authored number.
          expect(
            lightSpec.gapPx,
            decls.containsKey('gap') ? _pxOf(decls['gap']!, '$cls gap') : null,
            reason: '$cls gap comes from its own rule',
          );
          expect(darkSpec.gapPx, lightSpec.gapPx);
          final String? fvN = decls['font-variant-numeric'];
          expect(lightSpec.tabularNums, fvN == 'tabular-nums');
          expect(darkSpec.tabularNums, lightSpec.tabularNums);
        },
      );
    }

    test('only .pill has press and disabled faces, read from its own rules', () {
      for (final String cls in chipClasses) {
        final bool authorsActive = cssLines.any(
          (String l) => l.startsWith('$cls:active'),
        );
        final bool authorsDisabled = cssLines.any(
          (String l) => l.startsWith('$cls:disabled'),
        );
        if (!authorsActive) {
          expect(
            AppChips.light[cls]!.pressFillColor,
            isNull,
            reason: '$cls authors no press state; the row must not invent one',
          );
        }
        if (!authorsDisabled) {
          expect(
            AppChips.light[cls]!.disabledOpacity,
            isNull,
            reason: '$cls authors no disabled face',
          );
        }
      }
      final Map<String, String> act = _cssDecls(
        cssLines,
        '.pill:active {',
        '.pill',
      );
      expect(
        act.keys.toList()..sort(),
        <String>['background'],
        reason:
            '.pill:active sets exactly what AppChipSpec can hold — a '
            'transform or box move here would need fields the row does not have',
      );
      final RegExpMatch? varRef = RegExp(r'^var\((--[a-z0-9-]+)\)$')
          .firstMatch(act['background']!);
      expect(
        varRef,
        isNotNull,
        reason:
            '.pill:active background "${act['background']}" is not a bare var',
      );
      final String token = varRef!.group(1)!;
      for (final Brightness brightness in Brightness.values) {
        final AppChipSpec spec = AppChips.resolve('.pill', brightness);
        final Map<String, dynamic> root = rootFor(brightness);
        expect(
          spec.pressFillColor,
          _measuredColour(root, token),
          reason:
              '.pill pressed fill is $token as the $brightness pass measures it',
        );
        expect(
          spec.pressFillColor,
          isNot(spec.fillColor),
          reason: 'a pressed fill equal to the resting one is a no-op rule',
        );
      }
      final Map<String, String> dis = _cssDecls(
        cssLines,
        '.pill:disabled,',
        '.pill',
      );
      expect(dis.keys.toList()..sort(), <String>[
        'cursor',
        'opacity',
      ], reason: 'the disabled rule is a fade and a pointer, nothing else');
      expect(dis['cursor'], 'not-allowed');
      expect(
        AppChips.light['.pill']!.disabledOpacity,
        double.parse(dis['opacity']!),
      );
      expect(
        AppChips.dark['.pill']!.disabledOpacity,
        AppChips.light['.pill']!.disabledOpacity,
        reason: 'the rule is unlayered, so both passes compute the same fade',
      );
    });

    test('.pill-active composes the pill box and swaps ink for accent-fg', () {
      final Map<String, String> active = restDecls('.pill-active');
      expect(active.keys.toList()..sort(), <String>[
        'background',
        'border-color',
        'color',
      ], reason: '.pill-active is an override of exactly these three');
      final Map<String, String> tokensByProp = <String, String>{};
      for (final MapEntry<String, String> entry in active.entries) {
        final RegExpMatch? m = RegExp(r'^var\((--[a-z0-9-]+)\)$')
            .firstMatch(entry.value);
        expect(
          m,
          isNotNull,
          reason:
              '.pill-active ${entry.key} "${entry.value}" is not a bare var; '
              'the composite probe cross-check cannot substitute it',
        );
        tokensByProp[entry.key] = m!.group(1)!;
      }
      for (final Brightness brightness in Brightness.values) {
        final Map<String, dynamic> root = rootFor(brightness);
        final Map<String, dynamic> composite = _probe(
          probesFor(brightness),
          '.pill.pill-active',
          brightness == Brightness.light ? 'light-desktop' : 'dark-desktop',
        );
        final AppChipSpec spec = AppChips.resolve('.pill-active', brightness);
        expect(
          spec.fillColor,
          _measuredColour(root, tokensByProp['background']!),
          reason: 'the composite probe measured the ink the rule names',
        );
        expect(
          spec.fillColor,
          _probeColour(composite, 'backgroundColor', '.pill-active'),
        );
        expect(spec.textColor, _measuredColour(root, tokensByProp['color']!));
        expect(
          spec.textColor,
          _probeColour(composite, 'color', '.pill-active'),
        );
        expect(
          spec.borderColor,
          _measuredColour(root, tokensByProp['border-color']!),
        );
        expect(
          spec.borderWidthPx,
          _pxOf(
            _probeValue(composite, 'borderTopWidth', '.pill-active'),
            '.pill-active border width',
          ),
        );
        expect(
          spec.radiusPx,
          _pxOf(
            _probeValue(composite, 'borderRadius', '.pill-active'),
            '.pill-active radius',
          ),
        );
        // The composite is a `.pill` carrying the override, so the box the app
        // paints is the pill’s own: the row must agree with the `.pill` row on
        // everything a color-only override cannot move.
        final AppChipSpec pill = AppChips.resolve('.pill', brightness);
        expect(spec.displayCss, pill.displayCss);
        expect(spec.paddingVerticalPx, pill.paddingVerticalPx);
        expect(spec.paddingHorizontalPx, pill.paddingHorizontalPx);
        expect(spec.fontSizePx, pill.fontSizePx);
        expect(spec.fontWeight, pill.fontWeight);
        expect(spec.lineHeightPx, pill.lineHeightPx);
      }
      // …and the standalone probe of the same class proves why the composite
      // is the honest key: without `.pill` the element has no padding.
      final Map<String, dynamic> bare = _probe(
        lightProbes,
        '.pill-active',
        'light-desktop',
      );
      expect(
        _probeValue(bare, 'padding', '.pill-active'),
        isNot(
          _probeValue(
            _probe(lightProbes, '.pill', 'light-desktop'),
            'padding',
            '.pill',
          ),
        ),
        reason:
            'a bare .pill-active measured no pill geometry — that came '
            'from the class it rides on',
      );
    });

    test('chip clocks are the authored single durations', () {
      for (final String cls in chipClasses) {
        final RegExpMatch? tRaw = RegExp(r'transition:\s*([^;]+);')
            .firstMatch(_cssRuleText(cssLines, '$cls {', cls));
        final AppChipSpec lightSpec = AppChips.resolve(cls, Brightness.light);
        if (tRaw == null) {
          expect(
            lightSpec.transitionMs,
            isNull,
            reason: '$cls transitions nothing; the row must not ease a snap',
          );
          expect(lightSpec.transitionProps, isNull);
          expect(lightSpec.easeX1, isNull);
          continue;
        }
        final List<String> items = tRaw
            .group(1)!
            .trim()
            .split(',')
            .map((String s) => s.trim())
            .where((String s) => s.isNotEmpty)
            .toList();
        final List<String> props = <String>[];
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
          expect(d, isNotNull, reason: '${parts[1]} is not a bare token');
          expect(e, isNotNull, reason: '${parts[2]} is not a bare token');
          durTokens.add(d!.group(1)!);
          easeTokens.add(e!.group(1)!);
        }
        expect(durTokens, hasLength(1), reason: 'one box runs one clock');
        expect(easeTokens, hasLength(1), reason: 'one box runs one curve');
        final String durToken = durTokens.single;
        final String easeToken = easeTokens.single;
        expect(
          lightSpec.transitionProps,
          props.join(', '),
          reason: 'the row carries the authored property list, in order',
        );
        for (final Brightness brightness in Brightness.values) {
          final Map<String, dynamic> root = rootFor(brightness);
          final AppChipSpec spec = AppChips.resolve(cls, brightness);
          final Duration ms = _duration(_raw(root, durToken));
          expect(
            spec.transitionMs,
            ms.inMilliseconds,
            reason: '$cls transitions on $durToken as the pass measures it',
          );
          expect(
            spec.pressDuration,
            ms,
            reason: 'the getter is the measured milliseconds, unchanged',
          );
          final Cubic authored = _cubic(_raw(root, easeToken));
          expect(
            <double>[spec.easeX1!, spec.easeY1!, spec.easeX2!, spec.easeY2!],
            <double>[authored.a, authored.b, authored.c, authored.d],
            reason: '$cls runs on $easeToken as the pass measures it',
          );
          expect(
            AppTokens.durationsByToken[durToken],
            ms,
            reason: 'the chip row and the §4 token table are one measurement',
          );
          final Cubic tableCurve = AppTokens.curvesByToken[easeToken]! as Cubic;
          expect(
            <double>[tableCurve.a, tableCurve.b, tableCurve.c, tableCurve.d],
            <double>[spec.easeX1!, spec.easeY1!, spec.easeX2!, spec.easeY2!],
          );
        }
      }
    });

    test('chips blur only where the probe saw a blur', () {
      for (final String cls in chipClasses) {
        for (final Brightness brightness in Brightness.values) {
          final Map<String, dynamic> p = _probe(
            probesFor(brightness),
            probeKeyFor(cls),
            brightness == Brightness.light ? 'light-desktop' : 'dark-desktop',
          );
          final AppChipSpec spec = AppChips.resolve(cls, brightness);
          final String raw = _probeValue(p, 'backdropFilter', cls);
          if (raw == 'none') {
            expect(spec.blurPx, isNull, reason: '$cls measured no backdrop');
            expect(spec.blurSaturate, isNull);
            expect(spec.blurSigmaPx, isNull);
          } else {
            final RegExpMatch? m = RegExp(r'^blur\(([\d.]+)px\)$')
                .firstMatch(raw);
            expect(
              m,
              isNotNull,
              reason: '$cls backdrop "$raw" is not a lone blur()',
            );
            expect(spec.blurPx, double.parse(m!.group(1)!));
            expect(
              spec.blurSaturate,
              isNull,
              reason: 'no saturate() was measured for $cls',
            );
            expect(
              spec.blurSigmaPx,
              spec.blurPx! / 2,
              reason: 'CSS blur px → Flutter sigma (UI_SPEC D-U8)',
            );
          }
        }
      }
    });

    test('.icon-chip is a 40px square; .icon-chip-lg ports nowhere', () {
      final Map<String, String> decls = restDecls('.icon-chip');
      expect(decls['width'], '40px');
      expect(decls['height'], '40px');
      for (final Brightness brightness in Brightness.values) {
        final AppChipSpec spec = AppChips.resolve('.icon-chip', brightness);
        expect(
          spec.sizePx,
          _pxOf(decls['width']!, '.icon-chip width'),
          reason: 'the square side is the authored width, height agrees',
        );
        expect(spec.sizePx, _pxOf(decls['height']!, '.icon-chip height'));
      }
      for (final String cls in chipClasses.where(
        (String c) => c != '.icon-chip',
      )) {
        expect(
          AppChips.light[cls]!.sizePx,
          isNull,
          reason: '$cls authors no square',
        );
      }
      final Map<String, String> lg = _cssDecls(
        cssLines,
        '.icon-chip-lg {',
        '.icon-chip-lg',
      );
      expect(
        lg.keys.toList()..sort(),
        <String>['height', 'width'],
        reason:
            'the skipped row is size-only, exactly as .card-sm was, and '
            'no element under src/ carries the class (asserted at generation)',
      );
      expect(lg['width'], '44px');
      expect(lg['height'], '44px');
    });

    test('the unported hover states are colour-only decoration', () {
      // D-U1 drops :hover — a phone has no hover. Pinning the property sets
      // here means a web that widens a hover rule into a box change is heard
      // about, because the rule can no longer be dropped without losing it.
      final Map<String, Map<String, String>> hovers =
          <String, Map<String, String>>{
            '.pill:hover': _cssDecls(cssLines, '.pill:hover {', '.pill'),
            '.chip-select:hover': _cssDecls(
              cssLines,
              '.chip-select:hover {',
              '.chip-select',
            ),
            '.pill-active:hover': _cssDecls(
              cssLines,
              '.pill-active:hover {',
              '.pill-active',
            ),
          };
      for (final MapEntry<String, Map<String, String>> entry
          in hovers.entries) {
        expect(
          entry.value.keys.toList()..sort(),
          <String>['background', 'border-color'],
          reason:
              '${entry.key} now sets something beyond paint, and the port '
              'silently drops hover',
        );
      }
    });

    test(
      'AppFaceChips is the probe box, the token gradient and the ::after ring',
      () {
        const String cls = '.card-face-chip';
        final Map<String, String> rest = restDecls(cls);
        expect(rest.keys.toList()..sort(), <String>[
          'background',
          'border-radius',
          'height',
          'position',
          'width',
        ]);
        expect(rest['position'], 'relative');
        final AppFaceChipSpec spec = AppFaceChips.spec;
        expect(spec.cssClass, cls);
        expect(spec.widthPx, _pxOf(rest['width']!, '$cls width'));
        expect(spec.heightPx, _pxOf(rest['height']!, '$cls height'));
        expect(spec.radiusPx, _pxOf(rest['border-radius']!, '$cls radius'));
        final RegExpMatch? grad = RegExp(
          r'^linear-gradient\(([\d.]+)deg, var\((--[a-z0-9-]+)\) ([\d.]+)%, '
          r'var\((--[a-z0-9-]+)\) ([\d.]+)%\)$',
        ).firstMatch(rest['background']!);
        expect(
          grad,
          isNotNull,
          reason:
              '.card-face-chip background "${rest['background']}" is not the '
              'authored two-token 0%/100% gradient',
        );
        final Map<String, String> after = _cssDecls(
          cssLines,
          '.card-face-chip::after {',
          cls,
        );
        expect(
          after.keys.toList()..sort(),
          <String>['border', 'border-radius', 'content', 'inset', 'position'],
          reason:
              'the ring is a pseudo-element: absolute, inset, framed, round',
        );
        expect(after['position'], 'absolute');
        expect(after['content'], "''");
        expect(spec.ringInsetPx, _pxOf(after['inset']!, '$cls ring inset'));
        final RegExpMatch? ring = RegExp(r'^([\d.]+)px solid (rgba\([^)]*\))$')
            .firstMatch(after['border']!);
        expect(ring, isNotNull, reason: 'ring border "${after['border']}"');
        expect(spec.ringBorderWidthPx, double.parse(ring!.group(1)!));
        expect(spec.ringColor, _parseRgba(ring.group(2)!));
        expect(
          spec.ringRadiusPx,
          _pxOf(after['border-radius']!, '$cls ring radius'),
        );
        // Both passes measured the same gold on the same box, which is what
        // makes one spec (not a per-brightness table) the honest port.
        final Map<String, dynamic> lp = _probe(
          lightProbes,
          cls,
          'light-desktop',
        );
        final Map<String, dynamic> dp = _probe(darkProbes, cls, 'dark-desktop');
        for (final Map<String, dynamic> pair in <Map<String, dynamic>>[
          lp,
          dp,
        ]) {
          expect(_probeValue(pair, 'position', cls), 'relative');
          expect(_probeValue(pair, 'boxShadow', cls), 'none');
          expect(_probeValue(pair, 'borderTopWidth', cls), '0px');
          expect(
            _probeColour(pair, 'backgroundColor', cls).a,
            0,
            reason:
                'the gradient is the whole paint; the fill measured through',
          );
          expect(
            spec.radiusPx,
            _pxOf(_probeValue(pair, 'borderRadius', cls), '$cls probe radius'),
          );
          final Map<String, dynamic> root = identical(pair, lp) ? light : dark;
          final _GradientExpectation authored = _gradientValue(
            'linear-gradient(${grad!.group(1)}deg, '
            '${srgbRgba(root, grad.group(2)!)} ${grad.group(3)}%, '
            '${srgbRgba(root, grad.group(4)!)} ${grad.group(5)}%)',
          );
          final _GradientExpectation measured = _gradientValue(
            _probeValue(pair, 'backgroundImage', cls),
          );
          expect(
            authored.colors,
            measured.colors,
            reason: 'the named tokens substitute to what the probe measured',
          );
          expect(authored.stops, measured.stops);
          final LinearGradient painted = spec.fillGradient;
          final Alignment begin = painted.begin as Alignment;
          final Alignment end = painted.end as Alignment;
          expect(begin.x, closeTo(authored.begin.x, 1e-9));
          expect(begin.y, closeTo(authored.begin.y, 1e-9));
          expect(end.x, closeTo(authored.end.x, 1e-9));
          expect(end.y, closeTo(authored.end.y, 1e-9));
          expect(painted.colors, authored.colors);
          expect(painted.stops, authored.stops);
        }
        expect(
          _probeValue(lp, 'backgroundImage', cls),
          _probeValue(dp, 'backgroundImage', cls),
          reason:
              'light and dark measured one gold — the single spec is honest',
        );
        expect(spec.borderRadius, BorderRadius.circular(spec.radiusPx));
        expect(spec.ringBorderRadius, BorderRadius.circular(spec.ringRadiusPx));
        expect(
          spec.ringBorder,
          Border.all(color: spec.ringColor, width: spec.ringBorderWidthPx),
        );
      },
    );

    test(
      'the derived chip getters divide measured numbers, never invent one',
      () {
        for (final String cls in chipClasses) {
          for (final Brightness brightness in Brightness.values) {
            final AppChipSpec spec = AppChips.resolve(cls, brightness);
            expect(spec.borderRadius, BorderRadius.circular(spec.radiusPx));
            expect(
              spec.border,
              spec.borderWidthPx == 0
                  ? isNull
                  : Border.all(
                      color: spec.borderColor,
                      width: spec.borderWidthPx,
                    ),
            );
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
              reason: 'the 100-900 step indexes the Dart enum',
            );
            expect(
              spec.lineHeightRatio,
              spec.lineHeightPx! / spec.fontSizePx,
              reason:
                  'Flutter line-height is a multiple, CSS line-height a length',
            );
            expect(
              spec.pressDuration,
              spec.transitionMs == null
                  ? isNull
                  : Duration(milliseconds: spec.transitionMs!),
            );
            if (spec.easeX1 != null) {
              final Cubic curve = spec.pressCurve! as Cubic;
              expect(
                <double>[curve.a, curve.b, curve.c, curve.d],
                <double>[
                  spec.easeX1!,
                  spec.easeY1!,
                  spec.easeX2!,
                  spec.easeY2!,
                ],
              );
            } else {
              expect(spec.pressCurve, isNull);
            }
          }
        }
      },
    );

    test('an unknown chip class is an error, not a Material default', () {
      for (final Brightness brightness in Brightness.values) {
        expect(
          () => AppChips.resolve('.chip-imaginary', brightness),
          throwsArgumentError,
        );
      }
    });
  });

  group('UI_SPEC 6 segmented', () {
    const String track = '.segment';
    const String item = '.segment-item';
    const String selectedProbe = ".segment-item;aria-selected=true";
    Map<String, String> segDecls(String cls) =>
        _cssDecls(cssLines, '$cls {', cls);
    Map<String, dynamic> probesFor(Brightness brightness) =>
        brightness == Brightness.light ? lightProbes : darkProbes;
    Map<String, dynamic> rootFor(Brightness brightness) =>
        brightness == Brightness.light ? light : dark;
    Map<String, dynamic> segSrgb(Map<String, dynamic> root, String token) =>
        _token(root, token)['srgb']! as Map<String, dynamic>;

    test('AppSegments holds the track and the item, per pass', () {
      final List<String> expected = (<String>[item, track]).toList()..sort();
      expect(AppSegments.light.keys.toList()..sort(), expected);
      expect(AppSegments.dark.keys.toList()..sort(), expected);
    });

    for (final Brightness brightness in Brightness.values) {
      final String pass = brightness == Brightness.light
          ? 'light-desktop'
          : 'dark-desktop';
      test('the $pass track is a box with no type of its own', () {
        final Map<String, dynamic> p = _probe(
          probesFor(brightness),
          track,
          pass,
        );
        final AppSegmentSpec spec = AppSegments.resolve(track, brightness);
        expect(spec.cssClass, track);
        expect(spec.displayCss, _probeValue(p, 'display', track));
        expect(
          spec.radiusPx,
          _pxOf(_probeValue(p, 'borderRadius', track), '$track radius'),
        );
        expect(
          spec.borderWidthPx,
          _pxOf(_probeValue(p, 'borderTopWidth', track), '$track border width'),
        );
        expect(spec.borderColor, _probeColour(p, 'borderTopColor', track));
        final List<double> pad = _probeValue(p, 'padding', track)
            .split(RegExp(r'\s+'))
            .map((String s) => _pxOf(s, '$track padding'))
            .toList();
        expect(spec.paddingVerticalPx, pad.first);
        expect(spec.paddingHorizontalPx, pad.length > 1 ? pad[1] : pad.first);
        // The track rule authors no font and no ink: the probe’s 16px/24px is
        // body inheritance, so the row ports nulls, not the measurement.
        final Map<String, String> decls = segDecls(track);
        for (final String prop in <String>[
          'color',
          'font-size',
          'font-weight',
          'line-height',
        ]) {
          expect(
            decls.containsKey(prop),
            isFalse,
            reason:
                '.segment now authors $prop; the null font fields would '
                'be a lie and the row must grow instead',
          );
        }
        expect(spec.textColor, isNull);
        expect(spec.fontFamily, isNull);
        expect(spec.fontSizePx, isNull);
        expect(spec.fontWeight, isNull);
        expect(spec.lineHeightPx, isNull);
        expect(spec.letterSpacingPx, isNull);
        // color-mix(in srgb, var(--surface-2) 72%, transparent): the token’s
        // own rgb at the authored percentage.
        final RegExpMatch? mix = RegExp(
          r'^color-mix\(in srgb, var\((--[a-z0-9-]+)\) ([\d.]+)%, transparent\)$',
        ).firstMatch(decls['background']!);
        expect(
          mix,
          isNotNull,
          reason:
              '.segment background "${decls['background']}" is not the '
              'authored color-mix over transparent',
        );
        final Map<String, dynamic> s = segSrgb(
          rootFor(brightness),
          mix!.group(1)!,
        );
        expect(
          spec.fillColor,
          Color.fromRGBO(
            (s['r']! as num).round(),
            (s['g']! as num).round(),
            (s['b']! as num).round(),
            double.parse(mix.group(2)!) / 100.0,
          ),
          reason:
              'the mix is ${mix.group(1)} at ${mix.group(2)}%, and the '
              'probe measured exactly that',
        );
        expect(spec.fillColor, _probeColour(p, 'backgroundColor', track));
        expect(spec.gapPx, _pxOf(decls['gap']!, '$track gap'));
        final String bf = _probeValue(p, 'backdropFilter', track);
        final RegExpMatch? blur = RegExp(r'^blur\(([\d.]+)px\)$')
            .firstMatch(bf);
        expect(
          blur,
          isNotNull,
          reason: '.segment backdrop "$bf" is not a lone blur()',
        );
        expect(
          spec.blurPx,
          double.parse(blur!.group(1)!),
          reason: 'the track blurs exactly what the authored rule names',
        );
        expect(spec.blurSaturate, isNull);
        expect(spec.blurSigmaPx, spec.blurPx! / 2);
        expect(
          _probeValue(p, 'boxShadow', track),
          'none',
          reason: 'AppSegmentSpec carries no resting shadow field',
        );
      });

      test(
        'the $pass item is a resting pill-box carrying the selected state',
        () {
          final Map<String, dynamic> p = _probe(
            probesFor(brightness),
            item,
            pass,
          );
          final AppSegmentSpec spec = AppSegments.resolve(item, brightness);
          expect(spec.cssClass, item);
          expect(spec.displayCss, _probeValue(p, 'display', item));
          expect(
            spec.radiusPx,
            _pxOf(_probeValue(p, 'borderRadius', item), '$item radius'),
          );
          expect(
            spec.borderWidthPx,
            _pxOf(_probeValue(p, 'borderTopWidth', item), '$item border width'),
          );
          expect(spec.borderColor, _probeColour(p, 'borderTopColor', item));
          expect(spec.fillColor, _probeColour(p, 'backgroundColor', item));
          expect(spec.textColor, _probeColour(p, 'color', item));
          expect(
            spec.fontFamily,
            _probeValue(
              p,
              'fontFamily',
              item,
            ).split(',').first.replaceAll(RegExp("[\"']"), '').trim(),
          );
          expect(
            spec.fontSizePx,
            _pxOf(_probeValue(p, 'fontSize', item), '$item font-size'),
          );
          expect(
            spec.fontWeight,
            int.parse(_probeValue(p, 'fontWeight', item)),
          );
          expect(
            spec.lineHeightPx,
            _pxOf(_probeValue(p, 'lineHeight', item), '$item line-height'),
          );
          final String spacing = _probeValue(p, 'letterSpacing', item);
          expect(
            spec.letterSpacingPx,
            spacing == 'normal' ? 0.0 : _pxOf(spacing, '$item letter-spacing'),
          );
          final List<double> pad = _probeValue(p, 'padding', item)
              .split(RegExp(r'\s+'))
              .map((String s) => _pxOf(s, '$item padding'))
              .toList();
          expect(spec.paddingVerticalPx, pad.first);
          expect(spec.paddingHorizontalPx, pad.length > 1 ? pad[1] : pad.first);
          expect(spec.gapPx, isNull, reason: '.segment-item authors no gap');
          expect(
            segDecls(item)['background'],
            'transparent',
            reason: 'the resting item is invisible until picked',
          );
          expect(spec.fillColor.a, 0);
          expect(spec.blurPx, isNull);
          expect(spec.blurSaturate, isNull);
        },
      );

      test(
        'the $pass selected state is one authored rule, probe-confirmed',
        () {
          final Map<String, String> decls = _cssDecls(
            cssLines,
            ".segment-item[aria-selected='true'],",
            item,
          );
          expect(
            decls.keys.toList()..sort(),
            <String>['background', 'box-shadow', 'color'],
            reason: 'the selected rule sets exactly what AppSegmentSpec holds',
          );
          final RegExpMatch? bg = RegExp(r'^var\((--[a-z0-9-]+)\)$')
              .firstMatch(decls['background']!);
          final RegExpMatch? fg = RegExp(r'^var\((--[a-z0-9-]+)\)$')
              .firstMatch(decls['color']!);
          final RegExpMatch? ring = RegExp(
            r'^inset 0 0 0 ([\d.]+)px var\((--[a-z0-9-]+)\)$',
          ).firstMatch(decls['box-shadow']!);
          expect(
            bg,
            isNotNull,
            reason: 'selected background must be a bare var',
          );
          expect(fg, isNotNull, reason: 'selected color must be a bare var');
          expect(
            ring,
            isNotNull,
            reason:
                'selected box-shadow "${decls['box-shadow']}" must be a '
                'single inset ring of one token',
          );
          final Map<String, dynamic> root = rootFor(brightness);
          final AppSegmentSpec spec = AppSegments.resolve(item, brightness);
          expect(spec.selectedFillColor, _measuredColour(root, bg!.group(1)!));
          expect(spec.selectedTextColor, _measuredColour(root, fg!.group(1)!));
          expect(
            spec.selectedRingColor,
            _measuredColour(root, ring!.group(2)!),
          );
          expect(
            spec.selectedRingWidthPx,
            double.parse(ring.group(1)!),
            reason: 'the authored ring width is the number the regex unwrapped',
          );
          // The probe of the selected element confirms the authored rule, in
          // the substituted rgba form Chrome printed it in.
          final Map<String, dynamic> p = _probe(
            probesFor(brightness),
            selectedProbe,
            pass,
          );
          final String bs = _probeValue(p, 'boxShadow', item);
          final RegExpMatch? measured = RegExp(
            r'^rgba\((\d+), (\d+), (\d+), ([\d.]+)\) '
            r'0px 0px 0px ([\d.]+)px inset$',
          ).firstMatch(bs);
          expect(
            measured,
            isNotNull,
            reason: 'the selected probe shadow "$bs" is not one inset ring',
          );
          expect(
            Color.fromRGBO(
              int.parse(measured!.group(1)!),
              int.parse(measured.group(2)!),
              int.parse(measured.group(3)!),
              double.parse(measured.group(4)!),
            ),
            spec.selectedRingColor,
            reason: 'the ring the probe saw is the token the rule names',
          );
          expect(double.parse(measured.group(5)!), spec.selectedRingWidthPx);
          expect(
            spec.selectedFillColor,
            _probeColour(p, 'backgroundColor', item),
          );
          expect(spec.selectedTextColor, _probeColour(p, 'color', item));
          // Selection paints over the same box: nothing about the item’s
          // geometry moves when it is picked.
          for (final String field in <String>[
            'borderRadius',
            'padding',
            'fontSize',
            'fontWeight',
            'lineHeight',
            'borderTopWidth',
          ]) {
            expect(
              _probeValue(p, field, item),
              _probeValue(
                _probe(probesFor(brightness), item, pass),
                field,
                item,
              ),
              reason: 'the selected state must not move $field',
            );
          }
          expect(
            AppSegments.resolve(track, brightness).selectedFillColor,
            isNull,
            reason:
                'the track selector cannot match an item; null, not inherited',
          );
          expect(
            AppSegments.resolve(track, brightness).selectedRingColor,
            isNull,
          );
        },
      );
    }

    test('segment rows do not move on the phone', () {
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
        'backdropFilter',
      ];
      final Map<String, List<Map<String, dynamic>>> pairs =
          <String, List<Map<String, dynamic>>>{
            'light-phone': <Map<String, dynamic>>[
              lightPhoneProbes,
              lightProbes,
            ],
            'dark-phone': <Map<String, dynamic>>[darkPhoneProbes, darkProbes],
          };
      for (final String cls in <String>[track, item, selectedProbe]) {
        for (final MapEntry<String, List<Map<String, dynamic>>> entry
            in pairs.entries) {
          final String phonePass = entry.key;
          final String desktopPass = phonePass.replaceAll('-phone', '-desktop');
          for (final String field in fields) {
            expect(
              _probeValue(_probe(entry.value[0], cls, phonePass), field, cls),
              _probeValue(_probe(entry.value[1], cls, desktopPass), field, cls),
              reason: '$phonePass moves $field for $cls',
            );
          }
        }
      }
    });

    test('the item transitions its two paints on one authored clock', () {
      final RegExpMatch? tRaw = RegExp(r'transition:\s*([^;]+);')
          .firstMatch(_cssRuleText(cssLines, '$item {', item));
      expect(tRaw, isNotNull);
      final List<String> props = tRaw!
          .group(1)!
          .trim()
          .split(',')
          .map((String s) => s.trim())
          .where((String s) => s.isNotEmpty)
          .map((String s) => s.split(RegExp(r'\s+')).first)
          .toList();
      final AppSegmentSpec lightSpec = AppSegments.resolve(
        item,
        Brightness.light,
      );
      expect(lightSpec.transitionProps, props.join(', '));
      for (final Brightness brightness in Brightness.values) {
        final Map<String, dynamic> root = rootFor(brightness);
        final AppSegmentSpec spec = AppSegments.resolve(item, brightness);
        expect(
          spec.transitionDuration,
          _duration(_raw(root, '--dur-fast')),
          reason: 'the item names --dur-fast; the row carries its measurement',
        );
        final Cubic authored = _cubic(_raw(root, '--ease-out'));
        final Cubic painted = spec.transitionCurve! as Cubic;
        expect(
          <double>[painted.a, painted.b, painted.c, painted.d],
          <double>[authored.a, authored.b, authored.c, authored.d],
        );
      }
      final AppSegmentSpec trackSpec = AppSegments.resolve(
        track,
        Brightness.light,
      );
      expect(
        trackSpec.transitionMs,
        isNull,
        reason: '.segment authors no transition; only the item animates',
      );
      expect(trackSpec.transitionCurve, isNull);
      // .segment-item:hover lifts the ink to --ink — decoration dropped per
      // D-U1, pinned here so a widened hover is heard about.
      final Map<String, String> hover = _cssDecls(
        cssLines,
        '.segment-item:hover {',
        item,
      );
      expect(
        hover.keys.toList(),
        <String>['color'],
        reason: 'the hover grew beyond ink; dropping it would lose a box move',
      );
    });

    test('segment getters divide measured numbers, never invent one', () {
      for (final String cls in <String>[track, item]) {
        for (final Brightness brightness in Brightness.values) {
          final AppSegmentSpec spec = AppSegments.resolve(cls, brightness);
          expect(spec.borderRadius, BorderRadius.circular(spec.radiusPx));
          expect(
            spec.border,
            spec.borderWidthPx == 0
                ? isNull
                : Border.all(
                    color: spec.borderColor,
                    width: spec.borderWidthPx,
                  ),
          );
          expect(
            spec.padding,
            EdgeInsets.symmetric(
              vertical: spec.paddingVerticalPx,
              horizontal: spec.paddingHorizontalPx,
            ),
          );
          expect(
            spec.weight,
            spec.fontWeight == null
                ? isNull
                : FontWeight.values[spec.fontWeight! ~/ 100 - 1],
          );
        }
      }
    });

    test('an unknown segment class is an error, not a Material default', () {
      for (final Brightness brightness in Brightness.values) {
        expect(
          () => AppSegments.resolve('.segment-imaginary', brightness),
          throwsArgumentError,
        );
      }
    });
  });

  group('UI_SPEC 6 progress bars', () {
    const List<String> pastelBars = <String>[
      '.bar-pink',
      '.bar-mint',
      '.bar-yellow',
      '.bar-lavender',
      '.bar-blue',
    ];
    const String rainbow = '.rainbow-bar';
    Map<String, String> barDecls(String cls) =>
        _cssDecls(cssLines, '$cls {', cls);
    Map<String, dynamic> probesFor(Brightness brightness) =>
        brightness == Brightness.light ? lightProbes : darkProbes;
    Map<String, dynamic> rootFor(Brightness brightness) =>
        brightness == Brightness.light ? light : dark;

    test('AppBars holds exactly the six measured bar classes, per pass', () {
      final List<String> expected = (<String>[...pastelBars, rainbow]).toList()
        ..sort();
      expect(AppBars.light.keys.toList()..sort(), expected);
      expect(AppBars.dark.keys.toList()..sort(), expected);
    });

    for (final String cls in pastelBars) {
      for (final Brightness brightness in Brightness.values) {
        final String pass = brightness == Brightness.light
            ? 'light-desktop'
            : 'dark-desktop';
        test('$cls $pass is a token fill and nothing else', () {
          final Map<String, String> decls = barDecls(cls);
          expect(
            decls.keys.toList(),
            <String>['background'],
            reason:
                '$cls is a one-declaration rule; a second declaration '
                'means the row needs a field for it',
          );
          final RegExpMatch? varRef = RegExp(r'^var\((--[a-z0-9-]+)\)$')
              .firstMatch(decls['background']!);
          expect(
            varRef,
            isNotNull,
            reason:
                '$cls background "${decls['background']}" is not a bare var',
          );
          final Map<String, dynamic> p = _probe(
            probesFor(brightness),
            cls,
            pass,
          );
          final AppBarSpec spec = AppBars.resolve(cls, brightness);
          expect(spec.cssClass, cls);
          expect(spec.displayCss, _probeValue(p, 'display', cls));
          final String token = varRef!.group(1)!;
          final Color measured = _measuredColour(rootFor(brightness), token);
          expect(
            spec.fillColor,
            measured,
            reason: '$cls fills $token as the $pass pass measures it',
          );
          expect(spec.fillColor, _probeColour(p, 'backgroundColor', cls));
          expect(
            spec.fillGradient,
            isNull,
            reason: 'the pastel probe painted no gradient',
          );
          expect(
            spec.heightPx,
            isNull,
            reason: 'the class authors no height; it is the caller’s geometry',
          );
          expect(
            spec.radiusPx,
            _pxOf(_probeValue(p, 'borderRadius', cls), '$cls probe radius'),
          );
          expect(_probeValue(p, 'boxShadow', cls), 'none');
          expect(_probeValue(p, 'backgroundImage', cls), 'none');
          expect(_probeValue(p, 'backdropFilter', cls), 'none');
        });
      }
    }

    for (final Brightness brightness in Brightness.values) {
      final String pass = brightness == Brightness.light
          ? 'light-desktop'
          : 'dark-desktop';
      test('$pass $rainbow is the --rainbow token in its own round box', () {
        final Map<String, String> decls = barDecls(rainbow);
        expect(
          decls.keys.toList()..sort(),
          <String>['background', 'border-radius', 'height'],
          reason: 'the rainbow brings its own box; anything more needs a field',
        );
        final RegExpMatch? varRef = RegExp(r'^var\((--[a-z0-9-]+)\)$')
            .firstMatch(decls['background']!);
        expect(varRef, isNotNull);
        final Map<String, dynamic> root = rootFor(brightness);
        final String token = varRef!.group(1)!;
        final _GradientExpectation authored = _gradient(root, token);
        final Map<String, dynamic> p = _probe(
          probesFor(brightness),
          rainbow,
          pass,
        );
        final _GradientExpectation measured = _gradientValue(
          _probeValue(p, 'backgroundImage', rainbow),
        );
        expect(
          authored.colors,
          measured.colors,
          reason: 'the named token substitutes to what the probe measured',
        );
        expect(authored.stops, measured.stops);
        final AppBarSpec spec = AppBars.resolve(rainbow, brightness);
        expect(spec.cssClass, rainbow);
        expect(spec.displayCss, _probeValue(p, 'display', rainbow));
        expect(spec.heightPx, _pxOf(decls['height']!, '$rainbow height'));
        expect(
          spec.radiusPx,
          _pxOf(decls['border-radius']!, '$rainbow radius'),
        );
        expect(
          spec.radiusPx,
          _pxOf(
            _probeValue(p, 'borderRadius', rainbow),
            '$rainbow probe radius',
          ),
        );
        expect(
          spec.fillColor,
          isNull,
          reason: 'the bar’s paint is the gradient; the fill measured through',
        );
        expect(_probeColour(p, 'backgroundColor', rainbow).a, 0);
        final LinearGradient painted = spec.fillGradient!;
        final Alignment begin = painted.begin as Alignment;
        final Alignment end = painted.end as Alignment;
        expect(begin.x, closeTo(authored.begin.x, 1e-9));
        expect(begin.y, closeTo(authored.begin.y, 1e-9));
        expect(end.x, closeTo(authored.end.x, 1e-9));
        expect(end.y, closeTo(authored.end.y, 1e-9));
        expect(painted.colors, authored.colors);
        expect(painted.stops, authored.stops);
        expect(spec.borderRadius, BorderRadius.circular(spec.radiusPx));
        expect(_probeValue(p, 'boxShadow', rainbow), 'none');
      });
    }

    test('bar rows do not move on the phone', () {
      const List<String> fields = <String>[
        'display',
        'borderRadius',
        'backgroundColor',
        'backgroundImage',
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
      for (final String cls in <String>[...pastelBars, rainbow]) {
        for (final MapEntry<String, List<Map<String, dynamic>>> entry
            in pairs.entries) {
          final String phonePass = entry.key;
          final String desktopPass = phonePass.replaceAll('-phone', '-desktop');
          for (final String field in fields) {
            expect(
              _probeValue(_probe(entry.value[0], cls, phonePass), field, cls),
              _probeValue(_probe(entry.value[1], cls, desktopPass), field, cls),
              reason: '$phonePass moves $field for $cls',
            );
          }
        }
      }
    });

    test('an unknown bar class is an error, not a Material default', () {
      for (final Brightness brightness in Brightness.values) {
        expect(
          () => AppBars.resolve('.bar-imaginary', brightness),
          throwsArgumentError,
        );
      }
    });
  });

  group('UI_SPEC 6 numerals and money', () {
    /// The §6 rows `AppNumerals` ports. `.eyebrow` is absent on purpose:
    /// `AppLabels` already owns that class, together with the `text-transform`
    /// no figure carries.
    const List<String> numeralClasses = <String>[
      '.money-display',
      '.numeral',
      '.numeral-md',
      '.numeral-hero',
      '.numeral-sup',
      '.money',
      '.mono',
    ];

    /// The declarations each of those rules is allowed to author. A second one
    /// would be a design fact `AppNumeralSpec` has no field for, so the
    /// generator refuses to emit the row and this file refuses to read it.
    const Map<String, List<String>> numeralDeclarations =
        <String, List<String>>{
          '.money-display': <String>[
            'font-family',
            'font-size',
            'font-weight',
            'line-height',
            'letter-spacing',
            'font-variant-numeric',
            'overflow-wrap',
            'min-width',
          ],
          '.numeral': <String>[
            'font-family',
            'font-size',
            'font-weight',
            'line-height',
            'letter-spacing',
            'font-variant-numeric',
            'overflow-wrap',
            'min-width',
          ],
          '.numeral-md': <String>['font-size', 'font-weight'],
          '.numeral-hero': <String>['font-size'],
          '.numeral-sup': <String>[
            'font-family',
            'font-size',
            'font-weight',
            'letter-spacing',
            'vertical-align',
            'margin-left',
            'color',
          ],
          '.money': <String>['font-variant-numeric', 'letter-spacing'],
          '.mono': <String>['font-family', 'font-variant-numeric'],
        };

    final List<String> numeralPasses = <String>[
      'light-desktop',
      'dark-desktop',
      'light-phone',
      'dark-phone',
    ];
    Map<String, dynamic> themeOf(String pass) => _theme(measurement, pass);
    Map<String, dynamic> rootOf(String pass) => _rootOf(themeOf(pass));
    Map<String, dynamic> probesOf(String pass) => _probesOf(themeOf(pass));
    Map<String, dynamic> bodyOf(String pass) =>
        _probe(probesOf(pass), 'body', pass);
    double innerWidthOf(String pass) =>
        (themeOf(pass)['innerWidth']! as num).toDouble();

    /// The viewport a `cqi` falls back to when the probed element is in no
    /// query container: CSS uses the small viewport, which is the page height on
    /// a landscape desktop and the page width on a phone.
    double smallViewportOf(String pass) {
      final Map<String, dynamic> viewport =
          themeOf(pass)['viewport']! as Map<String, dynamic>;
      return math.min(
        (viewport['width']! as num).toDouble(),
        (viewport['height']! as num).toDouble(),
      );
    }

    Map<String, String> ruleDecls(String cls) =>
        _cssDecls(cssLines, '$cls {', cls);

    /// `body` is authored twice in `src/index.css` — `overflow-x: clip` at :301,
    /// then the face at :305 — so this finds the one that carries the ink.
    Map<String, String> bodyRule() {
      for (int i = 0; i < cssLines.length; i++) {
        if (cssLines[i] != 'body {') continue;
        final Map<String, String> decls = _cssDecls(
          cssLines.sublist(i),
          'body {',
          'body',
        );
        if (decls.containsKey('color')) return decls;
      }
      throw StateError('no body rule authors a colour');
    }

    String tokenOf(String raw, String label) {
      final RegExpMatch? m = RegExp(r'^var\((--[a-z0-9-]+)\)$')
          .firstMatch(raw.trim());
      if (m == null) throw StateError('$label: "$raw" is not a bare var()');
      return m.group(1)!;
    }

    double emOf(String raw, String label) {
      final RegExpMatch? m = RegExp(r'^(-?[\d.]+)em$').firstMatch(raw.trim());
      if (m == null) throw StateError('$label: "$raw" is not an em multiplier');
      return double.parse(m.group(1)!);
    }

    String firstFamily(String stack) =>
        stack.split(',').first.trim().replaceAll(RegExp('^["\']|["\']\$'), '');

    double probeLetterSpacing(Map<String, dynamic> probe, String cls) {
      final String raw = _probeValue(probe, 'letterSpacing', cls);
      return raw == 'normal' ? 0.0 : _pxOf(raw, '$cls letter-spacing');
    }

    /// `clamp(lo px, pref vw, hi px)` at a viewport — the same law Chrome ran to
    /// produce the probe, read from the token or rule the row names.
    double clampAt(String raw, double viewportPx, String label) {
      final RegExpMatch? m = RegExp(
        r'^clamp\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)vw\s*,\s*(-?[\d.]+)px\s*\)$',
      ).firstMatch(raw.trim());
      if (m == null) throw StateError('$label: "$raw" is not a px/vw/px clamp');
      final double lo = double.parse(m.group(1)!);
      final double preferred = double.parse(m.group(2)!) * viewportPx / 100.0;
      final double hi = double.parse(m.group(3)!);
      return math.min(math.max(preferred, lo), hi);
    }

    /// The authored font-size law of a row, resolved at one measured viewport.
    /// `.numeral-sup` returns the size it *specified*; Chrome floors the size it
    /// used, and the row's own test pins the difference.
    double lawFontSize(String cls, String pass) {
      final Map<String, dynamic> root = rootOf(pass);
      final String? authored = ruleDecls(cls)['font-size']?.trim();
      final double viewport = innerWidthOf(pass);
      if (authored == null) {
        return _pxOf(
          _probeValue(bodyOf(pass), 'fontSize', 'body'),
          'body font size',
        );
      }
      final RegExpMatch? token = RegExp(r'^var\((--[a-z0-9-]+)\)$')
          .firstMatch(authored);
      if (token != null) {
        return clampAt(
          _raw(root, token.group(1)!),
          viewport,
          '$cls ${token.group(1)}',
        );
      }
      if (authored.startsWith('clamp(')) {
        return clampAt(authored, viewport, '$cls font-size');
      }
      final RegExpMatch? hero = RegExp(
        r'^min\(\s*var\((--[a-z0-9-]+)\)\s*,\s*([\d.]+)cqi\s*\)$',
      ).firstMatch(authored);
      if (hero != null) {
        final double cap = clampAt(
          _raw(root, hero.group(1)!),
          viewport,
          '$cls ${hero.group(1)}',
        );
        final double query =
            double.parse(hero.group(2)!) / 100.0 * smallViewportOf(pass);
        return math.min(cap, query);
      }
      final RegExpMatch? em = RegExp(r'^([\d.]+)em$').firstMatch(authored);
      if (em != null) {
        return double.parse(em.group(1)!) *
            _pxOf(_probeValue(bodyOf(pass), 'fontSize', 'body'), 'body size');
      }
      throw StateError('$cls: unhandled font-size "$authored"');
    }

    test('AppNumerals carries exactly the seven measured rows, per pass', () {
      final List<String> expected = numeralClasses.toList()..sort();
      for (final Map<String, AppNumeralSpec> table
          in <Map<String, AppNumeralSpec>>[
            AppNumerals.light,
            AppNumerals.dark,
          ]) {
        expect(table.keys.toList()..sort(), expected);
      }
    });

    for (final Brightness brightness in Brightness.values) {
      final String pass = brightness == Brightness.light
          ? 'light-phone'
          : 'dark-phone';
      for (final String cls in numeralClasses) {
        test('$cls is the $pass row, re-derived from its own rule', () {
          final Map<String, String> decls = ruleDecls(cls);
          expect(
            decls.keys.toList(),
            numeralDeclarations[cls],
            reason:
                '$cls authors exactly the properties AppNumeralSpec carries; '
                'a new declaration needs a field and a call site',
          );
          final Map<String, dynamic> probe = _probe(probesOf(pass), cls, pass);
          final AppNumeralSpec spec = AppNumerals.resolve(cls, brightness);
          expect(spec.cssClass, cls);
          expect(
            spec.authoredSrc,
            'src/index.css:${cssLines.indexOf('$cls {') + 1}',
          );
          expect(spec.displayCss, _probeValue(probe, 'display', cls));
          expect(_probeValue(probe, 'position', cls), 'static');

          final double measured = _pxOf(
            _probeValue(probe, 'fontSize', cls),
            '$cls probe size',
          );
          final double law = lawFontSize(cls, pass);
          expect(spec.fontSizePx, measured);
          if (cls == '.numeral-sup') {
            expect(
              law,
              lessThan(measured),
              reason:
                  'the row specified ${law}px and Chrome floored the used size '
                  'to ${measured}px; the call site never reads either',
            );
          } else {
            expect(
              spec.fontSizePx,
              closeTo(law, 1e-9),
              reason: '$cls is what its own font-size law resolves to at $pass',
            );
          }

          final String? heightRaw = decls['line-height'];
          final double height = heightRaw == null
              ? _probeRatio(probesOf(pass), 'body')
              : _ratio(heightRaw);
          expect(spec.heightRatio, closeTo(height, 1e-12));
          expect(
            spec.heightRatio,
            closeTo(_probeRatio(probesOf(pass), cls), 1e-9),
            reason: '$cls measured line-height over measured font-size',
          );

          final double lsEm = decls['letter-spacing'] == null
              ? 0.0
              : emOf(decls['letter-spacing']!, '$cls letter-spacing');
          expect(spec.letterSpacingEm, closeTo(lsEm, 1e-12));
          expect(
            spec.letterSpacingPx,
            closeTo(probeLetterSpacing(probe, cls), 1e-9),
          );
          if (cls == '.numeral-sup') {
            // Tracking resolves from the SPECIFIED size even where Chrome floors
            // the used one, which is the whole evidence for the floor.
            expect(
              spec.letterSpacingPx,
              closeTo(
                lsEm *
                    emOf(decls['font-size']!, '$cls font-size') *
                    AppNumerals.rootFontSizePx,
                1e-9,
              ),
            );
          } else {
            expect(
              spec.letterSpacingPx,
              closeTo(lsEm * measured, 1e-9),
              reason: '$cls tracking is ${lsEm}em of its own used size',
            );
          }

          final int weight = decls['font-weight'] == null
              ? 400
              : int.parse(decls['font-weight']!.trim());
          expect(spec.fontWeight, weight);
          expect(spec.weight, FontWeight.values[weight ~/ 100 - 1]);
          expect(_probeValue(probe, 'fontWeight', cls), '$weight');

          final String familyToken = decls['font-family'] == null
              ? tokenOf(bodyRule()['font-family']!, 'body font-family')
              : tokenOf(decls['font-family']!, '$cls font-family');
          expect(
            firstFamily(_substituted(rootOf(pass), familyToken)),
            spec.fontFamily,
            reason: '$cls takes the first family of $familyToken',
          );
          expect(
            firstFamily(_probeValue(probe, 'fontFamily', cls)),
            spec.fontFamily,
          );

          final String? colourRaw = decls['color'];
          final String colourToken = colourRaw == null
              ? tokenOf(bodyRule()['color']!, 'body colour')
              : tokenOf(colourRaw, '$cls colour');
          expect(spec.inheritsColor, colourRaw == null);
          expect(
            spec.authoredColorToken,
            colourRaw == null ? null : colourToken,
          );
          expect(spec.textColor, _measuredColour(rootOf(pass), colourToken));
          expect(spec.textColor, _probeColour(probe, 'color', cls));

          final String? numeric = decls['font-variant-numeric'];
          expect(spec.tabularNums, numeric != null);
          if (numeric != null) expect(numeric.trim(), 'tabular-nums');
          final String? wrap = decls['overflow-wrap'];
          expect(spec.overflowWrapAnywhere, wrap != null);
          if (wrap != null) expect(wrap.trim(), 'anywhere');
          final String? minWidth = decls['min-width'];
          expect(spec.minWidthZero, minWidth != null);
          if (minWidth != null) {
            expect(
              minWidth.trim(),
              anyOf('0', '0px'),
              reason: '$cls min-width is the unitless zero the port reads',
            );
          }

          if (cls == '.numeral-sup') {
            expect(
              emOf(decls['vertical-align']!, '$cls vertical-align'),
              AppNumerals.supVerticalAlignEm,
            );
            expect(
              emOf(decls['margin-left']!, '$cls margin-left'),
              AppNumerals.supMarginLeftEm,
            );
            expect(
              emOf(decls['font-size']!, '$cls font-size'),
              AppNumerals.supFontSizeEm,
            );
            expect(lsEm, AppNumerals.supLetterSpacingEm);
          } else {
            expect(
              decls.containsKey('vertical-align'),
              false,
              reason: 'only the sup row raises itself',
            );
            expect(
              decls.containsKey('margin-left'),
              false,
              reason: 'only the sup row spaces itself',
            );
          }
          if (cls == '.numeral-hero') {
            final RegExpMatch? fraction = RegExp(
              r'^min\(\s*var\(--text-[a-z-]+\)\s*,\s*([\d.]+)cqi\s*\)$',
            ).firstMatch(decls['font-size']!.trim());
            expect(fraction, isNotNull);
            expect(
              AppNumerals.heroWidthFraction,
              closeTo(double.parse(fraction!.group(1)!) / 100.0, 1e-12),
            );
          }
        });
      }
    }

    test('the root size the ems and vw resolve against is the body probe', () {
      for (final String pass in numeralPasses) {
        expect(
          AppNumerals.rootFontSizePx,
          _pxOf(_probeValue(bodyOf(pass), 'fontSize', 'body'), 'body size'),
          reason: '$pass measures a different root than the port declares',
        );
      }
      expect(AppNumerals.rootFontSizePx, 16.0);
    });

    test('a numeral row is a bare face on all four passes', () {
      for (final String pass in numeralPasses) {
        for (final String cls in numeralClasses) {
          final Map<String, dynamic> probe = _probe(probesOf(pass), cls, pass);
          expect(
            _probeColour(probe, 'backgroundColor', cls).a,
            0,
            reason: '$cls $pass paints a fill; a figure owns no box',
          );
          expect(_probeValue(probe, 'boxShadow', cls), 'none');
          expect(
            _pxOf(_probeValue(probe, 'borderTopWidth', cls), '$cls border'),
            0.0,
          );
          expect(
            _pxOf(_probeValue(probe, 'padding', cls), '$cls padding'),
            0.0,
          );
          expect(_probeValue(probe, 'backgroundImage', cls), 'none');
        }
      }
    });

    test('every row resolves its own law at both viewports', () {
      for (final String cls in numeralClasses) {
        final double lsEm =
            cls == '.money' ||
                cls == '.numeral' ||
                cls == '.money-display' ||
                cls == '.numeral-sup'
            ? emOf(ruleDecls(cls)['letter-spacing']!, '$cls letter-spacing')
            : 0.0;
        for (final String pass in numeralPasses) {
          final Map<String, dynamic> probe = _probe(probesOf(pass), cls, pass);
          final double measured = _pxOf(
            _probeValue(probe, 'fontSize', cls),
            '$cls $pass size',
          );
          final double law = lawFontSize(cls, pass);
          if (cls == '.numeral-sup') {
            expect(
              measured,
              greaterThanOrEqualTo(law),
              reason:
                  '$cls $pass: Chrome floors a tiny used size, never inflates it',
            );
          } else {
            expect(
              measured,
              closeTo(law, 1e-9),
              reason: '$cls at $pass (${innerWidthOf(pass)}px)',
            );
          }
          expect(
            probeLetterSpacing(probe, cls),
            closeTo(cls == '.numeral-sup' ? lsEm * law : lsEm * measured, 1e-9),
            reason: '$cls $pass tracks ${lsEm}em of its specified size',
          );
        }
      }
    });

    test(
      'the clamps sit at their floor on the phone and ceiling on the desktop',
      () {
        final Map<String, List<double>> want = <String, List<double>>{
          '.numeral': <double>[38.0, 62.0],
          '.money-display': <double>[30.0, 46.0],
          '.numeral-md': <double>[26.0, 34.0],
          '.numeral-hero': <double>[38.0, 62.0],
        };
        want.forEach((String cls, List<double> sizes) {
          expect(
            lawFontSize(cls, 'light-phone'),
            sizes[0],
            reason: '$cls at 8vw/6vw/4.5vw of 390px is under its floor',
          );
          expect(
            lawFontSize(cls, 'light-desktop'),
            sizes[1],
            reason: '$cls at 1440px is over its ceiling',
          );
        });
        expect(
          AppNumerals.resolve('.numeral', Brightness.light).fontSizePx,
          38.0,
        );
        expect(
          AppNumerals.resolve('.money-display', Brightness.dark).fontSizePx,
          30.0,
        );
      },
    );

    test('the viewport moves nothing but the size a clamp resolves', () {
      for (final String brightnessName in <String>['light', 'dark']) {
        final String phone = '$brightnessName-phone';
        final String desktop = '$brightnessName-desktop';
        for (final String cls in numeralClasses) {
          final Map<String, dynamic> p = _probe(probesOf(phone), cls, phone);
          final Map<String, dynamic> d = _probe(
            probesOf(desktop),
            cls,
            desktop,
          );
          for (final String field in <String>[
            'display',
            'position',
            'fontFamily',
            'fontWeight',
          ]) {
            expect(
              _probeValue(p, field, cls),
              _probeValue(d, field, cls),
              reason: '$cls $field moves with the viewport',
            );
          }
          expect(
            _probeColour(p, 'color', cls),
            _probeColour(d, 'color', cls),
            reason: '$cls ink moves with the viewport',
          );
          expect(
            _probeRatio(probesOf(phone), cls),
            closeTo(_probeRatio(probesOf(desktop), cls), 1e-9),
            reason: '$cls keeps its line-height ratio across the clamp',
          );
        }
      }
    });

    test('brightness moves the ink and no metric', () {
      for (final String cls in numeralClasses) {
        final AppNumeralSpec lightRow = AppNumerals.resolve(
          cls,
          Brightness.light,
        );
        final AppNumeralSpec darkRow = AppNumerals.resolve(
          cls,
          Brightness.dark,
        );
        expect(darkRow.fontSizePx, lightRow.fontSizePx);
        expect(darkRow.heightRatio, lightRow.heightRatio);
        expect(darkRow.letterSpacingPx, lightRow.letterSpacingPx);
        expect(darkRow.letterSpacingEm, lightRow.letterSpacingEm);
        expect(darkRow.fontWeight, lightRow.fontWeight);
        expect(darkRow.fontFamily, lightRow.fontFamily);
        expect(
          darkRow.textColor,
          isNot(lightRow.textColor),
          reason: '$cls is the same figure in both themes only by accident',
        );
      }
    });

    test(
      'the sup probe is the floored standalone row, never a call-site value',
      () {
        const String cls = '.numeral-sup';
        final Map<String, String> decls = ruleDecls(cls);
        final double specified =
            emOf(decls['font-size']!, '$cls font-size') *
            AppNumerals.rootFontSizePx;
        final AppNumeralSpec sup = AppNumerals.resolve(cls, Brightness.light);
        expect(specified, closeTo(4.48, 1e-12));
        expect(sup.fontSizePx, greaterThan(specified));
        expect(
          sup.letterSpacingPx,
          closeTo(emOf(decls['letter-spacing']!, '$cls ls') * specified, 1e-12),
          reason:
              'tracking kept resolving from the specified size while the used one '
              'was floored — which is why the port reads the ems, not the row',
        );
      },
    );

    test('supAt resolves the four authored ems against the parent figure', () {
      for (final Brightness brightness in Brightness.values) {
        final AppNumeralSpec sup = AppNumerals.resolve(
          '.numeral-sup',
          brightness,
        );
        for (final double parent in <double>[38.0, 30.0, 19.0]) {
          final AppNumeralSupBox box = AppNumerals.supAt(parent, brightness);
          final double size = AppNumerals.supFontSizeEm * parent;
          expect(box.style.fontSize, closeTo(size, 1e-12));
          expect(
            box.style.letterSpacing,
            closeTo(AppNumerals.supLetterSpacingEm * size, 1e-12),
          );
          expect(
            box.style.height,
            isNull,
            reason:
                'CSS line-height on an inline span does not grow the parent '
                'line box, while Flutter TextStyle.height does',
          );
          expect(box.style.fontWeight, sup.weight);
          expect(box.style.fontFamily, sup.fontFamily);
          expect(box.style.color, sup.textColor);
          expect(
            box.liftPx,
            closeTo(AppNumerals.supVerticalAlignEm * size, 1e-12),
          );
          expect(box.gapPx, closeTo(AppNumerals.supMarginLeftEm * size, 1e-12));
        }
      }
      final AppNumeralSupBox hero = AppNumerals.supAt(38.0, Brightness.light);
      expect(hero.style.fontSize, closeTo(10.64, 1e-9));
      expect(hero.style.letterSpacing, closeTo(0.4256, 1e-9));
      expect(hero.liftPx, closeTo(6.5968, 1e-9));
      expect(hero.gapPx, closeTo(2.9792, 1e-9));
    });

    test('heroFontSizePx is the authored min()', () {
      for (final Brightness brightness in Brightness.values) {
        final double numeral = AppNumerals.resolve(
          '.numeral',
          brightness,
        ).fontSizePx;
        expect(AppNumerals.heroFontSizePx(400.0, brightness), numeral);
        expect(AppNumerals.heroFontSizePx(1200.0, brightness), numeral);
        expect(
          AppNumerals.heroFontSizePx(253.33333333333334, brightness),
          closeTo(numeral, 1e-9),
        );
        expect(
          AppNumerals.heroFontSizePx(200.0, brightness),
          closeTo(30.0, 1e-9),
        );
        expect(
          AppNumerals.heroFontSizePx(120.0, brightness),
          closeTo(18.0, 1e-9),
        );
        expect(
          AppNumerals.heroWidthFraction * 390.0,
          greaterThan(numeral),
          reason:
              'the phone card the probe was taken on keeps the numeral size',
        );
      }
    });

    test("AppTypography's five numeral styles are the same projection", () {
      const Map<String, TextStyle> ported = <String, TextStyle>{
        '.money-display': AppTypography.moneyDisplay,
        '.numeral': AppTypography.numeral,
        '.numeral-hero': AppTypography.numeralHero,
        '.numeral-md': AppTypography.numeralMd,
        '.numeral-sup': AppTypography.numeralSup,
      };
      for (final MapEntry<String, TextStyle> entry in ported.entries) {
        final AppNumeralSpec row = AppNumerals.resolve(
          entry.key,
          Brightness.light,
        );
        final TextStyle style = entry.value;
        expect(style.fontSize, row.fontSizePx, reason: entry.key);
        expect(
          style.height,
          closeTo(row.heightRatio, 1e-12),
          reason: entry.key,
        );
        expect(style.fontWeight?.value, row.fontWeight, reason: entry.key);
        expect(style.fontFamily, row.fontFamily, reason: entry.key);
        if (entry.key == '.numeral-sup') {
          expect(
            style.letterSpacing,
            row.letterSpacingPx,
            reason:
                'the one row the two projections cannot agree on: AppTypography '
                'keeps the measured floor, AppNumeralSpec carries the authored '
                'em and re-resolves it at the parent size',
          );
        } else {
          expect(
            style.letterSpacing,
            closeTo(row.textStyle.letterSpacing!, 1e-9),
            reason: entry.key,
          );
        }
        expect(
          style.color,
          isNull,
          reason:
              'AppTypography is the ink-free projection; the row carries it',
        );
      }
    });
  });

  group('ledger stacks — the #75 row and list measured whole', () {
    // #75 extended the utility-stack tier to the ledger: TransactionRow's seven
    // slots, CategoryChip's nine (six tones and three size arms), the day head
    // and the six list-level stacks Dashboard and Reports Centre write. Each row
    // puts the class list the component really writes — plus, beside it, the
    // inline style that element writes — on one detached element and reads the
    // computed value against an unclassed control, in all four passes. The
    // tier-wide tests in the #55 group already prove every cited fragment is
    // verbatim at its cited line and that every pass measured every row, so this
    // group reads the ledger's own evidence instead: what the box is mounted as,
    // the two states in src/index.css no probe can see, and where the two
    // viewports disagree. Nothing here builds a widget.
    final Map<String, dynamic> ledStacks =
        measurement['utilityStacks']! as Map<String, dynamic>;
    final List<dynamic> ledRows = ledStacks['rows']! as List<dynamic>;
    final List<dynamic> ledNonCss =
        ledStacks['authoredNonCss']! as List<dynamic>;
    const List<String> ledPasses = <String>[
      'light-desktop',
      'dark-desktop',
      'light-phone',
      'dark-phone',
    ];
    const String chipSrc = 'src/components/ui/CategoryChip.tsx';
    const String rowSrc = 'src/components/ui/TransactionRow.tsx';
    const String dashSrc = 'src/components/Dashboard.tsx';
    const String rcSrc = 'src/components/ReportsCentre.tsx';
    const String cssSrc = 'src/index.css';
    // Chrome's serialisation of `rounded-full`, whose `calc(infinity * 1px)` the
    // engine clamps to its own float. Recorded verbatim, because that is what
    // every reader of the tier sees.
    const String fullRadius = '3.35544e+07px';

    final RegExp ledFamilyName = RegExp(
      r'^(txrow-|day-head-label$|ledger-|cat-chip-)',
    );
    final List<String> ledFamily = ledRows
        .map((dynamic r) => (r as Map<String, dynamic>)['name']! as String)
        .where((String name) => ledFamilyName.hasMatch(name))
        .toList();

    /// The six tone rows, in the order `TONE_BG` declares them. The three size
    /// arms are excluded because they hold one tone on purpose.
    final List<String> ledToneChips = <String>[
      'cat-chip-md-pink',
      'cat-chip-md-mint',
      'cat-chip-md-yellow',
      'cat-chip-md-lavender',
      'cat-chip-md-blue',
      'cat-chip-md-ink',
    ];

    /// The nine chips: six tones plus the three size arms.
    List<String> ledChips(List<String> family) => <String>[
      for (final String n in family)
        if (n.startsWith('cat-chip-')) n,
    ]..sort();

    /// The ten `authoredNonCss` records the ledger added, sorted. Everything
    /// else in that array belongs to the chrome families #55 and #56.
    const List<String> ledRecordNames = <String>[
      'cat-chip-icon-and-size-tables',
      'cat-chip-tone-choice',
      'ledger-day-grouping-and-header',
      'ledger-empty-class-declared-nowhere',
      'ledger-empty-copy',
      'pill-hidden-utility-is-inert',
      'txrow-amount-signed-vs-absolute',
      'txrow-arrow-sizes',
      'txrow-isincome-predicates-disagree',
      'txrow-meta-composition',
    ];
    bool ledIsRecord(String name) => ledRecordNames.contains(name);

    Map<String, dynamic> ledCite(String name) {
      for (final dynamic r in ledRows) {
        final Map<String, dynamic> row = r as Map<String, dynamic>;
        if (row['name'] == name) return row;
      }
      throw StateError('ui-tokens.json cites no stack row "$name"');
    }

    Map<String, dynamic> ledAuthored(String name) {
      for (final dynamic e in ledNonCss) {
        final Map<String, dynamic> entry = e as Map<String, dynamic>;
        if (entry['name'] == name) return entry;
      }
      throw StateError('ui-tokens.json records no authored entry "$name"');
    }

    /// The citation lines of one authored entry, with the file each was read from.
    List<List<Object>> ledAuthoredParts(String name) {
      final Map<String, dynamic> rec = ledAuthored(name);
      return <List<Object>>[
        for (final dynamic p in rec['parts']! as List<dynamic>)
          <Object>[
            (p as Map<String, dynamic>)['text']! as String,
            (p['src'] ?? rec['src'] ?? ledStacks['source'])! as String,
            (p['line']! as num).toInt(),
          ],
      ];
    }

    Map<String, dynamic> ledProps(String pass, String name) {
      final Object? r =
          (_theme(measurement, pass)['stacks']! as Map<String, dynamic>)[name];
      if (r == null) throw StateError('no stack $name measured at $pass');
      return (r as Map<String, dynamic>)['props']! as Map<String, dynamic>;
    }

    List<String> ledChanged(String pass, String name) {
      final Object? r =
          (_theme(measurement, pass)['stacks']! as Map<String, dynamic>)[name];
      if (r == null) throw StateError('no stack $name measured at $pass');
      return ((r as Map<String, dynamic>)['changed']! as List<dynamic>)
          .cast<String>();
    }

    /// `true` where the row carries the property at all. A stack holds the fixed
    /// set the probe always reads plus whatever the class list moved, so an
    /// absent key is a fact about the component, not a gap in the measurement.
    bool ledHas(String pass, String name, String field) =>
        ledProps(pass, name).containsKey(field);

    String ledVal(String pass, String name, String field) {
      final Object? value = ledProps(pass, name)[field];
      if (value == null) {
        throw StateError('$pass $name: no measured $field');
      }
      if (value is String) return value;
      final Map<String, dynamic> object = value as Map<String, dynamic>;
      return (object['substituted'] ?? object['raw'])! as String;
    }

    Color ledColour(String pass, String name, String field) {
      final Object? value = ledProps(pass, name)[field];
      if (value is! Map<String, dynamic> || value['srgb'] == null) {
        throw StateError('$pass $name: $field is not a measured colour');
      }
      final Map<String, dynamic> srgb = value['srgb']! as Map<String, dynamic>;
      return Color.fromRGBO(
        (srgb['r']! as num).round(),
        (srgb['g']! as num).round(),
        (srgb['b']! as num).round(),
        (srgb['alpha']! as num).toDouble(),
      );
    }

    List<int> ledChannels(String pass, String name, String field) {
      final Map<String, dynamic> srgb =
          (ledProps(pass, name)[field]! as Map<String, dynamic>)['srgb']!
              as Map<String, dynamic>;
      return <int>[
        (srgb['r']! as num).round(),
        (srgb['g']! as num).round(),
        (srgb['b']! as num).round(),
      ];
    }

    double ledAlpha(String pass, String name, String field) {
      final Map<String, dynamic> srgb =
          (ledProps(pass, name)[field]! as Map<String, dynamic>)['srgb']!
              as Map<String, dynamic>;
      return (srgb['alpha']! as num).toDouble();
    }

    /// A px length Chrome may print in exponential form — the full-round radius
    /// among them. Anything else is not a length the port could carry.
    double ledPx(String pass, String name, String field) {
      final RegExpMatch? m = RegExp(r'^(-?[\d.]+(?:e\+\d+)?)px$')
          .firstMatch(ledVal(pass, name, field));
      if (m == null) {
        throw StateError(
          '$pass $name: "${ledVal(pass, name, field)}" for $field is not px',
        );
      }
      return double.parse(m.group(1)!);
    }

    /// A `padding` shorthand as the symmetric pair the port reproduces, which
    /// generation requires the row to actually have authored.
    List<double> ledPadSides(String pass, String name) {
      final List<String> parts = ledVal(pass, name, 'padding').split(' ');
      if (parts.isEmpty || parts.length > 4) {
        throw StateError(
          '$pass $name: padding "${parts.join(' ')}" is not a 1–4 part shorthand',
        );
      }
      final List<double> sides = parts
          .map((String piece) => _pxOf(piece, '$pass $name padding'))
          .toList();
      if (parts.length == 2 || sides[0] != sides[sides.length - 1]) {
        return sides;
      }
      throw StateError(
        '$pass $name: padding "${parts.join(' ')}" is not the pair this port reads',
      );
    }

    /// The one class list the record was measured with. A ledger row cites
    /// exactly one fragment; a second one means the tier was re-measured against
    /// a different element.
    String ledCls(String name) {
      final List<String> parts = <String>[];
      for (final dynamic p in ledCite(name)['parts']! as List<dynamic>) {
        final Map<String, dynamic> part = p as Map<String, dynamic>;
        final Object? cls = part['cls'];
        if (cls != null) parts.add(cls as String);
      }
      if (parts.length != 1) {
        throw StateError('$name cites ${parts.length} class lists, not one');
      }
      return parts.single;
    }

    List<String> ledClassTokens(String name) =>
        ledCls(name)
            .split(RegExp(r'\s+'))
            .where((String t) => t.isNotEmpty)
            .toList();

    /// The inline style a component writes beside its class list, with the line
    /// that produced it. Only a chip or a money arm has one.
    Map<String, dynamic> ledStylePart(String name) {
      for (final dynamic p in ledCite(name)['parts']! as List<dynamic>) {
        final Map<String, dynamic> part = p as Map<String, dynamic>;
        if (part['style'] != null) return part;
      }
      throw StateError('$name writes no inline style');
    }

    final Map<String, List<String>> ledFiles = <String, List<String>>{};
    List<String> ledLines(String src) =>
        ledFiles.putIfAbsent(src, () => webSource(src).split(RegExp(r'\r?\n')));

    String ledLineAt(String src, int line) {
      final List<String> lines = ledLines(src);
      if (line < 1 || line > lines.length) {
        throw StateError('$src:$line is outside a ${lines.length}-line file');
      }
      return lines[line - 1];
    }

    int ledCiteLine(String name) {
      final List<dynamic> parts = ledCite(name)['parts']! as List<dynamic>;
      return ((parts.first as Map<String, dynamic>)['line']! as num).toInt();
    }

    double ledSpacing(String pass) =>
        _lengthToPx(_raw(_rootOf(_theme(measurement, pass)), '--spacing'));

    double ledRootTokenPx(String pass, String token) =>
        _lengthToPx(_raw(_rootOf(_theme(measurement, pass)), token));

    Color ledTokenColour(String pass, String token) =>
        _measuredColour(_rootOf(_theme(measurement, pass)), token);

    /// A root token's rounded srgb channels — the same three numbers the tier
    /// prints for any measured colour, so a `color-mix` can be pinned to the
    /// token it mixed from.
    List<int> ledTokenChannels(String pass, String token) {
      final Map<String, dynamic> srgb =
          _token(_rootOf(_theme(measurement, pass)), token)['srgb']!
              as Map<String, dynamic>;
      return <int>[
        (srgb['r']! as num).round(),
        (srgb['g']! as num).round(),
        (srgb['b']! as num).round(),
      ];
    }

    /// `const NAME = size === 'xs' ? N : … ;` as one size-keyed table, the
    /// trailing arm read as `md` because that is the size the ternary falls
    /// through to and the one every other record cites.
    Map<String, double> ledTernary(String src, int line, String varName) {
      final String text = ledLineAt(src, line);
      if (!text.contains('const $varName = ')) {
        throw StateError(
          '$src:$line is no longer `const $varName = …`: "$text"',
        );
      }
      final Map<String, double> out = <String, double>{};
      for (final RegExpMatch m in RegExp(
        r"size === '(\w+)' \? ([\d.]+)",
      ).allMatches(text)) {
        out[m.group(1)!] = double.parse(m.group(2)!);
      }
      final RegExpMatch? fall = RegExp(r':\s*([\d.]+);').firstMatch(text);
      if (fall == null) {
        throw StateError('$src:$line has no default arm to call md');
      }
      out['md'] = double.parse(fall.group(1)!);
      if (out.length != 4) {
        throw StateError('$varName names ${out.length} sizes, not four');
      }
      return out;
    }

    /// The `const isInc = …;` boolean of one call site, split on its top-level
    /// `||` so a parenthesised clause stays one clause.
    List<String> ledPredicate(String src) {
      final List<String> lines = ledLines(src);
      final int at = lines.indexWhere(
        (String line) => line.trim() == 'const isInc =',
      );
      if (at < 0) throw StateError('$src has no `const isInc =` line to read');
      final StringBuffer collected = StringBuffer();
      bool closed = false;
      for (int i = at + 1; i < lines.length; i++) {
        collected.write(' ${lines[i].trim()}');
        if (lines[i].trim().endsWith(';')) {
          closed = true;
          break;
        }
      }
      if (!closed) throw StateError('$src: the isInc expression never closes');
      final String text = collected.toString().trim();
      final List<String> clauses = <String>[];
      final StringBuffer current = StringBuffer();
      int depth = 0;
      for (int i = 0; i < text.length; i++) {
        final int code = text.codeUnitAt(i);
        if (code == 0x28 /* ( */ ) depth++;
        if (code == 0x29 /* ) */ ) depth--;
        if (depth == 0 &&
            code == 0x7C /* | */ &&
            i + 1 < text.length &&
            text.codeUnitAt(i + 1) == 0x7C) {
          clauses.add(current.toString().trim());
          current.clear();
          i++;
        } else {
          current.writeCharCode(code);
        }
      }
      clauses.add(current.toString().trim().replaceAll(RegExp(r';$'), ''));
      if (clauses.length < 2 || clauses.any((String c) => c.isEmpty)) {
        throw StateError('$src parsed ${clauses.length} clauses: $clauses');
      }
      return clauses;
    }

    test('the family is 26 rows across the four files the ledger is written in', () {
      final Map<String, int> bySource = <String, int>{};
      for (final dynamic r in ledRows) {
        final Map<String, dynamic> row = r as Map<String, dynamic>;
        final String src = (row['src'] ?? ledStacks['source'])! as String;
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
          chipSrc: 9,
          rowSrc: 7,
          dashSrc: 6,
          rcSrc: 4,
        },
        reason:
            'the tier is 77 rows: the #55/#56 families plus the 26 the ledger '
            'adds. A component joining or leaving moves the count, not this test',
      );
      expect(ledFamily.length, 26, reason: 'the ledger family is 26 rows');
      expect(
        ledFamily.where((String n) => n.startsWith('cat-chip-')).length,
        9,
        reason: 'six tones sampled at md, plus three size arms',
      );
      expect(
        ledFamily.where((String n) => n.startsWith('txrow-')).length,
        8,
        reason:
            'seven slots TransactionRow writes, plus the eighth named for the '
            'slot it fills — `txrow-trailing-pill` is authored by Reports '
            'Centre, which is why the prefix count and the per-file count '
            'disagree by exactly one',
      );
      expect(
        ledFamily.where((String n) => n.startsWith('ledger-')).length,
        8,
        reason:
            'two rails, the divide pair, two last-child arms and two empties',
      );
      expect(
        ledFamily.where((String n) => n == 'day-head-label').length,
        1,
        reason: 'the only §6 probe class the family cites by its own name',
      );
      expect(
        ledFamily.where((String n) => ledCite(n)['src'] == null).toList(),
        isEmpty,
        reason:
            'no ledger row hides behind the tier fallback '
            '("${ledStacks['source']}"): each names the file the component '
            'writes, so a re-measure cannot silently rehome a citation',
      );
      expect(
        ledRows
            .where((dynamic r) => (r as Map<String, dynamic>)['src'] == null)
            .length,
        19,
        reason: 'the fallback is the NotificationContext set and nothing else',
      );
    });

    test('the box is the <button> the component mounts, UA reset and all', () {
      final Map<String, dynamic> box = ledCite('txrow-box');
      expect(
        box['tag'],
        'button',
        reason:
            'the record mounts the element the component writes, because what '
            'is being measured is the user-agent sheet a bare <button> brings',
      );
      expect(
        (box['attrs']! as Map<String, dynamic>)['type'],
        'button',
        reason: 'type="button" — a ledger row is never a form submit',
      );
      expect(
        ledLineAt(rowSrc, ledCiteLine('txrow-box')),
        contains('<button type="button" className="${ledCls('txrow-box')}"'),
        reason: 'the mount and the class list are one line of the component',
      );
      for (final String pass in ledPasses) {
        final Map<String, dynamic> p = ledProps(pass, 'txrow-box');
        expect(p['display'], 'flex', reason: '$pass: .tx-row');
        expect(p['alignItems'], 'center');
        expect(p['rowGap'], '12px', reason: '.tx-row gap, both axes');
        expect(p['columnGap'], '12px');
        expect(p['padding'], '12px 10px', reason: '.tx-row padding');
        expect(
          p['borderRadius'],
          '${ledRootTokenPx(pass, '--r-sm').toInt()}px',
          reason: 'border-radius: var(--r-sm) as this pass resolves it',
        );
        expect(
          p['textAlign'],
          'left',
          reason: 'text-left retakes the centred text a <button> ships with',
        );
        expect(p['cursor'], 'pointer', reason: '.tx-row, not the UA default');
        for (final String side in <String>[
          'borderTopWidth',
          'borderRightWidth',
          'borderBottomWidth',
          'borderLeftWidth',
        ]) {
          expect(
            p[side],
            '0px',
            reason: '$side: the frame a bare <button> draws is already gone',
          );
        }
        final List<double> pad = ledPadSides(pass, 'txrow-box');
        expect(
          ledPx(pass, 'txrow-box', 'height'),
          pad[0] * 2 + _lengthToPx(p['lineHeight']! as String),
          reason: 'the row is its own line box plus the inset it authors',
        );
        expect(
          ledChanged(pass, 'txrow-box').toSet(),
          <String>{
            'display',
            'alignItems',
            'rowGap',
            'columnGap',
            'padding',
            'height',
            'borderRadius',
            'textAlign',
            'cursor',
          },
          reason:
              '$pass: the nine properties the class list moves off an unclassed '
              '<button> — everything else the row paints is inheritance',
        );
      }
    });

    test('the row paints nothing at rest, and hover is a state the port drops', () {
      const String hoverHead = '.tx-row:hover {';
      final Map<String, String> hover = _cssDecls(
        cssLines,
        hoverHead,
        hoverHead,
      );
      expect(
        hover.keys.toList(),
        <String>['background'],
        reason:
            'the entire hover rule is one background declaration — there is no '
            'other property for a hover state to carry',
      );
      expect(hover['background'], 'var(--surface-2)');
      expect(
        ledClassTokens('txrow-box')
            .where((String token) => token.startsWith('hover:')),
        isEmpty,
        reason: 'no hover: utility is authored beside the class either',
      );
      for (final String pass in ledPasses) {
        expect(
          ledAlpha(pass, 'txrow-box', 'backgroundColor'),
          0.0,
          reason:
              '$pass: what the probe measures is the resting box, and the '
              'resting box is unpainted in both themes',
        );
        expect(
          ledChanged(pass, 'txrow-box').contains('backgroundColor'),
          isFalse,
          reason:
              '$pass: an unclassed <button> and this one agree — nothing in the '
              'class list fills the row, so there is no fill to drift',
        );
        expect(ledVal(pass, 'txrow-box', 'boxShadow'), 'none');
        expect(ledVal(pass, 'txrow-box', 'backgroundImage'), 'none');
        expect(
          ledColour(pass, 'txrow-box', 'backgroundColor'),
          isNot(ledTokenColour(pass, '--surface-2')),
          reason:
              '$pass: the resting fill is not the hover fill. Ruling D-U1 drops '
              'the hover, so this row has no state in which to paint it',
        );
      }
    });

    test('two rules claim the press, and the later one is what the row does', () {
      double scaleOf(String value) {
        final RegExpMatch? m = RegExp(r'^scale\(([\d.]+)\)$')
            .firstMatch(value.trim());
        if (m == null) throw StateError('"$value" is not a bare scale()');
        return double.parse(m.group(1)!);
      }

      const String txActive = '.tx-row:active {';
      const String pressActive = '.pressable:active {';
      final int txIndex = cssLines.indexOf(txActive);
      final int pressIndex = cssLines.indexOf(pressActive);
      expect(
        txIndex,
        isNonNegative,
        reason: 'src/index.css lost .tx-row:active',
      );
      expect(
        pressIndex,
        isNonNegative,
        reason: 'src/index.css lost .pressable:active',
      );
      final Map<String, String> txDecls = _cssDecls(
        cssLines,
        txActive,
        txActive,
      );
      final Map<String, String> pressDecls = _cssDecls(
        cssLines,
        pressActive,
        pressActive,
      );
      expect(txDecls.keys.toList(), <String>[
        'transform',
      ], reason: 'the row rule is only ever a press');
      expect(pressDecls.keys.toList(), <String>['transform']);
      final double txScale = scaleOf(txDecls['transform']!);
      final double pressScale = scaleOf(pressDecls['transform']!);
      expect(txScale, 0.995);
      expect(pressScale, 0.97);
      expect(
        pressScale,
        lessThan(txScale),
        reason:
            'the shared utility presses harder than the row does, so the number '
            'the port must carry is the utility\'s, not the row\'s own',
      );
      expect(
        pressIndex,
        greaterThan(txIndex),
        reason:
            'equal specificity — two class-and-pseudo selectors — so the later '
            'rule wins. Moving either block in src/index.css changes the press',
      );
      expect(
        ledClassTokens('txrow-box'),
        containsAll(<String>['tx-row', 'pressable']),
        reason: 'one box, two claims on it',
      );
      final Map<String, dynamic> root = _rootOf(
        _theme(measurement, 'light-desktop'),
      );
      expect(
        _cssRuleText(cssLines, '.pressable {', '.pressable'),
        allOf(
          contains('transition'),
          contains('transform var(--dur-fast) var(--ease-out)'),
        ),
        reason: 'the press animates the transform on the tokens it names',
      );
      expect(
        _cssRuleText(cssLines, '.tx-row {', '.tx-row'),
        allOf(
          contains('background-color var(--dur-fast) var(--ease-out)'),
          contains('transform var(--dur-fast) var(--ease-out)'),
        ),
        reason:
            'the row asks to animate a fill that D-U1 leaves it no way to '
            'change — the transition outlives the state it was written for',
      );
      expect(_raw(root, '--dur-fast'), '130ms');
      expect(_raw(root, '--ease-out'), 'cubic-bezier(0.22, 1, 0.36, 1)');
    });

    test('the sheet is unlayered, which is why `hidden` cannot beat `.pill`', () {
      expect(
        cssLines.where((String line) => line.contains('@layer')),
        isEmpty,
        reason:
            'src/index.css declares no cascade layer, so every rule in it — '
            'including .pill\'s display — is unlayered and outranks a Tailwind '
            'utility at any specificity',
      );
      expect(
        ledLineAt(cssSrc, 2),
        "@import 'tailwindcss';",
        reason: 'the utilities the sheet loses to are the layered ones',
      );
      expect(
        _cssDecls(cssLines, '.pill {', '.pill')['display'],
        'inline-flex',
        reason: 'the declaration that makes `hidden` inert on a pill',
      );
      expect(
        ledLineAt(cssSrc, 917),
        '  display: inline-flex;',
        reason: 'cited by name at its line in the authored record',
      );
      expect(
        ledAuthored('pill-hidden-utility-is-inert')['note'],
        contains('unlayered'),
        reason: 'the record states the cascade fact it was measured to prove',
      );
      expect(
        ledClassTokens('txrow-trailing-pill'),
        containsAll(<String>['hidden', 'sm:inline-flex']),
        reason: 'the source really does ask for the pill to disappear',
      );
      for (final String pass in ledPasses) {
        expect(
          ledVal(pass, 'txrow-trailing-pill', 'display'),
          'inline-flex',
          reason:
              '$pass: and the app paints it anyway, at 390 as at 1440 — the '
              'class that should have removed it is a web-app question, not a '
              'port question, so the port carries what is painted',
        );
      }
    });

    test('the two money arms differ by exactly the ink the style decides', () {
      for (final String pass in ledPasses) {
        final Map<String, dynamic> inProps = ledProps(pass, 'txrow-amount-in');
        final Map<String, dynamic> outProps = ledProps(
          pass,
          'txrow-amount-out',
        );
        final List<String> fields = <String>{
          ...inProps.keys,
          ...outProps.keys,
        }.toList()..sort();
        final List<String> differs = <String>[
          for (final String field in fields)
            if (jsonEncode(inProps[field]) != jsonEncode(outProps[field]))
              field,
        ];
        expect(
          differs,
          <String>['borderLeftColor', 'borderTopColor', 'color'],
          reason:
              '$pass: the ternary decides the ink and nothing else. A border '
              'shows up because a computed border colour exists even at a '
              'zero-width border, and it follows currentColor',
        );
        expect(
          ledChanged(pass, 'txrow-amount-in').toSet(),
          ledChanged(pass, 'txrow-amount-out').toSet(),
          reason: '$pass: the arms move the same properties off the control',
        );
        expect(
          ledCls('txrow-amount-in'),
          ledCls('txrow-amount-out'),
          reason: '$pass: one class list, two mounts',
        );
        for (final String name in <String>[
          'txrow-amount-in',
          'txrow-amount-out',
        ]) {
          expect(ledVal(pass, name, 'display'), 'inline-flex');
          expect(ledVal(pass, name, 'alignItems'), 'center');
          expect(ledVal(pass, name, 'columnGap'), '4px', reason: 'gap-1');
          expect(ledVal(pass, name, 'fontSize'), '13px');
          expect(ledVal(pass, name, 'fontWeight'), '700', reason: 'font-bold');
          expect(ledVal(pass, name, 'lineHeight'), '19.5px');
          expect(
            ledPx(pass, name, 'letterSpacing') / ledPx(pass, name, 'fontSize'),
            closeTo(-0.01, 1e-9),
            reason: '$pass $name: .money authors -0.01em, this is 13px',
          );
          expect(
            ledPx(pass, name, 'height'),
            _lengthToPx(ledVal(pass, name, 'lineHeight')),
            reason: '$pass $name: an inline-flex box is its own line',
          );
          expect(
            ledClassTokens(name)
                .where((String token) => token.contains('var(--')),
            isEmpty,
            reason: '$pass $name: the class list writes no colour at all',
          );
        }
        expect(
          ledStylePart('txrow-amount-in')['style'],
          'color: var(--success)',
        );
        expect(
          ledStylePart('txrow-amount-out')['style'],
          'color: var(--danger)',
        );
        expect(ledStylePart('txrow-amount-in')['styleSrcLine'], 39);
        expect(
          ledColour(pass, 'txrow-amount-in', 'color'),
          ledTokenColour(pass, '--success'),
          reason: '$pass: the in arm is --success at this pass',
        );
        expect(
          ledColour(pass, 'txrow-amount-out', 'color'),
          ledTokenColour(pass, '--danger'),
          reason: '$pass: the out arm is --danger at this pass',
        );
      }
      final Map<String, String> money = _cssDecls(
        cssLines,
        '.money {',
        '.money',
      );
      expect(
        money.keys.toList(),
        <String>['font-variant-numeric', 'letter-spacing'],
        reason:
            '.money is numerals and tracking only. It has no colour, which is '
            'what makes the inline style the single source of the sign ink',
      );
      expect(money['font-variant-numeric'], 'tabular-nums');
      expect(money['letter-spacing'], '-0.01em');
    });

    test('the title and the meta line are token inks that truncate', () {
      expect(ledClassTokens('txrow-title'), <String>[
        'block',
        'text-[13px]',
        'font-semibold',
        'tracking-tight',
        'text-[var(--ink)]',
        'truncate',
      ]);
      expect(ledClassTokens('txrow-meta'), <String>[
        'block',
        'text-[11px]',
        'text-[var(--ink-3)]',
        'mt-0.5',
        'truncate',
      ]);
      for (final String pass in ledPasses) {
        expect(ledVal(pass, 'txrow-title', 'display'), 'block');
        expect(ledVal(pass, 'txrow-title', 'fontSize'), '13px');
        expect(ledVal(pass, 'txrow-title', 'fontWeight'), '600');
        expect(
          ledPx(pass, 'txrow-title', 'letterSpacing') /
              ledPx(pass, 'txrow-title', 'fontSize'),
          closeTo(-0.025, 1e-9),
          reason: '$pass: tracking-tight is an em, resolved at 13px',
        );
        expect(
          ledColour(pass, 'txrow-title', 'color'),
          ledTokenColour(pass, '--ink'),
          reason: '$pass: the bracketed class is the same ink as the token',
        );
        expect(ledVal(pass, 'txrow-title', 'whiteSpace'), 'nowrap');
        expect(ledVal(pass, 'txrow-title', 'textOverflow'), 'ellipsis');
        expect(ledVal(pass, 'txrow-title', 'overflowX'), 'hidden');
        expect(ledVal(pass, 'txrow-title', 'overflowY'), 'hidden');
        expect(
          ledChanged(pass, 'txrow-title').contains('fontWeight'),
          isTrue,
          reason: '$pass: font-semibold is what moves the title off 400',
        );
        expect(ledVal(pass, 'txrow-meta', 'fontSize'), '11px');
        expect(ledVal(pass, 'txrow-meta', 'fontWeight'), '400');
        expect(
          ledChanged(pass, 'txrow-meta').contains('fontWeight'),
          isFalse,
          reason:
              '$pass: the meta line authors no weight — 400 is the inherited '
              'one, so nothing moved and nothing is recorded as moved',
        );
        expect(ledVal(pass, 'txrow-meta', 'letterSpacing'), 'normal');
        expect(
          ledColour(pass, 'txrow-meta', 'color'),
          ledTokenColour(pass, '--ink-3'),
        );
        expect(
          ledPx(pass, 'txrow-meta', 'marginTop'),
          ledSpacing(pass) / 2,
          reason: '$pass: mt-0.5 is half the spacing scale, not half a pixel',
        );
        expect(ledVal(pass, 'txrow-meta', 'whiteSpace'), 'nowrap');
        expect(ledVal(pass, 'txrow-meta', 'textOverflow'), 'ellipsis');
        expect(
          ledPx(pass, 'txrow-meta', 'lineHeight') /
              ledPx(pass, 'txrow-meta', 'fontSize'),
          closeTo(
            _probeRatio(_probesOf(_theme(measurement, pass)), 'body'),
            1e-6,
          ),
          reason: '$pass: neither ledger line overrides its own leading',
        );
      }
    });

    test('the two wrapping columns move one property each', () {
      for (final String pass in ledPasses) {
        expect(
          ledChanged(pass, 'txrow-text-wrap').toSet(),
          <String>{'flexGrow'},
          reason:
              '$pass: min-w-0 does not move anything off an unclassed block — '
              'its own min-width was already 0px — so only the grow shows',
        );
        expect(ledVal(pass, 'txrow-text-wrap', 'flexGrow'), '1');
        expect(ledVal(pass, 'txrow-text-wrap', 'flexShrink'), '1');
        expect(
          ledVal(pass, 'txrow-text-wrap', 'minWidth'),
          '0px',
          reason:
              'carried anyway, because the class list names it: the truncate '
              'pair can only clip inside a column the flex item lets shrink '
              'below its own content',
        );
        expect(ledChanged(pass, 'txrow-amount-wrap').toSet(), <String>{
          'flexShrink',
          'textAlign',
        }, reason: '$pass: the money column takes its width and right-aligns');
        expect(ledVal(pass, 'txrow-amount-wrap', 'flexShrink'), '0');
        expect(ledVal(pass, 'txrow-amount-wrap', 'textAlign'), 'right');
        expect(
          ledHas(pass, 'txrow-amount-wrap', 'minWidth'),
          isFalse,
          reason: '$pass: no min-w-0 here, so no min-width is carried',
        );
      }
      expect(ledClassTokens('txrow-text-wrap'), <String>['min-w-0', 'flex-1']);
      expect(ledClassTokens('txrow-amount-wrap'), <String>[
        'text-right',
        'shrink-0',
      ]);
      for (final String name in <String>[
        'txrow-text-wrap',
        'txrow-amount-wrap',
      ]) {
        expect(
          ledCite(name)['parts'],
          hasLength(1),
          reason: '$name writes a class list and no inline style',
        );
        expect(
          ledCite(name)['tag'],
          isNull,
          reason:
              '$name was read on the tier default <div>, not on the <span> the '
              'component mounts — sound because a flex item blockifies, so a '
              'span in this position computes the very display the div did, and '
              'display is not in either column\'s changed set',
        );
        expect(
          ledChanged('light-desktop', name).contains('display'),
          isFalse,
          reason: '$name: the substitution the tier made cannot move display',
        );
        expect(
          ledLineAt(rowSrc, ledCiteLine(name)),
          contains('<span className="${ledCls(name)}"'),
          reason: '$name is mounted as the element the component writes',
        );
      }
    });

    test('the type pill is .pill shrunk by four important utilities', () {
      final Map<String, String> pill = _cssDecls(cssLines, '.pill {', '.pill');
      expect(pill['display'], 'inline-flex');
      expect(pill['align-items'], 'center');
      expect(pill['gap'], '6px');
      expect(pill['border-radius'], '999px');
      expect(pill['white-space'], 'nowrap');
      expect(pill['background'], 'var(--surface)');
      expect(pill['border'], '1px solid var(--line)');
      expect(pill['font-size'], '12px');
      expect(pill['padding'], '8px 14px');
      expect(ledClassTokens('txrow-trailing-pill'), <String>[
        'pill',
        'mono',
        '!text-[9px]',
        '!py-0.5',
        '!px-2',
        'hidden',
        'sm:inline-flex',
      ]);
      final Map<String, String> mono = _cssDecls(cssLines, '.mono {', '.mono');
      expect(mono.keys.toList(), <String>[
        'font-family',
        'font-variant-numeric',
      ]);
      expect(mono['font-family'], 'var(--font-mono)');
      expect(mono['font-variant-numeric'], 'tabular-nums');
      for (final String pass in ledPasses) {
        expect(
          ledVal(pass, 'txrow-trailing-pill', 'fontSize'),
          '9px',
          reason: '$pass: !text-[9px] beats the authored 12px',
        );
        final List<double> sides = ledPadSides(pass, 'txrow-trailing-pill');
        final double spacing = ledSpacing(pass);
        expect(sides, <double>[
          spacing / 2,
          spacing * 2,
        ], reason: '$pass: !py-0.5 !px-2 in this pass\'s spacing scale');
        expect(
          sides.join(' '),
          isNot(pill['padding']!),
          reason: '$pass: the inset is the utilities\', not the class\'s',
        );
        expect(ledVal(pass, 'txrow-trailing-pill', 'borderRadius'), '999px');
        expect(ledVal(pass, 'txrow-trailing-pill', 'columnGap'), '6px');
        expect(ledVal(pass, 'txrow-trailing-pill', 'whiteSpace'), 'nowrap');
        expect(ledVal(pass, 'txrow-trailing-pill', 'fontWeight'), '600');
        expect(ledVal(pass, 'txrow-trailing-pill', 'letterSpacing'), 'normal');
        expect(
          ledChanged(pass, 'txrow-trailing-pill').contains('letterSpacing'),
          isFalse,
          reason: '$pass: neither .pill nor .mono nor the utilities track it',
        );
        expect(
          ledColour(pass, 'txrow-trailing-pill', 'backgroundColor'),
          ledTokenColour(pass, '--surface'),
        );
        expect(
          ledColour(pass, 'txrow-trailing-pill', 'borderTopColor'),
          ledTokenColour(pass, '--line'),
        );
        expect(
          ledColour(pass, 'txrow-trailing-pill', 'color'),
          ledTokenColour(pass, '--ink'),
        );
        expect(ledVal(pass, 'txrow-trailing-pill', 'borderTopWidth'), '1px');
        expect(
          ledPx(pass, 'txrow-trailing-pill', 'lineHeight') /
              ledPx(pass, 'txrow-trailing-pill', 'fontSize'),
          closeTo(
            _probeRatio(_probesOf(_theme(measurement, pass)), 'body'),
            1e-6,
          ),
          reason: '$pass: shrinking the size did not change the leading ratio',
        );
        expect(
          ledPx(pass, 'txrow-trailing-pill', 'height'),
          sides[0] * 2 +
              ledPx(pass, 'txrow-trailing-pill', 'lineHeight') +
              ledPx(pass, 'txrow-trailing-pill', 'borderTopWidth') +
              ledPx(pass, 'txrow-trailing-pill', 'borderBottomWidth'),
          reason: '$pass: the pill is content, inset and frame, added once',
        );
      }
    });
    test('divide-y paints the children and last-child takes it back', () {
      expect(ledClassTokens('ledger-divides'), <String>[
        'divide-y',
        'divide-[var(--line)]',
      ]);
      expect(
        ledCite('ledger-divides')['note'],
        contains('paints its children'),
        reason: 'the parent row is the recipe, not a painted line',
      );
      expect(ledClassTokens('ledger-row-middle'), <String>[
        '[&:last-child]:border-b-0',
      ]);
      expect(
        ledCls('ledger-row-middle'),
        ledCls('ledger-row-last'),
        reason: 'one class, two sibling positions — that pair is the rule',
      );
      expect(ledCiteLine('ledger-row-middle'), ledCiteLine('ledger-row-last'));
      for (final String pass in ledPasses) {
        expect(
          ledChanged(pass, 'ledger-divides'),
          isEmpty,
          reason: '$pass: a parent\'s divide-y moves the parent by nothing',
        );
        expect(ledVal(pass, 'ledger-divides', 'borderBottomWidth'), '0px');
        expect(
          ledChanged(pass, 'ledger-row-last'),
          isEmpty,
          reason:
              '$pass: the last child measures the same as an unclassed div — '
              'the utility and the divide cancel exactly',
        );
        expect(ledVal(pass, 'ledger-row-last', 'borderBottomWidth'), '0px');
        expect(ledChanged(pass, 'ledger-row-middle').toSet(), <String>{
          'height',
          'borderBottomWidth',
          'borderTopColor',
          'borderLeftColor',
          'borderBottomColor',
        }, reason: '$pass: the divider that stays');
        expect(ledVal(pass, 'ledger-row-middle', 'borderBottomWidth'), '1px');
        expect(ledVal(pass, 'ledger-row-middle', 'borderTopWidth'), '0px');
        expect(
          ledColour(pass, 'ledger-row-middle', 'borderBottomColor'),
          ledTokenColour(pass, '--line'),
          reason:
              '$pass: divide-[var(--line)] is the token, not a colour word '
              'that could drift away from it',
        );
        expect(
          ledPx(pass, 'ledger-row-middle', 'height') -
              ledPx(pass, 'ledger-row-last', 'height'),
          1.0,
          reason: '$pass: the row is one line box, and the rule adds its width',
        );
        expect(
          ledColour(pass, 'ledger-row-last', 'borderBottomColor'),
          ledColour(pass, 'ledger-row-last', 'color'),
          reason:
              '$pass: a zero-width border still computes a colour, and it '
              'computes currentColor — which is why only the visible side '
              'shows up as moved',
        );
      }
    });

    test('the rails: one lg: disagreement, and a ceiling that never moves', () {
      final Set<String> disagree = <String>{};
      for (final String pair in <String>['light', 'dark']) {
        for (final String name in ledFamily) {
          if (ledChanged('$pair-desktop', name).join(' ') !=
              ledChanged('$pair-phone', name).join(' ')) {
            disagree.add(name);
          }
        }
      }
      expect(
        disagree,
        <String>{'ledger-scroll'},
        reason:
            'the whole 26-row family measures the same at 390 as at 1440 '
            'except the Dashboard rail, whose three size-bearing utilities '
            'are all lg: variants',
      );
      expect(ledClassTokens('ledger-scroll'), <String>[
        'min-h-0',
        'lg:max-h-[34rem]',
        'lg:overflow-y-auto',
        'lg:pr-1',
      ]);
      expect(
        ledClassTokens('ledger-scroll')
            .where((String token) => token.startsWith('lg:')),
        hasLength(3),
        reason: 'three of the four are the desktop half of the pair',
      );
      for (final String pass in <String>['light-desktop', 'dark-desktop']) {
        expect(
          ledPx(pass, 'ledger-scroll', 'maxHeight'),
          34 * _remPx,
          reason:
              '$pass: 34rem resolved at the root size it was authored '
              'against, which is the ceiling the rail holds itself to',
        );
        expect(ledVal(pass, 'ledger-scroll', 'overflowY'), 'auto');
        expect(
          ledVal(pass, 'ledger-scroll', 'overflowX'),
          'auto',
          reason:
              '$pass: only overflow-y was written; a visible axis beside a '
              'scrolled one computes to auto, which is why overflowX is in '
              'the changed set at all',
        );
        expect(
          ledVal(pass, 'ledger-scroll', 'padding').split(' '),
          <String>[
            '0px',
            '${ledSpacing(pass).toStringAsFixed(0)}px',
            '0px',
            '0px',
          ],
          reason:
              '$pass: lg:pr-1 is one step of the spacing scale, and the '
              'other three sides of the shorthand stay at zero',
        );
      }
      for (final String pass in <String>['light-phone', 'dark-phone']) {
        expect(
          ledChanged(pass, 'ledger-scroll'),
          isEmpty,
          reason: '$pass: below lg the rail is a plain block again',
        );
        expect(ledVal(pass, 'ledger-scroll', 'maxHeight'), 'none');
        expect(ledVal(pass, 'ledger-scroll', 'overflowY'), 'visible');
        expect(ledVal(pass, 'ledger-scroll', 'padding'), '0px');
      }
      for (final String pass in ledPasses) {
        expect(
          ledChanged(pass, 'ledger-list-scroll').toSet(),
          <String>{'padding', 'maxHeight', 'overflowX', 'overflowY'},
          reason:
              '$pass: the Reports Centre rail is un-prefixed, so the phone '
              'gets the same window the desktop does',
        );
        expect(ledPx(pass, 'ledger-list-scroll', 'maxHeight'), 460.0);
        expect(ledVal(pass, 'ledger-list-scroll', 'overflowY'), 'auto');
        expect(
          ledVal(pass, 'ledger-list-scroll', 'padding').split(' '),
          <String>[
            '0px',
            '${ledSpacing(pass).toStringAsFixed(0)}px',
            '0px',
            '0px',
          ],
          reason: '$pass: the same pr-1 inset, on every pass',
        );
      }
      expect(ledClassTokens('ledger-list-scroll'), <String>[
        'space-y-1',
        'max-h-[460px]',
        'overflow-y-auto',
        'pr-1',
      ]);
      expect(
        ledClassTokens('ledger-list-scroll')
            .where((String token) => token.contains(':')),
        isEmpty,
        reason:
            'no variant prefix anywhere — which is exactly why this rail has '
            'no phone story to tell',
      );
    });

    test('the day head is `.day-head` with `.eyebrow` on top of it', () {
      final Map<String, String> head = _cssDecls(
        cssLines,
        '.day-head {',
        '.day-head',
      );
      expect(
        head.keys.toList(),
        <String>[
          'position',
          'top',
          'z-index',
          'background',
          'backdrop-filter',
          '-webkit-backdrop-filter',
          'padding',
        ],
        reason:
            'the sticky chrome and nothing else: every glyph property on '
            'the header comes from the second class the component writes',
      );
      expect(head['position'], 'sticky');
      expect(head['top'], '0');
      expect(head['z-index'], '5');
      expect(head['padding'], '6px 4px');
      expect(head['backdrop-filter'], 'blur(14px)');
      expect(
        head['-webkit-backdrop-filter'],
        'blur(14px)',
        reason:
            'the same radius authored twice, for one engine or the other; the '
            'tier reads the unprefixed value and a port that took both would '
            'double the blur',
      );
      final RegExpMatch? mix = RegExp(
        r'^color-mix\(in srgb, var\(--bg\) (\d+)%, transparent\)$',
      ).firstMatch(head['background']!);
      expect(
        mix,
        isNotNull,
        reason:
            'the wash is named as a mix of the page colour, not as a token, so '
            'the port reads the percentage out of the rule',
      );
      final double mixPercent = double.parse(mix!.group(1)!);

      final Map<String, String> eyebrow = _cssDecls(
        cssLines,
        '.eyebrow {',
        '.eyebrow',
      );
      expect(eyebrow.keys.toList(), <String>[
        'font-size',
        'font-weight',
        'letter-spacing',
        'text-transform',
        'color',
      ]);
      expect(eyebrow['font-size'], '10px');
      expect(eyebrow['font-weight'], '700');
      expect(eyebrow['letter-spacing'], '0.12em');
      expect(eyebrow['text-transform'], 'uppercase');
      expect(eyebrow['color'], 'var(--ink-3)');

      expect(ledClassTokens('day-head-label'), <String>[
        'day-head',
        'eyebrow',
        '!text-[10px]',
      ]);
      expect(
        ledLineAt(dashSrc, ledCiteLine('day-head-label')),
        contains('className="${ledCls('day-head-label')}"'),
      );
      expect(
        RegExp(r'^!text-\[(\d+px)\]$')
            .firstMatch(ledClassTokens('day-head-label').last)!
            .group(1),
        eyebrow['font-size'],
        reason:
            'the one place the ledger writes a size twice. Utility and rule '
            'agree, which is why the port carries a single 10px rather than a '
            'value and its override',
      );

      for (final String pass in ledPasses) {
        expect(
          ledChanged(pass, 'day-head-label').toSet(),
          <String>{
            'position',
            'top',
            'zIndex',
            'padding',
            'height',
            'color',
            'backgroundColor',
            'borderTopColor',
            'borderLeftColor',
            'backdropFilter',
            'fontSize',
            'fontWeight',
            'lineHeight',
            'letterSpacing',
            'textTransform',
          },
          reason:
              '$pass: the two rules, and the two border colours that '
              'follow currentColor from the ink',
        );
        expect(ledVal(pass, 'day-head-label', 'position'), 'sticky');
        expect(ledVal(pass, 'day-head-label', 'top'), '0px');
        expect(ledVal(pass, 'day-head-label', 'zIndex'), '5');
        expect(
          ledVal(pass, 'day-head-label', 'display'),
          'block',
          reason:
              '$pass: neither rule authors a display, so the head is a '
              'block the list flows after — nothing here is a flex row',
        );
        expect(
          ledVal(pass, 'day-head-label', 'backdropFilter'),
          'blur(14px)',
          reason:
              '$pass: no pass differs, so the head has no phone story and '
              'the radius is a number the port fixes once',
        );
        expect(ledVal(pass, 'day-head-label', 'textTransform'), 'uppercase');
        expect(ledVal(pass, 'day-head-label', 'fontSize'), '10px');
        expect(ledVal(pass, 'day-head-label', 'fontWeight'), '700');
        expect(ledVal(pass, 'day-head-label', 'lineHeight'), '15px');
        expect(
          ledPx(pass, 'day-head-label', 'letterSpacing') /
              ledPx(pass, 'day-head-label', 'fontSize'),
          closeTo(0.12, 1e-9),
          reason:
              '$pass: the measured 1.2px is the authored 0.12em resolved at '
              'the 10px this head sets — the em is the portable form',
        );
        final List<double> pad = ledPadSides(pass, 'day-head-label');
        expect(pad, <double>[
          6,
          4,
        ], reason: '$pass: .day-head padding, verbatim');
        expect(
          ledPx(pass, 'day-head-label', 'height'),
          pad[0] * 2 +
              _lengthToPx(ledVal(pass, 'day-head-label', 'lineHeight')),
          reason:
              '$pass: 6 + one 15px line + 6. The probe text is the only '
              'content the head has, so this is the sticky band as the app '
              'draws it',
        );
        expect(
          ledColour(pass, 'day-head-label', 'color'),
          ledTokenColour(pass, '--ink-3'),
          reason: '$pass: the ink is the third-level ink, from .eyebrow',
        );
        expect(
          ledChannels(pass, 'day-head-label', 'backgroundColor'),
          ledTokenChannels(pass, '--bg'),
          reason:
              '$pass: the mix resolves onto the channels of the page colour',
        );
        expect(
          ledAlpha(pass, 'day-head-label', 'backgroundColor'),
          closeTo(mixPercent / 100.0, 0.002),
          reason: '$pass: the 78% the rule names is the alpha the tier reads',
        );
      }
    });

    test('the empty box paints; the class `empty` is declared nowhere', () {
      expect(
        cssLines
            .where((String line) => RegExp(r'\.empty\b').hasMatch(line))
            .toList(),
        isEmpty,
        reason:
            'Reports Centre writes className="empty …" and src/index.css has no '
            'such rule, so the tier shows the word as a property the row does '
            'not move rather than as a fill it forgot',
      );
      expect(ledClassTokens('ledger-empty'), <String>[
        'py-10',
        'text-center',
        'rounded-[var(--r-sm)]',
        'border',
        'border-dashed',
        'border-[var(--line)]',
        'bg-[var(--surface-2)]',
      ]);
      expect(ledClassTokens('ledger-empty-rc'), <String>[
        'empty',
        'py-10',
        'flex',
        'flex-col',
        'items-center',
        'gap-2',
      ]);
      expect(
        ledLineAt(dashSrc, ledCiteLine('ledger-empty')),
        contains('className="${ledCls('ledger-empty')}"'),
      );
      expect(
        ledLineAt(rcSrc, ledCiteLine('ledger-empty-rc')),
        contains('className="${ledCls('ledger-empty-rc')}"'),
      );

      for (final String pass in ledPasses) {
        expect(
          ledChanged(pass, 'ledger-empty').toSet(),
          <String>{
            'padding',
            'height',
            'borderRadius',
            'borderTopWidth',
            'borderRightWidth',
            'borderBottomWidth',
            'borderLeftWidth',
            'backgroundColor',
            'borderTopColor',
            'borderLeftColor',
            'textAlign',
            'borderTopStyle',
          },
          reason: '$pass: the twelve properties the Dashboard box really moves',
        );
        expect(ledVal(pass, 'ledger-empty', 'borderTopStyle'), 'dashed');
        expect(
          ledHas(pass, 'ledger-empty', 'borderBottomStyle'),
          isFalse,
          reason:
              '$pass: one style is read; the shorthand authors all four and '
              'the fixed set keeps only the top',
        );
        expect(ledVal(pass, 'ledger-empty', 'textAlign'), 'center');
        expect(
          ledPx(pass, 'ledger-empty', 'borderRadius'),
          ledRootTokenPx(pass, '--r-sm'),
          reason: '$pass: the radius is named as the token, not as a number',
        );
        for (final String side in <String>[
          'borderTopWidth',
          'borderRightWidth',
          'borderBottomWidth',
          'borderLeftWidth',
        ]) {
          expect(
            ledVal(pass, 'ledger-empty', side),
            '1px',
            reason: '$pass $side',
          );
        }
        expect(
          ledColour(pass, 'ledger-empty', 'backgroundColor'),
          ledTokenColour(pass, '--surface-2'),
        );
        expect(
          ledColour(pass, 'ledger-empty', 'borderTopColor'),
          ledTokenColour(pass, '--line'),
        );
        expect(
          ledColour(pass, 'ledger-empty', 'color'),
          ledTokenColour(pass, '--ink'),
          reason: '$pass: the copy is page ink, which no class here names',
        );
        final List<double> boxPad = ledPadSides(pass, 'ledger-empty');
        expect(
          boxPad,
          <double>[ledSpacing(pass) * 10, 0],
          reason:
              '$pass: py-10 is ten spacing units of air and none of it '
              'sideways — the box is a band, not a card',
        );
        expect(
          ledPx(pass, 'ledger-empty', 'height'),
          boxPad[0] * 2 +
              _lengthToPx(ledVal(pass, 'ledger-empty', 'lineHeight')) +
              2 * _lengthToPx(ledVal(pass, 'ledger-empty', 'borderTopWidth')),
          reason:
              '$pass: air, one inherited line of the probe text, and the '
              'two dashed rules drawn between them',
        );

        expect(
          ledChanged(pass, 'ledger-empty-rc').toSet(),
          <String>{
            'display',
            'flexDirection',
            'alignItems',
            'rowGap',
            'columnGap',
            'padding',
            'height',
          },
          reason:
              '$pass: geometry only. The word `empty` contributes nothing '
              'to the paint and the tier says so by naming no colour',
        );
        expect(ledVal(pass, 'ledger-empty-rc', 'display'), 'flex');
        expect(ledVal(pass, 'ledger-empty-rc', 'flexDirection'), 'column');
        expect(ledVal(pass, 'ledger-empty-rc', 'alignItems'), 'center');
        expect(ledVal(pass, 'ledger-empty-rc', 'rowGap'), '8px');
        expect(
          ledVal(pass, 'ledger-empty-rc', 'columnGap'),
          '8px',
          reason:
              '$pass: gap-2 is both axes at once, which a Flutter column '
              'reads as the one spacer between its children',
        );
        expect(
          _lengthToPx(ledVal(pass, 'ledger-empty-rc', 'rowGap')),
          ledSpacing(pass) * 2,
        );
        expect(
          ledVal(pass, 'ledger-empty-rc', 'backgroundColor'),
          'rgba(0, 0, 0, 0)',
          reason:
              '$pass: the whole difference between the two empties — the '
              'Dashboard box paints, this one stacks on nothing',
        );
        expect(
          ledHas(pass, 'ledger-empty-rc', 'borderTopStyle'),
          isFalse,
          reason:
              '$pass: no border shorthand here, so the control value stands',
        );
        expect(
          ledColour(pass, 'ledger-empty-rc', 'color'),
          ledTokenColour(pass, '--ink'),
          reason: '$pass: inherited ink — read, never moved',
        );
        expect(
          ledPx(pass, 'ledger-empty-rc', 'height'),
          ledPadSides(pass, 'ledger-empty-rc')[0] * 2 +
              _lengthToPx(ledVal(pass, 'ledger-empty-rc', 'lineHeight')),
          reason:
              '$pass: the same 80px of air with no rules to draw, two px '
              'shorter than the Dashboard box and shorter for that reason alone',
        );

        expect(
          ledChanged(pass, 'ledger-empty-rc-line').toSet(),
          <String>{'height', 'fontSize', 'lineHeight'},
          reason:
              '$pass: .mono moves no metric this readout carries, so the '
              'line is the size utility alone plus the leading it inherits',
        );
        expect(ledVal(pass, 'ledger-empty-rc-line', 'fontSize'), '12px');
        expect(ledVal(pass, 'ledger-empty-rc-line', 'lineHeight'), '18px');
        expect(
          ledPx(pass, 'ledger-empty-rc-line', 'height'),
          _lengthToPx(ledVal(pass, 'ledger-empty-rc-line', 'lineHeight')),
          reason: '$pass: the mono line is exactly its own leading',
        );
        expect(
          _lengthToPx(ledVal(pass, 'ledger-empty-rc-line', 'lineHeight')) /
              _lengthToPx(ledVal(pass, 'ledger-empty-rc-line', 'fontSize')),
          closeTo(_probeRatio(lightProbes, 'body'), 1e-9),
          reason: '$pass: 18 on 12 is the body ratio, untouched by .mono',
        );
        expect(ledClassTokens('ledger-empty-rc-line'), <String>[
          'mono',
          'text-[12px]',
        ]);
        expect(
          ledLineAt(rcSrc, ledCiteLine('ledger-empty-rc-line')),
          contains('<p className="mono text-[12px]">'),
        );
      }
    });

    test('the nine chips are one class list: six tones, three size arms', () {
      final List<String> chips = ledChips(ledFamily);
      expect(chips, <String>[
        'cat-chip-lg',
        'cat-chip-md-blue',
        'cat-chip-md-ink',
        'cat-chip-md-lavender',
        'cat-chip-md-mint',
        'cat-chip-md-pink',
        'cat-chip-md-yellow',
        'cat-chip-sm',
        'cat-chip-xs',
      ]);
      const String chipClass = 'grid place-items-center rounded-full shrink-0';
      expect(ledClassTokens('cat-chip-md-pink'), <String>[
        'grid',
        'place-items-center',
        'rounded-full',
        'shrink-0',
      ]);
      for (final String name in chips) {
        expect(
          ledCls(name),
          chipClass,
          reason: '$name: one className string for every chip the app draws',
        );
        expect(
          ledCiteLine(name),
          90,
          reason: '$name: cited at the line that writes it, nowhere else',
        );
        expect(
          ledCite(name)['tag'],
          'span',
          reason:
              '$name: the record mounts the <span> the component writes. The '
              'grid it lands in is what this row exists to measure, and a div '
              'would have computed the same',
        );
        expect(ledLineAt(chipSrc, 90), contains('className="$chipClass"'));
        final Map<String, dynamic> style = ledStylePart(name);
        expect(style['dimsLine'], 85);
        expect(style['glyphLine'], 86);
        expect(style['styleBlock'], <int>[91, 97]);
        expect(
          ledCite(name)['note'],
          isNotNull,
          reason: '$name: the tier says why this row is one of nine',
        );
      }

      for (final String pass in ledPasses) {
        for (final String name in chips) {
          expect(ledChanged(pass, name).toSet(), <String>{
            'display',
            'alignItems',
            'flexShrink',
            'width',
            'height',
            'borderRadius',
            'borderTopWidth',
            'borderRightWidth',
            'borderBottomWidth',
            'borderLeftWidth',
            'backgroundColor',
            'borderTopColor',
            'borderLeftColor',
          }, reason: '$pass $name: thirteen, and `color` is not one of them');
          expect(
            ledChanged(pass, name).contains('color'),
            isFalse,
            reason:
                '$pass $name: the inline style authors the ink, so the '
                'stack cannot move it off the control — the glyph colour is a '
                'constant the port carries once, per brightness',
          );
          expect(ledColour(pass, name, 'color'), ledTokenColour(pass, '--ink'));
          expect(ledVal(pass, name, 'display'), 'grid');
          expect(ledVal(pass, name, 'alignItems'), 'center');
          expect(ledVal(pass, name, 'flexShrink'), '0');
          expect(ledVal(pass, name, 'borderTopWidth'), '1px');
          expect(
            ledVal(pass, name, 'borderRadius'),
            fullRadius,
            reason:
                '$pass $name: `rounded-full` computes to '
                'calc(infinity * 1px), which Chrome prints as this float — the '
                'record keeps the string the engine gave, and the port clamps '
                'it to a radius no side can exceed',
          );
          final double dims = (ledStylePart(name)['dims']! as num).toDouble();
          expect(
            ledPx(pass, name, 'width'),
            dims,
            reason: '$pass $name: the measured square is the inline style',
          );
          expect(
            ledPx(pass, name, 'height'),
            dims,
            reason: '$pass $name: width and height are the same `dims`',
          );
        }
        expect(ledPx(pass, 'cat-chip-md-pink', 'width'), 40);
        expect(ledPx(pass, 'cat-chip-xs', 'width'), 22);
        expect(ledPx(pass, 'cat-chip-sm', 'width'), 32);
        expect(ledPx(pass, 'cat-chip-lg', 'width'), 44);
      }
    });

    test('the tone table is six tokens and two oklab mixes the port cannot re-derive', () {
      final Map<String, String> toneBg = <String, String>{};
      final Map<String, int> toneLine = <String, int>{};
      for (int line = 55; line <= 60; line++) {
        final RegExpMatch? m = RegExp(r"^  (\w+): '(var\(--[\w-]+\))',$")
            .firstMatch(ledLineAt(chipSrc, line));
        if (m == null) {
          throw StateError('CategoryChip.tsx:$line is no longer a tone entry');
        }
        toneBg[m.group(1)!] = m.group(2)!;
        toneLine[m.group(1)!] = line;
      }
      expect(toneBg.keys.toList()..sort(), <String>[
        'blue',
        'ink',
        'lavender',
        'mint',
        'pink',
        'yellow',
      ]);
      expect(
        toneBg['ink'],
        'var(--surface-3)',
        reason:
            'the sixth tone is not a pastel: it is the raised surface, which is '
            'why the ink chip is the one row that reads as a rule, not a colour',
      );

      final Map<String, dynamic> style = ledStylePart('cat-chip-md-pink');
      expect(style['styleBlock'], <int>[91, 97]);
      final List<Map<String, dynamic>> src =
          (style['styleSrc']! as List<dynamic>).cast<Map<String, dynamic>>();
      expect(src.map((Map<String, dynamic> d) => d['prop']).toList(), <String>[
        'width',
        'height',
        'background',
        'border',
        'color',
      ]);
      expect(src.map((Map<String, dynamic> d) => d['line']).toList(), <int>[
        92,
        93,
        94,
        95,
        96,
      ]);
      for (final Map<String, dynamic> decl in src) {
        expect(
          ledLineAt(chipSrc, (decl['line']! as num).toInt()).trim(),
          decl['text'],
          reason: 'style: line ${decl['line']} is quoted verbatim',
        );
      }
      final Map<String, String> declByProp = <String, String>{
        for (final Map<String, dynamic> d in src)
          d['prop']! as String: d['text']! as String,
      };
      expect(
        RegExp(r'(\d+)%, var\(--surface\)\)')
            .firstMatch(declByProp['background']!)!
            .group(1),
        '55',
      );
      expect(
        RegExp(r'(\d+)%, var\(--line\)\)')
            .firstMatch(declByProp['border']!)!
            .group(1),
        '70',
      );

      for (final String pass in ledPasses) {
        final List<String> tones = <String>[
          for (final String name in ledToneChips)
            ledStylePart(name)['tone']! as String,
        ]..sort();
        expect(tones, <String>[
          'blue',
          'ink',
          'lavender',
          'mint',
          'pink',
          'yellow',
        ]);
        final Set<int> fills = <int>{};
        for (final String name in ledToneChips) {
          final Map<String, dynamic> part = ledStylePart(name);
          final String tone = part['tone']! as String;
          final String toneVar = part['toneVar']! as String;
          expect(
            toneVar,
            toneBg[tone],
            reason:
                '$pass $name: the row names the same token the table '
                'holds for that tone',
          );
          expect(
            (part['toneVarLine']! as num).toInt(),
            toneLine[tone],
            reason:
                '$pass $name: cited at the `TONE_BG` entry it reads, and '
                'the six lines are exactly 55–60',
          );
          final String bareToken = toneVar
              .replaceFirst('var(', '')
              .replaceFirst(')', '');
          final Color fill = ledColour(pass, name, 'backgroundColor');
          final Color border = ledColour(pass, name, 'borderTopColor');
          expect(
            fill,
            isNot(ledTokenColour(pass, bareToken)),
            reason:
                '$pass $name: 55% of the tone against --surface is not the '
                'tone. Chrome resolves it in oklab, which Dart has no primitive '
                'for, so the port carries this resolved colour and not the mix',
          );
          expect(
            fill,
            isNot(ledTokenColour(pass, '--surface')),
            reason: '$pass $name: the mix actually moved the page colour',
          );
          expect(
            border,
            isNot(ledTokenColour(pass, '--line')),
            reason: '$pass $name: the 70% border is a colour of its own',
          );
          fills.add(fill.toARGB32());
        }
        expect(fills.length, 6, reason: '$pass: six tones, six fills');
        expect(
          ledColour(pass, 'cat-chip-xs', 'backgroundColor'),
          ledColour(pass, 'cat-chip-md-lavender', 'backgroundColor'),
          reason:
              '$pass: the size arms hold lavender, so a wider chip cannot '
              'be mistaken for a different tone',
        );
        for (final String name in <String>[
          'cat-chip-xs',
          'cat-chip-sm',
          'cat-chip-lg',
        ]) {
          expect(ledStylePart(name)['size'], name.split('-').last);
          expect(ledStylePart(name)['tone'], 'lavender');
          expect(ledStylePart(name)['toneVarLine'], 58);
        }
      }
    });

    test('two ternaries are the size and glyph tables the chips measured', () {
      final Map<String, double> dims = ledTernary(chipSrc, 85, 'dims');
      final Map<String, double> glyphs = ledTernary(chipSrc, 86, 'glyph');
      expect(dims, <String, double>{'xs': 22, 'sm': 32, 'lg': 44, 'md': 40});
      expect(glyphs, <String, double>{'xs': 12, 'sm': 14, 'lg': 19, 'md': 17});
      expect(
        ledLineAt(chipSrc, 85),
        isNot(contains("=== 'md'")),
        reason:
            'md is the arm the ternary falls through to and is never named — '
            'which is why six rows are called md and no source line says so',
      );
      expect(ledLineAt(chipSrc, 85).trim().endsWith(': 40;'), isTrue);
      expect(ledLineAt(chipSrc, 86).trim().endsWith(': 17;'), isTrue);

      for (final String pass in ledPasses) {
        for (final String name in ledChips(ledFamily)) {
          final Map<String, dynamic> part = ledStylePart(name);
          final String size = (part['size'] ?? 'md')! as String;
          expect(
            (part['dims']! as num).toDouble(),
            dims[size],
            reason: '$pass $name: the cited `dims` arm is the table',
          );
          expect(
            ledPx(pass, name, 'width'),
            dims[size],
            reason: '$pass $name: and the measured square agrees with it',
          );
          expect(
            (part['glyph']! as num).toDouble(),
            glyphs[size],
            reason:
                '$pass $name: the glyph is the other ternary, at the same arm',
          );
        }
      }

      expect(
        ledLineAt(chipSrc, 100).trim(),
        '<Icon size={glyph} strokeWidth={2} />',
      );
      expect(
        RegExp(r'strokeWidth=\{([\d.]+)\}')
            .firstMatch(ledLineAt(chipSrc, 100))!
            .group(1),
        '2',
        reason: 'the stroke is authored, not inherited from the icon library',
      );
      expect(
        ledLineAt(chipSrc, 84).trim(),
        'const Icon = iconOverride ?? CATEGORY_ICONS[key] ?? Receipt;',
        reason:
            'three ways to get a glyph, and the last is the one the port '
            'must carry as a fallback',
      );
      expect(
        ledLineAt(chipSrc, 83).trim(),
        'const key = category.toLowerCase().trim();',
      );
    });

    test('the ten authored records are the ledger half of a 26-record tier', () {
      final List<String> names = <String>[
        for (final dynamic e in ledNonCss)
          (e as Map<String, dynamic>)['name']! as String,
      ]..sort();
      expect(names.where(ledIsRecord).toList(), ledRecordNames);
      expect(
        names.where((String n) => !ledIsRecord(n)).length,
        16,
        reason:
            'the chrome records #55 and #56 left behind are untouched by '
            'this family — a re-measure that renames one shows up here',
      );
      expect(
        ledNonCss.length,
        26,
        reason: '16 chrome records plus the ledger 10',
      );
      final Map<String, int> perFile = <String, int>{};
      for (final dynamic e in ledNonCss) {
        final Map<String, dynamic> rec = e as Map<String, dynamic>;
        final String name = rec['name']! as String;
        if (!ledIsRecord(name)) continue;
        perFile[rec['src']! as String] =
            (perFile[rec['src']! as String] ?? 0) + 1;
      }
      expect(perFile, <String, int>{
        rowSrc: 4,
        chipSrc: 2,
        dashSrc: 2,
        rcSrc: 2,
      });
      for (final String name in ledRecordNames) {
        final Map<String, dynamic> rec = ledAuthored(name);
        expect(
          rec['tier'],
          anyOf('authored-js', 'authored-inline'),
          reason: '$name: which kind of source the record stands in for',
        );
        expect(
          (rec['parts']! as List<dynamic>).isNotEmpty,
          isTrue,
          reason: '$name: a record with no citation is a claim, not evidence',
        );
      }
      for (final String name in <String>[
        'ledger-empty-class-declared-nowhere',
        'pill-hidden-utility-is-inert',
      ]) {
        expect(
          ledAuthored(name)['tier'],
          'authored-inline',
          reason: '$name: the tier separates an inline class from a JS table',
        );
      }
      // The three records that reach across files are the three the port cannot
      // resolve inside one component.
      expect(
        ledAuthoredParts('txrow-amount-signed-vs-absolute')
            .where((List<Object> p) => p[1] != rowSrc)
            .map((List<Object> p) => p[1] as String)
            .toSet(),
        <String>{dashSrc, rcSrc},
        reason: 'the same widget fed two ways, in two other files',
      );
      expect(
        ledAuthoredParts('txrow-isincome-predicates-disagree')
            .map((List<Object> p) => p[1] as String)
            .toSet(),
        <String>{dashSrc, rcSrc},
        reason: 'the predicate is written twice, and the record cites both',
      );
      expect(
        ledAuthoredParts('pill-hidden-utility-is-inert')
            .where((List<Object> p) => p[1] == cssSrc)
            .length,
        1,
        reason:
            'the inert `hidden` is proved from src/index.css:917, beside '
            'the Reports Centre line that writes the class',
      );
      expect(
        ledAuthoredParts('ledger-empty-copy')
            .where((List<Object> p) => p[1] == rcSrc)
            .length,
        1,
        reason: 'the two empties are one copy decision across two components',
      );
    });

    test('the two call sites compute direction, and they do not agree', () {
      for (final String src in <String>[dashSrc, rcSrc]) {
        expect(
          ledLines(src).where((String l) => l.trim() == 'const isInc =').length,
          1,
          reason:
              '$src writes the predicate exactly once, so the parse reads '
              'the call site the ledger actually uses',
        );
      }
      final List<String> dash = ledPredicate(dashSrc);
      final List<String> centre = ledPredicate(rcSrc);
      expect(dash, <String>[
        "t.type === 'income'",
        "t.type === 'deposit'",
        "t.type === 'financing'",
        "(t.type === 'transfer' && t.amount > 0)",
      ]);
      expect(
        centre.sublist(0, 3),
        dash.sublist(0, 3),
        reason: 'the three type tests are word for word the same',
      );
      expect(centre.length, dash.length, reason: 'four clauses each');
      expect(
        centre.last,
        "(t.type === 'transfer' && (t.category === 'Transfer In' || t.amount > 0))",
        reason:
            'a transfer naming itself Transfer In is income in Reports '
            'Centre even when the amount says otherwise — recorded, not resolved',
      );
      expect(
        dash.last,
        isNot(contains('Transfer In')),
        reason: 'and the same row is an expense on the dashboard',
      );
      final List<List<Object>> cited = ledAuthoredParts(
        'txrow-isincome-predicates-disagree',
      );
      expect(
        cited.map((List<Object> p) => '${p[1]}:${p[2]}').toList(),
        <String>[
          '$dashSrc:426',
          '$dashSrc:428',
          '$dashSrc:429',
          '$rcSrc:501',
          '$rcSrc:504',
        ],
        reason:
            'the record cites the arms it compares — not the `deposit` one '
            'both files write identically',
      );
      for (final List<Object> part in cited) {
        final List<String> clauses = part[1] == dashSrc ? dash : centre;
        expect(
          clauses.any((String c) => (part[0] as String).startsWith(c)),
          isTrue,
          reason:
              '${part[1]}:${part[2]} is one of the clauses this parse found',
        );
      }
    });

    test('the row is handed a string; one caller takes the sign off first', () {
      expect(ledLineAt(rowSrc, 11).trim(), 'amountText: string;');
      expect(
        ledLineAt(rowSrc, 9).trim(),
        'meta?: string;',
        reason: 'the second line is the caller\'s string too, or nothing',
      );
      final String rowText = ledLines(rowSrc).join('\n');
      for (final String never in <String>[
        'formatMoney',
        'Intl',
        'NumberFormat',
        'toFixed',
      ]) {
        expect(
          rowText.contains(never),
          isFalse,
          reason:
              'TransactionRow.tsx never says $never — the widget cannot '
              'format a number because it never receives one',
        );
      }
      final List<List<Object>> parts = ledAuthoredParts(
        'txrow-amount-signed-vs-absolute',
      );
      expect(parts.length, 3);
      expect(
        parts.map((List<Object> p) => '${p[1]}:${p[2]}').toList(),
        <String>['$dashSrc:437', '$rcSrc:505', '$rcSrc:518'],
      );
      expect(
        ledLineAt(dashSrc, 437),
        contains('amountText={formatMoney(state.currency, t.amount)}'),
        reason: 'the dashboard passes the signed amount straight through',
      );
      expect(
        ledLineAt(rcSrc, 505).trim(),
        'const absAmount = Math.abs(t.amount);',
        reason: 'Reports Centre removes the sign before the row ever sees it',
      );
      expect(
        ledLineAt(rcSrc, 518),
        contains('amountText={formatMoney(currency, absAmount)}'),
      );
      expect(
        ledLineAt(dashSrc, 436).trim(),
        'isIncome={isInc}',
        reason:
            'both call sites hand over their own boolean, beside their own '
            'string: the arrow and the ink are the only sign either one keeps',
      );
      expect(ledLineAt(rcSrc, 519).trim(), 'isIncome={isInc}');
    });
  });

  group('AppRows — the ported ledger re-derived from the #75 stacks', () {
    // #77 emits `mobile/lib/core/theme/app_rows.dart` from the utility-stack
    // tier's twenty-six ledger rows, the ten authored records the ledger added
    // and the pinned `.tx-row`, `.day-head` and `.eyebrow` rules. This group
    // reads the same evidence back independently: every field of every
    // generated spec is re-derived here from a JSON string, an authored source
    // line or a stylesheet declaration — never copied out of the generated
    // file, so the two can only agree by both being right. Nothing here builds
    // a widget; the widgets' own behaviour tests are beside this file.
    final Map<String, dynamic> appStacks =
        measurement['utilityStacks']! as Map<String, dynamic>;
    final List<dynamic> appRowList = appStacks['rows']! as List<dynamic>;
    const List<String> appPasses = <String>[
      'light-desktop',
      'dark-desktop',
      'light-phone',
      'dark-phone',
    ];
    const String appChipSrc = 'src/components/ui/CategoryChip.tsx';
    const String appRowSrc = 'src/components/ui/TransactionRow.tsx';
    const String appDashSrc = 'src/components/Dashboard.tsx';
    const String appRcSrc = 'src/components/ReportsCentre.tsx';
    const String appCssSrc = 'src/index.css';
    // Chrome's serialisation of `rounded-full`, which the engine clamps to its
    // own float. `AppCategoryChips.fullRoundRadiusPx` carries it because it is
    // what was measured, not because anyone chose that radius.
    const String appFullRadius = '3.35544e+07px';

    Map<String, dynamic> appRow(String name) {
      for (final dynamic r in appRowList) {
        final Map<String, dynamic> row = r as Map<String, dynamic>;
        if (row['name'] == name) return row;
      }
      throw StateError('ui-tokens.json cites no stack row "$name"');
    }

    Map<String, dynamic> appProps(String pass, String name) {
      final Object? r =
          (_theme(measurement, pass)['stacks']! as Map<String, dynamic>)[name];
      if (r == null) throw StateError('no stack $name measured at $pass');
      return (r as Map<String, dynamic>)['props']! as Map<String, dynamic>;
    }

    String appVal(String pass, String name, String field) =>
        _probeValue(appProps(pass, name), field, '$pass $name');

    Color appColour(String pass, String name, String field) =>
        _probeColour(appProps(pass, name), field, '$pass $name');

    /// A px length Chrome may print in exponential form — the full-round radius
    /// among them. Anything else is not a length this port could carry.
    double appPx(String pass, String name, String field) {
      final String raw = appVal(pass, name, field);
      final RegExpMatch? m = RegExp(r'^(-?[\d.]+(?:e\+\d+)?)px$')
          .firstMatch(raw);
      if (m == null) {
        throw StateError('$pass $name: "$raw" for $field is not a px length');
      }
      return double.parse(m.group(1)!);
    }

    /// A unitless measured number — `flex-grow`, `flex-shrink`, a font weight.
    double appNumber(String pass, String name, String field) =>
        double.parse(appVal(pass, name, field));

    bool appHas(String pass, String name, String field) =>
        appProps(pass, name).containsKey(field);

    /// The `file:lines` string the emitter writes for one row: every line the
    /// record cites, in the file it was read from, sorted. `dimsLine` and
    /// `glyphLine` are deliberately not in the union — a chip's square comes
    /// from the ternary, which the *size* arms cite, while the tone rows cite
    /// the token and the inline style — so a drift here is a drift in what the
    /// port says it was read from.
    String appCite(String name) {
      final Map<String, dynamic> rec = appRow(name);
      final Map<String, List<int>> byFile = <String, List<int>>{};
      for (final dynamic e in rec['parts']! as List<dynamic>) {
        final Map<String, dynamic> part = e as Map<String, dynamic>;
        final String file =
            (part['src'] ?? rec['src'] ?? appStacks['source'])! as String;
        final List<int> lines = byFile.putIfAbsent(file, () => <int>[]);
        final List<Object?> found = <Object?>[
          part['line'],
          part['styleSrcLine'],
          part['toneVarLine'],
          ...((part['styleSrc'] ?? const <dynamic>[]) as List<dynamic>).map(
            (dynamic s) => (s as Map<String, dynamic>)['line'],
          ),
        ];
        for (final Object? l in found) {
          if (l == null) continue;
          final int line = (l as num).toInt();
          if (!lines.contains(line)) lines.add(line);
        }
      }
      return byFile.entries
          .map(
            (MapEntry<String, List<int>> e) =>
                '${e.key}:${(e.value.toList()..sort()).join(',')}',
          )
          .join(' + ');
    }

    final Map<String, List<String>> appFiles = <String, List<String>>{};
    List<String> appLinesOf(String src) =>
        appFiles.putIfAbsent(src, () => webSource(src).split(RegExp(r'\r?\n')));

    String appLineAt(String src, int line) {
      final List<String> lines = appLinesOf(src);
      if (line < 1 || line > lines.length) {
        throw StateError('$src:$line is outside a ${lines.length}-line file');
      }
      return lines[line - 1];
    }

    Map<String, dynamic> appRoot(String pass) =>
        _rootOf(_theme(measurement, pass));

    double appTokenPx(String pass, String token) =>
        _lengthToPx(_raw(appRoot(pass), token));

    Color appTokenColour(String pass, String token) =>
        _measuredColour(appRoot(pass), token);

    /// The first family of a §6 probe — the stack that stack paints in, which
    /// the 45 measured properties do not carry.
    String appProbeFamily(String pass, String selector) {
      final Map<String, dynamic> probe = _probe(
        _probesOf(_theme(measurement, pass)),
        selector,
        pass,
      );
      return (_probeValue(
        probe,
        'fontFamily',
        selector,
      ).split(RegExp(r',\s*')).first).replaceAll(RegExp('^["\']|["\']\$'), '');
    }

    /// `const NAME = size === 'xs' ? N : … ;` as one size-keyed table, the
    /// trailing arm read as `md` because that is the size the ternary falls
    /// through to and the one the tone rows are sampled at.
    Map<String, double> appTernary(String src, int line, String varName) {
      final String text = appLineAt(src, line);
      if (!text.contains('const $varName = ')) {
        throw StateError(
          '$src:$line is no longer `const $varName = …`: "$text"',
        );
      }
      final Map<String, double> out = <String, double>{};
      for (final RegExpMatch m in RegExp(
        r"size === '(\w+)' \? ([\d.]+)",
      ).allMatches(text)) {
        out[m.group(1)!] = double.parse(m.group(2)!);
      }
      final RegExpMatch? fall = RegExp(r':\s*([\d.]+);').firstMatch(text);
      if (fall == null) {
        throw StateError('$src:$line has no default arm to call md');
      }
      out['md'] = double.parse(fall.group(1)!);
      if (out.length != 4) {
        throw StateError('$varName names ${out.length} sizes, not four');
      }
      return out;
    }

    test('every citation the file carries is the row it was measured from', () {
      void cite(String label, AppTxRowSlotSpec slot) {
        expect(
          slot.authoredSrc,
          appCite(slot.stackRow),
          reason: '$label cites the lines of the row it names',
        );
      }

      for (final AppTxRowSpec spec in <AppTxRowSpec>[
        AppRows.txRowLight,
        AppRows.txRowDark,
      ]) {
        expect(spec.stackRow, 'txrow-box');
        expect(
          spec.authoredSrc,
          appCite('txrow-box'),
          reason: 'the box cites the element it is mounted on',
        );
        for (final MapEntry<String, AppTxRowSlotSpec> slot
            in <String, AppTxRowSlotSpec>{
              'title': spec.title,
              'meta': spec.meta,
              'textWrap': spec.textWrap,
              'amountWrap': spec.amountWrap,
              'amountIn': spec.amountIn,
              'amountOut': spec.amountOut,
              'pill': spec.pill,
            }.entries) {
          cite(slot.key, slot.value);
        }
      }
      final AppDayHeadSpec head = AppRows.dayHeadLight;
      expect(head.stackRow, 'day-head-label');
      expect(head.authoredSrc, appCite('day-head-label'));
      expect(AppRows.dayHeadDark.authoredSrc, head.authoredSrc);
      expect(AppRows.emptyLight.stackRow, 'ledger-empty');
      expect(
        AppRows.emptyLight.authoredSrc,
        appCite('ledger-empty'),
        reason: 'the dashboard empty box cites the div Dashboard writes',
      );
      expect(AppRows.emptyRcLight.authoredSrc, appCite('ledger-empty-rc'));
      expect(
        AppRows.emptyRcLight.line.authoredSrc,
        appCite('ledger-empty-rc-line'),
      );
      expect(AppRows.ledgerRail.authoredSrc, appCite('ledger-scroll'));
      expect(AppRows.reportsRail.authoredSrc, appCite('ledger-list-scroll'));
      for (final AppChipTone tone in AppChipTone.values) {
        for (final Brightness brightness in Brightness.values) {
          final AppCategoryChipTintSpec tint = AppCategoryChips.tint(
            tone,
            brightness,
          );
          expect(
            tint.authoredSrc,
            appCite(tint.rowName),
            reason: '${tone.name} at ${brightness.name} cites its own row',
          );
        }
      }
      expect(
        appCite('cat-chip-md-pink'),
        '$appChipSrc:55,90,92,93,94,95,96',
        reason:
            'the tone line, the class list and the five style lines — and '
            'not the dims/glyph lines at 85 and 86, which the size rows cite',
      );
      expect(appCite('txrow-amount-in'), '$appRowSrc:38,39');
      expect(appCite('txrow-box'), '$appRowSrc:28');
      expect(
        head.labelAuthoredSrc,
        '$appCssSrc:${cssLines.indexOf('.eyebrow {') + 1}',
        reason: 'the header type is cited at the rule that authors it',
      );
    });

    /// The one class list a row was measured with, verbatim from the record.
    String appCls(String name) {
      final List<String> found = <String>[];
      for (final dynamic p in appRow(name)['parts']! as List<dynamic>) {
        final Object? cls = (p as Map<String, dynamic>)['cls'];
        if (cls != null) found.add(cls as String);
      }
      if (found.length != 1) {
        throw StateError('$name cites ${found.length} class lists, not one');
      }
      return found.single;
    }

    List<String> appTokens(String name) =>
        appCls(name)
            .split(RegExp(r'\s+'))
            .where((String token) => token.isNotEmpty)
            .toList();

    /// The `padding` shorthand as the symmetric pair the port reproduces.
    List<double> appPad(String pass, String name) {
      final List<String> parts = appVal(pass, name, 'padding').split(' ');
      if (parts.length != 2) {
        throw StateError(
          '$pass $name: padding "${parts.join(' ')}" is not the one '
          'vertical/horizontal pair this port reads',
        );
      }
      return <double>[
        _pxOf(parts[0], '$pass $name padding top'),
        _pxOf(parts[1], '$pass $name padding left'),
      ];
    }

    /// `scale(N)` out of a transform the sheet authors.
    double appScale(String transform, String label) {
      final RegExpMatch? m = RegExp(r'^scale\(([\d.]+)\)$')
          .firstMatch(transform.trim());
      if (m == null) {
        throw StateError('$label: transform "$transform" is not one scale()');
      }
      return double.parse(m.group(1)!);
    }

    test('the box: what the row paints at rest, and nothing else', () {
      final Map<String, String> authored = _cssDecls(
        cssLines,
        '.tx-row {',
        '.tx-row',
      );
      expect(authored['gap'], '${AppRows.txRowLight.gapPx.round()}px');
      expect(
        authored['border-radius'],
        'var(${AppRows.txRowLight.radiusToken})',
        reason: 'the radius the sheet authors is the token the port names',
      );
      expect(authored['cursor'], AppRows.txRowLight.cursorCss);
      for (final String pass in appPasses) {
        final Brightness brightness = pass.startsWith('light')
            ? Brightness.light
            : Brightness.dark;
        final AppTxRowSpec spec = AppRows.txRow(brightness);
        expect(
          spec,
          AppRows.txRow(brightness),
          reason: '$pass: the accessor hands back the brightness pair',
        );
        expect(spec.cssClasses, appCls('txrow-box'));
        expect(spec.displayCss, appVal(pass, 'txrow-box', 'display'));
        for (final String field in <String>[
          'display',
          'padding',
          'borderRadius',
        ]) {
          final Map<String, dynamic> probe = _probe(
            _probesOf(_theme(measurement, pass)),
            '.tx-row',
            pass,
          );
          expect(
            appVal(pass, 'txrow-box', field),
            _probeValue(probe, field, '.tx-row'),
            reason: '$pass txrow-box $field differs from the .tx-row probe',
          );
        }
        expect(spec.alignItemsCss, appVal(pass, 'txrow-box', 'alignItems'));
        expect(
          spec.justifyContentCss,
          appVal(pass, 'txrow-box', 'justifyContent'),
          reason: 'the row authors no justify-content, and measures normal',
        );
        expect(spec.gapPx, appPx(pass, 'txrow-box', 'rowGap'));
        expect(
          appPx(pass, 'txrow-box', 'columnGap'),
          spec.gapPx,
          reason: '$pass: the row measures one gap on both axes',
        );
        final List<double> pad = appPad(pass, 'txrow-box');
        expect(spec.paddingVerticalPx, pad[0]);
        expect(spec.paddingHorizontalPx, pad[1]);
        expect(
          spec.padding,
          EdgeInsets.symmetric(vertical: pad[0], horizontal: pad[1]),
        );
        expect(spec.radiusPx, appPx(pass, 'txrow-box', 'borderRadius'));
        expect(
          spec.radiusPx,
          appTokenPx(pass, AppRows.txRowLight.radiusToken),
          reason: '$pass: the measured radius is --r-sm resolved at that pass',
        );
        expect(spec.radius, BorderRadius.circular(spec.radiusPx));
        expect(
          appColour(pass, 'txrow-box', 'backgroundColor').a,
          0,
          reason:
              '$pass: the resting box paints nothing. Only :hover does, and '
              'the port drops that (UI_SPEC D-U1)',
        );
        for (final String side in <String>[
          'borderTopWidth',
          'borderRightWidth',
          'borderBottomWidth',
          'borderLeftWidth',
        ]) {
          expect(
            appPx(pass, 'txrow-box', side),
            0.0,
            reason: '$pass: $side — the row has no frame at rest',
          );
        }
        expect(appVal(pass, 'txrow-box', 'boxShadow'), 'none');
        expect(appVal(pass, 'txrow-box', 'backdropFilter'), 'none');
        expect(
          spec.inkColor,
          appColour(pass, 'txrow-box', 'color'),
          reason: '$pass: the inherited ink is what the box painted',
        );
        expect(spec.inkColor, appTokenColour(pass, '--ink'));
        expect(
          spec.flexShrink,
          appNumber(pass, 'txrow-box', 'flexShrink'),
          reason: '$pass: a row shrinks in its list; nothing authors grow',
        );
      }
    });

    test('the press: two rules claim the box and the spec carries the winner', () {
      final int txActive = cssLines.indexOf('.tx-row:active {');
      final int pressActive = cssLines.indexOf('.pressable:active {');
      expect(txActive, greaterThanOrEqualTo(0));
      expect(pressActive, greaterThanOrEqualTo(0));
      expect(
        pressActive,
        greaterThan(txActive),
        reason:
            'both unlayered rules claim the press and the later one wins '
            'outright — a reordering of the sheet must move the port',
      );
      final double loser = appScale(
        _cssDecls(cssLines, '.tx-row:active {', '.tx-row:active')['transform']!,
        '.tx-row:active',
      );
      final double winner = appScale(
        _cssDecls(
          cssLines,
          '.pressable:active {',
          '.pressable:active',
        )['transform']!,
        '.pressable:active',
      );
      for (final AppTxRowSpec spec in <AppTxRowSpec>[
        AppRows.txRowLight,
        AppRows.txRowDark,
      ]) {
        expect(spec.pressScale, winner);
        expect(spec.overriddenPressScale, loser);
        expect(
          spec.pressScale,
          isNot(spec.overriddenPressScale),
          reason:
              'the two scales are different numbers, so which is which matters',
        );
      }
      final Duration fast = _duration(
        _raw(appRoot('light-phone'), '--dur-fast'),
      );
      final Cubic out = _cubic(_raw(appRoot('light-phone'), '--ease-out'));
      final AppTxRowSpec light = AppRows.txRowLight;
      expect(light.pressDurationMs, fast.inMilliseconds);
      expect(light.pressDuration, fast);
      // `Cubic` has no value equality, so the four points are compared, not
      // the object.
      final Cubic curve = light.pressCurve;
      expect(
        <double>[curve.a, curve.b, curve.c, curve.d],
        <double>[out.a, out.b, out.c, out.d],
      );
      expect(light.easeX1, out.a);
      expect(light.easeY1, out.b);
      expect(light.easeX2, out.c);
      expect(light.easeY2, out.d);
      expect(
        AppRows.txRowDark.pressDurationMs,
        light.pressDurationMs,
        reason: 'the clock is a root token, not a brightness',
      );
      final String transition = _cssRuleText(cssLines, '.tx-row {', '.tx-row');
      expect(
        transition,
        contains('transform var(--dur-fast) var(--ease-out)'),
        reason: 'the row runs the press on the clock and curve both name',
      );
    });

    /// Every field of a slot except the ink it painted — so a pair of slots can
    /// be proved to differ by one property and by nothing else. Keyed, because
    /// the answer this file cares about is *which* field moved.
    Map<String, Object?> appShapeOf(AppTxRowSlotSpec slot) => <String, Object?>{
      'stackRow': slot.stackRow,
      'cssClasses': slot.cssClasses,
      'authoredSrc': slot.authoredSrc,
      'displayCss': slot.displayCss,
      'alignItemsCss': slot.alignItemsCss,
      'gapPx': slot.gapPx,
      'fontFamily': slot.fontFamily,
      'fontSizePx': slot.fontSizePx,
      'fontWeight': slot.fontWeight,
      'heightRatio': slot.heightRatio,
      'letterSpacingPx': slot.letterSpacingPx,
      'letterSpacingEm': slot.letterSpacingEm,
      'authoredColorToken': slot.authoredColorToken,
      'truncates': slot.truncates,
      'flexGrow': slot.flexGrow,
      'flexShrink': slot.flexShrink,
      'minWidthZero': slot.minWidthZero,
      'textAlignCss': slot.textAlignCss,
      'tabularNums': slot.tabularNums,
    };

    List<String> appDifferences(
      Map<String, Object?> a,
      Map<String, Object?> b,
    ) {
      return a.keys.where((String key) => a[key] != b[key]).toList()..sort();
    }

    /// A root token's rounded srgb channels — the same three numbers the tier
    /// prints for any measured colour, so a `color-mix` can be pinned to the
    /// token it mixed from.
    List<int> appTokenChannels(String pass, String token) {
      final Map<String, dynamic> srgb =
          _token(appRoot(pass), token)['srgb']! as Map<String, dynamic>;
      return <int>[
        (srgb['r']! as num).round(),
        (srgb['g']! as num).round(),
        (srgb['b']! as num).round(),
      ];
    }

    /// Every header field, keyed, so a brightness pair answers with the names of
    /// the fields that moved rather than with a diff of a whole object.
    Map<String, Object?> appDayShape(AppDayHeadSpec head) => <String, Object?>{
      'stackRow': head.stackRow,
      'cssClasses': head.cssClasses,
      'authoredSrc': head.authoredSrc,
      'displayCss': head.displayCss,
      'zIndexCss': head.zIndexCss,
      'paddingVerticalPx': head.paddingVerticalPx,
      'paddingHorizontalPx': head.paddingHorizontalPx,
      'blurPx': head.blurPx,
      'fillColor': head.fillColor,
      'fillToken': head.fillToken,
      'fillMixPercent': head.fillMixPercent,
      'labelCssClass': head.labelCssClass,
      'labelAuthoredSrc': head.labelAuthoredSrc,
      'uppercase': head.uppercase,
      'redundantSizeOverride': head.redundantSizeOverride,
      'textColor': head.textColor,
      'fontSizePx': head.fontSizePx,
      'fontWeight': head.fontWeight,
      'heightRatio': head.heightRatio,
      'letterSpacingPx': head.letterSpacingPx,
      'letterSpacingEm': head.letterSpacingEm,
    };

    /// The inline style a component writes beside a class list, which is where
    /// a money arm's colour and a chip's tint come from.
    String appStyleText(String name) {
      for (final dynamic p in appRow(name)['parts']! as List<dynamic>) {
        final Object? style = (p as Map<String, dynamic>)['style'];
        if (style != null) return style as String;
      }
      throw StateError('$name writes no inline style');
    }

    test('the slots: one field at a time, read back at all four passes', () {
      final Map<String, String> money = _cssDecls(
        cssLines,
        '.money {',
        '.money',
      );
      final Map<String, String> monoRule = _cssDecls(
        cssLines,
        '.mono {',
        '.mono',
      );
      final Map<String, String> pillRule = _cssDecls(
        cssLines,
        '.pill {',
        '.pill',
      );
      for (final String pass in appPasses) {
        final String prefix = pass.split('-').first;
        final AppTxRowSpec spec = AppRows.txRow(
          prefix == 'light' ? Brightness.light : Brightness.dark,
        );
        final Map<String, AppTxRowSlotSpec> slots = <String, AppTxRowSlotSpec>{
          'title': spec.title,
          'meta': spec.meta,
          'textWrap': spec.textWrap,
          'amountWrap': spec.amountWrap,
          'amountIn': spec.amountIn,
          'amountOut': spec.amountOut,
          'pill': spec.pill,
          'emptyRc line': AppRows.emptyRc(
            prefix == 'light' ? Brightness.light : Brightness.dark,
          ).line,
        };
        for (final MapEntry<String, AppTxRowSlotSpec> entry in slots.entries) {
          final AppTxRowSlotSpec slot = entry.value;
          final String name = slot.stackRow;
          final String at = '$pass ${entry.key}';
          expect(slot.cssClasses, appCls(name), reason: '$at class list');
          final double size = appPx(pass, name, 'fontSize');
          expect(slot.fontSizePx, size, reason: '$at font size');
          expect(
            slot.fontWeight,
            appNumber(pass, name, 'fontWeight').toInt(),
            reason: '$at weight as the measured number',
          );
          expect(
            slot.weight,
            FontWeight.values[slot.fontWeight ~/ 100 - 1],
            reason: '$at the name Flutter gives that weight',
          );
          final double line = appPx(pass, name, 'lineHeight');
          expect(
            slot.heightRatio,
            line / size,
            reason: '$at line box over size',
          );
          expect(
            slot.heightRatio,
            _probeRatio(
              _probesOf(_theme(measurement, '$prefix-phone')),
              'body',
            ),
            reason:
                '$at no slot authors a line-height, so its box is the body '
                'multiplier the §6 probe reads',
          );
          final String track = appVal(pass, name, 'letterSpacing');
          final double px = track == 'normal'
              ? 0.0
              : _pxOf(track, '$at tracking');
          expect(slot.letterSpacingPx, px, reason: '$at measured tracking');
          expect(
            slot.letterSpacingEm,
            closeTo(px / size, 1e-9),
            reason: '$at the em that produced it',
          );
          expect(
            slot.textColor,
            appColour(pass, name, 'color'),
            reason: '$at ink',
          );
          final String? token = slot.authoredColorToken;
          if (token != null) {
            expect(
              slot.textColor,
              appTokenColour(pass, token),
              reason: '$at paints the token the port names',
            );
          }
          final List<String> words = appTokens(name);
          final bool trio =
              <String>['nowrap'].contains(appVal(pass, name, 'whiteSpace')) &&
              appVal(pass, name, 'textOverflow') == 'ellipsis' &&
              appVal(pass, name, 'overflowX') == 'hidden' &&
              appVal(pass, name, 'overflowY') == 'hidden';
          expect(
            slot.truncates,
            trio,
            reason: '$at truncate is the trio it measures',
          );
          expect(
            slot.truncates,
            words.contains('truncate'),
            reason: '$at the class list says what the measurement did',
          );
          if (!trio) {
            expect(
              appVal(pass, name, 'textOverflow'),
              'clip',
              reason: '$at a slot that does not truncate clips',
            );
          }
          expect(
            slot.flexGrow,
            appNumber(pass, name, 'flexGrow'),
            reason: '$at grow',
          );
          expect(
            slot.flexShrink,
            appNumber(pass, name, 'flexShrink'),
            reason: '$at shrink',
          );
          expect(
            slot.gapPx,
            appVal(pass, name, 'columnGap') == 'normal'
                ? null
                : appPx(pass, name, 'columnGap'),
            reason: '$at a gap only exists where the row measures one',
          );
          expect(
            slot.textAlignCss,
            appProps(pass, name)['textAlign'] as String?,
            reason: '$at text-align is null unless the row asked for it',
          );
          final bool mono = words.contains('mono');
          expect(
            slot.fontFamily,
            appProbeFamily('$prefix-phone', mono ? '.mono' : 'body'),
            reason: '$at the family of the stack it paints in, from the probe',
          );
          final bool tabular = words.contains('money') || mono;
          expect(
            slot.tabularNums,
            tabular,
            reason:
                '$at tabular figures come from the cited rule, not a choice',
          );
          if (words.contains('money')) {
            expect(
              money['font-variant-numeric'],
              'tabular-nums',
              reason: '$at cites .money, which is what authors tnum',
            );
          }
          if (mono) {
            expect(
              monoRule['font-variant-numeric'],
              'tabular-nums',
              reason: '$at cites .mono, which is what authors tnum',
            );
          }
          expect(
            slot.fontFeatures,
            tabular
                ? const <FontFeature>[FontFeature.tabularFigures()]
                : const <FontFeature>[],
            reason: '$at a font feature is answered as a font feature',
          );
          expect(
            slot.textStyle,
            slot.styleAt(slot.fontSizePx),
            reason: '$at the phone style',
          );
          final TextStyle grown = slot.styleAt(20);
          expect(grown.fontSize, 20.0);
          expect(
            grown.letterSpacing,
            slot.letterSpacingEm * 20,
            reason: '$at a resized slot re-derives its tracking from the em',
          );
          expect(
            grown.height,
            slot.heightRatio,
            reason: '$at the line box travels as a multiplier',
          );
          if (name == 'txrow-amount-in' || name == 'txrow-amount-out') {
            expect(
              slot.letterSpacingEm,
              closeTo(
                double.parse(
                  RegExp(r'^(-?[\d.]+)em$')
                      .firstMatch(money['letter-spacing']!)!
                      .group(1)!,
                ),
                1e-12,
              ),
              reason: '$at .money authors the tracking the arm measures',
            );
          }
        }
        expect(
          slots['pill']!.tabularNums,
          isTrue,
          reason:
              'the pill cites .mono, and .mono is the rule that authors tnum',
        );
        expect(
          pillRule.containsKey('color'),
          isFalse,
          reason:
              'the pill paints the ink it inherits because `.pill` authors '
              'no colour at rest',
        );
        expect(
          slots['textWrap']!.minWidthZero,
          isTrue,
          reason: 'the wrap asked for min-width and measured 0px',
        );
        expect(
          appVal(pass, 'txrow-text-wrap', 'minWidth'),
          '0px',
          reason: '$pass: `min-w-0` is the property, and it resolves to 0px',
        );
        for (final String role in <String>[
          'title',
          'meta',
          'amountWrap',
          'amountIn',
          'amountOut',
          'pill',
        ]) {
          expect(
            slots[role]!.minWidthZero,
            isNull,
            reason:
                '$role never asked for the property, so the port says nothing',
          );
          expect(
            appHas(pass, slots[role]!.stackRow, 'minWidth'),
            isFalse,
            reason: '$role: no min-width was measured either',
          );
        }
      }
      for (final MapEntry<String, AppTxRowSlotSpec> light
          in <String, AppTxRowSlotSpec>{
            'title': AppRows.txRowLight.title,
            'meta': AppRows.txRowLight.meta,
            'textWrap': AppRows.txRowLight.textWrap,
            'amountWrap': AppRows.txRowLight.amountWrap,
            'amountIn': AppRows.txRowLight.amountIn,
            'amountOut': AppRows.txRowLight.amountOut,
            'pill': AppRows.txRowLight.pill,
          }.entries) {
        final Map<String, AppTxRowSlotSpec> dark = <String, AppTxRowSlotSpec>{
          'title': AppRows.txRowDark.title,
          'meta': AppRows.txRowDark.meta,
          'textWrap': AppRows.txRowDark.textWrap,
          'amountWrap': AppRows.txRowDark.amountWrap,
          'amountIn': AppRows.txRowDark.amountIn,
          'amountOut': AppRows.txRowDark.amountOut,
          'pill': AppRows.txRowDark.pill,
        };
        expect(
          appDifferences(appShapeOf(light.value), appShapeOf(dark[light.key]!)),
          isEmpty,
          reason: '${light.key}: the two brightnesses differ by ink alone',
        );
      }
    });

    test('the two money arms are one row with two inks; the pill is inert', () {
      final Map<String, String> pillRule = _cssDecls(
        cssLines,
        '.pill {',
        '.pill',
      );
      for (final AppTxRowSpec spec in <AppTxRowSpec>[
        AppRows.txRowLight,
        AppRows.txRowDark,
      ]) {
        final Map<String, Object?> income = appShapeOf(spec.amountIn);
        final Map<String, Object?> expense = appShapeOf(spec.amountOut);
        expect(
          appDifferences(income, expense),
          <String>['authoredColorToken', 'stackRow'],
          reason:
              'one element, two inks: the class list, the size, the weight, '
              'the tracking and the gap are shared, and only the token moves',
        );
        expect(
          spec.amountIn.authoredSrc,
          spec.amountOut.authoredSrc,
          reason: 'both arms cite the class and the style, at 38 and 39',
        );
        for (final MapEntry<String, AppTxRowSlotSpec> arm
            in <String, AppTxRowSlotSpec>{
              'in': spec.amountIn,
              'out': spec.amountOut,
            }.entries) {
          final RegExpMatch? style = RegExp(r'^color: var\((--\w+)\)$')
              .firstMatch(appStyleText(arm.value.stackRow));
          expect(
            style,
            isNotNull,
            reason:
                '${arm.key}: the style part writes one colour and nothing else',
          );
          expect(
            arm.value.authoredColorToken,
            style!.group(1),
            reason:
                '${arm.key}: the token the port names is the token the style spells',
          );
        }
      }
      for (final String pass in appPasses) {
        final String prefix = pass.split('-').first;
        final AppTxRowSpec spec = AppRows.txRow(
          prefix == 'light' ? Brightness.light : Brightness.dark,
        );
        for (final MapEntry<String, String> arm in <String, String>{
          'txrow-amount-in': '--success',
          'txrow-amount-out': '--danger',
        }.entries) {
          expect(
            appColour(pass, arm.key, 'color'),
            appTokenColour(pass, arm.value),
            reason: '$pass ${arm.key}: the arm paints ${arm.value}',
          );
          expect(
            appStyleText(arm.key),
            'color: var(${arm.value})',
            reason:
                '$pass ${arm.key}: the cited style still spells it that way',
          );
        }
        expect(
          spec.amountIn.textColor,
          appTokenColour(pass, '--success'),
          reason: '$pass: the income arm at this brightness',
        );
        expect(
          spec.amountOut.textColor,
          appTokenColour(pass, '--danger'),
          reason: '$pass: the expense arm at this brightness',
        );
        // The trailing pill: `hidden sm:inline-flex` says one thing, an
        // unlayered `.pill` display says another, and the measurement is on the
        // side of the sheet — so the same class list paints at both viewports.
        final List<String> words = appTokens('txrow-trailing-pill');
        expect(
          words,
          containsAll(<String>['hidden', 'sm:inline-flex']),
          reason: 'the class list really does try to hide it',
        );
        expect(
          spec.pill.displayCss,
          appVal(pass, 'txrow-trailing-pill', 'display'),
          reason:
              '$pass: the port carries what was measured, not what was written',
        );
        expect(
          spec.pill.displayCss,
          pillRule['display'],
          reason:
              'and that is `.pill`’s own unlayered display, which outranks the '
              'utility, so the pill is inert on both viewports',
        );
      }
      expect(
        AppRows.txRowLight.pill.fontSizePx,
        isNot(_pxOf(pillRule['font-size']!, '.pill font-size')),
        reason:
            'the pill is measured smaller than `.pill` authors, because '
            '`!text-[9px]` is an important utility over the class',
      );
      expect(
        AppRows.txRowLight.pill.fontSizePx,
        _pxOf(
          appVal('light-phone', 'txrow-trailing-pill', 'fontSize'),
          'pill measured size',
        ),
        reason:
            'and what it carries is the measured 9px, not the authored 12px',
      );
      expect(
        AppRows.txRowLight.pill.gapPx,
        _pxOf(pillRule['gap']!, '.pill gap'),
        reason: 'the gap comes from `.pill` and no utility touches it',
      );
      expect(
        AppRows.txRowLight.pill.fontWeight,
        int.parse(pillRule['font-weight']!),
        reason: 'and so does the weight',
      );
    });

    test('the day head: an authored recipe, a blur and a label from .eyebrow', () {
      final Map<String, String> dayRule = _cssDecls(
        cssLines,
        '.day-head {',
        '.day-head',
      );
      final Map<String, String> eyebrowRule = _cssDecls(
        cssLines,
        '.eyebrow {',
        '.eyebrow',
      );
      final AppDayHeadSpec light = AppRows.dayHeadLight;
      final AppDayHeadSpec dark = AppRows.dayHeadDark;
      expect(light.cssClasses, appCls('day-head-label'));
      expect(light.stackRow, 'day-head-label');
      expect(light.redundantSizeOverride, isTrue);
      expect(
        appTokens('day-head-label'),
        contains('!text-[10px]'),
        reason: 'the class list really does restate the size',
      );
      expect(
        _pxOf(eyebrowRule['font-size']!, '.eyebrow font-size'),
        light.fontSizePx,
        reason:
            'and the restatement is inert because the class already says it',
      );
      final List<double> pad = appPad('light-phone', 'day-head-label');
      expect(light.paddingVerticalPx, pad[0]);
      expect(light.paddingHorizontalPx, pad[1]);
      expect(
        light.padding,
        EdgeInsets.symmetric(vertical: pad[0], horizontal: pad[1]),
      );
      final List<String> authoredPad = dayRule['padding']!.split(' ');
      expect(
        authoredPad.length,
        2,
        reason: '`.day-head` authors one vertical/horizontal pair',
      );
      expect(_pxOf(authoredPad[0], '.day-head padding top'), pad[0]);
      expect(
        _pxOf(authoredPad[1], '.day-head padding left'),
        pad[1],
        reason: 'what the label measured is what the rule authored',
      );
      expect(
        light.blurPx,
        double.parse(
          RegExp(r'^blur\(([\d.]+)px\)$')
              .firstMatch(dayRule['backdrop-filter']!)!
              .group(1)!,
        ),
        reason: 'the blur is the authored backdrop-filter, in CSS radius units',
      );
      expect(
        light.blurSigmaPx,
        light.blurPx / 2,
        reason: 'ruling D-U8: a CSS blur radius reaches Flutter as px / 2',
      );
      final RegExpMatch? mix = RegExp(
        r'^color-mix\(in srgb, var\((--[\w-]+)\) ([\d.]+)%, transparent\)$',
      ).firstMatch(dayRule['background']!.replaceAll(RegExp(r'\s+'), ' '));
      expect(
        mix,
        isNotNull,
        reason:
            'the header fill is a recipe — a named token at a named percentage '
            'over transparent — not a token',
      );
      expect(light.fillToken, mix!.group(1));
      expect(light.fillMixPercent, double.parse(mix.group(2)!));
      for (final MapEntry<String, AppDayHeadSpec> head
          in <String, AppDayHeadSpec>{'light': light, 'dark': dark}.entries) {
        expect(
          head.value.fillColor,
          appColour('${head.key}-phone', 'day-head-label', 'backgroundColor'),
          reason: '${head.key} header fill',
        );
        final List<int> base = appTokenChannels(
          '${head.key}-phone',
          head.value.fillToken,
        );
        expect(
          head.value.fillColor,
          Color.fromRGBO(
            base[0],
            base[1],
            base[2],
            head.value.fillMixPercent / 100,
          ),
          reason:
              '${head.key}: the srgb mix moves the alpha and no channel, so '
              'the painted box is the token itself at ${head.value.fillMixPercent}%',
        );
        expect(
          head.value.zIndexCss,
          dayRule['z-index'],
          reason: '${head.key}: z-index is what the rule authors',
        );
        expect(
          appVal('${head.key}-phone', 'day-head-label', 'position'),
          'sticky',
          reason: '${head.key}: the header is sticky in the measurement too',
        );
        expect(
          head.value.textColor,
          appColour('${head.key}-phone', 'day-head-label', 'color'),
          reason: '${head.key} header ink',
        );
        expect(
          head.value.textColor,
          _probeColour(
            _probe(
              _probesOf(_theme(measurement, '${head.key}-phone')),
              '.eyebrow',
              '${head.key}-phone',
            ),
            'color',
            '.eyebrow',
          ),
          reason: '${head.key}: and the same ink the .eyebrow probe painted',
        );
        expect(
          head.value.fontWeight,
          int.parse(eyebrowRule['font-weight']!),
          reason: '${head.key} weight comes from .eyebrow',
        );
        expect(
          head.value.weight,
          FontWeight.bold,
          reason: '${head.key}: 700 is the weight Flutter names',
        );
        expect(
          head.value.letterSpacingEm,
          double.parse(
            RegExp(r'^([\d.]+)em$')
                .firstMatch(eyebrowRule['letter-spacing']!)!
                .group(1)!,
          ),
          reason: '${head.key}: the tracking is .eyebrow’s authored em',
        );
        expect(
          head.value.letterSpacingPx,
          closeTo(head.value.letterSpacingEm * head.value.fontSizePx, 1e-9),
          reason: '${head.key}: which resolves to the measured px',
        );
        expect(
          head.value.heightRatio,
          _probeRatio(
            _probesOf(_theme(measurement, '${head.key}-phone')),
            'body',
          ),
          reason: '${head.key}: .eyebrow authors no line-height of its own',
        );
        expect(
          head.value.uppercase,
          eyebrowRule['text-transform'] == 'uppercase',
          reason: '${head.key}: a deviation the port records, not hides',
        );
        expect(
          appVal('${head.key}-phone', 'day-head-label', 'textTransform'),
          'uppercase',
          reason: '${head.key}: and the header really measured it',
        );
        expect(head.value.textStyle, head.value.styleAt(head.value.fontSizePx));
        expect(head.value.styleAt(12).letterSpacing, closeTo(0.12 * 12, 1e-9));
      }
      expect(
        appDifferences(appDayShape(light), appDayShape(dark)),
        <String>['fillColor', 'textColor'],
        reason:
            'the two brightnesses move the fill and the ink — the recipe '
            'percentage, the blur, the inset and the type do not',
      );
    });

    List<String> appChanged(String pass, String name) {
      final Map<String, dynamic> row =
          (_theme(measurement, pass)['stacks']! as Map<String, dynamic>)[name]!
              as Map<String, dynamic>;
      return (row['changed']! as List<dynamic>).cast<String>();
    }

    /// A rail's padding as the one side it reserves: `0px 4px 0px 0px` is the
    /// scrollbar gutter `pr-1` asks for, and nothing else.
    double appPadRight(String pass, String name) {
      final List<double> sides = appVal(pass, name, 'padding')
          .split(' ')
          .map((String piece) => _pxOf(piece, '$pass $name padding'))
          .toList();
      final double top = sides[0];
      final double right = sides.length > 1 ? sides[1] : top;
      final double bottom = sides.length > 2 ? sides[2] : top;
      final double left = sides.length > 3 ? sides[3] : right;
      if (top != 0 || bottom != 0 || left != 0) {
        throw StateError(
          '$pass $name: padding "${appVal(pass, name, 'padding')}" carries an '
          'inset this port does not have a field for',
        );
      }
      return right;
    }

    /// `max-height`, which is `none` on a rail the viewport leaves unbounded.
    double? appMaxHeight(String pass, String name) =>
        appVal(pass, name, 'maxHeight') == 'none'
        ? null
        : appPx(pass, name, 'maxHeight');

    test('the divider is the pair divide-y paints, on two siblings', () {
      expect(
        appRow('ledger-row-middle')['wrap'],
        appCls('ledger-divides'),
        reason:
            'the divided child was measured inside the parent the dashboard '
            'writes, which is the only way a divide-y can be seen at all',
      );
      expect(appRow('ledger-row-last')['wrap'], appCls('ledger-divides'));
      expect(appCls('ledger-row-middle'), '[&:last-child]:border-b-0');
      expect(appCls('ledger-row-last'), '[&:last-child]:border-b-0');
      for (final String pass in appPasses) {
        final String prefix = pass.split('-').first;
        final AppLedgerDividerSpec spec = AppRows.divider(
          prefix == 'light' ? Brightness.light : Brightness.dark,
        );
        expect(
          spec.widthPx,
          appPx(pass, 'ledger-row-middle', 'borderBottomWidth'),
          reason: '$pass: the divided child keeps the line the spec carries',
        );
        expect(
          spec.widthPx,
          1.0,
          reason: '$pass: `divide-y` authors a hairline',
        );
        expect(
          spec.color,
          appColour(pass, 'ledger-row-middle', 'borderBottomColor'),
          reason: '$pass: the line is the colour the divided child painted',
        );
        expect(
          spec.color,
          appTokenColour(pass, spec.token),
          reason: '$pass: and it is the token the spec names',
        );
        expect(spec.token, '--line');
        expect(
          appChanged(pass, 'ledger-row-last'),
          isEmpty,
          reason:
              '$pass: `[&:last-child]:border-b-0` takes the line back and '
              'moves nothing else in that child — a second property would mean '
              'the recipe row is describing a different element',
        );
        expect(
          appPx(pass, 'ledger-row-last', 'borderBottomWidth'),
          0.0,
          reason: '$pass: the last child measures no bottom border',
        );
        expect(
          appColour(pass, 'ledger-divides', 'borderBottomColor'),
          appColour(pass, 'ledger-divides', 'color'),
          reason:
              '$pass: the parent border is `currentColor`, so the recipe row '
              'resolves to the ink it painted and not to a token of its own',
        );
        expect(
          appPx(pass, 'ledger-divides', 'borderBottomWidth'),
          0.0,
          reason: '$pass: the divided parent carries no line of its own',
        );
      }
      expect(
        AppRows.dividerLight.widthPx,
        AppRows.dividerDark.widthPx,
        reason: 'the hairline is not a brightness fact; only its colour is',
      );
      expect(
        appDifferences(
          <String, Object?>{
            'width': AppRows.dividerLight.widthPx,
            'token': AppRows.dividerLight.token,
          },
          <String, Object?>{
            'width': AppRows.dividerDark.widthPx,
            'token': AppRows.dividerDark.token,
          },
        ),
        isEmpty,
      );
    });

    test('the two empty states, and the frame Flutter cannot dash', () {
      expect(
        appTokens('ledger-empty-rc'),
        contains('empty'),
        reason:
            'the Reports Centre box cites the class the sheet never declares',
      );
      expect(
        cssLines.where((String line) => RegExp(r'\.empty\b').hasMatch(line)),
        isEmpty,
        reason: 'and `empty` is still declared nowhere in src/index.css',
      );
      for (final String pass in appPasses) {
        final String prefix = pass.split('-').first;
        final Brightness brightness = prefix == 'light'
            ? Brightness.light
            : Brightness.dark;
        final AppLedgerEmptySpec empty = AppRows.empty(brightness);
        expect(
          empty.cssClasses,
          appCls('ledger-empty'),
          reason: '$pass empty class list',
        );
        expect(empty.stackRow, 'ledger-empty');
        expect(empty.textAlignCss, appVal(pass, 'ledger-empty', 'textAlign'));
        expect(
          empty.radiusPx,
          appPx(pass, 'ledger-empty', 'borderRadius'),
          reason: '$pass: the measured corner',
        );
        expect(
          empty.radiusPx,
          appTokenPx(pass, '--r-sm'),
          reason:
              '$pass: and it is --r-sm at that pass, the same token the row uses',
        );
        expect(empty.radius, BorderRadius.circular(empty.radiusPx));
        final List<double> pad = appPad(pass, 'ledger-empty');
        expect(empty.paddingVerticalPx, pad[0], reason: '$pass: py-10');
        expect(
          pad[1],
          0.0,
          reason: '$pass: the empty box has no horizontal inset',
        );
        expect(empty.padding, EdgeInsets.symmetric(vertical: pad[0]));
        expect(
          empty.borderWidthPx,
          appPx(pass, 'ledger-empty', 'borderTopWidth'),
          reason: '$pass: `border` is 1px',
        );
        for (final String side in <String>[
          'borderTopWidth',
          'borderRightWidth',
          'borderBottomWidth',
          'borderLeftWidth',
        ]) {
          expect(
            appPx(pass, 'ledger-empty', side),
            empty.borderWidthPx,
            reason: '$pass: $side — one width on all four sides',
          );
        }
        expect(
          empty.borderColor,
          appColour(pass, 'ledger-empty', 'borderTopColor'),
          reason: '$pass: the frame colour the box painted',
        );
        expect(
          empty.borderColor,
          appTokenColour(pass, '--line'),
          reason: '$pass: and the token `border-[var(--line)]` names',
        );
        expect(
          empty.fillColor,
          appColour(pass, 'ledger-empty', 'backgroundColor'),
          reason: '$pass: the fill the box painted',
        );
        expect(
          empty.fillColor,
          appTokenColour(pass, '--surface-2'),
          reason: '$pass: and the token `bg-[var(--surface-2)]` names',
        );
        expect(
          appTokens('ledger-empty'),
          contains('border-dashed'),
          reason: 'the authored frame is dashed',
        );
        expect(
          appVal(pass, 'ledger-empty', 'borderTopStyle'),
          'dashed',
          reason: 'and the measurement agrees',
        );
        expect(
          empty.border.top.style,
          BorderStyle.solid,
          reason:
              'Flutter `Border` has no dash pattern, so the port paints a '
              'solid hairline of the same width and colour: a deviation it '
              'records rather than hides',
        );
        expect(
          empty.border,
          Border.all(color: empty.borderColor, width: empty.borderWidthPx),
        );
        // The Reports Centre box, which the undeclared class leaves bare.
        final AppLedgerEmptyRcSpec rc = AppRows.emptyRc(brightness);
        expect(rc.cssClasses, appCls('ledger-empty-rc'));
        expect(
          appColour(pass, 'ledger-empty-rc', 'backgroundColor').a,
          0,
          reason:
              '$pass: `empty` paints nothing because nothing declares it — '
              'the box measures a transparent fill',
        );
        expect(
          appPx(pass, 'ledger-empty-rc', 'borderTopWidth'),
          0.0,
          reason: '$pass: and no frame either',
        );
        final List<double> rcPad = appPad(pass, 'ledger-empty-rc');
        expect(rc.paddingVerticalPx, rcPad[0], reason: '$pass: rc py-10');
        expect(rcPad[1], 0.0);
        expect(
          rc.gapPx,
          appPx(pass, 'ledger-empty-rc', 'rowGap'),
          reason: '$pass: gap-2',
        );
        expect(
          appPx(pass, 'ledger-empty-rc', 'columnGap'),
          rc.gapPx,
          reason: '$pass: one gap on both axes',
        );
        expect(
          appVal(pass, 'ledger-empty-rc', 'flexDirection'),
          'column',
          reason: '$pass: the box is the column `flex-col` authors',
        );
        expect(
          appVal(pass, 'ledger-empty-rc', 'alignItems'),
          'center',
          reason:
              '$pass: centred by the class list, not by the port choosing it',
        );
      }
      for (final String prefix in <String>['light', 'dark']) {
        final AppLedgerEmptyRcSpec rc = AppRows.emptyRc(
          prefix == 'light' ? Brightness.light : Brightness.dark,
        );
        expect(
          rc.line.textColor,
          appTokenColour('$prefix-phone', rc.line.authoredColorToken!),
          reason:
              '$prefix: the line paints the token it names, at its brightness',
        );
        expect(
          rc.line.fontFamily,
          appProbeFamily('$prefix-phone', '.mono'),
          reason: '$prefix: and it is `.mono`’s family, which the class cites',
        );
      }
    });

    test('the rails: the one pair the two viewports genuinely disagree on', () {
      void rail(AppLedgerRailSpec spec, String rowName) {
        expect(spec.stackRow, rowName);
        expect(spec.cssClasses, appCls(rowName));
        for (final String prefix in <String>['light', 'dark']) {
          final String wide = '$prefix-desktop';
          final String narrow = '$prefix-phone';
          expect(
            spec.wideMaxHeightPx,
            appMaxHeight(wide, rowName),
            reason: '$wide: the ceiling the rail is bounded by',
          );
          expect(
            spec.narrowMaxHeightPx,
            appMaxHeight(narrow, rowName),
            reason: '$narrow: and the ceiling below the breakpoint',
          );
          expect(
            spec.wideOverflowYCss,
            appVal(wide, rowName, 'overflowY'),
            reason: '$wide: the axis the class turns on',
          );
          expect(
            spec.narrowOverflowYCss,
            appVal(narrow, rowName, 'overflowY'),
            reason: '$narrow: off again',
          );
          expect(
            spec.wideOverflowXCss,
            appVal(wide, rowName, 'overflowX'),
            reason: '$wide: the other axis, which nobody authored',
          );
          expect(
            spec.narrowOverflowXCss,
            appVal(narrow, rowName, 'overflowX'),
            reason: '$narrow: back to what the sheet says',
          );
          expect(
            spec.widePaddingRightPx,
            appPadRight(wide, rowName),
            reason: '$wide: a one-sided gutter, nothing on the other three',
          );
          expect(
            spec.narrowPaddingRightPx,
            appPadRight(narrow, rowName),
            reason: '$narrow: and the same question below the breakpoint',
          );
          final String other = prefix == 'light' ? 'dark' : 'light';
          expect(
            appMaxHeight(wide, rowName),
            appMaxHeight('$other-desktop', rowName),
            reason: 'a rail is geometry, so the theme cannot move it',
          );
          expect(
            appMaxHeight(narrow, rowName),
            appMaxHeight('$other-phone', rowName),
          );
          expect(
            appVal(wide, rowName, 'overflowY'),
            appVal('$other-desktop', rowName, 'overflowY'),
          );
          expect(
            appPadRight(wide, rowName),
            appPadRight('$other-desktop', rowName),
          );
        }
        expect(
          appTokens(rowName)
              .any((String token) => RegExp(r'overflow-x').hasMatch(token)),
          isFalse,
          reason:
              '${spec.cssClasses}: no overflow-x class is authored, yet the '
              'desktop rail measures `auto` there — CSS turns a `visible` '
              'sitting next to a scrolled axis into `auto`, and the port '
              'carries what the browser settled on',
        );
      }

      rail(AppRows.ledgerRail, 'ledger-scroll');
      rail(AppRows.reportsRail, 'ledger-list-scroll');

      for (final String pass in <String>['light-phone', 'dark-phone']) {
        expect(
          appChanged(pass, 'ledger-scroll'),
          isEmpty,
          reason:
              '$pass: every one of the dashboard rail’s readings is the '
              'default a plain div gets, because all four of its classes '
              'hide behind `lg:`',
        );
        expect(
          appChanged(pass, 'ledger-list-scroll'),
          isNotEmpty,
          reason:
              '$pass: the Reports rail is ungated, so it still scrolls on a '
              'phone',
        );
      }

      final List<String> ledgerCls = appTokens('ledger-scroll');
      final List<String> reportsCls = appTokens('ledger-list-scroll');
      final RegExpMatch? ledgerRem =
          RegExp(r'^lg:max-h-\[(\d+(?:\.\d+)?)rem\]$').firstMatch(
            ledgerCls.singleWhere(
              (String token) => token.startsWith('lg:max-h-'),
            ),
          );
      if (ledgerRem == null) {
        throw StateError(
          'ledger-scroll: no lg:max-h-[_]rem class left to derive the '
          'ceiling from',
        );
      }
      expect(
        double.parse(ledgerRem.group(1)!) * _remPx,
        AppRows.ledgerRail.wideMaxHeightPx,
        reason: 'lg:max-h-[34rem] is 34 root font sizes, not a chosen number',
      );
      expect(
        ledgerCls.contains('lg:overflow-y-auto'),
        isTrue,
        reason:
            'and the scroll is gated by the same prefix, which is why the '
            'narrow readings disagree with the wide ones',
      );
      expect(
        AppRows.ledgerRail.narrowMaxHeightPx,
        isNull,
        reason: 'below lg the dashboard list is unbounded',
      );
      final RegExpMatch? reportsPx = RegExp(r'^max-h-\[(\d+(?:\.\d+)?)px\]$')
          .firstMatch(
            reportsCls.singleWhere(
              (String token) => token.startsWith('max-h-'),
            ),
          );
      if (reportsPx == null) {
        throw StateError(
          'ledger-list-scroll: no max-h-[_]px class left to read the '
          'ceiling from',
        );
      }
      expect(
        double.parse(reportsPx.group(1)!),
        AppRows.reportsRail.wideMaxHeightPx,
        reason:
            'the Reports ceiling is the px the class says, at every '
            'viewport because no variant gates it',
      );
      expect(
        AppRows.reportsRail.narrowMaxHeightPx,
        AppRows.reportsRail.wideMaxHeightPx,
      );

      final RegExpMatch? ledgerGutter = RegExp(r'^lg:pr-(\d+(?:\.\d+)?)$')
          .firstMatch(
            ledgerCls.singleWhere((String token) => token.startsWith('lg:pr-')),
          );
      final RegExpMatch? reportsGutter = RegExp(r'^pr-(\d+(?:\.\d+)?)$')
          .firstMatch(
            reportsCls.singleWhere((String token) => token.startsWith('pr-')),
          );
      if (ledgerGutter == null || reportsGutter == null) {
        throw StateError('a rail no longer names its gutter class');
      }
      for (final String pass in appPasses) {
        final double spacing = appTokenPx(pass, '--spacing');
        expect(
          double.parse(ledgerGutter.group(1)!) * spacing,
          AppRows.ledgerRail.widePaddingRightPx,
          reason: 'lg:pr-1 is one × --spacing, which is 4px at $pass',
        );
        expect(
          double.parse(reportsGutter.group(1)!) * spacing,
          AppRows.reportsRail.widePaddingRightPx,
          reason: 'pr-1 is one × --spacing at $pass',
        );
        expect(
          AppRows.reportsRail.narrowPaddingRightPx,
          AppRows.reportsRail.widePaddingRightPx,
          reason: 'and ungated, so the same on a phone',
        );
      }
      expect(
        AppRows.ledgerRail.narrowPaddingRightPx,
        0,
        reason: 'the dashboard gutter hides behind lg: too',
      );
    });

    /// An authored non-CSS record — a fact the probe tier cannot see because no
    /// stylesheet declares it.
    Map<String, dynamic> appRecord(String name) {
      for (final dynamic e in appStacks['authoredNonCss']! as List<dynamic>) {
        final Map<String, dynamic> rec = e as Map<String, dynamic>;
        if (rec['name'] == name) return rec;
      }
      throw StateError('ui-tokens.json carries no authored record "$name"');
    }

    /// The one frozen line of a record matching `wants`, with the line number it
    /// was read from. Matching on the text and re-reading the file is the point:
    /// a line number typed into this test could drift, a line number the record
    /// carries cannot.
    ({int line, String text}) appRecordLine(String record, RegExp wants) {
      final List<Map<String, dynamic>> found =
          (appRecord(record)['parts']! as List<dynamic>)
              .cast<Map<String, dynamic>>()
              .where(
                (Map<String, dynamic> p) =>
                    wants.hasMatch(p['text']! as String),
              )
              .toList();
      if (found.length != 1) {
        throw StateError(
          '$record: /$wants/ matched ${found.length} parts, not the one this '
          'test reads',
        );
      }
      final Map<String, dynamic> part = found.single;
      return (
        line: (part['line']! as num).toInt(),
        text: part['text']! as String,
      );
    }

    Map<String, dynamic> appRowPart(String name) =>
        (appRow(name)['parts']! as List<dynamic>)
            .whereType<Map<String, dynamic>>()
            .firstWhere((Map<String, dynamic> p) => p['style'] != null);

    test('the chip sizes: one ternary pair, three witnesses', () {
      const String tables = 'cat-chip-icon-and-size-tables';
      expect(appRecord(tables)['src'], appChipSrc);
      final ({int line, String text}) dimsAt = appRecordLine(
        tables,
        RegExp(r'^const dims = '),
      );
      final ({int line, String text}) glyphAt = appRecordLine(
        tables,
        RegExp(r'^const glyph = '),
      );
      expect(
        appLineAt(appChipSrc, dimsAt.line).trim(),
        dimsAt.text,
        reason:
            'the frozen text is still the text at the line the record names — '
            'if CategoryChip moved, this is where the port learns it',
      );
      expect(appLineAt(appChipSrc, glyphAt.line).trim(), glyphAt.text);

      final Map<String, double> dims = appTernary(
        appChipSrc,
        dimsAt.line,
        'dims',
      );
      final Map<String, double> glyph = appTernary(
        appChipSrc,
        glyphAt.line,
        'glyph',
      );
      expect(dims.keys.toSet(), <String>{'xs', 'sm', 'lg', 'md'});
      expect(glyph.keys.toSet(), <String>{'xs', 'sm', 'lg', 'md'});

      for (final AppChipSize size in AppChipSize.values) {
        expect(
          size.sidePx,
          dims[size.name],
          reason:
              '${size.name}: the square is the arm of the dims ternary that '
              'names it, not a number this file retypes',
        );
        expect(
          size.glyphPx,
          glyph[size.name],
          reason: '${size.name}: and the glyph',
        );
        final String rowName = size == AppChipSize.md
            ? 'cat-chip-md-lavender'
            : 'cat-chip-${size.name}';
        final Map<String, dynamic> part = appRowPart(rowName);
        expect(
          (part['dims']! as num).toDouble(),
          size.sidePx,
          reason: '$rowName: the row recorded the same arm',
        );
        expect((part['glyph']! as num).toDouble(), size.glyphPx);
        expect(
          (part['dimsLine']! as num).toInt(),
          dimsAt.line,
          reason: '$rowName: and read it from the same line',
        );
        expect((part['glyphLine']! as num).toInt(), glyphAt.line);
        if (size == AppChipSize.md) {
          expect(
            part.containsKey('size'),
            isFalse,
            reason:
                '$rowName: md is the component’s default, so nothing selects '
                'it and the row carries no size key',
          );
        } else {
          expect(
            part['size'],
            size.name,
            reason: '$rowName: sampled by asking for this arm',
          );
        }
        for (final String pass in appPasses) {
          expect(
            appPx(pass, rowName, 'width'),
            size.sidePx,
            reason: '$pass $rowName: the box Chrome painted is the arm',
          );
          expect(
            appPx(pass, rowName, 'height'),
            size.sidePx,
            reason: '$pass $rowName: and it is square',
          );
        }
      }

      for (final AppChipSize size in AppChipSize.values) {
        expect(
          AppChipSize.sizeFor(size.name),
          size,
          reason: '${size.name}: the class name reaches the arm it names',
        );
      }
      expect(
        AppChipSize.sizeFor('xl'),
        AppChipSize.md,
        reason:
            'and a size the ternary does not name falls through to its default '
            'arm, which is md — the port’s switch mirrors the source’s, '
            'including the fall-through',
      );
      expect(
        appRowPart('cat-chip-md-lavender')['style'],
        contains('width: 40px; height: 40px'),
        reason:
            'the style string the record froze is the one the inline style '
            'built from the default arm',
      );
    });

    /// The one line of a web source matching `wants`. Scanning for it rather than
    /// trusting a line number typed here is the point: a component that moved
    /// becomes a failure with a name, not a wrong value read in peace.
    ({int line, String text}) appSourceLine(String src, RegExp wants) {
      final List<String> lines = appLinesOf(src);
      final List<int> hits = <int>[];
      for (int i = 0; i < lines.length; i++) {
        if (wants.hasMatch(lines[i])) hits.add(i + 1);
      }
      if (hits.length != 1) {
        throw StateError(
          '$src: /$wants/ matched ${hits.length} lines, not the one this test '
          'reads',
        );
      }
      return (line: hits.single, text: lines[hits.single - 1]);
    }

    test('the tone tables: the union, the cycle and the hash, off the component', () {
      final ({int line, String text}) unionAt = appSourceLine(
        appChipSrc,
        RegExp(r'^export type ChipTone = '),
      );
      final List<String> declared = RegExp(r"'([a-z]+)'")
          .allMatches(unionAt.text)
          .map((RegExpMatch m) => m.group(1)!)
          .toList();
      expect(
        AppChipTone.values.map((AppChipTone t) => t.name).toList(),
        declared,
        reason: 'the enum is the union, in the order the union declares it',
      );
      expect(declared.toSet().length, declared.length);

      final ({int line, String text}) toneBgAt = appSourceLine(
        appChipSrc,
        RegExp(r'^const TONE_BG: Record<ChipTone, string> = \{$'),
      );
      final List<String> chipLines = appLinesOf(appChipSrc);
      final Map<String, ({int line, String token})> toneBg =
          <String, ({int line, String token})>{};
      for (int i = toneBgAt.line; i < chipLines.length; i++) {
        final String entry = chipLines[i];
        if (entry == '};') break;
        final RegExpMatch? m = RegExp(r"^  ([a-z]+): 'var\((--[a-z0-9-]+)\)',$")
            .firstMatch(entry);
        if (m == null) {
          throw StateError(
            'TONE_BG has an arm this test cannot parse: "$entry"',
          );
        }
        toneBg[m.group(1)!] = (line: i + 1, token: m.group(2)!);
      }
      expect(
        toneBg.keys.toList(),
        declared,
        reason: 'and TONE_BG covers exactly the union, in the same order',
      );
      for (final AppChipTone tone in AppChipTone.values) {
        expect(
          tone.toneToken,
          toneBg[tone.name]!.token,
          reason: '${tone.name}: the token the enum carries is the table’s',
        );
        final String rowName = 'cat-chip-md-${tone.name}';
        final Map<String, dynamic> part = appRowPart(rowName);
        final RegExpMatch? varAt = RegExp(r'^var\((--[a-z0-9-]+)\)$')
            .firstMatch(part['toneVar']! as String);
        if (varAt == null) {
          throw StateError('$rowName: toneVar is no longer one var()');
        }
        expect(
          varAt.group(1)!,
          tone.toneToken,
          reason:
              '$rowName: the token the row measured is the token the table '
              'names for it',
        );
        expect(
          (part['toneVarLine']! as num).toInt(),
          toneBg[tone.name]!.line,
          reason: '$rowName: read from the line TONE_BG holds it on',
        );
        expect(
          part['style'],
          contains(
            'color-mix(in oklab, var(${tone.toneToken}) 55%, var(--surface))',
          ),
          reason: '$rowName: and the inline style is that token, mixed',
        );
      }

      const String choice = 'cat-chip-tone-choice';
      final ({int line, String text}) cycleAt = appRecordLine(
        choice,
        RegExp(r'^const TONE_CYCLE: ChipTone\[\] = '),
      );
      final List<String> cycleNames = RegExp(r"'([a-z]+)'")
          .allMatches(cycleAt.text)
          .map((RegExpMatch m) => m.group(1)!)
          .toList();
      expect(
        AppCategoryChips.toneCycle.map((AppChipTone t) => t.name).toList(),
        cycleNames,
        reason: 'TONE_CYCLE is the list a category hashes into, in its order',
      );
      expect(
        cycleNames.toSet().length,
        cycleNames.length,
        reason: 'no tone repeats, so the modulo is a fair cycle',
      );
      expect(
        cycleNames.toSet(),
        declared.toSet().difference(<String>{'ink'}),
        reason:
            'exactly the pastels cycle; the neutral ink is reachable only '
            'when a caller names it, which is why it is in the union and not '
            'in the list',
      );

      final ({int line, String text}) stepAt = appRecordLine(
        choice,
        RegExp(r'h = \(h \* \d+ \+ s\.charCodeAt\(i\)\) >>> \d+;'),
      );
      final RegExpMatch step = RegExp(
        r'h = \(h \* (\d+) \+ s\.charCodeAt\(i\)\) >>> (\d+);',
      ).firstMatch(stepAt.text)!;
      expect(
        int.parse(step.group(1)!),
        AppCategoryChips.toneHashMultiplier,
        reason: 'the multiplier is the one the loop writes',
      );
      expect(step.group(2), '0', reason: 'and the unsigned step is `>>> 0`');
      expect(
        AppCategoryChips.toneHashMask,
        (1 << 32) - 1,
        reason:
            'which is a mod-2^32, and a 64-bit Dart answers it with a mask, '
            'not with a second best',
      );
      final ({int line, String text}) seedAt = appRecordLine(
        choice,
        RegExp(r'^let h = \d+;$'),
      );
      expect(
        RegExp(r'^let h = (\d+);$').firstMatch(seedAt.text)!.group(1),
        '0',
        reason: 'the hash starts at zero, as the port’s loop does',
      );
      final ({int line, String text}) pickAt = appRecordLine(
        choice,
        RegExp(r'^return TONE_CYCLE\[hashString'),
      );
      expect(
        pickAt.text,
        contains('category.toLowerCase().trim()'),
        reason:
            'and the string hashed is the category lowercased then trimmed — '
            'the two steps [toneFor] takes before it counts',
      );
      expect(
        pickAt.text,
        contains('% TONE_CYCLE.length'),
        reason: 'the index is the hash modulo the cycle, nothing else',
      );

      final ({int line, String text}) iconAt = appRecordLine(
        'cat-chip-icon-and-size-tables',
        RegExp(r'^<Icon size=\{'),
      );
      expect(
        RegExp(r'size=\{(\w+)\}').firstMatch(iconAt.text)!.group(1),
        'glyph',
        reason:
            'the glyph is drawn at the `glyph` ternary, which the size test '
            'above reads back arm by arm',
      );
      expect(
        double.parse(
          RegExp(r'strokeWidth=\{([\d.]+)\}')
              .firstMatch(iconAt.text)!
              .group(1)!,
        ),
        AppCategoryChips.glyphStrokeWidth,
        reason: 'and at the stroke the component authors',
      );

      expect(
        appTokens('cat-chip-md-lavender').contains('rounded-full'),
        isTrue,
        reason: 'the round is a class, so it is the engine’s clamp that lands',
      );
      final RegExpMatch radiusRaw = RegExp(r'^([\d.eE+-]+)px$')
          .firstMatch(appFullRadius)!;
      expect(
        double.parse(radiusRaw.group(1)!),
        AppCategoryChips.fullRoundRadiusPx,
        reason:
            'the port carries the serialisation Chrome gave (`$appFullRadius`) '
            'because it is what was measured, not a radius anyone chose',
      );
      for (final String pass in appPasses) {
        for (final AppChipTone tone in AppChipTone.values) {
          final String rowName = 'cat-chip-md-${tone.name}';
          expect(
            appPx(pass, rowName, 'borderRadius'),
            AppCategoryChips.fullRoundRadiusPx,
            reason: '$pass $rowName: every tone measures the same round',
          );
        }
      }
      for (final AppChipSize size in AppChipSize.values) {
        expect(
          AppCategoryChips.fullRoundRadiusPx * 2,
          greaterThanOrEqualTo(size.sidePx),
          reason:
              '${size.name}: at least half the side, which is what makes it a '
              'circle at that size too',
        );
      }
      for (final AppChipTone tone in AppChipTone.values) {
        expect(
          AppCategoryChips.light[tone]!.radius,
          BorderRadius.circular(AppCategoryChips.fullRoundRadiusPx),
          reason: '${tone.name}: and the box the widget paints is that round',
        );
      }
    });
    test('toneFor: the port, the web’s loop rebuilt here, and the fixture table', () {
      const String choice = 'cat-chip-tone-choice';
      final ({int line, String text}) stepAt = appRecordLine(
        choice,
        RegExp(r'h = \(h \* \d+ \+ s\.charCodeAt'),
      );
      final RegExpMatch step = RegExp(
        r'h = \(h \* (\d+) \+ s\.charCodeAt\(i\)\) >>> (\d+);',
      ).firstMatch(stepAt.text)!;
      final int multiplier = int.parse(step.group(1)!);
      if (step.group(2) != '0') {
        throw StateError('the hash no longer normalises with `>>> 0`');
      }
      final int mask = (1 << 32) - 1;
      final ({int line, String text}) cycleAt = appRecordLine(
        choice,
        RegExp(r'^const TONE_CYCLE: ChipTone\[\] = '),
      );
      final List<String> cycleNames = RegExp(r"'([a-z]+)'")
          .allMatches(cycleAt.text)
          .map((RegExpMatch m) => m.group(1)!)
          .toList();
      final Map<String, AppChipTone> toneByName = <String, AppChipTone>{
        for (final AppChipTone t in AppChipTone.values) t.name: t,
      };

      /// The component’s hash, rebuilt from the shape of its own loop rather than
      /// from [AppCategoryChips.toneFor]: the same UTF-16 indexing, the same
      /// multiplier read off the source, the same mask and the same cycle. It
      /// takes the string the web’s normalisation produced, so a disagreement
      /// here cannot be blamed on how the two languages lowercase.
      AppChipTone hashOf(String normalised) {
        int h = 0;
        for (int i = 0; i < normalised.length; i++) {
          h = (h * multiplier + normalised.codeUnitAt(i)) & mask;
        }
        return toneByName[cycleNames[h % cycleNames.length]]!;
      }

      expect(AppCategoryChips.toneFixtures, isNotEmpty);
      expect(
        AppCategoryChips.toneWebNormalisations.keys.toSet(),
        AppCategoryChips.toneFixtures.keys.toSet(),
        reason: 'every fixture key carries the web’s own normalisation of it',
      );

      /// The keys where Dart’s `toLowerCase().trim()` and the browser’s do not
      /// answer with the same string — derived, never typed, so a new divergence
      /// fails the pin below instead of passing quietly.
      final Set<String> divergent = <String>{
        for (final MapEntry<String, String> entry
            in AppCategoryChips.toneWebNormalisations.entries)
          if (entry.key.toLowerCase().trim() != entry.value) entry.key,
      };
      expect(
        divergent,
        <String>{'İSTANBUL'},
        reason:
            'a dotted capital İ is the one fixture where Unicode’s full '
            'lowercase mapping (i + U+0307, which a browser takes) is longer '
            'than its simple one (i, which Dart takes). Recorded as a '
            'deviation, not hidden: the port hashes the shorter name, so a '
            'Turkish category lands on another pastel than the web’s. If this '
            'set ever changes, the deviation note and this pin both need '
            're-reading.',
      );

      for (final MapEntry<String, AppChipTone> fixture
          in AppCategoryChips.toneFixtures.entries) {
        expect(
          hashOf(AppCategoryChips.toneWebNormalisations[fixture.key]!),
          fixture.value,
          reason:
              'the fixture is no longer what the component’s own loop answers '
              'for "${fixture.key}", so the table needs regenerating',
        );
        if (divergent.contains(fixture.key)) {
          expect(
            AppCategoryChips.toneFor(fixture.key),
            isNot(fixture.value),
            reason:
                '"${fixture.key}" is the pinned divergence, so the port '
                'cannot land on the web’s tone for it',
          );
          expect(
            AppCategoryChips.toneFor(fixture.key),
            hashOf(fixture.key.toLowerCase().trim()),
            reason:
                'and the normalisation is all that differs: the port’s loop '
                'answers exactly what hashing its own string answers',
          );
        } else {
          expect(
            AppCategoryChips.toneFor(fixture.key),
            fixture.value,
            reason:
                'Dart’s toneFor disagrees with the web for "${fixture.key}"',
          );
        }
      }

      expect(
        AppCategoryChips.toneFixtures.containsKey('  GROCERIES '),
        isTrue,
        reason: 'the table exercises the normalisation, not just the hash',
      );
      expect(
        AppCategoryChips.toneFor('  GROCERIES '),
        AppCategoryChips.toneFor('groceries'),
        reason: 'trim and lower case land the same category on the same tone',
      );
      expect(
        AppCategoryChips.toneFor('Salary'),
        AppCategoryChips.toneFixtures['salary'],
      );
      expect(
        'a𝕏b'.length,
        4,
        reason:
            'the astral glyph is two UTF-16 units, which is the whole reason '
            'this key is in the table',
      );
      expect(
        'a𝕏b'.codeUnits.length,
        'a𝕏b'.runes.length + 1,
        reason: 'and Dart indexes the pair the way charCodeAt does',
      );
      expect(
        AppCategoryChips.toneWebNormalisations['a𝕏b'],
        'a𝕏b',
        reason: 'lowercasing leaves the pair alone, so both languages hash it',
      );
      expect(
        AppCategoryChips.toneFor('a𝕏b'),
        AppCategoryChips.toneFixtures['a𝕏b'],
        reason: 'surrogates counted as units, in both',
      );
      expect(
        'İSTANBUL'.toLowerCase().length,
        8,
        reason: 'Dart folds the dotted capital to one code unit',
      );
      expect(
        AppCategoryChips.toneWebNormalisations['İSTANBUL']!.length,
        9,
        reason:
            'the browser folds it to two — i plus a combining dot — and that '
            'one extra unit is the entire difference between mint and pink',
      );
      expect(
        AppCategoryChips.toneFor('İSTANBUL'),
        AppChipTone.pink,
        reason:
            'the answer the port really paints, pinned so that fixing the '
            'divergence is a decision with a failing test behind it',
      );
      expect(
        AppCategoryChips.toneFor('彩票'),
        AppCategoryChips.toneFixtures['彩票'],
        reason: 'non-Latin names are just code units to this hash',
      );

      expect(
        AppCategoryChips.toneFixtures.values.toSet(),
        AppCategoryChips.toneCycle.toSet(),
        reason:
            'the table reaches every cycling tone and never the neutral ink, '
            'which no hash can select',
      );
      expect(
        AppCategoryChips.toneFor(''),
        AppCategoryChips.toneCycle.first,
        reason: 'the empty name hashes to zero, which is index zero',
      );
      for (final AppChipTone tone in AppCategoryChips.toneCycle) {
        expect(
          AppCategoryChips.toneFixtures.containsValue(tone),
          isTrue,
          reason: '${tone.name} is exercised by at least one fixture',
        );
      }
    });

    /// `parity/icon-map.tsv` as the item 3 contact sheet authored it: the web’s
    /// Lucide name, its current slug, and the Dart symbol that draws it. Nothing
    /// in the port reaches a glyph except through this table, so a symbol the map
    /// does not record is a symbol nobody verified.
    Map<String, ({String slug, String dart})> appIconMap() {
      final List<String> lines = webSource('parity/icon-map.tsv')
          .split(RegExp(r'\r?\n'));
      final Map<String, ({String slug, String dart})> out =
          <String, ({String slug, String dart})>{};
      for (final String line in lines.skip(1)) {
        if (line.trim().isEmpty) continue;
        final List<String> cols = line.split('\t');
        out[cols[0]] = (slug: cols[1], dart: cols[2]);
      }
      return out;
    }

    test('the glyph table: the component’s map, walked through the icon map', () {
      final Map<String, ({String slug, String dart})> iconMap = appIconMap();
      expect(iconMap, isNotEmpty);
      expect(
        iconMap['AlertCircle']!.slug,
        'circle-alert',
        reason:
            'the sheet records renames, which is why the port names a '
            'symbol through the map rather than by guessing the Dart casing',
      );

      final ({int line, String text}) iconsAt = appSourceLine(
        appChipSrc,
        RegExp(r'^const CATEGORY_ICONS: Record<string, LucideIcon> = \{$'),
      );
      final List<String> chipLines = appLinesOf(appChipSrc);
      final Map<String, String> declared = <String, String>{};
      for (int i = iconsAt.line; i < chipLines.length; i++) {
        if (chipLines[i] == '};') break;
        final RegExpMatch? entry = RegExp(r'^  ([a-z]+): ([A-Z][A-Za-z]*),$')
            .firstMatch(chipLines[i]);
        if (entry == null) {
          throw StateError(
            'CATEGORY_ICONS has a line this test cannot parse: "${chipLines[i]}"',
          );
        }
        expect(
          declared.containsKey(entry.group(1)),
          isFalse,
          reason:
              '${entry.group(1)} is keyed twice, so the port’s map would '
              'have to pick one',
        );
        declared[entry.group(1)!] = entry.group(2)!;
      }
      expect(declared, isNotEmpty);

      expect(
        AppCategoryChips.glyphSymbols.keys.toSet(),
        declared.keys.toSet(),
        reason: 'one Dart symbol per category the component maps, no more',
      );
      for (final MapEntry<String, String> entry in declared.entries) {
        final ({String slug, String dart})? hit = iconMap[entry.value];
        expect(
          hit,
          isNotNull,
          reason:
              'icon-map.tsv records no Lucide symbol for ${entry.value}, which '
              'CategoryChip paints for ${entry.key}',
        );
        expect(
          AppCategoryChips.glyphSymbols[entry.key],
          hit!.dart,
          reason:
              '${entry.key}: the web paints ${entry.value}, and the map’s dart '
              'column is the only route to a Flutter symbol',
        );
        expect(
          entry.key,
          entry.key.toLowerCase(),
          reason:
              '${entry.key}: the table is keyed by the normalised name the '
              'component looks a glyph up with',
        );
      }

      final ({int line, String text}) fallbackAt = appSourceLine(
        appChipSrc,
        RegExp(r'iconOverride \?\? CATEGORY_ICONS\[key\] \?\?'),
      );
      final RegExpMatch fallback = RegExp(r'\?\? ([A-Z][A-Za-z]*);')
          .firstMatch(fallbackAt.text)!;
      expect(
        AppCategoryChips.fallbackGlyphSymbol,
        iconMap[fallback.group(1)!]!.dart,
        reason:
            'the unlisted fallback is the same ${fallback.group(1)} the '
            'component falls back to, named the same way',
      );
      expect(
        AppCategoryChips.glyphSymbols.containsValue(
          AppCategoryChips.fallbackGlyphSymbol,
        ),
        isTrue,
        reason:
            'and it is a glyph the table already paints, so nothing '
            'unverified reaches a row',
      );
    });

    test(
      'the arrow: one line, two names, and a size the icon prop carries',
      () {
        final Map<String, ({String slug, String dart})> iconMap = appIconMap();
        final ({int line, String text}) arrowAt = appRecordLine(
          'txrow-arrow-sizes',
          RegExp(r'^\{isIncome \?'),
        );
        expect(
          appLineAt(appRowSrc, arrowAt.line).trim(),
          arrowAt.text,
          reason: 'the frozen arrow line is still the line the record cites',
        );
        final RegExpMatch arms = RegExp(
          r'^\{isIncome \? <(\w+) size=\{([\d.]+)\} /> : <(\w+) size=\{([\d.]+)\} />\}$',
        ).firstMatch(arrowAt.text)!;
        expect(
          arms.group(1),
          AppRows.arrowInName,
          reason: 'income leads with the arrow in',
        );
        expect(arms.group(3), AppRows.arrowOutName);
        expect(
          double.parse(arms.group(2)!),
          AppRows.arrowSizePx,
          reason: 'the size is the lucide `size` prop, not a CSS length',
        );
        expect(
          double.parse(arms.group(4)!),
          AppRows.arrowSizePx,
          reason: 'and both arms ask for the same box, so one field carries it',
        );
        expect(
          AppRows.arrowInSymbol,
          iconMap[AppRows.arrowInName]!.dart,
          reason: 'named through the icon map, as every other glyph is',
        );
        expect(AppRows.arrowOutSymbol, iconMap[AppRows.arrowOutName]!.dart);
        final List<int> armLines = <int>[];
        for (final String row in <String>[
          'txrow-amount-in',
          'txrow-amount-out',
        ]) {
          for (final dynamic e in appRow(row)['parts']! as List<dynamic>) {
            final Map<String, dynamic> part = e as Map<String, dynamic>;
            final Object? at = part['line'];
            if (at != null) armLines.add((at as num).toInt());
            for (final dynamic s
                in (part['styleSrc'] ?? const <dynamic>[]) as List<dynamic>) {
              final Object? line = (s as Map<String, dynamic>)['line'];
              if (line != null) armLines.add((line as num).toInt());
            }
          }
        }
        expect(
          arrowAt.line,
          greaterThan(armLines.reduce((int a, int b) => a > b ? a : b)),
          reason:
              'and the arrow is authored after both arms it renders inside, in '
              'the same file, which is why it sits on the money baseline',
        );
      },
    );

    /// The inline style one chip row froze, split into the recipe it is: one
    /// square, one tone token, and the two `color-mix`es that answer in oklab.
    ({
      double borderWidth,
      double borderPercent,
      String borderToken,
      double fillPercent,
      String fillToken,
      String inkToken,
      double side,
      String toneToken,
    })
    appChipRecipe(String rowName) {
      final RegExpMatch? m = RegExp(
        r'^width: ([\d.]+)px; height: \1px; '
        r'background: color-mix\(in oklab, var\((--[a-z0-9-]+)\) ([\d.]+)%, '
        r'var\((--[a-z0-9-]+)\)\); '
        r'border: ([\d.]+)px solid color-mix\(in oklab, '
        r'var\((--[a-z0-9-]+)\) ([\d.]+)%, var\((--[a-z0-9-]+)\)\); '
        r'color: var\((--[a-z0-9-]+)\)$',
      ).firstMatch(appRowPart(rowName)['style']! as String);
      if (m == null) {
        throw StateError(
          '$rowName: the inline style is no longer the one colour-mix recipe '
          'this port reads: "${appRowPart(rowName)['style']}"',
        );
      }
      return (
        side: double.parse(m.group(1)!),
        toneToken: m.group(2)!,
        fillPercent: double.parse(m.group(3)!),
        fillToken: m.group(4)!,
        borderWidth: double.parse(m.group(5)!),
        // group 6 is the tone token again, which the assert below re-checks
        borderPercent: double.parse(m.group(7)!),
        borderToken: m.group(8)!,
        inkToken: m.group(9)!,
      );
    }

    test('the tints: one oklab recipe, six tones, two themes', () {
      for (final Brightness brightness in Brightness.values) {
        final String prefix = brightness == Brightness.light ? 'light' : 'dark';
        final Map<AppChipTone, AppCategoryChipTintSpec> table =
            brightness == Brightness.light
            ? AppCategoryChips.light
            : AppCategoryChips.dark;
        expect(
          table.keys.toSet(),
          AppChipTone.values.toSet(),
          reason:
              '$prefix: every tone of the union is painted at this '
              'brightness, including the neutral ink',
        );
        final Set<Color> fills = <Color>{};
        final Set<Color> borders = <Color>{};
        for (final MapEntry<AppChipTone, AppCategoryChipTintSpec> entry
            in table.entries) {
          final AppChipTone tone = entry.key;
          final AppCategoryChipTintSpec spec = entry.value;
          final String rowName = 'cat-chip-md-${tone.name}';
          expect(
            spec.tone,
            tone,
            reason: 'the map is keyed by the tone it carries',
          );
          expect(
            AppCategoryChips.tint(tone, brightness),
            spec,
            reason: '$rowName: and the accessor hands back the same row',
          );
          expect(
            AppCategoryChips.tint(
              tone,
              brightness == Brightness.light
                  ? Brightness.dark
                  : Brightness.light,
            ).tone,
            tone,
            reason: '$rowName: the other brightness answers the same tone',
          );
          expect(spec.rowName, rowName);
          expect(spec.cssClasses, appCls(rowName));

          final recipe = appChipRecipe(rowName);
          expect(
            recipe.toneToken,
            tone.toneToken,
            reason: '$rowName: the style mixes the token the enum names',
          );
          expect(spec.mixFillPercent, recipe.fillPercent);
          expect(spec.mixFillWithToken, recipe.fillToken);
          expect(spec.mixBorderPercent, recipe.borderPercent);
          expect(spec.mixBorderWithToken, recipe.borderToken);
          expect(
            recipe.fillToken,
            '--surface',
            reason:
                '$rowName: the pastel is mixed toward the surface it '
                'sits on, which the theme sets',
          );
          expect(
            recipe.borderToken,
            '--line',
            reason: '$rowName: and the frame toward the hairline',
          );
          expect(spec.borderWidthPx, recipe.borderWidth);
          expect(spec.sidePx, recipe.side);

          for (final String pass in <String>[
            '$prefix-desktop',
            '$prefix-phone',
          ]) {
            expect(
              appPx(pass, rowName, 'width'),
              spec.sidePx,
              reason: '$pass $rowName: the square the row measured',
            );
            expect(
              appPx(pass, rowName, 'height'),
              spec.sidePx,
              reason: '$pass $rowName: and it is square at both viewports',
            );
            expect(
              appColour(pass, rowName, 'backgroundColor'),
              spec.fillColor,
              reason:
                  '$pass $rowName: the port carries the sRGB answer to '
                  'the mix Chrome resolved',
            );
            expect(
              appVal(pass, rowName, 'backgroundColor'),
              startsWith('oklab('),
              reason:
                  '$pass $rowName: the computed fill really is an oklab '
                  'colour — the port flattened it, it did not choose it',
            );
            expect(
              appColour(pass, rowName, 'borderTopColor'),
              spec.borderColor,
              reason: '$pass $rowName: same for the frame',
            );
            expect(
              appPx(pass, rowName, 'borderTopWidth'),
              spec.borderWidthPx,
              reason: '$pass $rowName: one hairline, authored and measured',
            );
            expect(
              appColour(pass, rowName, 'color'),
              spec.iconColor,
              reason: '$pass $rowName: the glyph paints the row ink',
            );
            expect(
              spec.iconColor,
              appTokenColour(pass, recipe.inkToken),
              reason:
                  '$pass $rowName: and the row ink is the ${recipe.inkToken} '
                  'token, which the style declares rather than a pastel',
            );
            expect(
              spec.fillColor,
              isNot(appTokenColour(pass, tone.toneToken)),
              reason:
                  '$pass $rowName: the mix moved off the bare token, so a '
                  'port that painted the token would paint something else',
            );
            expect(
              spec.borderColor,
              isNot(spec.fillColor),
              reason: '$pass $rowName: the frame is not the fill',
            );
          }
          expect(
            spec.fillColor,
            isNot(
              AppCategoryChips.tint(
                tone,
                brightness == Brightness.light
                    ? Brightness.dark
                    : Brightness.light,
              ).fillColor,
            ),
            reason: '$rowName: and the theme moves the fill',
          );
          fills.add(spec.fillColor);
          borders.add(spec.borderColor);
        }
        expect(
          fills.length,
          table.length,
          reason:
              '$prefix: no two tones land on the same fill, so a cycle of '
              'five pastels and one neutral is six distinguishable chips',
        );
        expect(borders.length, table.length);
      }

      final Set<double> fillPercents = AppChipTone.values
          .map(
            (AppChipTone t) =>
                appChipRecipe('cat-chip-md-${t.name}').fillPercent,
          )
          .toSet();
      final Set<double> borderPercents = AppChipTone.values
          .map(
            (AppChipTone t) =>
                appChipRecipe('cat-chip-md-${t.name}').borderPercent,
          )
          .toSet();
      expect(fillPercents, <double>{
        AppCategoryChips.light[AppChipTone.pink]!.mixFillPercent,
      }, reason: 'one fill percentage for the whole family, not one per tone');
      expect(borderPercents, <double>{
        AppCategoryChips.light[AppChipTone.pink]!.mixBorderPercent,
      });

      for (final Brightness brightness in Brightness.values) {
        expect(
          AppRows.txRow(brightness),
          brightness == Brightness.light
              ? AppRows.txRowLight
              : AppRows.txRowDark,
        );
        expect(
          AppRows.dayHead(brightness),
          brightness == Brightness.light
              ? AppRows.dayHeadLight
              : AppRows.dayHeadDark,
        );
        expect(
          AppRows.divider(brightness),
          brightness == Brightness.light
              ? AppRows.dividerLight
              : AppRows.dividerDark,
        );
        expect(
          AppRows.empty(brightness),
          brightness == Brightness.light
              ? AppRows.emptyLight
              : AppRows.emptyDark,
        );
        expect(
          AppRows.emptyRc(brightness),
          brightness == Brightness.light
              ? AppRows.emptyRcLight
              : AppRows.emptyRcDark,
        );
      }
    });

    /// The completeness pass. B1–B15 each re-read the handful of lines a claim
    /// rests on; this one walks *every* line every authored record cites and
    /// compares it against the text the probe froze, so a rewritten or moved
    /// source line fails here with its `file:line` named even if no assertion
    /// downstream happens to read it. The ledger's share is pinned line by line;
    /// the chrome families #55 and #56 are pinned by file and count, because the
    /// ledger is what this port reads and the rest is what it must not.
    test('the citations: every authored line, re-read from the file it names', () {
      const Map<String, List<int>> ledgerCited = <String, List<int>>{
        appDashSrc: <int>[294, 296, 409, 411, 422, 426, 428, 429, 437],
        appRcSrc: <int>[494, 496, 501, 504, 505, 518, 522],
        appChipSrc: <int>[23, 63, 65, 66, 67, 68, 72, 84, 85, 86, 100],
        appRowSrc: <int>[33, 41],
        appCssSrc: <int>[917],
      };
      const Map<String, int> chromeCited = <String, int>{
        'src/context/NotificationContext.tsx': 12,
        'src/components/ui/Modal.tsx': 14,
        'src/components/ui/BottomSheet.tsx': 11,
        'src/components/dashboard/QuickActionModal.tsx': 7,
        'src/components/DebtDetailModal.tsx': 3,
        'src/components/TransactionEditModal.tsx': 6,
        'src/components/SettingsModal.tsx': 8,
      };
      final Map<String, List<int>> ledgerRead = <String, List<int>>{};
      final Map<String, int> chromeRead = <String, int>{};
      final Set<String> expressions = <String>{};
      int records = 0;
      int parts = 0;
      for (final dynamic e in appStacks['authoredNonCss']! as List<dynamic>) {
        final Map<String, dynamic> rec = e as Map<String, dynamic>;
        final String name = rec['name']! as String;
        final List<dynamic> recParts = rec['parts']! as List<dynamic>;
        expect(
          recParts,
          isNotEmpty,
          reason: '$name cites nothing, so there is nothing here to re-read',
        );
        records++;
        for (final dynamic p in recParts) {
          final Map<String, dynamic> part = p as Map<String, dynamic>;
          final String src =
              (part['src'] ?? rec['src'] ?? appStacks['source'])! as String;
          final int line = (part['line']! as num).toInt();
          final String frozen = part['text']!.trim() as String;
          expect(
            frozen,
            isNotEmpty,
            reason: '$name carries a blank part at $src:$line',
          );
          final String onDisk = appLineAt(src, line).trim();
          expect(
            onDisk,
            contains(frozen),
            reason:
                '$name says $src:$line reads "$frozen". The web source on disk '
                'no longer says that, so whatever the port built from this '
                'record was built from a line that has moved.',
          );
          if (onDisk != frozen) expressions.add('$src:$line');
          parts++;
          if (ledgerCited.containsKey(src)) {
            ledgerRead.putIfAbsent(src, () => <int>[]).add(line);
          } else {
            chromeRead.update(src, (int n) => n + 1, ifAbsent: () => 1);
          }
        }
      }
      expect(
        records,
        26,
        reason: 'the whole authored array, not the ledger slice',
      );
      expect(parts, 91);
      expect(
        expressions,
        <String>{
          'src/context/NotificationContext.tsx:94',
          'src/context/NotificationContext.tsx:95',
          'src/context/NotificationContext.tsx:96',
          'src/context/NotificationContext.tsx:97',
          'src/context/NotificationContext.tsx:103',
          'src/components/ui/Modal.tsx:86',
          'src/components/ui/BottomSheet.tsx:58',
          '$appDashSrc:409',
        },
        reason:
            'the eight parts frozen as an expression rather than a whole line — '
            'a JSX prop or an interpolated text node inside a longer element. '
            'Everything else quotes its line end to end, so this is the only '
            'slack in the table and it is named here.',
      );
      expect(
        ledgerRead.keys.toSet(),
        ledgerCited.keys.toSet(),
        reason:
            'the ledger was read from the row, the chip, the dashboard, the '
            'reports centre and one stylesheet rule — nothing else',
      );
      for (final MapEntry<String, List<int>> entry in ledgerCited.entries) {
        expect(
          ledgerRead[entry.key]!..sort(),
          entry.value,
          reason: '${entry.key} is cited at exactly these lines',
        );
      }
      expect(
        chromeRead.keys.toSet(),
        chromeCited.keys.toSet(),
        reason: 'and every remaining citation belongs to a chrome family',
      );
      for (final MapEntry<String, int> entry in chromeCited.entries) {
        expect(
          chromeRead[entry.key],
          entry.value,
          reason: '${entry.key} is cited by that many lines',
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
