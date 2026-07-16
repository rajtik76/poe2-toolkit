#!/usr/bin/env node
/**
 * Command-line entry: extract rune / soul-core data + icons from the patch CDN
 * and write them to an output directory (`runes.json` and the icon PNG tree under
 * `icons/`).
 *
 *   poe2-rune-extract --patch 4.5.4.1 --tables ./tables/English \
 *                     --cache ./.cache --out ./out/runes
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createCdnSource } from '@poe2-toolkit/ggpk';
import { parseExtractorArgs, runCli, writeIconTree } from '@poe2-toolkit/ggpk/cli';

import { extractRunes } from './index.js';

const USAGE = 'poe2-rune-extract --patch <v> --tables <dir> --cache <dir> --out <dir>';

async function main(): Promise<void> {
  const { patch, tablesDir, cacheDir, outDir } = parseExtractorArgs(process.argv.slice(2), USAGE);

  const source = await createCdnSource({ patch, cacheDir, tablesDir });
  const { data, icons } = await extractRunes(source);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'runes.json'), JSON.stringify(data, null, 2));
  writeIconTree(join(outDir, 'icons'), icons.icons);

  const effectLines = Object.values(data).reduce((sum, rune) => sum + rune.effects.length, 0);
  process.stdout.write(
    `runes: ${Object.keys(data).length} (${effectLines} effect lines)\n` +
      `icons: ${icons.report.packed} packed (${icons.report.missing} missing)\n` +
      `written to ${outDir}\n`,
  );
}

runCli(main);
