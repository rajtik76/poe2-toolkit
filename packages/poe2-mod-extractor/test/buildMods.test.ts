/**
 * Self-contained unit tests: the mod build is exercised against a small in-memory
 * {@link GgpkSource} - tables plus a minimal UTF-16 `.csd` - so the suite needs no
 * network or local GGPK extract.
 */

import type { GgpkSource, TableRow } from '@poe2-toolkit/ggpk';
import { describe, expect, it } from 'vitest';

import { buildMods } from '../src/buildMods';
import { extractMods } from '../src/index';

/**
 * A stat-description file the engine can parse. Blocks: a single-stat additive,
 * an increased-percent, a two-stat added-damage line, a value-dependent variant
 * (reduced vs increased) and a negated line - enough to drive range rendering,
 * the two-stat merge, the variant fallback and the reversed-range order.
 */
const CSD = [
  'description',
  '\t1 add_str',
  '\t1',
  '\t\t# "+{0} to Strength"',
  'description',
  '\t1 phys_pct',
  '\t1',
  '\t\t# "{0}% increased Physical Damage"',
  'description',
  '\t2 add_min add_max',
  '\t1',
  '\t\t# # "Adds {0} to {1} Fire Damage"',
  'description',
  '\t1 cond',
  '\t2',
  '\t\t1|# "{0}% increased Foo"',
  '\t\t#|0 "{0}% reduced Foo" negate 1',
  'description',
  '\t1 neg_stat',
  '\t1',
  '\t\t# "{0}% reduced Bar" negate 1',
  'description',
  '\t1 cap',
  '\t2',
  '\t\t#|99 "{0}% Capped"',
  '\t\t# ""',
  '',
].join('\n');

