/**
 * Phase 1 fixture gate.
 *
 * `parity/fixtures/*.json` is the contract every later phase is measured
 * against, so a malformed or short fixture set is worse than no fixture set:
 * it would be *trusted*. This script refuses to pass that set. It is a hard
 * gate, run before and after generation.
 *
 * Four independent checks, in this order:
 *
 *  1. Presence and size — every unit LOGIC_SPEC §0 lists must have a file, it
 *     must be non-empty and parse as JSON, and it must carry **at least** the
 *     case count the spec declares. The counts are read out of the markdown at
 *     runtime, so lowering one silently requires editing the spec, which is a
 *     visible change to the contract.
 *  2. Shape — `_provenance` and each case are schema-validated. Tests in this
 *     repo are excluded from `tsc` (BUGS_FOUND B-08), and this file lives
 *     outside `tsconfig.include` entirely, so nothing else would catch a wrong
 *     key, a renamed field or a hand-edited value.
 *  3. Encoding — sentinel and thrown-error payloads form a closed alphabet.
 *     A typo'd `__sentinel__` would read as a valid case and assert nothing.
 *  4. Provenance — the file claims a commit, a blob and a hash; all three are
 *     re-derived from git and the working tree here. A fixture generated from
 *     newer code than `pre-flutter`, or whose source has since drifted, fails.
 *
 * Usage: npx tsx parity/fixtures/validate.ts [--fixtures <dir>]
 * Exit 0 = the set is trustworthy. Exit 1 = every failure above is listed.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const TAG = 'pre-flutter';
const SPEC_PATH = path.join(REPO, 'parity', 'LOGIC_SPEC.md');

/** Must equal `SENTINELS` in generate.ts. Duplicated deliberately: a shared
 *  import would execute the generator (`main()` runs at module scope) and
 *  rewrite the very files being checked. */
const SENTINELS = ['NaN', 'Infinity', '-Infinity', '-0', 'undefined', 'undefined-result'];

/** git is invoked with execFileSync and an argument array, never a shell
 *  string, so no value can become a command. Values read back out of a fixture
 *  are still constrained (see HEX40 / SOURCE_PATH) so that a committed fixture
 *  cannot smuggle a `--` option into git's argv. */
const git = (args: string[]): string => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();
const sha256 = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');

// ---------------------------------------------------------------------------
// schemas
// ---------------------------------------------------------------------------
const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
// A repo-relative source path: no leading dash (git option), no traversal, and
// a TS/TSX extension. Provenance is only meaningful for a file we can re-hash.
const SOURCE_PATH = /^(?!-)(?!(?:.*\/)?\.\.(?:\/|$))[A-Za-z0-9._\/-]+\.tsx?$/;

const provenanceSchema = z.object({
  generatedFrom: z.literal(TAG),
  sourceCommit: z.string().regex(HEX40),
  unitFile: z.string().regex(SOURCE_PATH),
  gitBlob: z.string().regex(HEX40),
  sha256: z.string().regex(HEX64),
  tz: z.string().min(1),
  locale: z.string().min(1),
  node: z.string().min(1),
  pinnedNow: z.string().regex(ISO_INSTANT),
  sentinelAlphabet: z.array(z.string()).length(SENTINELS.length),
});

/** Extra provenance keys are whitelisted rather than ignored: a misspelled
 *  `extracton` would otherwise be stripped and its absence unreported. */
const ALLOWED_EXTRA_PROVENANCE = ['extraction'];

const REQUIRED_CASE_KEYS = ['expected', 'input', 'name'];
const nameSchema = z.string().min(1);

// ---------------------------------------------------------------------------
// the spec table — the authoritative case-count contract
// ---------------------------------------------------------------------------
type SpecUnit = { ordinal: number; unit: string; sourceFile: string; minCases: number };

