/**
 * StatDescriptions engine — renders GGG's numeric `(stat_id, value)` pairs into
 * human-readable text, using GGG's own `stat_descriptions.csd` straight from the
 * GGPK. Despite the `.csd` extension the file is plain UTF-16 text, not compiled
 * binary. Shared across domains: passive nodes, item mods and gem stats all
 * render through it.
 *
 * File format (one block per description):
 *
 * ```
 *   description
 *   \t<N> <stat_id_1> ... <stat_id_N>
 *   \t<lineCount>
 *   \t\t<cond_1> ... <cond_N> "text with {0} {1}" [handler index]...
 *   \tlang "French"          <- other languages follow; English is read here
 * ```
 *
 * Every stat id is indexed to the block that renders it (a multi-stat block is
 * indexed under each of its stats); rendering picks the line whose per-stat
 * conditions all accept the supplied values.
 */

/** An inclusive numeric range a stat value must fall in for a line to apply. */
interface Condition {
  min: number;
  max: number;
}

/** One renderable line of a description block. */
interface Variant {
  conditions: Condition[];
  text: string;
  /** Flat `name index name index …` handler tokens applied to the values. */
  handlers: string[];
}

/** A description block: the stats it renders together and its candidate lines. */
interface StatRecord {
  statIds: string[];
  variants: Variant[];
}

/**
 * A parsed `stat_descriptions.csd`: an opaque handle produced by
 * {@link buildStatIndex} and consumed by {@link renderBlock}. Treat it as
 * read-only; its internals are an implementation detail.
 */
export interface StatIndex {
  /** Each stat id mapped to the description block that renders it. */
  byStat: Map<string, StatRecord>;
}

/** The rendered lines of a stat block, plus any stat ids that had no block. */
export interface RenderedBlock {
  /** Rendered, human-readable text lines for the resolved stats. */
  lines: string[];
  /** Stat ids that matched no description block, in input order. */
  unresolved: string[];
}

/** Parse a condition token: `#` = any, `a|b` = range, `n` = exactly n. */
function parseCondition(token: string): Condition {
  if (token === '#') {
    return { min: -Infinity, max: Infinity };
  }

  if (token.includes('|')) {
    const [lo, hi] = token.split('|');

    return {
      min: lo === '#' ? -Infinity : Number(lo),
      max: hi === '#' ? Infinity : Number(hi),
    };
  }

  const exact = Number(token);

  return { min: exact, max: exact };
}

/** Split one description line into its conditions, text and handler tokens. */
function parseDescriptionLine(line: string): Variant {
  const trimmed = line.trim();
  const firstQuote = trimmed.indexOf('"');
  const lastQuote = trimmed.lastIndexOf('"');

  const conditions = trimmed.slice(0, firstQuote).trim().split(/\s+/).filter(Boolean).map(parseCondition);
  const text = trimmed.slice(firstQuote + 1, lastQuote);
  const handlers = trimmed.slice(lastQuote + 1).trim().split(/\s+/).filter(Boolean);

  return { conditions, text, handlers };
}

/**
 * Build a per-stat lookup from the raw text of a GGG `stat_descriptions.csd`
 * file (decoded from UTF-16). The first language block (English) is kept; later
 * `lang "..."` blocks are skipped by the outer loop, which only resumes on the
 * next `description` marker.
 *
 * @param csd - The decoded UTF-16 text of a `stat_descriptions.csd` file.
 * @returns A {@link StatIndex} to pass to {@link renderBlock}.
 */
export function buildStatIndex(csd: string): StatIndex {
  // Drop a leading UTF-16 byte-order mark if the decoder left one in.
  const text = csd.charCodeAt(0) === 0xfeff ? csd.slice(1) : csd;
  const lines = text.split(/\r\n|\n/);
  const byStat = new Map<string, StatRecord>();

  let i = 0;

  while (i < lines.length) {
    if (lines[i]!.trim() !== 'description') {
      i += 1;
      continue;
    }

    i += 1;

    // "\t<N> <id1> ... <idN>"
    const header = lines[i]!.trim().split(/\s+/);
    const statCount = Number(header[0]);
    const statIds = header.slice(1, 1 + statCount);
    i += 1;

    // English line count (first language block, before any `lang`).
    const lineCount = Number(lines[i]!.trim());
    i += 1;

    const variants: Variant[] = [];

    for (let k = 0; k < lineCount && i < lines.length; k += 1, i += 1) {
      variants.push(parseDescriptionLine(lines[i]!));
    }

    for (const id of statIds) {
      if (!byStat.has(id)) {
        byStat.set(id, { statIds, variants });
      }
    }
  }

  return { byStat };
}

