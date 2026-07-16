/**
 * Decodes the rune icons referenced by {@link RuneData} into PNGs, keyed by their
 * output path (the GGPK DDS path with a `.png` extension). One PNG per distinct
 * icon. Source: GGPK only.
 *
 * A soul core is a base item, so its icon is the base's visual identity - the
 * same art the item extractor would decode. Keeping the icon build here lets the
 * rune extractor stand alone, mirroring the item and gem extractors.
 */

import { decodeDdsIcons } from '@poe2-toolkit/ggpk';
import type { DdsIconsResult, DdsSource } from '@poe2-toolkit/ggpk';

import type { RuneData } from './buildRunes.js';

/** Decoded icons plus a count of what was packed or skipped. */
export type RuneIconsResult = DdsIconsResult;

/**
 * Decode every distinct rune icon in `data` from the {@link DdsSource}. The
 * source is responsible for path casing; the returned keys keep the original case.
 */
export async function buildRuneIcons(source: DdsSource, data: RuneData): Promise<RuneIconsResult> {
  const ddsPaths: string[] = [];

  for (const rune of Object.values(data)) {
    if (rune.icon && rune.icon.toLowerCase().endsWith('.dds')) {
      ddsPaths.push(rune.icon);
    }
  }

  return decodeDdsIcons(source, ddsPaths);
}
