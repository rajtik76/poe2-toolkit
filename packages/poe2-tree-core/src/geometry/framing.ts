/** World-space bounding boxes to frame the view on a build's allocation or a single class's region. */

import type { PlacedNode, Scene, WorldRect } from '../types.js';

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

/** Allocated main-tree nodes (ascendancy nodes excluded). `null` when nothing is allocated. */
export function allocatedBounds(scene: Scene): WorldRect | null {
  const rect = emptyRect();

  for (const node of scene.nodes) {
    if (node.allocated && !node.ascendancy) {
      extend(rect, node);
    }
  }

  return finalize(rect);
}

/** Allocated bounds grown to include the hub, or the class portrait falls off-screen on a fresh import. `null` when nothing main-tree is allocated. */
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

/** Tree sector of one class: a main node belongs to the class whose rim direction (`ClassAnchor.startAngle`) is closest to its bearing. `null` for an unknown class or empty sector. */
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
