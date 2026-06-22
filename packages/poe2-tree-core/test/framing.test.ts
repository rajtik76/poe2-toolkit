import { describe, expect, it } from 'vitest';
import { allocatedBounds, allocatedBoundsWithCentre, buildScene, classBounds } from '../src/index.js';
import type { Scene, TreeData } from '../src/index.js';

function data(): TreeData {
  return {
    version: '0_5',
    constants: { centreInnerRadius: 130 },
    groups: {
      0: { x: 0, y: 0, orbits: [1], nodes: [1, 2] },
      9: { x: 1000, y: 0, orbits: [1], nodes: [3] },
    },
    nodes: {
      1: { skill: 1, group: 0, orbit: 1, orbitIndex: 0, x: 0, y: -82, connections: [{ id: 2 }], name: '', icon: '', stats: [] },
      2: { skill: 2, group: 0, orbit: 1, orbitIndex: 3, x: 82, y: 0, connections: [{ id: 3 }], name: '', icon: '', stats: [] },
      3: { skill: 3, group: 9, orbit: 1, orbitIndex: 0, x: 1000, y: -82, connections: [], name: '', icon: '', stats: [] },
    },
    classes: [],
    jewelSlots: [],
    bounds: { minX: -100, minY: -100, maxX: 1100, maxY: 100 },
  };
}

describe('allocatedBounds', () => {
  it('returns null when nothing is allocated', () => {
    expect(allocatedBounds(buildScene(data()))).toBeNull();
  });

  it('frames only the allocated main nodes', () => {
    const scene = buildScene(data(), { allocation: { classId: 0, allocated: [3] } });
    const bounds = allocatedBounds(scene);
    // node 3 sits at world x ~ 1000; bounds must hug it, not node 1 near origin.
    expect(bounds).not.toBeNull();
    expect(bounds!.minX).toBeGreaterThan(500);
  });

  it('excludes ascendancy nodes from the allocated frame', () => {
    const withAsc: TreeData = {
      ...data(),
      nodes: { ...data().nodes, 3: { ...data().nodes[3]!, ascendancyName: 'Lich' } },
    };
    const scene = buildScene(withAsc, { allocation: { classId: 0, allocated: [1, 3] } });
    const bounds = allocatedBounds(scene);
    // only node 1 (near origin) counts; the far ascendancy node 3 is excluded.
    expect(bounds!.maxX).toBeLessThan(500);
  });
});

describe('allocatedBoundsWithCentre', () => {
  it('returns null when nothing is allocated', () => {
    expect(allocatedBoundsWithCentre(buildScene(data()))).toBeNull();
  });

  it('grows the allocated frame to keep the centre hub in shot', () => {
    // Node 3 sits far out at world x ~ 1000; allocatedBounds hugs it and leaves
    // the centre (origin) off-screen. With-centre must reach back to the hub.
    const scene = buildScene(data(), { allocation: { classId: 0, allocated: [3] } });
    const tight = allocatedBounds(scene)!;
    const framed = allocatedBoundsWithCentre(scene)!;

    expect(tight.minX).toBeGreaterThan(0);
    expect(framed.minX).toBeLessThanOrEqual(-scene.centre.ring.frameRadius);
    expect(framed.maxX).toBe(tight.maxX);
  });
});

describe('classBounds', () => {
  it('returns null when the tree has no class anchors', () => {
    const scene: Scene = buildScene(data());
    expect(classBounds(scene, 0)).toBeNull();
  });
});
