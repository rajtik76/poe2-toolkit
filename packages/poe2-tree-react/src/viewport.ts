/**
 * Pure viewport math and hit-testing for {@link TreeView}.
 *
 * The view owns pan/zoom (the core stays geometry-only), but that ownership is
 * just arithmetic on a {@link Viewport} — no Pixi, no DOM, no React. Keeping it
 * here, separate from the WebGL shell, makes the fiddly parts (fit-to-screen,
 * pan clamping, the relocated-ascendancy hit-test) unit-testable without a
 * canvas or a render harness.
 */

import type { Scene, Viewport, WorldRect } from '@poe2-toolkit/tree-core';
import { nodeAt, screenToWorld } from '@poe2-toolkit/tree-core';

/** How much of the viewport a fitted rect fills (leaves a small margin). */
export const FIT_PADDING = 0.92;

/** Resolved zoom/pan extents (every {@link ZoomLimits} field made concrete). */
export interface ResolvedZoom {
  maxScale: number;
  minFitFactor: number;
  overscroll: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Project a world point to screen pixels under a viewport. */
export function worldToScreen(viewport: Viewport, x: number, y: number): { x: number; y: number } {
  return { x: x * viewport.scale + viewport.tx, y: y * viewport.scale + viewport.ty };
}

/** The scale at which the main tree fits the viewport. */
export function fitScale(scene: Scene, width: number, height: number): number {
  const { minX, minY, maxX, maxY } = scene.mainBounds;
  const worldWidth = Math.max(1, maxX - minX);
  const worldHeight = Math.max(1, maxY - minY);

  return Math.min(width / worldWidth, height / worldHeight) * FIT_PADDING;
}

/** Default view: centred on the hub, zoomed so the portrait and nearby nodes fill the stage. */
export function centreViewport(scene: Scene, width: number, height: number): Viewport {
  const { centre, ring } = scene.centre;
  const windowRadius = Math.max(ring.artRadius * 1.6, 2000);
  const scale = Math.min(width, height) / (windowRadius * 2);

  return { tx: width / 2 - centre.x * scale, ty: height / 2 - centre.y * scale, scale };
}

/** A viewport that fits a world rect into the viewport, centred, with padding. */
export function viewportForRect(rect: WorldRect, width: number, height: number): Viewport {
  const worldWidth = Math.max(1, rect.maxX - rect.minX);
  const worldHeight = Math.max(1, rect.maxY - rect.minY);
  const scale = Math.min(width / worldWidth, height / worldHeight) * FIT_PADDING;
  const cx = (rect.minX + rect.maxX) / 2;
  const cy = (rect.minY + rect.maxY) / 2;

  return { tx: width / 2 - cx * scale, ty: height / 2 - cy * scale, scale };
}

/** Keep the view sane: don't zoom out past the fit scale, don't pan the tree off-screen. */
export function clampViewport(viewport: Viewport, scene: Scene, width: number, height: number, limits: ResolvedZoom): void {
  if (width <= 0 || height <= 0) {
    return;
  }

  viewport.scale = clamp(viewport.scale, fitScale(scene, width, height) * limits.minFitFactor, limits.maxScale);

  const { minX, minY, maxX, maxY } = scene.mainBounds;
  const { scale } = viewport;
  const marginX = Math.min(width, (maxX - minX) * scale) * limits.overscroll;
  const marginY = Math.min(height, (maxY - minY) * scale) * limits.overscroll;
  viewport.tx = clamp(viewport.tx, width - marginX - maxX * scale, marginX - minX * scale);
  viewport.ty = clamp(viewport.ty, height - marginY - maxY * scale, marginY - minY * scale);
}

/**
 * Hit-test that accounts for the relocated active ascendancy disc: try its
 * nodes (translated into the hub) first, then the main tree via core's nodeAt.
 */
export function hitTest(scene: Scene, viewport: Viewport, sx: number, sy: number, activeAscendancy: string | undefined): number | null {
  if (activeAscendancy) {
    const disc = scene.centre.ascendancies.find((a) => a.id === activeAscendancy);

    if (disc) {
      const dx = scene.centre.centre.x - disc.worldAnchor.x;
      const dy = scene.centre.centre.y - disc.worldAnchor.y;
      const world = screenToWorld(viewport, sx, sy);
      let best: number | null = null;
      let bestDistSq = Infinity;

      for (const node of scene.nodes) {
        if (node.ascendancy !== activeAscendancy || node.radius <= 0) {
          continue;
        }

        const ddx = node.x + dx - world.x;
        const ddy = node.y + dy - world.y;
        const distSq = ddx * ddx + ddy * ddy;

        if (distSq <= node.radius * node.radius && distSq < bestDistSq) {
          best = node.skill;
          bestDistSq = distSq;
        }
      }

      if (best !== null) {
        return best;
      }
    }
  }

  return nodeAt(scene, viewport, sx, sy);
}

/** Edge key matching the page's preview set: `min-max` of the two node ids. */
export function edgeKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}
