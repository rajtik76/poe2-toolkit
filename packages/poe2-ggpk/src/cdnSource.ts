/**
 * The default {@link GgpkSource}: the only layer that talks to the network. Tables come from a directory of
 * `pathofexile-dat`-decoded `<Name>.json` files; raw files and sprites are pulled from GGG's PoE2 patch CDN on demand
 * and cached on disk, via the toolkit's own {@link CdnCachingLoader} (a `BundleLoader` for `pathofexile-dat`'s `FileLoader`).
 */

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { FileLoader } from 'pathofexile-dat/bundles.js';
import type { BundleLoader } from 'pathofexile-dat/bundles.js';
import { parseSpriteIndex } from 'pathofexile-dat/sprites.js';
import type { SpriteImage } from 'pathofexile-dat/sprites.js';

import { decodeDds } from './image/dds.js';
import type { RgbaImage } from './image/types.js';
import type { GgpkSource, TableRow } from './source.js';

export interface SpriteRef {
  path: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface GgpkImageSource {
  dds(path: string): Promise<RgbaImage | null>;
  resolveSprite(name: string): Promise<SpriteRef | null>;
  uiSprite(name: string): Promise<RgbaImage | null>;
}

export type CdnSource = GgpkSource & GgpkImageSource;

export interface CdnSourceOptions {
  patch: string;
  cacheDir: string;
  tablesDir: string;
  cdnHost?: string;
}

const DEFAULT_CDN_HOST = 'https://patch-poe2.poecdn.com';

/** Patch server can stall; give up rather than hang extraction forever. */
const FETCH_TIMEOUT_MS = 30_000;

const BUNDLES_DIR = 'Bundles2';

/**
 * A {@link BundleLoader} over the patch CDN, caching every bundle on disk. `pathofexile-dat`'s own loader calls
 * `process.exit(1)` on a 404, but some texture bundles are not on the patch CDN, so a miss must skip its file: this
 * throws instead. Concurrent callers for the same uncached bundle share one in-flight fetch.
 * Exported for unit testing only.
 */
export class CdnCachingLoader implements BundleLoader {
  private readonly inflight = new Map<string, Promise<Uint8Array>>();

  /** Monotonic suffix so concurrent writes in one process never share a temp name. */
  private static tmpSeq = 0;

  constructor(
    private readonly cdnHost: string,
    private readonly patch: string,
    private readonly bundleCacheDir: string,
  ) {}

  async fetchFile(name: string): Promise<Uint8Array> {
    const cached = join(this.bundleCacheDir, name.replace(/\//g, '@'));

    try {
      return await readFile(cached);
    } catch {
      // not cached yet
    }

    const pending = this.inflight.get(name);

    if (pending) {
      return pending;
    }

    const fetching = this.fetchAndCache(name, cached).finally(() => this.inflight.delete(name));

    this.inflight.set(name, fetching);

    return fetching;
  }

  private async fetchAndCache(name: string, cached: string): Promise<Uint8Array> {
    const res = await fetch(`${this.cdnHost}/${this.patch}/${BUNDLES_DIR}/${name}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`CDN ${res.status} ${name}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());

    // `writeFile` is not atomic: a concurrent reader (another worker or process sharing the cache dir, which the
    // in-flight map can't cover) could get truncated bytes and fail to decompress. Write a unique temp file, then rename.
    const tmp = `${cached}.${process.pid}.${CdnCachingLoader.tmpSeq++}.tmp`;

    try {
      await writeFile(tmp, buf);
      await rename(tmp, cached);
    } catch (error) {
      await rm(tmp, { force: true });

      throw error;
    }

    return new Uint8Array(buf);
  }
}

/** Creates a patch-CDN-backed {@link GgpkSource}. The network is touched on the first file/sprite request; table reads only use `tablesDir`. */
export async function createCdnSource(options: CdnSourceOptions): Promise<CdnSource> {
  const { patch, cacheDir, tablesDir, cdnHost = DEFAULT_CDN_HOST } = options;

  const bundleCacheDir = join(cacheDir, patch);
  await mkdir(bundleCacheDir, { recursive: true });

  const loader = await FileLoader.create(new CdnCachingLoader(cdnHost, patch, bundleCacheDir));

  const ddsCache = new Map<string, RgbaImage | null>();
  // Memoize the in-flight build, not the map: a map assigned before its await is handed to concurrent callers while still empty.
  let spriteIndex: Promise<Map<string, SpriteImage>> | null = null;

  async function file(path: string): Promise<Uint8Array | null> {
    return loader.tryGetFileContents(path.toLowerCase());
  }

  async function table(name: string): Promise<TableRow[]> {
    const parsed: unknown = JSON.parse(await readFile(join(tablesDir, `${name}.json`), 'utf8'));

    if (!Array.isArray(parsed)) {
      throw new Error(`table "${name}" is not an array (got ${typeof parsed}) - the tables directory may be stale or corrupted`);
    }

    return parsed as TableRow[];
  }

  async function dds(path: string): Promise<RgbaImage | null> {
    if (ddsCache.has(path)) {
      return ddsCache.get(path) ?? null;
    }

    let image: RgbaImage | null = null;
    const bytes = await file(path); // null: not on the CDN for this patch, a genuine miss

    if (bytes) {
      try {
        image = decodeDds(bytes);
      } catch (error) {
        // Bytes we got but couldn't decode (unsupported format or a decoder regression): skipped like a miss, but surfaced separately from expected absences.
        console.warn(`[poe2-toolkit/ggpk] failed to decode DDS at "${path}": ${(error as Error).message}`);
      }
    }

    ddsCache.set(path, image);

    return image;
  }

  function ensureSpriteIndex(): Promise<Map<string, SpriteImage>> {
    spriteIndex ??= (async () => {
      const index = new Map<string, SpriteImage>();

      for (const entry of parseSpriteIndex(await loader.getFileContents('art/uiimages1.txt'))) {
        index.set(entry.name, entry);
      }

      return index;
    })();

    return spriteIndex;
  }

  async function resolveSprite(name: string): Promise<SpriteRef | null> {
    const index = await ensureSpriteIndex();
    // 4K variants live under an `/InGame/4K/` path the base name omits.
    const entry = index.get(name) ?? index.get(name.replace('/InGame/', '/InGame/4K/'));

    if (!entry) {
      return null;
    }

    return { path: entry.spritePath, top: entry.top, left: entry.left, width: entry.width, height: entry.height };
  }

  async function uiSprite(name: string): Promise<RgbaImage | null> {
    const ref = await resolveSprite(name);

    if (!ref) {
      return null;
    }

    const full = await dds(ref.path);

    if (!full) {
      return null;
    }

    // Most entries are whole images (top/left 0); crop only a shared sheet.
    if (ref.top === 0 && ref.left === 0 && ref.width === full.width && ref.height === full.height) {
      return full;
    }

    // The legacy crop maps `top` -> x and `left` -> y; preserved exactly.
    const x = ref.top, y = ref.left, w = ref.width, h = ref.height;
    const rgba = new Uint8Array(w * h * 4);

    for (let row = 0; row < h; row++) {
      const src = ((y + row) * full.width + x) * 4;
      rgba.set(full.rgba.subarray(src, src + w * 4), row * w * 4);
    }

    return { width: w, height: h, rgba };
  }

  return { table, file, dds, resolveSprite, uiSprite };
}
