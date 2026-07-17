/**
 * Loader for the published tree `data.json` used by the integration tests.
 *
 * That file carries derived GGG game data (node names, stats, geometry), so it
 * is not part of this repo. Point `POE2_TREE_DATA` at a local `data.json` (for
 * example one produced by `@poe2-toolkit/tree-extractor`) to run these tests; without
 * it, the suites that need it are skipped.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeGggTree } from '../src/ggg/normalize.js';
import type { GggTreeJson } from '../src/ggg/normalize.js';
import type { TreeData } from '../src/types.js';

/** Repo root — where scripts/golden-fixtures/setup.mjs writes its (gitignored) output. */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * Path to a local tree `data.json`. Defaults to the file `scripts/golden-
 * fixtures/setup.mjs --bless` writes; point `POE2_TREE_DATA` elsewhere to
 * override.
 */
export const TREE_DATA = process.env.POE2_TREE_DATA ?? join(REPO_ROOT, '.golden-fixtures/tree/data.json');

/** Whether a local tree `data.json` is configured and present. */
export function treeDataAvailable(): boolean {
  return existsSync(TREE_DATA);
}

let cache: { raw: GggTreeJson; data: TreeData } | undefined;

/** Load and normalise the configured tree data (memoised). */
export function tree(): { raw: GggTreeJson; data: TreeData } {
  if (!cache) {
    const raw = JSON.parse(readFileSync(TREE_DATA, 'utf8')) as GggTreeJson;
    cache = { raw, data: normalizeGggTree(raw, '0_5') };
  }

  return cache;
}
