/**
 * Builds rune / soul-core data from GGPK tables, keyed by display name. Stats render via the stat-description engine
 * and are prefixed with the slot they apply to ("Helmet: 2% increased Experience gain"), following PoB's soul-core
 * export. Bonded effects render the same way into their own list. The icon stays a raw DDS path (decoded by {@link buildRuneIcons}).
 */

import { buildStatIndex, renderBlock } from '@poe2-toolkit/ggpk';
import type { GgpkSource, StatIndex } from '@poe2-toolkit/ggpk';

export interface Rune {
  /** `core.RequiredLevel || null`: 0 (no requirement) becomes `null`. */
  levelRequirement: number | null;
  /** `"<slot>: <stat>"`. The slot is `SoulCoreStatCategories.Display`, or its `Id` when the display is empty. */
  effects: string[];
  bonded: string[];
  icon: string | null;
}

export type RuneData = Record<string, Rune>;

const STAT_DESCRIPTIONS_PATH = 'data/statdescriptions/stat_descriptions.csd';

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

function stripBbcode(text: string): string {
  return text.replace(/\[([^\]]+)\]/g, (_, inner: string) => {
    const pipe = inner.lastIndexOf('|');

    return pipe === -1 ? inner : inner.slice(pipe + 1);
  });
}

async function readCsd(source: GgpkSource, path: string): Promise<string> {
  const bytes = await source.file(path);

  if (!bytes) {
    throw new Error(`stat descriptions not found: ${path}`);
  }

  return Buffer.from(bytes).toString('utf16le');
}

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

  function slotLines(slot: string, stats: number[] | undefined, values: number[] | undefined): string[] {
    // Pair each stat with its value before dropping unresolvable stat rows, so a gap never shifts values onto the wrong stats.
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
