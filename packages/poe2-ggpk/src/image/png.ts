/**
 * Minimal PNG encode/decode on Node's zlib — no native dependencies. Encoding
 * emits 8-bit RGBA with filter-none rows; decoding handles 8-bit RGBA or RGB,
 * no interlace. Enough for GGPK art round-trips and atlas output.
 */

import { deflateSync, inflateSync } from 'node:zlib';

import type { RgbaImage } from './types.js';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);

  for (let n = 0; n < 256; n++) {
    let c = n;

    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }

    t[n] = c >>> 0;
  }

  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;

  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  }

  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Encode RGBA8 to a PNG buffer (Node zlib, no deps).
 *
 * @param width - Image width in pixels.
 * @param height - Image height in pixels.
 * @param rgba - Row-major RGBA8 pixels, length `width * height * 4`.
 * @returns The encoded PNG bytes.
 */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  const idat = deflateSync(raw, { level: 9 });

  const chunk = (type: string, data: Buffer): Buffer => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)) >>> 0, 8 + data.length);

    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit
  ihdr[9] = 6; // RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Decode a PNG buffer (8-bit RGBA or RGB, no interlace) to RGBA8.
 *
 * @param buf - Raw PNG file bytes.
 * @returns The decoded {@link RgbaImage}.
 */
export function decodePng(buf: Uint8Array): RgbaImage {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 8; // skip signature
  let width = 0, height = 0, colorType = 0;
  const idat: Uint8Array[] = [];

  while (o < buf.length) {
    const len = dv.getUint32(o, false);
    const type = String.fromCharCode(buf[o + 4]!, buf[o + 5]!, buf[o + 6]!, buf[o + 7]!);
    const data = buf.subarray(o + 8, o + 8 + len);

    if (type === 'IHDR') {
      width = dv.getUint32(o + 8, false);
      height = dv.getUint32(o + 12, false);
      colorType = buf[o + 17]!;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }

    o += 12 + len;
  }

  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rgba = new Uint8Array(width * height * 4);
  const line = new Uint8Array(stride);
  const prev = new Uint8Array(stride);
  let p = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[p++]!;

    for (let i = 0; i < stride; i++) {
      const x = raw[p + i]!;
      const a = i >= channels ? line[i - channels]! : 0;
      const b = prev[i]!;
      const c = i >= channels ? prev[i - channels]! : 0;
      let v: number;

      switch (filter) {
        case 1:
          v = x + a;
          break;
        case 2:
          v = x + b;
          break;
        case 3:
          v = x + ((a + b) >> 1);
          break;
        case 4: {
          const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          v = x;
      }

      line[i] = v & 0xff;
    }

    p += stride;

    for (let x = 0; x < width; x++) {
      const di = (y * width + x) * 4, si = x * channels;
      rgba[di] = line[si]!;
      rgba[di + 1] = line[si + Math.min(1, channels - 1)]!;
      rgba[di + 2] = line[si + Math.min(2, channels - 1)]!;
      rgba[di + 3] = channels === 4 ? line[si + 3]! : 255;
    }

    line.forEach((value, i) => {
      prev[i] = value;
    });
  }

  return { width, height, rgba };
}
