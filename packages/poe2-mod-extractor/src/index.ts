/**
 * @poe2-toolkit/mod-extractor - builds Path of Exile 2 item-mod data from a
 * {@link GgpkSource}, in the flat shape a build front-end consumes.
 *
 * The package is source-agnostic: it never downloads anything itself. Pass any
 * `@poe2-toolkit/ggpk` source (the CDN-backed `createCdnSource`, or your own) and
 * it returns the mod data - affix ranges, tiers and spawn tags - as plain data,
 * ready to write wherever you publish it.
 *
 * Mods carry no art, so unlike the item, gem and rune extractors the bundle has
 * only `data`. Each mod's `spawnWeights` share the `Tags.Id` vocabulary that
 * `@poe2-toolkit/item-extractor` puts on each item's `tags`, so mod and item data
 * join on tags without any shared code.
 */

import type { GgpkSource } from '@poe2-toolkit/ggpk';

import { buildMods } from './buildMods.js';
import type { ModData } from './buildMods.js';

export { buildMods } from './buildMods.js';
export type { ModData, Mod, ModRoll, ModSpawnWeight } from './buildMods.js';

/** Everything the mod extractor produces for one game version. */
export interface ModBundle {
  /** The mod data (mods keyed by `Mods.Id`). Mods carry no art, so there is no `icons`. */
  data: ModData;
}

/**
 * Run the full mod extraction against a source. The source is queried for
 * everything; no other I/O is performed (writing the result is the caller's
 * concern).
 */
export async function extractMods(source: GgpkSource): Promise<ModBundle> {
  return { data: await buildMods(source) };
}
