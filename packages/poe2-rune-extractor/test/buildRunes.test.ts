/**
 * Self-contained unit tests: the rune build is exercised against a small
 * in-memory {@link GgpkSource} - tables plus a minimal UTF-16 `.csd` - so the
 * suite needs no network or local GGPK extract.
 */

import type { GgpkSource, RgbaImage, TableRow } from '@poe2-toolkit/ggpk';
import { describe, expect, it } from 'vitest';

import { buildRuneIcons } from '../src/buildIcons';
import { buildRunes } from '../src/buildRunes';
import { extractRunes } from '../src/index';

/** Minimal tables: a levelled core, a level-0 core, a [DNT] placeholder, an art-less core. */
const TABLES: Record<string, TableRow[]> = {
  BaseItemTypes: [
    { Name: 'Iron Soul Core', ItemVisualIdentity: 0 },
    { Name: 'Body Soul Core', ItemVisualIdentity: 1 },
    { Name: 'Dev Core [DNT]', ItemVisualIdentity: 2 },
    { Name: 'Dual Soul Core', ItemVisualIdentity: null },
  ],
  ItemVisualIdentity: [
    { DDSFile: 'Art/2DItems/SoulCores/iron.dds' },
    { DDSFile: 'Art/2DItems/SoulCores/body.dds' },
    { DDSFile: 'Art/2DItems/SoulCores/dev.dds' },
  ],
  SoulCores: [
    { BaseItemType: 0, RequiredLevel: 12 },
    { BaseItemType: 1, RequiredLevel: 0 },
    { BaseItemType: 2, RequiredLevel: 5 },
    { BaseItemType: 3, RequiredLevel: 20 },
  ],
  SoulCoreStatCategories: [{ Display: 'All Equipment' }, { Display: '[Martial|Martial Weapon]' }],
  Stats: [{ Id: 'additional_dexterity' }],
  SoulCoreStats: [
    { SoulCore: 0, StatCategory: 0, Stats: [0], StatsValues: [9] },
    { SoulCore: 1, StatCategory: 1, Stats: [0], StatsValues: [4] },
    { SoulCore: 2, StatCategory: 0, Stats: [0], StatsValues: [3] },
    // Two stat-category rows on one core -> two slot-prefixed effect lines.
    { SoulCore: 3, StatCategory: 0, Stats: [0], StatsValues: [5] },
    { SoulCore: 3, StatCategory: 1, Stats: [0], StatsValues: [2] },
  ],
};

// A one-block stat-description file the engine can parse: any value renders
// "+{value} to Dexterity".
const CSD = ['description', '\t1 additional_dexterity', '\t1', '\t\t# "+{0} to Dexterity"', ''].join('\n');

/** A fake source: tables + the `.csd` served as UTF-16 bytes, and decoded DDS images. */
function fakeSource(
  csd: string | null = CSD,
  images: Record<string, RgbaImage | null> = {},
): GgpkSource & { dds(path: string): Promise<RgbaImage | null> } {
  return {
    table: (name: string) => Promise.resolve(TABLES[name] ?? []),
    file: (path: string) =>
      Promise.resolve(
        csd !== null && path === 'data/statdescriptions/stat_descriptions.csd'
          ? new Uint8Array(Buffer.from(csd, 'utf16le'))
          : null,
      ),
    dds: (path: string) => Promise.resolve(images[path] ?? null),
  };
}

const px = (): RgbaImage => ({ width: 1, height: 1, rgba: new Uint8Array([1, 2, 3, 4]) });

describe('buildRunes', () => {
  it('renders effect lines prefixed with the equipment slot and maps the base icon', async () => {
    const runes = await buildRunes(fakeSource());

    expect(runes['Iron Soul Core']).toEqual({
      levelRequirement: 12,
      effects: ['All Equipment: +9 to Dexterity'],
      icon: 'Art/2DItems/SoulCores/iron.dds',
    });
  });

  it('treats RequiredLevel 0 as null and strips bbcode from the slot', async () => {
    const runes = await buildRunes(fakeSource());

    expect(runes['Body Soul Core']).toMatchObject({
      levelRequirement: null,
      effects: ['Martial Weapon: +4 to Dexterity'],
    });
  });

  it('groups several stat categories on one core into separate prefixed lines', async () => {
    const runes = await buildRunes(fakeSource());

    expect(runes['Dual Soul Core']).toMatchObject({
      levelRequirement: 20,
      effects: ['All Equipment: +5 to Dexterity', 'Martial Weapon: +2 to Dexterity'],
    });
  });

  it('leaves the icon null for an art-less core', async () => {
    const runes = await buildRunes(fakeSource());

    expect(runes['Dual Soul Core']?.icon).toBeNull();
  });

  it('skips [DNT] placeholder cores', async () => {
    const runes = await buildRunes(fakeSource());

    expect(runes['Dev Core [DNT]']).toBeUndefined();
  });

  it('throws when the stat-description file is absent', async () => {
    await expect(buildRunes(fakeSource(null))).rejects.toThrow('stat descriptions not found');
  });
});

describe('buildRuneIcons', () => {
  it('decodes distinct rune icons to PNG paths and reports misses', async () => {
    const source = fakeSource(CSD, { 'Art/2DItems/SoulCores/iron.dds': px() });
    const data = await buildRunes(source);
    const { icons, report } = await buildRuneIcons(source, data);

    expect(Object.keys(icons)).toContain('Art/2DItems/SoulCores/iron.png');
    expect(report.packed).toBe(1);
    expect(report.missing).toBe(1); // body.dds has no decoded image here (Dual core has no icon)
  });
});

describe('extractRunes', () => {
  it('returns data and icons in one pass', async () => {
    const source = fakeSource(CSD, { 'Art/2DItems/SoulCores/iron.dds': px() });
    const bundle = await extractRunes({
      ...source,
      resolveSprite: () => Promise.resolve(null),
      uiSprite: () => Promise.resolve(null),
    });

    expect(Object.keys(bundle.data)).toContain('Iron Soul Core');
    expect(bundle.icons.report.packed).toBe(1);
  });
});
