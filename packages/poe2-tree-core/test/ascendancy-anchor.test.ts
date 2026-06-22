import { describe, expect, it } from 'vitest';

import { buildScene } from '../src/index.js';
import { tree, treeDataAvailable } from './treeData.js';

// Regression: the ascendancy disc must relocate onto its own class's quatrefoil,
// not the opposite side of the hub. The renderer drops each disc node by
// `centre - worldAnchor`, so the start diamond (at the ascendancy start node)
// lands at `centre - offset`, where `offset = worldAnchor - diamondPos`. That
// landing point must sit toward the class's start node, the same direction the
// hub ring points. A flipped offset sign (the GGPK extractor bug) put every
// class on the antipodal quatrefoil — Mercenary on Witch's, and so on.
//
// Needs a local tree data.json (see treeData.ts); skipped without one.
if (treeDataAvailable()) {
  const { raw, data } = tree();
  const scene = buildScene(data, { allocation: { allocated: [] } });
  const centre = scene.centre.centre;

  /** The ascendancy start node (the diamond) for an ascendancy id. */
  const diamond = (ascId: string): { x: number; y: number } => {
    const node = Object.values(raw.nodes).find((n) => n.ascendancyId === ascId && n.isAscendancyStart);

    if (!node) {
      throw new Error(`no start diamond for ${ascId}`);
    }

    return { x: node.x ?? 0, y: node.y ?? 0 };
  };

  describe('ascendancy disc anchoring', () => {
    for (const cls of data.classes.filter((c) => c.ascendancies.length > 0)) {
      const anchor = scene.centre.classes.find((c) => c.classId === cls.id);

      it(`${cls.name}'s disc relocates toward its own start node, not the opposite side`, () => {
        expect(anchor).toBeDefined();
        // Class quatrefoil direction (centre -> start node) from the hub ring.
        const qx = Math.cos(anchor!.startAngle);
        const qy = Math.sin(anchor!.startAngle);

        for (const asc of cls.ascendancies) {
          const def = scene.centre.ascendancies.find((a) => a.internalId === asc.internalId);
          expect(def, `${asc.name} missing from centre layout`).toBeDefined();

          const d = diamond(asc.internalId);
          // Where the renderer drops the diamond: centre - (worldAnchor - diamondPos).
          const landX = centre.x - (def!.worldAnchor.x - d.x);
          const landY = centre.y - (def!.worldAnchor.y - d.y);

          // The landing must be on the class's side of the hub: its direction from
          // the centre points the same way as the quatrefoil (dot product > 0).
          const dot = (landX - centre.x) * qx + (landY - centre.y) * qy;
          expect(dot, `${asc.name} landed on the wrong side`).toBeGreaterThan(0);
        }
      });
    }
  });
} else {
  describe.skip('ascendancy disc anchoring (needs POE2_TREE_DATA)', () => {
    it('requires a local tree data.json', () => {});
  });
}
