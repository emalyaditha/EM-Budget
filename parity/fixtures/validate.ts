/**
 * Phase 1 fixture gate.
 *
 * `parity/fixtures/*.json` is the contract every later phase is measured
 * against, so a malformed or short fixture set is worse than no fixture set:
 * it would be *trusted*. This script refuses to pass that set. It is a hard
 * gate, run before and after generation.
 *
 * Five independent checks, in this order:
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
 *  5. Faithfulness — within one unit, the recorded `input` must determine the
 *     `expected`. Two cases that call the same function with a byte-identical
 *     argument list and disagree about the answer prove that `input` is a
 *     *digest* of the scenario rather than its arguments, and that the Dart
 *     port is reading the case name, not the data.
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
import { sha256File, srcTreeDigest } from './src-tree';

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

/** `src-tree.ts` is the one generator-side module this file may import: it has no `main()`,
 *  no side effects and reads nothing but the tree, so sharing it cannot rewrite what we are
 *  checking. Sharing the *digest* is the whole point — a validator that recomputed the stamp
 *  by a second definition would silently disagree with the generator instead of catching drift. */
const SRC_TREE_NOW = srcTreeDigest(REPO);

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
  srcTree: z.string().regex(HEX64),
  tz: z.string().min(1),
  locale: z.string().min(1),
  node: z.string().min(1),
  pinnedNow: z.string().regex(ISO_INSTANT),
  sentinelAlphabet: z.array(z.string()).length(SENTINELS.length),
});

/** Extra provenance keys are whitelisted rather than ignored: a misspelled
 *  `extracton` would otherwise be stripped and its absence unreported. */
const ALLOWED_EXTRA_PROVENANCE = ['extraction', 'harness'];

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
// check 5 — does the recorded input determine the expected?
// ---------------------------------------------------------------------------
/** Canonical JSON: keys sorted, so `{a:1,b:2}` and `{b:2,a:1}` compare equal.
 *  Object key order carries no meaning to a fixture reader (a map lookup), so
 *  order is *not* a licence for two cases to disagree about an answer. Sentinels
 *  are already plain objects by the time they get here, so `undefined` stays
 *  distinct from an absent key and `-0` stays distinct from `0`. */
