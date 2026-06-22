import { describe, expect, it } from 'vitest';

import { buildScene } from '../src/index.js';
import { tree, treeDataAvailable } from './treeData.js';

// Mastery activation, verified against the published tree + the user's in-game
// observations: a mastery lights from any node sharing a graph edge with it
// (either direction); dead-end masteries (nothing points in) never light.
//
// Needs a local tree data.json (see treeData.ts); skipped without one.
if (treeDataAvailable()) {
  const { data } = tree();

  /** Is the mastery effect for `skill` lit when `allocated` is allocated? */
  const masteryLit = (skill: number, allocated: number[]): boolean => {
    const scene = buildScene(data, { allocation: { allocated } });

    return scene.masteryEffects.find((e) => e.skill === skill)?.active ?? false;
  };

  // Energy Shield Mastery (6338): edge in from "Energy Shield" (15408->6338),
  // edge out to "Pure Energy" (6338->2254). Both endpoints light it.
  describe('Energy Shield Mastery (6338)', () => {
    it('lights from the Energy Shield node that links into it', () => {
      expect(masteryLit(6338, [15408])).toBe(true);
    });

    it('lights from Pure Energy, its outgoing edge', () => {
      expect(masteryLit(6338, [2254])).toBe(true);
    });

    it('stays dark with nothing relevant allocated', () => {
      expect(masteryLit(6338, [])).toBe(false);
    });
  });

  // Caster Mastery (1922): no incoming edge (graph dead-end) -> never lights, even
  // when its only neighbour "Raw Power" (51184) is allocated.
  describe('Caster Mastery (1922)', () => {
    it('never lights - it is a graph dead-end', () => {
      expect(masteryLit(1922, [51184])).toBe(false);
    });
  });
} else {
  describe.skip('mastery activation (needs POE2_TREE_DATA)', () => {
    it('requires a local tree data.json', () => {});
  });
}
