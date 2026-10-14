/** Builds rune / soul-core data and icons from a {@link GgpkSource}. Source-agnostic: it downloads nothing itself. Mirrors the item and gem extractors' bundle shape. */

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

export interface RuneBundle {
  data: RuneData;
  /** Rune inventory icons plus the fixed socket UI textures (`ui/<name>.png`); the report counts are the sum of both. */
  icons: RuneIconsResult;
}

export type RuneSource = GgpkSource & GgpkImageSource;

/** The source is queried for everything; writing the result is the caller's concern. */
export async function extractRunes(source: RuneSource): Promise<RuneBundle> {
  const data = await buildRunes(source);
  const [runeIcons, socketIcons] = await Promise.all([
    buildRuneIcons(source, data),
    buildSocketIcons(source),
  ]);

  const icons: RuneIconsResult = {
    icons: { ...runeIcons.icons, ...socketIcons.icons },
    report: {
      packed: runeIcons.report.packed + socketIcons.report.packed,
      missing: runeIcons.report.missing + socketIcons.report.missing,
    },
  };

  return { data, icons };
}
