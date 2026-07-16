/**
 * Decodes the gem icons and hover-art backgrounds referenced by {@link GemData}
 * into PNGs, keyed by their output path (the GGPK DDS path with a `.png`
 * extension). One PNG per distinct path. Source: GGPK only.
 *
 * Unlike the legacy script this has no vendored fallback: an icon the source
 * cannot serve is skipped and reported, never pulled from a bundled asset.
 */

import { decodeDdsIcons } from '@poe2-toolkit/ggpk';
import type { DdsIconsResult, DdsSource } from '@poe2-toolkit/ggpk';

import type { GemData } from './buildGems.js';

/** Decoded icons plus a count of what was packed or skipped. */
export type GemIconsResult = DdsIconsResult;

/**
 * Decode every distinct gem icon in `data` from the {@link DdsSource}. The
 * source is responsible for path casing; the returned keys keep the original case.
 */
export async function buildGemIcons(source: DdsSource, data: GemData): Promise<GemIconsResult> {
  const ddsPaths: string[] = [];

  for (const gem of Object.values(data.gems)) {
    if (gem.icon && gem.icon.toLowerCase().endsWith('.dds')) {
      ddsPaths.push(gem.icon);
    }

    if (gem.hoverImage && gem.hoverImage.toLowerCase().endsWith('.dds')) {
      ddsPaths.push(gem.hoverImage);
    }
  }

  return decodeDdsIcons(source, ddsPaths);
}
