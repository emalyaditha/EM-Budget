/**
 * Phase 5 design-system theme generator (playbook §2.4 step 4).
 *
 * Writes `mobile/lib/core/theme/` — app_colors.dart, app_typography.dart,
 * app_spacing.dart, app_radii.dart, app_shadows.dart and app_theme.dart
 * (ThemeExtension + light/dark ThemeData) — so that no number in the Dart
 * theme is hand-typed:
 *
 *   - EVERY value (colour, radius, spacing, blur, container, type size,
 *     line-height, duration, curve, shadow layer, gradient stop) is read from
 *     `parity/ui-tokens.json`, the Chrome measurement. `parity/UI_SPEC.md`
 *     supplies only the curated token lists (§2.1/§2.2/§2.3), the phone
 *     markers, the §3 probe-class list and the §4 motion rows; every value the
 *     doc carries is re-derived from the JSON and a disagreement throws.
 *   - UI_SPEC §5 is deliberately NOT parsed for values: its machine-generated
 *     "Dart" column mis-parses token NAMES (`--blur-2xl` and `--container-2xl`
 *     rendered as radii). Spacing/radius/blur/container numbers here come from
 *     the JSON `raw` strings with an explicit unit conversion (rem -> px at a
 *     16px root font size, stated in the output).
 *   - The phone marker is recomputed from the JSON (desktop pass vs phone pass,
 *     the same comparison `render_ui_spec.cjs` applies) and must agree with the
 *     marker column printed in UI_SPEC §2.1/§2.2; disagreement throws.
 *
 * Idempotent: output depends only on the two input files and nothing else
 * (no timestamps). After writing, the generator shells `dart format` over its
 * own output directory (flutter/bin must be on PATH), so the committed files
 * are exactly what the generator produces and re-runs stay byte-identical.
 *
 * Usage: node parity/generate_theme.cjs   (with `dart` on PATH)
 * Inputs:  parity/ui-tokens.json, parity/UI_SPEC.md
 * Outputs: mobile/lib/core/theme/*.dart
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TOKENS = JSON.parse(fs.readFileSync(path.join(__dirname, 'ui-tokens.json'), 'utf8'));
const SPEC = fs.readFileSync(path.join(__dirname, 'UI_SPEC.md'), 'utf8');
const OUT_DIR = path.join(ROOT, 'mobile', 'lib', 'core', 'theme');

const fail = (msg) => {
  throw new Error(msg);
};

// ---------------------------------------------------------------- measurement views
const LIGHT = TOKENS.themes['light-desktop'];
const DARK = TOKENS.themes['dark-desktop'];
const LIGHT_PHONE = TOKENS.themes['light-phone'];
const DARK_PHONE = TOKENS.themes['dark-phone'];
if (!LIGHT || !DARK || !LIGHT_PHONE || !DARK_PHONE) fail('ui-tokens.json lacks the four passes');

// ---------------------------------------------------------------- UI_SPEC table parsing
/** Rows of the markdown table under `## x.y …`, as trimmed cells, md-escapes undone. */
function specTable(startNeedle, stopRe) {
  const lines = SPEC.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(startNeedle));
  if (start < 0) fail(`UI_SPEC.md section not found: ${startNeedle}`);
  const rows = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (stopRe.test(l)) break;
    if (!l.startsWith('|')) continue;
    const cells = l
      .replace(/^\||\|$/g, '')
      .split(/(?<!\\)\|/)
      .map((c) => c.trim().replace(/\\\|/g, '|').replace(/^`|`$/g, ''));
    rows.push(cells);
  }
  if (rows.length < 3) fail(`UI_SPEC.md table under ${startNeedle} is empty`);
  return rows.slice(2); // header + separator
}

