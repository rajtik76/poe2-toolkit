/**
 * Offline unit test for the CDN bundle loader. It owns the behaviour the toolkit
 * had to reach past `pathofexile-dat`'s internals for: cache on disk, fetch on a
 * miss, and — unlike the stock loader's `process.exit(1)` — throw on a 404 so a
 * bundle that only ships in a full install skips its file instead of killing the
 * run. Uses a real temp cache dir and a stubbed `fetch`, so it needs no network
 * and no game data and runs in CI.
 */

import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CdnCachingLoader } from '../../src/cdnSource';

const HOST = 'https://patch-poe2.poecdn.com';
const PATCH = '4.5.3.1.8';
const NAME = 'art/2dart/94/baseclassillustrations.bundle.bin';

/** A `fetch` stub answering with `body` (200) or a bare status (>=400). */
function stubFetch(answer: { status: number; body?: Uint8Array }) {
  const fetchMock = vi.fn(async () =>
    answer.status >= 400
      ? ({ ok: false, status: answer.status } as Response)
      : ({ ok: true, status: 200, arrayBuffer: async () => Buffer.from(answer.body ?? new Uint8Array()) } as unknown as Response),
  );

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

describe('CdnCachingLoader', () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'poe2-ggpk-loader-'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches from the patch CDN on a miss and caches under the @-flattened name', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchMock = stubFetch({ status: 200, body: bytes });
    const loader = new CdnCachingLoader(HOST, PATCH, cacheDir);

    const got = await loader.fetchFile(NAME);

    expect(got).toEqual(bytes);
    // Raw slashes on the wire, `@`-flattened on disk.
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${HOST}/${PATCH}/Bundles2/${NAME}`);
    const cached = await readFile(join(cacheDir, NAME.replace(/\//g, '@')));
    expect(new Uint8Array(cached)).toEqual(bytes);
  });

  it('serves a cached bundle without touching the network', async () => {
    const bytes = new Uint8Array([9, 8, 7]);
    await writeFile(join(cacheDir, NAME.replace(/\//g, '@')), Buffer.from(bytes));
    const fetchMock = stubFetch({ status: 200, body: new Uint8Array([0]) });
    const loader = new CdnCachingLoader(HOST, PATCH, cacheDir);

    const got = await loader.fetchFile(NAME);

    // Cache reads come back as a Buffer; compare as plain bytes.
    expect(new Uint8Array(got)).toEqual(bytes);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws on a CDN 404 instead of exiting the process', async () => {
    stubFetch({ status: 404 });
    const loader = new CdnCachingLoader(HOST, PATCH, cacheDir);

    await expect(loader.fetchFile(NAME)).rejects.toThrow(`CDN 404 ${NAME}`);
  });

  it('uses the configured CDN host', async () => {
    const fetchMock = stubFetch({ status: 200, body: new Uint8Array([1]) });
    const loader = new CdnCachingLoader('https://example.test', PATCH, cacheDir);

    await loader.fetchFile(NAME);

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`https://example.test/${PATCH}/Bundles2/${NAME}`);
  });
});
