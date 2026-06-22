/**
 * Port verification for the PSG parser: the TypeScript {@link parsePsg} must
 * reproduce the legacy `.mjs` parser exactly, on the real `metadata/
 * passiveskillgraph.psg` from the local GGPK extract.
 *
 * The legacy script is committed and always present; the `.psg` input is
 * git-ignored, so the comparison is skipped on a checkout without the extract.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

import { parsePsg } from '../../src/psg';
import { TOOLS_DIR } from '../pipeline';

const PSG_FILE = join(TOOLS_DIR, 'files/metadata@passiveskillgraph.psg');
const LEGACY_PSG = join(TOOLS_DIR, 'tree/psg.mjs');

interface LegacyPsgModule {
  parsePsg(buf: Uint8Array): unknown;
}

describe.skipIf(!existsSync(PSG_FILE))('parsePsg matches the legacy parser', () => {
  it('produces an identical graph from the real .psg bytes', async () => {
    const bytes = readFileSync(PSG_FILE);
    const legacy = (await import(pathToFileURL(LEGACY_PSG).href)) as LegacyPsgModule;

    expect(parsePsg(bytes)).toEqual(legacy.parsePsg(bytes));
  });

  it('consumes the whole buffer and yields a non-trivial graph', () => {
    const psg = parsePsg(readFileSync(PSG_FILE));

    expect(psg.nodes.length).toBeGreaterThan(5000);
    expect(psg.groups.length).toBeGreaterThan(1000);
    expect(psg.passivesPerOrbit.length).toBeGreaterThan(0);
  });
});
