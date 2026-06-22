/**
 * Integration check for the CDN source against the local GGPK extract: it must
 * serve tables and raw files, and decode DDS art identically to the legacy
 * `.mjs` decoder. The DDS parity here is what pins the BC1/BC3/BC7 port — every
 * pixel of a real icon and a real portrait is compared.
 *
 * Skipped without a local extract (decoded tables + bundle cache). Only cached
 * bundles are used, so the test stays offline.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createCdnSource  } from '../../src/cdnSource';
import type {CdnSource} from '../../src/cdnSource';
import type { RgbaImage } from '../../src/image/types';
import { CACHE_DIR, PATCH, TABLES_DIR, TOOLS_DIR, extractAvailable, legacy } from '../paths';

interface LegacyImageModule {
  decodeDds(buf: Uint8Array): RgbaImage;
}

const PSG_FILE = join(TOOLS_DIR, 'files/metadata@passiveskillgraph.psg');

async function source() {
  return createCdnSource({ patch: PATCH, cacheDir: CACHE_DIR, tablesDir: TABLES_DIR });
}

describe.skipIf(!extractAvailable())('createCdnSource', () => {
  it('serves a decoded table matching the on-disk extract', async () => {
    const src = await source();
    const characters = await src.table('Characters');
    const onDisk = JSON.parse(readFileSync(join(TABLES_DIR, 'Characters.json'), 'utf8'));

    expect(characters).toEqual(onDisk);
    expect(characters.length).toBeGreaterThan(0);
  });

  it.skipIf(!existsSync(PSG_FILE))('serves a raw file by its GGPK path', async () => {
    const src = await source();
    const bytes = await src.file('metadata/passiveskillgraph.psg');

    expect(bytes).not.toBeNull();
    expect(bytes!.length).toBe(readFileSync(PSG_FILE).length);
  });

  /** Compare up to `limit` of `paths` (those cached locally) against the legacy decode. */
  async function compareDecodes(paths: string[], limit: number): Promise<number> {
    const src = await source();
    const mod = (await import(pathToFileURL(legacy('tree/image.mjs')).href)) as LegacyImageModule;

    let compared = 0;

    for (const path of paths) {
      const bytes = await src.file(path);

      if (!bytes) {
        continue; // not in the local cache — keep the test offline
      }

      const ours = await src.dds(path);
      const theirs = mod.decodeDds(bytes);

      expect(ours, path).not.toBeNull();
      expect(ours!.width, path).toBe(theirs.width);
      expect(ours!.height, path).toBe(theirs.height);
      expect(Buffer.from(ours!.rgba).equals(Buffer.from(theirs.rgba)), path).toBe(true);

      if ((compared += 1) >= limit) {
        break;
      }
    }

    return compared;
  }

  const ddsPaths = (rows: Awaited<ReturnType<CdnSource['table']>>, column: string): string[] =>
    rows.map((row) => row[column]).filter((p): p is string => typeof p === 'string' && p.toLowerCase().endsWith('.dds'));

  it('decodes BC1/BC3 passive icons identically to the legacy decoder', async () => {
    const src = await source();
    const compared = await compareDecodes(ddsPaths(await src.table('PassiveSkills'), 'Icon_DDSFile'), 8);

    expect(compared).toBeGreaterThan(0);
  });

  it('decodes BC7 class portraits identically to the legacy decoder', async () => {
    // Portraits exercise the BC7 path specifically — icons alone would miss it.
    const src = await source();
    const compared = await compareDecodes(ddsPaths(await src.table('Characters'), 'PassiveTreeImage'), 4);

    expect(compared).toBeGreaterThan(0);
  });
});
