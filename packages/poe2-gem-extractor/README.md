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

`extractGems(source)` resolves to a `GemBundle` - the gem `data` plus decoded
`icons`:

```ts
interface GemBundle {
  data: GemData;         // gems + per-level requirement curves
  icons: GemIconsResult; // decoded icon PNGs + a pack/skip report
}
```

The two steps are exported separately too: `buildGems(source)` for the data and
`buildGemIcons(source, data)` for the PNGs. The ported helpers
`gemStatRequirement` and `stripBbcode` are exported for reuse.

Field-level docs live on the exported types themselves - `Gem`, `GemReq`,
`GemLevel`, `GemRequirement`, `GemIconsResult` - so your editor shows each
field's meaning on hover and they ship in the `.d.ts`. The rest of this section
is the shape and the rules that the types alone don't tell you.

### `data`: the gems (`GemData`)

`GemData` has two maps, both keyed by the **last path segment of the base item
id** (Path of Building's `normalizeGemId`, e.g. `SkillGemIceNova`); the last
segment wins on a collision, matching how a consumer looks gems up.

`data.gems` maps that key to a `Gem`. An active gem and a support gem:

```json
"SkillGemIceNova": {
  "name": "Ice Nova",
  "kind": "active",
  "color": "b",
  "tags": ["Spell", "AoE", "Cold", "Duration", "Nova", "Repeatable"],
  "description": "Conjure a wave of ice in all directions, Knocking Back enemies based on how close they are to you...",
  "req": { "str": 0, "dex": 0, "int": 100, "level": 1 },
  "icon": "Art/2DArt/SkillIcons/SorceressIceNova.dds"
}

"SupportGemFireInfusion": {
  "name": "Fire Attunement",
  "kind": "support",
  "color": "r",
  "tags": ["Support", "Fire"],
  "req": { "str": 100, "dex": 0, "int": 0, "level": 1 },
  "icon": "Art/2DArt/SkillIcons/Support/AddedFireDamageSupport.dds"
}
```

`data.requirements` maps the same key to a `GemRequirement` - the per-level
attribute/level curve, keyed by gem level:

```json
"SkillGemIceNova": {
  "name": "Ice Nova",
  "levels": {
    "1": { "requiredLevel": 1, "str": 0, "dex": 0, "int": 0 },
    "2": { "requiredLevel": 3, "str": 0, "dex": 0, "int": 9 },
    "3": { "requiredLevel": 6, "str": 0, "dex": 0, "int": 14 }
  }
}
```

The rules the shape alone doesn't tell you:

- **`kind` is `active`, `support` or `spirit`** (a persistent buff), and
  **`color` is `r` (str), `g` (dex), `b` (int) or `w` (any)**.
- **`req` on a `Gem` is percent-of-attribute weights plus a minimum character
  `level`.** Support gems and zero-weight attributes require nothing, so a
  support gem's per-level curve values are all `0` (see the requirement formula
  in [How it works](#how-it-works)).
- **`requirements` omits gems with no per-level curve.** Many supports have
  none, so they appear in `gems` but not in `requirements`.
- **Icons come from different tables by kind.** Active and spirit gems take their
  icon from the active skill; supports take theirs from `SupportGems.Icon`.
- **`description` is `null` when the source text is empty**, otherwise the
  skill / support text with bbcode stripped.

### `icons`: the decoded PNGs (`GemIconsResult`)

`icons.icons` is PNG bytes keyed by output path - each gem's `icon` DDS path with
its extension swapped to `.png`, which the CLI writes as files under `icons/`.
Icons are deduplicated, so it's one PNG per distinct `icon` across all gems.
`icons.report` counts what happened: `packed` decoded successfully, `missing`
could not be served or decoded (skipped, never substituted from a vendored
asset).

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
