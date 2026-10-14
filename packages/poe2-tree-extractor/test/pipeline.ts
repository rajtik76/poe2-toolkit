/** Shared locations and gating for the characterization suite. */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** Golden fixtures (data.json, atlas frame-maps, the PNG hash manifest) live OUTSIDE this repo - they derive from GGG game data. */
export const GOLDEN_DIR = process.env.POE2_TREE_GOLDEN ?? join(REPO_ROOT, '.golden-fixtures/tree');

export const TOOLS_DIR = process.env.POE2_GGPK_EXTRACT ?? join(REPO_ROOT, '.ggpk-extract');

export const TABLES_DIR = join(TOOLS_DIR, 'tables/English');
export const CACHE_DIR = join(TOOLS_DIR, '.cache');

function readPatch(): string {
  try {
    return JSON.parse(readFileSync(join(TOOLS_DIR, 'config.json'), 'utf8')).patch;
  } catch {
    return '0.0.0.0.0';
  }
}

export const PATCH: string = readPatch();

/** Whether a local GGPK extract is present to regenerate from: the decoded tables and the bundle cache for the configured patch. */
export function inputsAvailable(): boolean {
  return existsSync(join(TABLES_DIR, 'PassiveSkills.json')) && existsSync(join(CACHE_DIR, PATCH));
}

export function goldenDataAvailable(): boolean {
  return existsSync(join(GOLDEN_DIR, 'data.json'));
}

export function goldenArtAvailable(): boolean {
  return existsSync(join(GOLDEN_DIR, 'png.sha256'));
}
