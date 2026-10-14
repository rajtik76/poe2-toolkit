/**
 * Sprite-name counterpart to {@link decodeDdsIcons}: decodes UIImages names (no extension) to PNG. A column can move between
 * a DDS path and a sprite name across patches; going through the index keeps the rect, so the PNG holds what the client draws.
 */

import type { GgpkImageSource } from './cdnSource.js';
import type { DdsIconsResult } from './decodeDdsIcons.js';
import { encodePng } from './image/png.js';
import { mapConcurrent } from './mapConcurrent.js';

export type SpriteSource = Pick<GgpkImageSource, 'uiSprite'>;

const DEFAULT_CONCURRENCY = 16;

/**
 * Keyed by `<name>.png`, not the backing sheet's path: several names share one sheet at different rects. Unresolvable names
 * are skipped and counted in `report.missing`; duplicates decode once.
 */
export async function decodeSpriteIcons(
  source: SpriteSource,
  spriteNames: Iterable<string>,
  concurrency = DEFAULT_CONCURRENCY,
): Promise<DdsIconsResult> {
  const icons: Record<string, Buffer> = {};
  let missing = 0;

  const names = [...new Set(spriteNames)];

  await mapConcurrent(names, concurrency, async (name) => {
    const img = await source.uiSprite(name);

    if (!img) {
      missing += 1;

      return;
    }

    icons[`${name}.png`] = encodePng(img.width, img.height, img.rgba);
  });

  return { icons, report: { packed: Object.keys(icons).length, missing } };
}
