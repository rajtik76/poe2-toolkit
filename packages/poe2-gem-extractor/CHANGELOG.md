# Changelog

All notable changes to `@poe2-toolkit/gem-extractor` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versions follow [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-07-30

### Changed

- First stable release. The public API is unchanged from 0.6.2 - the 1.0.0
  bump marks it as settled, so from here on breaking changes require a major
  version.
- Bumped the pinned `@poe2-toolkit/ggpk` range to `^1.0.0`.

## [0.6.2] - 2026-07-17

### Changed

- Bumped the pinned `@poe2-toolkit/ggpk` range from `^0.5.0` to `^0.6.0` to
  match the current minimum version.

## [0.6.1] - 2026-07-17

### Changed

- Shared CLI and icon-decode logic with the other extractor packages;
  tightened row and type safety.

## [0.6.0] - 2026-07-14

### Added

- Tooltip scaling and hover art for gems.

## [0.5.0] - 2026-07-02

### Fixed

- Pinned `@poe2-toolkit/ggpk` to `^0.4.0` so the uncompressed DX10 icon
  decoder is actually pulled in (`^0.3.0` excluded it).

## [0.4.1] - 2026-07-02

### Changed

- Documented output contracts and added field-level JSDoc.

## [0.4.0] - 2026-06-27

### Added

- Gem data and icon extraction.

## [0.3.0] - 2026-06-24

No functional change; version bump alongside the monorepo-wide 0.3.0 release.

## [0.2.0] - 2026-06-24

No functional change; version bump alongside the monorepo-wide 0.2.0 release.

## [0.1.0] - 2026-06-23

### Added

- Initial public package, scoped under `@poe2-toolkit`.
