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
 * quality bonuses) is built the way Path of Building builds a gem tooltip. Each
 * stat set - `GrantedEffects.StatSet`, then its `AdditionalStatSets`, which
 * inherit the first set's stats - sums its stats at a gem level
 * (`GrantedEffectStatSetsPerLevel` values, flags at 1, constants) and renders
 * them together through the set's stat-description scope: the skill's own
 * `ActiveSkills.StatDescription` file (or the gem file for supports) followed by
 * the files it includes. `GrantedEffectQualityStats` supplies the quality bonus
 * lines.
 */

import { buildStatIndex, csdInclude, renderBlock } from '@poe2-toolkit/ggpk';
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
   * Raw `SkillGems.UI_Image` reference to the gem's tooltip background art, or
   * `null` when none is referenced. Kept as the table holds it, so its form
   * follows the patch: a DDS path (`Art/Textures/.../X.dds`) up to 4.5.4, a
   * UIImages sprite name (`Art/2DArt/UIImages/InGame/...`, no extension) from
   * 4.5.5 on. `buildGemIcons` decodes both and keys the PNG by this value plus
   * `.png` either way.
   *
   * Coverage is sparse in the source data: no support gem has one, and only a
   * fraction of active/spirit gems do (verified against a live extract - not a
   * bug in this extractor).
   */
  hoverImage: string | null;
}

/** A gem's resolved requirement at one gem level. */
export interface GemLevel {
  /**
   * Minimum character level for this gem level: the gem's level progression
   * (`ItemExperiencePerLevel.Level`), never lower than the level before it, at
   * least 1.
   */
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
  /** Rendered text via the stat-description engine (bbcode stripped, real newlines). */
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
  /** Translated per-level stat lines of the first stat set (damage, chain count, etc.), in tooltip order. */
  stats: GemStatLine[];
  /**
   * The granted effect's further stat sets (`GrantedEffects.AdditionalStatSets`,
   * e.g. Ice Nova's "Cold-Infused"), each a full tooltip block of its own: it
   * inherits the first set's stats. Absent when the effect has none.
   */
  additionalStatSets?: GemStatSet[];
}

/** One further stat set of a gem: its tooltip label and rendered lines. */
export interface GemStatSet {
  /** The set's label (`GrantedEffectLabels.Text`, else the skill's name). */
  label: string;
  /** Translated stat lines of the set, in tooltip order. */
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
   * 20 (`min` is always `0`, the value at quality 0). Support gems and a gem
   * with no quality bonus have `[]`.
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
  /** The gem's level progression in ItemExperiencePerLevel. */
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
  /** Path of the skill's own stat-description file, for its first stat set (`statset_0`). */
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
  /** Flag stats that hold at this level (value 1). */
  AdditionalFlags?: number[];
}

interface GrantedEffectQualityStatRow {
  GrantedEffect?: number | null;
  Stats?: number[];
  StatsValuesPermille?: number[];
  AltStats?: number[];
  AltStatValuesPermille?: number[];
  /** Stat sets the quality bonus applies to; the first picks its description scope. */
  ApplyToStatSets?: number[];
}

interface StatRow { Id?: string }

interface ItemExperiencePerLevelRow { ItemExperienceType?: number | null; ItemCurrentLevel?: number; Level?: number }

/**
 * Strip PoE bbcode: `[Cold]` -> `Cold`, `[AoESkill|AoE]` -> `AoE` (display half).
 */
export function stripBbcode(text: string): string {
  return text.replace(/\[([^\]]+)\]/g, (_, inner: string) => {
    const pipe = inner.lastIndexOf('|');

    return pipe === -1 ? inner : inner.slice(pipe + 1);
  });
}

/**
 * Gems GGG itself names as unreleased: "[DNT ...]" (do not translate, e.g.
 * "[DNT-UNUSED] Spiral Projectiles I"), "Coming Soon" slots, playtest skills and
 * the "Removed Skill" stub. None of them reaches a player.
 */
const PLACEHOLDER_GEM = /\[DNT|^Coming Soon$|^Playtest |^Removed Skill$/;

export function isPlaceholderGem(name: string): boolean {
  return PLACEHOLDER_GEM.test(name);
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

/** Decode a `.csd` file's UTF-16 text via {@link GgpkSource.file}, or `null` if the source has none. */
async function readCsd(source: GgpkSource, path: string): Promise<string | null> {
  const bytes = await source.file(path);

  return bytes ? Buffer.from(bytes).toString('utf16le') : null;
}

/** GGG templates carry literal "\n" for multi-line stats; make it a real newline. */
function multiline(text: string): string {
  return text.replace(/\\n/g, '\n');
}

/** Description scope of support gems, and of the meta gems among them. */
const GEM_SCOPE = 'Data/StatDescriptions/gem_stat_descriptions.csd';
const META_GEM_SCOPE = 'Data/StatDescriptions/meta_gem_stat_descriptions.csd';

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

  // Description files, each read and parsed once (stat_descriptions.csd alone is
  // tens of MB) and shared by every scope that includes it.
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

  /** A description scope: the file at `path` followed by the files it includes, most specific first. */
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

  /**
   * The scope stat set `setIndex` of a granted effect renders through, as Path of
   * Building picks it: the gem (or meta gem) file for a support, else the skill's
   * own file with `statset_0` swapped for the set's number.
   */
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

  /** Render a summed stat map through a scope into tooltip lines, in tooltip order. */
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

    // Per-level requirement curve, as PoB's skill export builds it: the character
    // level comes from the gem's level progression and never drops below the
    // level before; attributes follow PoB's formula. Support gems impose no
    // attribute requirement.
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

    // Tooltip scaling, independent of the attribute-requirement curve above (a
    // support with no level curve can still have flat, level-1-only scaling).
    // Built as Path of Building's gem tooltip: each stat set sums its stats at a
    // gem level and renders them together through its own description scope.
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
      // Sets labelled "Hidden" carry internal mechanics the game never shows in the
      // tooltip (PoB leaves them out too); they still count for the scope numbering.
      const shown = statSets
        .map((set, k) => k)
        .filter((k) => GrantedEffectLabels[statSets[k]!.Label ?? -1]?.Id !== 'Hidden');

      /**
       * Stat set `k`'s stats at a gem level, summed the way PoB's
       * `calcLib.buildSkillInstanceStats` sums them: per-level values, then flags
       * at 1 (only when the stat has no value yet), then constants. A later set
       * inherits the first set's stats, minus the ones it ignores.
       */
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

      // Quality bonus lines at MAX_QUALITY (min is the quality-0 value, 0). PoB
      // gives support gems none, and renders each bonus stat on its own through
      // the scope of the first stat set it applies to.
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
