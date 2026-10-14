/** Shared building blocks for extractor CLIs (`@poe2-toolkit/ggpk/cli`): flag parsing, icon writing, top-level error handler. Kept out of the main entry as a CLI-authoring concern. */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface ExtractorCliOptions {
  patch: string;
  tablesDir: string;
  cacheDir: string;
  outDir: string;
}

/** Throws with `usage` on a missing required flag. */
export function parseExtractorArgs(argv: string[], usage: string): ExtractorCliOptions {
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
      throw new Error(`missing --${name}\nusage: ${usage}`);
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

export function writeIconTree(iconsDir: string, icons: Record<string, Uint8Array>): void {
  for (const [path, png] of Object.entries(icons)) {
    const outPath = join(iconsDir, path);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, png);
  }
}

export function runCli(main: () => Promise<void>): void {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
