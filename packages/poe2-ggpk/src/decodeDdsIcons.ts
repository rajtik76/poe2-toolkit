/** Shared loop of the item, gem and rune extractors: decode distinct DDS paths to PNG, skip and report what the source can't serve. */

import type { GgpkImageSource } from './cdnSource.js';
import { encodePng } from './image/png.js';
import type { RgbaImage } from './image/types.js';
import { mapConcurrent } from './mapConcurrent.js';

export type DdsSource = Pick<GgpkImageSource, 'dds'>;

export interface DdsIconsResult {
  icons: Record<string, Buffer>;
  report: {
    packed: number;
    missing: number;
  };
}

function toPngPath(ddsPath: string): string {
  return `${ddsPath.slice(0, -4)}.png`;
}

const DEFAULT_CONCURRENCY = 16;

/**
 * Skips (and counts in `report.missing`) paths the source cannot serve or decode, never substituting a vendored asset.
 * Duplicates decode once. `transform` runs on the decoded image before encoding. Up to `concurrency` decodes run at once.
 */
export async function decodeDdsIcons(
  source: DdsSource,
  ddsPaths: Iterable<string>,
  transform?: (img: RgbaImage, ddsPath: string) => RgbaImage,
  concurrency = DEFAULT_CONCURRENCY,
): Promise<DdsIconsResult> {
  const icons: Record<string, Buffer> = {};
  let missing = 0;

  const paths = [...new Set(ddsPaths)];

  await mapConcurrent(paths, concurrency, async (ddsPath) => {
    const decoded = await source.dds(ddsPath);

    if (!decoded) {
      missing += 1;

      return;
    }

    const img = transform ? transform(decoded, ddsPath) : decoded;

    icons[toPngPath(ddsPath)] = encodePng(img.width, img.height, img.rgba);
  });

  return { icons, report: { packed: Object.keys(icons).length, missing } };
}
