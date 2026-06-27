# poe2-toolkit

[![CI](https://github.com/rajtik76/poe2-toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/rajtik76/poe2-toolkit/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![code only](https://img.shields.io/badge/data-none%20bundled-brightgreen.svg)](#code-only)

A framework-agnostic toolkit for **Path of Exile 2** data. One shared layer for
reading the official GGPK / patch server, a set of extractors that turn that data
into clean, typed output, and renderers for the passive tree.

Everything here is **code**. None of it bundles game data or art.

> The only framework-agnostic, code-only **Path of Exile 2 passive tree renderer**
> on npm - a headless geometry core plus a React view, with the extractors that
> feed them. You extract the data at run time; nothing about the game is bundled.

<p align="center">
  <a href="https://poe.rajtik.com/tree">
    <img src="https://github.com/rajtik76/poe2-toolkit/releases/download/tree-react-v0.6.1/demo.gif" alt="Path of Exile 2 passive tree renderer" width="720">
  </a>
  <br>
  <a href="https://poe.rajtik.com/tree"><b>&#9654; Try the live, interactive demo</b></a>
</p>

## Why this exists

Path of Exile 2's official passive-tree export is leaner than PoE1's - it ships
the nodes and edges but not the orbit, sprite, or zoom constants you need to draw
them, so rendering it faithfully is real work. The tools that do that today are
full applications (planners) that bundle a snapshot of game data and drift out of
date; the one widely-used typed data library, `pathofexile-dat`, extracts data
but does not render.

This toolkit fills that gap as **libraries, not an app**:

- **Code only.** Nothing derived from the game is bundled - no data, no art, not
  even test fixtures. You extract on your own machine from the official patch
  server, so it stays current and legally clean.
- **Headless core, thin view.** `tree-core` computes the geometry with zero
  dependencies; `tree-react` only draws it and owns pan/zoom/clicks. Swap in your
  own view layer without touching the engine.
- **Typed and tested.** Real TypeScript types and golden / characterization tests
  against the live format, published to npm under semver.

## Quick start

Render a clickable passive tree - core works out the geometry, React draws it:

```sh
npm install @poe2-toolkit/tree-react @poe2-toolkit/tree-core
```

```tsx
import { useMemo, useState } from 'react';
import { buildScene } from '@poe2-toolkit/tree-core';
import { normalizeGggTree } from '@poe2-toolkit/tree-core/ggg';
import { TreeView } from '@poe2-toolkit/tree-react';

// A tree `data.json` (from @poe2-toolkit/tree-extractor, or the one the live demo
// publishes) -> the engine's TreeData. Once per tree version.
const data = normalizeGggTree(rawTreeJson, '0_5');

export function Tree() {
  const [allocated, setAllocated] = useState<number[]>([]);

  // Geometry is the core's job: state in, a positioned Scene out. Rebuild on edits.
  const scene = useMemo(
    () => buildScene(data, { allocation: { classId: 0, allocated } }),
    [allocated],
  );

  // Omit `resources` and you get a vector render - a real tree, no art to load.
  return (
    <TreeView
      scene={scene}
      onNodeClick={(skill) =>
        setAllocated((a) => (a.includes(skill) ? a.filter((s) => s !== skill) : [...a, skill]))
      }
    />
  );
}
```

That's the whole loop: **the core computes where everything goes, React draws it
and reports clicks.** Add atlas `resources` for real art - see
[`tree-react`](./packages/poe2-tree-react) for graphics and the full prop list.

## Live demo and patch webhook

A running instance of the passive tree built from these packages is live at
**[poe.rajtik.com/tree](https://poe.rajtik.com/tree)**, the same `@poe2-toolkit/*`
core and React renderer in a real app.

The same site also runs a **public patch webhook**: subscribe a URL and you get a
signed `POST` the moment a new Path of Exile 2 client version is detected on GGG's
patch server (`patch.pathofexile2.com`, polled every five minutes). No account and
no polling on your side; deliveries are HMAC-SHA256 signed so you can verify
they're genuine, and retried with backoff. Full docs at
**[poe.rajtik.com/patch-webhook](https://poe.rajtik.com/patch-webhook)**.

```bash
# Subscribe; your endpoint echoes the verification `challenge` to prove ownership.
curl -X POST https://poe.rajtik.com/api/patch/subscribers \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com/poe2-hook"}'
```

Once verified, every new patch triggers a `patch.released` delivery carrying the
`version` and `released_at`. See the docs for signature verification, re-verify /
unsubscribe endpoints, and retry behavior.

## Packages

| Package | What it does | Status |
| --- | --- | --- |
| [`@poe2-toolkit/ggpk`](./packages/poe2-ggpk) | Shared GGPK / patch-server access and the format decoders (images, stat descriptions) every extractor reuses. The only package that touches the network. | Ready |
| [`@poe2-toolkit/tree-extractor`](./packages/poe2-tree-extractor) | Builds the passive-tree data and sprite atlases from a GGPK source. | Ready |
| [`@poe2-toolkit/tree-core`](./packages/poe2-tree-core) | Headless geometry engine: tree data in, a fully positioned scene out. | Ready |
| [`@poe2-toolkit/tree-react`](./packages/poe2-tree-react) | React renderer that draws what the core computed and owns pan/zoom/interaction. | Ready |
| [`@poe2-toolkit/item-extractor`](./packages/poe2-item-extractor) | Builds item data and icons from a GGPK source. | Ready |
| [`@poe2-toolkit/gem-extractor`](./packages/poe2-gem-extractor) | Builds gem data and icons from a GGPK source. | Ready |
| [`@poe2-toolkit/rune-extractor`](./packages/poe2-rune-extractor) | Builds rune / soul-core data from a GGPK source (data only). | Ready |

## How it fits together

```
                    @poe2-toolkit/ggpk          fetch + decode GGPK / patch server
                          |                     (GgpkSource: table() / file())
        +-----------+-----------+-----------+
        v           v           v           v
     tree-       item-       gem-        rune-       extraction: data in, typed data out
   extractor   extractor   extractor   extractor
        |
        v
   tree-core  -->  tree-react                        rendering: scene in, pixels out
```

Acquisition happens once, in `@poe2-toolkit/ggpk`. Every extractor reads from the same
source, so nothing is downloaded twice, and the extractors themselves stay
agnostic to where the bytes come from.

## <a name="code-only"></a>Code only - no game data

These packages ship code, not data. Each extractor either **returns formatted,
typed data** to the caller or, via its CLI, **writes to a configurable output
directory**. Nothing derived from the game is stored in this repository: not
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

## Attributions and legal

This is an unofficial, fan-made project. It is **not** affiliated with, endorsed
by, or sponsored by Grinding Gear Games.

"Path of Exile" and "Path of Exile 2" are trademarks of Grinding Gear Games. All
game content, data, and art are the property of Grinding Gear Games. This toolkit
contains none of it; it reads data at run time from the official patch server
(or your own game files) and hands back the decoded result.

GGPK access builds on [`pathofexile-dat`](https://github.com/SnosMe/poe-dat-viewer)
(MIT, © SnosMe). Full attribution is in [NOTICE](./NOTICE.md).

**Thank you to Grinding Gear Games for making Path of Exile 2.**

## License

MIT. See [LICENSE](./LICENSE).
