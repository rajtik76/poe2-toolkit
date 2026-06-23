# @poe2-toolkit/gem-extractor

[![npm](https://img.shields.io/npm/v/@poe2-toolkit/gem-extractor.svg)](https://www.npmjs.com/package/@poe2-toolkit/gem-extractor)
[![status: WIP](https://img.shields.io/badge/status-work%20in%20progress-orange.svg)](#)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Builds **Path of Exile 2 gem** data and icons straight from the official GGPK or
patch server.

> **Work in progress.** The API is not implemented yet. `buildGems(source)`
> currently throws. This package exists to reserve its place in the toolkit and
> document the intended shape.

It mirrors [`@poe2-toolkit/tree-extractor`](../poe2-tree-extractor): source-agnostic,
built on a [`@poe2-toolkit/ggpk`](../poe2-ggpk) source, returning formatted data rather
than writing into the package. Planned coverage: skill and support gems, their
effects, and their icons.

## API

```ts
import { buildGems } from '@poe2-toolkit/gem-extractor';
import type { GgpkSource } from '@poe2-toolkit/ggpk';
```

### `buildGems(source: GgpkSource): Promise<never>`

The single export and intended entry point. It will extract gem data and icons
from the given GGPK source. Not implemented yet: it always throws.

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

MIT - see [LICENSE](./LICENSE).