function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(',')}}`;
}

/** The callee a case name claims to measure: the identifier immediately before
 *  the first `(`. `advanceDueDate^3(…)` and `pair: engine vs display (…)` do not
 *  match, so each becomes its own group — a name that is not a plain call site is
 *  never merged with one that is. */
function calleeOf(name: string): string {
  const m = /^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\(/.exec(name);
  return m ? m[1] : name;
}

/**
 * Units whose generator still records a scenario digest instead of the argument
 * list. This is a debt register, not a pass: the check still reports every
 * collision, and each entry names the task that clears it. A unit leaves this
 * map in the same commit that fixes its `measure(...)` calls — an entry with no
 * remaining collision is a stale exemption, so the map is checked for that too.
 *
 * Empty since #64: `net-worth` left it in #62 and `transaction-service` in #64,
 * each time forced by the stale check rather than by goodwill. An empty map does
 * not disable check 5 — with nothing to exempt, the next digest-recorded case is
 * a hard failure, not a warning.
 */
const PROJECTION_DEBT: Record<string, string> = {};

function checkDeterminism(cases: Array<{ name: string; input: unknown; expected: unknown }>): string[] {
  const byGroup = new Map<string, Map<string, Array<{ name: string; expected: string }>>>();
  for (const c of cases) {
    const g = calleeOf(c.name);
    if (!byGroup.has(g)) byGroup.set(g, new Map());
    const byInput = byGroup.get(g)!;
    const k = canonical(c.input);
    if (!byInput.has(k)) byInput.set(k, []);
    byInput.get(k)!.push({ name: c.name, expected: canonical(c.expected) });
  }
  const collisions: string[] = [];
  for (const [g, byInput] of byGroup) {
    for (const [, list] of byInput) {
      const answers = new Set(list.map((x) => x.expected));
      if (list.length > 1 && answers.size > 1) {
        collisions.push(
          `${g}: ${list.length} cases share one recorded input but assert ${answers.size} different answers — ` +
            `[${list.map((x) => x.name).join(', ')}]`,
        );
      }
    }
  }
  return collisions;
}

// ---------------------------------------------------------------------------
// per-unit validation
// ---------------------------------------------------------------------------
type UnitResult = { unit: string; cases: number; minCases: number; errors: string[]; warnings: string[] };

function validateUnit(spec: SpecUnit, fixturesDir: string, tagCommit: string): UnitResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const wellFormed: Array<{ name: string; input: unknown; expected: unknown }> = [];
  const file = path.join(fixturesDir, `${spec.unit}.json`);
  let cases: number = 0;

  if (!existsSync(file)) {
    errors.push(`fixture file missing: ${path.relative(REPO, file)}`);
    return { unit: spec.unit, cases, minCases: spec.minCases, errors, warnings };
  }

  const size = statSync(file).size;
  if (size === 0) {
    errors.push(`fixture file is empty (0 bytes) — generation was interrupted or never ran`);
    return { unit: spec.unit, cases, minCases: spec.minCases, errors, warnings };
  }

  const raw = readFileSync(file, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    errors.push(`fixture file is not valid JSON: ${(e as Error).message}`);
    return { unit: spec.unit, cases, minCases: spec.minCases, errors, warnings };
  }

  const root = z
    .object({ _provenance: z.unknown(), cases: z.array(z.unknown()) })
    .strict()
    .safeParse(parsed);
  if (!root.success) {
    for (const issue of root.error.issues) {
      errors.push(`envelope: ${issue.path.join('.') || '(root)'} — ${issue.message}`);
    }
    return { unit: spec.unit, cases, minCases: spec.minCases, errors, warnings };
  }

  // --- provenance shape ---
  const provKeys = Object.keys(root.data._provenance as object).sort();
  const prov = provenanceSchema.safeParse(root.data._provenance);
  if (!prov.success) {
    for (const issue of prov.error.issues) {
      errors.push(`_provenance.${issue.path.join('.') || '(root)'} — ${issue.message}`);
    }
    return { unit: spec.unit, cases, minCases: spec.minCases, errors, warnings };
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
    const digest = sha256File(REPO, p.unitFile);
    if (digest !== p.sha256)
      errors.push(`_provenance.sha256 ${p.sha256} != content sha256 of the working-tree file (${digest})`);
  }

  // --- the tree, not just the file ---
  // A unit's own blob proves `net-worth.json` was measured against the current `utils.ts`.
  // It says nothing about the `money.ts` that `utils.ts` calls, so that golden could keep
  // passing against arithmetic that no longer exists. This is the check that closes it, and
  // it is the reason a change anywhere in `src/` invalidates every fixture at once.
  if (p.srcTree !== SRC_TREE_NOW) {
    const drifted = git(['diff', '--name-only', TAG, '--', 'src']).split('\n').filter(Boolean);
    errors.push(
      drifted.length > 0
        ? `STALE AGAINST THE src/ TREE: this golden was measured against src-tree ${p.srcTree}, the tree now hashes to ` +
            `${SRC_TREE_NOW}. ${drifted.length} file(s) under src/ differ from ${TAG}: ${drifted.join(', ')}. ` +
            `Restore the tree or regenerate — every fixture, not only the units whose own file moved.`
        : `STALE AGAINST THE src/ TREE: this golden was measured against src-tree ${p.srcTree}, but the working tree's src/ ` +
            `hashes to ${SRC_TREE_NOW} while matching ${TAG}. The tree did not move under the fixture, so the stamp or the ` +
            `covered-file set did — check src-tree.ts before believing either side.`,
    );
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

  // --- the live-UI harness, when a golden was measured through the real app ---
  // A fixture like this one is not a pure-function call: it describes a browser
  // session that started from a specific seeded ledger. If that seed changes, the
  // goldens describe an app that no longer exists, so the digest is re-derived
  // here rather than trusted.
  const hasHarness = 'harness' in (root.data._provenance as object);
  // The app-handlers golden is a browser measurement, not a call: without the
  // harness block the file is an unlabelled list of state diffs.
  if (spec.unit === 'app-handlers' && !hasHarness) {
    errors.push('_provenance.harness is required for "app-handlers"');
  }
  if (hasHarness) {
    const h = (root.data._provenance as Record<string, unknown>).harness as Record<string, unknown>;
    const hKeys = ['clock', 'cloud', 'ids', 'seed', 'surface'];
    const gotH = Object.keys(h).sort();
    if (JSON.stringify(gotH) !== JSON.stringify(hKeys)) {
      errors.push(`_provenance.harness keys ${JSON.stringify(gotH)} != ${JSON.stringify(hKeys)}`);
    } else {
      for (const k of ['clock', 'cloud', 'ids', 'surface']) {
        if (typeof h[k] !== 'string' || (h[k] as string).length === 0) {
          errors.push(`_provenance.harness.${k} must be a non-empty string describing the harness`);
        }
      }
      if (typeof h.seed !== 'string' || !HEX64.test(h.seed)) {
        errors.push('_provenance.harness.seed must be a lowercase sha256 hex digest');
      } else {
        const seedPath = 'parity/live/seed-state.json';
        try {
          const digest = sha256File(REPO, seedPath);
          if (digest !== h.seed) {
            errors.push(
              `SOURCE DRIFT: working-tree ${seedPath} is sha256 ${digest} but the golden was measured from ${h.seed}. Re-run the harness.`,
            );
          }
        } catch {
          errors.push(`${seedPath} is missing from the working tree, so this golden cannot be reproduced`);
        }
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
    wellFormed.push({ name: nm.data, input: c.input, expected: c.expected });
  });

  // --- check 5: the recorded input must determine the expected ---
  const collisions = checkDeterminism(wellFormed);
  const debt = PROJECTION_DEBT[spec.unit];
  if (collisions.length > 0 && debt) {
    for (const c of collisions) warnings.push(`${c} — known debt, ${debt}`);
  } else {
    for (const c of collisions) {
      errors.push(`recorded input does not determine expected; ${c}. Record the real argument list.`);
    }
    if (collisions.length === 0 && debt) {
      errors.push(
        `PROJECTION_DEBT exempts "${spec.unit}" but no collision remains — the generator is fixed; delete the exemption.`,
      );
    }
  }

  return { unit: spec.unit, cases, minCases: spec.minCases, errors, warnings };
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
  const warnings: string[] = [];
  for (const r of results) for (const e of r.errors) errors.push(`${r.unit}: ${e}`);
  for (const r of results) for (const w of r.warnings) warnings.push(`${r.unit}: ${w}`);

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

  if (warnings.length > 0) {
    console.log(`KNOWN DEBT — ${warnings.length} projection loss(es) recorded in PROJECTION_DEBT, not passing:`);
    for (const w of warnings) console.log(`  ! ${w}`);
    console.log('');
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
