/**
 * The TypeScript `buildGraphics` must reproduce the golden atlases exactly: the
 * frame-maps structurally, and every atlas PNG byte for byte (pinned by SHA-256
 * in `golden/png.sha256`). This gates the sprite-packing and image-decode port.
 *
 * Built through the real CDN source against the local extract, compared to the
 * local golden fixtures; skipped when either is absent.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCdnSource } from '@poe2-toolkit/ggpk';
import { beforeAll, describe, expect, it } from 'vitest';


import { buildGraphics  } from '../../src/buildGraphics';
import type {TreeAtlases} from '../../src/buildGraphics';
import { buildTree } from '../../src/buildTree';
import { parseShaManifest, readJson  } from '../helpers';
import type {ManifestEntry} from '../helpers';
import { CACHE_DIR, GOLDEN_DIR, PATCH, TABLES_DIR, goldenArtAvailable, inputsAvailable } from '../pipeline';

const ATLAS_NAMES: (keyof TreeAtlases)[] = ['skills', 'skills-disabled', 'frame', 'mastery-effect-active'];

const sha = (buf: Uint8Array): string => createHash('sha256').update(buf).digest('hex');

describe.skipIf(!inputsAvailable() || !goldenArtAvailable())('buildGraphics reproduces the golden atlases', () => {
  let atlases: TreeAtlases;
  let manifest: ManifestEntry[];

  beforeAll(async () => {
    manifest = parseShaManifest(readFileSync(join(GOLDEN_DIR, 'png.sha256'), 'utf8'));
    const source = await createCdnSource({ patch: PATCH, cacheDir: CACHE_DIR, tablesDir: TABLES_DIR });
    const tree = await buildTree(source);
    atlases = (await buildGraphics(source, tree)).atlases;
  });

  it.each(ATLAS_NAMES)('reproduces the %s frame-map', (name) => {
    expect({ frames: atlases[name].frames }).toEqual(readJson(join(GOLDEN_DIR, 'assets', `${name}.json`)));
  });

  it.each(ATLAS_NAMES)('reproduces the %s atlas PNG byte for byte (1:1)', (name) => {
    const expected = manifest.find((entry) => entry.path === `assets/${name}.png`)?.sha256;

    expect(sha(atlases[name].png)).toBe(expected);
  });
});
