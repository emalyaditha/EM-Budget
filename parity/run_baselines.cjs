/**
 * Phase 1 pixel baselines.
 *
 * Drives `qa-shot.cjs` exactly as the web app ships it — no flag the harness does
 * not already understand, no patched copy, no second harness — once per theme, and
 * folds what comes back into `parity/screenshots/`.
 *
 * That rule has one authorised exception, ruled in during Phase 5: `qa-shot.cjs`
 * carries two optional, additive flags, and this wrapper passes both through.
 *
 *   --now <ISO>      pins the instant a run is measured at, on both clocks that feed
 *                    a screenshot — Node's, which writes the seed dates, and the
 *                    browser's, which computes every relative label.
 *   --app-theme <t>  pre-sets `em-budget-theme`, the app's own stored theme, which is
 *                    a different source of truth from the OS signal `--theme` sets.
 *                    D16 is four combinations of the two, not two.
 *
 * Both default to "not passed", so a plain run of this script still produces exactly
 * what it produced before. Nothing else in the harness moved, and the rule against a
 * patched copy or a second harness still holds.
 *
 * With `--now`, this wrapper runs **one harness invocation per width** instead of one
 * per theme, all against the same tenant. That is forced, not stylistic: `--now` makes
 * the seed a pure function of the instant it names, the seed's stamp is the prefix of
 * every row id it inserts, and every app table declares `id text not null primary key`
 * with no tenant scope (`supabase/migrations/20260725000000_init.sql:19`). Two width
 * passes sharing one instant therefore collide on insert, and the screen under test is
 * replaced by the app's sync-error banner. Each pass gets its own instant, `--now` plus
 * a fixed step, and all three instants are recorded in the manifest.
 *
 * Two more rules the playbook put on this run:
 *
 *   D6  a fresh tenant per run. The seed inserts are run-scoped but reusing one
 *       mailbox accumulates every previous seed into the same owner, so each
 *       invocation registers and then logs into its own throwaway account.
 *   D9  the harness password is generated here, handed to the child through its
 *       environment, and never written to a tracked file or printed. Nothing in
 *       this repo, this log, or the manifest carries it.
 *
 * What is recorded is what the harness *reported*, not what this wrapper believes
 * happened: the parsed tab/error/overflow lines are kept verbatim next to the
 * bytes they were produced with, so a baseline can be audited without re-running
 * anything.
 *
 * Usage: node parity/run_baselines.cjs [--widths 360,390,430] [--themes light,dark]
 *                                      [--now <ISO>] [--app-theme light|dark]
 *                                      [--set <name>] [--pass-step-ms 22000]
 */
const { spawn, execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'screenshots');
const HARNESS_OUT = 'D:/tmp/qa';
const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const WIDTHS = arg('--widths', '360,390,430').split(',').map(Number);
const THEMES = arg('--themes', 'light,dark').split(',');
/** The two approved `qa-shot.cjs` pass-throughs. Empty means "not passed", which is
 *  the pre-Phase-5 behaviour in every respect. */
const NOW = arg('--now', '');
const APP_THEME = arg('--app-theme', '');
/** How far each successive width pass is pushed past `--now` when the clock is
 *  pinned. 22 s is the Phase 1 cadence, measured from the stamps those runs left in
 *  the database: the light passes seeded 22.270 s and 22.224 s apart. Any non-zero
 *  step would avoid the collision; this one keeps a pinned run shaped like the runs
 *  it is meant to sit beside. */
const PASS_STEP_MS = Number(arg('--pass-step-ms', '22000'));
/** Which subtree of `parity/screenshots/web/` this run lands in. The two Phase 1
 *  runs share the OS-signal name (`light`, `dark`) because the app's stored theme
 *  was never fixed; a run that fixes it is a different golden and needs a name that
 *  says so, or it silently overwrites the set it was meant to sit beside. */
const SET = arg('--set', '');
/** Every baseline is stamped with the source it came from; `render_ui_spec.cjs` refuses
 *  to publish §9 if that is not the same commit the colour numbers were measured at. */
