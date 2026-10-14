/** Shared locations for the tests that need a local GGPK extract. */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const NO_EXTRACT = '/nonexistent/poe2-ggpk-extract';

export const TOOLS_DIR = process.env.POE2_GGPK_EXTRACT ?? NO_EXTRACT;

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

export function legacy(relative: string): string {
  return join(TOOLS_DIR, relative);
}

export function toolsFile(relative: string): string {
  return join(TOOLS_DIR, relative);
}

export function extractAvailable(): boolean {
  return existsSync(join(TABLES_DIR, 'Characters.json')) && existsSync(join(CACHE_DIR, PATCH));
}
