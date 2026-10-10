// GENERATED — do not edit by hand.
// Produced by `node parity/generate_theme.cjs` from `parity/ui-tokens.json`, the
// Chrome-computed measurement of `src/index.css` at tag `pre-flutter`, with the
// curated token lists and phone markers of `parity/UI_SPEC.md` §2.1–§4.
// Every value below is the measurement; UI_SPEC §5 (whose machine "Dart" column
// mis-parses --blur-* / --container-* names as radii) is deliberately not used.

import 'package:flutter/material.dart';

/// The 90 colour tokens of UI_SPEC §2.1 and the 17 gradient tokens of §2.2,
/// exactly as Chrome computed them for `src/index.css`. Names are the CSS custom
/// property minus `--`, camel-cased, so any constant traces back to index.css;
/// `lightByToken`/`darkByToken` key the constants by the original `--name`.
abstract final class AppColors {
  /// `--accent` — authored `oklch(21% 0.032 258) / oklch(97% 0.005 260)` (UI_SPEC §2.1).
  static const Color accentLight = Color.fromRGBO(15, 25, 39, 1.0);
  static const Color accentDark = Color.fromRGBO(243, 245, 249, 1.0);

  /// `--accent-fg` — authored `oklch(99% 0.004 255) / oklch(15% 0.02 256)` (UI_SPEC §2.1).
  static const Color accentFgLight = Color.fromRGBO(250, 252, 254, 1.0);
  static const Color accentFgDark = Color.fromRGBO(6, 11, 20, 1.0);

  /// `--bg` — authored `oklch(96.5% 0.008 250) / oklch(13% 0.022 255)` (UI_SPEC §2.1).
  static const Color bgLight = Color.fromRGBO(239, 244, 249, 1.0);
  static const Color bgDark = Color.fromRGBO(3, 8, 16, 1.0);

  /// `--bg-2` — authored `oklch(93% 0.012 252) / oklch(16.5% 0.024 257)` (UI_SPEC §2.1).
  static const Color bg2Light = Color.fromRGBO(226, 233, 240, 1.0);
  static const Color bg2Dark = Color.fromRGBO(8, 15, 25, 1.0);

  /// `--chip-gold` — authored `oklch(78% 0.13 85)` (UI_SPEC §2.1).
  static const Color chipGold = Color.fromRGBO(221, 176, 73, 1.0);

  /// `--chip-gold-deep` — authored `oklch(62% 0.13 70)` (UI_SPEC §2.1).
  static const Color chipGoldDeep = Color.fromRGBO(183, 118, 17, 1.0);

  /// `--color-amber-100` — authored `oklch(96.2% 0.059 95.617)` (UI_SPEC §2.1).
  static const Color colorAmber100 = Color.fromRGBO(254, 243, 198, 1.0);

  /// `--color-amber-200` — authored `oklch(92.4% 0.12 95.746)` (UI_SPEC §2.1).
  static const Color colorAmber200 = Color.fromRGBO(254, 230, 133, 1.0);

  /// `--color-amber-400` — authored `oklch(82.8% 0.189 84.429)` (UI_SPEC §2.1).
  static const Color colorAmber400 = Color.fromRGBO(255, 185, 0, 1.0);

  /// `--color-amber-500` — authored `oklch(76.9% 0.188 70.08)` (UI_SPEC §2.1).
  static const Color colorAmber500 = Color.fromRGBO(254, 154, 0, 1.0);

  /// `--color-amber-600` — authored `oklch(66.6% 0.179 58.318)` (UI_SPEC §2.1).
  static const Color colorAmber600 = Color.fromRGBO(225, 113, 0, 1.0);

  /// `--color-amber-700` — authored `oklch(55.5% 0.163 48.998)` (UI_SPEC §2.1).
  static const Color colorAmber700 = Color.fromRGBO(187, 77, 0, 1.0);

  /// `--color-black` — authored `#000` (UI_SPEC §2.1).
  static const Color colorBlack = Color.fromRGBO(0, 0, 0, 1.0);

  /// `--color-blue-200` — authored `oklch(88.2% 0.059 254.128)` (UI_SPEC §2.1).
  static const Color colorBlue200 = Color.fromRGBO(190, 219, 255, 1.0);

  /// `--color-blue-400` — authored `oklch(70.7% 0.165 254.624)` (UI_SPEC §2.1).
  static const Color colorBlue400 = Color.fromRGBO(80, 162, 255, 1.0);

  /// `--color-blue-50` — authored `oklch(97% 0.014 254.604)` (UI_SPEC §2.1).
  static const Color colorBlue50 = Color.fromRGBO(239, 246, 255, 1.0);

  /// `--color-blue-500` — authored `oklch(62.3% 0.214 259.815)` (UI_SPEC §2.1).
  static const Color colorBlue500 = Color.fromRGBO(43, 127, 255, 1.0);

  /// `--color-blue-600` — authored `oklch(54.6% 0.245 262.881)` (UI_SPEC §2.1).
  static const Color colorBlue600 = Color.fromRGBO(21, 93, 252, 1.0);

  /// `--color-blue-900` — authored `oklch(37.9% 0.146 265.522)` (UI_SPEC §2.1).
  static const Color colorBlue900 = Color.fromRGBO(28, 57, 142, 1.0);

  /// `--color-blue-950` — authored `oklch(28.2% 0.091 267.935)` (UI_SPEC §2.1).
  static const Color colorBlue950 = Color.fromRGBO(22, 37, 86, 1.0);

  /// `--color-emerald-100` — authored `oklch(95% 0.052 163.051)` (UI_SPEC §2.1).
  static const Color colorEmerald100 = Color.fromRGBO(208, 250, 229, 1.0);

  /// `--color-emerald-200` — authored `oklch(90.5% 0.093 164.15)` (UI_SPEC §2.1).
  static const Color colorEmerald200 = Color.fromRGBO(164, 244, 207, 1.0);

