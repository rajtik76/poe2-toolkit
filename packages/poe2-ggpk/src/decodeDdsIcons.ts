/**
 * Shared "decode a set of distinct DDS paths to PNG, skip and report what the
 * source can't serve" loop. Every extractor that ships icons (item, gem, rune)
 * ran this same loop with only the source of paths (and, for item-extractor,
 * a post-decode transform for flask-sheet compositing) differing.
 */

import type { GgpkImageSource } from './cdnSource.js';
import { encodePng } from './image/png.js';
import type { RgbaImage } from './image/types.js';
import { mapConcurrent } from './mapConcurrent.js';

/** The only capability an icon build needs: decode a DDS by its GGPK path. */
export type DdsSource = Pick<GgpkImageSource, 'dds'>;

/** Decoded icons plus a count of what was packed or skipped. */
export interface DdsIconsResult {
  /** PNG bytes keyed by output path (`<dds path without extension>.png`). */
  icons: Record<string, Buffer>;
  /** How the decode went. */
  report: {
    /** Distinct icons decoded to PNG successfully. */
    packed: number;
    /** Distinct icons the source could not serve or decode (skipped, never substituted). */
    missing: number;
  };
}

/** Replace a trailing `.dds` (any case) with `.png`. */
function toPngPath(ddsPath: string): string {
  return `${ddsPath.slice(0, -4)}.png`;
}

/** Distinct DDS decodes to run concurrently (I/O-bound: network fetch + decode). */
const DEFAULT_CONCURRENCY = 16;

/**
 * Decode every distinct path in `ddsPaths` from `source`, encoding each to PNG.
 * A path the source cannot serve or decode is skipped and counted in
 * `report.missing`, never substituted from a vendored asset. Duplicate paths
 * decode once. `transform` runs on the decoded image before encoding (e.g.
 * item-extractor's flask-sheet compositing); it defaults to the identity.
 *
 * Up to `concurrency` paths decode in flight at once, since each decode is
 * dominated by an awaited I/O call rather than CPU work.
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
