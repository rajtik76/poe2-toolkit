#!/usr/bin/env node
/**
 * Command-line entry: extract gem data + icons from the patch CDN and write them
 * to an output directory (`gems.json`, `gem_requirements.json`,
 * `gem_scaling.json`, and the icon PNG tree under `icons/`).
 *
 *   poe2-gem-extract --patch 4.5.4.1 --tables ./tables/English \
 *                    --cache ./.cache --out ./out/gems
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createCdnSource } from '@poe2-toolkit/ggpk';
import { parseExtractorArgs, runCli, writeIconTree } from '@poe2-toolkit/ggpk/cli';

import { extractGems } from './index.js';

const USAGE = 'poe2-gem-extract --patch <v> --tables <dir> --cache <dir> --out <dir>';

async function main(): Promise<void> {
  const { patch, tablesDir, cacheDir, outDir } = parseExtractorArgs(process.argv.slice(2), USAGE);

  const source = await createCdnSource({ patch, cacheDir, tablesDir });
  const { data, icons } = await extractGems(source);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'gems.json'), JSON.stringify(data.gems, null, 2));
  writeFileSync(join(outDir, 'gem_requirements.json'), JSON.stringify(data.requirements, null, 2));
  writeFileSync(join(outDir, 'gem_scaling.json'), JSON.stringify(data.scaling, null, 2));
  writeIconTree(join(outDir, 'icons'), icons.icons);

  process.stdout.write(
    `gems: ${Object.keys(data.gems).length} (${Object.keys(data.requirements).length} with level curves, ${Object.keys(data.scaling).length} with tooltip scaling)\n` +
      `icons: ${icons.report.packed} packed (${icons.report.missing} missing)\n` +
      `written to ${outDir}\n`,
  );
}

runCli(main);
