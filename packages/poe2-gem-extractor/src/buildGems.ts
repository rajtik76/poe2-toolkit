/**
 * Builds the Path of Exile 2 gem data from GGPK tables, joining the relational
 * `SkillGems` -> `GemEffects` -> `GrantedEffects` -> `ActiveSkills` chain into a
 * flat, build-facing shape. Source of truth: GGPK only.
 *
 * Keying mirrors how a build importer looks gems up: by the last path segment of
 * the base item's game id (Path of Building's `normalizeGemId`). Icons and the
 * hover-art background are kept as their raw GGPK DDS paths - decoding them to
 * PNG is {@link buildGemIcons}' concern.
 *
 * The per-level attribute requirement curve is ported verbatim from PoB's
 * `calcLib.getGemStatRequirement` (CalcTools.lua), so the numbers match the game.
 *
 * The per-level tooltip scaling (cost, cast time, crit, translated stat lines,
 * quality bonuses) joins a second relational chain rooted at
 * `GrantedEffects.StatSet`: `GrantedEffectStatSets` (the level-independent part)
 * and `GrantedEffectStatSetsPerLevel` (the per-`GemLevel` scaling values), plus
 * `GrantedEffectQualityStats` for the quality bonus lines. Text is rendered via
 * `@poe2-toolkit/ggpk`'s stat-description engine against two `.csd` files -
 * `skill_stat_descriptions.csd` (skill-specific stats) falling back to the
 * general `stat_descriptions.csd` (shared with item mods) for stats defined
 * there instead (e.g. `number_of_chains`, the two damage-roll stats).
 */

import { buildStatIndex, renderBlock } from '@poe2-toolkit/ggpk';
import type { GgpkSource, StatIndex } from '@poe2-toolkit/ggpk';

/** Active skill, support, or spirit (persistent buff) gem. */
export type GemKind = 'active' | 'support' | 'spirit';

/** Gem socket colour: red (str), green (dex), blue (int), white (any). */
export type GemColor = 'r' | 'g' | 'b' | 'w';

/** GemType / GemColour are bare i32 in the schema - enums derived from the data. */
const GEM_KIND: Record<number, GemKind> = { 0: 'active', 1: 'support', 2: 'spirit' };
const GEM_COLOR: Record<number, GemColor> = { 1: 'r', 2: 'g', 3: 'b', 4: 'w' };

/**
 * A gem's headline requirement: the percent-of-attribute weights plus its
 * minimum character level. This is the flat summary on {@link Gem}; the full
 * per-level curve lives in {@link GemRequirement}.
 */
export interface GemReq {
  /** Strength requirement as a percent-of-attribute weight (0 for none, e.g. all support gems). */
  str: number;
  /** Dexterity requirement as a percent-of-attribute weight (0 for none, e.g. all support gems). */
  dex: number;
  /** Intelligence requirement as a percent-of-attribute weight (0 for none, e.g. all support gems). */
  int: number;
  /** Minimum character level to use the gem at all (its floor, not the per-level curve). */
  level: number;
}

/** One gem as serialized for the build front-end. */
export interface Gem {
  /** Display name from the gem's base item (e.g. `Ice Nova`, `Fire Attunement`). */
  name: string;
  /** Whether it is an `active` skill, a `support`, or a `spirit` (persistent buff) gem. */
  kind: GemKind;
  /** Socket colour: `r` (str), `g` (dex), `b` (int) or `w` (any). */
  color: GemColor;
  /** Gem tags with bbcode stripped (e.g. `Spell`, `AoE`, `Cold`); `[]` when none. */
  tags: string[];
  /**
   * Skill / support description with bbcode stripped - from `ActiveSkills` for
   * active and spirit gems, from `GemEffects.SupportText` for supports. `null`
   * when the source text is empty.
   */
  description: string | null;
  /** Headline attribute-percent weights plus minimum character level. */
  req: GemReq;
  /** Raw GGPK DDS path of the gem's icon, or `null` when none is referenced. */
  icon: string | null;
  /**
   * Raw GGPK DDS path of the gem's tooltip background art (`SkillGems.UI_Image`),
   * or `null` when none is referenced. Coverage is sparse in the source data: no
   * support gem has one, and only a fraction of active/spirit gems do (verified
   * against a live extract - not a bug in this extractor).
   */
  hoverImage: string | null;
}

