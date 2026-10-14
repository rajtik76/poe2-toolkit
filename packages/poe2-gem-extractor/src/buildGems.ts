/**
 * Builds gem data from GGPK tables, joining `SkillGems` -> `GemEffects` -> `GrantedEffects` -> `ActiveSkills`.
 * Keyed by the last path segment of the base item's game id (PoB's `normalizeGemId`). Icons stay raw DDS paths
 * (decoded by {@link buildGemIcons}). Requirements and tooltip scaling follow PoB's formulas so the numbers match the game.
 */

import { buildStatIndex, csdInclude, renderBlock } from '@poe2-toolkit/ggpk';
import type { GgpkSource, StatIndex } from '@poe2-toolkit/ggpk';

export type GemKind = 'active' | 'support' | 'spirit';

export type GemColor = 'r' | 'g' | 'b' | 'w';

const GEM_KIND: Record<number, GemKind> = { 0: 'active', 1: 'support', 2: 'spirit' };
const GEM_COLOR: Record<number, GemColor> = { 1: 'r', 2: 'g', 3: 'b', 4: 'w' };

export interface GemReq {
  str: number;
  dex: number;
  int: number;
  level: number;
}

export interface Gem {
  name: string;
  kind: GemKind;
  color: GemColor;
  tags: string[];
  description: string | null;
  req: GemReq;
  icon: string | null;
  /**
   * Raw `SkillGems.UI_Image` of the tooltip background art, as the table holds it: a DDS path up to 4.5.4, a UIImages
   * sprite name (no extension) from 4.5.5 on. Sparse in the source: no support gem has one.
   */
  hoverImage: string | null;
}

export interface GemLevel {
  /** From the gem's level progression (`ItemExperiencePerLevel.Level`), never lower than the previous level, at least 1. */
  requiredLevel: number;
  str: number;
  dex: number;
  int: number;
}

export interface GemRequirement {
  name: string;
  levels: Record<number, GemLevel>;
}

export interface GemStatLine {
  text: string;
  /** Sole value for a single-value stat, or the first of a min/max pair. */
  min: number;
  max: number;
}

export interface GemLevelScaling {
  level: number;
  cost: number | null;
  /** Spells read `GrantedEffects.CastTime`; attack skills read the per-level `AttackTime` when nonzero. */
  castTime: number | null;
  cooldown: number | null;
  reservation: number | null;
  spellCritChance: number;
  attackCritChance: number;
  stats: GemStatLine[];
  /** `GrantedEffects.AdditionalStatSets` (e.g. Ice Nova's "Cold-Infused"); each inherits the first set's stats. */
  additionalStatSets?: GemStatSet[];
}

export interface GemStatSet {
  label: string;
  stats: GemStatLine[];
}

export interface GemScaling {
  name: string;
  levels: GemLevelScaling[];
  /** Bonus lines per point of quality, resolved at quality 20 (`min` is the value at quality 0). */
  qualityStats: GemStatLine[];
}

export interface GemData {
  /** Last segment wins on collision, matching the consumer's lookup. */
  gems: Record<string, Gem>;
  /** A gem with no per-level curve (e.g. many supports) is omitted. */
  requirements: Record<string, GemRequirement>;
  /** Omitted for a gem whose `GrantedEffects` row has no `StatSet`. */
  scaling: Record<string, GemScaling>;
}

interface SkillGemRow {
  BaseItemType?: number | null;
  StrengthRequirementPercent?: number;
  DexterityRequirementPercent?: number;
  IntelligenceRequirementPercent?: number;
  GemType?: number;
  GemColour?: number;
  MinLevelReq?: number;
  GemEffects?: number[];
  ItemExperienceType?: number | null;
  UI_Image?: string;
}

interface BaseItemTypeRow { Id?: string; Name?: string }
interface GemEffectRow { GrantedEffect?: number | null; SupportText?: string; GemTags?: number[] }
interface GrantedEffectRow {
  ActiveSkill?: number | null;
  IsSupport?: boolean;
  StatSet?: number | null;
  AdditionalStatSets?: number[];
  CastTime?: number;
}
interface ActiveSkillRow {
  DisplayedName?: string;
  Description?: string;
  Icon_DDSFile?: string;
  StatDescription?: string;
}
interface GemTagRow { Id?: string; Name?: string }
interface GrantedEffectLabelRow { Id?: string; Text?: string }
interface SupportGemRow { SkillGem?: number | null; Icon?: string }

interface GrantedEffectPerLevelRow {
  GrantedEffect?: number | null;
  Level?: number | null;
  ActorLevel?: number | null;
  CostAmounts?: number[];
  AttackTime?: number;
  Cooldown?: number;
  Reservation?: number;
}

