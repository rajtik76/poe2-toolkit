/**
 * Self-contained unit tests: the item build is exercised against a small
 * in-memory {@link GgpkSource}, so the suite needs no network or local GGPK
 * extract.
 */

import type { GgpkSource, RgbaImage, TableRow } from '@poe2-toolkit/ggpk';
import { decodePng } from '@poe2-toolkit/ggpk';
import { describe, expect, it } from 'vitest';

import { buildItemIcons } from '../src/buildIcons';
import { buildItems } from '../src/buildItems';
import { extractItems } from '../src/index';

/** Minimal tables: a two-hander, a one-hander, a name dupe, an art-less base, a [DNT]. */
const TABLES: Record<string, TableRow[]> = {
  BaseItemTypes: [
    // Base tags [0] union the class tags; the out-of-range index 99 is dropped.
    // ModDomain 1 -> the `Item` domain.
    { Name: 'Greatsword', ItemClass: 0, ItemVisualIdentity: 0, ModDomain: 1, Tags: [0, 99] },
    // No ModDomain -> modDomain is null.
    { Name: 'Rapier', ItemClass: 1, ItemVisualIdentity: 1 },
    { Name: 'Greatsword', ItemClass: 0, ItemVisualIdentity: 2 },
    { Name: 'No Art', ItemClass: 1, ItemVisualIdentity: null },
    { Name: 'Dev Base [DNT]', ItemClass: 0, ItemVisualIdentity: 0 },
    // An item class with no entry in CLASS_TAGS contributes only its own base tags;
    // ModDomain 6 is a nameless enum slot, so modDomain resolves to null.
    { Name: 'Cobalt Jewel', ItemClass: 2, ItemVisualIdentity: 5, ModDomain: 6, Tags: [1] },
  ],
  ItemClasses: [{ Id: 'Two Hand Sword' }, { Id: 'One Hand Sword' }, { Id: 'Jewel' }],
  Tags: [{ Id: 'ezomyte_basetype' }, { Id: 'abyss_jewel' }],
  ItemVisualIdentity: [
    { Id: 'Greatsword', DDSFile: 'Art/2DItems/Weapons/greatsword.dds' },
    { Id: 'Rapier', DDSFile: 'Art/2DItems/Weapons/rapier.dds' },
    { Id: 'GreatswordAlt', DDSFile: 'Art/2DItems/Weapons/greatsword_alt.dds' },
    // `_a` art-variant suffix: flavour text is keyed by the id without it.
    { Id: 'UniqueSwordOro_a', DDSFile: 'Art/2DItems/Weapons/oro.dds' },
    { Id: 'UniqueSwordBehemoth', DDSFile: 'Art/2DItems/Weapons/behemoth.dds' },
    { Id: 'CobaltJewel', DDSFile: 'Art/2DItems/jewel.dds' },
  ],
  AttributeRequirements: [{ BaseItemType: 0, ReqStr: 40, ReqDex: 10, ReqInt: 0 }],
  FlavourText: [
    { Id: 'UniqueSwordOro', Text: 'A blade of fire.\r\nForged in endless war.' },
    { Id: 'UniqueSwordBehemoth', Text: 'Heavy is the blade.' },
  ],
  // A one-handed unique, a two-handed unique, a [DNT] placeholder, and a name clashing with a base.
  UniqueStashLayout: [
    { WordsKey: 0, ItemVisualIdentityKey: 3, UniqueStashTypesKey: 0 },
    { WordsKey: 3, ItemVisualIdentityKey: 4, UniqueStashTypesKey: 1 },
    { WordsKey: 1, ItemVisualIdentityKey: 0, UniqueStashTypesKey: 0 },
    { WordsKey: 2, ItemVisualIdentityKey: 1, UniqueStashTypesKey: 1 },
  ],
  Words: [{ Text: "Oro's Sacrifice" }, { Text: 'Dev Unique [DNT]' }, { Text: 'Greatsword' }, { Text: 'Behemoth' }],
  UniqueStashTypes: [{ Id: 'Sword' }, { Id: 'SwordTwoHand' }],
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
      rarity: 'normal',
      icon: 'Art/2DItems/Weapons/greatsword.dds',
      itemClass: 'Two Hand Sword',
      category: null,
      twoHanded: true,
      req: { str: 40, dex: 10, int: 0 },
      flavourText: null,
      modDomain: 'Item',
      tags: ['default', 'ezomyte_basetype', 'sword', 'two_hand_weapon', 'twohand', 'weapon'],
    });
  });

  it('maps a base ModDomain to its name and yields null for a missing or nameless one', async () => {
    const items = await buildItems(fakeSource());

    expect(items.Greatsword?.modDomain).toBe('Item');
    expect(items.Rapier?.modDomain).toBeNull(); // no ModDomain on the row
    expect(items['Cobalt Jewel']?.modDomain).toBeNull(); // nameless enum slot
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

  it('derives a base one-hander\'s effective tags from its class plus default', async () => {
    const items = await buildItems(fakeSource());

    expect(items.Rapier?.tags).toEqual(['default', 'one_hand_weapon', 'onehand', 'sword', 'weapon']);
  });

  it('gives a base whose class has no tag map only its own tags plus default', async () => {
    const items = await buildItems(fakeSource());

    expect(items['Cobalt Jewel']?.tags).toEqual(['abyss_jewel', 'default']);
  });
});