/** A gem's resolved requirement at one gem level. */
export interface GemLevel {
  /** Minimum character level for this gem level (`floor(ActorLevel)`, at least 1). */
  requiredLevel: number;
  /** Strength required at this level, via PoB's formula (0 for supports / zero-weight attributes). */
  str: number;
  /** Dexterity required at this level, via PoB's formula (0 for supports / zero-weight attributes). */
  dex: number;
  /** Intelligence required at this level, via PoB's formula (0 for supports / zero-weight attributes). */
  int: number;
}

/** The full per-level requirement curve for one gem. */
export interface GemRequirement {
  /** Display name of the gem (same as the matching {@link Gem.name}). */
  name: string;
  /** The requirement at each gem level, keyed by gem level (`1`, `2`, ...). */
  levels: Record<number, GemLevel>;
}

/** One translated tooltip stat line plus the raw numbers behind it. */
export interface GemStatLine {
  /** Rendered text via the stat-description engine (bbcode stripped). */
  text: string;
  /**
   * The lower bound of the line's numeric range: the sole value for a
   * single-value stat, or the first of a min/max pair (e.g. a damage roll).
   */
  min: number;
  /** The upper bound: equal to {@link min} for a single-value stat. */
  max: number;
}

/** A gem's resolved tooltip scaling at one gem level. */
export interface GemLevelScaling {
  /** The gem level this scaling applies to (matches {@link GemLevel}'s keying level). */
  level: number;
  /** Mana cost at this level (`GrantedEffectsPerLevel.CostAmounts[0]`), or `null` if the skill costs nothing. */
  cost: number | null;
  /**
   * Cast/attack time in seconds. Spells read `GrantedEffects.CastTime` (flat,
   * repeated across levels); attack skills read the per-level
   * `GrantedEffectsPerLevel.AttackTime` instead, when it is nonzero. `null` when
   * neither source has a value.
   */
  castTime: number | null;
  /** Cooldown in seconds, or `null` when the skill has none. */
  cooldown: number | null;
  /** Reservation amount, raw units as stored (mana or life, not distinguished here), or `null` when the skill reserves nothing. */
  reservation: number | null;
  /** Spell critical hit chance as a percent (e.g. `9` for 9.00%). */
  spellCritChance: number;
  /** Attack critical hit chance as a percent. */
  attackCritChance: number;
  /** Translated per-level stat lines (damage, chain count, etc.), in table order. */
  stats: GemStatLine[];
}

/** A gem's full tooltip scaling: its per-level curve plus quality bonuses. */
export interface GemScaling {
  /** Display name of the gem (same as the matching {@link Gem.name}). */
  name: string;
  /** Resolved scaling at each gem level the source defines (often just one for non-scaling supports). */
  levels: GemLevelScaling[];
  /**
   * Bonus lines granted per point of gem quality, already resolved at quality
   * 20 (`min` is always `0`, the value at quality 0). A gem with no quality
   * bonus has `[]`.
   */
  qualityStats: GemStatLine[];
}

/** Everything the gem extractor produces. */
export interface GemData {
  /**
   * Gems keyed by the last path segment of their base item id (PoB's
   * `normalizeGemId`, e.g. `SkillGemIceNova`). Last segment wins on collision,
   * matching the consumer's lookup.
   */
  gems: Record<string, Gem>;
  /**
   * Per-level requirement curves, keyed the same way as {@link GemData.gems}.
   * A gem with no per-level curve (e.g. many supports) is omitted here.
   */
  requirements: Record<string, GemRequirement>;
  /**
   * Tooltip scaling (cost, cast time, crit, translated stat lines, quality
   * bonuses), keyed the same way as {@link GemData.gems}. Omitted for a gem
   * whose `GrantedEffects` row has no `StatSet`.
   */
  scaling: Record<string, GemScaling>;
}

// --- raw GGPK row shapes (only the columns this build reads) -----------------

interface SkillGemRow {
  BaseItemType?: number | null;
  StrengthRequirementPercent?: number;
  DexterityRequirementPercent?: number;
  IntelligenceRequirementPercent?: number;
  GemType?: number;
  GemColour?: number;
  MinLevelReq?: number;
  GemEffects?: number[];
  UI_Image?: string;
}

interface BaseItemTypeRow { Id?: string; Name?: string }
interface GemEffectRow { GrantedEffect?: number | null; SupportText?: string; GemTags?: number[] }
interface GrantedEffectRow { ActiveSkill?: number | null; StatSet?: number | null; CastTime?: number }
interface ActiveSkillRow { Description?: string; Icon_DDSFile?: string }
interface GemTagRow { Name?: string }
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
  ConstantStats?: number[];
  ConstantStatsValues?: number[];
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
}

interface GrantedEffectQualityStatRow {
  GrantedEffect?: number | null;
  Stats?: number[];
  StatsValuesPermille?: number[];
  AltStats?: number[];
  AltStatValuesPermille?: number[];
}

