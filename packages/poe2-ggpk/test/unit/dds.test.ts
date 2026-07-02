/**
 * Unit coverage for the uncompressed DX10 paths (item/rune icons are
 * R8G8B8A8_UNORM, dxgi 28/29; some UI art is B8G8R8A8, dxgi 87/88). These carry
 * no 4x4 blocks, so they exercise the straight-copy branch, not the BC decoders.
 */

import { describe, expect, it } from 'vitest';

import { decodeDds } from '../../src/image/dds';

/** Build a minimal DX10 DDS: 148-byte header + tightly packed 32-bit pixels. */
function makeDx10(width: number, height: number, dxgi: number, pixels: number[]): Uint8Array {
  const buf = new Uint8Array(148 + width * height * 4);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, 0x20534444, true); // 'DDS '
  dv.setUint32(12, height, true);
  dv.setUint32(16, width, true);
  buf.set([0x44, 0x58, 0x31, 0x30], 84); // 'DX10' fourCC
  dv.setUint32(128, dxgi, true);
  buf.set(pixels, 148);

  return buf;
}

describe('decodeDds uncompressed', () => {
  it('copies R8G8B8A8 (dxgi 28) straight to RGBA', () => {
    // 2x1: red opaque, green half-alpha.
    const px = [255, 0, 0, 255, 0, 255, 0, 128];
    const img = decodeDds(makeDx10(2, 1, 28, px));

    expect(img.width).toBe(2);
    expect(img.height).toBe(1);
    expect([...img.rgba]).toEqual(px);
  });

  it('swaps B8G8R8A8 (dxgi 87) into RGBA order', () => {
    // Source BGRA for red-opaque then green-half.
    const bgra = [0, 0, 255, 255, 0, 255, 0, 128];
    const img = decodeDds(makeDx10(2, 1, 87, bgra));

    expect([...img.rgba]).toEqual([255, 0, 0, 255, 0, 255, 0, 128]);
  });

  it('takes only the base mip when trailing mip data follows', () => {
    // 1x1 base pixel + extra trailing bytes (as real mipmapped icons carry).
    const buf = makeDx10(1, 1, 28, [10, 20, 30, 40]);
    const withMips = new Uint8Array(buf.byteLength + 64);
    withMips.set(buf);

    const img = decodeDds(withMips);
    expect(img.rgba.length).toBe(4);
    expect([...img.rgba]).toEqual([10, 20, 30, 40]);
  });

  it('throws on a truncated surface', () => {
    const buf = makeDx10(4, 4, 28, []).subarray(0, 148 + 8); // header + 2 px only
    expect(() => decodeDds(buf)).toThrow(/truncated/);
  });
});