const SOURCE_TAG = 'pre-flutter';
/** What a re-capture is allowed to differ by before it stops being the same
 *  measurement. Byte-identity is not attainable: rasterization alone moves a few
 *  pixels by a few levels on every run, and the PNG stream size shifts with them.
 *  The comparison is therefore on decoded RGB pixels, not on file bytes.
 *
 *  Three clauses, ruled at the G5.0 gate. The first two bound movement by how much
 *  and how far; the third is a hard ceiling. A single hard max (the old `<= 8/255`)
 *  was measured to be the wrong shape: the unread badge on the notifications bell
 *  (`src/App.tsx:4323`, `bg-emerald-500 ... animate-pulse`) is animated in opacity,
 *  and `page.clock.install` pins `Date` and `performance.now` but not the CSS
 *  animation timeline. So a faithful re-capture of dark/430/savingsjars differs from
 *  the committed PNG at 12 pixels (0.0033%) by up to 17/255 and 22/255 on two
 *  independent runs — while those two runs agree with *each other* to 5/255. The
 *  residual is one element caught at three animation phases, not a data difference,
 *  and no pixel crossed 32/255. */
const TOLERANCE = {
  appliesTo:
    'harness reproducibility only — the rule a re-capture of a committed baseline must satisfy. It is NOT the ' +
    'Flutter-vs-web parity tolerance, which is a separate ruling.',
  compared: 'decoded RGB pixels, per-channel delta',
  clauses: [
    {
      id: 'minor',
      channelDelta: 8,
      maxPixelRatio: 0.001,
      rule: 'at most 0.1% of pixels may differ by more than 8/255 in any channel',
    },
    {
      id: 'gross',
      channelDelta: 32,
      maxPixelRatio: 0.00005,
      rule: 'at most 0.005% of pixels may differ by more than 32/255 in any channel',
    },
    { id: 'absolute', channelDelta: 64, maxPixelCount: 0, rule: 'no pixel may differ by more than 64/255' },
  ],
  evidence:
    'The one element that is not a pure function of the pinned instant is the unread badge on the notifications ' +
    'bell: src/App.tsx:4323 renders `w-2 h-2 bg-emerald-500 border-2 border-[var(--surface)] rounded-full ' +
    'animate-pulse` when unreadNotificationCount > 0, and animate-pulse swings its opacity on the CSS animation ' +
    'timeline, which page.clock.install does not freeze. Measured on dark/430/savingsjars, whose 12 offending ' +
    'pixels are all inside x380-386 y107-112 (the 4px badge core and its antialiased edge): the core reads ' +
    '[5,121,87] in the committed PNG, [4,138,97] and [3,143,99] in two independent re-captures — one hue at ' +
    'roughly 0.62, 0.72 and 0.74 of emerald-500 over the [15,21,31] surface, i.e. three points of the same ' +
    'pulse. Committed vs A 12px>8 (0.0033%) max 17; committed vs B 12px>8 max 22; A vs B max 5, 0px>8; zero ' +
    'pixels above 32/255 in any pair.',
};

/** What each baseline can be compared with. Recorded next to the baselines because
 *  it is not obvious from a filename: the seed instant is an input to the pixels, so
 *  two sets are two goldens and never two views of one measurement. */
