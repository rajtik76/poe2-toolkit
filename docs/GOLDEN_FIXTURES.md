# Golden fixtures: generating your own

The characterization and 1:1 verification tests compare the extractors' output
against a blessed "golden" copy of that output. Those fixtures derive from GGG
game data, so they are not part of this repository, nor are they ever
committed or run in CI (see [Code only - no game
data](../README.md#code-only)) - the tests locate them through environment
variables (or, absent those, gitignored default locations under the repo root)
and skip when neither is present.

Nothing about the fixtures is secret. `scripts/golden-fixtures/setup.mjs`
regenerates the whole thing from the official patch server - no other project
or manual GGPK dump needed.

## Quick start

```sh
npm run build                # the CLIs the bless step shells out to
npm run fixtures:extract     # fetch/decode GGPK tables for the pinned patch
npm run fixtures:bless       # regenerate golden fixtures from the extract
npm run ci
```

That's it - `fixtures:extract` and `fixtures:bless` write to `.ggpk-extract/`
and `.golden-fixtures/` at the repo root (both gitignored), and every test
suite defaults to those locations, so `npm run ci` (or `npm test`) picks them
up with no environment variables to set.

## What the script does

`node scripts/golden-fixtures/setup.mjs`:

1. Reads the patch pin from `scripts/golden-fixtures/config.json` (override
   with `--patch <version>`).
2. If `.ggpk-extract/` already holds tables for that patch, skips straight to
   step 4 - it never re-downloads for a patch it already has.
3. Otherwise runs `pathofexile-dat`'s exporter against the official patch
   server, decoding the tables every extractor in this repo reads
   (`.ggpk-extract/tables/English/*.json`) and priming the bundle cache
   (`.ggpk-extract/.cache/`) that raw files and sprites are fetched into on
   demand.
4. With `--bless`, also runs every extractor's own CLI (`poe2-item-extract`,
   `poe2-gem-extract`, `poe2-rune-extract`, `poe2-mod-extract`,
   `poe2-tree-extract`) against that extract and writes their output into
   `.golden-fixtures/` - `data/` for the item/gem/rune/mod JSON, `tree/` for
   the passive tree's `data.json` and rendered art. For the art, only a
   SHA-256 per PNG (`tree/png.sha256`) is what the tests actually pin; the
   pixels themselves never need to leave your machine.

Re-run with `--bless` any time you want to update the fixtures to a new patch
(pass `--patch`) or to re-baseline after an intentional pipeline change:

```sh
node scripts/golden-fixtures/setup.mjs --patch 4.5.5.1 --bless
```

Since nothing under `.golden-fixtures/` is committed, "re-blessing" has no
review step of its own - the tests it feeds simply compare against whatever
you last generated, on your own machine.

## Test env vars (for a custom layout)

Every gated test suite falls back to the locations above, but you can point
them elsewhere:

| Variable | Points at | Used by |
|---|---|---|
| `POE2_GGPK_EXTRACT` | a GGPK extract (decoded tables + bundle cache) | regeneration tests in every extractor package |
| `POE2_DATA_GOLDEN` | a directory of golden `items.json` / `gems.json` / `runes.json` / `mods.json` | characterization tests in item/gem/rune/mod extractors |
| `POE2_TREE_GOLDEN` | a directory of blessed tree-extractor output | golden-contract and 1:1 art tests in `poe2-tree-extractor` |
| `POE2_TREE_DATA` | a tree `data.json` | geometry tests in `poe2-tree-core` |

## Two caveats

- The fixtures are tied to the patch they were generated from. After a game
  patch, `--bless` again; a version mismatch shows up as wholesale
  differences, not subtle ones.
- Blessing output you just generated proves reproducibility, not correctness.
  The fixtures earn their value the moment they are older than the change you
  are testing.

[pathofexile-dat]: https://github.com/SnosMe/poe-dat-viewer
