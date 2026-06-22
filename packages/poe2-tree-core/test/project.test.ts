import { describe, expect, it } from 'vitest';
import { nodeAt, project, projectPoint, screenToWorld } from '../src/index.js';
import type { Scene, Viewport } from '../src/index.js';

const viewport: Viewport = { tx: 100, ty: 50, scale: 2 };

describe('projectPoint / screenToWorld', () => {
  it('projects world to screen and back', () => {
    const screen = projectPoint(viewport, { x: 10, y: 20 });
    expect(screen).toEqual({ x: 120, y: 90 });
    expect(screenToWorld(viewport, 120, 90)).toEqual({ x: 10, y: 20 });
  });
});

function scene(): Scene {
  return {
    nodes: [
      { skill: 1, x: 0, y: 0, kind: 'normal', icon: 'a', iconSize: 37, frameSize: 54, radius: 27, allocated: true },
      // far off-screen — should be culled
      { skill: 2, x: 100000, y: 100000, kind: 'normal', icon: 'b', iconSize: 37, frameSize: 54, radius: 27, allocated: false },
    ],
    connections: [{ from: 1, to: 2, kind: 'line', a: { x: 0, y: 0 }, b: { x: 100000, y: 100000 }, active: false }],
    masteryEffects: [{ skill: 1, x: 0, y: 0, size: 380, patternKey: 'p', active: true }],
    centre: { centre: { x: 0, y: 0 }, innerRadius: 130, ring: { artRadius: 0, activeRadius: 0, frameRadius: 0 }, classes: [], ascendancies: [] },
    bounds: { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 },
    mainBounds: { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 },
  };
}

describe('project', () => {
  const screen = project(scene(), viewport, { width: 800, height: 600 });

  it('projects sizes by scale and carries the scale through', () => {
    expect(screen.scale).toBe(2);
    const n1 = screen.nodes.find((n) => n.skill === 1);
    expect(n1).toMatchObject({ x: 100, y: 50, iconSize: 74, frameSize: 108, radius: 54 });
  });

  it('culls nodes outside the viewport', () => {
    expect(screen.nodes.map((n) => n.skill)).toEqual([1]);
  });

  it('projects effect placements', () => {
    expect(screen.masteryEffects[0]).toMatchObject({ skill: 1, x: 100, y: 50, size: 760 });
  });
});

describe('nodeAt', () => {
  const s = scene();

  it('returns the node whose footprint contains the pixel', () => {
    // node 1 is at world (0,0); screen origin maps there at (100,50)
    expect(nodeAt(s, viewport, 100, 50)).toBe(1);
    // 20px away on screen = 10 world units, still inside radius 27
    expect(nodeAt(s, viewport, 120, 50)).toBe(1);
  });

  it('returns null when no node is under the pixel', () => {
    expect(nodeAt(s, viewport, 500, 500)).toBeNull();
  });

  it('never matches a mastery node despite its large footprint', () => {
    const withMastery: Scene = {
      ...s,
      nodes: [{ skill: 9, x: 0, y: 0, kind: 'mastery', icon: 'm', iconSize: 760, frameSize: 0, radius: 380, allocated: false }],
    };
    // Directly over the mastery's centre — still no hit.
    expect(nodeAt(withMastery, viewport, 100, 50)).toBeNull();
  });
});