const COMPARABILITY = {
  rule:
    'A baseline is only directly comparable with another that shares its seed instant, its seed multiplicity ' +
    'and its theme pair. buildSeed derives every seeded date from the same clock that names the row ids, so ' +
    'the instant is an input to the pixels, not just a stamp on them.',
  dateContent:
    'Yes, date-dependent content differs between the seed epochs, and it is a whole-day shift, not a rounding ' +
    'artefact. Read off the committed PNGs themselves: trackliabilities at 390px shows the same debt card as ' +
    '“Due 2026-10-14” in the 2026-10-06 sets and “Due 2026-10-17” in the 2026-10-09 set — the three days between ' +
    'the two seed instants, on an ISO date the app renders straight from `dueDate: daysAgo(-8)`. Everything else ' +
    'on the two screens is word for word the same (LKR 1,315,000, 37% repaid, 4 outstanding, 70% settled). ' +
    'Month-level labels do not move: reportscentre renders only “October” + “2026”, identical in both epochs, ' +
    'because the two instants fall in the same month. So the tabs that carry a day-level date are the ones that ' +
    'cannot cross epochs, and a set whose instants straddle a month or year boundary would move more than a label.',
  verdict:
    'NOT directly comparable. The 2026-10-09 set is a fourth golden in its own right: it differs from the three ' +
    '2026-10-06 sets in theme pair AND seed instant, so a Flutter render is matched against exactly one set, and ' +
    'the dates it has to reproduce are that set’s.',
  proof:
    'light/360/overviewhub was re-captured on 2026-10-09 pinned to 2026-10-06T09:06:08.545Z — three days after ' +
    'the original run, and 17 ms away from the 09:06:08.528Z instant recovered from that run’s row ids — and ' +
    'came out byte-identical to the committed PNG. The pin, not the wall clock, is what the dates come from.',
  perBaselineFields:
    'seededAt = the instant that pass pinned its seed to (null when it pinned nothing), seedAtSource = pinned / ' +
    'recovered-from-row-ids / unrecorded, passIndex = position in the run, seedMultiplicity = how many seeds the ' +
    'tenant held when the shot was taken.',
};

/**
 * The harness only needs something that clears `validatePassword` in `server.ts`
 * for a throwaway tenant. 18 base64url characters forced to the upper + lower +
 * digit shape, with the symbol class deliberately avoided so nothing here has to
 * survive shell quoting. Returned, never printed.
 */
const makePassword = () => {
  for (let i = 0; i < 200; i++) {
    const p = crypto
      .randomBytes(16)
      .toString('base64url')
      .replace(/[^A-Za-z0-9]/g, '');
    if (p.length >= 12 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /[0-9]/.test(p)) return p.slice(0, 18);
  }
  throw new Error('could not generate a password that satisfies the server policy');
};

const TAG_BASE = arg('--tag', 'p1base');
/** `p1base-light` for the Phase 1 runs, unchanged; a run that also fixes the app's
 *  stored theme says so in its tag, because that is a different golden. */
const tagFor = (theme) => (APP_THEME ? `${TAG_BASE}-${theme}-app${APP_THEME}` : `${TAG_BASE}-${theme}`);
const setFor = (theme) => SET || theme;

const run = (theme, email, { now, password, width }) =>
  new Promise((resolve, reject) => {
    const tag = tagFor(theme);
    // Removing it from this process's own environment is the point: `npm run dev`
    // and the app never see it, and neither does anything that reads the shell.
    const env = { ...process.env, QA_HARNESS_PASSWORD: password };
    const flags = [
      path.join(ROOT, 'qa-shot.cjs'),
      '--tag',
      tag,
      '--theme',
      theme,
      '--widths',
      String(width),
      '--email',
      email,
    ];
    if (now) flags.push('--now', now);
    if (APP_THEME) flags.push('--app-theme', APP_THEME);
    // A previous run with this tag would otherwise be collected as if it were this
    // one, because the harness names its files by tag, width and tab slug.
    for (const stale of fs.readdirSync(HARNESS_OUT)) {
      if (stale.startsWith(`${tag}-${width}-`) && stale.endsWith('.png')) fs.rmSync(path.join(HARNESS_OUT, stale));
    }
    const child = spawn(process.execPath, flags, { cwd: ROOT, env });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve({ tag, out }) : reject(new Error(`exit ${code}\n${out}`))));
  });

/** The harness prints counts and the first dozen offenders; keep both as text. */
const parse = (out) => {
  const grab = (label) => {
    const m = new RegExp(`-- ${label} \\((\\d+)\\) --\\n([\\s\\S]*?)(?=\\n\\n|-- |\\nshots in|$)`).exec(out);
    return m ? { count: Number(m[1]), body: m[2].trim() } : { count: null, body: '' };
  };
  const tabs = /tabs captured: (\d+)\/(\d+)/.exec(out);
  return {
    tabs: tabs ? `${tabs[1]}/${tabs[2]}` : 'not reported',
    consoleErrors: grab('console errors'),
    overflow: grab('horizontal overflow'),
    raw: out.trim(),
  };
};

