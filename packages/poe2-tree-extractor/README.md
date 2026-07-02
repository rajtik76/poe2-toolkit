# @poe2-toolkit/tree-extractor

[![npm](https://img.shields.io/npm/v/@poe2-toolkit/tree-extractor.svg)](https://www.npmjs.com/package/@poe2-toolkit/tree-extractor)
[![types included](https://img.shields.io/badge/types-included-blue.svg)](#)
[![ESM only](https://img.shields.io/badge/module-ESM-f7df1e.svg)](#)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Builds the **Path of Exile 2 passive tree**, both the node data and the sprite
atlases, straight from the official GGPK / patch server, in the shape
[`@poe2-toolkit/tree-core`](../poe2-tree-core) consumes.

It is source-agnostic: it never downloads anything itself. You hand it a
[`@poe2-toolkit/ggpk`](../poe2-ggpk) source and it returns the data, ready to use or to
write wherever you publish it.

**Code only.** This package ships no game data and no art. Everything it produces
is read from the patch server at run time and handed back to you; nothing from
the game is bundled or stored here.

## Install

```sh
npm install @poe2-toolkit/tree-extractor @poe2-toolkit/ggpk
```

Node 18+. ESM only. TypeScript types are included.

## The contract

The library **returns formatted data**. It performs no I/O of its own beyond
what the source serves, and it never writes to disk. You decide what to do with
the result.

```ts
import { createCdnSource } from '@poe2-toolkit/ggpk';
import { extractTree } from '@poe2-toolkit/tree-extractor';

const source = await createCdnSource({
  patch: '4.5.4.1',
  tablesDir: './tables/English',
  cacheDir: './.cache',
});

const { data, graphics, centre } = await extractTree(source);
```

> `patch` is whatever version the patch server currently serves — the value above
> is only illustrative and will age. The CDN serves just the current patch, so a
> stale version 404s; pass the one you actually want to extract.

`extractTree(source)` resolves to a `TreeBundle` - the tree `data`, the sprite
`graphics`, and the decoded `centre` art:

```ts
interface TreeBundle {
  data: TreeExport;               // the data.json payload (tree-core's normalize input)
  graphics: GraphicsResult;       // three packed sprite atlases + a pack/skip report
  centre: Record<string, Buffer>; // centre art PNGs keyed by output name
}
```

The three steps are exported separately too, if you only need one:
`buildTree(source)` for the data, `buildGraphics(source, data)` for the atlases,
`buildCentre(source)` for the centre art. The lower-level pieces are exported as
well: `parsePsg` (the `.psg` graph parser) and `packAtlas` (the atlas packer).

Field-level docs live on the exported types themselves - `TreeExport`,
`ExportNode`, `ExportEdge`, `GraphicsResult`, `PackedAtlas`, the `Psg*` types and
the rest - so your editor shows each field's meaning on hover and they ship in
the `.d.ts`. The rest of this section is the shape and the rules the types alone
don't tell you.

### `data`: the tree (`TreeExport`)

`data` is the `data.json` payload `@poe2-toolkit/tree-core` normalizes: `nodes`
and `groups` keyed by numeric id, plus `classes`, arc `edges`, `roots`,
`jewelSlots`, the synthesized attribute `skillOverrides`, the tree bounds
(`min_x`/`min_y`/`max_x`/`max_y`) and the passive-point budget. The shape a
consumer touches most is a node in `nodes`. A notable, keyed by its skill id:

```json
"52847": {
  "skill": 52847,
  "name": "Constitution",
  "icon": "Art/2DArt/SkillIcons/passives/life.dds",
  "stats": ["20% increased maximum Life"],
  "group": 42,
  "orbit": 2,
  "orbitIndex": 4,
  "x": 1734.482,
  "y": -905.117,
  "out": [48291, 11730],
  "in": [],
  "isNotable": true
}
```

That is a representative example, shape-accurate to `ExportNode` - the ids,
coordinates and stat text vary per extract. The rules the types don't spell out:

- **`nodes` and `groups` are keyed by numeric id.** A node's key is its `skill`
  (the PassiveSkillGraphId); `group`, `out`/`in`, `edges` and `jewelSlots` all
  reference those same ids. `classStartIndex` instead indexes into `classes`.
- **Kind flags are present-only `true` literals.** `isNotable`, `isKeystone`,
  `isJewelSocket`, `isMastery`, `isGenericAttribute` and `isAscendancyStart`
  appear only when true - a plain node carries none of them, they are never
  serialized as `false`.
- **Geometry is optional.** Graph nodes carry `group`/`orbit`/`orbitIndex`/`x`/`y`
  and `out`; data-only class-override nodes (swapped in per class) carry only
  `skill`/`name`/`icon`/`stats`, no coordinates or edges.
- **The passive-point budget is split.** `maxBasicPoints` is what the main tree
  can spend at the level cap; `maxWeaponSetPoints` is how far a single weapon set
  may additionally diverge. Both are computed from GGPK, never hardcoded.

### `graphics`: the sprite atlases (`GraphicsResult`)

`graphics.atlases` holds the three packed atlases - `skills`, `frame` and
`mastery-effect-active` - each a `PackedAtlas` (PNG bytes plus a frame-map keyed
by the renderer's sprite key). `graphics.report` counts what happened per atlas:
`packed` decoded successfully, `missing` could not be served (skipped, never
substituted from a vendored asset). Note the `frames` report has no `missing`
count - the frame set is a fixed known list, so there is nothing to miss; the
asymmetry with `skills`/`masteryEffects` is intentional.

### `centre`: the centre art (`Record<string, Buffer>`)

`centre` is PNG bytes keyed by output name (`portrait-ranger`,
`ascendancy-deadeye`, `ring-static`, ...), which the CLI writes as files under
`centre/`.

## CLI: write the bundle to disk

When you do want files, the bundled CLI writes the whole bundle to a
**configurable output directory**; nothing is written inside the package:

```sh
poe2-tree-extract \
  --patch 4.5.4.1 \
  --tables ./tables/English \
  --cache ./.cache \
  --out ./out/tree
```

All four flags are required (`--patch` is illustrative above — pass the version
the patch server currently serves). It writes `data.json`, the three atlases as
`assets/<name>.png` + `<name>.json`, and the centre art as `centre/<name>.png`.
Output is PNG + JSON; converting the PNGs to WebP for the web is a separate
publish step left to you.

## How it works

- **Data** comes from GGPK tables (`PassiveSkills`, `PassiveSkillMasteryGroups`,
  `Characters`, `Ascendancy`, `SkillGems`, `BaseItemTypes`, ...) joined to the
  `.psg` passive-graph geometry, with stat lines rendered through
  `@poe2-toolkit/ggpk`'s stat-description engine. Nodes that describe themselves
  through a granted skill or passive points instead of a stat line (resolved
  `SkillGems` -> `BaseItemTypes` for the name) read as "Grants Skill: ..." or
  "Grants N Passive Skill Point", matching Path of Building's export. Each node
  also carries an `unlockConstraint` when GGG gates it behind another allocated
  passive, and each directed `.psg` edge becomes an arc with its world centre
  resolved up front so the renderer just sweeps it.
- **The passive-point budget** is computed from GGPK too, never hardcoded.
  `maxWeaponSetPoints` is every campaign weapon-set passive point (the
  `WeaponPassives` column of `QuestStaticRewards`, summed; optional non-campaign
  grants like fishing and logbook runes are filtered out by their `QuestFlags`
  id, as Path of Building also excludes them). `maxBasicPoints` adds one point
  per level above the first (the level cap from `ExperienceLevels`). The
  exporter config must request `QuestStaticRewards`, `QuestFlags` and
  `ExperienceLevels`.
- **Sprites** are decoded from GGPK DDS art and packed into atlases keyed exactly
  as the renderer expects. Skill icons pack a single colour sprite per node; the
  unallocated/dimmed look is a render-time tint (a grey multiply, the game's own
  approach), not a baked desaturated copy. A sprite the source cannot serve is
  skipped and reported, never pulled from a vendored asset.

Released PoE2 classes and ascendancies only; the GGPK's leftover PoE1 placeholder
classes are filtered out from the data.

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

MIT, see [LICENSE](./LICENSE).
