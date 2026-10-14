/** An ascendancy can replace another and play on its disc instead of nodes of its own (GGG `replaces`): the Abyssal Lich uses the Lich's nodes, a few of them shown as other passives. */

import { describe, expect, it } from 'vitest';
import { normalizeGggTree } from '../src/ggg/normalize.js';
import type { GggTreeJson } from '../src/ggg/normalize.js';
import {
  ascendancyNodeOwner,
  ascendancyStartNode,
  buildScene,
  classOverrideNode,
  clearAscendancyAllocation,
  toggleAscendancyAllocation,
} from '../src/index.js';
import { tree, treeDataAvailable } from './treeData.js';

function fixture(): GggTreeJson {
  return {
    groups: {
      '1': { x: 0, y: -3000, orbits: [0], nodes: [1] },
      '2': { x: 9000, y: 9000, orbits: [0, 1], nodes: [100, 101] },
    },
    nodes: {
      '1': { skill: 1, group: 1, orbit: 0, orbitIndex: 0, x: 0, y: -3000, name: 'WITCH', classStartIndex: [0] },
      '100': { skill: 100, group: 2, orbit: 0, orbitIndex: 0, x: 9000, y: 9000, out: [101], name: 'Lich', icon: 'Art/start.png', ascendancyId: 'Witch3', isAscendancyStart: true },
      '101': { skill: 101, group: 2, orbit: 1, orbitIndex: 0, x: 9000, y: 8838, name: 'Price of Power', icon: 'Art/price.png', stats: ['a'], ascendancyId: 'Witch3', isNotable: true },
      // The override target: off the tree, only lends its name/stats/icon.
      '900': { skill: 900, name: 'Steward of Kulemak', icon: 'Art/steward.png', stats: ['b'] },
    },
    classes: [
      {
        name: 'Witch',
        base_str: 7,
        base_dex: 7,
        base_int: 15,
        ascendancies: [
          { id: 'Witch3', name: 'Lich', offsetX: 10, offsetY: 20 },
          { id: 'Witch3b', name: 'Abyssal Lich', offsetX: 10, offsetY: 20, replaces: 'Witch3', overridePairs: { '101': 900 } },
          { id: 'Witch4', name: 'Unreleased' },
        ],
      },
    ],
    min_x: 0,
    min_y: 0,
    max_x: 0,
    max_y: 0,
  };
}

describe('replacing ascendancy', () => {
  const data = normalizeGggTree(fixture(), '0_5');
  const witch = data.classes[0]!;
  const lich = witch.ascendancies.find((asc) => asc.id === 'Lich')!;
  const abyssal = witch.ascendancies.find((asc) => asc.id === 'Abyssal Lich');

  it('is kept and anchored on the disc it replaces, while one with no nodes is dropped', () => {
    expect(witch.ascendancies.map((asc) => asc.id)).toEqual(['Lich', 'Abyssal Lich']);
    expect(abyssal?.replaces).toBe('Lich');
    expect(abyssal?.overridePairs).toEqual({ 101: 900 });
    expect(abyssal?.worldAnchor).toEqual(lich.worldAnchor);
  });

  it('plays on the replaced ascendancy nodes', () => {
    expect(ascendancyNodeOwner(data, 'Abyssal Lich')).toBe('Lich');
    expect(ascendancyNodeOwner(data, 'Lich')).toBe('Lich');
    expect(ascendancyStartNode(data, 'Abyssal Lich')).toBe(100);
    expect(toggleAscendancyAllocation(data, 'Abyssal Lich', new Set([1]), 101)).toEqual([1, 101]);
    expect(clearAscendancyAllocation(data, [1, 101], 'Abyssal Lich')).toEqual([1]);
  });

  it('shows its overrides on the shared nodes only while it is active', () => {
    const active = buildScene(data, { allocation: { classId: 0, ascendId: 'Abyssal Lich', allocated: [101] } });
    const placed = active.nodes.find((node) => node.skill === 101);

    expect(placed?.icon).toBe('Art/steward.png');
    expect(active.nodes.find((node) => node.skill === 100)?.allocated).toBe(true);
    // Nodes and edges keep their owner's tag; the renderer maps the active disc onto it.
    expect(placed?.ascendancy).toBe('Lich');
    expect(active.connections.find((conn) => conn.from === 100 || conn.to === 100)?.ascendancy).toBe('Lich');

    const asLich = buildScene(data, { allocation: { classId: 0, ascendId: 'Lich', allocated: [101] } });

    expect(asLich.nodes.find((node) => node.skill === 101)).toMatchObject({ icon: 'Art/price.png', ascendancy: 'Lich' });
  });

  it('lends the override name and stats to the tooltip node', () => {
    expect(classOverrideNode(data, 0, data.nodes[101]!, 'Abyssal Lich')).toMatchObject({ name: 'Steward of Kulemak', stats: ['b'], isNotable: true });
    expect(classOverrideNode(data, 0, data.nodes[101]!, 'Lich').name).toBe('Price of Power');
  });

  it('prefers its overrides over the class ones on the same node', () => {
    const raw = fixture();
    raw.classes[0]!.overridePairs = { '101': 901 };
    raw.nodes['901'] = { skill: 901, name: 'Class Variant', icon: 'Art/class.png', stats: ['c'] };
    const withClass = normalizeGggTree(raw, '0_5');
    const scene = buildScene(withClass, { allocation: { classId: 0, ascendId: 'Abyssal Lich', allocated: [] } });

    expect(scene.nodes.find((node) => node.skill === 101)?.icon).toBe('Art/steward.png');
    expect(classOverrideNode(withClass, 0, withClass.nodes[101]!, 'Abyssal Lich').name).toBe('Steward of Kulemak');
    expect(classOverrideNode(withClass, 0, withClass.nodes[101]!, 'Lich').name).toBe('Class Variant');
  });

  it('lends nothing when the ascendancy is not of the active class', () => {
    const scene = buildScene(data, { allocation: { classId: 1, ascendId: 'Abyssal Lich', allocated: [] } });

    expect(scene.nodes.find((node) => node.skill === 101)?.icon).toBe('Art/price.png');
    expect(classOverrideNode(data, 1, data.nodes[101]!, 'Abyssal Lich').name).toBe('Price of Power');
  });
});

// The same against the published tree. Needs a local tree data.json (see
// treeData.ts); skipped without one.
if (treeDataAvailable()) {
  const { data } = tree();

  describe('the Abyssal Lich on the published tree', () => {
    it('is a Witch ascendancy on the Lich disc, showing Steward of Kulemak for Price of Power', () => {
      const witch = data.classes.find((cls) => cls.name === 'Witch')!;
      const priceOfPower = Object.values(data.nodes).find((node) => node.name === 'Price of Power' && node.ascendancyName === 'Lich')!;

      expect(witch.ascendancies.map((asc) => asc.id)).toContain('Abyssal Lich');
      expect(ascendancyNodeOwner(data, 'Abyssal Lich')).toBe('Lich');
      expect(classOverrideNode(data, witch.id, priceOfPower, 'Abyssal Lich').name).toBe('Steward of Kulemak');
    });
  });
} else {
  describe.skip('the Abyssal Lich on the published tree (needs POE2_TREE_DATA)', () => {
    it('requires a local tree data.json', () => {});
  });
}
