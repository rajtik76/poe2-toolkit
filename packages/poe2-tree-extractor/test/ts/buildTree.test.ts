/**
 * The TypeScript `buildTree` must reproduce the golden `data.json` exactly,
 * serialized the same way the legacy extractor wrote it (`JSON.stringify` with
 * no spacing). This is the gate proving the data half of the port is 1:1.
 *
 * Built through the real CDN source against the local extract, compared to the
 * local golden `data.json`; skipped when either is absent.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCdnSource } from '@poe2-toolkit/ggpk';
import { beforeAll, describe, expect, it } from 'vitest';


import { buildTree  } from '../../src/buildTree';
import type {TreeExport} from '../../src/buildTree';
import { CACHE_DIR, GOLDEN_DIR, PATCH, TABLES_DIR, goldenDataAvailable, inputsAvailable } from '../pipeline';

const GOLDEN_DATA = join(GOLDEN_DIR, 'data.json');

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

describe.skipIf(!inputsAvailable() || !goldenDataAvailable())('buildTree reproduces the golden data.json', () => {
  let tree: TreeExport;

  beforeAll(async () => {
    const source = await createCdnSource({ patch: PATCH, cacheDir: CACHE_DIR, tablesDir: TABLES_DIR });
    tree = await buildTree(source);
  });

  it('matches the golden structure', () => {
    // Serialize then reparse so the pinned NaN bounds normalize to null, exactly
    // as the written file does — an in-memory NaN would spuriously differ.
    expect(JSON.parse(JSON.stringify(tree))).toEqual(JSON.parse(readFileSync(GOLDEN_DATA, 'utf8')));
  });

  it('serializes to the golden bytes exactly (1:1)', () => {
    expect(sha(JSON.stringify(tree))).toBe(sha(readFileSync(GOLDEN_DATA, 'utf8')));
  });
});
