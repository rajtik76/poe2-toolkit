# Changelog

All notable changes to `@poe2-toolkit/tree-extractor` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versions follow [Semantic Versioning](https://semver.org/).

## [0.6.3] - 2026-07-17

### Changed

- `buildGraphics` now fetches skill-icon and mastery-effect sprites
  concurrently (via `@poe2-toolkit/ggpk`'s `mapConcurrent`) instead of one
  path at a time.
- Bumped the pinned `@poe2-toolkit/ggpk` range from `^0.5.0` to `^0.6.0` to
  match the minimum version required (`mapConcurrent`).

## [0.6.2] - 2026-07-17

### Changed

- Shared CLI and icon-decode logic with the other extractor packages;
  tightened row and type safety.

### Fixed

- Corrected README prose: `maxBasicPoints`/`maxWeaponSetPoints` read as two
  independent budgets, but weapon-set points actually fold into
  `maxBasicPoints`.
- Corrected JSDoc that said "four sprite atlases" - there are three.
- Bumped the pinned `@poe2-toolkit/ggpk` range from `^0.3.0` to `^0.4.0` to
  match the actual minimum version required.

## [0.6.1] - 2026-07-16

### Fixed

- Fail loudly instead of silently continuing on undecodable centre art.

## [0.6.0] - 2026-07-02

### Changed

- Documented output contracts and added field-level JSDoc.

## [0.5.0] - 2026-06-26

### Added

- Weapon-set allocation and GGPK-derived point budgets.

### Removed

- Path of Building import support.

## [0.4.0] - 2026-06-25

### Changed

- Clarified in the docs that the `patch` argument is the current server
  version.

## [0.3.0] - 2026-06-24

### Added

- Read `PassiveSkills.UnlockedBy` and emit an `unlockConstraint` (ascendancy
  + unlocking skill ids) for clusters GGG hides until their unlocking
  passives are allocated (e.g. the Druid/Oracle "The Unseen Path" nodes).

### Changed

- **BREAKING:** dropped the baked `skills-disabled` atlas and the
  `desaturate` pass. `TreeAtlases` now carries three atlases (skills, frame,
  mastery-effect-active) instead of four; unallocated icons are tinted at
  render time instead.

## [0.2.0] - 2026-06-24

No functional change; version bump alongside the monorepo-wide 0.2.0 release.

## [0.1.0] - 2026-06-23

### Added

- Initial public package, scoped under `@poe2-toolkit`.
