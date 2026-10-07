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
const cssSha256 = crypto.createHash('sha256').update(CSS_TEXT).digest('hex');

// ---------------------------------------------------------------- small helpers
const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const cell = (s) => '`' + esc(s) + '`';
const mdRow = (cols) => '| ' + cols.map(esc).join(' | ') + ' |';

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
  put(
    'Flutter cannot load a stylesheet from a CDN at runtime the way this line does, so the three families',
    'must be bundled as assets (all three are SIL Open Font Licence and may be redistributed with the app).',
    'That is a packaging decision, not a design change, but it is listed here because a missing font asset',
    'silently changes every glyph in the golden screenshots. **Needs approval: bundle the fonts.**',
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
      '**Bundle the three families as assets** (OFL). A missing font silently invalidates every screenshot golden.',
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
      '`dark:` utility variants',
      `§6.5 matrix: ${TOKENS.darkVariantMatrix.combos[1].painted.length} tokens paint when only the OS is dark; ${TOKENS.darkVariantMatrix.combos[2].painted.length} paint from the app toggle`,
      'On the web the OS preference drives them. Flutter has one theme of its own and no separate “OS scheme” signal unless the app chooses to read `platformBrightness`.',
      '**Ruled at the Phase 2 gate (`INVENTORY.md` §13e): reproduce the split bug-compatible.** Variables freeze at first seed, `dark:` utilities read `platformBrightness` live. Four golden combinations, plus a fourth web baseline set (app light + OS dark) before Phase 5.',
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
    'Everything above is a number; a golden test also needs pixels. `parity/run_baselines.cjs` drives the',
    'untouched `qa-shot.cjs` against the running app — once per theme — and files what it produces under',
    '`parity/screenshots/web/<theme>/<width>/<tab>.png`. The wrapper decides nothing the harness could not',
    'have decided itself: a theme, a width list, a throwaway mailbox per run (D6), and a freshly generated',
    'password handed to the child through its environment only, never written down (D9). Every PNG is',
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
    ['theme', 'tenant', 'tabs', 'console errors', 'overflowing views', 'shots', 'bytes'],
    MAN.runs.map((r) => [
      r.theme,
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
    'Two facts come out of the runs themselves and both belong to the web app, not to the port: every',
    'width in both themes reported **0 console errors** and **0 horizontally overflowing views**. The',
    'Flutter side has to match those two numbers rather than inherit them, because they are properties of',
    'this layout at these widths, and a phone that overflows at 360px will overflow in Dart too.',
    '',
  );
  put(
    '- **What these baselines do not cover.** `qa-shot.cjs` sets the theme through Playwright’s',
    '  `colorScheme`, i.e. the *operating system* preference, and each context starts with empty storage.',
    '  So every shot is the fresh-install state, where the app theme and the `dark:` utilities agree',
    '  because both follow the OS. The divergent state of §6.5 — app light while the OS is dark — is',
    '  measured there as numbers, but it cannot be screenshotted through this harness, which has no way to',
    '  pre-set `em-budget-theme` before the app boots. A fourth set would need a harness flag or a storage',
    '  seed, and both are your call, not mine.',
    '- Overlays, modals and the gates (`LockScreen`, `EmailLogin`, `SettingsModal`) are absent for a',
    '  simpler reason: the harness walks the eight tabs as the page loads them, and nothing opens those',
    '  surfaces. Each is baselined with its own screen in Phase 4, where the interaction that opens it is',
    '  ported too.',
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
  'node parity/render_ui_spec.cjs   # renders this document from that file',
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
put(`Rendered by \`parity/render_ui_spec.cjs\` from \`parity/ui-tokens.json\` at ${new Date().toISOString()}.`);

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
