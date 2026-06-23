# @poe2-toolkit/ggpk

[![npm](https://img.shields.io/npm/v/@poe2-toolkit/ggpk.svg)](https://www.npmjs.com/package/@poe2-toolkit/ggpk)
[![types included](https://img.shields.io/badge/types-included-blue.svg)](#)
[![ESM only](https://img.shields.io/badge/module-ESM-f7df1e.svg)](#)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Shared access layer for **Path of Exile 2**'s official GGPK / patch server. It
fetches and decodes game tables and raw files, decodes the GGPK image and
stat-description formats, and hands the result back to you as plain data.

This is the foundation every PoE2 data extractor in this toolkit builds on. It is
the only package that talks to the network, so the extractors stay agnostic to
where their bytes come from.

**Code only.** This package ships no game data and no art. It reads from the
official patch server (or your own game files) at run time and returns the
decoded result; it never bundles or redistributes anything from the game.

## Install

```sh
npm install @poe2-toolkit/ggpk
```

Node 18+. ESM only. TypeScript types are included.

## The contract

Everything is built around one small interface — the boundary an extractor
depends on, and the only thing that knows where bytes come from:

```ts
interface GgpkSource {
  /** Decoded rows of a GGPK data table, e.g. "PassiveSkills", in table order. */
  table(name: string): Promise<TableRow[]>;
  /** Raw bytes of a GGPK file by logical path, or null if it cannot be served. */
  file(path: string): Promise<Uint8Array | null>;
}
```

An extractor asks a `GgpkSource` for tables and files. Whether those come from
the patch CDN, a local game install, or a pre-extracted cache is the source's
concern, never the extractor's. The interface is dependency-free on purpose: an
extractor that imports only the type pulls in none of the acquisition stack.

## The default source: the patch CDN

`createCdnSource` is the batteries-included `GgpkSource`. It serves tables from a
directory of [`pathofexile-dat`](https://github.com/SnosMe/poe-dat-viewer)-decoded
JSON files and pulls raw files and sprites from the patch CDN on demand, caching
them on disk.

```ts
import { createCdnSource } from '@poe2-toolkit/ggpk';

const source = await createCdnSource({
  patch: '4.5.3.1.7',          // GGPK patch version
  tablesDir: './tables/English', // pathofexile-dat's decoded <Name>.json output
  cacheDir: './.cache',          // where downloaded bundles are cached
});

const characters = await source.table('Characters');
const psg = await source.file('metadata/passiveskillgraph.psg');
```

Producing the decoded tables is a one-time step with `pathofexile-dat`'s own CLI;
point `tablesDir` at its output. Connecting to the network is deferred to the
first file or sprite request, so table reads only touch local disk.

On top of `GgpkSource`, the CDN source adds image fetching for art-heavy
extraction:

```ts
interface GgpkImageSource {
  /** Decode a DDS by its GGPK path (BC1/BC3/BC7), cached. */
  dds(path: string): Promise<RgbaImage | null>;
  /** Resolve a UIImages logical name to its backing DDS and rect. */
  resolveSprite(name: string): Promise<SpriteRef | null>;
  /** A UIImages sprite decoded and cropped to its rect. */
  uiSprite(name: string): Promise<RgbaImage | null>;
}
```

## Shared decoders

The package also exports the format decoders every domain reuses, so they live in
one place rather than being reimplemented per extractor:

| Export | What it does |
| --- | --- |
| `decodeDds(bytes)` | Decode a DDS buffer (BC1/BC2/BC3/BC7) to straight RGBA8. |
| `encodePng(width, height, rgba)` | Encode RGBA8 to a PNG buffer (Node zlib, no native deps). |
| `decodePng(bytes)` | Decode an 8-bit RGBA/RGB PNG to RGBA8. |
| `buildStatIndex(csd)` | Parse a `stat_descriptions.csd` (UTF-16 text) into a per-stat index. |
| `renderBlock(index, statIds, values)` | Render numeric `(stat, value)` pairs into human-readable lines. |

All of it is pure TypeScript with no native dependencies, which keeps extraction
portable across machines and CI.

## A note on `pathofexile-dat`

The bundle loader and sprite-layout parser this package relies on live in
`pathofexile-dat`'s internal `dist/` paths. The exact internal layout can change
between major versions, so `pathofexile-dat` is pinned as a dependency. See
[NOTICE](../../NOTICE.md) for attribution.

## License

MIT — see [LICENSE](./LICENSE). Not affiliated with Grinding Gear Games; see
[NOTICE](../../NOTICE.md).
