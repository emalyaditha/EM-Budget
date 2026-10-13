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
 * Requires the app's pages served on BASE. The API server is not measured and is
 * not needed: `npx vite --port 3000 --strictPort` is enough, and the theme the
 * probe waits for (`html.light` / `html.dark`) is set client-side from
 * localStorage, so a page with no backend still applies it. Writes
 * parity/ui-tokens.json.
 *
 * Usage:
 *   node parity/ui-tokens.cjs                  the whole record
 *   node parity/ui-tokens.cjs --stacks-only    the stack tier only, merged into
 *                                              the record that is already there
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const BASE = process.env.QA_BASE || 'http://localhost:3000';
const OUT = path.join(__dirname, 'ui-tokens.json');
/**
 * `--stacks-only` measures the utility-stack tier and merges it into the record
 * that is already there, touching nothing else. It exists because the pinned
 * sections of this file — `themes.<pass>.root`, `body`, `probes`, `utilities`,
 * the dark matrix — were captured on 2026-10-06 against the app's own server,
 * and a ruling keeps them there until it says otherwise. A full re-run on this
 * machine is not equivalent: Tailwind v4 emits theme variables per module it has
 * scanned, so the dev server's `:root` carries `--breakpoint-sm`, `--shadow-lg`,
 * `--shadow-2xl` and the two `--color-zinc-*` steps the 2026-10-06 capture never
 * had, and it drops `--tw-scroll-snap-strictness`. That is not drift in the
 * stylesheet; it is a different set of modules loaded in the page. Adding a
 * family to the stack tier therefore re-measures the stack tier, and the merge
 * refuses to write if anything else in the record moved.
 */
const ONLY_STACKS = process.argv.includes('--stacks-only');

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

/* --------------------------------------------------------- utility stacks */
/**
 * The #55 ruling's second evidence tier. A surface like the toast has no class
 * in `src/index.css` for the §6 probe to measure — its whole look is a stack of
 * Tailwind utilities written inside one `className` string (plus the fragments
 * a template literal splices in per state). The stack is therefore measured the
 * way the browser sees it: each row's complete authored class list goes on one
 * detached element, exactly as the `utilities` tier does for single tokens, and
 * its computed style is read against an unclassed control in all four passes.
 *
 * `parts` are verbatim slices of the pinned component source, each with its line
 * — the drift test re-reads those lines and fails if the stack was retyped, so
 * the measurement below is bound to the markup that produces it.
 *
 * `authoredNonCss` records what no CSS probe can see: timers and motion values
 * live in JS object literals. They are stored as verbatim source slices and
 * marked authored, never as measurements.
 */
const STACK_SOURCE = 'src/context/NotificationContext.tsx';
const TOAST_BOX = {
  cls: 'p-4 rounded-xl shadow-lg border flex items-center gap-3 backdrop-blur-sm w-full max-w-[300px]',
  line: 83,
};
const UTILITY_STACKS = [
  {
    name: 'toast-container',
    parts: [
      {
        cls: 'fixed top-4 left-4 right-4 md:left-auto md:right-4 z-[9999] flex flex-col gap-2 items-center md:items-end',
        line: 73,
      },
    ],
  },
  {
    name: 'toast-success',
    parts: [
      TOAST_BOX,
      { cls: 'bg-[var(--surface)] border-emerald-500/30 text-emerald-700 dark:text-emerald-100', line: 86 },
    ],
  },
  {
    name: 'toast-error',
    parts: [TOAST_BOX, { cls: 'bg-[var(--surface)] border-[var(--danger)]/30 text-[var(--danger)]', line: 88 }],
  },
  {
    name: 'toast-warning',
    parts: [TOAST_BOX, { cls: 'bg-[var(--surface)] border-amber-500/30 text-amber-700 dark:text-amber-100', line: 90 }],
  },
  {
    name: 'toast-info',
    parts: [TOAST_BOX, { cls: 'bg-[var(--surface)] border-[var(--line)] text-[var(--ink)]', line: 91 }],
  },
  { name: 'toast-message', parts: [{ cls: 'text-sm font-medium', line: 98 }] },
  { name: 'toast-close', parts: [{ cls: 'ml-auto text-[var(--ink-2)] hover:text-[var(--ink)]', line: 100 }] },
  { name: 'toast-icon-success', parts: [{ cls: 'text-emerald-500', line: 94 }] },
  { name: 'toast-icon-error', parts: [{ cls: 'text-[var(--danger)]', line: 95 }] },
  { name: 'toast-icon-warning', parts: [{ cls: 'text-amber-500', line: 96 }] },
  { name: 'toast-icon-info', parts: [{ cls: 'text-[var(--ink-2)]', line: 97 }] },
  {
    name: 'confirm-overlay',
    parts: [
      {
        cls: 'fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm',
        line: 116,
      },
    ],
  },
  { name: 'confirm-panel', parts: [{ cls: 'card p-6 max-w-sm w-full', line: 125 }] },
  { name: 'confirm-title', parts: [{ cls: 'text-[var(--ink)] font-bold mb-2', line: 127 }] },
  { name: 'confirm-rule', parts: [{ cls: 'ledger-rule mb-4', line: 128 }] },
  { name: 'confirm-message', parts: [{ cls: 'text-[var(--ink-2)] text-sm mb-6', line: 129 }] },
  { name: 'confirm-actions', parts: [{ cls: 'flex gap-3', line: 130 }] },
  { name: 'confirm-cancel', parts: [{ cls: 'btn-ghost flex-1', line: 136 }] },
  { name: 'confirm-confirm', parts: [{ cls: 'btn-primary flex-1', line: 145 }] },
];

/**
 * #56 extends the tier to the modal/sheet shells. These rows carry their own
 * `src` because the family spans six files; the drift tests read
 * `row.src ?? STACK_SOURCE`, so the #55 rows keep citing the top-level source
 * untouched. The panel of the Modal primitive is a template literal —
 * `relative w-full ${maxWidths[maxWidth]} card …` — so it is recorded as the
 * verbatim slices around the interpolation plus the resolved default width
 * `max-w-md`, cited to the entry in the `maxWidths` map that authors it.
 */
