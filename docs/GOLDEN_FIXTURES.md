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

## What it costs

Worth knowing before you start, because this is not a small `npm run`:

| Step | Downloads | Leaves on disk | Time |
|---|---|---|---|
| `fixtures:extract` | ~190 MB of table bundles | `tables/` 52 MB + `.cache/` 190 MB | ~5 s |
| `fixtures:bless`, cold cache | ~600 MB more, mostly sprite and DDS art pulled on demand | `.cache/` grows to ~790 MB, `.golden-fixtures/` 155 MB | ~64 s |
| `fixtures:bless`, cache already warm | nothing | unchanged | ~54 s |

So budget **~1 GB** of disk for the pair: ~845 MB in `.ggpk-extract/` and ~155 MB
in `.golden-fixtures/`. Most of it is the bundle cache the bless step fills, not
the tables the extract step decodes.

The cache lives in a `<patch>/` subdirectory, and the exporter drops the previous
patch's cache when it extracts a new one, so the directory does not grow by a
gigabyte with every game patch. Both directories are gitignored and throwaway:
delete them and re-run to start over.

Measured 2026-08-15 against patch 4.5.4.10, on an Apple Silicon Mac with a fast
connection. The download figures are stable; the times are not, and a slower link
will move them a lot, since almost all of it is waiting on the CDN.

## What the script does

Both npm scripts are the same entry point: `fixtures:extract` is
`node scripts/golden-fixtures/setup.mjs`, and `fixtures:bless` is that plus
`--bless`. What it does:

1. Works out which patch to extract. By default (`"patch": "latest"` in
   `scripts/golden-fixtures/config.json`) it asks the patch server what is
   live right now; `--patch <version>` or a literal version in `config.json`
   overrides that. See [Why there is no fixed pin](#why-there-is-no-fixed-pin).
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

## Why there is no fixed pin

The patch CDN serves **only the version the game is on right now**. There is no
archive: the moment GGG ships an update, every older version 404s. So a patch
hard-coded in `config.json` does not stay reproducible - it simply stops working,
usually within days, and the failure looks like a broken download rather than a
stale pin.

That is why the default is `"patch": "latest"`. The script resolves the live
version over GGG's patch-server protocol (`scripts/golden-fixtures/current-patch.mjs`
- a two-byte handshake on `patch.pathofexile2.com:13060`, whose reply carries the
CDN URL) and extracts that. You can still pass `--patch <version>` when you need
a specific one, and it will work for exactly as long as the CDN still has it.

Resolve it yourself any time:

```sh
node scripts/golden-fixtures/current-patch.mjs   # -> 4.5.4.10
```

The resolved version is recorded in `.ggpk-extract/config.json`, so a later run
knows whether the extract on disk matches the patch now being asked for, and
re-downloads only when it does not.

## Two caveats

- The fixtures are tied to the patch they were generated from. Because the
  default resolves to whatever is live, a new game patch means the next run
  extracts something different - `--bless` again; a version mismatch shows up
  as wholesale differences, not subtle ones.
- Blessing output you just generated proves reproducibility, not correctness.
  The fixtures earn their value the moment they are older than the change you
  are testing.

[pathofexile-dat]: https://github.com/SnosMe/poe-dat-viewer
