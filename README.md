# poe2-toolkit

[![CI](https://github.com/rajtik76/poe2-toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/rajtik76/poe2-toolkit/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![code only](https://img.shields.io/badge/data-none%20bundled-brightgreen.svg)](#code-only)

A framework-agnostic toolkit for **Path of Exile 2** data. One shared layer for
reading the official GGPK / patch server, a set of extractors that turn that data
into clean, typed output, and renderers for the passive tree.

Everything here is **code**. None of it bundles game data or art.

## Packages

| Package | What it does | Status |
| --- | --- | --- |
| [`@poe2/ggpk`](./packages/poe2-ggpk) | Shared GGPK / patch-server access and the format decoders (images, stat descriptions) every extractor reuses. The only package that touches the network. | Ready |
| [`@poe2-tree/extractor`](./packages/poe2-tree-extractor) | Builds the passive-tree data and sprite atlases from a GGPK source. | Ready |
| [`@poe2-tree/core`](./packages/poe2-tree-core) | Headless geometry engine: tree data in, a fully positioned scene out. | Ready |
| [`@poe2-tree/react`](./packages/poe2-tree-react) | React renderer that draws what the core computed and owns pan/zoom/interaction. | Ready |
| [`@poe2-item/extractor`](./packages/poe2-item-extractor) | Builds item data and icons from a GGPK source. | WIP |
| [`@poe2-gem/extractor`](./packages/poe2-gem-extractor) | Builds gem data and icons from a GGPK source. | WIP |

## How it fits together

```
                 ┌──────────────┐
                 │  @poe2/ggpk  │  fetch + decode GGPK / patch server
                 └──────┬───────┘  (GgpkSource: table() / file())
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
  tree/extractor   item/extractor   gem/extractor   ← extraction: data in, typed data out
        │
        ▼
   tree/core  ──►  tree/react                        ← rendering: scene in, pixels out
```

Acquisition happens once, in `@poe2/ggpk`. Every extractor reads from the same
source, so nothing is downloaded twice, and the extractors themselves stay
agnostic to where the bytes come from.

## <a name="code-only"></a>Code only — no game data

These packages ship code, not data. Each extractor either **returns formatted,
typed data** to the caller or, via its CLI, **writes to a configurable output
directory**. Nothing derived from the game is stored in this repository — not
data, not art, not even test fixtures. The 1:1 verification fixtures live outside
the repo and are located at test time through environment variables.

## Develop

This is an npm-workspaces monorepo.

```sh
npm install        # link all packages
npm run build      # build in dependency order
npm run typecheck
npm run lint
npm test
```

The unit tests run without any game data. The integration and 1:1 verification
tests need a local GGPK extract and golden fixtures (both kept outside the repo);
point `POE2_GGPK_EXTRACT`, `POE2_TREE_GOLDEN`, and `POE2_TREE_DATA` at them to run
those locally. Without the variables, those tests skip.

Enable the commit hooks once per clone (a `commit-msg` hook rejects messages that
carry an AI-assistant trace):

```sh
git config core.hooksPath .githooks
```

## Attributions and legal

This is an unofficial, fan-made project. It is **not** affiliated with, endorsed
by, or sponsored by Grinding Gear Games.

"Path of Exile" and "Path of Exile 2" are trademarks of Grinding Gear Games. All
game content, data, and art are the property of Grinding Gear Games. This toolkit
contains none of it — it reads data at run time from the official patch server
(or your own game files) and hands back the decoded result.

GGPK access builds on [`pathofexile-dat`](https://github.com/SnosMe/poe-dat-viewer)
(MIT, © SnosMe). Full attribution is in [NOTICE](./NOTICE.md).

**Thank you to Grinding Gear Games for making Path of Exile 2.**

## License

MIT — see [LICENSE](./LICENSE).
