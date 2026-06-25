/**
 * World <-> screen projection and hit-testing.
 *
 * `project` turns a world-space {@link Scene} into a {@link ScreenScene} of
 * pixel coordinates, culled to the viewport, so the renderer can blit without
 * any maths of its own. `nodeAt` answers "which node is under this pixel?" by
 * going the other way.
 */

import type {
  Point,
  Scene,
  ScreenConnection,
  ScreenEffect,
  ScreenNode,
  ScreenScene,
  Size,
  Viewport,
} from '../types.js';

/** Project a world point to screen pixels. */
export function projectPoint(viewport: Viewport, p: Point): Point {
  return { x: p.x * viewport.scale + viewport.tx, y: p.y * viewport.scale + viewport.ty };
}

/** Inverse of {@link projectPoint}: screen pixels to a world point. */
export function screenToWorld(viewport: Viewport, sx: number, sy: number): Point {
  return { x: (sx - viewport.tx) / viewport.scale, y: (sy - viewport.ty) / viewport.scale };
}

/** Nodes whose projected radius is below this many pixels are dropped (LOD). */
const MIN_VISIBLE_RADIUS_PX = 0.4;

export function project(scene: Scene, viewport: Viewport, size: Size): ScreenScene {
  const { scale } = viewport;
  const view = worldViewport(viewport, size);

  const nodes: ScreenNode[] = [];

  for (const node of scene.nodes) {
    // Ascendancy nodes live far out in world space; the renderer relocates the
    // active disc into the hub itself, so they are not part of the main map.
    if (node.ascendancy) {
      continue;
    }

    const screenRadius = node.radius * scale;

    if (screenRadius < MIN_VISIBLE_RADIUS_PX) {
      continue;
    }

    if (!within(view, node.x, node.y, node.radius)) {
      continue;
    }

    const p = projectPoint(viewport, node);
    nodes.push({
      skill: node.skill,
      x: p.x,
      y: p.y,
      kind: node.kind,
      icon: node.icon,
      iconSize: node.iconSize * scale,
      frameSize: node.frameSize * scale,
      radius: screenRadius,
      allocated: node.allocated,
      ...(node.weaponSet !== undefined ? { weaponSet: node.weaponSet } : {}),
      ...(node.jewel ? { jewel: node.jewel } : {}),
    });
  }

  const connections: ScreenConnection[] = [];

  for (const conn of scene.connections) {
    // Ascendancy edges are relocated into the hub by the renderer, like nodes.
    if (conn.ascendancy) {
      continue;
    }

    if (!segmentTouches(view, conn.a, conn.b)) {
      continue;
    }

    const a = projectPoint(viewport, conn.a);
    const b = projectPoint(viewport, conn.b);

    if (conn.kind === 'arc' && conn.arc) {
      const centre = projectPoint(viewport, { x: conn.arc.cx, y: conn.arc.cy });
      connections.push({
        from: conn.from,
        to: conn.to,
        kind: 'arc',
        a,
        b,
        active: conn.active,
        ...(conn.weaponSet !== undefined ? { weaponSet: conn.weaponSet } : {}),
        arc: {
          cx: centre.x,
          cy: centre.y,
          radius: conn.arc.radius * scale,
          startAngle: conn.arc.startAngle,
          endAngle: conn.arc.endAngle,
          clockwise: conn.arc.clockwise,
          orbit: conn.arc.orbit,
        },
      });
    } else {
      connections.push({
        from: conn.from,
        to: conn.to,
        kind: 'line',
        a,
        b,
        active: conn.active,
        ...(conn.weaponSet !== undefined ? { weaponSet: conn.weaponSet } : {}),
      });
    }
  }

  const masteryEffects: ScreenEffect[] = [];

  for (const effect of scene.masteryEffects) {
    if (!within(view, effect.x, effect.y, effect.size / 2)) {
      continue;
    }

    const p = projectPoint(viewport, effect);
    masteryEffects.push({ skill: effect.skill, x: p.x, y: p.y, size: effect.size * scale, patternKey: effect.patternKey, active: effect.active });
  }

  return { scale, nodes, connections, masteryEffects };
}

/**
 * The skill id of the node under a screen pixel, or null. Returns the closest
 * node whose footprint contains the point (topmost on overlap).
 */
export function nodeAt(scene: Scene, viewport: Viewport, sx: number, sy: number): number | null {
  const world = screenToWorld(viewport, sx, sy);
  let best: number | null = null;
  let bestDistSq = Infinity;

  for (const node of scene.nodes) {
    // Ascendancy nodes aren't on the main map (the renderer relocates them and
    // hit-tests them there); don't match them at their far-out world position.
    // Masteries are drawn as a large background pattern, not an interactive
    // disc — their huge footprint would otherwise hijack the hover.
    if (node.radius <= 0 || node.ascendancy || node.kind === 'mastery') {
      continue;
    }

    const dx = node.x - world.x;
    const dy = node.y - world.y;
    const distSq = dx * dx + dy * dy;

    if (distSq <= node.radius * node.radius && distSq < bestDistSq) {
      best = node.skill;
      bestDistSq = distSq;
    }
  }

  return best;
}

interface WorldRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** The world-space rectangle currently visible in the viewport. */
function worldViewport(viewport: Viewport, size: Size): WorldRect {
  const topLeft = screenToWorld(viewport, 0, 0);
  const bottomRight = screenToWorld(viewport, size.width, size.height);

  return {
    minX: Math.min(topLeft.x, bottomRight.x),
    minY: Math.min(topLeft.y, bottomRight.y),
    maxX: Math.max(topLeft.x, bottomRight.x),
    maxY: Math.max(topLeft.y, bottomRight.y),
  };
}

/** Whether a world circle (centre + radius) intersects the view rect. */
function within(view: WorldRect, x: number, y: number, radius: number): boolean {
  return (
    x + radius >= view.minX &&
    x - radius <= view.maxX &&
    y + radius >= view.minY &&
    y - radius <= view.maxY
  );
}

/** Cheap bounding-box test for whether a segment could touch the view rect. */
function segmentTouches(view: WorldRect, a: Point, b: Point): boolean {
  if (Math.max(a.x, b.x) < view.minX || Math.min(a.x, b.x) > view.maxX) {
    return false;
  }

  if (Math.max(a.y, b.y) < view.minY || Math.min(a.y, b.y) > view.maxY) {
    return false;
  }

  return true;
}
