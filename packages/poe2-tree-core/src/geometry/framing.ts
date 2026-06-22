/**
 * World-space framing helpers: compute the bounding box the view should focus
 * on, so callers can pan/zoom to a build's allocation or a single class's
 * region instead of the whole tree.
 */

import type { PlacedNode, Scene, WorldRect } from '../types.js';

/** Grow a rect to include a node's footprint (centre ± hit radius). */
function extend(rect: MutableRect, node: PlacedNode): void {
  const reach = node.radius > 0 ? node.radius : 1;
  rect.minX = Math.min(rect.minX, node.x - reach);
  rect.minY = Math.min(rect.minY, node.y - reach);
  rect.maxX = Math.max(rect.maxX, node.x + reach);
  rect.maxY = Math.max(rect.maxY, node.y + reach);
}

interface MutableRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function emptyRect(): MutableRect {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

function finalize(rect: MutableRect): WorldRect | null {
  if (rect.minX > rect.maxX) {
    return null;
  }

  return { minX: rect.minX, minY: rect.minY, maxX: rect.maxX, maxY: rect.maxY };
}

/**
 * Bounds of the allocated main-tree nodes (ascendancy nodes excluded — they live
 * in the relocated hub panel). `null` when nothing is allocated.
 */
export function allocatedBounds(scene: Scene): WorldRect | null {
  const rect = emptyRect();

  for (const node of scene.nodes) {
    if (node.allocated && !node.ascendancy) {
      extend(rect, node);
    }
  }

  return finalize(rect);
}

/**
 * Allocated bounds grown to include the centre hub, so a view framed on a fresh
 * import keeps the class portrait at the tree's centre in shot. `allocatedBounds`
 * alone hugs only the outlying nodes and pushes the portrait off-screen — the
 * very art the import is meant to reveal. `null` when nothing main-tree is
 * allocated (callers fall back to the renderer's default hub-centred view).
 */
export function allocatedBoundsWithCentre(scene: Scene): WorldRect | null {
  const bounds = allocatedBounds(scene);

  if (!bounds) {
    return null;
  }

  const { centre, ring } = scene.centre;
  const reach = ring.frameRadius;

  return {
    minX: Math.min(bounds.minX, centre.x - reach),
    minY: Math.min(bounds.minY, centre.y - reach),
    maxX: Math.max(bounds.maxX, centre.x + reach),
    maxY: Math.max(bounds.maxY, centre.y + reach),
  };
}

/** Shortest signed distance between two angles, in (-π, π]. */
function angleDelta(a: number, b: number): number {
  let delta = a - b;

  while (delta > Math.PI) {
    delta -= 2 * Math.PI;
  }

  while (delta <= -Math.PI) {
    delta += 2 * Math.PI;
  }

  return delta;
}

/**
 * Bounds of the tree sector belonging to one class. The tree radiates from the
 * hub and each class owns a rim direction (`ClassAnchor.startAngle`); a main
 * node belongs to the class whose direction its bearing from the centre is
 * closest to. `null` for an unknown class or an empty sector.
 */
export function classBounds(scene: Scene, classId: number): WorldRect | null {
  const anchors = scene.centre.classes;

  if (anchors.length === 0) {
    return null;
  }

  const { centre } = scene.centre;
  const rect = emptyRect();

  for (const node of scene.nodes) {
    if (node.ascendancy) {
      continue;
    }

    const bearing = Math.atan2(node.y - centre.y, node.x - centre.x);
    let nearest = anchors[0]!;
    let nearestDelta = Math.abs(angleDelta(bearing, nearest.startAngle));

    for (const anchor of anchors) {
      const delta = Math.abs(angleDelta(bearing, anchor.startAngle));

      if (delta < nearestDelta) {
        nearest = anchor;
        nearestDelta = delta;
      }
    }

    if (nearest.classId === classId) {
      extend(rect, node);
    }
  }

  return finalize(rect);
}
