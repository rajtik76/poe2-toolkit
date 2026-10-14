/**
 * Behavioural coverage for `buildTree` on a hand-built source: a tiny `.psg`,
 * stat descriptions and tables, so the export rules run without a GGPK extract.
 * Pins down what the tree keeps and how it reads its nodes: released content
 * only, plain names, socket flags, anointment recipes, mastery effects, line
 * order and the ascendancy that replaces another.
 */

import type { GgpkSource, TableRow } from '@poe2-toolkit/ggpk';
import { describe, expect, it } from 'vitest';

import { buildTree, grantedStats, plainName } from '../../src/buildTree';

import { PsgWriter } from './psgWriter';

const LINE = 2147483647;

/**
 * Group 0: a jewel socket (10), a notable (11) linked to a node of a disabled
 * ascendancy (12), and a Sinister socket (13). Group 1: only that disabled
 * ascendancy's node (20). Group 2: the Lich start (30), a Lich notable holding a
 * socket (31) and a Lich node Abyssal Lich overrides (32).
 */
function graph(): Uint8Array {
  const w = new PsgWriter();
  w.u8(3).u8(1).u8(2).u8(1).u8(12); // version, graphType, 2 orbit rings: 1 and 12 slots
  w.u32(0); // no roots
  w.u32(3); // three groups

  w.f32(0).f32(0).u32(0).u32(0).u8(0).u32(3);
  w.u32(10).u32(0).u32(0).u32(1).u32(11).i32(LINE);
  w.u32(11).u32(1).u32(0).u32(1).u32(12).i32(LINE);
  w.u32(13).u32(1).u32(6).u32(0);

  w.f32(500).f32(0).u32(0).u32(0).u8(0).u32(1);
  w.u32(20).u32(0).u32(0).u32(0);

  w.f32(1000).f32(0).u32(0).u32(0).u8(0).u32(3);
  w.u32(30).u32(0).u32(0).u32(1).u32(31).i32(LINE);
  w.u32(31).u32(1).u32(0).u32(1).u32(32).i32(LINE);
  w.u32(32).u32(1).u32(3).u32(0);

  return w.build();
}

const BASE_CSD = [
  'description',
  '\t1 armour_+%',
  '\t1',
  '\t\t# "{0}% increased Armour"',
  'description',
  '\t1 life_regeneration_rate_per_minute_%',
  '\t1',
  '\t\t# "Regenerate {0}% of maximum Life per second" per_minute_to_per_second 1',
  'description',
  '\t1 maximum_stacks',
  '\t1',
  '\t\t# "Up to {0} stacks"',
].join('\n');

const PASSIVE_CSD = ['include "Metadata/StatDescriptions/stat_descriptions.csd"', 'description', '\t1 armour_+%', '\t1', '\t\t# "{0}% more Armour"'].join('\n');

/** PassiveSkills rows, indexed by position as other tables reference them. */
const PASSIVES: TableRow[] = [
  { Id: 'jewel1', PassiveSkillGraphId: 10, Name: '[Jewel] Socket', IsJewelSocket: true, WeaponPointsGranted: 0 },
  // Stats listed armour first; its superseding passive description sits after the
  // base regeneration one, so the lines come out regeneration first.
  {
    Id: 'heart', PassiveSkillGraphId: 11, Name: 'Heart Tissue', IsNotable: true, MasteryGroup: 0,
    Stats: [0, 1], Stat1Value: 12, Stat2Value: 30,
  },
  { Id: 'unused', PassiveSkillGraphId: 12, Name: 'Unused Notable', Ascendancy: 2 },
  { Id: 'voices_jewel_slot1', PassiveSkillGraphId: 13, Name: '[SinisterJewelSockets|Sinister] [Jewel] Socket', IsJewelSocket: true, IsAnointmentOnly: true },
  { Id: 'unused2', PassiveSkillGraphId: 20, Name: '[DNT-UNUSED] Duelist1Notable1', Ascendancy: 2 },
  { Id: 'lich_start', PassiveSkillGraphId: 30, Name: 'Necromancer', Ascendancy: 0, IsAscendancyStartingNode: true },
  {
    Id: 'phylactery', PassiveSkillGraphId: 31, Name: 'Crystalline Phylactery', Ascendancy: 0, IsNotable: true,
    IsJewelSocket: true, FlavourText: 'First line\r\nSecond line',
  },
  // A sixth stat slot carries the only non-zero value.
  {
    Id: 'lich_small', PassiveSkillGraphId: 32, Name: 'Life', Ascendancy: 0,
    Stats: [0, 0, 0, 0, 0, 2], Stat6Value: 30,
  },
  { Id: 'abyssal_small', PassiveSkillGraphId: 33, Name: '[Abyss|Abyssal] Life', Stats: [0], Stat1Value: 5 },
];

