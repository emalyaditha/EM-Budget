#!/usr/bin/env node
/**
 * Item 10 — bundle the design-system faces the web app already loads.
 *
 * `src/index.css:1` is the source of truth for *which* faces exist: this script
 * reads that `@import` and refuses to bundle anything the web does not ask for,
 * or to skip anything it does. The faces then come from the same upstream the
 * browser fetches them from — `fonts.googleapis.com`/`fonts.gstatic.com`, which
 * is an official Google Fonts distribution of the authors' OFL-1.1 files. No
 * mirror, no third-party repackaging, no subsetter.
 *
 * The CSS is requested with a User-Agent that predates `woff2`, so the service
 * answers with `format('truetype')` and — the part that matters for a mobile
 * port — **one unsubsetted file per weight**: the response carries no
 * `unicode-range`, so the bytes are the complete family, not the `latin` slice
 * a browser would download six of. Flutter cannot read `woff2` at all, so the
 * truetype answer is both the most portable and the most complete option.
 *
 * Every file is checked before it is accepted: sfnt version, the `name` table's
 * family/subfamily strings, `OS/2.usWeightClass`, `head.unitsPerEm`, `maxp`
 * glyph count, and `cmap` coverage of the glyphs a money figure is made of.
 * The results are written to `parity/fixtures/fonts.json`, which the Dart side
 * reads, so "we ship the right faces at the right weights" is a test rather
 * than a comment.
 *
 * Usage:
 *   node parity/get_fonts.cjs            # fetch, verify, write assets + manifest
 *   node parity/get_fonts.cjs --check    # verify what is on disk; write nothing
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..');
const FONT_DIR = path.join('mobile', 'assets', 'fonts');
/** Recorded paths always use POSIX separators so the manifest is portable across hosts. */
const FONT_DIR_POSIX = 'mobile/assets/fonts';
const MANIFEST = path.join('parity', 'fixtures', 'fonts.json');

/**
 * A UA from before woff2 support. Google Fonts content-negotiates on it: modern
 * agents get `woff2` + `unicode-range` subsets, this one gets whole truetype
 * files. Nothing about the response is trusted unchecked — `inspectFont` reads
 * the bytes.
 */
const TRUETYPE_UA = 'Mozilla/5.0 (Windows NT 6.1; WOW64)';

/** Google Fonts' repo and branch, for the licence text it ships per family. */
const LICENSE_REPO = 'google/fonts';
const LICENSE_BRANCH = 'main';
const LICENSE_DIR = `${LICENSE_REPO} (${LICENSE_BRANCH})`;
const LICENSE_BASE = `https://raw.githubusercontent.com/${LICENSE_REPO}/${LICENSE_BRANCH}/`;

/** The family's directory in that repo, which is also what the face set allows. */
const LICENSE_PATH = {
  'Plus Jakarta Sans': 'ofl/plusjakartasans/OFL.txt',
  Inter: 'ofl/inter/OFL.txt',
  'JetBrains Mono': 'ofl/jetbrainsmono/OFL.txt',
};

/** weight → the file name a designer would expect, and the pubspec `weight:`. */
const WEIGHT_NAME = {
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'SemiBold',
  700: 'Bold',
  800: 'ExtraBold',
};

const FAMILY_FILE_STEM = {
  'Plus Jakarta Sans': 'PlusJakartaSans',
  Inter: 'Inter',
  'JetBrains Mono': 'JetBrainsMono',
};

/**
 * The glyphs a ported figure can be made of. Every face must carry all of them:
 * digits and separators are what `formatMoney` emits, and the ISO codes are the
 * currency a masked card or a `LKR`-style amount prints as. Currency *marks* are
 * deliberately not in this set — the web's stacks also fall back for those, and
 * a face that lacks `৳` is a recorded fact, not a failure. Checked separately and
 * written to the manifest.
 */
const REQUIRED = [
  ...'0123456789',
  ',',
  '.',
  '-',
  '+',
  ' ',
  '%',
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ...'abcdefghijklmnopqrstuvwxyz',
  ':',
  '/',
  '(',
  ')',
];

