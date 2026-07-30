# Changelog

All notable changes to `@poe2-toolkit/tree-core` are documented here. Format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions
follow [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-07-30

### Changed

- First stable release. The public API is unchanged from 0.4.3 - the 1.0.0
  bump marks it as settled, so from here on breaking changes require a major
  version.
- Test-only: the tree fixture helper now defaults to the `data.json` that
  `scripts/golden-fixtures/setup.mjs --bless` writes, instead of a path that
  never exists. No runtime changes.

## [0.4.3] - 2026-07-17

### Changed

- Shared CLI and icon-decode logic with the extractor packages; tightened
  row and type safety.

## [0.4.2] - 2026-07-16

### Fixed

- Do not allow pathing across another class's starting node. A class's start
  node was also a walkable rim node linking its flanking gateways, letting a
  path bridge them by stepping through a foreign class's start.

## [0.4.1] - 2026-07-02

### Changed

- Documented output contracts and added field-level JSDoc.

## [0.4.0] - 2026-06-26

### Added

- Weapon-set allocation and GGPK-derived point budgets.

### Removed

- Path of Building import support.

## [0.3.0] - 2026-06-24

### Added

- Gate and reveal unlock-constrained passive nodes (e.g. the Druid/Oracle
  "The Unseen Path" cluster), hiding a conditional node and its edges until
  all its unlock nodes are allocated.

## [0.2.0] - 2026-06-24

No functional change; version bump alongside the monorepo-wide 0.2.0 release.

## [0.1.0] - 2026-06-23

### Added

- Initial public package, scoped under `@poe2-toolkit`.