const TABLES: Record<string, TableRow[]> = {
  PassiveSkills: PASSIVES,
  Stats: [{ Id: 'armour_+%' }, { Id: 'life_regeneration_rate_per_minute_%' }, { Id: 'maximum_stacks' }],
  PassiveSkillMasteryGroups: [{ Art: 0 }],
  PassiveSkillTreeMasteryArt: [{ ActiveEffectImage: 'Art/MasteryPattern' }],
  Characters: [{ Name: 'Witch', BaseStrength: 7, BaseDexterity: 7, BaseIntelligence: 15 }],
  Ascendancy: [
    { Id: 'Witch3', Name: 'Lich', Character: 0 },
    { Id: 'Witch3b', Name: 'Abyssal Lich', Character: 0, BaseAscendancy: 0 },
    { Id: 'Duelist1', Name: 'Unreleased', Character: 0, Disabled: true },
  ],
  PassiveJewelSlots: [],
  ClassPassiveSkillOverrides: [],
  AscendancyPassiveSkillOverrides: [{ AscendancyToOverrideFor: 1, SkillToOverride: 7, Override: 8 }],
  QuestStaticRewards: [],
  ExperienceLevels: [{ Level: 100 }],
  QuestFlags: [],
  SkillGems: [],
  BaseItemTypes: [],
  BlightCraftingResults: [{ PassiveSkill: 1 }],
  BlightCraftingRecipes: [{ BlightCraftingResult: 0, BlightCraftingItems: [0, 1, 0] }],
  BlightCraftingItems: [{ NameShort: 'Fear' }, { NameShort: 'Guilt' }],
};

const FILES: Record<string, Uint8Array> = {
  'metadata/passiveskillgraph.psg': graph(),
  'data/statdescriptions/stat_descriptions.csd': new Uint8Array(Buffer.from(BASE_CSD, 'utf16le')),
  'data/statdescriptions/passive_skill_stat_descriptions.csd': new Uint8Array(Buffer.from(PASSIVE_CSD, 'utf16le')),
};

const source: GgpkSource = {
  table: (name: string) => Promise.resolve(TABLES[name] ?? []),
  file: (path: string) => Promise.resolve(FILES[path] ?? null),
};

describe('buildTree', async () => {
  const tree = await buildTree(source);

  it('leaves out the nodes, edges and groups of a disabled ascendancy', () => {
    expect(tree.nodes[12]).toBeUndefined();
    expect(tree.nodes[20]).toBeUndefined();
    expect(tree.nodes[11]!.out).toEqual([10]);
    expect(tree.groups[1]).toBeUndefined();
    expect(tree.groups[0]!.nodes).toEqual([10, 11, 13]);
  });

  it('strips markup from names and names an ascendancy start after its ascendancy', () => {
    expect(tree.nodes[10]!.name).toBe('Jewel Socket');
    expect(tree.nodes[13]!.name).toBe('Sinister Jewel Socket');
    expect(tree.nodes[30]!.name).toBe('Lich');
  });

  it('flags plain, Sinister and contained jewel sockets the way PoB does', () => {
    expect(tree.nodes[10]).toMatchObject({ isJewelSocket: true, stringId: 'jewel1' });
    expect(tree.nodes[13]).toMatchObject({
      isJewelSocket: true, sinister: true, noRadius: true, aliasPassiveSocket: 'voices_jewel_slot1',
    });
    expect(tree.nodes[31]!.isJewelSocket).toBeUndefined();
    expect(tree.nodes[31]).toMatchObject({ isNotable: true, containJewelSocket: true });
  });

  it('lists stat lines in description-file order, with a passive description superseding the base one', () => {
    expect(tree.nodes[11]!.stats).toEqual(['Regenerate 0.5% of maximum Life per second', '12% more Armour']);
  });

  it('reads stat values past the fifth slot', () => {
    expect(tree.nodes[32]!.stats).toEqual(['Up to 30 stacks']);
  });

  it('carries the anointment recipe and the mastery effect of a cluster notable', () => {
    expect(tree.nodes[11]).toMatchObject({ recipe: ['Fear', 'Guilt', 'Fear'], activeEffectImage: 'Art/MasteryPattern' });
  });

  it('drops the carriage returns of a flavour text', () => {
    expect(tree.nodes[31]!.flavourText).toBe('First line\nSecond line');
  });

  it('links a replacing ascendancy to the one it replaces, with its node overrides', () => {
    expect(tree.classes[0]!.ascendancies).toEqual([
      expect.objectContaining({ id: 'Witch3', name: 'Lich' }),
      expect.objectContaining({ id: 'Witch3b', name: 'Abyssal Lich', replaces: 'Witch3', overridePairs: { 32: 33 } }),
    ]);
    expect(tree.nodes[33]).toEqual({ skill: 33, name: 'Abyssal Life', icon: '', stats: ['5% more Armour'] });
  });
});

describe('grantedStats', () => {
  it('describes passive points turned into weapon-set points', () => {
    expect(grantedStats({ WeaponPointsGranted: 100 }, [], [])).toEqual([
      '100 Passive Skill Points become Weapon Set Skill Points',
    ]);
  });
});

describe('plainName', () => {
  it('keeps the display side of bbcode and the text of a markup tag', () => {
    expect(plainName('[SinisterJewelSockets|Sinister] [Jewel] Socket')).toBe('Sinister Jewel Socket');
    expect(plainName('Ritual of the <i>{barya}')).toBe('Ritual of the barya');
  });
});
