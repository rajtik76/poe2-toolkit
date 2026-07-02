/**
 * @poe2-toolkit/rune-extractor - builds Path of Exile 2 rune / soul-core data and
 * icons from a {@link GgpkSource}, in the flat shape a build front-end consumes.
 *
 * The package is source-agnostic: it never downloads anything itself. Pass any
 * `@poe2-toolkit/ggpk` source (the CDN-backed `createCdnSource`, or your own) and
 * it returns the rune data and decoded icon PNGs - plain data, ready to write
 * wherever you publish it. Mirrors the item and gem extractors' bundle shape.
 */

import type { GgpkImageSource, GgpkSource } from '@poe2-toolkit/ggpk';

import { buildRuneIcons } from './buildIcons.js';
import type { RuneIconsResult } from './buildIcons.js';
import { buildRunes } from './buildRunes.js';
import type { RuneData } from './buildRunes.js';
import { buildSocketIcons } from './buildSockets.js';

export { buildRunes } from './buildRunes.js';
export type { RuneData, Rune } from './buildRunes.js';

export { buildRuneIcons } from './buildIcons.js';
export type { RuneIconsResult } from './buildIcons.js';

export { buildSocketIcons } from './buildSockets.js';
export type { SocketIconsResult } from './buildSockets.js';

/** Everything the rune extractor produces for one game version. */
export interface RuneBundle {
  /** The rune data (runes keyed by display name). */
  data: RuneData;
  /**
   * Decoded icon PNGs plus a report of what packed or was skipped. Covers both
   * the per-rune inventory icons (keyed by their GGPK-derived `.png` path) and
   * the fixed item-socket UI textures (keyed by stable `ui/<name>.png` paths);
   * the report counts are the sum of both.
   */
  icons: RuneIconsResult;
}

/** A source that can serve both tables and images (data + icons). */
export type RuneSource = GgpkSource & GgpkImageSource;

/**
 * Run the full rune extraction against a source: data and icons in one pass. The
 * source is queried for everything; no other I/O is performed (writing the
 * result is the caller's concern).
 */
export async function extractRunes(source: RuneSource): Promise<RuneBundle> {
  const data = await buildRunes(source);
  const runeIcons = await buildRuneIcons(source, data);
  const socketIcons = await buildSocketIcons(source);

  const icons: RuneIconsResult = {
    icons: { ...runeIcons.icons, ...socketIcons.icons },
    report: {
      packed: runeIcons.report.packed + socketIcons.report.packed,
      missing: runeIcons.report.missing + socketIcons.report.missing,
    },
  };

  return { data, icons };
}
