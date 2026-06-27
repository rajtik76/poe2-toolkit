import type { PlacedNode, Scene, Viewport } from '@poe2-toolkit/tree-core';
import { screenToWorld } from '@poe2-toolkit/tree-core';
import { describe, expect, it } from 'vitest';
import type { ResolvedZoom } from '../src/viewport.js';
import {
  centreViewport,
  clamp,
  clampViewport,
  edgeKey,
  fitScale,
  hitTest,
  viewportForRect,
  worldToScreen,
} from '../src/viewport.js';

// --- fixtures ---------------------------------------------------------------

function node(over: Partial<PlacedNode> & Pick<PlacedNode, 'skill' | 'x' | 'y'>): PlacedNode {
  return {
    kind: 'notable',
    icon: '',
    iconSize: 40,
    frameSize: 0,
    radius: 20,
    allocated: false,
    ...over,
  };
}

/** A minimal but type-complete Scene; only the fields the viewport math reads vary. */
function makeScene(over: {
  mainBounds?: Scene['mainBounds'];
  nodes?: PlacedNode[];
  centre?: Partial<Scene['centre']>;
} = {}): Scene {
  const mainBounds = over.mainBounds ?? { minX: 0, minY: 0, maxX: 1000, maxY: 500 };

  return {
    nodes: over.nodes ?? [],
    connections: [],
    masteryEffects: [],
    bounds: mainBounds,
    mainBounds,
    centre: {
      centre: { x: 0, y: 0 },
      innerRadius: 100,
      ring: { artRadius: 1000, activeRadius: 1100, frameRadius: 1200 },
      classes: [],
      ascendancies: [],
      ...over.centre,
    },
  };
}

const LIMITS: ResolvedZoom = { maxScale: 4, minFitFactor: 0.85, overscroll: 0.5 };

// --- clamp ------------------------------------------------------------------

describe('clamp', () => {
  it('passes a value already inside the range through unchanged', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps to the bounds on either side', () => {
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
});

// --- worldToScreen ----------------------------------------------------------

describe('worldToScreen', () => {
  it('applies scale then translation: screen = world * scale + (tx, ty)', () => {
    const viewport: Viewport = { tx: 50, ty: -20, scale: 2 };
    expect(worldToScreen(viewport, 10, 10)).toEqual({ x: 70, y: 0 });
  });

  it('round-trips with core screenToWorld', () => {
    const viewport: Viewport = { tx: 123, ty: -45, scale: 1.7 };
    const screen = worldToScreen(viewport, 314, 271);
    const back = screenToWorld(viewport, screen.x, screen.y);
    expect(back.x).toBeCloseTo(314);
    expect(back.y).toBeCloseTo(271);
  });
});

// --- fitScale ---------------------------------------------------------------

describe('fitScale', () => {
  it('fits the limiting dimension and leaves the padding margin', () => {
    // world 1000x500 into 800x600: width is the tighter fit (0.8 < 1.2).
    const scene = makeScene({ mainBounds: { minX: 0, minY: 0, maxX: 1000, maxY: 500 } });
    expect(fitScale(scene, 800, 600)).toBeCloseTo(0.8 * 0.92);
  });

  it('floors a zero-extent dimension to 1 so it never divides by zero', () => {
    const scene = makeScene({ mainBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } });
    // worldWidth/Height both floored to 1 -> min(800, 600) * padding.
    expect(fitScale(scene, 800, 600)).toBeCloseTo(600 * 0.92);
  });
});

// --- centreViewport ---------------------------------------------------------

describe('centreViewport', () => {
  it('places the hub centre at the middle of the viewport', () => {
    const scene = makeScene({ centre: { centre: { x: 100, y: 50 } } });
    const viewport = centreViewport(scene, 800, 600);
    const screen = worldToScreen(viewport, 100, 50);
    expect(screen.x).toBeCloseTo(400);
    expect(screen.y).toBeCloseTo(300);
  });

  it('uses a 2000-unit floor on the window radius for small portraits', () => {
    // artRadius 100 -> 1.6x = 160, below the 2000 floor; scale = min(w,h)/4000.
    const scene = makeScene({ centre: { ring: { artRadius: 100, activeRadius: 0, frameRadius: 0 } } });
    expect(centreViewport(scene, 800, 600).scale).toBeCloseTo(600 / 4000);
  });
});

// --- viewportForRect --------------------------------------------------------

describe('viewportForRect', () => {
  it('centres the rect and fits it with padding', () => {
    const rect = { minX: 0, minY: 0, maxX: 200, maxY: 100 };
    const viewport = viewportForRect(rect, 800, 600);
    // limiting dim is width (4 < 6).
    expect(viewport.scale).toBeCloseTo(4 * 0.92);
    const screen = worldToScreen(viewport, 100, 50);
    expect(screen.x).toBeCloseTo(400);
    expect(screen.y).toBeCloseTo(300);
  });
});

// --- clampViewport ----------------------------------------------------------

