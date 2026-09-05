/**
 * Self-contained unit tests: the gem build and its ported helpers are exercised
 * against a small in-memory {@link GgpkSource}, so the suite needs no network or
 * local GGPK extract.
 */

import type { GgpkSource, RgbaImage, TableRow } from '@poe2-toolkit/ggpk';
import { describe, expect, it, vi } from 'vitest';

import { buildGems, gemStatRequirement, stripBbcode } from '../src/buildGems';
import { buildGemIcons } from '../src/buildIcons';
import type { GemIconSource } from '../src/buildIcons';
import { extractGems } from '../src/index';

/** A hand-written `.csd` sample covering the stat shapes {@link buildGems} renders. */
const STAT_DESCRIPTIONS = [
  'description',
  '\t1 test_flat_stat',
  '\t1',
  '\t\t# "Test Flat +{0}%"',
  'description',
  '\t1 chain_count_test',
  '\t1',
  '\t\t# "Chain Count Test {0}"',
  'description',
  '\t2 min_dmg_test max_dmg_test',
  '\t1',
  '\t\t# # "Deals {0} to {1} Test Damage"',
  'description',
  '\t1 quality_stat_test',
  '\t1',
  '\t\t# "Quality Stat Test +{0}"',
  'description',
  '\t1 alt_quality_stat_test',
  '\t1',
  '\t\t# "Alt Quality Stat Test +{0}"',
].join('\n');

/** A second `.csd` sample - the general (item-mod-shared) file, with a stat the skill file doesn't define. */
const GENERAL_STAT_DESCRIPTIONS = [
  'description',
  '\t1 general_only_stat',
  '\t1',
  '\t\t# "General Only Stat +{0}"',
].join('\n');

/** A UIImages sprite name: the form `SkillGems.UI_Image` holds from patch 4.5.5 on. */
const ICE_BOLT_HOVER_SPRITE = 'Art/2DArt/UIImages/InGame/SmartHover/GemHoverImage/GemHoverImageIceBolt';

