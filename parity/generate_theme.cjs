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

// ================================================================ app_modals.dart
// #56 — the two shared shells, `ui/Modal.tsx` and `ui/BottomSheet.tsx`, port as ONE
// primitive with a dialog and a sheet variant. Every value below is read from the
// per-pass utility-stack rows and the authored non-CSS entries recorded in
// `parity/ui-tokens.json`; a value that no pass measured fails generation. Divergent
// viewport behaviour (shell padding and docking, the sheet's bottom corners, border
// sides and grip) is carried as an explicit wide/narrow pair, never averaged.

const US = TOKENS.utilityStacks;
if (!US || !Array.isArray(US.rows) || !Array.isArray(US.authoredNonCss)) {
  fail('ui-tokens.json records no utilityStacks tier — app_modals.dart would have no evidence to emit from');
}
const readTsx = (...segs) => fs.readFileSync(path.join(ROOT, 'src', ...segs), 'utf8').split(/\r?\n/);
const MODAL_TSX = readTsx('components', 'ui', 'Modal.tsx');
const SHEET_TSX = readTsx('components', 'ui', 'BottomSheet.tsx');
const tsxLine = (lines, file, line, text) => {
  const src = lines[line - 1];
  if (src === undefined || !src.includes(text)) {
    fail(`recorded "${text}" at ${file}:${line}, but that line reads "${src}"`);
  }
};
const usRow = (name) => {
  const r = US.rows.find((x) => x.name === name);
  if (!r) fail(`ui-tokens.json records no utility stack row "${name}"`);
  return r;
};
const usAuthored = (name) => {
  const e = US.authoredNonCss.find((x) => x.name === name);
  if (!e) fail(`ui-tokens.json records no authored non-CSS entry "${name}"`);
  return e;
};
const stackProps = (theme, name) => {
  const row = theme.stacks && theme.stacks[name];
  if (!row) fail(`"${name}": the ${theme.viewport.name} pass recorded no utility stack row`);
  return row.props;
};
/** Row provenance for doc comments: the class-list part lines of the recorded row. */
const stackSrc = (name) => {
  const r = usRow(name);
  const file = r.src || US.source;
  return `${file}:${(r.parts || []).map((p) => p.line).join(',')}`;
};

/** A px length Chrome may print in exponential form — the full-round radius
 *  (`3.35544e+07px`, the engine's clamp of a `rounded-full` pill) among them. */
const lenAnyPx = (raw, label) => {
  const m = /^(-?[\d.]+(?:e\+[\d.]+)?)px$/.exec(raw.trim());
  if (!m) fail(`${label}: "${raw}" is not a px length`);
  const v = parseFloat(m[1]);
  if (!Number.isFinite(v)) fail(`${label}: "${raw}" is not a finite length`);
  return v;
};
const stackLenPx = (props, field, name) => {
  const raw = probeRaw(props, field, name);
  return raw.includes('e+') ? lenAnyPx(raw, `${name} ${field}`) : lengthPx(raw, `${name} ${field}`);
};
/** The row's single uniform `padding`, or the `0 A` horizontal pair of a header. */
const stackUniformPad = (props, name) => {
  const raw = probeRaw(props, 'padding', name);
  const parts = raw.split(/\s+/).map((s) => lenAnyPx(s, `${name} padding`));
  if (parts.some((p) => p !== parts[0])) {
    fail(`${name}: padding "${raw}" is not a single uniform value the port can carry as EdgeInsets.all`);
  }
  return parts[0];
};
const stackPaddingH = (props, name) => {
  const raw = probeRaw(props, 'padding', name);
  const m = /^0px ([\d.]+px)$/.exec(raw);
  if (!m) fail(`${name}: padding "${raw}" is not the "0 A" horizontal pair a flex header authors`);
  return lenAnyPx(m[1], `${name} padding`);
};
/** `blur(Npx)` from the row's backdrop-filter; the row must have measured one. */
const stackBlurPx = (props, name) => {
  const raw = probeRaw(props, 'backdropFilter', name);
  const m = /^blur\(([\d.]+)px\)$/.exec(raw);
  if (!m) fail(`${name}: backdrop-filter "${raw}" is not a plain blur(Npx)`);
  return parseFloat(m[1]);
};
/** `border-radius` as the top/bottom pair Chrome prints (`16px 16px 0px 0px` on
 *  the phone sheet, one uniform value everywhere else). */
const stackRadius = (props, name) => {
  const raw = probeRaw(props, 'borderRadius', name);
  const parts = raw.split(/\s+/).map((s) => lenAnyPx(s, `${name} radius`));
  if (parts.length === 1) return { top: parts[0], bottom: parts[0] };
  if (parts.length === 4 && parts[0] === parts[1] && parts[2] === parts[3]) {
    return { top: parts[0], bottom: parts[2] };
  }
  fail(`${name}: borderRadius "${raw}" is neither uniform nor an authored top/bottom pair`);
};
/** `rgba(…)`-serialised shadow layers of a stack row, parsed through the same
 *  engine-first reader the §6 surfaces use. */
const stackShadowLayers = (props, name) => {
  const bs = props.boxShadow;
  if (!bs) fail(`${name}: no boxShadow probe`);
  const raw = typeof bs === 'string' ? bs : bs.substituted || bs.raw;
  if (raw === 'none') return [];
  return probeShadowList(raw, name);
};
const colourKey = (c) => `rgba(${c.r}, ${c.g}, ${c.b}, ${c.alpha})`;
const stackColour = (props, field, name) => {
  const c = probeSrgb(props, field, name);
  return { r: c.r, g: c.g, b: c.b, alpha: c.alpha };
};
/** A vh-style cap divided by the height the pass measured it at. Flutter has no
 *  vh unit: the port carries the fraction and sizes it from MediaQuery, which is
 *  what reproduces the measured pixel cap on any viewport, not a pinned px. */
const capFraction = (px, theme, name) => {
  const f = px / theme.viewport.height;
  if (!Number.isInteger(Math.round(f * 1000) / 10) || Math.abs(f * 100 - Math.round(f * 100)) > 1e-9) {
    fail(`${name}: cap ${px}px / viewport ${theme.viewport.height}px = ${f} is not a clean authored vh fraction`);
  }
  return Math.round(f * 100) / 100;
};

const MODAL_VARIANTS = [
  {
    key: '.modal-panel',
    label: 'dialog',
    file: 'src/components/ui/Modal.tsx',
    lines: MODAL_TSX,
    rows: {
      shell: 'modal-shell',
      veil: 'modal-veil',
      panel: 'modal-panel',
      header: 'modal-header',
      title: 'modal-title',
      close: 'modal-close',
      body: 'modal-body',
    },
    gripRow: null,
    motion: { veil: 'modal-veil-motion', panel: 'modal-panel-motion', behaviour: 'modal-behaviour' },
    capScope: 'body',
    // The only two viewport-divergent dialog values: the shell's and the body's
    // Tailwind `sm:` padding steps. Docking, box and border do not move.
    viewportDivergent: ['shellPaddingPx', 'bodyPaddingPx'],
  },
  {
    key: '.sheet-panel',
    label: 'sheet',
    file: 'src/components/ui/BottomSheet.tsx',
    lines: SHEET_TSX,
    rows: {
      shell: 'sheet-shell',
      veil: 'sheet-veil',
      panel: 'sheet-panel',
      header: 'sheet-header',
      title: 'sheet-title',
      close: 'sheet-close',
      body: 'sheet-body',
    },
    gripRow: 'sheet-grip',
    motion: { veil: 'sheet-veil-motion', panel: 'sheet-panel-motion', behaviour: 'sheet-panel-motion' },
    capScope: 'panel',
    // `items-end sm:items-center`, `rounded-t-2xl sm:rounded-2xl`,
    // `border-t sm:border`, `sm:hidden` on the grip, and the body's `sm:` padding.
    viewportDivergent: [
      'shellAlignItems',
      'panelRadiusBottomPx',
      'panelBorderRightPx',
      'panelBorderLeftPx',
      'panelBorderBottomPx',
      'gripDisplay',
      'bodyPaddingPx',
    ],
  },
];

const readModalRow = (v, theme, tag) => {
  const P = (n) => stackProps(theme, v.rows[n]);
  const shell = P('shell');
  const veil = P('veil');
  const panel = P('panel');
  const header = P('header');
  const title = P('title');
  const close = P('close');
  const body = P('body');
  const grip = v.gripRow ? stackProps(theme, v.gripRow) : null;
  const weight = probeRaw(title, 'fontWeight', `${v.key} title`);
  if (!/^([1-9]00)$/.test(weight)) fail(`${v.key}: title fontWeight "${weight}" is not a 100-900 step`);
  const r = {
    shellPaddingPx: stackUniformPad(shell, `${tag} ${v.key} shell`),
    shellAlignItems: probeRaw(shell, 'alignItems', `${tag} ${v.key} shell`),
    shellOverflowY: probeRaw(shell, 'overflowY', `${tag} ${v.key} shell`),
    shellZIndex: probeRaw(shell, 'zIndex', `${tag} ${v.key} shell`),
    panelZIndex: probeRaw(panel, 'zIndex', `${tag} ${v.key} panel`),
    veilFill: stackColour(veil, 'backgroundColor', `${tag} ${v.key} veil`),
    veilBlurPx: stackBlurPx(veil, `${tag} ${v.key} veil`),
    panelMaxWidthPx: stackLenPx(panel, 'maxWidth', `${tag} ${v.key} panel`),
    panelMarginTopPx: stackLenPx(panel, 'marginTop', `${tag} ${v.key} panel`),
    panelMarginBottomPx: stackLenPx(panel, 'marginBottom', `${tag} ${v.key} panel`),
    panelBorderTopPx: stackLenPx(panel, 'borderTopWidth', `${tag} ${v.key} panel`),
    panelBorderRightPx: stackLenPx(panel, 'borderRightWidth', `${tag} ${v.key} panel`),
    panelBorderBottomPx: stackLenPx(panel, 'borderBottomWidth', `${tag} ${v.key} panel`),
    panelBorderLeftPx: stackLenPx(panel, 'borderLeftWidth', `${tag} ${v.key} panel`),
    panelFill: stackColour(panel, 'backgroundColor', `${tag} ${v.key} panel`),
    panelBorderColour: stackColour(panel, 'borderTopColor', `${tag} ${v.key} panel`),
    panelShadowRaw: (() => {
      const bs = panel.boxShadow;
      if (!bs) fail(`${tag} ${v.key} panel: no boxShadow probe`);
      const raw = typeof bs === 'string' ? bs : bs.substituted || bs.raw;
      if (raw === 'none') fail(`${tag} ${v.key} panel: carries no box-shadow, but the shells port one`);
      return raw;
    })(),
    headerHeightPx: stackLenPx(header, 'height', `${tag} ${v.key} header`),
    headerPaddingHPx: stackPaddingH(header, `${tag} ${v.key} header`),
    headerBorderBottomPx: stackLenPx(header, 'borderBottomWidth', `${tag} ${v.key} header`),
    headerBorderTopPx: stackLenPx(header, 'borderTopWidth', `${tag} ${v.key} header`),
    headerBorderBottomColour: stackColour(header, 'borderTopColor', `${tag} ${v.key} header`),
    headerFill: stackColour(header, 'backgroundColor', `${tag} ${v.key} header`),
    titleFontSizePx: stackLenPx(title, 'fontSize', `${tag} ${v.key} title`),
    titleFontWeight: parseInt(weight, 10),
    titleLineHeightPx: stackLenPx(title, 'lineHeight', `${tag} ${v.key} title`),
    titleLetterSpacingPx: stackLenPx(title, 'letterSpacing', `${tag} ${v.key} title`),
    titleColour: stackColour(title, 'color', `${tag} ${v.key} title`),
    closeWidthPx: stackLenPx(close, 'width', `${tag} ${v.key} close`),
    closeHeightPx: stackLenPx(close, 'height', `${tag} ${v.key} close`),
    closeRadiusPx: lenAnyPx(probeRaw(close, 'borderRadius', `${tag} ${v.key} close`), `${tag} ${v.key} close radius`),
    closeBorderTopPx: stackLenPx(close, 'borderTopWidth', `${tag} ${v.key} close`),
    closeBorderRightPx: stackLenPx(close, 'borderRightWidth', `${tag} ${v.key} close`),
    closeBorderBottomPx: stackLenPx(close, 'borderBottomWidth', `${tag} ${v.key} close`),
    closeBorderLeftPx: stackLenPx(close, 'borderLeftWidth', `${tag} ${v.key} close`),
    closeFill: stackColour(close, 'backgroundColor', `${tag} ${v.key} close`),
    closeFgColour: stackColour(close, 'color', `${tag} ${v.key} close`),
    closeBorderColour: stackColour(close, 'borderTopColor', `${tag} ${v.key} close`),
    bodyPaddingPx: stackUniformPad(body, `${tag} ${v.key} body`),
  };
  const radius = stackRadius(panel, `${tag} ${v.key} panel`);
  r.panelRadiusTopPx = radius.top;
  r.panelRadiusBottomPx = radius.bottom;
  const bodyMax = probeRaw(body, 'maxHeight', `${tag} ${v.key} body`);
  const panelMax = probeRaw(panel, 'maxHeight', `${tag} ${v.key} panel`);
  r.bodyMaxHeightPx = bodyMax === 'none' ? null : stackLenPx(body, 'maxHeight', `${tag} ${v.key} body`);
  r.panelMaxHeightPx = panelMax === 'none' ? null : stackLenPx(panel, 'maxHeight', `${tag} ${v.key} panel`);
  if (v.capScope === 'body') {
    if (r.bodyMaxHeightPx === null) fail(`${v.key}: the dialog body carries no measured max-height cap`);
    if (r.panelMaxHeightPx !== null)
      fail(`${v.key}: the dialog panel also caps at ${r.panelMaxHeightPx}px; model it explicitly`);
    r.bodyCapFraction = capFraction(r.bodyMaxHeightPx, theme, `${tag} ${v.key} body cap`);
    r.panelCapFraction = null;
  } else {
    if (r.panelMaxHeightPx === null) fail(`${v.key}: the sheet panel carries no measured max-height cap`);
    if (r.bodyMaxHeightPx !== null)
      fail(`${v.key}: the sheet body also caps at ${r.bodyMaxHeightPx}px; model it explicitly`);
    r.panelCapFraction = capFraction(r.panelMaxHeightPx, theme, `${tag} ${v.key} panel cap`);
    r.bodyCapFraction = null;
  }
  if (grip) {
    r.gripDisplay = probeRaw(grip, 'display', `${tag} ${v.key} grip`);
    r.gripWidthPx = stackLenPx(grip, 'width', `${tag} ${v.key} grip`);
    r.gripHeightPx = stackLenPx(grip, 'height', `${tag} ${v.key} grip`);
    r.gripRadiusPx = lenAnyPx(probeRaw(grip, 'borderRadius', `${tag} ${v.key} grip`), `${tag} ${v.key} grip radius`);
    r.gripMarginTopPx = stackLenPx(grip, 'marginTop', `${tag} ${v.key} grip`);
    r.gripMarginBottomPx = stackLenPx(grip, 'marginBottom', `${tag} ${v.key} grip`);
    r.gripFill = stackColour(grip, 'backgroundColor', `${tag} ${v.key} grip`);
  }
  return r;
};

const MODAL_COLOUR_KEYS = [
  'veilFill',
  'panelFill',
  'panelBorderColour',
  'headerBorderBottomColour',
  'headerFill',
  'titleColour',
  'closeFill',
  'closeFgColour',
  'closeBorderColour',
  'gripFill',
];

const modalScalar = (row, k) => {
  const v = row[k];
  if (v === undefined || v === null) return v === undefined ? '<missing>' : 'null';
  if (MODAL_COLOUR_KEYS.includes(k)) return colourKey(v);
  if (typeof v === 'object') fail(`row field ${k} is an unexamined object`);
  return String(v);
};

/** Brightness pair: geometry, type and box must not move with the colour scheme —
 *  colours and shadows are what the scheme exists to change. Viewport pair: only
 *  the variant's recorded `sm:` divergences may move, and the row carries each
 *  side explicitly rather than a blend of the two. */
