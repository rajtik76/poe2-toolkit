/**
 * Decodes the item icons referenced by {@link ItemData} into PNGs, keyed by
 * their output path (the GGPK DDS path with a `.png` extension). One PNG per
 * distinct icon. Source: GGPK only.
 *
 * Unlike the legacy script this has no vendored fallback: an icon the source
 * cannot serve is skipped and reported, never pulled from a bundled asset.
 */

import { encodePng } from '@poe2-toolkit/ggpk';
import type { GgpkImageSource, RgbaImage } from '@poe2-toolkit/ggpk';

import type { ItemData } from './buildItems.js';

/** The only capability the icon build needs: decode a DDS by its GGPK path. */
type DdsSource = Pick<GgpkImageSource, 'dds'>;

/** Number of fill-state frames a flask icon sheet packs side by side. */
const FLASK_FRAMES = 3;

/**
 * Flask icons (bases and uniques) are not single art: GGG stores them as a
 * horizontal sheet of {@link FLASK_FRAMES} fill states (empty, partial, full),
 * so the raw DDS is three bottles wide. The game renders only the full frame,
 * the rightmost one, so that is what a build UI wants. Charms and every other
 * item are single-frame and untouched.
 */
function isFlaskSheet(ddsPath: string, img: RgbaImage): boolean {
  // Path picks flasks out from charms (which share the flask item classes); the
  // width>height guard skips anything already single-frame, so re-running on a
  // cropped icon is a no-op.
  return ddsPath.toLowerCase().includes('/2ditems/flasks/') && img.width > img.height;
}

/**
 * Return the rightmost (full) flask frame as a standalone image. The sheet is
 * {@link FLASK_FRAMES} equal cells wide; the full frame is the last cell, so it
 * spans the last `round(width / FLASK_FRAMES)` columns of every row.
 */
function cropFullFlaskFrame(img: RgbaImage): RgbaImage {
  const frameWidth = Math.round(img.width / FLASK_FRAMES);
  const startX = img.width - frameWidth;
  const rgba = new Uint8Array(frameWidth * img.height * 4);

  for (let y = 0; y < img.height; y += 1) {
    const srcRow = (y * img.width + startX) * 4;
    rgba.set(img.rgba.subarray(srcRow, srcRow + frameWidth * 4), y * frameWidth * 4);
  }

  return { width: frameWidth, height: img.height, rgba };
}

/** Decoded icons plus a count of what was packed or skipped. */
export interface ItemIconsResult {
  /** PNG bytes keyed by output path (`<dds path without extension>.png`). */
  icons: Record<string, Buffer>;
  report: { packed: number; missing: number };
}

/** Replace a trailing `.dds` (any case) with `.png`. */
function toPngPath(ddsPath: string): string {
  return `${ddsPath.slice(0, -4)}.png`;
}

/**
 * Decode every distinct item icon in `data` from the {@link GgpkImageSource}.
 * The source is responsible for path casing; the returned keys keep the original case.
 */
export async function buildItemIcons(source: DdsSource, data: ItemData): Promise<ItemIconsResult> {
  const ddsPaths = new Set<string>();

  for (const item of Object.values(data)) {
    if (item.icon && item.icon.toLowerCase().endsWith('.dds')) {
      ddsPaths.add(item.icon);
    }
  }

  const icons: Record<string, Buffer> = {};
  let missing = 0;

  for (const ddsPath of ddsPaths) {
    const decoded = await source.dds(ddsPath);

    if (!decoded) {
      missing += 1;
      continue;
    }

    const img = isFlaskSheet(ddsPath, decoded) ? cropFullFlaskFrame(decoded) : decoded;

    icons[toPngPath(ddsPath)] = encodePng(img.width, img.height, img.rgba);
  }

  return { icons, report: { packed: Object.keys(icons).length, missing } };
}