const MODAL_STACKS = [
  {
    name: 'modal-shell',
    src: 'src/components/ui/Modal.tsx',
    parts: [
      {
        cls: 'fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto',
        line: 49,
      },
    ],
  },
  {
    name: 'modal-veil',
    src: 'src/components/ui/Modal.tsx',
    parts: [{ cls: 'fixed inset-0 bg-[var(--ink)]/40 backdrop-blur-[2px]', line: 56 }],
  },
  {
    name: 'modal-panel',
    src: 'src/components/ui/Modal.tsx',
    note: 'the interpolated ${maxWidths[maxWidth]} resolves to the prop default md',
    parts: [
      { cls: 'relative w-full', line: 68 },
      { cls: 'max-w-md', line: 41 },
      { cls: 'card p-0 overflow-hidden z-10 my-8', line: 68 },
    ],
  },
  {
    name: 'modal-header',
    src: 'src/components/ui/Modal.tsx',
    parts: [
      {
        cls: 'flex items-center justify-between px-5 h-12 border-b border-[var(--line)] bg-[var(--surface)]',
        line: 71,
      },
    ],
  },
  {
    name: 'modal-title',
    src: 'src/components/ui/Modal.tsx',
    parts: [{ cls: 'text-[13px] font-bold tracking-tight text-[var(--ink)]', line: 74 }],
  },
  {
    name: 'modal-close',
    src: 'src/components/ui/Modal.tsx',
    parts: [
      {
        cls: 'w-7 h-7 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink)] flex items-center justify-center',
        line: 84,
      },
    ],
  },
  {
    name: 'modal-body',
    src: 'src/components/ui/Modal.tsx',
    parts: [{ cls: 'p-5 sm:p-6 max-h-[80vh] overflow-y-auto', line: 92 }],
  },
  {
    name: 'sheet-shell',
    src: 'src/components/ui/BottomSheet.tsx',
    parts: [{ cls: 'fixed inset-0 z-50 flex items-end sm:items-center justify-center', line: 23 }],
  },
  {
    name: 'sheet-veil',
    src: 'src/components/ui/BottomSheet.tsx',
    parts: [{ cls: 'fixed inset-0 bg-[var(--ink)]/40 backdrop-blur-[2px]', line: 30 }],
  },
  {
    name: 'sheet-panel',
    src: 'src/components/ui/BottomSheet.tsx',
    parts: [
      {
        cls: 'relative w-full max-w-lg bg-[var(--surface)] border-t sm:border border-[var(--line)] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden z-10 max-h-[85vh] flex flex-col',
        line: 40,
      },
    ],
  },
  {
    name: 'sheet-grip',
    src: 'src/components/ui/BottomSheet.tsx',
    parts: [
      {
        cls: 'w-10 h-1 bg-[var(--line-strong)] rounded-full mx-auto my-3 shrink-0 sm:hidden',
        line: 42,
      },
    ],
  },
  {
    name: 'sheet-header',
    src: 'src/components/ui/BottomSheet.tsx',
    parts: [{ cls: 'flex items-center justify-between px-5 h-12 border-b border-[var(--line)] shrink-0', line: 44 }],
  },
  {
    name: 'sheet-title',
    src: 'src/components/ui/BottomSheet.tsx',
    parts: [{ cls: 'text-[13px] font-bold tracking-tight text-[var(--ink)]', line: 47 }],
  },
  {
    name: 'sheet-close',
    src: 'src/components/ui/BottomSheet.tsx',
    parts: [
      {
        cls: 'w-7 h-7 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink)] flex items-center justify-center',
        line: 56,
      },
    ],
  },
  {
    name: 'sheet-body',
    src: 'src/components/ui/BottomSheet.tsx',
    parts: [{ cls: 'p-5 sm:p-6 overflow-y-auto flex-1', line: 63 }],
  },
  {
    name: 'qa-shell',
    src: 'src/components/dashboard/QuickActionModal.tsx',
    parts: [{ cls: 'fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4', line: 102 }],
  },
  {
    name: 'qa-veil',
    src: 'src/components/dashboard/QuickActionModal.tsx',
    parts: [{ cls: 'fixed inset-0 bg-black/60 backdrop-blur-sm', line: 108 }],
  },
  {
    name: 'qa-panel',
    src: 'src/components/dashboard/QuickActionModal.tsx',
    parts: [
      {
        cls: 'relative w-full md:max-w-md bg-[var(--surface)] border-t md:border border-[var(--line)] rounded-t-[24px] md:rounded-[16px] p-6 text-left z-10 flex flex-col max-h-[90vh] overflow-y-auto shadow-[var(--shadow-float)]',
        line: 121,
      },
    ],
  },
  {
    name: 'qa-header',
    src: 'src/components/dashboard/QuickActionModal.tsx',
    parts: [{ cls: 'flex justify-between items-center pb-4 border-b border-[var(--line)]', line: 123 }],
  },
  {
    name: 'qa-title',
    src: 'src/components/dashboard/QuickActionModal.tsx',
    parts: [{ cls: 'text-sm font-semibold tracking-tight text-[var(--ink)]', line: 125 }],
  },
  {
    name: 'qa-close',
    src: 'src/components/dashboard/QuickActionModal.tsx',
    parts: [
      {
        cls: 'w-8 h-8 rounded-full border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-2)] hover:text-[var(--ink)] hover:border-[var(--line-strong)] transition-colors flex items-center justify-center',
        line: 130,
      },
    ],
  },
  {
    name: 'debt-veil',
    src: 'src/components/DebtDetailModal.tsx',
    parts: [
      {
        cls: 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[6px]',
        line: 124,
      },
    ],
  },
  {
    name: 'debt-panel',
    src: 'src/components/DebtDetailModal.tsx',
    parts: [{ cls: 'card max-w-[560px] w-full max-h-[92vh] overflow-hidden flex flex-col relative', line: 129 }],
  },
  {
    name: 'debt-header',
    src: 'src/components/DebtDetailModal.tsx',
    parts: [{ cls: 'flex items-start justify-between gap-4 px-6 pt-5 pb-4 shrink-0', line: 137 }],
  },
  {
    name: 'debt-title',
    src: 'src/components/DebtDetailModal.tsx',
    parts: [{ cls: 'text-[18px] font-bold tracking-tight mt-1 truncate', line: 142 }],
  },
  {
    name: 'tem-shell',
    src: 'src/components/TransactionEditModal.tsx',
    parts: [{ cls: 'fixed inset-0 z-[200] flex items-end md:items-center justify-center p-0 md:p-4', line: 146 }],
  },
  {
    name: 'tem-veil',
    src: 'src/components/TransactionEditModal.tsx',
    parts: [{ cls: 'fixed inset-0 bg-black/60 backdrop-blur-sm', line: 153 }],
  },
  {
    name: 'tem-panel',
    src: 'src/components/TransactionEditModal.tsx',
    parts: [
      {
        cls: 'relative z-10 w-full md:max-w-sm max-h-[92dvh] overflow-y-auto bg-[var(--surface)] border-t md:border border-[var(--line)] rounded-t-[var(--r-lg)] md:rounded-[var(--r-lg)] p-6 md:p-8 shadow-[var(--shadow-float)]',
        line: 159,
      },
    ],
  },
  {
    name: 'tem-grip',
    src: 'src/components/TransactionEditModal.tsx',
    parts: [{ cls: 'w-10 h-1 bg-[var(--line-strong)] rounded-full mx-auto mb-4 md:hidden', line: 162 }],
  },
  {
    name: 'settings-veil',
    src: 'src/components/SettingsModal.tsx',
    parts: [{ cls: 'fixed inset-0 z-40 bg-[var(--ink)]/40 backdrop-blur-[2px]', line: 508 }],
  },
  {
    name: 'settings-drawer',
    src: 'src/components/SettingsModal.tsx',
    parts: [
      {
        cls: 'fixed top-0 right-0 bottom-0 w-full max-w-[600px] bg-[var(--surface)] border-l border-[var(--line)] z-50 flex flex-col shadow-2xl',
        line: 518,
      },
    ],
  },
  {
    name: 'settings-header',
    src: 'src/components/SettingsModal.tsx',
    parts: [
      {
        cls: 'px-6 h-14 flex items-center justify-between border-b border-[var(--line)] bg-[var(--surface)]/80 backdrop-blur shrink-0',
        line: 524,
      },
    ],
  },
];
/**
 * Item 8 — the ledger family: the transaction row, its three cells, the day
 * header that groups them, the rule that divides them, the scroll box that
 * holds them and the two empty states that replace them. Same tier as #55/#56:
 * every row is a verbatim slice of the pinned component source, measured on one
 * detached element against the unclassed control in all four passes.
 *
 * Two things this tier had to grow to measure the family honestly, both
 * additive — no row that was here before changes:
 *
 *   * a `style` part. `TransactionRow` and `CategoryChip` put colour on the
 *     element as an inline style, not as a class, and a `color-mix(in oklab, …)`
 *     written there is exactly as unportable to Flutter as one written in CSS.
 *     The inline style therefore goes on the probe element verbatim and the
 *     engine reads it, so no one hand-runs an oklab mix to find out what pink
 *     looks like on a mint surface.
 *   * a `tag` and a `wrap`. The row is a `<button>`, not a `<div>`, so its UA
 *     padding, border and text-align are part of what the class has to beat;
 *     and a `divide-y` rule only paints on an element that has a preceding
 *     sibling inside a dividing parent, so that parent is built for the probe.
 *
 * The chip's tone tables are read out of `CategoryChip.tsx` rather than retyped
 * here, for the same reason the colours are measured rather than converted: a
 * second copy of a table is a second implementation, and it drifts silently.
 */
const CHIP_SRC = 'src/components/ui/CategoryChip.tsx';
const TXROW_SRC = 'src/components/ui/TransactionRow.tsx';
const DASH_SRC = 'src/components/Dashboard.tsx';
const REPORTS_SRC = 'src/components/ReportsCentre.tsx';

const srcLines = (rel) =>
  fs
    .readFileSync(path.join(__dirname, '..', rel), 'utf8')
    .split(/\r?\n/)
    .map((text, i) => ({ n: i + 1, text }));

/** One `key: 'var(--x)',` block inside a `const NAME: Record<…> = { … }`. */
const varTable = (lines, name) => {
  const start = lines.findIndex((l) => new RegExp(`^const ${name}: `).test(l.text));
  if (start < 0) throw new Error(`${CHIP_SRC}: no \`const ${name}\` table`);
  const end = lines.findIndex((l, i) => i > start && /^\};/.test(l.text));
  const out = {};
  for (const l of lines.slice(start + 1, end)) {
    const m = /^(\w+): '(var\(--[a-z0-9-]+\))',$/.exec(l.text.trim());
    if (!m) throw new Error(`${CHIP_SRC}:${l.n}: inside \`${name}\`, unexpected line "${l.text}"`);
    if (out[m[1]]) throw new Error(`${CHIP_SRC}:${l.n}: tone ${m[1]} declared twice`);
    out[m[1]] = { cssVar: m[2], line: l.n };
  }
  if (Object.keys(out).length === 0) throw new Error(`${CHIP_SRC}: \`${name}\` is empty`);
  return out;
};

