# @poe2-toolkit/item-extractor

[![npm](https://img.shields.io/npm/v/@poe2-toolkit/item-extractor.svg)](https://www.npmjs.com/package/@poe2-toolkit/item-extractor)
[![status: WIP](https://img.shields.io/badge/status-work%20in%20progress-orange.svg)](#)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Builds **Path of Exile 2 item** data and icons straight from the official GGPK /
patch server.

> **Work in progress.** The API is not implemented yet. `buildItems(source)`
> currently throws. This package exists to reserve its place in the toolkit and
> document the intended shape.

It will mirror [`@poe2-toolkit/tree-extractor`](../poe2-tree-extractor): source-agnostic,
built on a [`@poe2-toolkit/ggpk`](../poe2-ggpk) source, returning formatted data rather
than writing into the package. Planned coverage: base item types, their stats,
and their icons.

**Code only.** Like the rest of the toolkit, this package will ship no game data
and no art.

## Attributions and legal

This is an unofficial, fan-made project, **not** affiliated with, endorsed by, or
sponsored by Grinding Gear Games. "Path of Exile 2" is a trademark of Grinding
Gear Games, and all game content, data, and art are their property. Thank you to
Grinding Gear Games for making Path of Exile 2. GGPK access builds on
[`pathofexile-dat`](https://github.com/SnosMe/poe-dat-viewer) (MIT, © SnosMe);
full attribution is in the repository [NOTICE](../../NOTICE.md).

## License

MIT — see [LICENSE](./LICENSE).