describe('buildItems - uniques', () => {
  it('maps a unique with its name, icon and stash category', async () => {
    const items = await buildItems(fakeSource());

    expect(items["Oro's Sacrifice"]).toEqual({
      rarity: 'unique',
      icon: 'Art/2DItems/Weapons/oro.dds',
      itemClass: null,
      category: 'Sword',
      twoHanded: false,
      req: { str: 0, dex: 0, int: 0 },
      // Joined via the `_a`-stripped ItemVisualIdentity id, split into lines.
      flavourText: ['A blade of fire.', 'Forged in endless war.'],
      // Uniques carry no base link, so neither a mod domain nor tags.
      modDomain: null,
      tags: [],
    });
  });

  it('leaves flavourText null on bases and populates it only for uniques', async () => {
    const items = await buildItems(fakeSource());

    expect(items.Rapier?.flavourText).toBeNull();
    expect(items.Behemoth?.flavourText).toEqual(['Heavy is the blade.']);
  });

  it('derives two-handedness of a unique from its weapon category', async () => {
    const items = await buildItems(fakeSource());

    expect(items.Behemoth).toMatchObject({ category: 'SwordTwoHand', twoHanded: true });
  });

  it('skips [DNT] unique placeholders', async () => {
    const items = await buildItems(fakeSource());

    expect(items['Dev Unique [DNT]']).toBeUndefined();
  });

  it('never lets a unique overwrite a base of the same name', async () => {
    const items = await buildItems(fakeSource());

    // A "Greatsword" unique row exists, but the base must keep the slot.
    expect(items.Greatsword?.rarity).toBe('normal');
    expect(items.Greatsword?.itemClass).toBe('Two Hand Sword');
  });
});

describe('buildItemIcons', () => {
  it('decodes distinct DDS icons to PNG paths and reports misses', async () => {
    const source = fakeSource({ 'Art/2DItems/Weapons/greatsword.dds': px() });
    const data = await buildItems(source);
    const { icons, report } = await buildItemIcons(source, data);

    expect(Object.keys(icons)).toContain('Art/2DItems/Weapons/greatsword.png');
    expect(report.packed).toBe(1);
    // rapier.dds, jewel.dds and the uniques' oro.dds / behemoth.dds have no decoded image here
    expect(report.missing).toBe(4);
  });

  it('composites a flask sheet: fill (frame 2) over the glass-and-cap container (frame 0)', async () => {
    // A 3x2 "sheet" of three 1px-wide layer frames. Frame 0 (col 0) is the
    // container: an opaque cap on the top row, an empty (transparent) body below.
    // Frame 2 (col 2) is the fill: no cap, an opaque coloured body. Column 1 is
    // the ignored middle frame.
    const width = 3;
    const height = 2;
    const rgba = new Uint8Array(width * height * 4);
    const put = (x: number, y: number, r: number, g: number, b: number, a: number): void => {
      const i = (y * width + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = a;
    };
    put(0, 0, 200, 100, 0, 255); // container cap (top)
    put(0, 1, 0, 0, 0, 0); //       container body: empty
    put(2, 0, 0, 0, 0, 0); //       fill: no cap
    put(2, 1, 255, 0, 0, 255); //   fill body (red)

    const flaskPath = 'Art/2DItems/Flasks/Basetypes/FlaskLife01.dds';
    const source: GgpkSource & { dds(path: string): Promise<RgbaImage | null> } = {
      table: () => Promise.resolve([]),
      file: () => Promise.resolve(null),
      dds: () => Promise.resolve({ width, height, rgba }),
    };
    const data = { 'Lesser Life Flask': { icon: flaskPath } } as unknown as Parameters<typeof buildItemIcons>[1];

    const { icons } = await buildItemIcons(source, data);
    const decoded = decodePng(icons['Art/2DItems/Flasks/Basetypes/FlaskLife01.png']!);

    // One frame wide (round(3 / 3) = 1 column), full height.
    expect(decoded.width).toBe(1);
    expect(decoded.height).toBe(2);
    // Top row keeps the container's cap (frame 0), bottom row shows the fill (frame 2).
    expect([...decoded.rgba.slice(0, 4)]).toEqual([200, 100, 0, 255]);
    expect([...decoded.rgba.slice(4, 8)]).toEqual([255, 0, 0, 255]);
  });

  it('leaves a single-frame charm icon untouched', async () => {
    const charm = (): RgbaImage => ({ width: 4, height: 4, rgba: new Uint8Array(4 * 4 * 4).fill(200) });
    const source: GgpkSource & { dds(path: string): Promise<RgbaImage | null> } = {
      table: () => Promise.resolve([]),
      file: () => Promise.resolve(null),
      dds: () => Promise.resolve(charm()),
    };
    const data = { 'Ruby Charm': { icon: 'Art/2DItems/Charms/Basetypes/RubyCharm.dds' } } as unknown as Parameters<typeof buildItemIcons>[1];

    const { icons } = await buildItemIcons(source, data);
    const decoded = decodePng(icons['Art/2DItems/Charms/Basetypes/RubyCharm.png']!);

    expect(decoded.width).toBe(4); // charms are single-frame, no compositing
    expect(decoded.height).toBe(4);
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
