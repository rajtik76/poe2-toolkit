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

/** Number of layer frames a flask icon sheet packs side by side. */
const FLASK_FRAMES = 3;

/**
 * Flask icons (bases and uniques) are not single art: GGG stores them as a
 * horizontal sheet of {@link FLASK_FRAMES} layers - the glass container with its
 * cap (frame 0), an intermediate frame, and the coloured liquid fill (frame 2) -
 * so the raw DDS is three bottles wide. The rendered flask is the fill composited
 * onto the container, which is what a build UI wants. Charms and every other item
 * are single-frame and untouched.
 */
function isFlaskSheet(ddsPath: string, img: RgbaImage): boolean {
  // Path picks flasks out from charms (which share the flask item classes); the
  // width>height guard skips anything already single-frame, so re-running on a
  // composited icon is a no-op.
  return ddsPath.toLowerCase().includes('/2ditems/flasks/') && img.width > img.height;
}

/** Copy the `index`-th of {@link FLASK_FRAMES} equal-width cells into its own image. */
function flaskFrame(img: RgbaImage, index: number): RgbaImage {
  const startX = Math.round((index * img.width) / FLASK_FRAMES);
  const endX = Math.round(((index + 1) * img.width) / FLASK_FRAMES);
  const width = endX - startX;
  const rgba = new Uint8Array(width * img.height * 4);

  for (let y = 0; y < img.height; y += 1) {
    const srcRow = (y * img.width + startX) * 4;
    rgba.set(img.rgba.subarray(srcRow, srcRow + width * 4), y * width * 4);
  }

  return { width, height: img.height, rgba };
}

/** Alpha-composite `top` over `base` (both same size); straight-alpha, premultiplied math. */
function composite(top: RgbaImage, base: RgbaImage): RgbaImage {
  const width = Math.min(top.width, base.width);
  const height = Math.min(top.height, base.height);
  const rgba = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const out = (y * width + x) * 4;
      const t = (y * top.width + x) * 4;
      const b = (y * base.width + x) * 4;
      const ta = top.rgba[t + 3]! / 255;
      const ba = base.rgba[b + 3]! / 255;
      const oa = ta + ba * (1 - ta);

      for (let c = 0; c < 3; c += 1) {
        rgba[out + c] = oa > 0 ? Math.round((top.rgba[t + c]! * ta + base.rgba[b + c]! * ba * (1 - ta)) / oa) : 0;
      }

      rgba[out + 3] = Math.round(oa * 255);
    }
  }

  return { width, height, rgba };
}

/**
 * Render a flask sheet to its final icon: the coloured fill (frame 2) composited
 * onto the glass-and-cap container (frame 0). Frame 0 alone is an empty bottle,
 * frame 2 alone is fill with no cap; overlaying the fill leaves the cap and glass
 * rim from the container showing, which matches the in-game item icon.
 */
function renderFlaskIcon(img: RgbaImage): RgbaImage {
  return composite(flaskFrame(img, FLASK_FRAMES - 1), flaskFrame(img, 0));
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

    const img = isFlaskSheet(ddsPath, decoded) ? renderFlaskIcon(decoded) : decoded;

    icons[toPngPath(ddsPath)] = encodePng(img.width, img.height, img.rgba);
  }

  return { icons, report: { packed: Object.keys(icons).length, missing } };
}