const colourRows = specTable('### 2.1 Colour tokens', /^#{1,3} /);
const compoundRows = specTable('### 2.2 Gradient and shadow tokens', /^#{1,3} /);
const otherRows = specTable('### 2.3 Non-colour tokens', /^#{1,3} /);
const typeRows = specTable('## 3. Type scale', /^#{2,3} /);
const motionRows = specTable('## 4. Motion', /^#{1,3} /);

// ---------------------------------------------------------------- token identity + formatting
/** `--accent-fg` -> `accentFg`, `--text-lg--line-height` -> `textLgLineHeight`. */
const ident = (name) => {
  const segs = name.replace(/^--/, '').split('-').filter(Boolean);
  return segs.map((s, i) => (i === 0 ? s : s[0].toUpperCase() + s.slice(1))).join('');
};

/** Shortest round-tripping JS number text, forced to a Dart double literal. */
const fmt = (x) => (Number.isInteger(x) && Number.isFinite(x) ? `${x}.0` : String(x));

const dartColor = (c) => `Color.fromRGBO(${c.r}, ${c.g}, ${c.b}, ${c.alpha === 1 ? '1.0' : String(c.alpha)})`;

/** Same viewShift test the spec renderer applies to the phone marker column. */
const phoneShift = (name) =>
  JSON.stringify(LIGHT.root[name]) !== JSON.stringify(LIGHT_PHONE.root[name]) ||
  JSON.stringify(DARK.root[name]) !== JSON.stringify(DARK_PHONE.root[name]);

/**
 * Unit conversion for CSS lengths. `rem` is 16px — the root font size of the
 * measurement environment (Tailwind's default, and the one Chrome resolved the
 * authored `rem` values with). Spacing, container and `--radius-*` values are
 * authored in rem and land here in px.
 */
const lengthPx = (raw, token) => {
  const m = /^(-?[\d.]+)rem$/.exec(raw);
  if (m) return parseFloat(m[1]) * 16;
  const p = /^(-?[\d.]+)px$/.exec(raw);
  if (p) return parseFloat(p[1]);
  return fail(`unconvertible length ${raw} for ${token}`);
};

/** `calc(2 / 1.5)` -> 1.3333…, `1.5` -> 1.5 — a CSS line-height multiplier,
 *  which Flutter TextStyle.height consumes unchanged. */
const ratioOf = (raw, token) => {
  const c = /^calc\(\s*([\d.]+)\s*\/\s*([\d.]+)\s*\)$/.exec(raw);
  if (c) return parseFloat(c[1]) / parseFloat(c[2]);
  if (/^[\d.]+$/.test(raw)) return parseFloat(raw);
  return fail(`unconvertible ratio ${raw} for ${token}`);
};

const msOf = (raw, token) => {
  const m = /^(\d+(?:\.\d+)?)ms$/.exec(raw);
  if (m) return Math.round(parseFloat(m[1]));
  return fail(`unconvertible duration ${raw} for ${token}`);
};

const cubicOf = (raw, token) => {
  const m = /^cubic-bezier\(\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\s*\)$/.exec(raw);
  if (m) return m.slice(1).map(Number);
  return fail(`unconvertible timing function ${raw} for ${token}`);
};

/** `rgba(13, 22, 36, 0.05)` -> parts. */
const parseRgba = (s) => {
  const m = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(s.trim());
  if (!m) fail(`unparseable rgba "${s}"`);
  return { r: +m[1], g: +m[2], b: +m[3], a: parseFloat(m[4]) };
};

/** CSS box-shadow layer list -> layers. Order is offset-x offset-y blur [spread] colour.
 *  Any length may be a unitless 0, exactly as the measurement serialises it. */
const parseShadow = (raw, token) => {
  const layers = [
    ...raw.matchAll(
      /(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?(?:\s+(-?[\d.]+)(?:px)?)?\s+rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/g,
    ),
  ];
  if (!layers.length) fail(`no shadow layers parsed from ${token}: ${raw}`);
  return layers.map((m) => ({
    dx: parseFloat(m[1]),
    dy: parseFloat(m[2]),
    blur: parseFloat(m[3]),
    spread: m[4] === undefined ? 0 : parseFloat(m[4]),
    colour: { r: +m[5], g: +m[6], b: +m[7], a: parseFloat(m[8]) },
  }));
};

/** `linear-gradient(135deg, rgba(…) 0%, rgba(…) 100%)` -> angle + positioned stops. */
const parseGradient = (raw, token) => {
  const head = /^linear-gradient\(\s*([\d.]+)deg\s*,\s*(.+)\)$/s.exec(raw.trim());
  if (!head) fail(`not a linear-gradient we can port: ${token}`);
  const angle = parseFloat(head[1]);
  const stops = [...head[2].matchAll(/rgba\((\d+), (\d+), (\d+), ([\d.]+)\)\s+([\d.]+)%/g)];
  if (!stops.length) fail(`no gradient stops parsed from ${token}: ${raw}`);
  return {
    angle,
    stops: stops.map((m) => ({
      colour: { r: +m[1], g: +m[2], b: +m[3], a: parseFloat(m[4]) },
      at: parseFloat(m[5]) / 100,
    })),
  };
};

/**
 * CSS gradient angle -> Flutter Alignment pair.
 * The screen direction of a CSS angle a is d = (sin a, -cos a) with y down,
 * which is also Flutter Alignment's y convention. A CSS gradient line spans
 * |w*sin a| + |h*cos a| across the box, so in Alignment units (box half-size 1)
 * the endpoints are +/- d * (|sin a| + |cos a|).
 */
const gradientAlignments = (angleDeg) => {
  const rad = (angleDeg * Math.PI) / 180;
  const s = Math.sin(rad);
  const c = Math.cos(rad);
  const k = Math.abs(s) + Math.abs(c);
  // 1e-12 snap: sin/cos carry the usual last-bit error (cos 135deg = -0.707…998),
  // which has no design meaning; the parity test compares with 1e-9 tolerance.
  const snap = (v) => Math.round(v * 1e12) / 1e12;
  return { begin: [snap(-s * k), snap(c * k)], end: [snap(s * k), snap(-c * k)] };
};

const collapse = (s) => String(s).replace(/\s+/g, ' ').trim();

const dartStr = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

// ---------------------------------------------------------------- curated lists from UI_SPEC
const colours = colourRows.map((r) => {
  const name = r[0];
  const marker = r[5] === 'phone differs';
  const l = LIGHT.root[name];
  const d = DARK.root[name];
  if (!l || !l.srgb || !d || !d.srgb) fail(`§2.1 token ${name} is not a measured colour in the JSON`);
  if (dartColor(l.srgb) !== r[2] || dartColor(d.srgb) !== r[3]) {
    fail(`§2.1 ${name}: UI_SPEC dart columns disagree with the measurement — fix the doc, not this script`);
  }
  if (marker !== phoneShift(name)) fail(`§2.1 ${name}: phone marker disagrees with the desktop/phone passes`);
  return { name, marker, light: l.srgb, dark: d.srgb, raw: l.raw, rawDark: d.raw };
});

const compounds = compoundRows.map((r) => {
  const name = r[0];
  const marker = r[4] === 'phone differs';
  const l = LIGHT.root[name];
  const d = DARK.root[name];
  if (!l || !l.substituted || !d || !d.substituted)
    fail(`§2.2 token ${name} is not a substituted compound in the JSON`);
  if (collapse(l.substituted) !== collapse(r[2]) || collapse(d.substituted) !== collapse(r[3])) {
    fail(`§2.2 ${name}: UI_SPEC resolved columns disagree with the measurement`);
  }
  if (marker !== phoneShift(name)) fail(`§2.2 ${name}: phone marker disagrees with the desktop/phone passes`);
  return { name, marker, lightRaw: l.substituted, darkRaw: d.substituted };
});

const others = otherRows.map((r) => {
  const name = r[0];
  const l = LIGHT.root[name];
  if (!l || l.srgb || l.substituted) fail(`§2.3 token ${name} is not a measured non-colour token in the JSON`);
  if (collapse(l.raw) !== collapse(r[1])) fail(`§2.3 ${name}: UI_SPEC value disagrees with the measurement`);
  return { name, raw: l.raw };
});

const typeClasses = typeRows.map((r) => ({ cls: r[0], resizes: /\*\*resizes\*\*/.test(r.join(' ')) }));
for (const { cls } of typeClasses) {
  if (!LIGHT.probes[cls] || !LIGHT_PHONE.probes[cls]) fail(`§3 class ${cls} has no probe in the measurement`);
}

// the §4 motion table must cover exactly the motion-shaped §2.3 tokens
{
  const motionNames = new Set(motionRows.map((r) => r[0]));
  const measuredMotion = others.filter(
    (o) =>
      /^--dur/.test(o.name) ||
      /^--ease-/.test(o.name) ||
      /^--animate-/.test(o.name) ||
      /^--default-transition-/.test(o.name),
  );
  for (const o of measuredMotion) if (!motionNames.has(o.name)) fail(`§4 motion table omits ${o.name}`);
}

// ---------------------------------------------------------------- non-colour classification
const byKind = {
  motion: [],
  type: [],
  radii: [],
  spacing: [],
  containers: [],
  blurs: [],
  stacks: [],
  weights: [],
  animations: [],
};
for (const o of others) {
  const n = o.name;
  if (/^--r-/.test(n) || /^--radius-/.test(n)) byKind.radii.push(o);
  else if (/^--blur-/.test(n)) byKind.blurs.push(o);
  else if (/^--container-/.test(n)) byKind.containers.push(o);
  else if (n === '--spacing') byKind.spacing.push(o);
  else if (/^--font-weight-/.test(n)) byKind.weights.push(o);
  else if (/^--font-/.test(n) || /^--default-(?:mono-)?font-family/.test(n)) byKind.stacks.push(o);
  else if (/^--animate-/.test(n)) byKind.animations.push(o);
  else if (/^--dur/.test(n) || /^--ease-/.test(n) || /^--default-transition-/.test(n)) byKind.motion.push(o);
  else if (/^--text-|^--leading-|^--tracking-/.test(n)) byKind.type.push(o);
  else fail(`§2.3 token ${n} belongs to no emitted class`);
}

const px = (o) => lengthPx(o.raw, o.name);
const sameColour = (c) =>
  c.light.r === c.dark.r && c.light.g === c.dark.g && c.light.b === c.dark.b && c.light.alpha === c.dark.alpha;

// ---------------------------------------------------------------- Dart assembly scaffolding
const dartFiles = [];
let L = [];
const banner = () => {
  L.push(
    '// GENERATED — do not edit by hand.',
    '// Produced by `node parity/generate_theme.cjs` from `parity/ui-tokens.json`, the',
    '// Chrome-computed measurement of `src/index.css` at tag `pre-flutter`, with the',
    '// curated token lists and phone markers of `parity/UI_SPEC.md` §2.1–§4.',
    '// Every value below is the measurement; UI_SPEC §5 (whose machine "Dart" column',
    '// mis-parses --blur-* / --container-* names as radii) is deliberately not used.',
    '',
  );
};
const phoneMarker = (t) =>
  t.marker ? ['  // phone marker (UI_SPEC §2): the desktop and phone passes render different values.'] : [];
const finish = (name) => {
  dartFiles.push([name, L.join('\n') + '\n']);
  L = [];
};

// ================================================================ app_colors.dart
banner();
L.push(
  "import 'package:flutter/material.dart';",
  '',
  '/// The 90 colour tokens of UI_SPEC §2.1 and the 17 gradient tokens of §2.2,',
  '/// exactly as Chrome computed them for `src/index.css`. Names are the CSS custom',
  '/// property minus `--`, camel-cased, so any constant traces back to index.css;',
  '/// `lightByToken`/`darkByToken` key the constants by the original `--name`.',
  'abstract final class AppColors {',
  '',
);

for (const c of colours) {
  const id = ident(c.name);
  const eq = sameColour(c);
  const authored = c.raw === c.rawDark ? collapse(c.raw) : `${collapse(c.raw)} / ${collapse(c.rawDark)}`;
  L.push(`  /// \`${c.name}\` — authored \`${authored}\` (UI_SPEC §2.1).`, ...phoneMarker(c));
  if (eq) {
    L.push(`  static const Color ${id} = ${dartColor(c.light)};`, '');
    c.lightId = id;
    c.darkId = id;
  } else {
    L.push(`  static const Color ${id}Light = ${dartColor(c.light)};`);
    L.push(`  static const Color ${id}Dark = ${dartColor(c.dark)};`, '');
    c.lightId = `${id}Light`;
    c.darkId = `${id}Dark`;
  }
}

L.push('  // ------------------------------------------------------------- gradients (UI_SPEC §2.2)');
L.push('  // LinearGradient built from the substituted stop colours. begin/end encode the CSS');
L.push('  // angle: Alignment -+d*(|sin a|+|cos a|) along d=(sin a, -cos a), which reproduces');
L.push('  // the CSS gradient line on a square box — see `gradientAlignments` in');
L.push('  // parity/generate_theme.cjs.');
const gradientTokens = compounds.filter((c) => !/^--shadow/.test(c.name));
const shadowTokens = compounds.filter((c) => /^--shadow/.test(c.name));

for (const g of gradientTokens) {
  const id = ident(g.name);
  const GP = parseGradient(g.lightRaw, g.name);
  const GD = parseGradient(g.darkRaw, g.name);
  if (!(
    GP.angle === GD.angle &&
    GP.stops.length === GD.stops.length &&
    GP.stops.every((s, i) => s.at === GD.stops[i].at)
  )) {
    fail(`gradient ${g.name}: light and dark stop geometry differ; port one shape at a time`);
  }
  const emit = (suffix, P) => {
    const a = gradientAlignments(P.angle);
    L.push(`  static const LinearGradient ${id}${suffix} = LinearGradient(`);
    L.push(`    begin: Alignment(${fmt(a.begin[0])}, ${fmt(a.begin[1])}),`);
    L.push(`    end: Alignment(${fmt(a.end[0])}, ${fmt(a.end[1])}),`);
    L.push(
      `    colors: <Color>[${P.stops.map((s) => `Color.fromRGBO(${s.colour.r}, ${s.colour.g}, ${s.colour.b}, ${fmt(s.colour.a)})`).join(', ')}],`,
    );
    L.push(`    stops: <double>[${P.stops.map((s) => fmt(s.at)).join(', ')}],`);
    L.push('  );');
  };
  L.push(`  /// \`${g.name}\` — linear-gradient(${fmt(GP.angle)}deg), stops resolved per pass (UI_SPEC §2.2).`);
  for (const line of phoneMarker(g)) L.push(line);
  const same = GP.stops.every((s, i) => JSON.stringify(s) === JSON.stringify(GD.stops[i]));
  if (same) {
    emit('', GP);
    g.lightId = id;
    g.darkId = id;
  } else {
    emit('Light', GP);
    emit('Dark', GD);
    g.lightId = `${id}Light`;
    g.darkId = `${id}Dark`;
  }
  L.push('');
}

const mapBlock = (label, type, decl, entries) => {
  L.push(`  /// ${label}`, `  static const Map<String, ${type}> ${decl} = <String, ${type}>{`);
  for (const [k, v] of entries) L.push(`    '${k}': ${v},`);
  L.push('  };', '');
};
mapBlock(
  'Every §2.1 colour token by its CSS custom property name — light pass.',
  'Color',
  'lightByToken',
  colours.map((c) => [c.name, c.lightId]),
);
mapBlock(
  'Every §2.1 colour token by its CSS custom property name — dark pass.',
  'Color',
  'darkByToken',
  colours.map((c) => [c.name, c.darkId]),
);
mapBlock(
  'Every §2.2 gradient token by its CSS custom property name — light pass.',
  'LinearGradient',
  'gradientsLight',
  gradientTokens.map((g) => [g.name, g.lightId]),
);
mapBlock(
  'Every §2.2 gradient token by its CSS custom property name — dark pass.',
  'LinearGradient',
  'gradientsDark',
  gradientTokens.map((g) => [g.name, g.darkId]),
);
L.push('}');
finish('app_colors.dart');

// ================================================================ app_typography.dart
banner();
L.push(
  "import 'package:flutter/material.dart';",
  '',
  '/// Type tokens from UI_SPEC §2.3 and the §3 type scale. `rem` sizes are',
  '/// converted to px at the 16px root font size of the measurement environment;',
  '/// `lineHeights` are the CSS multipliers (`calc(a / b)` evaluated as a/b), which',
  '/// Flutter `TextStyle.height` consumes directly. The §3 probe classes carry the',
  '/// PHONE column — UI_SPEC §3: "the port must use the phone column".',
  'abstract final class AppTypography {',
  '',
);

const sizeTokens = byKind.type.filter((o) => /^--text-[\w-]+$/.test(o.name) && !o.name.endsWith('--line-height'));
const lhTokens = byKind.type.filter((o) => o.name.endsWith('--line-height'));
const leadingToks = byKind.type.filter((o) => /^--leading-/.test(o.name));
const trackingToks = byKind.type.filter((o) => /^--tracking-/.test(o.name));
const clampSizes = sizeTokens.filter((o) => /^clamp\(/.test(o.raw));
const plainSizes = sizeTokens.filter((o) => !/^clamp\(/.test(o.raw));
const clampProbeMap = { '--text-display': '.money-display', '--text-num': '.numeral' };
const num = (raw) => parseFloat(raw);

for (const o of plainSizes) {
  L.push(`  /// \`${o.name}\` — \`${o.raw}\` (UI_SPEC §2.3).`);
  L.push(`  static const double ${ident(o.name)} = ${fmt(px(o))};`, '');
}
for (const o of clampSizes) {
  const cls = clampProbeMap[o.name];
  if (!cls) fail(`clamp size token ${o.name} has no §3 probe mapping`);
  const p = LIGHT_PHONE.probes[cls];
  L.push(`  /// \`${o.name}\` — \`${collapse(o.raw)}\`; §3 says the port uses the phone column,`);
  L.push(`  /// and the probe \`${cls}\` measured ${p.fontSize} at innerWidth ${LIGHT_PHONE.innerWidth}.`);
  L.push(`  static const double ${ident(o.name)} = ${fmt(num(p.fontSize))};`, '');
}
for (const o of lhTokens) {
  L.push(`  /// \`${o.name}\` — line-height multiplier \`${o.raw}\` (UI_SPEC §2.3).`);
  L.push(`  static const double ${ident(o.name)} = ${fmt(ratioOf(o.raw, o.name))};`, '');
}
for (const o of leadingToks) {
  L.push(`  /// \`${o.name}\` — line-height multiplier \`${o.raw}\`.`);
  L.push(`  static const double ${ident(o.name)} = ${fmt(ratioOf(o.raw, o.name))};`, '');
}
for (const o of trackingToks) {
  L.push(`  /// \`${o.name}\` — \`${o.raw}\`. CSS letter-spacing is an em multiplier; Flutter`);
  L.push(`  /// TextStyle.letterSpacing is px, so multiply by the font size. The §3`);
  L.push('  /// class styles below already embed the phone-resolved px values.');
  L.push(`  static const double ${ident(o.name)}Em = ${fmt(parseFloat(o.raw))};`, '');
}

L.push('  // ------------------------------------------------------------- §3 probe classes, phone column');
for (const { cls } of typeClasses) {
  const p = LIGHT_PHONE.probes[cls];
  const fsPx = num(p.fontSize);
  const lh = num(p.lineHeight);
  const ls = p.letterSpacing === 'normal' ? 0 : num(p.letterSpacing);
  const w = parseInt(p.fontWeight, 10);
  const family = p.fontFamily.split(',')[0].replace(/["']/g, '');
  if (!(w % 100 === 0 && w >= 100 && w <= 900)) fail(`§3 ${cls}: unexpected font weight ${p.fontWeight}`);
  L.push(
    `  /// \`${cls}\` at the phone viewport (§3): ${p.fontSize} / lh ${p.lineHeight} / ls ${p.letterSpacing} / weight ${p.fontWeight}.`,
  );
  L.push(`  /// Font family \`${family}\` only renders once the §3.1 font-bundle approval lands;`);
  L.push('  /// until then Flutter falls back to the system font. height = lineHeight px / font-size px.');
  L.push(`  static const TextStyle ${ident(cls.replace(/^\./, ''))} = TextStyle(`);
  L.push(`    fontSize: ${fmt(fsPx)},`);
  L.push(`    height: ${fmt(lh / fsPx)},`);
  L.push(`    letterSpacing: ${fmt(ls)},`);
  L.push(`    fontWeight: FontWeight.w${w},`);
  L.push(`    fontFamily: ${dartStr(family)},`);
  L.push('  );', '');
}

L.push('  // ------------------------------------------------------------- font stacks + weights (§2.3)');
for (const o of byKind.stacks) {
  L.push(`  /// \`${o.name}\` — \`${collapse(o.raw)}\`.`);
  L.push(`  static const String ${ident(o.name)} = ${dartStr(o.raw)};`, '');
}
for (const o of byKind.weights) {
  L.push(`  /// \`${o.name}\` — CSS font-weight ${o.raw}.`);
  L.push(`  static const FontWeight ${ident(o.name)} = FontWeight.w${parseInt(o.raw, 10)};`, '');
}

L.push(
  '  /// Every measured text size in px, keyed by CSS token name; clamp tokens carry',
  '  /// their phone-column resolution from the §3 probes.',
  '  static const Map<String, double> sizesByToken = <String, double>{',
);
for (const o of sizeEntriesForMap()) L.push(`    '${o.name}': ${fmt(o.pxValue)},`);
L.push('  };', '');
L.push(
  '  /// Line-height multiplier per text token, from the measured',
  '  /// `--text-*--line-height` calcs (§2.3) and, for the clamp tokens, the §3 phone',
  '  /// probes (lineHeight px / fontSize px). `--text-base` measured no line-height',
  '  /// utility, so it has no entry — the doc records the absence.',
  '  static const Map<String, double> lineHeightsByToken = <String, double>{',
);
for (const e of lhEntriesForMap()) L.push(`    '${e.name}': ${fmt(e.value)},`);
L.push('  };', '');
L.push('}');

function sizeEntriesForMap() {
  return [...plainSizes, ...clampSizes].map((o) => ({
    name: o.name,
    pxValue: clampProbeMap[o.name] ? num(LIGHT_PHONE.probes[clampProbeMap[o.name]].fontSize) : px(o),
  }));
}
function lhEntriesForMap() {
  const out = lhTokens.map((o) => ({ name: o.name, value: ratioOf(o.raw, o.name) }));
  for (const o of clampSizes) {
    const p = LIGHT_PHONE.probes[clampProbeMap[o.name]];
    out.push({ name: o.name, value: num(p.lineHeight) / num(p.fontSize) });
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : 1));
}
finish('app_typography.dart');

// ================================================================ app_spacing.dart
banner();
L.push(
  '/// Spacing tokens from UI_SPEC §2.3. `rem` is converted to px at a 16px root',
  '/// font size — the root size of the measurement environment. Tailwind composes',
  '/// every spacing utility as `calc(<n> * --spacing)`, so `scale(n)` is that same',
  '/// multiplication and adds no new design value.',
  'abstract final class AppSpacing {',
  '',
);
const spacingTok = byKind.spacing[0];
L.push(`  /// \`${spacingTok.name}\` — \`${spacingTok.raw}\` = ${fmt(px(spacingTok))}px at the 16px root font size.`);
L.push(`  static const double ${ident(spacingTok.name)} = ${fmt(px(spacingTok))};`, '');
L.push('  /// Tailwind spacing utilities are multiples of `--spacing`; this is that math.');
L.push(`  static double scale(double multiplier) => multiplier * ${ident(spacingTok.name)};`, '');
L.push('  /// `--container-*` (§2.3): content max-widths / breakpoints in px, rem');
L.push('  /// converted at 16px. These are lengths, NOT corner radii — the machine');
L.push('  /// "Dart" column of UI_SPEC §5 printed them as `Radius.circular(...)`');
L.push('  /// because it parsed the token NAME, and that column is not used here.');
L.push('  static const Map<String, double> containersByToken = <String, double>{');
for (const o of byKind.containers) L.push(`    '${o.name}': ${fmt(px(o))},`);
L.push('  };', '');
L.push(
  '  /// The spacing base keyed by its CSS token name.',
  '  static const Map<String, double> spacingByToken = <String, double>{',
);
for (const o of byKind.spacing) L.push(`    '${o.name}': ${fmt(px(o))},`);
L.push('  };');
L.push('}');
finish('app_spacing.dart');

// ================================================================ app_radii.dart
banner();
L.push(
  "import 'package:flutter/material.dart';",
  '',
  "/// Corner-radius tokens from UI_SPEC §2.3 — the app's own `--r-*` set and",
  "/// Tailwind's `--radius-*` set — in px (`rem` converted at the 16px root font",
  '/// size). Blur tokens are NOT here: `--blur-*` feeds a filter sigma, not a',
  '/// corner. `byToken` keys each value by its CSS name; the BorderRadius',
  '/// conveniences are the same numbers, not new ones.',
  'abstract final class AppRadii {',
  '',
);
for (const o of byKind.radii) {
  L.push(`  /// \`${o.name}\` — \`${o.raw}\`.`);
  L.push(`  static const double ${ident(o.name)} = ${fmt(px(o))};`, '');
}
L.push(
  '  /// Every radius token in px, keyed by its CSS custom property name.',
  '  static const Map<String, double> byToken = <String, double>{',
);
for (const o of byKind.radii) L.push(`    '${o.name}': ${fmt(px(o))},`);
L.push('  };', '');
L.push('  /// The two app card sizes as BorderRadius — convenience over the constants above.');
L.push(`  static const BorderRadius cardRadius = BorderRadius.all(Radius.circular(${ident('--r-sm')}));`);
L.push(`  static const BorderRadius panelRadius = BorderRadius.all(Radius.circular(${ident('--r-md')}));`);
L.push('}');
finish('app_radii.dart');

// ================================================================ app_shadows.dart
banner();
L.push(
  "import 'package:flutter/material.dart';",
  '',
  '/// The shadow tokens of UI_SPEC §2.2. Each layer measured as',
  '/// `offset-x offset-y blur-radius rgba(r, g, b, a)`; the resolved rgba is used',
  '/// whole (colour AND alpha) exactly as the note under §2.2 requires — not',
  '/// composed over the surface underneath. CSS blur radius is carried as Flutter',
  '/// blurRadius unchanged; spread is 0 wherever none was measured.',
  'abstract final class AppShadows {',
  '',
);
for (const s of shadowTokens) {
  const id = ident(s.name);
  const SL = parseShadow(s.lightRaw, s.name);
  const SD = parseShadow(s.darkRaw, s.name);
  const emitList = (suffix, layers) => {
    L.push(`  static const List<BoxShadow> ${id}${suffix} = <BoxShadow>[`);
    for (const ly of layers) {
      const spread = ly.spread === 0 ? '' : `, spreadRadius: ${fmt(ly.spread)}`;
      L.push(
        `    BoxShadow(color: Color.fromRGBO(${ly.colour.r}, ${ly.colour.g}, ${ly.colour.b}, ${fmt(ly.colour.a)}), offset: Offset(${fmt(ly.dx)}, ${fmt(ly.dy)}), blurRadius: ${fmt(ly.blur)}${spread}),`,
      );
    }
    L.push('  ];');
  };
  L.push(`  /// \`${s.name}\` (UI_SPEC §2.2).`);
  for (const line of phoneMarker(s)) L.push(line);
  L.push(`  /// light \`${collapse(s.lightRaw)}\`.`);
  L.push(`  /// dark  \`${collapse(s.darkRaw)}\`.`);
  emitList('Light', SL);
  emitList('Dark', SD);
  L.push('');
}
mapBlock(
  'The shadow tokens per CSS name — light pass.',
  'List<BoxShadow>',
  'shadowsLight',
  shadowTokens.map((s) => [s.name, `${ident(s.name)}Light`]),
);
mapBlock(
  'The shadow tokens per CSS name — dark pass.',
  'List<BoxShadow>',
  'shadowsDark',
  shadowTokens.map((s) => [s.name, `${ident(s.name)}Dark`]),
);
L.push(`  /// The §2.2 split this generator emits: ${gradientTokens.length} gradients (in`);
L.push('  /// AppColors) and these ' + shadowTokens.length + ' shadow tokens.');
L.push('}');
finish('app_shadows.dart');

// ================================================================ app_theme.dart
banner();
L.push(
  "import 'package:flutter/material.dart';",
  '',
  "import 'app_colors.dart';",
  "import 'app_radii.dart';",
  "import 'app_shadows.dart';",
  "import 'app_spacing.dart';",
  "import 'app_typography.dart';",
  '',
  '/// Custom design tokens `ThemeData` has no slot for: the §2.3 radius/blur/',
  '/// spacing values, the §4 motion values, and the §2.2 gradient and shadow',
  '/// sets resolved for one brightness. The light and dark instances carry the',
  '/// respective measured pass; nothing here falls back to a Material default.',
  'class AppTokens extends ThemeExtension<AppTokens> {',
  '  const AppTokens({',
  '    required this.radii,',
  '    required this.blurs,',
  '    required this.durations,',
  '    required this.curves,',
  '    required this.gradients,',
  '    required this.shadows,',
  '    required this.spacingUnit,',
  '    required this.containers,',
  '  });',
  '',
);
L.push('  /// `--r-*` / `--radius-*` in px (AppRadii.byToken).');
L.push('  final Map<String, double> radii;');
L.push('  /// `--blur-*` in measured CSS px. ImageFilter.blur sigma = px / 2 is the');
L.push('  /// Material convention (UI_SPEC §5 note); the token itself is the px value.');
L.push('  final Map<String, double> blurs;');
L.push('  final Map<String, Duration> durations;');
L.push('  final Map<String, Curve> curves;');
L.push('  final Map<String, LinearGradient> gradients;');
L.push('  final Map<String, List<BoxShadow>> shadows;');
L.push('  final double spacingUnit;');
L.push('  /// `--container-*` breakpoints in px.');
L.push('  final Map<String, double> containers;');
L.push('');

L.push('  // ------------------------------------------------------------- §4 motion');
const durs = byKind.motion.filter((o) => /duration$/.test(o.name) || /^--dur/.test(o.name));
const curves = byKind.motion.filter((o) => /timing-function$/.test(o.name) || /^--ease-/.test(o.name));
if (durs.length + curves.length !== byKind.motion.length) fail('§4 classification lost a motion token');
for (const o of durs) {
  L.push(`  /// \`${o.name}\` — \`${o.raw}\` (UI_SPEC §4).`);
  L.push(`  static const Duration ${ident(o.name)} = Duration(milliseconds: ${msOf(o.raw, o.name)});`, '');
}
for (const o of curves) {
  const c = cubicOf(o.raw, o.name);
  L.push(`  /// \`${o.name}\` — \`${o.raw}\` (UI_SPEC §4). Kept verbatim as a Cubic;`);
  L.push(
    `  /// \`Curves.*\` names are not parity targets.${o.name === '--ease-spring' ? ' This one overshoots past 1.0, which no `Curves.*` equals (§4 note).' : ''}`,
  );
  L.push(`  static const Cubic ${ident(o.name)} = Cubic(${c.map(fmt).join(', ')});`, '');
}
for (const o of byKind.animations) {
  L.push(`  /// \`${o.name}\` — \`${collapse(o.raw)}\` (UI_SPEC §4). CSS shorthand kept for`);
  L.push('  /// provenance; Dart composes the repeat/curve from the same numbers.');
  L.push(`  static const String ${ident(o.name)} = ${dartStr(o.raw)};`, '');
}

L.push('  // ------------------------------------------------------------- §2.3 blur (filter input, not a radius)');
for (const o of byKind.blurs) {
  L.push(`  /// \`${o.name}\` — \`${o.raw}\` of CSS blur.`);
  L.push(`  static const double ${ident(o.name)} = ${fmt(px(o))};`, '');
}

L.push(
  '  /// Motion durations keyed by CSS token name.',
  '  static const Map<String, Duration> durationsByToken = <String, Duration>{',
);
for (const o of durs) L.push(`    '${o.name}': ${ident(o.name)},`);
L.push('  };', '');
L.push(
  '  /// Motion timing functions keyed by CSS token name.',
  '  static const Map<String, Curve> curvesByToken = <String, Curve>{',
);
for (const o of curves) L.push(`    '${o.name}': ${ident(o.name)},`);
L.push('  };', '');
L.push(
  '  /// Blur tokens keyed by CSS token name (measured px).',
  '  static const Map<String, double> blursByToken = <String, double>{',
);
for (const o of byKind.blurs) L.push(`    '${o.name}': ${fmt(px(o))},`);
L.push('  };', '');

L.push('  /// The light-pass instance.', '  static const AppTokens light = AppTokens(');
L.push('    radii: AppRadii.byToken,');
L.push('    blurs: blursByToken,');
L.push('    durations: durationsByToken,');
L.push('    curves: curvesByToken,');
L.push('    gradients: AppColors.gradientsLight,');
L.push('    shadows: AppShadows.shadowsLight,');
L.push(`    spacingUnit: AppSpacing.${ident('--spacing')},`);
L.push('    containers: AppSpacing.containersByToken,');
L.push('  );', '');
L.push('  /// The dark-pass instance.', '  static const AppTokens dark = AppTokens(');
L.push('    radii: AppRadii.byToken,');
L.push('    blurs: blursByToken,');
L.push('    durations: durationsByToken,');
L.push('    curves: curvesByToken,');
L.push('    gradients: AppColors.gradientsDark,');
L.push('    shadows: AppShadows.shadowsDark,');
L.push(`    spacingUnit: AppSpacing.${ident('--spacing')},`);
L.push('    containers: AppSpacing.containersByToken,');
L.push('  );', '');

L.push('  @override');
L.push('  AppTokens copyWith({');
L.push('    Map<String, double>? radii,');
L.push('    Map<String, double>? blurs,');
L.push('    Map<String, Duration>? durations,');
L.push('    Map<String, Curve>? curves,');
L.push('    Map<String, LinearGradient>? gradients,');
L.push('    Map<String, List<BoxShadow>>? shadows,');
L.push('    double? spacingUnit,');
L.push('    Map<String, double>? containers,');
L.push('  }) {');
L.push('    return AppTokens(');
for (const f of ['radii', 'blurs', 'durations', 'curves', 'gradients', 'shadows', 'spacingUnit', 'containers']) {
  L.push(`      ${f}: ${f} ?? this.${f},`);
}
L.push('    );');
L.push('  }', '');
L.push('  @override');
L.push('  AppTokens lerp(covariant AppTokens? other, double t) => t < 0.5 ? this : other ?? this;', '');
L.push('  /// Resolve a §2.1 colour token for a brightness — the lookup the widgets layer uses.');
L.push('  static Color colorOf(String token, {required bool isDark}) =>');
L.push('      (isDark ? AppColors.darkByToken : AppColors.lightByToken)[token]!;');
L.push('}', '');

// --- ColorScheme slot table (slot -> §2.1 token). No deprecated slots
// (background/onBackground/surfaceVariant) are touched.
const schemeMap = [
  ['primary', '--accent'],
  ['onPrimary', '--accent-fg'],
  ['primaryContainer', '--bg-2'],
  ['onPrimaryContainer', '--ink'],
  ['primaryFixed', '--surface-2'],
  ['primaryFixedDim', '--surface-3'],
  ['onPrimaryFixed', '--ink'],
  ['onPrimaryFixedVariant', '--ink'],
  ['secondary', '--glow'],
  ['onSecondary', '--accent-fg'],
  ['secondaryContainer', '--bg-2'],
  ['onSecondaryContainer', '--ink'],
  ['secondaryFixed', '--surface-2'],
  ['secondaryFixedDim', '--surface-3'],
  ['onSecondaryFixed', '--ink'],
  ['onSecondaryFixedVariant', '--ink'],
  ['tertiary', '--hero-deep'],
  ['onTertiary', '--accent-fg'],
  ['tertiaryContainer', '--bg-2'],
  ['onTertiaryContainer', '--ink'],
  ['tertiaryFixed', '--surface-2'],
  ['tertiaryFixedDim', '--surface-3'],
  ['onTertiaryFixed', '--ink'],
  ['onTertiaryFixedVariant', '--ink'],
  ['error', '--danger'],
  ['onError', '--accent-fg'],
  ['errorContainer', '--danger-bg'],
  ['onErrorContainer', '--ink'],
  ['surface', '--surface'],
  ['onSurface', '--ink'],
  ['surfaceDim', '--bg'],
  ['surfaceBright', '--bg-2'],
  ['surfaceContainerLowest', '--surface'],
  ['surfaceContainerLow', '--surface'],
  ['surfaceContainer', '--surface-2'],
  ['surfaceContainerHigh', '--surface-2'],
  ['surfaceContainerHighest', '--surface-3'],
  ['onSurfaceVariant', '--ink-2'],
  ['outline', '--line-strong'],
  ['outlineVariant', '--line'],
  ['surfaceTint', '--accent'],
  ['inverseSurface', '--ink'],
  ['onInverseSurface', '--surface'],
  ['inversePrimary', '--accent-fg'],
  ['shadow', '--ink'],
  ['scrim', '--face-anchor'],
];
// verify every mapped token is a curated §2.1 colour
{
  const colourNames = new Set(colours.map((c) => c.name));
  for (const [, token] of schemeMap)
    if (!colourNames.has(token)) fail(`ThemeData slot map uses unmapped token ${token}`);
}

L.push('/// Light/dark `ThemeData` built from the measured tokens — playbook §2.4 step 4.');
L.push('///');
L.push('/// Every ColorScheme slot is pinned to a §2.1 token (the table is the');
L.push('/// generator-side `schemeMap`): the web authors no Material-specific');
L.push('/// secondary/fixed/scrim colours, so those slots are PINS, not new design');
L.push('/// values — they exist so no Material baseline (e.g. the M3 purple) can');
L.push('/// surface where the spec never measured one. Text roles map monotonically');
L.push('/// onto the measured `--text-*` ladder, each rung a §2.3 value and the clamp');
L.push('/// rungs the §3 phone column; weights are not attached to Material roles');
L.push('/// because the measurement attaches them to §3 classes, not to text tokens.');
L.push('/// Font families are intentionally NOT set: §3.1 makes bundling the three');
L.push('/// web families an open approval, and a missing family silently re-glyphs');
L.push('/// every golden screenshot.');
L.push('ThemeData appThemeData({required bool isDark}) {');
L.push('  Color c(String token) => AppTokens.colorOf(token, isDark: isDark);');
L.push('  final ColorScheme scheme =');
L.push('      (isDark ? const ColorScheme.dark() : const ColorScheme.light()).copyWith(');
for (const [slot, token] of schemeMap) L.push(`        ${slot}: c('${token}'),`);
L.push('      );');
L.push("  final Color ink = c('--ink');");
L.push("  final Color ink2 = c('--ink-2');");
L.push('  return ThemeData(');
L.push('    brightness: isDark ? Brightness.dark : Brightness.light,');
L.push('    colorScheme: scheme,');
L.push("    scaffoldBackgroundColor: c('--bg'),");
L.push("    canvasColor: c('--bg'),");
L.push("    cardColor: c('--surface'),");
L.push("    dialogTheme: DialogThemeData(backgroundColor: c('--surface')),");
L.push('    textTheme: appTextTheme(ink: ink, muted: ink2),');
L.push('    extensions: <ThemeExtension<dynamic>>[isDark ? AppTokens.dark : AppTokens.light],');
L.push('  );');
L.push('}');
L.push('');

const textThemeMap = [
  ['displayLarge', '--text-num', 'ink'],
  ['displayMedium', '--text-4xl', 'ink'],
  ['displaySmall', '--text-3xl', 'ink'],
  ['headlineLarge', '--text-display', 'ink'],
  ['headlineMedium', '--text-2xl', 'ink'],
  ['headlineSmall', '--text-xl', 'ink'],
  ['titleLarge', '--text-lg', 'ink'],
  ['titleMedium', '--text-base', 'ink'],
  ['titleSmall', '--text-sm', 'ink'],
  ['bodyLarge', '--text-base', 'ink'],
  ['bodyMedium', '--text-sm', 'ink'],
  ['bodySmall', '--text-xs', 'ink'],
  ['labelLarge', '--text-sm', 'muted'],
  ['labelMedium', '--text-xs', 'muted'],
  ['labelSmall', '--text-2xs', 'muted'],
];
L.push('/// The §2.3 text ladder wired into the Material roles — see appThemeData doc.');
L.push('/// `--text-base` measured no line-height utility, so its styles inherit Flutter');
L.push('/// line metrics; every other rung carries the measured multiplier.');
L.push('TextTheme appTextTheme({required Color ink, required Color muted}) {');
L.push('  TextStyle r(String token, Color color) => TextStyle(');
L.push('        fontSize: AppTypography.sizesByToken[token],');
L.push('        height: AppTypography.lineHeightsByToken[token],');
L.push('        color: color);');
L.push('  return TextTheme(');
for (const [role, token, colourVar] of textThemeMap) L.push(`    ${role}: r('${token}', ${colourVar}),`);
L.push('  );');
L.push('}');
finish('app_theme.dart');

// ---------------------------------------------------------------- component classes (UI_SPEC §6)
// The card surfaces of §6, emitted as data rather than re-derived inside widgets.
// Every field is read from the §6 probe entries of the measurement — a detached
// element carrying that class, measured inside the themed document — and never
// from the prose tables that render them, and never from a Material default.
// `.card-sm` is deliberately absent: it is used nowhere under `src/` and the
// probe confirms it paints nothing (radius 0, transparent fill, no shadow).
const SURFACE_CLASSES = [
  '.card',
  '.card-flat',
  '.card-lg',
  '.card-dark',
  '.gradient-card',
  '.glass-panel',
  '.glass-pill',
  '.card-face',
];

const SURFACE_FIELDS = [
  'cssClass',
  'radiusPx',
  'borderWidthPx',
  'borderColor',
  'fillColor',
  'fillGradient',
  'shadows',
  'blurPx',
  'saturate',
  'paddingPx',
  'textColor',
];

const probeRaw = (entry, field, cls) => {
  const v = entry[field];
  if (v === undefined) fail(`${cls}: the probe did not measure ${field}`);
  return typeof v === 'string' ? v : v.raw;
};

const probeSrgb = (entry, field, cls) => {
  const v = entry[field];
  if (!v || !v.srgb) fail(`${cls}: ${field} is not a measured colour`);
  return v.srgb;
};

const probeGradient = (entry, cls) => {
  const img = entry.backgroundImage;
  if (!img) fail(`${cls}: no backgroundImage probe`);
  if (img.raw === 'none') return null;
  return parseGradient(img.substituted || img.raw, `${cls} background-image`);
};

const probeShadow = (entry, cls) => {
  const bs = entry.boxShadow;
  if (!bs) fail(`${cls}: no boxShadow probe`);
  if (bs.raw === 'none') return null;
  return probeShadowList(bs.substituted || bs.raw, cls);
};

/** `blur(22px) saturate(1.4)` -> {px, saturate}; `none` -> nulls. */
const probeBackdrop = (entry, cls) => {
  const bf = entry.backdropFilter;
  if (!bf) fail(`${cls}: no backdropFilter probe`);
  if (bf.raw === 'none') return { px: null, saturate: null };
  const b = /blur\(([\d.]+)px\)/.exec(bf.raw);
  const sat = /saturate\(([\d.]+)\)/.exec(bf.raw);
  if (!b || !sat) fail(`${cls}: unportable backdrop-filter "${bf.raw}"`);
  return { px: parseFloat(b[1]), saturate: parseFloat(sat[1]) };
};

/** Top-level comma split: a shadow list has commas inside `rgba(…)` never between layers. */
const splitLayers = (raw, cls) => {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of raw) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (depth === 0 && ch === ',') {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  if (depth !== 0) fail(`${cls}: unbalanced parentheses in "${raw}"`);
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
};

/**
 * One box-shadow layer list of a §6 probe. The order is not the order of §2.2:
 * the authored CSS the token table prints is layer-first
 * (`0 1px 2px rgba(13, 22, 36, .05)`), which [parseShadow] reads, while a
 * probed element's COMPUTED `boxShadow` comes back from Chrome colour-first
 * with four lengths always (`rgba(13, 22, 36, 0.05) 0px 1px 2px 0px`). Same
 * numbers, different order, so the two parsers are named for the two sources
 * instead of one guessing.
 */
const probeShadowList = (raw, cls) =>
  splitLayers(raw, cls).map((layer) => {
    const m = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)((?:\s+-?[\d.]+(?:px)?){4})$/.exec(layer);
    if (!m) fail(`${cls}: not a "rgba(…) x y blur spread" shadow layer: "${layer}"`);
    const n = m[5].trim().split(/\s+/).map(parseFloat);
    return {
      dx: n[0],
      dy: n[1],
      blur: n[2],
      spread: n[3],
      colour: { r: +m[1], g: +m[2], b: +m[3], a: parseFloat(m[4]) },
    };
  });

const probePx = (entry, field, cls) => lengthPx(probeRaw(entry, field, cls), `${cls} ${field}`);

const surfaces = SURFACE_CLASSES.map((cls) => {
  const read = (tag, theme) => {
    const p = theme.probes[cls];
    if (!p) fail(`${tag} theme has no ${cls} probe`);
    return {
      radiusPx: probePx(p, 'borderRadius', cls),
      borderWidthPx: probePx(p, 'borderTopWidth', cls),
      borderColor: probeSrgb(p, 'borderTopColor', cls),
      fillColor: probeSrgb(p, 'backgroundColor', cls),
      gradient: probeGradient(p, cls),
      shadows: probeShadow(p, cls),
      backdrop: probeBackdrop(p, cls),
      paddingPx: probePx(p, 'padding', cls),
      textColor: probeSrgb(p, 'color', cls),
    };
  };
  const l = read('light-desktop', LIGHT);
  const d = read('dark-desktop', DARK);
  // The phone pass must not move the box: §6.2 prints one radius column and the
  // measurement agrees with it. If it ever stops agreeing that is a spec fact to
  // review, not something to average away here.
  for (const [tag, theme] of [
    ['light-phone', LIGHT_PHONE],
    ['dark-phone', DARK_PHONE],
  ]) {
    const p = theme.probes[cls];
    if (!p) fail(`${tag} theme has no ${cls} probe`);
    if (probePx(p, 'borderRadius', cls) !== l.radiusPx) {
      fail(`${cls}: ${tag} radius ${p.borderRadius} != desktop ${l.radiusPx}`);
    }
  }
  if (l.borderWidthPx !== d.borderWidthPx) fail(`${cls}: border width differs per pass`);
  if (l.paddingPx !== d.paddingPx) fail(`${cls}: padding differs per pass`);
  if (
    l.gradient &&
    d.gradient &&
    (l.gradient.angle !== d.gradient.angle || l.gradient.stops.length !== d.gradient.stops.length)
  ) {
    fail(`${cls}: light and dark gradient geometry differ`);
  }
  if (JSON.stringify(l.backdrop) !== JSON.stringify(d.backdrop)) {
    fail(`${cls}: backdrop-filter differs per pass`);
  }
  return { cls, l: { ...l, cssClass: cls }, d: { ...d, cssClass: cls } };
});

/**
 * `dartColor` reads `alpha`, which the §2.1/§2.2 row objects carry, while the
 * shadow and gradient parsers return `a`. This adapter names that mismatch
 * instead of printing `undefined`, and formats an integer alpha the way Dart
 * wants a double (`0` -> `0.0`) so a measured transparent colour reads as one.
 */
const dartSurfaceColour = (c) => `Color.fromRGBO(${c.r}, ${c.g}, ${c.b}, ${c.alpha === 1 ? '1.0' : fmt(c.alpha)})`;

const gradientExpr = (g) => {
  const a = gradientAlignments(g.angle);
  return [
    'LinearGradient(',
    `    begin: Alignment(${fmt(a.begin[0])}, ${fmt(a.begin[1])}),`,
    `    end: Alignment(${fmt(a.end[0])}, ${fmt(a.end[1])}),`,
    '    colors: <Color>[',
    ...g.stops.map(
      (s) => `      ${dartSurfaceColour({ r: s.colour.r, g: s.colour.g, b: s.colour.b, alpha: s.colour.a })},`,
    ),
    '    ],',
    `    stops: <double>[${g.stops.map((s) => fmt(s.at)).join(', ')}],`,
    ')',
  ].join('\n');
};

const shadowListExpr = (layers) =>
  [
    '<BoxShadow>[',
    ...layers.flatMap((y) => [
      '    BoxShadow(',
      `      color: ${dartSurfaceColour({ r: y.colour.r, g: y.colour.g, b: y.colour.b, alpha: y.colour.a })},`,
      `      offset: Offset(${fmt(y.dx)}, ${fmt(y.dy)}),`,
      `      blurRadius: ${fmt(y.blur)},`,
      ...(y.spread === 0 ? [] : [`      spreadRadius: ${fmt(y.spread)},`]),
      '    ),',
    ]),
    ']',
  ].join('\n');

const surfaceFieldExpr = (spec, f) => {
  switch (f) {
    case 'cssClass':
      return `cssClass: ${dartStr(spec.cssClass)}`;
    case 'radiusPx':
      return `radiusPx: ${fmt(spec.radiusPx)}`;
    case 'borderWidthPx':
      return `borderWidthPx: ${fmt(spec.borderWidthPx)}`;
    case 'borderColor':
      return `borderColor: ${dartSurfaceColour(spec.borderColor)}`;
    case 'fillColor':
      return `fillColor: ${dartSurfaceColour(spec.fillColor)}`;
    case 'fillGradient':
      return `fillGradient: ${spec.gradient ? gradientExpr(spec.gradient) : 'null'}`;
    case 'shadows':
      return `shadows: ${spec.shadows ? shadowListExpr(spec.shadows) : 'null'}`;
    case 'blurPx':
      return `blurPx: ${spec.backdrop.px === null ? 'null' : fmt(spec.backdrop.px)}`;
    case 'saturate':
      return `saturate: ${spec.backdrop.saturate === null ? 'null' : fmt(spec.backdrop.saturate)}`;
    case 'paddingPx':
      return `paddingPx: ${fmt(spec.paddingPx)}`;
    case 'textColor':
      return `textColor: ${dartSurfaceColour(spec.textColor)}`;
    default:
      fail(`surface field ${f} has no emitter`);
  }
};

const surfaceExpr = (spec) => SURFACE_FIELDS.map((f) => `    ${surfaceFieldExpr(spec, f)}`).join(',\n');

banner();
L.push("import 'package:flutter/material.dart';", '');
L.push(
  '/// One UI_SPEC §6 component class resolved for one brightness: what a detached',
  '/// element carrying that CSS class was measured to paint. `AppCard` renders these;',
  '/// a screen widget must not restate any of it. Every value is a §6 probe row of',
  '/// `parity/ui-tokens.json` — not UI_SPEC §5, and never a Material default.',
  '///',
  '/// Conventions the measurement forces:',
  '/// * `fillGradient == null` with a zero-alpha `fillColor` is UI_SPEC `(none)`: the',
  '///   class paints no background of its own and the surface behind shows through.',
  '/// * A zero-alpha `borderColor` is a *transparent* border, not an absent one —',
  '///   `.card-flat` carries a real 1px frame of `rgba(0,0,0,0)` that occupies layout.',
  '///   Where the measured width is 0px the printed colour is whatever the element',
  '///   inherited, which is why `.card-lg` and `.card-face` name an ink border they',
  '///   never draw.',
  '/// * `blurPx` is the measured CSS blur; Flutter renders it as',
  '///   `ImageFilter.blur(sigmaX: blurPx / 2, sigmaY: blurPx / 2)`. The CSS',
  '///   `saturate(1.4)` has no Flutter equivalent, so it travels here as data and is',
  '///   unimplemented — recorded rather than silently dropped.',
  '/// * `.gradient-card` measures transparent in the dark pass: the `!important`',
  '///   repaint layer of §6.3 forces the gradient on the light theme only. That is',
  '///   the web app’s behaviour, ported as measured on the D16 bug-compatible',
  '///   precedent rather than “fixed”.',
  'class AppSurfaceSpec {',
  '  const AppSurfaceSpec({',
  ...SURFACE_FIELDS.map((f) => `    required this.${f},`),
  '  });',
  '',
  '  /// The CSS class this row was measured from.',
  '  final String cssClass;',
  '  final double radiusPx;',
  '',
  '  /// Measured on one side; `src/index.css` authors every one of these classes as',
  '  /// `border: 1px solid …`, i.e. uniform, and [border] reproduces that box.',
  '  final double borderWidthPx;',
  '  final Color borderColor;',
  '  final Color fillColor;',
  '  final LinearGradient? fillGradient;',
  '  final List<BoxShadow>? shadows;',
  '',
  '  /// `backdrop-filter` blur in measured CSS px; the sigma is `blurPx / 2`.',
  '  final double? blurPx;',
  '  final double? saturate;',
  '',
  '  /// The class’s own padding. `.card` measures `0px` because on the web the',
  '  /// utilities (`p-4`, `p-5`, `p-6`) supply it, so `AppCard` takes padding as a',
  '  /// parameter and `AppSpacing.scale(n)` is that same utility multiplication.',
  '  final double paddingPx;',
  '',
  '  /// The text colour the class paints, which is not always the inherited one:',
  '  /// `.card-face` and `.card-dark` force white.',
  '  final Color textColor;',
  '',
  '  BorderRadius get borderRadius => BorderRadius.circular(radiusPx);',
  '',
  '  Border get border => Border.all(color: borderColor, width: borderWidthPx);',
  '',
  '  List<BoxShadow> get boxShadowList => shadows ?? const <BoxShadow>[];',
  '',
  '  /// UI_SPEC `(none)`: paints nothing of its own behind the content.',
  '  bool get paintsFill => fillGradient != null || fillColor != const Color(0x00000000);',
  '',
  '  double? get blurSigma => blurPx == null ? null : blurPx! / 2;',
  '}',
  '',
  '/// The §6 card surfaces, keyed by CSS class — one map per measured brightness pass.',
  'abstract final class AppSurfaces {',
  '  /// Light pass (UI_SPEC §6.1–§6.2, `light-desktop`).',
  '  static const Map<String, AppSurfaceSpec> light =',
  '      <String, AppSurfaceSpec>{',
);
for (const x of surfaces) {
  L.push(`    ${dartStr(x.cls)}: AppSurfaceSpec(`, surfaceExpr(x.l), '    ),');
}
L.push('  };', '', '  /// Dark pass (UI_SPEC §6.1–§6.2, `dark-desktop`).');
L.push('  static const Map<String, AppSurfaceSpec> dark =', '      <String, AppSurfaceSpec>{');
for (const x of surfaces) {
  L.push(`    ${dartStr(x.cls)}: AppSurfaceSpec(`, surfaceExpr(x.d), '    ),');
}
L.push(
  '  };',
  '',
  '  /// The measured surface for a class and brightness. An unknown class is a',
  '  /// programming error, not a fallback: nothing in this layer may quietly',
  '  /// become a Material default.',
  '  static AppSurfaceSpec resolve(String cssClass, Brightness brightness) {',
  '    final Map<String, AppSurfaceSpec> table =',
  '        brightness == Brightness.dark ? dark : light;',
  '    final AppSurfaceSpec? spec = table[cssClass];',
  "    if (spec == null) throw ArgumentError('$cssClass is not a §6 surface');",
  '    return spec;',
  '  }',
  '}',
  '',
);
finish('app_surfaces.dart');
// ---------------------------------------------------------------- §6 controls (UI_SPEC buttons)
// `AppButton`'s two paintable classes. Their base state is probed like every other
// §6 class, so fill, text, border, radius and type come from Chrome. Their
// PRESSED and DISABLED appearance is authored in `src/index.css`, which the probe
// cannot see: the file is byte-identical to the tag the measurement was taken at
// (`git diff --stat pre-flutter HEAD -- src/index.css` prints nothing), so it is
// the same pinned source and not a newer one. `:hover` exists in the CSS and is
// deliberately NOT ported — UI_SPEC D-U1 rules hover "decoration, not contract"
// for a touch screen.
const CONTROL_CLASSES = ['.btn-primary', '.btn-ghost'];
// The §6 text field is a control of the same kind — probed at rest, read out of
// the pinned stylesheet for its states — but the states it authors are `:focus`
// and `::placeholder`, not `:active`/`:disabled`. Its rows go into `AppFields`
// rather than `AppControls` so a spec holds only what its own class authors:
// a field with a press offset and a button with a focus ring would both be
// carrying numbers no browser ever painted for them.
const FIELD_CLASSES = ['.input'];
// `.eyebrow` is the label `src/components/ui/Input.tsx` puts above the field. It
// is a resting-only §6 class: no transition, no state rule, and one declaration
// (`text-transform: uppercase`) that changes what the user sees without changing
// the string — Flutter has no CSS case mapping, so the widget has to do it.
const LABEL_CLASSES = ['.eyebrow'];
// The §6 loading placeholder. Its resting box is a probe like any other, but the
// appearance the class is known for lives on `.skeleton::after`: a gradient the
// element itself never carries, moved by a `@keyframes` block. A probe cannot see
// a pseudo-element, so the sweep is read out of the pinned stylesheet and the
// tokens it substitutes are read from the same pass's measured `:root`.
const SKELETON_CLASSES = ['.skeleton'];
const CSS_LINES = fs.readFileSync(path.join(ROOT, 'src', 'index.css'), 'utf8').split(/\r?\n/);

/** The text of the rule whose head line matches `headRe`, with its line number.
 *  `window` caps how many lines past the head to scan for the closing brace; the
 *  default suits the short resting rules, and a caller whose rule wraps a
 *  multi-line declaration (e.g. `.icon-btn`'s transition) widens it. The scan
 *  still stops at the first `}`-terminated line, so a larger window only ever
 *  lets a longer-but-honest rule be read, never over-captures a short one. */
const cssRule = (headRe, cls, window = 16) => {
  const i = CSS_LINES.findIndex((l) => headRe.test(l));
  if (i < 0) fail(`${cls}: no rule head matching ${headRe} in src/index.css`);
  const body = [];
  let closed = false;
  for (let j = i; j < CSS_LINES.length && j - i <= window; j++) {
    body.push(CSS_LINES[j]);
    if (/\}\s*$/.test(CSS_LINES[j])) {
      closed = true;
      break;
    }
  }
  if (!closed) fail(`${cls}: rule at src/index.css:${i + 1} never closes`);
  return { line: i + 1, text: body.join('\n') };
};

/** One declaration of a parsed rule, or a generation failure — never a default. */
const cssDecl = (rule, prop, cls) => {
  const m = new RegExp(`${prop}:\\s*([^;]+);`).exec(rule.text);
  if (!m) fail(`${cls}: no \`${prop}\` in src/index.css:${rule.line}`);
  return m[1].trim();
};

/** Every `prop: value` pair of a parsed rule, in source order, head line dropped. */
const ruleProps = (rule, cls) => {
  // The body is between the first `{` and the last `}`: a `:disabled` rule is
  // authored as a two-line selector list, so dropping "the head line" is not
  // enough — the head is every line before the brace.
  const open = rule.text.indexOf('{');
  const close = rule.text.lastIndexOf('}');
  if (open < 0 || close < open) {
    fail(`${cls}: the rule at src/index.css:${rule.line} has no readable body`);
  }
  const body = rule.text.slice(open + 1, close);
  const out = [];
  for (const part of body.split(';')) {
    const decl = part.replace(/[{}]/g, '').trim();
    if (!decl) continue;
    const i = decl.indexOf(':');
    if (i < 0) fail(`${cls}: "${decl}" at src/index.css:${rule.line} is not a declaration`);
    out.push([decl.slice(0, i).trim(), decl.slice(i + 1).trim()]);
  }
  if (!out.length) fail(`${cls}: the rule at src/index.css:${rule.line} declares nothing`);
  return out;
};

/** The whole property set of a state rule, against what AppControlSpec can hold. A
 *  state the web widens has to fail generation: a silently dropped declaration is a
 *  phone that disagrees with the browser the moment it is pressed or disabled. */
const checkStateProps = (props, allowed, label, cls, line) => {
  for (const [prop] of props) {
    if (!allowed.includes(prop)) {
      fail(`${cls}: ${label} sets \`${prop}\` (src/index.css:${line}); AppControlSpec cannot port it`);
    }
  }
};

/** An authored colour that is a bare `var(--token)`, substituted from the same
 *  pass's measured `:root`. Chrome's probe only sees the resting state, so this is
 *  the substitution the browser would make, taken from the pinned measurement. */
const authoredColour = (value, theme, themeTag, label, cls) => {
  const m = /^var\((--[a-z0-9-]+)\)$/.exec(value);
  if (!m) fail(`${cls}: ${label} "${value}" is not a bare var(--token); the port cannot substitute it`);
  const t = theme.root[m[1]];
  if (!t || !t.srgb) fail(`${cls}: ${label} references ${m[1]}, which is not a measured colour in ${themeTag}`);
  return { token: m[1], srgb: t.srgb };
};

/** Flutter takes one family name where CSS takes a fallback stack, so the port
 *  keeps the first family of the measured stack — the same rule
 *  `app_typography.dart` is generated with. It matters here: `.btn-primary` and
 *  `.btn-ghost` both author `--font-display`, so a label that inherits the
 *  theme’s body font is not the measured control.
 */
const probeFamily = (p, cls) => {
  const raw = probeRaw(p, 'fontFamily', cls);
  const first = raw.split(',')[0].replace(/["']/g, '').trim();
  if (!first) fail(`${cls}: fontFamily probe "${raw}" has no first family`);
  return first;
};

/** The four §6 control properties a single `AnimatedContainer` can carry: the
 *  box's fill and border colour, and its transform. Anything else in a
 *  `transition` shorthand is a property the port has no field for. A text field
 *  animates its border and its focus ring instead of its fill and offset, so the
 *  vocabulary is per family rather than one list for every §6 class. */
const CONTROL_TRANSITION_PROPS = ['background-color', 'border-color', 'transform'];
const FIELD_TRANSITION_PROPS = ['border-color', 'box-shadow'];

/** A `var(--token)` reference on its own, as a state or motion rule authors it. */
const tokenRef = (value, label, cls) => {
  const m = /^var\((--[a-z0-9-]+)\)$/.exec(value);
  if (!m) fail(`${cls}: ${label} "${value}" is not a bare var(--token); the port cannot substitute it`);
  return m[1];
};

/** The measured §4 token a rule names, by name. */
const motionToken = (list, name, label, cls) => {
  const t = list.find((o) => o.name === name);
  if (!t) fail(`${cls}: the ${label} ${name} is not a §4 motion token the measurement emitted`);
  return t;
};

/** What the class itself says about how a state change runs. `AnimatedContainer`
 *  drives the whole box with one duration and one curve, so this accepts a
 *  shorthand whose items all name the same pair; a rule that splits the clock per
 *  property would need a controller per property, which is a §6 fact the port does
 *  not have. The values are the measured tokens', never a widget's choice. */
const controlTransition = (rule, cls, allowed = CONTROL_TRANSITION_PROPS) => {
  const raw = cssDecl(rule, 'transition', cls).replace(/\s+/g, ' ').trim();
  const items = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length);
  if (!items.length) fail(`${cls}: \`transition: ${raw}\` lists nothing to animate`);
  const props = [];
  let dur = null;
  let ease = null;
  for (const item of items) {
    const parts = item.split(/\s+/);
    if (parts.length !== 3) {
      fail(`${cls}: transition item "${item}" is not \`property var(--dur) var(--ease)\``);
    }
    const [prop, durRef, easeRef] = parts;
    if (!allowed.includes(prop)) {
      fail(`${cls}: transition animates \`${prop}\`, which the row for ${cls} cannot port`);
    }
    if (props.includes(prop)) fail(`${cls}: transition lists \`${prop}\` twice`);
    props.push(prop);
    const d = motionToken(durs, tokenRef(durRef, 'transition duration', cls), 'duration', cls);
    const e = motionToken(curves, tokenRef(easeRef, 'transition easing', cls), 'timing', cls);
    if (dur && dur.name !== d.name) {
      fail(`${cls}: the transition splits its clock (${dur.name} then ${d.name}); AppControls ports one duration`);
    }
    if (ease && ease.name !== e.name) {
      fail(`${cls}: the transition splits its curve (${ease.name} then ${e.name}); AppControls ports one curve`);
    }
    dur = d;
    ease = e;
  }
  return {
    props,
    dur,
    ease,
    ms: msOf(dur.raw, dur.name),
    curve: cubicOf(ease.raw, ease.name),
  };
};

/** CSS `padding` shorthand as far as a symmetric box needs it. */
const probePadding = (p, cls) => {
  const raw = probeRaw(p, 'padding', cls);
  const n = raw.split(/\s+/).map((s) => lengthPx(s, `${cls} padding`));
  const [top, right = top, bottom = top, left = right] = n;
  if (n.length > 4) fail(`${cls}: padding shorthand "${raw}" has too many values`);
  if (top !== bottom || left !== right) {
    fail(`${cls}: padding "${raw}" is asymmetric; port it as EdgeInsets.fromLTRB, not a v/h pair`);
  }
  return { vertical: top, horizontal: left };
};

/** A `read()` row flattened to what `!==` can decide, so a pass comparison is a
 *  scalar comparison. Colours enter as their measured hex; any other object field
 *  fails generation rather than being skipped, because an unexamined field is a
 *  property the phone could disagree about in silence. */
const CONTROL_COLOUR_FIELDS = ['borderColor', 'fillColor', 'textColor'];
const controlRow = (row, cls) => {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (CONTROL_COLOUR_FIELDS.includes(key)) {
      out[key] = value.hex;
    } else if (value === null || typeof value !== 'object') {
      out[key] = value;
    } else {
      fail(`${cls}: the ${key} field is an object the pass check cannot compare`);
    }
  }
  return out;
};

/** The resting box and type of a §6 class, straight from its probe: the computed
 *  properties Chrome reads for every §6 class. State appearances are not here —
 *  a static probe cannot see a pressed, focused or disabled element, so each map
 *  below reads those out of `src/index.css` instead. */
const probeRestRow = (cls, tag, theme) => {
  const p = theme.probes[cls];
  if (!p) fail(`${tag} theme has no ${cls} probe`);
  if (probeRaw(p, 'boxShadow', cls) !== 'none') {
    fail(
      `${cls}: the resting probe carries a box-shadow (${probeRaw(p, 'boxShadow', cls)}); no §6 row ports a resting shadow`,
    );
  }
  if (p.backdropFilter && p.backdropFilter.raw !== 'none') {
    fail(`${cls}: carries a backdrop-filter (${p.backdropFilter.raw}); port it through AppSurfaceSpec instead`);
  }
  const pad = probePadding(p, cls);
  const lineRaw = probeRaw(p, 'lineHeight', cls);
  const spaceRaw = probeRaw(p, 'letterSpacing', cls);
  return {
    displayCss: probeRaw(p, 'display', cls),
    radiusPx: probePx(p, 'borderRadius', cls),
    borderWidthPx: probePx(p, 'borderTopWidth', cls),
    borderColor: probeSrgb(p, 'borderTopColor', cls),
    fillColor: probeSrgb(p, 'backgroundColor', cls),
    textColor: probeSrgb(p, 'color', cls),
    fontFamily: probeFamily(p, cls),
    fontSizePx: probePx(p, 'fontSize', cls),
    fontWeight: (() => {
      const w = probeRaw(p, 'fontWeight', cls);
      if (!/^([1-9]00)$/.test(w)) fail(`${cls}: fontWeight "${w}" is not a 100-900 step`);
      return parseInt(w, 10);
    })(),
    lineHeightPx: lineRaw === 'normal' ? null : lengthPx(lineRaw, `${cls} lineHeight`),
    letterSpacingPx: spaceRaw === 'normal' ? 0.0 : lengthPx(spaceRaw, `${cls} letterSpacing`),
    letterSpacingRaw: spaceRaw,
    paddingVerticalPx: pad.vertical,
    paddingHorizontalPx: pad.horizontal,
  };
};

/** The fields a box's geometry and type are made of. They are compared between
 *  the two brightness passes: a weight or a radius that moved with the colour
 *  scheme would be a §6 fact to review, so the check runs on the fields rather
 *  than on a hunch, and §6 prints one row for each. */
const BRIGHTNESS_STABLE_FIELDS = [
  'displayCss',
  'radiusPx',
  'borderWidthPx',
  'fontFamily',
  'fontSizePx',
  'fontWeight',
  'lineHeightPx',
  'letterSpacingPx',
  'paddingVerticalPx',
  'paddingHorizontalPx',
];

/** Neither the phone viewport nor the other colour scheme may move anything the
 *  port carries: `AppControls` and `AppFields` key one row per brightness, so a
 *  value that differs on the phone pass is a media rule to model, not to
 *  average, and a value that differs between schemes is a split the §6 table
 *  does not print. */
const comparePassRows = (cls, l, d) => {
  for (const [tag, theme, want] of [
    ['light-phone', LIGHT_PHONE, l],
    ['dark-phone', DARK_PHONE, d],
  ]) {
    const rowP = controlRow(probeRestRow(cls, tag, theme), cls);
    const rowW = controlRow(want, cls);
    for (const [key, value] of Object.entries(rowP)) {
      if (rowW[key] !== value) {
        fail(`${cls}: ${key} is "${value}" on ${tag} but "${rowW[key]}" on its desktop pass`);
      }
    }
  }
  for (const key of BRIGHTNESS_STABLE_FIELDS) {
    if (l[key] !== d[key]) {
      fail(`${cls}: ${key} is "${l[key]}" in light and "${d[key]}" in dark; §6 prints one row`);
    }
  }
};

const controls = CONTROL_CLASSES.map((cls) => {
  const l = probeRestRow(cls, 'light-desktop', LIGHT);
  const d = probeRestRow(cls, 'dark-desktop', DARK);
  comparePassRows(cls, l, d);

  const off = cssRule(new RegExp(`^\\${cls}:disabled,$`), cls);
  const act = cssRule(new RegExp(`^\\${cls}:active \\{$`), cls);
  const hov = CSS_LINES.findIndex((x) => new RegExp(`^\\${cls}:hover \\{$`).test(x));
  const disabledOpacity = parseFloat(cssDecl(off, 'opacity', cls));
  if (!Number.isFinite(disabledOpacity) || disabledOpacity <= 0 || disabledOpacity > 1) {
    fail(`${cls}: disabled opacity "${cssDecl(off, 'opacity', cls)}" is not a fraction`);
  }
  if (cssDecl(off, 'transform', cls) !== 'none') {
    fail(`${cls}: the disabled rule must reset transform, or the press offset survives disabling`);
  }
  const tr = cssDecl(act, 'transform', cls);
  const tm = /^translateY\(([-\d.]+)px\)$/.exec(tr);
  if (!tm) fail(`${cls}: active transform "${tr}" is not a plain translateY(Npx)`);
  checkStateProps(ruleProps(off, cls), ['opacity', 'cursor', 'transform'], ':disabled', cls, off.line);
  const activeProps = ruleProps(act, cls);
  checkStateProps(activeProps, ['transform', 'background'], ':active', cls, act.line);
  const activeBg = activeProps.find(([prop]) => prop === 'background');
  l.pressFill = activeBg ? authoredColour(activeBg[1], LIGHT, 'light-desktop', ':active background', cls) : null;
  d.pressFill = activeBg ? authoredColour(activeBg[1], DARK, 'dark-desktop', ':active background', cls) : null;
  if (activeBg) {
    if (l.pressFill.token !== d.pressFill.token) {
      fail(`${cls}: the :active background token differs between the light and dark passes`);
    }
    for (const [pass, themeTag] of [
      [l, 'light-desktop'],
      [d, 'dark-desktop'],
    ]) {
      if (pass.pressFill.srgb.hex === pass.fillColor.hex) {
        fail(
          `${cls}: ${themeTag} :active repaints the resting fill — the rule is a no-op and the port should say so out loud`,
        );
      }
    }
  }
  const rest = cssRule(new RegExp(`^\\${cls} \\{$`), cls);
  const trans = controlTransition(rest, cls);
  // The port runs every state change of the box on this one clock, so the rule has
  // to name each property it actually changes: a fill the web snaps while the phone
  // eases — or the reverse — is a button that disagrees with the browser in motion.
  if (parseFloat(tm[1]) !== 0 && !trans.props.includes('transform')) {
    fail(`${cls}: :active moves the box but its transition omits transform (src/index.css:${rest.line})`);
  }
  if (activeBg && !trans.props.includes('background-color')) {
    fail(`${cls}: :active repaints the fill but its transition omits background-color (src/index.css:${rest.line})`);
  }
  return {
    cls,
    l,
    d,
    disabledOpacity,
    pressDyPx: parseFloat(tm[1]),
    pressToken: activeBg ? l.pressFill.token : null,
    transitionMs: trans.ms,
    transitionEase: trans.curve,
    transitionDurToken: trans.dur.name,
    transitionEaseToken: trans.ease.name,
    transitionProps: trans.props.join(', '),
    transitionSrc: `src/index.css:${rest.line}`,
    disabledSrc: `src/index.css:${off.line}`,
    activeSrc: `src/index.css:${act.line}`,
    hoverSrc: hov < 0 ? 'none' : `src/index.css:${hov + 1}`,
  };
});

const controlExpr = (c, pass) =>
  [
    `      cssClass: ${dartStr(c.cls)},`,
    `      displayCss: ${dartStr(pass.displayCss)},`,
    `      radiusPx: ${fmt(pass.radiusPx)},`,
    `      borderWidthPx: ${fmt(pass.borderWidthPx)},`,
    `      borderColor: ${dartSurfaceColour(pass.borderColor)},`,
    `      fillColor: ${dartSurfaceColour(pass.fillColor)},`,
    `      textColor: ${dartSurfaceColour(pass.textColor)},`,
    `      fontFamily: ${dartStr(pass.fontFamily)},`,
    `      fontSizePx: ${fmt(pass.fontSizePx)},`,
    `      fontWeight: ${pass.fontWeight},`,
    `      lineHeightPx: ${pass.lineHeightPx === null ? 'null' : fmt(pass.lineHeightPx)},`,
    `      letterSpacingPx: ${fmt(pass.letterSpacingPx)},`,
    `      paddingVerticalPx: ${fmt(pass.paddingVerticalPx)},`,
    `      paddingHorizontalPx: ${fmt(pass.paddingHorizontalPx)},`,
    `      disabledOpacity: ${fmt(c.disabledOpacity)},`,
    `      pressDyPx: ${fmt(c.pressDyPx)},`,
    `      pressFillColor: ${pass.pressFill === null ? 'null' : dartSurfaceColour(pass.pressFill.srgb)},`,
    `      transitionMs: ${c.transitionMs},`,
    `      easeX1: ${fmt(c.transitionEase[0])},`,
    `      easeY1: ${fmt(c.transitionEase[1])},`,
    `      easeX2: ${fmt(c.transitionEase[2])},`,
    `      easeY2: ${fmt(c.transitionEase[3])},`,
  ].join('\n');

// ================================================================ app_controls.dart
banner();
L.push(
  "import 'package:flutter/material.dart';",
  '',
  '/// One §6 control class, measured in its resting state and read out of',
  '/// `src/index.css` in its pressed and disabled states. A widget under',
  '/// `lib/presentation/` restates none of it.',
  'class AppControlSpec {',
  '  const AppControlSpec({',
  '    required this.cssClass,',
  '    required this.displayCss,',
  '    required this.radiusPx,',
  '    required this.borderWidthPx,',
  '    required this.borderColor,',
  '    required this.fillColor,',
  '    required this.textColor,',
  '    required this.fontFamily,',
  '    required this.fontSizePx,',
  '    required this.fontWeight,',
  '    required this.lineHeightPx,',
  '    required this.letterSpacingPx,',
  '    required this.paddingVerticalPx,',
  '    required this.paddingHorizontalPx,',
  '    required this.disabledOpacity,',
  '    required this.pressDyPx,',
  '    required this.pressFillColor,',
  '    required this.transitionMs,',
  '    required this.easeX1,',
  '    required this.easeY1,',
  '    required this.easeX2,',
  '    required this.easeY2,',
  '  });',
  '',
  '  /// The CSS class this row was measured from.',
  '  final String cssClass;',
  '',
  '  /// The computed `display`. Carried as data, not applied: on the web these',
  '  /// classes are flex items and size to their content, which in Flutter is the',
  '  /// caller’s layout, not the widget’s paint.',
  '  final String displayCss;',
  '  final double radiusPx;',
  '',
  '  /// Measured on one side; the classes author `border: 1px solid …`, i.e.',
  '  /// uniform, and [border] reproduces that box.',
  '  final double borderWidthPx;',
  '  final Color borderColor;',
  '  final Color fillColor;',
  '  final Color textColor;',
  '  /// The class’s own `font-family` — its measured stack’s first family, so a',
  '  /// button label is `--font-display` and not the theme’s body font.',
  '  final String fontFamily;',
  '',
  '',
  '  /// §6.3 type: the class sets `font-size`/`font-weight` itself, so the label',
  '  /// cannot inherit the theme ladder and stay faithful.',
  '  final double fontSizePx;',
  '  final int fontWeight;',
  '  final double? lineHeightPx;',
  '',
  '  /// CSS `letter-spacing: normal` computes to 0; the measurement prints',
  '  /// `normal`, and that is what `ui_tokens_test.dart` re-checks.',
  '  final double letterSpacingPx;',
  '',
  '  /// The `padding` shorthand as one vertical / horizontal pair. The generator',
  '  /// fails rather than flattening an asymmetric box.',
  '  final double paddingVerticalPx;',
  '  final double paddingHorizontalPx;',
  '',
  '  /// Authored `:disabled { opacity: … }`, which Chrome’s probe cannot see. See',
  '  /// `src/index.css` for the class; UI_SPEC D-U1 drops `:hover` on purpose.',
  '  final double disabledOpacity;',
  '',
  '  /// Authored `:active { transform: translateY(…)px }`.',
  '  final double pressDyPx;',
  '  /// Authored `:active { background: … }`, substituted from the same pass’s',
  '  /// measured `:root` — Chrome’s probe only ever sees the resting state. Null',
  '  /// where the pressed state leaves the fill alone, so [activeFill] is then',
  '  /// [fillColor], which is what the browser keeps painting.',
  '  final Color? pressFillColor;',
  '  /// The class’s own authored `transition`: the measured milliseconds of the',
  '  /// duration token it names, and the four numbers of the easing token’s',
  '  /// `cubic-bezier(…)`. A widget reads its clock from this row and picks none;',
  '  /// `AppTokens` holds the same measurement keyed by token name.',
  '  final int transitionMs;',
  '',
  '  /// The four numbers of the class’s `cubic-bezier(…)`, kept verbatim:',
  '  /// `Curves.*` names are not parity targets.',
  '  final double easeX1;',
  '  final double easeY1;',
  '  final double easeX2;',
  '  final double easeY2;',
  '',
  '',
  '  BorderRadius get borderRadius => BorderRadius.circular(radiusPx);',
  '',
  '  Border get border => Border.all(color: borderColor, width: borderWidthPx);',
  '',
  '  /// The fill to paint while pressed. `.btn-primary` does not move its fill on',
  '  /// `:active`; `.btn-ghost` repaints it. See [pressFillColor].',
  '  Color get activeFill => pressFillColor ?? fillColor;',
  '',
  '  Duration get transitionDuration => Duration(milliseconds: transitionMs);',
  '',
  '  Cubic get transitionCurve =>',
  '      Cubic(easeX1, easeY1, easeX2, easeY2);',
  '',
  '  EdgeInsetsGeometry get padding => EdgeInsets.symmetric(',
  '    vertical: paddingVerticalPx,',
  '    horizontal: paddingHorizontalPx,',
  '  );',
  '',
  '  /// The 100-900 CSS step indexes the Dart enum directly; no weight is retyped.',
  '  FontWeight get weight => FontWeight.values[fontWeight ~/ 100 - 1];',
  '',
  '  /// Flutter’s line-height is a multiple of the font size, CSS’s is a length,',
  '  /// so this is the measured pair divided — not a number anyone chose.',
  '  double? get heightRatio =>',
  '      lineHeightPx == null ? null : lineHeightPx! / fontSizePx;',
  '}',
  '',
  '/// The §6 controls, keyed by CSS class — one map per measured brightness pass.',
  'abstract final class AppControls {',
);
for (const [passName, pass, themeTag] of [
  ['light', 'l', 'light-desktop'],
  ['dark', 'd', 'dark-desktop'],
]) {
  L.push(
    `  /// ${passName} pass (UI_SPEC §6.1–§6.3, \`${themeTag}\`; states from \`src/index.css\`).`,
    `  static const Map<String, AppControlSpec> ${passName} =`,
    '      <String, AppControlSpec>{',
  );
  for (const c of controls) {
    L.push(`    ${dartStr(c.cls)}: AppControlSpec(`, controlExpr(c, c[pass]), '    ),');
  }
  L.push('  };', '');
}
L.push(
  '  /// The state rules, printed once because both passes author them identically:',
  ...controls.flatMap((c) => [`  /// \`${c.cls}\` — disabled ${c.disabledSrc}, active ${c.activeSrc},`]),
  '  /// and the `:hover` rules the port drops (UI_SPEC D-U1):',
  ...controls.map((c) => `  /// \`${c.cls}:hover\` at ${c.hoverSrc}.`),
  '  /// The fill each pressed state paints, straight from the authored rules:',
  ...controls.map((c) => `  /// \`${c.cls}:active\` → ${c.pressToken ?? 'its resting fill'}`),
  '',
  '  /// The clock each class runs its state changes on, from its own rule:',
  ...controls.flatMap((c) => [
    `  /// \`${c.cls}\` transitions ${c.transitionProps} on`,
    `  /// \`${c.transitionDurToken}\` / \`${c.transitionEaseToken}\` (${c.transitionSrc}).`,
  ]),
  '',
  '  /// The measured control for a class and brightness. An unknown class is a',
  '  /// programming error, not a fallback: nothing in this layer may quietly',
  '  /// become a Material default.',
  '  static AppControlSpec resolve(String cssClass, Brightness brightness) {',
  '    final Map<String, AppControlSpec> table =',
  '        brightness == Brightness.dark ? dark : light;',
  '    final AppControlSpec? spec = table[cssClass];',
  "    if (spec == null) throw ArgumentError('$cssClass is not a §6 control');",
  '    return spec;',
  '  }',
  '}',
  '',
);
finish('app_controls.dart');
// ------------------------------------------------------- §6 fields and labels (text input)
// A field is a §6 control whose interesting state is FOCUS, not press. `.input`
// authors `:focus` (border colour plus a spread ring) and `::placeholder`, and no
// `:active` or `:disabled` rule at all — a disabled field keeps the resting paint,
// because the author’s own `background` and `color` outrank the browser’s disabled
// defaults. Its label is `.eyebrow`, a resting-only class. Neither row borrows a
// field from the button table: a text box with a press offset and a button with a
// focus ring would each carry a number no browser ever painted for them.
// `src/components/ui/Input.tsx` is read too — it is the composition, and it is
// byte-identical to the tag the measurement was taken at, exactly like
// `src/index.css` (`git diff --stat pre-flutter HEAD -- src/` prints nothing).

/** The declarations a field’s resting rule may author. Each has a row on
 *  `AppFieldSpec`; `width` is the one the box inherits from its caller, and the
 *  check below pins it to the single value that means the same in Flutter. */
const FIELD_REST_PROPS = [
  'background',
  'border',
  'border-radius',
  'padding',
  'font-size',
  'color',
  'width',
  'transition',
];

/** A label authors type and nothing else. A border or padding on `.eyebrow` would
 *  make it a box, and a box is a different row. */
const LABEL_REST_PROPS = ['font-size', 'font-weight', 'letter-spacing', 'text-transform', 'color'];

/** The whole property set of a resting rule, against what the family can hold —
 *  the same gate `checkStateProps` runs on a state rule, one step earlier. */
const checkRestProps = (props, allowed, cls, line) => {
  for (const [prop] of props) {
    if (!allowed.includes(prop)) {
      fail(`${cls}: the resting rule sets \`${prop}\` (src/index.css:${line}); no §6 row for ${cls} ports it`);
    }
  }
};

/** `color-mix(in srgb, var(--token) N%, transparent)`: mixing in sRGB against
 *  `transparent` premultiplies, so the channels of the token survive and only its
 *  alpha is scaled to N%. The port takes the measured token and puts N% on it;
 *  any other mix (two colours, a different space) is arithmetic this file would
 *  have to invent, so it fails instead. */
const authoredMix = (value, theme, themeTag, label, cls) => {
  const m = /^color-mix\(in srgb,\s*var\((--[a-z0-9-]+)\)\s+([\d.]+)%,\s*transparent\)$/.exec(value);
  if (!m) fail(`${cls}: ${label} "${value}" is not \`color-mix(in srgb, var(--token) N%, transparent)\``);
  const t = theme.root[m[1]];
  if (!t || !t.srgb) fail(`${cls}: ${label} references ${m[1]}, which is not a measured colour in ${themeTag}`);
  const pct = parseFloat(m[2]);
  if (!(pct > 0 && pct < 100)) {
    fail(
      `${cls}: ${label} mixes ${m[2]}% with transparent; that is no ring at all, or a full one — not a rule to port quietly`,
    );
  }
  return { token: m[1], pct, srgb: { ...t.srgb, alpha: pct / 100, a255: Math.round((pct / 100) * 255) } };
};

/** The authored resting colours against the same pass’s probe. The pinned text and
 *  the browser are supposed to describe one stylesheet; when they disagree, the
 *  measurement is stale and every row derived from it is a guess, so generation
 *  stops rather than emitting a theme that matches neither. */
const assertRestColours = (cls, restProps, rows) => {
  for (const [pass, themeTag] of rows) {
    for (const [prop, value] of restProps) {
      let want = null;
      let token = null;
      if (prop === 'color' || prop === 'background') {
        const m = /^var\((--[a-z0-9-]+)\)$/.exec(value);
        if (!m)
          fail(`${cls}: resting \`${prop}: ${value}\` is not a bare var(--token) (src/index.css:${pass.srcLine})`);
        token = m[1];
        want = prop === 'color' ? pass.textColor : pass.fillColor;
      } else if (prop === 'border') {
        const m = /^([\d.]+)px solid var\((--[a-z0-9-]+)\)$/.exec(value);
        if (!m) {
          fail(
            `${cls}: resting \`${prop}: ${value}\` is not \`Npx solid var(--token)\`; AppFieldSpec ports a uniform solid border only`,
          );
        }
        if (parseFloat(m[1]) !== pass.borderWidthPx) {
          fail(
            `${cls}: the resting rule authors a ${m[1]}px border and the ${themeTag} probe measures ${pass.borderWidthPx}px`,
          );
        }
        token = m[2];
        want = pass.borderColor;
      } else {
        continue;
      }
      const t = themeTag === 'light-desktop' ? LIGHT : DARK;
      const got = t.root[token];
      if (!got || !got.srgb) {
        fail(`${cls}: resting \`${prop}\` names ${token}, which ${themeTag} never measured as a colour`);
      }
      if (got.srgb.hex !== want.hex) {
        fail(
          `${cls}: the resting rule says ${prop} is ${token} (${got.srgb.hex}) but the ${themeTag} probe measured ${want.hex} — the pinned stylesheet and the measurement disagree`,
        );
      }
    }
  }
};

const fields = FIELD_CLASSES.map((cls) => {
  const l = probeRestRow(cls, 'light-desktop', LIGHT);
  const d = probeRestRow(cls, 'dark-desktop', DARK);
  comparePassRows(cls, l, d);

  const rest = cssRule(new RegExp(`^\\${cls} \\{$`), cls);
  l.srcLine = rest.line;
  d.srcLine = rest.line;
  const restProps = ruleProps(rest, cls);
  checkRestProps(restProps, FIELD_REST_PROPS, cls, rest.line);
  assertRestColours(cls, restProps, [
    [l, 'light-desktop'],
    [d, 'dark-desktop'],
  ]);
  const width = cssDecl(rest, 'width', cls);
  if (width !== '100%') {
    fail(`${cls}: \`width: ${width}\` (src/index.css:${rest.line}); the port gives the box its caller’s width`);
  }
  const trans = controlTransition(rest, cls, FIELD_TRANSITION_PROPS);

  // `:focus` and `::placeholder` are the two states AppFormField ports. A third
  // is a §6 change to review, not a row to widen: a field that dims on a touch
  // screen, or changes on hover, needs a phone answer before it can be painted.
  for (const state of [':hover', ':focus-visible', ':active', ':disabled', '[disabled]', '::selection']) {
    const head = new RegExp(`^\\${cls}${state.replace(/[[\]]/g, '\\$&')}[\\s,{]`);
    const at = CSS_LINES.findIndex((line) => head.test(line));
    if (at >= 0) {
      fail(`${cls}${state} exists at src/index.css:${at + 1}; AppFieldSpec ports :focus and ::placeholder only`);
    }
  }

  const ph = cssRule(new RegExp(`^\\${cls}::placeholder \\{$`), cls);
  const fo = cssRule(new RegExp(`^\\${cls}:focus \\{$`), cls);
  checkStateProps(ruleProps(ph, cls), ['color'], '::placeholder', cls, ph.line);
  const focusProps = ruleProps(fo, cls);
  checkStateProps(focusProps, ['outline', 'border-color', 'box-shadow'], ':focus', cls, fo.line);
  const outline = focusProps.find(([prop]) => prop === 'outline');
  if (!outline || outline[1] !== 'none') {
    fail(
      `${cls}: :focus must carry \`outline: none\` (src/index.css:${fo.line}); the port has no UA outline to style away`,
    );
  }
  const fb = focusProps.find(([prop]) => prop === 'border-color');
  if (!fb) fail(`${cls}: :focus changes no border colour (src/index.css:${fo.line})`);
  const ring = focusProps.find(([prop]) => prop === 'box-shadow');
  if (!ring) fail(`${cls}: :focus paints no ring (src/index.css:${fo.line})`);
  const rm = /^0 0 0 ([\d.]+)px (.+)$/.exec(ring[1]);
  if (!rm) {
    fail(
      `${cls}: :focus box-shadow "${ring[1]}" is not \`0 0 0 Npx <colour>\`; the port has no blur or offset to paint`,
    );
  }
  l.focusBorder = authoredColour(fb[1], LIGHT, 'light-desktop', ':focus border-color', cls);
  d.focusBorder = authoredColour(fb[1], DARK, 'dark-desktop', ':focus border-color', cls);
  l.ring = authoredMix(rm[2], LIGHT, 'light-desktop', ':focus ring', cls);
  d.ring = authoredMix(rm[2], DARK, 'dark-desktop', ':focus ring', cls);
  const hint = cssDecl(ph, 'color', cls);
  l.hint = authoredColour(hint, LIGHT, 'light-desktop', '::placeholder colour', cls);
  d.hint = authoredColour(hint, DARK, 'dark-desktop', '::placeholder colour', cls);
  for (const [key, label] of [
    ['focusBorder', ':focus border-color'],
    ['ring', ':focus ring'],
    ['hint', '::placeholder colour'],
  ]) {
    if (l[key].token !== d[key].token) {
      fail(`${cls}: the ${label} token differs between the light and dark passes`);
    }
  }
  // A state rule that changes nothing is not a state: either the pass paints a
  // focused field that looks idle, or the port carries a field that pretends to.
  for (const [pass, themeTag] of [
    [l, 'light-desktop'],
    [d, 'dark-desktop'],
  ]) {
    if (pass.focusBorder.srgb.hex === pass.borderColor.hex) {
      fail(
        `${cls}: ${themeTag} :focus repaints the resting border — the rule is a no-op and the port should say so out loud`,
      );
    }
    if (pass.hint.srgb.hex === pass.textColor.hex) {
      fail(`${cls}: ${themeTag} ::placeholder paints the resting text colour — a hint nobody can tell from the value`);
    }
  }
  if (!trans.props.includes('border-color')) {
    fail(`${cls}: :focus repaints the border but its transition omits border-color (src/index.css:${rest.line})`);
  }
  if (!trans.props.includes('box-shadow')) {
    fail(`${cls}: :focus paints the ring but its transition omits box-shadow (src/index.css:${rest.line})`);
  }
  return {
    cls,
    l,
    d,
    widthCss: width,
    ringSpreadPx: parseFloat(rm[1]),
    focusToken: l.focusBorder.token,
    ringToken: l.ring.token,
    ringPct: l.ring.pct,
    hintToken: l.hint.token,
    transitionMs: trans.ms,
    transitionEase: trans.curve,
    transitionDurToken: trans.dur.name,
    transitionEaseToken: trans.ease.name,
    transitionProps: trans.props.join(', '),
    transitionSrc: `src/index.css:${rest.line}`,
    focusSrc: `src/index.css:${fo.line}`,
    placeholderSrc: `src/index.css:${ph.line}`,
  };
});

/** `src/components/ui/Input.tsx` composes label and field in one wrapper element.
 *  The wrapper is the field’s layout, so the port reads the gap it authors instead
 *  of choosing one: `gap-<n>` is Tailwind’s `calc(n * --spacing)`, which
 *  `AppSpacing.scale` already implements from the measured unit. */
const INPUT_TSX = fs.readFileSync(path.join(ROOT, 'src', 'components', 'ui', 'Input.tsx'), 'utf8').split(/\r?\n/);
const WRAPPER_RE = /^<div className="flex flex-col gap-([\d.]+) w-full text-left">$/;
const wrapper = INPUT_TSX.map((line) => line.trim()).find((line) => WRAPPER_RE.test(line));
if (!wrapper) {
  fail(
    'src/components/ui/Input.tsx no longer opens with `flex flex-col gap-<n> w-full text-left`; AppFormField ports that exact wrapper and needs its gap re-read',
  );
}
const labelGapScale = parseFloat(WRAPPER_RE.exec(wrapper)[1]);
if (!(labelGapScale > 0)) fail(`the Input wrapper gap "gap-${labelGapScale}" is not a positive multiple of --spacing`);
if (!INPUT_TSX.some((line) => /className="eyebrow"/.test(line))) {
  fail('src/components/ui/Input.tsx no longer labels its field with the measured `.eyebrow` class');
}

const labels = LABEL_CLASSES.map((cls) => {
  const l = probeRestRow(cls, 'light-desktop', LIGHT);
  const d = probeRestRow(cls, 'dark-desktop', DARK);
  comparePassRows(cls, l, d);
  const rest = cssRule(new RegExp(`^\\${cls} \\{$`), cls);
  const props = ruleProps(rest, cls);
  checkRestProps(props, LABEL_REST_PROPS, cls, rest.line);
  assertRestColours(cls, props, [
    [l, 'light-desktop'],
    [d, 'dark-desktop'],
  ]);
  // A resting-only row is only resting while the class has no states and no
  // clock; either one appearing is a §6 change to review, not a row to widen.
  for (const [prop] of props) {
    if (prop === 'transition') fail(`${cls}: the label grew a transition; AppLabelSpec holds a resting-only row`);
  }
  for (const state of [':hover', ':focus', ':focus-visible', ':active', ':disabled', '::placeholder', '::selection']) {
    const head = new RegExp(`^\\${cls}${state}[\\s,{]`);
    const at = CSS_LINES.findIndex((line) => head.test(line));
    if (at >= 0) {
      fail(
        `${cls}${state} exists at src/index.css:${at + 1}; AppLabelSpec ports a resting-only class and cannot hold it`,
      );
    }
  }
  const transform = cssDecl(rest, 'text-transform', cls);
  if (!/^(uppercase|none|capitalize|lowercase)$/.test(transform)) {
    fail(`${cls}: text-transform "${transform}" is not a case this port knows how to apply`);
  }
  l.srcLine = rest.line;
  d.srcLine = rest.line;
  return {
    cls,
    l,
    d,
    textTransform: transform,
    uppercase: transform === 'uppercase',
    restSrc: `src/index.css:${rest.line}`,
  };
});

const fieldExpr = (c, pass) =>
  [
    `      cssClass: ${dartStr(c.cls)},`,
    `      displayCss: ${dartStr(pass.displayCss)},`,
    `      widthCss: ${dartStr(c.widthCss)},`,
    `      radiusPx: ${fmt(pass.radiusPx)},`,
    `      borderWidthPx: ${fmt(pass.borderWidthPx)},`,
    `      borderColor: ${dartSurfaceColour(pass.borderColor)},`,
    `      fillColor: ${dartSurfaceColour(pass.fillColor)},`,
    `      textColor: ${dartSurfaceColour(pass.textColor)},`,
    `      fontFamily: ${dartStr(pass.fontFamily)},`,
    `      fontSizePx: ${fmt(pass.fontSizePx)},`,
    `      fontWeight: ${pass.fontWeight},`,
    `      lineHeightPx: ${pass.lineHeightPx === null ? 'null' : fmt(pass.lineHeightPx)},`,
    `      letterSpacingPx: ${fmt(pass.letterSpacingPx)},`,
    `      paddingVerticalPx: ${fmt(pass.paddingVerticalPx)},`,
    `      paddingHorizontalPx: ${fmt(pass.paddingHorizontalPx)},`,
    `      hintColor: ${dartSurfaceColour(pass.hint.srgb)},`,
    `      focusBorderColor: ${dartSurfaceColour(pass.focusBorder.srgb)},`,
    `      ringColor: ${dartSurfaceColour(pass.ring.srgb)},`,
    `      ringSpreadPx: ${fmt(c.ringSpreadPx)},`,
    `      transitionMs: ${c.transitionMs},`,
    `      easeX1: ${fmt(c.transitionEase[0])},`,
    `      easeY1: ${fmt(c.transitionEase[1])},`,
    `      easeX2: ${fmt(c.transitionEase[2])},`,
    `      easeY2: ${fmt(c.transitionEase[3])},`,
  ].join('\n');

const labelExpr = (x, pass) =>
  [
    `      cssClass: ${dartStr(x.cls)},`,
    `      displayCss: ${dartStr(pass.displayCss)},`,
    `      textColor: ${dartSurfaceColour(pass.textColor)},`,
    `      fontFamily: ${dartStr(pass.fontFamily)},`,
    `      fontSizePx: ${fmt(pass.fontSizePx)},`,
    `      fontWeight: ${pass.fontWeight},`,
    `      lineHeightPx: ${pass.lineHeightPx === null ? 'null' : fmt(pass.lineHeightPx)},`,
    `      letterSpacingPx: ${fmt(pass.letterSpacingPx)},`,
  ].join('\n');

// ================================================================ app_fields.dart
banner();
L.push(
  "import 'package:flutter/material.dart';",
  '',
  "import 'app_spacing.dart';",
  '',
  '/// One §6 text field: box and type measured at rest, placeholder and focus',
  '/// appearance read out of `src/index.css`. A widget under `lib/presentation/`',
  '/// restates none of it.',
  'class AppFieldSpec {',
  '  const AppFieldSpec({',
  '    required this.cssClass,',
  '    required this.displayCss,',
  '    required this.widthCss,',
  '    required this.radiusPx,',
  '    required this.borderWidthPx,',
  '    required this.borderColor,',
  '    required this.fillColor,',
  '    required this.textColor,',
  '    required this.fontFamily,',
  '    required this.fontSizePx,',
  '    required this.fontWeight,',
  '    required this.lineHeightPx,',
  '    required this.letterSpacingPx,',
  '    required this.paddingVerticalPx,',
  '    required this.paddingHorizontalPx,',
  '    required this.hintColor,',
  '    required this.focusBorderColor,',
  '    required this.ringColor,',
  '    required this.ringSpreadPx,',
  '    required this.transitionMs,',
  '    required this.easeX1,',
  '    required this.easeY1,',
  '    required this.easeX2,',
  '    required this.easeY2,',
  '  });',
  '',
  '  /// The CSS class this row was measured from.',
  '  final String cssClass;',
  '',
  '  /// The computed `display` and `width`, carried as data. On the web the box is',
  '  /// `block` and `width: 100%`, which in Flutter is “as wide as the caller gives',
  '  /// me” — the layout, not the paint.',
  '  final String displayCss;',
  '  final String widthCss;',
  '',
  '  final double radiusPx;',
  '  final double borderWidthPx;',
  '  final Color borderColor;',
  '  final Color fillColor;',
  '  final Color textColor;',
  '  /// The class’s own measured `font-family` first family: `Inter`, the body',
  '  /// stack — a field is not a `.btn-*` and does not switch to `--font-display`.',
  '  final String fontFamily;',
  '  final double fontSizePx;',
  '  final int fontWeight;',
  '  final double? lineHeightPx;',
  '  final double letterSpacingPx;',
  '  final double paddingVerticalPx;',
  '  final double paddingHorizontalPx;',
  '',
  '  /// Authored `::placeholder { color: … }`, substituted from the same pass’s',
  '  /// measured `:root`. A probe cannot see a pseudo-element while the field holds',
  '  /// a value, so this comes from the pinned stylesheet.',
  '  final Color hintColor;',
  '',
  '  /// Authored `:focus { border-color: … }` and `:focus { box-shadow: … }`, same',
  '  /// substitution. `:focus { outline: none }` is the third declaration of that',
  '  /// rule and the port drops it on purpose: Flutter paints no UA outline to',
  '  /// suppress, and the generator fails if the rule authors anything else there.',
  '  final Color focusBorderColor;',
  '  final Color ringColor;',
  '  final double ringSpreadPx;',
  '',
  '  /// The class’s own authored `transition`, exactly as `AppControlSpec` carries',
  '  /// it: the field runs its focus change on this clock and picks none.',
  '  final int transitionMs;',
  '  final double easeX1;',
  '  final double easeY1;',
  '  final double easeX2;',
  '  final double easeY2;',
  '',
  '  BorderRadius get borderRadius => BorderRadius.circular(radiusPx);',
  '',
  '  Border get border => Border.all(color: borderColor, width: borderWidthPx);',
  '',
  '  Border get focusedBorder => Border.all(color: focusBorderColor, width: borderWidthPx);',
  '',
  '  Duration get transitionDuration => Duration(milliseconds: transitionMs);',
  '',
  '  Cubic get transitionCurve => Cubic(easeX1, easeY1, easeX2, easeY2);',
  '',
  '  EdgeInsetsGeometry get padding => EdgeInsets.symmetric(',
  '    vertical: paddingVerticalPx,',
  '    horizontal: paddingHorizontalPx,',
  '  );',
  '',
  '  FontWeight get weight => FontWeight.values[fontWeight ~/ 100 - 1];',
  '',
  '  double? get heightRatio =>',
  '      lineHeightPx == null ? null : lineHeightPx! / fontSizePx;',
  '',
  '  /// The ring the focused field paints: no offset, no blur, the authored',
  '  /// spread. CSS `box-shadow: none` at rest is the zero-everything shadow',
  '  /// [restRing] returns, so the transition runs between two shadows and the',
  '  /// spread eases with the colour instead of appearing on the first frame.',
  '  BoxShadow get ring => BoxShadow(',
  '    color: ringColor,',
  '    offset: Offset.zero,',
  '    blurRadius: 0.0,',
  '    spreadRadius: ringSpreadPx,',
  '  );',
  '',
  '  BoxShadow get restRing => const BoxShadow(',
  '    color: Color(0x00000000),',
  '    offset: Offset.zero,',
  '    blurRadius: 0.0,',
  '    spreadRadius: 0.0,',
  '  );',
  '',
  '  /// The text the field paints, from the class’s own type declarations — never',
  '  /// from the theme’s body style.',
  '  TextStyle get textStyle => TextStyle(',
  '    fontFamily: fontFamily,',
  '    color: textColor,',
  '    fontSize: fontSizePx,',
  '    fontWeight: weight,',
  '    height: heightRatio,',
  '    letterSpacing: letterSpacingPx,',
  '  );',
  '',
  '  TextStyle get hintStyle => textStyle.copyWith(color: hintColor);',
  '}',
  '',
  '/// One §6 label class, measured at rest. It has no box of its own and no',
  '/// states: `text-transform` is the one declaration that changes what the',
  '/// browser shows without changing the string, so it is ported as a flag.',
  'class AppLabelSpec {',
  '  const AppLabelSpec({',
  '    required this.cssClass,',
  '    required this.displayCss,',
  '    required this.textColor,',
  '    required this.fontFamily,',
  '    required this.fontSizePx,',
  '    required this.fontWeight,',
  '    required this.lineHeightPx,',
  '    required this.letterSpacingPx,',
  '    required this.uppercase,',
  '  });',
  '',
  '  final String cssClass;',
  '  final String displayCss;',
  '  final Color textColor;',
  '  final String fontFamily;',
  '  final double fontSizePx;',
  '  final int fontWeight;',
  '  final double? lineHeightPx;',
  '  final double letterSpacingPx;',
  '',
  '  /// Authored `text-transform`. CSS applies this after layout, so the element’s',
  '  /// own text never changes; a port that leaves the string alone prints a label',
  '  /// in the wrong case.',
  '  final bool uppercase;',
  '',
  '  FontWeight get weight => FontWeight.values[fontWeight ~/ 100 - 1];',
  '',
  '  double? get heightRatio =>',
  '      lineHeightPx == null ? null : lineHeightPx! / fontSizePx;',
  '',
  '  TextStyle get textStyle => TextStyle(',
  '    fontFamily: fontFamily,',
  '    color: textColor,',
  '    fontSize: fontSizePx,',
  '    fontWeight: weight,',
  '    height: heightRatio,',
  '    letterSpacing: letterSpacingPx,',
  '  );',
  '',
  '  String transform(String text) => uppercase ? text.toUpperCase() : text;',
  '}',
  '',
  '/// The §6 fields, keyed by CSS class — one map per measured brightness pass.',
  'abstract final class AppFields {',
);
for (const [passName, pass, themeTag] of [
  ['light', 'l', 'light-desktop'],
  ['dark', 'd', 'dark-desktop'],
]) {
  L.push(
    `  /// ${passName} pass (UI_SPEC §6.1–§6.2, \`${themeTag}\`; states from \`src/index.css\`).`,
    `  static const Map<String, AppFieldSpec> ${passName} =`,
    '      <String, AppFieldSpec>{',
  );
  for (const c of fields) {
    L.push(`    ${dartStr(c.cls)}: AppFieldSpec(`, fieldExpr(c, c[pass]), '    ),');
  }
  L.push('  };', '');
}
L.push(
  '  /// The state rules and the clock, printed once because both passes author',
  '  /// them identically:',
  ...fields.flatMap((c) => [
    `  /// \`${c.cls}:focus\` (${c.focusSrc}) sets the border to \`${c.focusToken}\``,
    `  /// and paints a \`${c.ringSpreadPx}px\` ring of \`${c.ringToken} ${c.ringPct}%\`;`,
    `  /// \`${c.cls}::placeholder\` (${c.placeholderSrc}) sets \`${c.hintToken}\`.`,
  ]),
  ...fields.flatMap((c) => [
    `  /// \`${c.cls}\` transitions ${c.transitionProps} on`,
    `  /// \`${c.transitionDurToken}\` / \`${c.transitionEaseToken}\` (${c.transitionSrc}).`,
  ]),
  '',
  '  /// The label-to-field gap the web’s Input composition authors: the wrapper’s',
  `  /// \`gap-${labelGapScale}\`, which is Tailwind’s`,
  `  /// \`calc(${labelGapScale} * --spacing)\` — [AppSpacing.scale] on the measured`,
  '  /// unit, not a number the port chose.',
  `  static const double labelGapScale = ${fmt(labelGapScale)};`,
  '',
  '  static double get labelGap => AppSpacing.scale(labelGapScale);',
  '',
  '  /// The measured field for a class and brightness. An unknown class is a',
  '  /// programming error, not a fallback: nothing in this layer may quietly',
  '  /// become a Material default.',
  '  static AppFieldSpec resolve(String cssClass, Brightness brightness) {',
  '    final Map<String, AppFieldSpec> table =',
  '        brightness == Brightness.dark ? dark : light;',
  '    final AppFieldSpec? spec = table[cssClass];',
  "    if (spec == null) throw ArgumentError('$cssClass is not a §6 field');",
  '    return spec;',
  '  }',
  '}',
  '',
  '/// The §6 label classes, keyed the same way.',
  'abstract final class AppLabels {',
);
for (const [passName, pass, themeTag] of [
  ['light', 'l', 'light-desktop'],
  ['dark', 'd', 'dark-desktop'],
]) {
  L.push(
    `  /// ${passName} pass (UI_SPEC §6.1–§6.2, \`${themeTag}\`).`,
    `  static const Map<String, AppLabelSpec> ${passName} =`,
    '      <String, AppLabelSpec>{',
  );
  for (const x of labels) {
    L.push(`    ${dartStr(x.cls)}: AppLabelSpec(`, labelExpr(x, x[pass]), `      uppercase: ${x.uppercase},`, '    ),');
  }
  L.push('  };', '');
}
L.push(
  '  /// The resting rule each label was read from — a label has no state rules,',
  '  /// and the generator fails if one appears:',
  ...labels.map((x) => `  /// \`${x.cls}\` at ${x.restSrc}, with \`text-transform: ${x.textTransform}\`.`),
  '',
  '  static AppLabelSpec resolve(String cssClass, Brightness brightness) {',
  '    final Map<String, AppLabelSpec> table =',
  '        brightness == Brightness.dark ? dark : light;',
  '    final AppLabelSpec? spec = table[cssClass];',
  "    if (spec == null) throw ArgumentError('$cssClass is not a §6 label');",
  '    return spec;',
  '  }',
  '}',
  '',
);
finish('app_fields.dart');

// ================================================================ app_skeletons.dart
/** The declarations a resting skeleton may author: the fill and the corner, plus
 *  the two that let a sweep ride inside the box — a `position: relative`
 *  containing block for the pseudo-element and the `overflow: hidden` that clips
 *  it. A `border` authored here would compete with the frame `Skeleton.tsx` adds
 *  with a utility, so this rejects one rather than choose between them. */
const SKELETON_REST_PROPS = ['position', 'overflow', 'background', 'border-radius'];

/** The sweep is one pseudo-element: a box that fills the skeleton, a gradient to
 *  paint in it, the clock that moves it, and where it starts. A sixth property
 *  there is a second appearance the port has no place for. */
const SKELETON_SWEEP_PROPS = ['content', 'position', 'inset', 'background', 'animation', 'transform'];

/** CSS `animation-timing-function` keywords as css-easing-1 defines each one.
 *  `.skeleton::after` names a keyword rather than a `var(--ease-*)`, so the curve
 *  is the keyword's own — and only the curves the spec pins, never one this file
 *  has to guess at. */
const KEYWORD_CURVES = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

/** `<name> <duration> <keyword> <iteration>` as one `animation` shorthand — the
 *  form a looping overlay needs, where a transition does not. A rule that splits
 *  the longhand, runs a finite number of times, or names a direction this file
 *  would have to read is a clock the port cannot take as given. */
const parseAnimation = (raw, cls) => {
  const m = /^([a-z][a-z0-9-]*) ([\d.]+m?s) ([a-z-]+) (infinite|[\d.]+)$/.exec(collapse(raw));
  if (!m) fail(`${cls}: animation "${raw}" is not \`<name> <duration> <keyword> <iteration>\``);
  const unit = m[2].endsWith('ms') ? 1 : m[2].endsWith('s') ? 1000 : null;
  if (unit === null) fail(`${cls}: animation duration "${m[2]}" is not a time this file can read`);
  const ms = Math.round(parseFloat(m[2]) * unit);
  if (!(ms > 0)) fail(`${cls}: animation duration "${m[2]}" is not a positive length of time`);
  const curve = KEYWORD_CURVES[m[3]];
  if (!curve) {
    fail(`${cls}: animation-timing-function "${m[3]}" is not a keyword whose curve css-easing-1 pins`);
  }
  if (m[4] !== 'infinite') {
    fail(`${cls}: animation runs ${m[4]} times; the port loops a shimmer that never ends`);
  }
  return { name: m[1], ms, easeKeyword: m[3], iterationText: m[4], curve };
};

/** The whole text of `@keyframes <name>`, brace-matched, with its line number. */
const keyframesBlock = (name, cls) => {
  const i = CSS_LINES.findIndex((line) => new RegExp(`^@keyframes ${name} \\{$`).test(line));
  if (i < 0) fail(`${cls}: the animation names ${name}, which src/index.css has no @keyframes block for`);
  let depth = 0;
  for (let j = i; j < CSS_LINES.length; j++) {
    depth += (CSS_LINES[j].match(/\{/g) || []).length - (CSS_LINES[j].match(/\}/g) || []).length;
    if (depth === 0) return { line: i + 1, text: CSS_LINES.slice(i, j + 1).join('\n') };
  }
  return fail(`@keyframes ${name} at src/index.css:${i + 1} never closes`);
};

/** `@keyframes <name>` as far as a sweeping overlay needs it: one end frame, and
 *  that frame authored `transform: translateX(N%)` and nothing else. A `from` or
 *  `0%` frame would give the port two starting positions — the element's own
 *  `transform` and the keyframe's — which the browser resolves by letting the
 *  keyframe own 0%, a rule to re-implement rather than a number to port. */
const keyframesEndFrame = (name, cls) => {
  const block = keyframesBlock(name, cls);
  const inner = block.text.slice(block.text.indexOf('{') + 1, block.text.lastIndexOf('}'));
  const frames = [...inner.matchAll(/([0-9]+%|from|to)\s*\{/g)].map((m) => m[1]);
  if (frames.length !== 1 || frames[0] !== '100%') {
    fail(
      `@keyframes ${name} (src/index.css:${block.line}) carries the frames ${JSON.stringify(frames)}; the port needs one 100% frame and takes the element's own transform as the start`,
    );
  }
  const body = /100%\s*\{([\s\S]*?)\}/.exec(inner)[1];
  const decls = body
    .split(';')
    .map(collapse)
    .filter(Boolean)
    .map((decl) => {
      const i = decl.indexOf(':');
      if (i < 0) fail(`@keyframes ${name}: "${decl}" is not a declaration (src/index.css:${block.line})`);
      return [decl.slice(0, i).trim(), decl.slice(i + 1).trim()];
    });
  if (decls.length !== 1 || decls[0][0] !== 'transform') {
    fail(`@keyframes ${name}: the end frame must author \`transform\` alone (src/index.css:${block.line})`);
  }
  const m = /^translateX\(([-\d.]+)%\)$/.exec(collapse(decls[0][1]));
  if (!m) {
    fail(
      `@keyframes ${name}: the end frame is \`${decls[0][1]}\`, not \`translateX(N%)\` — the sweep moves on one axis only (src/index.css:${block.line})`,
    );
  }
  return { line: block.line, toPercent: parseFloat(m[1]) };
};

/** `linear-gradient(<a>deg, transparent 0%, <colour> <p>%, transparent 100%)` —
 *  a band that fades in and out of nothing as it crosses. Both ends must be the
 *  bare keyword, the angle must be the one the port can name, and the middle is
 *  the colour the sweep carries. */
const sweepGradientCss = (raw, theme, themeTag, cls) => {
  const g =
    /^linear-gradient\(\s*([\d.]+)deg\s*,\s*transparent\s+0%\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*transparent\s+100%\s*\)$/s.exec(
      collapse(raw),
    );
  if (!g) {
    fail(
      `${cls}::after: background "${collapse(raw)}" is not \`linear-gradient(<a>deg, transparent 0%, <colour> <p>%, transparent 100%)\``,
    );
  }
  const angle = parseFloat(g[1]);
  if (angle !== 90) {
    fail(`${cls}::after: the sweep runs at ${angle}deg; the shimmer crosses horizontally and one axis is all it has`);
  }
  const mid = parseFloat(g[3]);
  if (mid !== 50) fail(`${cls}::after: the sweep peaks at ${mid}% of the box, not at its middle`);
  const mix = authoredMix(g[2], theme, themeTag, 'sweep colour', cls);
  return { angle, midStop: mid / 100, mix };
};

/** The stylesheet's own answer to a reduced-motion preference. `.skeleton` is not
 *  given `animation: none` there; what stops the shimmer is the clamp on every
 *  element and pseudo-element, and a run of `0.01ms` in one pass ends one box
 *  width off the right edge — indistinguishable from never having run. The port
 *  takes that as "paint the resting box", so it fails if the clamp it is resting
 *  on moves, or if the class gains a rule of its own in there. */
const reducedMotionClamp = (cls) => {
  const i = CSS_LINES.findIndex((line) => /^@media \(prefers-reduced-motion: reduce\) \{$/.test(line));
  if (i < 0) {
    return fail(
      `${cls}: src/index.css no longer clamps animation for a reduced-motion preference; the port's no-sweep answer rests on that rule`,
    );
  }
  let depth = 0;
  for (let j = i; j < CSS_LINES.length; j++) {
    depth += (CSS_LINES[j].match(/\{/g) || []).length - (CSS_LINES[j].match(/\}/g) || []).length;
    if (depth === 0) {
      const text = collapse(CSS_LINES.slice(i, j + 1).join('\n'));
      if (!text.includes('* , *::before , *::after {') && !text.includes('*, *::before, *::after {')) {
        fail(
          `${cls}: the reduced-motion block no longer reaches every element and pseudo-element (src/index.css:${i + 1})`,
        );
      }
      for (const want of ['animation-duration: 0.01ms !important', 'animation-iteration-count: 1 !important']) {
        if (!text.includes(want)) {
          return fail(`${cls}: the reduced-motion block no longer says \`${want}\` (src/index.css:${i + 1})`);
        }
      }
      if (new RegExp(`\\${cls} \\{ animation: none`).test(text)) {
        fail(
          `${cls}: the reduced-motion block now takes the class off the animation entirely; the parked position the port documents is a different one`,
        );
      }
      return { line: i + 1, text };
    }
  }
  return fail(`the reduced-motion block at src/index.css:${i + 1} never closes`);
};

/** `src/components/ui/Skeleton.tsx` is every skeleton on the web. Its class list
 *  is the composition the port reproduces — `.skeleton` for the fill and corner,
 *  a utility frame, and a utility size per variant — so the file is read as
 *  pinned text and not paraphrased. Tailwind utilities exist only in the
 *  generated stylesheet, which is a build product, so the component is the source
 *  that says what a skeleton is asked to look like. */
const SKELETON_TSX = fs
  .readFileSync(path.join(ROOT, 'src', 'components', 'ui', 'Skeleton.tsx'), 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim());
const SKELETON_BASE_RE = /^const base = 'skeleton border border-\[var\(--line\)\] motion-reduce:animate-none';$/;
const skeletonBase = SKELETON_TSX.find((line) => SKELETON_BASE_RE.test(line));
if (!skeletonBase) {
  fail(
    'src/components/ui/Skeleton.tsx no longer opens every skeleton with `skeleton border border-[var(--line)] motion-reduce:animate-none`; AppSkeleton ports that exact class list',
  );
}
/** The class list itself, out of the statement that carries it. */
const skeletonBaseClasses = /'([^']+)'/.exec(skeletonBase)[1];
const SKELETON_VARIANT_CLASSES = {
  text: 'rounded-[var(--r-sm)] h-4 w-full',
  circular: 'rounded-full shrink-0',
  rectangular: 'rounded-[var(--r-md)] w-full h-24',
};
for (const [name, classes] of Object.entries(SKELETON_VARIANT_CLASSES)) {
  if (!SKELETON_TSX.some((line) => line.startsWith(`${name}: '${classes}'`))) {
    fail(`src/components/ui/Skeleton.tsx no longer writes the ${name} variant as \`${classes}\``);
  }
}
/** The `h-<n>` utility behind each variant, as a multiple of `--spacing`, and the
 *  `rounded-…` behind it. `circular` carries neither height nor width — it asks
 *  its caller for both (`shrink-0`) — and the radius every variant asks for is a
 *  utility the class outranks, which is what the note on
 *  [AppSkeletons.variantClasses] records. */
const SKELETON_VARIANT_HEIGHTS = {};
for (const [name, classes] of Object.entries(SKELETON_VARIANT_CLASSES)) {
  const h = /\bh-([\d.]+)\b/.exec(classes);
  SKELETON_VARIANT_HEIGHTS[name] = h ? parseFloat(h[1]) : null;
  const r = /\brounded(-\[[a-z0-9()-]+\]|-full)?\b/.exec(classes);
  if (!r) fail(`the ${name} variant authors no radius; AppSkeletons expects each variant to ask for one`);
}
if (!SKELETON_VARIANT_HEIGHTS.text || !SKELETON_VARIANT_HEIGHTS.rectangular) {
  fail('Skeleton.tsx variants no longer carry the h-<n> utilities AppSkeletons sizes itself by');
}
if (SKELETON_VARIANT_HEIGHTS.circular !== null) {
  fail(
    `the circular variant now authors h-${SKELETON_VARIANT_HEIGHTS.circular}; the port expects its caller to give it both dimensions`,
  );
}
for (const name of ['text', 'rectangular']) {
  if (!/\bw-full\b/.test(SKELETON_VARIANT_CLASSES[name])) {
    fail(`the ${name} variant no longer asks for the caller's width`);
  }
}
if (!/\bshrink-0\b/.test(SKELETON_VARIANT_CLASSES.circular)) {
  fail('the circular variant no longer asks not to shrink in the flex row it is placed in');
}
const skeletonDefault = (() => {
  const m = SKELETON_TSX.join('\n').match(/variant = '(text|circular|rectangular)'/);
  if (!m) fail('src/components/ui/Skeleton.tsx no longer defaults to a variant this file knows');
  return m[1];
})();

/** Tailwind's `border` utility is `border-width: 1px` with `border-style:
 *  var(--tw-border-style)`, and the same stylesheet's theme layer sets that
 *  variable to `solid` — the compiled form of both was read while this row was
 *  written. It is a utility, not a number from `src/index.css`, so it is a named
 *  fact of the composition rather than a measurement, and the probe is what keeps
 *  it honest: `.skeleton` alone measures `border-top-width: 0px`, so the frame
 *  this row carries can only have come from the class list. */
const SKELETON_UTILITY_BORDER_PX = 1.0;

const skeletons = SKELETON_CLASSES.map((cls) => {
  const l = probeRestRow(cls, 'light-desktop', LIGHT);
  const d = probeRestRow(cls, 'dark-desktop', DARK);
  comparePassRows(cls, l, d);

  const rest = cssRule(new RegExp(`^\\${cls} \\{$`), cls);
  l.srcLine = rest.line;
  d.srcLine = rest.line;
  const restProps = ruleProps(rest, cls);
  checkRestProps(restProps, SKELETON_REST_PROPS, cls, rest.line);
  assertRestColours(cls, restProps, [
    [l, 'light-desktop'],
    [d, 'dark-desktop'],
  ]);
  if (l.borderWidthPx !== 0 || d.borderWidthPx !== 0) {
    fail(
      `${cls}: the resting probe measures a ${l.borderWidthPx}px border; the frame is Skeleton.tsx's utility to add and this row would be painting two`,
    );
  }
  const radius = tokenRef(cssDecl(rest, 'border-radius', cls), 'resting border-radius', cls);
  const radiusToken = (themeTag) => {
    const t = (themeTag === 'light-desktop' ? LIGHT : DARK).root[radius];
    if (!t || t.raw === undefined) fail(`${cls}: ${radius} is not a measured token in ${themeTag}`);
    if (lengthPx(t.raw, `${cls} ${radius}`) !== l.radiusPx) {
      fail(`${cls}: ${radius} is ${t.raw} and the probe measures ${l.radiusPx}px`);
    }
  };
  radiusToken('light-desktop');
  radiusToken('dark-desktop');
  for (const [prop, want] of [
    ['position', 'relative'],
    ['overflow', 'hidden'],
  ]) {
    const got = cssDecl(rest, prop, cls);
    if (got !== want) {
      fail(
        `${cls}: \`${prop}: ${got}\` (src/index.css:${rest.line}); the sweep rides inside the box, so the port needs \`${prop}: ${want}\``,
      );
    }
  }

  const after = cssRule(new RegExp(`^\\${cls}::after \\{$`), cls);
  const sweepProps = ruleProps(after, cls);
  for (const [prop] of sweepProps) {
    if (!SKELETON_SWEEP_PROPS.includes(prop)) {
      fail(
        `${cls}::after sets \`${prop}\` (src/index.css:${after.line}); AppSkeletonSpec ports a fill, a sweep and a clock only`,
      );
    }
  }
  const content = cssDecl(after, 'content', cls);
  if (content !== "''" && content !== '""') {
    fail(
      `${cls}::after: content ${content} (src/index.css:${after.line}); a pseudo-element with text is not this sweep`,
    );
  }
  if (cssDecl(after, 'position', cls) !== 'absolute') {
    fail(`${cls}::after: the sweep is not absolutely positioned (src/index.css:${after.line})`);
  }
  if (cssDecl(after, 'inset', cls) !== '0') {
    fail(
      `${cls}::after: inset is \`${cssDecl(after, 'inset', cls)}\`, not \`0\` (src/index.css:${after.line}); the band is one box wide`,
    );
  }
  const fromM = /^translateX\(([-\d.]+)%\)$/.exec(collapse(cssDecl(after, 'transform', cls)));
  if (!fromM) {
    fail(`${cls}::after: transform "${cssDecl(after, 'transform', cls)}" is not \`translateX(N%)\``);
  }
  const anim = parseAnimation(cssDecl(after, 'animation', cls), cls);
  const frames = keyframesEndFrame(anim.name, cls);
  const media = reducedMotionClamp(cls);

  const gl = sweepGradientCss(cssDecl(after, 'background', cls), LIGHT, 'light-desktop', cls);
  const gd = sweepGradientCss(cssDecl(after, 'background', cls), DARK, 'dark-desktop', cls);
  if (gl.mix.token !== gd.mix.token || gl.mix.pct !== gd.mix.pct) {
    fail(`${cls}: the sweep mixes ${gl.mix.token} ${gl.mix.pct}% in light and ${gd.mix.token} ${gd.mix.pct}% in dark`);
  }
  l.sweep = gl.mix;
  d.sweep = gd.mix;
  l.clear = { r: gl.mix.srgb.r, g: gl.mix.srgb.g, b: gl.mix.srgb.b, alpha: 0, a255: 0 };
  d.clear = { r: gd.mix.srgb.r, g: gd.mix.srgb.g, b: gd.mix.srgb.b, alpha: 0, a255: 0 };

  l.frame = authoredColour('var(--line)', LIGHT, 'light-desktop', 'utility frame colour', cls);
  d.frame = authoredColour('var(--line)', DARK, 'dark-desktop', 'utility frame colour', cls);
  if (l.frame.token !== d.frame.token) {
    fail(`${cls}: the utility frame names ${l.frame.token} in light and ${d.frame.token} in dark`);
  }

  const align = gradientAlignments(gl.angle);
  return {
    cls,
    l,
    d,
    radiusToken: radius,
    borderToken: l.frame.token,
    borderWidthPx: SKELETON_UTILITY_BORDER_PX,
    angleDeg: gl.angle,
    midStop: gl.midStop,
    sweepToken: gl.mix.token,
    sweepPct: gl.mix.pct,
    fromPercent: parseFloat(fromM[1]),
    toPercent: frames.toPercent,
    anim,
    align,
    restSrc: `src/index.css:${rest.line}`,
    sweepSrc: `src/index.css:${after.line}`,
    framesSrc: `src/index.css:${frames.line}`,
    mediaSrc: `src/index.css:${media.line}`,
    contentCss: content,
  };
});

const skeletonExpr = (c, pass) =>
  [
    `      cssClass: ${dartStr(c.cls)},`,
    `      displayCss: ${dartStr(pass.displayCss)},`,
    `      fillColor: ${dartSurfaceColour(pass.fillColor)},`,
    `      borderColor: ${dartSurfaceColour(pass.frame.srgb)},`,
    `      borderWidthPx: ${fmt(c.borderWidthPx)},`,
    `      radiusPx: ${fmt(pass.radiusPx)},`,
    `      sweepColor: ${dartSurfaceColour(pass.sweep.srgb)},`,
    `      sweepClearColor: ${dartSurfaceColour(pass.clear)},`,
    `      sweepBegin: Alignment(${fmt(c.align.begin[0])}, ${fmt(c.align.begin[1])}),`,
    `      sweepEnd: Alignment(${fmt(c.align.end[0])}, ${fmt(c.align.end[1])}),`,
    `      sweepMidStop: ${fmt(c.midStop)},`,
    `      sweepFromPercent: ${fmt(c.fromPercent)},`,
    `      sweepToPercent: ${fmt(c.toPercent)},`,
    `      sweepMs: ${c.anim.ms},`,
    `      easeX1: ${fmt(c.anim.curve[0])},`,
    `      easeY1: ${fmt(c.anim.curve[1])},`,
    `      easeX2: ${fmt(c.anim.curve[2])},`,
    `      easeY2: ${fmt(c.anim.curve[3])},`,
    `      animationName: ${dartStr(c.anim.name)},`,
    `      sweepEaseKeyword: ${dartStr(c.anim.easeKeyword)},`,
    `      iterationCss: 'infinite',`,
  ].join('\n');

banner();
L.push(
  "import 'package:flutter/material.dart';",
  '',
  "import 'app_spacing.dart';",
  '',
  '/// One §6 loading placeholder: the box Chrome measured at rest, and the sweep',
  '/// the class authors on a pseudo-element over it. A widget under',
  '/// `lib/presentation/` restates none of it.',
  'class AppSkeletonSpec {',
  '  const AppSkeletonSpec({',
  '    required this.cssClass,',
  '    required this.displayCss,',
  '    required this.fillColor,',
  '    required this.borderColor,',
  '    required this.borderWidthPx,',
  '    required this.radiusPx,',
  '    required this.sweepColor,',
  '    required this.sweepClearColor,',
  '    required this.sweepBegin,',
  '    required this.sweepEnd,',
  '    required this.sweepMidStop,',
  '    required this.sweepFromPercent,',
  '    required this.sweepToPercent,',
  '    required this.sweepMs,',
  '    required this.easeX1,',
  '    required this.easeY1,',
  '    required this.easeX2,',
  '    required this.easeY2,',
  '    required this.animationName,',
  '    required this.sweepEaseKeyword,',
  '    required this.iterationCss,',
  '  });',
  '',
  '  /// The CSS class this row was measured from, and its computed `display`.',
  '  final String cssClass;',
  '  final String displayCss;',
  '',
  '  /// `background: var(--surface-2)`, as the same pass’s probe reads it.',
  '  final Color fillColor;',
  '',
  '  /// The frame `src/components/ui/Skeleton.tsx` adds with the utilities',
  '  /// `border border-[var(--line)]`. `.skeleton` itself authors no border — the',
  '  /// probe measures `border-top-width: 0px` for the class alone — which is what',
  '  /// makes this 1px frame the utility’s doing rather than the class’s, and',
  '  /// [borderWidthPx] is the width Tailwind’s `border` declaration carries.',
  '  final Color borderColor;',
  '  final double borderWidthPx;',
  '',
  '  /// `.skeleton`’s own `border-radius: var(--r-sm)`. It is the radius every',
  '  /// variant ends up with, including the one that asks for `rounded-full`:',
  '  /// see the note on [AppSkeletons.variantClasses].',
  '  final double radiusPx;',
  '',
  '  /// Authored `color-mix(in srgb, var(--surface) N%, transparent)` at the',
  '  /// middle of the sweep, and the same colour at zero alpha at its two ends.',
  '  ///',
  '  /// CSS writes those ends as the keyword `transparent`, whose channels a',
  '  /// premultiplied interpolation never reads. Flutter reads them: measured over',
  '  /// a black ground, a `transparent` → white@0.7 ramp came back grey at the',
  '  /// quarter point, so the port hands the transparent stop the sweep’s own',
  '  /// channels. That leaves the ramp constant-hue, which is what Chrome paints —',
  '  /// and it is the same in either interpolation space, so the pixel does not',
  '  /// depend on which one a given engine uses.',
  '  final Color sweepColor;',
  '  final Color sweepClearColor;',
  '',
  '  /// The gradient line, from the authored angle: 90deg is',
  '  /// `Alignment(-1, 0) → Alignment(1, 0)`, the box crossed left to right.',
  '  final Alignment sweepBegin;',
  '  final Alignment sweepEnd;',
  '  final double sweepMidStop;',
  '',
  '  /// The band starts at the element’s own `transform: translateX(-100%)` and',
  '  /// `@keyframes [animationName]` gives the frame at 100%; the element’s inset',
  '  /// is the whole box, so one percent of it is one box width.',
  '  final double sweepFromPercent;',
  '  final double sweepToPercent;',
  '',
  '  /// The authored `animation` shorthand: one loop of [sweepPeriod] on',
  '  /// [sweepCurve], taken from the keyword [sweepEaseKeyword] as css-easing-1',
  '  /// defines it, running forever ([iterationCss]). The class names no',
  '  /// `var(--dur-*)` or `var(--ease-*)` here, and the port takes that literally:',
  '  /// the shimmer is not on the §4 motion scale.',
  '  final int sweepMs;',
  '  final double easeX1;',
  '  final double easeY1;',
  '  final double easeX2;',
  '  final double easeY2;',
  '  final String animationName;',
  '  final String sweepEaseKeyword;',
  '  final String iterationCss;',
  '',
  '  BorderRadius get borderRadius => BorderRadius.circular(radiusPx);',
  '',
  '  Border get border => Border.all(color: borderColor, width: borderWidthPx);',
  '',
  '  /// The clip the sweep rides in. CSS `overflow: hidden` clips a box’s',
  '  /// descendants to its **padding** box, whose corner is the authored radius',
  '  /// minus the border width — 13px of a 14px corner. Flutter draws the border',
  '  /// inside the same outline, so reusing [radiusPx] here would let the sweep',
  '  /// paint over the frame it is meant to sit behind.',
  '  double get sweepClipRadiusPx {',
  '    final double inner = radiusPx - borderWidthPx;',
  '    return inner < 0.0 ? 0.0 : inner;',
  '  }',
  '',
  '  BorderRadius get sweepClipRadius => BorderRadius.circular(sweepClipRadiusPx);',
  '',
  '  Duration get sweepPeriod => Duration(milliseconds: sweepMs);',
  '',
  '  Cubic get sweepCurve => Cubic(easeX1, easeY1, easeX2, easeY2);',
  '',
  '  LinearGradient get sweepGradient => LinearGradient(',
  '    begin: sweepBegin,',
  '    end: sweepEnd,',
  '    colors: <Color>[sweepClearColor, sweepColor, sweepClearColor],',
  '    stops: <double>[0.0, sweepMidStop, 1.0],',
  '  );',
  '',
  '  /// The band’s x-shift at a point in its run. CSS interpolates the element’s',
  '  /// authored `translateX(-100%)` and the keyframe’s `translateX(100%)`',
  '  /// between them, so `t = 0` sits one width left of the box and `t = 1` one',
  '  /// width right; at `t = 0.5` the gradient is where the rule put it.',
  '  double sweepShiftPx(double width, double t) =>',
  '      width *',
  '      (sweepFromPercent + (sweepToPercent - sweepFromPercent) * t) /',
  '      100.0;',
  '}',
  '',
  '/// The §6 loading placeholders, keyed by CSS class — one map per measured',
  '/// brightness pass.',
  'abstract final class AppSkeletons {',
);
for (const [passName, pass, themeTag] of [
  ['light', 'l', 'light-desktop'],
  ['dark', 'd', 'dark-desktop'],
]) {
  L.push(
    `  /// ${passName} pass (UI_SPEC §6.1–§6.2, \`${themeTag}\`; the sweep from \`src/index.css\`).`,
    `  static const Map<String, AppSkeletonSpec> ${passName} =`,
    '      <String, AppSkeletonSpec>{',
  );
  for (const c of skeletons) {
    L.push(`    ${dartStr(c.cls)}: AppSkeletonSpec(`, skeletonExpr(c, c[pass]), '    ),');
  }
  L.push('  };', '');
}
L.push(
  '  /// The rules the row was read from, printed once because both passes share',
  '  /// them:',
  ...skeletons.flatMap((c) => [
    `  /// \`${c.cls}\` (${c.restSrc}) sets \`position: relative\`,`,
    `  /// \`overflow: hidden\`, the fill and \`border-radius: ${c.radiusToken}\`.`,
    `  /// \`${c.cls}::after\` (${c.sweepSrc}) fills the box (\`inset: 0\`,`,
    `  /// \`content: ${c.contentCss}\`), sweeps a \`${c.angleDeg}deg\` gradient that`,
    `  /// peaks at \`${c.sweepToken} ${c.sweepPct}%\` across \`${c.midStop * 100}%\` of`,
    `  /// the box, starts at \`translateX(${c.fromPercent}%)\`, and runs`,
    `  /// \`${c.anim.name} ${c.anim.ms}ms ${c.anim.easeKeyword} ${c.anim.iterationText}\`.`,
    `  /// \`@keyframes ${c.anim.name}\` (${c.framesSrc}) ends at`,
    `  /// \`translateX(${c.toPercent}%)\` and authors nothing else.`,
  ]),
  '  ///',
  '  /// A reduced-motion preference stops the sweep rather than slowing it.',
  '  /// ' + skeletons.map((c) => '`' + c.cls + '`').join(' and ') + ' is not taken off its',
  '  /// animation there; what stops it is the block at',
  `  /// ${skeletons.map((c) => c.mediaSrc).join(', ')}, which sets`,
  '  /// `animation-duration: 0.01ms !important` and',
  '  /// `animation-iteration-count: 1 !important` on `*`, `*::before` and',
  '  /// `*::after`, so the run finishes in an instant parked one box width off the',
  '  /// right edge — no band visible, only the resting fill and frame. That is the',
  '  /// answer the port gives. Flutter names that preference',
  '  /// `MediaQuery.disableAnimationsOf`: `MediaQueryData` carries no `reduceMotion`',
  '  /// flag of its own (`dart:ui.AccessibilityFeatures.reduceMotion` is the closer',
  '  /// primitive, but it is not routed through MediaQuery and a widget cannot',
  '  /// rebuild on it), and `disableAnimations` is the channel the framework already',
  '  /// treats as "stop animating this for me".',
  '',
  '  /// The variants `src/components/ui/Skeleton.tsx` composes over the class,',
  '  /// as that file writes them. They are Tailwind utilities, so they exist in',
  '  /// the generated stylesheet rather than in `src/index.css`, and the',
  '  /// component is the source that says what a skeleton is asked to look like.',
  '  static const Map<String, String> variantClasses = <String, String>{',
  ...Object.entries(SKELETON_VARIANT_CLASSES).map(([name, classes]) => `    ${dartStr(name)}: ${dartStr(classes)},`),
  '  };',
  '',
  `  /// The variant a skeleton gets when its caller asks for none — the default`,
  `  /// the component’s own signature carries (\`variant = '${skeletonDefault}'\`).`,
  `  static const String defaultVariant = ${dartStr(skeletonDefault)};`,
  '',
  '  /// Every variant asks for a radius and none of them gets it.',
  '  /// `src/index.css` authors `.skeleton` *unlayered*, while Tailwind emits',
  '  /// `rounded-*` inside `@layer utilities`, and in the cascade an unlayered',
  '  /// declaration outranks every layer regardless of where either appears. The',
  '  /// compiled stylesheet puts `@layer utilities{…}` before the component',
  '  /// classes for exactly that reason. Measured in Chrome: `rounded-full`,',
  '  /// `rounded-[var(--r-md)]` and `rounded-[var(--r-sm)]` all compute the',
  '  /// class’s 14px corner. So [AppSkeletonSpec.radiusPx] is the whole story,',
  '  /// and a phone that painted a circle here would be porting the component’s',
  '  /// intent instead of the browser’s result.',
  '',
  '  /// `h-<n>` is `calc(n * --spacing)`, which [AppSpacing.scale] implements on',
  '  /// the measured unit: the text row is 16px tall and the rectangular block',
  '  /// 96px. `circular` sizes by neither — the component gives it no height and',
  '  /// asks its caller for both dimensions (`shrink-0`).',
  `  static const double textHeightScale = ${fmt(SKELETON_VARIANT_HEIGHTS.text)};`,
  `  static const double rectangularHeightScale = ${fmt(SKELETON_VARIANT_HEIGHTS.rectangular)};`,
  '',
  '  static double get textHeightPx => AppSpacing.scale(textHeightScale);',
  '',
  '  static double get rectangularHeightPx =>',
  '      AppSpacing.scale(rectangularHeightScale);',
  '',
  '  /// The class list every skeleton carries, including the frame',
  '  /// [AppSkeletonSpec.borderColor] and [AppSkeletonSpec.borderWidthPx] come',
  `  /// from, and the \`motion-reduce:animate-none\` that does not reach the sweep:`,
  `  /// it applies \`animation: none\` to the element, and the animation lives on`,
  `  /// \`.skeleton::after\`, which the element’s own class cannot set.`,
  `  static const String baseClasses = ${dartStr(skeletonBaseClasses)};`,
  '',
  '  static AppSkeletonSpec resolve(String cssClass, Brightness brightness) {',
  '    final Map<String, AppSkeletonSpec> table =',
  '        brightness == Brightness.dark ? dark : light;',
  '    final AppSkeletonSpec? spec = table[cssClass];',
  "    if (spec == null) throw ArgumentError('$cssClass is not a §6 skeleton');",
  '    return spec;',
  '  }',
  '}',
  '',
);
finish('app_skeletons.dart');

// ---------------------------------------------------------------- §6 icon buttons (UI_SPEC header chrome)
// `.icon-btn` is the hairline pill the header hangs its chrome on (bell, theme,
// avatar). Its resting box is a §6 probe like every class above, but two facts put
// it outside both the controls table and the surfaces table: it carries a
// `backdrop-filter` the controls row rejects (generate_theme.cjs:1443), and that
// filter is `blur(10px)` with NO `saturate()`, the shape the shared `probeBackdrop`
// calls unportable. So it gets its own reader. Its `width`/`height` are not in the
// probe — the pill size is read from the same pinned `src/index.css` rule the
// transition is, and cross-checked to a square, exactly as the skeleton sizes
// itself by its `h-<n>` rule rather than a measured box.
// `:hover` exists and is dropped for the reason AppControls drops it — UI_SPEC D-U1,
// "decoration, not contract" on a touch screen. There is no `:active`/`:disabled`
// rule for `.icon-btn`, so there is no press state and no clock to port either.
const ICON_BUTTON_CLASSES = ['.icon-btn'];

/** A `backdrop-filter` as far as the icon pill needs it. The shared `probeBackdrop`
 *  insists on `blur() saturate()` together because every surface that reached for
 *  it authored both; `.icon-btn` blurs alone, so this accepts `blur(Npx)` with the
 *  saturate left genuinely absent, and only a saturate-without-a-blur (which no
 *  Flutter filter models) still fails the run. */
const iconBackdrop = (p, cls) => {
  const bf = p.backdropFilter;
  if (!bf) fail(`${cls}: no backdropFilter probe`);
  const raw = bf.raw.trim();
  if (raw === 'none') return { px: 0, saturate: null };
  const blur = /^blur\(([\d.]+)px\)$/.exec(raw);
  if (blur) return { px: parseFloat(blur[1]), saturate: null };
  const both = /^blur\(([\d.]+)px\) saturate\(([\d.]+)\)$/.exec(raw);
  if (both) return { px: parseFloat(both[1]), saturate: parseFloat(both[2]) };
  fail(`${cls}: unportable backdrop-filter "${bf.raw}"`);
};

/** The resting pill, straight from the probe: fill, border, the icon's colour, the
 *  corner and the blur. Not the size — that is the rule, added after the passes
 *  agree — and no type: the pill holds an SVG that inherits `color`, not text. */
const iconProbeRow = (cls, theme) => {
  const p = theme.probes[cls];
  if (!p) fail(`${theme.tag} theme has no ${cls} probe`);
  if (probeRaw(p, 'boxShadow', cls) !== 'none') {
    fail(
      `${cls}: the resting probe carries a box-shadow (${probeRaw(p, 'boxShadow', cls)}); no §6 row ports a resting shadow`,
    );
  }
  const bi = p.backgroundImage;
  if (bi && bi.raw !== 'none') {
    fail(`${cls}: the resting probe carries a background-image (${bi.raw}); the port paints a flat color-mix fill`);
  }
  const bd = iconBackdrop(p, cls);
  return {
    displayCss: probeRaw(p, 'display', cls),
    radiusPx: probePx(p, 'borderRadius', cls),
    borderWidthPx: probePx(p, 'borderTopWidth', cls),
    borderColor: probeSrgb(p, 'borderTopColor', cls),
    fillColor: probeSrgb(p, 'backgroundColor', cls),
    iconColor: probeSrgb(p, 'color', cls),
    paddingPx: probePx(p, 'padding', cls),
    blurPx: bd.px,
    blurSaturate: bd.saturate,
  };
};

const ICON_COLOUR_FIELDS = ['borderColor', 'fillColor', 'iconColor'];
const iconRow = (row) => {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (ICON_COLOUR_FIELDS.includes(key)) out[key] = value.hex;
    else if (value === null || typeof value !== 'object') out[key] = value;
    else fail(`the ${key} field is an object the pass check cannot compare`);
  }
  return out;
};
// Geometry that must not move between the two colour schemes: §6 prints one row.
const ICON_STABLE_FIELDS = ['displayCss', 'radiusPx', 'borderWidthPx', 'paddingPx', 'blurPx', 'blurSaturate'];

const iconButtons = ICON_BUTTON_CLASSES.map((cls) => {
  const l = iconProbeRow(cls, LIGHT);
  const d = iconProbeRow(cls, DARK);
  for (const [tag, theme, want] of [
    ['light-phone', LIGHT_PHONE, l],
    ['dark-phone', DARK_PHONE, d],
  ]) {
    const fp = iconRow(iconProbeRow(cls, theme));
    const fw = iconRow(want);
    for (const [key, value] of Object.entries(fp)) {
      if (fw[key] !== value) {
        fail(`${cls}: ${key} is "${value}" on ${tag} but "${fw[key]}" on its desktop pass`);
      }
    }
  }
  for (const key of ICON_STABLE_FIELDS) {
    if (l[key] !== d[key]) {
      fail(`${cls}: ${key} is "${l[key]}" in light and "${d[key]}" in dark; §6 prints one row`);
    }
  }

  // The pill's size is authored, not measured: read `width`/`height` from the
  // resting rule and require them equal, because the port draws one square box.
  // The rule wraps a multi-line `transition`, so it is wider than the default
  // scan window — 24 lines reaches its closing `}` and stops there.
  const rest = cssRule(new RegExp(`^\\${cls} \\{$`), cls, 24);
  const wRaw = cssDecl(rest, 'width', cls);
  const hRaw = cssDecl(rest, 'height', cls);
  const sizePx = lengthPx(wRaw, `${cls} width`);
  if (lengthPx(hRaw, `${cls} height`) !== sizePx) {
    fail(`${cls}: width ${wRaw} != height ${hRaw}; the port paints one square pill`);
  }
  if (l.radiusPx < sizePx / 2) {
    fail(`${cls}: radius ${l.radiusPx} is less than half the ${sizePx}px box; the port paints a full circle`);
  }

  const hov = CSS_LINES.findIndex((x) => new RegExp(`^\\${cls}:hover \\{$`).test(x));
  return {
    cls,
    l,
    d,
    sizePx,
    hoverSrc: hov < 0 ? 'none' : `src/index.css:${hov + 1}`,
    restSrc: `src/index.css:${rest.line}`,
  };
});

// ------------------------------------------------------------ the header-pill context
// `.glass-pill .icon-btn` (src/index.css:737) is the same button inside the header
// pill. The §6 probe measured a detached element, so it never saw the embedding —
// but the embedding does not have to be guessed either: the descendant rule
// authors exactly four literal declarations, and everything it does not author
// keeps the probe’s measured value. That is composition on the same evidence tier
// the nav bar’s authored placement numbers ride, and §6’s own column conventions
// settle the two things the rule text leaves open: a transparent *border* still
// occupies its `1px` layout (so the box stays a 34px square with a 1px invisible
// frame), and the untouched `backdrop-filter` keeps blurring (so the pill-context
// icon frosts its surroundings while painting no fill and no frame of its own).
const ICON_PILL_CLASS = '.glass-pill .icon-btn';

const pillHeads = CSS_LINES.reduce((acc, l, i) => (/^\.glass-pill \.icon-btn \{$/.test(l) ? acc.concat(i) : acc), []);
if (pillHeads.length !== 1) {
  fail(`${ICON_PILL_CLASS}: expected exactly one descendant rule, found ${pillHeads.length}`);
}
const pillRule = cssRule(/^\.glass-pill \.icon-btn \{$/, ICON_PILL_CLASS);
const pillProps = ruleProps(pillRule, ICON_PILL_CLASS);
const PILL_ALLOWED = ['width', 'height', 'background', 'border-color'];
const pillDeclared = pillProps.map(([prop]) => prop);
for (const prop of pillDeclared) {
  if (!PILL_ALLOWED.includes(prop)) {
    fail(
      `${ICON_PILL_CLASS}: the descendant rule sets \`${prop}\` (src/index.css:${pillRule.line}); nothing beyond the four literals composes`,
    );
  }
}
for (const prop of PILL_ALLOWED) {
  if (!pillDeclared.includes(prop)) {
    fail(`${ICON_PILL_CLASS}: the descendant rule no longer authors \`${prop}\` (src/index.css:${pillRule.line})`);
  }
}
const pillDecl = Object.fromEntries(pillProps);
if (pillDecl.background !== 'transparent' || pillDecl['border-color'] !== 'transparent') {
  fail(
    `${ICON_PILL_CLASS}: fill and frame must be literal transparent, got "${pillDecl.background}"/"${pillDecl['border-color']}"`,
  );
}
const pillSizePx = lengthPx(pillDecl.width, `${ICON_PILL_CLASS} width`);
if (lengthPx(pillDecl.height, `${ICON_PILL_CLASS} height`) !== pillSizePx) {
  fail(`${ICON_PILL_CLASS}: width ${pillDecl.width} != height ${pillDecl.height}; the port paints one square pill`);
}

const pillHover = cssRule(/^\.glass-pill \.icon-btn:hover \{$/, `${ICON_PILL_CLASS} hover`);
for (const [prop] of ruleProps(pillHover, `${ICON_PILL_CLASS} hover`)) {
  if (!['background', 'border-color'].includes(prop)) {
    fail(
      `${ICON_PILL_CLASS} hover sets \`${prop}\` (src/index.css:${pillHover.line}); D-U1 drops paint-only states and nothing else`,
    );
  }
}

const ICON_TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
const insidePill = (pass) => ({
  ...pass,
  fillColor: ICON_TRANSPARENT,
  borderColor: ICON_TRANSPARENT,
});
if (iconButtons.length !== 1 || iconButtons[0].cls !== '.icon-btn') {
  fail('the pill context composes against exactly one standalone icon-button class');
}
const baseIcon = iconButtons[0];
if (baseIcon.l.radiusPx < pillSizePx / 2) {
  fail(
    `${ICON_PILL_CLASS}: radius ${baseIcon.l.radiusPx} is less than half the ${pillSizePx}px box; the port paints a full circle`,
  );
}
iconButtons.push({
  cls: ICON_PILL_CLASS,
  l: insidePill(baseIcon.l),
  d: insidePill(baseIcon.d),
  sizePx: pillSizePx,
  hoverSrc: `src/index.css:${pillHover.line}`,
  restSrc: `src/index.css:${pillRule.line}`,
});

const iconButtonExpr = (c, pass) =>
  [
    `      cssClass: ${dartStr(c.cls)},`,
    `      displayCss: ${dartStr(pass.displayCss)},`,
    `      sizePx: ${fmt(c.sizePx)},`,
    `      radiusPx: ${fmt(pass.radiusPx)},`,
    `      borderWidthPx: ${fmt(pass.borderWidthPx)},`,
    `      borderColor: ${dartSurfaceColour(pass.borderColor)},`,
    `      fillColor: ${dartSurfaceColour(pass.fillColor)},`,
    `      iconColor: ${dartSurfaceColour(pass.iconColor)},`,
    `      paddingPx: ${fmt(pass.paddingPx)},`,
    `      blurPx: ${fmt(pass.blurPx)},`,
    `      blurSaturate: ${pass.blurSaturate === null ? 'null' : fmt(pass.blurSaturate)},`,
  ].join('\n');

// ================================================================ app_icon_buttons.dart
banner();
L.push(
  "import 'package:flutter/material.dart';",
  '',
  '/// The §6 icon-button rows: the standalone header-chrome pill, measured at',
  '/// rest by the §6 probe with its size read from the same pinned',
  '/// `src/index.css` rule, and the `.glass-pill .icon-btn` header context,',
  '/// composed from that probe and the descendant rule that refines it.',
  '/// A widget under `lib/presentation/` restates none of it.',
  '///',
  '/// `.icon-btn` is filled with `color-mix(… 70%, transparent)` and blurs',
  '/// `backdrop-filter: blur(10px)`, so its fill is genuinely translucent:',
  '/// [fillColor] carries that alpha rather than being flattened to an opaque',
  '/// colour, and [blurSigmaPx] is the port’s own blur mapping (CSS blur radius',
  '/// halved), the same one [AppSurfaceSpec] uses.',
  'class AppIconButtonSpec {',
  '  const AppIconButtonSpec({',
  '    required this.cssClass,',
  '    required this.displayCss,',
  '    required this.sizePx,',
  '    required this.radiusPx,',
  '    required this.borderWidthPx,',
  '    required this.borderColor,',
  '    required this.fillColor,',
  '    required this.iconColor,',
  '    required this.paddingPx,',
  '    required this.blurPx,',
  '    required this.blurSaturate,',
  '  });',
  '',
  '  /// The CSS class this row was measured from.',
  '  final String cssClass;',
  '',
  '  /// The computed `display`. Carried as data, not applied: the pill centres its',
  '  /// icon, which in Flutter is [AppIconButton]’s own `Alignment.center`.',
  '  final String displayCss;',
  '',
  '  /// The authored `width`/`height` of the square pill — the resting rule for',
  '  /// `.icon-btn`, the descendant rule for the header-pill context.',
  '  final double sizePx;',
  '  final double radiusPx;',
  '',
  '  /// Measured on one side; the class authors `border: 1px solid …`, i.e. uniform,',
  '  /// and [border] reproduces that ring. In the pill context the colour is',
  '  /// `transparent`: the frame still occupies its 1px of layout, it just paints',
  '  /// nothing — what §6 calls a transparent border, not a missing one.',
  '  final double borderWidthPx;',
  '  final Color borderColor;',
  '',
  '  /// The `color-mix(… 70%, transparent)` fill — translucent, as measured. The',
  '  /// pill-context row authors `background: transparent` instead: the header',
  '  /// pill behind it is the frost, the icon adds no fill of its own.',
  '  final Color fillColor;',
  '',
  '  /// The icon colour (`color: var(--ink-2)`), which the SVG inherits on the web',
  '  /// and the widget hands to its child through an IconTheme.',
  '  final Color iconColor;',
  '  final double paddingPx;',
  '',
  '  /// The `backdrop-filter` blur radius, in measured CSS px.',
  '  final double blurPx;',
  '  /// The `saturate()` the same filter would carry — `null` for `.icon-btn`,',
  '  /// which blurs alone. Recorded so the absence is measured, not a guess.',
  '  final double? blurSaturate;',
  '',
  '  BorderRadius get borderRadius => BorderRadius.circular(radiusPx);',
  '',
  '  Border get border => Border.all(color: borderColor, width: borderWidthPx);',
  '',
  '  /// CSS blur radius → Flutter sigma, the port’s fixed mapping (see',
  '  /// [AppSurfaceSpec.blurSigma]). Not a number a widget chose.',
  '  double get blurSigmaPx => blurPx / 2;',
  '',
  '  Size get size => Size(sizePx, sizePx);',
  '}',
  '',
  '/// The §6 icon buttons, keyed by CSS class — one map per measured pass.',
  'abstract final class AppIconButtons {',
);
for (const [passName, pass, themeTag] of [
  ['light', 'l', 'light-desktop'],
  ['dark', 'd', 'dark-desktop'],
]) {
  L.push(
    `  /// ${passName} pass (UI_SPEC §6, \`${themeTag}\`; sizes from the rules that author them).`,
    `  static const Map<String, AppIconButtonSpec> ${passName} =`,
    '      <String, AppIconButtonSpec>{',
  );
  for (const c of iconButtons) {
    L.push(`    ${dartStr(c.cls)}: AppIconButtonSpec(`, iconButtonExpr(c, c[pass]), '    ),');
  }
  L.push('  };', '');
}
L.push(
  '  /// The rules the port does NOT reproduce, printed once because both passes',
  '  /// author them identically:',
  ...iconButtons.flatMap((c) => [`  /// \`${c.cls}:hover\` at ${c.hoverSrc} — dropped per UI_SPEC D-U1;`, '']),
  '  /// `.icon-btn` authors no `:active`/`:disabled`, so there is no press state or',
  '  /// clock here — unlike AppControls, which has both.',
  '',
  '  /// The `.glass-pill .icon-btn` row is composed, not probed: the descendant',
  '  /// rule at src/index.css:737 authors exactly four literals — 34px width and',
  '  /// height, `background: transparent`, `border-color: transparent` — and every',
  '  /// other field is the standalone measurement it refines. §6’s column',
  '  /// conventions keep the transparent frame occupying its 1px of layout and the',
  '  /// untouched `backdrop-filter` blurring, so the pill-context icon frosts',
  '  /// without filling; its `:hover` is paint-only and dropped per D-U1, asserted',
  '  /// by the generator rather than trusted.',
  '',
  '  /// The measured pill for a class and brightness. An unknown class is a',
  '  /// programming error, not a fallback: nothing in this layer may quietly',
  '  /// become a Material default.',
  '  static AppIconButtonSpec resolve(String cssClass, Brightness brightness) {',
  '    final Map<String, AppIconButtonSpec> table =',
  '        brightness == Brightness.dark ? dark : light;',
  '    final AppIconButtonSpec? spec = table[cssClass];',
  "    if (spec == null) throw ArgumentError('$cssClass is not a §6 icon button');",
  '    return spec;',
  '  }',
  '}',
  '',
);
finish('app_icon_buttons.dart');

// ---------------------------------------------------------------- §6 nav (UI_SPEC NAVIGATION)
// `.floating-nav` and its children are the phone’s navigation: a fixed, centred,
// translucent pill at the bottom of the screen, holding label-under-icon items and
// one raised centre action. At ≥1024px the web hides the bar behind a
// `display: none` media rule and swaps to a sidebar — so the PHONE pass is the
// ground truth here, and the desktop probe is read only to prove that hiding. The
// desktop chrome itself (`src/index.css:854 .nav-link`, `src/index.css:1070
// .nav-pill`) is a surface no phone screen writes, so it is recorded as a
// finding, not ported.
//
// Four classes share one spec row. `.nav-item-active` is measured twice and the
// two measurements mean different things: on a bare element the harness cannot
// see the `.nav-item` it sits beside (block/static/defaults), while the composed
// `.nav-item.nav-item-active` probe is the class on a real tab. Geometry therefore
// comes from the composed probe — which is how the class is actually ever written
// — and the generator proves the bare probe’s colour, the one field the authored
// class changes, matches it. The bar sizes, gaps and the fab’s lift and press are
// authored numbers the probe cannot see, read from the pinned rules, exactly as
// `.icon-btn`’s size was.
const NAV_CLASSES = ['.floating-nav', '.nav-item', '.nav-item-active', '.nav-fab'];

/** Where a class’s row is measured. See the block comment: the active class is
 *  only ever on an element that also carries `.nav-item`. */
const NAV_GEOMETRY_PROBE = { '.nav-item-active': '.nav-item.nav-item-active' };

/** Which authored rule makes a row a text row. `.nav-item-active` carries the
 *  label type it shares with `.nav-item`, not type of its own — and the bar and
 *  the fab author no font properties at all, so their type fields stay null
 *  because the measurement was never theirs to make. */
const NAV_TYPE_AUTHORED_BY = { '.nav-item': '.nav-item', '.nav-item-active': '.nav-item' };

/** One §6 nav row straight from the probe: frame, fill, ink, corner, padding,
 *  backdrop and the resting shadow list. */
const navProbeRow = (cls, theme) => {
  const probeCls = NAV_GEOMETRY_PROBE[cls] ?? cls;
  const p = theme.probes[probeCls];
  if (!p) fail(`${theme.tag} theme has no ${probeCls} probe`);
  const bi = p.backgroundImage;
  if (bi && bi.raw !== 'none') {
    fail(`${cls}: the probe carries a background-image (${bi.raw}); the port paints a flat fill`);
  }
  const bd = iconBackdrop(p, cls);
  const pad = probePadding(p, cls);
  const typed = NAV_TYPE_AUTHORED_BY[cls] !== undefined;
  const lineRaw = probeRaw(p, 'lineHeight', cls);
  const spaceRaw = probeRaw(p, 'letterSpacing', cls);
  let fontWeight = null;
  if (typed) {
    const w = probeRaw(p, 'fontWeight', cls);
    if (!/^([1-9]00)$/.test(w)) fail(`${cls}: fontWeight "${w}" is not a 100-900 step`);
    fontWeight = parseInt(w, 10);
  }
  return {
    displayCss: probeRaw(p, 'display', cls),
    position: probeRaw(p, 'position', cls),
    radiusPx: probePx(p, 'borderRadius', cls),
    borderWidthPx: probePx(p, 'borderTopWidth', cls),
    borderColor: probeSrgb(p, 'borderTopColor', cls),
    fillColor: probeSrgb(p, 'backgroundColor', cls),
    fgColor: probeSrgb(p, 'color', cls),
    blurPx: bd.px,
    blurSaturate: bd.saturate,
    shadows: probeShadow(p, cls),
    paddingVerticalPx: pad.vertical,
    paddingHorizontalPx: pad.horizontal,
    fontFamily: typed ? probeFamily(p, cls) : null,
    fontSizePx: typed ? probePx(p, 'fontSize', cls) : null,
    fontWeight,
    lineHeightPx: !typed || lineRaw === 'normal' ? null : lengthPx(lineRaw, `${cls} lineHeight`),
    letterSpacingPx: !typed || spaceRaw === 'normal' ? null : lengthPx(spaceRaw, `${cls} letterSpacing`),
  };
};

const NAV_COLOUR_FIELDS = ['borderColor', 'fillColor', 'fgColor'];
/** A row flattened to what `!==` can decide; the shadow list enters as its exact
 *  JSON, so a layer the phone gained or dropped fails the pass check instead of
 *  being compared by reference. */
const navFlat = (row) => {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (NAV_COLOUR_FIELDS.includes(key)) out[key] = value.hex;
    else if (key === 'shadows') out[key] = value === null ? 'null' : JSON.stringify(value);
    else if (value === null || typeof value !== 'object') out[key] = value;
    else fail(`the ${key} field is an object the pass check cannot compare`);
  }
  return out;
};
// Geometry and type that must not move between the two colour schemes. The
// shadow list is the colour pass’s own (`--shadow-float` is a per-pass token)
// and stays out; §6 prints one row for everything else.
const NAV_STABLE_FIELDS = [
  'displayCss',
  'position',
  'radiusPx',
  'borderWidthPx',
  'blurPx',
  'blurSaturate',
  'paddingVerticalPx',
  'paddingHorizontalPx',
  'fontFamily',
  'fontSizePx',
  'fontWeight',
  'lineHeightPx',
  'letterSpacingPx',
];

const navs = NAV_CLASSES.map((cls) => {
  // The phone passes are the port: the bar does not even display on desktop.
  const l = navProbeRow(cls, LIGHT_PHONE);
  const d = navProbeRow(cls, DARK_PHONE);
  for (const [tag, theme, want] of [
    ['light-desktop', LIGHT, l],
    ['dark-desktop', DARK, d],
  ]) {
    const row = navFlat(navProbeRow(cls, theme));
    const fw = navFlat(want);
    for (const [key, value] of Object.entries(row)) {
      // The bar’s own display is the documented phone/desktop split, asserted
      // once below against the media rule rather than averaged away here.
      if (cls === '.floating-nav' && key === 'displayCss') continue;
      if (fw[key] !== value) {
        fail(`${cls}: ${key} is "${value}" on ${tag} but "${fw[key]}" on its phone pass`);
      }
    }
  }
  for (const key of NAV_STABLE_FIELDS) {
    if (l[key] !== d[key]) {
      fail(`${cls}: ${key} is "${l[key]}" in light and "${d[key]}" in dark; §6 prints one row`);
    }
  }

  // Authored numbers the probe cannot see, plus the state rules around them.
  // The nav rules wrap multi-line `transition` and `box-shadow` values, so the
  // same widened window `.icon-btn` needed reads them all; the scan still stops
  // at the first `}`-terminated line.
  const rest = cssRule(new RegExp(`^\\${cls} \\{$`), cls, 24);
  const authored = {
    sizePx: null,
    minWidthPx: null,
    heightPx: null,
    gapPx: null,
    liftPx: null,
    maxBarWidthPx: null,
    edgeInsetPx: null,
    bottomGapPx: null,
    pressScale: null,
    transition: null,
  };
  const hover = CSS_LINES.findIndex((x) => new RegExp(`^\\${cls}:hover \\{$`).test(x));
  let mediaHideSrc = null;
  let activeSrc = null;

  if (cls === '.floating-nav') {
    if (l.displayCss !== 'flex') fail(`.floating-nav: the phone probe displays "${l.displayCss}"`);
    if (navProbeRow(cls, LIGHT).displayCss !== 'none') {
      fail('.floating-nav: the desktop probe still displays the bar; the media hide moved and the port must know');
    }
    // The indented head is the one inside `@media (min-width: 1024px)` — the
    // column-0 head is the resting rule.
    const hiddenAt = CSS_LINES.findIndex((x) => /^\s+\.floating-nav \{$/.test(x));
    if (hiddenAt < 0) fail('.floating-nav: no indented rule head — the @media block hides nothing');
    mediaHideSrc = `src/index.css:${hiddenAt + 1}`;
    const bm = /^calc\(([\d.]+)px \+ env\(safe-area-inset-bottom, 0px\)\)$/.exec(cssDecl(rest, 'bottom', cls));
    if (!bm) fail(`.floating-nav: bottom "${cssDecl(rest, 'bottom', cls)}" is not a fixed gap over the safe area`);
    authored.bottomGapPx = parseFloat(bm[1]);
    const wm = /^min\(100% - ([\d.]+)px, ([\d.]+)px\)$/.exec(cssDecl(rest, 'width', cls));
    if (!wm) fail(`.floating-nav: width "${cssDecl(rest, 'width', cls)}" is not the inset-capped pill`);
    authored.edgeInsetPx = parseFloat(wm[1]);
    authored.maxBarWidthPx = parseFloat(wm[2]);
    authored.gapPx = lengthPx(cssDecl(rest, 'gap', cls), `${cls} gap`);
  }

  if (cls === '.nav-item') {
    authored.minWidthPx = lengthPx(cssDecl(rest, 'min-width', cls), `${cls} min-width`);
    authored.heightPx = lengthPx(cssDecl(rest, 'height', cls), `${cls} height`);
    authored.gapPx = lengthPx(cssDecl(rest, 'gap', cls), `${cls} gap`);
    if (hover < 0) fail('.nav-item: the hover rule the class transitions moved out from under the port');
    const hov = cssRule(new RegExp(`^\\${cls}:hover \\{$`), cls);
    checkStateProps(ruleProps(hov, cls), ['color'], ':hover', cls, hov.line);
    // Its one animated property is the one the port drops, so the clock needs no
    // field — but it must still be the clock the §6 rule names.
    const tr = cssDecl(rest, 'transition', cls).replace(/\s+/g, ' ');
    if (tr !== 'color var(--dur-fast) var(--ease-out)') {
      fail(`.nav-item: transition "${tr}" animates more than the dropped hover colour`);
    }
  }

  if (cls === '.nav-item-active') {
    // The class is the composition’s colour alone: anything else it authored
    // would have shown as a difference against the bare `.nav-item` row below.
    const extra = ruleProps(rest, cls).filter(([prop]) => prop !== 'color');
    if (extra.length) {
      fail(
        `.nav-item-active: authors ${extra.map(([p]) => `\`${p}\``).join(', ')}; the class was read as a colour-only override`,
      );
    }
    const hv = cssRule(/^\.nav-item-active:hover,$/, cls);
    checkStateProps(ruleProps(hv, cls), ['color'], ':hover/:focus-visible', cls, hv.line);
  }

  if (cls === '.nav-fab') {
    const w = lengthPx(cssDecl(rest, 'width', cls), `${cls} width`);
    const h = lengthPx(cssDecl(rest, 'height', cls), `${cls} height`);
    if (w !== h) fail(`.nav-fab: width ${w} != height ${h}; the port paints one square action`);
    authored.sizePx = w;
    const mt = lengthPx(cssDecl(rest, 'margin-top', cls), `${cls} margin-top`);
    if (mt >= 0) fail(`.nav-fab: margin-top ${mt} is not a lift above the bar`);
    authored.liftPx = -mt;
    const act = cssRule(new RegExp(`^\\${cls}:active \\{$`), cls);
    checkStateProps(ruleProps(act, cls), ['transform'], ':active', cls, act.line);
    const sm = /^scale\(([\d.]+)\)$/.exec(cssDecl(act, 'transform', cls));
    if (!sm) fail(`.nav-fab: :active transform "${cssDecl(act, 'transform', cls)}" is not a plain scale(N)`);
    authored.pressScale = parseFloat(sm[1]);
    if (!(authored.pressScale > 0 && authored.pressScale <= 1)) {
      fail(`.nav-fab: press scale ${authored.pressScale} is not a squeeze`);
    }
    authored.transition = controlTransition(rest, cls, ['transform']);
    activeSrc = `src/index.css:${act.line}`;
  }

  return {
    cls,
    l,
    d,
    authored,
    restSrc: `src/index.css:${rest.line}`,
    hoverSrc: hover < 0 ? 'none' : `src/index.css:${hover + 1}`,
    mediaHideSrc,
    activeSrc,
  };
});

// Cross-class invariants — each is one of the UI_SPEC table’s rows disagreeing
// with another, which no single-row read could see.
{
  const by = Object.fromEntries(navs.map((c) => [c.cls, c]));
  const item = by['.nav-item'];
  const active = by['.nav-item-active'];
  const fab = by['.nav-fab'];
  const bar = by['.floating-nav'];
  if (!(bar.l.fillColor.alpha < 1 && bar.l.fillColor.alpha > 0)) {
    fail(`.floating-nav: the 82% mix measures α ${bar.l.fillColor.alpha}; the port paints no translucent bar`);
  }
  for (const [tag, iRow, aRow, fRow, theme] of [
    ['light', item.l, active.l, fab.l, LIGHT_PHONE],
    ['dark', item.d, active.d, fab.d, DARK_PHONE],
  ]) {
    if (aRow.fgColor.hex === iRow.fgColor.hex) {
      fail(`.nav-item-active: the ${tag} active ink equals the resting ink — the selected tab would be invisible`);
    }
    if (fRow.fgColor.hex !== aRow.fgColor.hex) {
      fail(`.nav-fab: the ${tag} fab ink is not the active-tab ink; both are authored var(--accent-fg)`);
    }
    // The bare active probe measured the same colour the composed one carries —
    // the one field the class changes is the one field it changes identically.
    const bare = probeSrgb(theme.probes['.nav-item-active'], 'color', '.nav-item-active');
    if (bare.hex !== aRow.fgColor.hex) {
      fail(`.nav-item-active: ${tag} composed ink ${aRow.fgColor.hex} != bare probe ${bare.hex}`);
    }
    const flatA = navFlat(aRow);
    const flatI = navFlat(iRow);
    // The one computed field the colour change drags along: neither class
    // authors a border, so the probe's border-colour is `currentColor` and it
    // follows the ink. Asserting that chase (active frame == active ink) keeps
    // the skip honest rather than blind.
    if (aRow.borderColor.hex !== aRow.fgColor.hex || iRow.borderColor.hex !== iRow.fgColor.hex) {
      fail(`.nav-item: ${tag} border colour is not currentColor; the active-row border skip needs re-reading`);
    }
    for (const [key, value] of Object.entries(flatA)) {
      if (key === 'fgColor' || key === 'borderColor') continue;
      if (flatI[key] !== value) {
        fail(
          `.nav-item-active: ${tag} ${key} is "${value}" while .nav-item is "${flatI[key]}"; the class authors colour only`,
        );
      }
    }
  }
}

const navExpr = (c, pass) => {
  const num = (v) => (v === null ? 'null' : fmt(v));
  const trans = c.authored.transition;
  return [
    `      cssClass: ${dartStr(c.cls)},`,
    `      displayCss: ${dartStr(pass.displayCss)},`,
    `      position: ${dartStr(pass.position)},`,
    `      radiusPx: ${fmt(pass.radiusPx)},`,
    `      borderWidthPx: ${fmt(pass.borderWidthPx)},`,
    `      borderColor: ${dartSurfaceColour(pass.borderColor)},`,
    `      fillColor: ${dartSurfaceColour(pass.fillColor)},`,
    `      fgColor: ${dartSurfaceColour(pass.fgColor)},`,
    `      blurPx: ${fmt(pass.blurPx)},`,
    `      blurSaturate: ${num(pass.blurSaturate)},`,
    `      shadows: ${pass.shadows ? shadowListExpr(pass.shadows) : 'null'},`,
    `      paddingVerticalPx: ${fmt(pass.paddingVerticalPx)},`,
    `      paddingHorizontalPx: ${fmt(pass.paddingHorizontalPx)},`,
    `      fontFamily: ${pass.fontFamily === null ? 'null' : dartStr(pass.fontFamily)},`,
    `      fontSizePx: ${num(pass.fontSizePx)},`,
    `      fontWeight: ${pass.fontWeight === null ? 'null' : pass.fontWeight},`,
    `      lineHeightPx: ${num(pass.lineHeightPx)},`,
    `      letterSpacingPx: ${num(pass.letterSpacingPx)},`,
    `      sizePx: ${num(c.authored.sizePx)},`,
    `      minWidthPx: ${num(c.authored.minWidthPx)},`,
    `      heightPx: ${num(c.authored.heightPx)},`,
    `      gapPx: ${num(c.authored.gapPx)},`,
    `      liftPx: ${num(c.authored.liftPx)},`,
    `      maxBarWidthPx: ${num(c.authored.maxBarWidthPx)},`,
    `      edgeInsetPx: ${num(c.authored.edgeInsetPx)},`,
    `      bottomGapPx: ${num(c.authored.bottomGapPx)},`,
    `      pressScale: ${num(c.authored.pressScale)},`,
    `      transitionMs: ${trans === null ? 'null' : trans.ms},`,
    `      easeX1: ${trans === null ? 'null' : fmt(trans.curve[0])},`,
    `      easeY1: ${trans === null ? 'null' : fmt(trans.curve[1])},`,
    `      easeX2: ${trans === null ? 'null' : fmt(trans.curve[2])},`,
    `      easeY2: ${trans === null ? 'null' : fmt(trans.curve[3])},`,
  ].join('\n');
};

// ================================================================ app_navs.dart
banner();
L.push(
  "import 'package:flutter/material.dart';",
  '',
  '/// One §6 navigation class — the phone’s floating bottom bar, one of its',
  '/// tabs, the selected tab, or the raised centre action — measured on the',
  '/// phone pass, with the authored placement numbers the probe cannot see read',
  '/// from the same pinned `src/index.css` rules. A widget under',
  '/// `lib/presentation/` restates none of it.',
  '///',
  '/// The four rows share one shape because one widget composes them: fields a',
  '/// class does not author are `null` — a measured absence, not a default.',
  '/// In particular:',
  '/// * `.floating-nav` fills with `color-mix(… 82%, transparent)` over a',
  '///   `backdrop-filter: blur(22px) saturate(1.5)`, so [fillColor] carries that',
  '///   alpha and [blurSigmaPx] is the port’s own blur mapping (CSS blur radius',
  '///   halved, as in [AppSurfaceSpec]). The `saturate()` travels as data and is',
  '///   unimplemented — the same recorded finding [AppSurfaceSpec] carries.',
  '/// * `.nav-item-active` is the composed measurement (`.nav-item` carrying the',
  '///   override): identical geometry to a resting tab, the accent ink instead.',
  '/// * `.nav-fab` is the only state the family ports: `:active` scales it on the',
  '///   clock its own rule transitions ([pressScale], [transitionMs], [pressCurve]).',
  '/// * `env(safe-area-inset-bottom)` in the bar’s `bottom` becomes the host’s',
  '///   view padding at paint time, not a number in this table.',
  'class AppNavSpec {',
  '  const AppNavSpec({',
  '    required this.cssClass,',
  '    required this.displayCss,',
  '    required this.position,',
  '    required this.radiusPx,',
  '    required this.borderWidthPx,',
  '    required this.borderColor,',
  '    required this.fillColor,',
  '    required this.fgColor,',
  '    required this.blurPx,',
  '    required this.blurSaturate,',
  '    required this.shadows,',
  '    required this.paddingVerticalPx,',
  '    required this.paddingHorizontalPx,',
  '    required this.fontFamily,',
  '    required this.fontSizePx,',
  '    required this.fontWeight,',
  '    required this.lineHeightPx,',
  '    required this.letterSpacingPx,',
  '    required this.sizePx,',
  '    required this.minWidthPx,',
  '    required this.heightPx,',
  '    required this.gapPx,',
  '    required this.liftPx,',
  '    required this.maxBarWidthPx,',
  '    required this.edgeInsetPx,',
  '    required this.bottomGapPx,',
  '    required this.pressScale,',
  '    required this.transitionMs,',
  '    required this.easeX1,',
  '    required this.easeY1,',
  '    required this.easeX2,',
  '    required this.easeY2,',
  '  });',
  '',
  '  /// The CSS class this row was measured from.',
  '  final String cssClass;',
  '',
  '  /// The computed `display` and `position`, on the pass that shows the bar.',
  '  /// Carried as data, not applied: the Flutter placement is [AppNav]’s own',
  '  /// composition, and desktop hides this surface entirely.',
  '  final String displayCss;',
  '  final String position;',
  '',
  '  final double radiusPx;',
  '',
  '  /// Measured on one side; `.nav-item` measures 0px — no frame at all.',
  '  final double borderWidthPx;',
  '  final Color borderColor;',
  '',
  '  /// The resting fill: the bar’s translucent 82% mix, the fab’s solid accent,',
  '  /// the tab’s measured transparent.',
  '  final Color fillColor;',
  '  /// The ink (`color`): a tab’s resting `--ink-3`, an active tab’s or the',
  '  /// fab’s `--accent-fg`.',
  '  final Color fgColor;',
  '',
  '  /// The `backdrop-filter` blur in CSS px; `0.0` is the measured `none`.',
  '  final double blurPx;',
  '  /// The `saturate()` the same filter carries — recorded, unimplemented.',
  '  final double? blurSaturate;',
  '',
  '  /// The measured resting `box-shadow` list, layer for layer: the bar’s',
  '  /// `--shadow-float` and the fab’s `--shadow-float` + 35% accent halo.',
  '  /// Tabs measured `none`.',
  '  final List<BoxShadow>? shadows;',
  '',
  '  final double paddingVerticalPx;',
  '  final double paddingHorizontalPx;',
  '',
  '  /// The label type, authored only by `.nav-item` (and so by the composed',
  '  /// active row); `null` on the bar and the fab, which author no font.',
  '  final String? fontFamily;',
  '  final double? fontSizePx;',
  '  final int? fontWeight;',
  '  final double? lineHeightPx;',
  '  final double? letterSpacingPx;',
  '',
  '  /// Authored placement, the probe’s blind spots: the fab’s square size, the',
  '  /// tab’s `min-width`/`height` floor, the flex `gap`s, the fab’s `-14px`',
  '  /// lift, and the bar’s `min(100% - 24px, 460px)` pair plus its `bottom`',
  '  /// gap over the safe area.',
  '  final double? sizePx;',
  '  final double? minWidthPx;',
  '  final double? heightPx;',
  '  final double? gapPx;',
  '  final double? liftPx;',
  '  final double? maxBarWidthPx;',
  '  final double? edgeInsetPx;',
  '  final double? bottomGapPx;',
  '',
  '  /// The fab’s `:active scale(…)` and the `transition` clock its own rule',
  '  /// names; null on every other row, which authors no press state.',
  '  final double? pressScale;',
  '  final int? transitionMs;',
  '  final double? easeX1;',
  '  final double? easeY1;',
  '  final double? easeX2;',
  '  final double? easeY2;',
  '',
  '  BorderRadius get borderRadius => BorderRadius.circular(radiusPx);',
  '',
  '  /// `null` where the class measured no frame, rather than a zero-width one.',
  '  Border? get border => borderWidthPx == 0',
  '      ? null',
  '      : Border.all(color: borderColor, width: borderWidthPx);',
  '',
  '  /// CSS blur radius → Flutter sigma, the port’s fixed mapping (see',
  '  /// [AppSurfaceSpec.blurSigma]); `null` where the filter measured `none`.',
  '  double? get blurSigmaPx => blurPx == 0 ? null : blurPx / 2;',
  '',
  '  /// The measured `font-weight`, which the classes author as a number and',
  '  /// Flutter names — the same mapping [AppControlSpec.weight] applies.',
  '  FontWeight get weight => FontWeight.values[fontWeight! ~/ 100 - 1];',
  '',
  '  /// The line box the tab measures, as the multiple of its own font size',
  '  /// Flutter wants: the 12px box over the authored 8px, no literal between.',
  '  double? get lineHeightRatio =>',
  '      lineHeightPx == null || fontSizePx == null',
  '          ? null',
  '          : lineHeightPx! / fontSizePx!;',
  '',
  '  /// The fab’s press clock, duration and curve both authored by the class.',
  '  Duration? get pressDuration {',
  '    final int? ms = transitionMs;',
  '    return ms == null ? null : Duration(milliseconds: ms);',
  '  }',
  '  Curve? get pressCurve => easeX1 == null',
  '      ? null',
  '      : Cubic(easeX1!, easeY1!, easeX2!, easeY2!);',
  '}',
  '',
  '/// The §6 floating-navigation rows, keyed by CSS class — one map per',
  '/// measured phone pass.',
  'abstract final class AppNavs {',
);
for (const [passName, rowName, themeTag] of [
  ['light', 'l', 'light-phone'],
  ['dark', 'd', 'dark-phone'],
]) {
  L.push(
    `  /// ${passName} pass (UI_SPEC §6, \`${themeTag}\`; placement from the resting rules).`,
    `  static const Map<String, AppNavSpec> ${passName} =`,
    '      <String, AppNavSpec>{',
  );
  for (const c of navs) {
    L.push(`    ${dartStr(c.cls)}: AppNavSpec(`, navExpr(c, c[rowName]), '    ),');
  }
  L.push('  };', '');
}
const navFloating = navs.find((c) => c.cls === '.floating-nav');
const navItemHover = navs.find((c) => c.cls === '.nav-item');
const navActive = navs.find((c) => c.cls === '.nav-item-active');
L.push(
  '  /// The rules the port does NOT reproduce, printed once because every',
  '  /// measured pass authors them identically:',
  `  /// * \`${navFloating.cls}\` is hidden on desktop at ${navFloating.mediaHideSrc}`,
  '  ///   (`@media (min-width: 1024px) { … display: none }`); the desktop chrome',
  '  ///   that replaces it (`.nav-link` at src/index.css:854, `.nav-pill` at',
  '  ///   src/index.css:1070) is a surface no phone screen writes, so it is not',
  '  ///   ported. The phone pass is therefore the bar’s measurement.',
  `  /// * \`.nav-item:hover\` at ${navItemHover.hoverSrc} and`,
  '  ///   `.nav-item-active:hover`/`:focus-visible` (src/index.css:1197) change',
  '  ///   only `color` — decoration, not contract, dropped per UI_SPEC D-U1.',
  '',
  '  /// `.nav-fab` is the family’s one ported state: `:active` at',
  `  /// ${navs.find((c) => c.cls === '.nav-fab').activeSrc} scales the action,`,
  '  /// animating the `transform` its resting rule transitions — the same one',
  '  /// clock AppControls ports, no colour repaint beneath it.',
  '',
  '  /// The measured rows for a class and brightness. An unknown class is a',
  '  /// programming error, not a fallback: nothing in this layer may quietly',
  '  /// become a Material default.',
  '  static AppNavSpec resolve(String cssClass, Brightness brightness) {',
  '    final Map<String, AppNavSpec> table =',
  '        brightness == Brightness.dark ? dark : light;',
  '    final AppNavSpec? spec = table[cssClass];',
  "    if (spec == null) throw ArgumentError('$cssClass is not a §6 nav class');",
  '    return spec;',
  '  }',
  '}',
  '',
);
finish('app_navs.dart');

// ---------------------------------------------------------------- write + summary
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [name, text] of dartFiles) {
  fs.writeFileSync(path.join(OUT_DIR, name), text, 'utf8');
}

// The house style is `dart format` output; formatting here (not by hand) keeps
// the generated bytes and the committed bytes one and the same thing. A parse
// error in the emitted Dart fails the run instead of landing in the tree.
// Resolution order: $DART_BIN, $FLUTTER_ROOT (flutter/bin first, then the
// dart-sdk the flutter wrapper proxies to), then `dart` on PATH.
function resolveDart() {
  const exe = process.platform === 'win32' ? 'dart.exe' : 'dart';
  const cands = [];
  if (process.env.DART_BIN) cands.push(process.env.DART_BIN);
  if (process.env.FLUTTER_ROOT) {
    cands.push(path.join(process.env.FLUTTER_ROOT, 'bin', exe));
    cands.push(path.join(process.env.FLUTTER_ROOT, 'bin', 'cache', 'dart-sdk', 'bin', exe));
  }
  cands.push('dart');
  for (const c of cands) {
    try {
      execFileSync(c, ['--version'], { stdio: 'ignore' });
      return c;
    } catch {
      /* next candidate */
    }
  }
  fail('cannot find the Dart SDK: put flutter/bin on PATH, or set DART_BIN / FLUTTER_ROOT');
}
execFileSync(resolveDart(), ['format', OUT_DIR], { stdio: 'inherit' });

console.log(
  [
    'generate_theme.cjs — tokens emitted into mobile/lib/core/theme/',
    `  colour tokens (UI_SPEC §2.1):  ${colours.length}  (${colours.filter((c) => !sameColour(c)).length} light/dark pairs, ${colours.filter(sameColour).length} equal-value singles)`,
    `  gradient tokens (§2.2):        ${gradientTokens.length}  -> AppColors`,
    `  shadow tokens (§2.2):          ${shadowTokens.length}  -> AppShadows`,
    `  non-colour tokens (§2.3):      ${others.length}  (type ${byKind.type.length}, stacks ${byKind.stacks.length}, weights ${byKind.weights.length}, radii ${byKind.radii.length}, blur ${byKind.blurs.length}, spacing ${byKind.spacing.length}, containers ${byKind.containers.length}, motion ${byKind.motion.length}, animations ${byKind.animations.length})`,
    `  §3 probe classes (phone):      ${typeClasses.length}`,
    `  ThemeSlots pinned:             ${schemeMap.length}`,
    `  §6 card surfaces emitted:    ${surfaces.length} classes x 2 passes  -> AppSurfaces`,
    `  §6 controls emitted:         ${controls.length} classes x 2 passes  -> AppControls`,
    `  §6 fields emitted:           ${fields.length} classes x 2 passes  -> AppFields`,
    `  §6 labels emitted:           ${labels.length} classes x 2 passes  -> AppLabels`,
    `  §6 skeletons emitted:        ${skeletons.length} classes x 2 passes  -> AppSkeletons`,
    `  §6 icon buttons emitted:     ${iconButtons.length} classes x 2 passes  -> AppIconButtons`,
    `  §6 nav emitted:              ${navs.length} classes x 2 passes  -> AppNavs`,
    `  files written:                 ${dartFiles.map((f) => f[0]).join(', ')}`,
  ].join('\n'),
);
