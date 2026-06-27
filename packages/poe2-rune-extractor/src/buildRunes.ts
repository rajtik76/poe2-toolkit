/**
 * Builds the Path of Exile 2 rune / soul-core data from GGPK tables. Source of
 * truth: GGPK only.
 *
 * Soul cores carry only numeric `(stat id, value)` pairs; the stat-description
 * engine from `@poe2-toolkit/ggpk` renders them to text via GGG's own
 * `stat_descriptions.csd`. Each effect line is grouped per stat category and
 * prefixed with the slot it applies to ("All Equipment: +9 to Dexterity",
 * "Martial Weapon: Adds 4 to 6 Fire Damage").
 *
 * Keying is by display name (the base type line a build shows). Runes have no
 * icon of their own - the soul-core base's icon, if any, comes from the item
 * extractor - so this package produces data only.
 */

import { buildStatIndex, renderBlock } from '@poe2-toolkit/ggpk';
import type { GgpkSource, StatIndex } from '@poe2-toolkit/ggpk';

/** One rune / soul core as serialized for the build front-end. */
export interface Rune {
  /** Character level the soul core requires, or `null` when it has none. */
  levelRequirement: number | null;
  /** Rendered effect lines, each prefixed with the equipment slot it applies to. */
  effects: string[];
}

/** Runes keyed by display name. */
export type RuneData = Record<string, Rune>;

/** GGPK path of GGG's stat-description file (UTF-16 text despite the extension). */
const STAT_DESCRIPTIONS_PATH = 'data/statdescriptions/stat_descriptions.csd';

// --- raw GGPK row shapes (only the columns this build reads) -----------------

interface SoulCoreRow { BaseItemType?: number | null; RequiredLevel?: number }
interface SoulCoreStatRow { SoulCore?: number | null; StatCategory?: number | null; Stats?: number[]; StatsValues?: number[] }
interface SoulCoreStatCategoryRow { Display?: string }
interface BaseItemTypeRow { Name?: string }
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

  SoulCores.forEach((core, coreIndex) => {
    const base = core.BaseItemType != null ? BaseItemTypes[core.BaseItemType] : undefined;
    const name = base?.Name;

    if (typeof name !== 'string' || name === '' || name.includes('[DNT]')) {
      return;
    }

    const effects: string[] = [];

    for (const row of statRowsByCore.get(coreIndex) ?? []) {
      const statIds = (row.Stats ?? [])
        .map((index) => Stats[index]?.Id)
        .filter((id): id is string => Boolean(id));
      const { lines } = renderBlock(statIndex, statIds, row.StatsValues ?? []);

      const slot = stripBbcode(
        (row.StatCategory != null ? SoulCoreStatCategories[row.StatCategory]?.Display : undefined) ?? '',
      ).trim();

      for (const line of lines) {
        effects.push(slot ? `${slot}: ${line}` : line);
      }
    }

    runes[name] = {
      levelRequirement: core.RequiredLevel || null,
      effects,
    };
  });

  return runes;
}
