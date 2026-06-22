/**
 * BC7 (BPTC) block decoder to RGBA8. PoE2 UI art — node frames and mastery
 * patterns — ships as DX10/BC7. Implements all eight modes per the D3D11 BC7
 * specification.
 */

 
const PARTITIONS2: readonly (readonly number[])[] = [
  [0,0,1,1,0,0,1,1,0,0,1,1,0,0,1,1],[0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1],[0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1],[0,0,0,1,0,0,1,1,0,0,1,1,0,1,1,1],
  [0,0,0,0,0,0,0,1,0,0,0,1,0,0,1,1],[0,0,1,1,0,1,1,1,0,1,1,1,1,1,1,1],[0,0,0,1,0,0,1,1,0,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,1,0,0,1,1,0,1,1,1],
  [0,0,0,0,0,0,0,0,0,0,0,1,0,0,1,1],[0,0,1,1,0,1,1,1,1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,1,0,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,0,0,0,1,0,1,1,1],
  [0,0,0,1,0,1,1,1,1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1],[0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1],
  [0,0,0,0,1,0,0,0,1,1,1,0,1,1,1,1],[0,1,1,1,0,0,0,1,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,1,0,0,0,1,1,1,0],[0,1,1,1,0,0,1,1,0,0,0,1,0,0,0,0],
  [0,0,1,1,0,0,0,1,0,0,0,0,0,0,0,0],[0,0,0,0,1,0,0,0,1,1,0,0,1,1,1,0],[0,0,0,0,0,0,0,0,1,0,0,0,1,1,0,0],[0,1,1,1,0,0,1,1,0,0,1,1,0,0,0,1],
  [0,0,1,1,0,0,0,1,0,0,0,1,0,0,0,0],[0,0,0,0,1,0,0,0,1,0,0,0,1,1,0,0],[0,1,1,0,0,1,1,0,0,1,1,0,0,1,1,0],[0,0,1,1,0,1,1,0,0,1,1,0,1,1,0,0],
  [0,0,0,1,0,1,1,1,1,1,1,0,1,0,0,0],[0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0],[0,1,1,1,0,0,0,1,1,0,0,0,1,1,1,0],[0,0,1,1,1,0,0,1,1,0,0,1,1,1,0,0],
  [0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1],[0,0,0,0,1,1,1,1,0,0,0,0,1,1,1,1],[0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0],[0,0,1,1,0,0,1,1,1,1,0,0,1,1,0,0],
  [0,0,1,1,1,1,0,0,0,0,1,1,1,1,0,0],[0,1,0,1,0,1,0,1,1,0,1,0,1,0,1,0],[0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1],[0,1,0,1,1,0,1,0,1,0,1,0,0,1,0,1],
  [0,1,1,1,0,0,1,1,1,1,0,0,1,1,1,0],[0,0,0,1,0,0,1,1,1,1,0,0,1,0,0,0],[0,0,1,1,0,0,1,0,0,1,0,0,1,1,0,0],[0,0,1,1,1,0,1,1,1,1,0,1,1,1,0,0],
  [0,1,1,0,1,0,0,1,1,0,0,1,0,1,1,0],[0,0,1,1,1,1,0,0,1,1,0,0,0,0,1,1],[0,1,1,0,0,1,1,0,1,0,0,1,1,0,0,1],[0,0,0,0,0,1,1,0,0,1,1,0,0,0,0,0],
  [0,1,0,0,1,1,1,0,0,1,0,0,0,0,0,0],[0,0,1,0,0,1,1,1,0,0,1,0,0,0,0,0],[0,0,0,0,0,0,1,0,0,1,1,1,0,0,1,0],[0,0,0,0,0,1,0,0,1,1,1,0,0,1,0,0],
  [0,1,1,0,1,1,0,0,1,0,0,1,0,0,1,1],[0,0,1,1,0,1,1,0,1,1,0,0,1,0,0,1],[0,1,1,0,0,0,1,1,1,0,0,1,1,1,0,0],[0,0,1,1,1,0,0,1,1,1,0,0,0,1,1,0],
  [0,1,1,0,1,1,0,0,1,1,0,0,1,0,0,1],[0,1,1,0,0,0,1,1,0,0,1,1,1,0,0,1],[0,1,1,1,1,1,1,0,1,0,0,0,0,0,0,1],[0,0,0,1,1,0,0,0,1,1,1,0,0,1,1,1],
  [0,0,0,0,1,1,1,1,0,0,1,1,0,0,1,1],[0,0,1,1,0,0,1,1,1,1,1,1,0,0,0,0],[0,0,1,0,0,0,1,0,1,1,1,0,1,1,1,0],[0,1,0,0,0,1,0,0,0,1,1,1,0,1,1,1],
];

