/**
 * Central hub geometry: class portrait, rotating gold ring and ornate frame at the origin. The ring rotation is derived
 * from the class start node's direction: `ringRotation = π/2 + atan2(start.y - centre.y, start.x - centre.x)`.
 */

import type { CentreLayout, ClassAnchor, TreeData } from '../types.js';
import { nodePosition } from './orbit.js';

const HALF_PI = Math.PI / 2;

export function computeCentreLayout(data: TreeData): CentreLayout {
  const first = data.classes[0];
  // Fall back to the origin when there are no classes, so the layout is always well-formed.
  const centre = first ? { x: first.centre.x, y: first.centre.y } : { x: 0, y: 0 };
  const ring = first
    ? {
        artRadius: first.centre.art.width,
        activeRadius: first.centre.active.width,
        frameRadius: first.centre.frame.width,
      }
    : { artRadius: 0, activeRadius: 0, frameRadius: 0 };

  const classes: ClassAnchor[] = [];

  for (const cls of data.classes) {
    if (cls.startNode < 0 || !data.nodes[cls.startNode]) {
      continue;
    }

    // Skip PoE1 placeholder classes (Marauder/Duelist/Shadow/Templar): they share a start node with a real class but have no ascendancies.
    if (cls.ascendancies.length === 0) {
      continue;
    }

    const start = nodePosition(data, cls.startNode);
    const startAngle = Math.atan2(start.y - centre.y, start.x - centre.x);

    classes.push({
      classId: cls.id,
      name: cls.name,
      startNode: cls.startNode,
      startAngle,
      ringRotation: HALF_PI + startAngle,
    });
  }

  return {
    centre,
    innerRadius: data.constants.centreInnerRadius,
    ring,
    classes,
    ascendancies: data.classes.flatMap((cls) => cls.ascendancies),
  };
}