describe('clampViewport', () => {
  it('is a no-op for a zero-sized viewport (avoids NaN before first layout)', () => {
    const viewport: Viewport = { tx: 999, ty: 999, scale: 999 };
    clampViewport(viewport, makeScene(), 0, 0, LIMITS);
    expect(viewport).toEqual({ tx: 999, ty: 999, scale: 999 });
  });

  it('clamps the scale up to the fit floor and down to maxScale', () => {
    const scene = makeScene();
    const fitFloor = fitScale(scene, 800, 600) * LIMITS.minFitFactor;

    const zoomedOut: Viewport = { tx: 0, ty: 0, scale: 0.0001 };
    clampViewport(zoomedOut, scene, 800, 600, LIMITS);
    expect(zoomedOut.scale).toBeCloseTo(fitFloor);

    const zoomedIn: Viewport = { tx: 0, ty: 0, scale: 100 };
    clampViewport(zoomedIn, scene, 800, 600, LIMITS);
    expect(zoomedIn.scale).toBe(LIMITS.maxScale);
  });

  it('clamps the pan so the tree cannot be dragged out of frame', () => {
    // scale 1 sits inside [fitFloor, maxScale], so only the pan is clamped.
    // marginX = min(800, 1000) * 0.5 = 400 -> tx in [800-400-1000, 400-0] = [-600, 400].
    const scene = makeScene();
    const dragged: Viewport = { tx: 99999, ty: 99999, scale: 1 };
    clampViewport(dragged, scene, 800, 600, LIMITS);
    expect(dragged.tx).toBeCloseTo(400);
    // marginY = min(600, 500) * 0.5 = 250 -> ty in [600-250-500, 250] = [-150, 250].
    expect(dragged.ty).toBeCloseTo(250);

    const draggedFar: Viewport = { tx: -99999, ty: -99999, scale: 1 };
    clampViewport(draggedFar, scene, 800, 600, LIMITS);
    expect(draggedFar.tx).toBeCloseTo(-600);
    expect(draggedFar.ty).toBeCloseTo(-150);
  });

  it('leaves an in-bounds pan untouched', () => {
    const scene = makeScene();
    const viewport: Viewport = { tx: 0, ty: 0, scale: 1 };
    clampViewport(viewport, scene, 800, 600, LIMITS);
    expect(viewport).toEqual({ tx: 0, ty: 0, scale: 1 });
  });
});

// --- hitTest ----------------------------------------------------------------

describe('hitTest', () => {
  const identity: Viewport = { tx: 0, ty: 0, scale: 1 };

  it('returns the main-tree node under the pointer (delegates to core nodeAt)', () => {
    const scene = makeScene({ nodes: [node({ skill: 1, x: 100, y: 100 })] });
    expect(hitTest(scene, identity, 100, 100, undefined)).toBe(1);
    expect(hitTest(scene, identity, 200, 200, undefined)).toBeNull();
  });

  it('hit-tests an active ascendancy disc at its relocated (hub) position', () => {
    // Disc anchored far out at (5000,5000); the renderer relocates it onto the
    // hub centre (0,0), so its node draws near the origin and is hit there.
    const scene = makeScene({
      nodes: [node({ skill: 2, x: 5000, y: 5000, kind: 'ascendancyNotable', ascendancy: 'Deadeye' })],
      centre: {
        centre: { x: 0, y: 0 },
        ascendancies: [
          {
            id: 'Deadeye',
            name: 'Deadeye',
            internalId: 'Ranger1',
            image: '',
            worldAnchor: { x: 5000, y: 5000 },
            size: { width: 1500, height: 1500 },
          },
        ],
      },
    });

    // Clicking the origin (where the disc is relocated) hits the ascendancy node.
    expect(hitTest(scene, identity, 0, 0, 'Deadeye')).toBe(2);
    // Its far-out raw world position is NOT hittable (it's drawn relocated).
    expect(hitTest(scene, identity, 5000, 5000, 'Deadeye')).toBeNull();
  });

  it('falls through to the main tree when an ascendancy click misses the disc', () => {
    const scene = makeScene({
      nodes: [
        node({ skill: 1, x: 100, y: 100 }),
        node({ skill: 2, x: 5000, y: 5000, kind: 'ascendancyNotable', ascendancy: 'Deadeye' }),
      ],
      centre: {
        ascendancies: [
          {
            id: 'Deadeye',
            name: 'Deadeye',
            internalId: 'Ranger1',
            image: '',
            worldAnchor: { x: 5000, y: 5000 },
            size: { width: 1500, height: 1500 },
          },
        ],
      },
    });

    expect(hitTest(scene, identity, 100, 100, 'Deadeye')).toBe(1);
  });
});

// --- edgeKey ----------------------------------------------------------------

describe('edgeKey', () => {
  it('is order-independent (min-max of the two ids)', () => {
    expect(edgeKey(7, 3)).toBe('3-7');
    expect(edgeKey(3, 7)).toBe('3-7');
  });
});
