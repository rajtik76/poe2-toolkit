/**
 * Unit coverage for the block-compressed decode paths (BC1/BC2/BC3) and the
 * header error handling, on hand-built DDS buffers. Endpoint colours are chosen
 * so every interpolated palette entry lands on an integer, keeping the expected
 * pixels exact. The BC7 mode decoder is covered by the gated 1:1 tests against
 * real class portraits; its block format is too wide to hand-craft usefully.
 */

import { describe, expect, it } from 'vitest';

import { decodeDds } from '../../src/image/dds';

/** Pure red and pure blue in RGB565: interpolations are integer thirds. */
const RED565 = 0xf800;
const BLUE565 = 0x001f;

/** Build a legacy-header DDS (fourCC at 84, data at 128) around raw block bytes. */
function makeLegacy(fourCC: string, width: number, height: number, blocks: number[]): Uint8Array {
  const buf = new Uint8Array(128 + blocks.length);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, 0x20534444, true); // 'DDS '
  dv.setUint32(12, height, true);
  dv.setUint32(16, width, true);
  buf.set([...fourCC].map((c) => c.charCodeAt(0)), 84);
  buf.set(blocks, 128);

  return buf;
}

/** Build a DX10-header DDS (dxgi at 128, data at 148) around raw block bytes. */
function makeDx10(dxgi: number, width: number, height: number, blocks: number[]): Uint8Array {
  const buf = new Uint8Array(148 + blocks.length);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, 0x20534444, true);
  dv.setUint32(12, height, true);
  dv.setUint32(16, width, true);
  buf.set([0x44, 0x58, 0x31, 0x30], 84); // 'DX10'
  dv.setUint32(128, dxgi, true);
  buf.set(blocks, 148);

  return buf;
}

/** One BC1 colour block: two RGB565 endpoints + 16 two-bit palette indices. */
function colorBlock(c0: number, c1: number, indices: number[]): number[] {
  let bits = 0;

  for (let i = 0; i < 16; i++) {
    bits |= (indices[i]! & 0x3) << (i * 2);
  }

  return [c0 & 0xff, c0 >> 8, c1 & 0xff, c1 >> 8, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >>> 24) & 0xff];
}

/** Read the RGBA quadruple of pixel (x, y). */
function px(img: { width: number; rgba: Uint8Array }, x: number, y: number): number[] {
  const o = (y * img.width + x) * 4;

  return [...img.rgba.subarray(o, o + 4)];
}

