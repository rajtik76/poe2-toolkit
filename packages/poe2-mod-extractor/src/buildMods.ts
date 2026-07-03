/**
 * Builds the Path of Exile 2 item-mod data from GGPK tables. Source of truth:
 * GGPK only.
 *
 * A mod carries its roll as a numeric `(stat id, [min, max])` range per stat; the
 * stat-description engine from `@poe2-toolkit/ggpk` renders each stat to text
 * through GGG's own `stat_descriptions.csd`, and the min and max passes are merged
 * into a single ranged line ("+(9-16) to Armour"). Structured `(stat, min, max)`
 * rolls are kept alongside the rendered lines.
 *
 * Keying is by `Mods.Id` - the stable internal id (e.g.
 * `LocalIncreasedPhysicalDamagePercent8`) - since a mod has no single display
 * name. Each mod also exposes the item-type `spawnWeights` that gate where it can
 * roll; those tags share the `Tags.Id` vocabulary that
 * `@poe2-toolkit/item-extractor` puts on each item's `tags`, so the two datasets
 * join on tags with no shared code.
 */

import { buildStatIndex, renderBlock } from '@poe2-toolkit/ggpk';
import type { GgpkSource, StatIndex } from '@poe2-toolkit/ggpk';

/** One stat's inclusive roll range on a mod. */
export interface ModRoll {
  /** Stat id, `Stats.Id` (e.g. `local_physical_damage_+%`). */
  stat: string;
  /** Inclusive minimum of the raw stat value. */
  min: number;
  /** Inclusive maximum of the raw stat value. */
  max: number;
}

/**
 * One item-type spawn gate. A mod can roll on an item when the first of its
 * `spawnWeights` whose {@link ModSpawnWeight.tag} the item carries has a
 * {@link ModSpawnWeight.weight} above zero; a `weight` of 0 blocks that tag. The
 * `default` tag matches every item, so a trailing `default` weight is the
 * catch-all. Order is significant (first match wins), so this is a list, not a map.
 */
export interface ModSpawnWeight {
  /** Item-type tag, `Tags.Id` (e.g. `weapon`, `str_armour`, `ring`, `default`). */
  tag: string;
  /** Spawn weight for that tag; 0 excludes the mod from items matching it. */
  weight: number;
}

/** One item mod: its affix name, roll ranges, tier and spawn gates. */
export interface Mod {
  /**
   * Affix name shown on the item (e.g. `Merciless`), from `Mods.Name`; `null`
   * when the mod has no name (implicit, unique and many generated mods).
   */
  name: string | null;
  /**
   * Item domain the mod belongs to, from `ModDomains` (e.g. `Item`, `Flask`,
   * `Monster`). The rollable equipment affix pool is domain `Item`.
   */
  domain: string;
  /**
   * How the mod is generated, from `ModGenerationType` (e.g. `Prefix`, `Suffix`,
   * `Unique`, `Corrupted`). The random affix pool is `Prefix` / `Suffix`.
   */
  generationType: string;
  /**
   * Mod group, `ModType.Name` (e.g. `LocalPhysicalDamagePercent`); `null` when
   * the mod has no group. Mods sharing a group are the same modifier at different
   * tiers, so a group is the tier ladder.
   */
  group: string | null;
  /**
   * 1-based tier of the mod within its affix ladder, ranked by ascending
   * {@link Mod.level}: tier 1 is the lowest-level (weakest) tier, matching the
   * numeric suffix on the id (`...Percent1` is tier 1, `...Percent8` is tier 8).
   * `null` when the mod has no group. The ladder is scoped to
   * `(group, domain, generationType)`, so an eight-tier item prefix ranks 1..8
   * even though its `ModType` also holds the fixed unique rolls of the same
   * modifier.
   */
  tier: number | null;
  /** Minimum item / area level at which the mod can roll, from `Mods.Level`. */
  level: number;
  /**
   * Rendered stat lines with the roll shown as a range (e.g. `+(9-16) to Armour`,
   * `Adds (1-2) to (4-5) Physical Damage`). Empty when the mod grants no numeric
   * stats. A fixed roll (min equal to max) renders as a plain number.
   */
  stats: string[];
  /**
   * Structured rolls backing {@link Mod.stats}: each referenced stat with its
   * inclusive `[min, max]`. Kept separate from the rendered text so a consumer can
   * do its own math; a two-stat line (added damage) yields two rolls.
   */
  rolls: ModRoll[];
  /**
   * Mutual-exclusion family ids, from `ModFamily.Id`. Two mods sharing a family
   * cannot both roll on one item (e.g. flat and hybrid life).
   */
  families: string[];
  /**
   * Item-type spawn gates from `SpawnWeight_Tags` / `SpawnWeight_Values`, in
   * order. This is the item-category gate: it decides which item types the mod
   * can appear on. See {@link ModSpawnWeight}.
   */
  spawnWeights: ModSpawnWeight[];
}

/** Mods keyed by `Mods.Id` - the stable internal mod id. */
export type ModData = Record<string, Mod>;

/** GGPK path of GGG's stat-description file (UTF-16 text despite the extension). */
const STAT_DESCRIPTIONS_PATH = 'data/statdescriptions/stat_descriptions.csd';