const PARTITIONS3: readonly (readonly number[])[] = [
  [0,0,1,1,0,0,1,1,0,2,2,1,2,2,2,2],[0,0,0,1,0,0,1,1,2,2,1,1,2,2,2,1],[0,0,0,0,2,0,0,1,2,2,1,1,2,2,1,1],[0,2,2,2,0,0,2,2,0,0,1,1,0,1,1,1],
  [0,0,0,0,0,0,0,0,1,1,2,2,1,1,2,2],[0,0,1,1,0,0,1,1,0,0,2,2,0,0,2,2],[0,0,2,2,0,0,2,2,1,1,1,1,1,1,1,1],[0,0,1,1,0,0,1,1,2,2,1,1,2,2,1,1],
  [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2],[0,0,0,0,1,1,1,1,1,1,1,1,2,2,2,2],[0,0,0,0,1,1,1,1,2,2,2,2,2,2,2,2],[0,0,1,2,0,0,1,2,0,0,1,2,0,0,1,2],
  [0,1,1,2,0,1,1,2,0,1,1,2,0,1,1,2],[0,1,2,2,0,1,2,2,0,1,2,2,0,1,2,2],[0,0,1,1,0,1,1,2,1,1,2,2,1,2,2,2],[0,0,1,1,2,0,0,1,2,2,0,0,2,2,2,0],
  [0,0,0,1,0,0,1,1,0,1,1,2,1,1,2,2],[0,1,1,1,0,0,1,1,2,0,0,1,2,2,0,0],[0,0,0,0,1,1,2,2,1,1,2,2,1,1,2,2],[0,0,2,2,0,0,2,2,0,0,2,2,1,1,1,1],
  [0,1,1,1,0,1,1,1,0,2,2,2,0,2,2,2],[0,0,0,1,0,0,0,1,2,2,2,1,2,2,2,1],[0,0,0,0,0,0,1,1,0,1,2,2,0,1,2,2],[0,0,0,0,1,1,0,0,2,2,1,0,2,2,1,0],
  [0,1,2,2,0,1,2,2,0,0,1,1,0,0,0,0],[0,0,1,2,0,0,1,2,1,1,2,2,2,2,2,2],[0,1,1,0,1,2,2,1,1,2,2,1,0,1,1,0],[0,0,0,0,0,1,1,0,1,2,2,1,1,2,2,1],
  [0,0,2,2,1,1,0,2,1,1,0,2,0,0,2,2],[0,1,1,0,0,1,1,0,2,0,0,2,2,2,2,2],[0,0,1,1,0,1,2,2,0,1,2,2,0,0,1,1],[0,0,0,0,2,0,0,0,2,2,1,1,2,2,2,1],
  [0,0,0,0,0,0,0,2,1,1,2,2,1,2,2,2],[0,2,2,2,0,0,2,2,0,0,1,2,0,0,1,1],[0,0,1,1,0,0,1,2,0,0,2,2,0,2,2,2],[0,1,2,0,0,1,2,0,0,1,2,0,0,1,2,0],
  [0,0,0,0,1,1,1,1,2,2,2,2,0,0,0,0],[0,1,2,0,1,2,0,1,2,0,1,2,0,1,2,0],[0,1,2,0,2,0,1,2,1,2,0,1,0,1,2,0],[0,0,1,1,2,2,0,0,1,1,2,2,0,0,1,1],
  [0,0,1,1,1,1,2,2,2,2,0,0,0,0,1,1],[0,1,0,1,0,1,0,1,2,2,2,2,2,2,2,2],[0,0,0,0,0,0,0,0,2,1,2,1,2,1,2,1],[0,0,2,2,1,1,2,2,0,0,2,2,1,1,2,2],
  [0,0,2,2,0,0,1,1,0,0,2,2,0,0,1,1],[0,2,2,0,1,2,2,1,0,2,2,0,1,2,2,1],[0,1,0,1,2,2,2,2,2,2,2,2,0,1,0,1],[0,0,0,0,2,1,2,1,2,1,2,1,2,1,2,1],
  [0,1,0,1,0,1,0,1,0,1,0,1,2,2,2,2],[0,2,2,2,0,1,1,1,0,2,2,2,0,1,1,1],[0,0,0,2,1,1,1,2,0,0,0,2,1,1,1,2],[0,0,0,0,2,1,1,2,2,1,1,2,2,1,1,2],
  [0,2,2,2,0,1,1,1,0,1,1,1,0,2,2,2],[0,0,0,2,1,1,1,2,1,1,1,2,0,0,0,2],[0,1,1,0,0,1,1,0,0,1,1,0,2,2,2,2],[0,0,0,0,0,0,0,0,2,1,1,2,2,1,1,2],
  [0,1,1,0,0,1,1,0,2,2,2,2,2,2,2,2],[0,0,2,2,0,0,1,1,0,0,1,1,0,0,2,2],[0,0,2,2,1,1,2,2,1,1,2,2,0,0,2,2],[0,0,0,0,0,0,0,0,0,0,0,0,2,1,1,2],
  [0,0,0,2,0,0,0,1,0,0,0,2,0,0,0,1],[0,2,2,2,1,2,2,2,0,2,2,2,1,2,2,2],[0,1,0,1,2,2,2,2,2,2,2,2,2,2,2,2],[0,1,1,1,2,0,1,1,2,2,0,1,2,2,2,0],
];