describe('decodeDds BC1', () => {
  it('decodes the four-colour palette with integer interpolation', () => {
    // c0 > c1 selects 4-colour mode; texels walk the whole palette.
    const indices = [0, 1, 2, 3, ...Array<number>(12).fill(0)];
    const img = decodeDds(makeLegacy('DXT1', 4, 4, colorBlock(RED565, BLUE565, indices)));

    expect(px(img, 0, 0)).toEqual([255, 0, 0, 255]); // endpoint 0
    expect(px(img, 1, 0)).toEqual([0, 0, 255, 255]); // endpoint 1
    expect(px(img, 2, 0)).toEqual([170, 0, 85, 255]); // 2/3 red
    expect(px(img, 3, 0)).toEqual([85, 0, 170, 255]); // 1/3 red
  });

  it('decodes punch-through alpha when c0 <= c1', () => {
    // Equal endpoints select 3-colour mode; index 3 is fully transparent.
    const indices = [0, 2, 3, 0, ...Array<number>(12).fill(0)];
    const img = decodeDds(makeLegacy('DXT1', 4, 4, colorBlock(RED565, RED565, indices)));

    expect(px(img, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(img, 1, 0)).toEqual([255, 0, 0, 255]); // average of equal endpoints
    expect(px(img, 2, 0)).toEqual([0, 0, 0, 0]); // punch-through
  });

  it('decodes via the DX10 header (dxgi 71) identically to DXT1', () => {
    const block = colorBlock(RED565, BLUE565, Array<number>(16).fill(1));
    const legacy = decodeDds(makeLegacy('DXT1', 4, 4, block));
    const dx10 = decodeDds(makeDx10(71, 4, 4, block));

    expect(dx10).toEqual(legacy);
  });

  it('clips block texels that fall outside a non-multiple-of-4 surface', () => {
    const img = decodeDds(makeLegacy('DXT1', 2, 2, colorBlock(RED565, RED565, Array<number>(16).fill(0))));

    expect(img.width).toBe(2);
    expect(img.height).toBe(2);
    expect(img.rgba).toHaveLength(2 * 2 * 4);
    expect(px(img, 1, 1)).toEqual([255, 0, 0, 255]);
  });
});

describe('decodeDds BC2', () => {
  it('applies the 4-bit explicit alpha, scaled by 17', () => {
    // Alpha nibbles 0x0 and 0xF for the first two texels, opaque elsewhere.
    const alpha = [0xf0, ...Array<number>(7).fill(0xff)];
    const block = [...alpha, ...colorBlock(RED565, RED565, Array<number>(16).fill(0))];
    const img = decodeDds(makeLegacy('DXT3', 4, 4, block));

    expect(px(img, 0, 0)).toEqual([255, 0, 0, 0]); // low nibble 0x0
    expect(px(img, 1, 0)).toEqual([255, 0, 0, 255]); // high nibble 0xF
  });
});

describe('decodeDds BC3', () => {
  /** BC3 alpha block: two endpoints + 16 three-bit indices packed over 6 bytes. */
  function bc3Alpha(a0: number, a1: number, indices: number[]): number[] {
    let bits = 0n;

    for (let i = 0; i < 16; i++) {
      bits |= BigInt(indices[i]! & 0x7) << BigInt(i * 3);
    }

    const bytes: number[] = [a0, a1];

    for (let i = 0; i < 6; i++) {
      bytes.push(Number((bits >> BigInt(i * 8)) & 0xffn));
    }

    return bytes;
  }

  it('interpolates eight alpha steps when a0 > a1', () => {
    // 224 divides by 7: the six interpolated steps are exact multiples of 32.
    const alpha = bc3Alpha(224, 0, [0, 1, 2, 7, ...Array<number>(12).fill(0)]);
    const block = [...alpha, ...colorBlock(RED565, RED565, Array<number>(16).fill(0))];
    const img = decodeDds(makeLegacy('DXT5', 4, 4, block));

    expect(px(img, 0, 0)[3]).toBe(224); // endpoint a0
    expect(px(img, 1, 0)[3]).toBe(0); // endpoint a1
    expect(px(img, 2, 0)[3]).toBe(192); // first interpolated step
    expect(px(img, 3, 0)[3]).toBe(32); // last interpolated step
  });

  it('uses the six-step mode with hard 0 and 255 when a0 <= a1', () => {
    const alpha = bc3Alpha(0, 100, [2, 6, 7, 0, ...Array<number>(12).fill(0)]);
    const block = [...alpha, ...colorBlock(RED565, RED565, Array<number>(16).fill(0))];
    const img = decodeDds(makeLegacy('DXT5', 4, 4, block));

    expect(px(img, 0, 0)[3]).toBe(20); // (4*0 + 1*100)/5
    expect(px(img, 1, 0)[3]).toBe(0); // hard transparent slot
    expect(px(img, 2, 0)[3]).toBe(255); // hard opaque slot
  });
});

describe('decodeDds errors', () => {
  it('rejects a buffer without the DDS magic', () => {
    expect(() => decodeDds(new Uint8Array(148))).toThrow('not a DDS');
  });

  it('rejects an unsupported legacy FourCC', () => {
    expect(() => decodeDds(makeLegacy('ABCD', 4, 4, Array<number>(8).fill(0)))).toThrow('unsupported FourCC');
  });

  it('rejects an unsupported DXGI format', () => {
    expect(() => decodeDds(makeDx10(999, 4, 4, Array<number>(8).fill(0)))).toThrow('unsupported DXGI format 999');
  });
});
