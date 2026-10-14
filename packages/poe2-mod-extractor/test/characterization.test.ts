/** Characterization test: rebuild mod data from a real GGPK extract and assert it reproduces the deployed golden `mods.json` 1:1. */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCdnSource } from '@poe2-toolkit/ggpk';
import { beforeAll, describe, expect, it } from 'vitest';

import { buildMods } from '../src/buildMods';
import type { ModData } from '../src/buildMods';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const EXTRACT = process.env.POE2_GGPK_EXTRACT ?? join(REPO_ROOT, '.ggpk-extract');
const GOLDEN = process.env.POE2_DATA_GOLDEN ?? join(REPO_ROOT, '.golden-fixtures/data');
const TABLES_DIR = join(EXTRACT, 'tables/English');
const CACHE_DIR = join(EXTRACT, '.cache');
const GOLDEN_MODS = join(GOLDEN, 'mods.json');

function readPatch(): string {
  try {
    return JSON.parse(readFileSync(join(EXTRACT, 'config.json'), 'utf8')).patch as string;
  } catch {
    return process.env.POE2_PATCH ?? '0.0.0.0.0';
  }
}

function available(): boolean {
  return existsSync(join(TABLES_DIR, 'Mods.json')) && existsSync(GOLDEN_MODS);
}

describe.skipIf(!available())('mods 1:1 against the deployed golden', () => {
  let built: ModData;
  let golden: ModData;

  beforeAll(async () => {
    const source = await createCdnSource({ patch: readPatch(), cacheDir: CACHE_DIR, tablesDir: TABLES_DIR });
    built = await buildMods(source);
    golden = JSON.parse(readFileSync(GOLDEN_MODS, 'utf8')) as ModData;
  });

  it('reproduces every mod exactly', () => {
    expect(built).toEqual(golden);
  });
});
