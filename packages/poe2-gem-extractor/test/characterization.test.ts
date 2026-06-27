/**
 * Characterization test: rebuild gem data from a real GGPK extract and assert it
 * reproduces the deployed golden `gems.json` / `gem_requirements.json` 1:1.
 *
 * The extract and the golden carry derived GGG game data, so neither lives in
 * this repo. Point `POE2_GGPK_EXTRACT` at a directory holding `tables/English`
 * (the decoded tables, plus a `.cache` and `config.json` for the patch) and
 * `POE2_DATA_GOLDEN` at the directory holding the golden JSON. Without both, the
 * suite skips (as it does in CI). `buildGems` reads only tables, so this runs
 * offline given the extract.
 *
 * One deliberate divergence is normalized here: the deployed app stores gem
 * skill-icon paths with a `/4k/` segment (it matches its vendored 4k PNGs),
 * while the extractor keeps the raw GGPK base path. The golden's gem icons are
 * mapped back to base paths before comparing, so the test asserts data parity
 * while documenting that the icon path is intentionally different.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createCdnSource } from '@poe2-toolkit/ggpk';
import { beforeAll, describe, expect, it } from 'vitest';

import { buildGems } from '../src/buildGems';
import type { Gem, GemData } from '../src/buildGems';

const EXTRACT = process.env.POE2_GGPK_EXTRACT ?? '/nonexistent/poe2-ggpk-extract';
const GOLDEN = process.env.POE2_DATA_GOLDEN ?? '/nonexistent/poe2-data-golden';
const TABLES_DIR = join(EXTRACT, 'tables/English');
const CACHE_DIR = join(EXTRACT, '.cache');
const GOLDEN_GEMS = join(GOLDEN, 'gems.json');
const GOLDEN_REQS = join(GOLDEN, 'gem_requirements.json');

function readPatch(): string {
  try {
    return JSON.parse(readFileSync(join(EXTRACT, 'config.json'), 'utf8')).patch as string;
  } catch {
    return process.env.POE2_PATCH ?? '0.0.0.0.0';
  }
}

function available(): boolean {
  return existsSync(join(TABLES_DIR, 'SkillGems.json')) && existsSync(GOLDEN_GEMS) && existsSync(GOLDEN_REQS);
}

/**
 * Map the app's icon paths back to the GGPK base paths. The app inserts a `4k/`
 * segment before the file name to match its vendored 4k PNGs, both for active
 * icons (`SkillIcons/4k/X.dds`) and support icons (`SkillIcons/Support/4k/X.dds`),
 * so dropping that one segment wherever it sits recovers the raw GGPK path.
 */
function toBaseIcon(icon: string | null): string | null {
  return icon ? icon.replace('/4k/', '/') : icon;
}

function normalizeGoldenIcons(gems: Record<string, Gem>): Record<string, Gem> {
  return Object.fromEntries(Object.entries(gems).map(([key, gem]) => [key, { ...gem, icon: toBaseIcon(gem.icon) }]));
}

describe.skipIf(!available())('gems 1:1 against the deployed golden', () => {
  let built: GemData;
  let goldenGems: Record<string, Gem>;
  let goldenReqs: GemData['requirements'];

  beforeAll(async () => {
    const source = await createCdnSource({ patch: readPatch(), cacheDir: CACHE_DIR, tablesDir: TABLES_DIR });
    built = await buildGems(source);
    goldenGems = JSON.parse(readFileSync(GOLDEN_GEMS, 'utf8')) as Record<string, Gem>;
    goldenReqs = JSON.parse(readFileSync(GOLDEN_REQS, 'utf8')) as GemData['requirements'];
  });

  it('reproduces every gem (icon paths normalized to GGPK base)', () => {
    expect(built.gems).toEqual(normalizeGoldenIcons(goldenGems));
  });

  it('reproduces the per-level requirement curves exactly', () => {
    expect(built.requirements).toEqual(goldenReqs);
  });
});
