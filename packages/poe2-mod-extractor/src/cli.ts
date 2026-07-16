#!/usr/bin/env node
/**
 * Command-line entry: extract item-mod data from the patch CDN and write it to an
 * output directory (`mods.json`).
 *
 *   poe2-mod-extract --patch 4.5.4.1 --tables ./tables/English \
 *                    --cache ./.cache --out ./out/mods
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createCdnSource } from '@poe2-toolkit/ggpk';
import { parseExtractorArgs, runCli } from '@poe2-toolkit/ggpk/cli';

import { extractMods } from './index.js';

const USAGE = 'poe2-mod-extract --patch <v> --tables <dir> --cache <dir> --out <dir>';

async function main(): Promise<void> {
  const { patch, tablesDir, cacheDir, outDir } = parseExtractorArgs(process.argv.slice(2), USAGE);

  const source = await createCdnSource({ patch, cacheDir, tablesDir });
  const { data } = await extractMods(source);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'mods.json'), JSON.stringify(data, null, 2));

  const statLines = Object.values(data).reduce((sum, mod) => sum + mod.stats.length, 0);
  process.stdout.write(
    `mods: ${Object.keys(data).length} (${statLines} stat lines)\n` +
      `written to ${outDir}\n`,
  );
}

runCli(main);
