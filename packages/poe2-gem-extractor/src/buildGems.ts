/**
 * Builds the Path of Exile 2 gem data from GGPK tables, joining the relational
 * `SkillGems` -> `GemEffects` -> `GrantedEffects` -> `ActiveSkills` chain into a
 * flat, build-facing shape. Source of truth: GGPK only.
 *
 * Keying mirrors how a build importer looks gems up: by the last path segment of
 * the base item's game id (Path of Building's `normalizeGemId`). Icons are kept
 * as their raw GGPK DDS paths - decoding them to PNG is {@link buildGemIcons}'
 * concern.
 *
 * The per-level attribute requirement curve is ported verbatim from PoB's
 * `calcLib.getGemStatRequirement` (CalcTools.lua), so the numbers match the game.
 */

import type { GgpkSource } from '@poe2-toolkit/ggpk';

/** Active skill, support, or spirit (persistent buff) gem. */
export type GemKind = 'active' | 'support' | 'spirit';

/** Gem socket colour: red (str), green (dex), blue (int), white (any). */
export type GemColor = 'r' | 'g' | 'b' | 'w';

/** GemType / GemColour are bare i32 in the schema - enums derived from the data. */
const GEM_KIND: Record<number, GemKind> = { 0: 'active', 1: 'support', 2: 'spirit' };
const GEM_COLOR: Record<number, GemColor> = { 1: 'r', 2: 'g', 3: 'b', 4: 'w' };

/** The percent-of-attribute requirements plus the gem's minimum character level. */
export interface GemReq {
  str: number;
  dex: number;
  int: number;
  level: number;
}

/** One gem as serialized for the build front-end. */
export interface Gem {
  name: string;
  kind: GemKind;
  color: GemColor;
  tags: string[];
  description: string | null;
  req: GemReq;
  /** Raw GGPK DDS path of the gem's icon, or `null` when none is referenced. */
  icon: string | null;
}

/** A gem's resolved requirement at one gem level. */
export interface GemLevel {
  requiredLevel: number;
  str: number;
  dex: number;
  int: number;
}

/** The full per-level requirement curve for one gem. */
export interface GemRequirement {
  name: string;
  /** Keyed by gem level. */
  levels: Record<number, GemLevel>;
}

/** Everything the gem extractor produces. */
export interface GemData {
  /** Gems keyed by the last path segment of their base item id. */
  gems: Record<string, Gem>;
  /** Per-level requirement curves, keyed the same way; gems without a curve are omitted. */
  requirements: Record<string, GemRequirement>;
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
}

interface BaseItemTypeRow { Id?: string; Name?: string }
interface GemEffectRow { GrantedEffect?: number | null; SupportText?: string; GemTags?: number[] }
interface GrantedEffectRow { ActiveSkill?: number | null }
interface ActiveSkillRow { Description?: string; Icon_DDSFile?: string }
interface GemTagRow { Name?: string }
interface SupportGemRow { SkillGem?: number | null; Icon?: string }
interface GrantedEffectPerLevelRow { GrantedEffect?: number | null; Level?: number | null; ActorLevel?: number | null }

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

  // Support gems carry their own icon in SupportGems, keyed by SkillGems row index.
  const supportIconByGemIndex = new Map<number, string>();

  for (const row of SupportGems) {
    if (row.SkillGem != null && row.Icon) {
      supportIconByGemIndex.set(row.SkillGem, row.Icon);
    }
  }

  const gems: Record<string, Gem> = {};
  const requirements: Record<string, GemRequirement> = {};

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
  });

  return { gems, requirements };
}