const compareModalRows = (v, a, b, tagA, tagB, keys) => {
  for (const k of keys) {
    const av = modalScalar(a, k);
    const bv = modalScalar(b, k);
    if (av !== bv) {
      fail(`${v.key}: ${k} is "${av}" on ${tagA} but "${bv}" on ${tagB}`);
    }
  }
};
const compareModalViewport = (v, wide, narrow, keys) => {
  const divergent = [];
  for (const k of keys) {
    if (v.viewportDivergent.includes(k)) {
      if (modalScalar(wide, k) !== modalScalar(narrow, k)) divergent.push(k);
      continue;
    }
    if (modalScalar(wide, k) !== modalScalar(narrow, k)) {
      fail(
        `${v.key}: ${k} is "${modalScalar(wide, k)}" on the desktop pass but "${modalScalar(narrow, k)}" on the phone pass — not a recorded sm: divergence`,
      );
    }
  }
  return divergent;
};

const modalVariantData = MODAL_VARIANTS.map((v) => {
  const rows = {};
  for (const [tag, theme] of [
    ['light-desktop', LIGHT],
    ['dark-desktop', DARK],
    ['light-phone', LIGHT_PHONE],
    ['dark-phone', DARK_PHONE],
  ]) {
    rows[tag] = readModalRow(v, theme, tag);
  }
  // Key lists come from this variant’s own rows: the sheet records grip fields
  // the dialog does not, and every recorded field must be compared somewhere.
  const keys = Object.keys(rows['light-desktop']);
  for (const k of ['bodyMaxHeightPx', 'panelMaxHeightPx', 'bodyCapFraction', 'panelCapFraction']) {
    if (!keys.includes(k)) fail(`${v.key}: the row builder recorded no ${k} field`);
  }
  const colourKeys = keys.filter((k) => MODAL_COLOUR_KEYS.includes(k));
  const geometryKeys = keys.filter((k) => !MODAL_COLOUR_KEYS.includes(k) && k !== 'panelShadowRaw');
  // The viewport pair compares everything the port carries per side except the
  // shadow (compared above by raw string) and the vh cap in px — those px are a
  // function of the measured viewport height by design; their ported form is
  // the fraction, and the fraction is in this list and must be equal.
  const viewportKeys = keys.filter(
    (k) => k !== 'panelShadowRaw' && k !== 'bodyMaxHeightPx' && k !== 'panelMaxHeightPx',
  );
  compareModalRows(v, rows['light-desktop'], rows['dark-desktop'], 'light-desktop', 'dark-desktop', geometryKeys);
  compareModalRows(v, rows['light-phone'], rows['dark-phone'], 'light-phone', 'dark-phone', geometryKeys);
  compareModalRows(v, rows['light-desktop'], rows['light-phone'], 'light-desktop', 'light-phone', colourKeys);
  compareModalRows(v, rows['dark-desktop'], rows['dark-phone'], 'dark-desktop', 'dark-phone', colourKeys);
  const diverged = compareModalViewport(v, rows['light-desktop'], rows['light-phone'], viewportKeys);
  if (rows['light-desktop'].panelShadowRaw !== rows['light-phone'].panelShadowRaw) {
    fail(`${v.key}: the panel shadow moves with the viewport; the port carries one row per brightness`);
  }
  for (const k of v.viewportDivergent) {
    if (!diverged.includes(k)) {
      fail(
        `${v.key}: ${k} is whitelisted as a sm: divergence but the two passes measured it equal — drop it from the model`,
      );
    }
  }
  // One-sided box asserts that comparePassRows cannot express: borders are uniform
  // on desktop, and the phone sheet keeps only its top border.
  const d = rows['light-desktop'];
  const n = rows['light-phone'];
  if (new Set([d.panelBorderTopPx, d.panelBorderRightPx, d.panelBorderBottomPx, d.panelBorderLeftPx]).size !== 1) {
    fail(
      `${v.key}: the desktop panel border is not uniform (${d.panelBorderTopPx}/${d.panelBorderRightPx}/${d.panelBorderBottomPx}/${d.panelBorderLeftPx})`,
    );
  }
  if (new Set([n.panelBorderRightPx, n.panelBorderLeftPx]).size !== 1) {
    fail(`${v.key}: the phone panel side borders differ (${n.panelBorderRightPx}/${n.panelBorderLeftPx})`);
  }
  if (d.panelMarginTopPx !== d.panelMarginBottomPx || n.panelMarginTopPx !== n.panelMarginBottomPx) {
    fail(`${v.key}: the panel margins are not a symmetric my pair`);
  }
  if (d.closeWidthPx !== d.closeHeightPx)
    fail(`${v.key}: the close target is not square (${d.closeWidthPx}x${d.closeHeightPx})`);
  if (new Set([d.closeBorderTopPx, d.closeBorderRightPx, d.closeBorderBottomPx, d.closeBorderLeftPx]).size !== 1) {
    fail(`${v.key}: the close border is not uniform`);
  }
  if (d.headerBorderTopPx !== 0) fail(`${v.key}: the header also borders its top; the shells author border-b only`);
  if (d.panelRadiusTopPx !== d.panelRadiusBottomPx) {
    fail(
      `${v.key}: the desktop panel radius is not uniform (${d.panelRadiusTopPx}/${d.panelRadiusBottomPx}); sm:rounded-2xl rounds all four corners`,
    );
  }
  if (n.gripMarginTopPx !== undefined && n.gripMarginTopPx !== n.gripMarginBottomPx) {
    fail(`${v.key}: the grip margins are not a symmetric my pair`);
  }
  return { v, rows, diverged };
});

// ------------------------------------------------ motion, behaviour, widths (authored entries)
const parseSpring = (entry, v) => {
  const tr = entry.parts.filter((p) => /transition=/.test(p.text) && /spring/.test(p.text));
  if (tr.length !== 1) fail(`${entry.name}: expected exactly one spring transition part, found ${tr.length}`);
  tsxLine(v.lines, v.file, tr[0].line, tr[0].text);
  const m = /^transition=\{\{ type: 'spring', damping: ([\d.]+), stiffness: ([\d.]+) \}\}$/.exec(tr[0].text);
  if (!m) fail(`${entry.name}: spring "${tr[0].text}" is not the authored damping/stiffness pair`);
  return { damping: parseFloat(m[1]), stiffness: parseFloat(m[2]), at: `${v.file}:${tr[0].line}` };
};
const parsePanelKeyframes = (entry, v) => {
  const texts = entry.parts.map((p) => p.text);
  const initial = entry.parts.find((p) => /^initial=/.test(p.text));
  const animate = entry.parts.find((p) => /^animate=/.test(p.text));
  const exit = entry.parts.find((p) => /^exit=/.test(p.text));
  if (!initial || !animate || !exit) fail(`${entry.name}: panel keyframe parts incomplete: ${texts.join(' | ')}`);
  tsxLine(v.lines, v.file, initial.line, initial.text);
  tsxLine(v.lines, v.file, animate.line, animate.text);
  tsxLine(v.lines, v.file, exit.line, exit.text);
  if (exit.text.slice('exit='.length) !== initial.text.slice('initial='.length)) {
    fail(`${entry.name}: exit "${exit.text}" does not restate initial "${initial.text}"`);
  }
  const d = /^\{\{ opacity: ([\d.]+), scale: ([\d.]+), y: ([\d.]+) \}\}$/.exec(initial.text.slice('initial='.length));
  if (d) {
    if (animate.text !== 'animate={{ opacity: 1, scale: 1, y: 0 }}') {
      fail(`${entry.name}: animate "${animate.text}" is not the identity target of the dialog keyframes`);
    }
    return { opacityFrom: parseFloat(d[1]), scale: parseFloat(d[2]), dyPx: parseFloat(d[3]), ownHeight: null };
  }
  const s = /^\{\{ y: '([\d.]+)%' \}\}$/.exec(initial.text.slice('initial='.length));
  if (s) {
    if (animate.text !== 'animate={{ y: 0 }}') {
      fail(`${entry.name}: animate "${animate.text}" is not the sheet's y: 0 target`);
    }
    return { opacityFrom: null, scale: null, dyPx: null, ownHeight: parseFloat(s[1]) / 100 };
  }
  fail(`${entry.name}: initial "${initial.text}" is neither the dialog scale/lift nor the sheet own-height slide`);
};
const parseVeilFade = (entry, v) => {
  const tr = entry.parts.find((p) => /^transition=/.test(p.text));
  if (!tr) fail(`${entry.name}: no transition part`);
  tsxLine(v.lines, v.file, tr.line, tr.text);
  const m = /^transition=\{\{ duration: ([\d.]+) \}\}$/.exec(tr.text);
  if (!m) fail(`${entry.name}: veil transition "${tr.text}" is not a plain duration tween`);
  const ms = parseFloat(m[1]) * 1000;
  if (!Number.isInteger(ms)) fail(`${entry.name}: ${ms} ms is not an integral fade`);
  const opacity = entry.parts.filter((p) => /opacity: [\d.]+/.test(p.text)).map((p) => p.text);
  if (opacity.length !== 3)
    fail(`${entry.name}: expected initial/animate/exit opacity parts, got ${opacity.join(' | ')}`);
  for (const p of entry.parts) tsxLine(v.lines, v.file, p.line, p.text);
  return { ms, at: `${v.file}:${tr.line}` };
};
const modalFades = modalVariantData.map(({ v }) => parseVeilFade(usAuthored(v.motion.veil), v));
if (modalFades[0].ms !== modalFades[1].ms) {
  fail('the two shell veils fade on different clocks; port one duration per variant instead of a shared constant');
}
const veilFadeMs = modalFades[0].ms;
const veilFadeAt = modalFades.map((f) => f.at).join(' and ');
/** The tween curve the shells never author: motion's own default, read from the
 *  package the app ships (`motion-dom/dist/es/animation/generators/keyframes.mjs`
 *  defaults `ease = "easeInOut"`; `motion-utils/.../easing/ease.mjs` defines it).
 *  A framework default, not a Chrome measurement — logged as a deviation. */

const modalMotion = modalVariantData.map(({ v }) => {
  const panelEntry = usAuthored(v.motion.panel);
  const spring = parseSpring(panelEntry, v);
  const keys = parsePanelKeyframes(panelEntry, v);
  return { v, spring, keys };
});

// Escape + body-lock, straight from the authored behaviour parts and the sources.
const modalBehaviour = usAuthored('modal-behaviour');
for (const p of modalBehaviour.parts) tsxLine(MODAL_TSX, 'src/components/ui/Modal.tsx', p.line, p.text);
const modalEscapePart = modalBehaviour.parts.find((p) => /Escape/.test(p.text));
if (!modalEscapePart) fail('modal-behaviour records no Escape part; the dialog close-on-key is unevidenced');
const modalEscapeAt = `src/components/ui/Modal.tsx:${modalEscapePart.line}`;
const sheetLockEntry = usAuthored('sheet-panel-motion');
for (const p of sheetLockEntry.parts) tsxLine(SHEET_TSX, 'src/components/ui/BottomSheet.tsx', p.line, p.text);
if (SHEET_TSX.join('\n').includes('Escape'))
  fail('BottomSheet.tsx DOES carry Escape; sheet escapeCloses=false is wrong');
const modalLockParts = modalBehaviour.parts.filter((p) => /overflow = 'hidden'/.test(p.text));
const sheetLockParts = sheetLockEntry.parts.filter((p) => /overflow = 'hidden'/.test(p.text));
if (!modalLockParts.length || !sheetLockParts.length) fail('a shell lost its recorded body scroll-lock part');
const modalLockAt = [
  ...modalLockParts.map((p) => `src/components/ui/Modal.tsx:${p.line}`),
  ...sheetLockParts.map((p) => `src/components/ui/BottomSheet.tsx:${p.line}`),
].join(', ');

// The close glyph: recorded as authored px sizes, verified at the cited source lines.
const glyphEntry = usAuthored('sheet-icon-sizes');
const glyphSizes = new Set();
const glyphAt = [];
for (const p of glyphEntry.parts) {
  const m = /^size=\{(\d+)\}$/.exec(p.text);
  if (!m) fail(`sheet-icon-sizes part "${p.text}" is not a size={N} literal`);
  glyphSizes.add(parseInt(m[1], 10));
  const file = p.src || 'src/components/ui/Modal.tsx';
  tsxLine(p.src && p.src.endsWith('BottomSheet.tsx') ? SHEET_TSX : MODAL_TSX, file, p.line, p.text);
  glyphAt.push(`${file}:${p.line}`);
}
if (glyphSizes.size !== 1) fail(`the shells close with more than one glyph size: ${[...glyphSizes].join('/')}`);
const closeGlyphPx = [...glyphSizes][0];

// Panel max widths: the class each panel actually carries vs the measured container
// token, plus the full map the dialog prop selects from (scoped to sm/md/lg).
const widthTokenOfPanel = (name) => {
  const row = usRow(name);
  const toks = new Set();
  for (const p of row.parts || []) {
    for (const m of (p.cls || '').matchAll(/\bmax-w-([\w-]+)\b/g)) toks.add(m[1]);
  }
  if (toks.size !== 1) fail(`${name}: carries ${toks.size} max-w classes; the port expects exactly one`);
  return [...toks][0];
};
const panelWidthTokens = {
  '.modal-panel': widthTokenOfPanel('modal-panel'),
  '.sheet-panel': widthTokenOfPanel('sheet-panel'),
};
const WIDTH_KEYS = ['sm', 'md', 'lg'];
const widthPxTable = {};
for (const k of WIDTH_KEYS) {
  const tok = LIGHT.root[`--container-${k}`];
  if (!tok) fail(`--container-${k} is not measured in the light pass :root`);
  for (const theme of [LIGHT, DARK, LIGHT_PHONE, DARK_PHONE]) {
    if (JSON.stringify(theme.root[`--container-${k}`]) !== JSON.stringify(tok)) {
      fail(`--container-${k} moves between passes; the width table would need a pass per side`);
    }
  }
  widthPxTable[k] = lengthPx(typeof tok === 'object' ? tok.raw : tok, `--container-${k}`);
}
const modalDefaultWidth = (() => {
  const start = MODAL_TSX.findIndex((l) => /const maxWidths/.test(l));
  if (start === -1) fail('Modal.tsx declares no maxWidths map');
  const entries = [];
  for (let i = start + 1; i < MODAL_TSX.length; i++) {
    const line = MODAL_TSX[i];
    if (/^\s*\};/.test(line)) break;
    const m = /^\s*(?:'(\w+)'|(\w+)):\s*'max-w-([\w-]+)',?\s*$/.exec(line);
    if (!m) fail(`maxWidths map line ${i + 1} "${line.trim()}" is not a key: 'max-w-<key>' pair`);
    entries.push({ key: m[1] !== undefined ? m[1] : m[2], cls: m[3], at: `src/components/ui/Modal.tsx:${i + 1}` });
  }
  if (!entries.length) fail('the maxWidths map is empty');
  const ported = entries.filter((e) => WIDTH_KEYS.includes(e.key));
  if (ported.length !== WIDTH_KEYS.length) fail('the maxWidths map is missing a ported sm/md/lg token');
  for (const e of ported) {
    if (e.key !== e.cls) fail(`maxWidths entry ${e.at}: key ${e.key} selects max-w-${e.cls}`);
  }
  const def = usAuthored('modal-width-prop');
  for (const p of def.parts) tsxLine(MODAL_TSX, 'src/components/ui/Modal.tsx', p.line, p.text);
  const defaultPart = def.parts.find((p) => /maxWidth = /.test(p.text));
  const defaultTok = /maxWidth = '(\w+)',/.exec(defaultPart.text);
  if (!defaultTok || !WIDTH_KEYS.includes(defaultTok[1]))
    fail(`dialog default width "${defaultTok && defaultTok[1]}" is not a ported token`);
  return { token: defaultTok[1], unported: entries.filter((e) => !WIDTH_KEYS.includes(e.key)) };
})();
const modalUnportedWidths = modalDefaultWidth.unported.map((e) => `${e.key} (${e.at})`).join(', ');
const modalWidthOf = {
  '.modal-panel': panelWidthTokens['.modal-panel'],
  '.sheet-panel': panelWidthTokens['.sheet-panel'],
};
if (modalWidthOf['.modal-panel'] !== modalDefaultWidth.token) {
  fail(
    `the dialog panel carries max-w-${modalWidthOf['.modal-panel']} but the prop default is ${modalDefaultWidth.token}`,
  );
}

