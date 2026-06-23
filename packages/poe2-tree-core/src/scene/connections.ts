/**
 * Connection geometry: a straight line, or an arc following an orbit.
 *
 * GGG's `edges` table gives the arc centre directly (`orbitX`/`orbitY`), carried
 * on the connection as `arcCentre`; when present the edge is the minor arc around
 * that centre. As a fallback (a handful of arc edges ship no centre), an edge
 * whose endpoints share a group orbit arcs around the group centre. Everything
 * else is a straight line. A single canvas `arc()` has no 90°-per-sprite limit,
 * so no split is needed.
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

  // An edge is an arc only when the `.psg` says so, carried here as the explicit
  // arc centre (the owning orbit's group centre). Without one it's a straight
  // line — no geometric guessing, which used to mis-arc same-orbit chords (the
  // "Shockproof" half-moon) the graph data draws straight.
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
      // The shorter sweep from start to end; renderer draws that direction.
      clockwise: shortestDelta(startAngle, endAngle) < 0,
      orbit,
    },
  };
}

/** Signed shortest angular distance from a1 to a2, in (-π, π]. */
function shortestDelta(a1: number, a2: number): number {
  let delta = (a2 - a1) % TWO_PI;

  if (delta <= -Math.PI) {
    delta += TWO_PI;
  } else if (delta > Math.PI) {
    delta -= TWO_PI;
  }

  return delta;
}
