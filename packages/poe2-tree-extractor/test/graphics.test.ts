/**
 * Golden-contract tests for the rendered half of the extract: the four sprite
 * atlases (`assets/`) and the centre art (`centre/`).
 *
 * The golden fixtures derive from GGG art (atlas frame-maps keyed by asset
 * paths, the art PNG hash manifest), so they are kept out of the repo. These
 * checks therefore run locally — where the fixtures are present — and skip in
 * CI. The 1:1 regeneration gate lives in `test/ts/`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseShaManifest, readJson  } from './helpers';
import type {ManifestEntry} from './helpers';
import { GOLDEN_DIR, goldenArtAvailable } from './pipeline';

interface AtlasJson {
  frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
}

/** The three atlas frame-maps and the sprite count each pinned to. */
const ATLASES: { name: string; frames: number }[] = [
  { name: 'skills', frames: 674 },
  { name: 'frame', frames: 17 },
  { name: 'mastery-effect-active', frames: 56 },
];

describe.skipIf(!goldenArtAvailable())('graphics golden contract', () => {
  let cache: ManifestEntry[] | undefined;
  const manifest = (): ManifestEntry[] =>
    (cache ??= parseShaManifest(readFileSync(join(GOLDEN_DIR, 'png.sha256'), 'utf8')));

  it.each(ATLASES)('atlas $name pins $frames frames', ({ name, frames }) => {
    const atlas = readJson<AtlasJson>(join(GOLDEN_DIR, 'assets', `${name}.json`));

    expect(Object.keys(atlas.frames)).toHaveLength(frames);
  });

  it('every atlas frame is a non-empty pixel rect', () => {
    for (const { name } of ATLASES) {
      const atlas = readJson<AtlasJson>(join(GOLDEN_DIR, 'assets', `${name}.json`));

      for (const [key, { frame }] of Object.entries(atlas.frames)) {
        expect(frame.w, key).toBeGreaterThan(0);
        expect(frame.h, key).toBeGreaterThan(0);
        expect(frame.x, key).toBeGreaterThanOrEqual(0);
        expect(frame.y, key).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('pins the full set of rendered PNGs (4 atlases + 33 centre)', () => {
    expect(manifest()).toHaveLength(37);
    expect(manifest().filter((entry) => entry.path.startsWith('assets/'))).toHaveLength(4);
    expect(manifest().filter((entry) => entry.path.startsWith('centre/'))).toHaveLength(33);
  });

  it('records a SHA-256 for every PNG', () => {
    for (const entry of manifest()) {
      expect(entry.path, entry.path).toMatch(/\.png$/);
      expect(entry.sha256, entry.path).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
