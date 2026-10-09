/**
 * The stamp that says **which `src/` a fixture was measured against**, and the one
 * definition of "the sha256 of a source file" that the generator and the validator share.
 *
 * Every fixture already carries the blob hash of its own unit file, so a change to
 * `src/lib/money.ts` fails the gate against `money.json`. It does not fail it against
 * `net-worth.json`, which imports that same `money.ts` through `src/utils.ts` — and a
 * golden measured before the change would keep passing while describing arithmetic that
 * no longer exists anywhere in the tree. This digest closes that hole: it covers the whole
 * source tree, so any edit anywhere in `src/` invalidates **every** golden, including the
 * ones whose unit file was not touched.
 *
 * Two rules about what "the whole tree" means here:
 *
 * - `*.test.*` / `*.spec.*` are excluded. A test cannot be imported by code under
 *   measurement, so it cannot change a golden; including one would mean every Phase 4 port
 *   test re-stamped thirteen fixtures without measuring anything again.
 * - Everything else under `src/` is included, including `src/index.css` even though no
 *   logic unit reads it. There is deliberately no extension allowlist: a covered set with a
 *   hand-picked exception silently ages, and "the tree this was measured against" is a claim
 *   about the tree. Consequence, accepted: touching a stylesheet invalidates every golden's
 *   provenance and the set must be re-stamped.
 *
 * The third rule is the reason this file exists in its current shape. **A file is hashed by
 * its content with CRLF folded to LF**, not by the bytes on disk. `core.autocrlf` is `true`
 * and `.gitattributes` pins only `parity/fixtures/*.json`, so `src/` arrives in the working
 * copy with whatever line endings the checkout and the last editor happened to leave, and the
 * tree genuinely mixes CRLF and LF today. A digest over raw bytes called the source tree
 * "stale" after a `git checkout --` that git itself reported as a no-op, and it would have
 * disagreed between a Windows dev box and the Linux CI runner without a single line of code
 * changing. Folding the endings makes the hash a claim about content. It is also exactly what
 * `git hash-object` stores, so this agrees with the `gitBlob` identity in provenance.
 *
 * `SRC_TREE_LABEL` is folded into the digest, so the definition of the covered set can be
 * changed deliberately (bump the label) instead of silently, which would leave every existing
 * fixture stamped with a hash of a tree it was never measured against. v1 hashed raw bytes and
 * v2 hashed git blob OIDs over an extension allowlist; neither is what this computes, so the
 * label is v3 and every fixture had to be re-stamped once.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC_TREE_LABEL = 'src-tree-v3';
const TEST_FILE = /\.(test|spec)\.[a-zA-Z]+$/;

/** CRLF (and a lone CR at a line break) folded to LF. Byte-level, so it is safe on buffers. */
export function normalizeEol(bytes: Buffer): Buffer {
  const out = Buffer.alloc(bytes.length);
  let n = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x0d && i + 1 < bytes.length && bytes[i + 1] === 0x0a) continue;
    out[n++] = bytes[i] === 0x0d ? 0x0a : bytes[i];
  }
  return out.subarray(0, n);
}

/** The content digest of one file in the tree, by the definition above. `rel` is repo-relative
 *  only for the error message; the bytes come from `path.join(root, rel)`. */
export function sha256File(root: string, rel: string): string {
  return sha256(normalizeEol(readFileSync(path.join(root, rel))));
}

export function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function collect(dir: string, root: string, out: string[]): void {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return;
  for (const entry of readdirSync(dir).sort()) {
    const abs = path.join(dir, entry);
    const kind = statSync(abs);
    if (kind.isDirectory()) collect(abs, root, out);
    else if (kind.isFile() && !TEST_FILE.test(entry)) {
      out.push(path.relative(root, abs).split(path.sep).join('/'));
    }
  }
}

/** Every file the digest covers, as POSIX paths relative to `root`, sorted. Exposed for
 *  diagnostics, so a failure can say how many files were hashed rather than only "nope". */
export function srcTreeFiles(root: string): string[] {
  const out: string[] = [];
  collect(path.join(root, 'src'), root, out);
  return out.sort();
}

/**
 * The digest of the `src/` tree as measured. `root` is the repo, because the recorded paths are
 * repo-relative: making them absolute would fold the location of the clone into the hash, so two
 * checkouts of the identical tree would disagree.
 */
export function srcTreeDigest(root: string): string {
  const files = srcTreeFiles(root);
  if (files.length === 0)
    throw new Error(`no files under ${path.join(root, 'src')} — cannot stamp a tree that is not there`);
  const h = createHash('sha256');
  h.update(`${SRC_TREE_LABEL}\0`);
  for (const rel of files) {
    h.update(rel);
    h.update('\0');
    h.update(sha256File(root, rel));
    h.update('\0');
  }
  return h.digest('hex');
}

export { SRC_TREE_LABEL };
