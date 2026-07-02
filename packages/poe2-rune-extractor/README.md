# @poe2-toolkit/rune-extractor

[![npm](https://img.shields.io/npm/v/@poe2-toolkit/rune-extractor.svg)](https://www.npmjs.com/package/@poe2-toolkit/rune-extractor)
[![types included](https://img.shields.io/badge/types-included-blue.svg)](#)
[![ESM only](https://img.shields.io/badge/module-ESM-f7df1e.svg)](#)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Builds **Path of Exile 2 rune / soul-core** data and icons straight from the
official GGPK / patch server, in a flat shape a build front-end can consume.

It mirrors [`@poe2-toolkit/item-extractor`](../poe2-item-extractor) and
[`@poe2-toolkit/gem-extractor`](../poe2-gem-extractor): source-agnostic, built on a
[`@poe2-toolkit/ggpk`](../poe2-ggpk) source, returning formatted data and decoded
icon PNGs rather than writing into the package. A soul core is a base item, so its
icon is the base's visual identity - the same art the item extractor decodes; this
package decodes it too, so it stands alone.

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

const { data, icons } = await extractRunes(source);
```

> `patch` is whatever version the patch server currently serves; a stale version
> 404s, so pass the one you actually want to extract.

`extractRunes(source)` resolves to a `RuneBundle` - the rune `data` plus decoded
`icons`:

```ts
interface RuneBundle {
  data: RuneData;         // runes keyed by display name
  icons: RuneIconsResult; // decoded icon PNGs + a pack/skip report
}
```

The two steps are exported separately too: `buildRunes(source)` for the data and
`buildRuneIcons(source, data)` for the PNGs.

Field-level docs live on the exported types themselves - `Rune`, `RuneIconsResult`
- so your editor shows each field's meaning on hover and they ship in the `.d.ts`.
The rest of this section is the shape and the rules the types alone don't tell you.

### `data`: the runes (`RuneData`)

`RuneData` is a plain object keyed by **display name** - the soul core's
`BaseItemTypes.Name`. Each value is a `Rune`:

```json
"Desert Rune": {
  "levelRequirement": 15,
  "effects": [
    "Martial Weapon: Adds 7 to 11 Fire Damage",
    "Wand or Staff: Gain 8% of Damage as Extra Fire Damage",
    "Armour: +14% to Fire Resistance"
  ],
  "icon": "Art/2DItems/Currency/Runes/FireRune.dds"
}
```

- **`levelRequirement`** is the character level to equip, or `null` when the core
  requires none (a `RequiredLevel` of 0 becomes `null`).
- **`effects`** are rendered stat lines, each `"<slot>: <rendered stat>"`. The
  slot comes from `SoulCoreStatCategories.Display` (e.g. `All Equipment`,
  `Martial Weapon`, `Armour`); one soul core groups several slot categories, so
  a single rune's effects span more than one slot.
- **`icon`** is the raw GGPK DDS path of the soul core base's art (`null` if none),
  decoded to PNG by `buildRuneIcons`.

### `icons`: the decoded PNGs (`RuneIconsResult`)

`icons.icons` is PNG bytes keyed by output path - each rune's `icon` DDS path with
its extension swapped to `.png`, which the CLI writes as files under `icons/`.
Icons are deduplicated, so it's one PNG per distinct `icon`. `icons.report` counts
what happened: `packed` decoded successfully, `missing` could not be served or
decoded (skipped, never substituted). Rune art lives under `Art/2DItems/...`, which
the patch CDN does not host, so against a pure `createCdnSource` these all report
`missing`; a full local GGPK install serves them (same as the item extractor).

## CLI: write the bundle to disk

```sh
poe2-rune-extract \
  --patch 4.5.4.1 \
  --tables ./tables/English \
  --cache ./.cache \
  --out ./out/runes
```

All four flags are required. It writes `runes.json` and the icon PNG tree under
`icons/`.

## How it works

- Soul cores carry only numeric `(stat id, value)` pairs. The package joins
  `SoulCores` -> `SoulCoreStats` -> `Stats` and renders each pair to text with the
  stat-description engine from `@poe2-toolkit/ggpk` (GGG's own
  `stat_descriptions.csd`, read straight from the GGPK).
- Each effect line is prefixed with the equipment slot it applies to, from
  `SoulCoreStatCategories` (e.g. `All Equipment: +9 to Dexterity`,
  `Martial Weapon: Adds 4 to 6 Fire Damage`).
- A soul core's icon is its base's `ItemVisualIdentity` (the same art the item
  extractor decodes), kept as a raw DDS path and decoded to PNG by
  `buildRuneIcons`. An icon the source cannot serve is skipped and reported, never
  pulled from a vendored asset.
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
