import { describe, expect, it } from 'vitest';
import { nodePosition } from '../src/index.js';
import type { TreeData, TreeNode } from '../src/index.js';

/** Minimal node with the GGG-baked fields the engine reads. */
function node(skill: number, x: number, y: number): TreeNode {
  return { skill, group: 1, orbit: 1, orbitIndex: 0, x, y, connections: [], name: 'Test', icon: 'test', stats: [] };
}

describe('nodePosition', () => {
  const data: TreeData = {
    version: '0_5',
    constants: { centreInnerRadius: 130 },
    groups: { 1: { x: 100, y: 200, orbits: [1], nodes: [10] } },
    nodes: { 10: node(10, 100, 118) },
    classes: [],
    jewelSlots: [],
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
  };

  it('returns the node\'s baked world position', () => {
    expect(nodePosition(data, 10)).toEqual({ x: 100, y: 118 });
  });

  it('throws for an unknown skill id', () => {
    expect(() => nodePosition(data, 999)).toThrow(/unknown skill/);
  });
});
