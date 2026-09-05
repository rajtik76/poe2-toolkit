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
  data: GemData;         // gems + per-level requirement curves + tooltip scaling
  icons: GemIconsResult; // decoded icon PNGs + hover art + a pack/skip report
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
- **`hoverImage` is `SkillGems.UI_Image`, raw as the table holds it, `null` when
  absent.** The reference form follows the patch: a DDS path
  (`Art/Textures/.../GemHoverImageIceNova.dds`) up to 4.5.4, a UIImages sprite
  name (`Art/2DArt/UIImages/InGame/SmartHover/GemHoverImage/GemHoverImageIceNova`,
  no extension) from 4.5.5 on. `buildGemIcons` decodes both and keys the PNG by
  this value plus `.png` either way, so appending `.png` keeps working if GGG
  switches form again.
  Only active/spirit (skill) gems carry one - **no support gem has hover art in
  the game**, confirmed, so `null` there is the correct, permanent state, not a
  gap. Among active/spirit gems, coverage is genuinely sparse: **531 `SkillGems`
  rows resolve to a real, named, player-facing `ActiveSkill`** (e.g. `Temporal
  Chains`, `Enfeeble`, `Discipline`, `Incinerate`, `Purity of Fire`, `Herald of
  Ice`, `Wither`), and only 98 of those have `UI_Image` set - checked
  individually, not a duplicate-row or monster-variant artifact. On patch
  4.5.4.3 the art for the other ~433 skill gems simply isn't in the data yet.
  This is the game's own data, not a bug in this extractor - a consumer should
  treat a missing `hoverImage` as "no background art for this gem (yet)," not as
  an extraction failure, and should expect this to fill in over future patches.

`data.scaling` maps the same key to a `GemScaling` - the resolved tooltip
scaling per gem level, plus quality bonus lines:

```json
"SkillGemArc": {
  "name": "Arc",
  "levels": [
    {
      "level": 1, "cost": 8, "castTime": 1.1, "cooldown": null, "reservation": null,
      "spellCritChance": 9, "attackCritChance": 0,
      "stats": [
        { "text": "200% more damage when Lightning Infused", "min": 200, "max": 200 },
        { "text": "Deals 1 to 13 Lightning Damage", "min": 1, "max": 13 }
      ]
    },
    { "level": 20, "cost": 81, "castTime": 1.1, "spellCritChance": 9,
      "stats": [{ "text": "Deals 20 to 386 Lightning Damage", "min": 20, "max": 386 }] }
  ],
  "qualityStats": [
    { "text": "Skills Chain +2 times", "min": 0, "max": 2 }
  ]
}
```

Verified against a live extract, level-for-level, against Arc's in-game tooltip:
cost, cast time, crit chance and every scaling stat line match exactly (the
`(min—max)` figures the UI would show are your gem-level-1 and gem-level-20
entries side by side - `scaling` intentionally hands back per-level numbers, not
a pre-rendered range string, so a level-scaling slider has real numbers to work
with).

The rules the shape alone doesn't tell you:

- **`levels` has one entry per `GemLevel` the source defines** - typically 1-40
  for a levelling active/spirit gem, but often just one for a support gem with
  flat (non-scaling) bonuses.
- **`castTime` prefers the per-level `AttackTime`** (for attack skills, which can
  vary with weapon speed) **and falls back to the flat `GrantedEffects.CastTime`**
  (for spells, which don't scale by level) when `AttackTime` is `0`.
- **`stats` lines come from three sources**, all rendered through the same
  stat-description engine: `GrantedEffectStatSets.ConstantStats` (fixed across
  every level), `GrantedEffectStatSetsPerLevel.AdditionalStats` (this level's
  value), and `FloatStats` paired positionally with `BaseResolvedValues` two at a
  time (GGG's min/max convention, e.g. a damage roll) - verified against a live
  extract, not assumed from the schema alone.
- **`qualityStats` are resolved at 20 quality** (the normal cap); `min` is always
  `0`, the value at 0 quality, since every quality bonus scales linearly.
- **A stat id with no matching description block is silently dropped**, not
  reported as an error - this is expected for the source data's internal-only
  flag stats (e.g. `active_skill_consumes_a_lightning_infusion`), which have no
  player-facing text at all.
- **`data.scaling` omits a gem whose `GrantedEffects` row has no `StatSet`.**
  On a live extract every real gem resolved one, so in practice this only
  matters for malformed rows.

One field intentionally isn't here yet: **a gem's display `Tier`** (the number
poe2db shows, e.g. `5` for Arc). `SkillGems.Tier` exists in the schema but only
ranges 0-3 on a live extract and doesn't match the displayed value; the
`UncutGemTiers` table turned out to be a 1-20 ladder for the *Uncut Gem currency
items themselves*, not a per-gem lookup. Where the tooltip's `Tier` actually
comes from is unresolved - flagged here rather than guessed at.

### `icons`: the decoded PNGs (`GemIconsResult`)

`icons.icons` is PNG bytes keyed by output path - each gem's `icon` and
`hoverImage` reference plus `.png` (a DDS path has its extension swapped, a
sprite name simply gains one), which the CLI writes as files under `icons/`.
References are deduplicated, so it's one PNG per distinct reference across all
gems. A sprite name is decoded through the UIImages index, so the PNG carries
the sub-rect the client draws rather than the whole backing sheet.
`icons.report` counts what happened: `packed` decoded successfully, `missing`
could not be served, resolved or decoded (skipped, never substituted from a
vendored asset).

## CLI: write the bundle to disk

```sh
poe2-gem-extract \
  --patch 4.5.4.1 \
  --tables ./tables/English \
  --cache ./.cache \
  --out ./out/gems
```

All four flags are required. It writes `gems.json`, `gem_requirements.json`,
`gem_scaling.json`, and the icon PNG tree under `icons/`. Output is PNG + JSON;
converting to WebP for the web is a separate publish step left to you.

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
- **The tooltip scaling** joins a second chain rooted at `GrantedEffects.StatSet`:
  `GrantedEffectStatSets` for the level-independent part and
  `GrantedEffectStatSetsPerLevel` for the per-`GemLevel` values, plus
  `GrantedEffectQualityStats` for quality bonuses. Stat text is rendered via
  `@poe2-toolkit/ggpk`'s `buildStatIndex`/`renderBlock` against two `.csd`
  files - `data/statdescriptions/skill_stat_descriptions.csd` first, falling
  back to the general `data/statdescriptions/stat_descriptions.csd` (shared with
  item mods) for stats defined there instead.
- **Icons and hover art** are kept as their raw GGPK DDS paths in the data and
  decoded to PNG by `buildGemIcons`. A path the source cannot serve is skipped
  and reported, never pulled from a vendored asset.

### Tables this needs beyond what was already pinned

`GrantedEffectStatSets`, `GrantedEffectStatSetsPerLevel`,
`GrantedEffectQualityStats` and `Stats` are new requirements - a source whose
config doesn't export them will throw reading the missing table file.
`GrantedEffects` additionally needs its `CastTime` column pinned (`StatSet` was
already required for nothing until now). Everything else this package reads was
already pinned by the existing gem build.

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
