import { describe, expect, it } from 'vitest';

import { buildScene, classOverrideNode } from '../src/index.js';
import { tree, treeDataAvailable } from './treeData.js';

// Verifies the per-class node override end to end against the published tree.
// Needs a local tree data.json (see treeData.ts); skipped without one.
if (treeDataAvailable()) {
  const { data } = tree();
  const witchId = data.classes.find((c) => c.name === 'Witch')!.id;
  const mercId = data.classes.find((c) => c.name === 'Mercenary')!.id;

  describe('per-class node overrides', () => {
    it('the Witch sees node 4739 as "Spell and Minion Damage"', () => {
      const node = classOverrideNode(data, witchId, data.nodes[4739]!);

      expect(node.name).toBe('Spell and Minion Damage');
      expect(node.icon).toContain('miniondamageBlue');
    });

    it('the Mercenary sees the base "Spell Damage" (no override)', () => {
      const node = classOverrideNode(data, mercId, data.nodes[4739]!);

      expect(node.name).toBe('Spell Damage');
      expect(node.icon).toContain('damagespells');
    });

    it('buildScene applies the Witch override icon for node 4739', () => {
      const scene = buildScene(data, { allocation: { classId: witchId, allocated: [] } });
      const placed = scene.nodes.find((n) => n.skill === 4739);

      expect(placed?.icon).toContain('miniondamageBlue');
    });
  });
} else {
  describe.skip('per-class node overrides (needs POE2_TREE_DATA)', () => {
    it('requires a local tree data.json', () => {});
  });
}
