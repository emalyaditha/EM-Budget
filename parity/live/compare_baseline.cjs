/**
 * Is a re-capture the same measurement as a committed baseline?
 *
 * The rule is not byte-identity. Rasterization moves a few pixels by a few levels on
 * every run and the PNG stream size moves with them, so the comparison is on decoded
 * RGB. The three clauses — and the `animate-pulse` sync dot that made a single hard
 * maximum the wrong shape — are recorded in `parity/screenshots/MANIFEST.json` under
 * `tolerance`, and read from there rather than repeated here: MANIFEST is the file a
 * re-capture is judged against, so the judgement has to travel with it.
 *
 * This is the harness-reproducibility criterion only. It is not the Flutter-vs-web
 * parity tolerance, which is ruled separately.
 *
 * The committed side is also checked against the sha256 MANIFEST recorded for it, so a
 * passing comparison cannot be quietly earned against an edited golden.
 *
 *   node parity/live/compare_baseline.cjs web/dark/430/savingsjars.png /d/tmp/qa/shot.png
 *   node parity/live/compare_baseline.cjs <baseline path or repo-relative key> <candidate.png>
 *
 * Exit 0 = PASS, 1 = FAIL. Decodes with node:zlib only; nothing is installed for it.
 */
const zlib = require('zlib');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'screenshots');

/** PNG -> raw RGB(A) rows: inflate IDAT, then undo the per-row filter. */
const decode = (file) => {
  const buf = fs.readFileSync(file);
  const chunks = [];
  for (let o = 8; o < buf.length;) {
    const len = buf.readUInt32BE(o);
    chunks.push({ type: buf.toString('ascii', o + 4, o + 8), data: buf.subarray(o + 8, o + 8 + len) });
    o += 12 + len;
  }
  const ihdr = chunks.find((c) => c.type === 'IHDR').data;
  const [w, h] = [ihdr.readUInt32BE(0), ihdr.readUInt32BE(4)];
  const ch = ihdr[9] === 6 ? 4 : ihdr[9] === 2 ? 3 : 0;
  if (!ch) throw new Error(`${file}: colour type ${ihdr[9]} is not RGB or RGBA`);
  if (ihdr[8] !== 8 || ihdr[12] !== 0) throw new Error(`${file}: only 8-bit non-interlaced PNGs are supported`);
  const raw = zlib.inflateSync(Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data)));
  const stride = w * ch;
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const cur = px.subarray(y * stride, y * stride + stride);
    raw.copy(cur, 0, y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const up = y ? px.subarray((y - 1) * stride, (y - 1) * stride + stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0;
      const b = up ? up[i] : 0;
      const c = up && i >= ch ? up[i - ch] : 0;
      if (f === 0) continue;
      if (f === 1) cur[i] = (cur[i] + a) & 255;
      else if (f === 2) cur[i] = (cur[i] + b) & 255;
      else if (f === 3) cur[i] = (cur[i] + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        cur[i] = (cur[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      } else throw new Error(`${file}: unknown filter type ${f} on row ${y}`);
    }
  }
  return { w, h, ch, px };
};

/** A baseline is addressed by its MANIFEST key, or by any path to a PNG on disk. */
const resolve = (arg) => {
  const byKey = path.join(SHOTS, arg);
  if (fs.existsSync(byKey)) return byKey;
  if (fs.existsSync(arg)) return path.resolve(arg);
  throw new Error(`no such PNG: ${arg} (nor parity/screenshots/${arg})`);
};

const [aArg, bArg] = process.argv.slice(2);
if (!aArg || !bArg) {
  console.error('usage: node parity/live/compare_baseline.cjs <committed baseline> <candidate png>');
  process.exit(2);
}
const MAN = JSON.parse(fs.readFileSync(path.join(SHOTS, 'MANIFEST.json'), 'utf8'));
const clauses = MAN.tolerance.clauses;
const A = decode(resolve(aArg));
const B = decode(resolve(bArg));

const key = path.relative(SHOTS, resolve(aArg)).replace(/\\/g, '/');
const recorded = MAN.runs.flatMap((r) => r.screenshots).find((s) => s.file === key);
const problems = [];
if (A.w !== B.w || A.h !== B.h) {
  console.log(`FAIL  ${key}\n  geometry ${A.w}x${A.h} vs ${B.w}x${B.h}`);
  process.exit(1);
}

const lines = [];
// One pass over the pixels, counting against every clause threshold at once.
const over = clauses.map(() => 0);
let maxDelta = 0;
let touched = 0;
let worstAt = null;
for (let i = 0; i < A.w * A.h; i++) {
  let d = 0;
  for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(A.px[i * A.ch + k] - B.px[i * B.ch + k]));
  if (d) {
    touched++;
    if (d > maxDelta) {
      maxDelta = d;
      worstAt = `${i % A.w},${Math.floor(i / A.w)}`;
    }
  }
  clauses.forEach((c, n) => {
    if (d > c.channelDelta) over[n]++;
  });
}
const n = A.w * A.h;
clauses.forEach((c, i) => {
  const limit = c.maxPixelRatio !== undefined ? c.maxPixelRatio * n : c.maxPixelCount;
  const got = over[i];
  const ok = got <= limit;
  if (!ok) problems.push(c.id);
  lines.push(
    `  ${ok ? 'ok  ' : 'FAIL'}  ${c.id.padEnd(9)} ${String(got).padStart(6)} px > ${String(c.channelDelta).padStart(2)}/255` +
      `  (limit ${c.maxPixelRatio !== undefined ? (c.maxPixelRatio * 100).toFixed(3) + '%' : c.maxPixelCount})`,
  );
});
if (recorded) {
  const sha = crypto
    .createHash('sha256')
    .update(fs.readFileSync(resolve(aArg)))
    .digest('hex');
  const ok = sha === recorded.sha256;
  if (!ok) problems.push('golden-hash');
  lines.push(`  ${ok ? 'ok  ' : 'FAIL'}  golden    sha256 ${ok ? 'matches' : 'does not match'} MANIFEST`);
} else {
  problems.push('not-in-manifest');
  lines.push(`  FAIL  golden    ${key} is not recorded in MANIFEST.json`);
}
console.log(
  [
    `${problems.length ? 'FAIL' : 'PASS'}  ${key} vs ${bArg}`,
    ...lines,
    `        max delta ${maxDelta}/255${worstAt ? ` at (${worstAt})` : ''}, ${touched} of ${n} pixels touched`,
    problems.length ? `        breached: ${problems.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n'),
);
process.exit(problems.length ? 1 : 0);
