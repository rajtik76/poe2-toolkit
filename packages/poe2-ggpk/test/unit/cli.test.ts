/**
 * Unit coverage for the shared extractor-CLI building blocks. This logic used
 * to live duplicated (and untested - `cli.ts` is excluded from every
 * extractor's coverage floor as "a thin main()") inside each extractor
 * package; now that it's shared code in `@poe2-toolkit/ggpk/cli`, it's real
 * logic that deserves real tests.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseExtractorArgs, runCli, writeIconTree } from '../../src/cli/index';

describe('parseExtractorArgs', () => {
  const USAGE = 'poe2-x-extract --patch <v> --tables <dir> --cache <dir> --out <dir>';

  it('parses all four required flags', () => {
    const argv = ['--patch', '4.5.4.1', '--tables', './tables', '--cache', './.cache', '--out', './out'];

    expect(parseExtractorArgs(argv, USAGE)).toEqual({
      patch: '4.5.4.1',
      tablesDir: './tables',
      cacheDir: './.cache',
      outDir: './out',
    });
  });

  it('ignores flag order', () => {
    const argv = ['--out', './out', '--patch', '4.5.4.1', '--cache', './.cache', '--tables', './tables'];

    expect(parseExtractorArgs(argv, USAGE)).toEqual({
      patch: '4.5.4.1',
      tablesDir: './tables',
      cacheDir: './.cache',
      outDir: './out',
    });
  });

  it('throws with usage on a missing required flag', () => {
    const argv = ['--patch', '4.5.4.1', '--tables', './tables', '--cache', './.cache'];

    expect(() => parseExtractorArgs(argv, USAGE)).toThrow(`missing --out\nusage: ${USAGE}`);
  });

  it('throws on an empty argv', () => {
    expect(() => parseExtractorArgs([], USAGE)).toThrow('missing --patch');
  });

  it('ignores a non-flag token in flag position', () => {
    const argv = ['positional', '4.5.4.1', '--tables', './tables', '--cache', './.cache', '--out', './out'];

    expect(() => parseExtractorArgs(argv, USAGE)).toThrow('missing --patch');
  });
});

describe('writeIconTree', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'poe2-ggpk-cli-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes each icon under its path, creating subdirectories', () => {
    const icons = {
      'a.png': Buffer.from([1, 2, 3]),
      'nested/b.png': Buffer.from([4, 5, 6]),
    };

    writeIconTree(dir, icons);

    expect(readFileSync(join(dir, 'a.png'))).toEqual(Buffer.from([1, 2, 3]));
    expect(readFileSync(join(dir, 'nested/b.png'))).toEqual(Buffer.from([4, 5, 6]));
  });

  it('does nothing for an empty icon map', () => {
    writeIconTree(dir, {});
    expect(existsSync(dir)).toBe(true);
  });
});

describe('runCli', () => {
  let stderr: string[];
  let stderrSpy: ReturnType<typeof spyOnStderr>;

  function spyOnStderr() {
    return vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      stderr.push(String(chunk));

      return true;
    });
  }

  beforeEach(() => {
    stderr = [];
    stderrSpy = spyOnStderr();
    process.exitCode = undefined;
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    process.exitCode = undefined;
  });

  it('does nothing on success', async () => {
    runCli(async () => {});
    await new Promise((resolve) => setImmediate(resolve));

    expect(stderr).toEqual([]);
    expect(process.exitCode).toBeUndefined();
  });

  it('prints an Error message to stderr and sets exit code 1', async () => {
    runCli(async () => {
      throw new Error('boom');
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(stderr).toEqual(['boom\n']);
    expect(process.exitCode).toBe(1);
  });

  it('stringifies a non-Error throw', async () => {
    runCli(async () => {
      throw 'not an error object';
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(stderr).toEqual(['not an error object\n']);
    expect(process.exitCode).toBe(1);
  });
});
