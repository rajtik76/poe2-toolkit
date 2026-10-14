/**
 * @poe2-toolkit/mod-extractor: builds item-mod data from a {@link GgpkSource}. Source-agnostic: it downloads nothing itself.
 * Mods carry no art, so the bundle has only `data`. `spawnWeights` share the `Tags.Id` vocabulary of item-extractor's `tags`.
 */

import type { GgpkSource } from '@poe2-toolkit/ggpk';

import { buildMods } from './buildMods.js';
import type { ModData } from './buildMods.js';

export { buildMods } from './buildMods.js';
export type { ModData, Mod, ModRoll, ModSpawnWeight } from './buildMods.js';

export interface ModBundle {
  data: ModData;
}

/** The source is queried for everything; writing the result is the caller's concern. */
export async function extractMods(source: GgpkSource): Promise<ModBundle> {
  return { data: await buildMods(source) };
}
