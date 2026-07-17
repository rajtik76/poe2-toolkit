# Changelog

All notable changes to `@poe2-toolkit/rune-extractor` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versions follow [Semantic Versioning](https://semver.org/).

## [0.4.1] - 2026-07-17

### Changed

- Shared CLI and icon-decode logic with the other extractor packages;
  tightened row and type safety.
- Dropped stale "data only" wording from the docs.

## [0.4.0] - 2026-07-02

### Added

- Extract item-socket UI textures.

## [0.3.0] - 2026-07-02

### Fixed

- Pinned `@poe2-toolkit/ggpk` to `^0.4.0` so the uncompressed DX10 icon
  decoder is actually pulled in (`^0.3.0` excluded it).

## [0.2.0] - 2026-07-02

### Added

- Decode rune icons into the bundle.

## [0.1.0] - 2026-06-27

### Added

- Initial soul-core / rune data extractor.
