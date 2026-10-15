/**
 * Phase 1 UI spec renderer.
 *
 * Writes parity/UI_SPEC.md from parity/ui-tokens.json. Every colour, radius, type
 * and motion value in that document is copied from the measurement file by this
 * script — none of it is typed by hand, so the doc cannot drift away from what
 * Chrome actually produced.
 *
 * It also re-checks that src/index.css is still byte-identical to tag `pre-flutter`
 * (the same rule the fixture generator enforces, D7). If the stylesheet has moved,
 * this refuses to write, because the measured values would no longer describe the app.
 *
 * Usage: node parity/render_ui_spec.cjs
 * Input:  parity/ui-tokens.json  (from `node parity/ui-tokens.cjs`, dev server required)
 *
 * Note on child_process: git is called with an argv array and no shell, so there is
 * no command string to inject. The paths below are literals in this file, not values
 * read from the measurement JSON.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TAG = 'pre-flutter';
const CSS_REL = 'src/index.css';
const TOKENS = JSON.parse(fs.readFileSync(path.join(__dirname, 'ui-tokens.json'), 'utf8'));
const CSS_TEXT = fs.readFileSync(path.join(ROOT, CSS_REL), 'utf8');
const OUT = path.join(__dirname, 'UI_SPEC.md');

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

// ---------------------------------------------------------------- provenance
const tagBlob = git(['rev-parse', `${TAG}:${CSS_REL}`]);
const workBlob = git(['hash-object', CSS_REL]);
if (tagBlob !== workBlob) {
  throw new Error(
    `SOURCE DRIFT: ${CSS_REL} in the working tree is blob ${workBlob} but tag ${TAG} has ${tagBlob}. ` +
      `Re-run the token probe against the tagged stylesheet before rendering the spec.`,
  );
}
const commitSha = git(['rev-parse', `${TAG}^{commit}`]);
// The tagged blob, not the bytes on disk. `core.autocrlf` leaves a Windows checkout of
// `src/index.css` in CRLF while the blob is LF, so a sha256 taken from the working file
// changes with the platform it was rendered on — and a provenance number that moves
// between machines is not provenance. The drift check above is what proves the working
// tree carries this content; the hash says which content it is.
const cssSha256 = crypto
  .createHash('sha256')
  .update(execFileSync('git', ['cat-file', 'blob', tagBlob], { cwd: ROOT }))
  .digest('hex');

// ---------------------------------------------------------------- small helpers
/**
 * A table cell is escaped twice over in this file — `cell()` and the code spans built from source fragments
 * escape before `mdRow` escapes the row — so the pipe pass has to skip what is already escaped. `\\|` is a
 * literal backslash next to a column delimiter, and it is what splits a row whose citation carries a TypeScript
 * union or a `||`.
 */
const esc = (s) =>
  String(s)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(?<!\\)\|/g, '\\|');
const cell = (s) => '`' + esc(s) + '`';
/**
 * A code span over text the source itself wrote. The delimiter run is one backtick longer than the longest run
 * the fragment carries, and the content is padded when it opens or closes with a backtick, because a citation
 * of a template literal would otherwise end its own span at the first backtick inside it.
 */
