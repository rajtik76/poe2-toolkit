# Changelog

All notable changes to `@poe2-toolkit/tree-react` are documented here. Format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions
follow [Semantic Versioning](https://semver.org/).

## [0.8.1] - 2026-07-12

### Fixed

- End hover state when the pointer leaves the canvas.

## [0.8.0] - 2026-07-12

### Added

- Configurable allocation palette, with in-game weapon-set colours.

## [0.7.2] - 2026-07-11

### Changed

- Extracted render decisions into pure, testable modules.

## [0.7.1] - 2026-07-02

### Changed

- Documented output contracts and added field-level JSDoc.

## [0.7.0] - 2026-06-28

### Added

- Pinch-zoom the passive tree on touch.

## [0.6.1] - 2026-06-27

### Changed

- Extracted viewport math into a testable module and covered it with tests.

## [0.6.0] - 2026-06-27

### Added

- `edgeOverlays` for multi-colour edge highlighting.

## [0.5.0] - 2026-06-26

### Added

- Weapon-set allocation support and GGPK-derived point budgets.

### Removed

- Path of Building import support.

## [0.4.1] - 2026-06-24

### Added

- Tunable search-highlight rings via `highlightStyle`.

## [0.4.0] - 2026-06-24

### Added

- Dim unallocated node icons at render time (0x808080 multiply), matching the
  game and PoB, instead of drawing them from a baked grayscale atlas.

### Fixed

- Clamp drag-pan so the tree can't be dragged off-screen.

### Changed

- **BREAKING:** `iconKeyFor` drops its `allocated` argument and always
  resolves the active sprite; consumers now rely on the render-time tint for
  the unallocated look.

## [0.3.0] - 2026-06-24

No functional change; version bump alongside the monorepo-wide 0.3.0 release.

## [0.2.0] - 2026-06-24

### Added

- Show debug ids on relocated ascendancy nodes.

## [0.1.3] - 2026-06-23

### Added

- Render the passive tree with WebGL via PixiJS.
- StrictMode-safe Pixi init; lossless arc geometry from the `.psg`.

## [0.1.2] - 2026-06-23

### Fixed

- Update `drawRef` inside an effect instead of during render.

## [0.1.1] - 2026-06-23

### Changed

- Coalesce tree repaints to one per frame.

## [0.1.0] - 2026-06-23

### Added

- Initial public package, scoped under `@poe2-toolkit`.
