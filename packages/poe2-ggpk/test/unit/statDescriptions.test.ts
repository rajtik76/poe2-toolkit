/** Port verification for the StatDescriptions engine. */

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

// Skips without the extract, and also once the legacy engine is gone: the .mjs reference scripts were retired after the port, so this parity check only runs against a checkout that still carries them.
describe.skipIf(!existsSync(CSD) || !existsSync(LEGACY))('StatDescriptions matches the legacy engine', () => {
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
