/**
 * Behavioural coverage for the PSG parser on hand-built binary graphs, so the
 * format handling is exercised without the real (git-ignored) `.psg`. The gated
 * test in `psg.test.ts` proves parity with the legacy parser on the real file;
 * this one pins down the layout: header, roots, groups, nodes, connection orbit
 * words and the strict end-of-buffer check.
 */

import { describe, expect, it } from 'vitest';

import { parsePsg } from '../../src/psg';

/** Little-endian byte writer mirroring the documented `.psg` layout. */
class PsgWriter {
  private readonly bytes: number[] = [];

  u8(v: number): this {
    this.bytes.push(v & 0xff);

    return this;
  }

  u32(v: number): this {
    this.bytes.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);

    return this;
  }

  i32(v: number): this {
    return this.u32(v >>> 0);
  }

  f32(v: number): this {
    const scratch = new DataView(new ArrayBuffer(4));
    scratch.setFloat32(0, v, true);

    for (let i = 0; i < 4; i++) {
      this.bytes.push(scratch.getUint8(i));
    }

    return this;
  }

  build(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/**
 * A two-group graph: group 0 holds two connected nodes on orbit rings, group 1
 * is an empty proxy anchor. Node 100 arcs to 200 along ring 3; node 200 points
 * back with a straight-line sentinel edge.
 */
function sampleGraph(): PsgWriter {
  const w = new PsgWriter();
  w.u8(3).u8(1); // version, graphType
  w.u8(3).u8(1).u8(6).u8(12); // 3 orbit rings: 1, 6, 12 slots
  w.u32(1).u32(500).u32(7); // one root: id 500, curvature 7
  w.u32(2); // two groups

  // Group 0: anchor at (10.5, -20.25), two passives.
  w.f32(10.5).f32(-20.25).u32(0).u32(0).u8(0).u32(2);
  w.u32(100).u32(1).u32(0).u32(1); // node 100, orbit 1, index 0, 1 edge
  w.u32(200).i32(-3); // -> 200, arc on ring 3, negative sweep
  w.u32(200).u32(2).u32(5).u32(1); // node 200, orbit 2, index 5, 1 edge
  w.u32(100).i32(2147483647); // -> 100, straight-line sentinel

  // Group 1: proxy anchor with no passives.
  w.f32(0).f32(0).u32(4).u32(9).u8(1).u32(0);

  return w;
}

describe('parsePsg', () => {
  const psg = parsePsg(sampleGraph().build());

  it('reads the header and per-orbit slot counts', () => {
    expect(psg.version).toBe(3);
    expect(psg.graphType).toBe(1);
    expect(psg.passivesPerOrbit).toEqual([1, 6, 12]);
  });

  it('reads roots with their raw curvature word', () => {
    expect(psg.roots).toEqual([{ id: 500, curvature: 7 }]);
  });

  it('flattens nodes across groups with geometry and back-references', () => {
    expect(psg.nodes).toHaveLength(2);
    expect(psg.nodes[0]).toMatchObject({ skillId: 100, group: 0, orbit: 1, orbitIndex: 0 });
    expect(psg.nodes[1]).toMatchObject({ skillId: 200, group: 0, orbit: 2, orbitIndex: 5 });
    expect(psg.groups[0]!.nodes).toEqual([100, 200]);
  });

  it('keeps connection orbit words verbatim, sign and sentinel included', () => {
    expect(psg.nodes[0]!.connections).toEqual([{ id: 200, orbit: -3 }]);
    expect(psg.nodes[1]!.connections).toEqual([{ id: 100, orbit: 2147483647 }]);
  });

  it('reads group anchors, flags and the proxy marker', () => {
    expect(psg.groups[0]).toMatchObject({ x: 10.5, y: -20.25, isProxy: false, flag: 0, unknown1: 0 });
    expect(psg.groups[1]).toMatchObject({ isProxy: true, flag: 4, unknown1: 9, nodes: [] });
  });

  it('rejects an implausible root count (corrupt or misaligned file)', () => {
    const w = new PsgWriter();
    w.u8(3).u8(1).u8(0); // header, zero orbits
    w.u32(1001); // root_length over the sanity cap

    expect(() => parsePsg(w.build())).toThrow('unrealistic root_length');
  });

  it('rejects trailing bytes the layout does not account for', () => {
    const bytes = sampleGraph().u8(0xee).build();

    expect(() => parsePsg(bytes)).toThrow('bytes consumed');
  });
});
