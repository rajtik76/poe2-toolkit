/** @poe2-toolkit/gem-extractor: builds gem data and icons from a {@link GgpkSource}. Source-agnostic: it downloads nothing itself. */

import type { GgpkImageSource, GgpkSource } from '@poe2-toolkit/ggpk';

import { buildGems } from './buildGems.js';
import type { GemData } from './buildGems.js';
import { buildGemIcons } from './buildIcons.js';
import type { GemIconsResult } from './buildIcons.js';

export { buildGems, gemStatRequirement, stripBbcode } from './buildGems.js';
export type {
  GemData, Gem, GemReq, GemLevel, GemRequirement, GemKind, GemColor,
  GemStatLine, GemLevelScaling, GemScaling,
} from './buildGems.js';

export { buildGemIcons } from './buildIcons.js';
export type { GemIconsResult, GemIconSource } from './buildIcons.js';

export interface GemBundle {
  data: GemData;
  icons: GemIconsResult;
}

export type GemSource = GgpkSource & GgpkImageSource;

/** The source is queried for everything; writing the result is the caller's concern. */
export async function extractGems(source: GemSource): Promise<GemBundle> {
  const data = await buildGems(source);
  const icons = await buildGemIcons(source, data);

  return { data, icons };
}
