/** Self-contained unit tests: the gem build and its ported helpers are exercised against a small in-memory {@link GgpkSource}, so the suite needs no network or local GGPK extract. */

import type { GgpkSource, RgbaImage, TableRow } from '@poe2-toolkit/ggpk';
import { describe, expect, it, vi } from 'vitest';

import { buildGems, gemStatRequirement, isPlaceholderGem, stripBbcode } from '../src/buildGems';
import { buildGemIcons } from '../src/buildIcons';
import type { GemIconSource } from '../src/buildIcons';
import { extractGems } from '../src/index';

const csd = (include: string | null, ...blocks: string[][]): string =>
  [...(include ? [`include "${include}"`] : []), ...blocks.flat()].join('\n');
const block = (stat: string, text: string): string[] => ['description', `\t1 ${stat}`, '\t1', `\t\t# "${text}"`];

const GENERAL = 'Data/StatDescriptions/stat_descriptions.csd';
const SKILL = 'Data/StatDescriptions/skill_stat_descriptions.csd';
const GEM = 'Data/StatDescriptions/gem_stat_descriptions.csd';
const FIREBALL = 'Data/StatDescriptions/specific_skill_stat_descriptions/fireball/statset_0.csd';
const FIREBALL_SET_2 = 'Data/StatDescriptions/specific_skill_stat_descriptions/fireball/statset_2.csd';

/** The description files: Fireball's own files fall back to the skill file, which falls back to the general one; supports read the gem file. */
const FILES: Record<string, string> = {
  [GENERAL.toLowerCase()]: csd(null, block('general_only_stat', 'General Only Stat +{0}')),
  [SKILL.toLowerCase()]: csd(
    GENERAL,
    block('chain_count_test', 'Chain Count Test {0}'),
    ['description', '\t2 min_dmg_test max_dmg_test', '\t1', '\t\t# # "Deals {0} to {1} Test Damage"'],
    block('quality_stat_test', 'Quality Stat Test +{0}'),
    block('alt_quality_stat_test', 'Alt Quality Stat Test +{0}'),
    block('flag_test', 'Flag Test'),
    block('hidden_flag_test', 'Hidden Flag Shown'),
  ),
  // Fireball's own file: hides a flag the skill file describes, describes the flat stat.
  [FIREBALL.toLowerCase()]: csd(SKILL, ['no_description hidden_flag_test'], block('test_flat_stat', 'Test Flat +{0}%')),
  // The file of Fireball's third stat set (GGG numbers files by set position).
  [FIREBALL_SET_2.toLowerCase()]: csd(SKILL, ['no_description hidden_flag_test'], block('explosion_radius_test', 'Explosion radius is {0}')),
  [GEM.toLowerCase()]: csd(GENERAL, block('support_stat_test', 'Support Stat +{0}%')),
};

const ICE_BOLT_HOVER_SPRITE = 'Art/2DArt/UIImages/InGame/SmartHover/GemHoverImage/GemHoverImageIceBolt';