const ANCHOR2: readonly number[] = [15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,2,8,2,2,8,8,15,2,8,2,2,8,8,2,2,15,15,6,8,2,8,15,15,2,8,2,2,2,15,15,6,6,2,6,8,15,15,2,2,15,15,15,15,15,2,2,15];
const ANCHOR3A: readonly number[] = [3,3,15,15,8,3,15,15,8,8,6,6,6,5,3,3,3,3,8,15,3,3,6,10,5,8,8,6,8,5,15,15,8,15,3,5,6,10,8,15,15,3,15,5,15,15,15,15,3,15,5,5,5,8,5,10,5,10,8,13,15,12,3,3];
const ANCHOR3B: readonly number[] = [15,8,8,3,15,15,3,8,15,15,15,15,15,15,15,8,15,8,15,3,15,8,15,8,3,15,6,10,15,15,10,8,15,3,15,10,10,8,9,10,6,15,8,9,15,3,6,6,8,15,3,6,6,8,8,3,3,8,15,15,5,3,3,8];

const WEIGHTS2: readonly number[] = [0,21,43,64];
const WEIGHTS3: readonly number[] = [0,9,18,27,37,46,55,64];
const WEIGHTS4: readonly number[] = [0,4,9,13,17,21,26,30,34,38,43,47,51,55,60,64];

interface Bc7Mode {
  ns: number; pb: number; rb: number; isb: number; cb: number; ab: number; epb: number; spb: number; ib: number; ib2: number;
}

const MODES: readonly Bc7Mode[] = [
  { ns:3, pb:4, rb:0, isb:0, cb:4, ab:0, epb:1, spb:0, ib:3, ib2:0 },
  { ns:2, pb:6, rb:0, isb:0, cb:6, ab:0, epb:0, spb:1, ib:3, ib2:0 },
  { ns:3, pb:6, rb:0, isb:0, cb:5, ab:0, epb:0, spb:0, ib:2, ib2:0 },
  { ns:2, pb:6, rb:0, isb:0, cb:7, ab:0, epb:1, spb:0, ib:2, ib2:0 },
  { ns:1, pb:0, rb:2, isb:1, cb:5, ab:6, epb:0, spb:0, ib:2, ib2:3 },
  { ns:1, pb:0, rb:2, isb:0, cb:7, ab:8, epb:0, spb:0, ib:2, ib2:2 },
  { ns:1, pb:0, rb:0, isb:0, cb:7, ab:7, epb:1, spb:0, ib:4, ib2:0 },
  { ns:2, pb:6, rb:0, isb:0, cb:5, ab:5, epb:1, spb:0, ib:2, ib2:0 },
];
 

class BitReader {
  private bit: number;

  constructor(private readonly bytes: Uint8Array, offset: number) {
    this.bit = offset * 8;
  }

  read(n: number): number {
    let v = 0;

    for (let i = 0; i < n; i++) {
      const byte = this.bytes[this.bit >> 3]!;
      v |= ((byte >> (this.bit & 7)) & 1) << i;
      this.bit++;
    }

    return v >>> 0;
  }
}

/** Expand an n-bit value to 8 bits by bit-replication (n >= 4 for BC7). */
function expand(value: number, nbits: number): number {
  return ((value << (8 - nbits)) | (value >> (2 * nbits - 8))) & 0xff;
}

function weightFor(bits: number, index: number): number {
  return bits === 2 ? WEIGHTS2[index]! : bits === 3 ? WEIGHTS3[index]! : WEIGHTS4[index]!;
}

function interp(a: number, b: number, w: number): number {
  return (a * (64 - w) + b * w + 32) >> 6;
}

function readIndices(br: BitReader, bits: number, partTable: readonly number[] | null, anchors: number[]): number[] {
  const out = new Array<number>(16);

  for (let i = 0; i < 16; i++) {
    const subset = partTable ? partTable[i]! : 0;
    const isAnchor = anchors[subset] === i;
    out[i] = br.read(isAnchor ? bits - 1 : bits);
  }

  return out;
}