/** Number of stat slots a mod row carries (`Stat1`..`Stat6`). */
const STAT_SLOTS = 6;

/**
 * `ModDomains` enumerators in schema order (1-based; `Mods.Domain` indexes this).
 * From `poe-tool-dev/dat-schema`; a value with no name falls back to its number.
 */
const MOD_DOMAINS = [
  'Item', 'Flask', 'Monster', 'Chest', 'Area', null, 'Sanctum Relic', null, 'Crafted', 'Base Jewel',
  'Atlas', 'Leaguestone', 'Abyss Jewel', 'Map Device', 'Dummy', 'Delve', 'Delve Area', 'Synthesis A',
  'Synthesis Globals', 'Synthesis Bonus', 'Affliction Jewel', 'Heist Area', 'Heist NPC', 'Heist Trinket',
  'Watchstone', 'Veiled', 'Expedition Relic', 'Unveiled', 'Eldritch Altar', 'Sentinel', 'Memory Line',
  'Sanctum Special', 'Crucible Map', 'Tincture', 'Animal Charm', 'Necropolis Monster', 'Idol', 'Graft',
] as const;

/**
 * `ModGenerationType` enumerators in schema order (1-based; `Mods.GenerationType`
 * indexes this). From `poe-tool-dev/dat-schema`.
 */
const MOD_GENERATION_TYPES = [
  'Prefix', 'Suffix', 'Unique', 'Nemesis', 'Corrupted', 'Bloodlines', 'Torment', 'Tempest', 'Talisman',
  'Enchantment', 'Essence', null, 'Bestiary', 'Delve Area', 'Synthesis A', 'Synthesis Globals',
  'Synthesis Bonus', 'Blight', 'Blight Tower', 'Monster Affliction', 'Flask Enchantment Enkindling',
  'Flask Enchantment Instilling', 'Expedition Logbook', 'Scourge Upside', 'Scourge Downside', 'Scourge Map',
  null, 'Exarch Implicit', 'Eater Implicit', null, 'Weapon Tree', 'Weapon Tree Recombined', null,
  'Necropolis Haunted', 'Necropolis Devoted', 'Memory Altar',
] as const;

// --- raw GGPK row shapes (only the columns this build reads) -----------------

/**
 * One `Mods` row. `StatN` is a foreign-row index into `Stats`; `StatNValue` is
 * the `[min, max]` roll for that stat. `Domain` / `GenerationType` are 1-based
 * enum indices; `ModType` and `Families` index `ModType` / `ModFamily`.
 */
interface ModRow {
  Id?: string;
  Name?: string;
  Domain?: number | null;
  GenerationType?: number | null;
  ModType?: number | null;
  Families?: number[];
  Level?: number;
  SpawnWeight_Tags?: number[];
  SpawnWeight_Values?: number[];
  [statColumn: string]: unknown;
}

interface ModTypeRow { Name?: string }
interface ModFamilyRow { Id?: string }
interface StatRow { Id?: string }
interface TagRow { Id?: string }

/** Look up a 1-based enum value in its name table, falling back to the number. */
function enumName(table: readonly (string | null)[], value: number | null | undefined): string {
  if (value == null) {
    return 'Unknown';
  }

  return table[value - 1] ?? String(value);
}

/** Read a UTF-16 `.csd` stat-description file from the source into a string. */
async function readCsd(source: GgpkSource, path: string): Promise<string> {
  const bytes = await source.file(path);

  if (!bytes) {
    throw new Error(`stat descriptions not found: ${path}`);
  }

  return Buffer.from(bytes).toString('utf16le');
}

/**
 * Merge a min-value line and a max-value line into one, showing each differing
 * number as `(min-max)` and leaving equal numbers as a plain value. The two lines
 * share their non-numeric text (same template), so the merge zips the number runs;
 * if their structure differs (a rare value-dependent variant), the max line is
 * kept unchanged rather than producing a malformed range.
 */
function mergeRange(minLine: string, maxLine: string): string {
  const number = /-?\d+(?:\.\d+)?/g;
  const minSegments = minLine.split(number);
  const maxSegments = maxLine.split(number);
  const minNumbers = minLine.match(number) ?? [];
  const maxNumbers = maxLine.match(number) ?? [];

  // The two passes must share the same template - same text around the numbers -
  // for a range merge to be meaningful. A value-dependent variant (e.g. "reduced"
  // at one end, "increased" at the other) breaks that, so keep the max line whole.
  if (minSegments.length !== maxSegments.length || minSegments.some((seg, i) => seg !== maxSegments[i])) {
    return maxLine;
  }

  // `split` always yields one more segment than there are numbers, so every
  // segment index below is present.
  let out = minSegments[0]!;

  for (let i = 0; i < minNumbers.length; i += 1) {
    const lo = minNumbers[i]!;
    const hi = maxNumbers[i]!;

    if (lo === hi) {
      out += lo;
    } else {
      // Order ascending so a range always reads low-to-high.
      out += Number(lo) <= Number(hi) ? `(${lo}-${hi})` : `(${hi}-${lo})`;
    }

    out += minSegments[i + 1]!;
  }

  return out;
}

