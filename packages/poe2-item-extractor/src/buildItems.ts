/**
 * Builds the Path of Exile 2 item data from GGPK tables. Normal-rarity bases
 * come from `BaseItemTypes` (joined with item class, visual identity and
 * attribute requirements); unique items come from `UniqueStashLayout` (joined
 * with `Words` for the name, `ItemVisualIdentity` for the icon and
 * `UniqueStashTypes` for the category). Both land in one flat, build-facing
 * map. Source of truth: GGPK only.
 *
 * Keying is by display name (the line a build shows: the base type for a normal
 * item, the unique's name for a unique). Icons are kept as their raw GGPK DDS
 * paths - decoding them to PNG is {@link buildItemIcons}' concern.
 *
 * On the unique/base split: PoE's .dat has no unique->base-type link (the base a
 * unique rolls on is decided at drop generation, not stored), so a unique
 * carries its stash `category` (the item slot, e.g. `Body Armour`) rather than a
 * concrete base type. Verified against live `UniqueStashLayout`: its only joins
 * are to Words, ItemVisualIdentity and UniqueStashTypes.
 */

import type { GgpkSource } from '@poe2-toolkit/ggpk';

/** Strength / dexterity / intelligence required to equip a base. */
export interface ItemReq {
  str: number;
  dex: number;
  int: number;
}

/**
 * Base defensive stats of an armour or shield base, in the base's own raw units
 * (before quality and mods). A `0` field means the base carries that defence but
 * at value 0; a `null` {@link Item.armour} means the base has no defensive row at
 * all (weapons, jewels, flasks, ...) - the two are distinct.
 */
export interface ItemArmour {
  /** Base armour rating (`ArmourTypes.Armour`). */
  armour: number;
  /** Base evasion rating (`ArmourTypes.Evasion`). */
  evasion: number;
  /** Base energy shield (`ArmourTypes.EnergyShield`). */
  energyShield: number;
  /** Base ward (`ArmourTypes.Ward`). */
  ward: number;
  /** Base block chance (`ShieldTypes.Block`); non-zero only on shields. */
  block: number;
}

/**
 * Base offensive stats of a weapon base, in the base's own raw GGPK units
 * (before quality and mods). A `null` {@link Item.weapon} means the base has no
 * `WeaponTypes` row at all: armour, jewellery, flasks, off-hands, and also the
 * caster weapons (sceptres, wands, staves), which carry no base attack stats.
 */
export interface ItemWeapon {
  /** Minimum physical damage (`WeaponTypes.DamageMin`). Base weapons deal physical only; elemental/chaos comes from mods. */
  damageMin: number;
  /** Maximum physical damage (`WeaponTypes.DamageMax`). */
  damageMax: number;
  /** Critical hit chance times 100 (`WeaponTypes.CritChance`): `500` is 5.00 %. */
  critical: number;
  /** Attack time in milliseconds (`WeaponTypes.Speed`): attacks per second is `1000 / attackTime`. */
  attackTime: number;
  /** Melee strike range (`WeaponTypes.RangeMax`). */
  rangeMax: number;
  /** Reload time in milliseconds (`WeaponTypes.ReloadTime`); non-zero only on crossbows. */
  reloadTime: number;
}

