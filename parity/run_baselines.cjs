/**
 * Phase 1 pixel baselines.
 *
 * Drives `qa-shot.cjs` exactly as the web app ships it — no flag the harness does
 * not already understand, no patched copy, no second harness — once per theme, and
 * folds what comes back into `parity/screenshots/`.
 *
 * Two rules the playbook put on this run:
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
/** Every baseline is stamped with the source it came from; `render_ui_spec.cjs` refuses
 *  to publish §9 if that is not the same commit the colour numbers were measured at. */
const SOURCE_TAG = 'pre-flutter';

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

const run = (theme, email) =>
  new Promise((resolve, reject) => {
    const tag = `p1base-${theme}`;
    // Removing it from this process's own environment is the point: `npm run dev`
    // and the app never see it, and neither does anything that reads the shell.
    const env = { ...process.env, QA_HARNESS_PASSWORD: makePassword() };
    const child = spawn(
      process.execPath,
      [path.join(ROOT, 'qa-shot.cjs'), '--tag', tag, '--theme', theme, '--widths', WIDTHS.join(','), '--email', email],
      { cwd: ROOT, env },
    );
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

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

const copyIn = (theme, width, tag) => {
  const dir = path.join(OUT, 'web', theme, String(width));
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

(async () => {
  if (!fs.existsSync(HARNESS_OUT)) throw new Error(`${HARNESS_OUT} missing — is qa-shot.cjs able to write it?`);
  const runs = [];
  for (const theme of THEMES) {
    // D6, and the address is recorded so a reviewer can see which tenant each
    // baseline belongs to. It is a throwaway, not a user. Only characters the
    // server's email validator accepts, or the OTP request is rejected outright.
    const email = `qa-${theme}-${Date.now().toString(36)}@example.com`;
    process.stdout.write(`${theme}: running the harness against http://localhost:3000 ...\n`);
    const { tag, out } = await run(theme, email);
    const rep = parse(out);
    const shots = WIDTHS.flatMap((w) => copyIn(theme, w, tag).map((s) => ({ ...s, width: w })));
    if (shots.length !== WIDTHS.length * 8) {
      throw new Error(`${theme}: expected ${WIDTHS.length * 8} screenshots, collected ${shots.length}`);
    }
    runs.push({ theme, email, tag, reported: rep, screenshots: shots });
    process.stdout.write(
      `  ${rep.tabs} tabs, ${rep.consoleErrors.count} console errors, ${rep.overflow.count} overflowing views\n`,
    );
  }

  const manifest = {
    note:
      'Web pixel baselines for the Flutter parity tests. Produced by `node parity/run_baselines.cjs`, which only ' +
      'drives the untouched `qa-shot.cjs` against the running app. Each run registers a fresh throwaway tenant (D6); ' +
      'the harness password was generated per child and passed only through its environment (D9), so no secret is ' +
      "stored here. `reported` is the harness's own output for that run, kept verbatim.",
    generatedAt: new Date().toISOString(),
    sourceTag: SOURCE_TAG,
    sourceCommit: execFileSync('git', ['rev-parse', SOURCE_TAG], { cwd: ROOT }).toString().trim(),
    widths: WIDTHS,
    runs,
  };
  // Written through the repo's own Prettier config, so a measurement run leaves the
  // tree exactly as `npm run format:check` wants to find it.
  const raw = JSON.stringify(manifest, null, 2) + '\n';
  const target = path.join(OUT, 'MANIFEST.json');
  const prettier = require('prettier');
  prettier
    .resolveConfig(target)
    .then((cfg) => prettier.format(raw, { ...cfg, parser: 'json', filepath: target }))
    .then((text) => fs.writeFileSync(target, text, 'utf8'));
  const total = runs.reduce((n, r) => n + r.screenshots.length, 0);
  process.stdout.write(
    `\n${total} baselines under parity/screenshots/web/, manifest at parity/screenshots/MANIFEST.json\n`,
  );
})().catch((e) => {
  console.error('BASELINE RUN FAILED:', e.message);
  process.exit(1);
});
