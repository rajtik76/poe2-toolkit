/**
 * Self-contained unit tests: the item build is exercised against a small
 * in-memory {@link GgpkSource}, so the suite needs no network or local GGPK
 * extract.
 */

import type { GgpkSource, RgbaImage, TableRow } from '@poe2-toolkit/ggpk';
import { describe, expect, it } from 'vitest';

import { buildItemIcons } from '../src/buildIcons';
import { buildItems } from '../src/buildItems';
import { extractItems } from '../src/index';

/** Minimal tables: a two-hander, a one-hander, a name dupe, an art-less base, a [DNT]. */
const TABLES: Record<string, TableRow[]> = {
  BaseItemTypes: [
    { Name: 'Greatsword', ItemClass: 0, ItemVisualIdentity: 0 },
    { Name: 'Rapier', ItemClass: 1, ItemVisualIdentity: 1 },
    { Name: 'Greatsword', ItemClass: 0, ItemVisualIdentity: 2 },
    { Name: 'No Art', ItemClass: 1, ItemVisualIdentity: null },
    { Name: 'Dev Base [DNT]', ItemClass: 0, ItemVisualIdentity: 0 },
  ],
  ItemClasses: [{ Id: 'Two Hand Sword' }, { Id: 'One Hand Sword' }],
  ItemVisualIdentity: [
    { DDSFile: 'Art/2DItems/Weapons/greatsword.dds' },
    { DDSFile: 'Art/2DItems/Weapons/rapier.dds' },
    { DDSFile: 'Art/2DItems/Weapons/greatsword_alt.dds' },
  ],
  AttributeRequirements: [{ BaseItemType: 0, ReqStr: 40, ReqDex: 10, ReqInt: 0 }],
};

function fakeSource(images: Record<string, RgbaImage | null> = {}): GgpkSource & { dds(path: string): Promise<RgbaImage | null> } {
  return {
    table: (name: string) => Promise.resolve(TABLES[name] ?? []),
    file: () => Promise.resolve(null),
    dds: (path: string) => Promise.resolve(images[path] ?? null),
  };
}

const px = (): RgbaImage => ({ width: 1, height: 1, rgba: new Uint8Array([1, 2, 3, 4]) });

describe('buildItems', () => {
  it('maps a base with its class, icon and attribute requirements', async () => {
    const items = await buildItems(fakeSource());

    expect(items.Greatsword).toEqual({
      icon: 'Art/2DItems/Weapons/greatsword.dds',
      itemClass: 'Two Hand Sword',
      twoHanded: true,
      req: { str: 40, dex: 10, int: 0 },
    });
  });

  it('flags one-handers as not two-handed and defaults missing reqs to 0', async () => {
    const items = await buildItems(fakeSource());

    expect(items.Rapier).toMatchObject({ twoHanded: false, req: { str: 0, dex: 0, int: 0 } });
  });

  it('keeps the first displayable base for a duplicated name', async () => {
    const items = await buildItems(fakeSource());

    expect(items.Greatsword?.icon).toBe('Art/2DItems/Weapons/greatsword.dds');
  });

  it('skips art-less bases and [DNT] placeholders', async () => {
    const items = await buildItems(fakeSource());

    expect(items['No Art']).toBeUndefined();
    expect(items['Dev Base [DNT]']).toBeUndefined();
  });
});

describe('buildItemIcons', () => {
  it('decodes distinct DDS icons to PNG paths and reports misses', async () => {
    const source = fakeSource({ 'Art/2DItems/Weapons/greatsword.dds': px() });
    const data = await buildItems(source);
    const { icons, report } = await buildItemIcons(source, data);

    expect(Object.keys(icons)).toContain('Art/2DItems/Weapons/greatsword.png');
    expect(report.packed).toBe(1);
    expect(report.missing).toBe(1); // rapier.dds has no decoded image here
  });
});

describe('extractItems', () => {
  it('returns data and icons in one pass', async () => {
    const source = fakeSource({ 'Art/2DItems/Weapons/greatsword.dds': px() });
    const bundle = await extractItems({
      ...source,
      resolveSprite: () => Promise.resolve(null),
      uiSprite: () => Promise.resolve(null),
    });

    expect(Object.keys(bundle.data)).toContain('Greatsword');
    expect(bundle.icons.report.packed).toBe(1);
  });
});
