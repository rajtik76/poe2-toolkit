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
   * `Two Hand Sword`, `Warstaff` vs `Quarterstaff`).
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
   * The unique's flavour / lore text as separate lines (GGG stores explicit line
   * breaks that matter for display), or `null` for bases and any unique without
   * one. Only uniques carry flavour text.
   */
  flavourText: string[] | null;
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

// --- raw GGPK row shapes (only the columns this build reads) -----------------

interface BaseItemTypeRow {
  Name?: string;
  ItemClass?: number | null;
  ItemVisualIdentity?: number | null;
}

interface ItemClassRow { Id?: string }
interface ItemVisualIdentityRow { Id?: string; DDSFile?: string }
interface AttributeRequirementRow { BaseItemType?: number | null; ReqStr?: number; ReqDex?: number; ReqInt?: number }

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

  const reqByBaseIndex = new Map<number, AttributeRequirementRow>();

  for (const row of AttributeRequirements) {
    if (row.BaseItemType != null) {
      reqByBaseIndex.set(row.BaseItemType, row);
    }
  }

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
      flavourText: null,
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
    const category = row.UniqueStashTypesKey != null ? UniqueStashTypes[row.UniqueStashTypesKey]?.Id ?? null : null;
    const flavourText = visual?.Id != null ? flavourByUniqueId.get(normalizeUniqueId(visual.Id)) ?? null : null;

    items[name] = {
      rarity: 'unique',
      icon: visual?.DDSFile ?? null,
      itemClass: null,
      category,
      twoHanded: category != null && TWO_HANDED_CATEGORIES.has(category),
      req: { str: 0, dex: 0, int: 0 },
      flavourText,
    };
  }
}
