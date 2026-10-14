/**
 * Builds item data from GGPK tables, keyed by display name. Bases come from `BaseItemTypes`, uniques from
 * `UniqueStashLayout`. PoE's .dat has no unique->base-type link, so a unique carries its stash `category`
 * (e.g. `Body Armour`) instead of a base type. Icons stay raw DDS paths (decoded by {@link buildItemIcons}).
 */

import type { GgpkSource } from '@poe2-toolkit/ggpk';

export interface ItemReq {
  str: number;
  dex: number;
  int: number;
}

export interface ItemArmour {
  armour: number;
  evasion: number;
  energyShield: number;
  ward: number;
  block: number;
}

export interface ItemWeapon {
  damageMin: number;
  damageMax: number;
  critical: number;
  attackTime: number;
  rangeMax: number;
  reloadTime: number;
}

export interface Item {
  rarity: 'normal' | 'unique';
  icon: string | null;
  itemClass: string | null;
  category: string | null;
  twoHanded: boolean;
  /** Always `{ str: 0, dex: 0, int: 0 }` on a unique: read as *not populated*, not "no requirement". */
  req: ItemReq;
  armour: ItemArmour | null;
  weapon: ItemWeapon | null;
  /** Non-zero only on sceptre bases; `0` on a unique means *not populated*. */
  spirit: number;
  /** `0` on a unique means *not populated*, real bases start at 1. */
  dropLevel: number;
  flavourText: string[] | null;
  /**
   * `ModDomains` name from `BaseItemTypes.ModDomain`; `null` for uniques and unnamed domains. A mod only rolls
   * on its own domain, so match this FIRST when joining to `mod-extractor` (`Mod.domain`), then {@link Item.tags}.
   */
  modDomain: string | null;
  tags: string[];
}

/** Bases are added first (first base per name wins); uniques never overwrite a base. */
export type ItemData = Record<string, Item>;

/** Two-handedness is not on base-level Tags, so it's derived from the item class. */
const TWO_HANDED_CLASSES = new Set([
  'Two Hand Sword', 'Two Hand Axe', 'Two Hand Mace',
  'Bow', 'Crossbow', 'Staff', 'Warstaff', 'Quarterstaff', 'Thrown Two Hand Axe',
]);

/** Two-handed categories in `UniqueStashTypes.Id` vocabulary, so a unique's handedness is derivable without a base. */
const TWO_HANDED_CATEGORIES = new Set([
  'SwordTwoHand', 'AxeTwoHand', 'MaceTwoHand', 'Bow', 'Crossbow', 'Staff', 'Warstaff',
]);

/**
 * Item-type tags each `ItemClasses.Id` adds to a base's own `BaseItemTypes.Tags` (PoE2 stores only the specific
 * ones, e.g. `str_armour`). Validated 1:1 against PoB's `Data/Bases`. Classes absent here add none.
 */
const CLASS_TAGS: Record<string, readonly string[]> = {
  Amulet: ['amulet'],
  Belt: ['belt'],
  Ring: ['ring'],
  Quiver: ['quiver'],
  'Body Armour': ['armour', 'body_armour'],
  Boots: ['armour', 'boots'],
  Gloves: ['armour', 'gloves'],
  Helmet: ['armour', 'helmet'],
  Shield: ['armour', 'shield'],
  Buckler: ['armour', 'shield', 'buckler'],
  Focus: ['armour', 'focus'],
  Bow: ['weapon', 'bow', 'ranged', 'two_hand_weapon', 'twohand'],
  Crossbow: ['weapon', 'crossbow', 'ranged', 'two_hand_weapon', 'twohand'],
  Claw: ['weapon', 'claw', 'one_hand_weapon', 'onehand'],
  Dagger: ['weapon', 'dagger', 'one_hand_weapon', 'onehand'],
  Flail: ['weapon', 'flail', 'one_hand_weapon', 'onehand'],
  'One Hand Axe': ['weapon', 'axe', 'one_hand_weapon', 'onehand'],
  'One Hand Mace': ['weapon', 'mace', 'one_hand_weapon', 'onehand'],
  'One Hand Sword': ['weapon', 'sword', 'one_hand_weapon', 'onehand'],
  Spear: ['weapon', 'spear', 'one_hand_weapon', 'onehand'],
  Sceptre: ['sceptre', 'onehand'],
  Wand: ['wand', 'onehand'],
  'Two Hand Axe': ['weapon', 'axe', 'two_hand_weapon', 'twohand'],
  'Two Hand Mace': ['weapon', 'mace', 'two_hand_weapon', 'twohand'],
  'Two Hand Sword': ['weapon', 'sword', 'two_hand_weapon', 'twohand'],
  Warstaff: ['weapon', 'warstaff', 'two_hand_weapon', 'twohand'],
  Talisman: ['weapon', 'talisman', 'two_hand_weapon', 'twohand'],
  Staff: ['staff', 'twohand'],
  TrapTool: ['trap', 'twohand'],
  FishingRod: ['fishing_rod', 'twohand'],
  LifeFlask: ['flask', 'life_flask'],
  ManaFlask: ['flask', 'mana_flask'],
  UtilityFlask: ['flask', 'utility_flask'],
};