const TABLES: Record<string, TableRow[]> = {
  Stats: [
    { Id: 'add_str' }, { Id: 'phys_pct' }, { Id: 'add_min' }, { Id: 'add_max' },
    { Id: 'cond' }, { Id: 'neg_stat' }, { Id: 'cap' },
  ],
  Tags: [{ Id: 'ring' }, { Id: 'default' }, { Id: 'weapon' }],
  ModFamily: [{ Id: 'Strength' }, { Id: 'PhysicalDamage' }],
  ModType: [
    { Name: 'Strength' }, { Name: 'PhysicalDamagePercent' }, { Name: 'FireDamage' },
    { Name: 'StrengthFlat' }, { Name: 'CondGroup' }, { Name: 'NegGroup' }, {},
  ],
  Mods: [
    // Same group as StrengthTier2 -> tier ladder. Invalid family index 9 is dropped.
    {
      Id: 'StrengthTier1', Name: 'of the Brute', Domain: 1, GenerationType: 2, ModType: 0, Families: [0, 9], Level: 1,
      Stat1: 0, Stat1Value: [5, 8], SpawnWeight_Tags: [0, 1], SpawnWeight_Values: [1, 0],
    },
    {
      Id: 'StrengthTier2', Name: 'of the Wrestler', Domain: 1, GenerationType: 2, ModType: 0, Families: [0], Level: 11,
      Stat1: 0, Stat1Value: [9, 12], SpawnWeight_Tags: [0, 1], SpawnWeight_Values: [1, 0],
    },
    // Invalid spawn tag index 9 is dropped from the gates.
    {
      Id: 'PhysPct', Name: 'Merciless', Domain: 1, GenerationType: 1, ModType: 1, Families: [1], Level: 82,
      Stat1: 1, Stat1Value: [170, 179], SpawnWeight_Tags: [2, 9, 1], SpawnWeight_Values: [1, 5, 0],
    },
    // Two-stat added-damage block; a blank name becomes null.
    {
      Id: 'AddedFire', Name: '', Domain: 1, GenerationType: 1, ModType: 2, Families: [], Level: 1,
      Stat1: 2, Stat1Value: [1, 2], Stat2: 3, Stat2Value: [4, 5], SpawnWeight_Tags: [2, 1], SpawnWeight_Values: [1, 0],
    },
    // Fixed roll (min == max) renders plain; invalid stat ref and value-less ref are dropped.
    {
      Id: 'FixedStr', Domain: 1, GenerationType: 1, ModType: 3, Level: 5,
      Stat1: 0, Stat1Value: [10, 10], Stat2: 9, Stat2Value: [1, 1], Stat3: 1,
    },
    // Value-dependent variant: min picks "reduced", max picks "increased" -> merge falls back to the max line.
    {
      Id: 'CondMod', Name: 'Weird', Domain: 3, GenerationType: 5, ModType: 4, Level: 1,
      Stat1: 4, Stat1Value: [-5, 10], SpawnWeight_Tags: [1], SpawnWeight_Values: [1],
    },
    // Negated range -> reversed order, so the range still reads low-to-high.
    {
      Id: 'NegMod', Domain: 1, GenerationType: 1, ModType: 5, Level: 1,
      Stat1: 5, Stat1Value: [5, 10], SpawnWeight_Tags: [1], SpawnWeight_Values: [1],
    },
    // Max value hides its line (empty-text variant) while min renders -> the min
    // line is kept. Shares NegMod's group at the same level -> tier tie-break by id.
    {
      Id: 'CapMod', Domain: 1, GenerationType: 1, ModType: 5, Level: 1,
      Stat1: 6, Stat1Value: [5, 100], SpawnWeight_Tags: [1], SpawnWeight_Values: [1],
    },
    // No stats and no group -> empty stats/rolls, null group/tier; null domain -> "Unknown".
    { Id: 'Blank', Name: 'Blank', Domain: null, GenerationType: 1, Level: 1 },
    // Edge fallbacks: enum holes -> numeric string; a name-less ModType -> null group
    // (so null tier); no level -> 0; a spawn tag with no matching value -> weight 0.
    {
      Id: 'NoName', Domain: 6, GenerationType: 12, ModType: 6,
      SpawnWeight_Tags: [0, 1], SpawnWeight_Values: [1],
    },
    // Grouped but with no domain / generation type -> those fall out of the tier
    // key, and both enums read as "Unknown". Alone in its ladder, so tier 1.
    { Id: 'NullDG', ModType: 0, Level: 1 },
    // Skipped: empty id, then a duplicate id (first row wins).
    { Id: '', Domain: 1, GenerationType: 1, Level: 1 },
    { Id: 'StrengthTier1', Name: 'Impostor', Domain: 1, GenerationType: 1, Level: 99 },
  ],
};

/** A fake source: tables plus the `.csd` served as UTF-16 bytes (or absent). */
function fakeSource(csd: string | null = CSD): GgpkSource {
  return {
    table: (name: string) => Promise.resolve(TABLES[name] ?? []),
    file: (path: string) =>
      Promise.resolve(
        csd !== null && path === 'data/statdescriptions/stat_descriptions.csd'
          ? new Uint8Array(Buffer.from(csd, 'utf16le'))
          : null,
      ),
  };
}

