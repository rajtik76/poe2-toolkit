/**
 * Builds the Path of Exile 2 rune / soul-core data from GGPK tables. Source of
 * truth: GGPK only.
 *
 * Soul cores carry only numeric `(stat id, value)` pairs; the stat-description
 * engine from `@poe2-toolkit/ggpk` renders them to text via GGG's own
 * `stat_descriptions.csd`. Each effect line is grouped per stat category and
 * prefixed with the slot it applies to ("All Equipment: +9 to Dexterity",
 * "Martial Weapon: Adds 4 to 6 Fire Damage", "Helmet: 2% increased Experience
 * gain"). Bonded effects are rendered the same way into their own list. The
 * rules follow Path of Building's soul-core export.
 *
 * Keying is by display name (the base type line a build shows). A soul core is a
 * base item, so its icon is its base's visual identity - kept here as a raw GGPK
 * DDS path and decoded to PNG by {@link buildRuneIcons}, mirroring the item and
 * gem extractors.
 */

import { buildStatIndex, renderBlock } from '@poe2-toolkit/ggpk';
import type { GgpkSource, StatIndex } from '@poe2-toolkit/ggpk';

/** One rune / soul core as serialized for the build front-end. */
export interface Rune {
  /**
   * Required character level, taken as `core.RequiredLevel || null` - so a
   * `RequiredLevel` of 0 (no requirement) becomes `null` rather than `0`.
   */
  levelRequirement: number | null;
  /**
   * Rendered stat lines, each prefixed with the equipment slot it applies to
   * (`"<slot>: <rendered stat>"`, e.g. `"Armour: +14% to Fire Resistance"`).
   * The slot is the category's `SoulCoreStatCategories.Display`, or its `Id`
   * when GGG leaves the display empty (`"Helmet"`); one soul core groups several
   * slot categories.
   */
  effects: string[];
  /**
   * Bonded effects (`SoulCoreStats.BondedStats`), rendered and prefixed the same
   * way as {@link Rune.effects}. Empty when the rune has none.
   */
  bonded: string[];
  /**
   * Raw GGPK DDS path of the soul core base's icon, or `null` when none is
   * referenced. Decoded to PNG by {@link buildRuneIcons}.
   */
  icon: string | null;
}

/**
 * Runes keyed by display name - the soul core's `BaseItemTypes.Name` (the base
 * type line a build shows).
 */
export type RuneData = Record<string, Rune>;

/** GGPK path of GGG's stat-description file (UTF-16 text despite the extension). */
const STAT_DESCRIPTIONS_PATH = 'data/statdescriptions/stat_descriptions.csd';

// --- raw GGPK row shapes (only the columns this build reads) -----------------

interface SoulCoreRow { BaseItemType?: number | null; RequiredLevel?: number }
interface SoulCoreStatRow {
  SoulCore?: number | null;
  StatCategory?: number | null;
  Stats?: number[];
  StatsValues?: number[];
  BondedStats?: number[];
  BondedStatsValues?: number[];
}
interface SoulCoreStatCategoryRow { Id?: string; Display?: string }
interface BaseItemTypeRow { Name?: string; ItemVisualIdentity?: number | null }
interface ItemVisualIdentityRow { DDSFile?: string }
interface StatRow { Id?: string }

/** Strip PoE bbcode: `[Cold]` -> `Cold`, `[AoESkill|AoE]` -> `AoE` (display half). */
function stripBbcode(text: string): string {
  return text.replace(/\[([^\]]+)\]/g, (_, inner: string) => {
    const pipe = inner.lastIndexOf('|');

    return pipe === -1 ? inner : inner.slice(pipe + 1);
  });
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
 * Build the rune export from the supplied {@link GgpkSource}. All data comes
 * from the source's tables and the stat-description file; this function performs
 * no I/O of its own beyond what the source serves.
 */
export async function buildRunes(source: GgpkSource): Promise<RuneData> {
  const SoulCores = (await source.table('SoulCores')) as SoulCoreRow[];
  const SoulCoreStats = (await source.table('SoulCoreStats')) as SoulCoreStatRow[];
  const SoulCoreStatCategories = (await source.table('SoulCoreStatCategories')) as SoulCoreStatCategoryRow[];
  const BaseItemTypes = (await source.table('BaseItemTypes')) as BaseItemTypeRow[];
  const ItemVisualIdentity = (await source.table('ItemVisualIdentity')) as ItemVisualIdentityRow[];
  const Stats = (await source.table('Stats')) as StatRow[];

  const statIndex: StatIndex = buildStatIndex(await readCsd(source, STAT_DESCRIPTIONS_PATH));

  // SoulCore index -> its stat rows (a core groups several stat categories).
  const statRowsByCore = new Map<number, SoulCoreStatRow[]>();

  for (const row of SoulCoreStats) {
    if (row.SoulCore == null) {
      continue;
    }

    const list = statRowsByCore.get(row.SoulCore) ?? [];
    list.push(row);
    statRowsByCore.set(row.SoulCore, list);
  }

  const runes: RuneData = {};

  /** Render one stat list in description-file order, each line prefixed with its slot. */
  function slotLines(slot: string, stats: number[] | undefined, values: number[] | undefined): string[] {
    // Pair each stat with its value before dropping unresolvable stat rows, so a
    // gap never shifts the values onto the wrong stats.
    const pairs = (stats ?? [])
      .map((index, slotIndex) => ({ id: Stats[index]?.Id, value: values?.[slotIndex] ?? 0 }))
      .filter((pair): pair is { id: string; value: number } => Boolean(pair.id));
    const { lines } = renderBlock(statIndex, pairs.map((pair) => pair.id), pairs.map((pair) => pair.value), {
      descriptionOrder: true,
    });

    // GGG templates carry literal "\n" for multi-line stats; make it a real newline.
    return lines.map((line) => line.replace(/\\n/g, '\n')).map((line) => (slot ? `${slot}: ${line}` : line));
  }

  SoulCores.forEach((core, coreIndex) => {
    const base = core.BaseItemType != null ? BaseItemTypes[core.BaseItemType] : undefined;
    // GGG sometimes leaves stray spaces around a name.
    const name = base?.Name?.trim();

    // Unreleased cores carry DNT in the name ("[DNT-Unused] Rune of Chance").
    if (!name || name.includes('DNT')) {
      return;
    }

    const effects: string[] = [];
    const bonded: string[] = [];

    for (const row of statRowsByCore.get(coreIndex) ?? []) {
      const category = row.StatCategory != null ? SoulCoreStatCategories[row.StatCategory] : undefined;
      const slot = stripBbcode(category?.Display || category?.Id || '').trim();

      effects.push(...slotLines(slot, row.Stats, row.StatsValues));
      bonded.push(...slotLines(slot, row.BondedStats, row.BondedStatsValues));
    }

    const ivi = base?.ItemVisualIdentity;

    runes[name] = {
      levelRequirement: core.RequiredLevel || null,
      effects,
      bonded,
      icon: ivi != null ? ItemVisualIdentity[ivi]?.DDSFile ?? null : null,
    };
  });

  return runes;
}
