import { describe, expect, it } from 'vitest';
import {
  ascendancyStartNode,
  buildAscendancyGraph,
  buildTreeGraph,
  pathToNode,
  reachable,
  toggleAllocation,
  toggleAscendancyAllocation,
} from '../src/index.js';
import type { TreeData, TreeNode } from '../src/index.js';

function node(skill: number, connections: number[], extra: Partial<TreeNode> = {}): TreeNode {
  return {
    skill,
    group: 0,
    orbit: 0,
    orbitIndex: 0,
    x: 0,
    y: 0,
    connections: connections.map((id) => ({ id })),
    name: '',
    icon: '',
    stats: [],
    ...extra,
  };
}

/**
 * A small line graph: start(0) - 1 - 2 - 3 - 4, plus a mastery (9) hanging off 2
 * (not walkable) and a branch 2 - 5.
 */
function lineData(): TreeData {
  return {
    version: '0_5',
    constants: { centreInnerRadius: 130 },
    groups: { 0: { x: 0, y: 0, orbits: [0], nodes: [] } },
    nodes: {
      0: node(0, [1], { classesStart: ['Ranger'] }),
      1: node(1, [0, 2]),
      2: node(2, [1, 3, 5, 9]),
      3: node(3, [2, 4]),
      4: node(4, [3]),
      5: node(5, [2]),
      9: node(9, [2], { isMastery: true }),
    },
    classes: [],
    jewelSlots: [],
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  };
}

describe('buildTreeGraph', () => {
  it('links walkable nodes both ways and skips masteries', () => {
    const graph = buildTreeGraph(lineData());
    expect([...(graph.get(2) ?? [])].sort()).toEqual([1, 3, 5]); // 9 (mastery) excluded
    expect(graph.has(9)).toBe(false);
    expect(graph.get(0)?.has(1)).toBe(true); // class-start edge kept
  });

  it('excludes the synthetic centre node so class starts are not bridged', () => {
    // GGG's centre `root` (no numeric skill -> NaN) wires every class start to
    // the hub. Two separate class sectors joined only through it must stay
    // disconnected for pathing, or a path would shortcut across the centre.
    const centre = node(NaN, [0, 10]);
    const bridged: TreeData = {
      ...lineData(),
      nodes: {
        0: node(0, [1], { classesStart: ['Ranger'] }),
        1: node(1, [0]),
        10: node(10, [11], { classesStart: ['Witch'] }),
        11: node(11, [10]),
      },
    };
    // GGG keys the centre by the string id "root"; the typed map is numeric.
    (bridged.nodes as Record<string, TreeNode>).root = centre;
    const graph = buildTreeGraph(bridged);

    expect(graph.has(NaN)).toBe(false);
    expect(graph.get(0)?.has(NaN)).toBe(false);
    // No walkable bridge survives: the Witch sector is unreachable from Ranger's
    // start, so a path can't cross the centre to the nearest rim.
    expect(pathToNode(graph, new Set([0]), 11)).toBeNull();
  });
});

describe('pathToNode', () => {
  it('returns the nodes to add, excluding sources, including target', () => {
    const graph = buildTreeGraph(lineData());
    expect(pathToNode(graph, new Set([0]), 4)).toEqual([1, 2, 3, 4]);
  });

  it('roots at the nearest source (existing allocation)', () => {
    const graph = buildTreeGraph(lineData());
    expect(pathToNode(graph, new Set([0, 1, 2]), 4)).toEqual([3, 4]);
  });

  it('returns [] when the target is already a source', () => {
    const graph = buildTreeGraph(lineData());
    expect(pathToNode(graph, new Set([0, 1]), 1)).toEqual([]);
  });
});

describe('toggleAllocation', () => {
  const data = lineData();

  it('allocates the shortest path from the start', () => {
    expect(toggleAllocation(data, 0, new Set(), 3).sort()).toEqual([1, 2, 3]);
  });

  it('removes only what is beyond the clicked node, keeping the node itself', () => {
    // start(0)-1-2-3-4 line; clicking 2 removes the part further out (3,4) and
    // keeps 1,2 — clicking shortens the path back to the clicked node.
    const result = toggleAllocation(data, 0, new Set([1, 2, 3, 4]), 2);
    expect(result.sort()).toEqual([1, 2]);
  });

  it('removes a tip node itself (nothing lies beyond it)', () => {
    const result = toggleAllocation(data, 0, new Set([1, 2, 3, 4]), 4);
    expect(result.sort()).toEqual([1, 2, 3]);
  });

  it('removing a leaf keeps its sibling branch', () => {
    // 2 branches to leaves 3 and 5; clicking the leaf 3 removes only 3.
    const result = toggleAllocation(data, 0, new Set([1, 2, 3, 5]), 3);
    expect(result.sort()).toEqual([1, 2, 5]);
  });

  it('clicking a junction removes every branch beyond it', () => {
    // clicking 2 (branches to 3 and 5) removes both 3 and 5, keeping 1,2.
    const result = toggleAllocation(data, 0, new Set([1, 2, 3, 5]), 2);
    expect(result.sort()).toEqual([1, 2]);
  });

  it('reachable keeps only what is still connected to the start', () => {
    const graph = buildTreeGraph(lineData());
    expect([...reachable(graph, [0], new Set([1, 3, 4]))].sort()).toEqual([1]);
  });
});

/**
 * Main line 0(start)-1, plus a Lich ascendancy chain: 100(start)-101-102-103,
 * with a foreign ascendancy node (200) to confirm the boundary holds.
 */
function ascData(): TreeData {
  const asc = (skill: number, connections: number[], extra: Partial<TreeNode> = {}): TreeNode =>
    node(skill, connections, { ascendancyName: 'Lich', ...extra });

  return {
    ...lineData(),
    nodes: {
      0: node(0, [1], { classesStart: ['Witch'] }),
      1: node(1, [0]),
      100: asc(100, [101], { isAscendancyStart: true }),
      101: asc(101, [100, 102]),
      102: asc(102, [101, 103]),
      103: asc(103, [102]),
      200: node(200, [], { ascendancyName: 'Infernalist' }),
    },
  };
}

describe('ascendancy allocation', () => {
  it('finds the ascendancy start node and graphs only that ascendancy', () => {
    const data = ascData();
    expect(ascendancyStartNode(data, 'Lich')).toBe(100);
    const graph = buildAscendancyGraph(data, 'Lich');
    expect([...graph.keys()].sort((a, b) => a - b)).toEqual([100, 101, 102, 103]);
    expect(graph.has(200)).toBe(false); // a different ascendancy
  });

  it('allocates the path within the ascendancy, leaving the main tree intact', () => {
    const data = ascData();
    const next = toggleAscendancyAllocation(data, 'Lich', new Set([1]), 102);
    expect(next.sort((a, b) => a - b)).toEqual([1, 101, 102]);
  });

  it('removes beyond the clicked ascendancy node and keeps the main allocation', () => {
    const data = ascData();
    const next = toggleAscendancyAllocation(data, 'Lich', new Set([1, 101, 102, 103]), 102);
    expect(next.sort((a, b) => a - b)).toEqual([1, 101, 102]); // 103 dropped, 1 kept
  });
});
