# Changelog

All notable changes to `@poe2-toolkit/item-extractor` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versions follow [Semantic Versioning](https://semver.org/).

## [0.12.0] - 2026-07-17

### Added

- Base weapon stats on every item as `weapon` (with the exported `ItemWeapon`
  type): physical `damageMin` / `damageMax`, `critical` (crit chance x 100),
  `attackTime` and `reloadTime` in milliseconds, and `rangeMax`, read from the
  PoE2 `WeaponTypes` table. `null` on bases without a weapon row (armour,
  jewellery, off-hands, caster weapons) and on uniques.
- `spirit`: the base spirit granted, read from `ItemSpirit` (non-zero only on
  sceptre bases).
- `dropLevel`: the level the base starts dropping at, from
  `BaseItemTypes.DropLevel` (`0` on uniques, which carry no base link).

### Changed

- `buildItems` now also reads the `WeaponTypes` and `ItemSpirit` tables - add
  both to your dat-extract config when upgrading, or the build throws on the
  missing table. Mind that the schema ships two `WeaponTypes` variants; the
  PoE2 one (columns `BaseItemType`, `CritChance`, ...) is required.

## [0.11.2] - 2026-07-17

### Changed

- Bumped the pinned `@poe2-toolkit/ggpk` range from `^0.5.0` to `^0.6.0` to
  match the current minimum version.

## [0.11.1] - 2026-07-17

### Changed

- Shared CLI and icon-decode logic with the other extractor packages;
  tightened row and type safety.

## [0.11.0] - 2026-07-14

### Added

- Base armour, evasion, energy shield, ward and block values.

## [0.10.0] - 2026-07-03

### Added

- Derive unique flask Life/Mana values from the model path.

## [0.9.1] - 2026-07-03

### Fixed

- Composite flask icons instead of cropping them.

## [0.9.0] - 2026-07-03

### Added

- Scope mod joins by domain.

### Fixed

- Flask icons.

## [0.8.0] - 2026-07-03

### Added

- Effective item tags for joining mods.

## [0.7.0] - 2026-07-02

### Added

- Unique flavour text.

## [0.6.0] - 2026-07-02

### Fixed

- Pinned `@poe2-toolkit/ggpk` to `^0.4.0` so the uncompressed DX10 icon
  decoder is actually pulled in (`^0.3.0` excluded it).

## [0.5.0] - 2026-07-02

### Added

- Unique items with rarity and category.

## [0.4.0] - 2026-06-27

### Added

- Base-item data and icon extraction.

## [0.3.0] - 2026-06-24

No functional change; version bump alongside the monorepo-wide 0.3.0 release.

## [0.2.0] - 2026-06-24

No functional change; version bump alongside the monorepo-wide 0.2.0 release.

## [0.1.0] - 2026-06-23

### Added

- Initial public package, scoped under `@poe2-toolkit`.