  /// `--color-emerald-300` — authored `oklch(84.5% 0.143 164.978)` (UI_SPEC §2.1).
  static const Color colorEmerald300 = Color.fromRGBO(94, 233, 181, 1.0);

  /// `--color-emerald-400` — authored `oklch(76.5% 0.177 163.223)` (UI_SPEC §2.1).
  static const Color colorEmerald400 = Color.fromRGBO(0, 212, 146, 1.0);

  /// `--color-emerald-50` — authored `oklch(97.9% 0.021 166.113)` (UI_SPEC §2.1).
  static const Color colorEmerald50 = Color.fromRGBO(236, 253, 245, 1.0);

  /// `--color-emerald-500` — authored `oklch(69.6% 0.17 162.48)` (UI_SPEC §2.1).
  static const Color colorEmerald500 = Color.fromRGBO(0, 188, 125, 1.0);

  /// `--color-emerald-600` — authored `oklch(59.6% 0.145 163.225)` (UI_SPEC §2.1).
  static const Color colorEmerald600 = Color.fromRGBO(0, 153, 102, 1.0);

  /// `--color-emerald-700` — authored `oklch(50.8% 0.118 165.612)` (UI_SPEC §2.1).
  static const Color colorEmerald700 = Color.fromRGBO(0, 122, 85, 1.0);

  /// `--color-emerald-900` — authored `oklch(37.8% 0.077 168.94)` (UI_SPEC §2.1).
  static const Color colorEmerald900 = Color.fromRGBO(0, 79, 59, 1.0);

  /// `--color-emerald-950` — authored `oklch(26.2% 0.051 172.552)` (UI_SPEC §2.1).
  static const Color colorEmerald950 = Color.fromRGBO(0, 44, 34, 1.0);

  /// `--color-indigo-400` — authored `oklch(67.3% 0.182 276.935)` (UI_SPEC §2.1).
  static const Color colorIndigo400 = Color.fromRGBO(124, 134, 255, 1.0);

  /// `--color-neutral-600` — authored `oklch(43.9% 0 0)` (UI_SPEC §2.1).
  static const Color colorNeutral600 = Color.fromRGBO(82, 82, 82, 1.0);

  /// `--color-orange-400` — authored `oklch(75% 0.183 55.934)` (UI_SPEC §2.1).
  static const Color colorOrange400 = Color.fromRGBO(255, 137, 4, 1.0);

  /// `--color-orange-500` — authored `oklch(70.5% 0.213 47.604)` (UI_SPEC §2.1).
  static const Color colorOrange500 = Color.fromRGBO(255, 105, 0, 1.0);

  /// `--color-purple-500` — authored `oklch(62.7% 0.265 303.9)` (UI_SPEC §2.1).
  static const Color colorPurple500 = Color.fromRGBO(173, 70, 255, 1.0);

  /// `--color-red-300` — authored `oklch(80.8% 0.114 19.571)` (UI_SPEC §2.1).
  static const Color colorRed300 = Color.fromRGBO(255, 162, 162, 1.0);

  /// `--color-red-400` — authored `oklch(70.4% 0.191 22.216)` (UI_SPEC §2.1).
  static const Color colorRed400 = Color.fromRGBO(255, 100, 103, 1.0);

  /// `--color-red-500` — authored `oklch(63.7% 0.237 25.331)` (UI_SPEC §2.1).
  static const Color colorRed500 = Color.fromRGBO(251, 44, 54, 1.0);

  /// `--color-red-900` — authored `oklch(39.6% 0.141 25.723)` (UI_SPEC §2.1).
  static const Color colorRed900 = Color.fromRGBO(130, 24, 26, 1.0);

  /// `--color-red-950` — authored `oklch(25.8% 0.092 26.042)` (UI_SPEC §2.1).
  static const Color colorRed950 = Color.fromRGBO(70, 8, 9, 1.0);

  /// `--color-rose-200` — authored `oklch(89.2% 0.058 10.001)` (UI_SPEC §2.1).
  static const Color colorRose200 = Color.fromRGBO(255, 204, 211, 1.0);

  /// `--color-rose-400` — authored `oklch(71.2% 0.194 13.428)` (UI_SPEC §2.1).
  static const Color colorRose400 = Color.fromRGBO(255, 99, 126, 1.0);

  /// `--color-rose-50` — authored `oklch(96.9% 0.015 12.422)` (UI_SPEC §2.1).
  static const Color colorRose50 = Color.fromRGBO(255, 241, 242, 1.0);

  /// `--color-rose-500` — authored `oklch(64.5% 0.246 16.439)` (UI_SPEC §2.1).
  static const Color colorRose500 = Color.fromRGBO(255, 32, 86, 1.0);

  /// `--color-rose-600` — authored `oklch(58.6% 0.253 17.585)` (UI_SPEC §2.1).
  static const Color colorRose600 = Color.fromRGBO(236, 0, 63, 1.0);

  /// `--color-rose-900` — authored `oklch(41% 0.159 10.272)` (UI_SPEC §2.1).
  static const Color colorRose900 = Color.fromRGBO(139, 8, 54, 1.0);

  /// `--color-rose-950` — authored `oklch(27.1% 0.105 12.094)` (UI_SPEC §2.1).
  static const Color colorRose950 = Color.fromRGBO(77, 2, 24, 1.0);

  /// `--color-sky-500` — authored `oklch(68.5% 0.169 237.323)` (UI_SPEC §2.1).
  static const Color colorSky500 = Color.fromRGBO(0, 166, 244, 1.0);

  /// `--color-slate-500` — authored `oklch(55.4% 0.046 257.417)` (UI_SPEC §2.1).
  static const Color colorSlate500 = Color.fromRGBO(98, 116, 142, 1.0);