/** Minimal in-memory tables: one active gem with a hidden and an inheriting extra stat set, one support without and one with a stat set, two placeholders, plus IceBolt and FrostBolt for scaling edge cases. */
const TABLES: Record<string, TableRow[]> = {
  BaseItemTypes: [
    { Id: 'Metadata/Items/Gems/Fireball', Name: 'Fireball' },
    { Id: 'Metadata/Items/Gems/AddedFire', Name: 'Added Fire' },
    { Id: 'Metadata/Items/Gems/Placeholder', Name: '[DNT-UNUSED] Placeholder' },
    { Id: 'Metadata/Items/Gems/IceBolt', Name: 'Ice Bolt' },
    { Id: 'Metadata/Items/Gems/FrostBolt', Name: 'Frost Bolt' },
    { Id: 'Metadata/Items/Gems/FasterCasting', Name: 'Faster Casting' },
    { Id: 'Metadata/Items/Gems/SkillGemUnknown1', Name: 'Coming Soon' },
  ],
  ActiveSkills: [
    { Description: '[Fire] damage', Icon_DDSFile: 'Art/2DArt/SkillIcons/fireball.dds', StatDescription: FIREBALL },
    { Description: '[Cold] bolt', Icon_DDSFile: 'Art/2DArt/SkillIcons/icebolt.dds', StatDescription: SKILL },
    { Description: '[Cold] shard', Icon_DDSFile: 'Art/2DArt/SkillIcons/frostbolt.dds', StatDescription: SKILL },
  ],
  GrantedEffects: [
    { ActiveSkill: 0, StatSet: 0, AdditionalStatSets: [2, 3], CastTime: 800 },
    { ActiveSkill: null, IsSupport: true },
    { ActiveSkill: 1, StatSet: 1, CastTime: 0 },
    // Reuses StatSet 0 but has no GrantedEffectQualityStats row of its own.
    { ActiveSkill: 2, StatSet: 0, CastTime: 800 },
    { ActiveSkill: null, IsSupport: true, StatSet: 4 },
  ],
  GemEffects: [
    { GrantedEffect: 0, GemTags: [0, 1] },
    { GrantedEffect: 1, SupportText: 'Supports [Fire] skills' },
    { GrantedEffect: 2, GemTags: [] },
    { GrantedEffect: 3, GemTags: [] },
    { GrantedEffect: 4, SupportText: 'Supports spells', GemTags: [] },
  ],
  GemTags: [{ Name: 'Fire' }, { Name: '[AoESkill|AoE]' }],
  SkillGems: [
    {
      BaseItemType: 0, GemType: 0, GemColour: 1, MinLevelReq: 1, GemEffects: [0], IntelligenceRequirementPercent: 100,
      UI_Image: 'Art/2DArt/SkillIcons/fireball_hover.dds', ItemExperienceType: 0,
    },
    { BaseItemType: 1, GemType: 1, GemColour: 1, GemEffects: [1], StrengthRequirementPercent: 100 },
    { BaseItemType: 2, GemType: 0, GemEffects: [] },
    // 4.5.5+ reference form: a UIImages sprite name, no extension (Fireball above keeps the older DDS-path form).
    { BaseItemType: 3, GemType: 0, GemColour: 3, MinLevelReq: 1, GemEffects: [2], UI_Image: ICE_BOLT_HOVER_SPRITE, ItemExperienceType: 1 },
    { BaseItemType: 4, GemType: 0, GemColour: 1, MinLevelReq: 1, GemEffects: [3] },
    { BaseItemType: 5, GemType: 1, GemColour: 3, GemEffects: [4] },
    { BaseItemType: 6, GemType: 0, GemEffects: [0] },
    // BaseItemType doesn't resolve to a row: skipped before any join is attempted.
    { BaseItemType: 999, GemType: 0, GemEffects: [] },
  ],
  SupportGems: [{ SkillGem: 1, Icon: 'Art/2DArt/SkillIcons/support.dds' }],
  // Gem level -> required character level, per level progression. IceBolt's
  // progression dips at level 2, which the curve never follows.
  ItemExperiencePerLevel: [
    { ItemExperienceType: 0, ItemCurrentLevel: 1, Level: 0 },
    { ItemExperienceType: 0, ItemCurrentLevel: 2, Level: 10 },
    { ItemExperienceType: 1, ItemCurrentLevel: 1, Level: 5 },
    { ItemExperienceType: 1, ItemCurrentLevel: 2, Level: 3 },
  ],
  GrantedEffectsPerLevel: [
    { GrantedEffect: 0, Level: 1, ActorLevel: 1, CostAmounts: [8], AttackTime: 0 },
    { GrantedEffect: 0, Level: 2, ActorLevel: 10.5, CostAmounts: [10], AttackTime: 0, Cooldown: 4000 },
    { GrantedEffect: 2, Level: 1, ActorLevel: 1, AttackTime: 900, Reservation: 50 },
    { GrantedEffect: 2, Level: 2, ActorLevel: 5, AttackTime: 0, Cooldown: 0, Reservation: 0 },
    // No GrantedEffect: skipped by the per-level index build (map-build guard).
    { Level: 99, ActorLevel: 1 },
    // Has a GrantedEffect but no Level: skipped by the requirement-curve loop itself.
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
    { Id: 'flag_test' },
    { Id: 'hidden_flag_test' },
    { Id: 'explosion_radius_test' },
    { Id: 'support_stat_test' },
  ],
  GrantedEffectLabels: [{ Id: 'Hidden', Text: 'Hidden' }, { Id: 'Explosion', Text: 'Explosion' }],
  GrantedEffectStatSets: [
    { ConstantStats: [0], ConstantStatsValues: [50], ImplicitStats: [8, 9] },
    { ConstantStats: [6], ConstantStatsValues: [42] }, // general_only_stat: resolves only in the general file.
    // A hidden set: internal mechanics, never shown, but it still holds position 1.
    { Label: 0, ConstantStats: [0], ConstantStatsValues: [99] },
    // Inherits set 0's stats except the flat one it ignores.
    { Label: 1, IgnoredStats: [0] },
    { ConstantStats: [11], ConstantStatsValues: [10] },
  ],
  GrantedEffectStatSetsPerLevel: [
    { StatSet: 0, GemLevel: 1, SpellCritChance: 500, AttackCritChance: 0, BaseResolvedValues: [1, 10], AdditionalStatsValues: [2], FloatStats: [2, 3], AdditionalStats: [1] },
    { StatSet: 0, GemLevel: 2, SpellCritChance: 500, AttackCritChance: 0, BaseResolvedValues: [3, 20], AdditionalStatsValues: [4], FloatStats: [2, 3], AdditionalStats: [1] },
    { StatSet: 3, GemLevel: 1, AdditionalStats: [10], AdditionalStatsValues: [18] },
    { StatSet: 3, GemLevel: 2, AdditionalStats: [10], AdditionalStatsValues: [20] },
    // GemLevel1: attack time from GrantedEffectsPerLevel wins, no matching cost row -> cost null,
    // a trailing odd stat id with no description block (dropped, not fabricated).
    { StatSet: 1, GemLevel: 1, SpellCritChance: 0, AttackCritChance: 300, BaseResolvedValues: [5, 15, 7], FloatStats: [2, 3, 5] },
    // GemLevel2: AttackTime and the flat CastTime are both 0 -> castTime null; Cooldown/Reservation both 0 -> null.
    { StatSet: 1, GemLevel: 2, SpellCritChance: 0, AttackCritChance: 0 },
    // GemLevel3: no matching GrantedEffectsPerLevel row at all -> cost/castTime/cooldown/reservation all null.
    { StatSet: 1, GemLevel: 3, SpellCritChance: 0, AttackCritChance: 0 },
    // No GemLevel: skipped by the per-level scaling loop (not just the map-build guard).
    { StatSet: 1, GemLevel: null, SpellCritChance: 0 },
    { StatSet: 4, GemLevel: 1, SpellCritChance: 0, AttackCritChance: 0 },
    // No StatSet: skipped by the per-level index build (map-build guard).
    { GemLevel: 1, SpellCritChance: 0 },
  ],
  GrantedEffectQualityStats: [
    { GrantedEffect: 0, Stats: [4], StatsValuesPermille: [50], AltStats: [], AltStatValuesPermille: [] },
    // An unresolved Stats line (dropped), a fractional bonus (2.5 -> 2) and an AltStats line (left out).
    { GrantedEffect: 2, Stats: [5, 4], StatsValuesPermille: [50, 125], AltStats: [7], AltStatValuesPermille: [100] },
    // A support's quality row: supports get no quality lines.
    { GrantedEffect: 4, Stats: [4], StatsValuesPermille: [50] },
    // No GrantedEffect: skipped by the quality-stats index build (map-build guard).
    { Stats: [4], StatsValuesPermille: [50] },
  ],
};

