#!/usr/bin/env node
/**
 * Command-line entry: extract the passive tree from the patch CDN and write the
 * bundle (data.json + sprite atlases + centre art) to an output directory.
 *
 * Output is PNG + JSON, mirroring the renderer's atlas layout. Converting the
 * PNGs to WebP for the web is a separate publish step, left to the consumer.
 *
 *   poe2-tree-extract --patch 4.5.4.1 --tables ./tables/English \
 *                     --cache ./.cache --out ./out/tree
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createCdnSource } from '@poe2-toolkit/ggpk';
import { parseExtractorArgs, runCli } from '@poe2-toolkit/ggpk/cli';

import { extractTree } from './index.js';

const USAGE = 'poe2-tree-extract --patch <v> --tables <dir> --cache <dir> --out <dir>';

async function main(): Promise<void> {
  const { patch, tablesDir, cacheDir, outDir } = parseExtractorArgs(process.argv.slice(2), USAGE);

  const source = await createCdnSource({ patch, cacheDir, tablesDir });
  const { data, graphics, centre } = await extractTree(source);

  const assetsDir = join(outDir, 'assets');
  const centreDir = join(outDir, 'centre');
  mkdirSync(assetsDir, { recursive: true });
  mkdirSync(centreDir, { recursive: true });

  writeFileSync(join(outDir, 'data.json'), JSON.stringify(data));

  for (const [name, atlas] of Object.entries(graphics.atlases)) {
    writeFileSync(join(assetsDir, `${name}.png`), atlas.png);
    writeFileSync(join(assetsDir, `${name}.json`), JSON.stringify({ frames: atlas.frames }));
  }

  for (const [name, png] of Object.entries(centre)) {
    writeFileSync(join(centreDir, `${name}.png`), png);
  }

  const { skills, masteryEffects } = graphics.report;
  process.stdout.write(
    `tree: ${Object.keys(data.nodes).length} nodes, ${data.classes.length} classes\n` +
      `atlases: ${skills.packed} icons (${skills.missing} missing), ` +
      `${masteryEffects.packed} mastery effects\n` +
      `centre: ${Object.keys(centre).length} images\n` +
      `written to ${outDir}\n`,
  );
}

runCli(main);