// The alternate veil recipes the primitive's parameter must be able to name:
// black/60 + the 8px --blur-sm token (qa/tem) and the DebtDetail 6px literal.
const dimVeilColour = { r: 0, g: 0, b: 0, alpha: 0.6 };
const dimVeilBlurPx = (() => {
  const blurTok = LIGHT.root['--blur-sm'];
  if (!blurTok) fail('--blur-sm is not measured in the light pass :root');
  const tokPx = lengthPx(typeof blurTok === 'object' ? blurTok.raw : blurTok, '--blur-sm');
  for (const name of ['qa-veil', 'tem-veil']) {
    for (const [tag, theme] of [
      ['light-desktop', LIGHT],
      ['dark-desktop', DARK],
      ['light-phone', LIGHT_PHONE],
      ['dark-phone', DARK_PHONE],
    ]) {
      const p = stackProps(theme, name);
      const c = stackColour(p, 'backgroundColor', `${tag} ${name}`);
      if (colourKey(c) !== colourKey(dimVeilColour))
        fail(`${tag} ${name}: veil is ${colourKey(c)}, not the recorded black/60`);
      const b = stackBlurPx(p, `${tag} ${name}`);
      if (b !== tokPx) fail(`${tag} ${name}: backdrop-blur-sm resolves to ${b}px, token says ${tokPx}px`);
    }
  }
  return tokPx;
})();
const debtVeilBlurPx = (() => {
  for (const [tag, theme] of [
    ['light-desktop', LIGHT],
    ['dark-desktop', DARK],
    ['light-phone', LIGHT_PHONE],
    ['dark-phone', DARK_PHONE],
  ]) {
    const p = stackProps(theme, 'debt-veil');
    const c = stackColour(p, 'backgroundColor', `${tag} debt-veil`);
    if (colourKey(c) !== colourKey(dimVeilColour)) fail(`${tag} debt-veil: ${colourKey(c)} is not the black/60 recipe`);
    if (stackBlurPx(p, `${tag} debt-veil`) !== 6) fail(`${tag} debt-veil: the literal blur is not 6px`);
  }
  return 6;
})();