/** One displayable item: a normal-rarity base or a unique. */
export interface Item {
  /** `unique` if the item is a unique, else `normal` (an ordinary base). */
  rarity: 'normal' | 'unique';
  /** Raw GGPK DDS path of the icon, or `null` when none is referenced. */
  icon: string | null;
  /**
   * Base item class id from `ItemClasses.Id` (e.g. `Two Hand Sword`); `null` for
   * uniques and unknowns. Mutually exclusive with {@link Item.category}: a base
   * has `itemClass`, a unique has `category`.
   */
  itemClass: string | null;
  /**
   * Unique-stash category / item slot from `UniqueStashTypes.Id` (e.g.
   * `Body Armour`, `SwordTwoHand`); `null` for bases. It is a unique's
   * closest-to-a-class, since .dat has no unique-to-base-type link. Its
   * vocabulary differs from {@link Item.itemClass} (`SwordTwoHand` vs
   * `Two Hand Sword`, `Warstaff` vs `Quarterstaff`). A unique flask, which the
   * stash lumps under a single `Flask` slot, is refined to `Life Flask` or
   * `Mana Flask` from its `ItemVisualIdentity.AOFile` (the base flask model the
   * unique reuses) - the one unique-to-base signal .dat leaks.
   */
  category: string | null;
  /**
   * Whether the item is a two-handed weapon. Derived from {@link Item.itemClass}
   * for bases and from the weapon {@link Item.category} for uniques, so it is
   * correct for uniques despite their unknown base type. `false` for non-weapons.
   */
  twoHanded: boolean;
  /**
   * Attribute requirements to equip. On a unique this is always
   * `{ str: 0, dex: 0, int: 0 }`: the real requirement lives on the unique's
   * (unknown) base type, so read it as *not populated*, not "no requirement".
   */
  req: ItemReq;
  /**
   * Base defensive stats from `ArmourTypes` / `ShieldTypes` (armour, evasion,
   * energy shield, ward, block), or `null` when the base has no defensive row -
   * weapons, jewels, flasks and every other non-armour base. Always `null` on a
   * unique: .dat has no unique-to-base-type link (see {@link Item.req} /
   * {@link Item.tags} / {@link Item.itemClass}), so a unique's defences live on
   * its unknown base and are not populated here. A `null` object means "no
   * defensive row"; a `0` field means "has the stat, value 0".
   */
  armour: ItemArmour | null;
  /**
   * Base offensive stats from `WeaponTypes` (physical damage, crit, attack time,
   * range, reload time), or `null` when the base has no weapon row - armour,
   * jewellery, flasks, off-hands (shields, bucklers, foci, quivers) and caster
   * weapons (sceptres, wands, staves; a sceptre grants {@link Item.spirit}
   * instead). Always `null` on a unique: .dat has no unique-to-base-type link
   * (see {@link Item.armour}), so a unique's weapon stats live on its unknown base.
   */
  weapon: ItemWeapon | null;
  /**
   * Base spirit granted (`ItemSpirit.SpiritGranted`); non-zero only on sceptre
   * bases. `0` when the base has no spirit row, and always `0` on a unique (no
   * base link) - read the unique's `0` as *not populated*.
   */
  spirit: number;
  /**
   * The level the base starts dropping at (`BaseItemTypes.DropLevel`). `0` on a
   * unique (no base link) - read it as *not populated*, real bases start at 1.
   */
  dropLevel: number;
  /**
   * The unique's flavour / lore text as separate lines (GGG stores explicit line
   * breaks that matter for display), or `null` for bases and any unique without
   * one. Only uniques carry flavour text.
   */
  flavourText: string[] | null;
  /**
   * The base's mod domain in the `ModDomains` vocabulary (`Item` for ordinary
   * equipment, `Flask` for flasks and charms, ...), from `BaseItemTypes.ModDomain`;
   * `null` for uniques (no base link) and for bases whose domain has no name. A mod
   * only rolls on an item of the mod's own domain, so this is the **first** filter
   * when joining to `@poe2-toolkit/mod-extractor` (`Mod.domain`): match the domain,
   * then the {@link Item.tags}. Without it the tag filter alone leaks mods from
   * unrelated domains (Monster, Heist, Atlas, ...) that share a `default` weight.
   */
  modDomain: string | null;
  /**
   * The item's effective item-type tags in the `Tags.Id` vocabulary
   * (e.g. `armour`, `body_armour`, `str_armour`, `weapon`, `default`) - the base's
   * own `BaseItemTypes.Tags` plus the tags its item class contributes plus
   * `default`. This is the set GGG matches a mod's spawn tags against, so together
   * with {@link Item.modDomain} it is how items join to `@poe2-toolkit/mod-extractor`:
   * within the item's mod domain, a mod can roll on the item when the first of its
   * `spawnWeights` whose tag is in `tags` has a positive weight. Empty on uniques:
   * .dat has no unique-to-base-type link, so a unique's base tags are unknown (like
   * its `req` and `itemClass`).
   */
  tags: string[];
}

