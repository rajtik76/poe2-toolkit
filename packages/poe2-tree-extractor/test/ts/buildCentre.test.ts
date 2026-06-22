/**
 * The TypeScript `buildCentre` must reproduce the golden centre art exactly:
 * every class/ascendancy portrait and hub ring, byte for byte (pinned by SHA-256
 * in the PNG hash manifest). Built through the real CDN source against the local
 * extract, compared to the local golden fixtures; skipped when either is absent.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCdnSource } from '@poe2/ggpk';
import { beforeAll, describe, expect, it } from 'vitest';


import { buildCentre } from '../../src/buildCentre';
import { parseShaManifest  } from '../helpers';
import type {ManifestEntry} from '../helpers';
import { CACHE_DIR, GOLDEN_DIR, PATCH, TABLES_DIR, goldenArtAvailable, inputsAvailable } from '../pipeline';

const sha = (buf: Uint8Array): string => createHash('sha256').update(buf).digest('hex');

describe.skipIf(!inputsAvailable() || !goldenArtAvailable())('buildCentre reproduces the golden centre art', () => {
  let art: Record<string, Buffer>;
  let centreManifest: ManifestEntry[];

  beforeAll(async () => {
    const manifest = parseShaManifest(readFileSync(join(GOLDEN_DIR, 'png.sha256'), 'utf8'));
    centreManifest = manifest.filter((entry) => entry.path.startsWith('centre/'));
    const source = await createCdnSource({ patch: PATCH, cacheDir: CACHE_DIR, tablesDir: TABLES_DIR });
    art = await buildCentre(source);
  });

  it('produces exactly the golden set of centre images', () => {
    const produced = Object.keys(art).map((name) => `centre/${name}.png`).sort();

    expect(produced).toEqual(centreManifest.map((entry) => entry.path).sort());
  });

  it('reproduces every centre PNG byte for byte (1:1)', () => {
    const mismatches: string[] = [];

    for (const entry of centreManifest) {
      const name = entry.path.replace(/^centre\//, '').replace(/\.png$/, '');
      const png = art[name];

      if (!png || sha(png) !== entry.sha256) {
        mismatches.push(entry.path);
      }
    }

    expect(mismatches).toEqual([]);
  });
});