interface GrantedEffectStatSetRow {
  Label?: number | null;
  /** Flag stats that hold for the whole set (value 1). */
  ImplicitStats?: number[];
  ConstantStats?: number[];
  ConstantStatsValues?: number[];
  /** Stats a later set drops from those it inherits from the first set. */
  IgnoredStats?: number[];
}

interface GrantedEffectStatSetPerLevelRow {
  StatSet?: number | null;
  GemLevel?: number | null;
  SpellCritChance?: number;
  AttackCritChance?: number;
  BaseResolvedValues?: number[];
  AdditionalStatsValues?: number[];
  FloatStats?: number[];
  AdditionalStats?: number[];
  AdditionalFlags?: number[];
}

interface GrantedEffectQualityStatRow {
  GrantedEffect?: number | null;
  Stats?: number[];
  StatsValuesPermille?: number[];
  AltStats?: number[];
  AltStatValuesPermille?: number[];
  ApplyToStatSets?: number[];
}

interface StatRow { Id?: string }

interface ItemExperiencePerLevelRow { ItemExperienceType?: number | null; ItemCurrentLevel?: number; Level?: number }

/** Strip PoE bbcode: `[Cold]` -> `Cold`, `[AoESkill|AoE]` -> `AoE`. */
export function stripBbcode(text: string): string {
  return text.replace(/\[([^\]]+)\]/g, (_, inner: string) => {
    const pipe = inner.lastIndexOf('|');

    return pipe === -1 ? inner : inner.slice(pipe + 1);
  });
}