interface StatRow { Id?: string }

/**
 * Strip PoE bbcode: `[Cold]` -> `Cold`, `[AoESkill|AoE]` -> `AoE` (display half).
 */
export function stripBbcode(text: string): string {
  return text.replace(/\[([^\]]+)\]/g, (_, inner: string) => {
    const pipe = inner.lastIndexOf('|');

    return pipe === -1 ? inner : inner.slice(pipe + 1);
  });
}

/** Last `/`-separated segment of a game id (the build's gem key). */
function lastSegment(id: string): string {
  return id.slice(id.lastIndexOf('/') + 1);
}

/**
 * Per-level attribute requirement, ported verbatim from PoB's
 * `calcLib.getGemStatRequirement` (CalcTools.lua): support gems and zero-percent
 * attributes require nothing, and a result under 8 rounds down to 0.
 */
export function gemStatRequirement(level: number, percent: number, isSupport: boolean): number {
  if (percent === 0 || isSupport) {
    return 0;
  }

  const req = Math.round((5 + (level - 3) * 1.7) * (percent / 100) ** 0.9) + 4;

  return req < 8 ? 0 : req;
}

/** Character quality points a gem can normally carry (uncorrupted cap). */
const MAX_QUALITY = 20;

/** Decode a `.csd` file's UTF-16 text via {@link GgpkSource.file}, or `''` if the source has none. */
async function readCsd(source: GgpkSource, path: string): Promise<string> {
  const bytes = await source.file(path);

  return bytes ? Buffer.from(bytes).toString('utf16le') : '';
}

/**
 * Render one stat id against the skill-specific index first, falling back to
 * the general (item-mod-shared) index for stats defined there instead (e.g.
 * `number_of_chains`, damage-roll stats). `null` when neither resolves it.
 */
function renderStat(skillIndex: StatIndex, generalIndex: StatIndex, ids: string[], values: number[]): string | null {
  const first = renderBlock(skillIndex, ids, values);

  if (first.lines.length > 0 || first.unresolved.length === 0) {
    return first.lines.join(' ') || null;
  }

  return renderBlock(generalIndex, first.unresolved, first.unresolved.map((id) => values[ids.indexOf(id)]!)).lines.join(' ') || null;
}

/** One `GemStatLine` per id in a single-value stat/value list (e.g. `ConstantStats`, `AdditionalStats`). */
function renderSingleStats(skillIndex: StatIndex, generalIndex: StatIndex, statIds: string[], values: number[]): GemStatLine[] {
  const lines: GemStatLine[] = [];

  statIds.forEach((id, i) => {
    const value = values[i] ?? 0;
    const text = renderStat(skillIndex, generalIndex, [id], [value]);

    if (text) {
      lines.push({ text, min: value, max: value });
    }
  });

  return lines;
}

/**
 * `GemStatLine`s from a stat/value list taken two at a time (GGG's convention
 * for a min/max pair, e.g. `spell_minimum_base_lightning_damage` +
 * `spell_maximum_base_lightning_damage`) - verified against a live extract
 * (Arc). An odd trailing id renders alone, `min` equal to `max`.
 */
function renderPairedStats(skillIndex: StatIndex, generalIndex: StatIndex, statIds: string[], values: number[]): GemStatLine[] {
  const lines: GemStatLine[] = [];

  for (let i = 0; i < statIds.length; i += 2) {
    const pairIds = statIds.slice(i, i + 2);
    const pairValues = values.slice(i, i + 2);
    const text = renderStat(skillIndex, generalIndex, pairIds, pairValues);

    if (text) {
      lines.push({ text, min: pairValues[0]!, max: pairValues[pairValues.length - 1]! });
    }
  }

  return lines;
}

