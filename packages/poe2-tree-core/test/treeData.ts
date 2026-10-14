/** Loader for the published tree `data.json` used by the integration tests. */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeGggTree } from '../src/ggg/normalize.js';
import type { GggTreeJson } from '../src/ggg/normalize.js';
import type { TreeData } from '../src/types.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** Path to a local tree `data.json`. */
export const TREE_DATA = process.env.POE2_TREE_DATA ?? join(REPO_ROOT, '.golden-fixtures/tree/data.json');

export function treeDataAvailable(): boolean {
  return existsSync(TREE_DATA);
}

let cache: { raw: GggTreeJson; data: TreeData } | undefined;

export function tree(): { raw: GggTreeJson; data: TreeData } {
  if (!cache) {
    const raw = JSON.parse(readFileSync(TREE_DATA, 'utf8')) as GggTreeJson;
    cache = { raw, data: normalizeGggTree(raw, '0_5') };
  }

  return cache;
}