/**
 * Items keyed by display name. Bases are added first (the first displayable base
 * seen for a name wins); uniques are added after and never overwrite a base.
 */
export type ItemData = Record<string, Item>;

/**
 * Two-handedness is not on base-level Tags (they don't inherit weapon-class
 * tags), so it's derived from the item class - the reliable signal.
 */
const TWO_HANDED_CLASSES = new Set([
  'Two Hand Sword', 'Two Hand Axe', 'Two Hand Mace',
  'Bow', 'Crossbow', 'Staff', 'Warstaff', 'Quarterstaff', 'Thrown Two Hand Axe',
]);

/**
 * The two-handed weapon categories in `UniqueStashTypes.Id` vocabulary (which
 * differs from `ItemClasses.Id`). A unique's handedness follows from its weapon
 * category, so it's derivable even without a concrete base type.
 */
const TWO_HANDED_CATEGORIES = new Set([
  'SwordTwoHand', 'AxeTwoHand', 'MaceTwoHand', 'Bow', 'Crossbow', 'Staff', 'Warstaff',
]);

/**
 * The item-type tags each `ItemClasses.Id` contributes on top of a base's own
 * `BaseItemTypes.Tags`. PoE2 stores only the specific tags on the base (e.g.
 * `str_armour`) and leaves the item-class tags (`armour`, `body_armour`, `weapon`,
 * `bow`, `two_hand_weapon`, ...) to be inherited from the class; GGPK has no single
 * table for that inheritance, so this map encodes it. It was derived from and
 * validated 1:1 against Path of Building's `Data/Bases` tag sets for every base
 * (the residual differences are base-specific league tags that differ by data
 * snapshot, not class tags). Classes absent here (jewels, currency, incursion
 * pieces) contribute no class tags.
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

/**
 * `ModDomains` enumerators in schema order (1-based; `BaseItemTypes.ModDomain`
 * indexes this). Kept byte-for-byte in step with `@poe2-toolkit/mod-extractor`'s
 * own `MOD_DOMAINS`, the shared vocabulary a base's `modDomain` joins to a mod's
 * `domain`. A value with no name (or an out-of-range index) yields `null`.
 */
const MOD_DOMAINS = [
  'Item', 'Flask', 'Monster', 'Chest', 'Area', null, 'Sanctum Relic', null, 'Crafted', 'Base Jewel',
  'Atlas', 'Leaguestone', 'Abyss Jewel', 'Map Device', 'Dummy', 'Delve', 'Delve Area', 'Synthesis A',
  'Synthesis Globals', 'Synthesis Bonus', 'Affliction Jewel', 'Heist Area', 'Heist NPC', 'Heist Trinket',
  'Watchstone', 'Veiled', 'Expedition Relic', 'Unveiled', 'Eldritch Altar', 'Sentinel', 'Memory Line',
  'Sanctum Special', 'Crucible Map', 'Tincture', 'Animal Charm', 'Necropolis Monster', 'Idol', 'Graft',
] as const;

/** Map a 1-based `BaseItemTypes.ModDomain` index to its name, or `null`. */
function modDomainName(domain: number | null | undefined): string | null {
  return domain != null ? MOD_DOMAINS[domain - 1] ?? null : null;
}

/**
 * The base's effective mod-matching tags: its own `BaseItemTypes.Tags`, the tags
 * its item class contributes ({@link CLASS_TAGS}) and the universal `default`,
 * sorted for a stable output. This is the set a mod's spawn tags are matched
 * against.
 */
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

// --- raw GGPK row shapes (only the columns this build reads) -----------------

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

