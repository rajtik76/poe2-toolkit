# @poe2-toolkit/mod-extractor

[![npm](https://img.shields.io/npm/v/@poe2-toolkit/mod-extractor.svg)](https://www.npmjs.com/package/@poe2-toolkit/mod-extractor)
[![types included](https://img.shields.io/badge/types-included-blue.svg)](#)
[![ESM only](https://img.shields.io/badge/module-ESM-f7df1e.svg)](#)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Builds **Path of Exile 2 item-mod** data - affix roll ranges, tiers and the
item-type tags that gate where each mod can roll - straight from the official
GGPK / patch server, in a flat shape a build front-end can consume.

It mirrors [`@poe2-toolkit/item-extractor`](../poe2-item-extractor) and
[`@poe2-toolkit/rune-extractor`](../poe2-rune-extractor): source-agnostic, built on
a [`@poe2-toolkit/ggpk`](../poe2-ggpk) source, returning formatted data rather than
writing into the package. Each mod's `spawnWeights` use the same `Tags.Id`
vocabulary the item extractor puts on each item's `tags`, so **mod data and item
data join on tags** with no shared code - the intended use is to show, for a given
item, only the mods that can roll on it.

**Code only.** This package ships no game data and no art. Everything it produces
is read from the patch server at run time and handed back to you.

## Install

```sh
npm install @poe2-toolkit/mod-extractor @poe2-toolkit/ggpk
```

Node 18+. ESM only. TypeScript types are included.

## The contract

The library **returns formatted data**. It performs no I/O of its own beyond what
the source serves, and it never writes to disk.

```ts
import { createCdnSource } from '@poe2-toolkit/ggpk';
import { extractMods } from '@poe2-toolkit/mod-extractor';

const source = await createCdnSource({
  patch: '4.5.4.1',
  tablesDir: './tables/English',
  cacheDir: './.cache',
});

const { data } = await extractMods(source);
```

> `patch` is whatever version the patch server currently serves; a stale version
> 404s, so pass the one you actually want to extract.

`extractMods(source)` resolves to a `ModBundle`. Mods carry no art, so unlike the
item, gem and rune bundles it has only `data` (there is no `icons`):

```ts
interface ModBundle {
  data: ModData; // mods keyed by Mods.Id
}
```

`buildMods(source)` is exported too and returns the `ModData` directly.

Field-level docs live on the exported types themselves - `Mod`, `ModRoll`,
`ModSpawnWeight` - so your editor shows each field's meaning on hover and they ship
in the `.d.ts`. The rest of this section is the shape and the rules the types alone
don't tell you.

### `data`: the mods (`ModData`)

`ModData` is a plain object keyed by **`Mods.Id`** - the stable internal mod id
(e.g. `LocalIncreasedPhysicalDamagePercent8`), since a mod has no single display
name. Each value is a `Mod`:

```json
"LocalIncreasedPhysicalDamagePercent8": {
  "name": "Merciless",
  "domain": "Item",
  "generationType": "Prefix",
  "group": "LocalPhysicalDamagePercent",
  "tier": 8,
  "level": 82,
  "stats": ["(170-179)% increased Physical Damage"],
  "rolls": [{ "stat": "local_physical_damage_+%", "min": 170, "max": 179 }],
  "families": ["LocalPhysicalDamagePercent"],
  "spawnWeights": [
    { "tag": "weapon", "weight": 1 },
    { "tag": "default", "weight": 0 }
  ]
}
```

- **`stats` are the rendered roll**, each stat line with its range shown as
  `(min-max)` (`+(9-16) to Armour`, `Adds (1-2) to (4-5) Physical Damage`). A fixed
  roll (min equal to max) renders as a plain number. `rolls` carries the same rolls
  structured - `{ stat, min, max }` per stat - so you can do your own math; a
  two-stat line yields two rolls.
- **`tier` is the affix ladder position**, 1-based by ascending `level`: tier 1 is
  the weakest tier, tier 8 the strongest, matching the numeric suffix on the id.
  The ladder is scoped to `(group, domain, generationType)`, so an eight-tier item
  prefix ranks 1..8 even though its `group` also holds the fixed unique rolls of the
  same modifier. `null` when the mod has no group.
- **`spawnWeights` is the item-type gate** - which item types the mod can appear on.
  A mod can roll on an item when the **first** of its `spawnWeights` whose `tag` the
  item carries has a `weight` above zero; `weight` 0 blocks that tag, and the
  trailing `default` (which every item carries) is the catch-all. Order matters, so
  it is a list, not a map.
- **`domain` and `generationType`** are resolved from GGG's `ModDomains` /
  `ModGenerationType` enums. The rollable equipment affix pool is `domain: "Item"`
  with `generationType: "Prefix"` or `"Suffix"`; other values cover uniques,
  corruptions, monsters and so on.
- **`families`** are mutual-exclusion group ids: two mods sharing a family cannot
  both roll on one item.

### Joining mods to items

A mod and an item from [`@poe2-toolkit/item-extractor`](../poe2-item-extractor) share
two vocabularies - the domain (`mod.domain` / `item.modDomain`) and the spawn tags
(`mod.spawnWeights[].tag` / `item.tags`) - so the compatible mods for an item are a
pure filter: no lookup tables, no shared code. A mod rolls when it is in the item's
**domain** *and* the **first** of its `spawnWeights` whose `tag` the item carries has
a positive weight. Filter on the domain first - many mods carry a positive `default`
weight, so tag-matching alone would let unrelated domains (Monster, Heist, Atlas, ...)
leak onto every item:

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

Flasks and charms live in `domain: "Flask"`, ordinary equipment in `domain: "Item"`,
so a flask never draws an equipment affix and vice versa.

## CLI: write the bundle to disk

```sh
poe2-mod-extract \
  --patch 4.5.4.1 \
  --tables ./tables/English \
  --cache ./.cache \
  --out ./out/mods
```

All four flags are required. It writes `mods.json`.

## How it works

- Each mod carries its roll as a numeric `(stat id, [min, max])` range per stat.
  The stat-description engine from `@poe2-toolkit/ggpk` (GGG's own
  `stat_descriptions.csd`, read straight from the GGPK) renders each stat to text;
  the min-value and max-value passes are then merged into one ranged line. A
  value-dependent variant (different text at the two ends of a range) keeps the
  max-value line whole rather than producing a malformed range.
- **Tiers** are ranked within `(group, domain, generationType)` by ascending level,
  because one `ModType` group holds the same modifier for several contexts (its
  eight item prefixes sit beside dozens of fixed unique rolls); ranking the whole
  group would inflate the numbers.
- **Spawn weights** are read from `SpawnWeight_Tags` / `SpawnWeight_Values` in
  order, mapping each tag index to its `Tags.Id`. This is GGG's own first-match gate
  for where a mod can roll.
- Mods carry no icons, so there is nothing to decode; the bundle is data only.

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
