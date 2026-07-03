/**
 * Cross-extractor join: the mods that can roll on an item. Items come from the
 * real {@link buildItems} (so `modDomain` and `tags` are produced exactly as
 * shipped), mods are hand-built fixtures in the `@poe2-toolkit/mod-extractor`
 * `Mod` shape. This locks the documented `compatibleMods` filter - domain first,
 * then the spawn-tag gate - so flasks draw only flask mods, gear draws only gear
 * mods, and a foreign-domain mod with a positive `default` weight never leaks.
 */

import type { GgpkSource, TableRow } from '@poe2-toolkit/ggpk';
import { describe, expect, it } from 'vitest';

import { buildItems } from '../src/buildItems';

/** Just the fields the join reads off a mod; a structural subset of `Mod`. */
interface JoinMod {
  domain: string;
  spawnWeights: { tag: string; weight: number }[];
}

/**
 * The join exactly as both package READMEs document it: a mod rolls on an item
 * when it shares the item's mod domain and the first of its spawn weights whose
 * tag the item carries is positive.
 */
function compatibleMods(item: { modDomain: string | null; tags: string[] }, mods: Record<string, JoinMod>): string[] {
  return Object.entries(mods)
    .filter(([, mod]) => {
      if (mod.domain !== item.modDomain) {
        return false;
      }

      const gate = mod.spawnWeights.find((sw) => sw.tag === 'default' || item.tags.includes(sw.tag));

      return gate != null && gate.weight > 0;
    })
    .map(([id]) => id);
}

/** A body armour (Item domain), a life flask (Flask domain) and a ring. */
const TABLES: Record<string, TableRow[]> = {
  BaseItemTypes: [
    { Name: 'Vaal Cuirass', ItemClass: 0, ItemVisualIdentity: 0, ModDomain: 1, Tags: [0] },
    { Name: 'Grand Life Flask', ItemClass: 1, ItemVisualIdentity: 1, ModDomain: 2 },
    { Name: 'Iron Ring', ItemClass: 2, ItemVisualIdentity: 2, ModDomain: 1 },
  ],
  ItemClasses: [{ Id: 'Body Armour' }, { Id: 'LifeFlask' }, { Id: 'Ring' }],
  Tags: [{ Id: 'str_armour' }],
  ItemVisualIdentity: [
    { Id: 'Cuirass', DDSFile: 'Art/cuirass.dds' },
    { Id: 'Flask', DDSFile: 'Art/flask.dds' },
    { Id: 'Ring', DDSFile: 'Art/ring.dds' },
  ],
  AttributeRequirements: [],
  UniqueStashLayout: [],
  Words: [],
  UniqueStashTypes: [],
  FlavourText: [],
};

const source: GgpkSource = {
  table: (name: string) => Promise.resolve(TABLES[name] ?? []),
  file: () => Promise.resolve(null),
};

/** Fixtures spanning every join outcome: domain match/miss, tag gate, first-match. */
const MODS: Record<string, JoinMod> = {
  // Flask domain, gates on life_flask - a life flask only.
  FlaskLife: { domain: 'Flask', spawnWeights: [{ tag: 'life_flask', weight: 1 }, { tag: 'default', weight: 0 }] },
  // Item domain, universal default weight - any Item-domain gear.
  ItemFireResist: { domain: 'Item', spawnWeights: [{ tag: 'default', weight: 1000 }] },
  // Item domain, armour-only: gates on str_armour, blocked elsewhere by default 0.
  ItemArmour: { domain: 'Item', spawnWeights: [{ tag: 'str_armour', weight: 800 }, { tag: 'default', weight: 0 }] },
  // Item domain, weapon-only: no gear here carries `weapon`, so default 0 blocks it.
  ItemWeaponPhys: { domain: 'Item', spawnWeights: [{ tag: 'weapon', weight: 900 }, { tag: 'default', weight: 0 }] },
  // First-match-wins: str_armour 0 blocks on the cuirass even though default is positive.
  ItemBlockedOnArmour: { domain: 'Item', spawnWeights: [{ tag: 'str_armour', weight: 0 }, { tag: 'default', weight: 500 }] },
  // Foreign domain with a fat default weight - the classic leak. Must match nothing.
  MonsterLeak: { domain: 'Monster', spawnWeights: [{ tag: 'default', weight: 5000 }] },
};

describe('joining items to mods', () => {
  it('rolls only Flask-domain, life-gated mods on a life flask', async () => {
    const items = await buildItems(source);
    const flask = items['Grand Life Flask'];

    expect(flask?.modDomain).toBe('Flask');
    expect(compatibleMods(flask!, MODS)).toEqual(['FlaskLife']);
  });

  it('rolls Item-domain gear mods on a body armour and never the flask or a foreign-domain mod', async () => {
    const items = await buildItems(source);
    const cuirass = items['Vaal Cuirass'];

    expect(cuirass?.modDomain).toBe('Item');
    // FireResist (default) and Armour (str_armour) roll; weapon and the
    // first-match-blocked mod do not; the flask and Monster mods are wrong-domain.
    expect(compatibleMods(cuirass!, MODS).sort()).toEqual(['ItemArmour', 'ItemFireResist']);
  });

  it('gates a ring to Item-domain default mods, excluding armour- and weapon-specific ones', async () => {
    const items = await buildItems(source);
    const rolls = compatibleMods(items['Iron Ring']!, MODS);

    expect(rolls).toContain('ItemFireResist'); // universal default weight
    expect(rolls).not.toContain('ItemArmour'); // str_armour gate, default 0
    expect(rolls).not.toContain('ItemWeaponPhys'); // weapon gate, default 0
    expect(rolls).not.toContain('FlaskLife'); // wrong domain
  });

  it('never leaks a foreign-domain mod despite its positive default weight', async () => {
    const items = await buildItems(source);

    for (const name of ['Vaal Cuirass', 'Grand Life Flask', 'Iron Ring']) {
      expect(compatibleMods(items[name]!, MODS)).not.toContain('MonsterLeak');
    }
  });

  it('honours first-match-wins: a leading zero weight blocks even with a positive default', async () => {
    const items = await buildItems(source);

    // The cuirass carries str_armour, so ItemBlockedOnArmour's first gate (weight 0) wins.
    expect(compatibleMods(items['Vaal Cuirass']!, MODS)).not.toContain('ItemBlockedOnArmour');
    // The ring lacks str_armour, so the same mod falls through to default 500 and rolls.
    expect(compatibleMods(items['Iron Ring']!, MODS)).toContain('ItemBlockedOnArmour');
  });
});