/**
 * Build the gem export from the supplied {@link GgpkSource}. All data comes from
 * the source's tables; this function performs no I/O of its own.
 */
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
  const Stats = (await source.table('Stats')) as StatRow[];

  // The general .csd is tens of MB - only read + parse both files when there is
  // at least one StatSet to render (a source that hasn't pinned the new tables
  // yet, or genuinely has none, pays nothing for this).
  const skillStatIndex = GrantedEffectStatSets.length > 0
    ? buildStatIndex(await readCsd(source, 'data/statdescriptions/skill_stat_descriptions.csd'))
    : buildStatIndex('');
  const generalStatIndex = GrantedEffectStatSets.length > 0
    ? buildStatIndex(await readCsd(source, 'data/statdescriptions/stat_descriptions.csd'))
    : buildStatIndex('');
  const statId = (index: number): string => Stats[index]?.Id ?? '';

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

  SkillGems.forEach((gem, gemIndex) => {
    const base = gem.BaseItemType != null ? BaseItemTypes[gem.BaseItemType] : undefined;

    if (!base?.Id) {
      return;
    }

    // [DNT] = "Do Not Translate" dev placeholder, never a real gem.
    if (typeof base.Name === 'string' && base.Name.includes('[DNT]')) {
      return;
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

    // Per-level requirement curve: char level = floor(ActorLevel), attributes via
    // PoB's formula. Support gems impose no attribute requirement.
    const levels: Record<number, GemLevel> = {};
    const perLevel = grantedIndex != null ? perLevelByGrantedEffect.get(grantedIndex) ?? [] : [];

    for (const row of perLevel) {
      if (row.Level == null || row.ActorLevel == null) {
        continue;
      }

      // PoB feeds the integer character level (not the raw float ActorLevel) into
      // the requirement formula, so floor first.
      const requiredLevel = Math.max(1, Math.floor(row.ActorLevel));

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

    // Tooltip scaling: rooted at GrantedEffects.StatSet, independent of the
    // attribute-requirement curve above (a support with no level curve can
    // still have flat, level-1-only scaling, e.g. a flat attack-speed bonus).
    const statSetIndex = granted?.StatSet;
    const statSet = statSetIndex != null ? GrantedEffectStatSets[statSetIndex] : undefined;

    if (statSetIndex != null && statSet) {
      const constantIds = (statSet.ConstantStats ?? []).map(statId);
      const constantValues = statSet.ConstantStatsValues ?? [];
      const perGemLevel = statSetPerLevelByStatSet.get(statSetIndex) ?? [];

      const gemLevels: GemLevelScaling[] = [];

      for (const row of perGemLevel) {
        if (row.GemLevel == null) {
          continue;
        }

        const costRow = perLevel.find((r) => r.Level === row.GemLevel);
        const attackTimeMs = costRow?.AttackTime ?? 0;
        const castTimeMs = attackTimeMs > 0 ? attackTimeMs : (granted?.CastTime ?? 0);
        const cooldownMs = costRow?.Cooldown ?? 0;
        const reservation = costRow?.Reservation ?? 0;

        const stats = [
          ...renderSingleStats(skillStatIndex, generalStatIndex, constantIds, constantValues),
          ...renderSingleStats(
            skillStatIndex, generalStatIndex,
            (row.AdditionalStats ?? []).map(statId), row.AdditionalStatsValues ?? [],
          ),
          ...renderPairedStats(
            skillStatIndex, generalStatIndex,
            (row.FloatStats ?? []).map(statId), row.BaseResolvedValues ?? [],
          ),
        ];

        gemLevels.push({
          level: row.GemLevel,
          cost: costRow?.CostAmounts?.[0] ?? null,
          castTime: castTimeMs > 0 ? castTimeMs / 1000 : null,
          cooldown: cooldownMs > 0 ? cooldownMs / 1000 : null,
          reservation: reservation > 0 ? reservation : null,
          spellCritChance: (row.SpellCritChance ?? 0) / 100,
          attackCritChance: (row.AttackCritChance ?? 0) / 100,
          stats,
        });
      }

      // Quality bonus lines, resolved at MAX_QUALITY (min is always the
      // quality-0 value, 0, since every quality stat scales linearly from it).
      const quality = grantedIndex != null ? qualityStatsByGrantedEffect.get(grantedIndex) : undefined;
      const qualityStats: GemStatLine[] = quality
        ? [
            ...(quality.Stats ?? []).map(statId).map((id, i): GemStatLine | null => {
              const max = Math.round(((quality.StatsValuesPermille?.[i] ?? 0) * MAX_QUALITY) / 1000);
              const text = renderStat(skillStatIndex, generalStatIndex, [id], [max]);

              return text ? { text, min: 0, max } : null;
            }),
            ...(quality.AltStats ?? []).map(statId).map((id, i): GemStatLine | null => {
              const max = Math.round(((quality.AltStatValuesPermille?.[i] ?? 0) * MAX_QUALITY) / 1000);
              const text = renderStat(skillStatIndex, generalStatIndex, [id], [max]);

              return text ? { text, min: 0, max } : null;
            }),
          ].filter((line): line is GemStatLine => line !== null)
        : [];

      if (gemLevels.length > 0) {
        scaling[segment] = { name: base.Name ?? '', levels: gemLevels, qualityStats };
      }
    }
  });

  return { gems, requirements, scaling };
}
