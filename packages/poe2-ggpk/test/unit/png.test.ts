/**
 * Port verification for the PNG codec. Two guarantees: encode/decode round-trips
 * losslessly, and the TypeScript codec is byte-identical to the legacy `.mjs`
 * one (so atlas output downstream stays reproducible).
 */

import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

import { decodePng, encodePng } from '../../src/image/png';
import { legacy } from '../paths';

const LEGACY = legacy('tree/image.mjs');

interface LegacyImageModule {
  encodePng(width: number, height: number, rgba: Uint8Array): Buffer;
  decodePng(buf: Uint8Array): { width: number; height: number; rgba: Uint8Array };
}

/** Deterministic pseudo-random RGBA so the test is reproducible without fixtures. */
function sampleImage(width: number, height: number, seed: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  let state = seed >>> 0;

  for (let i = 0; i < rgba.length; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    rgba[i] = state & 0xff;
  }

  return rgba;
}

describe('PNG codec', () => {
  it('round-trips RGBA losslessly', () => {
    const rgba = sampleImage(37, 19, 1);
    const decoded = decodePng(encodePng(37, 19, rgba));

    expect(decoded.width).toBe(37);
    expect(decoded.height).toBe(19);
    expect([...decoded.rgba]).toEqual([...rgba]);
  });

  describe.skipIf(!existsSync(LEGACY))('matches the legacy codec', () => {
    it('encodes byte-identical PNGs', async () => {
      const mod = (await import(pathToFileURL(LEGACY).href)) as LegacyImageModule;
      const rgba = sampleImage(64, 48, 7);

      const ours = encodePng(64, 48, rgba);
      const theirs = mod.encodePng(64, 48, rgba);

      expect(Buffer.from(ours).equals(Buffer.from(theirs))).toBe(true);
    });

    it('decodes a legacy-encoded PNG identically', async () => {
      const mod = (await import(pathToFileURL(LEGACY).href)) as LegacyImageModule;
      const rgba = sampleImage(50, 50, 3);
      const png = mod.encodePng(50, 50, rgba);

      expect([...decodePng(png).rgba]).toEqual([...rgba]);
    });
  });
});
