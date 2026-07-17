/**
 * Shared locations and gating for the characterization suite.
 *
 * The TypeScript pipeline (`src/`) regenerates artifacts from a {@link
 * createCdnSource} pointed at a local GGPK extract and compares them to the
 * golden fixtures. The extract (decoded tables + bundle cache) is not part of
 * this repo — point `POE2_GGPK_EXTRACT` at a directory holding it to run the
 * regeneration tests locally; without it they skip.
 *
 * The golden `data.json` is also kept out of the repo (it carries derived GGG
 * game data), so the golden-contract tests that read it skip in CI and run
 * locally. The committed fixtures (atlas frame-maps, the PNG SHA manifest) carry
 * no game data and always drive their checks.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** This package's root directory. */
export const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Repo root — where scripts/golden-fixtures/setup.mjs writes its (gitignored) output. */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * Golden fixtures (data.json, atlas frame-maps, the PNG hash manifest) live
 * OUTSIDE this repo — they derive from GGG game data. `scripts/golden-fixtures/
 * setup.mjs --bless` generates them locally into the gitignored default below;
 * point `POE2_TREE_GOLDEN` elsewhere to override. Without either, the
 * golden-contract and 1:1 tests skip (as they do in CI, which has neither).
 */
export const GOLDEN_DIR = process.env.POE2_TREE_GOLDEN ?? join(REPO_ROOT, '.golden-fixtures/tree');

/** Root of the local GGPK extract, configured via `POE2_GGPK_EXTRACT`. */
export const TOOLS_DIR = process.env.POE2_GGPK_EXTRACT ?? join(REPO_ROOT, '.ggpk-extract');

/** Decoded tables and bundle cache the CDN source reads from. */
export const TABLES_DIR = join(TOOLS_DIR, 'tables/English');
export const CACHE_DIR = join(TOOLS_DIR, '.cache');

function readPatch(): string {
  try {
    return JSON.parse(readFileSync(join(TOOLS_DIR, 'config.json'), 'utf8')).patch;
  } catch {
    return '0.0.0.0.0';
  }
}

/** GGPK patch the extract was captured against (best-effort; default if absent). */
export const PATCH: string = readPatch();

/**
 * Whether a local GGPK extract is present to regenerate from: the decoded tables
 * and the bundle cache for the configured patch.
 */
export function inputsAvailable(): boolean {
  return existsSync(join(TABLES_DIR, 'PassiveSkills.json')) && existsSync(join(CACHE_DIR, PATCH));
}

/** Whether the (git-ignored) golden `data.json` is present locally. */
export function goldenDataAvailable(): boolean {
  return existsSync(join(GOLDEN_DIR, 'data.json'));
}

/** Whether the (git-ignored) golden art fixtures (PNG hash manifest) are present. */
export function goldenArtAvailable(): boolean {
  return existsSync(join(GOLDEN_DIR, 'png.sha256'));
}
