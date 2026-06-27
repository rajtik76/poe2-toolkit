/**
 * Builds the Path of Exile 2 base-item data from GGPK tables, joining
 * `BaseItemTypes` with its item class, visual identity (icon) and attribute
 * requirements into a flat, build-facing shape. Source of truth: GGPK only.
 *
 * Keying is by display name (the base type line a build shows). Icons are kept
 * as their raw GGPK DDS paths - decoding them to PNG is {@link buildItemIcons}'
 * concern.
 */

import type { GgpkSource } from '@poe2-toolkit/ggpk';

/** Strength / dexterity / intelligence required to equip a base. */
export interface ItemReq {
  str: number;
  dex: number;
  int: number;
}

/** One displayable equipment base. */
export interface Item {
  /** Raw GGPK DDS path of the base's icon, or `null` when none is referenced. */
  icon: string | null;
  /** The item class id (e.g. `Two Hand Sword`), or `null` when unknown. */
  itemClass: string | null;
  twoHanded: boolean;
  req: ItemReq;
}

/** Bases keyed by display name; the first displayable base seen for a name wins. */
export type ItemData = Record<string, Item>;

/**
 * Two-handedness is not on base-level Tags (they don't inherit weapon-class
 * tags), so it's derived from the item class - the reliable signal.
 */
const TWO_HANDED_CLASSES = new Set([
  'Two Hand Sword', 'Two Hand Axe', 'Two Hand Mace',
  'Bow', 'Crossbow', 'Staff', 'Warstaff', 'Quarterstaff', 'Thrown Two Hand Axe',
]);

// --- raw GGPK row shapes (only the columns this build reads) -----------------

interface BaseItemTypeRow {
  Name?: string;
  ItemClass?: number | null;
  ItemVisualIdentity?: number | null;
}

interface ItemClassRow { Id?: string }
interface ItemVisualIdentityRow { DDSFile?: string }
interface AttributeRequirementRow { BaseItemType?: number | null; ReqStr?: number; ReqDex?: number; ReqInt?: number }

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
      icon: ItemVisualIdentity[base.ItemVisualIdentity]?.DDSFile ?? null,
      itemClass: classId,
      twoHanded: classId != null && TWO_HANDED_CLASSES.has(classId),
      req: {
        str: req?.ReqStr ?? 0,
        dex: req?.ReqDex ?? 0,
        int: req?.ReqInt ?? 0,
      },
    };
  });

  return items;
}