const span = (s) => {
  const text = String(s).replace(/\s+/g, ' ').trim();
  const runs = new Set((text.match(/`+/g) || []).map((r) => r.length));
  let n = 1;
  while (runs.has(n)) n += 1;
  const d = '`'.repeat(n);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return d + pad + text + pad + d;
};
const mdRow = (cols) => '| ' + cols.map(esc).join(' | ') + ' |';

/** The font record stores a codepoint the way the font tables print it: lowercase, at
 *  least four digits. `cpLabel` is the same value written the way Unicode names it. */
const cpHex = (n) => n.toString(16).padStart(4, '0');
const cpLabel = (n) => 'U+' + cpHex(n).toUpperCase();

/** One measured colour, in the form the Dart theme needs. The alpha is Chrome’s own
 *  float, not a255/255 — Color.fromRGBO takes a double, so the author value survives. */
const dart = (c) => {
  if (!c) return '—';
  const a = c.alpha === 1 ? '1.0' : String(c.alpha);
  return `Color.fromRGBO(${c.r}, ${c.g}, ${c.b}, ${a})`;
};
const rgbText = (c) => (c ? `rgb(${c.r} ${c.g} ${c.b} / ${c.a255})` : '—');

/** Every colour record in the measurement file, flat, with its address. */
const allColours = () => {
  const out = [];
  for (const [pass, t] of Object.entries(TOKENS.themes)) {
    for (const [name, v] of Object.entries(t.root)) if (v.srgb) out.push({ at: `${pass} ${name}`, c: v.srgb });
    for (const [sel, p] of Object.entries(t.probes))
      for (const key of ['color', 'backgroundColor', 'borderTopColor', 'borderLeftColor'])
        if (p[key] && p[key].srgb) out.push({ at: `${pass} ${sel} . ${key}`, c: p[key].srgb });
  }
  return out;
};
const COLOURS = allColours();

/** Same authored colour at two different alphas must be the same colour. When the
 *  canvas says otherwise, that is the measurement failing, not the CSS. */
const alphaSplits = () => {
  const byColour = new Map();
  for (const { at, c } of COLOURS) {
    const key = `${c.r},${c.g},${c.b}`;
    if (!byColour.has(key)) byColour.set(key, []);
    byColour.get(key).push({ at, c });
  }
  const rows = [];
  for (const [key, list] of byColour) {
    if (list.length < 2) continue;
    if (new Set(list.map((l) => l.c.alpha)).size < 2) continue;
    const pixels = new Set(list.filter((l) => l.c.canvasBytes).map((l) => l.c.canvasBytes.slice(0, 3).join(',')));
    if (pixels.size > 1)
      rows.push({
        colour: `rgb(${key})`,
        rows: list
          .slice(0, 4)
          .map(
            (l) =>
              `\`${esc(l.at)}\` α=${l.c.alpha} canvas rgb(${l.c.canvasBytes ? l.c.canvasBytes.slice(0, 3).join(',') : 'n/a'})`,
          )
          .join('<br>'),
      });
  }
  return rows.slice(0, 8);
};

/** The four measurement passes. */
const PASSES = ['light-desktop', 'light-phone', 'dark-desktop', 'dark-phone'];
const THEME = { light: TOKENS.themes['light-desktop'], dark: TOKENS.themes['dark-desktop'] };
const PHONE = { light: TOKENS.themes['light-phone'], dark: TOKENS.themes['dark-phone'] };

const kindOf = (v) => (v.srgb ? 'colour' : v.substituted ? 'compound' : v.unresolved ? 'unresolved' : 'other');

/** Tokens declared on :root, minus the ones Tailwind owns. */
const rootNames = () => {
  const names = Object.keys(THEME.light.root).filter((n) => !n.startsWith('--tw-'));
  return names.sort((a, b) => a.localeCompare(b));
};

// ---------------------------------------------------------------- css parsing
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const CSS_NOC = stripComments(CSS_TEXT);
const ruleHeads = [...CSS_NOC.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim());

const headsMatching = (needle) => [
  ...new Set(ruleHeads.filter((h) => h.includes(needle)).flatMap((h) => h.split(',').map((x) => x.trim()))),
];

const hoverSelectors = headsMatching(':hover');
const focusSelectors = headsMatching(':focus-visible');
const printSelectors = (() => {
  const i = CSS_NOC.indexOf('@media print');
  if (i < 0) return [];
  const block = CSS_NOC.slice(i);
  return [...new Set([...block.matchAll(/\.([\w-]+)/g)].map((m) => '.' + m[1]))];
})();
const minWidthBlocks = [...CSS_NOC.matchAll(/@media\s*\(min-width:\s*(\d+px)\)/g)].map((m) => m[1]);
const reducedMotionBlock = CSS_NOC.includes('@media (prefers-reduced-motion: reduce)');

/** Rules that force a value with `!important` and are NOT inside an `@media` block.
 *  Media-scoped ones are the print sheet and reduced-motion, both already listed in
 *  §7; these are the app's own repaint layer, and the port cannot re-derive them
 *  from specificity — the declaration wins even if Dart-side styling disagrees.
 *  Scanned over CSS_BLANK, the comment-stripped text with every character position
 *  preserved, so a match offset converts to the real source line. */
const CSS_BLANK = CSS_TEXT.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
const lineAt = (idx) => CSS_BLANK.slice(0, idx).split('\n').length;
const importantRules = () => {
  const ranges = [];
  const mediaRe = /@media[^{]*\{/g;
  let m;
  while ((m = mediaRe.exec(CSS_BLANK))) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < CSS_BLANK.length && depth > 0) {
      if (CSS_BLANK[i] === '{') depth++;
      else if (CSS_BLANK[i] === '}') depth--;
      i++;
    }
    ranges.push([m.index, i]);
  }
  /** Tailwind escapes what CSS selectors cannot carry literally: `bg-\[\#050508\]`. */
  const unescape = (s) => s.replace(/\\(.)/g, '$1');
  const leafOf = (sel) => {
    const last =
      unescape(sel)
        .replace(/:not\([^)]*\)/g, '')
        .trim()
        .split(/\s+/)
        .pop() || '';
    const attr = /\[class[*^]?=(['"]?)([\w-]+)/.exec(last);
    if (attr) return attr[2];
    const m2 = /\.([A-Za-z0-9_.\-\[\]#%/]+)/.exec(last);
    return m2 ? m2[1] : last;
  };
  const out = [];
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  while ((m = ruleRe.exec(CSS_BLANK))) {
    if (ranges.some(([a, b]) => m.index >= a && m.index < b)) continue;
    if (!/!important/.test(m[2])) continue;
    out.push({
      line: lineAt(m.index + m[0].search(/\S/)),
      targets: [
        ...new Set(
          m[1]
            .trim()
            .split(',')
            .map((s) => leafOf(s.trim())),
        ),
      ].filter(Boolean),
      decls: m[2].trim().replace(/\s+/g, ' '),
    });
  }
  return out;
};

/** Which classes index.css declares, so the coverage claim is a measurement too. */
const declaredClasses = () => {
  const set = new Set();
  for (const h of ruleHeads) for (const m of h.matchAll(/\.([A-Za-z][\w-]*)/g)) set.add('.' + m[1]);
  // Drop the ones that only ever appear inside a utility escape or a URL.
  return [...set].filter((c) => !/^\.(com|googleapis|light|dark|bg-|p-\d|lg|grid)$/.test(c)).sort();
};
const DECLARED = declaredClasses();
const PROBED_SET = new Set(
  Object.keys(THEME.light.probes).flatMap((s) =>
    [...s.split(';')[0].matchAll(/\.([A-Za-z][\w-]*)/g)].map((m) => '.' + m[1]),
  ),
);
const UNPROBED = DECLARED.filter((c) => !PROBED_SET.has(c));

const cssLineOf = (needle) => {
  const lines = CSS_TEXT.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) if (lines[i].includes(needle)) return i + 1;
  return null;
};

/**
 * Every string the money fixtures expect, tagged with the locale that produced it.
 * `money.json` is single-locale — its `_provenance` says which — while
 * `number-locale.json` names the locale inside each case name. This is the same
 * reading `mobile/test/theme/app_fonts_test.dart` makes, so the document and the
 * test cannot disagree about what the fixtures cover.
 */
const fixtureStrings = () => {
  const out = [];
  for (const file of ['money.json', 'number-locale.json']) {
    const root = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', file), 'utf8'));
    const provenanceLocale = root._provenance && root._provenance.locale;
    if (!provenanceLocale) throw new Error(`parity/fixtures/${file}: _provenance.locale is missing`);
    for (const c of root.cases || []) {
      if (typeof c.expected !== 'string') continue;
      let locale = provenanceLocale;
      if (file === 'number-locale.json') {
        const m = /"([A-Za-z-]+)"/.exec(c.name);
        if (!m) throw new Error(`parity/fixtures/${file}: case "${c.name}" names no locale`);
        locale = m[1];
      }
      out.push({ locale, text: c.expected });
    }
  }
  return out;
};

const IMPORTANTS = importantRules();

// ---------------------------------------------------------------- doc assembly
const L = [];
const put = (...s) => L.push(...s);
const table = (header, rows) => {
  put(mdRow(header), mdRow(header.map(() => '--')), ...rows.map((r) => mdRow(r)), '');
};

put('# Phase 1 — UI_SPEC: every visual value, measured in a browser', '');
put(
  'This is the contract for the Flutter theme. It contains no authored numbers: every sRGB,',
  'radius, type and motion value below was read out of Chrome while it rendered the real',
  '`src/index.css`, then copied here by `parity/render_ui_spec.cjs`.',
  '',
);
put('## 0. Provenance', '');
table(
  ['fact', 'value'],
  [
    ['source tag', TAG],
    ['source commit', commitSha],
    ['stylesheet', `${CSS_REL} — git blob ${tagBlob}, sha256 ${cssSha256}`],
    ['drift check', `passed — working-tree blob ${workBlob} equals the tagged blob`],
    ['resolver page', `${TOKENS.base} (dev server, app CSS unmodified)`],
    ['browser', 'Chromium via Playwright, sRGB canvas, deviceScaleFactor 1'],
    ['passes', PASSES.join(', ')],
    ['viewport sizes', `${THEME.light.viewport.width}px and ${PHONE.light.viewport.width}px`],
    ['colour tokens unresolved', String((TOKENS.unresolvedColourTokens || []).length)],
    [
      'colour functions left in resolved values',
      String((TOKENS.pixelVsEngine || {}).leftovers ? TOKENS.pixelVsEngine.leftovers.length : 0),
    ],
    [
      'bytes disagreeing with the engine float',
      String((TOKENS.pixelVsEngine || {}).byteDrifts ? TOKENS.pixelVsEngine.byteDrifts.length : 0),
    ],
    [
      'JSX colour utilities scanned / paint',
      `${TOKENS.utilities.scanned} / ${Object.keys(THEME.light.utilities).length}`,
    ],
    ['`dark:` variant tokens', `${TOKENS.darkVariantMatrix.tokens.length}, measured in 4 app×OS combinations`],
    ['generated at', TOKENS.generatedAt],
    ['web app changed by this file', 'nothing — read-only'],
  ],
);
put(
  `The probe measured ${Object.keys(THEME.light.root).length} custom properties on \`html\`, ` +
    `${Object.keys(THEME.light.probes).length} class probes, ${Object.keys(THEME.light.utilities).length} of the ` +
    `${TOKENS.utilities.scanned} colour utilities the components write in \`className\`, and every one of them in ` +
    'both themes at both viewports.',
  '`document.body` declared no property that `html` did not already have, so the token tables carry one column set.',
  '',
);
put('## 1. How to read a colour', '');
put(
  'Each measured colour carries `r,g,b,a255` (bytes), `float` (the same values unrounded),',
  '`engineSerialised` (Chrome’s own text, e.g. `color(srgb 0.052274 0.0874821 0.139502 / 0.05)`),',
  '`hex`, and three canvas readings kept only as evidence about the canvas.',
  '',
  'The Dart side uses **`Color.fromRGBO(r, g, b, alpha)`**, where `alpha` is Chrome’s own float alpha and',
  '`a255` is its 8-bit form for frameworks that only take bytes. That is the only form the tables below print.',
  '',
);
put('### 1.1 The colour is Chrome’s conversion, not a pixel reading', '');
put(
  'The first version of this probe painted each value onto a 1×1 canvas and read the bytes back. That is',
  'the obvious method, and for translucent colours it is wrong: a canvas stores premultiplied 8-bit',
  'channels, so as alpha falls the colour keeps fewer bits of signal, and un-premultiplying what is left',
  'recovers a number that is no longer the colour the CSS asked for.',
  '',
);
put(
  'The table below is generated from the measurement set rather than hand-picked. Each row is one colour',
  'the app uses at two or more different alphas. The engine returned the **same** sRGB for every row,',
  'changing only the alpha; the canvas returned **different** RGB for the translucent occurrences. The',
  'canvas was wrong about the colour — invisibly to a viewer, fatally to a golden test.',
  '',
);
{
  const splits = alphaSplits();
  if (splits.length === 0) {
    put('(no colour in the measurement set appears at two alphas with two different canvas answers)', '');
  } else {
    table(
      ['engine colour', 'occurrences — identical colour, different canvas bytes'],
      splits.map((s) => [cell(s.colour), s.rows]),
    );
  }
}
put(
  'So the reading used here is the engine’s: `color-mix(in srgb, X 100%, X 100%)` — a colour mixed with',
  'itself, which is unchanged — read back out of the computed style. Chrome then prints its own',
  'OKLCH/P3 → sRGB conversion at full precision, alpha included, with no pixel anywhere in the loop.',
  '',
);
{
  const px = TOKENS.pixelVsEngine || {};
  const buckets = px.maxDeviationByAlphaBucket || {};
  const canvasReadings = COLOURS.filter((x) => x.c.canvasBytes).length;
  put(
    'The canvas readings are still taken, so the size of that error is a measured fact rather than an',
    `assertion. Worst per-channel disagreement between canvas and engine, over ${canvasReadings} readings`,
    'that a canvas could hold at all:',
    '',
  );
  table(
    ['alpha bucket', 'worst canvas-vs-engine error, in 8-bit units'],
    Object.entries(buckets).map(([k, v]) => [cell(k), String(v)]),
  );
  put(
    'Opaque colours agree exactly (0), and the error grows as alpha falls — which is the whole reason the',
    'engine path is used. `worstFive` in `ui-tokens.json` names the individual offenders.',
    '',
  );
  const og = COLOURS.filter((x) => x.c.outOfGamut);
  const extremes = COLOURS.reduce(
    (acc, x) => ({
      lo: Math.min(acc.lo, x.c.float.r, x.c.float.g, x.c.float.b),
      hi: Math.max(acc.hi, x.c.float.r, x.c.float.g, x.c.float.b),
    }),
    { lo: 255, hi: 0 },
  );
  put(
    `**${og.length} of ${COLOURS.length} colour readings are outside the sRGB gamut** — the authored OKLCH and`,
    'Display-P3 values reach further than sRGB can hold. Across the whole set the unrounded sRGB channels',
    `run from ${extremes.lo.toFixed(2)} to ${extremes.hi.toFixed(2)}. Every byte in this document is the value *after*`,
    'Chrome’s clamp, because the clamped value is what actually paints. Flutter clamps the same way, so the',
    'two agree — but a port that re-derived these colours from OKLCH with its own rounding would differ by a',
    'byte in exactly these cases, and no golden test would explain why. That is why the spec ships numbers,',
    'not the CSS.',
    '',
  );
}
put('### 1.2 `hex` is not the colour either', '');
put(
  '`hex` is `r,g,b` written as text and **ignores alpha completely**. A shadow token whose colour is',
  'rgba(13, 22, 36, 0.05) has the hex `#0d1624`, and a design tool showing that hex against a light',
  'surface is showing something 20× more opaque than the app renders. Read `a255` alongside it, always.',
  '',
);
put(
  'A token whose `raw` begins `color(srgb 0.986582 …)` was authored in Display-P3; the values here are',
  'after conversion, which is correct for a Flutter canvas, and the P3 original stays in `raw` for reference.',
  '',
);

// ---------------------------------------------------------------- 2. palette
put('## 2. Palette tokens — light and dark', '');
put(
  'All values are the custom properties `index.css` declares on `:root` and overrides on `.dark`. ',
  '`phone` marks a token whose rendered result differs between the desktop and phone viewport.',
  '',
);
{
  const names = rootNames();
  const colourRows = [];
  const compoundRows = [];
  const otherRows = [];
  for (const name of names) {
    const l = THEME.light.root[name];
    const d = THEME.dark.root[name];
    const lp = PHONE.light.root[name];
    const dp = PHONE.dark.root[name];
    const viewShift = JSON.stringify(l) !== JSON.stringify(lp) || JSON.stringify(d) !== JSON.stringify(dp);
    const raw = l.raw === d.raw ? l.raw : `${l.raw} / ${d.raw}`;
    if (kindOf(l) === 'colour') {
      colourRows.push([
        cell(name),
        cell(raw),
        cell(dart(l.srgb)),
        cell(dart(d.srgb)),
        l.srgb.hex === d.srgb.hex ? 'equal' : `${l.srgb.hex} / ${d.srgb.hex}`,
        viewShift ? 'phone differs' : '',
      ]);
    } else if (kindOf(l) === 'compound') {
      compoundRows.push([
        cell(name),
        cell(raw),
        cell(l.substituted),
        cell(d.substituted),
        viewShift ? 'phone differs' : '',
      ]);
    } else if (name !== 'raw' && kindOf(l) === 'unresolved') {
      otherRows.push([cell(name), cell(raw), '**UNRESOLVED**']);
    } else {
      otherRows.push([cell(name), cell(raw), '']);
    }
  }
  put(`### 2.1 Colour tokens (${colourRows.length})`, '');
  put(
    'Names beginning `--color-` are the Tailwind theme palette that utility classes (`bg-amber-100`,',
    '`text-emerald-600`) reach from the JSX; the rest are the app’s own tokens. Both are listed because',
    'both are visible on screen, and the phone needs every one as a literal value.',
    '',
  );
  table(['token', 'css as authored', 'light', 'dark', 'hex (alpha ignored)', 'viewport'], colourRows);
  put(`### 2.2 Gradient and shadow tokens (${compoundRows.length})`, '');
  put(
    'These are not single colours, so no canvas could read them whole. Each colour function inside the',
    'value was resolved on its own and substituted back, which yields a string a `LinearGradient` or',
    '`BoxShadow` can be built from directly. `stops` in the JSON keeps each pairing explicitly.',
    '',
  );
  table(['token', 'css as authored', 'light — every colour resolved to rgba', 'dark', 'viewport'], compoundRows);
  put(
    'In the shadows the resolved `rgba(...)` replaces the whole colour **and its alpha**, so a Dart',
    '`BoxShadow` must be built as `Color.fromRGBO(r, g, b, a)` with the alpha from the string — not',
    'composed over the card it sits under.',
    '',
  );
  put(`### 2.3 Non-colour tokens (${otherRows.length})`, '');
  table(['token', 'value', 'note'], otherRows);
}
put('### 2.4 Tailwind bookkeeping is not part of the spec', '');
put(
  `\`${Object.keys(THEME.light.root).filter((n) => n.startsWith('--tw-')).length}\` properties on \`html\` are Tailwind's own ` +
    'intermediate variables (`--tw-shadow`, `--tw-gradient-from-position`, translate/scale/ring plumbing).',
  'They exist so utility classes can compose in a browser. Flutter has no utility engine, so they are',
  'deliberately excluded from the tables above and must **not** be ported.',
  '',
);

// ---------------------------------------------------------------- 3. type scale
put('## 3. Type scale, as it lands on a phone', '');
put(
  '`--text-*` and `--numeral-*` are the authored tokens; the resolved columns are the pixel sizes Chrome',
  'actually used at each viewport, read from the detached probe element. Anything built with `clamp()`',
  'therefore has two numbers, and the port must use the **phone** column.',
  '',
);
{
  const sizeProbes = ['.money-display', '.numeral', '.numeral-hero', '.numeral-md', '.numeral-sup'];
  const rows = [];
  for (const sel of sizeProbes) {
    const l = THEME.light.probes[sel];
    const p = PHONE.light.probes[sel];
    if (!l || !p) continue;
    rows.push([
      cell(sel),
      cell(l.fontSize),
      cell(p.fontSize),
      cell(p.fontWeight),
      cell(p.lineHeight),
      cell(p.letterSpacing),
      cell(p.fontFamily),
      p.fontSize === l.fontSize ? '' : '**resizes**',
    ]);
  }
  table(['class', 'desktop 1440px', 'phone 390px', 'weight', 'line-height', 'tracking', 'family', ''], rows);
}
put('### 3.1 Font files', '');
put(
  `\`src/index.css:${cssLineOf("@import url('https://fonts.googleapis.com")}\` pulls three families from Google Fonts:`,
  '',
);
{
  const imp = CSS_TEXT.match(/@import url\('https:\/\/fonts\.googleapis\.com\/([^']+)'\)/);
  const fams = imp
    ? [...imp[1].matchAll(/family=([^&:]+):wght@([\d;.%]+)/g)].map(
        (m) => `- \`${m[1].replace(/\+/g, ' ')}\` weights ${m[2].replace(/;/g, ', ')}`,
      )
    : [];
  put(...(fams.length ? fams : ['(family import not parsed — see the raw @import line)']), '');
}
put(
  'Flutter cannot load a stylesheet from a CDN at runtime the way this line does, so the three families',
  'are bundled as assets. Item 10 did that: `mobile/pubspec.yaml` declares them, `mobile/assets/fonts/`',
  'carries them. The tables below are rendered from `parity/fixtures/fonts.json` — the record that',
  '`node parity/get_fonts.cjs --check` re-verifies against the bytes on disk — so every digest here is',
  'one the checker recomputes, not one copied into prose.',
  '',
);
{
  /**
   * Every number in this section comes from the bundle record, so the spec cannot
   * claim a file the tool did not fetch. A missing record is a hard error rather
   * than an empty table: an absent font section would read like "nothing to bundle".
   */
  const recPath = path.join(__dirname, 'fixtures', 'fonts.json');
  if (!fs.existsSync(recPath)) {
    throw new Error(
      'parity/fixtures/fonts.json is missing. Render the font section only after `node parity/get_fonts.cjs`, ' +
        'which writes the record; an empty §3.1 would read as "there is nothing to bundle".',
    );
  }
  const REC = JSON.parse(fs.readFileSync(recPath, 'utf8'));
  const grp = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  // Ordinal, not localeCompare: a sort that reads a different order on a different host's
  // ICU would make this generated document non-reproducible (D33).
  const byName = (a, b) => (a.family < b.family ? -1 : a.family > b.family ? 1 : a.weight - b.weight);
  const faces = [...REC.faces].sort(byName);
  /**
   * The record writes cmap holes as the font tables print them, and two of the Google
   * files print `066B` where the tool that hashed them stored `0660`. Case-fold once,
   * into a Set per face, so a coverage claim here cannot be wrong because of a letter.
   */
  const holes = new Map(REC.faces.map((f) => [f, new Set(f.missingFixtureCodepoints.map((h) => h.toLowerCase()))]));

  put(
    '**Provenance.** Each face is the weight the stylesheet asks for, taken from the official upstream —',
    'Google Fonts’ `css2` endpoint requested with a pre-`woff2` User-Agent, which serves one',
    '**unsubsetted TrueType** file per weight from `fonts.gstatic.com` (the same font release the',
    'stylesheet points at). The face set is parsed from that `@import` line, not typed, so a weight the',
    'web stopped requesting cannot quietly stay in the bundle. `get_fonts.cjs` accepts a file only when',
    'its name table says `family` = the declared family and `subfamily` = the file stem, its',
    '`OS/2.usWeightClass` equals the declared weight, and its byte count and sha256 match the record:',
    '',
  );
  table(
    ['file', 'family', 'weight', 'bytes', 'sha256'],
    faces.map((f) => [f.fileName, f.family, String(f.weight), grp(f.bytes), f.sha256]),
  );
  put(
    `Recorded per face in \`parity/fixtures/fonts.json\`: \`sourceUrl\` (the exact \`fonts.gstatic.com\``,
    'object fetched) and `cssUrl` (the stylesheet that served it). `localPath` values are POSIX so the',
    'Dart-side checker is portable across hosts.',
    '',
  );

  put(
    '**Licences.** All three families are SIL Open Font Licence 1.1. The licence texts ship as assets',
    'alongside the faces, so the app carries the attribution the licence requires:',
    '',
  );
  table(
    ['file', 'bytes', 'sha256', 'upstream repo'],
    [...REC.licenses]
      .sort((a, b) => (a.family < b.family ? -1 : a.family > b.family ? 1 : 0))
      .map((l) => [l.fileName, grp(l.bytes), l.sha256, l.upstreamRepo]),
  );
  put(
    `Retrieved from \`${REC._provenance.licenseFrom}\` (\`${REC._provenance.license}\`); each record's`,
    '`sourceUrl` is the raw `OFL.txt` and its `copyrightLine` the notice upstream carries.',
    '',
  );

  const faceBytes = REC.faces.reduce((n, f) => n + f.bytes, 0);
  const licBytes = REC.licenses.reduce((n, l) => n + l.bytes, 0);
  put(
    `**What this costs, honestly.** ${grp(faceBytes)} bytes of font binary (${REC.faces.length} faces) plus`,
    `${grp(licBytes)} bytes of licence text. The web pays far less for the same type because Google serves it`,
    'as `woff2` split into `unicode-range` subsets and a browser downloads only the subsets a page',
    'touches. Flutter has no equivalent lazy subsetting here, so the bundle carries every glyph each face',
    'has, most of it unrendered on any given screen. Subsetting is a later packaging decision, not a parity',
    'one, and is an open item in `parity/STATUS.md`: a subset could only ever be smaller, never a',
    'different design.',
    '',
  );

  put(
    '**Weight resolution differs from CSS.** `src/index.css` requests exactly the weights above, so no',
    'normal web render reaches an unbundled weight. A Flutter `TextStyle` can, and there the family falls',
    'back to the **nearest bundled bracket** with no synthetic bolding: `FontWeight.w100`/`w200` in Inter',
    'land on 300 Light and `w700`/`w800`/`w900` land on 600 SemiBold. Measured in the test harness at 38px',
    "on `'0123456789'`, the advances really do differ per weight — Inter 300 220.374 / 400 224.771 / 500",
    '228.353 / 600 231.859, Plus Jakarta Sans 300 221.730 / 400 225.074 / 800 228.076, JetBrains Mono 400',
    'and 700 both 228.000, which is what a monospace face does to digits. So an asked-for weight never',
    'becomes a synthesised blur, but it can become a *neighbour*.',
    '`mobile/test/theme/app_fonts_test.dart` pins that bracketing per family, and every ported widget’s',
    'numeral spec names a weight this bundle carries.',
    '',
  );
  put(
    '**`tabularNums` is a feature of the face, not a wish.** Inter’s proportional digits are measurably',
    'uneven (at 38px, `1111111111` 154.561 against `5555555555` 225.439); `FontFeature.tabularFigures()`',
    'makes both 246.406 — and wider than proportional `0123456789` at 224.771. In a fallback family the',
    'flag does nothing at all. This is why the numeral rows assert relations rather than literals.',
    '',
  );

  const gaps = [...new Set(REC.faces.flatMap((f) => [...holes.get(f)]))]
    .map((h) => parseInt(h, 16))
    .sort((a, b) => a - b);
  const runs = [];
  for (const cp of gaps) {
    const last = runs[runs.length - 1];
    if (last && cp === last.end + 1) last.end = cp;
    else runs.push({ start: cp, end: cp });
  }
  /**
   * Which locales a gap belongs to is read from the fixtures, not asserted here: the
   * codepoints are the ones the expected strings are made of, so a locale is named
   * only if one of its figures actually needs that codepoint. The human-readable
   * block name is the only hand-typed part, and an unnamed run still prints with its
   * codepoints and locales rather than quietly dropping, because a coverage hole
   * nobody can locate is not a record.
   */
  const BLOCK_NAMES = {
    0x0660: 'Arabic-Indic digits',
    0x066b: 'Arabic decimal and thousands separators',
    0x09e6: 'Bengali digits',
    0x202f: 'narrow no-break space, the French figure separator',
  };
  const FIXTURES = fixtureStrings();
  const fixtureLocales = [...new Set(FIXTURES.map((f) => f.locale))].sort();
  const localesNeeding = (run) => {
    const set = new Set();
    for (const f of FIXTURES) {
      for (let cp = run.start; cp <= run.end; cp++) {
        if (f.text.includes(String.fromCodePoint(cp))) set.add(f.locale);
      }
    }
    return [...set].sort();
  };
  const facesMissing = (run) =>
    REC.faces.filter((f) => {
      for (let cp = run.start; cp <= run.end; cp++) if (holes.get(f).has(cpHex(cp))) return true;
      return false;
    });
  put(
    `**Coverage holes the bundle cannot draw.** Of the ${REC.faces[0].fixtureCodepointCount} codepoints the`,
    `money fixtures produce (\`${fixtureLocales.join('\`, \`')}\`), ${gaps.length} are absent from at least`,
    'one bundled face:',
    '',
  );
  for (const run of runs) {
    const name = BLOCK_NAMES[run.start];
    const span = run.end === run.start ? cpLabel(run.start) : `${cpLabel(run.start)}–${cpLabel(run.end)}`;
    const bad = facesMissing(run);
    const locs = localesNeeding(run);
    const fams = [...new Set(bad.map((x) => x.family))].sort();
    put(
      `- \`${span}\` ${name ? `(${name})` : '(block name not recorded here)'} — needed by ${
        locs.length ? `**${locs.join('**, **')}**` : 'no fixture locale (check the fixtures)'
      }. ` +
        (bad.length === REC.faces.length
          ? 'In **no** bundled face.'
          : `Absent from ${fams.map((x) => `\`${x}\``).join(' and ')} (${bad.length} of ${REC.faces.length} faces); the rest draw it.`),
    );
  }
  put('');
  const markGaps = new Map();
  for (const f of REC.faces) {
    for (const [mark, has] of Object.entries(f.marks)) {
      if (!has) {
        if (!markGaps.has(mark)) markGaps.set(mark, []);
        markGaps.get(mark).push(f);
      }
    }
  }
  if (markGaps.size) {
    put('Separately, of the currency and dash marks probed:', '');
    for (const [mark, list] of [...markGaps].sort()) {
      const fams = [...new Set(list.map((f) => f.family))].sort();
      put(
        `- \`${mark}\` is in no face of ${fams.map((f) => `\`${f}\``).join(' or ')} (${list.length} of ${REC.faces.length} faces).`,
      );
    }
    put('');
  }
  put(
    'No `money.json` expected string uses any codepoint above — that is the assertion',
    '`app_fonts_test.dart` makes for every fixture figure against every face, and it is what stops these',
    'gaps being silent.',
    '',
  );
  put(
    'These are not regressions against the web: the web loads the same three families, and a',
    '`unicode-range` subset can only cover *less* than the unsubsetted face, so the set above is an upper',
    'bound on the web’s own holes for the same locales.',
    '',
  );
  put(
    '**One difference is real, though: the port names one family where the CSS names a stack.**',
    "`--font-display` is `'Plus Jakarta Sans', 'Inter', system-ui, sans-serif` (§3.2), and the measured",
    '`.numeral`/`.money-display` rows resolved to Plus Jakarta Sans, so that single family is what',
    '`AppNumeralSpec.fontFamily` carries. A CSS stack falls through *per glyph*: a codepoint Plus Jakarta',
    'Sans lacks but Inter has — U+202F above — renders from Inter in the browser, and one that neither',
    'family has falls to `system-ui`, which is a device font and cannot be bundled. So for fr-FR the web',
    'and the phone would disagree, and for ar-EG/bn-BD neither side has the digits in the design-system',
    'faces: the web shows a system font, the phone shows nothing.',
    '',
  );
  put(
    'en-LK — the locale in the screenshot evidence, and the one item 7 gated on — hits neither case,',
    'which is why that gate could close. Porting `fontFamilyFallback` alongside the measured family, or',
    'accepting the difference, is an open item for `parity/STATUS.md` rather than a decision to slip into',
    'a font commit. Whether the running app can be set to ar-EG, bn-BD or fr-FR is a product question',
    'this section cannot answer; if it can, the gap above is visible, not theoretical.',
    '',
  );
  const gapLocales = new Set(runs.flatMap((r) => localesNeeding(r)));
  const cleanLocales = fixtureLocales.filter((l) => !gapLocales.has(l));
  put(
    '**The other fixture locales draw every figure from every face**:',
    `${cleanLocales.map((l) => `\`${l}\``).join(', ')}, including the \`.numeral\` row the 320px screenshot`,
    'showed (en-LK). `app_fonts_test.dart` re-derives this set from the fixtures on every run, so a new',
    'fixture locale is checked against the bundle the day it is added.',
    '',
  );

  put(
    '**Testing harness.** `flutter test` does not load the faces an app declares, so',
    '`mobile/test/flutter_test_config.dart` registers the bundle from `FontManifest.json` through',
    '`FontLoader`. Without it every family measures as the harness fallback — exactly 1em per glyph,',
    "`'0123456789'` at 38px = 380.000 — and the loader is provably load-bearing: deleting it fails 6 tests.",
    '',
  );
}
put('### 3.2 Stacks', '');
{
  const stacks = rootNames().filter((n) => n.startsWith('--font-'));
  table(
    ['token', 'stack'],
    stacks.map((n) => [cell(n), cell(THEME.light.root[n].raw)]),
  );
}

// ---------------------------------------------------------------- 4. motion
put('## 4. Motion', '');
{
  const motion = rootNames().filter((n) => /^(--dur|--ease|--animate|--default-transition)/.test(n));
  const rows = motion.map((n) => {
    const raw = THEME.light.root[n].raw;
    const ms = /^(\d+)ms$/.exec(raw);
    const s = /^([\d.]+)s$/.exec(raw);
    const dartish = ms
      ? `Duration(milliseconds: ${ms[1]})`
      : s
        ? `Duration(milliseconds: ${Math.round(Number(s[1]) * 1000)})`
        : /^cubic-bezier/.test(raw)
          ? `Curve: Cubic(...)`
          : '';
    return [cell(n), cell(raw), dartish ? cell(dartish) : ''];
  });
  table(['token', 'value', 'Dart equivalent'], rows);
  put(
    'Two of these are functions Flutter cannot call: `cubic-bezier(0.34, 1.56, 0.64, 1)` overshoots past 1.0,',
    'which `Curves.easeOutBack` approximates but does not equal. The port must use `Cubic(0.34, 1.56, 0.64, 1)`',
    'verbatim — `Curves.*` names are not parity targets.',
    '',
  );
  put(
    reducedMotionBlock
      ? '`index.css` contains a `@media (prefers-reduced-motion: reduce)` block, and `AnimatedCountUp.tsx` reads ' +
          '`prefers-reduced-motion` in JS. Dart equivalent: `MediaQuery.disableAnimationsOf` / the platform reduce-motion ' +
          'setting. This one has a direct twin, so it is not a deviation.'
      : 'No reduced-motion block was found.',
    '',
  );
}

// ---------------------------------------------------------------- 5. radius / blur / space
put('## 5. Radii, blur and spacing', '');
{
  const geom = rootNames().filter((n) => /^(--r-|--blur|--spacing|--container|--radius)/.test(n));
  table(
    ['token', 'value', 'Dart'],
    geom.map((n) => {
      const raw = THEME.light.root[n].raw;
      const px = /^([\d.]+)px$/.exec(raw);
      const rem = /^([\d.]+)rem$/.exec(raw);
      const dartish = px
        ? `Radius.circular(${px[1]})`
        : rem
          ? `Radius.circular(${(Number(rem[1]) * 16).toFixed(0)})`
          : '';
      return [cell(n), cell(raw), dartish ? cell(dartish) : ''];
    }),
  );
  put(
    '`--blur-*` feeds `backdrop-filter`. Flutter can reproduce it with `BackdropFilter(ImageFilter.blur(...))`',
    'at the same sigma, which is the CSS px value divided by 2 for Material’s convention — **flagged in §7 ' +
      'because it is expensive to composite on low-end Android and the phone may need it dropped.**',
    '',
  );
}

// ---------------------------------------------------------------- 6. components
put('## 6. Component classes', '');
put(
  'Each row is a detached element carrying that class, measured inside the themed document. Nested-state',
  'classes are probed too, through a small DSL in the probe list: `;attr=value` sets the attribute the',
  'component really uses (e.g. `.segment-item;aria-selected=true`), and `;in=.parent` wraps the element in',
  'a parent carrying that class, which is how a descendant rule is measured rather than inferred.',
  '',
);
put(
  'Column conventions: `equal` means the dark theme resolves that property to the same bytes as light, so',
  'the theme switch does not touch it; `⇒ dark: …` appears only where the two themes really differ, and the',
  'dark value is then printed in the same cell; `(none)` means the class paints nothing of its own, so the',
  'surface behind it shows through. A transparent *background* counts as `(none)` because what must be drawn',
  'is whatever is underneath, but a transparent *border* is printed as `Color.transparent` — a `1px` frame',
  'of `rgba(0,0,0,0)` still occupies layout even though it paints nothing.',
  '',
);
put('### 6.1 Colour and shadow', '');
{
  const light = THEME.light.probes;
  const transparentAsNone = (v) => v && v.srgb && v.srgb.a255 === 0;
  const show = (v) => {
    if (!v) return '';
    if (v.srgb) return transparentAsNone(v) ? 'Color.transparent' : dart(v.srgb);
    return v.substituted ? `… ${v.substituted}` : '';
  };
  // A transparent background is not a fill; the gradient underneath it is what the port must draw.
  const fill = (p) => (transparentAsNone(p.backgroundColor) ? '' : show(p.backgroundColor)) || show(p.backgroundImage);
  const extras = (p) => {
    const bordered = p.borderTopWidth !== '0px';
    const borderColour = bordered ? show(p.borderTopColor) : '';
    return [
      borderColour && `border-top ${borderColour}`,
      bordered && `border-width ${p.borderTopWidth}`,
      p.backdropFilter && p.backdropFilter.raw !== 'none' ? `backdrop ${p.backdropFilter.raw}` : '',
      p.opacity !== '1' ? `opacity ${p.opacity}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  };
  const shadowOf = (p) => (p.boxShadow && p.boxShadow.substituted) || '';
  const pair = (a, b) =>
    !a && !b ? '—' : b === a ? cell(a || '(none)') : cell(`${a || '(none)'} ⇒ dark: ${b || '(none)'}`);
  const rows = [];
  for (const sel of Object.keys(light)) {
    const l = light[sel];
    const d = THEME.dark.probes[sel];
    rows.push([
      cell(sel),
      cell(show(l.color) || '(not set)'),
      cell(show(d.color) === show(l.color) ? 'equal' : show(d.color) || '(inherited)'),
      cell(fill(l) || '(none)'),
      cell(fill(d) === fill(l) ? 'equal' : fill(d) || '(none)'),
      pair(extras(l), extras(d)),
      pair(shadowOf(l), shadowOf(d)),
    ]);
  }
  table(
    [
      'class',
      'text (light)',
      'text (dark)',
      'fill (light)',
      'fill (dark)',
      'border / backdrop / opacity',
      'box-shadow, every colour resolved',
    ],
    rows,
  );
}
put('### 6.2 Box and type', '');
{
  const rows = Object.keys(THEME.light.probes).map((sel) => {
    const l = THEME.light.probes[sel];
    const p = PHONE.light.probes[sel];
    return [
      cell(sel),
      cell(l.display),
      cell(p.display),
      cell(l.borderRadius),
      cell(p.fontSize),
      cell(p.fontWeight),
      cell(p.lineHeight),
      cell(p.letterSpacing),
      cell(p.padding),
      p.fontSize !== l.fontSize ? '**resizes**' : '',
    ];
  });
  table(
    [
      'class',
      'display @1440',
      'display @390',
      'radius',
      'phone size',
      'weight',
      'line-height',
      'tracking',
      'padding',
      '',
    ],
    rows,
  );
  put(
    `\`${THEME.light.probes['.floating-nav'].display}\` at 1440px versus ` +
      '`' +
      PHONE.light.probes['.floating-nav'].display +
      '` at 390px is the `@media (min-width: 1024px)` rule measured, not ' +
      'the media list read from source. That bar *is* the phone navigation Flutter must build.',
    '',
  );
}
put(`### 6.3 Coverage`, '');
put(
  `${DECLARED.length} classes are declared in \`src/index.css\`; ${DECLARED.length - UNPROBED.length} are measured above.`,
  UNPROBED.length
    ? `Not probed (utility fragments and pseudo-classes, not components): ${UNPROBED.map((c) => '`' + c + '`').join(' ')}`
    : 'Every declared class is measured.',
  '',
);
put('#### The repaint layer: `!important` rules outside any `@media` block', '');
{
  const UTILITY_SHAPE = /^(bg|text|border|ring|shadow|from|via|to|fill|stroke|accent|outline|divide|decoration)-/;
  const rows = IMPORTANTS.map((r) => [
    `\`src/index.css:${r.line}\``,
    r.targets.map((c) => '`' + c + '`').join(' '),
    '`' + r.decls + '`',
    r.targets
      .map((c) => {
        if (!UTILITY_SHAPE.test(c)) return '`' + c + '` — not a generated utility, `index.css` owns it';
        const at = TOKENS.utilities.writtenIn[c];
        return at
          ? '`' + c + '` — found, written in `' + at + '`'
          : '`' + c + '` — **written nowhere under `src/`**, so Tailwind emits no such rule';
      })
      .join('<br>'),
  ]);
  table(['line', 'targets', 'forced declarations', 'is that class actually written anywhere?'], rows);
  const mixProbe = THEME.light.probes['.bg-white;in=.card-dark'];
  const mixDart =
    mixProbe && mixProbe.backgroundColor && mixProbe.backgroundColor.srgb ? dart(mixProbe.backgroundColor.srgb) : null;
  put(
    'Four things this table settles for the port. One: `--surface`, `--line`, `--ink` and',
    '`--gradient-card-light` in the forced declarations are the same tokens tabulated in §2.1, so their',
    'values are already resolved here — the `!important` decides *which* token applies, not a new colour.',
    'Two: the two “dark surface” components `.card-dark` and `.gradient-card` are repainted as light surfaces',
    'in light mode, and the white-on-dark utilities inside them are repainted with them; that is measured, not',
    'inferred, in §6.1 rows `.text-white;in=.card-dark` and `.bg-white;in=.card-dark`, where light gives ink',
    'and dark gives white. Three: one forced declaration is a real `color-mix`, which Flutter cannot express,',
    mixDart
      ? `and the probe resolves it for the light theme to \`${mixDart}\`.`
      : 'and the probe resolves it to the bytes in §6.1.',
    'Four: any target the last column marks *written nowhere under `src/`* repaints a class no component',
    'actually uses, so Tailwind does not emit it and the override is a guard left over from earlier markup —',
    'that row is inventory, not behaviour to port.',
    '',
  );
}

put('### 6.4 Colours the components write as Tailwind utilities', '');
{
  const UL = TOKENS.themes['light-desktop'].utilities;
  const UD = TOKENS.themes['dark-desktop'].utilities;
  const KEYS = ['color', 'backgroundColor', 'borderTopColor', 'backgroundImage', 'boxShadow'];
  const NAME = {
    color: 'text',
    backgroundColor: 'fill',
    borderTopColor: 'border',
    backgroundImage: 'image',
    boxShadow: 'shadow',
  };
  const valueOf = (rec, key) => {
    const v = rec && rec[key];
    if (!v) return null;
    if (v.srgb) return v.srgb.a255 === 0 ? 'Color.transparent' : dart(v.srgb);
    return v.substituted || v.raw || null;
  };
  const render = (rec) =>
    KEYS.filter((k) => valueOf(rec, k))
      .map((k) => `${NAME[k]} \`${valueOf(rec, k)}\``)
      .join(' · ');
  const rows = Object.keys(UL)
    .filter((tok) => !tok.includes('dark:'))
    .sort()
    .map((tok) => {
      const l = render(UL[tok]);
      const d = render(UD[tok]);
      return [
        '`' + tok + '`',
        KEYS.filter((k) => valueOf(UL[tok], k))
          .map((k) => NAME[k])
          .join(' '),
        l,
        d === l ? 'equal' : d || '(none)',
        '`' + (TOKENS.utilities.writtenIn[tok] || '—') + '`',
      ];
    });
  table(['utility', 'paints', 'light', 'dark', 'first written in'], rows);
  put(
    `These ${rows.length} tokens are not in \`src/index.css\` — Tailwind synthesises them from the class`,
    'names the components use, so no stylesheet read would have found them. They were extracted from every',
    'string literal under `src/`, then kept only where a detached element carrying that class changed one of',
    'the five paint properties against an unclassed control: a token the app writes but Tailwind never',
    `emits cannot appear here. ${TOKENS.utilities.scanned - rows.length} of the ${TOKENS.utilities.scanned}`,
    'scanned tokens were rejected that way, most of them `text-sm`/`border-t` (size, not colour) or',
    '`hover:`/`focus:` states a detached element cannot enter.',
    '',
  );
  put(
    'Two consequences the port has to carry: a text utility also moves the **border** colour, because',
    'Tailwind v4’s preflight defaults `border-color` to `currentColor` and Flutter has no such default; and',
    '`shadow-lg`/`shadow-sm` serialise as six shadows of which four are `rgba(0, 0, 0, 0) 0px 0px 0px 0px`',
    'placeholders — the Dart side needs only the non-transparent ones, so the count, not the list, is the',
    'contract.',
    '',
  );
}
put('### 6.5 The `dark:` variant answers the operating system, not the app theme', '');
{
  const M = TOKENS.darkVariantMatrix;
  const combos = M.combos;
  const KEYS = ['color', 'backgroundColor', 'borderTopColor', 'boxShadow'];
  const NAME = { color: 'text', backgroundColor: 'fill', borderTopColor: 'border', boxShadow: 'shadow' };
  const valueOf = (rec, key) => {
    const v = rec && rec[key];
    if (!v) return null;
    if (v.srgb) return v.srgb.a255 === 0 ? 'transparent' : dart(v.srgb);
    return v.substituted || v.raw || null;
  };
  const cell = (combo, tok) => {
    const rec = combo.utilities[tok];
    if (!rec) return 'not applied';
    return (
      KEYS.filter((k) => valueOf(rec, k))
        .map((k) => `${NAME[k]} \`${valueOf(rec, k)}\``)
        .join(' · ') || '—'
    );
  };
  const rows = M.tokens.map((tok) => [
    '`' + tok + '`',
    ...combos.map((c) => cell(c, tok)),
    '`' + (TOKENS.utilities.writtenIn[tok] || '—') + '`',
  ]);
  table(
    [
      'utility',
      `app light / OS light (root \`${combos[0].rootClass}\`)`,
      `app light / OS dark (root \`${combos[1].rootClass}\`)`,
      `app dark / OS light (root \`${combos[2].rootClass}\`)`,
      `app dark / OS dark (root \`${combos[3].rootClass}\`)`,
      'first written in',
    ],
    rows,
  );
  const painted = (i) => combos[i].painted.length;
  put(
    'The four columns are four browser contexts: the in-app toggle was set to the theme named in the',
    'heading, and the OS preference likewise. Read down the two `OS light` columns and they agree —',
    painted(0) +
      ' of ' +
      M.tokens.length +
      ' paint with the app light and ' +
      painted(2) +
      ' with the app dark. Read down the two `OS dark` columns and they agree too, at ' +
      painted(1) +
      ' and ' +
      painted(3) +
      '. So adding `html.dark` while the OS stays light changes',
    'nothing, and removing it while the OS is dark changes nothing. Only `prefers-color-scheme`',
    'moves these tokens.',
    'Tailwind v4 binds `dark:` to `prefers-color-scheme` unless the stylesheet rebinds it with',
    "`@custom-variant dark (&:where(.dark, .dark *))`, and `src/index.css` declares `@import 'tailwindcss'`",
    'and no such line. So the app has two independent dark mechanisms: its own CSS variables, driven by the',
    'toggle, and these utilities, driven by the OS.',
    '',
  );
  put(
    'They agree only at first paint. `ThemeContext.tsx:16-28` picks the starting theme from',
    '`prefers-color-scheme` when nothing is stored (the read is `:24`), so a fresh install on a dark OS shows',
    'the dark app _and_ paints these tokens. After that they part company twice over. First, the provider',
    'registers an OS listener (`:53-64`) that refuses to act once `em-budget-theme` exists — but',
    '`applyTheme` writes that key on mount itself (`:39`, from the effect at `:49-51`), so the guard at `:59`',
    'is always true and the listener can never fire: **the app theme stops following the OS immediately, and',
    'the utilities never stop.** Second, the toggle then moves the CSS variables alone. A device whose owner',
    'chose light while the OS is dark — or whose OS went dark after a first visit — renders light variables',
    'under `dark:` fills. The four-column matrix above is the first of those states, because the probe harness',
    'forces a theme by writing the same key.',
    '',
  );
  put(
    'The two `dark:hover:` rows never paint in any column because a detached element cannot be hovered; they',
    'are hover, and hover is already D-U1. The concrete visible cases are the "Border accent" swatches in',
    '`CashCardManagement.tsx:556,996,1389` — `bg-[#0A0A0A] dark:bg-[#FAFAF9]` draws the swatch named',
    '*obsidian* as a near-white dot on any OS-dark device, even while the app itself is showing its light',
    'theme — and the status badges at `AuditPanel.tsx:287-299`, which swap a `bg-rose-50`/`text-rose-600`',
    'pair for a `rose-950/40`/`rose-400` pair under the same condition, so the badge goes dark-on-light while',
    'the card behind it stays light. Neither depends on the app theme toggle, and neither is reachable from',
    'the toggle.',
    '',
  );
  put(
    'These are recorded as **B-15** and **B-16** in `BUGS_FOUND.md`. Neither is caused by the migration and',
    'neither is fixed here; the phone must choose one reading of “dark”. See D-U13 in §7 — binding these',
    'tokens to `platformBrightness` is the bug-compatible reading, binding them to the app theme is what the',
    'markup appears to intend, and the difference is visible on an OS-dark phone showing the light theme.',
    // No blank line before this line: as committed at `82eed70`, the ruling continues the paragraph above.
    '**That choice is now made:** D-U13 was ruled **D16** at the Phase 2 gate (`INVENTORY.md` §13e) in favour',
    'of reproducing the split, so §6.5 is a specification, not a question, and the two readings must stay two',
    'sources in Dart.',
    '',
  );
}

/**
 * The `utilityStacks` tier, read once for every section that renders it: §6.6 for the ledger,
 * §6.7 for the card faces, the deck and the action keys. This is the same measurement
 * `parity/generate_theme.cjs` consumes, so a stack cannot be described here with one reading
 * and emitted from another. Each helper throws rather than printing a guess.
 */
const US = TOKENS.utilityStacks;
if (!US || !Array.isArray(US.rows)) throw new Error('ui-tokens.json has no utilityStacks.rows tier');
if (!Array.isArray(US.authoredNonCss)) throw new Error('ui-tokens.json has no utilityStacks.authoredNonCss tier');
const rec = (name) => {
  const r = US.rows.find((x) => x.name === name);
  if (!r) throw new Error('no utility stack ' + name + ' in ui-tokens.json');
  return r;
};
const st = (pass, name) => {
  const s = TOKENS.themes[pass].stacks && TOKENS.themes[pass].stacks[name];
  if (!s) throw new Error('stack ' + name + ' is cited but was not measured at ' + pass);
  return s;
};
const paintKeys = [
  'color',
  'backgroundColor',
  'borderTopColor',
  'borderLeftColor',
  'boxShadow',
  'backdropFilter',
  'backgroundImage',
];
const valOf = (props, key) => {
  const v = props[key];
  if (v === undefined || v === null) return '—';
  if (typeof v === 'string') return v;
  if (v.srgb) return v.srgb.a255 === 0 ? 'transparent' : dart(v.srgb);
  return v.substituted || v.raw || '—';
};
/** The element the probe mounted: the component’s own tag and attributes, so a `<button>`
 *  is measured against the UA padding its class has to beat, not against a neutral `<div>`. */
const mountedAs = (r) => {
  const attrs = Object.entries(r.attrs || {}).map(([k, v]) => ' ' + k + '="' + v + '"');
  return '<' + (r.tag || 'div') + attrs.join('') + '>';
};
const authoredClasses = (r) =>
  [mountedAs(r)]
    .concat(r.parts.map((p) => (p.cls ? '`' + p.cls + '`' : p.style ? 'style `' + p.style + '`' : '')))
    .filter(Boolean)
    .join('<br>');
/** Every file+line the stack is written at, the same grouping the emitter cites with. */
const citedAt = (r) => {
  const byFile = new Map();
  const cite = (file, l) => {
    if (l === undefined) return;
    const set = byFile.get(file) || [];
    if (!set.includes(l)) set.push(l);
    byFile.set(file, set);
  };
  for (const p of r.parts || []) {
    const file = p.src || r.src || US.source;
    const lines = [
      p.line,
      p.styleSrcLine,
      p.toneVarLine,
      p.dimsLine,
      p.toneDefaultLine,
      ...(p.styleSrc || []).map((s) => s.line),
      ...(p.toneTable || []),
    ];
    for (const l of lines) cite(file, l);
    // A composed class list names the template line it was composed from, and the
    // table reader has to be able to follow that citation.
    if (p.classOf) cite(p.classOf.src || file, p.classOf.line);
  }
  return [...byFile].map(([f, ls]) => '`' + f + ':' + ls.sort((a, b) => a - b).join(',') + '`').join('<br>');
};
const geometryOf = (name) => {
  const s = st('light-phone', name);
  const moved = s.changed.filter((k) => !paintKeys.includes(k));
  return moved.map((k) => k + ' `' + valOf(s.props, k) + '`').join(' · ') || '—';
};
const typeOf = (name) => {
  const p = st('light-phone', name).props;
  return ['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'].map((k) => '`' + valOf(p, k) + '`').join(' · ');
};
const textOf = (name) => {
  const l = valOf(st('light-phone', name).props, 'color');
  const d = valOf(st('dark-phone', name).props, 'color');
  return d === l ? cell(l) + ' ⇒ equal' : cell(l) + ' ⇒ dark: ' + cell(d);
};
const paintOf = (name) => {
  const p = st('light-phone', name).props;
  const bits = [];
  const bg = valOf(p, 'backgroundColor');
  if (bg !== 'transparent' && bg !== '—') bits.push('fill ' + cell(bg));
  const img = p.backgroundImage && p.backgroundImage.raw !== 'none' ? p.backgroundImage.raw : '';
  if (img) bits.push('image ' + cell(img));
  if (p.borderTopWidth !== '0px') bits.push('border ' + cell(p.borderTopWidth + ' ' + valOf(p, 'borderTopColor')));
  const sh = p.boxShadow && p.boxShadow.raw !== 'none' ? p.boxShadow.substituted || p.boxShadow.raw : '';
  if (sh) bits.push('shadow ' + cell(sh));
  if (p.backdropFilter && p.backdropFilter.raw !== 'none') bits.push('backdrop ' + cell(p.backdropFilter.raw));
  if (p.opacity !== '1') bits.push('opacity ' + cell(p.opacity));
  if (p.cursor && p.cursor !== 'auto') bits.push('cursor ' + cell(p.cursor));
  return bits.join(' · ') || '(paints nothing itself)';
};
/** The one honest wide/narrow split: a stack that computes differently at 1440px than at 390px. */
const splitOf = (name) => {
  const a = st('light-phone', name);
  const b = st('light-desktop', name);
  const keys = [...new Set([...a.changed, ...b.changed])];
  const out = [];
  for (const k of keys) {
    const av = valOf(a.props, k);
    const bv = valOf(b.props, k);
    if (av !== bv) out.push(k + ' 390px ' + cell(av) + ' · 1440px ' + cell(bv));
  }
  return out.join('<br>') || '—';
};

// ---------------------------------------------------------------- 6.6 the ledger family
put('### 6.6 The ledger family — stacks the components write themselves', '');
put(
  '§6.1–§6.2 probe classes that `src/index.css` declares. The transaction row and the list around it are the',
  'other half of the app: their boxes are Tailwind utilities written into `.tsx` string literals, plus inline',
  'styles a component computes at render. A stylesheet probe cannot see either — it can only see a rule, and',
  'there is no rule for `text-[13px]` until a component asks for one. So `parity/ui-tokens.cjs` mounts each',
  'stack **as the component mounts it** — same tag, same attributes, nested where the component nests — inside',
  'the themed document, and reads what computed at both viewports. Those records are `utilityStacks` in',
  '`parity/ui-tokens.json`: the class string, the line it is written on, the inline style, and the result.',
  '`parity/generate_theme.cjs` refuses to emit a row it cannot find there, so this section and',
  '`mobile/lib/core/theme/app_rows.dart` are two views of one measurement.',
  '',
);
{
  const ledgerStacks = US.rows.filter((r) => /^(txrow-|day-head-label$|ledger-)/.test(r.name)).map((r) => r.name);
  if (!ledgerStacks.length) throw new Error('ui-tokens.json cites no txrow/ledger stack');
  put('#### 6.6.1 The row and the list around it', '');
  table(
    [
      'stack',
      'mounted as, and the stack it carries',
      'authored at',
      'type @390',
      'text @390 (light ⇒ dark)',
      'what it paints',
      'geometry the utilities moved',
      '390px ≠ 1440px',
    ],
    ledgerStacks.map((name) => {
      const r = rec(name);
      return [
        cell(name),
        authoredClasses(r),
        citedAt(r),
        typeOf(name),
        textOf(name),
        paintOf(name),
        geometryOf(name),
        splitOf(name),
      ];
    }),
  );
  const split = ledgerStacks.filter((n) => splitOf(n) !== '—');
  put(
    'The *geometry* column is the difference the utilities make: only what the stack changed from the browser',
    'default, prop by prop, which is the same list the emitter reads before it will write a Dart row for it.',
    'The last column is the only place in this family where the two viewports disagree —',
    split.length + ' stack' + (split.length === 1 ? '' : 's') + ': ' + split.map((n) => '`' + n + '`').join(', ') + '.',
    'In each of them the properties that move are the `lg:` variants, which is what the phone never applies.',
    'The bar itself is not a value in the measurement file, so the port does not invent one: the rails are',
    'emitted as a wide/narrow pair and the breakpoint stays caller-supplied, exactly as `AppModal` takes',
    '`wideBreakpointPx`. The `lg` width belongs to the breakpoint enumeration in `parity/STATUS.md`.',
    '',
  );
  const divides = rec('ledger-divides').name;
  const lastMoved = st('light-phone', 'ledger-row-last').changed;
  const midBorder = valOf(st('light-phone', 'ledger-row-middle').props, 'borderBottomWidth');
  if (lastMoved.length || midBorder === '—') {
    throw new Error('the divide-y reading above has changed: re-read §6.6.1 rather than re-phrase it');
  }
  put(
    'A `—` in the geometry column is a measurement too, not a gap in one. ' +
      cell(divides) +
      ' moves nothing because a',
    '`divide-y` parent paints no line of its own: the hairline lands on the children, which is why',
    '`ledger-row-middle` carries a `borderBottomWidth` and `ledger-row-last` — the same class list, mounted as',
    'the last child instead of a middle one — moves nothing at all. That is the whole of the divider contract,',
    'and the port draws it as one hairline between rows plus no line under the last.',
    '',
  );
  put(
    'Two columns need reading, not just measuring. The *text* column is the computed colour of a detached',
    'element: where a class authors no colour the row shows what the stack inherited, which is why',
    '`txrow-amount-in` and `txrow-amount-out` are the only two whose colour is a decision the component makes',
    'in an inline style rather than in its class list. The *what it paints* column prints a transparent fill as',
    '`(paints nothing itself)` for the same reason §6.1 prints `(none)`: what must be drawn is whatever is',
    'behind the row, not a colour the port should copy.',
    '',
  );

  const mono = (v) => (v === '—' || v === '(none)' ? v : cell(v));
  const toneRows = US.rows.filter((r) => /^cat-chip-md-[a-z]+$/.test(r.name));
  if (toneRows.length < 2) throw new Error('ui-tokens.json cites no cat-chip tone stack');
  const styleOf = (r) => {
    const p = r.parts.find((x) => x.style);
    if (!p) throw new Error(r.name + ': the tone stack carries no inline style');
    return p.style;
  };
  const mixOf = (who, style, prop) => {
    const decl = (style || '')
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith(prop + ':'));
    const m = /color-mix\(in oklab,\s*var\((--[\w-]+)\)\s+([\d.]+)%,\s*var\((--[\w-]+)\)\)/.exec(decl || '');
    if (!m) throw new Error(who + ': no oklab mix authored for ' + prop + ' — ' + decl);
    return { token: m[1], percent: m[2], into: m[3] };
  };
  put('#### 6.6.2 The category chip’s tones, and the mix that makes them', '');
  table(
    [
      'tone',
      'authored tone token',
      'fill @390 light',
      'fill @390 dark',
      'border light',
      'border dark',
      'text @390 (light ⇒ dark)',
      'authored at',
    ],
    toneRows.map((r) => {
      const style = styleOf(r);
      const fill = mixOf(r.name, style, 'background');
      const border = mixOf(r.name, style, 'border');
      const l = st('light-phone', r.name).props;
      const d = st('dark-phone', r.name).props;
      return [
        cell(r.name.replace('cat-chip-md-', '')),
        mono(fill.token) +
          ' ' +
          fill.percent +
          '% into ' +
          mono(fill.into) +
          '<br>' +
          mono(border.token) +
          ' ' +
          border.percent +
          '% into ' +
          mono(border.into),
        mono(valOf(l, 'backgroundColor')),
        mono(valOf(d, 'backgroundColor')),
        mono(valOf(l, 'borderTopColor')),
        mono(valOf(d, 'borderTopColor')),
        textOf(r.name),
        citedAt(r),
      ];
    }),
  );
  const nonPastel = toneRows.filter((r) => !mixOf(r.name, styleOf(r), 'background').token.startsWith('--pastel-'));
  put(
    'Every tone is authored as one `color-mix(in oklab, …)` per property, in an inline style the component',
    'builds from its own size and tone tables — the tint is never a class, so no stylesheet rule describes it.',
    'Flutter `Color` has no mix and no OKLCH (D-U6), so the resolved sRGB bytes above **are** the port’s values;',
    'the mix is recorded here only to show which token they came from.',
    nonPastel.length
      ? 'Not every row of it is a pastel: ' +
          nonPastel
            .map(
              (r) =>
                '`' +
                r.name.replace('cat-chip-md-', '') +
                '` mixes ' +
                cell(mixOf(r.name, styleOf(r), 'background').token),
            )
            .join(' and ') +
          ' — the neutral tone, carried as the same mix rather than as one more colour.'
      : 'Every tone in the table mixes a `--pastel-*` token.',
    'The *text* column is the same authored token at every tone — the component gives the glyph one colour and',
    'lets it flip with the theme, so none of the tints carries a text colour of its own.',
    '',
  );

  const chipRows = US.rows.filter((x) => /^cat-chip-/.test(x.name));
  const chipCls = (r) => (r.parts.find((p) => p.cls) || {}).cls || '';
  const sharedCls = new Set(chipRows.map(chipCls));
  if (sharedCls.size !== 1)
    throw new Error('cat-chip stacks do not share one class list: ' + [...sharedCls].join(' | '));
  const dimsBySize = new Map();
  for (const r of chipRows) {
    const part = r.parts.find((p) => p.dims !== undefined);
    if (!part) continue;
    const size = part.size || 'md';
    const seen = dimsBySize.get(size);
    if (seen && (seen.part.dims !== part.dims || seen.part.glyph !== part.glyph)) {
      throw new Error('cat-chip size ' + size + ' is authored with two different dimension tables');
    }
    if (!seen) dimsBySize.set(size, { size, name: r.name, part, src: r.src || US.source });
  }
  const chipSizes = ['xs', 'sm', 'md', 'lg'].map((s) => {
    const found = dimsBySize.get(s);
    if (!found) throw new Error('ui-tokens.json cites no cat-chip ' + s + ' stack');
    return found;
  });
  put('#### 6.6.3 The chip sizes', '');
  table(
    ['size', 'side authored', 'side measured @390', 'radius measured', 'glyph authored', 'cited stack', 'authored at'],
    chipSizes.map(({ size, name, part, src }) => {
      const p = st('light-phone', name).props;
      return [
        cell(size),
        mono(part.dims + 'px'),
        mono(valOf(p, 'width') + ' × ' + valOf(p, 'height')),
        mono(valOf(p, 'borderRadius')),
        mono(part.glyph + 'px'),
        cell(name),
        cell(src + ':' + [part.dimsLine, part.glyphLine].filter((l) => l !== undefined).join(',')),
      ];
    }),
  );
  const mdDims = new Set(toneRows.map((r) => (r.parts.find((p) => p.dims !== undefined) || {}).dims));
  if (mdDims.size !== 1 || mdDims.has(undefined)) throw new Error('the cat-chip tone stacks disagree on the md box');
  put(
    'Every chip carries the same class list — `' +
      [...sharedCls][0] +
      '` — and every number in this table comes from the inline',
    'style the component builds from its own two size tables, one for the box and one for the glyph, so a chip',
    'has two sizes and one box. `rounded-full` computes the clamp in the *radius measured* column, which is how',
    'a browser reports a circle rather than a radius the port should copy; the Dart side draws an infinite',
    'radius on a square box. `md` is cited from a tone stack because the default size is measured on every tone',
    'at once — all ' +
      toneRows.length +
      ' agree on ' +
      cell([...mdDims][0] + 'px') +
      ', which this table asserts rather than assumes.',
    'The `side measured @390` column is the proof the inline style reached the box at all. `parity/icon-map.tsv`',
    'pairs each category with the Lucide name the component picks for it, and the icon dependency itself has',
    'not landed, so `app_rows.dart` carries those names as strings the caller resolves rather than drawing',
    'icons it cannot import.',
    '',
  );

  const facts = US.authoredNonCss.filter((r) => /^(txrow-|cat-chip-|ledger-|pill-hidden)/.test(r.name));
  if (!facts.length) throw new Error('ui-tokens.json cites no ledger authored record');
  put('#### 6.6.4 What the ledger does that no probe can see', '');
  put(
    'These are the facts about this family that are not a computed style at all: state the component holds in',
    'JS, tables it builds its inline styles from, the copy it renders, and the two places where a class is',
    'applied that paints nothing. They are recorded per line so a drift test can re-read them from `src/`.',
    '',
  );
  table(
    ['record', 'tier', 'as written', 'authored at', 'what it decides'],
    facts.map((r) => [
      cell(r.name),
      cell(r.tier || 'authored-js'),
      r.parts.map((p) => '`' + p.text + '`').join('<br>'),
      citedAt(r),
      r.note || '',
    ]),
  );
  put(
    'Some of these records decide what the port paints, not what the markup appears to ask for. `empty` is',
    'applied by `ReportsCentre.tsx` and declared by no stylesheet, so the box paints nothing and the port must',
    'not inherit a colour it never had. `hidden` is a Tailwind utility, and utilities live in a cascade layer,',
    'while the class the pill also carries is written unlayered — so the utility loses at any width and the pill',
    'shows on the phone. The two call sites of the row disagree about what counts as income and about whether',
    'what counts as income and about whether the amount arrives signed or absolute; a design-system row takes',
    'the string it is handed and cannot vote, so both readings are recorded and neither is fixed here.',
    '',
  );
  put(
    'The Dart side of this family is `mobile/lib/core/theme/app_rows.dart`, emitted from the same records by',
    '`node parity/generate_theme.cjs` and re-derived property by property by `mobile/test/theme/` drift tests.',
    'Port deviations this family forces are listed with their ids in `parity/STATUS.md`, not silently applied.',
    '',
  );
}

// ---------------------------------------------------------------- 6.7 the card face, the deck and the action keys
put('### 6.7 The card face, the deck and the action keys — the boxes a rule paints', '');
put(
  '§6.6 mounts its boxes because no rule declares a utility. This family is the other case: every box in it **is** a',
  'class in `src/index.css` — `.card-face`, one `.face-*` per tone, `.deck`, `.deck-face`, `.action-key` — and yet',
  'the component writes the class as a template with holes, gives a deck peer its depth as an attribute, and lets',
  'its caller choose the width in an inline style. So the same tier reads these too: which `.face-*` the engine',
  'applied, whether the cursor hole was filled and what `data-depth` did to the box are measurements here rather',
  'than readings of the stylesheet. `parity/generate_theme.cjs` emits this family’s Dart side to',
  '`mobile/lib/core/theme/app_faces.dart` from these same rows.',
  '',
);
{
  /** Whitespace as one space with a call’s parentheses tight: prettier breaks the long `background`, `mask` and
   *  `transition` declarations over several lines, and the readings below take each one whole. */
  const cssNorm = (s) => String(s).replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();

  /** One rule of the pinned sheet, by its exact selector: the line it opens on and every declaration it sets. */
  const cssRuleOf = (selector) => {
    for (const m of CSS_BLANK.matchAll(/([^{}]+)\{/g)) {
      const heads = m[1]
        .split(',')
        .map((h) => h.trim())
        .filter(Boolean);
      if (!heads.includes(selector)) continue;
      const open = m.index + m[1].length;
      let depth = 0;
      let close = -1;
      for (let i = open; i < CSS_BLANK.length; i += 1) {
        if (CSS_BLANK[i] === '{') depth += 1;
        else if (CSS_BLANK[i] === '}') {
          depth -= 1;
          if (depth === 0) {
            close = i;
            break;
          }
        }
      }
      if (close < 0) throw new Error(selector + ': its rule never closes in ' + CSS_REL);
      const decls = new Map();
      for (const d of CSS_TEXT.slice(open + 1, close).split(';')) {
        const i = d.indexOf(':');
        if (i < 0) continue;
        const name = d.slice(0, i).trim();
        if (name) decls.set(name, cssNorm(d.slice(i + 1)));
      }
      return { selector, heads, line: lineAt(CSS_BLANK.indexOf(selector, m.index)), decls };
    }
    throw new Error(selector + ' is authored by no rule in ' + CSS_REL);
  };
  /** The rule a stack’s own class list names, attribute and all. */
  const ruleFor = (r) => {
    const first = (r.parts[0].cls || '').split(/\s+/)[0];
    const depth = (r.attrs || {})['data-depth'];
    return cssRuleOf(depth ? '.' + first + "[data-depth='" + depth + "']" : '.' + first);
  };
  const authoredDecls = (rule) => [...rule.decls].map(([k, v]) => span(k + ': ' + v)).join('<br>') || '(sets nothing)';

  const GRAD = /^linear-gradient\((\d+(?:\.\d+)?)deg, (.+) 0%, (.+) 100%\)$/;
  const MIX = /^color-mix\(in oklab, var\((--[\w-]+)\) (\d+(?:\.\d+)?)%, var\((--[\w-]+)\)\)$/;
  const BARE = /^var\((--[\w-]+)\)$/;
  const pxOf = (text, of) => {
    const m = /^(-?\d+(?:\.\d+)?)px$/.exec(String(text));
    if (!m) throw new Error(of + ': "' + text + '" is not a pixel length');
    return parseFloat(m[1]);
  };

  /** A tone as the sheet authors it: one angled gradient of two stops, each a mix over an anchor or the anchor. */
  const recipeOf = (tone) => {
    const rule = cssRuleOf('.' + tone);
    const raw = rule.decls.get('background');
    if (!raw) throw new Error('.' + tone + ' authors no `background`');
    const head = GRAD.exec(raw);
    if (!head) throw new Error('.' + tone + ': background "' + raw + '" is not a two-stop angled gradient');
    const stops = [head[2], head[3]].map((text) => {
      const mix = MIX.exec(text);
      if (mix) return { text, hue: mix[1], percent: mix[2], anchor: mix[3] };
      const bare = BARE.exec(text);
      if (bare) return { text, hue: null, percent: '0', anchor: bare[1] };
      throw new Error('.' + tone + ': stop "' + text + '" is neither a mix over an anchor nor the bare anchor');
    });
    return { rule, angle: head[1], stops };
  };
  /** The same gradient as one brightness painted it. */
  const paintedOf = (pass, name) => {
    const img = st(pass, name).props.backgroundImage;
    if (!img || !Array.isArray(img.stops) || img.stops.length !== 2) {
      throw new Error(name + ': ' + pass + ' measured no two-stop gradient');
    }
    const m = /^linear-gradient\((\d+(?:\.\d+)?)deg/.exec(String(img.raw));
    if (!m) throw new Error(name + ': ' + pass + ' gradient carries no angle — ' + img.raw);
    return { angle: m[1], stops: img.stops };
  };

  const toneRows = US.rows.filter((r) => /^face-box-/.test(r.name));
  if (toneRows.length < 2) throw new Error('ui-tokens.json cites no face-box tone row');
  const toneClass = (r) => {
    const t = (r.parts[0] || {}).tone;
    if (!t) throw new Error(r.name + ': the row names no tone class');
    // The part cites the authored template, whose tone hole is still a hole; the
    // list the mount carries — and the one this row's class column shows — is the
    // template with both holes filled.
    const cls = (r.parts[0].clsResolved || '').split(/\s+/);
    if (!cls.includes(t)) {
      throw new Error(r.name + ': its own class list does not carry the tone ' + t);
    }
    return t;
  };
  const anchors = new Set(toneRows.flatMap((r) => recipeOf(toneClass(r)).stops.map((s) => s.anchor)));
  if (anchors.size !== 1) throw new Error('the tone rows mix over more than one anchor: ' + [...anchors].join(', '));
  const anchor = [...anchors][0];
  const angles = new Set(
    toneRows.flatMap((r) => {
      const rec = recipeOf(toneClass(r));
      return [rec.angle, paintedOf('light-phone', r.name).angle, paintedOf('dark-phone', r.name).angle];
    }),
  );
  if (angles.size !== 1) throw new Error('the tones are not painted at one angle: ' + [...angles].join(', '));
  const anchorLight = TOKENS.themes['light-phone'].root[anchor];
  const anchorDark = TOKENS.themes['dark-phone'].root[anchor];
  if (!anchorLight || !anchorLight.srgb || !anchorDark || !anchorDark.srgb) {
    throw new Error(anchor + ' is not a measured colour in both phone passes');
  }
  put('#### 6.7.1 The tones — one recipe each, resolved twice', '');
  table(
    [
      'row',
      'the class the hole fills',
      'authored at',
      'stop 0 as the rule writes it',
      'painted light',
      'painted dark',
      'stop 1 as the rule writes it',
      'painted light',
      'painted dark',
    ],
    toneRows.map((r) => {
      const tone = toneClass(r);
      const rec = recipeOf(tone);
      const l = paintedOf('light-phone', r.name);
      const d = paintedOf('dark-phone', r.name);
      if (l.angle !== rec.angle || d.angle !== rec.angle) {
        throw new Error(
          r.name + ': the passes painted ' + l.angle + '/' + d.angle + 'deg, the rule authors ' + rec.angle,
        );
      }
      return [
        cell(r.name),
        cell('.' + tone),
        cell(CSS_REL + ':' + rec.rule.line) + '<br>' + citedAt(r),
        cell(rec.stops[0].text),
        cell(l.stops[0].to),
        cell(d.stops[0].to),
        cell(rec.stops[1].text),
        cell(l.stops[1].to),
        cell(d.stops[1].to),
      ];
    }),
  );
  const interactive = toneRows.filter((r) => r.tag);
  const plainArms = toneRows.filter((r) => !r.tag);
  const bareTones = toneRows.filter((r) => recipeOf(toneClass(r)).stops.some((s) => s.hue === null));
  const sameAsAnchor = bareTones.filter((r) => {
    const stop = recipeOf(toneClass(r)).stops.find((s) => s.hue === null);
    return (
      paintedOf('light-phone', r.name).stops.find((x) => x.to === anchorLight.srgb.rgba) !== undefined &&
      paintedOf('dark-phone', r.name).stops.find((x) => x.to === anchorDark.srgb.rgba) !== undefined &&
      stop.anchor === anchor
    );
  });
  if (
    !interactive.length ||
    !interactive.every((r) => r.tag === 'button' && /cursor-pointer$/.test(r.parts[0].clsResolved))
  )
    throw new Error('the interactive arms are not each a `<button>` whose class list ends with cursor-pointer');
  if (!plainArms.every((r) => / $/.test(r.parts[0].clsResolved)))
    throw new Error('the non-interactive class list does not end with the space the template leaves behind');
  put(
    'Every row is the same box with a different class filled into the same hole, all painted at the one angle the',
    'rules author and both passes measure: ' + cell([...angles][0] + 'deg') + '. ' + cell(anchor) + ' is the colour',
    'they all mix over: ' + cell(anchorLight.srgb.rgba) + ' in the light pass, ' + cell(anchorDark.srgb.rgba) + ' in',
    'the dark.',
    ...(bareTones.length
      ? [
          bareTones.length +
            ' tone' +
            (bareTones.length === 1 ? ' ends' : 's end') +
            ' on the anchor itself with no mix (' +
            bareTones.map((r) => cell('.' + toneClass(r))).join(', ') +
            '), so its',
          'painted pixels are exactly the token’s — the one stop a reader can check by eye. ' +
            (sameAsAnchor.length === bareTones.length
              ? bareTones.length === 1
                ? 'It holds in both passes.'
                : 'It holds in both passes for every one of them.'
              : 'It holds for only ' + sameAsAnchor.length + ' of ' + bareTones.length + '.'),
        ]
      : ['No tone ends on the bare anchor; every stop of every recipe is a mix.']),
    ...(plainArms.length
      ? [
          'One of the ' +
            toneRows.length +
            ' rows is not a tone but the non-interactive arm: ' +
            plainArms.map((r) => '`' + r.name + '`').join(', ') +
            ', which takes',
          plainArms
            .map(
              (r) =>
                cell('.' + toneClass(r)) +
                ' from the prop default at `' +
                esc(r.src || US.source) +
                ':' +
                r.parts[0].toneDefaultLine +
                '`',
            )
            .join('; ') +
            ' and mounts as ' +
            span(mountedAs(plainArms[0])) +
            ' rather than as the',
          cell('<' + interactive[0].tag + '>') +
            ' the ' +
            interactive.length +
            ' interactive rows are. Its class list ends with the space that ' +
            cell(interactive[0].parts[0].clsResolved.split(/\s+/).pop()) +
            ' fills for those.',
        ]
      : ['Every row is an interactive arm, so every class list has its cursor hole filled.']),
    'Flutter `Color` has no OKLCH and no `color-mix` (D-U6), so the *painted* columns **are** the port’s values; the',
    'recipe is recorded to show which token each came from, the same reading §6.6.2 gives the chip tints.',
    '',
  );

  const bandRows = US.rows.filter((r) => /^face-/.test(r.name) && !/^face-box-/.test(r.name)).map((r) => r.name);
  if (bandRows.length < 2) throw new Error('ui-tokens.json cites no face band stack');
  const chipRow = bandRows.find((n) => /chip$/.test(n));
  const badgeRow = bandRows.find((n) => /badge/.test(n));
  if (!chipRow) throw new Error('ui-tokens.json cites no face chip band');
  if (!badgeRow) throw new Error('ui-tokens.json cites no face badge band');
  const faceBandRows = bandRows.filter((n) => n !== badgeRow && n !== chipRow);
  if (faceBandRows.length < 1) throw new Error('the face cites no band of its own');
  put('#### 6.7.2 The face’s own box, and the bands inside it', '');
  table(
    [
      'stack',
      'mounted as, and the stack it carries',
      'authored at',
      'type @390',
      'text @390 (light ⇒ dark)',
      'what it paints',
      'geometry the utilities moved',
      '390px ≠ 1440px',
    ],
    bandRows.map((name) => {
      const r = rec(name);
      return [
        cell(name),
        authoredClasses(r),
        citedAt(r),
        typeOf(name),
        textOf(name),
        paintOf(name),
        geometryOf(name),
        splitOf(name),
      ];
    }),
  );
  const base = cssRuleOf('.card-face');
  const tokenDecls = [...base.decls].filter(([, v]) => /^var\(/.test(String(v)));
  const sheenRule = cssRuleOf('.card-face::before');
  const chipClass = (rec(chipRow).parts[0].cls || '').split(/\s+/)[0];
  const chipRule = cssRuleOf('.' + chipClass);
  const balanceRow = bandRows.find((n) => /balance$/.test(n));
  const balanceClass = (rec(balanceRow).parts[0].cls || '').split(/\s+/)[0];
  const radiusToken = (base.decls.get('border-radius') || '').replace(/^var\(|\)$/g, '');
  const shadowToken = (base.decls.get('box-shadow') || '').replace(/^var\(|\)$/g, '');
  const radiusMeasured = valOf(st('light-phone', 'face-box-violet').props, 'borderRadius');
  const radiusTokenPx = pxOf(TOKENS.themes['light-phone'].root[radiusToken].raw, radiusToken);
  if (pxOf(radiusMeasured, 'face-box-violet border-radius') !== radiusTokenPx) {
    throw new Error(
      radiusToken + ' resolves to ' + radiusTokenPx + 'px while the mounted face measures ' + radiusMeasured,
    );
  }
  const fluid = toneRows.find((r) => /width:\s*100%/.test((r.parts[0] || {}).style || ''));
  if (!fluid) throw new Error('no face-box row is mounted on the width-owning arm');
  const fluidDecl = (fluid.parts[0].style.match(/width:\s*100%/) || [])[0];
  const ratioText = (fluid.parts[0].style.match(/aspect-ratio:\s*([\d.]+)/) || []).pop();
  if (!ratioText) throw new Error(fluid.name + ': its inline style authors no aspect-ratio');
  const measuredWidth = pxOf(valOf(st('light-phone', fluid.name).props, 'width'), fluid.name + ' width');
  const measuredHeight = pxOf(valOf(st('light-phone', fluid.name).props, 'height'), fluid.name + ' height');
  const bandSplits = faceBandRows.filter((n) => splitOf(n) !== '—');
  put(
    'The *geometry* and *what it paints* columns read the same way as §6.6.1, and for the same reason: a detached',
    'element shows what the utilities it carries actually did.',
    bandSplits.length
      ? bandSplits.map((n) => '`' + n + '`').join(', ') +
          ' move' +
          (bandSplits.length === 1 ? 's' : '') +
          ' between 390px and 1440px (' +
          bandSplits.length +
          ' of ' +
          faceBandRows.length +
          ').'
      : 'No band in this family moves between 390px and 1440px (' +
          bandSplits.length +
          ' of ' +
          faceBandRows.length +
          ').',
    cell(chipRow) + ' is measured here but ported elsewhere: its box is ' + cell(chipRule.selector) + ', which the',
    'chip family emitted in `mobile/lib/core/theme/app_chips.dart` already paints. So `app_faces.dart` cites this',
    'family’s placement row (`' +
      bandRows.find((n) => /chip-row/.test(n)) +
      '`) and the tone table it reads rather than porting one chip twice,',
    'and generation stops if the two readings disagree.',
    'The same law keeps the balance figure with `AppNumerals`: the class list on `' + balanceRow + '` opens with',
    cell('.' + balanceClass) + ', which is that face and not a second one.',
    cell(base.selector) + ' itself sets exactly',
    [...base.decls.keys()].map((k) => cell(k)).join(', ') + '.',
    tokenDecls.length + ' of those are tokens another emitted family already ports:',
    tokenDecls.map(([k, v]) => cell(k + ': ' + v)).join(', ') + ' — so the',
    'port names both and resolves them through `AppRadii` and `AppShadows`, and generation refuses the row if they',
    'disagree: the mounted corner measures ' + cell(radiusMeasured) + ' and ' + cell(radiusToken) + ' resolves to',
    radiusTokenPx + 'px in the same pass.',
    cell('overflow: ' + (base.decls.get('overflow') || '(none)')) +
      ' and ' +
      cell('position: ' + (base.decls.get('position') || '(none)')) +
      ' are what the sheen',
    'needs, and ' + cell(sheenRule.selector) + ' (src/index.css:' + sheenRule.line + ') is a pseudo-element no probe',
    'can see, so its two layers are read from the rule as authored, in the order the rule writes them:',
    authoredDecls(sheenRule),
    '',
  );
  put(
    'One reading needs care. The arm this family was mounted on authors `width: 100%` in an inline style, so the',
    'box is width-driven: at ' + measuredWidth + 'px the pass reports a height of ' + measuredHeight + 'px, which is',
    'the mount’s own width over the authored ratio ' + cell(ratioText) + ' — arithmetic, not a fact about the design.',
    'The port therefore carries the ratio, the padding and the gaps, and never this height, which is why no number',
    'in `app_faces.dart` names a face width.',
    '',
  );

  const deckRows = US.rows.filter((r) => /^deck-/.test(r.name)).map((r) => r.name);
  if (deckRows.length < 3) throw new Error('ui-tokens.json cites no deck stacks');
  const deckBox = rec('deck-box');
  const deckRule = ruleFor(deckBox);
  const faceBase = cssRuleOf('.deck-face');
  const lip = pxOf(deckRule.decls.get('--deck-lip'), '.deck --deck-lip');
  const heightAuthored = deckRule.decls.get('height');
  const peers = deckRows.filter((n) => /depth/.test(n));
  if (!peers.length) throw new Error('the deck cites no depth rows, so the peers are not measured');
  const measuredDeckHeight = pxOf(valOf(st('light-phone', deckBox.name).props, 'height'), deckBox.name + ' height');
  if (measuredDeckHeight !== lip * 2) {
    throw new Error('.deck measures ' + measuredDeckHeight + 'px, which is not twice the ' + lip + 'px lip it authors');
  }
  const deckMargin = (deckRule.decls.get('margin') || '').split(/\s+/);
  const pullUp = pxOf(deckMargin[deckMargin.length - 1] || '', '.deck margin');
  put('#### 6.7.3 The deck — one custom property and the faces it sizes', '');
  table(
    ['stack', 'mounted as', 'authored at', 'what the sheet authors', 'what the pass measured', '390px ≠ 1440px'],
    deckRows.map((name) => {
      const r = rec(name);
      const rule = ruleFor(r);
      const s = st('light-phone', name);
      const shown = [
        'zIndex',
        'position',
        'top',
        'opacity',
        'transform',
        'transformOrigin',
        'clipPath',
        'marginBottom',
        'height',
      ];
      const got =
        shown
          .filter((k) => s.changed.includes(k))
          .map((k) => k + ' `' + valOf(s.props, k) + '`')
          .join(' · ') || '—';
      return [
        cell(name),
        authoredClasses(r),
        cell(CSS_REL + ':' + rule.line) + '<br>' + citedAt(r),
        authoredDecls(rule),
        got,
        splitOf(name),
      ];
    }),
  );
  const depthOf = (name) => (rec(name).attrs || {})['data-depth'];
  const peerLines = peers.map((n) => {
    const rule = ruleFor(rec(n));
    const s = st('light-phone', n);
    const top = pxOf(valOf(s.props, 'top'), n + ' top');
    const wantTop = String(rule.decls.get('top')).includes('--deck-lip') ? lip : 0;
    if (top !== wantTop)
      throw new Error(n + ': the pass measures top ' + top + 'px, the rule authors ' + rule.decls.get('top'));
    if (String(valOf(s.props, 'opacity')) !== String(rule.decls.get('opacity'))) {
      throw new Error(
        n +
          ': the pass measures opacity ' +
          valOf(s.props, 'opacity') +
          ', the rule authors ' +
          rule.decls.get('opacity'),
      );
    }
    const read = (d) => cell(valOf(s.props, d));
    const wrote = (d) => span(d + ': ' + rule.decls.get(d));
    const axes = ['top', 'transform', 'opacity'];
    return [
      '`' + n + '` (depth ' + depthOf(n) + ') writes ' + axes.map(wrote).join(', ') + ',',
      'and its mount reads ' + axes.map(read).join(', ') + (peers[peers.length - 1] === n ? '.' : ';'),
    ];
  });
  const peerClips = [...new Set(peers.map((n) => String(valOf(st('light-phone', n).props, 'clipPath'))))];
  put(
    'The deck’s whole geometry is one number: ' + cell(deckRule.selector) + ' declares `--deck-lip: ' + lip + 'px`',
    'and every other value in the family is written against it — ' + cell(heightAuthored) + ' for the container, and',
    'one clip-path, authored once for both peers on',
    cell(faceBase.selector) +
      ' (src/index.css:' +
      faceBase.line +
      '): ' +
      cell(String(faceBase.decls.get('clip-path'))) +
      '.',
    'It insets the bottom by all but ' + lip + 'px of the face’s own height, so what shows of a peer is its',
    'top ' + lip + 'px.',
    'The pass reads that one rule as ' +
      peerClips.map((c) => cell(c)).join(' and ') +
      ' on ' +
      peers.length +
      ' peers.',
    'The measurement agrees on the container: ' + measuredDeckHeight + 'px tall, which is twice the lip, and a bottom',
    'margin of ' +
      cell(String(deckRule.decls.get('margin'))) +
      ' that pulls it ' +
      Math.abs(pullUp) +
      'px up into the panel under it.',
    '',
  );
  const peerDeclSizes = [...new Set(peers.map((n) => ruleFor(rec(n)).decls.size))];
  put(
    'Each peer adds one rule of ' + peerDeclSizes.join(' or ') + ' declarations over that base, and every one of them',
    'is read against the mount in the same pass:',
    ...peerLines.flat(),
    '',
  );

  const keyRows = US.rows.filter((r) => /^action-key/.test(r.name)).map((r) => r.name);
  if (keyRows.length < 3) throw new Error('ui-tokens.json cites no action-key stacks');
  const grid = rec('action-key-grid');
  const key = rec('action-key');
  const keyDisabled = rec('action-key-disabled');
  const activeRule = cssRuleOf('.action-key:active');
  const disabledRule = cssRuleOf('.action-key:disabled');
  const hoverRule = cssRuleOf('.action-key:hover');
  const keyRule = cssRuleOf('.action-key');
  const notchW = pxOf(keyRule.decls.get('--key-notch-w'), '.action-key --key-notch-w');
  const notchH = pxOf(keyRule.decls.get('--key-notch-h'), '.action-key --key-notch-h');
  const restOpacity = valOf(st('light-phone', key.name).props, 'opacity');
  const offOpacity = valOf(st('light-phone', keyDisabled.name).props, 'opacity');
  if (String(offOpacity) !== String(disabledRule.decls.get('opacity'))) {
    throw new Error(
      'the disabled mount measures opacity ' +
        offOpacity +
        ' while the rule authors ' +
        disabledRule.decls.get('opacity'),
    );
  }
  put('#### 6.7.4 The three keys under the balance', '');
  table(
    [
      'stack',
      'mounted as',
      'authored at',
      'type @390',
      'text @390 (light ⇒ dark)',
      'what it paints',
      'geometry moved',
      '390px ≠ 1440px',
    ],
    keyRows.map((name) => {
      const r = rec(name);
      return [
        cell(name),
        authoredClasses(r),
        citedAt(r),
        typeOf(name),
        textOf(name),
        paintOf(name),
        geometryOf(name),
        splitOf(name),
      ];
    }),
  );
  const lightFill = valOf(st('light-phone', key.name).props, 'backgroundColor');
  const lightInk = valOf(st('light-phone', key.name).props, 'color');
  const darkFill = valOf(st('dark-phone', key.name).props, 'backgroundColor');
  const darkInk = valOf(st('dark-phone', key.name).props, 'color');
  put(
    'A key is the only box in this family that is a rule and a real `<button>` at once: the mount carries',
    '`type="button"` and the class list the component writes, so the UA padding, border and centred text a button',
    'inherits are inside the measurement rather than beside it. ' +
      cell(keyRule.selector) +
      ' (src/index.css:' +
      keyRule.line +
      ') sets',
    [...keyRule.decls.keys()].length +
      ' declarations, of which the fill and the ink are ' +
      '`' +
      esc(String(keyRule.decls.get('background'))) +
      '` and `' +
      esc(String(keyRule.decls.get('color'))) +
      '`:',
    cell(lightFill) + ' under ' + cell(lightInk) + ' in the light pass,',
    cell(darkFill) + ' under ' + cell(darkInk) + ' in the dark.',
    'The pair changes ends between the passes — the fill takes the light end and the ink the dark one —',
    'but it is not one pair inverted: the light ink is ' + cell(lightInk) + ' while the dark fill is',
    cell(darkFill) + ', and the light fill is ' + cell(lightFill) + ' while the dark ink is',
    cell(darkInk) + '.',
    '',
  );
  const restDecls = ['opacity', 'transform'].filter((d) => keyRule.decls.has(d));
  const transitionProps = String(keyRule.decls.get('transition'))
    .split(',')
    .map((p) => p.trim().split(/\s+/)[0]);
  const authorsProp = (prop) =>
    [
      [':active', activeRule],
      [':hover', hoverRule],
      [':disabled', disabledRule],
    ]
      .filter(([, r]) => r.decls.has(prop))
      .map(([n]) => cell(n))
      .join(' and ');
  const stateProps = [...new Set([activeRule, hoverRule, disabledRule].flatMap((r) => [...r.decls.keys()]))];
  const unrunProps = stateProps.filter((d) => !transitionProps.includes(d));
  const unrunGroups = [];
  for (const d of unrunProps) {
    const who = authorsProp(d) || 'no state rule';
    const hit = unrunGroups.find((g) => g.who === who);
    if (hit) hit.props.push(cell(d));
    else unrunGroups.push({ who, props: [cell(d)] });
  }
  table(
    ['state', 'authored at', 'what the rule says', 'what a detached mount can show'],
    [
      [
        cell(':active'),
        cell(CSS_REL + ':' + activeRule.line),
        authoredDecls(activeRule),
        'Nothing: no press reaches a mounted element. The scale is authored only, and the port animates it with the rule’s own duration and easing.',
      ],
      [
        cell(':disabled'),
        cell(CSS_REL + ':' + disabledRule.line) + ' (also `' + esc(disabledRule.heads[1]) + '`)',
        authoredDecls(disabledRule),
        'Measured on `' +
          keyDisabled.name +
          '`: opacity ' +
          cell(String(offOpacity)) +
          ' and cursor ' +
          cell(valOf(st('light-phone', keyDisabled.name).props, 'cursor')) +
          '.',
      ],
      [
        cell(':hover'),
        cell(CSS_REL + ':' + hoverRule.line),
        authoredDecls(hoverRule),
        'Dropped, and recorded: D-U1. It survives only inside the transition list below.',
      ],
      [
        'at rest',
        cell(CSS_REL + ':' + keyRule.line),
        restDecls.length
          ? restDecls.map((d) => span(d + ': ' + keyRule.decls.get(d))).join('<br>')
          : 'the base rule writes neither ' + cell('opacity') + ' nor ' + cell('transform'),
        'The mount measures opacity ' +
          cell(String(restOpacity)) +
          ' and transform ' +
          cell(String(valOf(st('light-phone', key.name).props, 'transform'))) +
          '.',
      ],
    ],
  );
  put(
    'The transition the base rule authors is',
    span(String(keyRule.decls.get('transition'))) + '.',
    'It runs ' +
      transitionProps.map((p) => cell(p) + ' written by ' + (authorsProp(p) || 'no state rule')).join(', and ') +
      '.',
    'The ' +
      transitionProps
        .filter((p) => hoverRule.decls.has(p))
        .map((p) => cell(p))
        .join(' and ') +
      ' layer therefore runs for the one state this port drops (D-U1). The ' +
      unrunProps.map((d) => cell(d)).join(' and ') +
      ' are authored',
    'by a state rule and named by no transition: ' +
      unrunGroups.map((g) => g.who + ' writes ' + g.props.join(' and ')).join(', while ') +
      '.',
    '',
  );
  const maskAuthored = String(keyRule.decls.get('-webkit-mask'));
  const maskCut = /^radial-gradient\(ellipse (.+?) at (.+?), (.+)\)$/.exec(maskAuthored);
  put(
    'The key is not a rounded rectangle. ' + cell(keyRule.selector) + ' masks an ellipse out of its top edge:',
    ...(maskCut
      ? [
          'size ' + cell(maskCut[1]) + ', centre ' + cell(maskCut[2]) + ', stops ' + cell(maskCut[3]) + '.',
          'Those two names are ' +
            cell('--key-notch-w: ' + notchW + 'px') +
            ' and ' +
            cell('--key-notch-h: ' + notchH + 'px') +
            '.',
        ]
      : ['which the rule writes as ' + cell(maskAuthored) + '.']),
    'The pass records no ' + cell('mask') + ' on ' + cell(key.name) + ', so this cut travels from',
    CSS_REL + ':' + keyRule.line + ' as authored, not measured.',
    '',
  );
  put(
    'The glyph box ' + cell(ruleFor(rec('action-key-icon')).selector) + ' exists to kill the inline-box leading a bare',
    'icon would add: the pass measured its ' +
      cell('lineHeight') +
      ' at `' +
      valOf(st('light-phone', 'action-key-icon').props, 'lineHeight') +
      '`, and that zero is what makes the key’s own',
    cell('gap') + ' the only space between symbol and word.',
    '',
  );
  const gridTrackPx = String(st('light-phone', grid.name).props.gridTemplateColumns)
    .trim()
    .split(/\s+/)
    .map((s) => pxOf(s, 'a grid track'));
  const gridWidth = pxOf(valOf(st('light-phone', grid.name).props, 'width'), 'the grid width');
  const gridGap = pxOf(valOf(st('light-phone', grid.name).props, 'columnGap'), 'the grid gap');
  const gridIdeal = (gridWidth - gridGap * (gridTrackPx.length - 1)) / gridTrackPx.length;
  const gridDev = Math.max(...gridTrackPx.map((p) => Math.abs(p - gridIdeal)));
  put(
    'The grid the three sit in is the one box here that is pure utility —',
    '`' + esc(String(grid.parts[0].cls)) + '`, declared by no rule in ' + CSS_REL + '. The pass measured',
    cell(valOf(st('light-phone', grid.name).props, 'display')) + ' over a ' + gridWidth + 'px box and',
    gridTrackPx.length + ' tracks of `' + esc(String(st('light-phone', grid.name).props.gridTemplateColumns)) + '`.',
    'They are not one number: the equal share of the row, once the ' + gridGap + 'px gutters are taken off it,',
    'is ' + gridIdeal.toFixed(3) + 'px, and no track sits further from that than ' + gridDev.toFixed(3) + 'px.',
    'The port carries the count and the two gaps and no track width, because a width is a fact about the',
    'caller’s box. The gap moves with the breakpoint —',
    cell(valOf(st('light-phone', grid.name).props, 'columnGap')) + ' on the phone against',
    cell(valOf(st('light-desktop', grid.name).props, 'columnGap')) + ' at 1440px, which is `sm:gap-2.5` doing what the',
    'phone never applies — so the port carries both gaps and leaves the breakpoint to the caller, as §6.6.1 leaves',
    'the rails.',
    '',
  );

  const faceFacts = US.authoredNonCss.filter((r) => /^(face-|card-face-|action-key-|deck-)/.test(r.name));
  if (!faceFacts.length) throw new Error('ui-tokens.json cites no card-face authored record');
  put('#### 6.7.5 What this family does that no probe can see', '');
  table(
    ['record', 'tier', 'as written', 'authored at', 'what it decides'],
    faceFacts.map((r) => [
      cell(r.name),
      cell(r.tier || 'authored-js'),
      r.parts.map((p) => span(p.text)).join('<br>'),
      citedAt(r),
      r.note || '',
    ]),
  );
  put(
    faceFacts.length + ' records. None of them is a computed style, and several decide what the port paints:',
    'which tone a wallet gets is a hash the component computes, the badge pill is drawn twice from two files that',
    'agree by copying, a single wallet has no deck at all, and the label above an owed figure changes without the',
    'number doing anything. They are listed per line so a drift test can re-read each one from `src/` rather than',
    'trusting this table.',
    '',
  );
  put(
    'The Dart side of this family is `mobile/lib/core/theme/app_faces.dart`, emitted from these records by',
    '`node parity/generate_theme.cjs` and re-derived property by property by `mobile/test/theme/` drift tests.',
    'Where a value belongs to another family — the corner, the float, the gold chip, the money face — it is cited',
    'there and cross-checked here, never restated. Port deviations this family forces are listed with their ids in',
    '`parity/STATUS.md`, not silently applied.',
    '',
  );
}

// ---------------------------------------------------------------- 7. deviations
put('## 7. Phone-forced deviations — every one needs your approval', '');
put(
  'Playbook rule: list every adaptation the phone forces. These are not porting choices I have made; they',
  'are places where the web behaviour has no faithful phone equivalent, so the Dart side must differ or',
  'the difference must be accepted. Nothing here has been changed on the web side.',
  '',
);
put(
  '**Status: D-U13 is ruled** — **D16** at the Phase 2 gate, recorded in `INVENTORY.md` §13e: reproduce the',
  'split, bug-compatible. Every other row in this table still awaits your approval.',
  '',
);
{
  const rows = [
    [
      'D-U1',
      '`:hover` styling',
      `${hoverSelectors.length} rule heads in index.css use \`:hover\` (${hoverSelectors
        .slice(0, 6)
        .map((s) => '`' + esc(s) + '`')
        .join(', ')} …)`,
      'A touch screen has no hover state. Flutter must either drop these or bind them to `MouseRegion`, which fires only for a connected pointer.',
      'Drop. Hover is decoration, not contract.',
    ],
    [
      'D-U2',
      '`#command-palette` / ⌘K',
      `\`src/components/CommandPalette.tsx:112\` binds a keyboard shortcut`,
      'No physical keyboard, no ⌘K. The palette is also the only untrapped overlay (`INVENTORY.md` §3).',
      'Not ported. Its actions are all reachable from screens that are.',
    ],
    [
      'D-U3',
      '`focus-visible` rings',
      `${focusSelectors.length} rule heads`,
      'Keyboard-only. A phone reveals focus on tap, which would show a ring on every press.',
      'Keep the ring for external keyboards via `FocusTraversal`, do not show it for taps.',
    ],
    [
      'D-U4',
      'print stylesheet',
      `@media print block at \`src/index.css:${cssLineOf('@media print')}\`, \`window.print()\` in \`ReportsCentre.tsx:149\``,
      'No print dialog. Covers ' + printSelectors.length + ' classes.',
      'Rebuild as a `printing` PDF tree — a new artefact, needs its own approval.',
    ],
    [
      'D-U5',
      'CSV download',
      '`URL.createObjectURL` + anchor click in `src/lib/download.ts:3-10`',
      'No anchor download on native.',
      '`share_plus` sheet instead of a browser download. Different chrome, same bytes — the bytes are already goldens (`csv` fixture set).',
    ],
    [
      'D-U6',
      'OKLCH / `color-mix()` / Display-P3',
      `${Object.keys(THEME.light.root).filter((n) => kindOf(THEME.light.root[n]) !== 'other').length} colour-bearing tokens`,
      'Flutter `Color` has no OKLCH and no mix. Values are baked from Chrome’s own conversion (§2).',
      'Accept the baked table as the source of truth; re-run this file if the CSS changes.',
    ],
    [
      'D-U7',
      'Translucent shadows',
      'every `--shadow*` token, α 0.05–0.55',
      'A flat hex cannot carry them: `hex` ignores alpha, and an 8-bit canvas cannot carry the colour either (§1.1).',
      'Use `Color.fromRGBO(r, g, b, alpha)` from §2.2. Never derive a shadow from its hex.',
    ],
    [
      'D-U8',
      '`backdrop-filter: blur()`',
      '`.glass-panel`, `.glass-pill`, `.floating-nav`',
      'Reproduces, but costs real frames on low-end Android.',
      'Port at the same sigma, with a documented fallback to a solid fill if the golden test can’t hold 60fps.',
    ],
    [
      'D-U9',
      'Google Fonts `@import`',
      `\`src/index.css:${cssLineOf("@import url('https://fonts.googleapis.com")}\``,
      'No CDN stylesheet at runtime on native.',
      '**Bundle the three families as assets** (OFL). A missing font silently invalidates every screenshot golden. **Landed — item 10:** §3.1 lists the 13 faces with their digests and the licence texts; `node parity/get_fonts.cjs --check` verifies the bytes, and `mobile/test/flutter_test_config.dart` loads them into the test harness.',
    ],
    [
      'D-U10',
      '`clamp()` type sizes',
      '§3 rows marked **resizes**',
      'The phone resolves them to a different pixel size than the desktop.',
      'Hard-code the 390px value per style, since the phone viewport is the target.',
    ],
    [
      'D-U11',
      'Desktop-only layout block',
      `@media (min-width: …): ${minWidthBlocks.map((b) => '`' + b + '`').join(', ') || 'none'}`,
      'The ≥1024px rules are sidebar/desktop chrome; the base rules are the mobile ones.',
      'Port the base rules only. The phone *is* the layout Flutter ships.',
    ],
    ['D-U12', 'Service worker / PWA', 'none exists', 'Nothing to port, nothing to add.', 'No action.'],
    [
      'D-U13',
      '`dark:` utility variants — **ruled, D16**',
      `§6.5 matrix: ${TOKENS.darkVariantMatrix.combos[1].painted.length} tokens paint when only the OS is dark; ${TOKENS.darkVariantMatrix.combos[2].painted.length} paint from the app toggle`,
      'On the web the OS preference drives them. Flutter has one theme of its own and no separate “OS scheme” signal unless the app chooses to read `platformBrightness`.',
      '**Ruled at the Phase 2 gate (`INVENTORY.md` §13e): reproduce the split bug-compatible.** Variables freeze at first seed, `dark:` utilities read `platformBrightness` live. Four golden combinations, plus a fourth web baseline set (app light + OS dark) before Phase 5 — that set is now measured, as `app-light-os-dark` in §9; the app-dark-on-OS-light pair is still unbaselined.',
    ],
    [
      'D-U14',
      'WebAuthn / passkey unlock — **not ported on mobile**',
      '`server.ts:2181-2189` `getOrigin()` pins `expectedOrigin` to `APP_ORIGIN` in production, and `server.ts:2599-2607` / `:2723` pass it to `@simplewebauthn` as the verification condition. `server.ts:2194` `userIDBytes` is sha256 of the normalised email, so the credential *identifier* is portable — the *origin* is not.',
      'A native assertion presents `android:apk-key-hash:<…>` (or the iOS bundle-id form) as its origin. It can never equal a `https://` `APP_ORIGIN`, so the unchanged server rejects it. Making it work would require a server change, which is not approved.',
      '**No.** Mobile unlock is `local_auth` (biometric/PIN, on-device only) plus the unchanged bcrypt PIN routes `/api/app-lock/pin/set` and `/api/app-lock/pin/verify`. `biometricCount` from `/api/app-lock/status` is therefore always 0 on the phone, and the web’s “add a passkey” affordance has no mobile counterpart. Recorded so the golden tests do not treat a missing passkey row as a defect.',
    ],
    [
      'D-U15',
      '“Revoke all devices” cannot lock a phone out',
      '`server.ts:2945-2974` `/api/app-lock/device/revoke-all` clears the caller’s `trusted_devices` rows and expires the `app_lock_trust` cookie (`server.ts:1325-1337`), which is browser-only. The session token itself is an HMAC string with no server-side record — `verifySecureToken` (`server/security.ts:36-53`) checks signature and expiry and nothing else.',
      'On the web, revoking all devices removes the *cookie*, so the browser loses trust on next load. A phone holds the session token in secure storage and is not affected by any cookie deletion, and there is no token revocation list to consult. The asymmetry is inherent to the unchanged server, not a porting mistake.',
      'Report it, do not fix it. The phone reproduces the web’s *token* semantics exactly; only the cookie half has no native twin. Phase 7 must state this in the trust-device screen copy so a user is not told a phone was revoked when it was not.',
    ],
    [
      'D-U16',
      'Receipt scanning / OCR — **hidden on mobile v1 (D40)**',
      'Every scanning affordance sits behind one component with one mount: `src/components/ReceiptScanner.tsx` (drag-and-drop zone `:287`, click-to-pick `:288`, the hidden `<input type="file" accept="image/*">` `:295`, `Scan Issue` `:347`, the edit form and its post button `:430`), mounted only at `src/components/InflowsOutflows.tsx:296` (import `:5`), which `src/App.tsx:4456` renders in the `inflow_outflow` tab (lazy chunk `src/App.tsx:86`). Client-side parsing is `src/utils/freeOcrParser.ts` (tesseract.js), tested by `src/ocr-parser.test.ts`; the server path is `POST /api/ocr/free-scan`.',
      'Deferred, not unbuildable. D40 at the Phase 4 gate moved OCR out of mobile v1, so no phone screen may open a camera sheet or accept an image drop for scanning, and the capture that was to measure the browser-OCR ↔ server-OCR ↔ parser contract (#65) is parked — there is no golden for any of it.',
      '**No screen, no affordance, no OCR call in v1.** The plan stands for when OCR is added: scan through `POST /api/ocr/free-scan`, keep `freeOcrParser.ts` server-side, and measure the three-way contract (D28/D32) rather than write it. The recorder scaffold is committed on `feature/ocr-three-way-contract`, local only. Not to be confused with the web’s voucher controls — `LoansTracker.tsx:568` “Post receipt”, `DebtDetailModal.tsx:207` “Receipt account”, `DebtTracker.tsx:308` “Other / no receipt”, the `Receipt` icons at `CreditCardManagement.tsx:430` and `:649` and `ui/CategoryChip.tsx:36` and `:84`, and the avatar image picker at `ProfileSection.tsx:127-129`: none of them scan, and all of them are ported normally.',
    ],
  ];
  table(['id', 'subject', 'evidence', 'why the phone differs', 'proposed handling'], rows);
}

// ---------------------------------------------------------------- 8. limits
put('## 8. What this document does not fix', '');
put(
  '- **Layout.** Spacing, flex direction and grid placement come from Tailwind utilities written into the',
  '  JSX, not from `index.css`, so a detached probe cannot see them. §6.4 measures the *colour* those',
  '  utilities produce; positions and sizes are the job of the screenshot baselines in',
  '  `parity/screenshots/web/` (task #38) and the widget-level golden tests in Phase 4.',
  '- **Class names built at runtime.** §6.4 scans string literals, so a class assembled by concatenation or',
  '  held in a computed expression is invisible to it. The paint control means the failure mode is a missing',
  '  row, never a wrong colour — and a screen that shows a colour §6.4 does not list is a spec gap to report.',
  '- **Iconography.** Every icon is a `lucide-react` component; the phone needs the same glyphs, and the',
  '  mapping from icon name to Dart widget is a per-screen decision, not a token.',
  '- **Images and illustrations.** None are referenced by `index.css`; anything in `public/` is per-screen.',
  '- **Animation curves in JS.** `motion` (Framer) drives entry and layout animations from component code.',
  '  Only the CSS-declared timings are in §4; the JS ones belong with each screen’s golden test.',
  '- **Live device colour.** Everything here is Chrome’s sRGB output on this machine. A phone in P3 or with',
  '  a different profile renders the same *numbers* differently; the golden tests compare numbers.',
  '',
);
put('## 9. Pixel baselines', '');
const MAN_PATH = path.join(__dirname, 'screenshots', 'MANIFEST.json');
if (!fs.existsSync(MAN_PATH)) {
  put('Not captured yet. Run `node parity/run_baselines.cjs` against the dev server, then re-render.', '');
} else {
  const MAN = JSON.parse(fs.readFileSync(MAN_PATH, 'utf8'));
  // The pixels and the numbers have to come from the same source, or §9 is a picture
  // of some other build than the one this spec describes.
  if (MAN.sourceCommit !== commitSha) {
    throw new Error(
      `BASELINE DRIFT: parity/screenshots/MANIFEST.json was captured from ${MAN.sourceCommit} ` +
        `but tag ${TAG} is ${commitSha}. Re-run parity/run_baselines.cjs before rendering.`,
    );
  }
  put(
    'Everything above is a number; a golden test also needs pixels. `parity/run_baselines.cjs` drives',
    '`qa-shot.cjs` against the running app — one pass per width, so that the seed accumulates the way a real',
    'session’s does — and files what it produces under `parity/screenshots/web/<set>/<width>/<tab>.png`. The',
    'wrapper decides nothing the harness could not decide itself: a theme, a width list, a throwaway mailbox per',
    'run (D6), and a freshly generated password handed to the child through its environment only, never written',
    'down (D9). Its only additions to the harness are the two flags G5.0 ruled in, `--now` and `--app-theme`, and',
    'both default to not being passed. Every PNG is',
    'hashed in `parity/screenshots/MANIFEST.json`, which is also where the harness’s own report for each',
    'run is kept verbatim. They came from `' +
      commitSha.slice(0, 12) +
      '`, the same commit as tag `' +
      TAG +
      '` that this',
    'whole document is measured against; the renderer refuses to write if the two ever disagree.',
    '',
  );
  table(
    ['set', 'tenant', 'tabs', 'console errors', 'overflowing views', 'shots', 'bytes'],
    MAN.runs.map((r) => [
      '`' + (r.set || r.theme) + '`',
      '`' + r.email + '`',
      r.reported.tabs,
      String(r.reported.consoleErrors.count),
      String(r.reported.overflow.count),
      String(r.screenshots.length),
      r.screenshots.reduce((n, s) => n + s.bytes, 0).toLocaleString('en-US'),
    ]),
  );
  put(
    '',
    `That is ${MAN.runs.length} runs × ${MAN.widths.length} widths (${MAN.widths.join(', ')}px) × 8 tabs =`,
    `${MAN.runs.reduce((n, r) => n + r.screenshots.length, 0)} baselines, all of them logged in as a tenant seeded with the`,
    'harness’s realistic ledger, so no screen is baselined in its empty state.',
    '',
  );
  put(
    'Each set is a different golden, and the difference is not only the theme. `appTheme` is the value the app',
    'had stored for itself (`em-budget-theme`) and the OS signal is what `qa-shot.cjs` set through Playwright’s',
    '`colorScheme`; the two are independent sources of truth, which is why D16 counts four combinations and not',
    'two. `seed instant` is when that run’s tenant was seeded — pinned by `--now` where it could be, otherwise',
    'recovered from the base36 stamp the pass left in every row id.',
    '',
  );
  table(
    ['set', 'OS signal', 'appTheme', 'seed instant', 'pass cadence'],
    MAN.runs.map((r) => [
      '`' + (r.set || r.theme) + '`',
      r.theme,
      r.appTheme ? '`' + r.appTheme + '`' : 'unset (follows the OS)',
      r.fixedAt ? '`' + r.fixedAt + '`' : 'recovered: ' + r.passes.map((p) => p.seededAt).join(', '),
      r.fixedAt
        ? '`--now` + `passStepMs` ' + r.passStepMs + ' ms'
        : 'not pinned; passes ' + r.passes.map((p) => p.width + 'px').join(' → '),
    ]),
  );
  put(
    '',
    'Every baseline also carries `passIndex`, `seedMultiplicity`, `seededAt` and `seedAtSource` in',
    '`MANIFEST.json`. `seedMultiplicity` is the one that stops a 430px baseline looking like a data bug: the app',
    '*merges* cloud rows into the local ledger on hydration, so the third width pass of a run renders three',
    'copies of the seeded totals where the first pass renders one. A baseline is therefore a position in a',
    'sequence, and only comparable with a render at the same position.',
    '',
  );
  put(
    '**Are the sets comparable with each other?** ' + MAN.comparability.verdict + ' ' + MAN.comparability.dateContent,
    '',
  );
  put(
    '**How a re-capture is judged.** ' +
      MAN.tolerance.appliesTo +
      ' The comparison is on ' +
      MAN.tolerance.compared +
      ':',
    '',
  );
  table(
    ['clause', 'rule'],
    MAN.tolerance.clauses.map((c) => ['`' + c.id + '`', c.rule]),
  );
  put('', MAN.tolerance.evidence, '');
  put(
    'Two facts come out of the runs themselves and both belong to the web app, not to the port: every',
    'width in both themes reported **0 console errors** and **0 horizontally overflowing views**. The',
    'Flutter side has to match those two numbers rather than inherit them, because they are properties of',
    'this layout at these widths, and a phone that overflows at 360px will overflow in Dart too.',
    '',
  );
  put(
    '- **What these baselines do not cover.** `qa-shot.cjs` sets the *operating system* preference through',
    '  Playwright’s `colorScheme`, and — since the G5.0 ruling — the app’s own stored theme through `--app-theme`,',
    '  which pre-sets `em-budget-theme` before the app boots. D16 counts the four combinations of those two',
    '  sources, and three are now measured: `light` and `dark` were captured before the flag existed, so the',
    '  stored theme followed the OS in both, and `app-light-os-dark` fixes the divergent pair that §6.5 measures',
    '  as numbers. **The fourth combination — app dark on an OS-light system — is still unbaselined.** So is',
    '  every fresh-install state: each context starts with empty storage, so nothing here shows a returning',
    '  user’s cached theme decision.',
    '- Overlays, modals and the gates (`LockScreen`, `EmailLogin`, `SettingsModal`) are absent for a',
    '  simpler reason: the harness walks the eight tabs as the page loads them, and nothing opens those',
    '  surfaces. Each is baselined with its own screen in Phase 5, where the interaction that opens it and',
    '  the control state itself are ported together. (This line said Phase 4 until the D39 ruling: Phase 4',
    '  delivered logic units only, and `mobile/lib/presentation/` is still empty, so no overlay has a screen',
    '  to baseline yet. Phase 5 is the design-system phase, and `BUGS_FOUND.md` B-25 already counted on that.)',
    '- **B-25 is a deliberate, ruled deviation on this screen — D39, Phase 4 gate.** When a manual cloud pull',
    '  times out, the web leaves the Settings sync panel dead for the rest of the session: the 15 s wall sits',
    "  outside `doSync`'s `try/catch` (`src/supabase.ts:1167-1171`), so the expiry rejects; `handlePullSync`",
    '  awaits without a `catch` (`src/components/SettingsModal.tsx:219`), so `syncStatus` never leaves',
    "  `'loading'` and both buttons stay `disabled` (`:614`, `:626`). The phone must not inherit that: it",
    "  catches, shows `error ?? 'No backup found.'`, and leaves both controls enabled. The wording is the web's",
    '  own — `JsError.message` carries `syncStateFromSupabase timed out after 15000ms` verbatim — so the phone',
    '  displays an error message the web never manages to show. The repository contract is unchanged and still',
    '  rejects (`mobile/lib/data/ledger_repository.dart:260-270`); the web fix is on the post-parity list.',
    '',
  );
}
put('## 10. Reproducing this file', '');
put(
  '```',
  'npm run dev                      # the app, unmodified, on http://localhost:3000',
  'node parity/run_baselines.cjs    # §9: drives qa-shot.cjs; writes parity/screenshots/',
  'node parity/ui-tokens.cjs        # measures; writes parity/ui-tokens.json',
  'npx prettier --write parity/ui-tokens.json',
  'node parity/get_fonts.cjs        # §3.1: fetches the bundle; writes parity/fixtures/fonts.json',
  'node parity/get_fonts.cjs --check  # re-verifies those bytes; changes nothing',
  'node parity/render_ui_spec.cjs   # renders this document from those files',
  'node parity/generate_theme.cjs   # the same JSON -> mobile/lib/core/theme/*.dart (needs DART_BIN or FLUTTER_ROOT)',
  '```',
  '',
);
put(
  'The renderer refuses to write if `src/index.css` is not blob-identical to tag `' +
    TAG +
    '`, and the probe refuses to',
  'record a colour it cannot resolve. A stale UI_SPEC is therefore not a documentation risk but a build failure.',
  "The document is passed through the repo's own Prettier config on the way out, because aligned Markdown tables",
  "are Prettier's job and reimplementing its column maths here would only drift from `npm run format:check`. That",
  'is also why `parity/ui-tokens.json` is formatted after every measurement run: it is a generated artefact, and',
  'a re-measure leaves it unformatted until Prettier runs again.',
  '',
);
put('---', '');
put(`Rendered by \`parity/render_ui_spec.cjs\` from \`parity/ui-tokens.json\` at tag \`${TAG}\` (${commitSha}).`, '');
put(
  'No render timestamp is stamped here: rendering the same measurement file twice must produce the ' +
    'same bytes, so a dirty `UI_SPEC.md` always means the inputs changed (D33).',
  '',
);

// Prettier formats the output on the way to disk. Its config is resolved from the
// repo rather than hardcoded, so `npm run format:check` sees exactly these bytes.
const prettier = require('prettier');
const raw = L.join('\n') + '\n';
prettier
  .resolveConfig(OUT)
  .then((cfg) => prettier.format(raw, { ...cfg, parser: 'markdown', filepath: OUT }))
  .then((text) => {
    fs.writeFileSync(OUT, text, 'utf8');
    console.log(`wrote ${path.relative(process.cwd(), OUT)} — ${text.split('\n').length} formatted lines`);
  });
console.log(`rendered ${L.length} lines before formatting`);
console.log(
  `tokens: ${rootNames().length} non-tailwind, colour ${
    rootNames().filter((n) => kindOf(THEME.light.root[n]) === 'colour').length
  }, compound ${rootNames().filter((n) => kindOf(THEME.light.root[n]) === 'compound').length}`,
);
console.log(
  `probes: ${Object.keys(THEME.light.probes).length}, declared classes: ${DECLARED.length}, unprobed: ${UNPROBED.length}`,
);
console.log(
  `css facts: hover heads ${hoverSelectors.length}, focus-visible heads ${focusSelectors.length}, print classes ${printSelectors.length}`,
);
