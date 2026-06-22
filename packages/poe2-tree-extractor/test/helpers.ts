/** Small filesystem + hashing helpers shared by the characterization suites. */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** Hex SHA-256 of a file's raw bytes. */
export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Parse a file as JSON. */
export function readJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** One line of a `shasum -a 256` manifest: the hash and its path. */
export interface ManifestEntry {
  sha256: string;
  path: string;
}

/**
 * Parse a `shasum -a 256` manifest ("<hash>  <relative/path>" per line). Blank
 * lines are ignored; the two-space separator is what `shasum` emits.
 */
export function parseShaManifest(text: string): ManifestEntry[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha256, ...rest] = line.split(/\s+/);

      return { sha256: sha256 ?? '', path: rest.join(' ') };
    });
}
