/**
 * Optional validation: the item-class tags that `buildItems` folds into each base's
 * `tags` are checked 1:1 against Path of Building's `Data/Bases` tag sets.
 *
 * PoE2 leaves the item-class tags (`armour`, `weapon`, `bow`, ...) to be inherited
 * from the class rather than storing them on the base, so `buildItems` encodes that
 * inheritance in a curated map; this test proves that map against PoB, the
 * reference implementation. Only the class-contributed tags are compared (the
 * intersection with the class vocabulary below), so base-specific league tags that
 * differ between PoB's snapshot and the extracted patch do not cause noise.
 *
 * Point `POE2_GGPK_EXTRACT` at a directory holding `tables/English` (plus a
 * `.cache` and `config.json`) and `POE2_POB_DIR` at a Path of Building PoE2 checkout
 * (the one holding `src/Data/Bases`). Without both, the suite skips (as in CI).
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { createCdnSource } from '@poe2-toolkit/ggpk';
import { describe, expect, it } from 'vitest';

import { buildItems } from '../src/buildItems';

const EXTRACT = process.env.POE2_GGPK_EXTRACT ?? '/nonexistent/poe2-ggpk-extract';
const POB = process.env.POE2_POB_DIR ?? '/nonexistent/PathOfBuilding-PoE2';
const TABLES_DIR = join(EXTRACT, 'tables/English');
const CACHE_DIR = join(EXTRACT, '.cache');
const BASES_DIR = join(POB, 'src/Data/Bases');

/** Every tag an item class can contribute; base-specific tags are ignored. */
const CLASS_VOCABULARY = new Set([
  'default', 'amulet', 'belt', 'ring', 'quiver',
  'armour', 'body_armour', 'boots', 'gloves', 'helmet', 'shield', 'buckler', 'focus',
  'weapon', 'ranged', 'one_hand_weapon', 'onehand', 'two_hand_weapon', 'twohand',
  'axe', 'mace', 'sword', 'bow', 'crossbow', 'claw', 'dagger', 'flail', 'spear',
  'sceptre', 'wand', 'staff', 'warstaff', 'talisman', 'trap', 'fishing_rod',
  'flask', 'life_flask', 'mana_flask', 'utility_flask',
]);

function readPatch(): string {
  try {
    return JSON.parse(readFileSync(join(EXTRACT, 'config.json'), 'utf8')).patch as string;
  } catch {
    return process.env.POE2_PATCH ?? '0.0.0.0.0';
  }
}

function available(): boolean {
  return existsSync(join(TABLES_DIR, 'BaseItemTypes.json')) && existsSync(BASES_DIR);
}

/** Parse PoB's `Data/Bases/*.lua` into a base-name -> tag-set map. */
function readPobTags(): Map<string, Set<string>> {
  const byName = new Map<string, Set<string>>();
  const entry = /itemBases\["([^"]+)"\]\s*=\s*\{([\s\S]*?)\n\}/g;
  const tagsBlock = /tags\s*=\s*\{([^}]*)\}/;
  const tagName = /(\w+)\s*=\s*true/g;

  for (const file of readdirSync(BASES_DIR).filter((name) => name.endsWith('.lua'))) {
    const text = readFileSync(join(BASES_DIR, file), 'utf8');

    for (const [, name, body] of text.matchAll(entry)) {
      const block = tagsBlock.exec(body ?? '');

      if (block) {
        byName.set(name!, new Set([...(block[1] ?? '').matchAll(tagName)].map((m) => m[1]!)));
      }
    }
  }

  return byName;
}

/** The class-vocabulary tags of a set, sorted for a stable comparison. */
function classTags(tags: Iterable<string>): string[] {
  return [...tags].filter((tag) => CLASS_VOCABULARY.has(tag)).sort();
}

describe.skipIf(!available())('item-class tags match Path of Building', () => {
  it('agrees with PoB on the class-contributed tags of every base', async () => {
    const source = await createCdnSource({ patch: readPatch(), cacheDir: CACHE_DIR, tablesDir: TABLES_DIR });
    const items = await buildItems(source);
    const pob = readPobTags();

    const mismatches: string[] = [];

    for (const [name, tags] of pob) {
      const item = items[name];

      if (!item || item.rarity !== 'normal') {
        continue; // uniques carry no tags; names PoB has but the extract does not are skipped
      }

      const derived = classTags(item.tags).join(',');
      const expected = classTags(tags).join(',');

      if (derived !== expected) {
        mismatches.push(`${name}: got [${derived}] expected [${expected}]`);
      }
    }

    expect(mismatches).toEqual([]);
  });
});
