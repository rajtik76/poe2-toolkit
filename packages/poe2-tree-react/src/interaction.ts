/**
 * Pan/zoom/pinch arithmetic, pure. `TreeView.tsx` feeds it pointer and wheel
 * events and applies the returned viewports; nothing here reads the DOM.
 */

import type { Viewport } from '@poe2-toolkit/tree-core';
import type { ZoomLimits } from './types.js';
import type { ResolvedZoom } from './viewport.js';
import { clamp } from './viewport.js';

const MIN_SCALE = 0.02;
/** Defaults for {@link ZoomLimits}. */
const MAX_SCALE = 4;
const DEFAULT_MIN_FIT = 0.85;
const DEFAULT_OVERSCROLL = 0.5;

/** Zoom factor of one external +/- button step. */
export const ZOOM_STEP = 1.3;
const ZOOM_SENSITIVITY = 0.0015;

/** Resolve caller-supplied zoom/pan extents against the defaults. */
export function resolveZoomLimits(zoom: ZoomLimits | undefined): ResolvedZoom {
  return {
    maxScale: zoom?.maxScale ?? MAX_SCALE,
    minFitFactor: zoom?.minFitFactor ?? DEFAULT_MIN_FIT,
    overscroll: zoom?.overscroll ?? DEFAULT_OVERSCROLL,
  };
}

/**
 * The viewport after zooming by `factor` about the canvas point (px, py): the
 * scale clamps to [MIN_SCALE, maxScale] and the translation shifts so the world
 * point under the cursor stays under it.
 */
export function zoomedViewport(viewport: Viewport, px: number, py: number, factor: number, maxScale: number): Viewport {
  const scale = clamp(viewport.scale * factor, MIN_SCALE, maxScale);
  const ratio = scale / viewport.scale;

  return {
    scale,
    tx: px - (px - viewport.tx) * ratio,
    ty: py - (py - viewport.ty) * ratio,
  };
}

/** Wheel delta to zoom factor: exponential, so equal notches compound evenly. */
export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY * ZOOM_SENSITIVITY);
}

/** Spread between two pinch pointers (client px). */
export function pinchSpread(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Whether a pointer move is a deliberate drag rather than the jitter of a tap.
 * A press that never crosses this stays a click on pointer-up.
 */
export function isDragMotion(dx: number, dy: number): boolean {
  return Math.abs(dx) + Math.abs(dy) > 2;
}