/** `const dims = size === 'xs' ? 22 : …` — the size table, keyed by size name. */
const sizeTernary = (lines, name) => {
  const hit = lines.find((l) => new RegExp(`^  const ${name} = size === 'xs'`).test(l.text));
  if (!hit) throw new Error(`${CHIP_SRC}: no \`const ${name} = size === 'xs' …\` line`);
  const m = new RegExp(
    `^  const ${name} = size === 'xs' \\? (\\d+) : size === 'sm' \\? (\\d+) : size === 'lg' \\? (\\d+) : (\\d+);$`,
  ).exec(hit.text);
  if (!m)
    throw new Error(`${CHIP_SRC}:${hit.n}: \`${name}\` is not the four-arm ternary this probe reads: ${hit.text}`);
  return { xs: +m[1], sm: +m[2], lg: +m[3], md: +m[4], line: hit.n };
};

const CHIP_LINES = srcLines(CHIP_SRC);
const CHIP_TONE_BG = varTable(CHIP_LINES, 'TONE_BG');
const CHIP_DIMS = sizeTernary(CHIP_LINES, 'dims');
const CHIP_GLYPHS = sizeTernary(CHIP_LINES, 'glyph');
const CHIP_DIMS_RAW = CHIP_LINES[CHIP_DIMS.line - 1].text.trim();
const CHIP_GLYPH_RAW = CHIP_LINES[CHIP_GLYPHS.line - 1].text.trim();
const CHIP_CLASS = (() => {
  const hit = CHIP_LINES.find((l) => /^\s+className="grid place-items-center rounded-full shrink-0"$/.test(l.text));
  if (!hit) throw new Error(`${CHIP_SRC}: the chip's className line is not where this probe reads it`);
  return { cls: 'grid place-items-center rounded-full shrink-0', line: hit.n };
})();
const CHIP_STYLE_BLOCK = (() => {
  const open = CHIP_LINES.find((l) => /^\s+style=\{\{$/.test(l.text));
  const close = CHIP_LINES.find((l) => open && l.n > open.n && /^\s+\}\},?$/.test(l.text));
  if (!open || !close)
    throw new Error(`${CHIP_SRC}: the chip's inline style block is not braced as this probe reads it`);
  return { from: open.n, to: close.n, text: CHIP_LINES.slice(open.n, close.n).map((l) => l.text) };
})();
/** The three declarations the inline style is built from, verbatim, with lines. */
const CHIP_STYLE_SRC = ['width', 'height', 'background', 'border', 'color'].map((prop) => {
  const hit = CHIP_LINES.slice(CHIP_STYLE_BLOCK.from - 1, CHIP_STYLE_BLOCK.to).find((l) =>
    new RegExp(`^\\s*${prop}: `).test(l.text),
  );
  if (!hit) throw new Error(`${CHIP_SRC}: the chip's style block authors no \`${prop}\``);
  return { prop, text: hit.text.trim(), line: hit.n };
});

/** The inline style one (size, tone) pair produces, in the source's own order. */
const chipStyle = (size, tone) => {
  const dim = CHIP_DIMS[size];
  const ref = CHIP_TONE_BG[tone];
  if (!ref) throw new Error(`${CHIP_SRC}: no tone ${tone}`);
  return [
    `width: ${dim}px`,
    `height: ${dim}px`,
    `background: color-mix(in oklab, ${ref.cssVar} 55%, var(--surface))`,
    `border: 1px solid color-mix(in oklab, ${ref.cssVar} 70%, var(--line))`,
    'color: var(--ink)',
  ].join('; ');
};

const LEDGER_STACKS = [
  ...Object.keys(CHIP_TONE_BG).map((tone) => ({
    name: `cat-chip-md-${tone}`,
    src: CHIP_SRC,
    tag: 'span',
    note: `CategoryChip at its default md size (${CHIP_DIMS.md}px), tone ${tone} from ${CHIP_TONE_BG[tone].cssVar}`,
    parts: [
      { cls: CHIP_CLASS.cls, line: CHIP_CLASS.line },
      {
        style: chipStyle('md', tone),
        tone,
        toneVar: CHIP_TONE_BG[tone].cssVar,
        toneVarLine: CHIP_TONE_BG[tone].line,
        dims: CHIP_DIMS.md,
        dimsLine: CHIP_DIMS.line,
        glyph: CHIP_GLYPHS.md,
        glyphLine: CHIP_GLYPHS.line,
        styleSrc: CHIP_STYLE_SRC,
        styleBlock: [CHIP_STYLE_BLOCK.from, CHIP_STYLE_BLOCK.to],
      },
    ],
  })),
  ...['xs', 'sm', 'lg'].map((size) => ({
    name: `cat-chip-${size}`,
    src: CHIP_SRC,
    tag: 'span',
    note: `the size arms only — tone held at lavender so the fill cannot move the geometry`,
    parts: [
      { cls: CHIP_CLASS.cls, line: CHIP_CLASS.line },
      {
        style: chipStyle(size, 'lavender'),
        tone: 'lavender',
        toneVar: CHIP_TONE_BG.lavender.cssVar,
        toneVarLine: CHIP_TONE_BG.lavender.line,
        size,
        dims: CHIP_DIMS[size],
        dimsLine: CHIP_DIMS.line,
        glyph: CHIP_GLYPHS[size],
        glyphLine: CHIP_GLYPHS.line,
        styleSrc: CHIP_STYLE_SRC,
        styleBlock: [CHIP_STYLE_BLOCK.from, CHIP_STYLE_BLOCK.to],
      },
    ],
  })),
  {
    name: 'txrow-box',
    src: TXROW_SRC,
    tag: 'button',
    note: 'the row as the component mounts it: a <button type="button">, whose UA padding, border and centred text the class has to beat',
    attrs: { type: 'button' },
    extra: ['textAlign', 'cursor'],
    parts: [{ cls: 'tx-row w-full text-left pressable', line: 28 }],
  },
  {
    name: 'txrow-title',
    src: TXROW_SRC,
    parts: [{ cls: 'block text-[13px] font-semibold tracking-tight text-[var(--ink)] truncate', line: 31 }],
  },
  {
    name: 'txrow-meta',
    src: TXROW_SRC,
    parts: [{ cls: 'block text-[11px] text-[var(--ink-3)] mt-0.5 truncate', line: 32 }],
  },
  {
    name: 'txrow-text-wrap',
    src: TXROW_SRC,
    extra: ['minWidth'],
    parts: [{ cls: 'min-w-0 flex-1', line: 30 }],
  },
  {
    name: 'txrow-amount-wrap',
    src: TXROW_SRC,
    extra: ['textAlign'],
    parts: [{ cls: 'text-right shrink-0', line: 36 }],
  },
  ...[
    ['in', 'var(--success)', 39],
    ['out', 'var(--danger)', 39],
  ].map(([dir, cssVar, line]) => ({
    name: `txrow-amount-${dir}`,
    src: TXROW_SRC,
    note: `the ternary's ${dir} arm: the class authors no colour, the inline style decides it`,
    parts: [
      { cls: 'money inline-flex items-center gap-1 text-[13px] font-bold', line: 38 },
      { style: `color: ${cssVar}`, styleSrcLine: line, dir },
    ],
  })),
  {
    name: 'txrow-trailing-pill',
    src: REPORTS_SRC,
    note:
      'the Reports Centre type pill. `hidden sm:inline-flex` is meant to drop it below `sm`, and both passes ' +
      'measure it painted: `.pill` (src/index.css:909, unlayered) authors `display: inline-flex`, and an ' +
      'unlayered rule beats Tailwind’s layered utilities at any specificity, so `hidden` never applies to it. ' +
      'The `hidden` class and the `sm:` variant are both inert here; the row below the note records it.',
    parts: [{ cls: 'pill mono !text-[9px] !py-0.5 !px-2 hidden sm:inline-flex', line: 522 }],
  },
  {
    name: 'day-head-label',
    src: DASH_SRC,
    note: 'the group header is `.day-head` (sticky, blurred) carrying `.eyebrow` and an !important size override',
    extra: ['textTransform'],
    parts: [{ cls: 'day-head eyebrow !text-[10px]', line: 422 }],
  },
  {
    name: 'ledger-scroll',
    src: DASH_SRC,
    parts: [{ cls: 'min-h-0 lg:max-h-[34rem] lg:overflow-y-auto lg:pr-1', line: 419 }],
  },
  {
    name: 'ledger-divides',
    src: DASH_SRC,
    note: 'the parent itself: `divide-y` paints its children, so this row is the recipe, not the line',
    extra: ['borderBottomColor'],
    parts: [{ cls: 'divide-y divide-[var(--line)]', line: 423 }],
  },
  {
    name: 'ledger-row-last',
    src: DASH_SRC,
    wrap: 'divide-y divide-[var(--line)]',
    before: true,
    note: 'a divided child that is also last: `divide-y` would give it a bottom border and `[&:last-child]:border-b-0` takes it away — this pair is the divider rule',
    extra: ['borderBottomColor'],
    parts: [{ cls: '[&:last-child]:border-b-0', line: 431 }],
  },
  {
    name: 'ledger-row-middle',
    src: DASH_SRC,
    wrap: 'divide-y divide-[var(--line)]',
    before: true,
    after: true,
    note: 'the same child with a following sibling, so `:last-child` does not match and the divider stays',
    extra: ['borderBottomColor'],
    parts: [{ cls: '[&:last-child]:border-b-0', line: 431 }],
  },
  {
    name: 'ledger-empty',
    src: DASH_SRC,
    extra: ['textAlign', 'borderTopStyle'],
    parts: [
      {
        cls: 'py-10 text-center rounded-[var(--r-sm)] border border-dashed border-[var(--line)] bg-[var(--surface-2)]',
        line: 408,
      },
    ],
  },
  {
    name: 'ledger-list-scroll',
    src: REPORTS_SRC,
    parts: [{ cls: 'space-y-1 max-h-[460px] overflow-y-auto pr-1', line: 492 }],
  },
  {
    name: 'ledger-empty-rc',
    src: REPORTS_SRC,
    note: '`empty` is written here and declared nowhere in src/index.css — the drift test pins that absence',
    parts: [{ cls: 'empty py-10 flex flex-col items-center gap-2', line: 494 }],
  },
  {
    name: 'ledger-empty-rc-line',
    src: REPORTS_SRC,
    parts: [{ cls: 'mono text-[12px]', line: 496 }],
  },
];
const ALL_STACKS = [...UTILITY_STACKS, ...MODAL_STACKS, ...LEDGER_STACKS];
const AUTHORED_NON_CSS = [
  {
    name: 'toast-auto-dismiss',
    tier: 'authored-js',
    note: 'the dismiss timer is a setTimeout in the hook, not a CSS animation',
    parts: [{ text: "const timeout = type === 'error' ? 8000 : 5000;", line: 50 }],
  },
  {
    name: 'toast-motion',
    tier: 'authored-js',
    note: 'motion/react keyframes on the toast box; no stylesheet declares them',
    parts: [
      { text: 'initial={{ opacity: 0, y: -20 }}', line: 80 },
      { text: 'animate={{ opacity: 1, y: 0 }}', line: 81 },
      { text: 'exit={{ opacity: 0, scale: 0.95 }}', line: 82 },
    ],
  },
  {
    name: 'confirm-motion',
    tier: 'authored-js',
    note: 'motion/react keyframes on the confirm panel',
    parts: [
      { text: 'initial={{ opacity: 0, scale: 0.9 }}', line: 122 },
      { text: 'animate={{ opacity: 1, scale: 1 }}', line: 123 },
      { text: 'exit={{ opacity: 0, scale: 0.9 }}', line: 124 },
    ],
  },
  {
    name: 'icon-sizes',
    tier: 'authored-js',
    note: 'lucide renders these at a px size prop, not through CSS',
    parts: [
      { text: 'size={20}', line: 94 },
      { text: 'size={20}', line: 95 },
      { text: 'size={20}', line: 96 },
      { text: 'size={20}', line: 97 },
      { text: 'size={16}', line: 103 },
    ],
  },
];

