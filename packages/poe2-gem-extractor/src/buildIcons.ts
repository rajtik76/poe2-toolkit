/**
 * Decodes the gem icons referenced by {@link GemData} into PNGs, keyed by their
 * output path (the GGPK DDS path with a `.png` extension). One PNG per distinct
 * icon. Source: GGPK only.
 *
 * Unlike the legacy script this has no vendored fallback: an icon the source
 * cannot serve is skipped and reported, never pulled from a bundled asset.
 */

import { encodePng } from '@poe2-toolkit/ggpk';
import type { GgpkImageSource } from '@poe2-toolkit/ggpk';

import type { GemData } from './buildGems.js';

/** The only capability the icon build needs: decode a DDS by its GGPK path. */
type DdsSource = Pick<GgpkImageSource, 'dds'>;

/** Decoded icons plus a count of what was packed or skipped. */
export interface GemIconsResult {
  /** PNG bytes keyed by output path (`<dds path without extension>.png`). */
  icons: Record<string, Buffer>;
  report: { packed: number; missing: number };
}

/** Replace a trailing `.dds` (any case) with `.png`. */
function toPngPath(ddsPath: string): string {
  return `${ddsPath.slice(0, -4)}.png`;
}

/**
 * Decode every distinct gem icon in `data` from the {@link GgpkImageSource}. The
 * source is responsible for path casing; the returned keys keep the original case.
 */
export async function buildGemIcons(source: DdsSource, data: GemData): Promise<GemIconsResult> {
  const ddsPaths = new Set<string>();

  for (const gem of Object.values(data.gems)) {
    if (gem.icon && gem.icon.toLowerCase().endsWith('.dds')) {
      ddsPaths.add(gem.icon);
    }
  }

  const icons: Record<string, Buffer> = {};
  let missing = 0;

  for (const ddsPath of ddsPaths) {
    const img = await source.dds(ddsPath);

    if (!img) {
      missing += 1;
      continue;
    }

    icons[toPngPath(ddsPath)] = encodePng(img.width, img.height, img.rgba);
  }

  return { icons, report: { packed: Object.keys(icons).length, missing } };
}