/** Decode one 16-byte BC7 block at `offset` into `rgba` at block (bx, by). */
export function decodeBc7Block(
  bytes: Uint8Array,
  offset: number,
  rgba: Uint8Array,
  width: number,
  height: number,
  bx: number,
  by: number,
): void {
  let mode = 0;

  while (mode < 8 && ((bytes[offset]! >> mode) & 1) === 0) {
    mode++;
  }

  if (mode === 8) {
    return; // invalid block -> leave transparent
  }

  const m = MODES[mode]!;
  const br = new BitReader(bytes, offset);
  br.read(mode + 1); // mode marker

  const partition = m.pb ? br.read(m.pb) : 0;
  const rotation = m.rb ? br.read(m.rb) : 0;
  const idxSel = m.isb ? br.read(m.isb) : 0;

  const ns = m.ns;
  const raw: number[][][] = []; // [subset][endpoint] = [r,g,b,a] raw (pre-expand)

  for (let s = 0; s < ns; s++) {
    raw.push([[0, 0, 0, 0], [0, 0, 0, 0]]);
  }

  for (let c = 0; c < 3; c++) {
    for (let s = 0; s < ns; s++) {
      for (let e = 0; e < 2; e++) {
        raw[s]![e]![c] = br.read(m.cb);
      }
    }
  }

  if (m.ab) {
    for (let s = 0; s < ns; s++) {
      for (let e = 0; e < 2; e++) {
        raw[s]![e]![3] = br.read(m.ab);
      }
    }
  }

  // p-bits per (subset, endpoint) or shared per subset.
  const pbit: number[][] = [];

  for (let s = 0; s < ns; s++) {
    pbit.push([0, 0]);
  }

  if (m.epb) {
    for (let s = 0; s < ns; s++) {
      for (let e = 0; e < 2; e++) {
        pbit[s]![e] = br.read(1);
      }
    }
  } else if (m.spb) {
    for (let s = 0; s < ns; s++) {
      const p = br.read(1);
      pbit[s]![0] = p;
      pbit[s]![1] = p;
    }
  }

  // Finalize endpoints to 8-bit.
  const ep: number[][][] = [];

  for (let s = 0; s < ns; s++) {
    ep.push([[0, 0, 0, 255], [0, 0, 0, 255]]);

    for (let e = 0; e < 2; e++) {
      for (let c = 0; c < 4; c++) {
        const bits = c === 3 ? m.ab : m.cb;

        if (bits === 0) {
          ep[s]![e]![c] = 255;
          continue;
        }

        let val = raw[s]![e]![c]!;
        let nb = bits;

        if (m.epb || m.spb) {
          val = (val << 1) | pbit[s]![e]!;
          nb += 1;
        }

        ep[s]![e]![c] = expand(val, nb);
      }
    }
  }

  const partTable = ns === 3 ? PARTITIONS3[partition]! : ns === 2 ? PARTITIONS2[partition]! : null;
  const anchors = ns === 1 ? [0] : ns === 2 ? [0, ANCHOR2[partition]!] : [0, ANCHOR3A[partition]!, ANCHOR3B[partition]!];
  const idx = readIndices(br, m.ib, partTable, anchors);
  const idx2 = m.ib2 ? readIndices(br, m.ib2, null, [0]) : null;

  // For modes 4/5 the index-selection bit can swap colour/alpha index roles.
  const colorBits = idxSel ? m.ib2 : m.ib;
  const alphaBits = idxSel ? m.ib : m.ib2;
  const colorIdx = idxSel ? idx2! : idx;
  const alphaIdx = idxSel ? idx : idx2;

  for (let i = 0; i < 16; i++) {
    const subset = partTable ? partTable[i]! : 0;
    const e0 = ep[subset]![0]!;
    const e1 = ep[subset]![1]!;
    const cw = weightFor(colorBits, colorIdx[i]!);
    const aw = idx2 ? weightFor(alphaBits, alphaIdx![i]!) : cw;
    let r = interp(e0[0]!, e1[0]!, cw);
    let g = interp(e0[1]!, e1[1]!, cw);
    let b = interp(e0[2]!, e1[2]!, cw);
    let a = m.ab ? interp(e0[3]!, e1[3]!, aw) : 255;

    if (rotation === 1) {
      [r, a] = [a, r];
    } else if (rotation === 2) {
      [g, a] = [a, g];
    } else if (rotation === 3) {
      [b, a] = [a, b];
    }

    const px = bx * 4 + (i & 3);
    const py = by * 4 + (i >> 2);

    if (px >= width || py >= height) {
      continue;
    }

    const di = (py * width + px) * 4;
    rgba[di] = r;
    rgba[di + 1] = g;
    rgba[di + 2] = b;
    rgba[di + 3] = a;
  }
}