/** #56: the modal/sheet family's authored JS — motion keyframes and spring
 *  transitions no stylesheet declares, the scroll-lock/Escape behaviour, the
 *  maxWidths prop map, one inline style override, and the lucide close sizes.
 *  Same discipline: verbatim slices with a src and a line, never measurements. */
const MODAL_AUTHORED = [
  {
    name: 'modal-veil-motion',
    src: 'src/components/ui/Modal.tsx',
    tier: 'authored-js',
    note: 'AnimatePresence fade on the primitive veil',
    parts: [
      { text: 'initial={{ opacity: 0 }}', line: 51 },
      { text: 'animate={{ opacity: 1 }}', line: 52 },
      { text: 'exit={{ opacity: 0 }}', line: 53 },
      { text: 'transition={{ duration: 0.18 }}', line: 54 },
    ],
  },
  {
    name: 'modal-panel-motion',
    src: 'src/components/ui/Modal.tsx',
    tier: 'authored-js',
    note: 'the panel enters with a small lift, spring damped — the port must not invent another curve',
    parts: [
      { text: 'initial={{ opacity: 0, scale: 0.98, y: 6 }}', line: 64 },
      { text: 'animate={{ opacity: 1, scale: 1, y: 0 }}', line: 65 },
      { text: 'exit={{ opacity: 0, scale: 0.98, y: 6 }}', line: 66 },
      { text: "transition={{ type: 'spring', damping: 26, stiffness: 280 }}", line: 67 },
    ],
  },
  {
    name: 'modal-behaviour',
    src: 'src/components/ui/Modal.tsx',
    tier: 'authored-js',
    note: 'Escape closes and the body scroll-locks while open — JS, not CSS',
    parts: [
      { text: "if (e.key === 'Escape') onClose();", line: 28 },
      { text: "document.body.style.overflow = 'hidden';", line: 31 },
      { text: "document.body.style.overflow = 'unset';", line: 35 },
    ],
  },
  {
    name: 'modal-width-prop',
    src: 'src/components/ui/Modal.tsx',
    tier: 'authored-js',
    note: 'the panel max-width is a prop; the default md selects this map entry',
    parts: [
      { text: "maxWidth = 'md',", line: 22 },
      { text: "md: 'max-w-md',", line: 41 },
    ],
  },
  {
    name: 'sheet-veil-motion',
    src: 'src/components/ui/BottomSheet.tsx',
    tier: 'authored-js',
    note: 'AnimatePresence fade on the sheet veil',
    parts: [
      { text: 'initial={{ opacity: 0 }}', line: 25 },
      { text: 'animate={{ opacity: 1 }}', line: 26 },
      { text: 'exit={{ opacity: 0 }}', line: 27 },
      { text: 'transition={{ duration: 0.18 }}', line: 28 },
    ],
  },
  {
    name: 'sheet-panel-motion',
    src: 'src/components/ui/BottomSheet.tsx',
    tier: 'authored-js',
    note: 'the sheet slides up from a full own-height offset',
    parts: [
      { text: "initial={{ y: '100%' }}", line: 36 },
      { text: 'animate={{ y: 0 }}', line: 37 },
      { text: "exit={{ y: '100%' }}", line: 38 },
      { text: "transition={{ type: 'spring', damping: 26, stiffness: 220 }}", line: 39 },
      { text: "if (isOpen) document.body.style.overflow = 'hidden';", line: 15 },
      { text: "document.body.style.overflow = 'unset';", line: 17 },
    ],
  },
  {
    name: 'qa-motion',
    src: 'src/components/dashboard/QuickActionModal.tsx',
    tier: 'authored-js',
    note: 'QuickActionModal springs its own panel with its own damping/stiffness',
    parts: [
      { text: 'initial={{ opacity: 0 }}', line: 104 },
      { text: 'animate={{ opacity: 1 }}', line: 105 },
      { text: 'exit={{ opacity: 0 }}', line: 106 },
      { text: "initial={{ y: '100%', opacity: 0.5 }}", line: 117 },
      { text: 'animate={{ y: 0, opacity: 1 }}', line: 118 },
      { text: "exit={{ y: '100%', opacity: 0.5 }}", line: 119 },
      { text: "transition={{ type: 'spring', damping: 25, stiffness: 220 }}", line: 120 },
    ],
  },
  {
    name: 'debt-overlay-close',
    src: 'src/components/DebtDetailModal.tsx',
    tier: 'authored-js',
    note: 'DebtDetailModal has no AnimatePresence; the overlay closes on a self-targeted click',
    parts: [
      { text: 'const handleOverlayClose = (e: React.MouseEvent) => {', line: 117 },
      { text: 'if (e.target === e.currentTarget) onClose();', line: 118 },
    ],
  },
  {
    name: 'debt-panel-inline-style',
    src: 'src/components/DebtDetailModal.tsx',
    tier: 'authored-inline',
    note: 'the only inline style in the family: it re-states var(--surface) over the card class',
    parts: [{ text: "style={{ background: 'var(--surface)' }}", line: 130 }],
  },
  {
    name: 'tem-motion',
    src: 'src/components/TransactionEditModal.tsx',
    tier: 'authored-js',
    note: 'the edit panel springs from a full own-height offset; its veil has no exit',
    parts: [
      { text: 'initial={{ opacity: 0 }}', line: 149 },
      { text: 'animate={{ opacity: 1 }}', line: 150 },
      { text: 'transition={{ duration: 0.18 }}', line: 151 },
      { text: "initial={{ y: '100%', opacity: 0.6 }}", line: 156 },
      { text: 'animate={{ y: 0, opacity: 1 }}', line: 157 },
      { text: "transition={{ type: 'spring', damping: 26, stiffness: 240 }}", line: 158 },
    ],
  },
  {
    name: 'settings-motion',
    src: 'src/components/SettingsModal.tsx',
    tier: 'authored-js',
    note: 'the drawer enters from a full own-width offset — a horizontal slide, unlike the vertical sheets',
    parts: [
      { text: 'initial={{ opacity: 0 }}', line: 503 },
      { text: 'animate={{ opacity: 1 }}', line: 504 },
      { text: 'exit={{ opacity: 0 }}', line: 505 },
      { text: 'transition={{ duration: 0.18 }}', line: 506 },
      { text: "initial={{ x: '100%' }}", line: 514 },
      { text: 'animate={{ x: 0 }}', line: 515 },
      { text: "exit={{ x: '100%' }}", line: 516 },
      { text: "transition={{ type: 'spring', damping: 28, stiffness: 260 }}", line: 517 },
    ],
  },
  {
    name: 'sheet-icon-sizes',
    src: 'src/components/ui/Modal.tsx',
    tier: 'authored-js',
    note: 'the modal family closes with a 13px X, not the toast 16',
    parts: [
      { text: 'size={13}', line: 86 },
      { text: 'size={13}', src: 'src/components/ui/BottomSheet.tsx', line: 58 },
    ],
  },
];
/**
 * Item 8's authored rows: the facts about the ledger family that no computed
 * style can show. Two of them are the reason the row is a *presentation* widget
 * rather than a formatter — the amount string arrives already formatted, and the
 * two screens that call it disagree about both the sign and what counts as
 * income, so the row must not pick a side.
 */
