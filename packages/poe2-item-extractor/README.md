# @poe2-toolkit/item-extractor

[![npm](https://img.shields.io/npm/v/@poe2-toolkit/item-extractor.svg)](https://www.npmjs.com/package/@poe2-toolkit/item-extractor)
[![types included](https://img.shields.io/badge/types-included-blue.svg)](#)
[![ESM only](https://img.shields.io/badge/module-ESM-f7df1e.svg)](#)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Builds **Path of Exile 2 base-item** data and icons straight from the official
GGPK / patch server, in a flat shape a build front-end can consume.

It mirrors [`@poe2-toolkit/tree-extractor`](../poe2-tree-extractor): source-agnostic,
built on a [`@poe2-toolkit/ggpk`](../poe2-ggpk) source, returning formatted data
rather than writing into the package.

**Code only.** This package ships no game data and no art. Everything it produces
is read from the patch server at run time and handed back to you.

## Install

```sh
npm install @poe2-toolkit/item-extractor @poe2-toolkit/ggpk
```

Node 18+. ESM only. TypeScript types are included.

## The contract

The library **returns formatted data**. It performs no I/O of its own beyond what
the source serves, and it never writes to disk.

```ts
import { createCdnSource } from '@poe2-toolkit/ggpk';
import { extractItems } from '@poe2-toolkit/item-extractor';

const source = await createCdnSource({
  patch: '4.5.4.1',
  tablesDir: './tables/English',
  cacheDir: './.cache',
});

const { data, icons } = await extractItems(source);
```

> `patch` is whatever version the patch server currently serves; a stale version
> 404s, so pass the one you actually want to extract.

`extractItems(source)` returns an `ItemBundle`:

| Field | Type | What it is |
| --- | --- | --- |
| `data` | `ItemData` | Bases keyed by display name, each with its raw icon path, item class id, a `twoHanded` flag, and the str/dex/int requirements. The first displayable base seen for a name wins. |
| `icons` | `ItemIconsResult` | Decoded icon PNGs keyed by output path (`<dds path>.png`), with a report of what packed or was skipped. |

The individual steps are exported too: `buildItems(source)` for the data and
`buildItemIcons(source, data)` for the PNGs.

## CLI: write the bundle to disk

```sh
poe2-item-extract \
  --patch 4.5.4.1 \
  --tables ./tables/English \
  --cache ./.cache \
  --out ./out/items
```

All four flags are required. It writes `items.json` and the icon PNG tree under
`icons/`. Output is PNG + JSON; converting to WebP for the web is a separate
publish step left to you.

## How it works

- **Data** joins `BaseItemTypes` to its `ItemClasses`, `ItemVisualIdentity`
  (icon) and `AttributeRequirements`. Only displayable equipment bases (those
  with a visual identity) are kept; `[DNT]` dev placeholders are dropped.
- **Two-handedness** is derived from the item class, not from base-level tags
  (bases don't inherit weapon-class tags), which is the reliable signal.
- **Icons** are kept as their raw GGPK DDS paths in the data and decoded to PNG by
  `buildItemIcons`. An icon the source cannot serve is skipped and reported, never
  pulled from a vendored asset.

## Attributions and legal

This is an unofficial, fan-made project, **not** affiliated with, endorsed by, or
sponsored by Grinding Gear Games. "Path of Exile 2" is a trademark of Grinding
Gear Games, and all game content, data, and art are their property. This package
ships code only and stores nothing derived from the game. Thank you to Grinding
Gear Games for making Path of Exile 2.

GGPK access is provided by [`@poe2-toolkit/ggpk`](../poe2-ggpk), which builds on
[`pathofexile-dat`](https://github.com/SnosMe/poe-dat-viewer) (MIT, © SnosMe).
Full attribution is in the repository [NOTICE](../../NOTICE.md).

## License

MIT - see [LICENSE](./LICENSE).