// The rule both shells draw under their headers: authored height in the pinned
// stylesheet, measured fill in the probe of every pass.
const LEDGER_RULE = cssRule(/^\.ledger-rule \{$/, '.ledger-rule');
const ledgerHeightPx = lengthPx(cssDecl(LEDGER_RULE, 'height', '.ledger-rule'), '.ledger-rule height');
const ledgerFills = {};
for (const [tag, theme] of [
  ['light-desktop', LIGHT],
  ['dark-desktop', DARK],
  ['light-phone', LIGHT_PHONE],
  ['dark-phone', DARK_PHONE],
]) {
  const probe = theme.probes['.ledger-rule'];
  if (!probe) fail(`${tag}: no .ledger-rule probe`);
  ledgerFills[tag] = stackColour(probe, 'backgroundColor', `${tag} .ledger-rule`);
}
if (colourKey(ledgerFills['light-desktop']) !== colourKey(ledgerFills['light-phone']))
  fail('the ledger rule changes colour with the viewport');
if (colourKey(ledgerFills['dark-desktop']) !== colourKey(ledgerFills['dark-phone']))
  fail('the ledger rule changes colour with the viewport');

// ------------------------------------------------------------------ emit Dart
const modalSpecExpr = (v, base, narrow, tag) => {
  const isSheet = v.gripRow !== null;
  const lines = [
    `      cssClass: ${dartStr(v.key)},`,
    `      shellPaddingWidePx: ${fmt(base.shellPaddingPx)},`,
    `      shellPaddingNarrowPx: ${fmt(narrow.shellPaddingPx)},`,
    `      shellAlignWideCss: ${dartStr(base.shellAlignItems)},`,
    `      shellAlignNarrowCss: ${dartStr(narrow.shellAlignItems)},`,
    `      shellOverflowYWideCss: ${dartStr(base.shellOverflowY)},`,
    `      shellOverflowYNarrowCss: ${dartStr(narrow.shellOverflowY)},`,
    `      shellZIndexCss: ${dartStr(base.shellZIndex)},`,
    `      panelZIndexCss: ${dartStr(base.panelZIndex)},`,
    `      veilColor: ${dartSurfaceColour(base.veilFill)},`,
    `      veilBlurPx: ${fmt(base.veilBlurPx)},`,
    `      panelMaxWidthPx: ${fmt(base.panelMaxWidthPx)},`,
    `      panelMarginYPx: ${fmt(base.panelMarginTopPx)},`,
    `      panelRadiusWidePx: ${fmt(base.panelRadiusTopPx)},`,
    `      panelRadiusNarrowTopPx: ${fmt(narrow.panelRadiusTopPx)},`,
    `      panelRadiusNarrowBottomPx: ${fmt(narrow.panelRadiusBottomPx)},`,
    `      panelBorderWidePx: ${fmt(base.panelBorderTopPx)},`,
    `      panelBorderNarrowTopPx: ${fmt(narrow.panelBorderTopPx)},`,
    `      panelBorderNarrowSidesPx: ${fmt(narrow.panelBorderLeftPx)},`,
    `      panelBorderNarrowBottomPx: ${fmt(narrow.panelBorderBottomPx)},`,
    `      panelFill: ${dartSurfaceColour(base.panelFill)},`,
    `      panelBorderColor: ${dartSurfaceColour(base.panelBorderColour)},`,
    `      panelShadow: ${shadowListExpr(stackShadowLayers(stackProps(tag === 'light' ? LIGHT : DARK, v.rows.panel), v.key))},`,
    `      bodyMaxHeightFraction: ${base.bodyCapFraction === null ? 'null' : fmt(base.bodyCapFraction)},`,
    `      panelMaxHeightFraction: ${base.panelCapFraction === null ? 'null' : fmt(base.panelCapFraction)},`,
    `      headerHeightPx: ${fmt(base.headerHeightPx)},`,
    `      headerPaddingHorizontalPx: ${fmt(base.headerPaddingHPx)},`,
    `      headerBorderBottomWidthPx: ${fmt(base.headerBorderBottomPx)},`,
    `      headerBorderBottomColor: ${dartSurfaceColour(base.headerBorderBottomColour)},`,
    `      headerFill: ${dartSurfaceColour(base.headerFill)},`,
    `      titleFontSizePx: ${fmt(base.titleFontSizePx)},`,
    `      titleFontWeight: ${base.titleFontWeight},`,
    `      titleLineHeightPx: ${fmt(base.titleLineHeightPx)},`,
    `      titleLetterSpacingPx: ${fmt(base.titleLetterSpacingPx)},`,
    `      titleColor: ${dartSurfaceColour(base.titleColour)},`,
    `      closeSizePx: ${fmt(base.closeWidthPx)},`,
    `      closeBorderRadiusPx: ${fmt(base.closeRadiusPx)},`,
    `      closeFill: ${dartSurfaceColour(base.closeFill)},`,
    `      closeFgColor: ${dartSurfaceColour(base.closeFgColour)},`,
    `      closeBorderWidthPx: ${fmt(base.closeBorderTopPx)},`,
    `      closeBorderColor: ${dartSurfaceColour(base.closeBorderColour)},`,
    `      bodyPaddingWidePx: ${fmt(base.bodyPaddingPx)},`,
    `      bodyPaddingNarrowPx: ${fmt(narrow.bodyPaddingPx)},`,
  ];
  const mot = modalMotion.find((mm) => mm.v.key === v.key);
  if (isSheet) {
    lines.push(
      `      grip: AppModalGripSpec(`,
      `        widthPx: ${fmt(narrow.gripWidthPx)},`,
      `        heightPx: ${fmt(narrow.gripHeightPx)},`,
      `        radiusPx: ${fmt(narrow.gripRadiusPx)},`,
      `        marginYPx: ${fmt(narrow.gripMarginTopPx)},`,
      `        fill: ${dartSurfaceColour(narrow.gripFill)},`,
      `        displayWideCss: ${dartStr(base.gripDisplay)},`,
      `        displayNarrowCss: ${dartStr(narrow.gripDisplay)},`,
      `      ),`,
    );
  } else {
    if (base.gripDisplay !== undefined) fail(`${v.key}: a dialog grip appeared`);
    lines.push('      grip: null,');
  }
  lines.push(
    `      panelSpringDamping: ${fmt(mot.spring.damping)},`,
    `      panelSpringStiffness: ${fmt(mot.spring.stiffness)},`,
    `      enterOpacityFrom: ${mot.keys.opacityFrom === null ? 'null' : fmt(mot.keys.opacityFrom)},`,
    `      enterScale: ${mot.keys.scale === null ? 'null' : fmt(mot.keys.scale)},`,
    `      enterOffsetYPx: ${mot.keys.dyPx === null ? 'null' : fmt(mot.keys.dyPx)},`,
    `      enterOwnHeightFraction: ${mot.keys.ownHeight === null ? 'null' : fmt(mot.keys.ownHeight)},`,
    `      escapeCloses: ${v.key === '.modal-panel'},`,
    '      bodyScrollLocks: true,',
  );
  return lines.join('\n');
};

banner();
L.push(
  "import 'package:flutter/material.dart';",
  '',
  '/// One shared shell — the `ui/Modal.tsx` dialog or the `ui/BottomSheet.tsx`',
  '/// sheet — measured as a whole class stack in every pass of',
  '/// `parity/ui-tokens.json`, with the states and motion the probe cannot see',
  '/// read from the authored non-CSS entries and the pinned sources. A widget',
  '/// under `lib/presentation/` restates none of it.',
  '///',
  '/// Viewport divergence is carried, not averaged: the web switches a value',
  '/// between the phone pass (390x844) and the desktop pass (1440x900) through',
  '/// Tailwind `sm:`/`md:` media queries, whose breakpoint widths are framework',
  '/// knowledge and were never measured (UI_SPEC records none). Each pair',
  '/// below says which side of the split the value was measured on; the widget',
  '/// picks between the sides at a breakpoint the CALLER supplies, so the port',
  '/// invents no threshold the evidence does not back.',
  'class AppModalGripSpec {',
  '  const AppModalGripSpec({',
  '    required this.widthPx,',
  '    required this.heightPx,',
  '    required this.radiusPx,',
  '    required this.marginYPx,',
  '    required this.fill,',
  '    required this.displayWideCss,',
  '    required this.displayNarrowCss,',
  '  });',
  '',
  '  final double widthPx;',
  '  final double heightPx;',
  '  /// Chrome’s clamp of `rounded-full` — a full round, kept verbatim.',
  '  final double radiusPx;',
  '  final double marginYPx;',
  '  final Color fill;',
  '  /// The measured `display` of the grip per viewport side:',
  '  /// `sm:hidden` hides it on desktop (`none`) and the phone shows it',
  '  /// (`block`). Carried as CSS text; [shownOnWide]/[shownOnNarrow] read it.',
  '  final String displayWideCss;',
  '  final String displayNarrowCss;',
  '',
  "  bool get shownOnWide => displayWideCss != 'none';",
  '',
  "  bool get shownOnNarrow => displayNarrowCss != 'none';",
  '}',
  '',
  '/// A veil recipe: a measured colour and the blur the class author-ed on it.',
  'class AppVeilRecipe {',
  '  const AppVeilRecipe({required this.color, required this.blurPx});',
  '',
  '  final Color color;',
  '  /// The CSS blur radius. Ruling D-U8 converts it to Flutter sigma at the',
  '  /// consumer, so this row keeps the measured px.',
  '  final double blurPx;',
  '',
  '  /// CSS blur radius → Flutter sigma, the port’s fixed mapping (see',
  '  /// [AppSurfaceSpec.blurSigma]). Not a number a widget chose.',
  '  double get blurSigmaPx => blurPx / 2;',
  '}',
  '',
  '/// The `ledger-rule` hairline both shells draw under their headers.',
  'class AppLedgerRuleSpec {',
  '  const AppLedgerRuleSpec({required this.heightPx, required this.fill});',
  '',
  '  final double heightPx;',
  '  final Color fill;',
  '}',
  '',
  '/// One shell, measured per brightness pass, with the viewport-divergent',
  '/// geometry carried as explicit wide/narrow pairs.',
  'class AppModalSpec {',
  '  const AppModalSpec({',
  '    required this.cssClass,',
  '    required this.shellPaddingWidePx,',
  '    required this.shellPaddingNarrowPx,',
  '    required this.shellAlignWideCss,',
  '    required this.shellAlignNarrowCss,',
  '    required this.shellOverflowYWideCss,',
  '    required this.shellOverflowYNarrowCss,',
  '    required this.shellZIndexCss,',
  '    required this.panelZIndexCss,',
  '    required this.veilColor,',
  '    required this.veilBlurPx,',
  '    required this.panelMaxWidthPx,',
  '    required this.panelMarginYPx,',
  '    required this.panelRadiusWidePx,',
  '    required this.panelRadiusNarrowTopPx,',
  '    required this.panelRadiusNarrowBottomPx,',
  '    required this.panelBorderWidePx,',
  '    required this.panelBorderNarrowTopPx,',
  '    required this.panelBorderNarrowSidesPx,',
  '    required this.panelBorderNarrowBottomPx,',
  '    required this.panelFill,',
  '    required this.panelBorderColor,',
  '    required this.panelShadow,',
  '    required this.bodyMaxHeightFraction,',
  '    required this.panelMaxHeightFraction,',
  '    required this.headerHeightPx,',
  '    required this.headerPaddingHorizontalPx,',
  '    required this.headerBorderBottomWidthPx,',
  '    required this.headerBorderBottomColor,',
  '    required this.headerFill,',
  '    required this.titleFontSizePx,',
  '    required this.titleFontWeight,',
  '    required this.titleLineHeightPx,',
  '    required this.titleLetterSpacingPx,',
  '    required this.titleColor,',
  '    required this.closeSizePx,',
  '    required this.closeBorderRadiusPx,',
  '    required this.closeFill,',
  '    required this.closeFgColor,',
  '    required this.closeBorderWidthPx,',
  '    required this.closeBorderColor,',
  '    required this.bodyPaddingWidePx,',
  '    required this.bodyPaddingNarrowPx,',
  '    this.grip,',
  '    required this.panelSpringDamping,',
  '    required this.panelSpringStiffness,',
  '    required this.enterOpacityFrom,',
  '    required this.enterScale,',
  '    required this.enterOffsetYPx,',
  '    required this.enterOwnHeightFraction,',
  '    required this.escapeCloses,',
  '    required this.bodyScrollLocks,',
  '  });',
  '',
  '  /// The panel class this row was measured under — the map key.',
  '  final String cssClass;',
  '',
  '  /// The shell’s `p-4 sm:p-6` (dialog) or its absence (sheet): one uniform',
  '  /// value per measured viewport side.',
  '  final double shellPaddingWidePx;',
  '  final double shellPaddingNarrowPx;',
  '',
  '  /// The computed `align-items` of the shell per side. Carried as CSS text:',
  '  /// the sheet is `flex-end` on the phone and `center` on desktop',
  '  /// (`items-end sm:items-center`), the dialog `center` on both.',
  '  final String shellAlignWideCss;',
  '  final String shellAlignNarrowCss;',
  '',
  '  /// The measured `overflow-y` of the shell. Carried as data, not applied:',
  '  /// the dialog shell scrolls its content (`auto`) where Flutter’s route',
  '  /// does the equivalent by construction, and the sheet measures `visible`.',
  '  final String shellOverflowYWideCss;',
  '  final String shellOverflowYNarrowCss;',
  '',
  '  /// The measured z-indices, carried as data: Flutter has no z-index; the',
  '  /// port stacks veil below panel in one overlay entry, which is the whole',
  '  /// of what 50/10 order on the web.',
  '  final String shellZIndexCss;',
  '  final String panelZIndexCss;',
  '',
  '  /// The shell’s own veil — `bg-[var(--ink)]/40 backdrop-blur-[2px]`,',
  '  /// measured per brightness pass (the ink flips with the scheme). Other',
  '  /// recipes live on [AppModals] as explicit widget parameters.',
  '  final Color veilColor;',
  '  final double veilBlurPx;',
  '',
  '  /// CSS blur radius → Flutter sigma, ruling D-U8’s fixed mapping — the',
  '  /// same conversion [AppVeilRecipe.blurSigmaPx] applies to the recipes.',
  '  double get veilBlurSigmaPx => veilBlurPx / 2;',
  '',
  '  /// The panel’s measured `max-width` — `--container-md` for the dialog',
  '  /// (the prop default), `--container-lg` for the sheet — which matches',
  '  /// the token table, and `my-8` (dialog) or none (sheet).',
  '  final double panelMaxWidthPx;',
  '  final double panelMarginYPx;',
  '',
  '  /// `rounded-2xl` on desktop; `rounded-t-2xl sm:rounded-2xl` leaves the',
  '  /// phone sheet flush to the bottom edge, so its bottom radius is 0.',
  '  final double panelRadiusWidePx;',
  '  final double panelRadiusNarrowTopPx;',
  '  final double panelRadiusNarrowBottomPx;',
  '',
  '  /// `border-t sm:border`: uniform on desktop, top-only on the phone.',
  '  final double panelBorderWidePx;',
  '  final double panelBorderNarrowTopPx;',
  '  final double panelBorderNarrowSidesPx;',
  '  final double panelBorderNarrowBottomPx;',
  '  final Color panelFill;',
  '  final Color panelBorderColor;',
  '  /// The panel’s measured box-shadow. The dialog is the `.card` twin',
  '  /// (two layers, per pass); the sheet is Tailwind’s `shadow-2xl`, which',
  '  /// the engine serialises as one visible layer plus four transparent',
  '  /// ones — ported verbatim, transparent layers included.',
  '  final List<BoxShadow> panelShadow;',
  '',
  '  /// `max-h-[80vh]`/`max-h-[85vh]` as the measured px cap divided by the',
  '  /// pass viewport height — equal on both sides (720/900 = 675.2/844 =',
  '  /// 0.8; 765/900 = 717.4/844 = 0.85). Flutter has no vh: the widget',
  '  /// multiplies the fraction by the live MediaQuery height. Only the',
  '  /// element the class sits on is capped: [bodyMaxHeightFraction] for the',
  '  /// dialog (the body), [panelMaxHeightFraction] for the sheet (the panel',
  '  /// itself, whose body then flexes inside it).',
  '  final double? bodyMaxHeightFraction;',
  '  final double? panelMaxHeightFraction;',
  '',
  '  /// The header bar: `h-12 px-5 border-b border-[var(--line)]`, filled',
  '  /// `--surface` on the dialog and transparent on the sheet.',
  '  final double headerHeightPx;',
  '  final double headerPaddingHorizontalPx;',
  '  final double headerBorderBottomWidthPx;',
  '  final Color headerBorderBottomColor;',
  '  final Color headerFill;',
  '',
  '  /// §6.3 type of the title: the class sets `text-[13px] font-bold',
  '  /// tracking-tight` itself, measured identically on all four passes.',
  '  final double titleFontSizePx;',
  '  final int titleFontWeight;',
  '  final double titleLineHeightPx;',
  '  final double titleLetterSpacingPx;',
  '  final Color titleColor;',
  '',
  '  /// The close target: `w-7 h-7` (28 square), full round, `--surface-2`',
  '  /// on a `--line` border, glyph `--ink-2`. The 13px glyph it centres is',
  '  /// authored JS (`<X size={13} />`) and sits on [AppModals] as',
  '  /// [AppModals.closeGlyphSizePx] — the glyph itself is the caller’s.',
  '  final double closeSizePx;',
  '  final double closeBorderRadiusPx;',
  '  final Color closeFill;',
  '  final Color closeFgColor;',
  '  final double closeBorderWidthPx;',
  '  final Color closeBorderColor;',
  '',
  '  /// The body’s `p-6 sm:p-5` — a `sm:` padding step on both shells, so one',
  '  /// uniform value per measured viewport side, never a blend.',
  '  final double bodyPaddingWidePx;',
  '  final double bodyPaddingNarrowPx;',
  '',
  '  /// The phone-only grab bar. Null on the dialog, which measures none.',
  '  final AppModalGripSpec? grip;',
  '',
  '  /// The panel’s authored `transition={{ type: "spring", … }}` — the two',
  '  /// numbers the shells print, kept verbatim. motion’s spring default',
  '  /// mass is 1 (`node_modules/motion-dom/dist/es/animation/',
  '  /// generators/spring.mjs`), so [panelSpring] maps the pair one-to-one;',
  '  /// the browser’s own integrator has no pixel evidence and the port does',
  '  /// not claim its exact frames — only settle behaviour.',
  '  final double panelSpringDamping;',
  '  final double panelSpringStiffness;',
  '',
  '  /// The authored initial keyframe, per variant: the dialog fades from',
  '  /// `opacity: enterOpacityFrom` with `scale: enterScale` and a',
  '  /// `enterOffsetYPx` lift; the sheet slides up a full',
  '  /// `enterOwnHeightFraction` of its own height and never fades or',
  '  /// scales (those fields are then null). Exit restates initial.',
  '  final double? enterOpacityFrom;',
  '  final double? enterScale;',
  '  final double? enterOffsetYPx;',
  '  final double? enterOwnHeightFraction;',
  '',
  '  /// Authored behaviour: `if (e.key === "Escape") onClose()` is in',
  '  /// Modal.tsx and verifiably NOT in BottomSheet.tsx.',
  '  final bool escapeCloses;',
  '  /// Both shells lock `document.body.style.overflow` while open. Flutter',
  '  /// has no document body: the port’s analogue is hosting the shell in a',
  '  /// route/overlay entry, which the widget cannot itself enforce; carried',
  '  /// so the behaviour test can name what the web does.',
  '  final bool bodyScrollLocks;',
  '',
  '  EdgeInsets get shellPaddingWide => EdgeInsets.all(shellPaddingWidePx);',
  '',
  '  EdgeInsets get shellPaddingNarrow => EdgeInsets.all(shellPaddingNarrowPx);',
  '',
  "  bool get docksNarrowToBottom => shellAlignNarrowCss == 'flex-end';",
  '',
  '  BorderRadius get panelRadiusWide => BorderRadius.circular(panelRadiusWidePx);',
  '',
  '  BorderRadius get panelRadiusNarrow => BorderRadius.vertical(',
  '    top: Radius.circular(panelRadiusNarrowTopPx),',
  '    bottom: Radius.circular(panelRadiusNarrowBottomPx),',
  '  );',
  '',
  '  Border get panelBorderWide =>',
  '      Border.all(color: panelBorderColor, width: panelBorderWidePx);',
  '',
  '  Border get panelBorderNarrow => Border(',
  '    top: BorderSide(color: panelBorderColor, width: panelBorderNarrowTopPx),',
  '    left: BorderSide(',
  '      color: panelBorderColor,',
  '      width: panelBorderNarrowSidesPx,',
  '    ),',
  '    right: BorderSide(',
  '      color: panelBorderColor,',
  '      width: panelBorderNarrowSidesPx,',
  '    ),',
  '    bottom: BorderSide(',
  '      color: panelBorderColor,',
  '      width: panelBorderNarrowBottomPx,',
  '    ),',
  '  );',
  '',
  '  EdgeInsets get headerPadding =>',
  '      EdgeInsets.symmetric(horizontal: headerPaddingHorizontalPx);',
  '',
  '  Border get headerBorderBottom => Border(',
  '    bottom: BorderSide(',
  '      color: headerBorderBottomColor,',
  '      width: headerBorderBottomWidthPx,',
  '    ),',
  '  );',
  '',
  '  EdgeInsets get bodyPaddingWide => EdgeInsets.all(bodyPaddingWidePx);',
  '',
  '  EdgeInsets get bodyPaddingNarrow => EdgeInsets.all(bodyPaddingNarrowPx);',
);
L.push(
  '',
  '  /// The 100-900 CSS step indexes the Dart enum directly; no weight is retyped.',
  '  FontWeight get titleWeight =>',
  '      FontWeight.values[titleFontWeight ~/ 100 - 1];',
  '',
  '  /// Flutter’s line-height is a multiple of the font size, CSS’s is a length,',
  '  /// so this is the measured pair divided — not a number anyone chose.',
  '  double get titleHeightRatio => titleLineHeightPx / titleFontSizePx;',
  '',
  '  TextStyle get titleStyle => TextStyle(',
  '    fontSize: titleFontSizePx,',
  '    fontWeight: titleWeight,',
  '    height: titleHeightRatio,',
  '    letterSpacing: titleLetterSpacingPx,',
  '    color: titleColor,',
  '  );',
  '',
  '  /// motion’s spring is mass 1, so Flutter’s mass is the same 1.0 — nothing',
  '  /// here is tuned. The integrator differs (see the field doc); behaviour',
  '  /// tests assert settle and end state, not frame-exact motion.',
  '  SpringDescription get panelSpring => SpringDescription(',
  '    mass: 1.0,',
  '    damping: panelSpringDamping,',
  '    stiffness: panelSpringStiffness,',
  '  );',
  '',
  '  /// The cap applied to the body (dialog) or the panel (sheet), as the',
  '  /// measured fraction of a live viewport height.',
  '  double? get capOnBody => bodyMaxHeightFraction;',
  '  double? get capOnPanel => panelMaxHeightFraction;',
  '}',
  '',
);
const provenanceLines = (v) =>
  Object.entries(v.rows).map(([role, name]) => `  ///   ${role}: \`${name}\` (${stackSrc(name)})`);
L.push(
  '/// The two shared shells, keyed by panel class — one map per measured',
  '/// brightness pass, the same convention `AppControls` sets.',
  '///',
  ...modalVariantData.flatMap(({ v }, i) => [
    ...(i ? ['///'] : []),
    `/// Row provenance for the ${v.label}:`,
    ...provenanceLines(v).map((s) => s.replace('  ///', '///')),
    '///   Measured viewports: desktop ' +
      `${LIGHT.viewport.width}x${LIGHT.viewport.height}, phone ` +
      `${LIGHT_PHONE.viewport.width}x${LIGHT_PHONE.viewport.height}.`,
  ]),
  'abstract final class AppModals {',
);
for (const [passName, tag] of [
  ['light', 'light-desktop'],
  ['dark', 'dark-desktop'],
]) {
  L.push(
    `  /// ${passName} pass (utility stacks \`${tag}\`/\`${passName}-phone\`; states and`,
    '  /// motion from the authored non-CSS entries and the pinned sources).',
    `  static const Map<String, AppModalSpec> ${passName} =`,
    '      <String, AppModalSpec>{',
  );
  for (const { v, rows } of modalVariantData) {
    const base = rows[tag];
    const narrow = rows[`${passName}-phone`];
    L.push(`    ${dartStr(v.key)}: AppModalSpec(`, modalSpecExpr(v, base, narrow, passName), '    ),');
  }
  L.push('  };', '');
}
const motionDocLines = modalMotion.map(
  ({ v, spring }) => `  ///   ${v.label} spring ${String(spring.damping)}/${String(spring.stiffness)} — ${spring.at};`,
);
L.push(
  '  /// The state and motion rules, printed once because both passes author them',
  '  /// identically (they are JS, not CSS):',
  `  ///   veil fade ${String(veilFadeMs)}ms — ${veilFadeAt}:`,
  '  ///   `transition={{ duration: 0.18 }}`, with no easing authored; motion’s',
  '  ///   own tween default applies ([veilFadeEase], a framework default read',
  '  ///   from the shipped package, not a measurement).',
  ...motionDocLines,
  '  ///   both mass 1 by motion’s default.',
  `  ///   Escape closes the dialog only — ${modalEscapeAt}; BottomSheet.tsx`,
  '  ///   has no Escape handler (generation fails if one appears).',
  `  ///   both shells lock the document body while open — ${modalLockAt};`,
  '  ///   Flutter’s analogue is route hosting, see',
  '  ///   [AppModalSpec.bodyScrollLocks].',
  '',
  '  /// The clock the veils fade on, authored without a curve:',
  '  static const int veilFadeMs = ' + String(veilFadeMs) + ';',
  '',
  '  static const Duration veilFadeDuration =',
  '      Duration(milliseconds: veilFadeMs);',
  '',
  '  /// The `ease = "easeInOut"` default of the tween the shells leave unset —',
  "  /// motion's own cubic(0.42, 0, 0.58, 1), read from the package the app",
  '  /// ships, not measured on the web. A framework default, logged as a',
  '  /// deliberate deviation.',
  '  static const Cubic veilFadeEase = Cubic(0.42, 0.0, 0.58, 1.0);',
  '',
  `  /// Authored \`<X size={${String(closeGlyphPx)}} />\` in both shells (${glyphAt.join(', ')}) —`,
  '  /// a px size prop, not CSS. The glyph stays the',
  "  /// caller's widget; this is the size it is authored to render at.",
  '  static const double closeGlyphSizePx = ' + fmt(closeGlyphPx) + ';',
  '',
  `  /// The dialog’s prop default (\`maxWidth = "${modalDefaultWidth.token}"\`) and the`,
  '  /// map it selects, scoped to the three tokens this port',
  '  /// was approved for. Each value is the measured `--container-*` token,',
  '  /// equal on all four passes; the sheet ignores the map and keeps its own',
  `  /// measured \`max-w-${modalWidthOf['.sheet-panel']}\` row.`,
  ...(modalDefaultWidth.unported.length
    ? [
        `  /// The web map also offers ${modalUnportedWidths} — outside this`,
        '  /// approved scope, so the port records their absence instead of',
        '  /// exposing unpinned widths.',
      ]
    : []),
  `  static const String defaultWidthToken = ${dartStr(modalDefaultWidth.token)};`,
  '',
  '  static const Map<String, double> widthPx = <String, double>{',
  ...WIDTH_KEYS.map((k) => `    '${k}': ${fmt(widthPxTable[k])},`),
  '  };',
  '',
  '  /// The alternate veil recipes the shells’ compositions parameterise:',
  '  /// `bg-[var(--ink)]/40 backdrop-blur-[2px]` measured on both primitive',
  '  /// veils (their own row default), and the `bg-black/60',
  '  /// backdrop-blur-sm` of the feature-modal veils (`qa-veil`/`tem-veil`,',
  '  /// black 0/0/0 at 0.6 on every pass, blur = the `--blur-sm` 8px token).',
  '  /// DebtDetailModal authors the same black/60 over a literal',
  '  /// `backdrop-blur-[6px]` — [debtVeilBlurPx].',
  '  static const AppVeilRecipe inkVeilLight = AppVeilRecipe(',
  `    color: ${dartSurfaceColour(modalVariantData[0].rows['light-desktop'].veilFill)},`,
  `    blurPx: ${fmt(modalVariantData[0].rows['light-desktop'].veilBlurPx)},`,
  '  );',
  '',
  '  static const AppVeilRecipe inkVeilDark = AppVeilRecipe(',
  `    color: ${dartSurfaceColour(modalVariantData[0].rows['dark-desktop'].veilFill)},`,
  `    blurPx: ${fmt(modalVariantData[0].rows['dark-desktop'].veilBlurPx)},`,
  '  );',
  '',
  '  static const AppVeilRecipe dimVeilLight = AppVeilRecipe(',
  `    color: ${dartSurfaceColour(dimVeilColour)},`,
  `    blurPx: ${fmt(dimVeilBlurPx)},`,
  '  );',
  '',
  '  static const AppVeilRecipe dimVeilDark = AppVeilRecipe(',
  `    color: ${dartSurfaceColour(dimVeilColour)},`,
  `    blurPx: ${fmt(dimVeilBlurPx)},`,
  '  );',
  '',
  `  static const double debtVeilBlurPx = ${fmt(debtVeilBlurPx)};`,
  '',
  '  /// The hairline under both headers: authored height in',
  `  /// \`src/index.css:${LEDGER_RULE.line}\`, fill measured \`.ledger-rule\` in`,
  '  /// every pass (it tracks `--line` with the scheme).',
  '  static const AppLedgerRuleSpec ledgerLight = AppLedgerRuleSpec(',
  `    heightPx: ${fmt(ledgerHeightPx)},`,
  `    fill: ${dartSurfaceColour(ledgerFills['light-desktop'])},`,
  '  );',
  '',
  '  static const AppLedgerRuleSpec ledgerDark = AppLedgerRuleSpec(',
  `    heightPx: ${fmt(ledgerHeightPx)},`,
  `    fill: ${dartSurfaceColour(ledgerFills['dark-desktop'])},`,
  '  );',
  '',
  '  static AppLedgerRuleSpec ledger(Brightness brightness) =>',
  '      brightness == Brightness.dark ? ledgerDark : ledgerLight;',
  '',
  '  /// The measured shell for a panel class and brightness. An unknown class',
  '  /// is a programming error, not a fallback: nothing in this layer may',
  '  /// quietly become a Material default.',
  '  static AppModalSpec resolve(String cssClass, Brightness brightness) {',
  '    final Map<String, AppModalSpec> table =',
  '        brightness == Brightness.dark ? dark : light;',
  '    final AppModalSpec? spec = table[cssClass];',
  '    if (spec == null) {',
  "      throw ArgumentError('$cssClass is not a modal/sheet shell row');",
  '    }',
  '    return spec;',
  '  }',
  '}',
  '',
);
finish('app_modals.dart');

// ---------------------------------------------------------------- §6 chips (UI_SPEC pill family)
// The §6 chrome chips: the icon chip, the pill (with its measured active
// composite and its authored press/disable states), the chip-select, the delta
// box and its two tint classes. Every resting value is a §6 probe of a detached
// element carrying exactly that class; the states a probe cannot see are read
// from the same pinned `src/index.css`, and where a class authors a colour as a
// bare `var(--token)`, the probe and the token substituted through this pass's
// measured `:root` must agree — generation fails otherwise.
// `.icon-chip-lg` is deliberately absent: its only authored declaration is a
// size override (`width: 44px; height: 44px`), and no element under `src/` ever
// carries the class — the `.card-sm` precedent. Its rule and its probe are
// asserted below so the absence stays a fact, not an oversight.
const CHIP_CLASSES = ['.icon-chip', '.pill', '.pill-active', '.chip-select', '.delta-chip', '.delta-up', '.delta-down'];
const CHIP_PROBE_KEY = { '.pill-active': '.pill.pill-active' };
const chipProbe = (theme, cls) => {
  const key = CHIP_PROBE_KEY[cls] || cls;
  const p = theme.probes[key];
  if (!p) fail(`${theme.tag}: no ${key} probe`);
  return p;
};

/** `blur(10px)` alone, `blur(22px) saturate(1.4)`, or `none` -> nulls. The
 *  icon-button reader maps `none` to px 0; the chip family wants "no backdrop"
 *  to be a null, so §6's `(none)` convention survives the port unchanged. */
const chipBackdrop = (p, cls) => {
  const bf = p.backdropFilter;
  if (!bf) fail(`${cls}: no backdropFilter probe`);
  const raw = bf.raw.trim();
  if (raw === 'none') return { px: null, saturate: null };
  const blur = /^blur\(([\d.]+)px\)$/.exec(raw);
  if (blur) return { px: parseFloat(blur[1]), saturate: null };
  const both = /^blur\(([\d.]+)px\) saturate\(([\d.]+)\)$/.exec(raw);
  if (both) return { px: parseFloat(both[1]), saturate: parseFloat(both[2]) };
  fail(`${cls}: unportable backdrop-filter "${bf.raw}"`);
};

/** An authored declaration, or null when the rule simply does not carry it —
 *  unlike `cssDecl`, which fails. Callers name which properties are optional. */
const cssDeclOpt = (rule, prop) => {
  const m = new RegExp(`${prop}:\\s*([^;]+);`).exec(rule.text);
  return m ? m[1].trim() : null;
};

const chipProbeRow = (cls, tag, theme) => {
  const p = chipProbe(theme, cls);
  if (probeRaw(p, 'boxShadow', cls) !== 'none') {
    fail(
      `${cls}: the resting probe carries a box-shadow (${probeRaw(p, 'boxShadow', cls)}); the resting §6 chip row ports none`,
    );
  }
  const pad = probePadding(p, cls);
  const lineRaw = probeRaw(p, 'lineHeight', cls);
  const spaceRaw = probeRaw(p, 'letterSpacing', cls);
  const bd = chipBackdrop(p, cls);
  return {
    displayCss: probeRaw(p, 'display', cls),
    radiusPx: probePx(p, 'borderRadius', cls),
    borderWidthPx: probePx(p, 'borderTopWidth', cls),
    borderColor: probeSrgb(p, 'borderTopColor', cls),
    fillColor: probeSrgb(p, 'backgroundColor', cls),
    gradient: probeGradient(p, cls),
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
    paddingVerticalPx: pad.vertical,
    paddingHorizontalPx: pad.horizontal,
    blurPx: bd.px,
    blurSaturate: bd.saturate,
  };
};

const CHIP_COLOUR_FIELDS = ['borderColor', 'fillColor', 'textColor'];
const chipRowKey = (row) => {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (CHIP_COLOUR_FIELDS.includes(key)) out[key] = value.hex;
    else if (value === null || value === undefined || typeof value !== 'object') out[key] = value;
    else fail(`${key} (chip): the ${key} field is an object the pass check cannot compare`);
  }
  return out;
};
const CHIP_STABLE_FIELDS = [
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

/** One `gap: Npx` (or a bare length) from the resting rule, or null. */
const authoredGap = (rule, cls) => {
  const g = cssDeclOpt(rule, 'gap');
  if (g === null) return null;
  if (!/^[\d.]+px$/.test(g)) fail(`${cls}: authored gap "${g}" is not a plain px length`);
  return parseFloat(g);
};

const CHIP_TRANSITION_PROPS = ['border-color', 'background-color', 'color'];

/** Authored properties the chip/segment rest rules may name. Anything else
 *  fails the run: a declaration outside this vocabulary is a web fact the §6
 *  chip family spec has no field for, and a silently dropped one is a phone
 *  that disagrees with the browser the moment the class is composed. The
 *  behaviour/layout properties that ride on the box without painting it
 *  (cursor, white-space, user-select, flex-shrink, position) are listed so
 *  their presence stays reviewed; they travel as data or not at all. */
const CHIP_REST_ALLOWED = [
  'display',
  'align-items',
  'justify-content',
  'gap',
  'padding',
  'border-radius',
  'background',
  'background-color',
  'border',
  'border-color',
  'color',
  'font-size',
  'font-weight',
  'font-family',
  'line-height',
  'letter-spacing',
  'cursor',
  'white-space',
  'user-select',
  'flex-shrink',
  'position',
  'transition',
  'backdrop-filter',
  '-webkit-backdrop-filter',
  'font-variant-numeric',
  'width',
  'height',
];
const checkChipProps = (props, allowed, label, cls, line) => {
  for (const [prop] of props) {
    if (!allowed.includes(prop)) {
      fail(`${cls}: ${label} sets \`${prop}\` (src/index.css:${line}); the §6 chip-family spec cannot port it`);
    }
  }
};

const pills = CHIP_CLASSES.map((cls) => {
  const l = chipProbeRow(cls, 'light-desktop', LIGHT);
  const d = chipProbeRow(cls, 'dark-desktop', DARK);
  if (l.gradient || d.gradient) fail(`${cls}: the §6 chip family paints flat fills; a probe gradient is a new fact`);
  for (const [tag, theme, want] of [
    ['light-phone', LIGHT_PHONE, l],
    ['dark-phone', DARK_PHONE, d],
  ]) {
    const fp = chipRowKey(chipProbeRow(cls, tag, theme));
    const fw = chipRowKey(want);
    for (const [key, value] of Object.entries(fp)) {
      if (fw[key] !== value) {
        fail(`${cls}: ${key} is "${value}" on ${tag} but "${fw[key]}" on its desktop pass`);
      }
    }
  }
  for (const key of CHIP_STABLE_FIELDS) {
    if (l[key] !== d[key]) {
      fail(`${cls}: ${key} is "${l[key]}" in light and "${d[key]}" in dark; §6 prints one row`);
    }
  }
  if (chipRowKey(l).blurPx !== chipRowKey(d).blurPx || chipRowKey(l).blurSaturate !== chipRowKey(d).blurSaturate) {
    fail(`${cls}: the backdrop differs between the two schemes`);
  }

  const rest = cssRule(new RegExp(`^\\${cls} \\{$`), cls, 24);
  checkChipProps(ruleProps(rest, cls), CHIP_REST_ALLOWED, 'the rest rule', cls, rest.line);
  const gapPx = authoredGap(rest, cls);
  const tabular = (cssDeclOpt(rest, 'font-variant-numeric') || '') === 'tabular-nums';
  const trRaw = cssDeclOpt(rest, 'transition');
  const tr = trRaw === null ? null : controlTransition(rest, cls, CHIP_TRANSITION_PROPS);
  const hoverIdx = CSS_LINES.findIndex((x) => new RegExp(`^\\${cls}:hover( |\\{)`).test(x));

  let sizePx = null;
  let pressFill = null;
  let dPressFill = null;
  let disabledOpacity = null;
  let pressSrc = 'none';
  let disabledSrc = 'none';
  if (cls === '.icon-chip') {
    const wRaw = cssDecl(rest, 'width', cls);
    const hRaw = cssDecl(rest, 'height', cls);
    sizePx = lengthPx(wRaw, `${cls} width`);
    if (lengthPx(hRaw, `${cls} height`) !== sizePx) {
      fail(`${cls}: width ${wRaw} != height ${hRaw}; the port paints one square chip`);
    }
    if (l.radiusPx < sizePx / 2) {
      fail(`${cls}: radius ${l.radiusPx} is less than half the ${sizePx}px box`);
    }
  }
  if (cls === '.pill') {
    const act = cssRule(new RegExp(`^\\${cls}:active \\{$`), cls);
    const bg = cssDecl(act, 'background', cls);
    pressFill = authoredColour(bg, LIGHT, 'light-desktop', ':active background', cls);
    dPressFill = authoredColour(bg, DARK, 'dark-desktop', ':active background', cls);
    if (pressFill.token !== dPressFill.token) fail(`${cls}: the :active token differs between passes`);
    if (pressFill.srgb.hex === l.fillColor.hex || dPressFill.srgb.hex === d.fillColor.hex) {
      fail(`${cls}: :active repaints the resting fill in some pass; the port must say so`);
    }
    const off = cssRule(new RegExp(`^\\${cls}:disabled,$`), cls);
    checkStateProps(ruleProps(off, cls), ['opacity', 'cursor'], ':disabled', cls, off.line);
    disabledOpacity = parseFloat(cssDecl(off, 'opacity', cls));
    if (!Number.isFinite(disabledOpacity) || disabledOpacity <= 0 || disabledOpacity > 1) {
      fail(`${cls}: disabled opacity "${cssDecl(off, 'opacity', cls)}" is not a fraction`);
    }
    if (cssDeclOpt(act, 'transform') !== null) fail(`${cls}: :active moves the box; AppChipSpec ports no offset`);
    checkStateProps(ruleProps(act, cls), ['background'], ':active', cls, act.line);
    if (
      tr &&
      !(tr.props.includes('background-color') && tr.props.includes('border-color') && tr.props.includes('color'))
    ) {
      fail(`${cls}: the :active/:disabled state needs the transition to cover fill, border and colour`);
    }
    pressSrc = `src/index.css:${act.line}`;
    disabledSrc = `src/index.css:${off.line}`;
  }
  return {
    cls,
    l,
    d,
    gapPx,
    tabular,
    sizePx,
    pressFill,
    dPressFill,
    disabledOpacity,
    transitionMs: tr ? tr.ms : null,
    transitionEase: tr ? tr.curve : null,
    transitionProps: tr ? tr.props.join(', ') : null,
    transitionDurToken: tr ? tr.dur.name : null,
    transitionEaseToken: tr ? tr.ease.name : null,
    restSrc: `src/index.css:${rest.line}`,
    pressSrc,
    disabledSrc,
    hoverSrc: hoverIdx < 0 ? 'none' : `src/index.css:${hoverIdx + 1}`,
  };
});

// The `.pill-active` composite must agree with its own probe, per pass: the
// authored rule names three tokens, the detached composite element was
// measured, and the port refuses a generator that lets the two disagree.
{
  const cls = '.pill-active';
  const row = pills.find((x) => x.cls === cls);
  const pa = cssRule(/^\.pill-active \{$/, cls);
  checkStateProps(ruleProps(pa, cls), ['background', 'color', 'border-color'], cls, cls, pa.line);
  for (const [pass, theme, themeTag] of [
    [row.l, LIGHT, 'light-desktop'],
    [row.d, DARK, 'dark-desktop'],
  ]) {
    const bg = authoredColour(cssDecl(pa, 'background', cls), theme, themeTag, `${cls} background`, cls);
    const fg = authoredColour(cssDecl(pa, 'color', cls), theme, themeTag, `${cls} colour`, cls);
    const bc = authoredColour(cssDecl(pa, 'border-color', cls), theme, themeTag, `${cls} border`, cls);
    for (const [what, want] of [
      ['fill', bg.srgb.hex],
      ['text', fg.srgb.hex],
      ['border', bc.srgb.hex],
    ]) {
      const got = what === 'fill' ? pass.fillColor.hex : what === 'text' ? pass.textColor.hex : pass.borderColor.hex;
      if (got !== want) {
        fail(`${cls} ${themeTag}: probe ${what} ${got} != authored token substitution ${want}`);
      }
    }
  }
}

// `.icon-chip-lg`: absent from the port on purpose. Assert the two facts the
// decision rests on — one size-only rule, zero call sites — and print them.
{
  const lg = cssRule(/^\.icon-chip-lg \{$/, '.icon-chip-lg');
  const props = ruleProps(lg, '.icon-chip-lg');
  for (const [prop] of props) {
    if (prop !== 'width' && prop !== 'height') {
      fail(`.icon-chip-lg authors \`${prop}\`; it is no longer a size-only override`);
    }
  }
  if (lengthPx(cssDecl(lg, 'width', '.icon-chip-lg'), 'lg width') !== 44) {
    fail('.icon-chip-lg width moved off 44px; revisit the skip');
  }
}
const iconChipLgUses = require('child_process')
  .execSync('git grep -l "icon-chip-lg" -- src', { cwd: ROOT, encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter((s) => s.length && s !== 'src/index.css' && !/\.test\.tsx?$/.test(s));
if (iconChipLgUses.length !== 0) {
  fail(`.icon-chip-lg now has call sites (${iconChipLgUses.join(', ')}); port it instead of skipping it`);
}

// The rest of the family authors its resting colours as bare `var(--token)`
// references; the probe measured the substitution Chrome actually made. Both
// readings must name the same colour in the same pass, per field, or generation
// fails — the port emits the probe, and this is what keeps the probe honest.
{
  const CHIP_CROSSCHECK = [
    ['.icon-chip', 'background', 'fillColor'],
    ['.icon-chip', 'color', 'textColor'],
    ['.pill', 'background', 'fillColor'],
    ['.chip-select', 'color', 'textColor'],
    ['.delta-up', 'background', 'fillColor'],
    ['.delta-up', 'color', 'textColor'],
    ['.delta-down', 'background', 'fillColor'],
    ['.delta-down', 'color', 'textColor'],
  ];
  for (const [cls, prop, field] of CHIP_CROSSCHECK) {
    const row = pills.find((x) => x.cls === cls);
    const rule = cssRule(new RegExp(`^\\${cls} \\{$`), cls, 24);
    for (const [pass, theme, themeTag] of [
      [row.l, LIGHT, 'light-desktop'],
      [row.d, DARK, 'dark-desktop'],
    ]) {
      const want = authoredColour(collapse(cssDecl(rule, prop, cls)), theme, themeTag, `${cls} ${prop}`, cls);
      const got = pass[field];
      if (got.hex !== want.srgb.hex || got.alpha !== want.srgb.alpha) {
        fail(`${cls} ${themeTag}: probe ${field} ${got.rgba} != authored ${want.token} ${want.srgb.rgba}`);
      }
    }
  }
}

/** Two parsed gradients, field by field — an angle, a stop count, and every
 *  stop's channel, alpha and position must match exactly. `JSON.stringify`
 *  would also do, but this names the field that moved. */
const gEq = (a, b, where) => {
  if (a.angle !== b.angle) fail(`${where}: gradient angle ${b.angle} != ${a.angle}`);
  if (a.stops.length !== b.stops.length) {
    fail(`${where}: gradient has ${b.stops.length} stops, expected ${a.stops.length}`);
  }
  a.stops.forEach((s, i) => {
    const t = b.stops[i];
    for (const [key, want] of [
      ['r', s.colour.r],
      ['g', s.colour.g],
      ['b', s.colour.b],
      ['a', s.colour.a],
      ['at', s.at],
    ]) {
      const got = key === 'at' ? t.at : t.colour[key];
      if (got !== want) fail(`${where}: stop ${i} ${key} is ${got}, authored/token says ${want}`);
    }
  });
};

// ---------------------------------------------------------------- face chip
// `.card-face-chip` — the 30×22 gold EMV block on the card faces. The probe
// cannot see `::after`, so the inset ring is read from the pinned CSS
// (`icon-btn`'s composed context and `.skeleton::after` set that precedent).
// Both measured passes print the same gold, so the port carries one const.
const faceChip = (() => {
  const cls = '.card-face-chip';
  const read = (tag, theme) => {
    const p = theme.probes[cls];
    if (!p) fail(`${tag}: no ${cls} probe`);
    if (probeRaw(p, 'boxShadow', cls) !== 'none') fail(`${cls}: the resting probe carries a box-shadow`);
    if (probeRaw(p, 'borderTopWidth', cls) !== '0px') fail(`${cls}: the chip now measures a border`);
    const bg = probeSrgb(p, 'backgroundColor', cls);
    if (bg.alpha !== 0) fail(`${cls}: background-color is no longer transparent; the port paints only the gradient`);
    return {
      radiusPx: probePx(p, 'borderRadius', cls),
      gradient: probeGradient(p, cls),
      position: probeRaw(p, 'position', cls),
    };
  };
  const l = read('light-desktop', LIGHT);
  const d = read('dark-desktop', DARK);
  for (const [tag, theme, want] of [
    ['light-phone', LIGHT_PHONE, l],
    ['dark-phone', DARK_PHONE, d],
  ]) {
    const r = read(tag, theme);
    if (r.radiusPx !== want.radiusPx) fail(`${cls}: ${tag} radius ${r.radiusPx} != desktop ${want.radiusPx}`);
    if (JSON.stringify(r.gradient) !== JSON.stringify(want.gradient))
      fail(`${cls}: ${tag} gradient differs from desktop`);
  }
  if (JSON.stringify(l.gradient) !== JSON.stringify(d.gradient)) fail(`${cls}: the gold differs between the schemes`);
  if (!l.gradient) fail(`${cls}: the probe measured no gradient; this class authors \`var(--chip-gold)\``);

  const rest = cssRule(/^\.card-face-chip \{$/, cls);
  checkChipProps(
    ruleProps(rest, cls),
    ['width', 'height', 'border-radius', 'background', 'position'],
    'the rest rule',
    cls,
    rest.line,
  );
  const widthPx = lengthPx(cssDecl(rest, 'width', cls), `${cls} width`);
  const heightPx = lengthPx(cssDecl(rest, 'height', cls), `${cls} height`);
  const radiusAuthored = lengthPx(cssDecl(rest, 'border-radius', cls), `${cls} radius`);
  if (radiusAuthored !== l.radiusPx || radiusAuthored !== d.radiusPx) {
    fail(`${cls}: authored radius ${radiusAuthored} != probe radius (l ${l.radiusPx}, d ${d.radiusPx})`);
  }
  if (l.position !== 'relative' || d.position !== 'relative') {
    fail(`${cls}: the chip no longer measures position: relative; the ::after ring needs the positioned box`);
  }
  const bgRaw = collapse(cssDecl(rest, 'background', cls));
  const gm = /^linear-gradient\(([\d.]+)deg, var\((--[a-z0-9-]+)\) ([\d.]+)%, var\((--[a-z0-9-]+)\) ([\d.]+)%\)$/.exec(
    bgRaw,
  );
  if (!gm) fail(`${cls}: background "${bgRaw}" is not the two-token angled gradient the port paints`);
  for (const [theme, themeTag, probe] of [
    [LIGHT, 'light-desktop', l],
    [DARK, 'dark-desktop', d],
  ]) {
    const [t0, t1] = [gm[2], gm[4]].map((name) => {
      const tok = theme.root[name];
      if (!tok || !tok.srgb) fail(`${cls}: ${name} is not a measured colour in ${themeTag}`);
      return tok.srgb;
    });
    const want = {
      angle: parseFloat(gm[1]),
      stops: [
        { colour: { r: t0.r, g: t0.g, b: t0.b, a: t0.alpha }, at: parseFloat(gm[3]) / 100 },
        { colour: { r: t1.r, g: t1.g, b: t1.b, a: t1.alpha }, at: parseFloat(gm[5]) / 100 },
      ],
    };
    gEq(want, probe.gradient, `${cls} ${themeTag}`);
  }

  const after = cssRule(/^\.card-face-chip::after \{$/, cls);
  checkChipProps(
    ruleProps(after, cls),
    ['content', 'position', 'inset', 'border', 'border-radius'],
    '::after',
    cls,
    after.line,
  );
  if (cssDecl(after, 'position', cls) !== 'absolute') fail(`${cls}::after is not absolutely positioned`);
  const insetRaw = cssDecl(after, 'inset', cls);
  if (!/^([\d.]+)px$/.test(insetRaw)) fail(`${cls}::after inset "${insetRaw}" is not a single px length`);
  const ringBorder = /^([\d.]+)px solid rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(
    collapse(cssDecl(after, 'border', cls)),
  );
  if (!ringBorder) fail(`${cls}::after border "${cssDecl(after, 'border', cls)}" is not \`Npx solid rgba(…)\``);
  return {
    cls,
    widthPx,
    heightPx,
    radiusPx: radiusAuthored,
    gradient: l.gradient,
    ringInsetPx: parseFloat(insetRaw),
    ringWidthPx: parseFloat(ringBorder[1]),
    ringColour: { r: +ringBorder[2], g: +ringBorder[3], b: +ringBorder[4], a: parseFloat(ringBorder[5]) },
    ringRadiusPx: lengthPx(cssDecl(after, 'border-radius', cls), `${cls}::after radius`),
    restSrc: `src/index.css:${rest.line}`,
    afterSrc: `src/index.css:${after.line}`,
  };
})();

// ================================================================ app_chips.dart
banner();
const chipExpr = (c, rowName, pressName) => {
  const pass = c[rowName];
  const press = c[pressName];
  const num = (v) => (v === null || v === undefined ? 'null' : fmt(v));
  const ease = c.transitionEase;
  return [
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
    `      lineHeightPx: ${num(pass.lineHeightPx)},`,
    `      letterSpacingPx: ${num(pass.letterSpacingPx)},`,
    `      paddingVerticalPx: ${fmt(pass.paddingVerticalPx)},`,
    `      paddingHorizontalPx: ${fmt(pass.paddingHorizontalPx)},`,
    `      gapPx: ${num(c.gapPx)},`,
    `      tabularNums: ${c.tabular ? 'true' : 'false'},`,
    `      blurPx: ${num(pass.blurPx)},`,
    `      blurSaturate: ${num(pass.blurSaturate)},`,
    `      sizePx: ${num(c.sizePx)},`,
    `      pressFillColor: ${press === null ? 'null' : dartSurfaceColour(press.srgb)},`,
    `      disabledOpacity: ${num(c.disabledOpacity)},`,
    `      transitionMs: ${c.transitionMs === null ? 'null' : c.transitionMs},`,
    `      transitionProps: ${c.transitionProps === null ? 'null' : dartStr(c.transitionProps)},`,
    `      easeX1: ${ease === null ? 'null' : fmt(ease[0])},`,
    `      easeY1: ${ease === null ? 'null' : fmt(ease[1])},`,
    `      easeX2: ${ease === null ? 'null' : fmt(ease[2])},`,
    `      easeY2: ${ease === null ? 'null' : fmt(ease[3])},`,
  ].join('\n');
};
L.push(
  "import 'package:flutter/material.dart';",
  '',
  '/// One §6 chrome chip — the icon chip, the pill, the pill’s active',
  '/// composite, the chip-select, the delta box and its two tints — measured',
  '/// on a detached element carrying exactly that class, plus the authored',
  '/// facts the probe cannot see (flex `gap`, `tabular-nums`, the `.icon-chip`',
  '/// square, `:active`/`:disabled`) read from the same pinned `src/index.css`.',
  '/// A widget under `lib/presentation/` restates none of it.',
  '///',
  '/// Rows are honest per class, and composition is the widget’s job:',
  '/// * `.pill-active` is the composed measurement — a `.pill` carrying the',
  '///   override (probe key `.pill.pill-active`). Its three authored tokens are',
  '///   cross-checked against that composite at generation.',
  '/// * `.delta-up`/`.delta-down` are measured standalone (display `block`, no',
  '///   radius) because that is what the probe saw; in the app they ride on the',
  '///   same element as `.delta-chip`, which supplies the pill geometry. The',
  '///   widget paints the chip row’s box with the tint row’s fill and ink.',
  '/// * `.delta-chip` itself authors no colour: its measured transparent fill',
  '///   and inherited ink are exactly that fact, not a colour to paint.',
  '/// * `.icon-chip` authors no type; its 16px/400 row is the inherited body',
  '///   font, and the widget paints an icon, not text, into the box.',
  '/// * `.icon-chip-lg` is deliberately absent: its rule authors only a',
  '///   44px square override and no element under `src/` carries the class —',
  '///   asserted at generation, the `.card-sm` precedent.',
  'class AppChipSpec {',
  '  const AppChipSpec({',
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
  '    required this.gapPx,',
  '    required this.tabularNums,',
  '    required this.blurPx,',
  '    required this.blurSaturate,',
  '    required this.sizePx,',
  '    required this.pressFillColor,',
  '    required this.disabledOpacity,',
  '    required this.transitionMs,',
  '    required this.transitionProps,',
  '    required this.easeX1,',
  '    required this.easeY1,',
  '    required this.easeX2,',
  '    required this.easeY2,',
  '  });',
  '',
  '  /// The CSS class this row was measured from.',
  '  final String cssClass;',
  '',
  '  /// The computed `display`, carried as data; the widget composes the row.',
  '  final String displayCss;',
  '',
  '  final double radiusPx;',
  '  final double borderWidthPx;',
  '  final Color borderColor;',
  '',
  '  /// The resting fill and ink, from the detached probe of exactly this class',
  '  /// (`.pill-active` via its `.pill.pill-active` composite). Where a bare',
  '  /// `var(--token)` authored the colour, the probe and the token’s measured',
  '  /// substitution were checked equal at generation.',
  '  final Color fillColor;',
  '  final Color textColor;',
  '',
  '  /// Measured type — the first family of the computed stack, as everywhere',
  '  /// in the generated theme. Rows whose class authors no type carry the',
  '  /// inherited body font as measured; see the class comment.',
  '  final String fontFamily;',
  '  final double fontSizePx;',
  '  final int fontWeight;',
  '  final double? lineHeightPx;',
  '  final double letterSpacingPx;',
  '',
  '  final double paddingVerticalPx;',
  '  final double paddingHorizontalPx;',
  '',
  '  /// The authored flex `gap`; null where the rule authors none. Chrome’s',
  '  /// computed `gap` was not in the detached-element field set, so this is',
  '  /// read from the resting rule — a documented authored fact, not a default.',
  '  final double? gapPx;',
  '',
  '  /// `font-variant-numeric: tabular-nums`, authored by `.delta-chip` alone.',
  '  final bool tabularNums;',
  '',
  '  /// `backdrop-filter` blur in CSS px; null is the measured `none`',
  '  /// (`.chip-select` blurs 10px; the rest of the family does not). The',
  '  /// `saturate()` travels as recorded data, unimplemented — the same finding',
  '  /// [AppSurfaceSpec] and [AppNavSpec] carry.',
  '  final double? blurPx;',
  '  final double? blurSaturate;',
  '',
  '  /// `.icon-chip`’s authored square side; null on every other row.',
  '  final double? sizePx;',
  '',
  '  /// `.pill:active`’s repaint — `var(--surface-3)` substituted from each',
  '  /// pass’s measured `:root`, because the probe only sees the resting box.',
  '  /// Null where the class authors no press state. The rule moves no box',
  '  /// (a `transform` here would have failed generation).',
  '  final Color? pressFillColor;',
  '',
  '  /// `.pill:disabled` opacity (`cursor: not-allowed` travels with it as the',
  '  /// same fact); null where the class authors no disabled face.',
  '  final double? disabledOpacity;',
  '',
  '  /// The one clock the class’s own `transition` names (duration token,',
  '  /// easing token, and the properties it covers); null where the rule',
  '  /// transitions nothing. `.pill` animates fill, border and colour;',
  '  /// `.chip-select` animates fill and border.',
  '  final int? transitionMs;',
  '  final String? transitionProps;',
  '  final double? easeX1;',
  '  final double? easeY1;',
  '  final double? easeX2;',
  '  final double? easeY2;',
  '',
  '  BorderRadius get borderRadius => BorderRadius.circular(radiusPx);',
  '',
  '  /// `null` where the class measured no frame, rather than a zero-width one.',
  '  Border? get border =>',
  '      borderWidthPx == 0',
  '          ? null',
  '          : Border.all(color: borderColor, width: borderWidthPx);',
  '',
  '  EdgeInsets get padding =>',
  '      EdgeInsets.symmetric(vertical: paddingVerticalPx, horizontal: paddingHorizontalPx);',
  '',
  '  /// The measured `font-weight`, mapped the way [AppControlSpec.weight] does.',
  '  FontWeight get weight => FontWeight.values[fontWeight ~/ 100 - 1];',
  '',
  '  double? get lineHeightRatio =>',
  '      lineHeightPx == null ? null : lineHeightPx! / fontSizePx;',
  '',
  '  /// CSS blur radius → Flutter sigma (UI_SPEC D-U8); null where no backdrop.',
  '  double? get blurSigmaPx => blurPx == null ? null : blurPx! / 2;',
  '',
  '  Duration? get pressDuration {',
  '    final int? ms = transitionMs;',
  '    return ms == null ? null : Duration(milliseconds: ms);',
  '  }',
  '',
  '  Curve? get pressCurve =>',
  '      easeX1 == null ? null : Cubic(easeX1!, easeY1!, easeX2!, easeY2!);',
  '}',
  '',
  '/// The card-face gold chip: the box, the probe-substituted',
  '/// `--chip-gold → --chip-gold-deep` 135° gradient, and the inset ring the',
  '/// authored `::after` paints 4px inside it. Both measured passes print the',
  '/// same gold and the same box (asserted at generation), so there is one',
  '/// spec, not a per-brightness table.',
  'class AppFaceChipSpec {',
  '  const AppFaceChipSpec({',
  '    required this.cssClass,',
  '    required this.widthPx,',
  '    required this.heightPx,',
  '    required this.radiusPx,',
  '    required this.fillGradient,',
  '    required this.ringInsetPx,',
  '    required this.ringBorderWidthPx,',
  '    required this.ringColor,',
  '    required this.ringRadiusPx,',
  '  });',
  '',
  '  final String cssClass;',
  '  final double widthPx;',
  '  final double heightPx;',
  '  final double radiusPx;',
  '  final LinearGradient fillGradient;',
  '',
  '  /// The `::after` ring: `inset: 4px`, `border: 1px solid rgba(0, 0, 0,',
  '  /// 0.25)`, `border-radius: 3px` (src/index.css read because a pseudo-',
  '  /// element is invisible to a detached-element probe).',
  '  final double ringInsetPx;',
  '  final double ringBorderWidthPx;',
  '  final Color ringColor;',
  '  final double ringRadiusPx;',
  '',
  '  BorderRadius get borderRadius => BorderRadius.circular(radiusPx);',
  '  BorderRadius get ringBorderRadius => BorderRadius.circular(ringRadiusPx);',
  '  Border get ringBorder => Border.all(color: ringColor, width: ringBorderWidthPx);',
  '}',
  '',
  '/// The §6 chip rows, keyed by CSS class — one map per measured pass.',
  'abstract final class AppChips {',
);
for (const [passName, rowName, pressName, themeTag] of [
  ['light', 'l', 'pressFill', 'light-desktop'],
  ['dark', 'd', 'dPressFill', 'dark-desktop'],
]) {
  L.push(
    `  /// ${passName} pass (UI_SPEC §6, \`${themeTag}\`; states, gap and`,
    '  /// tabular-nums from the authored rules of the same pinned file).',
    `  static const Map<String, AppChipSpec> ${passName} =`,
    '      <String, AppChipSpec>{',
  );
  for (const c of pills) {
    L.push(`    ${dartStr(c.cls)}: AppChipSpec(`, chipExpr(c, rowName, pressName), '    ),');
  }
  L.push('  };', '');
}
const hoverOf = (cls) => pills.find((x) => x.cls === cls).hoverSrc;
const restSrcOf = (cls) => pills.find((x) => x.cls === cls).restSrc;
L.push(
  '  /// The sources, printed once: resting rules',
  `  /// (${pills.map((c) => `${c.cls} @ ${c.restSrc}`).join('; ')});`,
  '  /// `.pill:active` and `.pill:disabled` are ported as fields above.',
  '  ///',
  '  /// Unported authored states — decoration, dropped per UI_SPEC D-U1:',
  `  /// * \`.pill:hover\` at ${hoverOf('.pill')} and`,
  `  ///   \`.chip-select:hover\` at ${hoverOf('.chip-select')} lift the border to`,
  '  ///   `--line-strong` and repaint the fill (`--surface-2` / plain',
  '  ///   `--surface-2`); both sit on the clock the row already ports.',
  `  /// * \`.pill-active:hover\` at ${hoverOf('.pill-active')}` + ' mixes',
  '  ///   `color-mix(in srgb, var(--ink) 90%, var(--surface))` for fill and',
  '  ///   border — a hover-only mix the port evaluates nowhere.',
  '  ///',
  '  /// The measured rows for a class and brightness. An unknown class is a',
  '  /// programming error, not a fallback: nothing in this layer may quietly',
  '  /// become a Material default.',
  '  static AppChipSpec resolve(String cssClass, Brightness brightness) {',
  '    final Map<String, AppChipSpec> table =',
  '        brightness == Brightness.dark ? dark : light;',
  '    final AppChipSpec? spec = table[cssClass];',
  "    if (spec == null) throw ArgumentError('$cssClass is not a §6 chip class');",
  '    return spec;',
  '  }',
  '}',
  '',
  '/// The card-face chip, once per the note on [AppFaceChipSpec]. Sources:',
  `/// resting ${faceChip.restSrc}, ring ${faceChip.afterSrc}.`,
  'abstract final class AppFaceChips {',
  '  static const AppFaceChipSpec spec = AppFaceChipSpec(',
  `    cssClass: ${dartStr(faceChip.cls)},`,
  `    widthPx: ${fmt(faceChip.widthPx)},`,
  `    heightPx: ${fmt(faceChip.heightPx)},`,
  `    radiusPx: ${fmt(faceChip.radiusPx)},`,
  `    fillGradient: ${gradientExpr(faceChip.gradient)},`,
  `    ringInsetPx: ${fmt(faceChip.ringInsetPx)},`,
  `    ringBorderWidthPx: ${fmt(faceChip.ringWidthPx)},`,
  `    ringColor: ${dartSurfaceColour({ ...faceChip.ringColour, alpha: faceChip.ringColour.a })},`,
  `    ringRadiusPx: ${fmt(faceChip.ringRadiusPx)},`,
  '  );',
  '}',
  '',
);
finish('app_chips.dart');

// ================================================================ app_segments.dart
// The segmented control is three readings: the track, a resting item, and the
// selected item — the last carrying an inset ring, which no resting probe of
// the §6 chrome family has ever shown, so it gets its own parser. The selected
// rule’s three declarations are cross-checked against that probe per pass.
const SEG_TRACK = '.segment';
const SEG_ITEM = '.segment-item';
const SEG_SELECTED_PROBE = '.segment-item;aria-selected=true';
const segment = (() => {
  const trackRest = cssRule(/^\.segment \{$/, SEG_TRACK, 24);
  const itemRest = cssRule(/^\.segment-item \{$/, SEG_ITEM, 24);
  checkChipProps(ruleProps(trackRest, SEG_TRACK), CHIP_REST_ALLOWED, 'the rest rule', SEG_TRACK, trackRest.line);
  checkChipProps(ruleProps(itemRest, SEG_ITEM), CHIP_REST_ALLOWED, 'the rest rule', SEG_ITEM, itemRest.line);
  for (const [prop] of ruleProps(trackRest, SEG_TRACK)) {
    if (['font-size', 'font-weight', 'color', 'line-height'].includes(prop)) {
      fail(`${SEG_TRACK} authors type (${prop}); the track row ports none — the probe value is inheritance`);
    }
  }
  const trackGap = authoredGap(trackRest, SEG_TRACK);
  const itemTr = controlTransition(itemRest, SEG_ITEM, ['background-color', 'color']);
  const itemHoverIdx = CSS_LINES.findIndex((x) => /^\.segment-item:hover( |\{)/.test(x));
  const itemHover = cssRule(/^\.segment-item:hover \{$/, SEG_ITEM);
  checkChipProps(ruleProps(itemHover, SEG_ITEM), ['color'], ':hover', SEG_ITEM, itemHover.line);

  const selRule = cssRule(/^\.segment-item\[aria-selected='true'\],$/, SEG_ITEM, 24);
  checkChipProps(
    ruleProps(selRule, SEG_ITEM),
    ['background', 'color', 'box-shadow'],
    '[aria-selected]',
    SEG_ITEM,
    selRule.line,
  );
  const selRead = (tag, theme) => {
    const p = theme.probes[SEG_SELECTED_PROBE];
    if (!p) fail(`${tag}: no ${SEG_SELECTED_PROBE} probe`);
    const bs = p.boxShadow;
    if (!bs) fail(`${SEG_SELECTED_PROBE}: no boxShadow probe`);
    // Chrome computed the shadow in the authored `oklch(…)` space; the
    // measurement carries the token-substituted rgba form beside it, which is
    // what every other §6 shadow reader here parses (`probeShadowList`).
    const ringRaw = bs.substituted || bs.raw;
    const m = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\) 0px 0px 0px ([\d.]+)px inset$/.exec(ringRaw);
    if (!m) fail(`${SEG_SELECTED_PROBE}: box-shadow "${ringRaw}" is not a single inset ring`);
    if (probeRaw(p, 'borderTopWidth', SEG_SELECTED_PROBE) !== '0px') {
      fail(`${SEG_SELECTED_PROBE}: the selected item measures a border; the rule paints the ring as a shadow`);
    }
    return {
      fill: probeSrgb(p, 'backgroundColor', SEG_SELECTED_PROBE),
      text: probeSrgb(p, 'color', SEG_SELECTED_PROBE),
      ring: { r: +m[1], g: +m[2], b: +m[3], a: parseFloat(m[4]), widthPx: parseFloat(m[5]) },
      radiusPx: probePx(p, 'borderRadius', SEG_SELECTED_PROBE),
      padding: probePadding(p, SEG_SELECTED_PROBE),
    };
  };
  const selBg = cssDecl(selRule, 'background', SEG_ITEM);
  const selFg = cssDecl(selRule, 'color', SEG_ITEM);
  const selSh = collapse(cssDecl(selRule, 'box-shadow', SEG_ITEM));
  const shm = /^inset 0 0 0 ([\d.]+)px var\((--[a-z0-9-]+)\)$/.exec(selSh);
  if (!shm) fail(`${SEG_ITEM}: [aria-selected] box-shadow "${selSh}" is not \`inset 0 0 0 Npx var(--token)\``);
  const sel = {};
  for (const [passName, theme, themeTag] of [
    ['l', LIGHT, 'light-desktop'],
    ['d', DARK, 'dark-desktop'],
  ]) {
    const r = selRead(themeTag, theme);
    const bg = authoredColour(collapse(selBg), theme, themeTag, '[aria-selected] background', SEG_ITEM);
    const fg = authoredColour(collapse(selFg), theme, themeTag, '[aria-selected] colour', SEG_ITEM);
    const ring = theme.root[shm[2]];
    if (!ring || !ring.srgb) fail(`${SEG_ITEM}: the ring token ${shm[2]} is not a measured colour in ${themeTag}`);
    if (r.fill.hex !== bg.srgb.hex || r.fill.alpha !== bg.srgb.alpha) {
      fail(`${SEG_ITEM}[selected] ${themeTag}: probe fill ${r.fill.rgba} != ${bg.token} ${bg.srgb.rgba}`);
    }
    if (r.text.hex !== fg.srgb.hex || r.text.alpha !== fg.srgb.alpha) {
      fail(`${SEG_ITEM}[selected] ${themeTag}: probe text ${r.text.rgba} != ${fg.token} ${fg.srgb.rgba}`);
    }
    for (const [key, want] of [
      ['r', ring.srgb.r],
      ['g', ring.srgb.g],
      ['b', ring.srgb.b],
      ['a', ring.srgb.alpha],
    ]) {
      if (r.ring[key] !== want)
        fail(`${SEG_ITEM}[selected] ${themeTag}: probe ring ${key} ${r.ring[key]} != ${shm[2]} ${want}`);
    }
    if (r.ring.widthPx !== parseFloat(shm[1])) {
      fail(`${SEG_ITEM}[selected] ${themeTag}: probe ring width ${r.ring.widthPx} != authored ${shm[1]}`);
    }
    sel[passName] = r;
  }
  // The phone passes must show the same selected box.
  for (const [tag, theme, want] of [
    ['light-phone', LIGHT_PHONE, sel.l],
    ['dark-phone', DARK_PHONE, sel.d],
  ]) {
    const r = selRead(tag, theme);
    if (JSON.stringify(r) !== JSON.stringify(want)) fail(`${SEG_ITEM}[selected]: ${tag} differs from its desktop pass`);
  }

  const trackL = chipProbeRow(SEG_TRACK, 'light-desktop', LIGHT);
  const trackD = chipProbeRow(SEG_TRACK, 'dark-desktop', DARK);
  const itemL = chipProbeRow(SEG_ITEM, 'light-desktop', LIGHT);
  const itemD = chipProbeRow(SEG_ITEM, 'dark-desktop', DARK);
  for (const [row, selRow] of [
    [itemL, sel.l],
    [itemD, sel.d],
  ]) {
    if (selRow.radiusPx !== row.radiusPx)
      fail(`${SEG_ITEM}: selected radius ${selRow.radiusPx} != resting ${row.radiusPx}`);
    if (selRow.padding.vertical !== row.paddingVerticalPx || selRow.padding.horizontal !== row.paddingHorizontalPx) {
      fail(`${SEG_ITEM}: the selected state moves the box`);
    }
  }
  for (const [tag, theme, want] of [
    ['light-phone', LIGHT_PHONE, trackL],
    ['dark-phone', DARK_PHONE, trackD],
  ]) {
    const fp = chipRowKey(chipProbeRow(SEG_TRACK, tag, theme));
    const fw = chipRowKey(want);
    for (const [key, value] of Object.entries(fp)) {
      if (fw[key] !== value) fail(`${SEG_TRACK}: ${key} is "${value}" on ${tag} but "${fw[key]}" on desktop`);
    }
  }
  for (const [tag, theme, want] of [
    ['light-phone', LIGHT_PHONE, itemL],
    ['dark-phone', DARK_PHONE, itemD],
  ]) {
    const fp = chipRowKey(chipProbeRow(SEG_ITEM, tag, theme));
    const fw = chipRowKey(want);
    for (const [key, value] of Object.entries(fp)) {
      if (fw[key] !== value) fail(`${SEG_ITEM}: ${key} is "${value}" on ${tag} but "${fw[key]}" on desktop`);
    }
  }
  for (const key of CHIP_STABLE_FIELDS) {
    if (trackL[key] !== trackD[key]) fail(`${SEG_TRACK}: ${key} is "${trackL[key]}" light / "${trackD[key]}" dark`);
    if (itemL[key] !== itemD[key]) fail(`${SEG_ITEM}: ${key} is "${itemL[key]}" light / "${itemD[key]}" dark`);
  }
  // The item’s authored ink must be its probe ink, and its `transparent`
  // background must have measured transparent.
  for (const [pass, theme, themeTag] of [
    [itemL, LIGHT, 'light-desktop'],
    [itemD, DARK, 'dark-desktop'],
  ]) {
    const fg = authoredColour(
      collapse(cssDecl(itemRest, 'color', SEG_ITEM)),
      theme,
      themeTag,
      '.segment-item colour',
      SEG_ITEM,
    );
    if (pass.textColor.hex !== fg.srgb.hex || pass.textColor.alpha !== fg.srgb.alpha) {
      fail(`${SEG_ITEM} ${themeTag}: probe text ${pass.textColor.rgba} != ${fg.token} ${fg.srgb.rgba}`);
    }
    if (collapse(cssDecl(itemRest, 'background', SEG_ITEM)) !== 'transparent' || pass.fillColor.alpha !== 0) {
      fail(`${SEG_ITEM}: the resting background moved off \`transparent\``);
    }
    if (pass.borderWidthPx !== 0)
      fail(`${SEG_ITEM}: the resting item measures a border; the rule authors \`border: none\``);
  }
  return {
    trackGap,
    itemTr,
    itemHoverSrc: itemHoverIdx < 0 ? 'none' : `src/index.css:${itemHoverIdx + 1}`,
    selSrc: `src/index.css:${selRule.line}`,
    rows: [
      {
        cls: SEG_TRACK,
        l: {
          ...trackL,
          displayCss: trackL.displayCss,
          textColor: null,
          fontFamily: null,
          fontSizePx: null,
          fontWeight: null,
          lineHeightPx: null,
          letterSpacingPx: null,
        },
        d: {
          ...trackD,
          textColor: null,
          fontFamily: null,
          fontSizePx: null,
          fontWeight: null,
          lineHeightPx: null,
          letterSpacingPx: null,
        },
        gapPx: trackGap,
        selected: null,
        tr: null,
        restSrc: `src/index.css:${trackRest.line}`,
      },
      {
        cls: SEG_ITEM,
        l: itemL,
        d: itemD,
        gapPx: null,
        selected: sel,
        tr: itemTr,
        restSrc: `src/index.css:${itemRest.line}`,
      },
    ],
  };
})();
banner();
const segExpr = (c, rowName) => {
  const pass = c[rowName];
  const sel = c.selected === null ? null : c.selected[rowName];
  const num = (v) => (v === null || v === undefined ? 'null' : fmt(v));
  const tr = c.tr;
  return [
    `      cssClass: ${dartStr(c.cls)},`,
    `      displayCss: ${dartStr(pass.displayCss)},`,
    `      radiusPx: ${fmt(pass.radiusPx)},`,
    `      borderWidthPx: ${fmt(pass.borderWidthPx)},`,
    `      borderColor: ${dartSurfaceColour(pass.borderColor)},`,
    `      fillColor: ${dartSurfaceColour(pass.fillColor)},`,
    `      textColor: ${pass.textColor === null ? 'null' : dartSurfaceColour(pass.textColor)},`,
    `      fontFamily: ${pass.fontFamily === null ? 'null' : dartStr(pass.fontFamily)},`,
    `      fontSizePx: ${num(pass.fontSizePx)},`,
    `      fontWeight: ${pass.fontWeight === null ? 'null' : pass.fontWeight},`,
    `      lineHeightPx: ${num(pass.lineHeightPx)},`,
    `      letterSpacingPx: ${num(pass.letterSpacingPx)},`,
    `      paddingVerticalPx: ${fmt(pass.paddingVerticalPx)},`,
    `      paddingHorizontalPx: ${fmt(pass.paddingHorizontalPx)},`,
    `      gapPx: ${num(c.gapPx)},`,
    `      blurPx: ${num(pass.blurPx)},`,
    `      blurSaturate: ${num(pass.blurSaturate)},`,
    `      selectedFillColor: ${sel === null ? 'null' : dartSurfaceColour(sel.fill)},`,
    `      selectedTextColor: ${sel === null ? 'null' : dartSurfaceColour(sel.text)},`,
    `      selectedRingColor: ${sel === null ? 'null' : dartSurfaceColour({ ...sel.ring, alpha: sel.ring.a })},`,
    `      selectedRingWidthPx: ${sel === null ? 'null' : fmt(sel.ring.widthPx)},`,
    `      transitionMs: ${tr === null ? 'null' : tr.ms},`,
    `      transitionProps: ${tr === null ? 'null' : dartStr(tr.props.join(', '))},`,
    `      easeX1: ${tr === null ? 'null' : fmt(tr.curve[0])},`,
    `      easeY1: ${tr === null ? 'null' : fmt(tr.curve[1])},`,
    `      easeX2: ${tr === null ? 'null' : fmt(tr.curve[2])},`,
    `      easeY2: ${tr === null ? 'null' : fmt(tr.curve[3])},`,
  ].join('\n');
};
L.push(
  "import 'package:flutter/material.dart';",
  '',
  '/// The §6 segmented control: the track and a resting item, each measured',
  '/// on a detached element carrying exactly that class, plus the selected',
  '/// state — the one §6 chrome reading whose resting probe carries an inset',
  '/// ring. The selected rule’s background, colour and ring token are',
  '/// cross-checked against that probe at generation, per pass; the ring',
  '/// travels as a colour and width, painted inside the item’s own box.',
  '///',
  '/// Two rows share one shape because one widget composes them:',
  '/// * `.segment` authors no type and no text: its font fields are `null` —',
  '///   the probe’s 16px/24px is body inheritance, not a fact about the track.',
  '///   Its `gap` travels from the authored rule (Chrome computed `gap` is not',
  '///   in the probe field set), as in [AppChipSpec].',
  '/// * `.segment-item` carries the selected state; the track row leaves those',
  '///   fields `null` because the selector cannot match it.',
  '/// * `.segment-item:hover` (at',
  `  /// ${segment.itemHoverSrc}) changes only`,
  '///   `color` to `--ink` — decoration, dropped per UI_SPEC D-U1; the selected',
  '///   rule’s own ink is ported.',
  '///',
  '/// The family has no call sites under `src/` today (a comment at',
  '/// `src/components/ReportsCentre.tsx:161` is its only mention); it is ported',
  '/// because the phase ruling orders it, exactly as the measurement shows.',
  'class AppSegmentSpec {',
  '  const AppSegmentSpec({',
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
  '    required this.gapPx,',
  '    required this.blurPx,',
  '    required this.blurSaturate,',
  '    required this.selectedFillColor,',
  '    required this.selectedTextColor,',
  '    required this.selectedRingColor,',
  '    required this.selectedRingWidthPx,',
  '    required this.transitionMs,',
  '    required this.transitionProps,',
  '    required this.easeX1,',
  '    required this.easeY1,',
  '    required this.easeX2,',
  '    required this.easeY2,',
  '  });',
  '',
  '  final String cssClass;',
  '  final String displayCss;',
  '  final double radiusPx;',
  '  final double borderWidthPx;',
  '  final Color borderColor;',
  '',
  '  /// The resting fill and ink. The track measured',
  '  /// `color-mix(… var(--surface-2) 72%, transparent)`; the item measured',
  '  /// transparent over its `--ink-2`.',
  '  final Color fillColor;',
  '  final Color? textColor;',
  '',
  '  final String? fontFamily;',
  '  final double? fontSizePx;',
  '  final int? fontWeight;',
  '  final double? lineHeightPx;',
  '  final double? letterSpacingPx;',
  '',
  '  final double paddingVerticalPx;',
  '  final double paddingHorizontalPx;',
  '  final double? gapPx;',
  '',
  '  /// The track’s `blur(10px)`; null on the item, which measured `none`.',
  '  final double? blurPx;',
  '  final double? blurSaturate;',
  '',
  "  /// The [aria-selected='true'] / [data-active='true'] state: fill,",
  '  /// ink, and the inset ring (`box-shadow: inset 0 0 0 1px',
  '  /// var(--line-strong)` measured as one layer). Null on the track row.',
  '  final Color? selectedFillColor;',
  '  final Color? selectedTextColor;',
  '  final Color? selectedRingColor;',
  '  final double? selectedRingWidthPx;',
  '',
  '  /// The item’s `transition` (background-colour and colour on the',
  '  /// `--dur-fast`/`--ease-out` clock); null on the track.',
  '  final int? transitionMs;',
  '  final String? transitionProps;',
  '  final double? easeX1;',
  '  final double? easeY1;',
  '  final double? easeX2;',
  '  final double? easeY2;',
  '',
  '  BorderRadius get borderRadius => BorderRadius.circular(radiusPx);',
  '  Border? get border =>',
  '      borderWidthPx == 0',
  '          ? null',
  '          : Border.all(color: borderColor, width: borderWidthPx);',
  '  EdgeInsets get padding =>',
  '      EdgeInsets.symmetric(vertical: paddingVerticalPx, horizontal: paddingHorizontalPx);',
  '  FontWeight? get weight =>',
  '      fontWeight == null ? null : FontWeight.values[fontWeight! ~/ 100 - 1];',
  '  double? get blurSigmaPx => blurPx == null ? null : blurPx! / 2;',
  '  Duration? get transitionDuration {',
  '    final int? ms = transitionMs;',
  '    return ms == null ? null : Duration(milliseconds: ms);',
  '  }',
  '  Curve? get transitionCurve =>',
  '      easeX1 == null ? null : Cubic(easeX1!, easeY1!, easeX2!, easeY2!);',
  '}',
  '',
  '/// The §6 segmented rows, keyed by CSS class — one map per measured pass.',
  'abstract final class AppSegments {',
);
for (const [passName, themeTag] of [
  ['light', 'light-desktop'],
  ['dark', 'dark-desktop'],
]) {
  L.push(
    `  /// ${passName} pass (UI_SPEC §6, \`${themeTag}\`; the selected state and`,
    '  /// the track gap from the authored rules of the same pinned file).',
    `  static const Map<String, AppSegmentSpec> ${passName} =`,
    '      <String, AppSegmentSpec>{',
  );
  for (const c of segment.rows) {
    L.push(`    ${dartStr(c.cls)}: AppSegmentSpec(`, segExpr(c, passName === 'light' ? 'l' : 'd'), '    ),');
  }
  L.push('  };', '');
}
L.push(
  '  /// Sources: resting rules',
  `  /// (${segment.rows.map((c) => `${c.cls} @ ${c.restSrc}`).join('; ')});`,
  "  /// selected `.segment-item[aria-selected='true']` at " + segment.selSrc + '.',
  '  ///',
  '  /// The measured rows for a class and brightness. An unknown class is a',
  '  /// programming error, not a fallback.',
  '  static AppSegmentSpec resolve(String cssClass, Brightness brightness) {',
  '    final Map<String, AppSegmentSpec> table =',
  '        brightness == Brightness.dark ? dark : light;',
  '    final AppSegmentSpec? spec = table[cssClass];',
  '    if (spec == null) {',
  "      throw ArgumentError('$cssClass is not a §6 segment class');",
  '    }',
  '    return spec;',
  '  }',
  '}',
  '',
);
finish('app_segments.dart');

// ================================================================ app_bars.dart
// Progress fills come in two authored shapes: the five `.bar-*` classes, which
// author nothing but `background: var(--pastel-*)` — size and rounding are
// composed from utilities at every call site — and `.rainbow-bar`, which authors
// its own 3px pill and the measured `var(--rainbow)` gradient.
const BAR_CLASSES = ['.bar-pink', '.bar-mint', '.bar-yellow', '.bar-lavender', '.bar-blue', '.rainbow-bar'];
const bars = BAR_CLASSES.map((cls) => {
  const read = (tag, theme) => {
    const p = theme.probes[cls];
    if (!p) fail(`${tag}: no ${cls} probe`);
    if (probeRaw(p, 'boxShadow', cls) !== 'none') fail(`${cls}: the resting probe carries a box-shadow`);
    if (probeRaw(p, 'borderTopWidth', cls) !== '0px') fail(`${cls}: the bar measures a border`);
    return {
      displayCss: probeRaw(p, 'display', cls),
      radiusPx: probePx(p, 'borderRadius', cls),
      fill: probeSrgb(p, 'backgroundColor', cls),
      gradient: probeGradient(p, cls),
    };
  };
  const l = read('light-desktop', LIGHT);
  const d = read('dark-desktop', DARK);
  for (const [tag, theme, want] of [
    ['light-phone', LIGHT_PHONE, l],
    ['dark-phone', DARK_PHONE, d],
  ]) {
    const r = read(tag, theme);
    if (r.radiusPx !== want.radiusPx) fail(`${cls}: ${tag} radius ${r.radiusPx} != desktop ${want.radiusPx}`);
    if (r.fill.hex !== want.fill.hex || r.fill.alpha !== want.fill.alpha) {
      fail(`${cls}: ${tag} fill ${r.fill.rgba} != desktop ${want.fill.rgba}`);
    }
    if (JSON.stringify(r.gradient) !== JSON.stringify(want.gradient))
      fail(`${cls}: ${tag} gradient differs from desktop`);
  }

  const rest = cssRule(new RegExp(`^\\${cls} \\{$`), cls);
  const bgRaw = collapse(cssDecl(rest, 'background', cls));
  let heightPx = null;
  if (cls === '.rainbow-bar') {
    checkChipProps(ruleProps(rest, cls), ['height', 'border-radius', 'background'], 'the rest rule', cls, rest.line);
    if (!l.gradient) fail(`${cls}: the probe measured no gradient; this class authors \`var(--rainbow)\``);
    const name = tokenRef(bgRaw, `${cls} background`, cls);
    for (const [theme, themeTag, probe] of [
      [LIGHT, 'light-desktop', l],
      [DARK, 'dark-desktop', d],
    ]) {
      const tok = theme.root[name];
      if (!tok || !tok.substituted) fail(`${cls}: ${name} is not a measured substituted gradient in ${themeTag}`);
      gEq(parseGradient(collapse(tok.substituted), `${themeTag} ${name}`), probe.gradient, `${cls} ${themeTag}`);
    }
    heightPx = lengthPx(cssDecl(rest, 'height', cls), `${cls} height`);
    const rRaw = lengthPx(cssDecl(rest, 'border-radius', cls), `${cls} radius`);
    if (rRaw !== l.radiusPx || rRaw !== d.radiusPx) {
      fail(`${cls}: authored radius ${rRaw} != probe radius (l ${l.radiusPx}, d ${d.radiusPx})`);
    }
  } else {
    checkChipProps(ruleProps(rest, cls), ['background'], 'the rest rule', cls, rest.line);
    if (l.gradient || d.gradient) fail(`${cls}: a pastel bar measured a gradient`);
    for (const [theme, themeTag, probe] of [
      [LIGHT, 'light-desktop', l],
      [DARK, 'dark-desktop', d],
    ]) {
      const want = authoredColour(bgRaw, theme, themeTag, `${cls} background`, cls);
      if (probe.fill.hex !== want.srgb.hex || probe.fill.alpha !== want.srgb.alpha) {
        fail(`${cls} ${themeTag}: probe fill ${probe.fill.rgba} != ${want.token} ${want.srgb.rgba}`);
      }
    }
  }
  return { cls, l, d, heightPx, gradient: !!l.gradient, restSrc: `src/index.css:${rest.line}` };
});
banner();
const barExpr = (b, rowName) => {
  const row = b[rowName];
  return [
    `      cssClass: ${dartStr(b.cls)},`,
    `      displayCss: ${dartStr(row.displayCss)},`,
    `      radiusPx: ${fmt(row.radiusPx)},`,
    `      fillColor: ${row.gradient ? 'null' : dartSurfaceColour(row.fill)},`,
    `      fillGradient: ${row.gradient ? gradientExpr(row.gradient) : 'null'},`,
    `      heightPx: ${b.heightPx === null ? 'null' : fmt(b.heightPx)},`,
  ].join('\n');
};
L.push(
  "import 'package:flutter/material.dart';",
  '',
  '/// One §6 progress-bar class, measured on a detached element carrying it.',
  '/// The five pastels author a flat colour and nothing else: size and',
  '/// rounding at the call site are Tailwind utilities, so the row’s',
  '/// `radiusPx` is the measured `0px` and `heightPx` is `null` — the caller’s',
  '/// own geometry, never a default invented here.',
  '///',
  '/// `.rainbow-bar` is the one class that brings its own box: 3px tall,',
  '/// fully round, painted with the measured `--rainbow` gradient (lavender →',
  '/// blue at 45% → transparent), which was cross-checked against the §2.2',
  '/// gradient token’s measured substitution, per pass.',
  'class AppBarSpec {',
  '  const AppBarSpec({',
  '    required this.cssClass,',
  '    required this.displayCss,',
  '    required this.radiusPx,',
  '    required this.fillColor,',
  '    required this.fillGradient,',
  '    required this.heightPx,',
  '  });',
  '',
  '  final String cssClass;',
  '',
  '  /// The computed `display` — `block` on every bar; carried as data.',
  '  final String displayCss;',
  '  final double radiusPx;',
  '',
  '  /// Exactly one of these two is non-null, because the probe is either a',
  '  /// flat colour or a gradient, never both.',
  '  final Color? fillColor;',
  '  final LinearGradient? fillGradient;',
  '',
  '  /// Authored height — 3px for `.rainbow-bar`, `null` for the pastels,',
  '  /// which author none.',
  '  final double? heightPx;',
  '',
  '  BorderRadius get borderRadius => BorderRadius.circular(radiusPx);',
  '}',
  '',
  '/// The §6 bar rows, keyed by CSS class — one map per measured pass.',
  'abstract final class AppBars {',
);
for (const [passName, themeTag] of [
  ['light', 'light-desktop'],
  ['dark', 'dark-desktop'],
]) {
  L.push(
    `  /// ${passName} pass (UI_SPEC §6, \`${themeTag}\`).`,
    `  static const Map<String, AppBarSpec> ${passName} =`,
    '      <String, AppBarSpec>{',
  );
  for (const b of bars) {
    L.push(`    ${dartStr(b.cls)}: AppBarSpec(`, barExpr(b, passName === 'light' ? 'l' : 'd'), '    ),');
  }
  L.push('  };', '');
}
L.push(
  '  /// Sources: every rule is a one-or-three-declaration authored rule;',
  `  /// (${bars.map((b) => `${b.cls} @ ${b.restSrc}`).join('; ')}).`,
  '  ///',
  '  /// The measured rows for a class and brightness. An unknown class is a',
  '  /// programming error, not a fallback.',
  '  static AppBarSpec resolve(String cssClass, Brightness brightness) {',
  '    final Map<String, AppBarSpec> table = brightness == Brightness.dark ? dark : light;',
  '    final AppBarSpec? spec = table[cssClass];',
  "    if (spec == null) throw ArgumentError('$cssClass is not a §6 bar class');",
  '    return spec;',
  '  }',
  '}',
  '',
);
finish('app_bars.dart');

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
    `  §6 modal/sheet shells:       ${modalVariantData.length} variants x 2 passes  -> AppModals`,
    `  §6 chips emitted:            ${pills.length} classes x 2 passes + the face chip  -> AppChips`,
    `  §6 segment rows emitted:     ${segment.rows.length} classes x 2 passes  -> AppSegments`,
    `  §6 bar classes emitted:      ${bars.length} classes x 2 passes  -> AppBars`,
    `  files written:                 ${dartFiles.map((f) => f[0]).join(', ')}`,
  ].join('\n'),
);