/** Minimal in-memory tables modelling one active gem, one support, one [DNT], plus IceBolt for scaling edge cases. */
const TABLES: Record<string, TableRow[]> = {
  BaseItemTypes: [
    { Id: 'Metadata/Items/Gems/Fireball', Name: 'Fireball' },
    { Id: 'Metadata/Items/Gems/AddedFire', Name: 'Added Fire' },
    { Id: 'Metadata/Items/Gems/Placeholder', Name: 'Placeholder [DNT]' },
    { Id: 'Metadata/Items/Gems/IceBolt', Name: 'Ice Bolt' },
    { Id: 'Metadata/Items/Gems/FrostBolt', Name: 'Frost Bolt' },
  ],
  ActiveSkills: [
    { Description: '[Fire] damage', Icon_DDSFile: 'Art/2DArt/SkillIcons/fireball.dds' },
    { Description: '[Cold] bolt', Icon_DDSFile: 'Art/2DArt/SkillIcons/icebolt.dds' },
    { Description: '[Cold] shard', Icon_DDSFile: 'Art/2DArt/SkillIcons/frostbolt.dds' },
  ],
  GrantedEffects: [
    { ActiveSkill: 0, StatSet: 0, CastTime: 800 },
    { ActiveSkill: null },
    { ActiveSkill: 1, StatSet: 1, CastTime: 0 },
    // Reuses StatSet 0 but has no GrantedEffectQualityStats row of its own.
    { ActiveSkill: 2, StatSet: 0, CastTime: 800 },
  ],
  GemEffects: [
    { GrantedEffect: 0, GemTags: [0, 1] },
    { GrantedEffect: 1, SupportText: 'Supports [Fire] skills' },
    { GrantedEffect: 2, GemTags: [] },
    { GrantedEffect: 3, GemTags: [] },
  ],
  GemTags: [{ Name: 'Fire' }, { Name: '[AoESkill|AoE]' }],
  SkillGems: [
    {
      BaseItemType: 0, GemType: 0, GemColour: 1, MinLevelReq: 1, GemEffects: [0], IntelligenceRequirementPercent: 100,
      UI_Image: 'Art/2DArt/SkillIcons/fireball_hover.dds',
    },
    { BaseItemType: 1, GemType: 1, GemColour: 1, GemEffects: [1], StrengthRequirementPercent: 100 },
    { BaseItemType: 2, GemType: 0, GemEffects: [] },
    // 4.5.5+ reference form: a UIImages sprite name, no extension (Fireball above keeps the older DDS-path form).
    { BaseItemType: 3, GemType: 0, GemColour: 3, MinLevelReq: 1, GemEffects: [2], UI_Image: ICE_BOLT_HOVER_SPRITE },
    { BaseItemType: 4, GemType: 0, GemColour: 1, MinLevelReq: 1, GemEffects: [3] },
    // BaseItemType doesn't resolve to a row: skipped before any join is attempted.
    { BaseItemType: 999, GemType: 0, GemEffects: [] },
  ],
  SupportGems: [{ SkillGem: 1, Icon: 'Art/2DArt/SkillIcons/support.dds' }],
  GrantedEffectsPerLevel: [
    { GrantedEffect: 0, Level: 1, ActorLevel: 1, CostAmounts: [8], AttackTime: 0 },
    { GrantedEffect: 0, Level: 2, ActorLevel: 10.5, CostAmounts: [10], AttackTime: 0, Cooldown: 4000 },
    { GrantedEffect: 2, Level: 1, ActorLevel: 1, AttackTime: 900, Reservation: 50 },
    { GrantedEffect: 2, Level: 2, ActorLevel: 5, AttackTime: 0, Cooldown: 0, Reservation: 0 },
    // No GrantedEffect: skipped by the per-level index build (map-build guard).
    { Level: 99, ActorLevel: 1 },
    // Has a GrantedEffect but no Level/ActorLevel: skipped by the requirement-curve loop itself.
    { GrantedEffect: 2, ActorLevel: 1 },
  ],
  Stats: [
    { Id: 'test_flat_stat' },
    { Id: 'chain_count_test' },
    { Id: 'min_dmg_test' },
    { Id: 'max_dmg_test' },
    { Id: 'quality_stat_test' },
    { Id: 'unresolved_stat_test' },
    { Id: 'general_only_stat' },
    { Id: 'alt_quality_stat_test' },
  ],
  GrantedEffectStatSets: [
    { ConstantStats: [0], ConstantStatsValues: [50] },
    { ConstantStats: [6], ConstantStatsValues: [42] }, // general_only_stat: resolves only via the general-index fallback.
  ],
  GrantedEffectStatSetsPerLevel: [
    { StatSet: 0, GemLevel: 1, SpellCritChance: 500, AttackCritChance: 0, BaseResolvedValues: [1, 10], AdditionalStatsValues: [2], FloatStats: [2, 3], AdditionalStats: [1] },
    { StatSet: 0, GemLevel: 2, SpellCritChance: 500, AttackCritChance: 0, BaseResolvedValues: [3, 20], AdditionalStatsValues: [4], FloatStats: [2, 3], AdditionalStats: [1] },
    // GemLevel1: attack time from GrantedEffectsPerLevel wins, no matching cost row -> cost null,
    // a trailing odd stat id with no description block (dropped, not fabricated).
    { StatSet: 1, GemLevel: 1, SpellCritChance: 0, AttackCritChance: 300, BaseResolvedValues: [5, 15, 7], FloatStats: [2, 3, 5] },
    // GemLevel2: AttackTime and the flat CastTime are both 0 -> castTime null; Cooldown/Reservation both 0 -> null.
    { StatSet: 1, GemLevel: 2, SpellCritChance: 0, AttackCritChance: 0 },
    // GemLevel3: no matching GrantedEffectsPerLevel row at all -> cost/castTime/cooldown/reservation all null.
    { StatSet: 1, GemLevel: 3, SpellCritChance: 0, AttackCritChance: 0 },
    // No GemLevel: skipped by the per-level scaling loop (not just the map-build guard).
    { StatSet: 1, GemLevel: null, SpellCritChance: 0 },
    // No StatSet: skipped by the per-level index build (map-build guard).
    { GemLevel: 1, SpellCritChance: 0 },
  ],
  GrantedEffectQualityStats: [
    { GrantedEffect: 0, Stats: [4], StatsValuesPermille: [50], AltStats: [], AltStatValuesPermille: [] },
    // A Stats line with no description block (dropped) alongside a resolving AltStats line.
    { GrantedEffect: 2, Stats: [5], StatsValuesPermille: [50], AltStats: [7], AltStatValuesPermille: [100] },
    // No GrantedEffect: skipped by the quality-stats index build (map-build guard).
    { Stats: [4], StatsValuesPermille: [50] },
  ],
};

