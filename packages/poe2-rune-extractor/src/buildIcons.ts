/**
 * Decodes the rune icons referenced by {@link RuneData} into PNGs, keyed by their
 * output path (the GGPK DDS path with a `.png` extension). One PNG per distinct
 * icon. Source: GGPK only.
 *
 * A soul core is a base item, so its icon is the base's visual identity - the
 * same art the item extractor would decode. Keeping the icon build here lets the
 * rune extractor stand alone, mirroring the item and gem extractors.
 */

import { encodePng } from '@poe2-toolkit/ggpk';
import type { GgpkImageSource } from '@poe2-toolkit/ggpk';

import type { RuneData } from './buildRunes.js';

/** The only capability the icon build needs: decode a DDS by its GGPK path. */
type DdsSource = Pick<GgpkImageSource, 'dds'>;

/** Decoded icons plus a count of what was packed or skipped. */
export interface RuneIconsResult {
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

/**
 * Decode every distinct rune icon in `data` from the {@link GgpkImageSource}. The
 * source is responsible for path casing; the returned keys keep the original case.
 */
export async function buildRuneIcons(source: DdsSource, data: RuneData): Promise<RuneIconsResult> {
  const ddsPaths = new Set<string>();

  for (const rune of Object.values(data)) {
    if (rune.icon && rune.icon.toLowerCase().endsWith('.dds')) {
      ddsPaths.add(rune.icon);
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
