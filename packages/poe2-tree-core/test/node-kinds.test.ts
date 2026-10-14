import { describe, expect, it } from 'vitest';
import { normalizeGggTree } from '../src/ggg/normalize.js';
import type { GggTreeJson } from '../src/ggg/normalize.js';
import { buildTreeGraph, toggleAllocationInMode, toggleAscendancyAllocation } from '../src/index.js';
import type { TreeData, TreeNode } from '../src/index.js';

function node(skill: number, connections: number[], extra: Partial<TreeNode> = {}): TreeNode {
  return { skill, group: 0, orbit: 0, orbitIndex: 0, x: 0, y: 0, connections: connections.map((id) => ({ id })), name: '', icon: '', stats: [], ...extra };
}

/** Ascendancy start 10 - choice 11 with options 12 and 13; option 12 leads on to 14. */
function choiceData(): TreeData {
  return {
    version: '0_5',
    constants: { centreInnerRadius: 130 },
    groups: { 0: { x: 0, y: 0, orbits: [0], nodes: [] } },
    nodes: {
      10: node(10, [11], { ascendancyName: 'Pathfinder', isAscendancyStart: true }),
      11: node(11, [10, 12, 13], { ascendancyName: 'Pathfinder', isMultipleChoice: true }),
      12: node(12, [11, 14], { ascendancyName: 'Pathfinder', isMultipleChoiceOption: true }),
      13: node(13, [11], { ascendancyName: 'Pathfinder', isMultipleChoiceOption: true }),
      14: node(14, [12], { ascendancyName: 'Pathfinder' }),
    },
    classes: [],
    jewelSlots: [],
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  };
}

describe('multiple-choice ascendancy nodes', () => {
  const data = choiceData();

  it('picking an option drops the other one and the nodes only it connects', () => {
    const next = toggleAscendancyAllocation(data, 'Pathfinder', new Set([1, 11, 12, 14]), 13);

    expect(next.sort((a, b) => a - b)).toEqual([1, 11, 13]);
  });

  it('pathing to a node past an option switches to that option', () => {
    const next = toggleAscendancyAllocation(data, 'Pathfinder', new Set([11, 13]), 14);

    expect(next.sort((a, b) => a - b)).toEqual([11, 12, 14]);
  });

  it('keeps an option allocated on its own', () => {
    expect(toggleAscendancyAllocation(data, 'Pathfinder', new Set(), 12).sort((a, b) => a - b)).toEqual([11, 12]);
  });
});

describe('socket holders', () => {
  it('stay basic whatever the weapon-set mode', () => {
    const data: TreeData = {
      ...choiceData(),
      nodes: {
        0: node(0, [1], { classesStart: ['Witch'] }),
        1: node(1, [0, 2]),
        2: node(2, [1], { containJewelSocket: true }),
      },
    };

    const next = toggleAllocationInMode(data, 0, { allocated: [1], weaponSets: {} }, 2, 1, buildTreeGraph(data));

    expect(next.allocated).toContain(2);
    expect(next.weaponSets[2]).toBeUndefined();
  });
});

describe('normalizeGggTree node kinds', () => {
  it('carries the choice, free, socket-holder and body-armour flags', () => {
    const raw: GggTreeJson = {
      groups: { '1': { x: 0, y: 0, orbits: [0], nodes: [1, 2, 3, 4, 5] } },
      nodes: {
        '1': { skill: 1, group: 1, isMultipleChoice: true },
        '2': { skill: 2, group: 1, isMultipleChoiceOption: true },
        '3': { skill: 3, group: 1, isFreeAllocate: true },
        '4': { skill: 4, group: 1, containJewelSocket: true },
        '5': { skill: 5, group: 1, applyToArmour: true },
      },
      classes: [],
      min_x: 0,
      min_y: 0,
      max_x: 0,
      max_y: 0,
    };
    const { nodes } = normalizeGggTree(raw, '0_5');

    expect(nodes[1]?.isMultipleChoice).toBe(true);
    expect(nodes[2]?.isMultipleChoiceOption).toBe(true);
    expect(nodes[3]?.isFreeAllocate).toBe(true);
    expect(nodes[4]?.containJewelSocket).toBe(true);
    expect(nodes[5]?.applyToArmour).toBe(true);
  });
});
