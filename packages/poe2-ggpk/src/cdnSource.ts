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
 * `pathofexile-dat` only exports `./bundles.js` and `./dat.js`, but the bundle
 * loader and sprite-layout parser live in unexported `dist/` paths. They are
 * reached by resolving an exported subpath and importing the sibling files —
 * the same internals the legacy extractor used, located portably.
 *
 * Reaching past a package's public exports is inherently fragile: a minor
 * `pathofexile-dat` release can move, rename or restructure these files with no
 * semver signal. {@link loadInternals} contains that risk to one place — it
 * fails loud with an actionable message (naming the version and the fix) the
 * moment a path or an expected export goes missing, rather than letting an
 * `undefined is not a function` surface deep in a later extraction step.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

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

// --- minimal typings over pathofexile-dat's unexported internals -------------

interface BundleLoader {
  fetchFile(name: string): Promise<Uint8Array>;
}

interface FileLoaderLike {
  bundleLoader: BundleLoader;
  getFileContents(path: string): Promise<Uint8Array>;
  tryGetFileContents(path: string): Promise<Uint8Array | null>;
}

interface BundleLoadersModule {
  CdnBundleLoader: { create(cacheDir: string, patch: string): Promise<BundleLoader> };
  FileLoader: { create(bundle: BundleLoader): Promise<FileLoaderLike> };
}

interface SpriteEntry {
  name: string;
  spritePath: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

interface SpriteLayoutModule {
  parseFile(contents: Uint8Array): Iterable<SpriteEntry>;
}

/**
 * Internal `dist/`-relative module paths reached past `pathofexile-dat`'s public
 * exports. If a release relocates either, {@link loadInternals} reports exactly
 * which one and the installed version.
 */
const BUNDLE_LOADERS_PATH = 'cli/bundle-loaders.js';
const SPRITE_LAYOUT_PATH = 'sprites/layout-parser.js';

/** Locate pathofexile-dat's `dist/` directory via an exported subpath. */
function datDistDir(): string {
  const require = createRequire(import.meta.url);

  return dirname(require.resolve('pathofexile-dat/bundles.js'));
}

/** Installed pathofexile-dat version for diagnostics, or `unknown` if unreadable. */
async function datVersion(dist: string): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile(join(dist, '..', 'package.json'), 'utf8')) as { version?: string };

    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Build the error thrown when an internal module can't be reached or doesn't
 * have the shape we depend on — a single, actionable diagnostic in place of an
 * opaque "Cannot find module" / "undefined is not a function" deep in a run.
 */
function internalsError(relPath: string, version: string, detail: string, cause?: unknown): Error {
  return new Error(
    `@poe2-toolkit/ggpk: pathofexile-dat@${version} ${detail} ` +
      `('dist/${relPath}'). This reaches past its public exports, so an internal ` +
      `change can break it without a semver signal. Pin pathofexile-dat to a known-good ` +
      `version (the toolkit targets ^15.1.0) or update @poe2-toolkit/ggpk's cdnSource to the new layout.`,
    cause === undefined ? undefined : { cause },
  );
}

/** Dynamically import an internal dist module, mapping any failure to {@link internalsError}. */
async function importInternal(dist: string, relPath: string, version: string): Promise<unknown> {
  try {
    return await import(pathToFileURL(join(dist, relPath)).href);
  } catch (cause) {
    throw internalsError(relPath, version, 'no longer provides', cause);
  }
}

/**
 * Assert the dynamically-imported internal modules still expose the exports we
 * call, narrowing them to their full types. Throws {@link internalsError} naming
 * the offending module when a renamed/removed export is found — caught here at
 * the boundary rather than as a cryptic runtime failure mid-extraction.
 * Exported for unit testing; not part of the package's public API.
 */
export function validateDatInternals(
  loaders: Partial<BundleLoadersModule>,
  layout: Partial<SpriteLayoutModule>,
  version: string,
): { loaders: BundleLoadersModule; layout: SpriteLayoutModule } {
  if (typeof loaders.CdnBundleLoader?.create !== 'function' || typeof loaders.FileLoader?.create !== 'function') {
    throw internalsError(BUNDLE_LOADERS_PATH, version, 'no longer exports the expected CdnBundleLoader/FileLoader from');
  }

  if (typeof layout.parseFile !== 'function') {
    throw internalsError(SPRITE_LAYOUT_PATH, version, 'no longer exports the expected parseFile from');
  }

  return { loaders: loaders as BundleLoadersModule, layout: layout as SpriteLayoutModule };
}

async function loadInternals(): Promise<{ loaders: BundleLoadersModule; layout: SpriteLayoutModule }> {
  const dist = datDistDir();
  const version = await datVersion(dist);

  const loaders = (await importInternal(dist, BUNDLE_LOADERS_PATH, version)) as Partial<BundleLoadersModule>;
  const layout = (await importInternal(dist, SPRITE_LAYOUT_PATH, version)) as Partial<SpriteLayoutModule>;

  return validateDatInternals(loaders, layout, version);
}

/**
 * Create a patch-CDN-backed {@link GgpkSource}. Connecting to the network is
 * deferred to the first file/sprite request; table reads only touch the local
 * `tablesDir`.
 */
export async function createCdnSource(options: CdnSourceOptions): Promise<CdnSource> {
  const { patch, cacheDir, tablesDir, cdnHost = DEFAULT_CDN_HOST } = options;
  const { loaders, layout } = await loadInternals();

  const bundle = await loaders.CdnBundleLoader.create(cacheDir, patch);
  const loader = await loaders.FileLoader.create(bundle);

  // The stock loader calls `process.exit(1)` on a 404; some texture bundles are
  // not on the patch CDN (only in a full install). Replace the fetch with one
  // that throws so a single missing bundle skips its file instead of killing
  // the run, and that caches by the same `@`-flattened name the loader expects.
  const bundleCacheDir = join(cacheDir, patch);
  loader.bundleLoader.fetchFile = async (name: string): Promise<Uint8Array> => {
    const cached = join(bundleCacheDir, name.replace(/\//g, '@'));

    try {
      return await readFile(cached);
    } catch {
      /* not cached yet */
    }

    const res = await fetch(`${cdnHost}/${patch}/Bundles2/${name}`);

    if (!res.ok) {
      throw new Error(`CDN ${res.status} ${name}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(cached, buf);

    return new Uint8Array(buf);
  };

  const ddsCache = new Map<string, RgbaImage | null>();
  let spriteIndex: Map<string, SpriteEntry> | null = null;

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

  async function ensureSpriteIndex(): Promise<Map<string, SpriteEntry>> {
    if (!spriteIndex) {
      spriteIndex = new Map();

      for (const entry of layout.parseFile(await loader.getFileContents('art/uiimages1.txt'))) {
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
