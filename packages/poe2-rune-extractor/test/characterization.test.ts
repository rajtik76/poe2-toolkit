/**
 * Characterization test: rebuild rune data from a real GGPK extract and assert it
 * reproduces the deployed golden `runes.json` 1:1.
 *
 * The extract and the golden carry derived GGG game data, so neither lives in
 * this repo. Point `POE2_GGPK_EXTRACT` at a directory holding `tables/English`
 * (the decoded tables, plus a `.cache` and `config.json` for the patch) and
 * `POE2_DATA_GOLDEN` at the directory holding the golden `runes.json`. Without
 * both, the suite skips (as it does in CI).
 *
 * Unlike items and gems, `buildRunes` also reads GGG's `stat_descriptions.csd`
 * via the source, so the run needs that file served from the patch CDN or the
 * extract's bundle `.cache`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createCdnSource } from '@poe2-toolkit/ggpk';
import { beforeAll, describe, expect, it } from 'vitest';

import { buildRunes } from '../src/buildRunes';
import type { RuneData } from '../src/buildRunes';

const EXTRACT = process.env.POE2_GGPK_EXTRACT ?? '/nonexistent/poe2-ggpk-extract';
const GOLDEN = process.env.POE2_DATA_GOLDEN ?? '/nonexistent/poe2-data-golden';
const TABLES_DIR = join(EXTRACT, 'tables/English');
const CACHE_DIR = join(EXTRACT, '.cache');
const GOLDEN_RUNES = join(GOLDEN, 'runes.json');

function readPatch(): string {
  try {
    return JSON.parse(readFileSync(join(EXTRACT, 'config.json'), 'utf8')).patch as string;
  } catch {
    return process.env.POE2_PATCH ?? '0.0.0.0.0';
  }
}

function available(): boolean {
  return existsSync(join(TABLES_DIR, 'SoulCores.json')) && existsSync(GOLDEN_RUNES);
}

describe.skipIf(!available())('runes 1:1 against the deployed golden', () => {
  let built: RuneData;
  let golden: RuneData;

  beforeAll(async () => {
    const source = await createCdnSource({ patch: readPatch(), cacheDir: CACHE_DIR, tablesDir: TABLES_DIR });
    built = await buildRunes(source);
    golden = JSON.parse(readFileSync(GOLDEN_RUNES, 'utf8')) as RuneData;
  });

  it('reproduces every soul core exactly', () => {
    expect(built).toEqual(golden);
  });
});
