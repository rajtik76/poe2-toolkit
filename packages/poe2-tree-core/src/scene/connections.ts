/**
 * Connection geometry: a straight line, or an arc following an orbit. With GGG's `arcCentre` the edge is the minor arc
 * around it. Fallback (a few arc edges ship no centre): endpoints sharing a group orbit arc around the group centre.
 * Everything else is a line.
 */

import { nodePosition } from '../geometry/orbit.js';
import type { PlacedConnection, Point, TreeData } from '../types.js';

const TWO_PI = Math.PI * 2;

export function placeConnection(
  data: TreeData,
  fromSkill: number,
  toSkill: number,
  arcCentre: Point | undefined = undefined,
  active = false,
): PlacedConnection {
  const a = nodePosition(data, fromSkill);
  const b = nodePosition(data, toSkill);
  const line: PlacedConnection = { from: fromSkill, to: toSkill, kind: 'line', a, b, active };

  // An edge is an arc only when the `.psg` says so. No geometric guessing: it used to mis-arc same-orbit chords (the "Shockproof" half-moon).
  if (arcCentre) {
    const radius = Math.hypot(a.x - arcCentre.x, a.y - arcCentre.y);

    if (radius > 0) {
      return toArc(fromSkill, toSkill, a, b, arcCentre, radius, 0, active);
    }
  }

  return line;
}

function toArc(
  from: number,
  to: number,
  a: Point,
  b: Point,
  centre: Point,
  radius: number,
  orbit: number,
  active: boolean,
): PlacedConnection {
  const startAngle = Math.atan2(a.y - centre.y, a.x - centre.x);
  const endAngle = Math.atan2(b.y - centre.y, b.x - centre.x);

  return {
    from,
    to,
    kind: 'arc',
    a,
    b,
    active,
    arc: {
      cx: centre.x,
      cy: centre.y,
      radius,
      startAngle,
      endAngle,
      clockwise: shortestDelta(startAngle, endAngle) < 0,
      orbit,
    },
  };
}

function shortestDelta(a1: number, a2: number): number {
  let delta = (a2 - a1) % TWO_PI;

  if (delta <= -Math.PI) {
    delta += TWO_PI;
  } else if (delta > Math.PI) {
    delta -= TWO_PI;
  }

  return delta;
}
