# Golden fixtures: generating your own

The characterization and 1:1 verification tests compare the extractors' output
against a blessed "golden" copy of that output. Those fixtures derive from GGG
game data, so they are not part of this repository (see
[Code only - no game data](../README.md#code-only)) - the tests locate them
through environment variables and skip when the variables are unset.

Nothing about the fixtures is secret, though. Anyone can regenerate them from
their own extract and run the full suite. This page shows how.

## What the tests need

| Variable | Points at | Used by |
|---|---|---|
| `POE2_GGPK_EXTRACT` | a local GGPK extract (decoded tables + bundle cache) | regeneration tests in every extractor package |
| `POE2_TREE_GOLDEN` | a directory of blessed tree-extractor output | golden-contract and 1:1 art tests in `poe2-tree-extractor` |
| `POE2_TREE_DATA` | a tree `data.json` | geometry tests in `poe2-tree-core` |

## 1. Get a GGPK extract

The extract is a directory with this shape:

```
<extract>/
  config.json          # { "patch": "<version>", ... }
  tables/English/*.json  # decoded .dat tables
  .cache/<patch>/      # bundle cache the CDN source fills
```

Any pipeline built on [pathofexile-dat] produces the decoded tables; the
`@poe2-toolkit/ggpk` CDN source fills the bundle cache on first use. If you run
[exile2exile], its `tools/poe-data-extract` directory already has exactly this
layout after `npm run refresh:data`.

```sh
export POE2_GGPK_EXTRACT=/path/to/extract
```

With just this variable set, `npm test` already runs the regeneration tests:
each extractor re-derives its output from your extract and checks internal
invariants.

## 2. Bless a golden tree bundle

The golden fixtures are simply the tree extractor's own output, captured once
and trusted from then on. Generate a bundle with the CLI:

```sh
cd packages/poe2-tree-extractor && npm run build
npx poe2-tree-extract \
  --patch "$(node -p "require('$POE2_GGPK_EXTRACT/config.json').patch")" \
  --tables "$POE2_GGPK_EXTRACT/tables/English" \
  --cache "$POE2_GGPK_EXTRACT/.cache" \
  --out /path/to/tree-golden
```

Then replace the PNGs with a hash manifest - the tests compare hashes, and
keeping decoded game art on disk is exactly what the fixtures are meant to
avoid:

```sh
cd /path/to/tree-golden
shasum -a 256 assets/*.png > png.sha256
rm assets/*.png
```

You end up with:

```
tree-golden/
  data.json      # full tree topology
  assets/*.json  # sprite-atlas frame maps
  png.sha256     # sha256 of each atlas PNG
```

```sh
export POE2_TREE_GOLDEN=/path/to/tree-golden
export POE2_TREE_DATA=/path/to/tree-golden/data.json
```

## 3. Run the suite

```sh
npm test
```

The previously skipped golden-contract, 1:1 art and tree-geometry tests now
run. From here on the fixtures act as a tripwire: any change to the extraction
pipeline that alters the output - node positions, atlas packing, image
decoding - fails against your blessed copy, and you decide whether the change
is intended (re-bless by regenerating the bundle) or a regression.

Two caveats:

- The fixtures are tied to the patch they were generated from. After a game
  patch, regenerate them alongside the extract; a version mismatch shows up as
  wholesale differences, not subtle ones.
- Blessing output you just generated proves reproducibility, not correctness.
  The fixtures earn their value the moment they are older than the change you
  are testing.

[pathofexile-dat]: https://github.com/SnosMe/poe-dat-viewer
[exile2exile]: https://github.com/rajtik76/exile2exile
