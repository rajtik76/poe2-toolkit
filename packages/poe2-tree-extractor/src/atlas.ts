/** Shelf bin-packer: composites sprites into one sheet and emits the frame-map the renderer reads. */

import { encodePng } from '@poe2-toolkit/ggpk';

export interface AtlasSprite {
  key: string;
  width: number;
  height: number;
  rgba: Uint8Array;
}

export interface AtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
}

export interface PackedAtlas {
  png: Buffer;
  frames: Record<string, AtlasFrame>;
}

/** Transparent gutter so neighbours never bleed under bilinear sampling. */
const PAD = 1;

export function packAtlas(sprites: AtlasSprite[], maxWidth = 2048): PackedAtlas {
  // Tallest-first keeps rows tight and the sheet near-square.
  const sorted = [...sprites].sort((a, b) => b.height - a.height);

  let x = 0, y = 0, shelfHeight = 0, sheetWidth = 0;
  const placed: { sprite: AtlasSprite; x: number; y: number }[] = [];

  for (const sprite of sorted) {
    if (x + sprite.width + PAD > maxWidth && x > 0) {
      x = 0;
      y += shelfHeight + PAD;
      shelfHeight = 0;
    }

    placed.push({ sprite, x, y });
    x += sprite.width + PAD;
    shelfHeight = Math.max(shelfHeight, sprite.height);
    sheetWidth = Math.max(sheetWidth, x);
  }

  const sheetHeight = y + shelfHeight;

  const sheet = new Uint8Array(sheetWidth * sheetHeight * 4);
  const frames: Record<string, AtlasFrame> = {};

  for (const { sprite, x: sx, y: sy } of placed) {
    for (let row = 0; row < sprite.height; row++) {
      const src = row * sprite.width * 4;
      const dst = ((sy + row) * sheetWidth + sx) * 4;
      sheet.set(sprite.rgba.subarray(src, src + sprite.width * 4), dst);
    }

    frames[sprite.key] = { frame: { x: sx, y: sy, w: sprite.width, h: sprite.height } };
  }

  return { png: encodePng(sheetWidth, sheetHeight, sheet), frames };
}
