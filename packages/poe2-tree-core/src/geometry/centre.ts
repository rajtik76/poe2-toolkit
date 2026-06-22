/**
 * Central hub geometry: the size and orientation of the middle circle, and how
 * its gold ring rotates to point at the active class.
 *
 * Three concentric layers sit at the hub (the origin): the static class
 * portrait, a rotating gold ring, and a static ornate frame. The ring's
 * rotation is the only moving part, and it is derived — not eyeballed — from the
 * direction of the class's start node:
 *
 *   ringRotation = π/2 + atan2(startNode.y − centre.y, startNode.x − centre.x)
 *
 * That same atan2 direction is where the class sits on the rim (its start
 * "leaf").
 */

import type { CentreLayout, ClassAnchor, TreeData } from '../types.js';
import { nodePosition } from './orbit.js';

const HALF_PI = Math.PI / 2;

export function computeCentreLayout(data: TreeData): CentreLayout {
  const first = data.classes[0];
  // The hub is shared by every class; fall back to the origin if there are no
  // classes (a degenerate tree) so the layout is always well-formed.
  const centre = first ? { x: first.centre.x, y: first.centre.y } : { x: 0, y: 0 };
  // World radius = native layer width (each layer is drawn at 2*width centred).
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

    // Skip PoE1 placeholder classes (Marauder/Duelist/Shadow/Templar): GGG keeps
    // their array slots and pairs each with a real class on a shared start node,
    // but they have no ascendancies and are not playable in PoE2.
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