/** `ModDomains` in schema order (1-based). Must stay in step with `mod-extractor`'s `MOD_DOMAINS`. */
const MOD_DOMAINS = [
  'Item', 'Flask', 'Monster', 'Chest', 'Area', null, 'Sanctum Relic', null, 'Crafted', 'Base Jewel',
  'Atlas', 'Leaguestone', 'Abyss Jewel', 'Map Device', 'Dummy', 'Delve', 'Delve Area', 'Synthesis A',
  'Synthesis Globals', 'Synthesis Bonus', 'Affliction Jewel', 'Heist Area', 'Heist NPC', 'Heist Trinket',
  'Watchstone', 'Veiled', 'Expedition Relic', 'Unveiled', 'Eldritch Altar', 'Sentinel', 'Memory Line',
  'Sanctum Special', 'Crucible Map', 'Tincture', 'Animal Charm', 'Necropolis Monster', 'Idol', 'Graft',
] as const;

function modDomainName(domain: number | null | undefined): string | null {
  return domain != null ? MOD_DOMAINS[domain - 1] ?? null : null;
}

/** Effective mod-matching tags: own `Tags`, the item class's ({@link CLASS_TAGS}) and `default`, sorted. */
function effectiveTags(tagIndices: number[], classId: string | null, Tags: TagRow[]): string[] {
  const tags = new Set<string>(['default']);

  for (const index of tagIndices) {
    const id = Tags[index]?.Id;

    if (typeof id === 'string') {
      tags.add(id);
    }
  }

  for (const tag of (classId != null ? CLASS_TAGS[classId] : undefined) ?? []) {
    tags.add(tag);
  }

  return [...tags].sort();
}

interface BaseItemTypeRow {
  Name?: string;
  ItemClass?: number | null;
  ItemVisualIdentity?: number | null;
  ModDomain?: number | null;
  DropLevel?: number;
  Tags?: number[];
}

interface ItemClassRow { Id?: string }
interface TagRow { Id?: string }
interface ItemVisualIdentityRow { Id?: string; DDSFile?: string; AOFile?: string }
interface AttributeRequirementRow { BaseItemType?: number | null; ReqStr?: number; ReqDex?: number; ReqInt?: number }
interface ArmourTypeRow { BaseItemType?: number | null; Armour?: number; Evasion?: number; EnergyShield?: number; Ward?: number }
interface ShieldTypeRow { BaseItemType?: number | null; Block?: number }
interface WeaponTypeRow { BaseItemType?: number | null; CritChance?: number; Speed?: number; DamageMin?: number; DamageMax?: number; RangeMax?: number; ReloadTime?: number }
interface ItemSpiritRow { BaseItemType?: number | null; SpiritGranted?: number }

interface UniqueStashLayoutRow {
  WordsKey?: number | null;
  ItemVisualIdentityKey?: number | null;
  UniqueStashTypesKey?: number | null;
}

interface WordsRow { Text?: string }
interface UniqueStashTypesRow { Id?: string }
interface FlavourTextRow { Id?: string; Text?: string }