/**
 * A fake source: tables from the fixture above, DDS paths and sprite names both
 * resolved per `images` (the sprite index is the source's concern, so a fake can
 * serve a name straight from the same map).
 */
function fakeSource(images: Record<string, RgbaImage | null> = {}): GgpkSource & GemIconSource {
  return {
    table: (name: string) => Promise.resolve(TABLES[name] ?? []),
    file: (path: string) => Promise.resolve(
      new Uint8Array(Buffer.from(path.includes('skill_stat_descriptions') ? STAT_DESCRIPTIONS : GENERAL_STAT_DESCRIPTIONS, 'utf16le')),
    ),
    dds: (path: string) => Promise.resolve(images[path] ?? null),
    uiSprite: (name: string) => Promise.resolve(images[name] ?? null),
  };
}

const px = (): RgbaImage => ({ width: 1, height: 1, rgba: new Uint8Array([1, 2, 3, 4]) });

describe('gemStatRequirement', () => {
  it('returns 0 for support gems and zero-percent attributes', () => {
    expect(gemStatRequirement(20, 100, true)).toBe(0);
    expect(gemStatRequirement(20, 0, false)).toBe(0);
  });

  it('floors a result under 8 to 0', () => {
    expect(gemStatRequirement(1, 100, false)).toBe(0);
  });

  it('matches PoB CalcTools at higher levels', () => {
    expect(gemStatRequirement(10, 100, false)).toBe(21);
  });
});

describe('stripBbcode', () => {
  it('keeps plain tags and the display half of piped tags', () => {
    expect(stripBbcode('[Fire] and [AoESkill|AoE]')).toBe('Fire and AoE');
  });
});

describe('buildGems', () => {
  it('maps an active gem, joining the SkillGems -> ActiveSkills chain', async () => {
    const { gems } = await buildGems(fakeSource());
    const fireball = gems.Fireball;

    expect(fireball).toMatchObject({
      name: 'Fireball',
      kind: 'active',
      color: 'r',
      tags: ['Fire', 'AoE'],
      description: 'Fire damage',
      icon: 'Art/2DArt/SkillIcons/fireball.dds',
      hoverImage: 'Art/2DArt/SkillIcons/fireball_hover.dds',
      req: { str: 0, dex: 0, int: 100, level: 1 },
    });
  });

  it('maps a support gem, keyed by id segment, with its SupportGems icon and SupportText', async () => {
    const { gems } = await buildGems(fakeSource());
    // Keyed by the last id segment ('AddedFire'), not the display name ('Added Fire').
    const support = gems.AddedFire;

    expect(support).toMatchObject({
      name: 'Added Fire',
      kind: 'support',
      description: 'Supports Fire skills',
      icon: 'Art/2DArt/SkillIcons/support.dds',
      hoverImage: null,
    });
  });

  it('skips [DNT] placeholder gems', async () => {
    const { gems } = await buildGems(fakeSource());

    expect(gems.Placeholder).toBeUndefined();
  });

  it('skips a SkillGems row whose BaseItemType does not resolve', async () => {
    const { gems } = await buildGems(fakeSource());

    expect(Object.keys(gems)).not.toContain(undefined);
    expect(Object.values(gems)).toHaveLength(4); // Fireball, AddedFire, IceBolt, FrostBolt (Placeholder and the unresolved row are skipped).
  });

  it('builds a per-level requirement curve from GrantedEffectsPerLevel', async () => {
    const { requirements } = await buildGems(fakeSource());

    expect(requirements.Fireball?.levels).toEqual({
      1: { requiredLevel: 1, str: 0, dex: 0, int: 0 },
      2: { requiredLevel: 10, str: 0, dex: 0, int: 21 },
    });
  });

  it('omits a requirement curve for gems without per-level rows', async () => {
    const { requirements } = await buildGems(fakeSource());

    expect(requirements.AddedFire).toBeUndefined();
  });
});

