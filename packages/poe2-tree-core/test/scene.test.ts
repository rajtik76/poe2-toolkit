import { describe, expect, it } from 'vitest';
import { buildScene, classifyNode, nodeTargetSize, placeConnection } from '../src/index.js';
import type { TreeData, TreeNode } from '../src/index.js';

function node(partial: Partial<TreeNode> & { skill: number }): TreeNode {
  return {
    group: 0,
    orbit: 0,
    orbitIndex: 0,
    x: 0,
    y: 0,
    connections: [],
    name: '',
    icon: '',
    stats: [],
    ...partial,
  };
}

describe('classifyNode + nodeTargetSize', () => {
  it('sizes a plain node', () => {
    const n = node({ skill: 1 });
    expect(classifyNode(n)).toBe('normal');
    expect(nodeTargetSize(n)).toEqual({ icon: 37, overlay: 54, effect: 0 });
  });

  it('sizes a notable with its effect pattern', () => {
    const n = node({ skill: 1, isNotable: true });
    expect(classifyNode(n)).toBe('notable');
    expect(nodeTargetSize(n)).toEqual({ icon: 54, overlay: 80, effect: 380 });
  });

  it('sizes a keystone', () => {
    const n = node({ skill: 1, isKeystone: true });
    expect(classifyNode(n)).toBe('keystone');
    expect(nodeTargetSize(n).icon).toBe(82);
  });

  it('treats a mastery as a large image with no overlay', () => {
    const n = node({ skill: 1, isMastery: true });
    expect(classifyNode(n)).toBe('mastery');
    expect(nodeTargetSize(n)).toEqual({ icon: 380, overlay: 0, effect: 0 });
  });

  it('sizes a jewel socket and an ascendancy start', () => {
    expect(nodeTargetSize(node({ skill: 1, isJewelSocket: true }))).toEqual({ icon: 80, overlay: 80, effect: 0 });
    expect(nodeTargetSize(node({ skill: 1, isAscendancyStart: true }))).toEqual({ icon: 0, overlay: 50, effect: 0 });
  });
});

/**
 * group at origin, orbit 1 (12 even slots, r≈82): slot 0 baked straight up at
 * (0,-82), slot 3 to the right at (82,0). A far group holds an off-orbit node.
 */
function arcData(): TreeData {
  return {
    version: '0_5',
    constants: { centreInnerRadius: 130 },
    groups: {
      0: { x: 0, y: 0, orbits: [1], nodes: [1, 2] },
      9: { x: 1000, y: 0, orbits: [1], nodes: [3] },
    },
    nodes: {
      1: { skill: 1, group: 0, orbit: 1, orbitIndex: 0, x: 0, y: -82, connections: [{ id: 2 }], name: '', icon: '', stats: [] },
      2: { skill: 2, group: 0, orbit: 1, orbitIndex: 3, x: 82, y: 0, connections: [{ id: 3 }], name: '', icon: '', stats: [] },
      3: { skill: 3, group: 9, orbit: 1, orbitIndex: 0, x: 1000, y: -82, connections: [], name: '', icon: '', stats: [] },
    },
    classes: [],
    jewelSlots: [],
    bounds: { minX: -100, minY: -100, maxX: 1100, maxY: 100 },
  };
}

describe('placeConnection', () => {
  const data = arcData();

  it('arcs around the given arc centre, recovering the radius from the endpoints', () => {
    // The extractor supplies the arc centre per edge (here the group centre);
    // without one placeConnection draws a straight line (no geometric guessing).
    const c = placeConnection(data, 1, 2, { x: 0, y: 0 });
    expect(c.kind).toBe('arc');
    expect(c.arc?.radius).toBeCloseTo(82, 6);
    expect(c.arc?.cx).toBeCloseTo(0, 6);
    expect(c.arc?.cy).toBeCloseTo(0, 6);
    expect(c.a).toEqual({ x: 0, y: -82 });
    expect(c.b).toEqual({ x: 82, y: 0 });
  });

  it('draws a straight line when no arc centre is supplied (same group + orbit)', () => {
    expect(placeConnection(data, 1, 2).kind).toBe('line');
  });

  it('draws a straight line between nodes of different groups', () => {
    const c = placeConnection(data, 2, 3);
    expect(c.kind).toBe('line');
    expect(c.arc).toBeUndefined();
  });

  it('draws a straight line between same-group nodes on different orbits', () => {
    const mixed: TreeData = {
      ...data,
      nodes: { ...data.nodes, 2: { ...data.nodes[2]!, orbit: 2 } },
    };
    expect(placeConnection(mixed, 1, 2).kind).toBe('line');
  });
});

