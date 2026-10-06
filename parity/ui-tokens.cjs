/**
 * Phase 1 UI token resolver.
 *
 * `src/index.css` expresses every colour in OKLCH and mixes many of them with
 * `color-mix()`. Flutter has no OKLCH and no `color-mix()`, so the Dart theme
 * needs literal sARGB values — and they must be the values the *browser*
 * produces, not a hand-run conversion (a hand conversion is a second
 * implementation, which is exactly what this migration is not allowed to do).
 *
 * Method: load the running web app, force each theme through the app's own
 * ThemeContext key (`em-budget-theme`), then for every custom property and every
 * colour-bearing selector hand the resolved value to Chrome twice. The reported
 * colour is the *engine* reading — assign `color-mix(in srgb, V 100%, V 100%)`
 * (mixing a colour with itself changes nothing) to a hidden span's `color`, and
 * `getComputedStyle` serialises it as `color(srgb r g b / a)` at full float
 * precision with alpha intact. The canvas pixel reading is kept only as evidence
 * of how far an 8-bit premultiplied buffer drifts, because it is unusable for
 * translucent colours: the same authored colour at two alphas came back as two
 * different RGB triples.
 *
 * The same pass also measures the colour-bearing Tailwind utilities the components
 * write in `className` strings, which exist only in the generated stylesheet.
 *
 * Requires the dev server on BASE (npm run dev). Writes parity/ui-tokens.json.
 * Usage: node parity/ui-tokens.cjs
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.QA_BASE || 'http://localhost:3000';
const OUT = path.join(__dirname, 'ui-tokens.json');

/** Selectors whose appearance is rule-declared, so a detached element carrying
 *  the class resolves them the same way the real component does. Nested-only
 *  rules (`.dark .x .y`) are listed with the ancestor chain that produces them. */
const PROBE_SELECTORS = [
  'body',
  '.card',
  '.card-flat',
  '.card-lg',
  '.card-dark',
  '.gradient-card',
  '.glass-panel',
  '.glass-pill',
  '.btn-primary',
  '.btn-ghost',
  '.input',
  '.money',
  '.money-display',
  '.eyebrow',
  '.mono',
  '.delta-chip',
  '.delta-up',
  '.delta-down',
  '.icon-chip',
  '.icon-chip-lg',
  '.chip-select',
  '.action-key',
  '.action-key-icon',
  '.day-head',
  '.ledger-rule',
  '.mw-progress',
  '.bar-blue',
  '.bar-lavender',
  '.bar-mint',
  '.bar-pink',
  '.bar-yellow',
  '.ambient',
  '.cta-glow',
  '.floating-nav',
  '.deck',
  '.deck-face',
  '.card-face',
  '.card-face-chip',
  '.hero-face',
  '.hero-blue',
  '.hero-cyan',
  '.hero-teal',
  '.hero-mint',
  '.hero-emerald',
  '.hero-amber',
  '.hero-orange',
  '.hero-rose',
  '.hero-violet',
  '.hero-indigo',
  '.hero-slate',
  '.face-blue',
  '.face-teal',
  '.face-amber',
  '.face-rose',
  '.face-violet',
  '.face-graphite',
  // Everything else index.css declares. Enumerated by diffing the rule heads of
  // src/index.css against the probe keys, so this list is coverage, not taste.
  '.card-sm',
  '.deck-front',
  '.icon-btn',
  '.mw-nueva',
  '.nav-fab',
  '.nav-item',
  '.nav-item-active',
  '.nav-link',
  '.nav-link-dot',
  '.nav-pill',
  '.numeral',
  '.numeral-hero',
  '.numeral-md',
  '.numeral-sup',
  '.pill',
  '.pill-active',
  '.pocket',
  '.pressable',
  '.rainbow-bar',
  '.rise',
  '.scrollbar-none',
  '.segment',
  '.segment-item',
  '.shell-header',
  '.shell-raised',
  '.shell-sidebar',
  '.skeleton',
  '.stack',
  '.stack-item',
  '.tx-row',
  '.wallet-select',
  // State variants that carry colour, measured through the attribute the component
  // actually sets. Hover and :focus-visible are deliberately absent: they have no
  // phone equivalent and are listed as adaptations instead.
  '.segment-item;aria-selected=true',
  '.pill.pill-active',
  '.nav-item.nav-item-active',
  '.deck-face;data-depth=1',
  '.deck-face;data-depth=2',
  // Three Tailwind dark surfaces. They are probed because src/index.css repaints them
  // in light mode (`:1394`), so their colour is a component fact of this app rather
  // than a utility default, and it differs between the two themes.
  '.bg-black',
  '.bg-zinc-900',
  '.bg-zinc-950',
  // Descendant repaints. src/index.css remaps the white-on-dark utility colours
  // inside the two "dark surface" components when the app is in light mode; the
  // `;in=` form measures the child exactly as those rules see it.
  '.text-white;in=.card-dark',
  '.border-white;in=.card-dark',
  '.bg-white;in=.card-dark',
  '.text-white;in=.gradient-card',
  '.bg-white;in=.gradient-card',
];