/** The currency marks the fixtures actually render, keyed for the report. */
const MARKS = {
  'U+0024 $': 0x24,
  'U+00a2 ¢': 0xa2,
  'U+00a3 £': 0xa3,
  'U+00a5 ¥': 0xa5,
  'U+20a8 ₨': 0x20a8,
  'U+20a9 ₩': 0x20a9,
  'U+20ac €': 0x20ac,
  'U+20b9 ₹': 0x20b9,
  'U+09f3 ৳': 0x09f3,
  'U+20bd ₽': 0x20bd,
  'U+20a6 ₦': 0x20a6,
  'U+2013 en dash': 0x2013,
  'U+2014 em dash': 0x2014,
  'U+2019 right single quote': 0x2019,
};

/**
 * Every codepoint the parity fixtures expect a figure to print. The fixtures are
 * the app's actual money strings, so this is the question "can the face we ship
 * draw what the ported formatter emits", answered per face rather than assumed.
 * Gaps are recorded, not fatal: the web's stacks fall back for them too.
 */
function fixtureCodepoints() {
  const set = new Set();
  for (const file of ['money.json', 'number-locale.json']) {
    const root = JSON.parse(fs.readFileSync(path.join(REPO, 'parity', 'fixtures', file), 'utf8'));
    for (const entry of root.cases) {
      if (typeof entry.expected === 'string') {
        for (const ch of entry.expected) set.add(ch.codePointAt(0));
      }
    }
  }
  return [...set].sort((a, b) => a - b);
}

