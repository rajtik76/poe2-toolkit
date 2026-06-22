/**
 * In-process DDS decode (BC1/BC2/BC3/BC7) to straight RGBA8. No system
 * ImageMagick and no native dependencies, which keeps extraction portable in
 * CI. PoE2 tree art is DX10/BC1 (icons) with some BC3; UI art is BC7.
 */

import { decodeBc7Block } from './bc7.js';
import type { RgbaImage } from './types.js';

type BlockKind = 'bc1' | 'bc2' | 'bc3' | 'bc7';

const DXGI_BC1 = new Set([70, 71, 72]);
const DXGI_BC2 = new Set([73, 74, 75]);
const DXGI_BC3 = new Set([76, 77, 78]);
const DXGI_BC7 = new Set([97, 98, 99]);

/** Decode a DDS buffer to straight RGBA8. */
export function decodeDds(buf: Uint8Array): RgbaImage {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  if (dv.getUint32(0, true) !== 0x20534444) {
    throw new Error('not a DDS');
  }

  const height = dv.getUint32(12, true);
  const width = dv.getUint32(16, true);
  const fourCC = String.fromCharCode(buf[84]!, buf[85]!, buf[86]!, buf[87]!);

  let kind: BlockKind;
  let dataOffset: number;

  if (fourCC === 'DX10') {
    const dxgi = dv.getUint32(128, true);
    dataOffset = 148;

    if (DXGI_BC1.has(dxgi)) {
      kind = 'bc1';
    } else if (DXGI_BC2.has(dxgi)) {
      kind = 'bc2';
    } else if (DXGI_BC3.has(dxgi)) {
      kind = 'bc3';
    } else if (DXGI_BC7.has(dxgi)) {
      kind = 'bc7';
    } else {
      throw new Error(`unsupported DXGI format ${dxgi}`);
    }
  } else {
    dataOffset = 128;

    if (fourCC === 'DXT1') {
      kind = 'bc1';
    } else if (fourCC === 'DXT3') {
      kind = 'bc2';
    } else if (fourCC === 'DXT5') {
      kind = 'bc3';
    } else {
      throw new Error(`unsupported FourCC ${fourCC}`);
    }
  }

  const rgba = new Uint8Array(width * height * 4);
  const blocksX = Math.max(1, width >> 2);
  const blocksY = Math.max(1, height >> 2);
  let p = dataOffset;

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      if (kind === 'bc7') {
        decodeBc7Block(buf, p, rgba, width, height, bx, by);
        p += 16;
        continue;
      }

      let alpha: number[] | null = null;

      if (kind === 'bc2') {
        alpha = readBc2Alpha(buf, p);
        p += 8;
      } else if (kind === 'bc3') {
        alpha = readBc3Alpha(buf, p);
        p += 8;
      }

      const colors = readColorBlock(buf, p, kind === 'bc1');
      p += 8;
      blitBlock(rgba, width, height, bx, by, colors, alpha);
    }
  }

  return { width, height, rgba };
}

interface ColorBlock {
  pal: number[][];
  idx: number[];
}

/** Decode the 4-colour RGB565 + 2-bit index block (shared by BC1/2/3). */
function readColorBlock(buf: Uint8Array, o: number, isBc1: boolean): ColorBlock {
  const c0 = buf[o]! | (buf[o + 1]! << 8);
  const c1 = buf[o + 2]! | (buf[o + 3]! << 8);
  const r0 = ((c0 >> 11) & 0x1f) * 255 / 31, g0 = ((c0 >> 5) & 0x3f) * 255 / 63, b0 = (c0 & 0x1f) * 255 / 31;
  const r1 = ((c1 >> 11) & 0x1f) * 255 / 31, g1 = ((c1 >> 5) & 0x3f) * 255 / 63, b1 = (c1 & 0x1f) * 255 / 31;
  const pal = [[r0, g0, b0, 255], [r1, g1, b1, 255], [0, 0, 0, 255], [0, 0, 0, 255]];

  if (!isBc1 || c0 > c1) {
    pal[2] = [(2 * r0 + r1) / 3, (2 * g0 + g1) / 3, (2 * b0 + b1) / 3, 255];
    pal[3] = [(r0 + 2 * r1) / 3, (g0 + 2 * g1) / 3, (b0 + 2 * b1) / 3, 255];
  } else {
    pal[2] = [(r0 + r1) / 2, (g0 + g1) / 2, (b0 + b1) / 2, 255];
    pal[3] = [0, 0, 0, 0]; // BC1 1-bit transparency
  }

  const bits = buf[o + 4]! | (buf[o + 5]! << 8) | (buf[o + 6]! << 16) | (buf[o + 7]! << 24);
  const idx = new Array<number>(16);

  for (let i = 0; i < 16; i++) {
    idx[i] = (bits >> (i * 2)) & 0x3;
  }

  return { pal, idx };
}

/** BC2: 4-bit explicit alpha per texel. */
function readBc2Alpha(buf: Uint8Array, o: number): number[] {
  const a = new Array<number>(16);

  for (let i = 0; i < 8; i++) {
    a[i * 2] = (buf[o + i]! & 0x0f) * 17;
    a[i * 2 + 1] = (buf[o + i]! >> 4) * 17;
  }

  return a;
}

/** BC3: two alpha endpoints + 3-bit interpolated indices. */
function readBc3Alpha(buf: Uint8Array, o: number): number[] {
  const a0 = buf[o]!, a1 = buf[o + 1]!;
  const al = [a0, a1, 0, 0, 0, 0, 0, 0];

  if (a0 > a1) {
    for (let i = 1; i <= 6; i++) {
      al[i + 1] = ((7 - i) * a0 + i * a1) / 7;
    }
  } else {
    for (let i = 1; i <= 4; i++) {
      al[i + 1] = ((5 - i) * a0 + i * a1) / 5;
    }

    al[6] = 0;
    al[7] = 255;
  }

  let bits = 0n;

  for (let i = 0; i < 6; i++) {
    bits |= BigInt(buf[o + 2 + i]!) << BigInt(i * 8);
  }

  const out = new Array<number>(16);

  for (let i = 0; i < 16; i++) {
    out[i] = al[Number((bits >> BigInt(i * 3)) & 7n)]!;
  }

  return out;
}

function blitBlock(
  rgba: Uint8Array,
  width: number,
  height: number,
  bx: number,
  by: number,
  colors: ColorBlock,
  alpha: number[] | null,
): void {
  for (let ty = 0; ty < 4; ty++) {
    for (let tx = 0; tx < 4; tx++) {
      const px = bx * 4 + tx, py = by * 4 + ty;

      if (px >= width || py >= height) {
        continue;
      }

      const t = ty * 4 + tx;
      const c = colors.pal[colors.idx[t]!]!;
      const di = (py * width + px) * 4;
      rgba[di] = c[0]!;
      rgba[di + 1] = c[1]!;
      rgba[di + 2] = c[2]!;
      rgba[di + 3] = alpha ? alpha[t]! : c[3]!;
    }
  }
}
