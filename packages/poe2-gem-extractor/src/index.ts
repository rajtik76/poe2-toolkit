/**
 * @poe2-toolkit/gem-extractor - builds Path of Exile 2 gem data and icons from a
 * {@link GgpkSource}, in the flat shape a build front-end consumes.
 *
 * The package is source-agnostic: it never downloads anything itself. Pass any
 * `@poe2-toolkit/ggpk` source (the CDN-backed `createCdnSource`, or your own) and
 * it returns the gem data and decoded icon PNGs - plain data, ready to write
 * wherever you publish them.
 */

import type { GgpkImageSource, GgpkSource } from '@poe2-toolkit/ggpk';

import { buildGems } from './buildGems.js';
import type { GemData } from './buildGems.js';
import { buildGemIcons } from './buildIcons.js';
import type { GemIconsResult } from './buildIcons.js';

export { buildGems, gemStatRequirement, stripBbcode } from './buildGems.js';
export type { GemData, Gem, GemReq, GemLevel, GemRequirement, GemKind, GemColor } from './buildGems.js';

export { buildGemIcons } from './buildIcons.js';
export type { GemIconsResult } from './buildIcons.js';

/** Everything the extractor produces for one game version. */
export interface GemBundle {
  /** The gem data (gems + per-level requirement curves). */
  data: GemData;
  /** Decoded icon PNGs plus a report of what packed or was skipped. */
  icons: GemIconsResult;
}

/** A source that can serve both tables and images (data + icons). */
export type GemSource = GgpkSource & GgpkImageSource;

/**
 * Run the full gem extraction against a source: data and icons in one pass. The
 * source is queried for everything; no other I/O is performed (writing the
 * result is the caller's concern).
 */
export async function extractGems(source: GemSource): Promise<GemBundle> {
  const data = await buildGems(source);
  const icons = await buildGemIcons(source, data);

  return { data, icons };
}
