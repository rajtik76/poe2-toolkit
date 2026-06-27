#!/usr/bin/env node
/**
 * Command-line entry: extract item data + icons from the patch CDN and write
 * them to an output directory (`items.json` and the icon PNG tree under `icons/`).
 *
 *   poe2-item-extract --patch 4.5.3.1.8 --tables ./tables/English \
 *                     --cache ./.cache --out ./out/items
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { createCdnSource } from '@poe2-toolkit/ggpk';

import { extractItems } from './index.js';

interface CliOptions {
  patch: string;
  tablesDir: string;
  cacheDir: string;
  outDir: string;
}

/** Parse `--flag value` pairs; throws with usage on a missing required flag. */
function parseArgs(argv: string[]): CliOptions {
  const flags = new Map<string, string>();

  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];

    if (key?.startsWith('--') && value !== undefined) {
      flags.set(key.slice(2), value);
    }
  }

  const required = (name: string): string => {
    const value = flags.get(name);

    if (!value) {
      throw new Error(`missing --${name}\nusage: poe2-item-extract --patch <v> --tables <dir> --cache <dir> --out <dir>`);
    }

    return value;
  };

  return {
    patch: required('patch'),
    tablesDir: required('tables'),
    cacheDir: required('cache'),
    outDir: required('out'),
  };
}

async function main(): Promise<void> {
  const { patch, tablesDir, cacheDir, outDir } = parseArgs(process.argv.slice(2));

  const source = await createCdnSource({ patch, cacheDir, tablesDir });
  const { data, icons } = await extractItems(source);

  const iconsDir = join(outDir, 'icons');
  mkdirSync(outDir, { recursive: true });

  writeFileSync(join(outDir, 'items.json'), JSON.stringify(data, null, 2));

  for (const [path, png] of Object.entries(icons.icons)) {
    const outPath = join(iconsDir, path);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, png);
  }

  process.stdout.write(
    `items: ${Object.keys(data).length}\n` +
      `icons: ${icons.report.packed} packed (${icons.report.missing} missing)\n` +
      `written to ${outDir}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
