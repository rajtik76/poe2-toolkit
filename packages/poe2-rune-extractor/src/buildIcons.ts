/** Decodes the rune icons referenced by {@link RuneData} to PNGs keyed by their DDS path with a `.png` extension. A soul core's icon is its base's visual identity. */

import { decodeDdsIcons } from '@poe2-toolkit/ggpk';
import type { DdsIconsResult, DdsSource } from '@poe2-toolkit/ggpk';

import type { RuneData } from './buildRunes.js';

export type RuneIconsResult = DdsIconsResult;

/** The source is responsible for path casing; keys keep the original case. */
export async function buildRuneIcons(source: DdsSource, data: RuneData): Promise<RuneIconsResult> {
  const ddsPaths: string[] = [];

  for (const rune of Object.values(data)) {
    if (rune.icon && rune.icon.toLowerCase().endsWith('.dds')) {
      ddsPaths.push(rune.icon);
    }
  }

  return decodeDdsIcons(source, ddsPaths);
}
