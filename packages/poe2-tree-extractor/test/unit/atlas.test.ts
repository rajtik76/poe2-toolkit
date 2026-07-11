/**
 * Coverage for the shelf bin-packer on synthetic sprites: placement geometry
 * (padding, shelf wrap, tallest-first order) and the composited sheet itself,
 * decoded back from the emitted PNG.
 */

import { decodePng } from '@poe2-toolkit/ggpk';
import { describe, expect, it } from 'vitest';

import type { AtlasSprite } from '../../src/atlas';
import { packAtlas } from '../../src/atlas';

/** A solid-colour sprite; the colour doubles as its identity in pixel checks. */
function sprite(key: string, width: number, height: number, rgba: [number, number, number, number]): AtlasSprite {
  const px = new Uint8Array(width * height * 4);

  for (let i = 0; i < px.length; i += 4) {
    px.set(rgba, i);
  }

  return { key, width, height, rgba: px };
}

const RED: [number, number, number, number] = [255, 0, 0, 255];
const GREEN: [number, number, number, number] = [0, 255, 0, 255];
const BLUE: [number, number, number, number] = [0, 0, 255, 255];

describe('packAtlas', () => {
  it('places every sprite with non-overlapping, padded frames', () => {
    const { frames } = packAtlas([sprite('a', 8, 8, RED), sprite('b', 4, 4, GREEN), sprite('c', 6, 6, BLUE)]);

    expect(Object.keys(frames).sort()).toEqual(['a', 'b', 'c']);

    const rects = Object.values(frames).map(({ frame }) => frame);

    for (const [i, r1] of rects.entries()) {
      for (const r2 of rects.slice(i + 1)) {
        const apart =
          r1.x + r1.w <= r2.x || r2.x + r2.w <= r1.x || r1.y + r1.h <= r2.y || r2.y + r2.h <= r1.y;

        expect(apart).toBe(true);
      }
    }
  });

  it('packs tallest-first along a shelf', () => {
    const { frames } = packAtlas([sprite('short', 4, 2, GREEN), sprite('tall', 4, 10, RED)]);

    expect(frames['tall']!.frame).toMatchObject({ x: 0, y: 0 });
    expect(frames['short']!.frame).toMatchObject({ x: 5, y: 0 }); // 4px + 1px gutter
  });

  it('wraps to a new shelf when a sprite would exceed maxWidth', () => {
    const { frames } = packAtlas([sprite('a', 10, 6, RED), sprite('b', 10, 6, GREEN)], 12);

    expect(frames['a']!.frame).toMatchObject({ x: 0, y: 0 });
    expect(frames['b']!.frame).toMatchObject({ x: 0, y: 7 }); // shelf height + gutter
  });

  it('composites each sprite at its frame rect in the emitted PNG', () => {
    const { png, frames } = packAtlas([sprite('a', 8, 8, RED), sprite('b', 4, 4, GREEN)]);
    const sheet = decodePng(png);

    for (const [key, colour] of [['a', RED], ['b', GREEN]] as const) {
      const { x, y, w, h } = frames[key]!.frame;
      const centre = ((y + (h >> 1)) * sheet.width + x + (w >> 1)) * 4;

      expect([...sheet.rgba.subarray(centre, centre + 4)]).toEqual([...colour]);
    }

    // The 1px gutter between sprites stays fully transparent.
    const gutter = (frames['b']!.frame.x - 1) * 4;
    expect(sheet.rgba[gutter + 3]).toBe(0);
  });
});