/** One unique's slot in the unique stash: name, icon and category by row index. */
interface UniqueStashLayoutRow {
  WordsKey?: number | null;
  ItemVisualIdentityKey?: number | null;
  UniqueStashTypesKey?: number | null;
}

interface WordsRow { Text?: string }
interface UniqueStashTypesRow { Id?: string }
interface FlavourTextRow { Id?: string; Text?: string }

/**
 * The unique-item id shared between `ItemVisualIdentity` and `FlavourText`, with
 * any `_`-suffixed art variant dropped: `FourUniqueRing33_a` -> `FourUniqueRing33`.
 * This is how the two tables line up (there is no direct foreign key), matching
 * Path of Building's `flavourText` join.
 */
function normalizeUniqueId(id: string): string {
  return /^[^_]+/.exec(id)?.[0] ?? id;
}

/**
 * Refine a unique's stash category with the flask liquid type when it is a flask.
 * `UniqueStashTypes` lumps every unique flask under one `Flask` slot, but a unique
 * flask reuses a base flask 3D model, so its `ItemVisualIdentity.AOFile` still names
 * the base (`.../Basetypes/FlaskLife11Drop.ao` / `FlaskMana9Drop.ao`). That is the
 * only unique-to-base signal .dat leaks - unique equipment carries a bespoke model,
 * so no base is recoverable there. Returns `Life Flask` / `Mana Flask` for a flask
 * whose model resolves, otherwise the category unchanged.
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

/**
 * Merge `ArmourTypes` (armour / evasion / energy shield / ward) and `ShieldTypes`
 * (block) into one {@link ItemArmour} per `BaseItemTypes` index. Both tables key
 * on a `BaseItemType` row index, the same join as `AttributeRequirements`; a
 * shield appears in both, an ordinary armour only in `ArmourTypes`. A base absent
 * from both is absent from the map (yields `null`, not zeros), so a consumer can
 * tell "no defensive row" from "row present, stat 0".
 */
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

/**
 * Index `WeaponTypes` into one {@link ItemWeapon} per `BaseItemTypes` row index -
 * the same `BaseItemType` join as `ArmourTypes`. A base absent from the table is
 * absent from the map (yields `null`, not zeros): only weapon bases carry a row.
 */
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

/** Index `ItemSpirit.SpiritGranted` per `BaseItemTypes` row index (sceptres only). */
function spiritByBaseIndex(ItemSpirit: ItemSpiritRow[]): Map<number, number> {
  const map = new Map<number, number>();

  for (const row of ItemSpirit) {
    if (row.BaseItemType != null) {
      map.set(row.BaseItemType, row.SpiritGranted ?? 0);
    }
  }

  return map;
}

/** Split GGG flavour text into trimmed non-empty lines, or `null` when empty. */
function splitFlavourText(text: string): string[] | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');

  return lines.length > 0 ? lines : null;
}

/**
 * Build the item export from the supplied {@link GgpkSource}. All data comes
 * from the source's tables; this function performs no I/O of its own.
 */
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

/**
 * Fold unique items into `items` from `UniqueStashLayout` (the authoritative
 * unique list), keyed by the unique's display name. A unique never overwrites a
 * base that already claimed the name. Its `category` is the unique-stash slot
 * (e.g. `Body Armour`); it carries no base-level `itemClass`, `twoHanded` or
 * `req` because .dat does not tie a unique to a concrete base type.
 */
async function addUniques(
  source: GgpkSource,
  items: ItemData,
  ItemVisualIdentity: ItemVisualIdentityRow[],
): Promise<void> {
  const UniqueStashLayout = (await source.table('UniqueStashLayout')) as UniqueStashLayoutRow[];
  const Words = (await source.table('Words')) as WordsRow[];
  const UniqueStashTypes = (await source.table('UniqueStashTypes')) as UniqueStashTypesRow[];
  const FlavourText = (await source.table('FlavourText')) as FlavourTextRow[];

  // Flavour text has no foreign key to a unique; it lines up by the normalized
  // ItemVisualIdentity/FlavourText id. First row for a key wins.
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
