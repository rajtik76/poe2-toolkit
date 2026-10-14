/** @poe2-toolkit/item-extractor: builds base-item data and icons from a {@link GgpkSource}. Source-agnostic: it downloads nothing itself. */

import type { GgpkImageSource, GgpkSource } from '@poe2-toolkit/ggpk';

import { buildItemIcons } from './buildIcons.js';
import type { ItemIconsResult } from './buildIcons.js';
import { buildItems } from './buildItems.js';
import type { ItemData } from './buildItems.js';

export { buildItems } from './buildItems.js';
export type { ItemData, Item, ItemReq, ItemArmour, ItemWeapon } from './buildItems.js';

export { buildItemIcons } from './buildIcons.js';
export type { ItemIconsResult } from './buildIcons.js';

export interface ItemBundle {
  data: ItemData;
  icons: ItemIconsResult;
}

export type ItemSource = GgpkSource & GgpkImageSource;

/** The source is queried for everything; writing the result is the caller's concern. */
export async function extractItems(source: ItemSource): Promise<ItemBundle> {
  const data = await buildItems(source);
  const icons = await buildItemIcons(source, data);

  return { data, icons };
}
