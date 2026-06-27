/**
 * Self-contained unit tests: the gem build and its ported helpers are exercised
 * against a small in-memory {@link GgpkSource}, so the suite needs no network or
 * local GGPK extract.
 */

import type { GgpkSource, RgbaImage, TableRow } from '@poe2-toolkit/ggpk';
import { describe, expect, it } from 'vitest';

import { buildGems, gemStatRequirement, stripBbcode } from '../src/buildGems';
import { buildGemIcons } from '../src/buildIcons';
import { extractGems } from '../src/index';

/** Minimal in-memory tables modelling one active gem, one support, one [DNT]. */
const TABLES: Record<string, TableRow[]> = {
  BaseItemTypes: [
    { Id: 'Metadata/Items/Gems/Fireball', Name: 'Fireball' },
    { Id: 'Metadata/Items/Gems/AddedFire', Name: 'Added Fire' },
    { Id: 'Metadata/Items/Gems/Placeholder', Name: 'Placeholder [DNT]' },
  ],
  ActiveSkills: [{ Description: '[Fire] damage', Icon_DDSFile: 'Art/2DArt/SkillIcons/fireball.dds' }],
  GrantedEffects: [{ ActiveSkill: 0 }, { ActiveSkill: null }],
  GemEffects: [
    { GrantedEffect: 0, GemTags: [0, 1] },
    { GrantedEffect: 1, SupportText: 'Supports [Fire] skills' },
  ],
  GemTags: [{ Name: 'Fire' }, { Name: '[AoESkill|AoE]' }],
  SkillGems: [
    { BaseItemType: 0, GemType: 0, GemColour: 1, MinLevelReq: 1, GemEffects: [0], IntelligenceRequirementPercent: 100 },
    { BaseItemType: 1, GemType: 1, GemColour: 1, GemEffects: [1], StrengthRequirementPercent: 100 },
    { BaseItemType: 2, GemType: 0, GemEffects: [] },
  ],
  SupportGems: [{ SkillGem: 1, Icon: 'Art/2DArt/SkillIcons/support.dds' }],
  GrantedEffectsPerLevel: [
    { GrantedEffect: 0, Level: 1, ActorLevel: 1 },
    { GrantedEffect: 0, Level: 2, ActorLevel: 10.5 },
  ],
};

/** A fake source: tables from the fixture above, icons resolved per `images`. */
function fakeSource(images: Record<string, RgbaImage | null> = {}): GgpkSource & { dds(path: string): Promise<RgbaImage | null> } {
  return {
    table: (name: string) => Promise.resolve(TABLES[name] ?? []),
    file: () => Promise.resolve(null),
    dds: (path: string) => Promise.resolve(images[path] ?? null),
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
    });
  });

  it('skips [DNT] placeholder gems', async () => {
    const { gems } = await buildGems(fakeSource());

    expect(gems.Placeholder).toBeUndefined();
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

describe('buildGemIcons', () => {
  it('decodes distinct DDS icons to PNG paths and reports misses', async () => {
    const source = fakeSource({ 'Art/2DArt/SkillIcons/fireball.dds': px() });
    const data = await buildGems(source);
    const { icons, report } = await buildGemIcons(source, data);

    expect(Object.keys(icons)).toContain('Art/2DArt/SkillIcons/fireball.png');
    expect(report.packed).toBe(1);
    // The support icon has no decoded image in this source, so it counts missing.
    expect(report.missing).toBe(1);
  });
});

describe('extractGems', () => {
  it('returns data and icons in one pass', async () => {
    const source = fakeSource({ 'Art/2DArt/SkillIcons/fireball.dds': px() });
    const bundle = await extractGems({
      ...source,
      resolveSprite: () => Promise.resolve(null),
      uiSprite: () => Promise.resolve(null),
    });

    expect(Object.keys(bundle.data.gems)).toContain('Fireball');
    expect(bundle.icons.report.packed).toBe(1);
  });
});