function fail(msg) {
  throw new Error(msg);
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function fetchBuffer(url, expectBytes) {
  const res = await fetch(url, { headers: { 'User-Agent': TRUETYPE_UA } });
  if (!res.ok) fail(`${url} -> HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (expectBytes && buf.length !== expectBytes) {
    fail(`${url}: asked for ${expectBytes} bytes, got ${buf.length}`);
  }
  return buf;
}

/* ---------------------------------------------------------------- src/index.css */

/**
 * The `@import` line of `src/index.css`, as the face set it names. This is what
 * makes the bundle a mirror of the web app instead of an invention: the families
 * and the weight lists are read off line 1 and nothing else decides them.
 */
function facesFromWeb() {
  const css = fs.readFileSync(path.join(REPO, 'src', 'index.css'), 'utf8');
  const line = css.split('\n', 1)[0];
  if (!line.startsWith("@import url('https://fonts.googleapis.com/css2?")) {
    fail(`src/index.css:1 is not a Google Fonts @import, got: ${line.slice(0, 80)}`);
  }
  const wanted = [];
  for (const familyParam of line.match(/family=[^&']+/g) ?? []) {
    const m = /^family=([^:]+)(?::wght@([\d;]+))?$/.exec(familyParam);
    if (!m) fail(`unparsable family parameter ${familyParam}`);
    const name = m[1].replace(/\+/g, ' ');
    const weights = (m[2] ?? '400').split(';').map(Number);
    if (!LICENSE_PATH[name]) fail(`${name} is not a family this script knows`);
    for (const weight of weights) wanted.push({ family: name, weight });
  }
  return wanted;
}

/* -------------------------------------------------------------------- css2 reply */

/**
 * One `@font-face` block per requested weight, each a single truetype URL and no
 * `unicode-range`. A response that carries `unicode-range` means the service
 * subsetted the family, which would ship a partial glyph set; a response with
 * more than one `src` per weight means we cannot say which file we bundled.
 */
function parseCss(css, family, weights) {
  const blocks = css.split('@font-face').slice(1);
  const out = new Map();
  for (const block of blocks) {
    const fam = /font-family:\s*'([^']+)'/.exec(block);
    const style = /font-style:\s*(\w+)/.exec(block);
    const weight = /font-weight:\s*(\d+)/.exec(block);
    const urls = [...block.matchAll(/url\((https:\/\/[^)]+)\)/g)].map((m) => m[1]);
    const format = /format\('([^']+)'\)/.exec(block);
    if (!fam) fail(`${family}: a font-face block without a font-family`);
    if (fam[1] !== family) fail(`${family}: the reply is for ${fam[1]}`);
    if (style && style[1] !== 'normal') fail(`${family}: ${style[1]} style is not ported`);
    if (!weight) fail(`${family}: a font-face block without a font-weight`);
    if (urls.length !== 1) fail(`${family} ${weight[1]}: ${urls.length} src urls`);
    if (!format || format[1] !== 'truetype') {
      fail(`${family} ${weight[1]}: served ${format ? format[1] : 'no format'}, need truetype`);
    }
    if (/unicode-range/.test(block)) {
      fail(`${family} ${weight[1]}: the reply is subsetted (unicode-range present)`);
    }
    if (!/^https:\/\/fonts\.gstatic\.com\/s\//.test(urls[0])) {
      fail(`${family} ${weight[1]}: ${urls[0]} is not a fonts.gstatic.com origin`);
    }
    if (!urls[0].endsWith('.ttf')) fail(`${family} ${weight[1]}: ${urls[0]} is not a .ttf`);
    out.set(Number(weight[1]), urls[0]);
  }
  const missing = weights.filter((w) => !out.has(w));
  if (missing.length) fail(`${family}: no face returned for weight(s) ${missing.join(', ')}`);
  const extra = [...out.keys()].filter((w) => !weights.includes(w));
  if (extra.length) fail(`${family}: unexpected weight(s) ${extra.join(', ')}`);
  return out;
}

/* ------------------------------------------------------------------ ttf parsing */

/**
 * The sfnt tables read directly rather than through a dependency, because the
 * claim being checked is small and specific: this file *is* the family at the
 * weight its name says, at the authored unitsPerEm, and it can draw a number.
 */
function inspectFont(buf, fileName) {
  if (buf.length < 12) fail(`${fileName}: too short to be a font`);
  const version = buf.readUInt32BE(0);
  const sfnt = version === 0x00010000 || version === 0x4f54544f || version === 0x74727565;
  if (!sfnt) fail(`${fileName}: sfnt version 0x${version.toString(16)}, not truetype/otf`);
  const numTables = buf.readUInt16BE(4);
  const tables = new Map();
  for (let i = 0; i < numTables; i++) {
    const off = 12 + i * 16;
    const tag = buf.toString('latin1', off, off + 4);
    tables.set(tag, { offset: buf.readUInt32BE(off + 8), length: buf.readUInt32BE(off + 12) });
  }
  for (const tag of ['head', 'name', 'OS/2', 'maxp', 'cmap']) {
    if (!tables.has(tag)) fail(`${fileName}: no ${tag} table`);
  }

  const head = tables.get('head').offset;
  const unitsPerEm = buf.readUInt16BE(head + 18);
  if (unitsPerEm !== 1000 && unitsPerEm !== 2048 && unitsPerEm < 96) {
    fail(`${fileName}: suspicious unitsPerEm ${unitsPerEm}`);
  }
  const numGlyphs = buf.readUInt16BE(tables.get('maxp').offset + 4);
  const weightClass = buf.readUInt16BE(tables.get('OS/2').offset + 4);

  const names = readNameTable(buf, tables.get('name'));
  const family = names[1] ?? '';
  const subfamily = names[2] ?? '';
  const typoFamily = names[16];
  const typoSubfamily = names[17];
  const effectiveFamily = typoFamily ?? family;

  const covered = readCmap(buf, tables.get('cmap'));
  return {
    unitsPerEm,
    numGlyphs,
    weightClass,
    familyNames: [family, effectiveFamily].filter((v, i, a) => v && a.indexOf(v) === i),
    subfamily,
    typoSubfamily: typoSubfamily ?? null,
    effectiveFamily,
    covered,
  };
}

/** Name strings are UTF-16BE on both the Mac and Windows platforms. */
function decodeUtf16BE(slice) {
  const swapped = Buffer.from(slice);
  for (let i = 0; i + 1 < swapped.length; i += 2) {
    const a = swapped[i];
    swapped[i] = swapped[i + 1];
    swapped[i + 1] = a;
  }
  return swapped.toString('utf16le');
}

/**
 * Windows (3/1) first, then Mac (1/0). A record whose platform is neither is
 * skipped rather than guessed at, and a later platform-3 record replaces the
 * platform-0 one it read for the same name id.
 */
function readNameTable(buf, entry) {
  const base = entry.offset;
  const count = buf.readUInt16BE(base + 2);
  const stringStore = base + buf.readUInt16BE(base + 4);
  const out = {};
  const fromPlatform = {};
  for (let i = 0; i < count; i++) {
    const rec = base + 6 + i * 12;
    const platform = buf.readUInt16BE(rec);
    const id = buf.readUInt16BE(rec + 6);
    const len = buf.readUInt16BE(rec + 8);
    const str = buf.readUInt16BE(rec + 10);
    if (id > 25 || (platform !== 3 && platform !== 0)) continue;
    if (out[id] !== undefined && fromPlatform[id] >= platform) continue;
    const slice = buf.subarray(stringStore + str, stringStore + str + len);
    if (slice.length < 2 || slice.length % 2 !== 0) continue;
    out[id] = decodeUtf16BE(slice);
    fromPlatform[id] = platform;
  }
  return out;
}

/**
 * The set of codepoints the font can draw, from the Unicode cmap subtables.
 * Subtable offsets in the encoding record are relative to the start of the
 * `cmap` table, not to the start of the file.
 */
function readCmap(buf, entry) {
  const base = entry.offset;
  const tables = [];
  const numSubtables = buf.readUInt16BE(base + 2);
  for (let i = 0; i < numSubtables; i++) {
    const rec = base + 4 + i * 8;
    tables.push(base + buf.readUInt32BE(rec + 4));
  }
  const seen = new Set();
  for (const sub of tables) {
    const format = buf.readUInt16BE(sub);
    if (format === 4) {
      const segX2 = buf.readUInt16BE(sub + 6);
      const segCount = segX2 / 2;
      const endO = sub + 14;
      const startO = endO + segX2 + 2;
      const deltaO = startO + segX2;
      const rangeO = deltaO + segX2;
      for (let s = 0; s < segCount; s++) {
        const end = buf.readUInt16BE(endO + s * 2);
        const start = buf.readUInt16BE(startO + s * 2);
        if (start === 0xffff) continue;
        for (let c = start; c <= end; c++) {
          const range = buf.readUInt16BE(rangeO + s * 2);
          let gid;
          if (range === 0) {
            gid = (c + buf.readInt16BE(deltaO + s * 2)) & 0xffff;
          } else {
            const glyphIndexAddr = rangeO + s * 2 + range + (c - start) * 2;
            if (glyphIndexAddr + 1 >= buf.length) continue;
            const raw = buf.readUInt16BE(glyphIndexAddr);
            if (raw === 0) continue;
            gid = (raw + buf.readInt16BE(deltaO + s * 2)) & 0xffff;
          }
          if (gid !== 0) seen.add(c);
        }
      }
    } else if (format === 0) {
      const length = buf.readUInt16BE(sub + 2);
      for (let c = 0; c < Math.min(256, length - 6); c++) {
        if (buf.readUInt8(sub + 6 + c) !== 0) seen.add(c);
      }
    } else if (format === 12) {
      const nGroups = buf.readUInt32BE(sub + 12);
      for (let g = 0; g < nGroups; g++) {
        const rec = sub + 16 + g * 12;
        const start = buf.readUInt32BE(rec);
        const end = buf.readUInt32BE(rec + 4);
        const glyphStart = buf.readUInt32BE(rec + 8);
        for (let c = start; c <= end; c++) {
          if (glyphStart + (c - start) !== 0) seen.add(c);
        }
      }
    }
  }
  return seen;
}

/* ------------------------------------------------------------------------- main */

async function main() {
  const check = process.argv.includes('--check');
  const wanted = facesFromWeb();
  const byFamily = new Map();
  for (const { family, weight } of wanted) {
    if (!byFamily.has(family)) byFamily.set(family, []);
    byFamily.get(family).push(weight);
  }

  // In --check the recorded manifest is the expectation, not the output: the
  // bytes on disk must hash to what the manifest says, and the URLs the service
  // answers with today must still be the ones the manifest says they came from.
  const recorded = check ? JSON.parse(fs.readFileSync(path.join(REPO, MANIFEST), 'utf8')) : null;
  const recordedFace = new Map();
  const recordedLicence = new Map();
  if (check) {
    for (const face of recorded.faces) recordedFace.set(face.fileName, face);
    for (const licence of recorded.licenses) recordedLicence.set(licence.fileName, licence);
  }

  const entries = [];
  const licences = [];
  const fixtureCps = fixtureCodepoints();

  for (const [family, weights] of byFamily) {
    const query = `family=${family.replace(/ /g, '+')}:wght@${weights.join(';')}&display=swap`;
    const cssUrl = `https://fonts.googleapis.com/css2?${query}`;
    const css = (await fetchBuffer(cssUrl)).toString('utf8');
    const urls = parseCss(css, family, weights);

    for (const weight of weights) {
      const url = urls.get(weight);
      const name = `${FAMILY_FILE_STEM[family]}-${WEIGHT_NAME[weight]}.ttf`;
      const target = path.join(REPO, FONT_DIR, name);
      const info = {
        family,
        weight,
        fileName: name,
        localPath: `${FONT_DIR_POSIX}/${name}`,
        sourceUrl: url,
        cssUrl,
      };

      let buf;
      if (check) {
        if (!fs.existsSync(target)) fail(`${info.localPath} is missing (run without --check)`);
        buf = fs.readFileSync(target);
      } else {
        buf = await fetchBuffer(url);
      }
      const font = inspectFont(buf, name);
      info.sha256 = sha256(buf);
      info.bytes = buf.length;
      info.unitsPerEm = font.unitsPerEm;
      info.numGlyphs = font.numGlyphs;
      info.nameTableFamily = font.effectiveFamily;
      info.nameTableSubfamily = font.typoSubfamily ?? font.subfamily;
      info.nameTableEntries = font.familyNames;
      info.os2usWeightClass = font.weightClass;
      info.missingRequired = REQUIRED.filter((c) => !font.covered.has(c.codePointAt(0)));
      info.marks = Object.fromEntries(Object.entries(MARKS).map(([label, cp]) => [label, font.covered.has(cp)]));
      info.fixtureCodepointCount = fixtureCps.length;
      info.missingFixtureCodepoints = fixtureCps
        .filter((cp) => !font.covered.has(cp))
        .map((cp) => cp.toString(16).padStart(4, '0').toUpperCase());

      if (info.os2usWeightClass !== weight) {
        fail(`${name}: OS/2.usWeightClass ${info.os2usWeightClass} != requested ${weight}`);
      }
      const claim = `${family} ${weight}`;
      if (!font.familyNames.includes(family) && !font.effectiveFamily.includes(family)) {
        fail(`${name}: the name table says ${font.familyNames.join(' / ') || '(none)'}, not ${claim}`);
      }
      if (info.missingRequired.length) {
        fail(`${name}: cmap lacks ${info.missingRequired.join(' ')}`);
      }
      if (check) {
        const was = recordedFace.get(name);
        if (!was) fail(`${name} is not in ${MANIFEST}`);
        for (const key of ['sha256', 'bytes', 'sourceUrl']) {
          if (was[key] !== info[key]) {
            fail(`${name}: ${key} is ${info[key]} now, ${MANIFEST} records ${was[key]}`);
          }
        }
      }
      entries.push(info);
      console.log(
        `${check ? 'verified' : 'fetched'} ${name}  ${info.bytes} bytes  ` +
          `weight=${info.os2usWeightClass} glyphs=${info.numGlyphs} upm=${info.unitsPerEm} ` +
          `fixture-gaps=${info.missingFixtureCodepoints.length}`,
      );
      if (!check) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, buf);
      }
    }

    const licencePath = LICENSE_PATH[family];
    const licenceUrl = `${LICENSE_BASE}${licencePath}`;
    const licenceName = `${FAMILY_FILE_STEM[family]}-OFL.txt`;
    const licenceTarget = path.join(REPO, FONT_DIR, licenceName);
    let licence;
    if (check) {
      if (!fs.existsSync(licenceTarget)) fail(`${licenceName} is missing`);
      licence = fs.readFileSync(licenceTarget);
    } else {
      licence = await fetchBuffer(licenceUrl);
    }
    const text = licence.toString('utf8');
    if (!text.includes('SIL OPEN FONT LICENSE Version 1.1')) {
      fail(`${family}: ${licenceUrl} is not the OFL 1.1 text`);
    }
    const copyright = /^Copyright.*$/m.exec(text);
    const licenceEntry = {
      family,
      fileName: licenceName,
      localPath: `${FONT_DIR_POSIX}/${licenceName}`,
      sourceUrl: licenceUrl,
      upstreamRepo: /https:\/\/github\.com\/[^\s)]+/.exec(text ?? '')?.[0] ?? null,
      copyrightLine: copyright ? copyright[0] : null,
      sha256: sha256(licence),
      bytes: licence.length,
    };
    if (check) {
      const was = recordedLicence.get(licenceName);
      if (!was) fail(`${licenceName} is not in ${MANIFEST}`);
      if (was.sha256 !== licenceEntry.sha256) {
        fail(`${licenceName}: sha256 ${licenceEntry.sha256} != recorded ${was.sha256}`);
      }
      if (was.sourceUrl !== licenceEntry.sourceUrl) {
        fail(`${licenceName}: ${was.sourceUrl} is no longer ${licenceEntry.sourceUrl}`);
      }
    }
    licences.push(licenceEntry);
    if (!check) fs.writeFileSync(licenceTarget, licence);
    console.log(`${check ? 'verified' : 'fetched'} ${licenceName}  OFL 1.1  ${licence.length} bytes`);
  }

  entries.sort((a, b) => (a.fileName < b.fileName ? -1 : 1));
  const manifest = {
    _provenance: {
      producedBy: 'node parity/get_fonts.cjs',
      faceSetFrom: 'src/index.css:1 (@import, fonts.googleapis.com/css2)',
      servedBy: 'fonts.googleapis.com css2, truetype User-Agent -> unsubsetted .ttf per weight',
      licenseFrom: LICENSE_DIR,
      license: 'SIL OPEN FONT LICENSE Version 1.1',
      faces: entries.length,
      note:
        'Every face is the weight src/index.css asks for, checked by OS/2.usWeightClass ' +
        'and the name table, with cmap coverage of the glyphs a money figure is made of.',
    },
    licenses: licences,
    faces: entries,
  };
  const manifestPath = path.join(REPO, MANIFEST);
  if (!check) {
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    // Written through the repo's own Prettier config, so a fetch run leaves the tree exactly
    // as `npm run format:check` wants to find it: parity/fixtures/*.json is not ignored, and
    // a generated manifest that only its own writer can read would fail CI on formatting.
    const prettier = require('prettier');
    const raw = `${JSON.stringify(manifest, null, 2)}\n`;
    const cfg = (await prettier.resolveConfig(manifestPath)) || {};
    fs.writeFileSync(
      manifestPath,
      await prettier.format(raw, { ...cfg, parser: 'json', filepath: manifestPath }),
      'utf8',
    );
  }
  console.log(`\n${check ? 'checked' : 'wrote'} ${entries.length} faces, ${licences.length} licences`);
  if (!check) console.log(`manifest: ${MANIFEST}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