/** Unique id shared by `ItemVisualIdentity` and `FlavourText` (art variant dropped: `FourUniqueRing33_a` -> `FourUniqueRing33`), as PoB joins them. */
function normalizeUniqueId(id: string): string {
  return /^[^_]+/.exec(id)?.[0] ?? id;
}

/**
 * `UniqueStashTypes` lumps every unique flask under `Flask`, but its `ItemVisualIdentity.AOFile` still names the
 * base flask model. That is the only unique-to-base signal .dat leaks. Returns `Life Flask` / `Mana Flask`, else the category.
 */
function refineFlaskCategory(category: string | null, aoFile: string | undefined): string | null {
  if (category !== 'Flask' || aoFile == null) {
    return category;
  }

  if (/FlaskLife/i.test(aoFile)) {
    return 'Life Flask';
  }

  if (/FlaskMana/i.test(aoFile)) {
    return 'Mana Flask';
  }

  return category;
}

/** A base absent from both tables is absent from the map, so a consumer can tell "no defensive row" from "stat 0". */
function armourByBaseIndex(ArmourTypes: ArmourTypeRow[], ShieldTypes: ShieldTypeRow[]): Map<number, ItemArmour> {
  const map = new Map<number, ItemArmour>();

  for (const row of ArmourTypes) {
    if (row.BaseItemType != null) {
      map.set(row.BaseItemType, {
        armour: row.Armour ?? 0,
        evasion: row.Evasion ?? 0,
        energyShield: row.EnergyShield ?? 0,
        ward: row.Ward ?? 0,
        block: 0,
      });
    }
  }

  for (const row of ShieldTypes) {
    if (row.BaseItemType == null) {
      continue;
    }

    const existing = map.get(row.BaseItemType);

    if (existing) {
      existing.block = row.Block ?? 0;
    } else {
      map.set(row.BaseItemType, { armour: 0, evasion: 0, energyShield: 0, ward: 0, block: row.Block ?? 0 });
    }
  }

  return map;
}

function weaponByBaseIndex(WeaponTypes: WeaponTypeRow[]): Map<number, ItemWeapon> {
  const map = new Map<number, ItemWeapon>();

  for (const row of WeaponTypes) {
    if (row.BaseItemType != null) {
      map.set(row.BaseItemType, {
        damageMin: row.DamageMin ?? 0,
        damageMax: row.DamageMax ?? 0,
        critical: row.CritChance ?? 0,
        attackTime: row.Speed ?? 0,
        rangeMax: row.RangeMax ?? 0,
        reloadTime: row.ReloadTime ?? 0,
      });
    }
  }

  return map;
}

function spiritByBaseIndex(ItemSpirit: ItemSpiritRow[]): Map<number, number> {
  const map = new Map<number, number>();

  for (const row of ItemSpirit) {
    if (row.BaseItemType != null) {
      map.set(row.BaseItemType, row.SpiritGranted ?? 0);
    }
  }

  return map;
}

function splitFlavourText(text: string): string[] | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');

  return lines.length > 0 ? lines : null;
}

