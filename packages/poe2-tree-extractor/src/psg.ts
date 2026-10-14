/** Parser for GGG's `metadata/passiveskillgraph.psg`: every node's geometry and outgoing edges. A node's `skillId` is the PassiveSkillGraphId (same as the tree's `skill`). Layout: `docs/reference/PSG_FORMAT.md`. */

export interface PsgConnection {
  id: number;
  /** Raw per-edge orbit word: magnitude = ring, sign = sweep; 0/sentinel = line. */
  orbit: number;
}

export interface PsgNode {
  skillId: number;
  group: number;
  orbit: number;
  orbitIndex: number;
  connections: PsgConnection[];
}

export interface PsgGroup {
  x: number;
  y: number;
  /** Proxy groups exist only to anchor geometry and hold no real passives. */
  isProxy: boolean;
  /** Raw group flag word (purpose not yet decoded; captured, not discarded). */
  flag: number;
  /** Second raw group word (purpose not yet decoded; captured, not discarded). */
  unknown1: number;
  nodes: number[];
}

export interface PsgRoot {
  id: number;
  /** Raw curvature word (purpose not yet decoded; captured, not discarded). */
  curvature: number;
}

export interface Psg {
  version: number;
  graphType: number;
  passivesPerOrbit: number[];
  roots: PsgRoot[];
  groups: PsgGroup[];
  nodes: PsgNode[];
}

/** @throws if the declared root length is implausible or the cursor does not land exactly on the end of the buffer (corrupt file). */
export function parsePsg(buf: Uint8Array): Psg {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 0;
  const u8 = (): number => buf[o++]!;
  const u32 = (): number => {
    const v = dv.getUint32(o, true);
    o += 4;

    return v;
  };
  const i32 = (): number => {
    const v = dv.getInt32(o, true);
    o += 4;

    return v;
  };
  const f32 = (): number => {
    const v = dv.getFloat32(o, true);
    o += 4;

    return v;
  };

  const version = u8();
  const graphType = u8();
  const orbitCount = u8();
  const passivesPerOrbit: number[] = [];

  for (let i = 0; i < orbitCount; i++) {
    passivesPerOrbit.push(u8());
  }

  const rootLength = u32();

  if (rootLength > 1000) {
    throw new Error(`unrealistic root_length ${rootLength}`);
  }

  const roots: PsgRoot[] = [];

  for (let i = 0; i < rootLength; i++) {
    roots.push({ id: u32(), curvature: u32() });
  }

  const groupLength = u32();
  const groups: PsgGroup[] = [];
  const nodes: PsgNode[] = [];

  for (let g = 0; g < groupLength; g++) {
    const x = f32();
    const y = f32();
    const flag = u32();
    const unknown1 = u32();
    const isProxy = u8() === 1;
    const passiveLength = u32();
    const groupNodeIds: number[] = [];

    for (let n = 0; n < passiveLength; n++) {
      const skillId = u32();
      const orbit = u32();
      const orbitIndex = u32();
      const connectionsLength = u32();
      const connections: PsgConnection[] = [];

      for (let c = 0; c < connectionsLength; c++) {
        connections.push({ id: u32(), orbit: i32() });
      }

      nodes.push({ skillId, group: g, orbit, orbitIndex, connections });
      groupNodeIds.push(skillId);
    }

    groups.push({ x, y, isProxy, flag, unknown1, nodes: groupNodeIds });
  }

  if (o !== buf.byteLength) {
    throw new Error(`psg: ${o} bytes consumed, expected ${buf.byteLength}`);
  }

  return { version, graphType, passivesPerOrbit, roots, groups, nodes };
}