/** Gems GGG names as unreleased: "[DNT ...]", "Coming Soon" slots, playtest skills, the "Removed Skill" stub. */
const PLACEHOLDER_GEM = /\[DNT|^Coming Soon$|^Playtest |^Removed Skill$/;

export function isPlaceholderGem(name: string): boolean {
  return PLACEHOLDER_GEM.test(name);
}

/** Last `/`-separated segment of a game id (the build's gem key). */
function lastSegment(id: string): string {
  return id.slice(id.lastIndexOf('/') + 1);
}

/** Ported from PoB's `calcLib.getGemStatRequirement`: supports and zero-percent attributes require nothing, a result under 8 rounds to 0. */
export function gemStatRequirement(level: number, percent: number, isSupport: boolean): number {
  if (percent === 0 || isSupport) {
    return 0;
  }

  const req = Math.round((5 + (level - 3) * 1.7) * (percent / 100) ** 0.9) + 4;

  return req < 8 ? 0 : req;
}

const MAX_QUALITY = 20;

async function readCsd(source: GgpkSource, path: string): Promise<string | null> {
  const bytes = await source.file(path);

  return bytes ? Buffer.from(bytes).toString('utf16le') : null;
}

/** GGG templates carry literal "\n" for multi-line stats; make it a real newline. */
function multiline(text: string): string {
  return text.replace(/\\n/g, '\n');
}

const GEM_SCOPE = 'Data/StatDescriptions/gem_stat_descriptions.csd';
const META_GEM_SCOPE = 'Data/StatDescriptions/meta_gem_stat_descriptions.csd';

export async function buildGems(source: GgpkSource): Promise<GemData> {
  const SkillGems = (await source.table('SkillGems')) as SkillGemRow[];
  const BaseItemTypes = (await source.table('BaseItemTypes')) as BaseItemTypeRow[];
  const GemEffects = (await source.table('GemEffects')) as GemEffectRow[];
  const GrantedEffects = (await source.table('GrantedEffects')) as GrantedEffectRow[];
  const GrantedEffectsPerLevel = (await source.table('GrantedEffectsPerLevel')) as GrantedEffectPerLevelRow[];
  const ActiveSkills = (await source.table('ActiveSkills')) as ActiveSkillRow[];
  const GemTags = (await source.table('GemTags')) as GemTagRow[];
  const SupportGems = (await source.table('SupportGems')) as SupportGemRow[];
  const GrantedEffectStatSets = (await source.table('GrantedEffectStatSets')) as GrantedEffectStatSetRow[];
  const GrantedEffectStatSetsPerLevel = (await source.table('GrantedEffectStatSetsPerLevel')) as GrantedEffectStatSetPerLevelRow[];
  const GrantedEffectQualityStats = (await source.table('GrantedEffectQualityStats')) as GrantedEffectQualityStatRow[];
  const GrantedEffectLabels = (await source.table('GrantedEffectLabels')) as GrantedEffectLabelRow[];
  const Stats = (await source.table('Stats')) as StatRow[];
  const ItemExperiencePerLevel = (await source.table('ItemExperiencePerLevel')) as ItemExperiencePerLevelRow[];
  const statId = (index: number): string => Stats[index]?.Id ?? '';

  // Level progression -> gem level -> the character level it requires.
  const progression = new Map<number, Map<number, number>>();

  for (const row of ItemExperiencePerLevel) {
    if (row.ItemExperienceType == null || row.ItemCurrentLevel == null) {
      continue;
    }

    if (!progression.has(row.ItemExperienceType)) {
      progression.set(row.ItemExperienceType, new Map());
    }

    progression.get(row.ItemExperienceType)!.set(row.ItemCurrentLevel, row.Level ?? 0);
  }

  // stat_descriptions.csd alone is tens of MB: read and parse each description file once.
  const csdFiles = new Map<string, Promise<{ index: StatIndex; include: string | null } | null>>();

  function loadCsd(path: string): Promise<{ index: StatIndex; include: string | null } | null> {
    const key = path.replace(/\\/g, '/').toLowerCase();
    let file = csdFiles.get(key);

    if (!file) {
      file = readCsd(source, key).then((text) => (text === null ? null : { index: buildStatIndex(text), include: csdInclude(text) }));
      csdFiles.set(key, file);
    }

    return file;
  }

  async function scopeChain(path: string): Promise<StatIndex[] | null> {
    const chain: StatIndex[] = [];

    for (let next: string | null = path; next !== null;) {
      const file = await loadCsd(next);

      if (!file) {
        break;
      }

      chain.push(file.index);
      next = file.include;
    }

    return chain.length ? chain : null;
  }

  /** Scope a set renders through, as PoB picks it: the gem (or meta gem) file for a support, else the skill's file with `statset_0` swapped for the set's number. */
  async function statSetScope(
    granted: GrantedEffectRow,
    active: ActiveSkillRow | undefined,
    setIndex: number,
    isMeta: boolean,
  ): Promise<StatIndex[] | null> {
    if (granted.IsSupport) {
      return scopeChain(isMeta ? META_GEM_SCOPE : GEM_SCOPE);
    }

    const path = active?.StatDescription;

    if (!path) {
      return null;
    }

    return (await scopeChain(path.replace('statset_0', `statset_${setIndex}`))) ?? scopeChain(path);
  }

  function renderStats(chain: StatIndex[], stats: Map<string, number>, quality = false): GemStatLine[] {
    const ids = [...stats.keys()];
    const { lines, lineStatIds } = renderBlock(chain, ids, ids.map((id) => stats.get(id)!), {
      descriptionOrder: true,
      quality,
    });

    return lines.map((text, i) => {
      const used = lineStatIds[i]!;

      return { text: multiline(text), min: stats.get(used[0]!) ?? 0, max: stats.get(used[used.length - 1]!) ?? 0 };
    });
  }

  // GrantedEffect index -> its per-level rows (ActorLevel = required char level).
  const perLevelByGrantedEffect = new Map<number, GrantedEffectPerLevelRow[]>();

  for (const row of GrantedEffectsPerLevel) {
    if (row.GrantedEffect == null) {
      continue;
    }

    const list = perLevelByGrantedEffect.get(row.GrantedEffect) ?? [];
    list.push(row);
    perLevelByGrantedEffect.set(row.GrantedEffect, list);
  }

  // StatSet index -> its per-GemLevel scaling rows.
  const statSetPerLevelByStatSet = new Map<number, GrantedEffectStatSetPerLevelRow[]>();

  for (const row of GrantedEffectStatSetsPerLevel) {
    if (row.StatSet == null) {
      continue;
    }

    const list = statSetPerLevelByStatSet.get(row.StatSet) ?? [];
    list.push(row);
    statSetPerLevelByStatSet.set(row.StatSet, list);
  }

  // GrantedEffect index -> its quality bonus row (a gem has at most one).
  const qualityStatsByGrantedEffect = new Map<number, GrantedEffectQualityStatRow>();

  for (const row of GrantedEffectQualityStats) {
    if (row.GrantedEffect != null) {
      qualityStatsByGrantedEffect.set(row.GrantedEffect, row);
    }
  }

  // Support gems carry their own icon in SupportGems, keyed by SkillGems row index.
  const supportIconByGemIndex = new Map<number, string>();

  for (const row of SupportGems) {
    if (row.SkillGem != null && row.Icon) {
      supportIconByGemIndex.set(row.SkillGem, row.Icon);
    }
  }

  const gems: Record<string, Gem> = {};
  const requirements: Record<string, GemRequirement> = {};
  const scaling: Record<string, GemScaling> = {};

  for (const [gemIndex, gem] of SkillGems.entries()) {
    const base = gem.BaseItemType != null ? BaseItemTypes[gem.BaseItemType] : undefined;

    if (!base?.Id) {
      continue;
    }

    if (isPlaceholderGem(base.Name ?? '')) {
      continue;
    }

    const effectIndex = gem.GemEffects?.[0];
    const effect = effectIndex != null ? GemEffects[effectIndex] : undefined;
    const grantedIndex = effect?.GrantedEffect;
    const granted = grantedIndex != null ? GrantedEffects[grantedIndex] : undefined;
    const activeIndex = granted?.ActiveSkill;
    const active = activeIndex != null ? ActiveSkills[activeIndex] : undefined;

    const kind = GEM_KIND[gem.GemType ?? -1] ?? 'active';
    const isSupport = kind === 'support';

    const tags = (effect?.GemTags ?? [])
      .map((index) => stripBbcode(GemTags[index]?.Name ?? ''))
      .filter(Boolean);

    const description = isSupport
      ? stripBbcode(effect?.SupportText ?? '')
      : stripBbcode(active?.Description ?? '');

    // Raw GGPK DDS path - no resolution-variant fixup; decoding is buildGemIcons'.
    const icon = isSupport
      ? supportIconByGemIndex.get(gemIndex) ?? null
      : active?.Icon_DDSFile ?? null;

    const segment = lastSegment(base.Id);

    // Last segment wins on collision - matches the consumer's lookup behaviour.
    gems[segment] = {
      name: base.Name ?? '',
      kind,
      color: GEM_COLOR[gem.GemColour ?? -1] ?? 'w',
      tags,
      description: description || null,
      req: {
        str: gem.StrengthRequirementPercent ?? 0,
        dex: gem.DexterityRequirementPercent ?? 0,
        int: gem.IntelligenceRequirementPercent ?? 0,
        level: gem.MinLevelReq ?? 0,
      },
      icon,
      hoverImage: gem.UI_Image || null,
    };

    // Character level never drops below the previous level; supports impose no attribute requirement.
    const levels: Record<number, GemLevel> = {};
    const perLevel = grantedIndex != null ? perLevelByGrantedEffect.get(grantedIndex) ?? [] : [];
    const playerLevels = gem.ItemExperienceType != null ? progression.get(gem.ItemExperienceType) : undefined;
    let previousLevel = 0;

    for (const row of [...perLevel].sort((a, b) => (a.Level ?? 0) - (b.Level ?? 0))) {
      if (row.Level == null) {
        continue;
      }

      previousLevel = Math.max(playerLevels?.get(row.Level) ?? 0, previousLevel);

      const requiredLevel = Math.max(1, previousLevel);

      levels[row.Level] = {
        requiredLevel,
        str: gemStatRequirement(requiredLevel, gem.StrengthRequirementPercent ?? 0, isSupport),
        dex: gemStatRequirement(requiredLevel, gem.DexterityRequirementPercent ?? 0, isSupport),
        int: gemStatRequirement(requiredLevel, gem.IntelligenceRequirementPercent ?? 0, isSupport),
      };
    }

    if (Object.keys(levels).length > 0) {
      requirements[segment] = { name: base.Name ?? '', levels };
    }

    // Independent of the requirement curve: a support with no level curve can still have flat level-1 scaling.
    const setIndices = granted?.StatSet != null ? [granted.StatSet, ...(granted.AdditionalStatSets ?? [])] : [];
    const sets = setIndices.map((index) => GrantedEffectStatSets[index]);

    if (granted && sets.length > 0 && sets.every((set) => set !== undefined)) {
      const statSets = sets as GrantedEffectStatSetRow[];
      const isMeta = (effect?.GemTags ?? []).some((index) => GemTags[index]?.Id === 'meta');
      const scopes = await Promise.all(statSets.map((_, k) => statSetScope(granted, active, k, isMeta)));
      // Per set: GemLevel -> that level's scaling row.
      const levelRows = setIndices.map((index) => new Map(
        (statSetPerLevelByStatSet.get(index) ?? [])
          .filter((row) => row.GemLevel != null)
          .map((row) => [row.GemLevel!, row] as const),
      ));
      const label = (set: GrantedEffectStatSetRow): string =>
        (set.Label != null ? GrantedEffectLabels[set.Label]?.Text : undefined) || active?.DisplayedName || base.Name || '';
      // Sets labelled "Hidden" are left out of the tooltip (as in PoB) but still count for scope numbering.
      const shown = statSets
        .map((set, k) => k)
        .filter((k) => GrantedEffectLabels[statSets[k]!.Label ?? -1]?.Id !== 'Hidden');

      /** Set `k`'s stats at a gem level, summed as PoB's `buildSkillInstanceStats`: per-level values, then flags at 1 (if unset), then constants. A later set inherits the first set's stats minus the ones it ignores. */
      const statsAt = (k: number, level: number): Map<string, number> => {
        const stats = new Map<string, number>();
        const ignored = new Set(k > 0 ? (statSets[k]!.IgnoredStats ?? []).map(statId) : []);
        const parts = k > 0 ? [0, k] : [0];
        // The first set's stats are inherited, and only those can be ignored.
        const keep = (part: number, id: string): boolean => Boolean(id) && (part > 0 || !ignored.has(id));
        const add = (id: string, value: number): void => {
          stats.set(id, (stats.get(id) ?? 0) + value);
        };

        parts.forEach((setK, part) => {
          const row = levelRows[setK]!.get(level);

          (row?.FloatStats ?? []).forEach((index, i) => {
            const id = statId(index);

            if (keep(part, id)) {
              add(id, row!.BaseResolvedValues?.[i] ?? 0);
            }
          });
          (row?.AdditionalStats ?? []).forEach((index, i) => {
            const id = statId(index);

            if (keep(part, id)) {
              add(id, row!.AdditionalStatsValues?.[i] ?? 0);
            }
          });
        });

        const flag = (id: string): void => {
          if (id && !stats.has(id)) {
            stats.set(id, 1);
          }
        };

        (levelRows[k]!.get(level)?.AdditionalFlags ?? []).map(statId).forEach(flag);
        parts.forEach((setK, part) => {
          (statSets[setK]!.ImplicitStats ?? []).map(statId).filter((id) => keep(part, id)).forEach(flag);
        });
        parts.forEach((setK, part) => {
          const set = statSets[setK]!;

          (set.ConstantStats ?? []).forEach((index, i) => {
            const id = statId(index);

            if (keep(part, id)) {
              add(id, set.ConstantStatsValues?.[i] ?? 0);
            }
          });
        });

        return stats;
      };

      const gemLevels: GemLevelScaling[] = [];

      for (const level of [...levelRows[0]!.keys()].sort((a, b) => a - b)) {
        const row = levelRows[0]!.get(level)!;
        const costRow = perLevel.find((r) => r.Level === level);
        const attackTimeMs = costRow?.AttackTime ?? 0;
        const castTimeMs = attackTimeMs > 0 ? attackTimeMs : (granted.CastTime ?? 0);
        const cooldownMs = costRow?.Cooldown ?? 0;
        const reservation = costRow?.Reservation ?? 0;
        const rendered = shown.map((k): GemStatSet => ({
          label: label(statSets[k]!),
          stats: scopes[k] ? renderStats(scopes[k]!, statsAt(k, level)) : [],
        }));
        const additionalStatSets = rendered.slice(1);

        gemLevels.push({
          level,
          cost: costRow?.CostAmounts?.[0] ?? null,
          castTime: castTimeMs > 0 ? castTimeMs / 1000 : null,
          cooldown: cooldownMs > 0 ? cooldownMs / 1000 : null,
          reservation: reservation > 0 ? reservation : null,
          spellCritChance: (row.SpellCritChance ?? 0) / 100,
          attackCritChance: (row.AttackCritChance ?? 0) / 100,
          stats: rendered[0]?.stats ?? [],
          ...(additionalStatSets.length ? { additionalStatSets } : {}),
        });
      }

      // Quality bonus at MAX_QUALITY. PoB gives supports none and renders each bonus through the scope of the first set it applies to.
      const quality = !granted.IsSupport && grantedIndex != null ? qualityStatsByGrantedEffect.get(grantedIndex) : undefined;
      const qualityScope = scopes[quality?.ApplyToStatSets?.[0] ?? 0] ?? scopes[0];
      const qualityStats = quality && qualityScope
        ? (quality.Stats ?? []).flatMap((index, i) => {
            // Stat values are whole numbers: the bonus keeps the integer part (PoB's math.modf).
            const value = Math.trunc(((quality.StatsValuesPermille?.[i] ?? 0) * MAX_QUALITY) / 1000);

            return renderStats(qualityScope, new Map([[statId(index), value]]), true).map((line) => ({ ...line, min: 0 }));
          })
        : [];

      if (gemLevels.length > 0) {
        scaling[segment] = { name: base.Name ?? '', levels: gemLevels, qualityStats };
      }
    }
  }

  return { gems, requirements, scaling };
}