/** One theme is now several harness invocations, so the theme's report is the
 *  passes folded together: the counts summed, the raw output concatenated. */
const parseRun = (outs) => {
  const reps = outs.map(parse);
  const fold = (key) => ({
    count: reps.reduce((n, r) => n + (r[key].count === null ? 0 : r[key].count), 0),
    body: reps
      .map((r) => r[key].body)
      .filter(Boolean)
      .join('\n'),
  });
  return {
    tabs: [...new Set(reps.map((r) => r.tabs))].join(' then '),
    consoleErrors: fold('consoleErrors'),
    overflow: fold('overflow'),
    raw: reps.map((r) => r.raw).join('\n'),
  };
};

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

const copyIn = (theme, width, tag) => {
  const dir = path.join(OUT, 'web', setFor(theme), String(width));
  fs.mkdirSync(dir, { recursive: true });
  const files = fs
    .readdirSync(HARNESS_OUT)
    .filter((f) => f.startsWith(`${tag}-${width}-`) && f.endsWith('.png'))
    .map((f) => {
      const slug = f.slice(`${tag}-${width}-`.length, -4);
      const to = path.join(dir, `${slug}.png`);
      fs.copyFileSync(path.join(HARNESS_OUT, f), to);
      return {
        tab: slug,
        file: path.relative(OUT, to).replace(/\\/g, '/'),
        bytes: fs.statSync(to).size,
        sha256: sha(to),
      };
    });
  return files;
};

