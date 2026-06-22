/**
 * Shared locations for the tests that need a local GGPK extract.
 *
 * Extraction inputs (decoded tables, the bundle cache, `.csd`/`.psg` files) and
 * the legacy `.mjs` reference scripts are not part of this repo — they derive
 * from proprietary game data. Point `POE2_GGPK_EXTRACT` at a directory holding
 * them to run the integration and port-verification tests locally; without it,
 * those tests skip and only the self-contained unit tests run.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A path that never exists, so the gated tests skip when no extract is configured. */
const NO_EXTRACT = '/nonexistent/poe2-ggpk-extract';

/** Root of the local GGPK extract (and legacy reference scripts), or a no-op path. */
export const TOOLS_DIR = process.env.POE2_GGPK_EXTRACT ?? NO_EXTRACT;

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

/** Absolute path to a legacy `.mjs` reference module under the extract. */
export function legacy(relative: string): string {
  return join(TOOLS_DIR, relative);
}

/** Absolute path to a GGPK input file under the extract. */
export function toolsFile(relative: string): string {
  return join(TOOLS_DIR, relative);
}

/** Whether a local GGPK extract is present (decoded tables + bundle cache). */
export function extractAvailable(): boolean {
  return existsSync(join(TABLES_DIR, 'Characters.json')) && existsSync(join(CACHE_DIR, PATCH));
}