/** Desktop and phone. clamp()-sized type and the >=1024px rules resolve
 *  differently, and both numbers are needed: the port must match the phone. */
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
];

/* ------------------------------------------------------------ JSX utilities */
/**
 * The theme tokens in index.css are only half the app's colour. The other half is
 * written as Tailwind utilities inside `className` strings in the components, and
 * those values (an `bg-black/60` scrim, a `text-white/70` label, a `border-white/10`
 * hairline) exist nowhere in the CSS source — Tailwind synthesises them at build
 * time. Measuring them needs the class names, so they are read out of the component
 * source and then *proven* to paint: each token is put on a detached element and
 * compared with an unclassed control, and only tokens that visibly change a paint
 * property are reported. A token the app writes but Tailwind never emits therefore
 * cannot silently appear in the spec.
 *
 * Class names built by string concatenation or held in variables are not visible to
 * this scan; §8 of the spec records that limit rather than guessing at it.
 */
const SRC = path.join(__dirname, '..', 'src');
const sourceFiles = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
const COLOUR_UTILITY =
  /^(?:[a-z][a-z0-9-]*:)*(?:bg|text|border|ring|shadow|from|via|to|fill|stroke|accent|outline|divide|decoration)-[A-Za-z0-9\[\]\/]/;
const utilityTokens = () => {
  const found = new Map();
  for (const file of sourceFiles(SRC)) {
    const src = fs.readFileSync(file, 'utf8');
    // Every string literal, not only `className="…"`: components also keep class
    // lists in object fields (`color: 'text-rose-600 bg-rose-50 …'`) and in the
    // literal segments around `${}` inside a template expression. Interpolation
    // fragments are dropped token by token below, and anything that is not a real
    // utility is dropped by the paint control in the page — so over-scanning costs
    // a row in the source map, never a wrong colour in the spec.
    const re = /"([^"\\\n]*)"|'([^'\\\n]*)'|`([^`]*)`/g;
    let m;
    while ((m = re.exec(src))) {
      const raw = m[1] ?? m[2] ?? m[3] ?? '';
      for (let tok of raw.split(/\s+/)) {
        tok = tok.replace(/^['"`]+|['"`]+$/g, '');
        if (!tok || !COLOUR_UTILITY.test(tok) || /[${}()\\]/.test(tok)) continue;
        if (!found.has(tok)) found.set(tok, path.relative(SRC, file).replace(/\\/g, '/'));
      }
    }
  }
  return found;
};
const UTILITY_MAP = utilityTokens();
const UTILITIES = [...UTILITY_MAP.keys()];

