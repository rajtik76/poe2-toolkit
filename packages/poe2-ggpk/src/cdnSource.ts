/**
 * The default {@link GgpkSource}: serves decoded tables and raw files from GGG's
 * PoE2 patch CDN, backed by `pathofexile-dat`'s bundle loader and a local cache.
 * This is the acquisition layer — the only place that talks to the network — so
 * the extractor packages stay agnostic to where bytes come from.
 *
 * Tables are read from a directory of `pathofexile-dat`-decoded `<Name>.json`
 * files (its `extract` step output); raw files and sprites are pulled from the
 * patch CDN on demand and cached on disk.
 *
 * Since `pathofexile-dat@15.2.0` the bundle `FileLoader` and the sprite-index
 * parser are part of the package's public API (`./bundles.js`, `./sprites.js`),
 * and `FileLoader` takes any `BundleLoader` — an object with a single
 * `fetchFile(name)` method. The toolkit supplies its own {@link CdnCachingLoader}
 * so it owns where bytes come from and how a miss is handled, instead of reaching
 * past the package's exports into its `dist/` internals.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type BundleLoader, FileLoader } from 'pathofexile-dat/bundles.js';
import { type SpriteImage, parseSpriteIndex } from 'pathofexile-dat/sprites.js';

import { decodeDds } from './image/dds.js';
import type { RgbaImage } from './image/types.js';
import type { GgpkSource, TableRow } from './source.js';

/** A UIImages sprite: its backing DDS path and sub-rect within that image. */
export interface SpriteRef {
  path: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Image-fetching capability the tree's graphics build needs on top of {@link GgpkSource}. */
export interface GgpkImageSource {
  /** Decode a DDS by its GGPK path, or `null` if absent/undecodable (cached). */
  dds(path: string): Promise<RgbaImage | null>;
  /** Resolve a UIImages logical name to its backing DDS and rect, or `null`. */
  resolveSprite(name: string): Promise<SpriteRef | null>;
  /** A UIImages sprite decoded and cropped to its rect (legacy `fetchSprite`). */
  uiSprite(name: string): Promise<RgbaImage | null>;
}

/** A CDN-backed source with both table/file access and image fetching. */
export type CdnSource = GgpkSource & GgpkImageSource;

export interface CdnSourceOptions {
  /** GGPK patch version, e.g. `4.5.3.1.7`. */
  patch: string;
  /** Cache root for downloaded bundles (a `<patch>/` subdir is used). */
  cacheDir: string;
  /** Directory of `pathofexile-dat`-decoded `<Name>.json` tables. */
  tablesDir: string;
  /** Patch CDN host; defaults to the PoE2 server. */
  cdnHost?: string;
}

const DEFAULT_CDN_HOST = 'https://patch-poe2.poecdn.com';

/** GGG's bundle root under each patch version on the CDN. */
const BUNDLES_DIR = 'Bundles2';

/**
 * A {@link BundleLoader} over the patch CDN, caching every bundle on disk.
 *
 * `pathofexile-dat`'s own `CdnBundleLoader` calls `process.exit(1)` on a 404 and
 * bakes in its cache path; some texture bundles are not on the patch CDN (only
 * in a full install), so a missing bundle must skip its file, not kill the run.
 * This throws on a miss and caches by the `@`-flattened name `FileLoader`
 * expects, leaving the loader free to surface the error to the caller.
 */
class CdnCachingLoader implements BundleLoader {
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
      /* not cached yet */
    }

    const res = await fetch(`${this.cdnHost}/${this.patch}/${BUNDLES_DIR}/${name}`);

    if (!res.ok) {
      throw new Error(`CDN ${res.status} ${name}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(cached, buf);

    return new Uint8Array(buf);
  }
}

/**
 * Create a patch-CDN-backed {@link GgpkSource}. Connecting to the network is
 * deferred to the first file/sprite request; table reads only touch the local
 * `tablesDir`.
 */
export async function createCdnSource(options: CdnSourceOptions): Promise<CdnSource> {
  const { patch, cacheDir, tablesDir, cdnHost = DEFAULT_CDN_HOST } = options;

  const bundleCacheDir = join(cacheDir, patch);
  await mkdir(bundleCacheDir, { recursive: true });

  // `FileLoader.create` reads the bundle index through this loader on first use;
  // every bundle (index included) is fetched from the CDN and cached on disk.
  const loader = await FileLoader.create(new CdnCachingLoader(cdnHost, patch, bundleCacheDir));

  const ddsCache = new Map<string, RgbaImage | null>();
  let spriteIndex: Map<string, SpriteImage> | null = null;

  async function file(path: string): Promise<Uint8Array | null> {
    return loader.tryGetFileContents(path.toLowerCase());
  }

  async function table(name: string): Promise<TableRow[]> {
    return JSON.parse(await readFile(join(tablesDir, `${name}.json`), 'utf8')) as TableRow[];
  }

  async function dds(path: string): Promise<RgbaImage | null> {
    if (ddsCache.has(path)) {
      return ddsCache.get(path) ?? null;
    }

    let image: RgbaImage | null = null;

    try {
      const bytes = await file(path);
      image = bytes ? decodeDds(bytes) : null;
    } catch {
      image = null; // CDN 404 or undecodable
    }

    ddsCache.set(path, image);

    return image;
  }

  async function ensureSpriteIndex(): Promise<Map<string, SpriteImage>> {
    if (!spriteIndex) {
      spriteIndex = new Map();

      for (const entry of parseSpriteIndex(await loader.getFileContents('art/uiimages1.txt'))) {
        spriteIndex.set(entry.name, entry);
      }
    }

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
