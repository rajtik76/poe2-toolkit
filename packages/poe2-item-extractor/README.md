# @poe2-toolkit/item-extractor

[![npm](https://img.shields.io/npm/v/@poe2-toolkit/item-extractor.svg)](https://www.npmjs.com/package/@poe2-toolkit/item-extractor)
[![types included](https://img.shields.io/badge/types-included-blue.svg)](#)
[![ESM only](https://img.shields.io/badge/module-ESM-f7df1e.svg)](#)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Builds **Path of Exile 2 item** data - normal-rarity bases **and** uniques - plus
their icons, straight from the official GGPK / patch server, in a flat shape a
build front-end can consume.

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

`extractItems(source)` resolves to an `ItemBundle` - the item `data` plus decoded
`icons`:

```ts
interface ItemBundle {
  data: ItemData;         // items keyed by display name (bases + uniques)
  icons: ItemIconsResult; // decoded icon PNGs + a pack/skip report
}
```

The two steps are exported separately too: `buildItems(source)` for the data and
`buildItemIcons(source, data)` for the PNGs.

Field-level docs live on the exported types themselves - `Item`, `ItemReq`,
`ItemIconsResult` - so your editor shows each field's meaning on hover and they
ship in the `.d.ts`. The rest of this section is the shape and the rules that the
types alone don't tell you.

### `data`: the items (`ItemData`)

`ItemData` is a plain object keyed by **display name** - the base type line for a
normal item (`Vaal Cuirass`), the unique's name for a unique (`Kaom's Heart`).
Each value is an `Item`. A normal base and a unique:

```json
"Vaal Cuirass": {
  "rarity": "normal",
  "icon": "Art/2DItems/Armours/BodyArmours/Basetypes/BodyStr08.dds",
  "itemClass": "Body Armour",
  "category": null,
  "twoHanded": false,
  "req": { "str": 60, "dex": 0, "int": 0 },
  "flavourText": null
}

"Kaom's Heart": {
  "rarity": "unique",
  "icon": "Art/2DItems/Armours/BodyArmours/Uniques/KaomsHeart.dds",
  "itemClass": null,
  "category": "Body Armour",
  "twoHanded": false,
  "req": { "str": 0, "dex": 0, "int": 0 },
  "flavourText": ["The warrior who fears will fall."]
}
```

Every field is present on every entry, but which ones carry a value follows from
`rarity`:

- **`itemClass` vs `category` are mutually exclusive.** A base has `itemClass`
  (`ItemClasses.Id`) and `category: null`; a unique has `category`
  (`UniqueStashTypes.Id`, the stash slot) and `itemClass: null`. .dat has no
  unique-to-base-type link (see [How it works](#how-it-works)), so a unique's
  closest-to-a-class is its stash category. The two vocabularies differ -
  `SwordTwoHand` vs `Two Hand Sword`, `Warstaff` vs `Quarterstaff`.
- **`req` on a unique is always `{ str: 0, dex: 0, int: 0 }`** - the requirement
  lives on the unique's (unknown) base type, so treat it as *not populated*, not
  as "no requirement". A base's `req` is the real str/dex/int to equip.
- **`twoHanded` is derived**, from `itemClass` for bases and from the weapon
  `category` for uniques, so it is correct for uniques even without a base type.
- **`flavourText` is the unique's lore**, as separate lines (GGG stores explicit
  line breaks). It is `null` on bases and on any unique without one - only uniques
  carry it.
- **Bases win name clashes.** Bases are added first (first displayable base for a
  name wins); uniques fold in after and never overwrite a base of the same name.

### `icons`: the decoded PNGs (`ItemIconsResult`)

`icons.icons` is PNG bytes keyed by output path - each item's `icon` DDS path with
its extension swapped to `.png` (e.g. `Art/.../KaomsHeart.png`), which the CLI
writes as files under `icons/`. Icons are deduplicated, so it's one PNG per
distinct `icon` across all items. `icons.report` counts what happened:
`packed` decoded successfully, `missing` could not be served or decoded (skipped,
never substituted from a vendored asset).

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

- **Normal bases** join `BaseItemTypes` to its `ItemClasses`, `ItemVisualIdentity`
  (icon) and `AttributeRequirements`. Only displayable equipment bases (those
  with a visual identity) are kept; `[DNT]` dev placeholders are dropped.
- **Uniques** come from `UniqueStashLayout` (the authoritative unique list),
  joined with `Words` for the name, `ItemVisualIdentity` for the icon and
  `UniqueStashTypes` for the category. .dat has no unique-to-base-type link (the
  base a unique rolls on is decided at drop generation, not stored), so a unique
  carries its stash `category` (the item slot) instead of a concrete base type.
- **Flavour text** comes from `FlavourText`, which has no foreign key to the
  unique: it lines up by the `ItemVisualIdentity` / `FlavourText` id with the
  `_`-suffixed art variant dropped (`FourUniqueRing33_a` -> `FourUniqueRing33`),
  the same join Path of Building uses.
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
