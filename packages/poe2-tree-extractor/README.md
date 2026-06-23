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
  patch: '4.5.3.1.7',
  tablesDir: './tables/English',
  cacheDir: './.cache',
});

const { data, graphics, centre } = await extractTree(source);
```

`extractTree(source)` returns a `TreeBundle`:

| Field | Type | What it is |
| --- | --- | --- |
| `data` | `TreeExport` | The `data.json` payload, `@poe2-toolkit/tree-core`'s normalize input (nodes, groups, classes, arc edges, roots, jewel slots, attribute choices). |
| `graphics` | `GraphicsResult` | The four sprite atlases (`skills`, `skills-disabled`, `frame`, `mastery-effect-active`), each a packed PNG plus its frame-map, with a report of what packed or was skipped. |
| `centre` | `Record<string, Buffer>` | Centre art keyed by output name (`portrait-ranger`, `ascendancy-deadeye`, `ring-static`, ...), each a PNG buffer. |

The individual steps are exported too, if you only need one:
`buildTree(source)`, `buildGraphics(source, data)`, `buildCentre(source)`. The
lower-level pieces are exported as well: `parsePsg` (the `.psg` graph parser) and
`packAtlas` / `desaturate` (the atlas packer and the inactive-icon grayscale
pass), along with their types.

## CLI: write the bundle to disk

When you do want files, the bundled CLI writes the whole bundle to a
**configurable output directory**; nothing is written inside the package:

```sh
poe2-tree-extract \
  --patch 4.5.3.1.7 \
  --tables ./tables/English \
  --cache ./.cache \
  --out ./out/tree
```

All four flags are required. It writes `data.json`, the four atlases as
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
- **Sprites** are decoded from GGPK DDS art and packed into atlases keyed exactly
  as the renderer expects. A sprite the source cannot serve is skipped and
  reported, never pulled from a vendored asset.

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
</content>
</invoke>
