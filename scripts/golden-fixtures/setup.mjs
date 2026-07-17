// Bootstraps the local fixtures the characterization/golden-contract suites
// need: a decoded GGPK extract, and — with --bless — the golden output derived
// from it. Everything this script writes lives outside git (.ggpk-extract/ and
// .golden-fixtures/ are gitignored): this repo ships code only, no data derived
// from the game, not even hashes of it. Every contributor runs this locally
// against their own legally-obtained extract; nothing it produces is ever
// committed or run in CI.
//
// Usage:
//   node scripts/golden-fixtures/setup.mjs             # fetch/reuse the extract
//   node scripts/golden-fixtures/setup.mjs --bless      # + (re)generate golden fixtures
//   node scripts/golden-fixtures/setup.mjs --patch 4.5.5.1 --bless
//
// Point the test suites at the result with:
//   export POE2_GGPK_EXTRACT=$PWD/.ggpk-extract
//   export POE2_DATA_GOLDEN=$PWD/.golden-fixtures/data
//   export POE2_TREE_GOLDEN=$PWD/.golden-fixtures/tree
//   export POE2_TREE_DATA=$PWD/.golden-fixtures/tree/data.json
// (the test suites already default to these paths — see docs/GOLDEN_FIXTURES.md)

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = fileURLToPath(new URL('./', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const EXTRACT_DIR = join(REPO_ROOT, '.ggpk-extract');
const GOLDEN_DIR = join(REPO_ROOT, '.golden-fixtures');
const DATA_GOLDEN_DIR = join(GOLDEN_DIR, 'data');
const TREE_GOLDEN_DIR = join(GOLDEN_DIR, 'tree');
const BIN_DIR = join(REPO_ROOT, 'node_modules/.bin');

const args = process.argv.slice(2);
const bless = args.includes('--bless');
const patchFlagIndex = args.indexOf('--patch');
const patchOverride = patchFlagIndex >= 0 ? args[patchFlagIndex + 1] : undefined;

const manifest = JSON.parse(readFileSync(join(SCRIPT_DIR, 'config.json'), 'utf8'));
const patch = patchOverride ?? manifest.patch;

if (!patch) {
  throw new Error('no patch pinned — set "patch" in scripts/golden-fixtures/config.json or pass --patch <version>');
}

/** Run a step, inheriting stdio, failing loud on error. */
function step(label, command, cmdArgs, options = {}) {
  console.log(`\n▶ ${label}`);
  execFileSync(command, cmdArgs, { stdio: 'inherit', ...options });
}

function tablesReady() {
  if (!existsSync(join(EXTRACT_DIR, 'config.json'))) return false;

  const extractPatch = JSON.parse(readFileSync(join(EXTRACT_DIR, 'config.json'), 'utf8')).patch;

  return extractPatch === patch && existsSync(join(EXTRACT_DIR, 'tables/English/PassiveSkills.json'));
}

// --- 1. GGPK extract: decoded tables, fetched once per patch -----------------

if (tablesReady()) {
  console.log(`Extract already present for patch ${patch}, skipping table export.`);
} else {
  mkdirSync(EXTRACT_DIR, { recursive: true });
  writeFileSync(
    join(EXTRACT_DIR, 'config.json'),
    JSON.stringify({ patch, translations: manifest.translations, files: manifest.files, tables: manifest.tables }, null, 2),
  );
  step(`export GGPK tables for patch ${patch}`, 'node', [join(SCRIPT_DIR, 'run-pathofexile-dat.mjs')], {
    cwd: EXTRACT_DIR,
  });
}

if (!bless) {
  console.log(`\n✓ Extract ready at ${EXTRACT_DIR}`);
  process.exit(0);
}

// --- 2. Bless: regenerate golden fixtures from the extract --------------------

function requireBuilt(bin) {
  const path = join(BIN_DIR, bin);

  if (!existsSync(path)) {
    throw new Error(`${bin} not found — run "npm run build" first`);
  }

  return path;
}

const tablesDir = join(EXTRACT_DIR, 'tables/English');
const cacheDir = join(EXTRACT_DIR, '.cache');

mkdirSync(DATA_GOLDEN_DIR, { recursive: true });

/** Run a data extractor's CLI into a scratch dir, then keep only its JSON output. */
function blessData(label, bin) {
  const scratch = join(GOLDEN_DIR, `.scratch-${label}`);
  rmSync(scratch, { recursive: true, force: true });

  step(`bless ${label} data`, 'node', [
    requireBuilt(bin),
    '--patch', patch,
    '--tables', tablesDir,
    '--cache', cacheDir,
    '--out', scratch,
  ]);

  for (const file of readdirSync(scratch)) {
    if (file.endsWith('.json')) {
      renameSync(join(scratch, file), join(DATA_GOLDEN_DIR, file));
    }
  }
  rmSync(scratch, { recursive: true, force: true });
}

blessData('items', 'poe2-item-extract');
blessData('gems', 'poe2-gem-extract');
blessData('runes', 'poe2-rune-extract');
blessData('mods', 'poe2-mod-extract');

// Tree: CLI output (data.json, assets/*.png+*.json, centre/*.png) matches the
// golden layout directly, no scratch/copy needed.
rmSync(TREE_GOLDEN_DIR, { recursive: true, force: true });
step('bless tree data + art', 'node', [
  requireBuilt('poe2-tree-extract'),
  '--patch', patch,
  '--tables', tablesDir,
  '--cache', cacheDir,
  '--out', TREE_GOLDEN_DIR,
]);

/** Hex SHA-256 of a file's raw bytes. */
function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const pngs = [
  ...readdirSync(join(TREE_GOLDEN_DIR, 'assets')).filter((f) => f.endsWith('.png')).map((f) => `assets/${f}`),
  ...readdirSync(join(TREE_GOLDEN_DIR, 'centre')).filter((f) => f.endsWith('.png')).map((f) => `centre/${f}`),
];
const manifestLines = pngs.map((rel) => `${sha256File(join(TREE_GOLDEN_DIR, rel))}  ${rel}`);
writeFileSync(join(TREE_GOLDEN_DIR, 'png.sha256'), `${manifestLines.join('\n')}\n`);

console.log(
  `\n✓ Golden fixtures blessed for patch ${patch}\n` +
    `  data: ${DATA_GOLDEN_DIR}\n` +
    `  tree: ${TREE_GOLDEN_DIR} (${pngs.length} PNGs hashed)\n` +
    '\nNothing here is committed — .ggpk-extract/ and .golden-fixtures/ stay gitignored.',
);
