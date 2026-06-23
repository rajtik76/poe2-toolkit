/**
 * Switching class or ascendancy must deactivate nodes that no longer apply:
 *  - changing class deactivates EVERYTHING (main tree + any ascendancy), since
 *    the old paths are meaningless under a new class start;
 *  - changing ascendancy deactivates only the PREVIOUS ascendancy's nodes (you
 *    can path just one ascendancy), leaving the main tree and others intact.
 * These guard the planner's reset behaviour.
 */

import { describe, expect, it } from 'vitest';
import { clearAscendancyAllocation, freshAllocation } from '../src/index.js';
import type { TreeData, TreeNode } from '../src/index.js';

function node(partial: Partial<TreeNode> & { skill: number }): TreeNode {
  return { group: 0, orbit: 0, orbitIndex: 0, x: 0, y: 0, connections: [], name: '', icon: '', stats: [], ...partial };
}

/** Main-tree node 1, Oracle nodes 10/11, Shaman node 20. */
function data(): TreeData {
  return {
    version: '0_5',
    constants: { centreInnerRadius: 130 },
    groups: {},
    nodes: {
      1: node({ skill: 1 }),
      10: node({ skill: 10, ascendancyName: 'Oracle' }),
      11: node({ skill: 11, ascendancyName: 'Oracle' }),
      20: node({ skill: 20, ascendancyName: 'Shaman' }),
    },
    classes: [],
    jewelSlots: [],
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
  };
}

describe('freshAllocation — class change deactivates everything', () => {
  it('returns an empty allocation for the new class (no nodes, no ascendancy)', () => {
    expect(freshAllocation(3)).toEqual({ classId: 3, allocated: [] });
  });

  it('keeps no allocated nodes or ascendancy from before', () => {
    const next = freshAllocation(5);
    expect(next.allocated).toHaveLength(0);
    expect(next.ascendId).toBeUndefined();
  });
});

describe('clearAscendancyAllocation — ascendancy change deactivates the previous one', () => {
  it('drops only the previous ascendancy nodes, keeping main tree and other ascendancies', () => {
    const cleared = clearAscendancyAllocation(data(), [1, 10, 11, 20], 'Oracle');
    expect(cleared).toEqual([1, 20]);
  });

  it('leaves the allocation untouched when no node belongs to that ascendancy', () => {
    expect(clearAscendancyAllocation(data(), [1, 20], 'Oracle')).toEqual([1, 20]);
  });

  it('keeps main-tree nodes even when every ascendancy node is cleared', () => {
    const cleared = clearAscendancyAllocation(data(), [1, 10, 11], 'Oracle');
    expect(cleared).toEqual([1]);
  });
});
