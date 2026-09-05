/**
 * Unit coverage for the sprite-name icon-decode loop - the counterpart to
 * {@link decodeDdsIcons} for the UIImages references GGG's data uses alongside
 * (and, for some columns, instead of) raw DDS paths.
 */

import { describe, expect, it } from 'vitest';

import { decodeSpriteIcons } from '../../src/decodeSpriteIcons';
import type { SpriteSource } from '../../src/decodeSpriteIcons';
import type { RgbaImage } from '../../src/image/types';

/** A fake source serving `sprites[name]`, or `null` for anything else (a "miss"). */
function fakeSource(sprites: Record<string, RgbaImage>): SpriteSource {
  return {
    uiSprite: async (name: string) => sprites[name] ?? null,
  };
}

const RED_1X1: RgbaImage = { width: 1, height: 1, rgba: new Uint8Array([255, 0, 0, 255]) };

const HOVER = 'Art/2DArt/UIImages/InGame/SmartHover/GemHoverImage/GemHoverImageIceNova';

describe('decodeSpriteIcons', () => {
  it('decodes each distinct name to a .png-keyed PNG buffer', async () => {
    const result = await decodeSpriteIcons(fakeSource({ [HOVER]: RED_1X1 }), [HOVER]);

    expect(Object.keys(result.icons)).toEqual([`${HOVER}.png`]);
    expect(result.report).toEqual({ packed: 1, missing: 0 });
  });

  it('resolves a name only once when it repeats', async () => {
    let calls = 0;
    const source: SpriteSource = {
      uiSprite: async (name: string) => {
        calls += 1;

        return name === HOVER ? RED_1X1 : null;
      },
    };

    const result = await decodeSpriteIcons(source, [HOVER, HOVER, HOVER]);

    expect(calls).toBe(1);
    expect(result.report.packed).toBe(1);
  });

  it('counts a name the sprite index cannot resolve as missing, never substituted', async () => {
    const result = await decodeSpriteIcons(fakeSource({}), ['Art/2DArt/UIImages/InGame/Nope']);

    expect(result.icons).toEqual({});
    expect(result.report).toEqual({ packed: 0, missing: 1 });
  });

  it('keys two names sharing one backing sheet separately', async () => {
    const source = fakeSource({ 'Art/UIImages/A': RED_1X1, 'Art/UIImages/B': RED_1X1 });

    const result = await decodeSpriteIcons(source, ['Art/UIImages/A', 'Art/UIImages/B']);

    expect(Object.keys(result.icons).sort()).toEqual(['Art/UIImages/A.png', 'Art/UIImages/B.png']);
    expect(result.report).toEqual({ packed: 2, missing: 0 });
  });

  it('returns an empty result for no names', async () => {
    const result = await decodeSpriteIcons(fakeSource({}), []);

    expect(result).toEqual({ icons: {}, report: { packed: 0, missing: 0 } });
  });

  it('decodes distinct names concurrently, up to the concurrency cap', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const source: SpriteSource = {
      uiSprite: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);

        await Promise.resolve();

        inFlight -= 1;

        return RED_1X1;
      },
    };

    const names = Array.from({ length: 10 }, (_, i) => `Art/UIImages/${i}`);

    const result = await decodeSpriteIcons(source, names, 4);

    expect(maxInFlight).toBe(4);
    expect(result.report).toEqual({ packed: 10, missing: 0 });
  });
});
