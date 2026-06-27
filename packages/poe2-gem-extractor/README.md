# @poe2-toolkit/gem-extractor

[![npm](https://img.shields.io/npm/v/@poe2-toolkit/gem-extractor.svg)](https://www.npmjs.com/package/@poe2-toolkit/gem-extractor)
[![types included](https://img.shields.io/badge/types-included-blue.svg)](#)
[![ESM only](https://img.shields.io/badge/module-ESM-f7df1e.svg)](#)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Builds **Path of Exile 2 gem** data and icons straight from the official GGPK /
patch server, in a flat shape a build front-end can consume.

It mirrors [`@poe2-toolkit/tree-extractor`](../poe2-tree-extractor): source-agnostic,
built on a [`@poe2-toolkit/ggpk`](../poe2-ggpk) source, returning formatted data
rather than writing into the package.

**Code only.** This package ships no game data and no art. Everything it produces
is read from the patch server at run time and handed back to you.

## Install

```sh
npm install @poe2-toolkit/gem-extractor @poe2-toolkit/ggpk
```

Node 18+. ESM only. TypeScript types are included.

## The contract

The library **returns formatted data**. It performs no I/O of its own beyond what
the source serves, and it never writes to disk.

```ts
import { createCdnSource } from '@poe2-toolkit/ggpk';
import { extractGems } from '@poe2-toolkit/gem-extractor';

const source = await createCdnSource({
  patch: '4.5.4.1',
  tablesDir: './tables/English',
  cacheDir: './.cache',
});

const { data, icons } = await extractGems(source);
```

> `patch` is whatever version the patch server currently serves; a stale version
> 404s, so pass the one you actually want to extract.

`extractGems(source)` returns a `GemBundle`:

| Field | Type | What it is |
| --- | --- | --- |
| `data` | `GemData` | `gems` keyed by the last path segment of the base item id (PoB's `normalizeGemId`), each with name, kind (`active`/`support`/`spirit`), socket colour, tags, description, requirements and raw icon path; plus `requirements`, the per-level attribute/level curve keyed the same way. |
| `icons` | `GemIconsResult` | Decoded icon PNGs keyed by output path (`<dds path>.png`), with a report of what packed or was skipped. |

The individual steps are exported too: `buildGems(source)` for the data and
`buildGemIcons(source, data)` for the PNGs. The ported helpers
`gemStatRequirement` and `stripBbcode` are exported for reuse.

## CLI: write the bundle to disk

```sh
poe2-gem-extract \
  --patch 4.5.4.1 \
  --tables ./tables/English \
  --cache ./.cache \
  --out ./out/gems
```

All four flags are required. It writes `gems.json`, `gem_requirements.json`, and
the icon PNG tree under `icons/`. Output is PNG + JSON; converting to WebP for the
web is a separate publish step left to you.

## How it works

- **Data** joins the relational `SkillGems` -> `GemEffects` -> `GrantedEffects`
  -> `ActiveSkills` chain into one flat record per gem. Support gems take their
  icon from `SupportGems` and their text from `GemEffects.SupportText`; active
  gems take theirs from `ActiveSkills`. `[DNT]` dev placeholders are dropped.
- **The per-level requirement curve** is ported verbatim from Path of Building's
  `calcLib.getGemStatRequirement` (CalcTools.lua), so the numbers match the game:
  support gems and zero-percent attributes require nothing, and a result under 8
  rounds to 0. Required character level is `floor(ActorLevel)` from
  `GrantedEffectsPerLevel`.
- **Icons** are kept as their raw GGPK DDS paths in the data and decoded to PNG by
  `buildGemIcons`. An icon the source cannot serve is skipped and reported, never
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
