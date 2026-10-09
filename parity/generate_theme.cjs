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
    `  files written:                 ${dartFiles.map((f) => f[0]).join(', ')}`,
  ].join('\n'),
);
