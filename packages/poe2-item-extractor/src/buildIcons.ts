/** Decodes the icons referenced by {@link ItemData} to PNGs keyed by their DDS path with a `.png` extension. No vendored fallback: an unservable icon is skipped and reported. */

import { decodeDdsIcons } from '@poe2-toolkit/ggpk';
import type { DdsIconsResult, DdsSource, RgbaImage } from '@poe2-toolkit/ggpk';

import type { ItemData } from './buildItems.js';

/** Number of layer frames a flask icon sheet packs side by side. */
const FLASK_FRAMES = 3;

/** Flask icons are a horizontal sheet of {@link FLASK_FRAMES} layers (container + cap, intermediate, liquid fill); the flask is the fill composited onto the container. Charms and other items are single-frame. */
function isFlaskSheet(ddsPath: string, img: RgbaImage): boolean {
  // Path separates flasks from charms; the width>height guard makes re-running on a composited icon a no-op.
  return ddsPath.toLowerCase().includes('/2ditems/flasks/') && img.width > img.height;
}

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

/** Fill (frame 2) over the glass-and-cap container (frame 0), matching the in-game icon. */
function renderFlaskIcon(img: RgbaImage): RgbaImage {
  return composite(flaskFrame(img, FLASK_FRAMES - 1), flaskFrame(img, 0));
}

export type ItemIconsResult = DdsIconsResult;

/** Flask sheets are composited to their final icon (see {@link isFlaskSheet}). */
export async function buildItemIcons(source: DdsSource, data: ItemData): Promise<ItemIconsResult> {
  const ddsPaths: string[] = [];

  for (const item of Object.values(data)) {
    if (item.icon && item.icon.toLowerCase().endsWith('.dds')) {
      ddsPaths.push(item.icon);
    }
  }

  return decodeDdsIcons(source, ddsPaths, (img, ddsPath) => (isFlaskSheet(ddsPath, img) ? renderFlaskIcon(img) : img));
}