function fakeSource(images: Record<string, RgbaImage | null> = {}): GgpkSource & GemIconSource {
  return {
    table: (name: string) => Promise.resolve(TABLES[name] ?? []),
    file: (path: string) => Promise.resolve(FILES[path] !== undefined ? new Uint8Array(Buffer.from(FILES[path], 'utf16le')) : null),
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

describe('isPlaceholderGem', () => {
  it('flags the names GGG gives unreleased gems', () => {
    expect(['[DNT-UNUSED] Spiral Projectiles I', '[DNT] Whip', 'Coming Soon', 'Playtest Attack', 'Removed Skill'].map(isPlaceholderGem))
      .toEqual([true, true, true, true, true]);
    expect(isPlaceholderGem('Ice Nova')).toBe(false);
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

  it('skips placeholder gems', async () => {
    const { gems } = await buildGems(fakeSource());

    expect(gems.Placeholder).toBeUndefined();
    expect(gems.SkillGemUnknown1).toBeUndefined();
  });

  it('skips a SkillGems row whose BaseItemType does not resolve', async () => {
    const { gems } = await buildGems(fakeSource());

    expect(Object.keys(gems)).not.toContain(undefined);
    // Fireball, AddedFire, IceBolt, FrostBolt, FasterCasting (the placeholders and the unresolved row are skipped).
    expect(Object.values(gems)).toHaveLength(5);
  });

  it('builds a per-level requirement curve from the gem level progression', async () => {
    const { requirements } = await buildGems(fakeSource());

    expect(requirements.Fireball?.levels).toEqual({
      1: { requiredLevel: 1, str: 0, dex: 0, int: 0 },
      2: { requiredLevel: 10, str: 0, dex: 0, int: 21 },
    });
  });

  it('never lets the required level drop below the level before', async () => {
    const { requirements } = await buildGems(fakeSource());

    expect(requirements.IceBolt?.levels[1]?.requiredLevel).toBe(5);
    expect(requirements.IceBolt?.levels[2]?.requiredLevel).toBe(5);
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
    // Included files' lines first, each file in its own order; the skill's own
    // file hides `hidden_flag_test`, which the skill file would describe.
    expect(level1?.stats).toEqual([
      { text: 'Chain Count Test 2', min: 2, max: 2 }, // AdditionalStats: this level's value.
      { text: 'Deals 1 to 10 Test Damage', min: 1, max: 10 }, // FloatStats + BaseResolvedValues, one line.
      { text: 'Flag Test', min: 1, max: 1 }, // ImplicitStats: a flag, at 1.
      { text: 'Test Flat +50%', min: 50, max: 50 }, // ConstantStats: fixed across every level.
    ]);

    expect(level2).toMatchObject({ level: 2, cost: 10, cooldown: 4 });
    expect(level2?.stats.map((line) => line.text)).toEqual([
      'Chain Count Test 4', 'Deals 3 to 20 Test Damage', 'Flag Test', 'Test Flat +50%',
    ]);
  });

  it('renders a further stat set through its own file, inheriting the first set minus what it ignores', async () => {
    const { scaling } = await buildGems(fakeSource());
    const [level1] = scaling.Fireball!.levels;

    // The hidden set is left out; the Explosion set is the third in GGG's order, so its file is statset_2.
    expect(level1?.additionalStatSets).toEqual([
      {
        label: 'Explosion',
        stats: [
          { text: 'Chain Count Test 2', min: 2, max: 2 },
          { text: 'Deals 1 to 10 Test Damage', min: 1, max: 10 },
          { text: 'Flag Test', min: 1, max: 1 },
          { text: 'Explosion radius is 18', min: 18, max: 18 },
        ],
      },
    ]);
  });

  it('renders a support through the gem description file and gives it no quality lines', async () => {
    const { scaling } = await buildGems(fakeSource());

    expect(scaling.FasterCasting?.levels[0]?.stats).toEqual([{ text: 'Support Stat +10%', min: 10, max: 10 }]);
    expect(scaling.FasterCasting?.qualityStats).toEqual([]);
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

  it('drops a FloatStats id no description file describes, and reads a constant from the general file the skill file includes', async () => {
    const { scaling } = await buildGems(fakeSource());

    expect(scaling.IceBolt!.levels[0]!.stats).toEqual([
      { text: 'General Only Stat +42', min: 42, max: 42 },
      { text: 'Deals 5 to 15 Test Damage', min: 5, max: 15 },
    ]);
  });

  it('drops an unresolved quality line, keeps a bonus whole and leaves the alternate quality out', async () => {
    const { scaling } = await buildGems(fakeSource());

    // 125 permille at 20 quality is 2.5, kept as the whole 2 the game's stat holds.
    expect(scaling.IceBolt?.qualityStats).toEqual([
      { text: 'Quality Stat Test +2', min: 0, max: 2 },
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
