/**
 * @poe2-toolkit/item-extractor — builds Path of Exile 2 item data and icons from a
 * {@link GgpkSource}.
 *
 * Work in progress: the API is not implemented yet. It will mirror
 * `@poe2-toolkit/tree-extractor` — source-agnostic, GGPK-only, shipping code rather than
 * data — extracting base item types, their stats and their icons.
 */

import type { GgpkSource } from '@poe2-toolkit/ggpk';

/**
 * Planned entry point: extract item data and icons from a GGPK source.
 *
 * @throws always — not implemented yet.
 */
export async function buildItems(source: GgpkSource): Promise<never> {
  void source;

  throw new Error('@poe2-toolkit/item-extractor is not implemented yet');
}
