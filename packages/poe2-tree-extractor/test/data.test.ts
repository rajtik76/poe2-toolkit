/**
 * Golden-contract tests for the passive-tree `data.json` — they pin the exact
 * shape of the last extraction.
 *
 * `data.json` carries derived GGG game data (node names, stats, flavour text),
 * so it is kept out of the repo. These tests therefore run locally — where the
 * golden file is present — and skip in CI. The 1:1 regeneration gate lives in
 * `test/ts/`.
 */

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { readJson } from './helpers';
import { GOLDEN_DIR, goldenDataAvailable } from './pipeline';

interface TreeFile {
  tree: string;
  classes: { name: string; ascendancies: unknown[] }[];
  groups: Record<string, unknown>;
  nodes: Record<string, TreeNode>;
  edges: unknown[];
  skillOverrides: Record<string, unknown>;
  jewelSlots: number[];
  min_x: number | null;
  min_y: number | null;
  max_x: number | null;
  max_y: number | null;
}

interface TreeNode {
  skill: number;
  x: number;
  y: number;
  out: number[];
  in: number[];
}

const GOLDEN_DATA = join(GOLDEN_DIR, 'data.json');

describe.skipIf(!goldenDataAvailable())('data.json golden contract', () => {
  let cache: TreeFile | undefined;
  const data = (): TreeFile => (cache ??= readJson<TreeFile>(GOLDEN_DATA));

  it('has exactly the documented top-level keys', () => {
    expect(Object.keys(data()).sort()).toEqual(
      [
        'classes',
        'edges',
        'groups',
        'jewelSlots',
        'max_x',
        'max_y',
        'min_x',
        'min_y',
        'nodes',
        'skillOverrides',
        'tree',
      ].sort(),
    );
  });

  it('pins the population counts of the last extraction', () => {
    expect(data().tree).toBe('Default');
    expect(Object.keys(data().nodes)).toHaveLength(5213);
    expect(Object.keys(data().groups)).toHaveLength(1623);
    expect(data().classes).toHaveLength(8);
    expect(data().jewelSlots).toHaveLength(31);
    expect(Object.keys(data().skillOverrides)).toHaveLength(3);
    expect(data().classes.reduce((sum, cls) => sum + cls.ascendancies.length, 0)).toBe(23);
  });

  it('lists the eight released classes in extraction order', () => {
    expect(data().classes.map((cls) => cls.name)).toEqual([
      'Witch',
      'Ranger',
      'Warrior',
      'Sorceress',
      'Huntress',
      'Mercenary',
      'Monk',
      'Druid',
    ]);
  });

  it('ships an empty top-level edges table (arc geometry lives on the nodes)', () => {
    expect(data().edges).toEqual([]);
  });

  // KNOWN BUG, pinned deliberately: the data-only override nodes appended after
  // the bounds pass carry no x/y, so min/max collapse to NaN and serialize to
  // null. The TypeScript pipeline reproduces this exactly; fixing it is a
  // separate change that will update this fixture and assertion together.
  it('pins the null tree bounds (override-node NaN bug)', () => {
    expect(data().min_x).toBeNull();
    expect(data().min_y).toBeNull();
    expect(data().max_x).toBeNull();
    expect(data().max_y).toBeNull();
  });

  it('gives every graph node a skill id, a position and both edge lists', () => {
    for (const [key, node] of Object.entries(data().nodes)) {
      // Data-only override nodes (no geometry) are the documented exception.
      if (node.x === undefined) {
        continue;
      }

      expect(node.skill).toBe(Number(key));
      expect(typeof node.x).toBe('number');
      expect(typeof node.y).toBe('number');
      expect(Array.isArray(node.out)).toBe(true);
      expect(Array.isArray(node.in)).toBe(true);
    }
  });
});
