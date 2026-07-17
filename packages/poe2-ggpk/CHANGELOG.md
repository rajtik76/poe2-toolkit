# Changelog

All notable changes to `@poe2-toolkit/ggpk` are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow
[Semantic Versioning](https://semver.org/).

## [0.5.1] - 2026-07-17

### Fixed

- `renderBlock` now fills GGG's bare `{}` placeholder (implicit next value),
  not just `{0}`-style. Previously left the literal `{}` unrendered, e.g. in
  "{}% increased [Armour] from Equipped Body Armour".

## [0.5.0] - 2026-07-17

### Changed

- Shared CLI and icon-decode logic with the extractor packages; tightened row
  and type safety.

## [0.4.1] - 2026-07-17

### Fixed

- Hardened decoding against malformed CDN data instead of throwing on
  unexpected shapes.

## [0.4.0] - 2026-07-02

### Added

- Decode uncompressed DX10 icons (DXGI formats 28/29/87/88).

### Changed

- Documented output contracts and added field-level JSDoc.

## [0.3.2] - 2026-06-28

### Changed

- Switched to the `pathofexile-dat` public API for the CDN source instead of
  its internal paths.

## [0.3.1] - 2026-06-27

### Fixed

- Fail loudly instead of silently continuing when `pathofexile-dat` internal
  paths break.

## [0.3.0] - 2026-06-24

No functional change; version bump alongside the monorepo-wide 0.3.0 release.

## [0.2.0] - 2026-06-24

No functional change; version bump alongside the monorepo-wide 0.2.0 release.

## [0.1.0] - 2026-06-23

### Added

- Initial public package, scoped under `@poe2-toolkit`.
