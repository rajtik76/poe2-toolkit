/**
 * The sprite-name counterpart to {@link decodeDdsIcons}: decode a set of distinct
 * UIImages names (`Art/2DArt/UIImages/InGame/...`, no extension) to PNG.
 *
 * GGG's data references art both ways - a DDS path, or a UIImages name the sprite
 * index maps to a backing sheet and a rect - and a column can move from one form
 * to the other between patches. Going through the index keeps the rect, so the
 * PNG holds what the client draws rather than the whole sheet.
 */

import type { GgpkImageSource } from './cdnSource.js';
import type { DdsIconsResult } from './decodeDdsIcons.js';
import { encodePng } from './image/png.js';
import { mapConcurrent } from './mapConcurrent.js';

/** The only capability a sprite icon build needs: a UIImages name in, its cropped image out. */
export type SpriteSource = Pick<GgpkImageSource, 'uiSprite'>;

/** Distinct sprite decodes to run concurrently (I/O-bound: network fetch + decode). */
const DEFAULT_CONCURRENCY = 16;

/**
 * Decode every distinct name in `spriteNames` from `source`, encoding each to
 * PNG keyed by `<name>.png`. A name the source cannot resolve (absent from the
 * sprite index, or a backing sheet the source cannot serve) is skipped and
 * counted in `report.missing`, never substituted from a vendored asset.
 * Duplicate names decode once.
 *
 * Keys are the sprite name, not the backing sheet's path: several names can share
 * one sheet at different rects, and keying by sheet would drop all but one.
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
