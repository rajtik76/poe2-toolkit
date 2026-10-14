/** Pure pan/zoom/pinch arithmetic; `TreeView.tsx` feeds it events and applies the returned viewports. */

import type { Viewport } from '@poe2-toolkit/tree-core';
import type { ZoomLimits } from './types.js';
import type { ResolvedZoom } from './viewport.js';
import { clamp } from './viewport.js';

const MIN_SCALE = 0.02;
const MAX_SCALE = 4;
const DEFAULT_MIN_FIT = 0.85;
const DEFAULT_OVERSCROLL = 0.5;

export const ZOOM_STEP = 1.3;
const ZOOM_SENSITIVITY = 0.0015;

export function resolveZoomLimits(zoom: ZoomLimits | undefined): ResolvedZoom {
  return {
    maxScale: zoom?.maxScale ?? MAX_SCALE,
    minFitFactor: zoom?.minFitFactor ?? DEFAULT_MIN_FIT,
    overscroll: zoom?.overscroll ?? DEFAULT_OVERSCROLL,
  };
}

/** Zooms about (px, py), clamped to [MIN_SCALE, maxScale], keeping the world point under the cursor in place. */
export function zoomedViewport(viewport: Viewport, px: number, py: number, factor: number, maxScale: number): Viewport {
  const scale = clamp(viewport.scale * factor, MIN_SCALE, maxScale);
  const ratio = scale / viewport.scale;

  return {
    scale,
    tx: px - (px - viewport.tx) * ratio,
    ty: py - (py - viewport.ty) * ratio,
  };
}

export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY * ZOOM_SENSITIVITY);
}

export function pinchSpread(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** A press that never crosses this stays a click on pointer-up. */
export function isDragMotion(dx: number, dy: number): boolean {
  return Math.abs(dx) + Math.abs(dy) > 2;
}