  /// `--color-teal-400` — authored `oklch(77.7% 0.152 181.912)` (UI_SPEC §2.1).
  static const Color colorTeal400 = Color.fromRGBO(0, 213, 190, 1.0);

  /// `--color-violet-600` — authored `oklch(54.1% 0.281 293.009)` (UI_SPEC §2.1).
  static const Color colorViolet600 = Color.fromRGBO(127, 34, 254, 1.0);

  /// `--color-white` — authored `#fff` (UI_SPEC §2.1).
  static const Color colorWhite = Color.fromRGBO(255, 255, 255, 1.0);

  /// `--color-yellow-400` — authored `oklch(85.2% 0.199 91.936)` (UI_SPEC §2.1).
  static const Color colorYellow400 = Color.fromRGBO(253, 199, 0, 1.0);

  /// `--color-yellow-500` — authored `oklch(79.5% 0.184 86.047)` (UI_SPEC §2.1).
  static const Color colorYellow500 = Color.fromRGBO(240, 177, 0, 1.0);

  /// `--color-zinc-400` — authored `oklch(70.5% 0.015 286.067)` (UI_SPEC §2.1).
  static const Color colorZinc400 = Color.fromRGBO(159, 159, 169, 1.0);

  /// `--danger` — authored `oklch(56% 0.19 20) / oklch(70% 0.15 15)` (UI_SPEC §2.1).
  static const Color dangerLight = Color.fromRGBO(204, 49, 67, 1.0);
  static const Color dangerDark = Color.fromRGBO(236, 115, 128, 1.0);

  /// `--danger-bg` — authored `oklch(56% 0.19 20 / 0.09) / oklch(70% 0.15 15 / 0.14)` (UI_SPEC §2.1).
  static const Color dangerBgLight = Color.fromRGBO(204, 49, 67, 0.09);
  static const Color dangerBgDark = Color.fromRGBO(236, 115, 128, 0.14);

  /// `--face-anchor` — authored `oklch(35% 0.04 260) / oklch(20% 0.03 258)` (UI_SPEC §2.1).
  static const Color faceAnchorLight = Color.fromRGBO(46, 59, 80, 1.0);
  static const Color faceAnchorDark = Color.fromRGBO(13, 22, 36, 1.0);

  /// `--glow` — authored `oklch(70% 0.13 250) / oklch(54% 0.15 252)` (UI_SPEC §2.1).
  static const Color glowLight = Color.fromRGBO(90, 163, 236, 1.0);
  static const Color glowDark = Color.fromRGBO(24, 112, 194, 1.0);

  /// `--glow-2` — authored `oklch(76% 0.09 268) / oklch(48% 0.13 268)` (UI_SPEC §2.1).
  static const Color glow2Light = Color.fromRGBO(152, 175, 235, 1.0);
  static const Color glow2Dark = Color.fromRGBO(62, 87, 166, 1.0);

  /// `--hero-deep` — authored `oklch(26% 0.028 260) / oklch(14% 0.025 258)` (UI_SPEC §2.1).
  static const Color heroDeepLight = Color.fromRGBO(28, 36, 50, 1.0);
  static const Color heroDeepDark = Color.fromRGBO(4, 9, 19, 1.0);

  /// `--hue-amber` — authored `oklch(75% 0.14 80)` (UI_SPEC §2.1).
  static const Color hueAmber = Color.fromRGBO(220, 163, 49, 1.0);

  /// `--hue-blue` — authored `oklch(62% 0.15 255)` (UI_SPEC §2.1).
  static const Color hueBlue = Color.fromRGBO(64, 135, 222, 1.0);

  /// `--hue-cyan` — authored `oklch(72% 0.11 215)` (UI_SPEC §2.1).
  static const Color hueCyan = Color.fromRGBO(61, 182, 207, 1.0);

  /// `--hue-emerald` — authored `oklch(69% 0.14 160)` (UI_SPEC §2.1).
  static const Color hueEmerald = Color.fromRGBO(50, 181, 125, 1.0);

  /// `--hue-indigo` — authored `oklch(55% 0.18 280)` (UI_SPEC §2.1).
  static const Color hueIndigo = Color.fromRGBO(97, 94, 214, 1.0);

  /// `--hue-mint` — authored `oklch(80% 0.1 160)` (UI_SPEC §2.1).
  static const Color hueMint = Color.fromRGBO(130, 210, 168, 1.0);

  /// `--hue-orange` — authored `oklch(70% 0.16 45)` (UI_SPEC §2.1).
  static const Color hueOrange = Color.fromRGBO(237, 121, 64, 1.0);

  /// `--hue-rose` — authored `oklch(65% 0.17 15)` (UI_SPEC §2.1).
  static const Color hueRose = Color.fromRGBO(227, 91, 109, 1.0);

  /// `--hue-slate` — authored `oklch(60% 0.03 265)` (UI_SPEC §2.1).
  static const Color hueSlate = Color.fromRGBO(119, 128, 147, 1.0);

  /// `--hue-teal` — authored `oklch(72% 0.12 185)` (UI_SPEC §2.1).
  static const Color hueTeal = Color.fromRGBO(38, 189, 174, 1.0);

  /// `--hue-violet` — authored `oklch(62% 0.15 300)` (UI_SPEC §2.1).
  static const Color hueViolet = Color.fromRGBO(149, 110, 210, 1.0);

  /// `--ink` — authored `oklch(20% 0.03 258) / oklch(98% 0.004 260)` (UI_SPEC §2.1).
  static const Color inkLight = Color.fromRGBO(13, 22, 36, 1.0);
  static const Color inkDark = Color.fromRGBO(247, 248, 251, 1.0);

  /// `--ink-2` — authored `oklch(45% 0.035 258) / oklch(74% 0.022 258)` (UI_SPEC §2.1).
  static const Color ink2Light = Color.fromRGBO(73, 86, 105, 1.0);
  static const Color ink2Dark = Color.fromRGBO(162, 172, 185, 1.0);

