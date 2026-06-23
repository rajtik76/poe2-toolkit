/**
 * Conditional nodes (GGG `unlockConstraint`, e.g. the Druid/Oracle "The Unseen
 * Path" clusters) are hidden on the base tree and only appear once ALL their
 * unlock nodes are allocated — matching PoB's checkUnlockConstraints. Regression
 * guard: they were once hidden unconditionally (never reappeared), and the gating
 * must also apply to their edges.
 */

import { describe, expect, it } from 'vitest';
import { buildScene } from '../src/index.js';
import type { BuildAllocation, TreeData, TreeNode } from '../src/index.js';

function node(partial: Partial<TreeNode> & { skill: number }): TreeNode {
  return {
    group: 0,
    orbit: 1,
    orbitIndex: 0,
    x: 0,
    y: -82,
    connections: [],
    name: '',
    icon: '',
    stats: [],
    ...partial,
  };
}

/**
 * A two-node group: node 1 (the unlock node) and node 2 (a conditional node
 * gated behind node 1), connected to each other.
 */
function data(): TreeData {
  return {
    version: '0_5',
    constants: { centreInnerRadius: 130 },
    groups: { 0: { x: 0, y: 0, orbits: [1], nodes: [1, 2] } },
    nodes: {
      1: node({ skill: 1, orbitIndex: 0, x: 0, y: -82, connections: [{ id: 2 }] }),
      2: node({ skill: 2, orbitIndex: 3, x: 82, y: 0, conditional: true, unlockNodes: [1], connections: [{ id: 1 }] }),
    },
    classes: [],
    jewelSlots: [],
    bounds: { minX: -100, minY: -100, maxX: 100, maxY: 100 },
  };
}

const sceneSkills = (allocation?: BuildAllocation): Set<number> =>
  new Set(buildScene(data(), allocation ? { allocation } : {}).nodes.map((n) => n.skill));

describe('buildScene gates conditional (unlock-constrained) nodes', () => {
  it('hides a conditional node on the base tree', () => {
    const skills = sceneSkills();
    expect(skills.has(1)).toBe(true); // the unlock node is normal, always shown
    expect(skills.has(2)).toBe(false); // the conditional node is hidden
  });

  it('reveals it once its unlock node is allocated', () => {
    expect(sceneSkills({ allocated: [1] }).has(2)).toBe(true);
  });

  it('requires ALL unlock nodes (not just one) to be allocated', () => {
    const gated: TreeData = data();
    (gated.nodes[2] as TreeNode).unlockNodes = [1, 99]; // 99 never allocated
    const skills = new Set(buildScene(gated, { allocation: { allocated: [1] } }).nodes.map((n) => n.skill));
    expect(skills.has(2)).toBe(false);
  });

  it('drops edges to a hidden conditional node, and draws them once revealed', () => {
    const hidden = buildScene(data(), {}).connections.filter((c) => c.from === 2 || c.to === 2);
    expect(hidden).toHaveLength(0);

    const shown = buildScene(data(), { allocation: { allocated: [1] } }).connections.filter((c) => c.from === 2 || c.to === 2);
    expect(shown.length).toBeGreaterThan(0);
  });
});