const LEDGER_AUTHORED = [
  {
    name: 'txrow-arrow-sizes',
    src: TXROW_SRC,
    tier: 'authored-js',
    note: 'the direction arrow is a 12px lucide glyph inside the amount span, so it sits on the money baseline, not on the row',
    parts: [{ text: '{isIncome ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}', line: 41 }],
  },
  {
    name: 'txrow-meta-composition',
    src: TXROW_SRC,
    tier: 'authored-js',
    note: "the second line is either the caller's whole `meta` string or `subtitle · category`, joined in the component",
    parts: [{ text: "{meta ?? [subtitle, category].filter(Boolean).join(' · ')}", line: 33 }],
  },
  {
    name: 'txrow-amount-signed-vs-absolute',
    src: TXROW_SRC,
    tier: 'authored-js',
    note: 'the same widget fed two different ways: Dashboard formats the signed amount, Reports Centre takes the absolute value first — the row receives a string either way',
    parts: [
      { text: 'amountText={formatMoney(state.currency, t.amount)}', src: DASH_SRC, line: 437 },
      { text: 'const absAmount = Math.abs(t.amount);', src: REPORTS_SRC, line: 505 },
      { text: 'amountText={formatMoney(currency, absAmount)}', src: REPORTS_SRC, line: 518 },
    ],
  },
  {
    name: 'txrow-isincome-predicates-disagree',
    src: TXROW_SRC,
    tier: 'authored-js',
    note: 'the two call sites do not compute direction identically: Reports Centre also treats a `Transfer In` category as income. Recorded, not resolved — a design-system row cannot vote on it.',
    parts: [
      { text: "t.type === 'income' ||", src: DASH_SRC, line: 426 },
      { text: "t.type === 'financing' ||", src: DASH_SRC, line: 428 },
      { text: "(t.type === 'transfer' && t.amount > 0);", src: DASH_SRC, line: 429 },
      { text: "t.type === 'income' ||", src: REPORTS_SRC, line: 501 },
      {
        text: "(t.type === 'transfer' && (t.category === 'Transfer In' || t.amount > 0));",
        src: REPORTS_SRC,
        line: 504,
      },
    ],
  },
  {
    name: 'cat-chip-tone-choice',
    src: CHIP_SRC,
    tier: 'authored-js',
    note: 'the tint is chosen by hashing the category name, so it is stable per category and unknown to any CSS probe',
    parts: [
      { text: "const TONE_CYCLE: ChipTone[] = ['lavender', 'blue', 'mint', 'yellow', 'pink'];", line: 63 },
      { text: 'function hashString(s: string): number {', line: 65 },
      { text: 'let h = 0;', line: 66 },
      { text: 'for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;', line: 67 },
      { text: 'return h;', line: 68 },
      { text: 'return TONE_CYCLE[hashString(category.toLowerCase().trim()) % TONE_CYCLE.length];', line: 72 },
    ],
  },
  {
    name: 'cat-chip-icon-and-size-tables',
    src: CHIP_SRC,
    tier: 'authored-js',
    note: 'the category→glyph map, the fallback glyph, and the two size tables the inline style and the glyph are built from',
    parts: [
      { text: 'const CATEGORY_ICONS: Record<string, LucideIcon> = {', line: 23 },
      { text: 'const Icon = iconOverride ?? CATEGORY_ICONS[key] ?? Receipt;', line: 84 },
      { text: CHIP_DIMS_RAW, line: CHIP_DIMS.line },
      { text: CHIP_GLYPH_RAW, line: CHIP_GLYPHS.line },
      { text: '<Icon size={glyph} strokeWidth={2} />', line: 100 },
    ],
  },
  {
    name: 'ledger-day-grouping-and-header',
    src: DASH_SRC,
    tier: 'authored-js',
    note: 'consecutive same-day runs become one group, and the header is rendered only in the View All pass — the Recent pass has the rows and no headers',
    parts: [
      { text: "const label = dayLabel(item.date || item.dateGiven || '');", line: 294 },
      { text: 'if (last && last.day === label) last.items.push(item);', line: 296 },
      { text: '{activityView === \'all\' && <p className="day-head eyebrow !text-[10px]">{group.day}</p>}', line: 422 },
    ],
  },
  {
    name: 'ledger-empty-copy',
    src: DASH_SRC,
    tier: 'authored-js',
    note: 'the empty box switches its headline on the view and its second line on whether the ledger has ever been written to',
    parts: [
      { text: "{activityView === 'recent' ? 'Nothing today' : 'No activity'}", line: 409 },
      {
        text: "{activityLog.length === 0 ? 'No ledger entries yet.' : 'Switch to View All for earlier entries.'}",
        line: 411,
      },
      { text: '<p className="mono text-[12px]">No entries match this filter.</p>', src: REPORTS_SRC, line: 496 },
    ],
  },
  {
    name: 'ledger-empty-class-declared-nowhere',
    src: REPORTS_SRC,
    tier: 'authored-inline',
    note: '`empty` is applied here and declared nowhere in src/index.css, so it paints nothing; asserted at capture so the port cannot inherit a colour it never had',
    parts: [{ text: '<div className="empty py-10 flex flex-col items-center gap-2">', line: 494 }],
  },
  {
    name: 'pill-hidden-utility-is-inert',
    src: REPORTS_SRC,
    tier: 'authored-inline',
    note:
      '`hidden` is a Tailwind utility, and utilities live in a cascade layer, while `.pill` ' +
      '(src/index.css:909) is written unlayered — so an unlayered `display` beats `hidden` at any ' +
      'specificity and at any width. Measured, not reasoned: at innerWidth 390 a `pill hidden` box ' +
      'computes inline-flex, while `card hidden`, `input hidden`, `day-head hidden` and `money hidden` ' +
      'all compute none (they author no display) and `icon-chip hidden` computes flex. So the Reports ' +
      'Centre type pill is shown on the phone even though the source says hide it below `sm`, and the ' +
      '`sm:inline-flex` beside it is redundant. Recorded as the app paints it; the class that should ' +
      'have removed it belongs to the web app to decide, not to the port.',
    parts: [
      { text: 'display: inline-flex;', src: 'src/index.css', line: 917 },
      {
        text: '<span className="pill mono !text-[9px] !py-0.5 !px-2 hidden sm:inline-flex">{t.type}</span>',
        line: 522,
      },
    ],
  },
];
const ALL_AUTHORED = [...AUTHORED_NON_CSS, ...MODAL_AUTHORED, ...LEDGER_AUTHORED];

