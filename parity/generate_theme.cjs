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
  L.push(`  /// Font family \`${family}\`: bundled by item 10 (UI_SPEC §3.1), so this is the face`);
  L.push('  /// that renders — not a name waiting for a file. height = lineHeight px / font-size px.');
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
L.push('/// The ladder carries no `fontFamily`, and that is a known gap rather than a');
L.push('/// waiting room: item 10 bundled the three web families (UI_SPEC §3.1) and every');
L.push('/// §3 class style in `app_typography.dart` names its measured one, so what renders');
L.push('/// through a measured row is the real face. This ladder is the Material roles,');
L.push('/// which the web answers with `body`’s `--font-sans` stack; no ported widget');
L.push('/// reads it yet, so leaving it family-free is recorded as an open item, not a');
L.push('/// silence — and a missing family is exactly what would re-glyph a golden.');
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

// ================================================================ app_numerals.dart
// Item 7 — the numeral/money type utilities of `src/index.css:359-426`: the faces
// a money figure is set in, plus the two overlays a call site stacks on text it
// sizes itself (`.money`, `.mono`). `.eyebrow` is already a §6 label row
// (`AppLabels`), so it is not repeated here.
//
// Two tiers meet in these rows. The phone probe is what Chrome painted at
// `innerWidth` 390; the authored declaration is the only form that survives the
// font size a call site gives the element — the hero clamps itself to its own
// card, and `.numeral-sup` is em-relative through and through. So every row has
// to satisfy both readings at once: the authored `em` / `clamp()` / `min()`
// re-resolved at each measured viewport must equal the probe taken there, or
// generation fails rather than shipping a number that only works at one width.
const NUMERAL_CLASSES = [
  '.money-display',
  '.numeral',
  '.numeral-md',
  '.numeral-hero',
  '.numeral-sup',
  '.money',
  '.mono',
];

// What each class may author. A new declaration in this block is a new fact the
// phone has to answer for, so it fails generation instead of being dropped.
const NUMERAL_REST_PROPS = {
  '.money-display': [
    'font-family',
    'font-size',
    'font-weight',
    'line-height',
    'letter-spacing',
    'font-variant-numeric',
    'overflow-wrap',
    'min-width',
  ],
  '.numeral': [
    'font-family',
    'font-size',
    'font-weight',
    'line-height',
    'letter-spacing',
    'font-variant-numeric',
    'overflow-wrap',
    'min-width',
  ],
  '.numeral-md': ['font-size', 'font-weight'],
  '.numeral-hero': ['font-size'],
  '.numeral-sup': [
    'font-family',
    'font-size',
    'font-weight',
    'letter-spacing',
    'vertical-align',
    'margin-left',
    'color',
  ],
  '.money': ['font-variant-numeric', 'letter-spacing'],
  '.mono': ['font-family', 'font-variant-numeric'],
};

/** The first family of a CSS font stack — the one name Flutter is given. */
const firstFamily = (raw, cls) => {
  const first = collapse(raw)
    .split(',')[0]
    .replace(/^["']|["']$/g, '')
    .trim();
  if (!first) fail(`${cls}: font stack "${raw}" has no first family`);
  return first;
};

/** `clamp(<lo>px, <pref>vw, <hi>px)` resolved at a viewport width — the median
 *  the browser takes, which is why one authored clamp has two measured numbers. */
const clampAt = (raw, viewportPx, cls) => {
  const m = /^clamp\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)vw\s*,\s*(-?[\d.]+)px\s*\)$/.exec(collapse(raw));
  if (!m) fail(`${cls}: unportable clamp "${raw}"`);
  const preferred = (parseFloat(m[2]) * viewportPx) / 100;
  return Math.min(Math.max(preferred, parseFloat(m[1])), parseFloat(m[3]));
};

/** `<n>em` — the unit every authored numeral metric is written in. */
const emOf = (raw, cls, prop) => {
  const m = /^(-?[\d.]+)em$/.exec(collapse(raw));
  if (!m) fail(`${cls}: \`${prop}: ${raw}\` is not an em length`);
  return parseFloat(m[1]);
};

/** `letter-spacing` computes to `normal` when a row inherits none: zero tracking. */
const lsPxOf = (p, cls) => (probeRaw(p, 'letterSpacing', cls) === 'normal' ? 0 : probePx(p, 'letterSpacing', cls));

// The element every probe inherits from. `body` authors the family and the colour
// the non-authoring rows measure, and it authors no font size, so its own probe IS
// the root size this whole block's em and vw values resolve against. Reading it
// beats assuming the 16px.
const bodyRule = (() => {
  for (let i = 0; i < CSS_LINES.length; i++) {
    if (!/^body \{$/.test(CSS_LINES[i])) continue;
    const text = CSS_LINES.slice(i, i + 12).join('\n');
    if (/font-family:/.test(text) && /color:/.test(text)) return { line: i + 1, text };
  }
  return fail('src/index.css has no `body { … }` rule authoring both font-family and color');
})();
const BODY_FONT_TOKEN = tokenRef(cssDecl(bodyRule, 'font-family', 'body'), 'body font-family', 'body');
const BODY_COLOUR_TOKEN = tokenRef(cssDecl(bodyRule, 'color', 'body'), 'body colour', 'body');

/** One numeral class as one measured pass saw it, with the box painted away. */
const numeralPass = (cls, tag, theme) => {
  const p = theme.probes[cls];
  if (!p) fail(`${tag}: no ${cls} probe`);
  if (probeRaw(p, 'backgroundColor', cls) !== 'rgba(0, 0, 0, 0)') fail(`${cls}: ${tag} probe paints a fill`);
  if (probeRaw(p, 'boxShadow', cls) !== 'none') fail(`${cls}: ${tag} probe carries a box-shadow`);
  if (probeRaw(p, 'borderTopWidth', cls) !== '0px') fail(`${cls}: ${tag} probe measures a border`);
  if (probeRaw(p, 'padding', cls) !== '0px') fail(`${cls}: ${tag} probe measures padding`);
  return {
    tag,
    innerWidth: theme.innerWidth,
    displayCss: probeRaw(p, 'display', cls),
    fontFamily: probeFamily(p, cls),
    fontSizePx: probePx(p, 'fontSize', cls),
    fontWeight: parseInt(probeRaw(p, 'fontWeight', cls), 10),
    lineHeightPx: probePx(p, 'lineHeight', cls),
    letterSpacingPx: lsPxOf(p, cls),
    colour: probeSrgb(p, 'color', cls),
  };
};

const PASS_VIEWS = [
  ['light-desktop', LIGHT],
  ['dark-desktop', DARK],
  ['light-phone', LIGHT_PHONE],
  ['dark-phone', DARK_PHONE],
];
const passTheme = (tag) => {
  const found = PASS_VIEWS.find(([name]) => name === tag);
  if (!found) fail(`no measured pass named ${tag}`);
  return found[1];
};
// The root size and the inherited multiplier, read straight off the `body` probe:
// `body` authors neither a font size nor a line-height, so it is the non-circular
// source for every `em` and `vw` in this block — the probe inherits 16px and the
// preflight 1.5 the whole page resolves against, plus body's own family and ink.
// Its box is not checked: `body` is the inheritance source for these rows, not one
// of them, and the fill a numeral must not carry is authored on `body` itself
// (`src/index.css:306`), which a probe element never inherits.
const rootFontSizePx = probePx(LIGHT_PHONE.probes['body'], 'fontSize', 'body');
const inheritedHeightRatio = probePx(LIGHT_PHONE.probes['body'], 'lineHeight', 'body') / rootFontSizePx;
for (const [tag, theme] of PASS_VIEWS) {
  if (probePx(theme.probes['body'], 'fontSize', `body ${tag}`) !== rootFontSizePx) {
    fail(`body font size moves in ${tag}`);
  }
}

const numerals = NUMERAL_CLASSES.map((cls) => {
  const rest = cssRule(new RegExp(`^\\${cls} \\{$`), cls);
  const props = ruleProps(rest, cls);
  for (const [prop] of props) {
    if (!NUMERAL_REST_PROPS[cls].includes(prop)) {
      fail(`${cls}: the rest rule sets \`${prop}\` (src/index.css:${rest.line}); AppNumeralSpec cannot port it`);
    }
  }
  const decl = new Map(props);
  const authored = (prop) => (decl.has(prop) ? collapse(decl.get(prop)) : null);

  const rows = {};
  for (const [tag, theme] of PASS_VIEWS) rows[tag] = numeralPass(cls, tag, theme);
  const lp = rows['light-phone'];
  const dp = rows['dark-phone'];

  // Brightness moves the colour and nothing else; the viewport moves only what a
  // clamp or a min resolves against it, which the line-height ratio below proves.
  for (const [what, desktop, phone] of [
    ['light', rows['light-desktop'], lp],
    ['dark', rows['dark-desktop'], dp],
  ]) {
    for (const field of ['displayCss', 'fontFamily', 'fontWeight']) {
      if (desktop[field] !== phone[field]) {
        fail(`${cls}: ${what}-phone ${field} ${phone[field]} != ${what}-desktop ${desktop[field]}`);
      }
    }
    if (Math.abs(desktop.lineHeightPx / desktop.fontSizePx - phone.lineHeightPx / phone.fontSizePx) > 1e-12) {
      fail(`${cls}: ${what} line-height ratio differs between the two viewports`);
    }
    if (desktop.colour.hex !== phone.colour.hex || desktop.colour.alpha !== phone.colour.alpha) {
      fail(`${cls}: ${what} colour differs between the two viewports`);
    }
  }

  // ---- font size: one authored law, four measured outcomes.
  const sizeRaw = authored('font-size');
  let supFontSizeEm = null;
  let heroWidthFraction = null;
  if (sizeRaw === null) {
    for (const [tag, p] of Object.entries(rows)) {
      if (p.fontSizePx !== rootFontSizePx) {
        fail(`${cls}: authors no font-size but measured ${p.fontSizePx}px in ${tag}, not the body ${rootFontSizePx}px`);
      }
    }
  } else if (/^var\(--text-[a-z-]+\)$/.test(sizeRaw)) {
    const name = tokenRef(sizeRaw, `${cls} font-size`, cls);
    for (const [tag, p] of Object.entries(rows)) {
      const theme = passTheme(tag);
      const token = theme.root[name];
      if (!token || !/^clamp\(/.test(token.raw)) fail(`${cls}: ${name} is not a measured clamp token in ${tag}`);
      const want = clampAt(token.raw, p.innerWidth, cls);
      if (want !== p.fontSizePx) {
        fail(
          `${cls}: ${name} resolves to ${want}px at ${tag} (${p.innerWidth}px) but the probe measured ${p.fontSizePx}px`,
        );
      }
    }
  } else if (/^clamp\(/.test(sizeRaw)) {
    for (const [tag, p] of Object.entries(rows)) {
      const want = clampAt(sizeRaw, p.innerWidth, cls);
      if (want !== p.fontSizePx) {
        fail(`${cls}: \`${sizeRaw}\` resolves to ${want}px at ${tag} but the probe measured ${p.fontSizePx}px`);
      }
    }
  } else if (/^min\(\s*var\(--text-[a-z-]+\)\s*,\s*[\d.]+cqi\s*\)$/.test(sizeRaw)) {
    const m = /^min\(\s*(var\(--text-[a-z-]+\))\s*,\s*([\d.]+)cqi\s*\)$/.exec(sizeRaw);
    const name = tokenRef(m[1], `${cls} font-size`, cls);
    heroWidthFraction = parseFloat(m[2]) / 100;
    // With no eligible container — which is a detached probe — CSS resolves `cqi`
    // against the small viewport, so the min is checkable at both measured widths.
    // The port gets the same law with the `.hero-face` box handed to it at paint time.
    for (const [tag, p] of Object.entries(rows)) {
      const theme = passTheme(tag);
      const token = theme.root[name];
      if (!token || !/^clamp\(/.test(token.raw)) fail(`${cls}: ${name} is not a measured clamp token in ${tag}`);
      const want = Math.min(clampAt(token.raw, p.innerWidth, cls), heroWidthFraction * p.innerWidth);
      if (want !== p.fontSizePx) {
        fail(`${cls}: \`${sizeRaw}\` resolves to ${want}px at ${tag} but the probe measured ${p.fontSizePx}px`);
      }
    }
  } else if (/^[\d.]+em$/.test(sizeRaw)) {
    supFontSizeEm = emOf(sizeRaw, cls, 'font-size');
    const specified = supFontSizeEm * rootFontSizePx;
    for (const [tag, p] of Object.entries(rows)) {
      if (p.fontSizePx < specified) {
        fail(`${cls}: ${tag} measured ${p.fontSizePx}px below the ${specified}px its own em authors`);
      }
      // The em law that DOES hold in the row is letter-spacing: Chrome resolves it
      // against the specified size, so the probe names the specified font size even
      // where its reported used size has been floored up. That is why the port takes
      // the ratios and resolves them against the parent numeral, not this row.
      const wantLs = emOf(authored('letter-spacing'), cls, 'letter-spacing') * specified;
      if (Math.abs(p.letterSpacingPx - wantLs) > 1e-9) {
        fail(`${cls}: ${tag} letter-spacing ${p.letterSpacingPx}px != ${wantLs}px from the authored ems`);
      }
    }
  } else {
    fail(`${cls}: unportable authored font-size \`${sizeRaw}\` (src/index.css:${rest.line})`);
  }

  // ---- line-height: an authored unitless multiplier, or the inherited one every
  // non-authoring row in the measurement resolves to (the body's own ratio).
  const lhRaw = authored('line-height');
  const heightRatio = lhRaw === null ? inheritedHeightRatio : ratioOf(lhRaw, `${cls} line-height`);
  for (const [tag, p] of Object.entries(rows)) {
    const want = heightRatio * p.fontSizePx;
    if (Math.abs(p.lineHeightPx - want) > 1e-9) {
      fail(`${cls}: ${tag} line-height ${p.lineHeightPx}px != ${heightRatio} × ${p.fontSizePx}px`);
    }
  }

  // ---- letter-spacing, for every row whose own font size is the em basis.
  const lsRaw = authored('letter-spacing');
  const letterSpacingEm = lsRaw === null ? 0 : emOf(lsRaw, cls, 'letter-spacing');
  if (supFontSizeEm === null) {
    for (const [tag, p] of Object.entries(rows)) {
      const want = letterSpacingEm * p.fontSizePx;
      if (Math.abs(p.letterSpacingPx - want) > 1e-9) {
        fail(`${cls}: ${tag} letter-spacing ${p.letterSpacingPx}px != ${letterSpacingEm}em × ${p.fontSizePx}px`);
      }
    }
  }

  // ---- family and weight, both of which a row may only inherit from `body`.
  const fontRaw = authored('font-family');
  const fontToken = fontRaw === null ? BODY_FONT_TOKEN : tokenRef(fontRaw, `${cls} font-family`, cls);
  for (const [tag, p] of Object.entries(rows)) {
    const theme = passTheme(tag);
    const token = theme.root[fontToken];
    if (!token) fail(`${cls}: ${fontToken} is not a measured token in ${tag}`);
    if (firstFamily(token.raw, `${tag} ${fontToken}`) !== p.fontFamily) {
      fail(`${cls}: ${tag} probe family ${p.fontFamily} != first family of ${fontToken} (${token.raw})`);
    }
  }
  const weightRaw = authored('font-weight');
  const fontWeight = weightRaw === null ? 400 : parseInt(weightRaw, 10);
  if (!(fontWeight % 100 === 0 && fontWeight >= 100 && fontWeight <= 900)) {
    fail(`${cls}: unportable authored font-weight \`${weightRaw}\``);
  }
  for (const [tag, p] of Object.entries(rows)) {
    if (p.fontWeight !== fontWeight) fail(`${cls}: ${tag} probe weight ${p.fontWeight} != authored ${fontWeight}`);
  }

  // ---- colour: the row's own `var(--token)`, or the body colour it inherits.
  const colourRaw = authored('color');
  const inheritsColor = colourRaw === null;
  const colourToken = colourRaw === null ? BODY_COLOUR_TOKEN : tokenRef(colourRaw, `${cls} colour`, cls);
  for (const [tag, p] of Object.entries(rows)) {
    const theme = passTheme(tag);
    const want = authoredColour(
      colourRaw === null ? `var(${BODY_COLOUR_TOKEN})` : colourRaw,
      theme,
      tag,
      `${cls} colour`,
      cls,
    );
    if (p.colour.hex !== want.srgb.hex || p.colour.alpha !== want.srgb.alpha) {
      fail(`${cls}: ${tag} probe colour ${p.colour.rgba} != ${colourToken} ${want.srgb.rgba}`);
    }
  }

  // ---- the four metrics only the authored sheet shows a port.
  const numericRaw = authored('font-variant-numeric');
  if (numericRaw !== null && numericRaw !== 'tabular-nums') {
    fail(`${cls}: font-variant-numeric \`${numericRaw}\` is not the tabular-nums the port knows`);
  }
  const wrapRaw = authored('overflow-wrap');
  if (wrapRaw !== null && wrapRaw !== 'anywhere') fail(`${cls}: overflow-wrap \`${wrapRaw}\` is not \`anywhere\``);
  const minWidthRaw = authored('min-width');
  if (minWidthRaw !== null && !/^0(px)?$/.test(minWidthRaw)) fail(`${cls}: min-width \`${minWidthRaw}\` is not zero`);
  const sup = {
    verticalAlignEm: decl.has('vertical-align') ? emOf(authored('vertical-align'), cls, 'vertical-align') : null,
    marginLeftEm: decl.has('margin-left') ? emOf(authored('margin-left'), cls, 'margin-left') : null,
  };
  if (cls === '.numeral-sup' && (sup.verticalAlignEm === null || sup.marginLeftEm === null)) {
    fail(`${cls}: the sup row has to author both its lift and its gap`);
  }
  if (cls !== '.numeral-sup' && (sup.verticalAlignEm !== null || sup.marginLeftEm !== null)) {
    fail(`${cls}: only the sup row may author vertical-align or margin-left`);
  }

  return {
    cls,
    restSrc: `src/index.css:${rest.line}`,
    sizeRaw,
    light: lp,
    dark: dp,
    fontFamily: lp.fontFamily,
    displayCss: lp.displayCss,
    fontSizeEm: supFontSizeEm,
    heroWidthFraction,
    letterSpacingEm,
    heightRatio,
    fontWeight,
    tabularNums: numericRaw !== null,
    overflowWrapAnywhere: wrapRaw !== null,
    minWidthZero: minWidthRaw !== null,
    inheritsColor,
    colourToken,
    verticalAlignEm: sup.verticalAlignEm,
    marginLeftEm: sup.marginLeftEm,
  };
});

const heroRow = numerals.find((r) => r.cls === '.numeral-hero');
const supRow = numerals.find((r) => r.cls === '.numeral-sup');
if (!heroRow.heroWidthFraction || !supRow.fontSizeEm) fail('the hero fraction and the sup ems are item 7 constants');

/** One emitted row. The metrics are the phone pass; the colour is the brightness. */
const numeralExpr = (r, passName) =>
  [
    `      cssClass: ${dartStr(r.cls)},`,
    `      authoredSrc: ${dartStr(r.restSrc)},`,
    `      displayCss: ${dartStr(r.displayCss)},`,
    `      fontFamily: ${dartStr(r.fontFamily)},`,
    `      fontSizePx: ${fmt(r[passName].fontSizePx)},`,
    `      fontWeight: ${r.fontWeight},`,
    `      heightRatio: ${fmt(r.heightRatio)},`,
    `      letterSpacingPx: ${fmt(r[passName].letterSpacingPx)},`,
    `      letterSpacingEm: ${fmt(r.letterSpacingEm)},`,
    `      tabularNums: ${r.tabularNums ? 'true' : 'false'},`,
    `      overflowWrapAnywhere: ${r.overflowWrapAnywhere ? 'true' : 'false'},`,
    `      minWidthZero: ${r.minWidthZero ? 'true' : 'false'},`,
    `      textColor: ${dartSurfaceColour(r[passName].colour)},`,
    `      inheritsColor: ${r.inheritsColor ? 'true' : 'false'},`,
    `      authoredColorToken: ${r.inheritsColor ? 'null' : dartStr(r.colourToken)},`,
  ].join('\n');

banner();
L.push(
  "import 'package:flutter/material.dart';",
  '',
  '/// One numeral/money type class of `src/index.css`, measured on a detached',
  '/// element at the phone pass and re-derived from the rule that authored it.',
  '///',
  '/// These classes carry a font size and nothing but a font size: they paint no',
  '/// fill, no border, no shadow and no padding, and every row proves it — the',
  '/// probe measured a transparent box on all four passes. `displayCss` is the',
  "/// detached <div>'s own default, not a design fact: a numeral is a `<p>`",
  '/// at its call sites and `.numeral-sup` an inline `<span>`.',
  '///',
  '/// `letterSpacingEm` is the authored `em` multiplier and `letterSpacingPx` the',
  '/// phone resolution of it, which is why they agree only at 38px or 30px: CSS',
  "/// resolves tracking against the element's used font size, so a row painted at",
  '/// another size has to re-derive it — see [AppNumeralSpec.styleAt].',
  'class AppNumeralSpec {',
  '  const AppNumeralSpec({',
  '    required this.cssClass,',
  '    required this.authoredSrc,',
  '    required this.displayCss,',
  '    required this.fontFamily,',
  '    required this.fontSizePx,',
  '    required this.fontWeight,',
  '    required this.heightRatio,',
  '    required this.letterSpacingPx,',
  '    required this.letterSpacingEm,',
  '    required this.tabularNums,',
  '    required this.overflowWrapAnywhere,',
  '    required this.minWidthZero,',
  '    required this.textColor,',
  '    required this.inheritsColor,',
  '    required this.authoredColorToken,',
  '  });',
  '',
  '  final String cssClass;',
  '',
  '  /// Where the rule that authored this row lives.',
  '  final String authoredSrc;',
  '',
  "  /// The probe element's computed `display` — `block` on a detached `<div>`, so",
  '  /// it says nothing about the call site. Carried as data, never used.',
  '  final String displayCss;',
  '',
  '  /// The first family of the measured stack. Item 10 bundled it (UI_SPEC §3.1),',
  '  /// so it is the face that renders; `app_fonts_test.dart` fails if a named family',
  '  /// ever stops resolving, because a fallback would draw this row at the wrong',
  '  /// width while looking exactly like the right design.',
  '  final String fontFamily;',
  '  final double fontSizePx;',
  '  final int fontWeight;',
  '',
  '  /// The authored unitless line-height, or the ratio `body` measured (`1.5`) for',
  '  /// the rows that author none — every one of them resolves to it, which the',
  '  /// generator proves per pass. Flutter `TextStyle.height` takes the multiplier',
  '  /// as-is, so a resized row keeps its proportion.',
  '  final double heightRatio;',
  '',
  '  /// `letterSpacing` at the phone pass, and the `em` multiplier that produced it',
  '  /// (`0` where the row authors none and the probe measured `normal`).',
  '  final double letterSpacingPx;',
  '  final double letterSpacingEm;',
  '',
  '  /// `font-variant-numeric: tabular-nums`, which Flutter answers with',
  '  /// [FontFeature.tabularFigures] — a font feature, so it does nothing in a',
  '  /// fallback and equalises the digit advances in the bundled face. That',
  '  /// difference is what `app_fonts_test.dart` measures, on the face rather than',
  '  /// on a widget, so a row that silently lost tnum would be reported there.',
  '  final bool tabularNums;',
  '',
  '  /// `overflow-wrap: anywhere`, which this Flutter SDK has no engine knob for',
  '  /// (`TextStyle` and `Text` carry neither `overflowWrap` nor `WordBreak`). The',
  '  /// flag is the authored fact; [AppNumeral] records the deviation it forces.',
  '  final bool overflowWrapAnywhere;',
  '',
  '  /// `min-width: 0` — a flex-item hint that lets a long figure shrink below its',
  "  /// content width. Flutter gives a `Text` its parent's max width already, so",
  '  /// there is nothing to port; the flag records why not.',
  '  final bool minWidthZero;',
  '',
  '  final Color textColor;',
  '',
  "  /// True when the row's colour is `body`'s, not its own — the numeral faces",
  '  /// never author a colour, so what they measured is the theme’s ink, and a call',
  '  /// site’s own `text-*` utility overrides it exactly as it does on the web.',
  '  final bool inheritsColor;',
  '  final String? authoredColorToken;',
  '',
  '  FontWeight get weight => FontWeight.values[fontWeight ~/ 100 - 1];',
  '',
  '  List<FontFeature> get fontFeatures => tabularNums',
  '      ? const <FontFeature>[FontFeature.tabularFigures()]',
  '      : const <FontFeature>[];',
  '',
  '  /// The row as the phone measured it.',
  '  TextStyle get textStyle => styleAt(fontSizePx);',
  '',
  '  /// The row at another font size — the hero’s `min()` and the sup’s `em` both',
  '  /// need this, because CSS resolves tracking against the used font size. The',
  '  /// line-height is the authored multiplier, so it travels with the size —',
  '  /// except for an inline span, which [AppNumerals.supAt] asks for without it:',
  '  /// a CSS line-height on an inline span never grows its parent’s line box,',
  '  /// while Flutter `TextStyle.height` does.',
  '  TextStyle styleAt(double sizePx, {bool includeLineHeight = true}) => TextStyle(',
  '    fontFamily: fontFamily,',
  '    color: textColor,',
  '    fontSize: sizePx,',
  '    fontWeight: weight,',
  '    height: includeLineHeight ? heightRatio : null,',
  '    letterSpacing: letterSpacingEm * sizePx,',
  '    fontFeatures: fontFeatures,',
  '  );',
  '}',
  '',
  '/// What [AppNumerals.supAt] hands back: the sup’s own style plus the two',
  '/// offsets the authored `em` values resolve to at that size.',
  'class AppNumeralSupBox {',
  '  const AppNumeralSupBox({',
  '    required this.style,',
  '    required this.liftPx,',
  '    required this.gapPx,',
  '  });',
  '',
  '  final TextStyle style;',
  '',
  '  /// `vertical-align: 0.62em`, upward — the span sits above the parent baseline.',
  '  final double liftPx;',
  '',
  '  /// `margin-left: 0.28em` of its own font size.',
  '  final double gapPx;',
  '}',
  '',
  '/// The numeral/money rows, keyed by CSS class — one map per measured brightness',
  '/// pass, with the metrics taken from that pass’s phone probe (UI_SPEC §3: the',
  '/// port uses the phone column).',
  'abstract final class AppNumerals {',
  '  /// The root font size the measurement resolved against: `body` authors no',
  '  /// font size, so its probe is the 16px every `em` and `vw` in this block',
  '  /// inherits from. A `.money` overlay with no size from its caller is this big.',
  `  static const double rootFontSizePx = ${fmt(rootFontSizePx)};`,
  '',
  '  /// `.numeral-hero` authors `font-size: min(var(--text-num), 15cqi)`',
  '  /// (' + heroRow.restSrc + ') — the fraction of its `.hero-face` container the figure',
  '  /// takes when the card is narrower than the numeral’s own size.',
  `  static const double heroWidthFraction = ${fmt(heroRow.heroWidthFraction)};`,
  '',
  '  /// `.numeral-sup` (' + supRow.restSrc + ') authors all four of its metrics in `em`.',
  '  /// Its standalone probe row is unusable as a call-site value: Chrome floors a',
  '  /// tiny used font size up to 6px while `letter-spacing` keeps resolving from',
  '  /// the specified `0.28 × 16px`, which is what the row’s measured `0.1792px`',
  '  /// says. The hero is a 38px parent, well clear of any floor, so the port',
  '  /// resolves these ratios against the numeral they sit in.',
  `  static const double supFontSizeEm = ${fmt(supRow.fontSizeEm)};`,
  `  static const double supLetterSpacingEm = ${fmt(supRow.letterSpacingEm)};`,
  `  static const double supVerticalAlignEm = ${fmt(supRow.verticalAlignEm)};`,
  `  static const double supMarginLeftEm = ${fmt(supRow.marginLeftEm)};`,
  '',
);
for (const [passName, themeTag] of [
  ['light', 'light-phone'],
  ['dark', 'dark-phone'],
]) {
  L.push(
    `  /// ${passName} pass (UI_SPEC §3/§6, \`${themeTag}\`).`,
    `  static const Map<String, AppNumeralSpec> ${passName} =`,
    '      <String, AppNumeralSpec>{',
  );
  for (const r of numerals) {
    L.push(`    ${dartStr(r.cls)}: AppNumeralSpec(`, numeralExpr(r, passName), '    ),');
  }
  L.push('  };', '');
}
L.push(
  '  /// The measured row for a class. An unknown class is a programming error,',
  '  /// not a fallback.',
  '  static AppNumeralSpec resolve(String cssClass, Brightness brightness) {',
  '    final Map<String, AppNumeralSpec> table =',
  '        brightness == Brightness.dark ? dark : light;',
  '    final AppNumeralSpec? spec = table[cssClass];',
  "    if (spec == null) throw ArgumentError('$cssClass is not a numeral class');",
  '    return spec;',
  '  }',
  '',
  '  /// The `numeral numeral-hero` stack’s font size at the width its `.hero-face`',
  "  /// container offers: `.numeral`'s own measured size, capped by",
  '  /// [heroWidthFraction] of the container. An unbounded box keeps the numeral',
  '  /// size, which is what CSS does when the query container is the viewport at',
  '  /// the phone column — the probe this was checked against.',
  '  static double heroFontSizePx(',
  '    double containerInlineSizePx,',
  '    Brightness brightness,',
  '  ) {',
  "    final double cap = resolve('.numeral', brightness).fontSizePx;",
  '    final double cqi = heroWidthFraction * containerInlineSizePx;',
  '    return cqi < cap ? cqi : cap;',
  '  }',
  '',
  '  /// The `.numeral-sup` span as the hero composes it, at the parent numeral’s',
  '  /// font size. `height` is dropped: CSS line-height on an inline span never',
  "  /// grows the parent's line box, while Flutter `TextStyle.height` does, so the",
  '  /// figure’s own height is the one that has to stand.',
  '  static AppNumeralSupBox supAt(',
  '    double parentFontSizePx,',
  '    Brightness brightness,',
  '  ) {',
  "    final AppNumeralSpec sup = resolve('.numeral-sup', brightness);",
  '    final double size = supFontSizeEm * parentFontSizePx;',
  '    return AppNumeralSupBox(',
  '      style: sup.styleAt(size, includeLineHeight: false),',
  '      liftPx: supVerticalAlignEm * size,',
  '      gapPx: supMarginLeftEm * size,',
  '    );',
  '  }',
  '}',
  '',
);
finish('app_numerals.dart');

// ================================================================ app_rows.dart
// Item 8 — the transaction row, the day header, the ledger chrome around them and
// the category chip the row leads with. Every box below is a `utilityStacks`
// row: the verbatim className list — plus, where the component writes one, the
// inline `style` it writes — mounted on the element the component really uses and
// measured against an unclassed control. A §6 probe cannot see a Tailwind
// utility, so for these families the stack row *is* the measurement, and
// `src/index.css` supplies only the authored facts a detached element never
// shows: a state rule, a `gap`, the `em` a measured tracking value came from.
//
// Two rules bind the section. Nothing here restates a number another generated
// family already owns: the day header’s type is `.eyebrow`’s label row and the
// money tracking is `.money`’s authored `em`, each re-read here and cross-checked
// against these measurements rather than copied. And a value no pass measured
// fails generation — there is no default in this file, and nothing is averaged
// across a viewport or a brightness. The two viewports are read as one column
// (UI_SPEC §3: the phone) with the desktop pass required to agree on every ported
// property; the one place they genuinely disagree — the `lg:` scroll gating of the
// dashboard list — is ported as an explicit wide/narrow pair.

const ROWS_TSX = readTsx('components', 'ui', 'TransactionRow.tsx');
const ROWS_CAT_TSX = readTsx('components', 'ui', 'CategoryChip.tsx');
const ROWS_DASH_TSX = readTsx('components', 'Dashboard.tsx');
const ROWS_RC_TSX = readTsx('components', 'ReportsCentre.tsx');
const ROWS_FILES = {
  'src/components/ui/TransactionRow.tsx': ROWS_TSX,
  'src/components/ui/CategoryChip.tsx': ROWS_CAT_TSX,
  'src/components/Dashboard.tsx': ROWS_DASH_TSX,
  'src/components/ReportsCentre.tsx': ROWS_RC_TSX,
};

/** The recorded row, with every citation it carries re-checked against the pinned
 *  source before a single number is read from it. `className` slices, inline-style
 *  lines, the authored `dims`/`glyph` tables and the token a tint names all have
 *  to still be where the record says, or the row's measurement is evidence about a
 *  source line that no longer exists. */
const rowsFile = (rel) => {
  const lines = ROWS_FILES[rel];
  if (!lines) fail(`the stack tier cites ${rel}, which app_rows.dart has no pinned source to check`);
  return lines;
};
const rowsTernaryArm = (lines, file, line, value, label) => {
  // A table row is cited by the arm it selects: `? 22 ` for a named size,
  // `: 40;` for the default arm the md size falls through to.
  const src = lines[line - 1];
  if (src === undefined) fail(`${label}: ${file}:${line} does not exist`);
  if (!src.includes(`? ${value} `) && !src.includes(`: ${value};`)) {
    fail(`${label} ${value}: recorded at ${file}:${line}, but that line reads "${src}"`);
  }
};
const rowChecked = (name) => {
  const r = usRow(name);
  const file = r.src || US.source;
  const lines = rowsFile(file);
  for (const p of r.parts) {
    if (p.cls !== undefined) tsxLine(lines, file, p.line, `className="${p.cls}"`);
    if (p.text !== undefined) tsxLine(lines, p.src || file, p.line, p.text);
    if (p.styleSrc) for (const s of p.styleSrc) tsxLine(lines, file, s.line, s.text);
    if (p.style && p.styleSrcLine) {
      for (const tok of p.style.match(/var\(--[a-z0-9-]+\)/g) || []) {
        tsxLine(lines, file, p.styleSrcLine, tok);
      }
    }
    if (p.toneVar) tsxLine(lines, file, p.toneVarLine, p.toneVar);
    if (p.dims !== undefined) rowsTernaryArm(lines, file, p.dimsLine, p.dims, `${name} dims`);
    if (p.glyph !== undefined) rowsTernaryArm(lines, file, p.glyphLine, p.glyph, `${name} glyph`);
  }
  return r;
};

const stk = (tag, name) => stackProps(passTheme(tag), name);
/** Whether a row's own measurement asked for one property. Only the rows that
 *  need an out-of-set property ask for it, so reading one back has to be
 *  conditional — and it has to be conditional on both passes agreeing that they
 *  were asked for the same thing, never on one of them. */
const stkHas = (brightness, name, field) => {
  const has = (tag) => Object.prototype.hasOwnProperty.call(stk(tag, name), field);
  const phone = has(`${brightness}-phone`);
  if (phone !== has(`${brightness}-desktop`)) {
    fail(`${name}: ${field} is an extra on ${brightness}-phone but not on ${brightness}-desktop`);
  }
  return phone;
};
/** A property the two viewports of one brightness must agree on — anything else is
 *  `stkPair`’s business, never an average. */
const stkVal = (brightness, name, field) => {
  const phone = stk(`${brightness}-phone`, name);
  const desk = stk(`${brightness}-desktop`, name);
  if (!Object.prototype.hasOwnProperty.call(phone, field)) {
    fail(`${name}: the ${brightness}-phone pass measured no ${field}`);
  }
  if (JSON.stringify(phone[field]) !== JSON.stringify(desk[field])) {
    fail(
      `${name}.${field} moves with the viewport (${brightness}-desktop ${JSON.stringify(desk[field])} vs ` +
        `${brightness}-phone ${JSON.stringify(phone[field])}); app_rows.dart ports it as a wide/narrow pair`,
    );
  }
  return phone[field];
};
const stkRaw = (brightness, name, field) => {
  const v = stkVal(brightness, name, field);
  if (typeof v === 'string') return v;
  if (v && typeof v.raw === 'string') return v.raw;
  fail(`${name}.${field} is not a plain measured value: ${JSON.stringify(v)}`);
};
const stkLen = (brightness, name, field) => lenAnyPx(stkRaw(brightness, name, field), `${name} ${field}`);
const stkNum = (brightness, name, field) => {
  const v = parseFloat(stkRaw(brightness, name, field));
  if (!Number.isFinite(v)) fail(`${name}.${field} "${v}" is not a number`);
  return v;
};
const stkCol = (brightness, name, field) => {
  const v = stkVal(brightness, name, field);
  if (!v || !v.srgb) fail(`${name}.${field} is not a measured colour: ${JSON.stringify(v)}`);
  return v.srgb;
};
/** `12px 10px` as the symmetric pair a box ports, and `0px 4px 0px 0px` as the
 *  one-sided padding of a scroll rail (the scrollbar gutter `pr-1` reserves). */
const stkPadSym = (brightness, name) => {
  const raw = stkRaw(brightness, name, 'padding');
  const parts = raw.split(/\s+/).map((s) => lenAnyPx(s, `${name} padding`));
  const [top, right = top, bottom = top, left = right] = parts;
  if (parts.length > 4 || top !== bottom || left !== right) {
    fail(`${name}: padding "${raw}" is not the symmetric v/h pair the port can carry`);
  }
  return { vertical: top, horizontal: left };
};
const stkPadOneSide = (brightness, name, side) => {
  const raw = stkRaw(brightness, name, 'padding');
  const parts = raw.split(/\s+/).map((s) => lenAnyPx(s, `${name} padding`));
  const [top, right = top, bottom = top, left = right] = parts;
  const box = { top, right, bottom, left };
  for (const k of Object.keys(box)) {
    if (k !== side && box[k] !== 0) fail(`${name}: padding "${raw}" has a ${k} inset the row does not port`);
  }
  return box[side];
};
/** The measured `:root` colour a class or an inline style names, with the proof
 *  the row painted exactly those pixels. A bare `var(--token)` that measures
 *  differently is a cascade the port cannot see, so it stops generation. */
const stkTokenColour = (brightness, name, field, token, label) => {
  const got = stkCol(brightness, name, field);
  const t = passTheme(`${brightness}-phone`).root[token];
  if (!t || !t.srgb) fail(`${name}: ${label} names ${token}, which ${brightness}-phone measured no colour for`);
  if (got.hex !== t.srgb.hex || got.alpha !== t.srgb.alpha) {
    fail(`${name} ${brightness}: ${field} measured ${got.rgba} but ${token} is ${t.srgb.rgba}`);
  }
  return got;
};
/** A tracking value as the `em` the browser resolved it from, so a row painted at
 *  another size re-derives it (the same law `AppNumeralSpec.styleAt` applies). */
const stkEm = (brightness, name, field, sizePx) => {
  const px = stkLen(brightness, name, field);
  if (px === 0) return 0;
  const em = px / sizePx;
  if (Math.abs(em * sizePx - px) > 1e-9) {
    fail(`${name}.${field} ${px}px is not a clean multiple of the measured ${sizePx}px font size`);
  }
  return em;
};
/** A slot’s tracking as the pair the port carries. `normal` is not a length, so a
 *  row that measures it ports as zero tracking — never as a guessed number. */
const stkTrack = (brightness, name, sizePx) => {
  if (stkRaw(brightness, name, 'letterSpacing') === 'normal') return { px: 0, em: 0 };
  return { px: stkLen(brightness, name, 'letterSpacing'), em: stkEm(brightness, name, 'letterSpacing', sizePx) };
};
/** A stack row’s `backdrop-filter`, as the one blur the port can carry. A
 *  filter that also saturates, or that measures `none`, stops generation: the
 *  day header’s recipe is a plain blur and nothing else. */
const stkBlurPx = (brightness, name) => {
  const raw = stkRaw(brightness, name, 'backdropFilter');
  const m = /^blur\(([\d.]+)px\)$/.exec(raw);
  if (!m) fail(`${name}: backdrop-filter "${raw}" is not the plain blur(Npx) the port draws`);
  return parseFloat(m[1]);
};
/** `scale(0.97)` from a state rule. */
const cssScale = (rule, cls) => {
  const m = /^scale\(([\d.]+)\)$/.exec(collapse(cssDecl(rule, 'transform', cls)));
  if (!m) fail(`${cls}: \`${cssDecl(rule, 'transform', cls)}\` is not a plain scale(N)`);
  return parseFloat(m[1]);
};

// ---------------------------------------------------------------- the row itself
const ROW_CLASSES = {
  box: 'txrow-box',
  title: 'txrow-title',
  meta: 'txrow-meta',
  textWrap: 'txrow-text-wrap',
  amountWrap: 'txrow-amount-wrap',
  amountIn: 'txrow-amount-in',
  amountOut: 'txrow-amount-out',
  pill: 'txrow-trailing-pill',
};
for (const [role, name] of Object.entries(ROW_CLASSES)) rowChecked(name);

// The authored side of the box: one resting rule, one hover the port drops, one
// press the row shares with every other `pressable` on the page.
const TX_REST = cssRule(/^\.tx-row \{$/, '.tx-row');
checkChipProps(
  ruleProps(TX_REST, '.tx-row'),
  ['display', 'align-items', 'gap', 'padding', 'border-radius', 'cursor', 'transition'],
  'the resting rule',
  '.tx-row',
  TX_REST.line,
);
const TX_HOVER = cssRule(/^\.tx-row:hover \{$/, '.tx-row:hover');
checkChipProps(ruleProps(TX_HOVER, '.tx-row:hover'), ['background'], 'the hover rule', '.tx-row:hover', TX_HOVER.line);
const TX_ACTIVE = cssRule(/^\.tx-row:active \{$/, '.tx-row:active');
checkChipProps(
  ruleProps(TX_ACTIVE, '.tx-row:active'),
  ['transform'],
  'the active rule',
  '.tx-row:active',
  TX_ACTIVE.line,
);
const PRESS_REST = cssRule(/^\.pressable \{$/, '.pressable');
checkChipProps(ruleProps(PRESS_REST, '.pressable'), ['transition'], 'the resting rule', '.pressable', PRESS_REST.line);
const PRESS_ACTIVE = cssRule(/^\.pressable:active \{$/, '.pressable:active');
checkChipProps(
  ruleProps(PRESS_ACTIVE, '.pressable:active'),
  ['transform'],
  'the active rule',
  '.pressable:active',
  PRESS_ACTIVE.line,
);
// Both classes are on the element and both are unlayered, so the later rule wins
// outright: the row scales to `.pressable`’s 0.97 and animates only the property
// `.pressable`’s `transition` names. Reading that from the line numbers, rather
// than assuming it, is what keeps the port honest if the sheet is ever reordered.
if (PRESS_ACTIVE.line <= TX_ACTIVE.line) {
  fail(
    `.pressable:active (src/index.css:${PRESS_ACTIVE.line}) no longer follows .tx-row:active ` +
      `(src/index.css:${TX_ACTIVE.line}); which press scale the row paints is now decided by something this ` +
      'generator does not know',
  );
}
// The same order decides the resting rules, which is what says which property
// list the row animates: `.pressable`’s, because it is the later one.
if (PRESS_REST.line <= TX_REST.line) {
  fail(
    `.pressable (src/index.css:${PRESS_REST.line}) no longer follows .tx-row (src/index.css:${TX_REST.line}); ` +
      'which transition the row runs is now decided by something this generator does not know',
  );
}
const txScale = cssScale(PRESS_ACTIVE, '.pressable:active');
const txOverriddenScale = cssScale(TX_ACTIVE, '.tx-row:active');
const txOwnMotion = controlTransition(TX_REST, '.tx-row', ['background-color', 'transform']);
const txPressMotion = controlTransition(PRESS_REST, '.pressable', ['transform']);
if (txPressMotion.ms !== txOwnMotion.ms || txPressMotion.ease.name !== txOwnMotion.ease.name) {
  fail(
    `.pressable’s clock (${txPressMotion.dur.name}/${txPressMotion.ease.name}) differs from .tx-row’s ` +
      `(${txOwnMotion.dur.name}/${txOwnMotion.ease.name}); the row would run two clocks and app_rows.dart ` +
      'ports one',
  );
}
if (!txOwnMotion.props.includes('transform')) {
  fail('.tx-row no longer names transform in its own transition, so the two rules are not the same shape');
}
const txHoverToken = tokenRef(
  collapse(cssDecl(TX_HOVER, 'background', '.tx-row:hover')),
  '.tx-row:hover background',
  '.tx-row',
);
if (txHoverToken !== '--surface-2') fail(`.tx-row:hover paints ${txHoverToken}, not the recorded --surface-2`);

/** Every source line a record cites, grouped by file: the class list, the inline
 *  style it writes, the `dims`/`glyph` arm, the token a tint names. A slot whose
 *  colour comes from an inline style is cited by both the element and the style,
 *  so a drift test can re-check the pair rather than one half of it. */
const rowsCite = (rec) => {
  const byFile = new Map();
  const cite = (file, line) => {
    if (line === undefined) return;
    const set = byFile.get(file) || [];
    if (!set.includes(line)) set.push(line);
    byFile.set(file, set);
  };
  for (const p of rec.parts || []) {
    const file = p.src || rec.src || US.source;
    for (const l of [p.line, p.styleSrcLine, p.toneVarLine, ...(p.styleSrc || []).map((s) => s.line)]) {
      cite(file, l);
    }
    // A composed class list still names the line it was composed from, so a reader
    // of the citation lands on the template rather than on nothing.
    if (p.classOf !== undefined) cite(p.classOf.src || file, p.classOf.line);
  }
  return [...byFile].map(([file, lines]) => `${file}:${lines.sort((a, b) => a - b).join(',')}`).join(' + ');
};

/** One text-bearing slot of the row, read from its stack row. `family` is the
 *  stack the slot paints in: `body` for everything that inherits, `.mono` for the
 *  label that carries the class. `colourToken` names the `:root` token the cited
 *  class or inline style selects, which the measurement has to reproduce exactly. */
const rowsSlot = (role, brightness, opts) => {
  const name = ROW_CLASSES[role];
  const rec = usRow(name);
  const cls = rec.parts
    .map((p) => p.cls)
    .filter(Boolean)
    .join(' ');
  const fontSizePx = stkLen(brightness, name, 'fontSize');
  const lineHeightPx = stkLen(brightness, name, 'lineHeight');
  const track = stkTrack(brightness, name, fontSizePx);
  // No slot here authors a line-height: each measured body's inherited
  // multiplier, which the §6 `body` probe measures from preflight. Reading it
  // back rather than typing `1.5` is what lets the port carry the multiplier —
  // the number Flutter's `TextStyle.height` wants — instead of the phone pixels.
  const bodyProbe = passTheme(`${brightness}-phone`).probes.body;
  const bodyRatio = probePx(bodyProbe, 'lineHeight', 'body') / probePx(bodyProbe, 'fontSize', 'body');
  const heightRatio = lineHeightPx / fontSizePx;
  if (Math.abs(heightRatio - bodyRatio) > 1e-9) {
    fail(
      `${name}: its line box is ${heightRatio}x its size, while the body probe measures ${bodyRatio}x — the port carries one multiplier`,
    );
  }
  const out = {
    role,
    name,
    cls,
    src: rowsCite(rec),
    displayCss: stkRaw(brightness, name, 'display'),
    alignItemsCss: stkRaw(brightness, name, 'alignItems'),
    gapPx: stkRaw(brightness, name, 'columnGap') === 'normal' ? null : stkLen(brightness, name, 'columnGap'),
    marginTopPx: stkLen(brightness, name, 'marginTop'),
    paddingVerticalPx: stkPadSym(brightness, name).vertical,
    paddingHorizontalPx: stkPadSym(brightness, name).horizontal,
    fontFamily: (() => {
      // The stack a slot paints in is not visible in the 45 measured properties,
      // so it comes from the §6 probe that authors it — `.mono` for a slot that
      // cites the class, the document body for one that inherits. There is no
      // third answer and no default: a slot that names neither stops generation.
      const probe =
        opts.family === 'mono'
          ? passTheme(`${brightness}-phone`).probes['.mono']
          : opts.family === 'body'
            ? passTheme(`${brightness}-phone`).probes.body
            : fail(`${name}: the slot asks for family ${JSON.stringify(opts.family)}, which this port does not read`);
      return firstFamily(probeRaw(probe, 'fontFamily', opts.family === 'mono' ? '.mono' : 'body'), name);
    })(),
    fontSizePx,
    fontWeight: parseInt(stkRaw(brightness, name, 'fontWeight'), 10),
    lineHeightPx,
    heightRatio,
    letterSpacingPx: track.px,
    letterSpacingEm: track.em,
    textColor: opts.colourToken
      ? stkTokenColour(brightness, name, 'color', opts.colourToken, opts.colourToken)
      : stkCol(brightness, name, 'color'),
    colourToken: opts.colourToken || null,
    truncates: opts.truncate || false,
    flexGrow: stkNum(brightness, name, 'flexGrow'),
    flexShrink: stkNum(brightness, name, 'flexShrink'),
    minWidthZero: opts.minWidthZero === true ? stkRaw(brightness, name, 'minWidth') === '0px' : null,
    textAlignCss: stkHas(brightness, name, 'textAlign') ? stkRaw(brightness, name, 'textAlign') : null,
    tabularNums: !!opts.tabular,
  };
  if (opts.gap !== undefined && out.gapPx !== opts.gap) {
    fail(`${name}: measured gap ${out.gapPx} != the recorded ${opts.gap}px`);
  }
  if (opts.alignItems !== undefined && out.alignItemsCss !== opts.alignItems) {
    fail(`${name}: measured align-items "${out.alignItemsCss}" != the recorded "${opts.alignItems}"`);
  }
  if (opts.display !== undefined && out.displayCss !== opts.display) {
    fail(`${name}: measured display "${out.displayCss}" != the recorded "${opts.display}"`);
  }
  if (opts.textAlign !== undefined && out.textAlignCss !== opts.textAlign) {
    fail(`${name}: measured text-align "${out.textAlignCss}" != the recorded "${opts.textAlign}"`);
  }
  if (opts.weight !== undefined && out.fontWeight !== opts.weight) {
    fail(`${name}: measured font-weight ${out.fontWeight} != the recorded ${opts.weight}`);
  }
  if (opts.size !== undefined && out.fontSizePx !== opts.size) {
    fail(`${name}: measured font size ${out.fontSizePx}px != the recorded ${opts.size}px`);
  }
  if (out.truncates) {
    for (const [field, want] of [
      ['whiteSpace', 'nowrap'],
      ['textOverflow', 'ellipsis'],
      ['overflowX', 'hidden'],
      ['overflowY', 'hidden'],
    ]) {
      if (stkRaw(brightness, name, field) !== want) {
        fail(`${name}: claims \`truncate\` but ${field} measured ${stkRaw(brightness, name, field)}`);
      }
    }
    if (!/\btruncate\b/.test(cls)) fail(`${name}: the trio measured, yet the cited class list has no \`truncate\``);
  } else {
    if (stkRaw(brightness, name, 'textOverflow') !== 'clip') fail(`${name}: a non-truncating slot measures ellipsis`);
    if (/\btruncate\b/.test(cls)) fail(`${name}: the cited class list says truncate, the measurement disagrees`);
  }
  if (opts.minWidthZero) {
    if (!stkHas(brightness, name, 'minWidth')) {
      fail(`${name}: \`min-w-0\` is read from the measurement, so the row has to ask for the property`);
    }
    if (stkRaw(brightness, name, 'minWidth') !== '0px') {
      fail(`${name}: \`min-w-0\` measured ${stkRaw(brightness, name, 'minWidth')}`);
    }
  }
  rowsSlotOffsets(brightness, name, cls, out);
  return out;
};

/**
 * The one spacing unit every pass measures: `--spacing` in each of the four
 * `:root` passes. Any utility written as `calc(n * --spacing)` — `space-y-*`,
 * `mt-*`, `py-*`, `px-*`, `pr-*` — is this number times its multiplier, so a
 * margin no pass measured on the element that authors it can still be derived,
 * as long as the derivation is checked against a pixel the pass really did read.
 * Four equal values or generation stops.
 */
const rowsSpacingPx = (label) => {
  const units = ['light-desktop', 'dark-desktop', 'light-phone', 'dark-phone'].map((tag) => {
    const v = passTheme(tag).root['--spacing'];
    if (v === undefined) {
      fail(`${label}: ${tag} no longer measures --spacing in :root, so there is no unit to multiply`);
    }
    return lengthPx(v.raw, `--spacing at ${tag}`);
  });
  if (new Set(units).size !== 1) {
    fail(`${label}: --spacing reads ${units.join(' / ')} across the four passes, so it is not one number`);
  }
  return units[0];
};

/**
 * A slot’s top margin and padding, cross-checked against the utilities that
 * author them. Both properties are measured on the slot itself, so unlike the
 * rail’s `space-y-*` there is a recorded pixel for each — but a pixel with no
 * class behind it is a cascade the port cannot see, and a class with no pixel
 * behind it is an override that lost. Either way generation stops.
 *
 * The multipliers come from the cited class list, the unit from `rowsSpacingPx`
 * (all four `:root` passes, one value or it refuses), and each derived pixel
 * must equal what the pass measured. The `!` prefix on `!py-0.5 !px-2` is what
 * makes the pill’s padding beat `.pill`’s own rule; `!important` moves the
 * *value* Chrome records, not the key, so it is read off the class and confirmed
 * by the measurement. A variant-gated offset is refused outright: it would have
 * to be read at the width it applies in, and this row was not.
 */
const rowsSlotOffsets = (brightness, name, cls, out) => {
  const tokens = cls.split(/\s+/).filter((c) => c !== '');
  const cited = tokens.filter((t) => /^(?:!?|(?:sm|md|lg|xl|2xl):)?(?:mt|py|px|p)-/.test(t));
  const OFFSET = /^(!?)(mt|py|px)-(\d+(?:\.\d+)?)$/;
  const wanted = { mt: null, py: null, px: null };
  for (const tok of cited) {
    const m = OFFSET.exec(tok);
    if (m === null) {
      fail(
        `${name}: "${tok}" is a variant-gated offset or a padding shorthand the per-axis port cannot ` +
          'attribute — an offset has to be a bare utility (or `!` on py/px), and a padding has to be ' +
          'written per axis for this row to carry it',
      );
    }
    if (m[1] === '!' && m[2] === 'mt') {
      fail(`${name}: "${tok}" marks a top margin important; the row family only authors !py/!px overrides`);
    }
    const px = parseFloat(m[3]) * rowsSpacingPx(`${name} offsets`);
    if (wanted[m[2]] !== null && wanted[m[2]] !== px) {
      fail(`${name}: two utilities author ${m[2]} with different pixels (${wanted[m[2]]} and ${px})`);
    }
    wanted[m[2]] = px;
  }
  const got = { mt: out.marginTopPx, py: out.paddingVerticalPx, px: out.paddingHorizontalPx };
  for (const axis of ['mt', 'py', 'px']) {
    const want = wanted[axis] === null ? 0 : wanted[axis];
    if (got[axis] !== want) {
      fail(
        `${name}: ${axis} measured ${got[axis]}px, the cited class list authors ${want}px ` +
          `(${cited.join(' ') || 'no offset utility'}) at --spacing ${rowsSpacingPx(`${name} ${axis}`)}px ` +
          '— the record and the source disagree',
      );
    }
  }
};

const rowsBox = (brightness) => {
  const name = ROW_CLASSES.box;
  const pad = stkPadSym(brightness, name);
  const authored = cssRule(/^\.tx-row \{$/, '.tx-row');
  const authoredPad = probePadding(passTheme(`${brightness}-phone`).probes['.tx-row'], '.tx-row');
  if (authoredPad.vertical !== pad.vertical || authoredPad.horizontal !== pad.horizontal) {
    fail(
      `${name}: the composed padding ${pad.vertical}/${pad.horizontal} != .tx-row’s authored ${authoredPad.vertical}/${authoredPad.horizontal}`,
    );
  }
  const radius = stkLen(brightness, name, 'borderRadius');
  const radiusToken = tokenRef(cssDecl(authored, 'border-radius', '.tx-row'), '.tx-row border-radius', '.tx-row');
  const want = lengthPx(
    passTheme(`${brightness}-phone`).root[radiusToken].raw,
    `${radiusToken} at ${brightness}-phone`,
  );
  if (want !== radius) fail(`${name}: measured radius ${radius}px != ${radiusToken} ${want}px`);
  const gap = stkLen(brightness, name, 'rowGap');
  if (gap !== stkLen(brightness, name, 'columnGap')) fail(`${name}: the row measures a different gap on each axis`);
  if (collapse(cssDecl(authored, 'gap', '.tx-row')) !== `${gap}px`) {
    fail(`${name}: .tx-row authors \`gap: ${cssDecl(authored, 'gap', '.tx-row')}\`, the row measured ${gap}px`);
  }
  const probe = passTheme(`${brightness}-phone`).probes['.tx-row'];
  for (const [field, value] of [
    ['display', stkRaw(brightness, name, 'display')],
    ['padding', stkRaw(brightness, name, 'padding')],
    ['borderRadius', stkRaw(brightness, name, 'borderRadius')],
  ]) {
    if (probeRaw(probe, field, '.tx-row') !== value) {
      fail(
        `${name}: the composed ${field} "${value}" != the .tx-row probe "${probeRaw(probe, field, '.tx-row')}" — a utility moved the box`,
      );
    }
  }
  const fill = stkCol(brightness, name, 'backgroundColor');
  if (fill.alpha !== 0)
    fail(`${name}: the row box measures an opaque fill (${fill.rgba}); only :hover is meant to paint`);
  for (const side of ['borderTopWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRightWidth']) {
    if (stkLen(brightness, name, side) !== 0)
      fail(`${name}: ${side} measures ${stkRaw(brightness, name, side)}; the row has no frame`);
  }
  if (stkRaw(brightness, name, 'boxShadow') !== 'none') fail(`${name}: the row box carries a shadow`);
  if (stkRaw(brightness, name, 'backdropFilter') !== 'none') fail(`${name}: the row box blurs what is behind it`);
  return {
    name,
    cls: usRow(name).parts[0].cls,
    src: rowsCite(usRow(name)),
    displayCss: stkRaw(brightness, name, 'display'),
    alignItemsCss: stkRaw(brightness, name, 'alignItems'),
    justifyContentCss: stkRaw(brightness, name, 'justifyContent'),
    gapPx: gap,
    paddingVerticalPx: pad.vertical,
    paddingHorizontalPx: pad.horizontal,
    radiusPx: radius,
    radiusToken,
    fillColor: fill,
    inkColor: stkTokenColour(brightness, name, 'color', '--ink', '--ink'),
    cursorCss: stkRaw(brightness, name, 'cursor'),
    flexShrinkPx: stkNum(brightness, name, 'flexShrink'),
  };
};

const rowsLight = { box: rowsBox('light') };
const rowsDark = { box: rowsBox('dark') };
for (const [brightness, bag] of [
  ['light', rowsLight],
  ['dark', rowsDark],
]) {
  const box = bag.box;
  bag.title = rowsSlot('title', brightness, {
    family: 'body',
    colourToken: '--ink',
    truncate: true,
    display: 'block',
    weight: 600,
    size: 13,
  });
  bag.meta = rowsSlot('meta', brightness, {
    family: 'body',
    colourToken: '--ink-3',
    truncate: true,
    display: 'block',
    weight: 400,
    size: 11,
  });
  bag.textWrap = rowsSlot('textWrap', brightness, { family: 'body', display: 'block', minWidthZero: true });
  bag.amountWrap = rowsSlot('amountWrap', brightness, { family: 'body', display: 'block', textAlign: 'right' });
  bag.amountIn = rowsSlot('amountIn', brightness, {
    family: 'body',
    colourToken: '--success',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    weight: 700,
    size: 13,
    tabular: true,
  });
  bag.amountOut = rowsSlot('amountOut', brightness, {
    family: 'body',
    colourToken: '--danger',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    weight: 700,
    size: 13,
    tabular: true,
  });
  bag.pill = rowsSlot('pill', brightness, {
    family: 'mono',
    colourToken: '--ink',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    weight: 600,
    size: 9,
    tabular: true,
  });
  // `.money` authors the tracking both amount arms measure, and nothing else
  // about them: the size, weight and colour come from the row.
  const moneyRest = cssRule(/^\.money \{$/, '.money');
  const moneyEm = parseFloat(collapse(cssDecl(moneyRest, 'letter-spacing', '.money')));
  for (const arm of [bag.amountIn, bag.amountOut]) {
    if (Math.abs(arm.letterSpacingEm - moneyEm) > 1e-12) {
      fail(`${arm.name}: measured tracking ${arm.letterSpacingEm}em != .money’s authored ${moneyEm}em`);
    }
    if (!/\bmoney\b/.test(arm.cls)) fail(`${arm.name}: the cited class list no longer carries .money`);
    if (!/tabular-nums/.test(collapse(cssDecl(moneyRest, 'font-variant-numeric', '.money')))) {
      fail('.money no longer authors tabular-nums, so the amount row has no reason to request tnum');
    }
  }
  // `.mono` is the pill’s family and its tnum; `.pill` is its box. The `!`
  // utilities are what separate this pill from the §6 chip family’s resting row.
  const monoRest = cssRule(/^\.mono \{$/, '.mono');
  const monoFam = firstFamily(
    passTheme(`${brightness}-phone`).root[
      tokenRef(collapse(cssDecl(monoRest, 'font-family', '.mono')), '.mono font-family', '.mono')
    ].raw,
    '.mono',
  );
  if (bag.pill.fontFamily !== monoFam)
    fail(`${bag.pill.name}: the pill label measures ${bag.pill.fontFamily}, .mono resolves to ${monoFam}`);
  const pillProbe = passTheme(`${brightness}-phone`).probes['.pill'];
  if (!pillProbe) fail(`${brightness}-phone has no .pill probe to read the trailing pill’s box against`);
  const pillRadius = stkLen(brightness, ROW_CLASSES.pill, 'borderRadius');
  const pillPad = stkPadSym(brightness, ROW_CLASSES.pill);
  const pillBorder = stkLen(brightness, ROW_CLASSES.pill, 'borderTopWidth');
  for (const [field, want, got] of [
    ['border-radius', probePx(pillProbe, 'borderRadius', '.pill'), pillRadius],
    [
      'background-color',
      probeSrgb(pillProbe, 'backgroundColor', '.pill'),
      stkCol(brightness, ROW_CLASSES.pill, 'backgroundColor'),
    ],
    [
      'border-top-color',
      probeSrgb(pillProbe, 'borderTopColor', '.pill'),
      stkCol(brightness, ROW_CLASSES.pill, 'borderTopColor'),
    ],
    ['font-weight', parseInt(probeRaw(pillProbe, 'fontWeight', '.pill'), 10), bag.pill.fontWeight],
  ]) {
    const same =
      typeof want === 'object' ? want.hex === got.hex && want.alpha === got.alpha : String(want) === String(got);
    if (!same) fail(`${bag.pill.name}: ${field} ${JSON.stringify(got)} != the §6 .pill row’s ${JSON.stringify(want)}`);
  }
  if (pillBorder !== 1) fail(`${bag.pill.name}: the trailing pill measures a ${pillBorder}px frame, .pill authors 1px`);
  const authoredPillPad = probePadding(pillProbe, '.pill');
  if (authoredPillPad.vertical === pillPad.vertical || authoredPillPad.horizontal === pillPad.horizontal) {
    fail(
      `${bag.pill.name}: the !py-0.5/!px-2 override did not move .pill’s own ${authoredPillPad.vertical}/${authoredPillPad.horizontal} padding`,
    );
  }
  if (!/!py-0\.5/.test(bag.pill.cls) || !/!px-2/.test(bag.pill.cls)) {
    fail(`${bag.pill.name}: the padding override is no longer cited in "${bag.pill.cls}"`);
  }
  if (bag.pill.truncates) fail(`${bag.pill.name}: the type pill truncates; the §6 pill does not`);
  // The `hidden`/`sm:inline-flex` pair on the pill is inert, because `.pill`
  // authors an unlayered `display` that beats the layered utility at any
  // width. Both passes measure it painted, which is the port’s fact.
  const inert = usAuthored('pill-hidden-utility-is-inert');
  const inertDisplay = (tag) => stk(tag, ROW_CLASSES.pill).display;
  for (const tag of ['light-desktop', 'dark-desktop', 'light-phone', 'dark-phone']) {
    if (inertDisplay(tag) !== 'inline-flex') {
      fail(
        `${ROW_CLASSES.pill}: ${tag} measures display "${inertDisplay(tag)}"; the recorded inert-\`hidden\` finding is now wrong`,
      );
    }
  }
  tsxLine(CSS_LINES, 'src/index.css', inert.parts.find((p) => p.src === 'src/index.css').line, 'display: inline-flex;');
  if (!/hidden sm:inline-flex/.test(bag.pill.cls)) {
    fail(`${bag.pill.name}: the class list no longer carries the hidden/sm pair the finding is about`);
  }
}

// The arrow the amount span leads with, and the two ways its callers feed the row.
const arrowRec = usAuthored('txrow-arrow-sizes');
const arrowLine = arrowRec.parts[0];
tsxLine(ROWS_TSX, 'src/components/ui/TransactionRow.tsx', arrowLine.line, arrowLine.text);
const arrowOf = (component) => {
  const m = new RegExp(`<${component} size=\\{(\\d+)\\} />`).exec(arrowLine.text);
  if (!m) fail(`txrow-arrow-sizes no longer reads as a ${component} with a numeric size: "${arrowLine.text}"`);
  return parseInt(m[1], 10);
};
const rowsArrows = {
  inName: 'ArrowDownLeft',
  outName: 'ArrowUpRight',
  inPx: arrowOf('ArrowDownLeft'),
  outPx: arrowOf('ArrowUpRight'),
};
if (rowsArrows.inPx !== rowsArrows.outPx) fail('the two direction arrows are now different sizes');

// The meta line, the signed amount and the two `isIncome` predicates: recorded
// because a row cannot decide them, cited because the widget has to accept the
// string and the flag from its caller rather than compute either.
for (const name of [
  'txrow-meta-composition',
  'txrow-amount-signed-vs-absolute',
  'txrow-isincome-predicates-disagree',
]) {
  for (const p of usAuthored(name).parts)
    tsxLine(
      rowsFile(p.src || 'src/components/ui/TransactionRow.tsx'),
      p.src || 'src/components/ui/TransactionRow.tsx',
      p.line,
      p.text,
    );
}
const rowsMeta = usAuthored('txrow-meta-composition').parts[0];
tsxLine(ROWS_TSX, 'src/components/ui/TransactionRow.tsx', rowsMeta.line, rowsMeta.text);

// ---------------------------------------------------------------- the day header
rowChecked('day-head-label');
const DAY_REST = cssRule(/^\.day-head \{$/, '.day-head');
checkChipProps(
  ruleProps(DAY_REST, '.day-head'),
  ['position', 'top', 'z-index', 'background', 'backdrop-filter', '-webkit-backdrop-filter', 'padding'],
  'the resting rule',
  '.day-head',
  DAY_REST.line,
);
const eyebrowRest = cssRule(/^\.eyebrow \{$/, '.eyebrow');
checkChipProps(
  ruleProps(eyebrowRest, '.eyebrow'),
  ['font-size', 'font-weight', 'letter-spacing', 'text-transform', 'color'],
  'the resting rule',
  '.eyebrow',
  eyebrowRest.line,
);
const rowsDayHead = (brightness) => {
  const name = 'day-head-label';
  const tag = `${brightness}-phone`;
  const pad = stkPadSym(brightness, name);
  const authoredPad = probePadding(passTheme(tag).probes['.day-head'], '.day-head');
  if (authoredPad.vertical !== pad.vertical || authoredPad.horizontal !== pad.horizontal) {
    fail(
      `${name}: measured padding ${pad.vertical}/${pad.horizontal} != .day-head’s authored ${authoredPad.vertical}/${authoredPad.horizontal}`,
    );
  }
  const blur = stkBlurPx(brightness, name);
  const authoredBlur = new RegExp('^blur\\(([\\d.]+)px\\)$').exec(
    collapse(cssDecl(DAY_REST, 'backdrop-filter', '.day-head')),
  );
  if (!authoredBlur || parseFloat(authoredBlur[1]) !== blur) {
    fail(
      `${name}: .day-head authors \`backdrop-filter: ${cssDecl(DAY_REST, 'backdrop-filter', '.day-head')}\`, the row measured blur(${blur}px)`,
    );
  }
  // `color-mix(in srgb, var(--bg) 78%, transparent)` — the measurement has to be
  // the named token at exactly the authored percentage, in both brightnesses.
  const mix = /^color-mix\(in srgb, var\(--([a-z0-9-]+)\) (\d+)%, transparent\)$/.exec(
    collapse(cssDecl(DAY_REST, 'background', '.day-head')),
  );
  if (!mix)
    fail(
      `${name}: .day-head background is not the recorded color-mix recipe: "${cssDecl(DAY_REST, 'background', '.day-head')}"`,
    );
  const token = `--${mix[1]}`;
  const percent = parseFloat(mix[2]);
  const bgToken = passTheme(tag).root[token];
  if (!bgToken || !bgToken.srgb) fail(`${name}: ${token} is not a measured colour in ${tag}`);
  const got = stkCol(brightness, name, 'backgroundColor');
  if (got.hex !== bgToken.srgb.hex) {
    fail(
      `${name}: the header painted ${got.rgba}, ${token} is ${bgToken.srgb.rgba} — the mix moved more than the alpha`,
    );
  }
  if (Math.abs(got.alpha - percent / 100) > 1e-9) {
    fail(`${name}: the header painted alpha ${got.alpha}, ${token} at ${percent}% is ${percent / 100}`);
  }
  // The header’s type is `.eyebrow`’s, and the `!text-[10px]` beside it is
  // redundant: it re-states the class’s own font size.
  const label = passTheme(tag).probes['.eyebrow'];
  const eyebrow = {
    fontSizePx: probePx(label, 'fontSize', '.eyebrow'),
    fontWeight: parseInt(probeRaw(label, 'fontWeight', '.eyebrow'), 10),
    lineHeightPx: probePx(label, 'lineHeight', '.eyebrow'),
    letterSpacingPx: probePx(label, 'letterSpacing', '.eyebrow'),
    colour: probeSrgb(label, 'color', '.eyebrow'),
  };
  const measured = {
    fontSizePx: stkLen(brightness, name, 'fontSize'),
    fontWeight: parseInt(stkRaw(brightness, name, 'fontWeight'), 10),
    lineHeightPx: stkLen(brightness, name, 'lineHeight'),
    letterSpacingPx: stkLen(brightness, name, 'letterSpacing'),
    colour: stkCol(brightness, name, 'color'),
  };
  for (const k of Object.keys(measured)) {
    const a = measured[k],
      b = eyebrow[k];
    const same = typeof a === 'object' ? a.hex === b.hex && a.alpha === b.alpha : a === b;
    if (!same) fail(`${name}: ${k} measured ${JSON.stringify(a)} but the .eyebrow probe reads ${JSON.stringify(b)}`);
  }
  const authoredSize = lengthPx(cssDecl(eyebrowRest, 'font-size', '.eyebrow'), '.eyebrow font-size');
  if (authoredSize !== measured.fontSizePx) {
    fail(`${name}: !text-[10px] no longer matches .eyebrow’s authored ${authoredSize}px`);
  }
  // `.eyebrow` authors no line-height, so the header sits on `body`'s inherited
  // multiplier — read back from the same probe, never typed.
  const dayBody = passTheme(tag).probes.body;
  const dayBodyRatio = probePx(dayBody, 'lineHeight', 'body') / probePx(dayBody, 'fontSize', 'body');
  if (Math.abs(measured.lineHeightPx / measured.fontSizePx - dayBodyRatio) > 1e-9) {
    fail(
      `${name}: the header's line box is ${measured.lineHeightPx / measured.fontSizePx}× its size, \`body\` measures ${dayBodyRatio}×`,
    );
  }
  const authoredTracking = parseFloat(collapse(cssDecl(eyebrowRest, 'letter-spacing', '.eyebrow')));
  if (Math.abs((measured.letterSpacingPx / measured.fontSizePx - authoredTracking) / authoredTracking) > 1e-9) {
    fail(
      `${name}: tracking ${measured.letterSpacingPx}px is not .eyebrow’s ${authoredTracking}em of ${measured.fontSizePx}px`,
    );
  }
  const uppercase = collapse(cssDecl(eyebrowRest, 'text-transform', '.eyebrow'));
  if (uppercase !== 'uppercase')
    fail(`${name}: .eyebrow authors text-transform ${uppercase}; the port has no rule for it`);
  if (stkRaw(brightness, name, 'textTransform') !== 'uppercase') {
    fail(`${name}: the composed header did not measure uppercase`);
  }
  if (stkRaw(brightness, name, 'position') !== 'sticky') fail(`${name}: the header is no longer sticky`);
  if (stkLen(brightness, name, 'top') !== 0) fail(`${name}: the header sticks to ${stkRaw(brightness, name, 'top')}`);
  if (stkRaw(brightness, name, 'zIndex') !== cssDecl(DAY_REST, 'z-index', '.day-head')) {
    fail(
      `${name}: z-index measured ${stkRaw(brightness, name, 'zIndex')}, .day-head authors ${cssDecl(DAY_REST, 'z-index', '.day-head')}`,
    );
  }
  return {
    name,
    cls: usRow(name).parts[0].cls,
    src: rowsCite(usRow(name)),
    displayCss: stkRaw(brightness, name, 'display'),
    zIndexCss: stkRaw(brightness, name, 'zIndex'),
    paddingVerticalPx: pad.vertical,
    paddingHorizontalPx: pad.horizontal,
    blurPx: blur,
    fillColor: got,
    fillToken: token,
    fillMixPercent: percent,
    labelCssClass: '.eyebrow',
    labelAuthoredSrc: `src/index.css:${eyebrowRest.line}`,
    uppercase: true,
    textColor: measured.colour,
    fontSizePx: measured.fontSizePx,
    fontWeight: measured.fontWeight,
    lineHeightPx: measured.lineHeightPx,
    heightRatio: measured.lineHeightPx / measured.fontSizePx,
    letterSpacingPx: measured.letterSpacingPx,
    letterSpacingEm: authoredTracking,
    redundantSizeOverride: true,
  };
};

// ---------------------------------------------------------------- the ledger
for (const n of [
  'ledger-scroll',
  'ledger-divides',
  'ledger-row-last',
  'ledger-row-middle',
  'ledger-empty',
  'ledger-list-scroll',
  'ledger-empty-rc',
  'ledger-empty-rc-line',
]) {
  rowChecked(n);
}
// `divide-y` paints its children and the child selector takes the line back on
// the last one, so the divider is a pair of recipes measured on two siblings.
const dividesRec = usRow('ledger-divides');
for (const n of ['ledger-row-last', 'ledger-row-middle']) {
  if (usRow(n).wrap !== dividesRec.parts[0].cls) {
    fail(`${n}: the recorded parent stack "${usRow(n).wrap}" is no longer the cited "${dividesRec.parts[0].cls}"`);
  }
  tsxLine(
    ROWS_DASH_TSX,
    'src/components/Dashboard.tsx',
    dividesRec.parts[0].line,
    `className="${dividesRec.parts[0].cls}"`,
  );
  tsxLine(ROWS_DASH_TSX, 'src/components/Dashboard.tsx', usRow(n).parts[0].line, `[&:last-child]:border-b-0`);
}
if (JSON.stringify(passTheme('light-desktop').stacks['ledger-row-last'].changed) !== '[]') {
  fail(
    `ledger-row-last moves ${JSON.stringify(passTheme('light-desktop').stacks['ledger-row-last'].changed)}; ` +
      'the last child is meant to lose its divider',
  );
}
const rowsDivider = (brightness) => {
  if (stkLen(brightness, 'ledger-row-last', 'borderBottomWidth') !== 0) {
    fail('the last divided child measures a bottom border; `border-b-0` no longer wins');
  }
  if (stkHas(brightness, 'ledger-row-middle', 'borderBottomStyle')) {
    if (stkRaw(brightness, 'ledger-row-middle', 'borderBottomStyle') !== 'solid') {
      fail(
        `the divider measures ${stkRaw(brightness, 'ledger-row-middle', 'borderBottomStyle')}, ` +
          'not the solid hairline the port draws',
      );
    }
  }
  const width = stkLen(brightness, 'ledger-row-middle', 'borderBottomWidth');
  if (width !== 1) fail(`ledger-row-middle: the divider measures ${width}px, not the 1px ` + '`divide-y` authors');
  const colour = stkTokenColour(brightness, 'ledger-row-middle', 'borderBottomColor', '--line', '--line');
  if (
    stkCol(brightness, 'ledger-divides', 'borderBottomColor').hex !== stkCol(brightness, 'ledger-divides', 'color').hex
  ) {
    fail(
      'ledger-divides: the parent’s own border is no longer currentColor, so the recipe row is telling a different story',
    );
  }
  return { widthPx: width, colour, token: '--line' };
};
/** A scroll rail the two viewports read differently: `lg:` gating, or none. */
const rowsScroll = (name) => {
  const read = (tag) => ({
    maxHeight: stk(tag, name).maxHeight,
    overflowX: stk(tag, name).overflowX,
    overflowY: stk(tag, name).overflowY,
    padding: stk(tag, name).padding,
  });
  const wide = read('light-desktop'),
    narrow = read('light-phone');
  for (const [tag, want] of [
    ['dark-desktop', wide],
    ['dark-phone', narrow],
  ]) {
    if (JSON.stringify(read(tag)) !== JSON.stringify(want)) {
      fail(
        `${name}: ${tag} reads ${JSON.stringify(read(tag))}, which is not the ${JSON.stringify(want)} the same viewport read in light`,
      );
    }
  }
  const side = (v) => (v === '0px' ? 0 : stkPadOneSideOf(v, name));
  return {
    name,
    src: rowsCite(usRow(name)),
    cls: usRow(name).parts[0].cls,
    wideMaxHeightPx: wide.maxHeight === 'none' ? null : lenAnyPx(wide.maxHeight, `${name} wide max-height`),
    narrowMaxHeightPx: narrow.maxHeight === 'none' ? null : lenAnyPx(narrow.maxHeight, `${name} narrow max-height`),
    wideOverflowYCss: wide.overflowY,
    narrowOverflowYCss: narrow.overflowY,
    wideOverflowXCss: wide.overflowX,
    narrowOverflowXCss: narrow.overflowX,
    widePaddingRightPx: side(wide.padding),
    narrowPaddingRightPx: side(narrow.padding),
  };
};
const stkPadOneSideOf = (raw, name) => {
  const parts = raw.split(/\s+/).map((s) => lenAnyPx(s, `${name} padding`));
  const [top, right = top, bottom = top, left = right] = parts;
  for (const [k, v] of Object.entries({ top, bottom, left })) {
    if (v !== 0) fail(`${name}: padding "${raw}" has a ${k} inset the rail does not port`);
  }
  return right;
};
const rowsLedgerScroll = rowsScroll('ledger-scroll');
if (rowsLedgerScroll.wideMaxHeightPx === null || rowsLedgerScroll.narrowMaxHeightPx !== null) {
  fail(
    `ledger-scroll is recorded as the ` +
      '`lg:`-gated rail (544px wide, ungated narrow); it now reads ' +
      `${rowsLedgerScroll.wideMaxHeightPx}/${rowsLedgerScroll.narrowMaxHeightPx}`,
  );
}
const authoredMax = /^lg:max-h-\[([\d.]+)rem\]$/.exec(
  rowsLedgerScroll.cls.split(/\s+/).find((c) => /^lg:max-h-\[/.test(c)) || '',
);
if (!authoredMax) fail(`ledger-scroll no longer cites an lg:max-h-[Nrem]: "${rowsLedgerScroll.cls}"`);
if (parseFloat(authoredMax[1]) * 16 !== rowsLedgerScroll.wideMaxHeightPx) {
  fail(
    `ledger-scroll: lg:max-h-[${authoredMax[1]}rem] is ${parseFloat(authoredMax[1]) * 16}px, ` +
      `the pass measured ${rowsLedgerScroll.wideMaxHeightPx}px`,
  );
}
const rowsRcScroll = rowsScroll('ledger-list-scroll');
if (rowsRcScroll.wideMaxHeightPx !== rowsRcScroll.narrowMaxHeightPx || rowsRcScroll.wideMaxHeightPx === null) {
  fail(`ledger-list-scroll is recorded as ungated (${rowsRcScroll.wideMaxHeightPx}px) at both viewports`);
}

/**
 * `space-y-N` written on a rail. Tailwind authors it as a top margin on every child
 * after the first, so it is a property of the rail’s *children* — and the pass measures
 * the element the class list sits on, which reads `marginTop: 0px` and no `gap`. No
 * recorded pixel carries it. It is therefore derived the way `lg:max-h-[34rem]` above
 * is derived: the multiplier comes from the class the component writes, the unit comes
 * from `--spacing`, which all four passes measure in `:root`, and the arithmetic is
 * checked against a second utility on that same element that the pass really did
 * measure in pixels — the `pr-*` scrollbar gutter. Two members of one scale, one of
 * them confirmed by the engine: if the unit stopped meaning what this multiplies, the
 * gutter check fails and generation stops rather than emitting a spacing nobody read.
 */
const rowsRailRowMarginPx = (rail) => {
  const tokens = rail.cls.split(/\s+/);
  const spaced = tokens.find((c) => /space-y-/.test(c));
  if (spaced === undefined) return null;
  if (/^(!)?(sm|md|lg|xl|2xl):/.test(spaced)) {
    fail(
      `${rail.name}: "${spaced}" is variant-gated, and a gated child margin needs a pass that measured the child, ` +
        'which this rail row does not',
    );
  }
  const sm = /^space-y-(\d+(?:\.\d+)?)$/.exec(spaced);
  if (sm === null) {
    fail(`${rail.name}: "${spaced}" is not the bare-number form this port knows how to multiply`);
  }
  const spacing = rowsSpacingPx(rail.name);

  const gutterTok = tokens.find((c) => /(?:^|:)pr-\d+(?:\.\d+)?$/.test(c));
  if (gutterTok === undefined) {
    fail(
      `${rail.name}: "${spaced}" has no pr-* utility beside it on the same element, so nothing in the record ` +
        'measures the spacing unit and the derivation below would be arithmetic on an unchecked assumption',
    );
  }
  const gm = /^(?:(sm|md|lg|xl|2xl):)?pr-([\d.]+)$/.exec(gutterTok);
  const gutterPx = parseFloat(gm[2]) * spacing;
  const wantWide = gutterPx;
  // A `lg:`-gated gutter is the wide pass’s only; an ungated one is both.
  const wantNarrow = gm[1] === undefined ? gutterPx : 0;
  if (rail.widePaddingRightPx !== wantWide || rail.narrowPaddingRightPx !== wantNarrow) {
    fail(
      `${rail.name}: "${gutterTok}" is ${gm[2]} × --spacing ${spacing}px = ${gutterPx}px, but the rail’s own ` +
        `padding measured ${rail.widePaddingRightPx}/${rail.narrowPaddingRightPx}px wide/narrow — the scale unit ` +
        `no longer means what "${spaced}" would multiply`,
    );
  }
  return parseFloat(sm[1]) * spacing;
};
rowsLedgerScroll.rowMarginTopPx = rowsRailRowMarginPx(rowsLedgerScroll);
rowsRcScroll.rowMarginTopPx = rowsRailRowMarginPx(rowsRcScroll);

// The two empty states: the dashboard’s dashed box, and the Reports Centre’s
// flex column whose `empty` class is applied but declared nowhere.
const rowsEmpty = (brightness) => {
  const pad = stkPadSym(brightness, 'ledger-empty');
  if (pad.horizontal !== 0)
    fail(
      `ledger-empty: padding "${stkRaw(brightness, 'ledger-empty', 'padding')}" is not the vertical pair the port draws`,
    );
  const radius = stkLen(brightness, 'ledger-empty', 'borderRadius');
  const radiusToken = 'var(--r-sm)';
  const want = lengthPx(passTheme(`${brightness}-phone`).root['--r-sm'].raw, `--r-sm at ${brightness}-phone`);
  if (want !== radius) fail(`ledger-empty: measured radius ${radius}px != --r-sm ${want}px`);
  if (!/rounded-\[var\(--r-sm\)\]/.test(usRow('ledger-empty').parts[0].cls)) {
    fail(`ledger-empty: the cited class no longer rounds with ${radiusToken}`);
  }
  for (const side of ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth']) {
    if (stkLen(brightness, 'ledger-empty', side) !== 1)
      fail(`ledger-empty: ${side} measures ${stkRaw(brightness, 'ledger-empty', side)}, not 1px`);
  }
  if (stkRaw(brightness, 'ledger-empty', 'borderTopStyle') !== 'dashed')
    fail('ledger-empty: the frame is no longer dashed');
  return {
    radiusPx: radius,
    borderWidthPx: 1,
    borderColor: stkTokenColour(brightness, 'ledger-empty', 'borderTopColor', '--line', '--line'),
    fillColor: stkTokenColour(brightness, 'ledger-empty', 'backgroundColor', '--surface-2', '--surface-2'),
    paddingVerticalPx: pad.vertical,
    textAlignCss: stkRaw(brightness, 'ledger-empty', 'textAlign'),
  };
};
const rowsEmptyRc = (brightness) => {
  if (stkCol(brightness, 'ledger-empty-rc', 'backgroundColor').alpha !== 0) {
    fail('ledger-empty-rc paints a fill; the `empty` class is no longer declared nowhere, so the record is stale');
  }
  if (stkRaw(brightness, 'ledger-empty-rc', 'borderTopWidth') !== '0px') fail('ledger-empty-rc grew a frame');
  const pad = stkPadSym(brightness, 'ledger-empty-rc');
  if (pad.horizontal !== 0)
    fail(`ledger-empty-rc: padding "${stkRaw(brightness, 'ledger-empty-rc', 'padding')}" is not vertical`);
  const gap = stkLen(brightness, 'ledger-empty-rc', 'rowGap');
  if (gap !== stkLen(brightness, 'ledger-empty-rc', 'columnGap'))
    fail('ledger-empty-rc measures a different gap on each axis');
  if (!/\bempty\b/.test(usRow('ledger-empty-rc').parts[0].cls))
    fail('ledger-empty-rc no longer cites the undeclared `empty` class');
  const line = rowsSlotLike('ledger-empty-rc-line', brightness);
  return { gapPx: gap, paddingVerticalPx: pad.vertical, line };
};
/** The Reports Centre empty line — the same slot reading, off a row that is not
 *  part of the transaction row. */
const rowsSlotLike = (name, brightness) => {
  const cls = usRow(name)
    .parts.map((p) => p.cls)
    .filter(Boolean)
    .join(' ');
  const fontSizePx = stkLen(brightness, name, 'fontSize');
  const lineHeightPx = stkLen(brightness, name, 'lineHeight');
  const bodyProbe = passTheme(`${brightness}-phone`).probes.body;
  const bodyRatio = probePx(bodyProbe, 'lineHeight', 'body') / probePx(bodyProbe, 'fontSize', 'body');
  if (Math.abs(lineHeightPx / fontSizePx - bodyRatio) > 1e-9) {
    fail(
      `${name}: its line box is ${lineHeightPx / fontSizePx}x its size, while the body probe measures ${bodyRatio}x`,
    );
  }
  // The slot claims `.mono`, so its tabular figures come from that rule and not
  // from a widget choosing them.
  const monoRule = cssRule(/^\.mono \{$/, '.mono');
  if (!/tabular-nums/.test(collapse(cssDecl(monoRule, 'font-variant-numeric', '.mono')))) {
    fail(
      `${name}: the slot cites `.mono` for tabular figures, and src/index.css:${monoRule.line} no longer authors them`,
    );
  }
  const slot = {
    name,
    cls,
    src: rowsCite(usRow(name)),
    displayCss: stkRaw(brightness, name, 'display'),
    alignItemsCss: stkRaw(brightness, name, 'alignItems'),
    gapPx: stkRaw(brightness, name, 'columnGap') === 'normal' ? null : stkLen(brightness, name, 'columnGap'),
    marginTopPx: stkLen(brightness, name, 'marginTop'),
    paddingVerticalPx: stkPadSym(brightness, name).vertical,
    paddingHorizontalPx: stkPadSym(brightness, name).horizontal,
    fontFamily: firstFamily(
      probeRaw(passTheme(`${brightness}-phone`).probes['.mono'], 'fontFamily', '.mono'),
      `${name} .mono`,
    ),
    fontSizePx,
    fontWeight: parseInt(stkRaw(brightness, name, 'fontWeight'), 10),
    lineHeightPx,
    heightRatio: lineHeightPx / fontSizePx,
    letterSpacingPx:
      stkRaw(brightness, name, 'letterSpacing') === 'normal' ? 0 : stkLen(brightness, name, 'letterSpacing'),
    letterSpacingEm: 0,
    textColor: stkTokenColour(brightness, name, 'color', '--ink', '--ink'),
    colourToken: '--ink',
    truncates: false,
    flexGrow: stkNum(brightness, name, 'flexGrow'),
    flexShrink: stkNum(brightness, name, 'flexShrink'),
    minWidthZero: false,
    textAlignCss: stkHas(brightness, name, 'textAlign') ? stkRaw(brightness, name, 'textAlign') : null,
    tabularNums: true,
  };
  rowsSlotOffsets(brightness, name, cls, slot);
  return slot;
};
if (!/\bmono\b/.test(usRow('ledger-empty-rc-line').parts[0].cls)) {
  fail('ledger-empty-rc-line no longer cites `.mono`, so its family and tnum have no source');
}

// ---------------------------------------------------------------- the category chip
const CAT_SIZES = ['xs', 'sm', 'md', 'lg'];
const catRows = {};
for (const s of CAT_SIZES) catRows[s === 'md' ? 'md' : s] = rowChecked(`cat-chip-${s === 'md' ? 'md-lavender' : s}`);
const catTones = {};
for (const t of ['pink', 'mint', 'yellow', 'lavender', 'blue', 'ink']) catTones[t] = rowChecked(`cat-chip-md-${t}`);

/** `const dims = size === 'xs' ? 22 : …` — the two tables the chip’s inline style
 *  and its glyph are built from, parsed out of the pinned source rather than
 *  retyped, so a component edit that moves a number moves the port too. */
const catTernary = (file, line, varName, label) => {
  const text = file[line - 1];
  if (!text || !text.includes(`const ${varName} =`)) fail(`${label}: line ${line} is not the ${varName} table`);
  const arms = {};
  for (const m of text.matchAll(/size === '([a-z]+)' \? ([\d.]+)/g)) arms[m[1]] = parseFloat(m[2]);
  const tail = /: ([\d.]+);/.exec(text);
  if (!tail) fail(`${label}: the ${varName} ternary has no default arm`);
  return { arms, fallback: parseFloat(tail[1]) };
};
const catDimsRec = usAuthored('cat-chip-icon-and-size-tables');
const dimsLine = catDimsRec.parts.find((p) => p.text.startsWith('const dims ='));
const glyphLine = catDimsRec.parts.find((p) => p.text.startsWith('const glyph ='));
tsxLine(ROWS_CAT_TSX, 'src/components/ui/CategoryChip.tsx', dimsLine.line, dimsLine.text);
tsxLine(ROWS_CAT_TSX, 'src/components/ui/CategoryChip.tsx', glyphLine.line, glyphLine.text);
const catDims = catTernary(ROWS_CAT_TSX, dimsLine.line, 'dims', 'the chip size table');
const catGlyphs = catTernary(ROWS_CAT_TSX, glyphLine.line, 'glyph', 'the chip glyph table');
if (catDims.fallback !== 40 || catGlyphs.fallback !== 17) {
  fail(`the chip's default arm is no longer the md row (dims ${catDims.fallback}, glyph ${catGlyphs.fallback})`);
}
const catSizeFor = (s) => (s === 'md' ? catDims.fallback : catDims.arms[s]);
const catGlyphFor = (s) => (s === 'md' ? catGlyphs.fallback : catGlyphs.arms[s]);
for (const s of CAT_SIZES) {
  if (catDims.arms[s] === undefined && s !== 'md') fail(`the dims table no longer names ${s}`);
}

// The tone names, the tint each one selects, and the hash that picks a tint.
const catUnionLine = ROWS_CAT_TSX.findIndex((l) => /^export type ChipTone = /.test(l));
if (catUnionLine < 0) fail('CategoryChip.tsx no longer declares `export type ChipTone`');
tsxLine(ROWS_CAT_TSX, 'src/components/ui/CategoryChip.tsx', catUnionLine + 1, ROWS_CAT_TSX[catUnionLine]);
const catToneNames = (ROWS_CAT_TSX[catUnionLine].match(/'([a-z]+)'/g) || []).map((s) => s.replace(/'/g, ''));
const toneBgStart = ROWS_CAT_TSX.findIndex((l) => /^const TONE_BG: Record<ChipTone, string> = \{$/.test(l));
if (toneBgStart < 0) fail('CategoryChip.tsx no longer declares `const TONE_BG: Record<ChipTone, string>`');
const catToneBg = {};
for (let i = toneBgStart + 1; i < ROWS_CAT_TSX.length && !/^\};/.test(ROWS_CAT_TSX[i]); i++) {
  const m = /^  ([a-z]+): '(var\(--[a-z0-9-]+\))',$/.exec(ROWS_CAT_TSX[i]);
  if (m) catToneBg[m[1]] = { token: m[2], line: i + 1 };
}
if (Object.keys(catToneBg).sort().join() !== [...catToneNames].sort().join()) {
  fail(
    `TONE_BG names ${Object.keys(catToneBg).sort().join()} but the ChipTone union says ${[...catToneNames].sort().join()}`,
  );
}
const cycleLine = ROWS_CAT_TSX.findIndex((l) => /^const TONE_CYCLE: ChipTone\[\] = \[/.test(l));
if (cycleLine < 0) fail('CategoryChip.tsx no longer declares `const TONE_CYCLE: ChipTone[]`');
const catToneCycle = (ROWS_CAT_TSX[cycleLine].match(/'([a-z]+)'/g) || []).map((s) => s.replace(/'/g, ''));
if (catToneCycle.some((t) => !catToneNames.includes(t))) fail('TONE_CYCLE names a tone the union does not have');
const hashLines = catDimsRec ? usAuthored('cat-chip-tone-choice') : null;
for (const p of hashLines.parts) tsxLine(ROWS_CAT_TSX, 'src/components/ui/CategoryChip.tsx', p.line, p.text);
const hashBody = ROWS_CAT_TSX.slice(hashLines.parts[1].line, hashLines.parts[4].line).join('\n');
const hashMul = /h \* (\d+) \+ s\.charCodeAt\(i\)/.exec(hashBody);
const hashShift = / >>> (\d+);/.exec(hashBody);
if (!hashMul || !hashShift) fail('hashString is no longer `h = (h * M + s.charCodeAt(i)) >>> S`');
if (hashShift[1] !== '0') fail(`hashString now shifts by ${hashShift[1]}, which app_rows.dart has no mask for`);
const jsToneFor = (category) => {
  const s = category.toLowerCase().trim();
  let h = 0;
  for (let i = 0; i < s.length; i++)
    h = (h * parseInt(hashMul[1], 10) + s.charCodeAt(i)) >>> parseInt(hashShift[1], 10);
  return catToneCycle[h % catToneCycle.length];
};

// Category → glyph. The names travel through the icon map item 3 built, so the
// port can be given the same Lucide symbol the web paints once the icon
// dependency lands; until then the widget draws the box and the caller hands it
// the glyph, exactly as `AppIconButton` does.
const ICON_MAP = fs
  .readFileSync(path.join(ROOT, 'parity', 'icon-map.tsv'), 'utf8')
  .split(/\r?\n/)
  .filter((l) => l.trim())
  .reduce((acc, line) => {
    const [web, slug, dart] = line.split('\t');
    if (web !== 'web') acc[web] = { slug, dart };
    return acc;
  }, {});
const iconDeclStart = ROWS_CAT_TSX.findIndex((l) => /^const CATEGORY_ICONS: Record<string, LucideIcon> = \{$/.test(l));
if (iconDeclStart < 0) fail('CategoryChip.tsx no longer declares `const CATEGORY_ICONS`');
const catIconMap = {};
for (let i = iconDeclStart + 1; i < ROWS_CAT_TSX.length && !/^};/.test(ROWS_CAT_TSX[i]); i++) {
  const m = /^  ([a-z]+): ([A-Z][A-Za-z]*),$/.exec(ROWS_CAT_TSX[i]);
  if (m) catIconMap[m[1]] = m[2];
}
const fallbackIconLine = ROWS_CAT_TSX.findIndex((l) => /iconOverride \?\? CATEGORY_ICONS\[key\] \?\? Receipt;/.test(l));
if (fallbackIconLine < 0) fail('CategoryChip.tsx no longer falls back to the Receipt glyph');
tsxLine(ROWS_CAT_TSX, 'src/components/ui/CategoryChip.tsx', fallbackIconLine + 1, ROWS_CAT_TSX[fallbackIconLine]);
const catIconDart = (web) => {
  const hit = ICON_MAP[web];
  if (!hit) fail(`icon-map.tsv records no Lucide symbol for ${web}, which CategoryChip paints`);
  return hit.dart;
};
const catFallbackGlyph = catIconDart(/CATEGORY_ICONS\[key\] \?\? ([A-Za-z]+);/.exec(ROWS_CAT_TSX[fallbackIconLine])[1]);
for (const [key, web] of Object.entries(catIconMap)) catIconDart(web);
// The glyph is drawn at the `glyph` table's size with the component's own stroke
// width — the two numbers the caller needs once it can hand over an icon.
const iconCallLine = catDimsRec.parts.find((p) => /^<Icon /.test(p.text));
if (!iconCallLine) fail('cat-chip-icon-and-size-tables records no <Icon … /> call');
tsxLine(ROWS_CAT_TSX, 'src/components/ui/CategoryChip.tsx', iconCallLine.line, iconCallLine.text);
const glyphSizeRef = /size=\{(\w+)\}/.exec(iconCallLine.text);
if (!glyphSizeRef || glyphSizeRef[1] !== 'glyph') {
  fail(`the chip glyph is drawn at size={${glyphSizeRef && glyphSizeRef[1]}}, not the \`glyph\` table`);
}
const strokeRaw = /strokeWidth=\{([\d.]+)\}/.exec(iconCallLine.text);
if (!strokeRaw) fail(`the chip glyph no longer authors a strokeWidth the port can carry: "${iconCallLine.text}"`);
const catStrokeWidth = parseFloat(strokeRaw[1]);

// The tint tables, per pass. A tone’s oklab mix is the engine’s arithmetic, so the
// port carries what it painted; what generation proves is that the mix really
// happened (the token alone and the box are different colours), that no two tones
// collide, and that the frame is not the fill.
const catTints = (brightness) => {
  const out = {};
  for (const [tone, row] of Object.entries(catTones)) {
    const name = row.name;
    const pastel = row.parts[1].toneVar.replace(/^var\((.*)\)$/, '$1');
    const mixFillPct = row.parts[1].style.match(
      /background: color-mix\(in oklab, var\(--[a-z0-9-]+\) (\d+)%, var\(--[a-z0-9-]+\)\)/,
    )[1];
    if (catToneBg[tone].token !== `var(${pastel})`) {
      fail(`${name}: the measured row tints with ${pastel}, TONE_BG.${tone} says ${catToneBg[tone].token}`);
    }
    const fill = stkCol(brightness, name, 'backgroundColor');
    const border = stkCol(brightness, name, 'borderTopColor');
    const raw = passTheme(`${brightness}-phone`).root[pastel];
    if (!raw || !raw.srgb) fail(`${name}: ${pastel} is not a measured colour in ${brightness}-phone`);
    if (fill.hex === raw.srgb.hex) {
      fail(
        `${name}: the oklab mix painted ${raw.srgb.rgba} unchanged — ${mixFillPct}% of the box colour moved nothing`,
      );
    }
    if (fill.hex === border.hex && fill.alpha === border.alpha) fail(`${name}: fill and frame are one colour`);
    const side = stkLen(brightness, name, 'width');
    out[tone] = {
      tone,
      pastelToken: pastel,
      mixFillPct,
      fillColor: fill,
      borderColor: border,
      borderWidthPx: stkLen(brightness, name, 'borderTopWidth'),
      radiusPx: stkLen(brightness, name, 'borderRadius'),
      iconColor: stkTokenColour(brightness, name, 'color', '--ink', '--ink'),
      sidePx: side,
      rowName: name,
      cls: row.parts[0].cls,
      src: rowsCite(row),
      mixFill: mixFillPct,
      mixFillWith: row.parts[1].style.match(
        /background: color-mix\(in oklab, var\(--[a-z0-9-]+\) \d+%, (var\(--[a-z0-9-]+\))\)/,
      )[1],
      mixBorder: row.parts[1].style.match(
        /border: 1px solid color-mix\(in oklab, var\(--[a-z0-9-]+\) (\d+)%, var\(--[a-z0-9-]+\)\)/,
      )[1],
      mixBorderWith: row.parts[1].style.match(
        /border: 1px solid color-mix\(in oklab, var\(--[a-z0-9-]+\) \d+%, (var\(--[a-z0-9-]+\))\)/,
      )[1],
    };
  }
  const fills = Object.values(out).map((t) => `${t.fillColor.hex}/${t.fillColor.alpha}`);
  if (new Set(fills).size !== fills.length) fail(`${brightness}: two category tones measured the same fill`);
  return out;
};
const catChipSizes = () => {
  const out = {};
  for (const s of CAT_SIZES) {
    const name = s === 'md' ? 'cat-chip-md-lavender' : `cat-chip-${s}`;
    const sides = [];
    for (const tag of ['light-desktop', 'dark-desktop', 'light-phone', 'dark-phone']) {
      sides.push(lenAnyPx(stk(tag, name).width, `${name} ${tag} side`));
      const h = lenAnyPx(stk(tag, name).height, `${name} ${tag} height`);
      if (h !== sides[sides.length - 1])
        fail(`${name}: ${tag} measured ${h}px tall and ${sides[sides.length - 1]}px wide`);
    }
    if (new Set(sides).size !== 1) fail(`${name}: the square moves with the pass (${sides.join('/')})`);
    if (sides[0] !== catSizeFor(s)) fail(`${name}: measured ${sides[0]}px, the dims table says ${catSizeFor(s)}px`);
    out[s] = { size: s, sidePx: sides[0], glyphPx: catGlyphFor(s), name };
  }
  return out;
};
const rowsChipSizes = catChipSizes();
const rowsChipLight = catTints('light');
const rowsChipDark = catTints('dark');
if (rowsChipSizes['md'].sidePx !== 40) fail('the default chip is no longer the 40px box the row is designed around');
const FULL_ROUND_CLAMP = 3.35544e7;
for (const t of Object.values(rowsChipLight)) {
  if (Math.abs(t.radiusPx - FULL_ROUND_CLAMP) / FULL_ROUND_CLAMP > 1e-4) {
    fail(`${t.rowName}: radius ${t.radiusPx}px is not the engine clamp of \`rounded-full\` (${FULL_ROUND_CLAMP}px)`);
  }
  if (t.radiusPx < t.sidePx / 2)
    fail(`${t.rowName}: the measured radius is smaller than half the side, so the chip is not a circle`);
}
const catFixtures = [
  ...Object.keys(catIconMap),
  'Salary',
  '  GROCERIES ',
  'transfer in',
  'Transfer In',
  'unknown',
  '',
  'a𝕏b',
  '彩票',
  'İSTANBUL',
  'uber',
].sort();
const catFixtureTable = catFixtures.map((c) => [c, jsToneFor(c)]);

// ---------------------------------------------------------------- ledger copy
for (const name of ['ledger-day-grouping-and-header', 'ledger-empty-copy']) {
  for (const p of usAuthored(name).parts) {
    const file = p.src || usAuthored(name).src;
    tsxLine(rowsFile(file), file, p.line, p.text);
  }
}
// `empty` is applied to the Reports Centre column and declared nowhere in the
// sheet. The record promises that stays true, so the absence is asserted here —
// a future `.empty` rule would silently recolour a box the port measured empty.
const emptyNowhere = usAuthored('ledger-empty-class-declared-nowhere');
for (const p of emptyNowhere.parts) {
  tsxLine(rowsFile(p.src || emptyNowhere.src), p.src || emptyNowhere.src, p.line, p.text);
}
const emptyRule = CSS_LINES.findIndex((l) => /^\.empty(\b|:|\s|\{)/.test(l));
if (emptyRule >= 0) {
  fail(`src/index.css:${emptyRule + 1} now declares .empty; the recorded "declared nowhere" finding is stale`);
}

const rowsDayLight = rowsDayHead('light');
const rowsDayDark = rowsDayHead('dark');
const rowsDividerLight = rowsDivider('light');
const rowsDividerDark = rowsDivider('dark');
const rowsEmptyLight = rowsEmpty('light');
const rowsEmptyDark = rowsEmpty('dark');
const rowsEmptyRcLight = rowsEmptyRc('light');
const rowsEmptyRcDark = rowsEmptyRc('dark');

// ---------------------------------------------------------------- Dart emission
// A spec class is emitted from one table — its Dart fields and its Dart literals
// are the same list read twice, so a number cannot be declared in the class and
// carried under another name by the data.
const rowsTok = (v) => String(v).replace(/^var\((.*)\)$/, '$1');
/** A Dart `int` literal: `rowsLit`’s number path always prints a double, and a
 *  measured font weight or duration is not one. */
const rowsInt = (n) => ({ __dartExpr: String(n) });
const rowsLit = (v) => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'object' && v.__dartExpr !== undefined) return v.__dartExpr;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return fmt(v);
  if (typeof v === 'string') return dartStr(v);
  if (typeof v.r === 'number' && typeof v.alpha === 'number') return dartSurfaceColour(v);
  fail(`app_rows.dart has no Dart literal for ${JSON.stringify(v)}`);
};
const rowsSpecClass = (ctor, doc, fields, members) => {
  L.push(...doc, `class ${ctor} {`, `  const ${ctor}({`);
  for (const [name, type] of fields) {
    L.push(type.endsWith('?') ? `    this.${name},` : `    required this.${name},`);
  }
  L.push('  });', '');
  for (const [name, type, , fieldDoc] of fields) {
    L.push(...(fieldDoc || []).map((d) => `  /// ${d}`), `  final ${type} ${name};`, '');
  }
  L.push(...members, '}', '');
};
const rowsSpecValue = (ctor, fields, rec, ind) =>
  `${ctor}(\n${fields.map(([name, , get]) => `${ind}  ${name}: ${rowsLit(get(rec))},`).join('\n')}\n${ind})`;
const slotValue = (slot, ind) => rowsSpecValue('AppTxRowSlotSpec', ROW_SLOT_FIELDS, slot, ind);
const citeOf = (name) => ({
  stackRow: name,
  cssClasses: usRow(name)
    .parts.map((p) => p.cls)
    .filter(Boolean)
    .join(' '),
  authoredSrc: rowsCite(usRow(name)),
});

// ---- one text slot of the row (and the two rows that read like it)
const ROW_SLOT_FIELDS = [
  ['stackRow', 'String', (s) => s.name, ['The `utilityStacks` row this slot was measured from.']],
  ['cssClasses', 'String', (s) => s.cls, ['The verbatim class list the component writes on this element.']],
  [
    'authoredSrc',
    'String',
    (s) => s.src,
    ['`file:lines` of that class list, re-checked against the pinned source before emission.'],
  ],
  ['displayCss', 'String', (s) => s.displayCss, ['The measured `display`, which is what the widget lays out as.']],
  [
    'alignItemsCss',
    'String',
    (s) => s.alignItemsCss,
    ['The measured `align-items`; `normal` where no flex axis asks for one.'],
  ],
  [
    'gapPx',
    'double?',
    (s) => s.gapPx,
    ['The measured `gap` in phone px, `null` where the row measures `normal` — which is no gap.'],
  ],
  [
    'marginTopPx',
    'double',
    (s) => s.marginTopPx,
    [
      'The measured top offset, which the port draws as the space above this slot.',
      '',
      'Zero for every slot but the meta line, whose `mt-0.5` is 2px at the measured',
      '`--spacing`. Generation reads the utility off the class list, multiplies it by',
      'the unit all four `:root` passes agree on, and requires the product to equal',
      'what the pass painted — so a margin with no class behind it, or a class whose',
      'pixels the record does not show, stops generation rather than reaching here.',
    ],
  ],
  [
    'paddingVerticalPx',
    'double',
    (s) => s.paddingVerticalPx,
    [
      'The block padding the slot itself asks for. Only the trailing pill has any',
      '(`!py-0.5 !px-2` over `.pill`’s own, which the `!` exists to win against); the',
      'other slots measure `0px` because their box padding belongs to the row, not to',
      'a text child. Same cross-check as [marginTopPx]: the utility, the unit and the',
      'painted pixel have to agree.',
    ],
  ],
  ['paddingHorizontalPx', 'double', (s) => s.paddingHorizontalPx, []],
  [
    'fontFamily',
    'String',
    (s) => s.fontFamily,
    [
      'The first family of the stack this slot paints in — the §6 probe that authors it',
      '(`.mono` for a slot that cites the class, `body` for one that inherits), never the',
      '45 measured properties, which do not carry a font stack.',
    ],
  ],
  ['fontSizePx', 'double', (s) => s.fontSizePx, ['The phone font size.']],
  [
    'fontWeight',
    'int',
    (s) => rowsInt(s.fontWeight),
    ['The measured numeric weight, carried as a number so [weight] can name it.'],
  ],
  [
    'heightRatio',
    'double',
    (s) => s.heightRatio,
    [
      'The line box as a multiplier of the size. No slot here authors a line-height,',
      'so every one of them sits on `body`’s inherited multiplier — which generation',
      're-reads from the §6 `body` probe and requires to be byte-identical to the',
      'ratio the row measured, in both brightnesses.',
    ],
  ],
  ['letterSpacingPx', 'double', (s) => s.letterSpacingPx, ['The phone resolution of the tracking.']],
  [
    'letterSpacingEm',
    'double',
    (s) => s.letterSpacingEm,
    ['The `em` that produced it, so [styleAt] can re-derive it at another size.'],
  ],
  ['textColor', 'Color', (s) => s.textColor, ['The colour the slot painted.']],
  [
    'authoredColorToken',
    'String?',
    (s) => s.colourToken,
    [
      'The `:root` token the cited class or inline style selects, which the measurement',
      'had to reproduce exactly; `null` where the slot inherits and paints `body`’s ink.',
    ],
  ],
  [
    'truncates',
    'bool',
    (s) => s.truncates,
    [
      '`truncate`, proven as the trio it actually measures (`white-space: nowrap`,',
      '`text-overflow: ellipsis`, `overflow: hidden`) and as a word of the class list.',
    ],
  ],
  ['flexGrow', 'double', (s) => s.flexGrow, ['The measured `flex-grow`.']],
  ['flexShrink', 'double', (s) => s.flexShrink, ['The measured `flex-shrink`.']],
  [
    'minWidthZero',
    'bool?',
    (s) => s.minWidthZero,
    [
      '`min-w-0`, only where the row asked for the property: a flex-item hint that lets a',
      'long figure shrink below its content width. Flutter already gives a `Text` its',
      "parent's max width, so there is nothing to port — `null` says the property was",
      'never measured and is therefore not a fact about this slot.',
    ],
  ],
  [
    'textAlignCss',
    'String?',
    (s) => s.textAlignCss,
    ['The measured `text-align` where the row asked for it, else `null`.'],
  ],
  [
    'tabularNums',
    'bool',
    (s) => s.tabularNums,
    [
      '`font-variant-numeric: tabular-nums`, which the cited family authors and the',
      'widget answers with [FontFeature.tabularFigures] — a font feature, so it does',
      'nothing in a fallback face.',
    ],
  ],
];
const ROW_SLOT_MEMBERS = [
  '  /// The weight Flutter names for the measured numeric weight.',
  '  FontWeight get weight => FontWeight.values[fontWeight ~/ 100 - 1];',
  '',
  '  /// The space this slot asks for above itself — [marginTopPx] and nothing else.',
  '  /// Zero for every slot but the meta line, whose `mt-0.5` is 2px at the measured',
  '  /// `--spacing`. The row’s own inset is [AppTxRowBoxSpec]’s padding, never a text',
  '  /// child’s margin, so the two never double-count.',
  '  EdgeInsets get margin => EdgeInsets.only(top: marginTopPx);',
  '',
  '  /// The slot’s own inner inset. Only the trailing pill has any, from the',
  '  /// `!py-0.5 !px-2` that beat `.pill`’s rule; every other slot measures `0px`.',
  '  EdgeInsets get padding => EdgeInsets.symmetric(',
  '    horizontal: paddingHorizontalPx,',
  '    vertical: paddingVerticalPx,',
  '  );',
  '',
  '  /// Tabular figures where the cited class authors them.',
  '  List<FontFeature> get fontFeatures =>',
  '      tabularNums ? const <FontFeature>[FontFeature.tabularFigures()] : const <FontFeature>[];',
  '',
  '  /// The slot as the phone pass measured it.',
  '  TextStyle get textStyle => styleAt(fontSizePx);',
  '',
  '  /// The slot at another font size. CSS resolves tracking against the used font',
  '  /// size, so a resized slot re-derives it from [letterSpacingEm] rather than',
  '  /// keeping the phone pixels; the line box travels as its multiplier.',
  '  TextStyle styleAt(double sizePx) => TextStyle(',
  '        fontFamily: fontFamily,',
  '        color: textColor,',
  '        fontSize: sizePx,',
  '        fontWeight: weight,',
  '        height: heightRatio,',
  '        letterSpacing: letterSpacingEm * sizePx,',
  '        fontFeatures: fontFeatures,',
  '      );',
];

// ---- the row: its box and the seven slots it lays out
const ROW_BOX_FIELDS = [
  ['stackRow', 'String', (b) => b.box.name, ['The `utilityStacks` row the box was measured from.']],
  ['cssClasses', 'String', (b) => b.box.cls, ['The verbatim class list of the row element.']],
  ['authoredSrc', 'String', (b) => b.box.src, ['`file:line` of that class list.']],
  [
    'displayCss',
    'String',
    (b) => b.box.displayCss,
    ['`display`, byte-equal to the §6 `.tx-row` probe: no utility moved the box.'],
  ],
  ['alignItemsCss', 'String', (b) => b.box.alignItemsCss, ['The measured `align-items`.']],
  ['justifyContentCss', 'String', (b) => b.box.justifyContentCss, ['The measured `justify-content`.']],
  ['gapPx', 'double', (b) => b.box.gapPx, ['`gap`, identical on both axes and equal to what `.tx-row` authors.']],
  [
    'paddingVerticalPx',
    'double',
    (b) => b.box.paddingVerticalPx,
    ['The symmetric pair `.tx-row` authors, which the composed row reproduces exactly.'],
  ],
  ['paddingHorizontalPx', 'double', (b) => b.box.paddingHorizontalPx, []],
  ['radiusPx', 'double', (b) => b.box.radiusPx, ['`border-radius`, as `--r-sm` resolves at the phone pass.']],
  ['radiusToken', 'String', (b) => rowsTok(b.box.radiusToken), ['The token that radius names.']],
  [
    'fillColor',
    'Color',
    (b) => b.box.fillColor,
    [
      'Always transparent: the row paints nothing until `:hover`, which the port drops',
      '(UI_SPEC D-U1). Generation fails if a fill ever appears in the resting measurement.',
    ],
  ],
  [
    'inkColor',
    'Color',
    (b) => b.box.inkColor,
    ['`--ink`, the colour the slots inherit unless one names its own token.'],
  ],
  ['cursorCss', 'String', (b) => b.box.cursorCss, ['The measured `cursor`, a web-only fact the port has no knob for.']],
  ['flexShrink', 'double', (b) => b.box.flexShrinkPx, ['The measured `flex-shrink` of the row in its list.']],
  [
    'pressScale',
    'double',
    (b) => txScale,
    [
      `\`.pressable:active\`’s scale (\`src/index.css:${PRESS_ACTIVE.line}\`) — the one the`,
      'row really paints, because both unlayered active rules claim it and the later',
      'one wins outright.',
    ],
  ],
  [
    'overriddenPressScale',
    'double',
    (b) => txOverriddenScale,
    [
      `\`.tx-row:active\`’s scale (\`src/index.css:${TX_ACTIVE.line}\`), recorded as the`,
      'loser so a reordering of the sheet cannot silently change what the press paints.',
    ],
  ],
  [
    'pressDurationMs',
    'int',
    (b) => rowsInt(txPressMotion.ms),
    [
      `The clock both pressable rules name (${txPressMotion.dur.name},`,
      `\`src/index.css:${PRESS_REST.line}\`), which generation requires to be the same`,
      'duration and curve `.tx-row` would have run.',
    ],
  ],
  ['easeX1', 'double', (b) => txPressMotion.curve[0], [`${txPressMotion.ease.name} as the four cubic points.`]],
  ['easeY1', 'double', (b) => txPressMotion.curve[1], []],
  ['easeX2', 'double', (b) => txPressMotion.curve[2], []],
  ['easeY2', 'double', (b) => txPressMotion.curve[3], []],
  ['title', 'AppTxRowSlotSpec', (b) => ({ __dartExpr: slotValue(b.title, '        ') }), ['The category name.']],
  [
    'meta',
    'AppTxRowSlotSpec',
    (b) => ({ __dartExpr: slotValue(b.meta, '        ') }),
    ['The second line — a string its caller composes, never something the row works out.'],
  ],
  [
    'textWrap',
    'AppTxRowSlotSpec',
    (b) => ({ __dartExpr: slotValue(b.textWrap, '        ') }),
    ['The column the two text lines share.'],
  ],
  [
    'amountWrap',
    'AppTxRowSlotSpec',
    (b) => ({ __dartExpr: slotValue(b.amountWrap, '        ') }),
    ['The right-hand column, aligned by measurement rather than by assumption.'],
  ],
  [
    'amountIn',
    'AppTxRowSlotSpec',
    (b) => ({ __dartExpr: slotValue(b.amountIn, '        ') }),
    ['The amount as painted for income (`--success`).'],
  ],
  [
    'amountOut',
    'AppTxRowSlotSpec',
    (b) => ({ __dartExpr: slotValue(b.amountOut, '        ') }),
    ['The amount as painted for expense (`--danger`) — the same row, one property different.'],
  ],
  [
    'pill',
    'AppTxRowSlotSpec',
    (b) => ({ __dartExpr: slotValue(b.pill, '        ') }),
    [
      'The trailing type pill: `.pill`’s box with `!py-0.5 !px-2` over it, `.mono`’s',
      'family, and a `hidden sm:inline-flex` pair that is inert because `.pill` authors',
      'an unlayered `display` — so both viewports measure it painted.',
    ],
  ],
];
const ROW_BOX_MEMBERS = [
  '  /// The inset `.tx-row` authors, which the composed row reproduces byte for byte.',
  '  EdgeInsets get padding =>',
  '      EdgeInsets.symmetric(vertical: paddingVerticalPx, horizontal: paddingHorizontalPx);',
  '',
  '  /// `--r-sm` as painted.',
  '  BorderRadius get radius => BorderRadius.circular(radiusPx);',
  '',
  `  /// ${txPressMotion.dur.name} — the clock both pressable rules name.`,
  '  Duration get pressDuration => Duration(milliseconds: pressDurationMs);',
  '',
  `  /// ${txPressMotion.ease.name} — the easing both pressable rules name.`,
  '  Cubic get pressCurve => Cubic(easeX1, easeY1, easeX2, easeY2);',
];

// ---- the day header
const ROW_DAY_FIELDS = [
  ['stackRow', 'String', (d) => d.name, ['The `utilityStacks` row the header label was measured from.']],
  ['cssClasses', 'String', (d) => d.cls, ['The verbatim class list of the sticky label.']],
  ['authoredSrc', 'String', (d) => d.src, ['`file:lines` of that class list.']],
  ['displayCss', 'String', (d) => d.displayCss, []],
  ['zIndexCss', 'String', (d) => d.zIndexCss, ['`z-index`, measured and required equal to what `.day-head` authors.']],
  [
    'paddingVerticalPx',
    'double',
    (d) => d.paddingVerticalPx,
    ['`.day-head`’s authored padding, which the composed header reproduces.'],
  ],
  ['paddingHorizontalPx', 'double', (d) => d.paddingHorizontalPx, []],
  [
    'blurPx',
    'double',
    (d) => d.blurPx,
    ['`backdrop-filter: blur(…)` as authored by `.day-head`, in CSS radius units.'],
  ],
  ['fillColor', 'Color', (d) => d.fillColor, ['The pixels the header painted.']],
  [
    'fillToken',
    'String',
    (d) => d.fillToken,
    [
      '`fillMixPercent` of this `:root` token over transparent, which is the recipe',
      '`.day-head` authors and which the measurement had to match in hex and in alpha',
      'in both brightnesses.',
    ],
  ],
  ['fillMixPercent', 'double', (d) => d.fillMixPercent, []],
  [
    'labelCssClass',
    'String',
    (d) => d.labelCssClass,
    ['The class the header’s type comes from — `.eyebrow`, read from its §6 probe.'],
  ],
  ['labelAuthoredSrc', 'String', (d) => d.labelAuthoredSrc, ['Where that rule lives.']],
  [
    'uppercase',
    'bool',
    (d) => d.uppercase,
    [
      '`text-transform: uppercase`, which `.eyebrow` authors and the header measures.',
      'Flutter has no text-transform, so the widget answers it with `toUpperCase()` at',
      'the label — a deviation the port records rather than hides.',
    ],
  ],
  [
    'redundantSizeOverride',
    'bool',
    (d) => d.redundantSizeOverride,
    [
      'The class list also writes `!text-[10px]` beside `.eyebrow`, which re-states the',
      'size the class already authors. Recorded because it is inert, not because the',
      'port needs a second size.',
    ],
  ],
  ['textColor', 'Color', (d) => d.textColor, ['`.eyebrow`’s colour (`--ink-3`), which the header painted.']],
  ['fontSizePx', 'double', (d) => d.fontSizePx, []],
  ['fontWeight', 'int', (d) => rowsInt(d.fontWeight), []],
  [
    'heightRatio',
    'double',
    (d) => d.heightRatio,
    ['`body`’s inherited multiplier — `.eyebrow` authors no line-height of its own.'],
  ],
  ['letterSpacingPx', 'double', (d) => d.letterSpacingPx, []],
  [
    'letterSpacingEm',
    'double',
    (d) => d.letterSpacingEm,
    ['`.eyebrow`’s authored `em`, which generation proves against the measured px.'],
  ],
];
const ROW_DAY_MEMBERS = [
  '  /// CSS blur radius → Flutter sigma, ruling D-U8’s fixed mapping.',
  '  double get blurSigmaPx => blurPx / 2;',
  '',
  '  EdgeInsets get padding =>',
  '      EdgeInsets.symmetric(vertical: paddingVerticalPx, horizontal: paddingHorizontalPx);',
  '',
  '  FontWeight get weight => FontWeight.values[fontWeight ~/ 100 - 1];',
  '',
  '  /// The label as the phone measured it.',
  '  TextStyle get textStyle => styleAt(fontSizePx);',
  '',
  '  /// The label at another size, with its tracking re-derived from the authored `em`.',
  '  TextStyle styleAt(double sizePx) => TextStyle(',
  '        color: textColor,',
  '        fontSize: sizePx,',
  '        fontWeight: weight,',
  '        height: heightRatio,',
  '        letterSpacing: letterSpacingEm * sizePx,',
  '      );',
];

// ---- the ledger chrome
const ROW_DIVIDER_FIELDS = [
  ['widthPx', 'double', (d) => d.widthPx, ['`divide-y`’s hairline, measured on a divided child that keeps it.']],
  ['color', 'Color', (d) => d.colour, ['The line the parent’s own `currentColor` resolves to.']],
  ['token', 'String', (d) => d.token, ['`--line`, which the measurement had to reproduce exactly.']],
];
const ROW_EMPTY_FIELDS = [
  ['stackRow', 'String', (e) => e.stackRow, []],
  ['cssClasses', 'String', (e) => e.cssClasses, []],
  ['authoredSrc', 'String', (e) => e.authoredSrc, []],
  ['radiusPx', 'double', (e) => e.radiusPx, ['`--r-sm`, as it resolves at the phone pass.']],
  ['borderWidthPx', 'double', (e) => e.borderWidthPx, ['1px on all four sides.']],
  ['borderColor', 'Color', (e) => e.borderColor, ['`--line`.']],
  ['fillColor', 'Color', (e) => e.fillColor, ['`--surface-2`.']],
  [
    'paddingVerticalPx',
    'double',
    (e) => e.paddingVerticalPx,
    ['Vertical only — the measurement has no horizontal inset.'],
  ],
  ['textAlignCss', 'String', (e) => e.textAlignCss, []],
];
const ROW_EMPTY_MEMBERS = [
  '  /// The CSS frame is `dashed`; Flutter `Border` has no dash pattern, so the port',
  '  /// paints a solid hairline of the same width and colour. Recorded deviation, not',
  '  /// a token disagreement.',
  '  Border get border => Border.all(color: borderColor, width: borderWidthPx);',
  '',
  '  BorderRadius get radius => BorderRadius.circular(radiusPx);',
  '',
  '  EdgeInsets get padding => EdgeInsets.symmetric(vertical: paddingVerticalPx);',
];
const ROW_EMPTY_RC_FIELDS = [
  ['stackRow', 'String', (e) => e.stackRow, []],
  [
    'cssClasses',
    'String',
    (e) => e.cssClasses,
    [
      'The class list, which cites `empty` — a class applied in `ReportsCentre.tsx` and',
      'declared nowhere in `src/index.css`. The box therefore measures no fill, no frame',
      'and no padding beyond its own utilities, and generation asserts the rule is still',
      'absent rather than trusting the record forever.',
    ],
  ],
  ['authoredSrc', 'String', (e) => e.authoredSrc, []],
  ['gapPx', 'double', (e) => e.gapPx, ['Identical on both axes.']],
  ['paddingVerticalPx', 'double', (e) => e.paddingVerticalPx, []],
  [
    'line',
    'AppTxRowSlotSpec',
    (e) => ({ __dartExpr: slotValue(e.line, '        ') }),
    ['The figure under the headline, read the same way as a row slot.'],
  ],
];
const ROW_RAIL_FIELDS = [
  ['stackRow', 'String', (r) => r.name, []],
  ['cssClasses', 'String', (r) => r.cls, []],
  ['authoredSrc', 'String', (r) => r.src, []],
  [
    'wideMaxHeightPx',
    'double?',
    (r) => r.wideMaxHeightPx,
    ['`max-height` at the desktop pass — `null` where the rail is unbounded there.'],
  ],
  ['narrowMaxHeightPx', 'double?', (r) => r.narrowMaxHeightPx, ['`max-height` at the phone pass.']],
  ['wideOverflowYCss', 'String', (r) => r.wideOverflowYCss, []],
  ['narrowOverflowYCss', 'String', (r) => r.narrowOverflowYCss, []],
  ['wideOverflowXCss', 'String', (r) => r.wideOverflowXCss, []],
  ['narrowOverflowXCss', 'String', (r) => r.narrowOverflowXCss, []],
  [
    'widePaddingRightPx',
    'double',
    (r) => r.widePaddingRightPx,
    ['The scrollbar gutter the rail reserves on one side only, nothing on the other three.'],
  ],
  ['narrowPaddingRightPx', 'double', (r) => r.narrowPaddingRightPx, []],
  [
    'rowMarginTopPx',
    'double?',
    (r) => r.rowMarginTopPx,
    [
      'The top margin `space-y-N` authors on every child after the first — the list’s',
      'own row spacing. `null` where the rail cites no `space-y-*`.',
      '',
      'The one number in this file that no pass measured, because it is not a property',
      'of the element the class list sits on: `space-y-*` moves the children, and the',
      'rail row reads `marginTop: 0px` and no `gap`. Generation derives it as N ×',
      '`--spacing`, the unit every pass measures in `:root`, and refuses to emit it',
      'unless a second utility on this same element (`pr-*`) resolves to the pixels the',
      'pass really did read — so the scale unit is confirmed by measurement, never',
      'assumed. The first child keeps no margin, exactly as `:not(:first-child)` does.',
    ],
  ],
];

banner();
L.push("import 'package:flutter/material.dart';", '');
rowsSpecClass(
  'AppTxRowSlotSpec',
  [
    '/// One text-bearing slot of the transaction row, measured as the class list the',
    '/// component really writes on the element it really uses (`utilityStacks`), not as',
    '/// a detached probe: a §6 probe cannot see a Tailwind utility, so for this family',
    '/// the stack row *is* the measurement and `src/index.css` supplies only the authored',
    '/// facts a detached element never shows — a state rule, a `gap`, the `em` a',
    '/// measured tracking came from.',
    '///',
    '/// Nothing here is a default. A value no pass measured fails generation, and every',
    '/// number the phone read has to agree with the desktop pass, or the pair is ported',
    '/// explicitly as [AppLedgerRailSpec]’s wide/narrow instead of one averaged value.',
  ],
  ROW_SLOT_FIELDS,
  ROW_SLOT_MEMBERS,
);
rowsSpecClass(
  'AppTxRowSpec',
  [
    '/// The transaction row: one `.tx-row pressable` box and the seven text slots it',
    '/// lays out, as each brightness measured them.',
    '///',
    '/// The box owns nothing but its inset, its radius, its `gap` and its press. It',
    '/// paints no fill, no frame, no shadow and no backdrop at rest — all four are',
    '/// asserted empty rather than assumed — and its padding and `--r-sm` radius are',
    '/// byte-equal to the §6 `.tx-row` probe, which is what says no utility moved it.',
    '///',
    '/// Unported authored state, dropped for the reason AppControls drops it (UI_SPEC',
    `/// D-U1): \`.tx-row:hover\` at src/index.css:${TX_HOVER.line} paints \`${txHoverToken}\`,`,
    '/// a paint-only decoration. The press is not decoration and is ported: two',
    '/// unlayered rules claim this box: `.tx-row:active`',
    `/// (src/index.css:${TX_ACTIVE.line}) scales to [overriddenPressScale] and`,
    '/// `.pressable:active`',
    `/// (src/index.css:${PRESS_ACTIVE.line}) scales to [pressScale], and`,
    '/// because the later unlayered rule wins outright the row paints the second.',
    '/// Generation reads that order off the sheet rather than assuming it, and fails if',
    '/// the rules are ever reordered.',
    '///',
    '/// The row formats nothing. Money strings come from the already-ported formatters',
    '/// and the meta line is a string its caller composes, exactly as the web composes',
    '/// it; the signed/absolute amount and the `isIncome` flag are the caller’s too,',
    '/// because the web’s two predicates disagree and a port must not pick a side.',
  ],
  ROW_BOX_FIELDS,
  ROW_BOX_MEMBERS,
);
rowsSpecClass(
  'AppDayHeadSpec',
  [
    '/// The sticky day header above a run of rows: a `.day-head` box whose only job is',
    '/// to hold text back while the list scrolls under it, and the `.eyebrow` label',
    '/// inside it.',
    '///',
    '/// Its fill is a recipe, not a token — [fillMixPercent] of [fillToken] over',
    '/// transparent — and its blur is the authored `backdrop-filter` of `.day-head`.',
    '/// Its type is `.eyebrow`’s own label row, re-read here and cross-checked against',
    '/// that class’s §6 probe rather than copied from it, which is also why',
    '/// [redundantSizeOverride] is only a record: the `!text-[10px]` beside the class',
    '/// restates a size the class already authors.',
  ],
  ROW_DAY_FIELDS,
  ROW_DAY_MEMBERS,
);
rowsSpecClass(
  'AppLedgerDividerSpec',
  [
    '/// The hairline `divide-y` paints between rows.',
    '///',
    '/// It is a pair of recipes, measured on two siblings: a divided child that keeps',
    '/// the line and `[&:last-child]:border-b-0` on the last one, which generation',
    "/// requires to move nothing else in that child's measurement.",
  ],
  ROW_DIVIDER_FIELDS,
  [],
);
rowsSpecClass(
  'AppLedgerEmptySpec',
  [
    '/// The dashboard’s empty state: a dashed `--line` frame over `--surface-2`,',
    '/// rounded with `--r-sm`, inset vertically and centred.',
  ],
  ROW_EMPTY_FIELDS,
  ROW_EMPTY_MEMBERS,
);
rowsSpecClass(
  'AppLedgerEmptyRcSpec',
  [
    "/// The Reports Centre’s empty state: a bare flex column, with the web's own",
    '/// oddity carried as data (see [cssClasses]).',
  ],
  ROW_EMPTY_RC_FIELDS,
  [],
);
rowsSpecClass(
  'AppLedgerRailSpec',
  [
    '/// A scroll rail, ported as the one pair the two viewports genuinely disagree on.',
    '///',
    '/// These are the only values in this file that are read at both viewports instead',
    '/// of required to agree, because the rail’s `lg:` gating is the design: the',
    '/// dashboard list is bounded and scrollable only past the breakpoint, the Reports',
    '/// Centre’s list is bounded at both. Brightness changes nothing about a rail, so',
    '/// generation proves all four passes read as two pairs.',
    '///',
    '/// The breakpoint itself stays with the caller — the same ruling that keeps',
    '/// `AppModal.wideBreakpointPx` a caller-supplied number: the enumeration of',
    '/// `sm`/`md`/`lg`/`xl` is a fact about the sheet (UI_SPEC/STATUS.md), not a',
    '/// measured property of these rows, so a widget takes the px rather than this',
    '/// file guessing it.',
  ],
  ROW_RAIL_FIELDS,
  [],
);

L.push(
  '/// The row, its header and the chrome the ledger builds around them.',
  '///',
  '/// Values are per brightness; a rail is not, and lives outside the pair. An unknown',
  '/// key is a programming error, never a fallback — the same law every other generated',
  '/// family follows.',
  'abstract final class AppRows {',
  `  static const AppTxRowSpec txRowLight = ${rowsSpecValue('AppTxRowSpec', ROW_BOX_FIELDS, rowsLight, '  ')};`,
  '',
  `  static const AppTxRowSpec txRowDark = ${rowsSpecValue('AppTxRowSpec', ROW_BOX_FIELDS, rowsDark, '  ')};`,
  '',
  '  static AppTxRowSpec txRow(Brightness brightness) =>',
  '      brightness == Brightness.dark ? txRowDark : txRowLight;',
  '',
  `  static const AppDayHeadSpec dayHeadLight = ${rowsSpecValue('AppDayHeadSpec', ROW_DAY_FIELDS, rowsDayLight, '  ')};`,
  '',
  `  static const AppDayHeadSpec dayHeadDark = ${rowsSpecValue('AppDayHeadSpec', ROW_DAY_FIELDS, rowsDayDark, '  ')};`,
  '',
  '  static AppDayHeadSpec dayHead(Brightness brightness) =>',
  '      brightness == Brightness.dark ? dayHeadDark : dayHeadLight;',
  '',
  `  static const AppLedgerDividerSpec dividerLight = ${rowsSpecValue('AppLedgerDividerSpec', ROW_DIVIDER_FIELDS, rowsDividerLight, '  ')};`,
  '',
  `  static const AppLedgerDividerSpec dividerDark = ${rowsSpecValue('AppLedgerDividerSpec', ROW_DIVIDER_FIELDS, rowsDividerDark, '  ')};`,
  '',
  '  static AppLedgerDividerSpec divider(Brightness brightness) =>',
  '      brightness == Brightness.dark ? dividerDark : dividerLight;',
  '',
  `  static const AppLedgerEmptySpec emptyLight = ${rowsSpecValue('AppLedgerEmptySpec', ROW_EMPTY_FIELDS, { ...citeOf('ledger-empty'), ...rowsEmptyLight }, '  ')};`,
  '',
  `  static const AppLedgerEmptySpec emptyDark = ${rowsSpecValue('AppLedgerEmptySpec', ROW_EMPTY_FIELDS, { ...citeOf('ledger-empty'), ...rowsEmptyDark }, '  ')};`,
  '',
  '  static AppLedgerEmptySpec empty(Brightness brightness) =>',
  '      brightness == Brightness.dark ? emptyDark : emptyLight;',
  '',
  `  static const AppLedgerEmptyRcSpec emptyRcLight = ${rowsSpecValue('AppLedgerEmptyRcSpec', ROW_EMPTY_RC_FIELDS, { ...citeOf('ledger-empty-rc'), ...rowsEmptyRcLight }, '  ')};`,
  '',
  `  static const AppLedgerEmptyRcSpec emptyRcDark = ${rowsSpecValue('AppLedgerEmptyRcSpec', ROW_EMPTY_RC_FIELDS, { ...citeOf('ledger-empty-rc'), ...rowsEmptyRcDark }, '  ')};`,
  '',
  '  static AppLedgerEmptyRcSpec emptyRc(Brightness brightness) =>',
  '      brightness == Brightness.dark ? emptyRcDark : emptyRcLight;',
  '',
  '  /// The dashboard list: bounded at `544px` past the breakpoint (`lg:max-h-[34rem]`,',
  '  /// which generation re-derives as `34 × 16`), unbounded below it.',
  `  static const AppLedgerRailSpec ledgerRail = ${rowsSpecValue('AppLedgerRailSpec', ROW_RAIL_FIELDS, rowsLedgerScroll, '  ')};`,
  '',
  `  /// The Reports Centre list: the same \`max-height\` at both viewports (${rowsRcScroll.wideMaxHeightPx}px),`,
  '  /// because nothing gates it.',
  `  static const AppLedgerRailSpec reportsRail = ${rowsSpecValue('AppLedgerRailSpec', ROW_RAIL_FIELDS, rowsRcScroll, '  ')};`,
  '',
  '  /// The direction glyph the amount span leads with, named at',
  `  /// src/components/ui/TransactionRow.tsx:${arrowLine.line}. Both arrows are the same`,
  '  /// size, and the icon dependency has not landed, so the widget draws the box and',
  '  /// the caller hands over the glyph — exactly as `AppIconButton` does. The names',
  '  /// are the Lucide symbols `parity/icon-map.tsv` maps for the web’s two.',
  `  static const double arrowSizePx = ${fmt(rowsArrows.inPx)};`,
  '',
  `  static const String arrowInName = ${dartStr(rowsArrows.inName)};`,
  '',
  `  static const String arrowOutName = ${dartStr(rowsArrows.outName)};`,
  '',
  `  static const String arrowInSymbol = ${dartStr(catIconDart(rowsArrows.inName))};`,
  '',
  `  static const String arrowOutSymbol = ${dartStr(catIconDart(rowsArrows.outName))};`,
  '}',
  '',
);

// ---- the category chip the row leads with
L.push(
  '/// A pastel tone of `CategoryChip.tsx`’s `ChipTone` union, in the order the union',
  '/// declares them. Generation requires the union, the `TONE_BG` table and the',
  '/// measured tone rows to name the same set, so an enum here cannot drift from the',
  '/// component without the run failing.',
  'enum AppChipTone {',
  ...catToneNames.map(
    (t, i) => `  ${t}(${dartStr(rowsTok(catToneBg[t].token))})${i === catToneNames.length - 1 ? ';' : ','}`,
  ),
  '  const AppChipTone(this.toneToken);',
  '',
  '  /// The `:root` token `TONE_BG` selects for this tone — one of the five pastels',
  '  /// for those tones, `--surface-3` for the neutral one. The chip mixes',
  '  /// `AppCategoryChipTintSpec.mixFillPercent` of it with the surface it sits on.',
  '  final String toneToken;',
  '}',
  '',
  '/// A chip size. `sidePx` is the authored `dims` ternary and `glyphPx` the `glyph`',
  '/// ternary, both parsed out of `CategoryChip.tsx` rather than retyped; generation',
  '/// proves each measured square equals the table at all four passes, `md` included',
  "/// (it is the ternary's default arm, cited at the line that falls through to it).",
  'enum AppChipSize {',
  ...CAT_SIZES.map(
    (s, i) =>
      `  ${s}(${fmt(rowsChipSizes[s].sidePx)}, ${fmt(rowsChipSizes[s].glyphPx)})${i === CAT_SIZES.length - 1 ? ';' : ','}`,
  ),
  '  const AppChipSize(this.sidePx, this.glyphPx);',
  '',
  '  /// The box edge — the chip is a square, measured identical in width and height.',
  '  final double sidePx;',
  '',
  '  /// The size the glyph is drawn at.',
  '  final double glyphPx;',
  '',
  '  static AppChipSize sizeFor(String cssSize) => switch (cssSize) {',
  "    'xs' => AppChipSize.xs,",
  "    'sm' => AppChipSize.sm,",
  "    'lg' => AppChipSize.lg,",
  '    _ => AppChipSize.md,',
  '  };',
  '}',
  '',
);
const ROW_TINT_FIELDS = [
  ['tone', 'AppChipTone', (t) => ({ __dartExpr: `AppChipTone.${t.tone}` }), ['The tone this tint is.']],
  ['rowName', 'String', (t) => t.rowName, ['The `utilityStacks` row the tint was measured from.']],
  ['cssClasses', 'String', (t) => t.cls, []],
  ['authoredSrc', 'String', (t) => t.src, []],
  [
    'toneToken',
    'String',
    (t) => t.pastelToken,
    [
      'The token the inline style names, as `TONE_BG` declares it: one of the five',
      'pastels, or `--surface-3` for the neutral tone.',
    ],
  ],
  [
    'mixFillPercent',
    'double',
    (t) => parseFloat(t.mixFill),
    ['`background: color-mix(in oklab, <pastel> N%, <surface>)`.'],
  ],
  ['mixFillWithToken', 'String', (t) => rowsTok(t.mixFillWith), []],
  ['mixBorderPercent', 'double', (t) => parseFloat(t.mixBorder), ['`border: 1px solid color-mix(in oklab, …)`.']],
  ['mixBorderWithToken', 'String', (t) => rowsTok(t.mixBorderWith), []],
  [
    'fillColor',
    'Color',
    (t) => t.fillColor,
    [
      'What the engine painted, not a re-derivation: oklab mixing is the browser’s',
      'arithmetic and this port does not reproduce it. Generation proves the mix really',
      'moved (the painted hex differs from the token’s own), that the frame is not the',
      'fill, and that no two tones of one pass collide.',
    ],
  ],
  ['borderColor', 'Color', (t) => t.borderColor, []],
  ['borderWidthPx', 'double', (t) => t.borderWidthPx, []],
  [
    'iconColor',
    'Color',
    (t) => t.iconColor,
    ['`--ink`, the glyph colour the inline style writes for every tone alike.'],
  ],
  ['sidePx', 'double', (t) => t.sidePx, ['The measured square this tone was sampled at.']],
];
rowsSpecClass(
  'AppCategoryChipTintSpec',
  [
    '/// One tone of the chip, as one brightness painted it.',
    '///',
    '/// `md` is the size each tone was sampled at, so [sidePx] is the `md` square and',
    '/// the other sizes share the tint — the measurement is of a colour, and a',
    '/// `color-mix` does not move with the box it paints.',
  ],
  ROW_TINT_FIELDS,
  [
    '  /// `rounded-full`, which is the engine’s own clamp rather than a radius anyone',
    '  /// chose: see [AppCategoryChips.fullRoundRadiusPx].',
    '  BorderRadius get radius => BorderRadius.circular(AppCategoryChips.fullRoundRadiusPx);',
  ],
);
L.push(
  '/// The chip that leads every row: its tone tables, the hash that picks a tone, and',
  '/// the glyph the web paints in it.',
  'abstract final class AppCategoryChips {',
  '  /// Chrome’s clamp of `rounded-full` (`3.35544e+07px`). Any radius at least half',
  '  /// the side paints the same circle, so the widget can clamp it however it likes;',
  '  /// the number is kept because it is what was measured, and generation fails if a',
  '  /// chip ever measures smaller than half its side.',
  `  static const double fullRoundRadiusPx = ${fmt(FULL_ROUND_CLAMP)};`,
  '',
  '  /// The `strokeWidth` the component draws its glyph with.',
  `  static const double glyphStrokeWidth = ${fmt(catStrokeWidth)};`,
  '',
  '  /// `TONE_CYCLE`, in the order the component declares it: the list a category',
  '  /// hashes into.',
  `  static const List<AppChipTone> toneCycle = <AppChipTone>[${catToneCycle.map((t) => `AppChipTone.${t}`).join(', ')}];`,
  '',
  '  /// `hashString` as the web writes it: `h = (h * M + s.charCodeAt(i)) >>> 0` over',
  '  /// `category.toLowerCase().trim()`. `>>> 0` is a mod-2^32 for the non-negative',
  '  /// values this reaches, which Dart’s 64-bit `int` answers with a mask.',
  `  static const int toneHashMultiplier = ${hashMul[1]};`,
  '',
  '  static const int toneHashMask = 0xFFFFFFFF;',
  '',
  '  /// The tone a category string selects. Identical in both brightnesses, because the',
  '  /// hash reads the name and nothing else.',
  '  ///',
  '  /// One recorded deviation. A browser lowercases a dotted capital `İ` with',
  '  /// Unicode’s *full* mapping (`i` + U+0307, two UTF-16 units) and Dart with',
  '  /// the *simple* one (`i`, one), so a category whose name carries it hashes to',
  '  /// a different index here than on the web. The tone is decorative and the',
  '  /// name is user-typed, so the port keeps Dart’s normalisation rather than',
  '  /// carrying a case table for its own sake; [toneWebNormalisations] holds the',
  '  /// evidence and the drift test pins the divergence so closing it stays a',
  '  /// decision.',
  '  static AppChipTone toneFor(String category) {',
  '    final String s = category.toLowerCase().trim();',
  '    int h = 0;',
  '    for (int i = 0; i < s.length; i++) {',
  '      h = (h * toneHashMultiplier + s.codeUnitAt(i)) & toneHashMask;',
  '    }',
  '    return toneCycle[h % toneCycle.length];',
  '  }',
  '',
  '  /// The web’s own answer for these strings, generated by running its hash over',
  '  /// them at the same time as this table was. `toLowerCase()` and UTF-16 indexing',
  '  /// are where a Dart port can diverge (a Turkish dotted capital, an astral plane',
  '  /// character), so [toneFor] is asserted against this table in',
  '  /// `test/theme/ui_tokens_test.dart` rather than trusted.',
  '  static const Map<String, AppChipTone> toneFixtures = <String, AppChipTone>{',
  ...catFixtureTable.map(([c, tone]) => `    ${dartStr(c)}: AppChipTone.${tone},`),
  '  };',
  '',
  '  /// The web’s `category.toLowerCase().trim()` for each fixture key, as the',
  '  /// engine that paints the app answered it. A browser follows Unicode’s',
  '  /// *full* lowercase mappings and Dart follows the *simple* ones, so the two',
  '  /// normalisations can differ in length — a dotted capital `İ` is the case',
  '  /// that does. This is the evidence that says which side of the hash a',
  '  /// divergence lives on: hash these strings with the component’s own',
  '  /// multiplier, mask and cycle and every [toneFixtures] entry reproduces,',
  '  /// so any remaining disagreement is a normalisation difference rather than',
  '  /// a wrong hash. Asserted key by key in `test/theme/ui_tokens_test.dart`.',
  '  static const Map<String, String> toneWebNormalisations =',
  '      <String, String>{',
  ...catFixtures.map((c) => `    ${dartStr(c)}: ${dartStr(c.toLowerCase().trim())},`),
  '  };',
  '',
  '  /// light pass tints.',
  '  static const Map<AppChipTone, AppCategoryChipTintSpec> light =',
  '      <AppChipTone, AppCategoryChipTintSpec>{',
  ...catToneNames.map(
    (t) =>
      `    AppChipTone.${t}: ${rowsSpecValue('AppCategoryChipTintSpec', ROW_TINT_FIELDS, rowsChipLight[t], '      ')},`,
  ),
  '  };',
  '',
  '  /// dark pass tints.',
  '  static const Map<AppChipTone, AppCategoryChipTintSpec> dark =',
  '      <AppChipTone, AppCategoryChipTintSpec>{',
  ...catToneNames.map(
    (t) =>
      `    AppChipTone.${t}: ${rowsSpecValue('AppCategoryChipTintSpec', ROW_TINT_FIELDS, rowsChipDark[t], '      ')},`,
  ),
  '  };',
  '',
  '  /// The tone as one brightness painted it.',
  '  static AppCategoryChipTintSpec tint(AppChipTone tone, Brightness brightness) {',
  '    final AppCategoryChipTintSpec? spec = (brightness == Brightness.dark ? dark : light)[tone];',
  '    if (spec == null) {',
  "      throw ArgumentError('no ${tone.name} tint was measured at ${brightness.name}');",
  '    }',
  '    return spec;',
  '  }',
  '',
  '  /// category → the Lucide symbol `CategoryChip.tsx` paints for it, as',
  "  /// `parity/icon-map.tsv` names it. The keys are the component's own lower-case",
  '  /// lookup keys; an unlisted category falls back to [fallbackGlyphSymbol], as the',
  '  /// component does. The icon dependency has not landed, so these are strings the',
  '  /// caller resolves, not symbols this file draws.',
  '  static const Map<String, String> glyphSymbols = <String, String>{',
  ...Object.entries(catIconMap).map(([k, web]) => `    ${dartStr(k)}: ${dartStr(catIconDart(web))},`),
  '  };',
  '',
  `  static const String fallbackGlyphSymbol = ${dartStr(catFallbackGlyph)};`,
  '}',
  '',
);
finish('app_rows.dart');

// ================================================================ app_faces.dart
//
// Item 9: the card face, the wallet deck its peers peek out of, and the three
// action keys under the hero balance. The family is measured as utility stacks
// (`parity/ui-tokens.cjs` §`face-*`/`deck-*`/`action-key-*`), so — exactly as for
// the ledger — every number below is read out of a re-checked record or out of the
// pinned stylesheet, and nothing is typed. Two facts the record already warns
// about are enforced here rather than remembered: the face box is *width-driven*
// (its measured `height` is the mount's own width over the authored ratio, so only
// the ratio is ported), and the deck's geometry only exists inside a `.deck`
// ancestor (which is why those rows were measured wrapped).
//
// Where another emitted family already owns a fact — `.card-face`'s radius and
// shadow tokens, the gold chip, the `.money` face — this file cross-checks the
// measurement against that owner and cites it, instead of restating it.

// ---------------------------------------------------------------- citations
const FACE_TSX = readTsx('components', 'ui', 'CardFace.tsx');
const DECK_TSX = readTsx('components', 'dashboard', 'WalletDeck.tsx');
const HERO_TSX = readTsx('components', 'dashboard', 'DashboardHero.tsx');
const FACE_FILES = {
  'src/components/ui/CardFace.tsx': FACE_TSX,
  'src/components/dashboard/WalletDeck.tsx': DECK_TSX,
  'src/components/dashboard/DashboardHero.tsx': HERO_TSX,
};

/** `rowsCite` plus the prop-default line the non-interactive arm leans on, so a doc
 *  comment cites every source line the record carries. */
const faceCite = (rec) => {
  const defaults = (rec.parts || []).map((p) => p.toneDefaultLine).filter((l) => l !== undefined);
  const base = rowsCite(rec);
  return defaults.length ? `${base} + ${rec.src || US.source}:${defaults.join(',')}` : base;
};

/**
 * The inline style a face-box row cites, re-composed from the arm it names rather
 * than read back out of the measured string. `CardFace.tsx` authors the box's
 * `width`, `min-width` and `aspect-ratio` in a ternary, so those numbers are app
 * code first and a measurement second: the arm line has to still say what the
 * record says it said, and what the browser resolved has to be exactly what that
 * line composes to. A bare `width,` contributes nothing here — the caller owns it.
 */
const faceInlineStyle = (p, name) => {
  const src = p.styleSrc;
  if (!Array.isArray(src) || src.length !== 2) {
    fail(`${name}: the inline style needs the "const style = fluid" line plus one arm, got ${JSON.stringify(src)}`);
  }
  if (!src.some((s) => s.text === 'const style = fluid')) {
    fail(`${name}: the style is not authored as \`const style = fluid\``);
  }
  const fluid = src.some((s) => /^\?\s*\{/.test(s.text));
  const fixed = src.some((s) => /^:\s*\{/.test(s.text));
  if (fluid === fixed) fail(`${name}: the style arms are not exactly one of \`?\` and \`:\``);
  const armLine = src.find((s) => (fluid ? /^\?\s*\{/ : /^:\s*\{/).test(s.text));
  const arm = armLine.text;
  const full = /width:\s*'([^']+)'/.exec(arm);
  const bare = /\{\s*width\s*,/.test(arm);
  const floor = /minWidth:\s*(\d+)/.exec(arm);
  const fallback = /minWidth:\s*width\s*\?\?\s*([\d.]+)/.exec(arm);
  const ratio = /aspectRatio:\s*'([\d.]+)'/.exec(arm);
  if (!ratio) fail(`${name}: the cited style arm "${arm}" authors no aspect ratio`);
  if (full && fallback) fail(`${name}: the cited style arm "${arm}" sets min-width twice`);
  if (bare && full) fail(`${name}: the cited style arm "${arm}" sets width twice`);
  const parts = [];
  if (full) parts.push(`width: ${full[1]}`);
  if (floor) parts.push(`min-width: ${floor[1]}px`);
  if (fallback) parts.push(`min-width: ${fallback[1]}px`);
  parts.push(`aspect-ratio: ${ratio[1]}`);
  const composed = parts.join('; ');
  if (composed !== p.style) {
    fail(`${name}: the cited arm composes to "${composed}", the record measured "${p.style}"`);
  }
  return {
    fluid,
    widthFull: full ? full[1] : null,
    callerOwnsWidth: bare,
    minWidthPx: floor ? parseFloat(floor[1]) : fallback ? parseFloat(fallback[1]) : null,
    aspectRatio: parseFloat(ratio[1]),
    armLine: armLine.line,
  };
};

/** The measured `aspect-ratio` is Chrome's resolved `W / 1`; the port wants the
 *  authored single number, and the two only agree when the ratio is exact. */
const faceAspectRatio = (brightness, name, authored) => {
  const raw = stkRaw(brightness, name, 'aspectRatio');
  const m = /^([\d.]+)\s*\/\s*([\d.]+)$/.exec(raw);
  if (!m) fail(`${name}: aspect-ratio "${raw}" is not the resolved "W / H" Chrome prints`);
  const [w, h] = [parseFloat(m[1]), parseFloat(m[2])];
  if (h !== 1 || w !== authored) {
    fail(`${name}: aspect-ratio resolves to ${w}/${h}, but the cited style arm authors '${authored}'`);
  }
  return w;
};

/** One row of the family, with everything the record cites proven against the
 *  pinned source before a measurement is taken from it: the class list (or the
 *  guarded ternary that writes it), the template its holes are filled from, the
 *  `FACE_TONES` array that lists its tone, the prop default the plain arm leans on
 *  and the inline style arm it measured. */
const faceChecked = (name) => {
  const rec = usRow(name);
  const file = rec.src || US.source;
  const lines = FACE_FILES[file];
  if (!lines) fail(`${name}: the face family cites ${file}, which app_faces.dart has no pinned source to check`);
  if (rec.tag !== undefined && rec.tag !== 'div' && rec.tag !== 'button') {
    fail(`${name}: recorded on a <${rec.tag}>, and this family ports boxes and buttons only`);
  }
  for (const p of rec.parts) {
    if (p.classOf !== undefined) {
      // The box composes its class list from one template, so the record cites the
      // line that template lives on and carries the list it composes as
      // `clsResolved`. Nothing here is a frozen fragment: the template is read off
      // the pinned source, both of its arms are re-derived, and the authored record
      // has to freeze this very line, or the citation points at text no test checks.
      if (p.cls !== undefined) fail(`${name}: a composed class list cannot also cite one verbatim`);
      if (typeof p.clsResolved !== 'string') fail(`${name}: cites a template it composes no class list from`);
      const of = p.classOf;
      const ofFile = of.src || file;
      const ofLines = FACE_FILES[ofFile];
      if (!ofLines) fail(`${name}: classOf points at ${ofFile}, which app_faces.dart has no pinned source for`);
      if (of.line === undefined) fail(`${name}: classOf names ${ofFile} without a line`);
      const raw = ofLines[of.line - 1];
      if (raw === undefined) fail(`${name}: ${ofFile} has no line ${of.line} for the class list`);
      const authored = raw.trim();
      const HEAD = 'const className = ';
      const QUOTE = String.fromCharCode(96);
      if (!authored.startsWith(HEAD + QUOTE) || !authored.endsWith(QUOTE + ';')) {
        fail(`${name}: ${ofFile}:${of.line} is not the class-list template: "${authored}"`);
      }
      const body = authored.slice(HEAD.length + 1, authored.length - 2);
      if (body.includes(QUOTE)) fail(`${name}: ${ofFile}:${of.line} holds more than one template literal`);
      const frozen = US.authoredNonCss.flatMap((e) =>
        (e.parts || []).filter((q) => (q.src || e.src || US.source) === ofFile && q.line === of.line),
      );
      if (frozen.length !== 1) {
        fail(
          `${name}: the template it composes from at ${ofFile}:${of.line} is frozen by ` +
            `${frozen.length} authored records, and the port reads those`,
        );
      }
      if (frozen[0].text !== authored) {
        fail(`${name}: ${ofFile}:${of.line} reads "${authored}", the record freezes "${frozen[0].text}"`);
      }
      const slots = body.split(/(\$\{[^{}]*\})/g);
      const holes = slots.filter((s) => s.startsWith('${'));
      const texts = slots.filter((s) => !s.startsWith('${'));
      if (holes.length !== 2 || texts.length !== 3) {
        fail(`${name}: ${ofFile}:${of.line} should hold two holes and three literal segments`);
      }
      if (holes[0] !== '${tone}')
        fail(`${name}: the first hole of ${ofFile}:${of.line} is not the tone: "${holes[0]}"`);
      const cursor = /^\$\{onClick \? '([^']+)' : ''\}$/.exec(holes[1]);
      if (!cursor) {
        fail(`${name}: the second hole of ${ofFile}:${of.line} is not the pointer-cursor ternary: "${holes[1]}"`);
      }
      if (p.tone === undefined) fail(`${name}: the class template fills a tone the record does not name`);
      const compose = (cursorCls) => texts.map((t, i) => t + (i === 0 ? p.tone : i === 1 ? cursorCls : '')).join('');
      if (![compose(cursor[1]), compose('')].includes(p.clsResolved)) {
        fail(`${name}: "${p.clsResolved}" is neither arm of ${ofFile}:${of.line}`);
      }
      if (p.toneTable) {
        const [first, last] = p.toneTable;
        tsxLine(ofLines, ofFile, first, 'const FACE_TONES: CardFaceTone[] = [');
        tsxLine(ofLines, ofFile, last, '];');
      }
      if (p.toneDefaultLine !== undefined) {
        tsxLine(ofLines, ofFile, p.toneDefaultLine, `tone = '${p.tone}'`);
      }
      if (p.style !== undefined) faceInlineStyle(p, name);
      continue;
    }
    if (p.cls === undefined) fail(`${name}: a cited part carries no class list`);
    if (p.guarded) {
      if (rec.parts.length !== 1) fail(`${name}: a guarded class list cannot share a row with another part`);
      tsxLine(lines, file, p.line, `'${p.cls}'`);
      continue;
    }
    tsxLine(lines, file, p.line, `className="${p.cls}"`);
  }
  return rec;
};

// ---------------------------------------------------------------- tones
/** The tones in the order `FACE_TONES` lists them, taken from the records rather
 *  than typed: a row is only a tone row if it fills the template's tone hole and
 *  cites the array. The array in the source then has to list exactly the tones the
 *  records measured, in that order. */
const faceToneRows = (() => {
  const out = [];
  for (const r of US.rows) {
    if (!/^face-box-/.test(r.name)) continue;
    const p = r.parts.find((x) => x.toneTable);
    if (!p) continue;
    if (r.name !== `face-box-${p.tone.replace(/^face-/, '')}`) {
      fail(`${r.name}: its tone is ${p.tone}, which the row name does not carry`);
    }
    if (out.some((x) => x.tone === p.tone)) fail(`${p.tone}: two face-box rows claim one tone`);
    out.push({ name: r.name, tone: p.tone, id: p.tone.replace(/^face-/, '') });
  }
  if (!out.length) fail('no face-box tone rows are recorded');
  const table = usRow(out[0].name).parts.find((x) => x.toneTable).toneTable;
  const listed = [];
  for (let l = table[0] + 1; l < table[1]; l++) {
    const m = /^\s*'(face-[a-z]+)',$/.exec(FACE_TSX[l - 1]);
    if (!m) fail(`FACE_TONES entry at src/components/ui/CardFace.tsx:${l} is not a quoted tone`);
    listed.push(m[1]);
  }
  const measured = out.map((x) => x.tone);
  if (JSON.stringify(listed) !== JSON.stringify(measured)) {
    fail(
      `FACE_TONES lists ${listed.join(', ')} at src/components/ui/CardFace.tsx:${table[0]}, ` +
        `while the measured rows carry ${measured.join(', ')}`,
    );
  }
  return out;
})();

/** The stack props of a row, with the four-pass agreements this family needs.
 *  `width` and `height` are the mount's own box at this viewport and are never
 *  read through these helpers; `faceBoxIsWidthDriven` proves that instead. */
const stkCompound = (brightness, name, field) => {
  const v = stkVal(brightness, name, field);
  if (!v || typeof v !== 'object' || typeof v.raw !== 'string') {
    fail(`${name}.${field} is not a measured compound value: ${JSON.stringify(v)}`);
  }
  return v;
};
const stkGradient = (brightness, name) => {
  const v = stkCompound(brightness, name, 'backgroundImage');
  if (v.raw === 'none') fail(`${name}: no background-image was measured, so there is no gradient to port`);
  return parseGradient(v.substituted || v.raw, `${name} background-image`);
};
const stkShadowLayers = (brightness, name) => {
  const v = stkCompound(brightness, name, 'boxShadow');
  if (v.raw === 'none') return null;
  return probeShadowList(v.substituted || v.raw, `${name} box-shadow`);
};
/** A property whose two viewports genuinely disagree — the responsive gap of the
 *  action key grid, and nothing else here. A pair that does not actually differ is
 *  a single value and `stkVal`’s business, so this refuses to carry one. */
const stkPair = (brightness, name, field) => {
  const narrow = stk(`${brightness}-phone`, name)[field];
  const wide = stk(`${brightness}-desktop`, name)[field];
  if (narrow === undefined || wide === undefined) {
    fail(`${name}: ${brightness} ${field} is missing on one of the two viewports`);
  }
  if (JSON.stringify(narrow) === JSON.stringify(wide)) {
    fail(`${name}: ${brightness} ${field} does not move with the viewport; read it with stkVal`);
  }
  return { narrow, wide };
};
/** `padding: T H B` / `T R B L` as the four sides a box needs. The action key is
 *  the only asymmetric member; a symmetric box passes the same number through. */
const facePadSides = (brightness, name) => {
  const raw = stkRaw(brightness, name, 'padding');
  const parts = raw.split(/\s+/).map((s) => lenAnyPx(s, `${name} padding`));
  if (parts.length > 4) fail(`${name}: padding "${raw}" has more than four sides`);
  const [top, right = top, bottom = top, left = right] = parts;
  return { top, right, bottom, left };
};
/** A radius the port draws as a pill. Chrome resolves Tailwind's `rounded-full` to
 *  a length far beyond any box, so the sentinel is recognised rather than carried,
 *  and the class list that asked for it is the evidence. */
const faceRadius = (brightness, name, cls) => {
  const px = stkLen(brightness, name, 'borderRadius');
  if (px > 1e4) {
    if (!/\brounded-full\b/.test(cls)) {
      fail(`${name}: radius ${px}px is a pill, but the cited class list has no \`rounded-full\``);
    }
    return { px: null, isPill: true };
  }
  if (/\brounded-full\b/.test(cls)) fail(`${name}: the class list says rounded-full, the measurement says ${px}px`);
  return { px, isPill: false };
};
// ---------------------------------------------------------------- the sheet
/** Whitespace as one space, and a call’s parentheses tight: prettier breaks the
 *  long `mask` and sheen declarations over lines, and the port reads them whole. */
const faceCssNorm = (s) => collapse(s).replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');

/** `.card-face` — the box every face is, before a tone paints it. Its radius and
 *  shadow are tokens another emitted family already owns, so they are named here
 *  and cross-checked, never restated. */
const faceBase = (() => {
  const cls = '.card-face';
  const rule = cssRule(/^\.card-face \{$/, cls);
  const allowed = ['position', 'overflow', 'border-radius', 'color', 'box-shadow'];
  const props = ruleProps(rule, cls);
  for (const [prop] of props) {
    if (!allowed.includes(prop)) {
      fail(`${cls}: the base rule sets \`${prop}\` (src/index.css:${rule.line}); AppCardFaceSpec cannot port it`);
    }
  }
  const decl = Object.fromEntries(props);
  const radiusToken = tokenRef(decl['border-radius'], `${cls} border-radius`, cls);
  const shadowToken = tokenRef(decl['box-shadow'], `${cls} box-shadow`, cls);
  if (decl.position !== 'relative') fail(`${cls}: position is "${decl.position}", not relative`);
  if (decl.overflow !== 'hidden') fail(`${cls}: overflow is "${decl.overflow}", not hidden`);
  if (decl.color !== 'white') fail(`${cls}: colour is authored "${decl.color}", not the face ink white`);
  return { cls, line: rule.line, radiusToken, shadowToken, decl, props };
})();

/** `::before` — the sheen. A probe cannot see a pseudo-element, so this is the
 *  pinned rule read whole (`.skeleton::after` and the chip ring set that
 *  precedent), and every number in it is parsed rather than paraphrased. */
const faceSheen = (() => {
  const cls = '.card-face::before';
  const rule = cssRule(/^\.card-face::before \{$/, cls, 20);
  const props = ruleProps(rule, cls);
  const allowed = ['content', 'position', 'inset', 'background', 'pointer-events'];
  for (const [prop] of props) {
    if (!allowed.includes(prop)) {
      fail(`${cls}: sets \`${prop}\` (src/index.css:${rule.line}); the sheen is a highlight and a stripe only`);
    }
  }
  const decl = Object.fromEntries(props);
  if (decl.content !== "''") fail(`${cls}: content is "${decl.content}", so it paints no layer`);
  if (decl.position !== 'absolute') fail(`${cls}: position is "${decl.position}"`);
  if (decl.inset !== '0px' && decl.inset !== '0') fail(`${cls}: inset is "${decl.inset}", not the whole box`);
  if (decl['pointer-events'] !== 'none') fail(`${cls}: pointer-events is "${decl['pointer-events']}"`);
  const layers = splitLayers(faceCssNorm(decl.background), cls);
  if (layers.length !== 2) fail(`${cls}: background paints ${layers.length} layers, not the highlight and the stripe`);
  const hi =
    /^radial-gradient\(([\d.]+)% ([\d.]+)% at ([\d.]+)% ([\d.]+)%, rgba\((\d+), (\d+), (\d+), ([\d.]+)\) ([\d.]+)%, transparent ([\d.]+)%\)$/.exec(
      layers[0],
    );
  if (!hi) fail(`${cls}: highlight layer "${layers[0]}" is not the sized elliptical fade the port records`);
  const stripe =
    /^repeating-linear-gradient\(([\d.]+)deg, transparent 0 ([\d.]+)px, rgba\((\d+), (\d+), (\d+), ([\d.]+)\) ([\d.]+)px ([\d.]+)px\)$/.exec(
      layers[1],
    );
  if (!stripe) fail(`${cls}: stripe layer "${layers[1]}" is not the repeating hairline the port records`);
  return {
    cls,
    line: rule.line,
    highlightCentreX: parseFloat(hi[3]) / 100,
    highlightCentreY: parseFloat(hi[4]) / 100,
    highlightRadiusX: parseFloat(hi[1]) / 100,
    highlightRadiusY: parseFloat(hi[2]) / 100,
    highlightColour: { r: +hi[5], g: +hi[6], b: +hi[7], alpha: parseFloat(hi[8]) },
    highlightFadeAt: parseFloat(hi[9]) / 100,
    highlightClearAt: parseFloat(hi[10]) / 100,
    stripeAngleDeg: parseFloat(stripe[1]),
    stripeClearUntilPx: parseFloat(stripe[2]),
    stripeColour: { r: +stripe[3], g: +stripe[4], b: +stripe[5], alpha: parseFloat(stripe[6]) },
    stripeFromPx: parseFloat(stripe[7]),
    stripeToPx: parseFloat(stripe[8]),
    authoredBackground: faceCssNorm(decl.background),
  };
})();

/** `.pressable` — the class the face box cites for its press. The face and the
 *  ledger row lean on the same rule, so the value is read again here rather than
 *  imported from the row family, and the two are pinned together by the drift
 *  tests over the sheet. */
const facePress = (() => {
  const cls = '.pressable';
  const rest = cssRule(/^\.pressable \{$/, cls);
  const active = cssRule(/^\.pressable:active \{$/, `${cls}:active`);
  const transition = controlTransition(rest, cls, ['transform']);
  return {
    cls,
    restLine: rest.line,
    activeLine: active.line,
    scale: cssScale(active, `${cls}:active`),
    ms: transition.ms,
    ease: transition.curve,
    props: transition.props,
  };
})();

/** One `.face-*` rule as the recipe it authors: an angled gradient of two
 *  `color-mix(in oklab, var(--hue-X) N%, var(--face-anchor))` stops, or a bare
 *  `var(--face-anchor)` for the tone that ends on the anchor itself. */
const faceGradientRecipe = (tone) => {
  const cls = `.${tone}`;
  const rule = cssRule(new RegExp(`^\\${cls} \\{$`), cls, 12);
  const props = ruleProps(rule, cls);
  for (const [prop] of props) {
    if (prop !== 'background') fail(`${cls}: sets \`${prop}\` (src/index.css:${rule.line}); a tone paints a gradient`);
  }
  const raw = faceCssNorm(cssDecl(rule, 'background', cls));
  const head = /^linear-gradient\(([\d.]+)deg, (.+) 0%, (.+) 100%\)$/.exec(raw);
  if (!head) fail(`${cls}: background "${raw}" is not a two-stop angled gradient`);
  const stops = [head[2], head[3]].map((text) => {
    const mix = /^color-mix\(in oklab, var\((--[a-z0-9-]+)\) ([\d.]+)%, var\((--[a-z0-9-]+)\)\)$/.exec(text);
    if (mix) return { hueToken: mix[1], mixPercent: parseFloat(mix[2]), anchorToken: mix[3], authored: text };
    const bare = /^var\((--[a-z0-9-]+)\)$/.exec(text);
    if (bare) return { anchorToken: bare[1], mixPercent: 0, authored: text };
    fail(`${cls}: stop "${text}" is neither a color-mix over the anchor nor the bare anchor`);
  });
  if (new Set(stops.map((s) => s.anchorToken)).size !== 1) {
    fail(`${cls}: its two stops mix over different anchors`);
  }
  return { cls, line: rule.line, angle: parseFloat(head[1]), stops, anchorToken: stops[0].anchorToken, raw };
};

/** The recipe against the measurement: the angle and stop count have to agree, and
 *  a stop the sheet authors as a bare token has to measure exactly that token’s
 *  colour. A `color-mix` is the engine’s arithmetic — the port takes the
 *  substituted pixels the pass measured, which is the same law §2.2 gradients use. */
const faceGradientCheck = (tone, recipe, gradient, brightness) => {
  if (gradient.angle !== recipe.angle) {
    fail(`.${tone}: ${brightness} measures a ${gradient.angle}deg gradient, the rule authors ${recipe.angle}deg`);
  }
  if (gradient.stops.length !== recipe.stops.length) {
    fail(`.${tone}: ${brightness} measured ${gradient.stops.length} stops, the rule authors ${recipe.stops.length}`);
  }
  for (const [i, stop] of recipe.stops.entries()) {
    if (stop.mixPercent !== 0) continue;
    const token = passTheme(`${brightness}-phone`).root[stop.anchorToken];
    if (!token || !token.srgb) fail(`.${tone}: ${stop.anchorToken} is not a measured colour in ${brightness}-phone`);
    const got = gradient.stops[i].colour;
    const want = token.srgb;
    if (got.r !== want.r || got.g !== want.g || got.b !== want.b || got.a !== want.alpha) {
      fail(
        `.${tone}: ${brightness} stop ${i} measured rgba(${got.r}, ${got.g}, ${got.b}, ${got.a}) ` +
          `while ${stop.anchorToken} is ${want.rgba}`,
      );
    }
  }
};

/** The §6 probe for the tone rule, which has to be the same gradient the width
 *  driven face-box row measured: the box and the class are one paint. */
const faceProbeGradient = (tone, brightness) => {
  const probe = passTheme(`${brightness}-phone`).probes[`.${tone}`];
  if (!probe) fail(`.${tone}: ${brightness}-phone measured no probe`);
  return probeGradient(probe, `.${tone}`);
};
// ---------------------------------------------------------------- the face
const faceSpacingUnit = rowsSpacingPx('app_faces.dart');

/** A class rule in the pinned sheet, or null: a utility token that has no rule of
 *  its own is a Tailwind compile, not a ported class. */
const faceRuleOrNull = (token) => {
  const safe = token.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const re = new RegExp(`^\\.${safe} \\{$`);
  if (!CSS_LINES.some((l) => re.test(l))) return null;
  return cssRule(re, `.${token}`, 32);
};

/** The one ported typography class a class list cites — the class whose rule
 *  authors a font, a numeral alignment, a tracking or a case. A slot that cites
 *  two of them stops generation: the port cannot say which one it renders. */
const faceTypeClass = (name, cls) => {
  const TYPE_PROPS = ['font-family', 'font-variant-numeric', 'letter-spacing', 'text-transform'];
  const hits = [];
  for (const token of cls.split(/\s+/).filter(Boolean)) {
    const rule = faceRuleOrNull(token);
    if (!rule) continue;
    const props = new Set(ruleProps(rule, `.${token}`).map(([p]) => p));
    if (TYPE_PROPS.some((p) => props.has(p))) hits.push({ token: `.${token}`, rule });
  }
  if (hits.length > 1) {
    fail(`${name}: the class list cites ${hits.map((h) => h.token).join(' and ')} — two authored type classes`);
  }
  return hits.length ? hits[0] : null;
};

/** Every `p-*`/`px-*`/`py-*`/`mt-*`/`mb-*`/`gap-*` utility the cited class list
 *  authors, as `--spacing` times its multiplier, against what the pass painted.
 *  `space-y-*` is deliberately not one of them: it authors no offset on the
 *  element that carries it, only on the children after the first, so it belongs to
 *  `faceWrapSpacing` — which reads it off the wrapper a *child* row records and
 *  requires the child's own measured margin to be exactly that. */
const faceOffsets = (brightness, name, cls, got, wrapped = null) => {
  const WRAP_SIDE = { mt: 'marginTopPx', mb: 'marginBottomPx' };
  const OFFSET = /^(!?)(p|px|py|mt|mb|gap)-(\d+(?:\.\d+)?)$/;
  const tokens = cls.split(/\s+/).filter((t) => t.length);
  const cited = tokens.filter((t) => /(^|!)(p|px|py|mt|mb|gap)-/.test(t));
  const spaced = tokens.filter((t) => /^space-[xy]-/.test(t));
  if (spaced.length > 1) fail(`${name}: the class list authors ${spaced.join(' and ')} — one spacing utility`);
  const wanted = { p: null, px: null, py: null, mt: null, mb: null, gap: null };
  for (const tok of cited) {
    const m = OFFSET.exec(tok);
    if (!m) {
      fail(
        `${name}: "${tok}" is a variant-gated or shorthand offset the face port cannot attribute — ` +
          'an offset has to be a bare utility, and the box spacing has to be written per axis',
      );
    }
    const px = parseFloat(m[3]) * faceSpacingUnit;
    if (wanted[m[2]] !== null && wanted[m[2]] !== px) {
      fail(`${name}: two utilities author ${m[2]} with different pixels (${wanted[m[2]]} and ${px})`);
    }
    wanted[m[2]] = px;
  }
  const sides = {
    top: got.paddingTopPx,
    right: got.paddingRightPx,
    bottom: got.paddingBottomPx,
    left: got.paddingLeftPx,
  };
  if (wanted.p !== null) {
    for (const [side, px] of Object.entries(sides)) {
      if (px !== wanted.p)
        fail(`${name}: \`p-${wanted.p / faceSpacingUnit}\` authors ${wanted.p}px, ${side} measured ${px}px`);
    }
  }
  // Each axis is then proven on its own, which is also what catches a side that
  // measures padding no utility authored: the wanted number falls back to the
  // shorthand and then to zero, and the measured pixel has to answer to it.
  for (const [axis, pair] of [
    ['py', [sides.top, sides.bottom]],
    ['px', [sides.left, sides.right]],
  ]) {
    const want = wanted[axis] === null ? (wanted.p === null ? 0 : wanted.p) : wanted[axis];
    for (const px of pair) {
      if (px !== want) fail(`${name}: ${axis} measured ${px}px, the cited class list authors ${want}px`);
    }
  }
  for (const [axis, px] of [
    ['mt', got.marginTopPx],
    ['mb', got.marginBottomPx],
  ]) {
    const own = wanted[axis];
    const fromWrapper = wrapped && wrapped.side === WRAP_SIDE[axis] ? wrapped.px : null;
    if (own !== null && fromWrapper !== null) {
      fail(
        `${name}: the row authors a ${axis} utility and its space-y wrapper authors ${fromWrapper}px on the same side`,
      );
    }
    const want = own !== null ? own : fromWrapper === null ? 0 : fromWrapper;
    if (px !== want) {
      fail(
        `${name}: ${axis} measured ${px}px, the cited class list${fromWrapper === null ? '' : ' or its wrapper'} authors ${want}px ` +
          `(${cited.join(' ') || 'no offset utility'}) at --spacing ${faceSpacingUnit}px`,
      );
    }
  }
  const gapWant = wanted.gap === null ? null : wanted.gap;
  if ((got.gapPx === null ? null : got.gapPx) !== gapWant) {
    fail(`${name}: gap measured ${got.gapPx}, the cited class list authors ${gapWant}`);
  }
};

/** The `.deck` wrapper a peeking face was measured inside, and the `space-y-*`
 *  rule the chip row and the masked number were measured under. Both give a
 *  margin to a child that authors none of its own, so the utility is read off the
 *  cited wrapper line and the measured pixel has to answer to it. */
const faceWrapSpacing = (rec, brightness) => {
  if (rec.wrap === undefined) return null;
  const m = /^space-y-([\d.]+)$/.exec(rec.wrap.split(/\s+/).find((t) => /^space-y-/.test(t)) || '');
  if (!m) fail(`${rec.name}: the wrapper "${rec.wrap}" authors no space-y utility`);
  const px = parseFloat(m[1]) * faceSpacingUnit;
  const file = rec.src || US.source;
  tsxLine(FACE_FILES[file], file, rec.wrapPart.line, `className="${rec.wrapPart.cls}"`);
  if (rec.after === undefined && rec.before === undefined) fail(`${rec.name}: a wrapped row names no sibling side`);
  return { px, after: rec.after === true, before: rec.before === true };
};

const faceBodyInk = (brightness) => probeSrgb(passTheme(`${brightness}-phone`).probes.body, 'color', 'body');

/** One slot of a face, or of the key: read twice (once per brightness) and only
 *  ported once, because the measurement says the geometry does not move. */
const faceSlotRead = (brightness, name, opts) => {
  const rec = faceChecked(name);
  const cls = rec.parts.map((p) => p.cls).join(' ');
  const sizePx = stkLen(brightness, name, 'fontSize');
  const lineHeightPx = stkLen(brightness, name, 'lineHeight');
  const track = stkTrack(brightness, name, sizePx);
  const sides = facePadSides(brightness, name);
  const rowGap = stkRaw(brightness, name, 'rowGap');
  const colGap = stkRaw(brightness, name, 'columnGap');
  if (rowGap !== colGap) fail(`${name}: the two gap axes disagree (${rowGap} / ${colGap})`);
  const out = {
    name,
    cls,
    src: faceCite(rec),
    displayCss: stkRaw(brightness, name, 'display'),
    positionCss: stkRaw(brightness, name, 'position'),
    zIndexCss: stkRaw(brightness, name, 'zIndex'),
    flexDirectionCss: stkRaw(brightness, name, 'flexDirection'),
    alignItemsCss: stkRaw(brightness, name, 'alignItems'),
    justifyContentCss: stkRaw(brightness, name, 'justifyContent'),
    gapPx: rowGap === 'normal' ? null : stkLen(brightness, name, 'rowGap'),
    marginTopPx: stkLen(brightness, name, 'marginTop'),
    marginBottomPx: stkLen(brightness, name, 'marginBottom'),
    paddingTopPx: sides.top,
    paddingRightPx: sides.right,
    paddingBottomPx: sides.bottom,
    paddingLeftPx: sides.left,
    fontFamily: (() => {
      const type = opts.typeClass;
      if (type === null) {
        return firstFamily(probeRaw(passTheme(`${brightness}-phone`).probes.body, 'fontFamily', 'body'), name);
      }
      const probe = passTheme(`${brightness}-phone`).probes[type.token];
      if (!probe) fail(`${name}: ${type.token} measured no probe, so its family cannot be read`);
      const authored = faceSlotAuthoredFamily(type, brightness);
      const got = firstFamily(probeRaw(probe, 'fontFamily', type.token), type.token);
      if (authored !== null && authored !== got) {
        fail(`${name}: ${type.token} computes to ${got} while its rule authors ${authored}`);
      }
      return got;
    })(),
    fontSizePx: sizePx,
    fontWeight: parseInt(stkRaw(brightness, name, 'fontWeight'), 10),
    heightRatio: lineHeightPx / sizePx,
    letterSpacingPx: track.px,
    letterSpacingEm: track.em,
    textColor: null,
    inheritsFaceInk: false,
    textTransformCss: stkHas(brightness, name, 'textTransform') ? stkRaw(brightness, name, 'textTransform') : null,
    whiteSpaceCss: stkRaw(brightness, name, 'whiteSpace'),
    textOverflowCss: stkRaw(brightness, name, 'textOverflow'),
    overflowXCss: stkRaw(brightness, name, 'overflowX'),
    overflowYCss: stkRaw(brightness, name, 'overflowY'),
    truncates: /\btruncate\b/.test(cls),
    tabularNums: opts.tabular,
    authoredTypeClass: opts.typeClass ? opts.typeClass.token : null,
    authoredTypeSrc: opts.typeClass ? `src/index.css:${opts.typeClass.rule.line}` : null,
    radius: faceRadius(brightness, name, cls),
    borderWidthPx: stkLen(brightness, name, 'borderTopWidth'),
    borderColor: null,
    minWidthZero: stkHas(brightness, name, 'minWidth') ? stkRaw(brightness, name, 'minWidth') === '0px' : null,
    flexGrow: stkNum(brightness, name, 'flexGrow'),
    flexShrink: stkNum(brightness, name, 'flexShrink'),
  };
  // Colour: a slot either paints white at a fraction (a utility the class list
  // names) or paints nothing at all and takes the face’s ink. Anything else is a
  // colour this family has no evidence for.
  const col = stkCol(brightness, name, 'color');
  const ink = faceBodyInk(brightness);
  if (col.hex === ink.hex && col.alpha === ink.alpha) {
    out.inheritsFaceInk = true;
  } else if (col.r === 255 && col.g === 255 && col.b === 255) {
    out.textColor = col;
  } else {
    fail(`${name}: ${brightness} measures colour ${col.rgba}, which is neither the body ink ${ink.rgba} nor white`);
  }
  if (out.borderWidthPx > 0) {
    const top = stkCol(brightness, name, 'borderTopColor');
    const left = stkCol(brightness, name, 'borderLeftColor');
    if (top.rgba !== left.rgba) fail(`${name}: the frame measures ${top.rgba} on top and ${left.rgba} on the left`);
    out.borderColor = top;
  } else if (stkCol(brightness, name, 'borderTopColor').rgba !== stkCol(brightness, name, 'borderLeftColor').rgba) {
    fail(`${name}: a frameless slot measures different border colours on different sides`);
  }
  // The truncate trio, the case and the numeral alignment are all proven against
  // the class list, exactly as the ledger slots are.
  if (out.truncates) {
    for (const [field, want] of [
      ['whiteSpace', 'nowrap'],
      ['textOverflow', 'ellipsis'],
      ['overflowX', 'hidden'],
      ['overflowY', 'hidden'],
    ]) {
      if (stkRaw(brightness, name, field) !== want) {
        fail(`${name}: claims \`truncate\` but ${field} measured ${stkRaw(brightness, name, field)}`);
      }
    }
  } else if (out.textOverflowCss !== 'clip') {
    fail(`${name}: a non-truncating slot measures ${out.textOverflowCss} text-overflow`);
  }
  // The wrapper is read before the row's own offsets, because `space-y-*` gives a
  // child a margin it authors nothing of its own about. Which child carries it is
  // not the sibling marker's answer but the pass's: Tailwind v4 puts the space on
  // the *first* child's bottom, so the row facing the next sibling may measure it
  // and the row facing the previous one may not — and either way the row may
  // measure nothing, because the space belongs between the two.
  const wrap = faceWrapSpacing(rec, brightness);
  let wrapped = null;
  if (wrap) {
    const facing = wrap.after ? 'marginBottomPx' : 'marginTopPx';
    const away = facing === 'marginBottomPx' ? 'marginTopPx' : 'marginBottomPx';
    if (out[away] !== 0)
      fail(`${name}: ${away} measured ${out[away]} under a space-y wrapper, which spaces only between neighbours`);
    if (out[facing] !== 0 && out[facing] !== wrap.px) {
      fail(
        `${name}: ${facing} measured ${out[facing]} while the wrapper "${rec.wrap}" authors ${wrap.px}px at --spacing ${faceSpacingUnit}px`,
      );
    }
    wrapped = out[facing] === wrap.px ? { side: facing, px: wrap.px } : null;
  }
  faceOffsets(brightness, name, cls, out, wrapped);
  faceTrackingCheck(brightness, name, cls, out, opts);
  out.leading = faceLeadingCheck(brightness, name, cls, out);
  if (out.flexGrow !== 0)
    fail(`${name}: a face slot measures flex-grow ${out.flexGrow}, which the port does not lay out`);
  return out;
};

/** The family a ported type class authors, when its rule names one — read from the
 *  token so the computed probe and the stylesheet have to agree. */
const faceSlotAuthoredFamily = (type, brightness) => {
  const decl = Object.fromEntries(ruleProps(type.rule, type.token))['font-family'];
  if (decl === undefined) return null;
  return firstFamily(
    passTheme(`${brightness}-phone`).root[tokenRef(decl, `${type.token} font-family`, type.token)].raw,
    type.token,
  );
};

/** A tracking value is only ported with the source that authored it: a
 *  `tracking-*` utility (whose token the measurement has to reproduce), an
 *  arbitrary `tracking-[…em]` literal, or the ported type class. `normal` is no
 *  tracking at all and is the only thing a slot with none of those may measure. */
const faceTrackingCheck = (brightness, name, cls, out, opts) => {
  const arbitrary = /tracking-\[(-?[\d.]+)em\]/.exec(cls);
  const utility = /\btracking-(tight|normal|wide|wider|widest)\b/.exec(cls);
  let want = null;
  let source = null;
  if (arbitrary) {
    want = parseFloat(arbitrary[1]);
    source = `the \`tracking-[${arbitrary[1]}em]\` utility`;
  } else if (utility) {
    const token = `--tracking-${utility[1]}`;
    const raw = passTheme(`${brightness}-phone`).root[token];
    if (!raw) fail(`${name}: ${token} is not measured in ${brightness}-phone`);
    const m = /^(-?[\d.]+)em$/.exec(collapse(raw.raw));
    if (!m) fail(`${name}: ${token} is "${raw.raw}", not an em length`);
    want = parseFloat(m[1]);
    source = token;
  } else if (opts.typeClass) {
    const decl = Object.fromEntries(ruleProps(opts.typeClass.rule, opts.typeClass.token))['letter-spacing'];
    if (decl === undefined) {
      want = 0;
      source = `${opts.typeClass.token} authors no letter-spacing`;
    } else {
      const m = /^(-?[\d.]+)em$/.exec(faceCssNorm(decl));
      if (!m) fail(`${name}: ${opts.typeClass.token} authors letter-spacing "${decl}", not an em length`);
      want = parseFloat(m[1]);
      source = opts.typeClass.token;
    }
  } else {
    want = 0;
    source = 'no tracking source';
  }
  if (Math.abs(out.letterSpacingEm - want) > 1e-12 || (want === 0 && out.letterSpacingPx !== 0)) {
    fail(
      `${name}: ${brightness} measures ${out.letterSpacingPx}px (${out.letterSpacingEm}em) at ${out.fontSizePx}px, ${source} says ${want}em`,
    );
  }
  // The same product the pass divided, compared with the float's own slack: an
  // authored `0.14em` of a 10px size is 1.4px in Chrome and 1.4000000000000001 in
  // IEEE-754, and a tracking that disagrees by more than that is a different tracking.
  if (Math.abs(out.letterSpacingPx - want * out.fontSizePx) > 1e-9 && !(want === 0 && out.letterSpacingPx === 0)) {
    fail(`${name}: ${out.letterSpacingPx}px is not ${want}em of ${out.fontSizePx}px`);
  }
};

/** A slot’s line box. Tailwind authors a leading only as a utility, so either the
 *  class names one (and the measured ratio is that utility’s number) or the slot
 *  inherits the document multiplier, which the `body` probe measures. */
const faceLeadingCheck = (brightness, name, cls, out) => {
  const utility = /\bleading-([a-z]+|none)\b/.exec(cls);
  if (utility === null) {
    const bodyProbe = passTheme(`${brightness}-phone`).probes.body;
    const bodyRatio = probePx(bodyProbe, 'lineHeight', 'body') / probePx(bodyProbe, 'fontSize', 'body');
    if (Math.abs(out.heightRatio - bodyRatio) > 1e-9) {
      fail(
        `${name}: its line box is ${out.heightRatio}x its size with no leading utility; body measures ${bodyRatio}x`,
      );
    }
    return { leadingUtility: null, leadingToken: null, leadingValue: bodyRatio };
  }
  if (utility[1] === 'none') {
    if (out.heightRatio !== 1) {
      fail(`${name}: \`leading-none\` authors a 1x line box, the pass measured ${out.heightRatio}x`);
    }
    return { leadingUtility: 'none', leadingToken: null, leadingValue: 1 };
  }
  const token = `--leading-${utility[1]}`;
  const raw = passTheme(`${brightness}-phone`).root[token];
  if (!raw) fail(`${name}: ${token} is not measured in ${brightness}-phone`);
  const value = ratioOf(collapse(raw.raw), token);
  if (Math.abs(out.heightRatio - value) > 1e-9) {
    fail(`${name}: ${token} is ${value}x, the pass measured ${out.heightRatio}x`);
  }
  return { leadingUtility: utility[1], leadingToken: token, leadingValue: value };
};

/** One slot, read twice: the measurement says a face does not move between the
 *  schemes, so a record that disagrees is a drift to review, not a pair to port. */
const faceSlot = (name, opts) => {
  const rec = usRow(name);
  const cls = rec.parts.map((p) => p.cls).join(' ');
  const typeClass = faceTypeClass(name, cls);
  const tabular =
    typeClass !== null &&
    faceCssNorm(Object.fromEntries(ruleProps(typeClass.rule, typeClass.token))['font-variant-numeric'] || 'none') ===
      'tabular-nums';
  const built = { ...opts, typeClass, tabular };
  const light = faceSlotRead('light', name, built);
  const dark = faceSlotRead('dark', name, built);
  for (const key of Object.keys(light)) {
    if (JSON.stringify(light[key]) !== JSON.stringify(dark[key])) {
      fail(
        `${name}: ${key} moves with the scheme (light ${JSON.stringify(light[key])}, dark ${JSON.stringify(dark[key])})`,
      );
    }
  }
  return light;
};
// ---------------------------------------------------------------- the box
/** The mount’s own pixels, read only to prove the box is width-driven: a
 *  `width: 100%` box with an aspect ratio has no height of its own, so the port
 *  carries the ratio and the floor and never this number. Chrome snaps a layout
 *  size to 1/64 px, which is the bound the check uses. */
const faceBoxSize = (tag, name) => {
  const p = stk(tag, name);
  if (typeof p.width !== 'string' || typeof p.height !== 'string') {
    fail(`${name}: ${tag} did not measure a plain width/height pair`);
  }
  return { w: lenAnyPx(p.width, `${name} width at ${tag}`), h: lenAnyPx(p.height, `${name} height at ${tag}`) };
};
const faceWidthDriven = (name, ratio) => {
  for (const tag of ['light-desktop', 'dark-desktop', 'light-phone', 'dark-phone']) {
    const { w, h } = faceBoxSize(tag, name);
    if (Math.abs(h - w / ratio) > 1 / 64) {
      fail(
        `${name}: ${tag} measured a ${w}x${h} box, which is not width ${w} over the authored ratio ${ratio} ` +
          '(± Chrome’s 1/64px layout snap) — the height is no longer a mount artifact',
      );
    }
  }
};

const faceBoxRead = (brightness, name) => {
  const rec = faceChecked(name);
  const p = rec.parts[0];
  // The part's `cls` is the authored template, which a drift test re-reads at
  // CardFace.tsx:59; the box this row measures carries the template with both
  // holes filled, which is `clsResolved` and what every read below compares to.
  if (p.clsResolved === undefined) fail(`${name}: the box record composes no class list from its template`);
  const cls = p.clsResolved;
  const style = faceInlineStyle(p, name);
  if (!stkHas(brightness, name, 'cursor')) fail(`${name}: the pass measured no cursor, so interactivity is unknown`);
  const cursor = stkRaw(brightness, name, 'cursor');
  const interactive = cursor === 'pointer';
  if (interactive !== /\bcursor-pointer\b/.test(cls)) {
    fail(`${name}: cursor "${cursor}" disagrees with the cited class list`);
  }
  const sides = facePadSides(brightness, name);
  const rowGap = stkRaw(brightness, name, 'rowGap');
  if (rowGap !== stkRaw(brightness, name, 'columnGap')) fail(`${name}: the two gap axes disagree`);
  const out = {
    name,
    cls,
    src: faceCite(rec),
    styleSrc: `${(rec.src || US.source).replace(/^src\//, 'src/')}:${style.armLine}`,
    aspectRatio: faceAspectRatio(brightness, name, style.aspectRatio),
    minWidthPx: style.minWidthPx,
    callerOwnsWidth: style.callerOwnsWidth,
    widthFull: style.widthFull,
    interactive,
    cursorCss: cursor,
    displayCss: stkRaw(brightness, name, 'display'),
    positionCss: stkRaw(brightness, name, 'position'),
    flexDirectionCss: stkRaw(brightness, name, 'flexDirection'),
    alignItemsCss: stkRaw(brightness, name, 'alignItems'),
    justifyContentCss: stkRaw(brightness, name, 'justifyContent'),
    textAlignCss: stkRaw(brightness, name, 'textAlign'),
    gapPx: rowGap === 'normal' ? null : stkLen(brightness, name, 'rowGap'),
    marginTopPx: stkLen(brightness, name, 'marginTop'),
    marginBottomPx: stkLen(brightness, name, 'marginBottom'),
    paddingTopPx: sides.top,
    paddingRightPx: sides.right,
    paddingBottomPx: sides.bottom,
    paddingLeftPx: sides.left,
    radius: faceRadius(brightness, name, cls),
    borderWidthPx: stkLen(brightness, name, 'borderTopWidth'),
    ink: stkCol(brightness, name, 'color'),
    overflowXCss: stkRaw(brightness, name, 'overflowX'),
    overflowYCss: stkRaw(brightness, name, 'overflowY'),
    fill: stkCol(brightness, name, 'backgroundColor'),
    gradient: stkGradient(brightness, name),
    shadow: stkShadowLayers(brightness, name),
    blur: stkRaw(brightness, name, 'backdropFilter'),
    flexGrow: stkNum(brightness, name, 'flexGrow'),
    flexShrink: stkNum(brightness, name, 'flexShrink'),
  };
  faceOffsets(brightness, name, cls, out);
  if (out.marginTopPx !== 0 || out.marginBottomPx !== 0)
    fail(`${name}: the face box measures a margin it does not author`);
  if (out.displayCss !== 'flex' || out.flexDirectionCss !== 'column') {
    fail(`${name}: the box measures ${out.displayCss}/${out.flexDirectionCss}, not a flex column`);
  }
  if (out.justifyContentCss !== 'space-between') fail(`${name}: justify-content is ${out.justifyContentCss}`);
  if (out.alignItemsCss !== 'normal')
    fail(`${name}: align-items is ${out.alignItemsCss}, which the port cannot lay out`);
  if (out.textAlignCss !== 'left') fail(`${name}: text-align is ${out.textAlignCss}, not the authored left`);
  if (out.overflowXCss !== 'hidden' || out.overflowYCss !== 'hidden') {
    fail(`${name}: the box measures overflow ${out.overflowXCss}/${out.overflowYCss}; the sheen needs it clipped`);
  }
  if (out.positionCss !== faceBase.decl.position) {
    fail(`${name}: position measures ${out.positionCss} while .card-face authors ${faceBase.decl.position}`);
  }
  if (
    out.radius.isPill ||
    out.radius.px !== lengthPx(passTheme(`${brightness}-phone`).root[faceBase.radiusToken].raw, faceBase.radiusToken)
  ) {
    fail(`${name}: radius ${JSON.stringify(out.radius)} is not ${faceBase.radiusToken}`);
  }
  if (out.borderWidthPx !== 0) fail(`${name}: the face box measures a ${out.borderWidthPx}px frame`);
  if (out.fill.alpha !== 0) fail(`${name}: the face box paints ${out.fill.rgba} under its gradient`);
  if (out.blur !== 'none') fail(`${name}: the face box measures backdrop-filter ${out.blur}`);
  if (out.ink.rgba !== 'rgba(255, 255, 255, 1)') fail(`${name}: the face ink is ${out.ink.rgba}, not white`);
  if (out.flexGrow !== 0) fail(`${name}: the face box measures flex-grow ${out.flexGrow}`);
  faceWidthDriven(name, out.aspectRatio);
  if (!/\bpressable\b/.test(cls)) fail(`${name}: the face box cites no pressable rule for its press`);
  return out;
};

/** The box as one brightness painted it: geometry from the light pass (proven not
 *  to move), paint from the pass that measured it. */
const faceBox = (name) => {
  const light = faceBoxRead('light', name);
  const dark = faceBoxRead('dark', name);
  for (const key of Object.keys(light)) {
    if (['gradient', 'shadow', 'ink'].includes(key)) continue;
    if (JSON.stringify(light[key]) !== JSON.stringify(dark[key])) {
      fail(
        `${name}: ${key} moves with the scheme (light ${JSON.stringify(light[key])}, dark ${JSON.stringify(dark[key])})`,
      );
    }
  }
  if (light.ink.rgba !== dark.ink.rgba) fail(`${name}: the face ink moves with the scheme`);
  return { ...light, paint: { light, dark } };
};

/** The `.card-face` probe and the `--shadow-float` token, against what a face
 *  measured: the box, its radius, its ink and its float are one fact owned by
 *  AppSurfaces and AppShadows, so this file checks them and cites them. */
const faceBaseCrossChecks = () => {
  const surface = surfaces.find((s) => s.cls === '.card-face');
  if (!surface) fail('app_faces.dart needs the §6 .card-face surface, which AppSurfaces did not emit');
  const token = shadowTokens.find((s) => s.name === faceBase.shadowToken);
  if (!token) fail(`.card-face paints ${faceBase.shadowToken}, which is not an emitted §2.2 shadow token`);
  for (const [brightness, side] of [
    ['light', 'l'],
    ['dark', 'd'],
  ]) {
    const probe = surface[side];
    if (probe.paddingPx !== 0) fail(`.card-face paints ${probe.paddingPx}px of padding; the face box owns its own`);
    if (probe.gradient !== null) fail('.card-face now paints a gradient of its own; the tone rules own the face paint');
    if (probe.borderWidthPx !== 0) fail('.card-face measures a frame the sheet does not author');
    if (probe.backdrop.px !== null) fail('.card-face measures a backdrop blur the sheet does not author');
    if (probe.textColor.rgba !== 'rgba(255, 255, 255, 1)') fail(`.card-face measures ink ${probe.textColor.rgba}`);
    const want = parseShadow(token[`${brightness}Raw`], faceBase.shadowToken);
    for (const tone of faceToneRows) {
      const box = faceBoxRead(brightness, tone.name);
      if (probe.radiusPx !== box.radius.px) {
        fail(`${tone.name}: measures radius ${box.radius.px} while the .card-face probe measures ${probe.radiusPx}`);
      }
      const got = box.shadow;
      if (got.length !== want.length) {
        fail(
          `${tone.name}: ${brightness} measures ${got.length} shadow layers, ${faceBase.shadowToken} authors ${want.length}`,
        );
      }
      for (const [i, layer] of want.entries()) {
        const g = got[i];
        if (g.dx !== layer.dx || g.dy !== layer.dy || g.blur !== layer.blur || g.spread !== layer.spread) {
          fail(
            `${tone.name}: ${brightness} shadow ${i} is ${g.dx}/${g.dy}/${g.blur}/${g.spread}, the token authors ${layer.dx}/${layer.dy}/${layer.blur}/${layer.spread}`,
          );
        }
        if (
          g.colour.r !== layer.colour.r ||
          g.colour.g !== layer.colour.g ||
          g.colour.b !== layer.colour.b ||
          g.colour.a !== layer.colour.a
        ) {
          fail(
            `${tone.name}: ${brightness} shadow ${i} paints rgba(${g.colour.r}, ${g.colour.g}, ${g.colour.b}, ${g.colour.a}), the token authors ${layer.colour.r}/${layer.colour.g}/${layer.colour.b}/${layer.colour.a}`,
          );
        }
      }
    }
  }
  const radiiTok = passTheme('light-phone').root[faceBase.radiusToken];
  if (!radiiTok) fail(`${faceBase.radiusToken} is not measured in the light-phone pass`);
  const radiusPx = lengthPx(radiiTok.raw, faceBase.radiusToken);
  const emittedRadius = byKind.radii.find((o) => o.name === faceBase.radiusToken);
  if (!emittedRadius) {
    fail(`${faceBase.radiusToken} is the corner .card-face asks for, but app_radii.dart emits no such token`);
  }
  if (px(emittedRadius) !== radiusPx) {
    fail(
      `${faceBase.radiusToken} resolves to ${radiusPx}px in the pass while app_radii.dart publishes ` +
        `${px(emittedRadius)}px — [AppCardFaceSpec.radiusPx] would resolve a corner nobody measured`,
    );
  }
  return { surface, token, radiusPx };
};

/** The gold chip, which AppChips already owns. The face row measured the same box,
 *  so the two are pinned together rather than ported twice. */
const faceChipRow = (brightness) => {
  const name = 'face-chip';
  const rec = faceChecked(name);
  const cls = rec.parts.map((p) => p.cls).join(' ');
  if (collapse(cls) !== collapse(faceChip.cls.slice(1))) {
    fail(`${name}: cites "${cls}", which is not the ${faceChip.cls} class AppChips paints`);
  }
  const probe = passTheme(`${brightness}-phone`).probes[faceChip.cls];
  if (!probe) fail(`${name}: ${faceChip.cls} measured no probe in ${brightness}-phone`);
  const size = { w: stkLen(brightness, name, 'width'), h: stkLen(brightness, name, 'height') };
  if (size.w !== faceChip.widthPx || size.h !== faceChip.heightPx) {
    fail(
      `${name}: the face measured ${size.w}x${size.h} while AppChips ports ${faceChip.widthPx}x${faceChip.heightPx}`,
    );
  }
  if (stkLen(brightness, name, 'borderRadius') !== faceChip.radiusPx) {
    fail(`${name}: radius ${stkLen(brightness, name, 'borderRadius')} != the chip's ${faceChip.radiusPx}`);
  }
  gEq(faceChip.gradient, stkGradient(brightness, name), `${name} ${brightness}`);
  if (stkRaw(brightness, name, 'position') !== 'relative')
    fail(`${name}: the chip no longer sits positioned for its ring`);
  if (stkCol(brightness, name, 'backgroundColor').alpha !== 0)
    fail(`${name}: the chip paints a fill under its gradient`);
  return {
    name,
    cls,
    src: faceCite(rec),
    widthPx: size.w,
    heightPx: size.h,
    authoredSrc: `${faceChip.restSrc} + ${faceChip.afterSrc}`,
  };
};
/** An authored length that may be written as a unitless zero, which is how the
 *  sheet writes the deck's full bleed. */
const len0 = (raw, label) => (collapse(raw) === '0' ? 0 : lengthPx(raw, label));

// ---------------------------------------------------------------- the deck
/** `.deck` — the container the peeking faces are measured inside. Its whole
 *  geometry is one custom property: the rule declares `--deck-lip` and every other
 *  length resolves against it, so the lip is read once here and the three places
 *  the sheet uses it — the container's `height`, the near face's `top`, and each
 *  face's `clip-path` — all have to answer to that one number. A face detached from
 *  a `.deck` measures `top: auto` and `clip-path: none`, which is exactly why the
 *  two face rows record `wrap: "deck"` instead of being measured bare. */
const faceDeckRule = (() => {
  const cls = '.deck';
  const rule = cssRule(/^\.deck \{$/, cls);
  const allowed = ['--deck-lip', 'position', 'z-index', 'width', 'height', 'margin'];
  const props = ruleProps(rule, cls);
  checkStateProps(props, allowed, 'the deck container', cls, rule.line);
  const decl = Object.fromEntries(props);
  const lip = lengthPx(decl['--deck-lip'], `${cls} --deck-lip`);
  if (collapse(decl.height) !== 'calc(var(--deck-lip) * 2)') {
    fail(`${cls}: height is "${decl.height}", not two lips`);
  }
  if (decl['z-index'] !== '2') fail(`${cls}: z-index is "${decl['z-index']}", so the lips are not above the hero`);
  if (decl.position !== 'relative') fail(`${cls}: position is "${decl.position}"`);
  const parts = collapse(decl.margin).split(/\s+/);
  if (parts.length !== 3 || parts[0] !== '0' || parts[1] !== 'auto') {
    fail(`${cls}: margin is "${decl.margin}", not \`0 auto <bottom>\``);
  }
  const marginBottom = lengthPx(parts[2], `${cls} margin bottom`);
  const frontZ = parseInt(stkRaw('light', 'deck-front', 'zIndex'), 10);
  if (frontZ >= 2) fail(`${cls}: z-index is ${decl['z-index']}, so the lips are not above a .deck-front at ${frontZ}`);
  return {
    cls,
    line: rule.line,
    lipPx: lip,
    heightPx: lip * 2,
    zIndex: parseInt(decl['z-index'], 10),
    widthCss: decl.width,
    positionCss: decl.position,
    marginBottomPx: marginBottom,
    marginCss: collapse(decl.margin),
    heightCss: collapse(decl.height),
    frontZIndex: frontZ,
  };
})();

/** `.deck-face` — the rule every peeking face shares. The clip and the origin are
 *  the two facts that make a face a lip rather than a scaled card, and both are
 *  authored in terms of `--deck-lip`, so they are checked against the container's
 *  number rather than read as literals. */
const faceDeckFaceBase = (() => {
  const cls = '.deck-face';
  const rule = cssRule(/^\.deck-face \{$/, cls, 12);
  const allowed = ['position', 'left', 'right', 'transform-origin', 'clip-path', 'transition'];
  const props = ruleProps(rule, cls);
  checkStateProps(props, allowed, 'the deck face', cls, rule.line);
  const decl = Object.fromEntries(props);
  if (decl.position !== 'absolute') fail(`${cls}: position is "${decl.position}"`);
  for (const side of ['left', 'right']) {
    if (decl[side] !== '0' && decl[side] !== '0px') fail(`${cls}: ${side} is "${decl[side]}", not the full bleed`);
  }
  if (decl['transform-origin'] !== 'top center') {
    fail(`${cls}: transform-origin is "${decl['transform-origin']}", so the scale no longer hangs from the top edge`);
  }
  const clip = faceCssNorm(decl['clip-path']);
  if (clip !== 'inset(0 0 calc(100% - var(--deck-lip)) 0)') {
    fail(`${cls}: clip-path is "${clip}", not the top lip the sheet ports`);
  }
  return {
    cls,
    line: rule.line,
    positionCss: decl.position,
    leftPx: len0(decl.left, `${cls} left`),
    rightPx: len0(decl.right, `${cls} right`),
    transformOriginCss: decl['transform-origin'],
    clipPathCss: clip,
    transition: controlTransition(rule, cls, ['transform', 'opacity']),
  };
})();

/** One `matrix(a, 0, 0, a, 0, 0)` as its scale, refusing anything that translates
 *  or skews: a peeking face changes size and opacity and nothing else. */
const faceDeckMatrix = (brightness, name) => {
  const raw = faceCssNorm(stkRaw(brightness, name, 'transform'));
  const m = /^matrix\(([-\d.]+), 0, 0, ([-\d.]+), ([-\d.]+), ([-\d.]+)\)$/.exec(raw);
  if (!m) fail(`${name}: ${brightness} measures transform "${raw}", not a plain scale`);
  const [a, d, e, f] = m.slice(1).map(Number);
  if (a !== d) fail(`${name}: ${brightness} measures a non-uniform scale ${a}/${d}`);
  if (e !== 0 || f !== 0) fail(`${name}: ${brightness} measures a translate (${e}, ${f}) the sheet does not author`);
  return a;
};

/** The lip Chrome resolved inside a measured face. The authored `calc(100% - 30px)`
 *  keeps its `calc` in the computed value, so the number is read back out of it and
 *  has to be the container's own lip. */
const faceDeckClipLip = (brightness, name, cls) => {
  const raw = faceCssNorm(stkRaw(brightness, name, 'clipPath'));
  const m = /^inset\(0px 0px calc\(100% - ([\d.]+)px\)\)$/.exec(raw);
  if (!m) fail(`${name}: ${cls} clip-path "${raw}" is not the top-lip inset the sheet authors`);
  const lip = parseFloat(m[1]);
  if (lip !== faceDeckRule.lipPx) {
    fail(`${name}: the clip cuts at ${lip}px while ${faceDeckRule.cls} declares --deck-lip: ${faceDeckRule.lipPx}px`);
  }
  return lip;
};

/** One peeking face: the shared `.deck-face` rule plus its own `[data-depth]` arm,
 *  measured inside a real `.deck`. */
const faceDeckPeerRead = (brightness, depth) => {
  const name = `deck-face-depth-${depth}`;
  const cls = 'deck-face';
  const rec = usRow(name);
  const file = rec.src || US.source;
  if (rec.parts.length !== 1 || rec.parts[0].cls !== cls) {
    fail(`${name}: expected the single \`${cls}\` class, got ${JSON.stringify(rec.parts.map((p) => p.cls))}`);
  }
  tsxLine(FACE_FILES[file], file, rec.parts[0].line, `className="${cls}"`);
  if (!rec.wrapPart) fail(`${name}: a peeking face was not measured inside a wrapper`);
  tsxLine(FACE_FILES[rec.wrapPart.src || file], rec.wrapPart.src || file, rec.wrapPart.line, 'className="deck"');
  if (rec.wrap !== faceDeckRule.cls.slice(1)) fail(`${name}: wrapped in "${rec.wrap}", not \`${faceDeckRule.cls}\``);
  if (!rec.attrs || rec.attrs['data-depth'] !== String(depth)) {
    fail(`${name}: not measured with data-depth="${depth}"`);
  }
  const stateCls = `.deck-face[data-depth='${depth}']`;
  const rule = cssRule(new RegExp(`^\\.deck-face\\[data-depth='${depth}'\\] \\{$`), stateCls, 8);
  const props = ruleProps(rule, cls);
  checkStateProps(props, ['top', 'transform', 'opacity'], stateCls, cls, rule.line);
  const decl = Object.fromEntries(props);
  const wantTop = depth === 1 ? 'var(--deck-lip)' : '0';
  if (decl.top !== wantTop) fail(`${stateCls}: top is "${decl.top}", expected "${wantTop}"`);
  const scale = cssScale(rule, stateCls);
  if (!/^[\d.]+$/.test(decl.opacity)) fail(`${stateCls}: opacity "${decl.opacity}" is not a plain number`);
  const opacity = parseFloat(decl.opacity);
  const out = {
    depth,
    name,
    cls: `${cls} data-depth="${depth}"`,
    src: `${file}:${rec.parts[0].line}`,
    stateLine: rule.line,
    positionCss: stkRaw(brightness, name, 'position'),
    leftPx: stkLen(brightness, name, 'left'),
    rightPx: stkLen(brightness, name, 'right'),
    topPx: stkLen(brightness, name, 'top'),
    scale,
    opacity,
    clipLipPx: faceDeckClipLip(brightness, name, cls),
    transition: faceDeckFaceBase.transition,
  };
  if (out.positionCss !== faceDeckFaceBase.positionCss) fail(`${name}: position measures ${out.positionCss}`);
  if (out.leftPx !== faceDeckFaceBase.leftPx || out.rightPx !== faceDeckFaceBase.rightPx) {
    fail(
      `${name}: the face measures ${out.leftPx}/${out.rightPx} inset, the rule authors ${faceDeckFaceBase.leftPx}/${faceDeckFaceBase.rightPx}`,
    );
  }
  const authoredTop = depth === 1 ? faceDeckRule.lipPx : 0;
  if (out.topPx !== authoredTop) {
    fail(`${name}: top measures ${out.topPx}, ${stateCls} authors ${wantTop} = ${authoredTop}`);
  }
  if (faceDeckMatrix(brightness, name) !== scale) {
    fail(`${name}: the box measures a scale of ${faceDeckMatrix(brightness, name)}, ${stateCls} authors ${scale}`);
  }
  if (stkNum(brightness, name, 'opacity') !== opacity) {
    fail(`${name}: opacity measures ${stkNum(brightness, name, 'opacity')}, ${stateCls} authors ${opacity}`);
  }
  // `top center` is the one authored value Chrome reports in the mount's own
  // pixels, so it only reads as a fraction of a box that moves with the viewport.
  const origin = stkPair(brightness, name, 'transformOrigin');
  const width = stkPair(brightness, name, 'width');
  for (const side of ['narrow', 'wide']) {
    const [ox, oy] = origin[side].split(/\s+/).map((s) => lenAnyPx(s, `${name} ${side} transform-origin`));
    const w = lenAnyPx(width[side], `${name} ${side} width`);
    if (oy !== 0 || Math.abs(ox / w - 0.5) > 1 / 128) {
      fail(`${name}: ${side} transform-origin "${origin[side]}" is not the top centre of a ${w}px box`);
    }
  }
  return out;
};

const faceDeckPeer = (depth) => {
  const light = faceDeckPeerRead('light', depth);
  const dark = faceDeckPeerRead('dark', depth);
  for (const key of Object.keys(light)) {
    if (JSON.stringify(light[key]) !== JSON.stringify(dark[key])) {
      fail(`${light.name}: ${key} moves with the scheme`);
    }
  }
  return light;
};
const faceDeckPeers = [faceDeckPeer(1), faceDeckPeer(2)];
if (faceDeckPeers[0].depth !== 1 || faceDeckPeers[1].depth !== 2) fail('the deck peers are not depths 1 and 2');
if (faceDeckPeers[0].scale <= faceDeckPeers[1].scale) {
  fail(
    `the near face scales ${faceDeckPeers[0].scale} while the far one scales ${faceDeckPeers[1].scale}: depth 1 must be the larger`,
  );
}
if (faceDeckPeers[0].opacity <= faceDeckPeers[1].opacity) {
  fail(`the near face is ${faceDeckPeers[0].opacity} while the far one is ${faceDeckPeers[1].opacity}`);
}

/** `.deck-front` — the wrapper the hero writes only when a deck is behind it. The
 *  class is authored in a guarded ternary, so the row is measured on the element
 *  that ternary produces; the port needs its two properties and no more. */
const faceDeckFront = (() => {
  const name = 'deck-front';
  const rec = faceChecked(name);
  const cls = rec.parts[0].cls;
  const rule = cssRule(/^\.deck-front \{$/, `.${cls}`, 8);
  const props = ruleProps(rule, `.${cls}`);
  checkStateProps(props, ['position', 'z-index'], 'the deck front', `.${cls}`, rule.line);
  const decl = Object.fromEntries(props);
  if (decl.position !== 'relative') fail(`.${cls}: position is "${decl.position}"`);
  const z = parseInt(decl['z-index'], 10);
  if (stkRaw('light', name, 'position') !== decl.position) fail(`${name}: position drifts from the rule`);
  if (parseInt(stkRaw('light', name, 'zIndex'), 10) !== z)
    fail(`${name}: z-index ${stkRaw('light', name, 'zIndex')} != the rule's ${z}`);
  for (const brightness of ['light', 'dark']) {
    if (stkCol(brightness, name, 'backgroundColor').alpha !== 0) fail(`${name}: ${brightness} paints a front fill`);
    if (stkRaw(brightness, name, 'boxShadow') !== 'none') fail(`${name}: ${brightness} gives the front a shadow`);
    if (stkRaw(brightness, name, 'zIndex') !== String(z))
      fail(`${name}: ${brightness} measures z-index ${stkRaw(brightness, name, 'zIndex')}`);
  }
  return {
    name,
    cls,
    src: faceCite(rec),
    line: rule.line,
    positionCss: decl.position,
    zIndex: z,
  };
})();

/** The deck as the app builds it: the peer budget in `WalletDeck.tsx` and the one
 *  custom property in the sheet. Both are records of source lines, and every line
 *  they carry is re-read from the pinned files before the depths are documented. */
const faceDeckAuthored = (() => {
  const budget = usAuthored('deck-peer-budget');
  const lipRec = usAuthored('deck-lip-is-a-custom-property');
  const byText = new Map();
  for (const rec of [budget, lipRec]) {
    const file = rec.src || US.source;
    for (const p of rec.parts) {
      const src = p.src || file;
      const lines = FACE_FILES[src] || (src === 'src/index.css' ? CSS_LINES : undefined);
      if (!lines) fail(`${rec.name}: part cites ${src}, which app_faces.dart has no pinned copy of`);
      tsxLine(lines, src, p.line, p.text);
      if (src === 'src/index.css') byText.set(`${src}:${p.text}`, p.line);
    }
  }
  const cite = (text) => {
    const line = byText.get(`src/index.css:${text}`);
    if (line === undefined) fail(`${faceDeckFaceBase.cls}: the deck record carries no line for "${text}"`);
    return `src/index.css:${line}`;
  };
  for (const peer of faceDeckPeers) {
    peer.authoredSrc = [
      `${faceDeckRule.cls}:${faceDeckRule.line} (${faceDeckRule.cls} --deck-lip ${faceDeckRule.lipPx}px)`,
      cite(`top: ${peer.depth === 1 ? 'var(--deck-lip)' : '0'};`),
      cite(`transform: scale(${peer.scale});`),
      cite(`opacity: ${peer.opacity};`),
    ].join(' + ');
    peer.lipCite = cite(peer.depth === 1 ? 'top: var(--deck-lip);' : 'top: 0;');
    peer.clipCite = cite('clip-path: inset(0 0 calc(100% - var(--deck-lip)) 0);');
    peer.originCite = cite('transform-origin: top center;');
    peer.heightCite = cite('height: calc(var(--deck-lip) * 2);');
    peer.marginCite = cite('margin: 0 auto -16px;');
  }
  return { budget, lipRec };
})();
// ---------------------------------------------------------------- the key grid
/** The three keys' parent. It is the one row on the family whose measurement
 *  genuinely moves with the viewport, because the gap is authored as a responsive
 *  pair (`gap-2 sm:gap-2.5`), and the only row laid out as a grid rather than a flex
 *  box — equal tracks, which a `Row` of three `Expanded` children reproduces. A
 *  variant-gated utility is not something `faceOffsets` can attribute, so the pair is
 *  read here as the two class tokens it is. */
const faceKeyGrid = (() => {
  const name = 'action-key-grid';
  const rec = faceChecked(name);
  const cls = rec.parts.map((p) => p.cls).join(' ');
  const tokens = cls.split(/\s+/).filter(Boolean);
  const cols = /^grid-cols-(\d+)$/.exec(tokens.find((t) => /^grid-cols-/.test(t)) || '');
  if (!cols) fail(`${name}: "${cls}" authors no bare \`grid-cols-N\``);
  if (tokens.filter((t) => /^grid-cols-/.test(t)).length !== 1) fail(`${name}: "${cls}" sets the column count twice`);
  const tracks = parseInt(cols[1], 10);
  const unit = faceSpacingUnit;
  const gapTokens = tokens.filter((t) => /^(gap-|sm:gap-)/.test(t));
  const narrowTok = /^gap-([\d.]+)$/.exec(gapTokens.find((t) => /^gap-/.test(t)) || '');
  const wideTok = /^sm:gap-([\d.]+)$/.exec(gapTokens.find((t) => /^sm:gap-/.test(t)) || '');
  if (!narrowTok || !wideTok || gapTokens.length !== 2) {
    fail(`${name}: "${cls}" is not the \`gap-N\` plus \`sm:gap-M\` pair the port carries (${gapTokens.join(' ')})`);
  }
  const want = { narrow: parseFloat(narrowTok[1]) * unit, wide: parseFloat(wideTok[1]) * unit };
  // `stkPair` hands back what Chrome reported, which for a length is the authored
  // string; the class list's arithmetic is a number, so the side that gets compared
  // is converted before it is compared.
  const rawGap = stkPair('light', name, 'rowGap');
  const pair = {
    narrow: lenAnyPx(rawGap.narrow, `${name} phone rowGap`),
    wide: lenAnyPx(rawGap.wide, `${name} desktop rowGap`),
  };
  if (pair.narrow !== want.narrow || pair.wide !== want.wide) {
    fail(
      `${name}: gap measures ${rawGap.narrow}/${rawGap.wide}, the class list authors ` +
        `${narrowTok[1]}×${unit}=${want.narrow}px and ${wideTok[1]}×${unit}=${want.wide}px`,
    );
  }
  const rawCol = stkPair('light', name, 'columnGap');
  if (rawCol.narrow !== rawGap.narrow || rawCol.wide !== rawGap.wide)
    fail(`${name}: the two gap axes move differently`);
  // Equal tracks: every column is the row's own width minus the gaps, over the
  // count. Chrome snaps a track to 1/64 px, which is the bound this proof uses.
  const template = stkPair('light', name, 'gridTemplateColumns');
  const width = stkPair('light', name, 'width');
  for (const side of ['narrow', 'wide']) {
    const gap = side === 'narrow' ? want.narrow : want.wide;
    const parts = template[side]
      .trim()
      .split(/\s+/)
      .map((s) => lenAnyPx(s, `${name} ${side} track`));
    if (parts.length !== tracks) fail(`${name}: ${side} measured ${parts.length} tracks for \`grid-cols-${tracks}\``);
    const w = lenAnyPx(width[side], `${name} ${side} width`);
    const ideal = (w - gap * (tracks - 1)) / tracks;
    for (const px of parts) {
      if (Math.abs(px - ideal) > 1 / 64) {
        fail(`${name}: ${side} track ${px}px is not the equal share ${ideal} of a ${w}px row (± Chrome's 1/64px snap)`);
      }
    }
  }
  const out = {
    name,
    cls,
    src: faceCite(rec),
    displayCss: stkRaw('light', name, 'display'),
    positionCss: stkRaw('light', name, 'position'),
    tracks,
    columnCountCss: cols[1],
    gapNarrowPx: want.narrow,
    gapWidePx: want.wide,
    gapNarrowCss: narrowTok[1],
    gapWideCss: wideTok[1],
    spacingUnitPx: unit,
  };
  if (out.displayCss !== 'grid') fail(`${name}: display measures ${out.displayCss}, not grid`);
  if (out.positionCss !== 'static') fail(`${name}: position measures ${out.positionCss}, so the grid is positioned`);
  for (const brightness of ['light', 'dark']) {
    if (stkCol(brightness, name, 'backgroundColor').alpha !== 0) fail(`${name}: ${brightness} paints a grid fill`);
    if (stkRaw(brightness, name, 'boxShadow') !== 'none') fail(`${name}: ${brightness} gives the grid a shadow`);
    if (stkLen(brightness, name, 'padding') !== 0) fail(`${name}: ${brightness} measures grid padding`);
    // The gap axes are compared per viewport rather than through `stkRaw`, because
    // the row's gap is a responsive pair and `stkVal` refuses a value that moves.
    for (const pass of [`${brightness}-phone`, `${brightness}-desktop`]) {
      const stack = stk(pass, name);
      if (stack.rowGap !== stack.columnGap) {
        fail(`${name}: ${pass} gaps its two axes differently (${stack.rowGap} vs ${stack.columnGap})`);
      }
    }
  }
  return out;
})();

// ---------------------------------------------------------------- the key
/** `.action-key` — the box under the hero balance. It is not a rounded rectangle:
 *  its own rule masks an ellipse out of its top edge, sized by two custom properties
 *  declared in the same block, so the notch is read as the geometry the sheet names
 *  rather than as a decoration. The prefixed and plain property are both authored,
 *  because the app ships both, and they have to agree. */
const faceKeyRule = (() => {
  const cls = '.action-key';
  const rule = cssRule(/^\.action-key \{$/, cls, 40);
  const allowed = [
    '--key-notch-w',
    '--key-notch-h',
    'position',
    'display',
    'flex-direction',
    'align-items',
    'justify-content',
    'gap',
    'padding',
    'border-radius',
    'background',
    'color',
    'font-family',
    'font-size',
    'font-weight',
    'letter-spacing',
    'cursor',
    'border',
    '-webkit-mask',
    'mask',
    'transition',
  ];
  const props = ruleProps(rule, cls);
  checkStateProps(props, allowed, 'the action key', cls, rule.line);
  const decl = Object.fromEntries(props);
  const notchW = lengthPx(decl['--key-notch-w'], `${cls} --key-notch-w`);
  const notchH = lengthPx(decl['--key-notch-h'], `${cls} --key-notch-h`);
  const maskOf = (prop) => {
    const value = faceCssNorm(decl[prop]);
    const m =
      /^radial-gradient\(ellipse var\(--key-notch-w\) var\(--key-notch-h\) at ([\d.]+)% ([\d.]+)%, transparent ([\d.]+)%, #000 calc\(([\d.]+)% \+ ([\d.]+)px\)\)$/.exec(
        value,
      );
    if (!m) fail(`${cls}: ${prop} is "${value}", not the top-edge ellipse notch the port cuts`);
    if (m[3] !== m[4]) fail(`${cls}: ${prop} fades out at ${m[3]}% but hardens at ${m[4]}%`);
    return {
      css: value,
      centreX: parseFloat(m[1]) / 100,
      centreY: parseFloat(m[2]) / 100,
      cutAt: parseFloat(m[3]) / 100,
      edgePx: parseFloat(m[5]),
    };
  };
  const prefixed = maskOf('-webkit-mask');
  const plain = maskOf('mask');
  if (JSON.stringify(prefixed.css) !== JSON.stringify(plain.css)) {
    fail(`${cls}: the prefixed and plain masks disagree (${prefixed.css} vs ${plain.css})`);
  }
  if (decl.border !== 'none') fail(`${cls}: border is "${decl.border}", so the key has a frame to port`);
  if (decl.cursor !== 'pointer') fail(`${cls}: cursor is "${decl.cursor}"`);
  if (decl['font-weight'] !== '700') fail(`${cls}: font-weight is "${decl['font-weight']}"`);
  const tracking = /^(-?[\d.]+)em$/.exec(decl['letter-spacing']);
  if (!tracking) fail(`${cls}: letter-spacing "${decl['letter-spacing']}" is not an em length`);
  const pad = collapse(decl.padding)
    .split(/\s+/)
    .map((s) => lengthPx(s, `${cls} padding`));
  if (pad.length < 3 || pad.length > 4) fail(`${cls}: padding "${decl.padding}" is not the three-sided authoring`);
  const [pt, pr, pb, pl = pr] = pad;
  return {
    cls,
    line: rule.line,
    notchWidthPx: notchW,
    notchHeightPx: notchH,
    notch: plain,
    maskAuthored: plain.css,
    positionCss: decl.position,
    displayCss: decl.display,
    flexDirectionCss: decl['flex-direction'],
    alignItemsCss: decl['align-items'],
    justifyContentCss: decl['justify-content'],
    gapPx: lengthPx(decl.gap, `${cls} gap`),
    paddingCss: collapse(decl.padding),
    paddingPx: { top: pt, right: pr, bottom: pb, left: pl },
    radiusPx: lengthPx(decl['border-radius'], `${cls} border-radius`),
    accentToken: tokenRef(decl.background, `${cls} background`, cls),
    inkToken: tokenRef(decl.color, `${cls} color`, cls),
    familyToken: tokenRef(decl['font-family'], `${cls} font-family`, cls),
    sizeToken: tokenRef(decl['font-size'], `${cls} font-size`, cls),
    fontWeight: parseInt(decl['font-weight'], 10),
    trackingEm: parseFloat(tracking[1]),
    cursorCss: decl.cursor,
    borderCss: decl.border,
    transition: controlTransition(rule, cls, ['transform', 'filter']),
  };
})();

/** The three states a key can be in. `action-key-states` is the record that names
 *  each declaration's line, so the lines come from the record and every one of them
 *  is re-read from the pinned sheet; the rules themselves are parsed here so a state
 *  that grew a fourth property stops generation. D-U1 drops hover, the press is
 *  ported, and `disabled` is what the `action-key-disabled` row measured — a state
 *  the app never writes, because `ActionKey` passes an optional `onClick` straight
 *  through and a key with no handler simply does nothing. */
const faceKeyStates = (() => {
  const cls = '.action-key';
  const rec = usAuthored('action-key-states');
  const file = rec.src || 'src/index.css';
  if (file !== 'src/index.css') fail(`${rec.name}: authored from ${file}, which is not the pinned sheet`);
  const lineOf = (text) => {
    const hits = rec.parts.filter((p) => p.text === text);
    if (hits.length !== 1) fail(`${rec.name}: the record carries ${hits.length} lines reading "${text}"`);
    const p = hits[0];
    tsxLine(CSS_LINES, 'src/index.css', p.line, p.text);
    return p.line;
  };
  const headOf = (text) => {
    const hits = rec.parts.filter((p) => p.text === text);
    if (hits.length !== 1) fail(`${rec.name}: the record carries ${hits.length} heads reading "${text}"`);
    tsxLine(CSS_LINES, 'src/index.css', hits[0].line, hits[0].text);
    return hits[0].line;
  };
  const hover = cssRule(/^\.action-key:hover \{$/, `${cls}:hover`, 8);
  const active = cssRule(/^\.action-key:active \{$/, `${cls}:active`, 8);
  const disabled = cssRule(/^\.action-key:disabled,$/, `${cls}:disabled`, 10);
  if (hover.line !== headOf('.action-key:hover {'))
    fail(`${cls}:hover opens at ${hover.line}, the record says ${hover.line}`);
  if (active.line !== headOf('.action-key:active {')) fail(`${cls}:active opens at ${active.line}`);
  if (disabled.line !== headOf('.action-key[disabled] {') - 1) {
    fail(
      `${cls}:disabled opens at ${disabled.line}, one line above the record's \`.action-key[disabled] {{\` at ${headOf('.action-key[disabled] {')}`,
    );
  }
  const hoverProps = Object.fromEntries(ruleProps(hover, cls));
  checkStateProps(Object.entries(hoverProps), ['filter'], 'the hover rule', cls, hover.line);
  const dim = /^brightness\(([\d.]+)\)$/.exec(collapse(hoverProps.filter));
  if (!dim) fail(`${cls}:hover filter "${hoverProps.filter}" is not a plain brightness(N) dim`);
  const activeProps = Object.fromEntries(ruleProps(active, cls));
  checkStateProps(Object.entries(activeProps), ['transform'], 'the active rule', cls, active.line);
  const disabledProps = ruleProps(disabled, cls);
  checkStateProps(disabledProps, ['opacity', 'cursor', 'transform'], 'the disabled rule', cls, disabled.line);
  const dDecl = Object.fromEntries(disabledProps);
  if (!/^[\d.]+$/.test(dDecl.opacity)) fail(`${cls}:disabled opacity "${dDecl.opacity}" is not a plain number`);
  if (dDecl.cursor !== 'not-allowed') fail(`${cls}:disabled cursor is "${dDecl.cursor}"`);
  if (collapse(dDecl.transform) !== 'none') fail(`${cls}:disabled transform is "${dDecl.transform}"`);
  return {
    pressScale: cssScale(active, `${cls}:active`),
    pressDeclLine: lineOf('transform: scale(0.965);'),
    pressHeadLine: active.line,
    hoverBrightness: parseFloat(dim[1]),
    hoverDeclLine: lineOf('filter: brightness(0.94);'),
    hoverHeadLine: hover.line,
    disabledOpacity: parseFloat(dDecl.opacity),
    disabledCursor: dDecl.cursor,
    disabledDeclLines: [lineOf('opacity: 0.45;'), lineOf('cursor: not-allowed;'), lineOf('transform: none;')].join(','),
    disabledHeadLine: disabled.line,
    transition: faceKeyRule.transition,
  };
})();

/** `.action-key-icon` — the glyph's own box. The icon's size is an SVG attribute the
 *  caller hands to the icon component (`action-key-glyph` records it), not a fact the
 *  sheet or the measurement paints, so the port carries the box that stops an inline
 *  SVG adding leading underneath it and leaves the size with the caller. */
const faceKeyIconRule = (() => {
  const cls = '.action-key-icon';
  const rule = cssRule(/^\.action-key-icon \{$/, cls, 8);
  const props = ruleProps(rule, cls);
  checkStateProps(props, ['display', 'line-height'], 'the glyph box', cls, rule.line);
  const decl = Object.fromEntries(props);
  if (decl.display !== 'block') fail(`${cls}: display is "${decl.display}"`);
  if (len0(decl['line-height'], `${cls} line-height`) !== 0) {
    fail(`${cls}: line-height is "${decl['line-height']}", so the glyph box has leading to port`);
  }
  const name = 'action-key-icon';
  const rec = faceChecked(name);
  if (rec.parts.map((p) => p.cls).join(' ') !== cls.slice(1)) {
    fail(`${name}: the row cites "${rec.parts.map((p) => p.cls).join(' ')}", not the single \`${cls}\` class`);
  }
  for (const brightness of ['light', 'dark']) {
    if (stkRaw(brightness, name, 'display') !== decl.display) fail(`${name}: ${brightness} display drifts from ${cls}`);
    if (stkLen(brightness, name, 'lineHeight') !== 0)
      fail(`${name}: ${brightness} measures ${stkLen(brightness, name, 'lineHeight')}px of leading`);
    if (stkCol(brightness, name, 'backgroundColor').alpha !== 0) fail(`${name}: ${brightness} paints the glyph box`);
  }
  const glyph = usAuthored('action-key-glyph');
  for (const p of glyph.parts) {
    const src = p.src || glyph.src;
    const lines = FACE_FILES[src];
    if (!lines) fail(`${glyph.name}: part cites ${src}, which app_faces.dart has no pinned copy of`);
    tsxLine(lines, src, p.line, p.text);
  }
  return {
    name,
    cls: cls.slice(1),
    line: rule.line,
    src: faceCite(rec),
    displayCss: decl.display,
    lineHeightPx: 0,
    glyphSrc: `${glyph.src}:${glyph.parts.map((p) => p.line).join(',')}`,
  };
})();

/** The family the key computes to. `font-family` is not one of the properties the
 *  utility-stack capture asks Chrome for — the guard below says so out loud rather
 *  than leaving the probe read unexplained — so the family comes from the
 *  `.action-key` probe, which is the same class the row cites and the one the rule
 *  declares `var(--font-…)` on. Both viewports of a brightness must report one
 *  stack, and Flutter is given its first family where CSS is given a fallback list. */
const faceKeyFamily = (brightness, name) => {
  const cls = faceKeyRule.cls;
  if (stkHas(brightness, name, 'fontFamily')) {
    fail(`${name}: the stack now measures font-family, so ${cls} is no longer its only source`);
  }
  const sides = ['phone', 'desktop'].map((viewport) => {
    const probe = passTheme(`${brightness}-${viewport}`).probes[cls];
    if (!probe) fail(`${cls}: ${brightness}-${viewport} measured no probe`);
    return probeRaw(probe, 'fontFamily', `${cls} ${brightness}-${viewport}`);
  });
  if (sides[0] !== sides[1]) fail(`${cls}: the font stack moves with the viewport (${sides[0]} vs ${sides[1]})`);
  return firstFamily(sides[0], cls);
};

/** The key at rest and disabled, read as a pair: everything the box is, plus the
 *  accent fill and ink the rule names, and the three properties the disabled arm
 *  changes. */
const faceKeyRead = (brightness, name) => {
  const rec = faceChecked(name);
  const cls = rec.parts.map((p) => p.cls).join(' ');
  const out = {
    name,
    cls,
    src: faceCite(rec),
    tag: rec.tag,
    displayCss: stkRaw(brightness, name, 'display'),
    positionCss: stkRaw(brightness, name, 'position'),
    flexDirectionCss: stkRaw(brightness, name, 'flexDirection'),
    alignItemsCss: stkRaw(brightness, name, 'alignItems'),
    justifyContentCss: stkRaw(brightness, name, 'justifyContent'),
    gapPx: stkLen(brightness, name, 'rowGap'),
    cursorCss: stkRaw(brightness, name, 'cursor'),
    opacity: stkNum(brightness, name, 'opacity'),
    transformCss: stkRaw(brightness, name, 'transform'),
    radiusPx: stkLen(brightness, name, 'borderRadius'),
    minWidthPx: stkLen(brightness, name, 'minWidth'),
    flexGrow: stkNum(brightness, name, 'flexGrow'),
    flexShrink: stkNum(brightness, name, 'flexShrink'),
    borderWidthPx: stkLen(brightness, name, 'borderTopWidth'),
    fontSizePx: stkLen(brightness, name, 'fontSize'),
    fontWeight: parseInt(stkRaw(brightness, name, 'fontWeight'), 10),
    letterSpacingPx: stkLen(brightness, name, 'letterSpacing'),
    lineHeightPx: stkLen(brightness, name, 'lineHeight'),
    fontFamily: faceKeyFamily(brightness, name),
    fill: stkCol(brightness, name, 'backgroundColor'),
    ink: stkCol(brightness, name, 'color'),
    sides: facePadSides(brightness, name),
  };
  const rule = faceKeyRule;
  if (out.displayCss !== rule.displayCss) fail(`${name}: display ${out.displayCss} != the rule's ${rule.displayCss}`);
  if (out.positionCss !== rule.positionCss)
    fail(`${name}: position ${out.positionCss} != the rule's ${rule.positionCss}`);
  if (out.flexDirectionCss !== rule.flexDirectionCss) fail(`${name}: flex-direction drifts from the rule`);
  if (out.alignItemsCss !== rule.alignItemsCss || out.justifyContentCss !== rule.justifyContentCss) {
    fail(`${name}: the key no longer centres its glyph and word (${out.alignItemsCss}/${out.justifyContentCss})`);
  }
  if (out.gapPx !== rule.gapPx) fail(`${name}: gap measures ${out.gapPx}, the rule authors ${rule.gapPx}`);
  if (out.radiusPx !== rule.radiusPx)
    fail(`${name}: radius measures ${out.radiusPx}, the rule authors ${rule.radiusPx}`);
  if (out.borderWidthPx !== 0) fail(`${name}: the key measures a ${out.borderWidthPx}px frame the rule sets to none`);
  if (out.cursorCss !== rule.cursorCss && out.cursorCss !== faceKeyStates.disabledCursor) {
    fail(`${name}: cursor "${out.cursorCss}" is neither the rule's "${rule.cursorCss}" nor the disabled arm`);
  }
  if (out.fontWeight !== rule.fontWeight)
    fail(`${name}: weight measures ${out.fontWeight}, the rule authors ${rule.fontWeight}`);
  const sizeToken = passTheme(`${brightness}-phone`).root[rule.sizeToken];
  if (!sizeToken) fail(`${name}: ${rule.sizeToken} is not measured in ${brightness}-phone`);
  if (out.fontSizePx !== lengthPx(sizeToken.raw, rule.sizeToken)) {
    fail(`${name}: size measures ${out.fontSizePx}px, ${rule.sizeToken} is ${sizeToken.raw}`);
  }
  if (out.letterSpacingPx !== rule.trackingEm * out.fontSizePx) {
    fail(
      `${name}: tracking measures ${out.letterSpacingPx}px, ${rule.trackingEm}em of ${out.fontSizePx}px is not that`,
    );
  }
  const familyToken = passTheme(`${brightness}-phone`).root[rule.familyToken];
  if (!familyToken) fail(`${name}: ${rule.familyToken} is not measured in ${brightness}-phone`);
  const authoredFamily = firstFamily(familyToken.raw, rule.familyToken);
  if (out.fontFamily !== authoredFamily) {
    fail(`${name}: the key computes to ${out.fontFamily} while ${rule.familyToken} is ${authoredFamily}`);
  }
  out.fill = stkTokenColour(brightness, name, 'backgroundColor', rule.accentToken, 'the accent fill');
  out.ink = stkTokenColour(brightness, name, 'color', rule.inkToken, 'the accent ink');
  for (const side of ['top', 'right', 'bottom', 'left']) {
    if (out.sides[side] !== rule.paddingPx[side]) {
      fail(`${name}: ${side} padding measures ${out.sides[side]}, the rule authors ${rule.paddingCss}`);
    }
  }
  if (stkHas(brightness, name, 'minWidth') !== true) fail(`${name}: the row measured no minimum width`);
  return out;
};

const faceKey = (() => {
  const rest = { light: faceKeyRead('light', 'action-key'), dark: faceKeyRead('dark', 'action-key') };
  const off = { light: faceKeyRead('light', 'action-key-disabled'), dark: faceKeyRead('dark', 'action-key-disabled') };
  for (const brightness of ['light', 'dark']) {
    const r = rest[brightness];
    const d = off[brightness];
    if (r.cls !== d.cls) fail(`action-key: the two states measure different class lists (${r.cls} / ${d.cls})`);
    if (r.tag !== 'button') fail(`action-key: recorded on a <${r.tag}>, not the button the app writes`);
    if (d.opacity !== faceKeyStates.disabledOpacity) {
      fail(
        `action-key-disabled: ${brightness} measures opacity ${d.opacity}, the rule authors ${faceKeyStates.disabledOpacity}`,
      );
    }
    if (d.cursorCss !== faceKeyStates.disabledCursor) {
      fail(
        `action-key-disabled: ${brightness} cursor "${d.cursorCss}" != the rule's "${faceKeyStates.disabledCursor}"`,
      );
    }
    if (d.transformCss !== 'none') fail(`action-key-disabled: ${brightness} measures transform ${d.transformCss}`);
    if (r.transformCss !== 'none') fail(`action-key: ${brightness} rests at transform ${r.transformCss}`);
    if (r.opacity !== 1) fail(`action-key: ${brightness} rests at opacity ${r.opacity}`);
    for (const key of Object.keys(r)) {
      if (['opacity', 'cursorCss', 'name', 'src'].includes(key)) continue;
      if (JSON.stringify(r[key]) !== JSON.stringify(d[key])) {
        fail(
          `action-key-disabled: ${key} differs from the rest row (${JSON.stringify(r[key])} → ${JSON.stringify(d[key])})`,
        );
      }
    }
    if (/\bpressable\b/.test(r.cls)) fail('action-key: the key cites .pressable; its press is its own rule');
    if (!/\bmin-w-0\b/.test(r.cls)) fail(`action-key: "${r.cls}" has no \`min-w-0\` for the grid to shrink into`);
    if (r.minWidthPx !== 0) fail(`action-key: min-width measures ${r.minWidthPx}, the cited utility authors 0`);
    if (r.flexGrow !== 0) fail(`action-key: the key measures flex-grow ${r.flexGrow}`);
    if (r.lineHeightPx / r.fontSizePx !== rest[brightness].lineHeightPx / rest[brightness].fontSizePx) {
      fail(`action-key: ${brightness} line box drifts`);
    }
  }
  return { rest: rest.light, restPaint: rest, off: off.light, offPaint: off };
})();
// ---------------------------------------------------------------- the family, assembled
/** The two facts another emitted family owns: AppSurfaces' `.card-face` probe and
 *  AppShadows' `--shadow-float`. The call is the check — every tone's radius and
 *  every tone's shadow list has to answer to them, or the run stops. */
const faceOwners = faceBaseCrossChecks();

/** The gold chip, pinned to AppChips in both brightnesses. The face does not port
 *  it; it ports the row it was measured on so the widget can say where the chip
 *  sits and the drift tests can say the two files still agree. */
const faceChipSlot = { light: faceChipRow('light'), dark: faceChipRow('dark') };

/** The box, read once per tone. A tone changes the paint and nothing else — a
 *  geometry that moved between tones could not be ported as one box, and the face
 *  component writes one box with the tone filled into a hole. */
const faceBoxShared = ['gradient', 'shadow', 'ink', 'paint', 'name', 'cls', 'src'];
const faceToneBoxes = faceToneRows.map((t) => ({ ...t, box: faceBox(t.name) }));
for (const later of faceToneBoxes.slice(1)) {
  const first = faceToneBoxes[0].box;
  for (const key of Object.keys(first)) {
    if (faceBoxShared.includes(key)) continue;
    if (JSON.stringify(first[key]) !== JSON.stringify(later.box[key])) {
      fail(
        `${later.name}: ${key} is ${JSON.stringify(later.box[key])} while ${faceToneBoxes[0].name} measures ` +
          `${JSON.stringify(first[key])} — one component writes one box`,
      );
    }
  }
  for (const brightness of ['light', 'dark']) {
    const a = first.paint[brightness];
    const b = later.box.paint[brightness];
    if (JSON.stringify(a.shadow) !== JSON.stringify(b.shadow)) {
      fail(`${later.name}: ${brightness} shadows differ from ${faceToneBoxes[0].name}'s`);
    }
    if (JSON.stringify(a.fill) !== JSON.stringify(b.fill)) {
      fail(`${later.name}: ${brightness} fills differ from ${faceToneBoxes[0].name}'s`);
    }
    if (JSON.stringify(a.ink) !== JSON.stringify(b.ink)) {
      fail(`${later.name}: ${brightness} ink differs from ${faceToneBoxes[0].name}'s`);
    }
  }
}

/** The non-interactive arm — the same template with the cursor hole left empty and
 *  the default tone. It is ported as the box's second class list, not as a second
 *  box: the measurement says only the cursor and the element moved.
 *
 *  It is, however, measured on the component's *fixed* style arm while every tone
 *  row was measured on the `fluid` arm, so the four fields that arm writes are the
 *  difference the port carries as two facts rather than one drift: the interactive
 *  box is `width: 100%` with no floor, the plain box is the caller's width with a
 *  250px floor, and the aspect ratio both arms author by hand is one number. */
const facePlain = faceBox('face-box-plain');
const faceToneDefault = faceToneBoxes.find((t) => t.box.cls.includes('face-violet'));
if (!faceToneDefault) fail('face-box-plain cites the violet tone, which no measured tone row carries');
const FACE_ARM_FIELDS = ['styleSrc', 'minWidthPx', 'callerOwnsWidth', 'widthFull'];
for (const key of Object.keys(facePlain)) {
  if (['name', 'cls', 'src', 'interactive', 'cursorCss', 'paint', ...FACE_ARM_FIELDS].includes(key)) continue;
  if (JSON.stringify(facePlain[key]) !== JSON.stringify(faceToneDefault.box[key])) {
    fail(`face-box-plain: ${key} differs from the interactive arm of the same box`);
  }
}
for (const brightness of ['light', 'dark']) {
  for (const key of ['gradient', 'shadow', 'fill', 'ink']) {
    if (
      JSON.stringify(facePlain.paint[brightness][key]) !== JSON.stringify(faceToneDefault.box.paint[brightness][key])
    ) {
      fail(`face-box-plain: ${brightness} ${key} differs from the interactive arm of the same tone`);
    }
  }
}
if (facePlain.aspectRatio !== faceToneDefault.box.aspectRatio) {
  fail('face-box-plain: the two style arms no longer author one aspect ratio');
}
if (facePlain.styleSrc === faceToneDefault.box.styleSrc) fail('face-box-plain: both arms cite the same style line');
if (facePlain.callerOwnsWidth !== true || faceToneDefault.box.callerOwnsWidth !== false) {
  fail('face-box-plain: the fixed arm is not the one the caller owns the width of');
}
if (facePlain.minWidthPx === faceToneDefault.box.minWidthPx) fail('face-box-plain: both arms measure the same floor');
if (facePlain.interactive !== false) fail('face-box-plain measures an interactive cursor');
if (faceToneDefault.box.interactive !== true) fail(`${faceToneDefault.name}: the tone row measures no pointer`);
if (!/ $/.test(facePlain.cls))
  fail(`face-box-plain: "${facePlain.cls}" does not end in the space the empty hole leaves`);

/** One tone as both things it is: the recipe the sheet authors and the pixels the
 *  pass painted. The recipe is what a reader traces (`color-mix` over the anchor),
 *  the measurement is what Flutter draws, and §6's detached probe of the same class
 *  has to be the third copy of the same gradient. */
const faceTints = faceToneBoxes.map((t) => {
  const recipe = faceGradientRecipe(t.tone);
  const light = t.box.paint.light.gradient;
  const dark = t.box.paint.dark.gradient;
  faceGradientCheck(t.tone, recipe, light, 'light');
  faceGradientCheck(t.tone, recipe, dark, 'dark');
  gEq(faceProbeGradient(t.tone, 'light'), light, `.${t.tone} light`);
  gEq(faceProbeGradient(t.tone, 'dark'), dark, `.${t.tone} dark`);
  for (const [brightness, gradient] of [
    ['light', light],
    ['dark', dark],
  ]) {
    if (gradient.stops.length !== recipe.stops.length)
      fail(`${t.tone}: ${brightness} stop count drifts from the recipe`);
    for (const [i, stop] of recipe.stops.entries()) {
      if (gradient.stops[i].at !== (i === 0 ? 0 : 1)) {
        fail(
          `${t.tone}: ${brightness} stop ${i} sits at ${gradient.stops[i].at}, the recipe authors ${i === 0 ? '0%' : '100%'}`,
        );
      }
    }
  }
  return { ...t, recipe, light, dark };
});
if (new Set(faceTints.map((t) => JSON.stringify(t.light))).size !== faceTints.length) {
  fail('two tones paint one light gradient; the tone table would not be a table');
}

/** The bands and the words inside a face. Each is one row, read twice and ported
 *  once, because `faceSlot` refuses a slot whose geometry moves with the scheme. */
const FACE_SLOT_ROWS = [
  'face-top-row',
  'face-name-block',
  'face-bank-name',
  'face-card-name',
  'face-badge',
  'face-badge-deck',
  'face-amount-block',
  'face-balance-label',
  'face-balance',
  'face-number-block',
  'face-chip-row',
  'face-card-number',
];
const faceSlots = Object.fromEntries(FACE_SLOT_ROWS.map((n) => [n, faceSlot(n, {})]));
// The badge the face draws for itself and the one the deck passes it are the same
// recipe kept in two files; the record says so, and the measurement has to agree.
for (const key of Object.keys(faceSlots['face-badge'])) {
  if (['name', 'src', 'cls'].includes(key)) continue;
  if (JSON.stringify(faceSlots['face-badge'][key]) !== JSON.stringify(faceSlots['face-badge-deck'][key])) {
    fail(`face-badge-deck: ${key} drifts from face-badge, which the record says is a byte-for-byte copy`);
  }
}
if (faceSlots['face-badge'].cls !== faceSlots['face-badge-deck'].cls)
  fail('the two badges no longer cite one class list');
/** The two children of `face-number-block`’s `space-y-2`. Chrome gives the space to
 *  the *first* child’s margin-bottom and nothing to the last, which is the
 *  difference between this pair’s two rows — so the pair is pinned as one fact:
 *  exactly one child carries it, the parent’s own class list is the `wrap` the two
 *  children were measured under, and the px both children answer to is that
 *  utility’s number (the check `faceWrapSpacing` runs per row). */
const faceSpacedParent = usRow('face-number-block')
  .parts.map((p) => p.cls)
  .join(' ');
for (const child of ['face-chip-row', 'face-card-number']) {
  if (usRow(child).wrap !== faceSpacedParent) {
    fail(`${child}: measured under "${usRow(child).wrap}", not the parent row "${faceSpacedParent}"`);
  }
}
const faceSpaced = [faceSlots['face-chip-row'], faceSlots['face-card-number']];
const faceSpacingCarriers = faceSpaced.filter((s) => s.marginTopPx !== 0 || s.marginBottomPx !== 0);
if (faceSpacingCarriers.length !== 1) {
  fail(`face-number-block: ${faceSpacingCarriers.length} of its two children carry the \`space-y\` margin`);
}
if (faceSpacingCarriers[0].name !== 'face-chip-row') fail('face-card-number: the last child carries the space');
if (faceSpaced[1].marginTopPx !== 0 || faceSpaced[1].marginBottomPx !== 0) {
  fail('face-card-number: the last child of a space-y parent measures a margin');
}

/** The `.deck` as one measured row, against the arithmetic of its own custom
 *  property: height two lips, one lip of pull-up, and the stacking the hero needs. */
const faceDeckBox = (() => {
  const name = 'deck-box';
  const rec = faceChecked(name);
  if (rec.parts.length !== 1 || rec.parts[0].cls !== faceDeckRule.cls.slice(1)) {
    fail(
      `${name}: expected the single \`${faceDeckRule.cls}\` class, got ${JSON.stringify(rec.parts.map((p) => p.cls))}`,
    );
  }
  const out = {
    name,
    cls: rec.parts[0].cls,
    src: faceCite(rec),
    displayCss: stkRaw('light', name, 'display'),
    positionCss: stkRaw('light', name, 'position'),
    heightPx: stkLen('light', name, 'height'),
    marginBottomPx: stkLen('light', name, 'marginBottom'),
    zIndex: parseInt(stkRaw('light', name, 'zIndex'), 10),
    paddingPx: stkLen('light', name, 'padding'),
    overflowXCss: stkRaw('light', name, 'overflowX'),
    overflowYCss: stkRaw('light', name, 'overflowY'),
  };
  if (out.heightPx !== faceDeckRule.heightPx) {
    fail(
      `${name}: height measures ${out.heightPx}, ${faceDeckRule.cls} authors ${faceDeckRule.heightCss} = ${faceDeckRule.heightPx}px`,
    );
  }
  if (out.marginBottomPx !== faceDeckRule.marginBottomPx) {
    fail(
      `${name}: margin-bottom measures ${out.marginBottomPx}, ${faceDeckRule.cls} authors "${faceDeckRule.marginCss}"`,
    );
  }
  if (out.zIndex !== faceDeckRule.zIndex)
    fail(`${name}: z-index measures ${out.zIndex}, the rule authors ${faceDeckRule.zIndex}`);
  if (out.positionCss !== faceDeckRule.positionCss) fail(`${name}: position measures ${out.positionCss}`);
  if (out.displayCss !== 'block') fail(`${name}: display measures ${out.displayCss}, so the lips are not a block flow`);
  if (out.paddingPx !== 0) fail(`${name}: the deck measures ${out.paddingPx}px of padding the rule does not author`);
  for (const brightness of ['light', 'dark']) {
    if (stkCol(brightness, name, 'backgroundColor').alpha !== 0) fail(`${name}: ${brightness} paints a deck fill`);
    if (stkRaw(brightness, name, 'boxShadow') !== 'none') fail(`${name}: ${brightness} gives the deck a shadow`);
  }
  return out;
})();

/** The word under a key's glyph. It is measured detached, so it paints the body's
 *  ink and authors no colour of its own; inside a key it takes `var(--accent-fg)`,
 *  which is the same inheritance law `faceSlot` reads a face slot's ink by. */
const faceKeyLabel = faceSlot('action-key-label', {});
if (!faceKeyLabel.inheritsFaceInk) fail('action-key-label: the row paints a colour of its own, not the key’s ink');
if (faceKeyLabel.textColor !== null) fail('action-key-label: a detached row should not measure an authored colour');
/** A row name to a Dart enum member: `face-bank-name` → `bankName`. The identifier
 *  is derived from the measured row rather than typed, so an enum member cannot be
 *  named for a row the record does not carry — and a name that will not camel-case
 *  into a legal identifier stops generation instead of emitting a broken class. */
const faceSlotId = (name) => {
  const bare = name.replace(/^(face-|action-key-)/, '');
  const id = bare.replace(/-([a-z0-9])/g, (m, c) => c.toUpperCase());
  if (!/^[a-z][A-Za-z0-9]*$/.test(id))
    fail(`${name}: yields the Dart identifier "${id}", which is not lower camel case`);
  return id;
};
/** The bands that are not of the face. They share [AppFaceSlotSpec] because they are
 *  measured by the same reader, so one enum names the face’s bands and the key’s,
 *  and the widget indexes one table. */
const FACE_EMIT_SLOTS = FACE_SLOT_ROWS.filter((n) => n !== 'face-badge-deck').concat([faceKeyLabel.name]);
for (const n of FACE_EMIT_SLOTS) {
  if (n !== faceKeyLabel.name && !faceSlots[n]) fail(`${n}: named for emission but never measured`);
}
if (new Set(FACE_EMIT_SLOTS.map(faceSlotId)).size !== FACE_EMIT_SLOTS.length)
  fail('two bands yield one Dart identifier');

/** One tone’s stops for one pass: the pixels the pass measured and the text the rule
 *  authored are the same stop read from two directions, so the two lists are zipped
 *  by index — which `faceTints` already requires to be the same length and to sit at
 *  the same 0% and 100%. */
const faceStopList = (t, brightness) => {
  const ind = '    ';
  const items = t[brightness].stops.map((stop, i) => {
    if (stop.at !== (i === 0 ? 0 : 1)) fail(`${t.tone}: stop ${i} is not at the position the recipe authors`);
    const recipe = t.recipe.stops[i];
    return `${ind}  ${rowsSpecValue(
      'AppFaceStopSpec',
      FACE_STOP_FIELDS,
      {
        at: stop.at,
        colour: stop.colour,
        authored: recipe.authored,
        hueToken: recipe.hueToken === undefined ? null : recipe.hueToken,
        mixPercent: recipe.mixPercent,
        anchorToken: recipe.anchorToken,
      },
      `${ind}  `,
    )},`;
  });
  return `<AppFaceStopSpec>[\n${items.join('\n')}\n${ind}]`;
};
// ---------------------------------------------------------------- Dart emission
// One table per spec class: its Dart fields and its Dart literals are the same list
// read twice, so a number cannot be declared in the class and carried here under
// another name. Every getter below reads a value the reader layer measured; none of
// them computes one.
banner();
L.push(
  "import 'package:flutter/material.dart';",
  '',
  "import 'app_radii.dart';",
  "import 'app_shadows.dart';",
  '',
  '/// The card face, the wallet deck its peers peek out of, and the three action',
  '/// keys under the hero balance — the three boxes `src/index.css` paints with a',
  '/// gradient of its own rather than with a surface token.',
  '///',
  '/// As for the ledger, the measurement is a `utilityStacks` row: the verbatim',
  '/// class list — plus, where the component writes one, the inline `style` — on the',
  '/// element the component really uses. A §6 probe cannot see a Tailwind utility,',
  "/// and `src/index.css` supplies what a detached element cannot show: a tone's",
  '/// gradient, the `.card-face::before` sheen, a state rule, the deck lip.',
  '///',
  '/// Three laws bind this file. A fact another generated family owns is cited and',
  '/// cross-checked here, never restated: `.card-face`’s corner is AppRadii’s and its',
  '/// float AppShadows’, the gold chip is AppChips’, and the balance figure is the',
  '/// `.money` face AppNumerals ports. A value no pass measured fails generation —',
  '/// there is no default in this file. And a box whose measured height is the',
  '/// mount’s own width over an authored ratio is ported as that ratio, never as',
  '/// the pixels, which is why no `*Px` here names a width.',
  '',
  '/// A tone of `CardFace.tsx`’s `FACE_TONES` table, in the order the component',
  '/// declares them. Generation reads the array out of the pinned source and',
  '/// requires it to list exactly the tones whose rows were measured, so an enum',
  '/// here cannot drift from the component without the run failing.',
  'enum AppFaceTone {',
);
for (const t of faceTints) {
  L.push(`  ${t.id}('${t.tone}', '${t.name}'),`);
}
L.push(
  ';',
  '',
  '  const AppFaceTone(this.cssClass, this.stackRow);',
  '',
  '  /// The `.face-*` class that paints this tone.',
  '  final String cssClass;',
  '',
  '  /// The `utilityStacks` row the tone’s own box was measured on.',
  '  final String stackRow;',
  '',
  '  /// The tone `CardFace.tsx` falls back to when the caller passes none — the',
  '  /// prop default the non-interactive arm was measured with, read off the line',
  '  /// that declares it.',
  `  static const AppFaceTone defaultTone = AppFaceTone.${faceToneDefault.id};`,
  '}',
  '',
);

const FACE_STOP_FIELDS = [
  ['at', 'double', (s) => s.at, ['The stop’s position along the gradient, as the recipe authors it: 0% and 100%.']],
  [
    'colour',
    'Color',
    (s) => ({ r: s.colour.r, g: s.colour.g, b: s.colour.b, alpha: s.colour.a }),
    [
      'The pixels this pass painted — a `color-mix` is the engine’s arithmetic, so',
      'this is the resolved colour, not a formula.',
    ],
  ],
  [
    'authored',
    'String',
    (s) => s.authored,
    ['The stop exactly as the rule writes it, so the measurement can be traced back to the stylesheet.'],
  ],
  [
    'hueToken',
    'String?',
    (s) => s.hueToken,
    ['The `--hue-*` token the stop mixes from, `null` for the stop that is the bare anchor.'],
  ],
  [
    'mixPercent',
    'double',
    (s) => s.mixPercent,
    ['How much of [hueToken] the stop mixes with [anchorToken]; `0` when the stop is the anchor itself.'],
  ],
  [
    'anchorToken',
    'String',
    (s) => s.anchorToken,
    ['The token both stops mix over — `--face-anchor`, the one colour every tone shares.'],
  ],
];
rowsSpecClass(
  'AppFaceStopSpec',
  [
    '/// One stop of a tone’s gradient, as the sheet authors it and as the pass painted',
    '/// it. The two are the same fact from two directions: `authored` is the',
    '/// `color-mix(…)` text in `src/index.css`, and [colour] is what Chrome resolved',
    '/// from it at this brightness, which generation requires a bare anchor stop to',
    '/// equal exactly.',
  ],
  FACE_STOP_FIELDS,
  [],
);

const FACE_TINT_FIELDS = [
  ['cssClass', 'String', (t) => t.recipe.cls, ['`.face-blue` — the rule that paints this tone.']],
  ['stackRow', 'String', (t) => t.name, ['The measured box this tone was mounted as.']],
  [
    'authoredSrc',
    'String',
    (t) => t.box.src,
    ['Where the component writes the class list, with the tone filled into its hole.'],
  ],
  ['recipeSrc', 'String', (t) => `src/index.css:${t.recipe.line}`, ['Where the sheet authors the gradient.']],
  ['angleDeg', 'double', (t) => t.recipe.angle, ['The authored gradient angle, which every pass measured unchanged.']],
  ['anchorToken', 'String', (t) => t.recipe.anchorToken, ['The `:root` token both stops mix over.']],
  [
    'light',
    'List<AppFaceStopSpec>',
    (t) => ({ __dartExpr: faceStopList(t, 'light') }),
    ['The stops as the light pass painted them.'],
  ],
  [
    'dark',
    'List<AppFaceStopSpec>',
    (t) => ({ __dartExpr: faceStopList(t, 'dark') }),
    ['The stops as the dark pass painted them — the same recipe, resolved over the dark anchor.'],
  ],
  [
    'fillLight',
    'LinearGradient',
    (t) => ({ __dartExpr: gradientExpr(t.light) }),
    ['The gradient the light pass measured, which is [light] drawn.'],
  ],
  [
    'fillDark',
    'LinearGradient',
    (t) => ({ __dartExpr: gradientExpr(t.dark) }),
    ['The gradient the dark pass measured.'],
  ],
];
rowsSpecClass(
  'AppFaceTintSpec',
  [
    '/// One tone: the gradient `src/index.css` authors for it and the pixels each',
    '/// pass painted from that recipe.',
    '///',
    '/// A tone changes the paint and nothing else. Generation measured a whole box',
    '/// for every tone and refused one whose geometry disagrees with the first, so',
    '/// the widget draws [fillAt] inside [AppCardFaceSpec] rather than picking a',
    '/// different frame.',
  ],
  FACE_TINT_FIELDS,
  [
    '  /// The gradient this pass painted, which is [light] or [dark] drawn.',
    '  LinearGradient fillAt(Brightness brightness) =>',
    '      brightness == Brightness.dark ? fillDark : fillLight;',
    '',
  ],
);
// prettier-ignore
const FACE_SHEEN_FIELDS = [
  ['cssClass', 'String', (s) => s.cls.slice('.card-face'.length), ['The pseudo-element’s own class.']],
  ['ruleSrc', 'String', (s) => `src/index.css:${s.line}`, ['Where the sheet authors it.']],
  [
    'authoredBackground',
    'String',
    (s) => s.authoredBackground,
    [
      'The two layers exactly as the rule writes them, so the numbers below can be',
      'traced back to the declaration the reader parsed.',
    ],
  ],
  [
    'highlightCentreX',
    'double',
    (s) => s.highlightCentreX,
    ['The ellipse’s centre as a fraction of the box, `at 85% 10%` divided by 100.'],
  ],
  ['highlightCentreY', 'double', (s) => s.highlightCentreY, []],
  [
    'highlightRadiusX',
    'double',
    (s) => s.highlightRadiusX,
    ['The ellipse’s own radius as a fraction of the box, which is why it is larger than the box.'],
  ],
  ['highlightRadiusY', 'double', (s) => s.highlightRadiusY, []],
  [
    'highlightColour',
    'Color',
    (s) => ({ r: s.highlightColour.r, g: s.highlightColour.g, b: s.highlightColour.b, alpha: s.highlightColour.alpha }),
    ['The highlight’s white and alpha.'],
  ],
  [
    'highlightFadeAt',
    'double',
    (s) => s.highlightFadeAt,
    ['Where the colour starts — the rule’s `0%`, so the fade is the whole radius.'],
  ],
  [
    'highlightClearAt',
    'double',
    (s) => s.highlightClearAt,
    ['Where it reaches `transparent`, i.e. 50% of that radius.'],
  ],
  ['stripeAngleDeg', 'double', (s) => s.stripeAngleDeg, ['The `repeating-linear-gradient` angle.']],
  [
    'stripeClearUntilPx',
    'double',
    (s) => s.stripeClearUntilPx,
    ['The first px the stripe leaves transparent — the same number the coloured stop opens at.'],
  ],
  [
    'stripeColour',
    'Color',
    (s) => ({ r: s.stripeColour.r, g: s.stripeColour.g, b: s.stripeColour.b, alpha: s.stripeColour.alpha }),
    ['The hairline’s white and alpha.'],
  ],
  ['stripeFromPx', 'double', (s) => s.stripeFromPx, ['Where the hairline starts.']],
  ['stripeToPx', 'double', (s) => s.stripeToPx, ['Where it stops, and therefore the period’s end.']],
];
rowsSpecClass(
  'AppFaceSheenSpec',
  [
    '/// The `.card-face::before` layer, ported as the two gradients the rule authors.',
    '///',
    '/// A detached element cannot show a pseudo-element, so this whole spec is the',
    '/// pinned rule read with `ruleProps` — the same law `.skeleton::after` and the',
    '/// chip ring set. Generation parses every number out of the declaration with two',
    '/// anchored regexes and stops if either layer does not match it, and refuses a',
    '/// rule that sets a property outside the five the sheen is made of.',
    '///',
    '/// It is one spec, not a per-brightness pair: the sheen paints the same white',
    '/// over every tone and both schemes, which is why `.card-face::before` authors no',
    '/// token at all.',
  ],
  FACE_SHEEN_FIELDS,
  [
    '  /// The centre as a Flutter alignment, which is the same -1..1 space CSS’s',
    '  /// percentage coordinates describe.',
    '  Alignment get highlightCentre =>',
    '      Alignment(highlightCentreX * 2.0 - 1.0, highlightCentreY * 2.0 - 1.0);',
    '',
    '  /// The hairline’s period: the stripe’s `to` minus its `from`, which is why',
    '  /// the two numbers above travel as a pair and not as a width.',
    '  double get stripePeriodPx => stripeToPx - stripeFromPx;',
    '',
  ],
);

// prettier-ignore
const FACE_PRESS_FIELDS = [
  ['cssClass', 'String', (p) => p.cls, ['`.pressable`, the class the face box cites.']],
  ['restSrc', 'String', (p) => `src/index.css:${p.restLine}`, ['Where the rest state’s transition is authored.']],
  ['activeSrc', 'String', (p) => `src/index.css:${p.activeLine}`, ['Where `:active` is authored.']],
  [
    'pressScale',
    'double',
    (p) => p.scale,
    ['The `transform: scale(…)` a press takes. The face and the ledger row cite', 'the same rule, so this is the same number in both files, read twice rather', 'than imported.'],
  ],
  ['pressDurationMs', 'int', (p) => rowsInt(p.ms), ['The authored transition duration.']],
  ['easeX1', 'double', (p) => p.ease[0], ['The `cubic-bezier` control points, in the order CSS writes them.']],
  ['easeY1', 'double', (p) => p.ease[1], []],
  ['easeX2', 'double', (p) => p.ease[2], []],
  ['easeY2', 'double', (p) => p.ease[3], []],
  [
    'transitionProps',
    'String',
    (p) => p.props.join(' '),
    [
      'What the transition animates — `transform` and nothing else, which',
      '`controlTransition` requires before any of this is emitted.',
    ],
  ],
];
rowsSpecClass(
  'AppFacePressSpec',
  [
    '/// The press a face takes, from `.pressable`.',
    '///',
    '/// Hover is deliberately absent. Ruling D-U1 drops every hover state in this',
    '/// port because Flutter has no hover on a touch device, so the sheet’s',
    '/// `filter: brightness(…)` rules are measured, recorded and not ported; the',
    '/// press survives because a touch device does have one.',
  ],
  FACE_PRESS_FIELDS,
  [
    '  /// The authored easing, as the curve Flutter reproduces it.',
    '  Cubic get ease => Cubic(easeX1, easeY1, easeX2, easeY2);',
    '',
  ],
);

L.push(
  '/// A named band of the face — one element of `CardFace.tsx`’s tree, measured on',
  '/// the class list the component really writes there. The deck’s badge is not a',
  '/// member: `WalletDeck.tsx` passes the face the same class list, and generation',
  '/// proves the two rows measure identically before it ports one band for both.',
  'enum AppFaceSlot {',
);
if (FACE_EMIT_SLOTS[FACE_EMIT_SLOTS.length - 1] !== faceKeyLabel.name) {
  fail('the action key’s label is no longer the last band the enum and the holder walk');
}
for (const row of FACE_EMIT_SLOTS.slice(0, -1)) {
  L.push(`  ${faceSlotId(row)}('${row}'),`);
}
L.push(
  '  /// The word under an action key’s glyph. It is a band of the key, not of the',
  '  /// face, and shares this table because it is measured the same way — as one',
  '  /// detached row that inherits its ink.',
  `  ${faceSlotId(faceKeyLabel.name)}('${faceKeyLabel.name}');`,
  '',
  '  const AppFaceSlot(this.stackRow);',
  '',
  '  /// The `utilityStacks` row this band was measured from.',
  '  final String stackRow;',
  '}',
  '',
);

// The bands inside the box. One field table, so the enum’s twelve members and the
// twelve specs the holder indexes are the same list read twice.
const FACE_SLOT_FIELDS = [
  ['stackRow', 'String', (s) => s.name, ['The `utilityStacks` row this band was measured from.']],
  ['cssClasses', 'String', (s) => s.cls, ['The verbatim class list the component writes on this element.']],
  [
    'authoredSrc',
    'String',
    (s) => s.src,
    ['`file:lines` of that class list, re-checked against the pinned source before emission.'],
  ],
  ['displayCss', 'String', (s) => s.displayCss, ['The measured `display`, which is what the widget lays out as.']],
  [
    'positionCss',
    'String',
    (s) => s.positionCss,
    ['The measured `position`; `static` for a band that lifts nothing above the sheen.'],
  ],
  [
    'zIndexCss',
    'String',
    (s) => s.zIndexCss,
    [
      'The authored stacking, as the sheet writes it: `10` on the bands that sit over',
      '`.card-face::before`, `auto` on the rest. Flutter needs no z-index for this —',
      'the sheen is painted under the column — so it travels as the record of why the',
      'web needed one.',
    ],
  ],
  [
    'flexDirectionCss',
    'String',
    (s) => s.flexDirectionCss,
    ['The measured `flex-direction`; a `display: block` row answers `row` and never uses it.'],
  ],
  [
    'alignItemsCss',
    'String',
    (s) => s.alignItemsCss,
    ['The measured `align-items`; `normal` where no flex axis asks for one.'],
  ],
  [
    'justifyContentCss',
    'String',
    (s) => s.justifyContentCss,
    ['The measured `justify-content`; `normal` for a block flow, `space-between` for the two rows that spread.'],
  ],
  [
    'gapPx',
    'double?',
    (s) => s.gapPx,
    ['The measured `gap` in phone px, `null` where the row measures `normal` — which is no gap.'],
  ],
  [
    'marginTopPx',
    'double',
    (s) => s.marginTopPx,
    [
      'The measured top offset. Tailwind v4’s `space-y-*` puts its space on the',
      'first child’s bottom margin, so this is `0` for the last child of a spaced',
      'parent; generation requires exactly one of `face-number-block`’s two children',
      'to carry the margin and names it.',
    ],
  ],
  [
    'marginBottomPx',
    'double',
    (s) => s.marginBottomPx,
    [
      'The measured bottom offset — the `space-y-2` side at the unit every pass',
      'agrees on, and `0` for every other band.',
    ],
  ],
  ['paddingTopPx', 'double', (s) => s.paddingTopPx, ['The band’s own inner inset; only the badge asks for any.']],
  ['paddingRightPx', 'double', (s) => s.paddingRightPx, []],
  ['paddingBottomPx', 'double', (s) => s.paddingBottomPx, []],
  ['paddingLeftPx', 'double', (s) => s.paddingLeftPx, []],
  [
    'fontFamily',
    'String',
    (s) => s.fontFamily,
    [
      'The first family of the stack this band paints in. A band that cites a type',
      'class takes it from that class’s §6 probe; one that cites none is measured',
      'detached, so it reports the body family and takes the face’s own when mounted.',
    ],
  ],
  ['fontSizePx', 'double', (s) => s.fontSizePx, ['The phone font size.']],
  [
    'fontWeight',
    'int',
    (s) => rowsInt(s.fontWeight),
    ['The measured numeric weight, carried as a number so [weight] can name it.'],
  ],
  [
    'heightRatio',
    'double',
    (s) => s.heightRatio,
    [
      'The line box as a multiplier of the size — the band’s own `leading-*` utility',
      'if it authors one (`leading-tight` on the balance figure), the `body`',
      'multiplier generation re-reads and requires to be identical otherwise.',
    ],
  ],
  ['letterSpacingPx', 'double', (s) => s.letterSpacingPx, ['The phone resolution of the tracking.']],
  [
    'letterSpacingEm',
    'double',
    (s) => s.letterSpacingEm,
    ['The `em` that produced it, so [styleAt] can re-derive it at another size.'],
  ],
  [
    'textColor',
    'Color?',
    (s) => s.textColor,
    [
      'The colour the band painted, or `null` where it authors none. A band that',
      'names no colour is [inheritsFaceInk] and paints whatever the face hands down,',
      'which is why no colour is guessed for it here.',
    ],
  ],
  [
    'inheritsFaceInk',
    'bool',
    (s) => s.inheritsFaceInk,
    ['True exactly when neither the class list nor an inline style authors a colour.'],
  ],
  [
    'textTransformCss',
    'String?',
    (s) => s.textTransformCss,
    [
      'The measured `text-transform` — `uppercase` for the eyebrow and the badge,',
      '`null` for a band that leaves it `none`.',
    ],
  ],
  ['whiteSpaceCss', 'String?', (s) => s.whiteSpaceCss, ['The measured `white-space`.']],
  [
    'textOverflowCss',
    'String?',
    (s) => s.textOverflowCss,
    ['The measured `text-overflow`; `null` where the row measures none, which is a detached row’s own answer.'],
  ],
  [
    'truncates',
    'bool',
    (s) => s.truncates,
    [
      '`truncate`, proven as the trio it actually measures (`nowrap`, `ellipsis`,',
      '`overflow: hidden`) and as a word of the class list.',
    ],
  ],
  [
    'tabularNums',
    'bool',
    (s) => s.tabularNums,
    [
      '`font-variant-numeric: tabular-nums`, which the cited type class authors and the',
      'widget answers with [FontFeature.tabularFigures] — a font feature, so it does',
      'nothing in a fallback face and is re-checked when the design-system fonts land.',
    ],
  ],
  [
    'authoredTypeClass',
    'String?',
    (s) => s.authoredTypeClass,
    [
      'The `src/index.css` type class the band cites — `.mono`, `.eyebrow`, `.money` —',
      'which the family that owns that class ports; `null` where the band sizes itself',
      'with utilities alone.',
    ],
  ],
  [
    'authoredTypeSrc',
    'String?',
    (s) => s.authoredTypeSrc,
    ['Where that class is authored, so the citation a reader follows is the one generation checked.'],
  ],
  ['radiusPx', 'double?', (s) => s.radius.px, ['The measured corner, `null` for a pill — see [radiusIsPill].']],
  [
    'radiusIsPill',
    'bool',
    (s) => s.radius.isPill,
    [
      '`rounded-full`, which Chrome resolves past any box. Generation accepts that',
      'sentinel only when the class list really asks for it, and refuses a pill the',
      'pixels do not show, so this is the class and the measurement agreeing.',
    ],
  ],
  [
    'borderWidthPx',
    'double',
    (s) => s.borderWidthPx,
    ['The measured frame width; `0` for every band that draws none.'],
  ],
  ['borderColor', 'Color?', (s) => s.borderColor, ['The frame’s colour, `null` where no frame was measured.']],
  [
    'minWidthZero',
    'bool?',
    (s) => s.minWidthZero,
    [
      '`min-w-0`, only where the row asked for it: the web’s hint that a long figure',
      'may shrink below its content width. Flutter gives a `Text` its parent’s max',
      'width already, so this is a record rather than a port; `null` says the property',
      'was never measured and is not a fact about this band.',
    ],
  ],
  ['flexGrow', 'double', (s) => s.flexGrow, ['The measured `flex-grow`.']],
  ['flexShrink', 'double', (s) => s.flexShrink, ['The measured `flex-shrink`.']],
  [
    'leadingUtility',
    'String?',
    (s) => s.leading.leadingUtility,
    ['The `leading-*` utility the class list names, `null` where the band inherits its line box.'],
  ],
  [
    'leadingToken',
    'String?',
    (s) => s.leading.leadingToken,
    ['The `:root` token that utility resolves to, `null` for `leading-none`, which authors none.'],
  ],
  [
    'leadingValue',
    'double',
    (s) => s.leading.leadingValue,
    ['The multiplier the pass measured, which generation requires the utility and the token to produce.'],
  ],
];
const FACE_SLOT_MEMBERS = [
  '  /// The weight Flutter names for the measured numeric weight.',
  '  FontWeight get weight => FontWeight.values[fontWeight ~/ 100 - 1];',
  '',
  '  /// The space this band asks for around itself. The face’s own inset is',
  '  /// [AppCardFaceSpec]’s padding, never a text child’s margin, so the two never',
  '  /// double-count.',
  '  EdgeInsets get margin => EdgeInsets.only(top: marginTopPx, bottom: marginBottomPx);',
  '',
  '  /// The band’s own inner inset — the badge’s `px-2 py-0.5`, and nothing elsewhere.',
  '  EdgeInsets get padding =>',
  '      EdgeInsets.fromLTRB(paddingLeftPx, paddingTopPx, paddingRightPx, paddingBottomPx);',
  '',
  '  /// Tabular figures where the cited class authors them.',
  '  List<FontFeature> get fontFeatures =>',
  '      tabularNums ? const <FontFeature>[FontFeature.tabularFigures()] : const <FontFeature>[];',
  '',
  '  /// The band as the phone pass measured it.',
  '  TextStyle get textStyle => styleAt(fontSizePx);',
  '',
  '  /// The band at another font size. CSS resolves tracking against the used font',
  '  /// size, so a resized band re-derives it from [letterSpacingEm] rather than',
  '  /// keeping the phone pixels; the line box travels as its multiplier.',
  '  TextStyle styleAt(double sizePx) => TextStyle(',
  '        fontFamily: fontFamily,',
  '        color: textColor,',
  '        fontSize: sizePx,',
  '        fontWeight: weight,',
  '        height: heightRatio,',
  '        letterSpacing: letterSpacingEm * sizePx,',
  '        fontFeatures: fontFeatures,',
  '      );',
  '',
];
rowsSpecClass(
  'AppFaceSlotSpec',
  [
    '/// One band of the face — or the word under an action key — as the element the',
    '/// component really writes: its class list, and everything the pass measured on',
    '/// it.',
    '///',
    '/// A band is read in both brightnesses and generation refuses one whose geometry',
    '/// moves between them. The face paints its own ink, so a scheme change cannot',
    '/// re-flow these bands, and a band that tried to would be a second design rather',
    '/// than one ported twice. The type classes they cite, though, belong to other',
    '/// families: [authoredTypeClass] is `.money`, `.eyebrow` or `.mono` and those',
    '/// rows stay emitted where they are owned.',
  ],
  FACE_SLOT_FIELDS,
  FACE_SLOT_MEMBERS,
);
// The box every face is, in one brightness. The tone is not a field here: it selects
// a gradient, which lives in [AppFaceTintSpec], and the geometry every tone measures
// is asserted to be one geometry before this table is read.
const FACE_BOX_FIELDS = [
  ['stackRow', 'String', (b) => b.name, ['The `utilityStacks` row the box was measured on — the default tone’s.']],
  [
    'cssClasses',
    'String',
    (b) => b.cls,
    ['The verbatim class list, with the tone and the cursor hole already filled.'],
  ],
  [
    'authoredSrc',
    'String',
    (b) => b.src,
    ['The lines that compose and mount that class list, re-checked against the pinned source.'],
  ],
  [
    'styleSrc',
    'String',
    (b) => b.styleSrc,
    ['The line that writes the inline `style` — the `fluid` arm, which owns the width.'],
  ],
  [
    'ruleSrc',
    'String',
    () => `src/index.css:${faceBase.line}`,
    [
      '`.card-face`, the rule every face is under: the frame, the ink and the corner',
      'this file cites rather than restates.',
    ],
  ],
  [
    'radiusToken',
    'String',
    () => faceBase.radiusToken,
    ['The corner, named by the token `.card-face` asks for; [radiusPx] resolves it through AppRadii.'],
  ],
  [
    'shadowToken',
    'String',
    () => faceBase.shadowToken,
    ['The float, named by the token `.card-face` asks for; [shadowsAt] resolves it through AppShadows.'],
  ],
  [
    'aspectRatio',
    'double',
    (b) => b.aspectRatio,
    [
      'The authored `aspect-ratio`. The box’s height is its own width over this',
      'number, so the port carries the ratio and never the pixels: what the phone',
      'pass measured as a height was a function of the mount.',
    ],
  ],
  [
    'minWidthPx',
    'double',
    (b) => b.minWidthPx,
    ['The measured `min-width` of the arm this row was read on — `0` when the caller does not own the width.'],
  ],
  [
    'callerOwnsWidth',
    'bool',
    (b) => b.callerOwnsWidth,
    [
      'Whether the inline style gives the box `width: 100%` (the card in a grid) or',
      'leaves the width to its caller (the deck’s fixed peers).',
    ],
  ],
  [
    'widthFullCss',
    'String?',
    (b) => b.widthFull,
    ['The authored width of that arm, `null` where the style writes none.'],
  ],
  [
    'interactive',
    'bool',
    (b) => b.interactive,
    ['`true` for the arm that takes `cursor-pointer` and `false` for the one the component renders as a plain `div`.'],
  ],
  [
    'cursorCss',
    'String',
    (b) => b.cursorCss,
    [
      'The measured `cursor`. A web-only fact, kept as the record of which arm is',
      'clickable; Flutter’s pointer device answers it with [AppFacePressSpec].',
    ],
  ],
  ['displayCss', 'String', (b) => b.displayCss, ['The measured `display`.']],
  [
    'positionCss',
    'String',
    (b) => b.positionCss,
    ['The measured `position`, which `.card-face` authors as `relative` for the sheen’s layer.'],
  ],
  ['flexDirectionCss', 'String', (b) => b.flexDirectionCss, ['The measured `flex-direction`: the column of bands.']],
  [
    'alignItemsCss',
    'String',
    (b) => b.alignItemsCss,
    ['The measured `align-items`; `normal` because the column stretches its children instead.'],
  ],
  [
    'justifyContentCss',
    'String',
    (b) => b.justifyContentCss,
    ['The measured `justify-content`: `space-between` puts the figure at the bottom of the box.'],
  ],
  ['textAlignCss', 'String', (b) => b.textAlignCss, ['The measured `text-align` from `text-left`.']],
  ['gapPx', 'double', (b) => b.gapPx, ['The measured `gap-2` between the bands.']],
  [
    'marginTopPx',
    'double',
    (b) => b.marginTopPx,
    ['The box’s own outer offset — `0`; the deck, not the face, pulls the stack up.'],
  ],
  ['marginBottomPx', 'double', (b) => b.marginBottomPx, []],
  ['paddingTopPx', 'double', (b) => b.paddingTopPx, ['`p-3.5` at the unit all four passes agree on.']],
  ['paddingRightPx', 'double', (b) => b.paddingRightPx, []],
  ['paddingBottomPx', 'double', (b) => b.paddingBottomPx, []],
  ['paddingLeftPx', 'double', (b) => b.paddingLeftPx, []],
  [
    'borderWidthPx',
    'double',
    (b) => b.borderWidthPx,
    ['The measured frame; `.card-face` authors none, so a face has no border to draw.'],
  ],
  [
    'ink',
    'Color',
    (b) => b.ink,
    [
      'The colour every band inherits — the `color: white` of `.card-face`, which',
      'generation requires the pass to paint exactly. A band that names its own',
      'transparency is a different alpha of the same white.',
    ],
  ],
  [
    'fill',
    'Color',
    (b) => b.fill,
    ['The measured `background-color`, transparent because the tone paints a `background-image` gradient over it.'],
  ],
  ['overflowXCss', 'String', (b) => b.overflowXCss, ['The measured `overflow-x`, `hidden` by `.card-face`.']],
  ['overflowYCss', 'String', (b) => b.overflowYCss, ['The measured `overflow-y`.']],
  [
    'backdropFilterCss',
    'String',
    (b) => b.blur,
    [
      '`none`, recorded because a face is a painted box, not a glass panel: the app’s',
      'blur classes are a different family.',
    ],
  ],
  ['flexGrow', 'double', (b) => b.flexGrow, ['The measured `flex-grow`.']],
  ['flexShrink', 'double', (b) => b.flexShrink, ['The measured `flex-shrink`.']],
  [
    'plainCssClasses',
    'String',
    () => facePlain.cls,
    [
      'The non-interactive arm’s class list — the same template with the cursor hole',
      'left empty. Generation proves it ends in the space that empty hole writes, so',
      'the two arms are one template and not two designs.',
    ],
  ],
  [
    'plainStyleSrc',
    'String',
    () => facePlain.styleSrc,
    ['The other arm’s `style` line — the fixed one, which the component uses when the caller owns the width.'],
  ],
  ['plainMinWidthPx', 'double', () => facePlain.minWidthPx, ['That arm’s measured floor.']],
  [
    'plainWidthFullCss',
    'String?',
    () => facePlain.widthFull,
    ['`null`: the fixed arm authors no width, which is what [callerOwnsWidth] means.'],
  ],
];
const FACE_BOX_MEMBERS = [
  '  /// The inset every band sits inside.',
  '  EdgeInsets get padding =>',
  '      EdgeInsets.fromLTRB(paddingLeftPx, paddingTopPx, paddingRightPx, paddingBottomPx);',
  '',
  '  /// The outer offset, which no face measures.',
  '  EdgeInsets get margin => EdgeInsets.only(top: marginTopPx, bottom: marginBottomPx);',
  '',
  '  /// The corner `.card-face` asks for, resolved by the family that owns radii.',
  '  /// This file cites the token and never restates the pixel; generation proved',
  '  /// AppRadii’s value and this box’s measurement are the same number.',
  '  double get radiusPx {',
  '    final double? px = AppRadii.byToken[radiusToken];',
  '    if (px == null) {',
  "      throw ArgumentError('$radiusToken is not an emitted radius token');",
  '    }',
  '    return px;',
  '  }',
  '',
  '  BorderRadius get borderRadius => BorderRadius.circular(radiusPx);',
  '',
  '  /// The float, resolved by the family that owns shadows.',
  '  List<BoxShadow> shadowsAt(Brightness brightness) {',
  '    final List<BoxShadow>? layers = (brightness == Brightness.dark',
  '            ? AppShadows.shadowsDark',
  '            : AppShadows.shadowsLight)[shadowToken];',
  '    if (layers == null) {',
  "      throw ArgumentError('$shadowToken is not an emitted shadow token');",
  '    }',
  '    return layers;',
  '  }',
  '',
];
rowsSpecClass(
  'AppCardFaceSpec',
  [
    '/// The card face’s box in one brightness: the frame, the padding, the ink and the',
    '/// ratio — the geometry every tone shares, which generation proves by reading all',
    '/// six tone rows and refusing a second that disagrees.',
    '///',
    '/// The paint a tone adds is not here. [AppFaceTintSpec] carries the gradient, and',
    '/// the corner and the float are named by token and resolved through AppRadii and',
    '/// AppShadows, because `.card-face` is a rule in the same stylesheet those families',
    '/// were emitted from and restating it would be a third copy of one fact.',
    '///',
    '/// The box also carries the component’s second arm: the same class list with the',
    '/// cursor hole left empty, and the fixed rather than fluid `style`. Both were',
    '/// measured, and the difference between them is exactly four fields.',
  ],
  FACE_BOX_FIELDS,
  FACE_BOX_MEMBERS,
);
/** An authored record’s code lines as `///` prose. The deck’s shape is a budget the
 *  component writes in JavaScript rather than a property any pass measured, so what
 *  reaches Dart is the citation of the line that writes it — derived from the record,
 *  never retyped, and refused if a line could close the comment it lives in. */
const faceAuthoredDoc = (rec, heading) => {
  const out = [`/// ${heading}`];
  for (const part of rec.parts) {
    if (part.text.includes('*/') || part.text.includes('\n')) {
      fail(`${rec.name}: "${part.text}" cannot be carried as a Dart doc line`);
    }
    const src = part.src || rec.src;
    out.push(`/// \`(${src}:${part.line})\` — \`${part.text}\``);
  }
  return out;
};

/** The one custom property the deck’s whole size resolves from, as the declaration
 *  that defines it. `faceDeckRule` already proved the container is two lips tall and
 *  the faces are clipped to one, so the arithmetic Dart restates is this number. */
const faceDeckLip = (() => {
  const decl = faceDeckAuthored.lipRec.parts.find((p) => /^--deck-lip:/.test(collapse(p.text)));
  if (!decl) fail('the deck’s lip declaration is not in the record that cites it');
  const px = lenAnyPx(decl.text.split(/[:;]/)[1], '.deck --deck-lip');
  if (px !== faceDeckRule.lipPx)
    fail(`.deck --deck-lip is "${decl.text}", which is ${px}px, not the ${faceDeckRule.lipPx}px the rule resolves`);
  return { decl: collapse(decl.text), line: decl.line, src: decl.src || 'src/index.css', px };
})();

const FACE_DECK_FIELDS = [
  ['stackRow', 'String', (d) => d.box.name, ['The `utilityStacks` row the deck container was measured on.']],
  ['cssClasses', 'String', (d) => d.box.cls, ['`.deck`, the only class the container carries.']],
  ['authoredSrc', 'String', (d) => d.box.src, ['Where the component mounts it.']],
  ['ruleSrc', 'String', (d) => `src/index.css:${d.rule.line}`, ['Where the sheet authors the container.']],
  [
    'lipDeclSrc',
    'String',
    (d) => `${d.lip.src}:${d.lip.line}`,
    ['The `--deck-lip` declaration every other number here resolves from.'],
  ],
  [
    'lipPx',
    'double',
    (d) => d.lip.px,
    [
      'The lip: the band of a back face the deck shows. The container is two lips',
      'tall and every face is clipped to its own top lip, so this one number is the',
      'deck’s size — which is why [heightPx] and [marginBottomPx] are records of',
      'arithmetic rather than separate measurements.',
    ],
  ],
  ['heightPx', 'double', (d) => d.box.heightPx, ['`calc(var(--deck-lip) * 2)`, as the pass measured it.']],
  [
    'marginBottomPx',
    'double',
    (d) => d.box.marginBottomPx,
    [
      'The deck’s pull-up into the hero balance under it — negative, and authored as',
      'the middle value of a three-value `margin`.',
    ],
  ],
  [
    'zIndex',
    'int',
    (d) => rowsInt(d.box.zIndex),
    ['The container’s stacking, which puts the whole deck over the balance block.'],
  ],
  [
    'frontZIndex',
    'int',
    (d) => rowsInt(d.rule.frontZIndex),
    ['`.deck-front`’s stacking, one below the peers it frames.'],
  ],
  ['displayCss', 'String', (d) => d.box.displayCss, ['The measured `display`, which makes the lips a block flow.']],
  ['positionCss', 'String', (d) => d.box.positionCss, ['The measured `position`.']],
  [
    'paddingPx',
    'double',
    (d) => d.box.paddingPx,
    ['The container’s own inset — none, so the faces span its full width.'],
  ],
  [
    'overflowXCss',
    'String',
    (d) => d.box.overflowXCss,
    ['The measured `overflow-x`: the clip is on each face, not on the container.'],
  ],
  ['overflowYCss', 'String', (d) => d.box.overflowYCss, []],
  ['widthCss', 'String', (d) => d.rule.widthCss, ['The authored `width`, which the pass confirms.']],
  [
    'heightCss',
    'String',
    (d) => d.rule.heightCss,
    ['The declaration as the sheet writes it, so the arithmetic above can be traced to it.'],
  ],
  ['marginCss', 'String', (d) => d.rule.marginCss, ['The authored three-value `margin`.']],
  ['frontCssClass', 'String', (d) => d.front.cls, ['`.deck-front`, the face that is not a peer.']],
  ['frontAuthoredSrc', 'String', (d) => d.front.src, ['Where the component mounts it.']],
  ['frontRuleSrc', 'String', (d) => `src/index.css:${d.front.line}`, ['Where the sheet gives it its stacking.']],
  [
    'frontPositionCss',
    'String',
    (d) => d.front.positionCss,
    ['`relative`: the front face is the deck’s only box in flow.'],
  ],
  [
    'peerTransitionDurationMs',
    'int',
    (d) => rowsInt(d.base.transition.ms),
    ['The `--dur` a peer rotates on — the deck’s own motion, not the face press’s `--dur-fast`.'],
  ],
  [
    'peerEaseX1',
    'double',
    (d) => d.base.transition.curve[0],
    ['The `--ease-out` control points, shared by every peer.'],
  ],
  ['peerEaseY1', 'double', (d) => d.base.transition.curve[1], []],
  ['peerEaseX2', 'double', (d) => d.base.transition.curve[2], []],
  ['peerEaseY2', 'double', (d) => d.base.transition.curve[3], []],
  [
    'peerTransformOriginCss',
    'String',
    (d) => d.base.transformOriginCss,
    [
      '`top center`, which the pass resolves to a fraction of the box; Flutter’s',
      'scale is about its centre, so the widget has to shift by this anchor.',
    ],
  ],
  [
    'peerClipPathCss',
    'String',
    (d) => d.base.clipPathCss,
    [
      'The authored `inset(0 0 calc(100% - var(--deck-lip)) 0)`, resolved by the',
      'engine to the pixels in [AppDeckFaceSpec.clipLipPx].',
    ],
  ],
  ['peerRuleSrc', 'String', (d) => `src/index.css:${d.base.line}`, ['`.deck-face`, the rule every peer is under.']],
];
rowsSpecClass(
  'AppDeckSpec',
  [
    '/// The wallet deck: the container the faces stack in, and the laws their',
    '/// positions, scales and opacities resolve from.',
    '///',
    `/// One number makes this shape: \`${faceDeckLip.decl.replace(/;$/, '')}\`, the`,
    '/// container’s own declaration. The deck is two lips tall, the near peer',
    '/// starts one lip down, and every peer is clipped to its own top lip — so the',
    `/// deck shows a ${faceDeckLip.px}px band of each back face. Generation reads`,
    `/// the declaration, the rules and the ${faceDeckPeers.length} measured peers`,
    '/// against each other, and stops if the arithmetic and the pixels disagree.',
    '///',
    '/// The budget — how many faces peek, and which — is JavaScript, not CSS, and is',
    '/// recorded in the citation list below rather than as a measured property.',
    ...faceAuthoredDoc(faceDeckAuthored.budget, 'How many faces peek, in the component’s own lines:'),
  ],
  FACE_DECK_FIELDS,
  [
    '  /// The deck’s pull-up, as the inset the hero has to absorb.',
    '  EdgeInsets get margin => EdgeInsets.only(bottom: marginBottomPx);',
    '',
    '  /// The peer’s easing.',
    '  Cubic get peerEase => Cubic(peerEaseX1, peerEaseY1, peerEaseX2, peerEaseY2);',
    '',
  ],
);

const FACE_DECK_FACE_FIELDS = [
  [
    'depth',
    'int',
    (f) => rowsInt(f.depth),
    ['The `data-depth` the component writes, which the sheet’s two state rules key off.'],
  ],
  ['stackRow', 'String', (f) => f.name, ['The `utilityStacks` row this peer was measured on.']],
  ['cssClasses', 'String', (f) => f.cls, ['The class and the attribute the pass resolved together.']],
  ['authoredSrc', 'String', (f) => f.src, ['Where `WalletDeck.tsx` mounts the peer.']],
  ['stateSrc', 'String', (f) => `src/index.css:${f.stateLine}`, ['The `[data-depth=…]` rule that places this peer.']],
  ['positionCss', 'String', (f) => f.positionCss, ['`absolute`: a peer is taken out of the deck’s flow and stacked.']],
  ['leftPx', 'double', (f) => f.leftPx, ['The authored `left: 0`.']],
  [
    'rightPx',
    'double',
    (f) => f.rightPx,
    ['The authored `right: 0`, which makes the peer the container’s full width.'],
  ],
  [
    'topPx',
    'double',
    (f) => f.topPx,
    [
      'How far down the peer sits. The near face is one lip down and the far face is',
      'at the top, which is what puts the far face behind the near one’s band.',
    ],
  ],
  ['scale', 'double', (f) => f.scale, ['The peer’s `transform: scale(…)` — a smaller card the further back it is.']],
  ['opacity', 'double', (f) => f.opacity, ['The peer’s opacity, which dims the deeper faces.']],
  [
    'clipLipPx',
    'double',
    (f) => f.clipLipPx,
    ['The clip: this peer shows the top lip of its own box and nothing below it.'],
  ],
  [
    'placementSrc',
    'String',
    (f) => f.authoredSrc,
    ['The lines whose `var(--deck-lip)` arithmetic produced the numbers above.'],
  ],
  ['lipSrc', 'String', (f) => f.lipCite, ['The `top` the pass measured this `topPx` from.']],
  ['clipSrc', 'String', (f) => f.clipCite, ['The `clip-path` that produced [clipLipPx].']],
  ['originSrc', 'String', (f) => f.originCite, ['The `transform-origin` the scale is anchored to.']],
];
rowsSpecClass(
  'AppDeckFaceSpec',
  [
    '/// One peer of the deck — a face the wallet data puts behind the front card.',
    '///',
    '/// The pair is not a gradient or a size but a placement: how far down the deck',
    '/// drops it, how small it scales, how far it dims, and how much of it the clip',
    '/// leaves visible. Both were measured on the element the component really mounts,',
    '/// and both are required to answer to the same `--deck-lip` the container does.',
  ],
  FACE_DECK_FACE_FIELDS,
  [],
);

const FACE_DECK_NAMES = { 1: 'near', 2: 'far' };
if (faceDeckPeers.map((f) => f.depth).join() !== Object.keys(FACE_DECK_NAMES).join()) {
  fail(`the deck peers are depths ${faceDeckPeers.map((f) => f.depth).join()}, which this enum’s names do not cover`);
}
L.push(
  '/// How far back a deck peer sits, in the order the component fills the slots.',
  'enum AppDeckDepth {',
  ...faceDeckPeers.map((f) => `  ${FACE_DECK_NAMES[f.depth]}(${f.depth}),`),
  ';',
  '',
  '  const AppDeckDepth(this.dataDepth);',
  '',
  '  /// The `data-depth` value the component writes and the sheet keys its rule off.',
  '  final int dataDepth;',
  '}',
  '',
);
const FACE_KEY_GRID_FIELDS = [
  ['stackRow', 'String', (g) => g.name, ['The `utilityStacks` row the grid was measured on.']],
  [
    'cssClasses',
    'String',
    (g) => g.cls,
    ['The verbatim class list, including the `sm:` variant the wide gap comes from.'],
  ],
  ['authoredSrc', 'String', (g) => g.src, ['Where the component mounts it.']],
  ['displayCss', 'String', (g) => g.displayCss, ['The measured `display`.']],
  [
    'positionCss',
    'String',
    (g) => g.positionCss,
    ['The measured `position`: the grid is the family’s only `static` box.'],
  ],
  [
    'tracks',
    'int',
    (g) => rowsInt(g.tracks),
    [
      'The equal columns `grid-cols-3` compiles to. Generation counts them out of the',
      'measured `grid-template-columns` rather than trusting the class, and requires',
      'the tracks to be equal — which they are down to the 1/64px the engine snaps to.',
    ],
  ],
  [
    'columnCountCss',
    'String',
    (g) => g.columnCountCss,
    ['The authored `-webkit-column-count` / track list the pass reported, kept as the record of that count.'],
  ],
  [
    'gapNarrowPx',
    'double',
    (g) => g.gapNarrowPx,
    [
      'The phone gap: `gap-2` at the unit every pass agrees on.',
      '',
      'This grid is the family’s only row whose geometry moves with the viewport, and',
      'the pair is ported as two numbers because the movement is the design. Which',
      'viewport takes which number is the `sm:` breakpoint’s business and stays with',
      'the caller — the same ruling that keeps a rail’s breakpoint out of',
      '[AppLedgerRailSpec].',
    ],
  ],
  [
    'gapWidePx',
    'double',
    (g) => g.gapWidePx,
    ['The `sm:gap-2.5` gap, which the desktop pass measured and the phone pass did not.'],
  ],
  ['gapNarrowCss', 'String', (g) => g.gapNarrowCss, ['The multiplier the narrow utility authors.']],
  ['gapWideCss', 'String', (g) => g.gapWideCss, ['The multiplier the wide utility authors.']],
  [
    'spacingUnitPx',
    'double',
    (g) => g.spacingUnitPx,
    ['`--spacing`, the unit both multipliers are read against — AppSpacing’s own number, re-read here.'],
  ],
];
rowsSpecClass(
  'AppActionKeyGridSpec',
  [
    '/// The row of keys under the hero balance: three equal columns and the gap',
    '/// between them.',
    '///',
    '/// The only viewport-dependent values in this file. Generation read the gap at',
    '/// both viewports, required the two axes of one viewport to agree, and required',
    '/// each pair to be the utility’s multiplier times the unit the class list names.',
  ],
  FACE_KEY_GRID_FIELDS,
  [],
);

const FACE_KEY_FIELDS = [
  ['stackRow', 'String', (k) => k.name, ['The `utilityStacks` row the key was measured on.']],
  ['cssClasses', 'String', (k) => k.cls, ['The verbatim class list the component writes on the button.']],
  ['authoredSrc', 'String', (k) => k.src, ['Where the component mounts it, re-checked against the pinned source.']],
  [
    'tag',
    'String',
    (k) => k.tag,
    ['The element the component renders — a `button`, which is why the press state is real.'],
  ],
  ['ruleSrc', 'String', (k) => `src/index.css:${faceKeyRule.line}`, ['Where the sheet authors `.action-key`.']],
  ['displayCss', 'String', (k) => k.displayCss, ['The measured `display`.']],
  [
    'positionCss',
    'String',
    (k) => k.positionCss,
    ['The measured `position`, which `.action-key` authors for the notch’s mask.'],
  ],
  [
    'flexDirectionCss',
    'String',
    (k) => k.flexDirectionCss,
    ['The measured `flex-direction`: the glyph over the word.'],
  ],
  ['alignItemsCss', 'String', (k) => k.alignItemsCss, ['The measured `align-items`, both axes centred.']],
  ['justifyContentCss', 'String', (k) => k.justifyContentCss, []],
  ['gapPx', 'double', (k) => k.gapPx, ['The authored `gap` between the glyph and its label.']],
  [
    'paddingCss',
    'String',
    (k) => faceKeyRule.paddingCss,
    [
      'The authored `padding` exactly as the rule writes it — three values, which is',
      'why the key’s inset is asymmetric and the top one is the notch’s room.',
    ],
  ],
  ['paddingTopPx', 'double', (k) => k.sides.top, ['The band the notch cuts out of.']],
  ['paddingRightPx', 'double', (k) => k.sides.right, []],
  ['paddingBottomPx', 'double', (k) => k.sides.bottom, []],
  ['paddingLeftPx', 'double', (k) => k.sides.left, []],
  [
    'radiusPx',
    'double',
    (k) => k.radiusPx,
    [
      'The corner `.action-key` authors itself, rather than through a `--r-*` token —',
      'so this one is a pixel and not a citation.',
    ],
  ],
  [
    'borderWidthPx',
    'double',
    (k) => k.borderWidthPx,
    ['The measured frame, which the rule’s `border: none` leaves at zero.'],
  ],
  ['borderCss', 'String', (k) => faceKeyRule.borderCss, ['The authored `border`.']],
  [
    'fill',
    'Color',
    (k) => k.fill,
    [
      'The key’s background — `var(--accent)`, which in the light scheme is the',
      'near-black ink and in the dark scheme the near-white of the inverted key. The',
      'token is the fact; the pixels are what this pass painted from it.',
    ],
  ],
  ['ink', 'Color', (k) => k.ink, ['The glyph and label colour, `var(--accent-fg)` — the exact inversion of [fill].']],
  [
    'fillToken',
    'String',
    (k) => faceKeyRule.accentToken,
    ['The token [fill] resolves from, named so a reader can follow it back to §2.1.'],
  ],
  ['inkToken', 'String', (k) => faceKeyRule.inkToken, ['The token [ink] resolves from.']],
  [
    'fontFamily',
    'String',
    (k) => k.fontFamily,
    [
      'The first family of the stack the `.action-key` probe measured. The row’s own',
      'class list authors no font, so this comes from the rule’s `font-family` and not',
      'from the 45 properties a stack row whitelists.',
    ],
  ],
  ['familyToken', 'String', (k) => faceKeyRule.familyToken, ['The token that stack is authored from.']],
  ['fontSizePx', 'double', (k) => k.fontSizePx, ['The measured size.']],
  ['sizeToken', 'String', (k) => faceKeyRule.sizeToken, ['The `--text-*` token it resolves from.']],
  ['fontWeight', 'int', (k) => rowsInt(k.fontWeight), ['The measured numeric weight.']],
  ['letterSpacingPx', 'double', (k) => k.letterSpacingPx, ['The phone resolution of the tracking.']],
  [
    'letterSpacingEm',
    'double',
    (k) => faceKeyRule.trackingEm,
    ['The authored `em`, which the measurement had to reproduce.'],
  ],
  ['lineHeightPx', 'double', (k) => k.lineHeightPx, ['The measured line box the label and glyph share.']],
  [
    'minWidthPx',
    'double',
    (k) => k.minWidthPx,
    ['`min-w-0`, so a long label shrinks rather than pushing the third key out.'],
  ],
  ['flexGrow', 'double', (k) => k.flexGrow, ['The measured `flex-grow`.']],
  ['flexShrink', 'double', (k) => k.flexShrink, ['The measured `flex-shrink`.']],
  [
    'opacity',
    'double',
    (k) => k.opacity,
    ['The measured opacity — `1` at rest, and [disabledOpacity] in the other row.'],
  ],
  [
    'transformCss',
    'String',
    (k) => k.transformCss,
    ['`none` at rest: the scale lives in `:active` and the pass measured the resting key.'],
  ],
  [
    'cursorCss',
    'String',
    (k) => k.cursorCss,
    ['The measured `cursor` — a web-only fact, kept as the record of the rule’s own answer.'],
  ],
  [
    'pressScale',
    'double',
    (k) => faceKeyStates.pressScale,
    ['The `:active` scale. Ruling D-U1 drops hover, not press: a touch device has one.'],
  ],
  [
    'pressSrc',
    'String',
    (k) => `src/index.css:${faceKeyStates.pressHeadLine},${faceKeyStates.pressDeclLine}`,
    ['The `:active` rule’s head and declaration.'],
  ],
  [
    'hoverBrightness',
    'double',
    (k) => faceKeyStates.hoverBrightness,
    [
      'The `:hover` `filter: brightness(…)`, recorded and deliberately not ported.',
      '',
      'Ruling D-U1 drops every hover state in this port because a touch device has no',
      'hover. The number stays on the spec so the drop is visible rather than silent,',
      'and so a reader can see what the sheet still authors.',
    ],
  ],
  [
    'hoverSrc',
    'String',
    (k) => `src/index.css:${faceKeyStates.hoverHeadLine},${faceKeyStates.hoverDeclLine}`,
    ['The `:hover` rule the drop reads against.'],
  ],
  [
    'disabledOpacity',
    'double',
    (k) => faceKey.off.opacity,
    [
      'The disabled key’s opacity. The disabled row was measured as its own element',
      'and generation proved it differs from the rest row in exactly this and the',
      'cursor — which is why [AppActionKeySpec] is one spec with one extra pair of',
      'numbers rather than two boxes.',
    ],
  ],
  [
    'disabledCursorCss',
    'String',
    (k) => faceKey.off.cursorCss,
    ['The disabled `cursor`, the other half of that difference.'],
  ],
  ['disabledStackRow', 'String', (k) => faceKey.off.name, ['The row the disabled state was measured on.']],
  ['disabledAuthoredSrc', 'String', (k) => faceKey.off.src, ['Where the component disables it.']],
  [
    'disabledSrc',
    'String',
    (k) => `src/index.css:${faceKeyStates.disabledHeadLine} (${faceKeyStates.disabledDeclLines})`,
    ['The `:disabled, [disabled]` rule’s head and its three declarations.'],
  ],
  [
    'transitionDurationMs',
    'int',
    (k) => rowsInt(faceKeyStates.transition.ms),
    ['The `--dur-fast` the rule transitions on.'],
  ],
  ['easeX1', 'double', (k) => faceKeyStates.transition.curve[0], ['The `--ease-out` control points.']],
  ['easeY1', 'double', (k) => faceKeyStates.transition.curve[1], []],
  ['easeX2', 'double', (k) => faceKeyStates.transition.curve[2], []],
  ['easeY2', 'double', (k) => faceKeyStates.transition.curve[3], []],
  [
    'transitionProps',
    'String',
    (k) => faceKeyStates.transition.props.join(' '),
    [
      '`transform filter` — the filter half belongs to the dropped hover, and the',
      'transform half to the press that survives it.',
    ],
  ],
  [
    'notchWidthPx',
    'double',
    (k) => faceKeyRule.notchWidthPx,
    ['The ellipse the mask cuts out of the top edge, authored as `--key-notch-w`.'],
  ],
  ['notchHeightPx', 'double', (k) => faceKeyRule.notchHeightPx, ['Its height, `--key-notch-h`.']],
  [
    'notchCentreX',
    'double',
    (k) => faceKeyRule.notch.centreX,
    ['The centre as a fraction of the box — `50%`, the middle of the top edge.'],
  ],
  [
    'notchCentreY',
    'double',
    (k) => faceKeyRule.notch.centreY,
    ['`0`, which is what puts the notch on the edge rather than in the box.'],
  ],
  [
    'notchCutAt',
    'double',
    (k) => faceKeyRule.notch.cutAt,
    [
      'Where the mask turns opaque, as a fraction of the ellipse’s own radius: 98.5%',
      'of a full ellipse would be the whole notch, so the cut is the ellipse with a',
      'hairline of its own edge left in.',
    ],
  ],
  ['notchEdgePx', 'double', (k) => faceKeyRule.notch.edgePx, ['That hairline — `calc(98.5% + 1px)`.']],
  [
    'notchAuthored',
    'String',
    (k) => faceKeyRule.maskAuthored,
    ['The declaration as the sheet writes it, so the numbers above can be traced to it.'],
  ],
  ['notchSrc', 'String', (k) => `src/index.css:${faceKeyRule.line}`, ['Where `.action-key` authors the mask.']],
];
const FACE_KEY_MEMBERS = [
  '  /// The inset the glyph and label sit inside — the top one leaves the notch’s room.',
  '  EdgeInsets get padding =>',
  '      EdgeInsets.fromLTRB(paddingLeftPx, paddingTopPx, paddingRightPx, paddingBottomPx);',
  '',
  '  BorderRadius get borderRadius => BorderRadius.circular(radiusPx);',
  '',
  '  /// The weight Flutter names for the measured numeric weight.',
  '  FontWeight get weight => FontWeight.values[fontWeight ~/ 100 - 1];',
  '',
  '  /// The key’s own type: the word it paints in [ink] at the measured size.',
  '  TextStyle get textStyle => TextStyle(',
  '        fontFamily: fontFamily,',
  '        color: ink,',
  '        fontSize: fontSizePx,',
  '        fontWeight: weight,',
  '        height: lineHeightPx / fontSizePx,',
  '        letterSpacing: letterSpacingEm * fontSizePx,',
  '      );',
  '',
  '  /// The press easing.',
  '  Cubic get ease => Cubic(easeX1, easeY1, easeX2, easeY2);',
  '',
];
rowsSpecClass(
  'AppActionKeySpec',
  [
    '/// One action key in one brightness: the inverted accent box, its notch, its',
    '/// type and the states the sheet gives it.',
    '///',
    '/// A key is the family’s only box whose colour is a token pair rather than a',
    '/// gradient — `--accent` under `--accent-fg`, which is why generation reads both',
    '/// from §2.1 and requires the measured pixels to be what the pass painted.',
    '/// The disabled face is the same box with two numbers moved, proven against a',
    '/// second measured row rather than assumed.',
  ],
  FACE_KEY_FIELDS,
  FACE_KEY_MEMBERS,
);

const FACE_KEY_ICON_FIELDS = [
  ['stackRow', 'String', (i) => i.name, ['The `utilityStacks` row the icon wrapper was measured on.']],
  ['cssClasses', 'String', (i) => i.cls, ['The class list the component writes around the glyph.']],
  ['authoredSrc', 'String', (i) => i.src, ['Where the component mounts it.']],
  ['ruleSrc', 'String', (i) => `src/index.css:${i.line}`, ['Where the sheet authors `.action-key-icon`.']],
  ['displayCss', 'String', (i) => i.displayCss, ['`block`, which is what lets the wrapper take `line-height: 0`.']],
  [
    'lineHeightPx',
    'double',
    (i) => i.lineHeightPx,
    [
      '`0`, authored so the glyph’s box is the glyph and nothing more — the gap',
      'between the symbol and its label is the key’s `gap`, not leading the wrapper',
      'adds to it.',
    ],
  ],
  [
    'glyphSrc',
    'String',
    (i) => i.glyphSrc,
    [
      'The lines that choose the symbol. Which Lucide glyph each key draws is the',
      'component’s mapping, not a measured property; the icon dependency has not',
      'landed, so this is a citation and not a name.',
    ],
  ],
];
rowsSpecClass(
  'AppActionKeyIconSpec',
  [
    '/// The box around a key’s glyph. It draws nothing itself: it is the web’s',
    '/// leading-killer, ported so the key’s `gap` is the only space between the symbol',
    '/// and the word under it.',
  ],
  FACE_KEY_ICON_FIELDS,
  [],
);
/** `rowsSpecValue` walks a field table against a record, and that pairing is the one
 *  place a reader that renamed a property would print `null` into a Dart field the
 *  class declares non-nullable. The holder is where every table meets its record, so
 *  it checks the pairing before it emits: a required field the record cannot answer
 *  for stops the run rather than landing a file that will not compile. */
const faceSpecValue = (ctor, fields, rec, label, ind) => {
  for (const [name, type, get] of fields) {
    if (type.endsWith('?')) continue;
    let value;
    try {
      value = get(rec);
    } catch (e) {
      fail(`${ctor} for ${label}: reading the field ${name} threw ${e.message}`);
    }
    if (value === undefined || value === null) {
      fail(`${ctor} for ${label}: ${name} is required, but the record carries no value for it`);
    }
  }
  return rowsSpecValue(ctor, fields, rec, ind);
};

const faceSlotRecords = FACE_EMIT_SLOTS.map((row) => (row === faceKeyLabel.name ? faceKeyLabel : faceSlots[row]));
if (faceSlotRecords.map((s) => s.name).join() !== FACE_EMIT_SLOTS.join()) {
  fail('the holder’s slot records are not the rows AppFaceSlot lists');
}

const faceDeckRec = {
  box: faceDeckBox,
  rule: faceDeckRule,
  lip: faceDeckLip,
  base: faceDeckFaceBase,
  front: faceDeckFront,
};

/** One `static const` holding a whole spec: its doc, its declaration, its value.
 *  The value is one multi-line string and `dart format` places it afterwards, so
 *  the emitter never has to guess a layout for the file it writes. */
const faceConst = (doc, type, name, ctor, fields, rec, label) => {
  L.push(...doc, `  static const ${type} ${name} = ${faceSpecValue(ctor, fields, rec, label, '    ')};`, '');
};

L.push(
  '/// The face, the deck and the keys, indexed the way the widgets ask for them.',
  '///',
  '/// Every value below is one the reader measured on the class list the component',
  '/// really writes. Nothing here has a default and no lookup falls back: a key that',
  '/// was never measured throws, because a substitute would be a second design.',
  'abstract final class AppFaces {',
  '',
  '  /// The gradient of each tone, in the order `CardFace.tsx` declares them. One',
  '  /// entry carries both passes, because a tone is one recipe resolved twice.',
  '  static const Map<AppFaceTone, AppFaceTintSpec> tints =',
  '      <AppFaceTone, AppFaceTintSpec>{',
  ...faceTints.map(
    (t) => `    AppFaceTone.${t.id}: ${faceSpecValue('AppFaceTintSpec', FACE_TINT_FIELDS, t, t.name, '      ')},`,
  ),
  '  };',
  '',
  '  /// The tone’s paint. The caller chooses a tone; nothing here infers one.',
  '  static AppFaceTintSpec tint(AppFaceTone tone) {',
  '    final AppFaceTintSpec? spec = tints[tone];',
  '    if (spec == null) {',
  "      throw ArgumentError('no gradient was measured for ${tone.name}');",
  '    }',
  '    return spec;',
  '  }',
  '',
);
faceConst(
  [
    '  /// The `.card-face::before` sheen every tone draws over its gradient — the',
    '  /// highlight and the hairline, as the sheet layers them.',
  ],
  'AppFaceSheenSpec',
  'sheen',
  'AppFaceSheenSpec',
  FACE_SHEEN_FIELDS,
  faceSheen,
  faceSheen.cls,
);

faceConst(
  [
    '  /// The press a face takes, from the `.pressable` class its own box cites.',
    '  ///',
    '  /// Hover is not ported anywhere in this family: ruling D-U1 drops it because',
    '  /// a touch device has no hover, and `.pressable` authors none to drop.',
  ],
  'AppFacePressSpec',
  'press',
  'AppFacePressSpec',
  FACE_PRESS_FIELDS,
  facePress,
  facePress.cls,
);

faceConst(
  [
    '  /// The box every face is: the frame, the inset, the ink and the ratio.',
    `  /// Its corner is \`${faceBase.radiusToken}\` and its float is`,
    `  /// \`${faceBase.shadowToken}\` — resolved through [AppRadii] and [AppShadows]`,
    '  /// rather than restated, because generation proved the passes measured',
    `  /// ${faceOwners.radiusPx}px of corner and the token’s own layers in both`,
    '  /// brightnesses. A face drawn here is the frame the theme names.',
  ],
  'AppCardFaceSpec',
  'face',
  'AppCardFaceSpec',
  FACE_BOX_FIELDS,
  faceToneDefault.box,
  faceToneDefault.box.name,
);

L.push(
  '  /// The bands and words of a face, plus the word under an action key, each',
  '  /// keyed by the `utilityStacks` row it was measured on. Every band is read in',
  '  /// both brightnesses and generation refuses one whose geometry moves with the',
  '  /// scheme, which is why this is one table and not two.',
  '  ///',
  `  /// The gold chip is not here: the row \`${faceChipSlot.light.name}\`, measured`,
  `  /// at ${faceChipSlot.light.src}, is the box AppChips already paints.`,
  '  /// Generation stops if the two disagree rather than port one chip twice.',
  '  static const Map<AppFaceSlot, AppFaceSlotSpec> slots =',
  '      <AppFaceSlot, AppFaceSlotSpec>{',
  ...faceSlotRecords.map(
    (s) =>
      `    AppFaceSlot.${faceSlotId(s.name)}: ${faceSpecValue('AppFaceSlotSpec', FACE_SLOT_FIELDS, s, s.name, '      ')},`,
  ),
  '  };',
  '',
  '  /// The band as the component writes it.',
  '  static AppFaceSlotSpec slot(AppFaceSlot slot) {',
  '    final AppFaceSlotSpec? spec = slots[slot];',
  '    if (spec == null) {',
  "      throw ArgumentError('no band was measured for ${slot.name}');",
  '    }',
  '    return spec;',
  '  }',
  '',
);

faceConst(
  [
    '  /// The wallet deck: the container, the lip every other number in it',
    '  /// resolves from, and the laws its peers are placed by.',
  ],
  'AppDeckSpec',
  'deck',
  'AppDeckSpec',
  FACE_DECK_FIELDS,
  faceDeckRec,
  faceDeckBox.name,
);

L.push(
  '  /// One peer per `data-depth` the sheet has a rule for. How many peers a deck',
  '  /// builds is the component’s own budget, cited on [AppDeckSpec]; what is',
  '  /// measured here is where a peer of that depth sits.',
  '  static const Map<AppDeckDepth, AppDeckFaceSpec> deckFaces =',
  '      <AppDeckDepth, AppDeckFaceSpec>{',
  ...faceDeckPeers.map(
    (f) =>
      `    AppDeckDepth.${FACE_DECK_NAMES[f.depth]}: ${faceSpecValue('AppDeckFaceSpec', FACE_DECK_FACE_FIELDS, f, f.name, '      ')},`,
  ),
  '  };',
  '',
  '  /// The placement a peer of this depth takes.',
  '  static AppDeckFaceSpec deckFace(AppDeckDepth depth) {',
  '    final AppDeckFaceSpec? spec = deckFaces[depth];',
  '    if (spec == null) {',
  "      throw ArgumentError('no deck peer was measured at depth ${depth.dataDepth}');",
  '    }',
  '    return spec;',
  '  }',
  '',
);

faceConst(
  [
    '  /// The row of keys under the hero balance: three equal columns and the two',
    '  /// gaps the `sm:` variant switches between. Which viewport takes which gap',
    '  /// stays with the caller — the same ruling that keeps a rail’s breakpoint',
    '  /// out of [AppLedgerRailSpec].',
  ],
  'AppActionKeyGridSpec',
  'grid',
  'AppActionKeyGridSpec',
  FACE_KEY_GRID_FIELDS,
  faceKeyGrid,
  faceKeyGrid.name,
);

faceConst(
  [
    `  /// An action key as the light pass painted it: \`${faceKeyRule.accentToken}\``,
    `  /// under \`${faceKeyRule.inkToken}\` — the app’s accent, inverted against the`,
    '  /// page.',
  ],
  'AppActionKeySpec',
  'keyLight',
  'AppActionKeySpec',
  FACE_KEY_FIELDS,
  faceKey.restPaint.light,
  'action-key light',
);

faceConst(
  ['  /// The same key as the dark pass painted it.'],
  'AppActionKeySpec',
  'keyDark',
  'AppActionKeySpec',
  FACE_KEY_FIELDS,
  faceKey.restPaint.dark,
  'action-key dark',
);

faceConst(
  [
    '  /// The disabled key, measured as its own row: generation proved it differs',
    '  /// from the rest row in [AppActionKeySpec.disabledOpacity] and',
    '  /// [AppActionKeySpec.disabledCursorCss] and nothing else.',
  ],
  'AppActionKeySpec',
  'keyOffLight',
  'AppActionKeySpec',
  FACE_KEY_FIELDS,
  faceKey.offPaint.light,
  'action-key-disabled light',
);

faceConst(
  ['  /// The disabled key in the dark pass.'],
  'AppActionKeySpec',
  'keyOffDark',
  'AppActionKeySpec',
  FACE_KEY_FIELDS,
  faceKey.offPaint.dark,
  'action-key-disabled dark',
);

L.push(
  '  /// The key as one brightness painted it, at rest or disabled.',
  '  static AppActionKeySpec keyAt(Brightness brightness, {bool enabled = true}) {',
  '    if (enabled) {',
  '      return brightness == Brightness.dark ? keyDark : keyLight;',
  '    }',
  '    return brightness == Brightness.dark ? keyOffDark : keyOffLight;',
  '  }',
  '',
);

faceConst(
  [
    '  /// The box around a key’s glyph. It draws nothing: it is the web’s',
    '  /// leading-killer, ported so the key’s gap is the only space between the',
    '  /// symbol and the word under it.',
  ],
  'AppActionKeyIconSpec',
  'icon',
  'AppActionKeyIconSpec',
  FACE_KEY_ICON_FIELDS,
  faceKeyIconRule,
  faceKeyIconRule.name,
);

L.push('}', '');
finish('app_faces.dart');

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
    `  numeral/money rows emitted:  ${numerals.length} classes x 2 passes  -> AppNumerals`,
    `  ledger chrome emitted:     ${Object.keys(ROW_CLASSES).length} row slots + day head, divider, 2 empty states, 2 rails, ${catToneNames.length} chip tones + ${CAT_SIZES.length} sizes x 2 passes  -> AppRows`,
    `  card face + action keys emitted: ${faceTints.length} tones x 2 passes + the box + ${faceSlotRecords.length} bands + the deck with ${faceDeckPeers.length} peers + the key in 2 states x 2 passes  -> AppFaces`,
    `  files written:                 ${dartFiles.map((f) => f[0]).join(', ')}`,
  ].join('\n'),
);
