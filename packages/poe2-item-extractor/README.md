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
  "flavourText": null,
  "modDomain": "Item",
  "tags": ["armour", "body_armour", "default", "str_armour", "vaal_basetype"]
}

"Kaom's Heart": {
  "rarity": "unique",
  "icon": "Art/2DItems/Armours/BodyArmours/Uniques/KaomsHeart.dds",
  "itemClass": null,
  "category": "Body Armour",
  "twoHanded": false,
  "req": { "str": 0, "dex": 0, "int": 0 },
  "flavourText": ["The warrior who fears will fall."],
  "modDomain": null,
  "tags": []
}
```

Every field is present on every entry, but which ones carry a value follows from
`rarity`:

- **`itemClass` vs `category` are mutually exclusive.** A base has `itemClass`
  (`ItemClasses.Id`) and `category: null`; a unique has `category`
  (`UniqueStashTypes.Id`, the stash slot) and `itemClass: null`. .dat has no
  unique-to-base-type link (see [How it works](#how-it-works)), so a unique's
  closest-to-a-class is its stash category. The two vocabularies differ -
  `SwordTwoHand` vs `Two Hand Sword`, `Warstaff` vs `Quarterstaff`. **Unique flasks**
  are the one exception: the stash lumps them all under `Flask`, but each is refined
  to `Life Flask` or `Mana Flask`, read from the base flask model its
  `ItemVisualIdentity.AOFile` points at (the only unique-to-base signal .dat leaks;
  unique equipment has a bespoke model, so no base is recoverable there).
- **`req` on a unique is always `{ str: 0, dex: 0, int: 0 }`** - the requirement
  lives on the unique's (unknown) base type, so treat it as *not populated*, not
  as "no requirement". A base's `req` is the real str/dex/int to equip.
- **`twoHanded` is derived**, from `itemClass` for bases and from the weapon
  `category` for uniques, so it is correct for uniques even without a base type.
- **`flavourText` is the unique's lore**, as separate lines (GGG stores explicit
  line breaks). It is `null` on bases and on any unique without one - only uniques
  carry it.
- **`modDomain` is the base's mod domain** (`ModDomains` vocabulary: `Item` for
  ordinary equipment, `Flask` for flasks *and* charms, ...). A mod only rolls on an
  item of the mod's own domain, so this is the **first** filter when joining to
  [`@poe2-toolkit/mod-extractor`](../poe2-mod-extractor) - match the domain, *then*
  the `tags`. `null` on uniques and on bases whose domain has no name.
- **`tags` are the item's effective mod-matching tags** (`Tags.Id` vocabulary:
  `armour`, `body_armour`, `str_armour`, `weapon`, `default`, ...) - the base's own
  tags plus the tags its item class contributes plus `default`. This is the set GGG
  matches a mod against *within a domain*, so together with `modDomain` it is how
  items join to [`@poe2-toolkit/mod-extractor`](../poe2-mod-extractor) (see below).
  Empty on uniques, whose base type - and thus its tags - is not in .dat.
- **Bases win name clashes.** Bases are added first (first displayable base for a
  name wins); uniques fold in after and never overwrite a base of the same name.

### Joining items to mods

An item and a mod from [`@poe2-toolkit/mod-extractor`](../poe2-mod-extractor) share
two vocabularies - the mod domain (`item.modDomain` / `mod.domain`) and the spawn
tags (`item.tags` / `mod.spawnWeights[].tag`) - so the mods that can roll on an item
are a pure filter: no lookup tables, no shared code. A mod can roll when it is in the
item's **domain** *and* the **first** of its `spawnWeights` whose tag the item carries
has a positive weight. The domain filter is not optional - many mods carry a positive
`default` weight, so tag-matching alone leaks mods from unrelated domains (Monster,
Heist, Atlas, ...):

```ts
function compatibleMods(item: { modDomain: string | null; tags: string[] }, mods: ModData): string[] {
  return Object.entries(mods)
    .filter(([, mod]) => {
      if (mod.domain !== item.modDomain) return false;
      const gate = mod.spawnWeights.find((sw) => sw.tag === 'default' || item.tags.includes(sw.tag));
      return gate != null && gate.weight > 0;
    })
    .map(([id]) => id);
}
```

So a **life flask** (`modDomain: "Flask"`, `tags: ["default", "flask", "life_flask"]`)
draws only `Flask`-domain mods whose spawn tags include `life_flask` (or `default`),
and a **body armour** (`modDomain: "Item"`) draws only `Item`-domain mods - never the
flask's pool, and never a Monster affix.

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
  The lone exception is flasks: a unique flask reuses a base flask model, so its
  `ItemVisualIdentity.AOFile` still names the base (`.../FlaskLife7Drop.ao`), which
  refines the `Flask` stash slot to `Life Flask` / `Mana Flask`. Path of Building
  hand-maintains this base per unique flask; here it is read straight from the model
  path. Unique equipment has a bespoke model, so no base leaks there.
- **Flavour text** comes from `FlavourText`, which has no foreign key to the
  unique: it lines up by the `ItemVisualIdentity` / `FlavourText` id with the
  `_`-suffixed art variant dropped (`FourUniqueRing33_a` -> `FourUniqueRing33`),
  the same join Path of Building uses.
- **Two-handedness** is derived from the item class, not from base-level tags
  (bases don't inherit weapon-class tags), which is the reliable signal.
- **`modDomain`** is `BaseItemTypes.ModDomain` mapped through the `ModDomains` enum -
  the same enum `@poe2-toolkit/mod-extractor` maps `Mods.Domain` through, so the two
  strings join directly. Flasks and charms share the `Flask` domain; ordinary gear is
  `Item`.
- **`tags`** union the base's own `BaseItemTypes.Tags` with the tags its item class
  contributes and `default`. PoE2 stores only the specific tags on a base and leaves
  the class tags (`armour`, `weapon`, `bow`, ...) to the class, and GGPK has no
  single table for that inheritance, so the class map is carried here and validated
  1:1 against Path of Building's base tags for every base (an optional test).
- **Icons** are kept as their raw GGPK DDS paths in the data and decoded to PNG by
  `buildItemIcons`. An icon the source cannot serve is skipped and reported, never
  pulled from a vendored asset.
- **Flask icons** ship in GGPK as a horizontal 3-frame layer sheet - the glass
  container with its cap (frame 0), a middle frame, and the coloured liquid fill
  (frame 2) - so the raw art is three bottles wide. `buildItemIcons` composites the
  fill over the container, the same as the in-game icon, so a flask icon is one full
  bottle with its cap, not three layers. Charms and all other items are single-frame
  and copied as-is.

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
