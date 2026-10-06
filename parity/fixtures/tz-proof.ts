/**
 * Timezone-stability proof for the Phase 1 goldens (LOGIC_SPEC §6).
 *
 * The local-midnight date regime is timezone-sensitive by construction, so a
 * golden is only meaningful once you know whether it would move on another
 * machine. This runs the generator once per zone in a fresh child process,
 * keeps each zone's output, restores the canonical zone, and reports which
 * cases actually changed.
 *
 * Node reads `TZ` from the environment block at startup. A shell prefix is not
 * enough on this platform (the variable does not reach the child), so each run
 * is spawned with an explicit `env` object — and one process per zone, because
 * the generator caches nothing but `Date` does.
 *
 * Usage: npx tsx parity/fixtures/tz-proof.ts
 * Writes only into parity/.tz/ and rewrites parity/fixtures/ as it goes,
 * restoring the canonical zone before it exits.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const GENERATOR = path.join(HERE, 'generate.ts');
const VALIDATOR = path.join(HERE, 'validate.ts');
const TSX_CLI = path.join(REPO, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const SANDBOX = path.join(REPO, 'parity', '.tz');

// Sri Lanka, the product's home zone and this machine's default; a zone west of
// Greenwich, which is what splits `YYYY-MM-01` into the previous month; and the
// furthest east, which is the opposite failure.
const ZONES = ['Asia/Colombo', 'America/New_York', 'Pacific/Kiritimati'];

const run = (script: string, zone: string): void => {
  execFileSync(process.execPath, [TSX_CLI, script], {
    cwd: REPO,
    env: { ...process.env, TZ: zone },
    stdio: 'pipe',
  });
};

const zoneDir = (zone: string): string => path.join(SANDBOX, zone.replace(/[^\w.-]/g, '_'));

function snapshot(zone: string): void {
  const dest = zoneDir(zone);
  mkdirSync(dest, { recursive: true });
  for (const f of readdirSync(HERE).filter((x) => x.endsWith('.json'))) {
    copyFileSync(path.join(HERE, f), path.join(dest, f));
  }
}

type Case = { name: string; input: unknown; expected: unknown };

function casesOf(zone: string, unit: string): Map<string, { input: string; expected: string }> {
  const file = path.join(zoneDir(zone), `${unit}.json`);
  const body = JSON.parse(readFileSync(file, 'utf8')) as { cases: Case[] };
  return new Map(
    body.cases.map((c) => [c.name, { input: JSON.stringify(c.input), expected: JSON.stringify(c.expected) }]),
  );
}

function main(): void {
  const canonical = (
    JSON.parse(readFileSync(path.join(HERE, 'money.json'), 'utf8')) as {
      _provenance: { tz: string };
    }
  )._provenance.tz;
  if (!ZONES.includes(canonical)) ZONES.unshift(canonical);

  console.log(`\nTimezone-stability proof`);
  console.log(`  canonical zone (the committed goldens): ${canonical}`);
  console.log(`  zones to compare: ${ZONES.join(', ')}\n`);

  rmSync(SANDBOX, { recursive: true, force: true });
  let failed: string | null = null;
  try {
    for (const zone of ZONES) {
      run(GENERATOR, zone);
      snapshot(zone);
      console.log(`  generated under ${zone.padEnd(20)} ok`);
    }
  } catch (e) {
    failed = (e as Error).message;
  } finally {
    // Whatever happened, leave parity/fixtures describing the canonical zone.
    try {
      run(GENERATOR, canonical);
      console.log(`\n  restored ${canonical}`);
    } catch {
      console.error(
        'COULD NOT RESTORE the canonical zone — re-run generate.ts under TZ=' + canonical + ' before trusting the set.',
      );
      process.exit(1);
    }
    try {
      execFileSync(process.execPath, [TSX_CLI, VALIDATOR], {
        cwd: REPO,
        env: { ...process.env, TZ: canonical },
        stdio: 'inherit',
      });
    } catch {
      console.error('VALIDATOR FAILED ON THE RESTORED SET — the goldens are not in a known-good state.');
      process.exit(1);
    }
  }
  if (failed) {
    console.error(`generation failed under one of the zones: ${failed}`);
    process.exit(1);
  }

  const units = readdirSync(zoneDir(canonical))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));

  console.log(`\n  unit                  cases   zone-sensitive`);
  const all: string[] = [];
  let totalCases = 0;
  for (const unit of units) {
    const base = casesOf(canonical, unit);
    const others = ZONES.filter((z) => z !== canonical).map((z) => [z, casesOf(z, unit)] as const);
    const hits: string[] = [];
    for (const [name, val] of base) {
      for (const [z, cmp] of others) {
        const c = cmp.get(name);
        if (!c) {
          hits.push(`${unit}/${name}: absent under ${z}`);
          continue;
        }
        if (c.expected !== val.expected) {
          hits.push(`${unit}/${name}: ${canonical} ${val.expected}  vs  ${z} ${c.expected}`);
        } else if (c.input !== val.input) {
          hits.push(`${unit}/${name}: input encoding differs under ${z}`);
        }
      }
    }
    totalCases += base.size;
    all.push(...hits);
    console.log(
      `  ${unit.padEnd(20)}${String(base.size).padStart(6)}${String(hits.length).padStart(15)}${hits.length ? '' : '   stable'}`,
    );
  }

  console.log(`\n${totalCases} cases compared across ${ZONES.length} zones; ${all.length} differ.\n`);
  for (const h of all.slice(0, 40)) console.log(`  - ${h.slice(0, 190)}`);
  if (all.length > 40) console.log(`  … ${all.length - 40} more`);
  // The per-zone copies exist only to be diffed. Leaving them behind would put a
  // second, non-canonical copy of every golden in the tree, where prettier and any
  // later reader would find them. A failed run stops before this and keeps them.
  rmSync(SANDBOX, { recursive: true, force: true });
  console.log('');
}

main();