/** Collect a mod's `(stat id, [min, max])` rolls from its non-null stat slots. */
function readRolls(mod: ModRow, Stats: StatRow[]): ModRoll[] {
  const rolls: ModRoll[] = [];

  for (let slot = 1; slot <= STAT_SLOTS; slot += 1) {
    const statIndex = mod[`Stat${slot}`] as number | null | undefined;

    if (statIndex == null) {
      continue;
    }

    const stat = Stats[statIndex]?.Id;
    const value = mod[`Stat${slot}Value`] as [number, number] | undefined;

    if (typeof stat !== 'string' || !value) {
      continue;
    }

    rolls.push({ stat, min: value[0], max: value[1] });
  }

  return rolls;
}

/** Render a mod's rolls to ranged stat lines via the stat-description engine. */
function renderStats(statIndex: StatIndex, rolls: ModRoll[]): string[] {
  if (rolls.length === 0) {
    return [];
  }

  const statIds = rolls.map((roll) => roll.stat);
  const minLines = renderBlock(statIndex, statIds, rolls.map((roll) => roll.min)).lines;
  const maxLines = renderBlock(statIndex, statIds, rolls.map((roll) => roll.max)).lines;

  return minLines.map((line, i) => mergeRange(line, maxLines[i] ?? line));
}

/** Zip a mod's spawn-weight tags and values into ordered `{ tag, weight }` gates. */
function readSpawnWeights(mod: ModRow, Tags: TagRow[]): ModSpawnWeight[] {
  const tags = mod.SpawnWeight_Tags ?? [];
  const values = mod.SpawnWeight_Values ?? [];
  const weights: ModSpawnWeight[] = [];

  tags.forEach((tagIndex, i) => {
    const tag = Tags[tagIndex]?.Id;

    if (typeof tag === 'string') {
      weights.push({ tag, weight: values[i] ?? 0 });
    }
  });

  return weights;
}

/**
 * Assign each mod a 1-based tier, ranked by ascending level (ties broken by id for
 * a stable order). Returns a map from mod id to tier.
 *
 * Ranking is scoped to the mod's `ModType` *and* its domain and generation type,
 * not the group alone: one `ModType` also holds the same modifier for other
 * contexts (a group's 8 item prefixes sit beside dozens of fixed unique rolls), so
 * ranking the whole group would inflate the tiers. Scoping to
 * `(group, domain, generationType)` recovers the affix ladder a player sees.
 */
function computeTiers(mods: ModRow[]): Map<string, number> {
  const byGroup = new Map<string, { id: string; level: number }[]>();

  for (const mod of mods) {
    if (mod.ModType == null || typeof mod.Id !== 'string') {
      continue;
    }

    const key = `${mod.ModType}|${mod.Domain ?? ''}|${mod.GenerationType ?? ''}`;
    const list = byGroup.get(key) ?? [];
    list.push({ id: mod.Id, level: mod.Level ?? 0 });
    byGroup.set(key, list);
  }

  const tierById = new Map<string, number>();

  for (const list of byGroup.values()) {
    list.sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));
    list.forEach((entry, i) => tierById.set(entry.id, i + 1));
  }

  return tierById;
}

/**
 * Build the mod export from the supplied {@link GgpkSource}. All data comes from
 * the source's tables and the stat-description file; this function performs no I/O
 * of its own beyond what the source serves.
 */
export async function buildMods(source: GgpkSource): Promise<ModData> {
  const Mods = (await source.table('Mods')) as ModRow[];
  const ModType = (await source.table('ModType')) as ModTypeRow[];
  const ModFamily = (await source.table('ModFamily')) as ModFamilyRow[];
  const Stats = (await source.table('Stats')) as StatRow[];
  const Tags = (await source.table('Tags')) as TagRow[];

  const statIndex: StatIndex = buildStatIndex(await readCsd(source, STAT_DESCRIPTIONS_PATH));
  const tierById = computeTiers(Mods);

  const mods: ModData = {};

  for (const mod of Mods) {
    const id = mod.Id;

    if (typeof id !== 'string' || id === '' || mods[id]) {
      continue;
    }

    const rolls = readRolls(mod, Stats);
    const group = mod.ModType != null ? ModType[mod.ModType]?.Name ?? null : null;

    mods[id] = {
      name: mod.Name && mod.Name !== '' ? mod.Name : null,
      domain: enumName(MOD_DOMAINS, mod.Domain),
      generationType: enumName(MOD_GENERATION_TYPES, mod.GenerationType),
      group,
      // Tier is a position in the group ladder, so it is only meaningful with a
      // group; a mod with a resolved group is always tiered (both come from ModType).
      tier: group != null ? tierById.get(id)! : null,
      level: mod.Level ?? 0,
      stats: renderStats(statIndex, rolls),
      rolls,
      families: (mod.Families ?? [])
        .map((index) => ModFamily[index]?.Id)
        .filter((familyId): familyId is string => typeof familyId === 'string'),
      spawnWeights: readSpawnWeights(mod, Tags),
    };
  }

  return mods;
}