describe('buildMods', () => {
  it('maps a mod with its name, enums, group, level, ranged stat and spawn gates', async () => {
    const mods = await buildMods(fakeSource());

    expect(mods.StrengthTier1).toEqual({
      name: 'of the Brute',
      domain: 'Item',
      generationType: 'Suffix',
      group: 'Strength',
      tier: 1,
      level: 1,
      stats: ['+(5-8) to Strength'],
      rolls: [{ stat: 'add_str', min: 5, max: 8 }],
      families: ['Strength'],
      spawnWeights: [{ tag: 'ring', weight: 1 }, { tag: 'default', weight: 0 }],
    });
  });

  it('ranks tiers within a group by ascending level', async () => {
    const mods = await buildMods(fakeSource());

    expect(mods.StrengthTier1?.tier).toBe(1);
    expect(mods.StrengthTier2?.tier).toBe(2);
  });

  it('renders a two-stat added-damage line as two merged ranges', async () => {
    const mods = await buildMods(fakeSource());

    expect(mods.AddedFire).toMatchObject({
      name: null,
      generationType: 'Prefix',
      stats: ['Adds (1-2) to (4-5) Fire Damage'],
      rolls: [
        { stat: 'add_min', min: 1, max: 2 },
        { stat: 'add_max', min: 4, max: 5 },
      ],
    });
  });

  it('renders a fixed roll as a plain number and drops invalid or value-less stat slots', async () => {
    const mods = await buildMods(fakeSource());

    expect(mods.FixedStr?.stats).toEqual(['+10 to Strength']);
    expect(mods.FixedStr?.rolls).toEqual([{ stat: 'add_str', min: 10, max: 10 }]);
  });

  it('keeps the max line when a value-dependent variant breaks the range merge', async () => {
    const mods = await buildMods(fakeSource());

    expect(mods.CondMod).toMatchObject({ domain: 'Monster', generationType: 'Corrupted', stats: ['10% increased Foo'] });
  });

  it('orders a negated range low-to-high', async () => {
    const mods = await buildMods(fakeSource());

    expect(mods.NegMod?.stats).toEqual(['(-10--5)% reduced Bar']);
  });

  it('keeps the min line when the max value hides its own line', async () => {
    const mods = await buildMods(fakeSource());

    expect(mods.CapMod?.stats).toEqual(['5% Capped']);
  });

  it('breaks a same-level tier tie by id, so tiers stay stable', async () => {
    const mods = await buildMods(fakeSource());

    // CapMod and NegMod share a group at level 1; "CapMod" sorts before "NegMod".
    expect(mods.CapMod?.tier).toBe(1);
    expect(mods.NegMod?.tier).toBe(2);
  });

  it('drops invalid spawn-tag indices while keeping order', async () => {
    const mods = await buildMods(fakeSource());

    expect(mods.PhysPct?.stats).toEqual(['(170-179)% increased Physical Damage']);
    expect(mods.PhysPct?.spawnWeights).toEqual([{ tag: 'weapon', weight: 1 }, { tag: 'default', weight: 0 }]);
  });

  it('drops invalid family indices', async () => {
    const mods = await buildMods(fakeSource());

    expect(mods.StrengthTier1?.families).toEqual(['Strength']);
  });

  it('leaves a group-less, stat-less mod empty and maps a null domain to Unknown', async () => {
    const mods = await buildMods(fakeSource());

    expect(mods.Blank).toEqual({
      name: 'Blank',
      domain: 'Unknown',
      generationType: 'Prefix',
      group: null,
      tier: null,
      level: 1,
      stats: [],
      rolls: [],
      families: [],
      spawnWeights: [],
    });
  });

  it('falls back on enum holes, a name-less group, a missing level and a value-less spawn tag', async () => {
    const mods = await buildMods(fakeSource());

    expect(mods.NoName).toEqual({
      name: null,
      domain: '6',
      generationType: '12',
      group: null,
      tier: null,
      level: 0,
      stats: [],
      rolls: [],
      families: [],
      spawnWeights: [{ tag: 'ring', weight: 1 }, { tag: 'default', weight: 0 }],
    });
  });

  it('tiers a grouped mod that has no domain or generation type, reading both enums as Unknown', async () => {
    const mods = await buildMods(fakeSource());

    expect(mods.NullDG).toMatchObject({ domain: 'Unknown', generationType: 'Unknown', group: 'Strength', tier: 1 });
  });

  it('skips an empty id and never lets a duplicate id overwrite the first row', async () => {
    const mods = await buildMods(fakeSource());

    expect(mods['']).toBeUndefined();
    expect(mods.StrengthTier1?.name).toBe('of the Brute'); // not the later "Impostor" row
  });

  it('throws when the stat-description file is absent', async () => {
    await expect(buildMods(fakeSource(null))).rejects.toThrow('stat descriptions not found');
  });
});

describe('extractMods', () => {
  it('returns the mod data in a bundle', async () => {
    const { data } = await extractMods(fakeSource());

    expect(Object.keys(data)).toContain('StrengthTier1');
  });
});
