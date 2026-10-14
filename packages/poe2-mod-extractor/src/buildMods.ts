/**
 * Builds item-mod data from GGPK tables, keyed by `Mods.Id`. Rolls are `(stat id, [min, max])` ranges; the min and max
 * passes are rendered via the stat-description engine and merged into one ranged line ("+(9-16) to Armour").
 * `spawnWeights` use the `Tags.Id` vocabulary of `item-extractor`'s item `tags`, so the datasets join on tags.
 */

import { buildStatIndex, renderBlock } from '@poe2-toolkit/ggpk';
import type { GgpkSource, StatIndex } from '@poe2-toolkit/ggpk';

export interface ModRoll {
  stat: string;
  min: number;
  max: number;
}

/** The first `spawnWeights` entry whose tag the item carries decides: weight 0 blocks it. `default` matches every item. Order matters, so this is a list. */
export interface ModSpawnWeight {
  tag: string;
  weight: number;
}

export interface Mod {
  /** From `Mods.Name`; `null` for implicit, unique and many generated mods. */
  name: string | null;
  /** From `ModDomains`. The rollable equipment affix pool is `Item`. */
  domain: string;
  generationType: string;
  group: string | null;
  /**
   * 1-based tier in the affix ladder by ascending {@link Mod.level} (tier 1 = lowest level), matching the id suffix.
   * `null` without a group. Scoped to `(group, domain, generationType)`, so an 8-tier prefix ranks 1..8 despite
   * the fixed unique rolls sharing its `ModType`.
   */
  tier: number | null;
  level: number;
  stats: string[];
  /** Structured rolls backing {@link Mod.stats}; a two-stat line (added damage) yields two. */
  rolls: ModRoll[];
  /** From `ModFamily.Id`. Mods sharing a family cannot both roll on one item (e.g. flat and hybrid life). */
  families: string[];
  /** From `SpawnWeight_Tags` / `SpawnWeight_Values`, in order. See {@link ModSpawnWeight}. */
  spawnWeights: ModSpawnWeight[];
}

export type ModData = Record<string, Mod>;

const STAT_DESCRIPTIONS_PATH = 'data/statdescriptions/stat_descriptions.csd';

const STAT_SLOTS = 6;

/** `ModDomains` in schema order (1-based), from `poe-tool-dev/dat-schema`; an unnamed value falls back to its number. */
const MOD_DOMAINS = [
  'Item', 'Flask', 'Monster', 'Chest', 'Area', null, 'Sanctum Relic', null, 'Crafted', 'Base Jewel',
  'Atlas', 'Leaguestone', 'Abyss Jewel', 'Map Device', 'Dummy', 'Delve', 'Delve Area', 'Synthesis A',
  'Synthesis Globals', 'Synthesis Bonus', 'Affliction Jewel', 'Heist Area', 'Heist NPC', 'Heist Trinket',
  'Watchstone', 'Veiled', 'Expedition Relic', 'Unveiled', 'Eldritch Altar', 'Sentinel', 'Memory Line',
  'Sanctum Special', 'Crucible Map', 'Tincture', 'Animal Charm', 'Necropolis Monster', 'Idol', 'Graft',
] as const;

const MOD_GENERATION_TYPES = [
  'Prefix', 'Suffix', 'Unique', 'Nemesis', 'Corrupted', 'Bloodlines', 'Torment', 'Tempest', 'Talisman',
  'Enchantment', 'Essence', null, 'Bestiary', 'Delve Area', 'Synthesis A', 'Synthesis Globals',
  'Synthesis Bonus', 'Blight', 'Blight Tower', 'Monster Affliction', 'Flask Enchantment Enkindling',
  'Flask Enchantment Instilling', 'Expedition Logbook', 'Scourge Upside', 'Scourge Downside', 'Scourge Map',
  null, 'Exarch Implicit', 'Eater Implicit', null, 'Weapon Tree', 'Weapon Tree Recombined', null,
  'Necropolis Haunted', 'Necropolis Devoted', 'Memory Altar',
] as const;