const main = async () => {
  if (!fs.existsSync(HARNESS_OUT)) throw new Error(`${HARNESS_OUT} missing — is qa-shot.cjs able to write it?`);
  const runs = [];
  for (const theme of THEMES) {
    // D6, and the address is recorded so a reviewer can see which tenant each
    // baseline belongs to. It is a throwaway, not a user. Only characters the
    // server's email validator accepts, or the OTP request is rejected outright.
    // Default keeps the Phase 1 shape exactly (`qa-light-…`, `qa-dark-…`); a named
    // set says which run it belongs to.
    const email = `qa-${SET ? TAG_BASE : theme}-${theme}-${Date.now().toString(36)}@example.com`;
    const password = makePassword();
    const tag = tagFor(theme);
    const outs = [];
    const passes = [];
    const shots = [];
    for (let i = 0; i < WIDTHS.length; i++) {
      const width = WIDTHS[i];
      const now = NOW ? new Date(Date.parse(NOW) + i * PASS_STEP_MS).toISOString() : '';
      process.stdout.write(`${theme}: ${width}px against http://localhost:3000${now ? ` at ${now}` : ''} ...\n`);
      const { out } = await run(theme, email, { now, password, width });
      outs.push(out);
      const one = parse(out);
      passes.push({
        width,
        passIndex: i,
        seedMultiplicity: i + 1,
        now: now || null,
        tabs: one.tabs,
        consoleErrors: one.consoleErrors.count,
        overflow: one.overflow.count,
      });
      shots.push(
        ...copyIn(theme, width, tag).map((s) => ({
          ...s,
          // Every baseline carries the three facts that decide what it can be
          // compared with. `seededAt` is the instant the pass pinned its seed to,
          // `passIndex` is its position in the run, and `seedMultiplicity` is how
          // many seeds the tenant held when the shot was taken — the app merges
          // cloud rows into local ones on hydration, so the third pass renders 3×
          // the seeded totals of the first. Without it a 430px baseline looks like a
          // data bug rather than a position in a sequence.
          width: s.width,
          passIndex: i,
          seedMultiplicity: i + 1,
          seededAt: now || null,
          seedAtSource: now ? 'pinned' : 'unrecorded',
        })),
      );
    }
    const rep = parseRun(outs);
    if (shots.length !== WIDTHS.length * 8) {
      throw new Error(`${theme}: expected ${WIDTHS.length * 8} screenshots, collected ${shots.length}`);
    }
    runs.push({
      theme,
      set: setFor(theme),
      appTheme: APP_THEME || null,
      fixedAt: NOW || null,
      passStepMs: NOW ? PASS_STEP_MS : null,
      passes,
      email,
      tag,
      reported: rep,
      screenshots: shots,
    });
    process.stdout.write(
      `  ${rep.tabs} tabs, ${rep.consoleErrors.count} console errors, ${rep.overflow.count} overflowing views\n`,
    );
  }

  // The manifest describes every golden set that has ever been measured, so a run
  // that adds one set must not delete the others. A set is replaced only by a run
  // that names the same set — that is a re-measurement, which is what it looks like
  // and what it is.
  const MANIFEST_FILE = path.join(OUT, 'MANIFEST.json');
  const setNames = new Set(runs.map((r) => r.set));
  const kept = fs.existsSync(MANIFEST_FILE)
    ? JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')).runs.filter((r) => !setNames.has(r.set || r.theme))
    : [];

  const manifest = {
    note:
      'Web pixel baselines for the Flutter parity tests. Produced by `node parity/run_baselines.cjs`, which only ' +
      'drives `qa-shot.cjs` — with its two approved additive flags passed through, and nothing else — against the ' +
      'running app. Each run registers a fresh throwaway tenant (D6); the harness password was generated per child ' +
      "and passed only through its environment (D9), so no secret is stored here. `reported` is the harness's own " +
      'output for that run, kept verbatim. `set` names the subtree under web/; the two Phase 1 sets carry only the ' +
      'OS signal because the stored app theme was never fixed.\n' +
      '\n' +
      '`fixedAt` and `passes[].now` apply to runs made after Phase 5 ruled the two flags. `--now` makes the seed a ' +
      'pure function of an instant, so a re-capture is reproducible: it names the Node clock that writes every seed ' +
      'date and id, and the browser clock that computes every relative label. One instant per width pass, `fixedAt` ' +
      'plus `passStepMs`, because the stamp prefixes every row id the pass inserts and `id` is a primary key with ' +
      'no tenant scope on every app table — a second pass on the same instant collides on insert and the app ' +
      'renders its sync-error banner instead of the screen under test.\n' +
      '\n' +
      'The Phase 1 sets carry no `fixedAt`; their instants were never recorded. They are recoverable, because the ' +
      'row ids are still in the database: `muwgexow`/`muwgfevi`/`muwgfw0u` for the light passes and ' +
      '`muwggex1`/`muwggvxv`/`muwghdis` for the dark ones, base36 of the millisecond each pass seeded at. Those ' +
      'stamps cannot be used again — see the primary key above — so a re-capture of a Phase 1 screen pins to a ' +
      'different instant whose wallet ids hash to the same six deck tones, since faceToneForSeed(wallet.id) is ' +
      'what puts the id into the pixels. Measured under `tolerance`: a Phase 1 re-capture reproduced ' +
      'light/360/overviewhub byte for byte that way.',
    tolerance: TOLERANCE,
    comparability: COMPARABILITY,
    generatedAt: new Date().toISOString(),
    sourceTag: SOURCE_TAG,
    sourceCommit: execFileSync('git', ['rev-parse', SOURCE_TAG], { cwd: ROOT }).toString().trim(),
    widths: WIDTHS,
    runs: [...kept, ...runs],
  };
  // Written through the repo's own Prettier config, so a measurement run leaves the
  // tree exactly as `npm run format:check` wants to find it.
  const raw = JSON.stringify(manifest, null, 2) + '\n';
  const target = MANIFEST_FILE;
  const prettier = require('prettier');
  prettier
    .resolveConfig(target)
    .then((cfg) => prettier.format(raw, { ...cfg, parser: 'json', filepath: target }))
    .then((text) => fs.writeFileSync(target, text, 'utf8'));
  const total = runs.reduce((n, r) => n + r.screenshots.length, 0);
  process.stdout.write(
    `\n${total} baselines under parity/screenshots/web/, manifest at parity/screenshots/MANIFEST.json\n`,
  );
};

// Exported so the rule has one home. MANIFEST.json records these exact objects and
// anything that wants to check what was recorded can read them from here rather than
// carrying a second copy of the wording.
module.exports = { TOLERANCE, COMPARABILITY };

if (require.main === module) {
  main().catch((e) => {
    console.error('BASELINE RUN FAILED:', e.message);
    process.exit(1);
  });
}
