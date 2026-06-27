# @poe2-toolkit/rune-extractor

[![npm](https://img.shields.io/npm/v/@poe2-toolkit/rune-extractor.svg)](https://www.npmjs.com/package/@poe2-toolkit/rune-extractor)
[![types included](https://img.shields.io/badge/types-included-blue.svg)](#)
[![ESM only](https://img.shields.io/badge/module-ESM-f7df1e.svg)](#)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Builds **Path of Exile 2 rune / soul-core** data straight from the official GGPK /
patch server, in a flat shape a build front-end can consume.

It mirrors [`@poe2-toolkit/item-extractor`](../poe2-item-extractor) and
[`@poe2-toolkit/gem-extractor`](../poe2-gem-extractor): source-agnostic, built on a
[`@poe2-toolkit/ggpk`](../poe2-ggpk) source, returning formatted data rather than
writing into the package. Runes have no icon of their own, so this package
produces **data only** - no icon pipeline.

**Code only.** This package ships no game data and no art. Everything it produces
is read from the patch server at run time and handed back to you.

## Install

```sh
npm install @poe2-toolkit/rune-extractor @poe2-toolkit/ggpk
```

Node 18+. ESM only. TypeScript types are included.

## The contract

The library **returns formatted data**. It performs no I/O of its own beyond what
the source serves, and it never writes to disk.

```ts
import { createCdnSource } from '@poe2-toolkit/ggpk';
import { extractRunes } from '@poe2-toolkit/rune-extractor';

const source = await createCdnSource({
  patch: '4.5.4.1',
  tablesDir: './tables/English',
  cacheDir: './.cache',
});

const { data } = await extractRunes(source);
```

> `patch` is whatever version the patch server currently serves; a stale version
> 404s, so pass the one you actually want to extract.

`extractRunes(source)` returns a `RuneBundle` whose `data` (`RuneData`) maps each
rune's display name to its `levelRequirement` and rendered `effects`. The single
step is exported too: `buildRunes(source)`.

## CLI: write the data to disk

```sh
poe2-rune-extract \
  --patch 4.5.4.1 \
  --tables ./tables/English \
  --cache ./.cache \
  --out ./out/runes
```

All four flags are required. It writes `runes.json`.

## How it works

- Soul cores carry only numeric `(stat id, value)` pairs. The package joins
  `SoulCores` -> `SoulCoreStats` -> `Stats` and renders each pair to text with the
  stat-description engine from `@poe2-toolkit/ggpk` (GGG's own
  `stat_descriptions.csd`, read straight from the GGPK).
- Each effect line is prefixed with the equipment slot it applies to, from
  `SoulCoreStatCategories` (e.g. `All Equipment: +9 to Dexterity`,
  `Martial Weapon: Adds 4 to 6 Fire Damage`).
- `[DNT]` dev placeholders are dropped; a `RequiredLevel` of 0 becomes `null`.

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