describe('buildGems scaling', () => {
  it('builds per-level cost, cast time, crit and translated stat lines', async () => {
    const { scaling } = await buildGems(fakeSource());
    const [level1, level2] = scaling.Fireball!.levels;

    expect(level1).toMatchObject({
      level: 1,
      cost: 8,
      castTime: 0.8, // AttackTime is 0 (a spell) -> falls back to GrantedEffects.CastTime.
      cooldown: null,
      reservation: null,
      spellCritChance: 5,
      attackCritChance: 0,
    });
    expect(level1?.stats).toEqual([
      { text: 'Test Flat +50%', min: 50, max: 50 }, // ConstantStats: fixed across every level.
      { text: 'Chain Count Test 2', min: 2, max: 2 }, // AdditionalStats: this level's value.
      { text: 'Deals 1 to 10 Test Damage', min: 1, max: 10 }, // FloatStats + BaseResolvedValues, paired.
    ]);

    expect(level2).toMatchObject({ level: 2, cost: 10, cooldown: 4 });
    expect(level2?.stats).toEqual([
      { text: 'Test Flat +50%', min: 50, max: 50 },
      { text: 'Chain Count Test 4', min: 4, max: 4 },
      { text: 'Deals 3 to 20 Test Damage', min: 3, max: 20 },
    ]);
  });

  it('resolves quality bonus lines at max quality (20), min pinned to 0', async () => {
    const { scaling } = await buildGems(fakeSource());

    expect(scaling.Fireball?.qualityStats).toEqual([
      { text: 'Quality Stat Test +1', min: 0, max: 1 },
    ]);
  });

  it('omits scaling for a gem whose GrantedEffects row has no StatSet', async () => {
    const { scaling } = await buildGems(fakeSource());

    expect(scaling.AddedFire).toBeUndefined();
  });

  it('prefers a nonzero per-level AttackTime over the flat CastTime (an attack skill)', async () => {
    const { scaling } = await buildGems(fakeSource());
    const level1 = scaling.IceBolt!.levels[0];

    expect(level1).toMatchObject({ level: 1, castTime: 0.9, reservation: 50, cost: null });
  });

  it('falls back to null when neither AttackTime nor CastTime has a value', async () => {
    const { scaling } = await buildGems(fakeSource());
    const level2 = scaling.IceBolt!.levels[1];

    expect(level2).toMatchObject({ level: 2, castTime: null, cooldown: null, reservation: null, cost: null });
  });

  it('resolves cost/castTime/cooldown/reservation to null when a gem level has no matching cost row', async () => {
    const { scaling } = await buildGems(fakeSource());
    const level3 = scaling.IceBolt!.levels[2];

    expect(level3).toMatchObject({ level: 3, cost: null, castTime: null, cooldown: null, reservation: null });
  });

  it('skips a GrantedEffectStatSetsPerLevel row with no GemLevel', async () => {
    const { scaling } = await buildGems(fakeSource());

    expect(scaling.IceBolt!.levels.map((l) => l.level)).toEqual([1, 2, 3]);
  });

  it('drops a trailing odd FloatStats id that resolves in neither stat-description file, and falls back to the general file for ConstantStats the skill file lacks', async () => {
    const { scaling } = await buildGems(fakeSource());

    // ConstantStats' `general_only_stat` only resolves via the general-index fallback;
    // FloatStats' trailing `unresolved_stat_test` (paired with BaseResolvedValues' 7)
    // resolves in neither file and is dropped rather than fabricated.
    expect(scaling.IceBolt!.levels[0]!.stats).toEqual([
      { text: 'General Only Stat +42', min: 42, max: 42 },
      { text: 'Deals 5 to 15 Test Damage', min: 5, max: 15 },
    ]);
  });

  it('drops an unresolved quality Stats line while keeping a resolving AltStats line', async () => {
    const { scaling } = await buildGems(fakeSource());

    expect(scaling.IceBolt?.qualityStats).toEqual([
      { text: 'Alt Quality Stat Test +2', min: 0, max: 2 },
    ]);
  });

  it('resolves an empty qualityStats array for a gem with no GrantedEffectQualityStats row', async () => {
    const { scaling } = await buildGems(fakeSource());

    expect(scaling.FrostBolt?.qualityStats).toEqual([]);
    expect(scaling.FrostBolt?.levels.length).toBeGreaterThan(0); // shares StatSet 0's levels with Fireball.
  });

  it('never reads either .csd file when the source has no GrantedEffectStatSets', async () => {
    const source = fakeSource();
    const fileSpy = vi.fn(() => Promise.resolve(null));
    const noStatSets: GgpkSource = {
      table: (name) => (name === 'GrantedEffectStatSets' ? Promise.resolve([]) : source.table(name)),
      file: fileSpy,
    };

    const { scaling } = await buildGems(noStatSets);

    expect(fileSpy).not.toHaveBeenCalled();
    expect(scaling).toEqual({});
  });
});

