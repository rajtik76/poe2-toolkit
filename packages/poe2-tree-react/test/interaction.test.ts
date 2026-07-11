/**
 * Coverage for the pure pan/zoom arithmetic: cursor-anchored zoom, scale
 * clamping, wheel factors, pinch spread and the drag threshold.
 */

import { describe, expect, it } from 'vitest';

import { isDragMotion, pinchSpread, resolveZoomLimits, wheelZoomFactor, ZOOM_STEP, zoomedViewport } from '../src/interaction';

describe('zoomedViewport', () => {
  const viewport = { scale: 1, tx: 100, ty: 50 };

  it('keeps the world point under the cursor fixed while scaling', () => {
    const next = zoomedViewport(viewport, 400, 300, 2, 4);

    expect(next.scale).toBe(2);
    // The world point at canvas (400, 300) is world ((400-100)/1, (300-50)/1) =
    // (300, 250); after the zoom it must still project to canvas (400, 300).
    expect(next.tx + 300 * next.scale).toBe(400);
    expect(next.ty + 250 * next.scale).toBe(300);
  });

  it('clamps to the zoom-in cap and the hard zoom-out floor', () => {
    expect(zoomedViewport(viewport, 0, 0, 100, 4).scale).toBe(4);
    expect(zoomedViewport(viewport, 0, 0, 1e-9, 4).scale).toBe(0.02);
  });

  it('is a no-op at factor 1', () => {
    expect(zoomedViewport(viewport, 123, 456, 1, 4)).toEqual(viewport);
  });
});

describe('wheelZoomFactor', () => {
  it('is exponential and symmetric, so equal notches cancel out', () => {
    expect(wheelZoomFactor(0)).toBe(1);
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1); // wheel up zooms in
    expect(wheelZoomFactor(100) * wheelZoomFactor(-100)).toBeCloseTo(1);
  });
});

describe('resolveZoomLimits', () => {
  it('fills defaults and keeps caller overrides', () => {
    expect(resolveZoomLimits(undefined)).toEqual({ maxScale: 4, minFitFactor: 0.85, overscroll: 0.5 });
    expect(resolveZoomLimits({ maxScale: 8 })).toEqual({ maxScale: 8, minFitFactor: 0.85, overscroll: 0.5 });
  });
});

describe('pointer helpers', () => {
  it('measures the pinch spread between two pointers', () => {
    expect(pinchSpread({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('treats sub-threshold jitter as a tap, not a drag', () => {
    expect(isDragMotion(1, 1)).toBe(false);
    expect(isDragMotion(0, 3)).toBe(true);
    expect(isDragMotion(-2, -2)).toBe(true); // magnitudes add regardless of sign
  });

  it('one zoom-in step and one zoom-out step cancel out', () => {
    const inThenOut = zoomedViewport(zoomedViewport({ scale: 1, tx: 0, ty: 0 }, 10, 10, ZOOM_STEP, 4), 10, 10, 1 / ZOOM_STEP, 4);

    expect(inThenOut.scale).toBeCloseTo(1);
  });
});