function readSpecContract(): { units: SpecUnit[]; declaredTotal: number } {
  if (!existsSync(SPEC_PATH)) throw new Error(`LOGIC_SPEC.md is missing at ${SPEC_PATH}`);
  const text = readFileSync(SPEC_PATH, 'utf8');
  const units: SpecUnit[] = [];
  let declaredTotal: number | null = null;

  for (const line of text.split(/\r?\n/)) {
    const row = /^\|\s*(\d+)\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*[^|]+\|\s*(\d+)\s*\|/.exec(line);
    if (row) {
      units.push({ ordinal: Number(row[1]), unit: row[2], sourceFile: row[3], minCases: Number(row[4]) });
      continue;
    }
    const total = /^\|\s*\|\s*\|\s*\|\s*\*\*total\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|/.exec(line);
    if (total) declaredTotal = Number(total[1]);
  }

  if (units.length === 0) throw new Error('LOGIC_SPEC §0 lists no units — the contract table could not be parsed.');
  if (declaredTotal === null)
    throw new Error('LOGIC_SPEC §0 has no **total** row, so the table cannot be self-checked.');
  const sum = units.reduce((a, u) => a + u.minCases, 0);
  if (sum !== declaredTotal) {
    throw new Error(
      `LOGIC_SPEC §0 is internally inconsistent: unit rows sum to ${sum}, the total row says ${declaredTotal}.`,
    );
  }
  const seen = new Set<string>();
  for (const u of units) {
    if (seen.has(u.unit)) throw new Error(`LOGIC_SPEC §0 lists unit "${u.unit}" twice.`);
    seen.add(u.unit);
  }
  return { units, declaredTotal };
}

// ---------------------------------------------------------------------------
// recursive value check (JSON the Dart port can consume faithfully)
// ---------------------------------------------------------------------------
function checkValue(where: string, v: unknown, errs: string[]): void {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return;

  if (typeof v === 'number') {
    // JSON cannot carry these; if one is present the file was not produced by
    // JSON.stringify and its reader will disagree about what it means.
    if (!Number.isFinite(v) || Object.is(v, -0)) {
      errs.push(`${where}: bare number ${String(v)} must be encoded as {"__sentinel__": "..."}`);
    }
    return;
  }

  if (Array.isArray(v)) {
    v.forEach((item, i) => checkValue(`${where}[${i}]`, item, errs));
    return;
  }

  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj);
    const reserved = keys.filter((k) => k === '__sentinel__' || k === '__throws__');
    if (reserved.length > 0) {
      if (keys.length !== 1) {
        errs.push(`${where}: reserved key ${reserved[0]} must be the only key, found [${keys.join(', ')}]`);
        return;
      }
      if (reserved[0] === '__sentinel__') {
        const s = obj.__sentinel__;
        if (typeof s !== 'string' || !SENTINELS.includes(s)) {
          errs.push(`${where}: unknown sentinel ${JSON.stringify(s)}; the alphabet is closed (${SENTINELS.join('|')})`);
        }
      } else {
        const t = obj.__throws__;
        if (typeof t !== 'string' || t.trim().length === 0) {
          errs.push(`${where}: __throws__ must hold a non-empty "Name: message" string`);
        }
      }
      return;
    }
    for (const k of keys) checkValue(`${where}.${k}`, obj[k], errs);
    return;
  }

  errs.push(`${where}: value of type ${typeof v} is not representable in this fixture format`);
}

// ---------------------------------------------------------------------------
// per-unit validation
// ---------------------------------------------------------------------------
type UnitResult = { unit: string; cases: number; minCases: number; errors: string[] };