describe('buildGemIcons', () => {
  it('decodes distinct DDS icons and DDS-path hover art to PNG paths, and reports misses', async () => {
    const source = fakeSource({
      'Art/2DArt/SkillIcons/fireball.dds': px(),
      'Art/2DArt/SkillIcons/fireball_hover.dds': px(),
    });
    const data = await buildGems(source);
    const { icons, report } = await buildGemIcons(source, data);

    expect(Object.keys(icons)).toContain('Art/2DArt/SkillIcons/fireball.png');
    expect(Object.keys(icons)).toContain('Art/2DArt/SkillIcons/fireball_hover.png');
    expect(report.packed).toBe(2);
    // The support icon, IceBolt's icon, IceBolt's hover sprite and FrostBolt's icon
    // have no decoded image in this source, so they count missing.
    expect(report.missing).toBe(4);
  });

  it('decodes sprite-name hover art through the sprite index, keyed by the name plus .png', async () => {
    const source = fakeSource({ [ICE_BOLT_HOVER_SPRITE]: px() });
    const data = await buildGems(source);
    const { icons, report } = await buildGemIcons(source, data);

    expect(Object.keys(icons)).toEqual([`${ICE_BOLT_HOVER_SPRITE}.png`]);
    expect(report.packed).toBe(1);
  });

  it('never asks the DDS decoder for a sprite name, nor the sprite index for a DDS path', async () => {
    const source = fakeSource({
      'Art/2DArt/SkillIcons/fireball_hover.dds': px(),
      [ICE_BOLT_HOVER_SPRITE]: px(),
    });
    const dds = vi.fn(source.dds);
    const uiSprite = vi.fn(source.uiSprite);
    const data = await buildGems(source);

    await buildGemIcons({ ...source, dds, uiSprite }, data);

    expect(dds.mock.calls.flat()).not.toContain(ICE_BOLT_HOVER_SPRITE);
    expect(uiSprite.mock.calls.flat()).toEqual([ICE_BOLT_HOVER_SPRITE]);
  });

  it('counts a sprite name the index cannot resolve as missing, never substituted', async () => {
    const source = fakeSource({ 'Art/2DArt/SkillIcons/fireball.dds': px() });
    const data = await buildGems(source);
    const { icons, report } = await buildGemIcons(source, data);

    expect(Object.keys(icons)).toEqual(['Art/2DArt/SkillIcons/fireball.png']);
    expect(report.missing).toBe(5); // fireball_hover, the support icon, both remaining gem icons, IceBolt's hover sprite.
  });
});

describe('extractGems', () => {
  it('returns data and icons in one pass', async () => {
    const source = fakeSource({ 'Art/2DArt/SkillIcons/fireball.dds': px() });
    const bundle = await extractGems({ ...source, resolveSprite: () => Promise.resolve(null) });

    expect(Object.keys(bundle.data.gems)).toContain('Fireball');
    expect(bundle.icons.report.packed).toBe(1);
  });
});
