/**
 * @poe2-toolkit/rune-extractor - builds Path of Exile 2 rune / soul-core data
 * from a {@link GgpkSource}, in the flat shape a build front-end consumes.
 *
 * The package is source-agnostic: it never downloads anything itself. Pass any
 * `@poe2-toolkit/ggpk` source (the CDN-backed `createCdnSource`, or your own) and
 * it returns the rune data - plain data, ready to write wherever you publish it.
 *
 * Runes carry no icon of their own, so unlike the item and gem extractors this
 * package produces data only.
 */

import type { GgpkSource } from '@poe2-toolkit/ggpk';

import { buildRunes } from './buildRunes.js';
import type { RuneData } from './buildRunes.js';

export { buildRunes } from './buildRunes.js';
export type { RuneData, Rune } from './buildRunes.js';

/** Everything the extractor produces for one game version. */
export interface RuneBundle {
  /** The rune data (runes keyed by display name). */
  data: RuneData;
}

/** A source that can serve tables and the stat-description file. */
export type RuneSource = GgpkSource;

/**
 * Run the rune extraction against a source. The source is queried for
 * everything; no other I/O is performed (writing the result is the caller's
 * concern). A thin wrapper over {@link buildRunes}, mirroring the item and gem
 * extractors' `extract*` entry points.
 */
export async function extractRunes(source: RuneSource): Promise<RuneBundle> {
  const data = await buildRunes(source);

  return { data };
}