  /// `--ink-3` — authored `oklch(62% 0.03 258) / oklch(55% 0.03 258)` (UI_SPEC §2.1).
  static const Color ink3Light = Color.fromRGBO(123, 135, 153, 1.0);
  static const Color ink3Dark = Color.fromRGBO(103, 114, 131, 1.0);

  /// `--line` — authored `oklch(90% 0.012 252) / oklch(27.5% 0.022 258)` (UI_SPEC §2.1).
  static const Color lineLight = Color.fromRGBO(216, 223, 230, 1.0);
  static const Color lineDark = Color.fromRGBO(33, 40, 51, 1.0);

  /// `--line-strong` — authored `oklch(82% 0.018 252) / oklch(36% 0.026 260)` (UI_SPEC §2.1).
  static const Color lineStrongLight = Color.fromRGBO(188, 197, 208, 1.0);
  static const Color lineStrongDark = Color.fromRGBO(53, 62, 75, 1.0);

  /// `--pastel-blue` — authored `oklch(84% 0.06 240) / oklch(78% 0.09 240)` (UI_SPEC §2.1).
  static const Color pastelBlueLight = Color.fromRGBO(168, 209, 238, 1.0);
  static const Color pastelBlueDark = Color.fromRGBO(129, 191, 235, 1.0);

  /// `--pastel-lavender` — authored `oklch(83% 0.06 285) / oklch(78% 0.09 285)` (UI_SPEC §2.1).
  static const Color pastelLavenderLight = Color.fromRGBO(195, 195, 238, 1.0);
  static const Color pastelLavenderDark = Color.fromRGBO(177, 176, 239, 1.0);

  /// `--pastel-mint` — authored `oklch(89% 0.06 155) / oklch(84% 0.09 155)` (UI_SPEC §2.1).
  static const Color pastelMintLight = Color.fromRGBO(188, 231, 202, 1.0);
  static const Color pastelMintDark = Color.fromRGBO(155, 220, 177, 1.0);

  /// `--pastel-pink` — authored `oklch(81% 0.08 10) / oklch(78% 0.11 10)` (UI_SPEC §2.1).
  static const Color pastelPinkLight = Color.fromRGBO(239, 172, 181, 1.0);
  static const Color pastelPinkDark = Color.fromRGBO(244, 153, 167, 1.0);

  /// `--pastel-yellow` — authored `oklch(91% 0.08 95) / oklch(86% 0.11 95)` (UI_SPEC §2.1).
  static const Color pastelYellowLight = Color.fromRGBO(242, 225, 165, 1.0);
  static const Color pastelYellowDark = Color.fromRGBO(231, 209, 122, 1.0);

  /// `--rim` — authored `oklch(100% 0 0 / 0.6) / oklch(100% 0 0 / 0.07)` (UI_SPEC §2.1).
  static const Color rimLight = Color.fromRGBO(255, 255, 255, 0.6);
  static const Color rimDark = Color.fromRGBO(255, 255, 255, 0.07);

  /// `--success` — authored `oklch(56% 0.14 158) / oklch(80% 0.145 165)` (UI_SPEC §2.1).
  static const Color successLight = Color.fromRGBO(0, 140, 83, 1.0);
  static const Color successDark = Color.fromRGBO(73, 219, 166, 1.0);

  /// `--success-bg` — authored `oklch(56% 0.14 158 / 0.11) / oklch(80% 0.145 165 / 0.14)` (UI_SPEC §2.1).
  static const Color successBgLight = Color.fromRGBO(0, 140, 83, 0.11);
  static const Color successBgDark = Color.fromRGBO(73, 219, 166, 0.14);

  /// `--surface` — authored `oklch(99.5% 0.004 255) / oklch(19.5% 0.022 258)` (UI_SPEC §2.1).
  static const Color surfaceLight = Color.fromRGBO(252, 254, 255, 1.0);
  static const Color surfaceDark = Color.fromRGBO(15, 21, 31, 1.0);

  /// `--surface-2` — authored `oklch(95.5% 0.01 252) / oklch(24% 0.024 259)` (UI_SPEC §2.1).
  static const Color surface2Light = Color.fromRGBO(235, 241, 247, 1.0);
  static const Color surface2Dark = Color.fromRGBO(24, 32, 43, 1.0);

  /// `--surface-3` — authored `oklch(91.5% 0.014 250) / oklch(29% 0.026 260)` (UI_SPEC §2.1).
  static const Color surface3Light = Color.fromRGBO(220, 228, 236, 1.0);
  static const Color surface3Dark = Color.fromRGBO(36, 44, 56, 1.0);

  /// `--warning` — authored `oklch(60% 0.13 75) / oklch(78% 0.125 78)` (UI_SPEC §2.1).
  static const Color warningLight = Color.fromRGBO(173, 115, 0, 1.0);
  static const Color warningDark = Color.fromRGBO(227, 173, 82, 1.0);

  /// `--warning-bg` — authored `oklch(60% 0.13 75 / 0.13) / oklch(78% 0.125 78 / 0.15)` (UI_SPEC §2.1).
  static const Color warningBgLight = Color.fromRGBO(173, 115, 0, 0.13);
  static const Color warningBgDark = Color.fromRGBO(227, 173, 82, 0.15);

