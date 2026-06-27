/**
 * @poe2-toolkit/item-extractor - builds Path of Exile 2 base-item data and icons
 * from a {@link GgpkSource}, in the flat shape a build front-end consumes.
 *
 * The package is source-agnostic: it never downloads anything itself. Pass any
 * `@poe2-toolkit/ggpk` source (the CDN-backed `createCdnSource`, or your own) and
 * it returns the item data and decoded icon PNGs - plain data, ready to write
 * wherever you publish them.
 */

import type { GgpkImageSource, GgpkSource } from '@poe2-toolkit/ggpk';

import { buildItemIcons } from './buildIcons.js';
import type { ItemIconsResult } from './buildIcons.js';
import { buildItems } from './buildItems.js';
import type { ItemData } from './buildItems.js';

export { buildItems } from './buildItems.js';
export type { ItemData, Item, ItemReq } from './buildItems.js';

export { buildItemIcons } from './buildIcons.js';
export type { ItemIconsResult } from './buildIcons.js';

/** Everything the extractor produces for one game version. */
export interface ItemBundle {
  /** The item data (bases keyed by display name). */
  data: ItemData;
  /** Decoded icon PNGs plus a report of what packed or was skipped. */
  icons: ItemIconsResult;
}

/** A source that can serve both tables and images (data + icons). */
export type ItemSource = GgpkSource & GgpkImageSource;

/**
 * Run the full item extraction against a source: data and icons in one pass. The
 * source is queried for everything; no other I/O is performed (writing the
 * result is the caller's concern).
 */
export async function extractItems(source: ItemSource): Promise<ItemBundle> {
  const data = await buildItems(source);
  const icons = await buildItemIcons(source, data);

  return { data, icons };
}