/** GGG value handlers — transform a raw stat value for display. */
function applyHandlers(values: number[], handlers: string[]): number[] {
  const out = [...values];

  for (let h = 0; h + 1 < handlers.length; h += 2) {
    const name = handlers[h];
    const index = Number(handlers[h + 1]) - 1;

    if (index < 0 || index >= out.length) {
      continue;
    }

    switch (name) {
      case 'negate':
        out[index] = -out[index]!;
        break;
      case 'divide_by_one_hundred':
      case 'divide_by_one_hundred_2dp':
      case 'divide_by_one_hundred_2dp_if_required':
      case 'per_minute_to_per_second':
        out[index]! /= 100;
        break;
      case 'milliseconds_to_seconds':
      case 'milliseconds_to_seconds_2dp':
      case 'milliseconds_to_seconds_2dp_if_required':
      case 'divide_by_one_thousand':
        out[index]! /= 1000;
        break;
      case 'divide_by_ten_0dp':
        out[index]! /= 10;
        break;
      default:
        break;
    }
  }

  return out;
}

/** Pick the variant whose per-stat conditions all accept the raw values. */
function selectVariant(variants: Variant[], rawValues: number[]): Variant | null {
  for (const variant of variants) {
    const ok = variant.conditions.every((cond, i) => {
      const value = rawValues[i] ?? 0;

      return value >= cond.min && value <= cond.max;
    });

    if (ok) {
      return variant;
    }
  }

  return variants[0] ?? null;
}

/** Fill `{0}`, `{0:+d}`, `{0:d}` placeholders with rounded values. */
function fillTemplate(text: string, values: number[]): string {
  return text.replace(/\{(\d+)(?::([^}]+))?\}/g, (_, index: string, format: string | undefined) => {
    const value = values[Number(index)];

    if (value == null) {
      return '';
    }

    const rounded = Math.round(value);

    return format === '+d' && rounded >= 0 ? `+${rounded}` : String(rounded);
  });
}

/** Strip PoE bbcode: `[Cold]` -> "Cold", `[AoESkill|AoE]` -> "AoE". */
function stripBbcode(text: string): string {
  return text.replace(/\[([^\]]+)\]/g, (_, inner: string) => {
    const pipe = inner.lastIndexOf('|');

    return pipe === -1 ? inner : inner.slice(pipe + 1);
  });
}

/**
 * Render a full stat block. Each stat resolves to its block; a block may render
 * several stats together (e.g. min/max added damage), so its placeholders are
 * filled from whichever of those stats it provides (others default to 0) and all
 * are marked consumed so the line is not repeated.
 *
 * @param index - The {@link StatIndex} from {@link buildStatIndex}.
 * @param statIds - Stat ids to render.
 * @param vals - Raw stat values, parallel to `statIds`.
 * @returns A {@link RenderedBlock} of rendered lines and any unresolved stat ids.
 */
export function renderBlock(index: StatIndex, statIds: string[], vals: number[]): RenderedBlock {
  const valueByStat = new Map(statIds.map((id, i) => [id, vals[i]!]));
  const consumed = new Set<string>();
  const lines: string[] = [];
  const unresolved: string[] = [];

  for (const statId of statIds) {
    if (consumed.has(statId)) {
      continue;
    }

    // Some stats are keyed with a "base_" prefix in the description file
    // (e.g. curse_duration_+% -> base_curse_duration_+%).
    const record = index.byStat.get(statId) ?? index.byStat.get(`base_${statId}`);

    if (!record) {
      unresolved.push(statId);
      continue;
    }

    // The block's stat ids may carry a "base_" prefix the source stat lacks, so
    // fall back to the prefix-stripped id when reading the value.
    const valueFor = (id: string): number => valueByStat.get(id) ?? valueByStat.get(id.replace(/^base_/, '')) ?? 0;
    const rawValues = record.statIds.map(valueFor);
    const variant = selectVariant(record.variants, rawValues);

    if (variant?.text) {
      lines.push(stripBbcode(fillTemplate(variant.text, applyHandlers(rawValues, variant.handlers))));
    }

    for (const id of record.statIds) {
      const stripped = id.replace(/^base_/, '');

      if (valueByStat.has(id)) {
        consumed.add(id);
      }

      if (valueByStat.has(stripped)) {
        consumed.add(stripped);
      }
    }
  }

  return { lines, unresolved };
}