describe('buildScene', () => {
  const data = arcData();

  it('places every node, dedupes edges, and marks allocation', () => {
    const scene = buildScene(data, { allocation: { classId: 0, allocated: [1, 3] } });
    expect(scene.nodes).toHaveLength(3);
    // edges 1-2 and 2-3, each once
    expect(scene.connections).toHaveLength(2);
    expect(scene.nodes.find((n) => n.skill === 1)?.allocated).toBe(true);
    expect(scene.nodes.find((n) => n.skill === 2)?.allocated).toBe(false);
    expect(scene.bounds).toEqual(data.bounds);
  });

  it('hides special noRadius jewel sockets (e.g. Sinister Jewel Socket) and their edges', () => {
    const withHidden: TreeData = {
      ...data,
      nodes: {
        ...data.nodes,
        2: { ...data.nodes[2]!, isJewelSocket: true, noRadius: true, name: 'Sinister Jewel Socket' },
      },
    };
    const scene = buildScene(withHidden);
    // node 2 is dropped, leaving 1 and 3...
    expect(scene.nodes.map((n) => n.skill).sort()).toEqual([1, 3]);
    // ...and both edges touching node 2 (1-2, 2-3) are gone.
    expect(scene.connections).toHaveLength(0);
  });

  it('swaps an attribute node icon to the build-chosen attribute', () => {
    const withAttr: TreeData = {
      ...data,
      nodes: {
        ...data.nodes,
        2: {
          ...data.nodes[2]!,
          isAttribute: true,
          icon: 'Art/plusattribute.png',
          options: [
            { id: 11, name: 'Strength', stats: ['+5 to Strength'], icon: 'Art/plusstrength.png' },
            { id: 12, name: 'Intelligence', stats: ['+5 to Intelligence'], icon: 'Art/plusintelligence.png' },
          ],
        },
      },
    };
    const generic = buildScene(withAttr).nodes.find((n) => n.skill === 2);
    expect(generic?.icon).toBe('Art/plusattribute.png');

    const chosen = buildScene(withAttr, {
      allocation: { classId: 0, allocated: [2], attributeChoices: { 2: 'int' } },
    }).nodes.find((n) => n.skill === 2);
    expect(chosen?.icon).toBe('Art/plusintelligence.png');
  });

  it('hides conditional (unlockConstraint) nodes — the web tree never renders them', () => {
    const withConditional: TreeData = {
      ...data,
      nodes: {
        ...data.nodes,
        2: { ...data.nodes[2]!, conditional: true, unlockAscendancy: 'Oracle' },
      },
    };
    // Node 2 is dropped, and the 1-2 / 2-3 edges with it, build or not.
    const base = buildScene(withConditional);
    expect(base.nodes.map((n) => n.skill).sort()).toEqual([1, 3]);
    expect(base.connections).toHaveLength(0);

    const oracle = buildScene(withConditional, { allocation: { classId: 0, ascendId: 'Oracle', allocated: [] } });
    expect(oracle.nodes.find((n) => n.skill === 2)).toBeUndefined();
  });

  it('excludes ascendancy nodes from mainBounds but keeps them in bounds', () => {
    // Put node 3 far out and mark it ascendancy; it must not stretch mainBounds.
    const withAscendancy: TreeData = {
      ...data,
      groups: { ...data.groups, 9: { x: 9000, y: 0, orbits: [1], nodes: [3] } },
      nodes: { ...data.nodes, 3: { ...data.nodes[3]!, x: 9000, y: -82, ascendancyName: 'Deadeye' } },
    };
    const scene = buildScene(withAscendancy);
    // main tree (nodes 1,2 near origin) stays small; ascendancy node at x=9000 excluded
    expect(scene.mainBounds.maxX).toBeLessThan(500);
    // the full bounds still come from the tree data
    expect(scene.bounds).toEqual(withAscendancy.bounds);
  });

  it('marks the active ascendancy start node allocated so its rails light up', () => {
    const withAsc: TreeData = {
      ...data,
      groups: { ...data.groups, 9: { x: 1000, y: 0, orbits: [1], nodes: [3, 4] } },
      nodes: {
        ...data.nodes,
        3: {
          skill: 3,
          group: 9,
          orbit: 1,
          orbitIndex: 0,
          x: 1000,
          y: -82,
          connections: [{ id: 4 }],
          name: '',
          icon: '',
          stats: [],
          ascendancyName: 'Lich',
          isAscendancyStart: true,
        },
        4: {
          skill: 4,
          group: 9,
          orbit: 1,
          orbitIndex: 3,
          x: 1082,
          y: 0,
          connections: [{ id: 3 }],
          name: '',
          icon: '',
          stats: [],
          ascendancyName: 'Lich',
        },
      },
    };
    // Only node 4 is in the build; the start (3) is implied by having the ascendancy.
    const scene = buildScene(withAsc, { allocation: { classId: 0, ascendId: 'Lich', allocated: [4] } });
    expect(scene.nodes.find((node) => node.skill === 3)?.allocated).toBe(true);
    const edge = scene.connections.find((conn) => conn.from + conn.to === 7); // the 3<->4 rail
    expect(edge?.active).toBe(true);
    expect(edge?.ascendancy).toBe('Lich');
  });

  it('emits a mastery effect placement for nodes with an effect image', () => {
    const withMastery: TreeData = {
      ...data,
      nodes: {
        ...data.nodes,
        1: { ...data.nodes[1]!, isMastery: true, activeEffectImage: 'Art/Pattern' },
      },
    };
    const scene = buildScene(withMastery);
    expect(scene.masteryEffects).toHaveLength(1);
    // mastery icon 380 * 2 (DrawAsset 2*width world rule)
    expect(scene.masteryEffects[0]).toMatchObject({ skill: 1, size: 760, patternKey: 'Art/Pattern', active: false });
  });

  it('lights a mastery effect only when one of its linked neighbours is allocated', () => {
    // Mastery node 1 links to node 2 (its sole connection); node 3 is unrelated.
    const withMastery: TreeData = {
      ...data,
      nodes: {
        ...data.nodes,
        1: { ...data.nodes[1]!, isMastery: true, activeEffectImage: 'Art/Pattern' },
      },
    };

    // A linked neighbour allocated -> lit (masteries aren't allocatable themselves).
    const lit = buildScene(withMastery, { allocation: { classId: 0, allocated: [2] } });
    expect(lit.masteryEffects[0]?.active).toBe(true);

    // An unconnected node allocated -> stays dim, even sharing a cluster.
    const dim = buildScene(withMastery, { allocation: { classId: 0, allocated: [3] } });
    expect(dim.masteryEffects[0]?.active).toBe(false);
  });

  it('attaches a socketed jewel to its socket node, and nothing to others', () => {
    const withSocket: TreeData = {
      ...data,
      nodes: { ...data.nodes, 2: { ...data.nodes[2]!, isJewelSocket: true } },
    };
    const jewel = { name: 'Oblivion Glisten', rarity: 'RARE', baseType: 'Sapphire', mods: ['12% increased Chaos Damage'] };
    const scene = buildScene(withSocket, { allocation: { classId: 0, allocated: [2], jewels: { 2: jewel } } });
    expect(scene.nodes.find((n) => n.skill === 2)?.jewel).toEqual(jewel);
    expect(scene.nodes.find((n) => n.skill === 1)?.jewel).toBeUndefined();
  });
});