const PROBE_PAGE = (selectors, utilities) => {
  const cv = document.createElement('canvas');
  cv.width = 1;
  cv.height = 1;
  const ctx = cv.getContext('2d', { willReadFrequently: true });

  /** Acceptance test only. Chrome leaves fillStyle unchanged for a value it cannot
   *  parse, so a sentinel pre-set is what distinguishes "rejected" from "genuinely
   *  transparent black". The canvas is not the colour measurement — see engineColour. */
  const acceptedByCanvas = (value) => {
    ctx.fillStyle = '#010203';
    ctx.fillStyle = value;
    return ctx.fillStyle !== '#010203';
  };

  const readPixel = () => {
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  };

  const pixel = (value, underlay) => {
    ctx.clearRect(0, 0, 1, 1);
    if (underlay) {
      ctx.fillStyle = underlay;
      ctx.fillRect(0, 0, 1, 1);
    }
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    return readPixel();
  };

  /** Parse Chrome's serialisation of a computed colour into 0..255 channels plus a
   *  float alpha. Out-of-gamut values come back outside 0..255 and are kept as-is. */
  const parseColour = (s) => {
    let m = /^color\(srgb\s+([-0-9.e+]+)\s+([-0-9.e+]+)\s+([-0-9.e+]+)(?:\s*\/\s*([-0-9.e+]+))?\)$/.exec(s);
    if (m)
      return {
        r: Number(m[1]) * 255,
        g: Number(m[2]) * 255,
        b: Number(m[3]) * 255,
        a: m[4] === undefined ? 1 : Number(m[4]),
        as: s,
      };
    m = /^rgba?\(\s*([-0-9.e+]+)[\s,]+([-0-9.e+]+)[\s,]+([-0-9.e+]+)(?:[,\s/]+([-0-9.e+]+))?\)$/.exec(s);
    if (m)
      return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]), as: s };
    return null;
  };

  const clamp8 = (n) => Math.max(0, Math.min(255, Math.round(n)));

  /** Reading a colour from the engine, not from pixels. Mixing a colour with itself
   *  `in srgb` forces Chrome to serialise the computed value in sRGB without changing
   *  it, which is the only way to get its OKLCH/P3 conversion at full precision. Pixels
   *  cannot do this: at alpha 0.05 a premultiplied 8-bit channel carries about one byte
   *  of signal, so un-premultiplying it recovers a number right only to roughly +-20.
   *  Measured on two of this app's own shadow tokens, which are the same colour at two
   *  alphas — and the canvas returned two different colours for them. UI_SPEC.md §1. */
  const host = document.createElement('span');
  host.style.display = 'none';
  document.body.appendChild(host);

  const paint = (value) => {
    // Two independent accept tests. The canvas is the stricter one (it rejects
    // values that are only valid in a property context, hence `canvas:false` rows
    // below); an empty CSSOM assignment is the engine's own "I cannot parse this".
    // A value neither accepts is not a colour, and is left unresolved rather than
    // silently measured against the span's inherited colour.
    const canvasOk = acceptedByCanvas(value);
    host.style.color = '';
    host.style.color = `color-mix(in srgb, ${value} 100%, ${value} 100%)`;
    const styleOk = host.style.color !== '';
    const eng = styleOk ? parseColour(getComputedStyle(host).color) : null;
    host.style.color = '';
    if (!eng) return null;
    const r = clamp8(eng.r);
    const g = clamp8(eng.g);
    const b = clamp8(eng.b);
    const a255 = clamp8(eng.a * 255);
    const hex = (n) => n.toString(16).padStart(2, '0');
    return {
      r,
      g,
      b,
      a255,
      alpha: Number(eng.a.toFixed(6)),
      // Chrome's own conversion, unrounded and unclamped — the value to port from
      // if the framework can take floats. Flutter Color.fromRGBO takes the bytes.
      float: {
        r: Number(eng.r.toFixed(4)),
        g: Number(eng.g.toFixed(4)),
        b: Number(eng.b.toFixed(4)),
        a: Number(eng.a.toFixed(6)),
      },
      engineSerialised: eng.as,
      // Out-of-gamut in sRGB: the author colour does not fit and Chrome clamps it.
      outOfGamut: eng.r < 0 || eng.r > 255 || eng.g < 0 || eng.g > 255 || eng.b < 0 || eng.b > 255,
      canvasAccepted: canvasOk,
      hex: `#${hex(r)}${hex(g)}${hex(b)}`,
      rgba: `rgba(${r}, ${g}, ${b}, ${Number(eng.a.toFixed(4))})`,
      // Pixels are kept only to show the size of the error they introduce.
      canvasBytes: canvasOk ? pixel(value, null) : null,
      overWhite: canvasOk ? pixel(value, '#ffffff') : null,
      overBlack: canvasOk ? pixel(value, '#000000') : null,
    };
  };

  const resolve = (value) => paint(value);

  const isColourish = (v) =>
    /^(oklch|oklab|lab|lch|color\(|rgb|hsl|#[0-9a-f]{3,8}|currentcolor|transparent|white|black|red|blue|green)/i.test(
      String(v).trim(),
    ) || /color-mix\(/i.test(String(v));

  /** Gradient and shadow tokens are not a single colour, so a canvas cannot read
   *  them whole. Find each colour function (balanced parens, outermost first) and
   *  resolve it on its own, which yields the exact stop list the Dart
   *  LinearGradient / BoxShadow must be built from. */
  const colourFns = (str) => {
    const out = [];
    const re = /(oklch|oklab|lab|lch|color-mix|rgb|rgba|hsl|hsla|color)\(/g;
    let m;
    let consumedTo = -1;
    while ((m = re.exec(str))) {
      if (m.index < consumedTo) continue; // an inner function of one already taken
      const start = m.index;
      let depth = 0;
      let i = start;
      for (; i < str.length; i++) {
        if (str[i] === '(') depth++;
        else if (str[i] === ')') {
          depth--;
          if (depth === 0) break;
        }
      }
      const text = str.slice(start, i + 1);
      out.push({ index: start, text });
      consumedTo = i + 1;
    }
    return out;
  };

  /** Keywords that name no fixed colour and therefore must not be measured here:
   *  `currentColor` would resolve against the canvas element (always black), not
   *  against the element the token is used on, and `inherit` is not a colour at all.
   *  They are left verbatim so the spec records them honestly instead of falsely. */
  const NO_SUBSTITUTE = /\b(currentcolor|inherit)\b/i;

  const resolveInside = (str) => {
    const fns = colourFns(str);
    const covered = (i) => fns.some((f) => i >= f.index && i < f.index + f.text.length);
    // Bare keywords are not functions, but leaving them raw would make the
    // substituted string unparseable for a port that has no CSS engine.
    const kwRe = /\b(transparent|currentColor|inherit|black|white)\b/gi;
    const all = [...fns];
    let k;
    while ((k = kwRe.exec(str))) {
      if (covered(k.index) || NO_SUBSTITUTE.test(k[0])) continue;
      all.push({ index: k.index, text: k[0] });
    }
    all.sort((a, b) => a.index - b.index);
    if (all.length === 0) return null;
    let out = '';
    let cursor = 0;
    const stops = [];
    for (const f of all) {
      if (f.index < cursor) continue; // overlapped a previous span
      out += str.slice(cursor, f.index);
      const r = resolve(f.text);
      out += r ? r.rgba : f.text;
      stops.push({ from: f.text, to: r ? r.rgba : null });
      cursor = f.index + f.text.length;
    }
    out += str.slice(cursor);
    return { substituted: out, stops };
  };

  const customProps = (el) => {
    const cs = getComputedStyle(el);
    const names = [];
    for (const p of cs) if (p.startsWith('--')) names.push(p);
    const out = {};
    for (const name of names) {
      const raw = cs.getPropertyValue(name).trim();
      if (!raw) continue;
      // A value is colour-bearing either as one colour (isColourish) or as a
      // list that contains colour functions, e.g. `linear-gradient(135deg, oklch(..) 0%, ..)`
      // or `0 2px 6px oklch(.. / .07), 0 22px 52px oklch(.. / .16)`. The latter
      // starts with a length or a function name, so the leading-edge test above
      // cannot see it and colourFns must be consulted directly.
      const single = isColourish(raw);
      if (!single && colourFns(raw).length === 0) {
        out[name] = { raw };
        continue;
      }
      if (single) {
        const one = resolve(raw);
        if (one) {
          out[name] = { raw, srgb: one };
          continue;
        }
      }
      const many = resolveInside(raw);
      out[name] = many ? { raw, substituted: many.substituted, stops: many.stops } : { raw, unresolved: true };
    }
    return out;
  };

  const styleOf = (el) => {
    const cs = getComputedStyle(el);
    const pick = (prop) => {
      const raw = cs[prop];
      if (!raw || raw === 'none') return { raw };
      // box-shadow and backdrop-filter are lists of colours plus functions;
      // resolve only when the whole value is a single colour.
      if (
        /^(rgb|rgba|hsl|hsla|oklch|oklab|color\(|#|currentcolor|transparent|white|black)/i.test(raw.trim()) ||
        /color-mix\(/.test(raw)
      ) {
        return { raw, srgb: resolve(raw) };
      }
      return { raw };
    };
    // Values that are lists or gradients: substitute every colour inside.
    const compound = (prop) => {
      const raw = cs[prop];
      if (!raw || raw === 'none') return { raw };
      const many = resolveInside(raw);
      return many ? { raw, substituted: many.substituted, stops: many.stops } : { raw };
    };
    return {
      display: cs.display,
      position: cs.position,
      color: pick('color'),
      backgroundColor: pick('backgroundColor'),
      borderTopColor: pick('borderTopColor'),
      borderLeftColor: pick('borderLeftColor'),
      borderTopWidth: cs.borderTopWidth,
      boxShadow: compound('boxShadow'),
      backdropFilter: compound('backdropFilter'),
      backgroundImage: compound('backgroundImage'),
      borderRadius: cs.borderRadius,
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      letterSpacing: cs.letterSpacing,
      lineHeight: cs.lineHeight,
      padding: cs.padding,
      opacity: cs.opacity,
    };
  };

  const probes = {};
  const badSelectors = [];
  for (const sel of selectors) {
    // A detached element still inherits from body once appended, and the theme
    // class lives on html/body, so the cascade and the .dark rules both apply.
    // The probe list is a small DSL, because these are class names, not selectors:
    //   ".a.b"                 a.b gets put on the element as `class="a b"`
    //   ".a;attr=value"        setAttribute(attr, value), to reach a real state rule
    //   ".a;in=.b .c"          the element is wrapped in a div carrying those classes,
    //                          which is how a descendant rule ("`.light .card-dark
    //                          [class*='bg-white']`") is measured instead of inferred
    const parts = sel.split(';');
    if (parts.length > 3) {
      badSelectors.push(sel);
      continue;
    }
    const el = document.createElement('div');
    el.className = parts[0].split('.').filter(Boolean).join(' ');
    el.textContent = 'probe';
    let wrap = null;
    let malformed = false;
    for (const p of parts.slice(1)) {
      const eq = p.indexOf('=');
      if (eq < 0) {
        malformed = true;
        break;
      }
      const k = p.slice(0, eq);
      const v = p.slice(eq + 1);
      if (k === 'in') {
        wrap = document.createElement('div');
        wrap.className = v.split('.').filter(Boolean).join(' ');
        wrap.appendChild(el);
      } else el.setAttribute(k, v);
    }
    if (malformed) {
      badSelectors.push(sel);
      continue;
    }
    if (wrap) document.body.appendChild(wrap);
    else document.body.appendChild(el);
    probes[sel] = styleOf(el);
    el.remove();
    if (wrap) wrap.remove();
  }

  // Tailwind utilities read out of the component source. The control is the same
  // detached div with no class at all, so a token is only reported when its rule
  // really exists and really changes one of the five paint properties.
  const PAINT = ['color', 'backgroundColor', 'borderTopColor', 'backgroundImage', 'boxShadow'];
  const shown = (v) => (v && v.srgb ? v.srgb.rgba : v ? v.substituted || v.raw : '');
  const control = (() => {
    const el = document.createElement('div');
    el.textContent = 'probe';
    document.body.appendChild(el);
    const s = styleOf(el);
    el.remove();
    return s;
  })();
  const utilitiesPainted = {};
  const utilitiesSilent = [];
  for (const tok of utilities) {
    const el = document.createElement('div');
    el.className = tok;
    el.textContent = 'probe';
    document.body.appendChild(el);
    const s = styleOf(el);
    el.remove();
    const changed = PAINT.filter((k) => shown(s[k]) !== shown(control[k]));
    if (changed.length === 0) {
      utilitiesSilent.push(tok);
      continue;
    }
    const rec = {};
    for (const k of changed) rec[k] = s[k];
    utilitiesPainted[tok] = rec;
  }

  return {
    root: customProps(document.documentElement),
    body: customProps(document.body),
    probes,
    utilities: utilitiesPainted,
    utilitiesSilent,
    controlPaint: { color: shown(control.color), backgroundColor: shown(control.backgroundColor) },
    badSelectors,
    appliedClass: document.documentElement.className,
    innerWidth: window.innerWidth,
    mediaDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
    floatingNavDisplay: (() => {
      const n = document.querySelector('.floating-nav');
      return n ? getComputedStyle(n).display : 'absent';
    })(),
  };
};

async function main() {
  const browser = await chromium.launch();
  const result = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    note:
      'r/g/b/a255 are Chrome’s own sRGB conversion of the value, taken from the computed style and ' +
      'serialised through color-mix(in srgb) — engineSerialised holds the unrounded original. float is ' +
      'that value before 8-bit rounding. canvasBytes/overWhite/overBlack are pixel readings, kept only ' +
      'to measure how far an 8-bit canvas drifts from the engine; they are not the reported colour. ' +
      'hex is the colour alone and ignores alpha.',
    themes: {},
    utilities: {
      note:
        'Colour-bearing Tailwind utilities found in className strings under src/. Each is measured on a ' +
        'detached element against an unclassed control, so a token appears only if its generated rule ' +
        'really paints. "silent" lists the tokens that were found in source but changed nothing in that ' +
        'theme — mostly dark:-variants evaluated in light mode and vice versa.',
      writtenIn: Object.fromEntries(UTILITY_MAP),
      scanned: UTILITIES.length,
    },
  };

  for (const theme of ['light', 'dark']) {
    // Two viewports, because the stylesheet sizes the hero numerals with clamp()
    // and hides .floating-nav above 1024px. A phone spec must record the values a
    // phone actually resolves, not the desktop ones.
    for (const vp of VIEWPORTS) {
      const key = `${theme}-${vp.name}`;
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
      await ctx.addInitScript(
        ([t]) => {
          localStorage.setItem('em-budget-theme', t);
          localStorage.setItem('theme', t);
        },
        [theme],
      );
      const page = await ctx.newPage();
      const problems = [];
      page.on('pageerror', (e) => problems.push(String(e.message)));
      await page.goto(BASE + '/', { waitUntil: 'load' });
      await page.waitForSelector(theme === 'dark' ? 'html.dark' : 'html.light', { timeout: 45000 });

      // All measurement lives inside PROBE_PAGE; only the selector and utility lists
      // are interpolated, as JSON, so no page-source text is hand-escaped here.
      const data = await page.evaluate(
        `(${PROBE_PAGE.toString()})(${JSON.stringify(PROBE_SELECTORS)},${JSON.stringify(UTILITIES)})`,
      );
      if (data.badSelectors.length > 0) throw new Error(`unparseable probe selectors: ${data.badSelectors.join(', ')}`);
      data.media = { width: data.innerWidth, floatingNavDisplay: data.floatingNavDisplay };

      result.themes[key] = { ...data, viewport: vp, problems, media: { ...data.media, mediaDark: data.mediaDark } };
      console.log(
        `${key}: ${Object.keys(data.root).length} root props, ${Object.keys(data.probes).length} probes, ` +
          `${Object.keys(data.utilities).length}/${UTILITIES.length} JSX utilities paint, ` +
          `${problems.length} page errors, floating-nav=${data.media.floatingNavDisplay} @ ${vp.width}px`,
      );
      await ctx.close();
    }
  }

  // Tailwind v4 resolves the `dark:` variant from `prefers-color-scheme` unless the
  // stylesheet rebinds it with `@custom-variant dark`, and src/index.css does not.
  // The app's own toggle only writes html.dark / body.dark, so those two mechanisms
  // are independent, and which one a token answers to is a fact the port has to
  // copy — measure all four combinations rather than reason about them.
  const darkTokens = UTILITIES.filter((t) => t.includes('dark:'));
  const matrix = [];
  for (const appTheme of ['light', 'dark']) {
    for (const osScheme of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: osScheme });
      await ctx.addInitScript(
        ([t]) => {
          localStorage.setItem('em-budget-theme', t);
          localStorage.setItem('theme', t);
        },
        [appTheme],
      );
      const page = await ctx.newPage();
      await page.goto(BASE + '/', { waitUntil: 'load' });
      await page.waitForSelector(appTheme === 'dark' ? 'html.dark' : 'html.light', { timeout: 45000 });
      const data = await page.evaluate(
        `(${PROBE_PAGE.toString()})(${JSON.stringify([])},${JSON.stringify(darkTokens)})`,
      );
      matrix.push({
        appTheme,
        osScheme,
        rootClass: data.appliedClass,
        mediaDark: data.mediaDark,
        painted: Object.keys(data.utilities).sort(),
        silent: data.utilitiesSilent.sort(),
        utilities: data.utilities,
      });
      await ctx.close();
    }
  }
  result.darkVariantMatrix = {
    note:
      'Same tokens, four combinations of the app theme (html.light/html.dark, set by the in-app toggle) and ' +
      'the browser preference (prefers-color-scheme, set by the OS). A token listed under "painted" changes ' +
      'appearance for that combination. "silent" means the rule did not apply. The app toggle and the OS ' +
      'preference are separate mechanisms here; see the spec section that reads this table.',
    tokens: darkTokens.sort(),
    combos: matrix,
  };
  console.log(
    `\ndark: variants — ${darkTokens.length} tokens; painted with app=light/os=light: ` +
      `${matrix[0].painted.length}, app=light/os=dark: ${matrix[1].painted.length}, ` +
      `app=dark/os=light: ${matrix[2].painted.length}, app=dark/os=dark: ${matrix[3].painted.length}`,
  );

  await browser.close();

  // Three audits over everything measured, computed here in Node from the raw
  // records rather than asserted in the page.
  //   1. every colour the probe claims to have measured must carry an engine
  //      serialisation that parses and bytes that equal that serialisation after
  //      clamping — i.e. the doc's numbers are the engine's, not a second rounding;
  //   2. pixel-vs-engine deviation, bucketed by alpha, which quantifies exactly how
  //      badly an 8-bit canvas represents a translucent colour;
  //   3. no substituted compound value may still contain a colour function, and no
  //      colour function may survive in anything reported as resolved.
  const byteDrifts = [];
  const deviations = [];
  const clamp8 = (n) => Math.max(0, Math.min(255, Math.round(n)));
  const checkOne = (label, s) => {
    if (!s || typeof s.a255 !== 'number') return;
    const drift =
      clamp8(s.float.r) !== s.r ||
      clamp8(s.float.g) !== s.g ||
      clamp8(s.float.b) !== s.b ||
      clamp8(s.float.a * 255) !== s.a255;
    if (drift) byteDrifts.push(`${label}: bytes ${s.r},${s.g},${s.b},${s.a255} do not equal the clamped engine float`);
    if (!s.canvasBytes) return;
    deviations.push({
      label,
      alpha: s.alpha,
      dev: Math.max(
        Math.abs(s.canvasBytes[0] - s.r),
        Math.abs(s.canvasBytes[1] - s.g),
        Math.abs(s.canvasBytes[2] - s.b),
      ),
      canvas: s.canvasBytes.slice(0, 3),
      engine: [s.r, s.g, s.b],
      outOfGamut: !!s.outOfGamut,
    });
  };
  const leftovers = [];
  const styleHolders = [
    ...Object.entries(result.themes),
    ...result.darkVariantMatrix.combos.map((c, i) => [
      `dark-variant #${i + 1} app=${c.appTheme}/os=${c.osScheme}`,
      { root: {}, body: {}, probes: {}, utilities: c.utilities },
    ]),
  ];
  const styleRecords = (t) => [
    ...Object.entries(t.probes).map(([sel, p]) => ['probe', sel, p]),
    ...Object.entries(t.utilities).map(([tok, p]) => ['utility', tok, p]),
  ];
  for (const [theme, t] of styleHolders) {
    for (const [name, v] of Object.entries({ ...t.root, ...t.body })) {
      if (v.srgb) checkOne(`${theme} ${name}`, v.srgb);
      if (v.substituted && /oklch\(|oklab\(|color-mix\(|color\(srgb|lab\(|lch\(/.test(v.substituted))
        leftovers.push(`${theme} ${name}: colour function left in substituted value: ${v.substituted}`);
    }
    for (const [kind, sel, p] of styleRecords(t)) {
      for (const key of ['color', 'backgroundColor', 'borderTopColor', 'borderLeftColor'])
        if (p[key] && p[key].srgb) checkOne(`${theme} ${kind} ${sel} . ${key}`, p[key].srgb);
      for (const key of ['boxShadow', 'backdropFilter', 'backgroundImage']) {
        const v = p[key];
        if (v && v.substituted && /oklch\(|color-mix\(/.test(v.substituted))
          leftovers.push(`${theme} ${kind} ${sel} . ${key}: ${v.substituted}`);
      }
    }
  }
  const buckets = {};
  for (const d of deviations) {
    const k =
      d.alpha >= 1
        ? 'opaque'
        : d.alpha >= 0.5
          ? '0.5-1'
          : d.alpha >= 0.2
            ? '0.2-0.5'
            : d.alpha >= 0.1
              ? '0.1-0.2'
              : 'under 0.1';
    buckets[k] = Math.max(buckets[k] || 0, d.dev);
  }
  result.pixelVsEngine = {
    note:
      'Largest difference, in 8-bit channel units, between the colour the canvas reported and the colour the ' +
      'CSS engine reported for the same value. Opaque colours agree; translucent ones cannot, because a ' +
      'premultiplied 8-bit channel carries roughly one byte of signal once alpha is small. This is why the ' +
      'spec uses the engine reading.',
    maxDeviationByAlphaBucket: buckets,
    worstFive: [...deviations].sort((a, b) => b.dev - a.dev).slice(0, 5),
    byteDrifts,
    leftovers,
  };

  const unresolved = [];
  const colourRe = /oklch|oklab|color-mix|color\(/i;
  for (const [theme, t] of styleHolders) {
    for (const [name, v] of Object.entries({ ...t.root, ...t.body })) {
      if (!colourRe.test(v.raw)) continue;
      if (v.srgb !== undefined) continue;
      if (v.substituted !== undefined && v.stops.every((s) => s.to !== null)) continue;
      unresolved.push(`${theme} ${name} = ${v.raw}`);
    }
    for (const [kind, sel, p] of styleRecords(t)) {
      for (const key of ['boxShadow', 'backdropFilter', 'backgroundImage']) {
        const v = p[key];
        if (!v || !colourRe.test(String(v.raw ?? ''))) continue;
        if (v.stops && v.stops.every((s) => s.to !== null)) continue;
        unresolved.push(`${theme} ${kind} ${sel} . ${key} = ${v.raw}`);
      }
      // A single colour that carries a colour function but produced no engine
      // reading is an unresolved value too, and utilities are full of these.
      for (const key of ['color', 'backgroundColor', 'borderTopColor', 'borderLeftColor']) {
        const v = p[key];
        if (!v || v.srgb === undefined || !colourRe.test(String(v.raw ?? ''))) continue;
        if (v.srgb === null) unresolved.push(`${theme} ${kind} ${sel} . ${key} = ${v.raw}`);
      }
    }
  }
  result.unresolvedColourTokens = unresolved;

  fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n', 'utf8');
  console.log(`\nwrote ${path.relative(process.cwd(), OUT)}`);
  console.log(`colour tokens not resolved: ${unresolved.length}`);
  for (const u of unresolved.slice(0, 20)) console.log('  - ' + u);
  console.log(`colour functions left inside substituted values: ${leftovers.length}`);
  for (const u of leftovers.slice(0, 10)) console.log('  - ' + u);
  console.log(`bytes disagreeing with the engine float: ${byteDrifts.length}`);
  for (const u of byteDrifts.slice(0, 10)) console.log('  - ' + u);
  console.log(`pixel-vs-engine max deviation by alpha bucket: ${JSON.stringify(buckets)}`);
  console.log(`out-of-gamut colours: ${deviations.filter((d) => d.outOfGamut).length}`);
}

main().catch((e) => {
  console.error('UI TOKEN PROBE FAIL:', e.message);
  process.exit(1);
});
