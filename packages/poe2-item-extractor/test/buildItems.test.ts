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
    { Name: 'Greatsword', ItemClass: 0, ItemVisualIdentity: 0, ModDomain: 1, DropLevel: 12, Tags: [0, 99] },
    // No ModDomain -> modDomain is null.
    { Name: 'Rapier', ItemClass: 1, ItemVisualIdentity: 1 },
    { Name: 'Greatsword', ItemClass: 0, ItemVisualIdentity: 2 },
    { Name: 'No Art', ItemClass: 1, ItemVisualIdentity: null },
    { Name: 'Dev Base [DNT]', ItemClass: 0, ItemVisualIdentity: 0 },
    // An item class with no entry in CLASS_TAGS contributes only its own base tags;
    // ModDomain 6 is a nameless enum slot, so modDomain resolves to null.
    { Name: 'Cobalt Jewel', ItemClass: 2, ItemVisualIdentity: 5, ModDomain: 6, Tags: [1] },
    // Armour bases: a pure-evasion helmet (ArmourTypes only) and a shield (ArmourTypes
    // armour + ShieldTypes block merged into one value).
    { Name: 'Viper Cap', ItemClass: 3, ItemVisualIdentity: 9, ModDomain: 1, Tags: [] },
    { Name: 'Plate Shield', ItemClass: 4, ItemVisualIdentity: 10, ModDomain: 1, Tags: [] },
    // An energy-shield base whose ArmourTypes row omits the other stat columns
    // (they default to 0); a shield present only in ShieldTypes (no ArmourTypes
    // row); a base in both tables whose ShieldTypes row omits Block.
    { Name: 'Crystal Focus', ItemClass: 5, ItemVisualIdentity: 11, ModDomain: 1, Tags: [] },
    { Name: 'Wooden Buckler', ItemClass: 6, ItemVisualIdentity: 12, ModDomain: 1, Tags: [] },
    { Name: 'Bronze Kite Shield', ItemClass: 4, ItemVisualIdentity: 13, ModDomain: 1, Tags: [] },
    // Weapon bases: a bow (full WeaponTypes row), a crossbow (the one class with a
    // ReloadTime) and a sceptre (an ItemSpirit row instead of damage).
    { Name: 'Crude Bow', ItemClass: 7, ItemVisualIdentity: 15, ModDomain: 1, DropLevel: 1, Tags: [] },
    { Name: 'Makeshift Crossbow', ItemClass: 8, ItemVisualIdentity: 16, ModDomain: 1, DropLevel: 3, Tags: [] },
    { Name: 'Shrine Sceptre', ItemClass: 9, ItemVisualIdentity: 17, ModDomain: 1, DropLevel: 8, Tags: [] },
  ],
  ItemClasses: [
    { Id: 'Two Hand Sword' }, { Id: 'One Hand Sword' }, { Id: 'Jewel' }, { Id: 'Helmet' },
    { Id: 'Shield' }, { Id: 'Focus' }, { Id: 'Buckler' }, { Id: 'Bow' }, { Id: 'Crossbow' }, { Id: 'Sceptre' },
  ],
  Tags: [{ Id: 'ezomyte_basetype' }, { Id: 'abyss_jewel' }],
  ItemVisualIdentity: [
    { Id: 'Greatsword', DDSFile: 'Art/2DItems/Weapons/greatsword.dds' },
    { Id: 'Rapier', DDSFile: 'Art/2DItems/Weapons/rapier.dds' },
    { Id: 'GreatswordAlt', DDSFile: 'Art/2DItems/Weapons/greatsword_alt.dds' },
    // `_a` art-variant suffix: flavour text is keyed by the id without it.
    { Id: 'UniqueSwordOro_a', DDSFile: 'Art/2DItems/Weapons/oro.dds' },
    { Id: 'UniqueSwordBehemoth', DDSFile: 'Art/2DItems/Weapons/behemoth.dds' },
    { Id: 'CobaltJewel', DDSFile: 'Art/2DItems/jewel.dds' },
    // Unique flasks reuse a base flask model, so their AOFile names the base type.
    { Id: 'UniqueFlaskLife', DDSFile: 'Art/2DItems/Flasks/Uniques/lifeuniq.dds', AOFile: 'Metadata/Items/Flasks/Basetypes/FlaskLife7Drop.ao' },
    { Id: 'UniqueFlaskMana', DDSFile: 'Art/2DItems/Flasks/Uniques/manauniq.dds', AOFile: 'Metadata/Items/Flasks/Basetypes/FlaskMana9Drop.ao' },
    { Id: 'UniqueFlaskX', DDSFile: 'Art/2DItems/Flasks/Uniques/mystery.dds' }, // no AOFile -> stays Flask
    { Id: 'ViperCap', DDSFile: 'Art/2DItems/Armours/Helmets/vipercap.dds' },
    { Id: 'PlateShield', DDSFile: 'Art/2DItems/Armours/Shields/plateshield.dds' },
    { Id: 'CrystalFocus', DDSFile: 'Art/2DItems/Armours/Focus/crystalfocus.dds' },
    { Id: 'WoodenBuckler', DDSFile: 'Art/2DItems/Armours/Shields/woodenbuckler.dds' },
    { Id: 'BronzeKiteShield', DDSFile: 'Art/2DItems/Armours/Shields/bronzekite.dds' },
    // A unique flask whose base model is neither Life nor Mana: the category stays Flask.
    { Id: 'UniqueFlaskUtility', DDSFile: 'Art/2DItems/Flasks/Uniques/util.dds', AOFile: 'Metadata/Items/Flasks/Basetypes/FlaskUtility3.ao' },
    { Id: 'CrudeBow', DDSFile: 'Art/2DItems/Weapons/crudebow.dds' },
    { Id: 'MakeshiftCrossbow', DDSFile: 'Art/2DItems/Weapons/makeshiftcrossbow.dds' },
    { Id: 'ShrineSceptre', DDSFile: 'Art/2DItems/Weapons/shrinesceptre.dds' },
  ],
  AttributeRequirements: [{ BaseItemType: 0, ReqStr: 40, ReqDex: 10, ReqInt: 0 }],
  // Both tables key on a BaseItemTypes row index. Plate Shield (7) appears in both;
  // Viper Cap (6) and Crystal Focus (8) only in ArmourTypes; Wooden Buckler (9) only
  // in ShieldTypes; Bronze Kite Shield (10) in both but with no Block column. Rows
  // with no BaseItemType are ignored; weapons/jewels appear in neither table.
  ArmourTypes: [
    { BaseItemType: 6, Armour: 0, Evasion: 179, EnergyShield: 0, Ward: 0 },
    { BaseItemType: 7, Armour: 50, Evasion: 0, EnergyShield: 0, Ward: 0 },
    { BaseItemType: 8, EnergyShield: 88 }, // other stat columns omitted -> default 0
    { BaseItemType: 10, Armour: 40 },
    { Armour: 5 }, // no BaseItemType -> skipped
  ],
  ShieldTypes: [
    { BaseItemType: 7, Block: 25 },
    { BaseItemType: 9, Block: 30 }, // shield-only base, no ArmourTypes row
    { BaseItemType: 10 }, // in both tables, Block column omitted -> defaults to 0
    { Block: 7 }, // no BaseItemType -> skipped
  ],
  // Keyed on a BaseItemTypes row index like ArmourTypes. Greatsword (0) is melee
  // (RangeMax, no ReloadTime); Crude Bow (11) omits some columns (default 0);
  // Makeshift Crossbow (12) is the reload-time case. Rows with no BaseItemType
  // are ignored; non-weapons appear in neither table.
  WeaponTypes: [
    { BaseItemType: 0, CritChance: 500, Speed: 1450, DamageMin: 12, DamageMax: 21, RangeMax: 13, ReloadTime: 0 },
    { BaseItemType: 11, CritChance: 500, Speed: 850, DamageMin: 6, DamageMax: 10 }, // RangeMax/ReloadTime omitted -> 0
    { BaseItemType: 12, CritChance: 500, Speed: 750, DamageMin: 9, DamageMax: 15, RangeMax: 0, ReloadTime: 800 },
    { CritChance: 500 }, // no BaseItemType -> skipped
  ],
  // Spirit granted by sceptre bases; same BaseItemTypes row-index join.
  ItemSpirit: [
    { BaseItemType: 13, SpiritGranted: 100 },
    { SpiritGranted: 50 }, // no BaseItemType -> skipped
  ],
  FlavourText: [
    { Id: 'UniqueSwordOro', Text: 'A blade of fire.\r\nForged in endless war.' },
    { Id: 'UniqueSwordBehemoth', Text: 'Heavy is the blade.' },
    { Text: 'Orphan flavour with no Id -> skipped.' }, // malformed row: no string Id
  ],
  // A one-handed unique, a two-handed unique, a [DNT] placeholder, a name clashing
  // with a base, and three unique flasks (life, mana, model-less).
  UniqueStashLayout: [
    { WordsKey: 0, ItemVisualIdentityKey: 3, UniqueStashTypesKey: 0 },
    { WordsKey: 3, ItemVisualIdentityKey: 4, UniqueStashTypesKey: 1 },
    { WordsKey: 1, ItemVisualIdentityKey: 0, UniqueStashTypesKey: 0 },
    { WordsKey: 2, ItemVisualIdentityKey: 1, UniqueStashTypesKey: 1 },
    { WordsKey: 4, ItemVisualIdentityKey: 6, UniqueStashTypesKey: 2 },
    { WordsKey: 5, ItemVisualIdentityKey: 7, UniqueStashTypesKey: 2 },
    { WordsKey: 6, ItemVisualIdentityKey: 8, UniqueStashTypesKey: 2 },
    { WordsKey: 7, ItemVisualIdentityKey: 14, UniqueStashTypesKey: 2 },
  ],
  Words: [
    { Text: "Oro's Sacrifice" }, { Text: 'Dev Unique [DNT]' }, { Text: 'Greatsword' }, { Text: 'Behemoth' },
    { Text: 'Sanguine Vial' }, { Text: 'Azure Vial' }, { Text: 'Mystery Vial' }, { Text: 'Diamond Vial' },
  ],
  UniqueStashTypes: [{ Id: 'Sword' }, { Id: 'SwordTwoHand' }, { Id: 'Flask' }],
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
      armour: null, // a weapon has no ArmourTypes/ShieldTypes row
      weapon: { damageMin: 12, damageMax: 21, critical: 500, attackTime: 1450, rangeMax: 13, reloadTime: 0 },
      spirit: 0,
      dropLevel: 12,
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

  it('reads base defensive stats from ArmourTypes (evasion here, block 0)', async () => {
    const items = await buildItems(fakeSource());

    expect(items['Viper Cap']?.armour).toEqual({ armour: 0, evasion: 179, energyShield: 0, ward: 0, block: 0 });
  });

  it('defaults the ArmourTypes stat columns a row omits to 0', async () => {
    const items = await buildItems(fakeSource());

    // Crystal Focus' row carries only EnergyShield; armour/evasion/ward fall back to 0.
    expect(items['Crystal Focus']?.armour).toEqual({ armour: 0, evasion: 0, energyShield: 88, ward: 0, block: 0 });
  });

  it('merges ArmourTypes armour with ShieldTypes block on a shield base', async () => {
    const items = await buildItems(fakeSource());

    expect(items['Plate Shield']?.armour).toEqual({ armour: 50, evasion: 0, energyShield: 0, ward: 0, block: 25 });
  });

  it('takes block from a shield-only base absent from ArmourTypes', async () => {
    const items = await buildItems(fakeSource());

    // Wooden Buckler is only in ShieldTypes: armour stats are 0, block comes through.
    expect(items['Wooden Buckler']?.armour).toEqual({ armour: 0, evasion: 0, energyShield: 0, ward: 0, block: 30 });
  });

  it('defaults a merged base block to 0 when its ShieldTypes row omits it', async () => {
    const items = await buildItems(fakeSource());

    // Bronze Kite Shield is in both tables but its ShieldTypes row has no Block column.
    expect(items['Bronze Kite Shield']?.armour).toEqual({ armour: 40, evasion: 0, energyShield: 0, ward: 0, block: 0 });
  });

  it('ignores armour/shield rows that carry no BaseItemType', async () => {
    // The `{ Armour: 5 }` / `{ Block: 7 }` rows have no BaseItemType, so they map to
    // nothing and never bleed onto index-0 (Greatsword, a weapon with no row).
    const items = await buildItems(fakeSource());

    expect(items.Greatsword?.armour).toBeNull();
  });

  it('gives a base with no defensive row a null armour, not zeros', async () => {
    const items = await buildItems(fakeSource());

    expect(items.Greatsword?.armour).toBeNull(); // weapon
    expect(items['Cobalt Jewel']?.armour).toBeNull(); // jewel
  });

  it('reads melee weapon stats from WeaponTypes', async () => {
    const items = await buildItems(fakeSource());

    expect(items.Greatsword?.weapon).toEqual({
      damageMin: 12, damageMax: 21, critical: 500, attackTime: 1450, rangeMax: 13, reloadTime: 0,
    });
  });

  it('defaults the WeaponTypes columns a row omits to 0', async () => {
    const items = await buildItems(fakeSource());

    // Crude Bow's row carries no RangeMax/ReloadTime; both fall back to 0.
    expect(items['Crude Bow']?.weapon).toEqual({
      damageMin: 6, damageMax: 10, critical: 500, attackTime: 850, rangeMax: 0, reloadTime: 0,
    });
  });

  it('carries a crossbow reload time through', async () => {
    const items = await buildItems(fakeSource());

    expect(items['Makeshift Crossbow']?.weapon).toEqual({
      damageMin: 9, damageMax: 15, critical: 500, attackTime: 750, rangeMax: 0, reloadTime: 800,
    });
  });

  it('gives a base with no WeaponTypes row a null weapon, not zeros', async () => {
    const items = await buildItems(fakeSource());

    expect(items['Viper Cap']?.weapon).toBeNull(); // armour
    expect(items['Cobalt Jewel']?.weapon).toBeNull(); // jewel
    expect(items['Shrine Sceptre']?.weapon).toBeNull(); // sceptre without a WeaponTypes fixture row
  });

  it('reads spirit from ItemSpirit and defaults it to 0 elsewhere', async () => {
    const items = await buildItems(fakeSource());

    expect(items['Shrine Sceptre']?.spirit).toBe(100);
    expect(items.Greatsword?.spirit).toBe(0); // no ItemSpirit row
  });

  it('ignores weapon/spirit rows that carry no BaseItemType', async () => {
    // The `{ CritChance: 500 }` / `{ SpiritGranted: 50 }` rows have no BaseItemType,
    // so they never bleed onto index-0 (Greatsword keeps its own row's stats).
    const items = await buildItems(fakeSource());

    expect(items.Greatsword?.weapon?.damageMin).toBe(12);
    expect(items.Greatsword?.spirit).toBe(0);
  });

  it('passes DropLevel through and defaults a base without one to 0', async () => {
    const items = await buildItems(fakeSource());

    expect(items['Makeshift Crossbow']?.dropLevel).toBe(3);
    expect(items.Rapier?.dropLevel).toBe(0); // no DropLevel column on the row
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
      armour: null, // uniques carry no base link, so no defensive stats
      weapon: null, // ... no weapon stats either
      spirit: 0,
      dropLevel: 0,
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

  it('refines a unique flask category to Life/Mana from its AOFile, else keeps Flask', async () => {
    const items = await buildItems(fakeSource());

    expect(items['Sanguine Vial']?.category).toBe('Life Flask'); // FlaskLife7Drop.ao
    expect(items['Azure Vial']?.category).toBe('Mana Flask'); //    FlaskMana9Drop.ao
    expect(items['Mystery Vial']?.category).toBe('Flask'); //       no AOFile -> unrefined
    expect(items['Diamond Vial']?.category).toBe('Flask'); //       AOFile neither Life nor Mana
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
    // Every distinct icon but greatsword.dds is unserved here: rapier, jewel, the four
    // extra armour bases (vipercap, plateshield, crystalfocus, woodenbuckler, bronzekite),
    // the three weapon bases (crudebow, makeshiftcrossbow, shrinesceptre), the uniques'
    // oro / behemoth and the four unique flask icons.
    expect(report.missing).toBe(16);
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
