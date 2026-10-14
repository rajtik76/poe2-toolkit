/** Golden-contract tests for the rendered half of the extract: the three sprite atlases (`assets/`) and the centre art (`centre/`). */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseShaManifest, readJson  } from './helpers';
import type {ManifestEntry} from './helpers';
import { GOLDEN_DIR, goldenArtAvailable } from './pipeline';

interface AtlasJson {
  frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
}

const ATLASES: { name: string; frames: number }[] = [
  { name: 'skills', frames: 668 },
  { name: 'frame', frames: 17 },
  { name: 'mastery-effect-active', frames: 60 },
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

  it('pins the full set of rendered PNGs (3 atlases + 33 centre)', () => {
    expect(manifest()).toHaveLength(36);
    expect(manifest().filter((entry) => entry.path.startsWith('assets/'))).toHaveLength(3);
    expect(manifest().filter((entry) => entry.path.startsWith('centre/'))).toHaveLength(33);
  });

  it('records a SHA-256 for every PNG', () => {
    for (const entry of manifest()) {
      expect(entry.path, entry.path).toMatch(/\.png$/);
      expect(entry.sha256, entry.path).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