export async function buildItems(source: GgpkSource): Promise<ItemData> {
  const BaseItemTypes = (await source.table('BaseItemTypes')) as BaseItemTypeRow[];
  const ItemClasses = (await source.table('ItemClasses')) as ItemClassRow[];
  const ItemVisualIdentity = (await source.table('ItemVisualIdentity')) as ItemVisualIdentityRow[];
  const AttributeRequirements = (await source.table('AttributeRequirements')) as AttributeRequirementRow[];
  const ArmourTypes = (await source.table('ArmourTypes')) as ArmourTypeRow[];
  const ShieldTypes = (await source.table('ShieldTypes')) as ShieldTypeRow[];
  const WeaponTypes = (await source.table('WeaponTypes')) as WeaponTypeRow[];
  const ItemSpirit = (await source.table('ItemSpirit')) as ItemSpiritRow[];
  const Tags = (await source.table('Tags')) as TagRow[];

  const reqByBaseIndex = new Map<number, AttributeRequirementRow>();

  for (const row of AttributeRequirements) {
    if (row.BaseItemType != null) {
      reqByBaseIndex.set(row.BaseItemType, row);
    }
  }

  const armourByBase = armourByBaseIndex(ArmourTypes, ShieldTypes);
  const weaponByBase = weaponByBaseIndex(WeaponTypes);
  const spiritByBase = spiritByBaseIndex(ItemSpirit);

  const items: ItemData = {};

  BaseItemTypes.forEach((base, baseIndex) => {
    const name = base.Name;

    if (typeof name !== 'string' || name === '' || name.includes('[DNT]')) {
      return;
    }

    if (base.ItemVisualIdentity == null) {
      return; // no art reference - not a displayable equipment base
    }

    // First displayable base seen for a name wins (bases can repeat a name).
    if (items[name]) {
      return;
    }

    const itemClass = base.ItemClass != null ? ItemClasses[base.ItemClass] : undefined;
    const classId = itemClass?.Id ?? null;
    const req = reqByBaseIndex.get(baseIndex);

    items[name] = {
      rarity: 'normal',
      icon: ItemVisualIdentity[base.ItemVisualIdentity]?.DDSFile ?? null,
      itemClass: classId,
      category: null,
      twoHanded: classId != null && TWO_HANDED_CLASSES.has(classId),
      req: {
        str: req?.ReqStr ?? 0,
        dex: req?.ReqDex ?? 0,
        int: req?.ReqInt ?? 0,
      },
      armour: armourByBase.get(baseIndex) ?? null,
      weapon: weaponByBase.get(baseIndex) ?? null,
      spirit: spiritByBase.get(baseIndex) ?? 0,
      dropLevel: base.DropLevel ?? 0,
      flavourText: null,
      modDomain: modDomainName(base.ModDomain),
      tags: effectiveTags(base.Tags ?? [], classId, Tags),
    };
  });

  await addUniques(source, items, ItemVisualIdentity);

  return items;
}

/** Uniques never overwrite a base that claimed the name, and carry no `itemClass`/`twoHanded`/`req` (no base link in .dat). */
async function addUniques(
  source: GgpkSource,
  items: ItemData,
  ItemVisualIdentity: ItemVisualIdentityRow[],
): Promise<void> {
  const UniqueStashLayout = (await source.table('UniqueStashLayout')) as UniqueStashLayoutRow[];
  const Words = (await source.table('Words')) as WordsRow[];
  const UniqueStashTypes = (await source.table('UniqueStashTypes')) as UniqueStashTypesRow[];
  const FlavourText = (await source.table('FlavourText')) as FlavourTextRow[];

  // Flavour text has no foreign key; it lines up by the normalized ItemVisualIdentity/FlavourText id. First row wins.
  const flavourByUniqueId = new Map<string, string[]>();

  for (const row of FlavourText) {
    if (typeof row.Id !== 'string' || typeof row.Text !== 'string') {
      continue;
    }

    const key = normalizeUniqueId(row.Id);
    const lines = splitFlavourText(row.Text);

    if (lines && !flavourByUniqueId.has(key)) {
      flavourByUniqueId.set(key, lines);
    }
  }

  for (const row of UniqueStashLayout) {
    const name = row.WordsKey != null ? Words[row.WordsKey]?.Text : undefined;

    if (typeof name !== 'string' || name === '' || name.includes('[DNT]')) {
      continue;
    }

    // Bases win on a name clash, and the first layout row for a unique wins.
    if (items[name]) {
      continue;
    }

    const visual = row.ItemVisualIdentityKey != null ? ItemVisualIdentity[row.ItemVisualIdentityKey] : undefined;
    const stashCategory = row.UniqueStashTypesKey != null ? UniqueStashTypes[row.UniqueStashTypesKey]?.Id ?? null : null;
    const category = refineFlaskCategory(stashCategory, visual?.AOFile);
    const flavourText = visual?.Id != null ? flavourByUniqueId.get(normalizeUniqueId(visual.Id)) ?? null : null;

    items[name] = {
      rarity: 'unique',
      icon: visual?.DDSFile ?? null,
      itemClass: null,
      category,
      twoHanded: category != null && TWO_HANDED_CATEGORIES.has(category),
      req: { str: 0, dex: 0, int: 0 },
      armour: null,
      weapon: null,
      spirit: 0,
      dropLevel: 0,
      flavourText,
      modDomain: null,
      tags: [],
    };
  }
}