const PROBE_PAGE = (selectors, utilities, stacks) => {
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
    const props = {
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
    return props;
  };

  /* Item 8: the only properties a row may ask for beyond the base readout. An
   *  unknown name is a programming error, so it throws rather than recording
   *  "undefined" as a measurement. `borderTopStyle` is the one that proves
   *  `border-dashed` painted at all — a width alone would be read the same for a
   *  solid hairline. */
  const STACK_EXTRA_PROPS = [
    'borderBottomColor',
    'borderTopStyle',
    'textAlign',
    'textTransform',
    'minWidth',
    'flexWrap',
    'cursor',
  ];

  /** The stack tier's wider read. Same engine, more properties: a utility stack
   *  also lays the box out (padding, gap, offsets, max-width, flex), so those
   *  computed values are recorded next to the paint ones. Colour-bearing props
   *  go through the same pick/compound engine path as everywhere else. */
  const stackProps = (el, extra) => {
    const cs = getComputedStyle(el);
    // Same readers as styleOf, rebuilt here rather than hoisted, so editing
    // this tier can never move a value in the tiers above.
    const pick = (prop) => {
      const raw = cs[prop];
      if (!raw || raw === 'none') return { raw };
      if (
        /^(rgb|rgba|hsl|hsla|oklch|oklab|color\(|#|currentcolor|transparent|white|black)/i.test(raw.trim()) ||
        /color-mix\(/.test(raw)
      ) {
        return { raw, srgb: resolve(raw) };
      }
      return { raw };
    };
    const compound = (prop) => {
      const raw = cs[prop];
      if (!raw || raw === 'none') return { raw };
      const many = resolveInside(raw);
      return many ? { raw, substituted: many.substituted, stops: many.stops } : { raw };
    };
    const props = {
      display: cs.display,
      position: cs.position,
      top: cs.top,
      right: cs.right,
      bottom: cs.bottom,
      left: cs.left,
      zIndex: cs.zIndex,
      flexDirection: cs.flexDirection,
      alignItems: cs.alignItems,
      justifyContent: cs.justifyContent,
      rowGap: cs.rowGap,
      columnGap: cs.columnGap,
      padding: cs.padding,
      marginLeft: cs.marginLeft,
      marginBottom: cs.marginBottom,
      marginTop: cs.marginTop,
      marginRight: cs.marginRight,
      flexGrow: cs.flexGrow,
      flexShrink: cs.flexShrink,
      width: cs.width,
      maxWidth: cs.maxWidth,
      height: cs.height,
      maxHeight: cs.maxHeight,
      borderRadius: cs.borderRadius,
      borderTopWidth: cs.borderTopWidth,
      borderRightWidth: cs.borderRightWidth,
      borderBottomWidth: cs.borderBottomWidth,
      borderLeftWidth: cs.borderLeftWidth,
      overflowX: cs.overflowX,
      overflowY: cs.overflowY,
      color: pick('color'),
      backgroundColor: pick('backgroundColor'),
      borderTopColor: pick('borderTopColor'),
      borderLeftColor: pick('borderLeftColor'),
      boxShadow: compound('boxShadow'),
      backdropFilter: compound('backdropFilter'),
      backgroundImage: compound('backgroundImage'),
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      whiteSpace: cs.whiteSpace,
      textOverflow: cs.textOverflow,
      opacity: cs.opacity,
    };
    // A row asks for the readouts its own family needs. `borderBottomColor` is
    // what `divide-[var(--line)]` paints, `textTransform` is what `.eyebrow`
    // authors, `minWidth` is what `truncate` depends on — none of them were part
    // of the tier when the toast and modal rows were captured, and none of them
    // appear on a row that did not ask, so those rows keep their record.
    for (const name of extra) {
      if (!STACK_EXTRA_PROPS.includes(name)) throw new Error(`unknown stack extra "${name}"`);
      props[name] = /Color$/.test(name) ? pick(name) : cs[name];
    }
    return props;
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
  const controlRead = (() => {
    const el = document.createElement('div');
    el.textContent = 'probe';
    document.body.appendChild(el);
    const s = styleOf(el);
    const st = stackProps(el, STACK_EXTRA_PROPS);
    el.remove();
    return { s, st };
  })();
  const control = controlRead.s;
  const controlStack = controlRead.st;
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

  // The utility stacks: the whole authored class list of one box on one
  // element, read wider than the paint-only tiers. `changed` names every
  // property the stack actually moves against the control — a rule Tailwind
  // never emits shows up as a property missing from it, not as a silent lie.
  //
  // Item 8 grows the readout for the rows that need it, and grows it only for
  // them: a row's `props` object has exactly the keys the base set plus that
  // row's own `extra` list, so a row recorded before this family was added
  // keeps the byte-for-byte record it had. The control is read with every extra
  // so each row can be diffed against the same untouched baseline.
  const stacksPainted = {};
  for (const stack of stacks) {
    const tag = stack.tag || 'div';
    const el = document.createElement(tag);
    el.className = stack.parts
      .map((p) => p.cls)
      .filter(Boolean)
      .join(' ');
    // The inline styles a component writes in `style={{…}}` go on the probe
    // element verbatim, because a `color-mix(in oklab, …)` authored in JS is as
    // unportable as one authored in CSS and has to be read by the same engine.
    const style = stack.parts
      .map((p) => p.style)
      .filter(Boolean)
      .join('; ');
    if (style) el.setAttribute('style', style);
    for (const [k, v] of Object.entries(stack.attrs || {})) el.setAttribute(k, v);
    el.textContent = 'probe';
    let wrap = null;
    if (stack.wrap) {
      wrap = document.createElement('div');
      wrap.className = stack.wrap;
      wrap.appendChild(el);
      // `divide-y` and `[&:last-child]:` both answer to sibling position, so the
      // parent has to carry the siblings the component carries.
      if (stack.before) wrap.insertBefore(document.createElement('span'), el);
      if (stack.after) wrap.appendChild(document.createElement('span'));
      document.body.appendChild(wrap);
    } else {
      document.body.appendChild(el);
    }
    const props = stackProps(el, stack.extra || []);
    el.remove();
    if (wrap) wrap.remove();
    const changed = Object.keys(props).filter((k) => JSON.stringify(props[k]) !== JSON.stringify(controlStack[k]));
    stacksPainted[stack.name] = { changed, props };
  }

  return {
    root: customProps(document.documentElement),
    body: customProps(document.body),
    probes,
    utilities: utilitiesPainted,
    utilitiesSilent,
    stacks: stacksPainted,
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

/** What the stack section says about itself. Both the full run and the
 *  `--stacks-only` merge write this one string, so the two cannot describe the
 *  tier differently. */
const STACKS_NOTE =
  'The #55 utility-stack tier: boxes whose look is a stack of Tailwind utilities written in a ' +
  'className string, not a class in src/index.css. Each row is a verbatim slice of the pinned ' +
  'component source; the whole class list goes on one detached element and its computed style is ' +
  'read against an unclassed control, in themes.<pass>.stacks. "changed" names the properties the ' +
  'stack actually moves — a utility Tailwind never emits (or a variant gated off in this pass, like ' +
  'a dark: fragment under a light preference) shows as a property absent from it. authoredNonCss is ' +
  'not a measurement: timers and motion values are JS, recorded verbatim so the port never invents ' +
  'them. measuredAt/base/toolchain describe THIS section only: a stack capture can postdate the ' +
  'pinned sections in themes/root, which are not re-synced until the ruling says so. #56 extended ' +
  'the tier to the modal/sheet family: rows from more than one file carry their own src, and the ' +
  'top-level source is only the fallback for the rows that were already here. #75 (item 8, the ' +
  'transaction row and the ledger) grew the readout per row rather than globally: `extra` names the ' +
  "properties only some boxes need (a `divide-y` hairline colour, a sticky day header's " +
  'text-transform), `tag`/`attrs` build the element the component really uses — the row is a ' +
  '`button`, so its UA text-align and cursor are facts of the box, not of the class list — `style` ' +
  'carries an inline `color-mix(in oklab, …)` authored in JS, which the engine has to resolve just ' +
  'like one authored in CSS, and `wrap`/`before`/`after` give an element the siblings its rule ' +
  'answers to, because `divide-y` paints the children of a dividing parent and ' +
  '`[&:last-child]:border-b-0` only matches the last of them.';

/** The Tailwind that generated the stylesheet the stacks resolve against. */
const tailwindVersion = () =>
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'tailwindcss', 'package.json'), 'utf8'))
    .version;

/** Byte-for-byte comparison of two JSON values, the test every pinned check uses. */
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The font gate.
 *
 * `src/index.css:1` imports the app's faces from `fonts.googleapis.com`, and a
 * browser fetches a webfont lazily, when text that needs it is first laid out.
 * So the same stylesheet measured twice can produce two different numbers,
 * depending on which arrived first: a shrink-to-fit box is as wide as its text,
 * and Inter and the system fallback differ by a couple of pixels on the word
 * "probe". That is exactly what the #55 capture recorded — the toast container
 * came back 42.125px wide, which is the fallback, and re-measures 44.2812px once
 * the import has actually resolved.
 *
 * Item 8's ruling says the ledger is measured against Plus Jakarta Sans and
 * Inter, so a race is not an acceptable source for its numbers. Before anything
 * is measured the page is asked to load every family the pinned stylesheet names
 * and then to prove each one is really in use, by rendering text with it and
 * without it. A family that makes no difference is a family that did not load,
 * and the run stops there rather than recording a fallback metric as the app's
 * appearance.
 */
const GOOGLE_FAMILIES = (() => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.css'), 'utf8');
  const m = /@import url\(['"]https:\/\/fonts\.googleapis\.com\/css2\?([^'"]*)['"]\)/.exec(css);
  if (!m) throw new Error('src/index.css imports no Google font set; the font gate has nothing to check');
  const families = [
    ...new Set(
      m[1]
        .split('&')
        .filter((p) => p.startsWith('family='))
        .map((p) => p.slice('family='.length).split(':')[0].replace(/\+/g, ' ')),
    ),
  ];
  if (families.length === 0) throw new Error('the Google font import in src/index.css lists no family');
  return families;
})();

/** Load the named families, then render with and without each one. Run in the page. */
const fontGateInPage = async (families) => {
  const width = (fam) => {
    const s = document.createElement('span');
    s.style.cssText = `position:fixed;left:-9999px;top:0;white-space:pre;font-size:64px;font-weight:400;font-family:${fam}`;
    s.textContent = 'probe';
    document.body.appendChild(s);
    const w = s.getBoundingClientRect().width;
    s.remove();
    return w;
  };
  await Promise.all(families.map((f) => document.fonts.load(`64px "${f}"`, 'probe')));
  await document.fonts.ready;
  const bogus = width('"em-budget-no-such-family", monospace');
  const inUse = {};
  for (const f of families) inUse[f] = width(`"${f}", monospace`) !== bogus;
  return { status: document.fonts.status, loaded: document.fonts.size, inUse };
};

/** Refuse a page whose fonts have not all rendered. */
const fontGate = async (page) => {
  const gate = await page.evaluate(fontGateInPage, GOOGLE_FAMILIES);
  const missing = GOOGLE_FAMILIES.filter((f) => !gate.inUse[f]);
  if (missing.length > 0) {
    throw new Error(
      `the stylesheet's own fonts never rendered: ${missing.join(', ')} ` +
        `(document.fonts.status=${gate.status}, ${gate.loaded} faces). Measuring now would record ` +
        'the fallback font and call it the app, which item 8 forbids.',
    );
  }
  return gate;
};

/** Measure a pass, but only after the fonts are proven to be the app's own. */
const measureWithFontGate = (page, selectors, utilities, stacks) =>
  fontGate(page).then(() =>
    page.evaluate(
      `(${PROBE_PAGE.toString()})(${JSON.stringify(selectors)},${JSON.stringify(utilities)},${JSON.stringify(stacks)})`,
    ),
  );

/**
 * The rows whose committed numbers are known to have been taken before the
 * webfont arrived. Each entry names the row and the exact property set the font
 * gate is allowed to correct, and nothing else: an unexpected row, or an
 * expected row moving an unlisted property, still fails the merge.
 *
 * Filled in by running the gate — it is a record of what the race actually
 * touched, not a tolerance.
 */
const FONT_RACE_CORRECTIONS = [
  {
    name: 'toast-container',
    props: ['left', 'width'],
    note:
      'The toast is the one captured row that sizes itself to its text, so its width — and the `left` that ' +
      'follows from a right-anchored box — are the width of the word "probe" in whatever font had loaded ' +
      'when #55 read it. The record has 42.125px, the system fallback; over Inter, which is what the page ' +
      'actually paints once src/index.css:1 resolves, it is 44.2812px. Only the two desktop passes carry ' +
      'the difference: the phone pass pins the container to a side, so nothing there is text-metric. Both ' +
      'numbers are in the same row, and the row is the only one of the captured 51 that moved.',
  },
];
const isFontRaceCorrection = (m) => FONT_RACE_CORRECTIONS.some((c) => c.name === m.name && sameJson(c.props, m.props));

/**
 * `--stacks-only`: measure the stack tier and merge it into the committed record,
 * writing only if everything the run did not measure is still byte-for-byte what
 * it was. See the flag's declaration for why a full re-run is not equivalent.
 *
 * The checks are the point of the mode, not decoration for it:
 *   1. `src/index.css` must still be the `pre-flutter` blob. The stylesheet is
 *      what every stack resolves against; if it moved, a stack capture taken now
 *      would describe a web app the Flutter port is not mirroring.
 *   2. Each pass must come back with the root class, viewport width and
 *      `prefers-color-scheme` the pinned pass recorded, or the numbers being
 *      written are from a different rendering context than the ones beside them.
 *   3. Every stack row already in the record must re-measure identically, and the
 *      pinned row/`authoredNonCss` lists must still be prefixes of the lists in
 *      this script. A row that moved is a transcription error in the new family
 *      or a component that changed under a citation, and neither may be written
 *      as if it were an addition.
 *   4. Nothing outside `themes.<pass>.stacks` and `utilityStacks` is touched, and
 *      `generatedAt` keeps the date the pinned sections were captured.
 */
async function stacksOnlyMerge(browser) {
  const git = (args) => cp.execFileSync('git', args, { cwd: path.join(__dirname, '..'), encoding: 'utf8' }).trim();
  const CSS_REL = 'src/index.css';
  const tagBlob = git(['rev-parse', `pre-flutter:${CSS_REL}`]);
  const workBlob = git(['hash-object', CSS_REL]);
  if (tagBlob !== workBlob) {
    throw new Error(
      `src/index.css is not the pre-flutter blob (tag ${tagBlob}, working tree ${workBlob}); ` +
        'a stack capture taken against a moved stylesheet would not describe the app the port mirrors',
    );
  }

  const pinned = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const pinnedRows = pinned.utilityStacks.rows;
  const pinnedAuthored = pinned.utilityStacks.authoredNonCss;
  if (pinnedRows.length > ALL_STACKS.length || pinnedAuthored.length > ALL_AUTHORED.length) {
    throw new Error(
      `the record holds ${pinnedRows.length} rows / ${pinnedAuthored.length} authored entries ` +
        `but this script authors ${ALL_STACKS.length} / ${ALL_AUTHORED.length}`,
    );
  }
  // A row already in the record has two halves. Its measurement shape — the class
  // list, the element it is built on, the attributes, the inline style, the
  // wrapper and siblings, the extra readouts it asks for, and every cited line —
  // decides what the number in the record means, and may never move. Its `note`
  // is prose about that number, and prose is allowed to be corrected: the toast
  // finding and the `hidden`-is-inert finding below were both written wrong first.
  //
  // The families captured before item 8 (`#55`, `#56`) keep both halves frozen,
  // prose included, because a ruling pinned them; only the item-8 family below
  // that boundary may have its text revised.
  const rowShape = ({ note: _note, ...rest }) => rest;
  const PINNED_STACK_ROWS = UTILITY_STACKS.length + MODAL_STACKS.length;
  const PINNED_AUTHORED_ROWS = AUTHORED_NON_CSS.length + MODAL_AUTHORED.length;
  for (const [i, row] of pinnedRows.entries()) {
    const now = ALL_STACKS[i];
    if (!now || row.name !== now.name) {
      throw new Error(`stack row #${i} "${row.name}" is not where the record left it — additions must append`);
    }
    if (i < PINNED_STACK_ROWS ? !sameJson(row, now) : !sameJson(rowShape(row), rowShape(now))) {
      throw new Error(
        `stack row #${i} "${row.name}" ${i < PINNED_STACK_ROWS ? 'moved' : 're-measures differently than the record says'}; ` +
          'the class list, element, style, wrapper, extras or citations of a captured row are not edited, they are re-captured',
      );
    }
  }
  for (const [i, row] of pinnedAuthored.entries()) {
    const now = ALL_AUTHORED[i];
    if (!now || row.name !== now.name) {
      throw new Error(`authoredNonCss #${i} "${row.name}" is not where the record left it`);
    }
    if (i < PINNED_AUTHORED_ROWS ? !sameJson(row, now) : !sameJson(rowShape(row), rowShape(now))) {
      throw new Error(
        `authoredNonCss #${i} "${row.name}" ${i < PINNED_AUTHORED_ROWS ? 'moved' : 're-cites differently'}; ` +
          'a recorded row is not restated, only explained better',
      );
    }
  }

  const merged = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const movedByPass = [];
  for (const theme of ['light', 'dark']) {
    for (const vp of VIEWPORTS) {
      const key = `${theme}-${vp.name}`;
      const before = merged.themes[key];
      if (!before) throw new Error(`the record has no ${key} pass to merge into`);
      const pinnedStackCount = Object.keys(before.stacks || {}).length;
      if (!sameJson(before.viewport, vp)) {
        throw new Error(
          `${key}: the record's viewport ${JSON.stringify(before.viewport)} is not ${JSON.stringify(vp)}`,
        );
      }
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
      const data = await measureWithFontGate(page, [], [], ALL_STACKS);
      await ctx.close();

      if (problems.length > 0) {
        throw new Error(`${key}: ${problems.length} page error(s) during the stack capture: ${problems[0]}`);
      }
      if (data.badSelectors.length > 0) throw new Error(`unparseable probe selectors: ${data.badSelectors.join(', ')}`);
      for (const [prop, expected] of [
        ['innerWidth', before.innerWidth],
        ['appliedClass', before.appliedClass],
        ['mediaDark', before.mediaDark],
      ]) {
        if (data[prop] !== expected) {
          throw new Error(
            `${key}: ${prop} is ${JSON.stringify(data[prop])} now, ${JSON.stringify(expected)} when the record was captured`,
          );
        }
      }
      const brief = (v) => {
        if (v === undefined) return 'absent';
        const s = v.srgb ? v.srgb.rgba : v.substituted ? v.substituted : v.raw !== undefined ? v.raw : v;
        return String(JSON.stringify(s)).slice(0, 60);
      };
      const moved = Object.keys(before.stacks || {})
        .filter((name) => !sameJson(before.stacks[name], data.stacks[name]))
        .map((name) => {
          const was = before.stacks[name].props;
          const now = data.stacks[name].props;
          const keys = [...new Set([...Object.keys(was), ...Object.keys(now)])];
          const differs = keys.filter((k) => !sameJson(was[k], now[k]));
          return { pass: key, name, props: differs.slice().sort() };
        });
      const missing = Object.keys(ALL_STACKS.reduce((a, s) => ({ ...a, [s.name]: 1 }), {})).filter(
        (name) => data.stacks[name] === undefined,
      );
      if (missing.length > 0) throw new Error(`${key}: no measurement for ${missing.join(', ')}`);
      for (const m of moved) {
        m.diff = m.props.map(
          (k) => `${k} ${brief(before.stacks[m.name].props[k])} -> ${brief(data.stacks[m.name].props[k])}`,
        );
      }
      movedByPass.push(...moved);
      before.stacks = data.stacks;
      console.log(
        `${key}: ${Object.keys(data.stacks).length}/${ALL_STACKS.length} stacks measured over ${GOOGLE_FAMILIES.join(', ')}, ` +
          `of which ${pinnedStackCount} were already in the record (${moved.length} re-measured differently)`,
      );
    }
  }

  // A row already in the record that re-measures differently is one of two things:
  // either the tier moved under a family that was already captured, which is the
  // failure this mode exists to catch, or the pinned number was taken before the
  // webfont arrived and the font gate above has now corrected it. Only the second
  // is allowed, and only as an enumerated list checked name and property by
  // property — so a genuinely new difference cannot hide among the known ones.
  const unexplained = movedByPass.filter((m) => !isFontRaceCorrection(m));
  if (unexplained.length > 0) {
    throw new Error(
      `${unexplained.length} stack row(s) already in the record re-measured differently for a reason the ` +
        'font race does not explain; a family added to the tier must not move the families already in it\n  - ' +
        unexplained
          .slice(0, 8)
          .map((m) => `${m.pass} ${m.name}: ${m.diff.join(', ')}`)
          .join('\n  '),
    );
  }
  for (const m of movedByPass) {
    console.log(`  font-gate correction: ${m.pass} ${m.name}: ${m.diff.join(', ')}`);
  }

  merged.utilityStacks.note = STACKS_NOTE;
  merged.utilityStacks.source = STACK_SOURCE;
  merged.utilityStacks.rows = ALL_STACKS;
  merged.utilityStacks.authoredNonCss = ALL_AUTHORED;
  merged.utilityStacks.measuredAt = new Date().toISOString();
  merged.utilityStacks.base = BASE;
  merged.utilityStacks.toolchain = tailwindVersion();

  // The promise of the mode, checked against the record it started from rather
  // than assumed from the code above: only the two stack-bearing keys may differ.
  const stripped = (o) => {
    const copy = JSON.parse(JSON.stringify(o));
    for (const pass of Object.values(copy.themes || {})) pass.stacks = null;
    copy.utilityStacks = null;
    return JSON.stringify(copy);
  };
  if (stripped(pinned) !== stripped(merged)) {
    throw new Error('the merge moved something outside themes.<pass>.stacks and utilityStacks; nothing was written');
  }

  fs.writeFileSync(OUT, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  console.log(
    `\nstacks-only merge wrote ${path.relative(process.cwd(), OUT)}: ` +
      `${pinnedRows.length} rows kept, ${ALL_STACKS.length - pinnedRows.length} added, ` +
      `generatedAt stays ${merged.generatedAt}`,
  );
}

async function main() {
  const browser = await chromium.launch();
  if (ONLY_STACKS) {
    await stacksOnlyMerge(browser);
    await browser.close();
    return;
  }
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
    utilityStacks: {
      note: STACKS_NOTE,
      source: STACK_SOURCE,
      rows: ALL_STACKS,
      authoredNonCss: ALL_AUTHORED,
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

      // All measurement lives inside PROBE_PAGE; only the selector and utility
      // lists are interpolated, as JSON, so no page-source text is hand-escaped
      // here. The font gate runs first for the same reason it runs in
      // `--stacks-only`: a box that sizes itself to its text has no stable answer
      // until the stylesheet's own faces are the ones being used.
      const data = await measureWithFontGate(page, PROBE_SELECTORS, UTILITIES, ALL_STACKS);
      if (data.badSelectors.length > 0) throw new Error(`unparseable probe selectors: ${data.badSelectors.join(', ')}`);
      data.media = { width: data.innerWidth, floatingNavDisplay: data.floatingNavDisplay };

      result.themes[key] = { ...data, viewport: vp, problems, media: { ...data.media, mediaDark: data.mediaDark } };
      console.log(
        `${key}: ${Object.keys(data.root).length} root props, ${Object.keys(data.probes).length} probes, ` +
          `${Object.keys(data.utilities).length}/${UTILITIES.length} JSX utilities paint, ` +
          `${Object.keys(data.stacks).length}/${ALL_STACKS.length} stacks, ` +
          `${problems.length} page errors, floating-nav=${data.media.floatingNavDisplay} @ ${vp.width}px`,
      );
      await ctx.close();
    }
  }

  result.utilityStacks.measuredAt = result.generatedAt;
  result.utilityStacks.base = BASE;
  result.utilityStacks.toolchain = tailwindVersion();

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
        `(${PROBE_PAGE.toString()})(${JSON.stringify([])},${JSON.stringify(darkTokens)},[])`,
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
    ...Object.entries(t.stacks || {}).map(([name, rec]) => ['stack', name, rec.props]),
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