  // ------------------------------------------------------------- gradients (UI_SPEC §2.2)
  // LinearGradient built from the substituted stop colours. begin/end encode the CSS
  // angle: Alignment -+d*(|sin a|+|cos a|) along d=(sin a, -cos a), which reproduces
  // the CSS gradient line on a square box — see `gradientAlignments` in
  // parity/generate_theme.cjs.
  /// `--gradient-card-blue` — linear-gradient(135.0deg), stops resolved per pass (UI_SPEC §2.2).
  static const LinearGradient gradientCardBlueLight = LinearGradient(
    begin: Alignment(-1.0, -1.0),
    end: Alignment(1.0, 1.0),
    colors: <Color>[
      Color.fromRGBO(190, 224, 249, 1.0),
      Color.fromRGBO(200, 210, 253, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );
  static const LinearGradient gradientCardBlueDark = LinearGradient(
    begin: Alignment(-1.0, -1.0),
    end: Alignment(1.0, 1.0),
    colors: <Color>[
      Color.fromRGBO(36, 116, 207, 1.0),
      Color.fromRGBO(79, 72, 191, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );

  /// `--gradient-card-dark` — linear-gradient(170.0deg), stops resolved per pass (UI_SPEC §2.2).
  static const LinearGradient gradientCardDarkLight = LinearGradient(
    begin: Alignment(-0.20116376127, -1.140856382056),
    end: Alignment(0.20116376127, 1.140856382056),
    colors: <Color>[
      Color.fromRGBO(252, 254, 255, 1.0),
      Color.fromRGBO(235, 241, 247, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );
  static const LinearGradient gradientCardDarkDark = LinearGradient(
    begin: Alignment(-0.20116376127, -1.140856382056),
    end: Alignment(0.20116376127, 1.140856382056),
    colors: <Color>[
      Color.fromRGBO(24, 32, 43, 1.0),
      Color.fromRGBO(15, 21, 31, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );

  /// `--gradient-card-light` — linear-gradient(170.0deg), stops resolved per pass (UI_SPEC §2.2).
  static const LinearGradient gradientCardLightLight = LinearGradient(
    begin: Alignment(-0.20116376127, -1.140856382056),
    end: Alignment(0.20116376127, 1.140856382056),
    colors: <Color>[
      Color.fromRGBO(252, 254, 255, 1.0),
      Color.fromRGBO(235, 241, 247, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );
  static const LinearGradient gradientCardLightDark = LinearGradient(
    begin: Alignment(-0.20116376127, -1.140856382056),
    end: Alignment(0.20116376127, 1.140856382056),
    colors: <Color>[
      Color.fromRGBO(24, 32, 43, 1.0),
      Color.fromRGBO(15, 21, 31, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );

  /// `--gradient-card-orange` — linear-gradient(135.0deg), stops resolved per pass (UI_SPEC §2.2).
  static const LinearGradient gradientCardOrangeLight = LinearGradient(
    begin: Alignment(-1.0, -1.0),
    end: Alignment(1.0, 1.0),
    colors: <Color>[
      Color.fromRGBO(247, 201, 180, 1.0),
      Color.fromRGBO(252, 191, 194, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );
  static const LinearGradient gradientCardOrangeDark = LinearGradient(
    begin: Alignment(-1.0, -1.0),
    end: Alignment(1.0, 1.0),
    colors: <Color>[
      Color.fromRGBO(220, 99, 30, 1.0),
      Color.fromRGBO(217, 63, 90, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );

  /// `--gradient-nueva` — linear-gradient(180.0deg), stops resolved per pass (UI_SPEC §2.2).
  static const LinearGradient gradientNuevaLight = LinearGradient(
    begin: Alignment(0.0, -1.0),
    end: Alignment(0.0, 1.0),
    colors: <Color>[
      Color.fromRGBO(26, 36, 52, 1.0),
      Color.fromRGBO(8, 18, 32, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );
  static const LinearGradient gradientNuevaDark = LinearGradient(
    begin: Alignment(0.0, -1.0),
    end: Alignment(0.0, 1.0),
    colors: <Color>[
      Color.fromRGBO(243, 245, 249, 1.0),
      Color.fromRGBO(217, 226, 239, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );

  /// `--hero-amber` — linear-gradient(165.0deg), stops resolved per pass (UI_SPEC §2.2).
  static const LinearGradient heroAmberLight = LinearGradient(
    begin: Alignment(-0.316987298108, -1.183012701892),
    end: Alignment(0.316987298108, 1.183012701892),
    colors: <Color>[
      Color.fromRGBO(149, 118, 63, 1.0),
      Color.fromRGBO(114, 95, 63, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );
  static const LinearGradient heroAmberDark = LinearGradient(
    begin: Alignment(-0.316987298108, -1.183012701892),
    end: Alignment(0.316987298108, 1.183012701892),
    colors: <Color>[
      Color.fromRGBO(44, 40, 31, 1.0),
      Color.fromRGBO(14, 18, 21, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );

  /// `--hero-blue` — linear-gradient(165.0deg), stops resolved per pass (UI_SPEC §2.2).
  static const LinearGradient heroBlueLight = LinearGradient(
    begin: Alignment(-0.316987298108, -1.183012701892),
    end: Alignment(0.316987298108, 1.183012701892),
    colors: <Color>[
      Color.fromRGBO(55, 108, 173, 1.0),
      Color.fromRGBO(49, 89, 141, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );
  static const LinearGradient heroBlueDark = LinearGradient(
    begin: Alignment(-0.316987298108, -1.183012701892),
    end: Alignment(0.316987298108, 1.183012701892),
    colors: <Color>[
      Color.fromRGBO(19, 43, 73, 1.0),
      Color.fromRGBO(7, 20, 36, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );

  /// `--hero-cyan` — linear-gradient(165.0deg), stops resolved per pass (UI_SPEC §2.2).
  static const LinearGradient heroCyanLight = LinearGradient(
    begin: Alignment(-0.316987298108, -1.183012701892),
    end: Alignment(0.316987298108, 1.183012701892),
    colors: <Color>[
      Color.fromRGBO(55, 131, 153, 1.0),
      Color.fromRGBO(49, 105, 124, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );
  static const LinearGradient heroCyanDark = LinearGradient(
    begin: Alignment(-0.316987298108, -1.183012701892),
    end: Alignment(0.316987298108, 1.183012701892),
    colors: <Color>[
      Color.fromRGBO(17, 49, 62, 1.0),
      Color.fromRGBO(7, 21, 31, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );

  /// `--hero-emerald` — linear-gradient(165.0deg), stops resolved per pass (UI_SPEC §2.2).
  static const LinearGradient heroEmeraldLight = LinearGradient(
    begin: Alignment(-0.316987298108, -1.183012701892),
    end: Alignment(0.316987298108, 1.183012701892),
    colors: <Color>[
      Color.fromRGBO(49, 135, 102, 1.0),
      Color.fromRGBO(45, 108, 89, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );
  static const LinearGradient heroEmeraldDark = LinearGradient(
    begin: Alignment(-0.316987298108, -1.183012701892),
    end: Alignment(0.316987298108, 1.183012701892),
    colors: <Color>[
      Color.fromRGBO(14, 49, 44, 1.0),
      Color.fromRGBO(6, 21, 26, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );

  /// `--hero-indigo` — linear-gradient(165.0deg), stops resolved per pass (UI_SPEC §2.2).
  static const LinearGradient heroIndigoLight = LinearGradient(
    begin: Alignment(-0.316987298108, -1.183012701892),
    end: Alignment(0.316987298108, 1.183012701892),
    colors: <Color>[
      Color.fromRGBO(79, 80, 172, 1.0),
      Color.fromRGBO(66, 70, 141, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );
  static const LinearGradient heroIndigoDark = LinearGradient(
    begin: Alignment(-0.316987298108, -1.183012701892),
    end: Alignment(0.316987298108, 1.183012701892),
    colors: <Color>[
      Color.fromRGBO(26, 31, 67, 1.0),
      Color.fromRGBO(9, 16, 34, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );

  /// `--hero-mint` — linear-gradient(165.0deg), stops resolved per pass (UI_SPEC §2.2).
  static const LinearGradient heroMintLight = LinearGradient(
    begin: Alignment(-0.316987298108, -1.183012701892),
    end: Alignment(0.316987298108, 1.183012701892),
    colors: <Color>[
      Color.fromRGBO(88, 139, 121, 1.0),
      Color.fromRGBO(71, 109, 101, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );
  static const LinearGradient heroMintDark = LinearGradient(
    begin: Alignment(-0.316987298108, -1.183012701892),
    end: Alignment(0.316987298108, 1.183012701892),
    colors: <Color>[
      Color.fromRGBO(28, 52, 51, 1.0),
      Color.fromRGBO(9, 22, 28, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );

  /// `--hero-orange` — linear-gradient(165.0deg), stops resolved per pass (UI_SPEC §2.2).
  static const LinearGradient heroOrangeLight = LinearGradient(
    begin: Alignment(-0.316987298108, -1.183012701892),
    end: Alignment(0.316987298108, 1.183012701892),
    colors: <Color>[
      Color.fromRGBO(174, 98, 67, 1.0),
      Color.fromRGBO(136, 83, 65, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );
  static const LinearGradient heroOrangeDark = LinearGradient(
    begin: Alignment(-0.316987298108, -1.183012701892),
    end: Alignment(0.316987298108, 1.183012701892),
    colors: <Color>[
      Color.fromRGBO(49, 33, 31, 1.0),
      Color.fromRGBO(16, 16, 21, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );

  /// `--hero-rose` — linear-gradient(165.0deg), stops resolved per pass (UI_SPEC §2.2).
  static const LinearGradient heroRoseLight = LinearGradient(
    begin: Alignment(-0.316987298108, -1.183012701892),
    end: Alignment(0.316987298108, 1.183012701892),
    colors: <Color>[
      Color.fromRGBO(168, 78, 93, 1.0),
      Color.fromRGBO(132, 69, 82, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );
  static const LinearGradient heroRoseDark = LinearGradient(
    begin: Alignment(-0.316987298108, -1.183012701892),
    end: Alignment(0.316987298108, 1.183012701892),
    colors: <Color>[
      Color.fromRGBO(48, 28, 37, 1.0),
      Color.fromRGBO(16, 14, 23, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );

  /// `--hero-slate` — linear-gradient(165.0deg), stops resolved per pass (UI_SPEC §2.2).
  static const LinearGradient heroSlateLight = LinearGradient(
    begin: Alignment(-0.316987298108, -1.183012701892),
    end: Alignment(0.316987298108, 1.183012701892),
    colors: <Color>[
      Color.fromRGBO(90, 99, 116, 1.0),
      Color.fromRGBO(73, 82, 98, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );
  static const LinearGradient heroSlateDark = LinearGradient(
    begin: Alignment(-0.316987298108, -1.183012701892),
    end: Alignment(0.316987298108, 1.183012701892),
    colors: <Color>[
      Color.fromRGBO(31, 39, 51, 1.0),
      Color.fromRGBO(12, 19, 29, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );

  /// `--hero-teal` — linear-gradient(165.0deg), stops resolved per pass (UI_SPEC §2.2).
  static const LinearGradient heroTealLight = LinearGradient(
    begin: Alignment(-0.316987298108, -1.183012701892),
    end: Alignment(0.316987298108, 1.183012701892),
    colors: <Color>[
      Color.fromRGBO(44, 136, 132, 1.0),
      Color.fromRGBO(43, 108, 109, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );
  static const LinearGradient heroTealDark = LinearGradient(
    begin: Alignment(-0.316987298108, -1.183012701892),
    end: Alignment(0.316987298108, 1.183012701892),
    colors: <Color>[
      Color.fromRGBO(13, 51, 55, 1.0),
      Color.fromRGBO(6, 22, 29, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );

  /// `--hero-violet` — linear-gradient(165.0deg), stops resolved per pass (UI_SPEC §2.2).
  static const LinearGradient heroVioletLight = LinearGradient(
    begin: Alignment(-0.316987298108, -1.183012701892),
    end: Alignment(0.316987298108, 1.183012701892),
    colors: <Color>[
      Color.fromRGBO(115, 90, 165, 1.0),
      Color.fromRGBO(93, 77, 135, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );
  static const LinearGradient heroVioletDark = LinearGradient(
    begin: Alignment(-0.316987298108, -1.183012701892),
    end: Alignment(0.316987298108, 1.183012701892),
    colors: <Color>[
      Color.fromRGBO(39, 35, 66, 1.0),
      Color.fromRGBO(14, 17, 33, 1.0),
    ],
    stops: <double>[0.0, 1.0],
  );

  /// `--rainbow` — linear-gradient(90.0deg), stops resolved per pass (UI_SPEC §2.2).
  static const LinearGradient rainbowLight = LinearGradient(
    begin: Alignment(-1.0, 0.0),
    end: Alignment(1.0, 0.0),
    colors: <Color>[
      Color.fromRGBO(195, 195, 238, 1.0),
      Color.fromRGBO(168, 209, 238, 1.0),
      Color.fromRGBO(0, 0, 0, 0.0),
    ],
    stops: <double>[0.0, 0.45, 1.0],
  );
  static const LinearGradient rainbowDark = LinearGradient(
    begin: Alignment(-1.0, 0.0),
    end: Alignment(1.0, 0.0),
    colors: <Color>[
      Color.fromRGBO(177, 176, 239, 1.0),
      Color.fromRGBO(129, 191, 235, 1.0),
      Color.fromRGBO(0, 0, 0, 0.0),
    ],
    stops: <double>[0.0, 0.45, 1.0],
  );

  /// Every §2.1 colour token by its CSS custom property name — light pass.
  static const Map<String, Color> lightByToken = <String, Color>{
    '--accent': accentLight,
    '--accent-fg': accentFgLight,
    '--bg': bgLight,
    '--bg-2': bg2Light,
    '--chip-gold': chipGold,
    '--chip-gold-deep': chipGoldDeep,
    '--color-amber-100': colorAmber100,
    '--color-amber-200': colorAmber200,
    '--color-amber-400': colorAmber400,
    '--color-amber-500': colorAmber500,
    '--color-amber-600': colorAmber600,
    '--color-amber-700': colorAmber700,
    '--color-black': colorBlack,
    '--color-blue-200': colorBlue200,
    '--color-blue-400': colorBlue400,
    '--color-blue-50': colorBlue50,
    '--color-blue-500': colorBlue500,
    '--color-blue-600': colorBlue600,
    '--color-blue-900': colorBlue900,
    '--color-blue-950': colorBlue950,
    '--color-emerald-100': colorEmerald100,
    '--color-emerald-200': colorEmerald200,
    '--color-emerald-300': colorEmerald300,
    '--color-emerald-400': colorEmerald400,
    '--color-emerald-50': colorEmerald50,
    '--color-emerald-500': colorEmerald500,
    '--color-emerald-600': colorEmerald600,
    '--color-emerald-700': colorEmerald700,
    '--color-emerald-900': colorEmerald900,
    '--color-emerald-950': colorEmerald950,
    '--color-indigo-400': colorIndigo400,
    '--color-neutral-600': colorNeutral600,
    '--color-orange-400': colorOrange400,
    '--color-orange-500': colorOrange500,
    '--color-purple-500': colorPurple500,
    '--color-red-300': colorRed300,
    '--color-red-400': colorRed400,
    '--color-red-500': colorRed500,
    '--color-red-900': colorRed900,
    '--color-red-950': colorRed950,
    '--color-rose-200': colorRose200,
    '--color-rose-400': colorRose400,
    '--color-rose-50': colorRose50,
    '--color-rose-500': colorRose500,
    '--color-rose-600': colorRose600,
    '--color-rose-900': colorRose900,
    '--color-rose-950': colorRose950,
    '--color-sky-500': colorSky500,
    '--color-slate-500': colorSlate500,
    '--color-teal-400': colorTeal400,
    '--color-violet-600': colorViolet600,
    '--color-white': colorWhite,
    '--color-yellow-400': colorYellow400,
    '--color-yellow-500': colorYellow500,
    '--color-zinc-400': colorZinc400,
    '--danger': dangerLight,
    '--danger-bg': dangerBgLight,
    '--face-anchor': faceAnchorLight,
    '--glow': glowLight,
    '--glow-2': glow2Light,
    '--hero-deep': heroDeepLight,
    '--hue-amber': hueAmber,
    '--hue-blue': hueBlue,
    '--hue-cyan': hueCyan,
    '--hue-emerald': hueEmerald,
    '--hue-indigo': hueIndigo,
    '--hue-mint': hueMint,
    '--hue-orange': hueOrange,
    '--hue-rose': hueRose,
    '--hue-slate': hueSlate,
    '--hue-teal': hueTeal,
    '--hue-violet': hueViolet,
    '--ink': inkLight,
    '--ink-2': ink2Light,
    '--ink-3': ink3Light,
    '--line': lineLight,
    '--line-strong': lineStrongLight,
    '--pastel-blue': pastelBlueLight,
    '--pastel-lavender': pastelLavenderLight,
    '--pastel-mint': pastelMintLight,
    '--pastel-pink': pastelPinkLight,
    '--pastel-yellow': pastelYellowLight,
    '--rim': rimLight,
    '--success': successLight,
    '--success-bg': successBgLight,
    '--surface': surfaceLight,
    '--surface-2': surface2Light,
    '--surface-3': surface3Light,
    '--warning': warningLight,
    '--warning-bg': warningBgLight,
  };

  /// Every §2.1 colour token by its CSS custom property name — dark pass.
  static const Map<String, Color> darkByToken = <String, Color>{
    '--accent': accentDark,
    '--accent-fg': accentFgDark,
    '--bg': bgDark,
    '--bg-2': bg2Dark,
    '--chip-gold': chipGold,
    '--chip-gold-deep': chipGoldDeep,
    '--color-amber-100': colorAmber100,
    '--color-amber-200': colorAmber200,
    '--color-amber-400': colorAmber400,
    '--color-amber-500': colorAmber500,
    '--color-amber-600': colorAmber600,
    '--color-amber-700': colorAmber700,
    '--color-black': colorBlack,
    '--color-blue-200': colorBlue200,
    '--color-blue-400': colorBlue400,
    '--color-blue-50': colorBlue50,
    '--color-blue-500': colorBlue500,
    '--color-blue-600': colorBlue600,
    '--color-blue-900': colorBlue900,
    '--color-blue-950': colorBlue950,
    '--color-emerald-100': colorEmerald100,
    '--color-emerald-200': colorEmerald200,
    '--color-emerald-300': colorEmerald300,
    '--color-emerald-400': colorEmerald400,
    '--color-emerald-50': colorEmerald50,
    '--color-emerald-500': colorEmerald500,
    '--color-emerald-600': colorEmerald600,
    '--color-emerald-700': colorEmerald700,
    '--color-emerald-900': colorEmerald900,
    '--color-emerald-950': colorEmerald950,
    '--color-indigo-400': colorIndigo400,
    '--color-neutral-600': colorNeutral600,
    '--color-orange-400': colorOrange400,
    '--color-orange-500': colorOrange500,
    '--color-purple-500': colorPurple500,
    '--color-red-300': colorRed300,
    '--color-red-400': colorRed400,
    '--color-red-500': colorRed500,
    '--color-red-900': colorRed900,
    '--color-red-950': colorRed950,
    '--color-rose-200': colorRose200,
    '--color-rose-400': colorRose400,
    '--color-rose-50': colorRose50,
    '--color-rose-500': colorRose500,
    '--color-rose-600': colorRose600,
    '--color-rose-900': colorRose900,
    '--color-rose-950': colorRose950,
    '--color-sky-500': colorSky500,
    '--color-slate-500': colorSlate500,
    '--color-teal-400': colorTeal400,
    '--color-violet-600': colorViolet600,
    '--color-white': colorWhite,
    '--color-yellow-400': colorYellow400,
    '--color-yellow-500': colorYellow500,
    '--color-zinc-400': colorZinc400,
    '--danger': dangerDark,
    '--danger-bg': dangerBgDark,
    '--face-anchor': faceAnchorDark,
    '--glow': glowDark,
    '--glow-2': glow2Dark,
    '--hero-deep': heroDeepDark,
    '--hue-amber': hueAmber,
    '--hue-blue': hueBlue,
    '--hue-cyan': hueCyan,
    '--hue-emerald': hueEmerald,
    '--hue-indigo': hueIndigo,
    '--hue-mint': hueMint,
    '--hue-orange': hueOrange,
    '--hue-rose': hueRose,
    '--hue-slate': hueSlate,
    '--hue-teal': hueTeal,
    '--hue-violet': hueViolet,
    '--ink': inkDark,
    '--ink-2': ink2Dark,
    '--ink-3': ink3Dark,
    '--line': lineDark,
    '--line-strong': lineStrongDark,
    '--pastel-blue': pastelBlueDark,
    '--pastel-lavender': pastelLavenderDark,
    '--pastel-mint': pastelMintDark,
    '--pastel-pink': pastelPinkDark,
    '--pastel-yellow': pastelYellowDark,
    '--rim': rimDark,
    '--success': successDark,
    '--success-bg': successBgDark,
    '--surface': surfaceDark,
    '--surface-2': surface2Dark,
    '--surface-3': surface3Dark,
    '--warning': warningDark,
    '--warning-bg': warningBgDark,
  };

  /// Every §2.2 gradient token by its CSS custom property name — light pass.
  static const Map<String, LinearGradient> gradientsLight =
      <String, LinearGradient>{
        '--gradient-card-blue': gradientCardBlueLight,
        '--gradient-card-dark': gradientCardDarkLight,
        '--gradient-card-light': gradientCardLightLight,
        '--gradient-card-orange': gradientCardOrangeLight,
        '--gradient-nueva': gradientNuevaLight,
        '--hero-amber': heroAmberLight,
        '--hero-blue': heroBlueLight,
        '--hero-cyan': heroCyanLight,
        '--hero-emerald': heroEmeraldLight,
        '--hero-indigo': heroIndigoLight,
        '--hero-mint': heroMintLight,
        '--hero-orange': heroOrangeLight,
        '--hero-rose': heroRoseLight,
        '--hero-slate': heroSlateLight,
        '--hero-teal': heroTealLight,
        '--hero-violet': heroVioletLight,
        '--rainbow': rainbowLight,
      };

  /// Every §2.2 gradient token by its CSS custom property name — dark pass.
  static const Map<String, LinearGradient> gradientsDark =
      <String, LinearGradient>{
        '--gradient-card-blue': gradientCardBlueDark,
        '--gradient-card-dark': gradientCardDarkDark,
        '--gradient-card-light': gradientCardLightDark,
        '--gradient-card-orange': gradientCardOrangeDark,
        '--gradient-nueva': gradientNuevaDark,
        '--hero-amber': heroAmberDark,
        '--hero-blue': heroBlueDark,
        '--hero-cyan': heroCyanDark,
        '--hero-emerald': heroEmeraldDark,
        '--hero-indigo': heroIndigoDark,
        '--hero-mint': heroMintDark,
        '--hero-orange': heroOrangeDark,
        '--hero-rose': heroRoseDark,
        '--hero-slate': heroSlateDark,
        '--hero-teal': heroTealDark,
        '--hero-violet': heroVioletDark,
        '--rainbow': rainbowDark,
      };
}
