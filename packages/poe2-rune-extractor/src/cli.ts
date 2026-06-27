#!/usr/bin/env node
/**
 * Command-line entry: extract rune / soul-core data from the patch CDN and write
 * it to an output directory (`runes.json`).
 *
 *   poe2-rune-extract --patch 4.5.3.1.8 --tables ./tables/English \
 *                     --cache ./.cache --out ./out/runes
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createCdnSource } from '@poe2-toolkit/ggpk';

import { extractRunes } from './index.js';

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
      throw new Error(`missing --${name}\nusage: poe2-rune-extract --patch <v> --tables <dir> --cache <dir> --out <dir>`);
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
  const { data } = await extractRunes(source);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'runes.json'), JSON.stringify(data, null, 2));

  const effectLines = Object.values(data).reduce((sum, rune) => sum + rune.effects.length, 0);
  process.stdout.write(
    `runes: ${Object.keys(data).length} (${effectLines} effect lines)\n` +
      `written to ${outDir}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
