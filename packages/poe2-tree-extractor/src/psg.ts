/**
 * Parser for GGG's `metadata/passiveskillgraph.psg` — the passive skill graph
 * holding every node's geometry (group, orbit, orbit index) and its outgoing
 * connections.
 *
 * A node's `skillId` here is the PassiveSkillGraphId, the same number the tree
 * uses as `skill` (verified against the live tree: every id matches the graph
 * id, not the table row index). The binary layout is documented in
 * `docs/reference/PSG_FORMAT.md`.
 */

/**
 * One outgoing edge: the target node plus the raw per-edge `orbit` value the
 * `.psg` carries. The magnitude (1..9) is the orbit ring the edge arcs along and
 * the sign is the sweep direction; `0` and the `int32` sentinel (`2147483647`)
 * mean a straight line. Captured verbatim — interpretation lives downstream.
 */
export interface PsgConnection {
  /** Target node's skillId. */
  id: number;
  /** Raw per-edge orbit word: magnitude = ring, sign = sweep; 0/sentinel = line. */
  orbit: number;
}

/** One node in the passive graph. */
export interface PsgNode {
  /** PassiveSkillGraphId — joins to the passive tables and the tree's `skill`. */
  skillId: number;
  /** Index of the owning group in {@link Psg.groups}. */
  group: number;
  /** Orbit ring within the group. */
  orbit: number;
  /** Slot index along the orbit. */
  orbitIndex: number;
  /** Edges this node points to (each stored once, directed), with arc geometry. */
  connections: PsgConnection[];
}

/** One orbit cluster: a world anchor plus its member nodes. */
export interface PsgGroup {
  /** World x of the group anchor. */
  x: number;
  /** World y of the group anchor. */
  y: number;
  /** Proxy groups exist only to anchor geometry and hold no real passives. */
  isProxy: boolean;
  /** Raw group flag word (purpose not yet decoded; captured, not discarded). */
  flag: number;
  /** Second raw group word (purpose not yet decoded; captured, not discarded). */
  unknown1: number;
  /** Member skill ids, in file order. */
  nodes: number[];
}

/** One graph root (class start / anchor) with its raw curvature word. */
export interface PsgRoot {
  /** Root node's skillId. */
  id: number;
  /** Raw curvature word (purpose not yet decoded; captured, not discarded). */
  curvature: number;
}

/** The fully parsed passive skill graph. */
export interface Psg {
  version: number;
  graphType: number;
  /** Slot count per orbit ring; index = orbit. */
  passivesPerOrbit: number[];
  /** Root nodes (class starts and similar anchors) with raw curvature. */
  roots: PsgRoot[];
  groups: PsgGroup[];
  /** Every node, flattened across all groups, in file order. */
  nodes: PsgNode[];
}

/**
 * Parse the raw bytes of a `.psg` file.
 *
 * @throws if the declared root length is implausible or the byte cursor does
 *   not land exactly on the end of the buffer (a corrupt or misread file).
 */
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
