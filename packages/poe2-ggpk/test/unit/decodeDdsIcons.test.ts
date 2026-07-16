/**
 * Unit coverage for the shared icon-decode loop every icon-shipping extractor
 * (item, gem, rune) now delegates to instead of running its own copy.
 */

import { describe, expect, it } from 'vitest';

import { decodeDdsIcons } from '../../src/decodeDdsIcons';
import type { DdsSource } from '../../src/decodeDdsIcons';
import type { RgbaImage } from '../../src/image/types';

/** A fake source serving `images[path]`, or `null` for anything else (a "miss"). */
function fakeSource(images: Record<string, RgbaImage>): DdsSource {
  return {
    dds: async (path: string) => images[path] ?? null,
  };
}

const RED_1X1: RgbaImage = { width: 1, height: 1, rgba: new Uint8Array([255, 0, 0, 255]) };

describe('decodeDdsIcons', () => {
  it('decodes each distinct path to a .png-keyed PNG buffer', async () => {
    const source = fakeSource({ 'Art/a.dds': RED_1X1 });

    const result = await decodeDdsIcons(source, ['Art/a.dds']);

    expect(Object.keys(result.icons)).toEqual(['Art/a.png']);
    expect(result.report).toEqual({ packed: 1, missing: 0 });
  });

  it('decodes a path only once when it repeats', async () => {
    let calls = 0;
    const source: DdsSource = {
      dds: async (path: string) => {
        calls += 1;

        return path === 'Art/a.dds' ? RED_1X1 : null;
      },
    };

    const result = await decodeDdsIcons(source, ['Art/a.dds', 'Art/a.dds', 'Art/a.dds']);

    expect(calls).toBe(1);
    expect(result.report.packed).toBe(1);
  });

  it('counts a path the source cannot serve as missing, never substituted', async () => {
    const source = fakeSource({});

    const result = await decodeDdsIcons(source, ['Art/missing.dds']);

    expect(result.icons).toEqual({});
    expect(result.report).toEqual({ packed: 0, missing: 1 });
  });

  it('mixes packed and missing across several paths', async () => {
    const source = fakeSource({ 'Art/a.dds': RED_1X1, 'Art/b.dds': RED_1X1 });

    const result = await decodeDdsIcons(source, ['Art/a.dds', 'Art/missing.dds', 'Art/b.dds']);

    expect(Object.keys(result.icons).sort()).toEqual(['Art/a.png', 'Art/b.png']);
    expect(result.report).toEqual({ packed: 2, missing: 1 });
  });

  it('applies the transform hook before encoding, keyed by the original dds path', async () => {
    const source = fakeSource({ 'Art/a.dds': RED_1X1 });
    const seen: { img: RgbaImage; ddsPath: string }[] = [];

    await decodeDdsIcons(source, ['Art/a.dds'], (img, ddsPath) => {
      seen.push({ img, ddsPath });

      return { ...img, rgba: new Uint8Array([0, 255, 0, 255]) };
    });

    expect(seen).toEqual([{ img: RED_1X1, ddsPath: 'Art/a.dds' }]);
  });

  it('returns an empty result for no paths', async () => {
    const result = await decodeDdsIcons(fakeSource({}), []);

    expect(result).toEqual({ icons: {}, report: { packed: 0, missing: 0 } });
  });
});
