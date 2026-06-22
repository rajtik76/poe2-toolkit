/**
 * Port verification for the StatDescriptions engine. The TypeScript index and
 * renderer must match the legacy `.mjs` exactly, on the real passive
 * `stat_descriptions.csd` from the local GGPK extract.
 *
 * The passive file is used (the smaller of the two `.csd` inputs): it exercises
 * every code path while keeping the double parse fast. The base file shares the
 * same format and parser, so parity on one proves the port.
 */

import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

import { buildStatIndex, renderBlock  } from '../../src/statDescriptions';
import type {StatIndex} from '../../src/statDescriptions';
import { legacy, toolsFile } from '../paths';

const CSD = toolsFile('files/data@statdescriptions@passive_skill_stat_descriptions.csd');
const LEGACY = legacy('stat-descriptions.mjs');

interface LegacyStatsModule {
  buildStatIndex(csdPath: string): StatIndex;
  renderBlock(index: StatIndex, statIds: string[], vals: number[]): { lines: string[]; unresolved: string[] };
}

describe.skipIf(!existsSync(CSD))('StatDescriptions matches the legacy engine', () => {
  it('builds an identical stat index', async () => {
    const legacyMod = (await import(pathToFileURL(LEGACY).href)) as LegacyStatsModule;

    const ours = buildStatIndex(readFileSync(CSD, 'utf16le'));
    const theirs = legacyMod.buildStatIndex(CSD);

    expect([...ours.byStat.entries()]).toEqual([...theirs.byStat.entries()]);
  });

  it('renders every stat identically across a range of values', async () => {
    const legacyMod = (await import(pathToFileURL(LEGACY).href)) as LegacyStatsModule;

    const ours = buildStatIndex(readFileSync(CSD, 'utf16le'));
    const theirs = legacyMod.buildStatIndex(CSD);

    const mismatches: string[] = [];

    for (const statId of ours.byStat.keys()) {
      for (const value of [-50, 0, 1, 7, 100]) {
        const a = renderBlock(ours, [statId], [value]);
        const b = legacyMod.renderBlock(theirs, [statId], [value]);

        if (JSON.stringify(a) !== JSON.stringify(b)) {
          mismatches.push(`${statId}@${value}`);
        }
      }
    }

    expect(mismatches).toEqual([]);
  });
});