/** `StatN` indexes `Stats`; `StatNValue` is its `[min, max]` roll. `Domain`/`GenerationType` are 1-based enum indices. */
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
  Stat1?: number | null;
  Stat1Value?: [number, number];
  Stat2?: number | null;
  Stat2Value?: [number, number];
  Stat3?: number | null;
  Stat3Value?: [number, number];
  Stat4?: number | null;
  Stat4Value?: [number, number];
  Stat5?: number | null;
  Stat5Value?: [number, number];
  Stat6?: number | null;
  Stat6Value?: [number, number];
}

interface ModTypeRow { Name?: string }
interface ModFamilyRow { Id?: string }
interface StatRow { Id?: string }
interface TagRow { Id?: string }

function enumName(table: readonly (string | null)[], value: number | null | undefined): string {
  if (value == null) {
    return 'Unknown';
  }

  return table[value - 1] ?? String(value);
}

async function readCsd(source: GgpkSource, path: string): Promise<string> {
  const bytes = await source.file(path);

  if (!bytes) {
    throw new Error(`stat descriptions not found: ${path}`);
  }

  return Buffer.from(bytes).toString('utf16le');
}

/** Merges a min line and a max line, showing each differing number as `(min-max)`. If their structure differs the max line is kept unchanged. */
function mergeRange(minLine: string, maxLine: string): string {
  const number = /-?\d+(?:\.\d+)?/g;
  const minSegments = minLine.split(number);
  const maxSegments = maxLine.split(number);
  const minNumbers = minLine.match(number) ?? [];
  const maxNumbers = maxLine.match(number) ?? [];

  // A value-dependent variant ("reduced" at one end, "increased" at the other) breaks the shared template: keep the max line whole.
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

function readRolls(mod: ModRow, Stats: StatRow[]): ModRoll[] {
  const rolls: ModRoll[] = [];

  for (let slot = 1; slot <= STAT_SLOTS; slot += 1) {
    // Stat1..Stat6 are declared fields on `ModRow`, so the cast can't accept a typo'd column.
    const statIndex = mod[`Stat${slot}` as keyof ModRow] as number | null | undefined;

    if (statIndex == null) {
      continue;
    }

    const stat = Stats[statIndex]?.Id;
    const value = mod[`Stat${slot}Value` as keyof ModRow] as [number, number] | undefined;

    if (typeof stat !== 'string' || !value) {
      continue;
    }

    rolls.push({ stat, min: value[0], max: value[1] });
  }

  return rolls;
}

function renderStats(statIndex: StatIndex, rolls: ModRoll[]): string[] {
  if (rolls.length === 0) {
    return [];
  }

  const statIds = rolls.map((roll) => roll.stat);
  // A zero end has no line of its own (`1|#`, `#|-1` leave 0 out), so it takes the line of the range's other end:
  // (0-2) picks as 2, keeping "+(0-2) Charm Slots" on one template.
  const pickAt = (end: number, other: number): number => (end !== 0 ? end : other);
  const minLines = renderBlock(statIndex, statIds, rolls.map((roll) => roll.min), {
    selectBy: rolls.map((roll) => pickAt(roll.min, roll.max)),
  }).lines;
  const maxLines = renderBlock(statIndex, statIds, rolls.map((roll) => roll.max), {
    selectBy: rolls.map((roll) => pickAt(roll.max, roll.min)),
  }).lines;

  return minLines.map((line, i) => mergeRange(line, maxLines[i] ?? line));
}

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
 * 1-based tier by ascending level (ties by id). Scoped to `(group, domain, generationType)`, not the group alone:
 * one `ModType` also holds fixed unique rolls beside the 8 item prefixes, which would inflate the tiers.
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
      // Tier is a position in the group ladder, only meaningful with a group.
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