function validateUnit(spec: SpecUnit, fixturesDir: string, tagCommit: string): UnitResult {
  const errors: string[] = [];
  const file = path.join(fixturesDir, `${spec.unit}.json`);
  let cases: number = 0;

  if (!existsSync(file)) {
    errors.push(`fixture file missing: ${path.relative(REPO, file)}`);
    return { unit: spec.unit, cases, minCases: spec.minCases, errors };
  }

  const size = statSync(file).size;
  if (size === 0) {
    errors.push(`fixture file is empty (0 bytes) — generation was interrupted or never ran`);
    return { unit: spec.unit, cases, minCases: spec.minCases, errors };
  }

  const raw = readFileSync(file, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    errors.push(`fixture file is not valid JSON: ${(e as Error).message}`);
    return { unit: spec.unit, cases, minCases: spec.minCases, errors };
  }

  const root = z
    .object({ _provenance: z.unknown(), cases: z.array(z.unknown()) })
    .strict()
    .safeParse(parsed);
  if (!root.success) {
    for (const issue of root.error.issues) {
      errors.push(`envelope: ${issue.path.join('.') || '(root)'} — ${issue.message}`);
    }
    return { unit: spec.unit, cases, minCases: spec.minCases, errors };
  }

  // --- provenance shape ---
  const provKeys = Object.keys(root.data._provenance as object).sort();
  const prov = provenanceSchema.safeParse(root.data._provenance);
  if (!prov.success) {
    for (const issue of prov.error.issues) {
      errors.push(`_provenance.${issue.path.join('.') || '(root)'} — ${issue.message}`);
    }
    return { unit: spec.unit, cases, minCases: spec.minCases, errors };
  }
  const p = prov.data;
  const unexpectedProv = provKeys.filter(
    (k) => !Object.keys(provenanceSchema.shape).includes(k) && !ALLOWED_EXTRA_PROVENANCE.includes(k),
  );
  if (unexpectedProv.length > 0) errors.push(`_provenance has unrecognised keys: ${unexpectedProv.join(', ')}`);

  if (JSON.stringify(p.sentinelAlphabet) !== JSON.stringify(SENTINELS)) {
    errors.push(
      `_provenance.sentinelAlphabet ${JSON.stringify(p.sentinelAlphabet)} != the validator's alphabet ${JSON.stringify(SENTINELS)}`,
    );
  }
  if (p.unitFile !== spec.sourceFile) {
    errors.push(`_provenance.unitFile "${p.unitFile}" != LOGIC_SPEC §0 source "${spec.sourceFile}"`);
  }

  // --- provenance truth, re-derived from git ---
  if (p.sourceCommit !== tagCommit) {
    errors.push(`_provenance.sourceCommit ${p.sourceCommit} is not what ${TAG} resolves to today (${tagCommit})`);
  }
  let blobAtCommit: string;
  try {
    blobAtCommit = git(['rev-parse', `${p.sourceCommit}:${p.unitFile}`]);
  } catch {
    blobAtCommit = '';
    errors.push(`${p.unitFile} is not present in commit ${p.sourceCommit}`);
  }
  if (blobAtCommit && blobAtCommit !== p.gitBlob) {
    errors.push(
      `_provenance.gitBlob ${p.gitBlob} != git's blob for ${p.unitFile} at ${p.sourceCommit} (${blobAtCommit})`,
    );
  }
  let workBlob: string;
  try {
    workBlob = git(['hash-object', p.unitFile]);
  } catch {
    workBlob = '';
    errors.push(`${p.unitFile} is missing from the working tree, so this golden cannot be reproduced`);
  }
  if (workBlob && workBlob !== p.gitBlob) {
    errors.push(
      `SOURCE DRIFT: working-tree ${p.unitFile} is blob ${workBlob} but the golden describes ${p.gitBlob}. Regenerate from ${TAG} or restore the file.`,
    );
  }
  if (workBlob) {
    const digest = sha256(readFileSync(path.join(REPO, p.unitFile)));
    if (digest !== p.sha256)
      errors.push(`_provenance.sha256 ${p.sha256} != sha256 of the working-tree file (${digest})`);
  }

  // --- the extracted snippet, when a unit is measured by extraction ---
  if ('extraction' in (root.data._provenance as object)) {
    const ex = (root.data._provenance as Record<string, unknown>).extraction as Record<string, unknown>;
    const exKeys = ['charRange', 'extractedSource', 'from', 'note', 'sha256OfExtractedSource'];
    const got = Object.keys(ex).sort();
    if (JSON.stringify(got) !== JSON.stringify([...exKeys].sort())) {
      errors.push(`_provenance.extraction keys ${JSON.stringify(got)} != ${JSON.stringify(exKeys)}`);
    } else if (typeof ex.extractedSource === 'string') {
      const blobText = git(['show', `${p.sourceCommit}:${p.unitFile}`]);
      if (!blobText.includes(ex.extractedSource)) {
        errors.push('the recorded extracted source is not a substring of the file at its own provenance commit');
      }
      if (sha256(ex.extractedSource) !== ex.sha256OfExtractedSource) {
        errors.push('_provenance.extraction.sha256OfExtractedSource does not match the recorded source');
      }
    }
  }

  // --- cases ---
  const list = root.data.cases;
  cases = list.length;
  if (cases === 0) errors.push('the "cases" array is empty');
  else if (cases < spec.minCases) {
    errors.push(`only ${cases} cases; LOGIC_SPEC §0 requires at least ${spec.minCases} for "${spec.unit}"`);
  }

  const names = new Map<string, number>();
  list.forEach((entry, i) => {
    const where = `cases[${i}]`;
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${where}: a case must be an object`);
      return;
    }
    const keys = Object.keys(entry as object).sort();
    if (JSON.stringify(keys) !== JSON.stringify(REQUIRED_CASE_KEYS)) {
      errors.push(
        `${where}: keys ${JSON.stringify(keys)} != ${JSON.stringify(REQUIRED_CASE_KEYS)} (all three are required, no extras)`,
      );
      return;
    }
    const c = entry as { name: unknown; input: unknown; expected: unknown };
    const nm = nameSchema.safeParse(c.name);
    if (!nm.success) {
      errors.push(`${where}.name — ${nm.error.issues[0].message}`);
      return;
    }
    const prior = names.get(nm.data);
    if (prior !== undefined)
      errors.push(`${where}.name "${nm.data}" collides with cases[${prior}]; a name-keyed test suite would drop one`);
    else names.set(nm.data, i);
    checkValue(`${where}.input`, c.input, errors);
    checkValue(`${where}.expected`, c.expected, errors);
  });

  return { unit: spec.unit, cases, minCases: spec.minCases, errors };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
function main(): void {
  const argv = process.argv.slice(2);
  let fixturesDir = HERE;
  const dirFlag = argv.indexOf('--fixtures');
  if (dirFlag >= 0) {
    const value = argv[dirFlag + 1];
    if (!value) throw new Error('--fixtures needs a directory');
    fixturesDir = path.resolve(REPO, value);
  }

  const spec = readSpecContract();
  const tagCommit = git(['rev-list', '-n', '1', TAG]);
  console.log(`\nPhase 1 fixture gate`);
  console.log(
    `  spec      ${path.relative(REPO, SPEC_PATH)} (${spec.units.length} units, ${spec.declaredTotal} required cases)`,
  );
  console.log(`  fixtures  ${path.relative(REPO, fixturesDir) || '.'}`);
  console.log(`  ${TAG} -> ${tagCommit}\n`);

  const wanted = new Set(spec.units.map((u) => u.unit));
  const present = readdirSync(fixturesDir).filter((f) => f.endsWith('.json'));
  const stale = present.filter((f) => !wanted.has(f.replace(/\.json$/, '')));

  console.log(`  ${'unit'.padEnd(20)}${'cases'.padStart(7)}${'min'.padStart(7)}   margin`);
  const results: UnitResult[] = [];
  for (const u of spec.units) {
    const r = validateUnit(u, fixturesDir, tagCommit);
    results.push(r);
    const margin = r.cases - r.minCases;
    console.log(
      `  ${u.unit.padEnd(20)}${String(r.cases).padStart(7)}${String(r.minCases).padStart(7)}   ${margin >= 0 ? `+${margin}` : 'SHORT'}`,
    );
  }

  const errors: string[] = [];
  for (const r of results) for (const e of r.errors) errors.push(`${r.unit}: ${e}`);

  let generatedTotal = 0;
  for (const r of results) generatedTotal += r.cases;
  console.log(
    `  ${'total'.padEnd(20)}${String(generatedTotal).padStart(7)}${String(spec.declaredTotal).padStart(7)}   +${generatedTotal - spec.declaredTotal}\n`,
  );

  if (stale.length > 0) {
    errors.push(
      `unlisted fixture files present — either a unit was renamed or a stale golden is still on disk: ${stale.join(', ')}`,
    );
  }

  if (errors.length > 0) {
    console.log(`FAIL — ${errors.length} problem(s):`);
    for (const e of errors) console.log(`  - ${e}`);
    console.log('');
    process.exit(1);
  }
  console.log(
    `PASS — ${results.length} units, ${generatedTotal} cases, every file schema-valid and provenance-verified against ${TAG}.\n`,
  );
}

main();
