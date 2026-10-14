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
 * indexed under each of its stats, and a stat described twice keeps the later
 * block); rendering picks the line whose per-stat conditions all accept the
 * supplied values.
 */

/** An inclusive numeric range a stat value must fall in for a line to apply. */
interface Condition {
  min: number;
  max: number;
  /** `!n`: any value except this one. */
  except?: number;
}

/** One renderable line of a description block. */
interface Variant {
  conditions: Condition[];
  text: string;
  /** Flat `name index name index …` handler tokens applied to the values. */
  handlers: string[];
  /** A `gem_quality` line: describes a gem's quality bonus, used only when rendering one. */
  gemQuality: boolean;
  /** A `table_only` line: a `label@value` row of the in-game skill table, never a tooltip line. */
  tableOnly: boolean;
}

/** A description block: the stats it renders together and its candidate lines. */
interface StatRecord {
  statIds: string[];
  variants: Variant[];
  /** Position of the block in the description file; the game lists lines in this order. */
  order: number;
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

/** Optional inputs to {@link renderBlock}. */
export interface RenderOptions {
  /**
   * Values, parallel to `statIds`, that pick each block's line and decide
   * whether it shows at all, in place of the rendered values. A range renderer
   * uses it to give a zero end of a range (`0-10`) the line of its other end.
   */
  selectBy?: number[];
  /** Render a gem's quality bonus: lets `gem_quality` lines take part. */
  quality?: boolean;
  /**
   * List the lines the way the game does: by their block's position in the
   * description file, instead of in the order of `statIds`.
   */
  descriptionOrder?: boolean;
}

/** The rendered lines of a stat block, plus any stat ids that had no block. */
export interface RenderedBlock {
  /** Rendered, human-readable text lines for the resolved stats. */
  lines: string[];
  /**
   * The supplied stat ids each line renders, parallel to {@link RenderedBlock.lines}
   * (a block renders several stats together, e.g. min/max added damage).
   */
  lineStatIds: string[][];
  /** Stat ids that matched no description block, in input order. */
  unresolved: string[];
}

/** Parse a condition token: `#` = any, `a|b` = range, `!n` = anything but n, `n` = exactly n. */
function parseCondition(token: string): Condition {
  if (token === '#') {
    return { min: -Infinity, max: Infinity };
  }

  if (token.startsWith('!')) {
    return { min: -Infinity, max: Infinity, except: Number(token.slice(1)) };
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

/** A word between a line's conditions and its text, e.g. `gem_quality`, rather than a condition. */
const LINE_FLAG = /^[a-z_]+$/;

/** Split one description line into its conditions, flags, text and handler tokens. */
function parseDescriptionLine(line: string): Variant {
  const trimmed = line.trim();
  const firstQuote = trimmed.indexOf('"');
  const lastQuote = trimmed.lastIndexOf('"');

  const tokens = trimmed.slice(0, firstQuote).trim().split(/\s+/).filter(Boolean);
  const flags = tokens.filter((token) => LINE_FLAG.test(token));
  const conditions = tokens.filter((token) => !LINE_FLAG.test(token)).map(parseCondition);
  const text = trimmed.slice(firstQuote + 1, lastQuote);
  const handlers = trimmed.slice(lastQuote + 1).trim().split(/\s+/).filter(Boolean);

  return {
    conditions,
    text,
    handlers,
    gemQuality: flags.includes('gem_quality'),
    tableOnly: flags.includes('table_only'),
  };
}

/**
 * Build a per-stat lookup from the raw text of a GGG `stat_descriptions.csd`
 * file (decoded from UTF-16). The first language block (English) is kept; later
 * `lang "..."` blocks are skipped by the outer loop, which only resumes on the
 * next `description` marker.
 *
 * A stat described by more than one block keeps the last one, as Path of
 * Building resolves it. Note that `skill_stat_descriptions.csd` ends with
 * skill-table blocks that supersede the tooltip blocks of some stats that way
 * (e.g. `projectile_speed_+%`); gem tooltips read through each skill's own
 * statset description file, which describes those stats again.
 *
 * @param csd - The decoded UTF-16 text of a `stat_descriptions.csd` file.
 * @returns A {@link StatIndex} to pass to {@link renderBlock}.
 */
export function buildStatIndex(csd: string): StatIndex {
  // Drop a leading UTF-16 byte-order mark if the decoder left one in.
  const text = csd.charCodeAt(0) === 0xfeff ? csd.slice(1) : csd;
  const lines = text.split(/\r\n|\n/);
  const byStat = new Map<string, StatRecord>();
  let order = 0;

  let i = 0;

  while (i < lines.length) {
    const marker = lines[i]!.trim();
    // `no_description <stat>` hides a stat: an empty block that supersedes any
    // earlier one (e.g. a skill's own file hiding a flag its included files describe).
    const hidden = marker.match(/^no_description\s+(\S+)$/)?.[1];

    if (hidden) {
      byStat.set(hidden, { statIds: [hidden], variants: [], order });
      order += 1;
      i += 1;
      continue;
    }

    if (marker !== 'description') {
      i += 1;
      continue;
    }

    i += 1;

    if (i >= lines.length) {
      throw new Error(`malformed stat_descriptions.csd: "description" at line ${i - 1} has no header line`);
    }

    // "\t<N> <id1> ... <idN>"
    const header = lines[i]!.trim().split(/\s+/);
    const statCount = Number(header[0]);

    if (!Number.isInteger(statCount) || statCount < 0 || header.length < 1 + statCount) {
      throw new Error(`malformed stat_descriptions.csd: bad stat-count header "${lines[i]}" at line ${i}`);
    }

    const statIds = header.slice(1, 1 + statCount);
    i += 1;

    if (i >= lines.length) {
      throw new Error(`malformed stat_descriptions.csd: header at line ${i - 1} has no line-count line`);
    }

    // English line count (first language block, before any `lang`).
    const lineCount = Number(lines[i]!.trim());

    if (!Number.isInteger(lineCount) || lineCount < 0) {
      throw new Error(`malformed stat_descriptions.csd: bad line count "${lines[i]}" at line ${i}`);
    }

    i += 1;

    const variants: Variant[] = [];

    for (let k = 0; k < lineCount && i < lines.length; k += 1, i += 1) {
      variants.push(parseDescriptionLine(lines[i]!));
    }

    // A stat described twice takes its later block, which supersedes the earlier one.
    for (const id of statIds) {
      byStat.set(id, { statIds, variants, order });
    }

    order += 1;
  }

  return { byStat };
}

/**
 * How a display value is printed, in printf terms: `d` as an integer, `g` as the
 * shortest decimal (trailing zeros dropped), `.2f` with exactly two decimals.
 */
type ValueFormat = 'd' | 'g' | '.2f';

/** A stat value after its handlers ran: the display number and how to print it. */
interface DisplayValue {
  value: number;
  format: ValueFormat;
}

/** A numeric value handler. A missing `format` keeps the value's current one. */
interface ValueHandler {
  apply: (value: number) => number;
  format?: ValueFormat;
}

/** Round half up to `decimals` places. */
function roundTo(value: number, decimals = 0): number {
  const factor = 10 ** decimals;

  return Math.floor(value * factor + 0.5) / factor;
}

/** Round down to `decimals` places. The epsilon keeps exact quotients (30 / 60 = 0.5) from flooring a step under. */
function floorTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;

  return Math.floor(value * factor + 0.0001) / factor;
}

const divideBy = (divisor: number): ValueHandler => ({ apply: (v) => v / divisor, format: 'g' });
const divideRounded = (divisor: number, decimals: number): ValueHandler => ({
  apply: (v) => roundTo(v / divisor, decimals),
  format: 'g',
});
const divideToInteger = (divisor: number): ValueHandler => ({ apply: (v) => roundTo(v / divisor) });

/**
 * GGG's numeric value handlers, keyed by the name a description line carries.
 * The `_Ndp` suffix rounds to N decimals; without one a division keeps its full
 * fraction. Handlers that don't set `format` keep the current one, so a negate
 * after a divide still prints the decimals. Non-numeric handlers (item classes,
 * passive hashes, skill indexes, reminder text) are not listed and leave the
 * value untouched, as do names this table does not know.
 */
const VALUE_HANDLERS: Record<string, ValueHandler> = {
  negate: { apply: (v) => -v },
  negate_and_double: { apply: (v) => -2 * v },
  invert_chance: { apply: (v) => 100 - v },
  double: { apply: (v) => v * 2 },
  times_one_point_five: { apply: (v) => v * 1.5 },
  multiply_by_four: { apply: (v) => v * 4 },
  multiply_by_four_and_negate: { apply: (v) => -v * 4 },
  multiply_by_ten: { apply: (v) => v * 10 },
  times_twenty: { apply: (v) => v * 20 },
  multiply_by_one_hundred: { apply: (v) => v * 100 },
  plus_two_hundred: { apply: (v) => v + 200 },
  '30%_of_value': { apply: (v) => v * 0.3 },
  '60%_of_value': { apply: (v) => v * 0.6 },
  multiplicative_damage_modifier: { apply: (v) => 100 + v },
  multiplicative_permyriad_damage_modifier: { apply: (v) => 100 + v / 100, format: 'g' },
  one_hundred_divide_by_value: { apply: (v) => roundTo(100 / v, 2), format: 'g' },
  divide_by_two_0dp: divideToInteger(2),
  divide_by_three: divideBy(3),
  divide_by_four: divideBy(4),
  divide_by_five: divideBy(5),
  divide_by_six: divideBy(6),
  divide_by_ten_0dp: divideToInteger(10),
  divide_by_ten_1dp: divideRounded(10, 1),
  divide_by_ten_1dp_if_required: divideRounded(10, 1),
  divide_by_twelve: divideBy(12),
  divide_by_fifteen_0dp: divideToInteger(15),
  divide_by_twenty: divideBy(20),
  divide_by_twenty_then_double_0dp: { apply: (v) => roundTo(v / 20) * 2 },
  divide_by_fifty: divideBy(50),
  divide_by_one_hundred: divideBy(100),
  divide_by_one_hundred_0dp: divideRounded(100, 0),
  divide_by_one_hundred_1dp: divideRounded(100, 1),
  divide_by_one_hundred_2dp: divideRounded(100, 2),
  divide_by_one_hundred_2dp_if_required: divideRounded(100, 2),
  divide_by_one_hundred_and_negate: { apply: (v) => -v / 100, format: 'g' },
  divide_by_one_thousand: divideBy(1000),
  divide_by_ten_thousand_1dp: divideRounded(10000, 1),
  // Stored per minute, described per second. The undecorated variant rounds down.
  per_minute_to_per_second: { apply: (v) => floorTo(v / 60, 1), format: 'g' },
  per_minute_to_per_second_0dp: divideToInteger(60),
  per_minute_to_per_second_1dp: divideRounded(60, 1),
  per_minute_to_per_second_2dp: divideRounded(60, 2),
  per_minute_to_per_second_2dp_if_required: divideRounded(60, 2),
  milliseconds_to_seconds: divideBy(1000),
  milliseconds_to_seconds_halved: divideBy(2000),
  milliseconds_to_seconds_0dp: divideToInteger(1000),
  milliseconds_to_seconds_1dp: divideRounded(1000, 1),
  milliseconds_to_seconds_2dp: divideRounded(1000, 2),
  milliseconds_to_seconds_2dp_if_required: divideRounded(1000, 2),
  deciseconds_to_seconds: { apply: (v) => v / 10, format: '.2f' },
};

/**
 * Run a line's value handlers over its raw stat values, in the order the line
 * lists them. Handlers come as `name argument` pairs, except `canonical_line`,
 * a bare marker that takes no argument.
 */
function applyHandlers(values: number[], handlers: string[]): DisplayValue[] {
  const out = values.map((value): DisplayValue => ({ value, format: 'd' }));

  let h = 0;

  while (h < handlers.length) {
    const name = handlers[h]!;

    if (name === 'canonical_line') {
      h += 1;
      continue;
    }

    const handler = VALUE_HANDLERS[name];
    const index = Number(handlers[h + 1]) - 1;

    h += 2;

    if (!handler || !(index >= 0 && index < out.length)) {
      continue;
    }

    const current = out[index]!;

    out[index] = { value: handler.apply(current.value), format: handler.format ?? current.format };
  }

  return out;
}

/** Print a display value in its format. */
function formatValue({ value, format }: DisplayValue): string {
  if (format === '.2f') {
    return value.toFixed(2);
  }

  // `g`: six significant digits, then the shortest form, so 0.50 prints as "0.5".
  return String(format === 'g' ? Number(value.toPrecision(6)) : Math.round(value));
}

/**
 * Pick the variant whose per-stat conditions all accept the raw values, or
 * `null` when none does: a value the block has no line for is not displayed
 * (`1|#` and `#|-1` lines leave 0 out on purpose). `gem_quality` lines take
 * part only when rendering a gem's quality bonus; `table_only` lines never do,
 * as Path of Building drops them.
 */
function selectVariant(variants: Variant[], rawValues: number[], options: RenderOptions): Variant | null {
  const accepts = (variant: Variant): boolean =>
    !variant.tableOnly &&
    (!variant.gemQuality || options.quality === true) &&
    variant.conditions.every((cond, i) => {
      const value = rawValues[i] ?? 0;

      return value >= cond.min && value <= cond.max && value !== cond.except;
    });

  return variants.find(accepts) ?? null;
}

/**
 * Fill `{0}`, `{0:+d}`, `{0:d}` placeholders, and GGG's bare `{}` (implicit next
 * index), each value printed in the format its handlers left it in.
 */
function fillTemplate(text: string, values: DisplayValue[]): string {
  let implicitIndex = 0;

  return text.replace(/\{(\d*)(?::([^}]+))?\}/g, (_, index: string, format: string | undefined) => {
    const value = values[index === '' ? implicitIndex++ : Number(index)];

    if (value == null) {
      return '';
    }

    const printed = formatValue(value);

    return format === '+d' && !printed.startsWith('-') ? `+${printed}` : printed;
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
 * The `include "..."` path a `.csd` file names on its first line (the description
 * file it falls back to), or `null` when it includes none. Description files form
 * a chain this way: a skill's own file, then `skill_stat_descriptions.csd`, then
 * the gem files, then `stat_descriptions.csd`.
 *
 * @param csd - The decoded UTF-16 text of a `.csd` file.
 */
export function csdInclude(csd: string): string | null {
  return csd.match(/^\uFEFF?\s*include "([^"]+)"/m)?.[1] ?? null;
}

/** Find the block for a stat in one index, also under its "base_" prefixed id. */
function findRecord(index: StatIndex, statId: string): StatRecord | undefined {
  // Some stats are keyed with a "base_" prefix in the description file
  // (e.g. curse_duration_+% -> base_curse_duration_+%).
  return index.byStat.get(statId) ?? index.byStat.get(`base_${statId}`);
}

/**
 * Render a full stat block. Each stat resolves to its block; a block may render
 * several stats together (e.g. min/max added damage), so its placeholders are
 * filled from whichever of those stats it provides (others default to 0) and all
 * are marked consumed so the line is not repeated. A block renders no line when
 * all its values are zero or when none of its variants accepts the values.
 *
 * Given a chain of indexes (a description file followed by the files it
 * includes, see {@link csdInclude}), each stat resolves in the first index that
 * describes it, the way Path of Building resolves a stat-description scope. With
 * `descriptionOrder`, lines from included files then come first, each file's in
 * its own order.
 *
 * @param index - The {@link StatIndex} from {@link buildStatIndex}, or a chain of them, most specific first.
 * @param statIds - Stat ids to render.
 * @param vals - Raw stat values, parallel to `statIds`.
 * @param options - See {@link RenderOptions}.
 * @returns A {@link RenderedBlock} of rendered lines and any unresolved stat ids.
 */
export function renderBlock(
  index: StatIndex | StatIndex[],
  statIds: string[],
  vals: number[],
  options: RenderOptions = {},
): RenderedBlock {
  const chain = Array.isArray(index) ? index : [index];
  const valueByStat = new Map(statIds.map((id, i) => [id, vals[i]!]));
  const selectByStat = new Map(statIds.map((id, i) => [id, (options.selectBy ?? vals)[i]!]));
  const consumed = new Set<string>();
  const rendered: { line: string; stats: string[]; depth: number; order: number }[] = [];
  const unresolved: string[] = [];

  for (const statId of statIds) {
    if (consumed.has(statId)) {
      continue;
    }

    const depth = chain.findIndex((scope) => findRecord(scope, statId));
    const record = depth >= 0 ? findRecord(chain[depth]!, statId) : undefined;

    if (!record) {
      unresolved.push(statId);
      continue;
    }

    const supplied = record.statIds.flatMap((id) => {
      const stripped = id.replace(/^base_/, '');

      return valueByStat.has(id) ? [id] : valueByStat.has(stripped) ? [stripped] : [];
    });

    // The block's stat ids may carry a "base_" prefix the source stat lacks, so
    // fall back to the prefix-stripped id when reading the value.
    const lookup = (values: Map<string, number>, id: string): number =>
      values.get(id) ?? values.get(id.replace(/^base_/, '')) ?? 0;
    const rawValues = record.statIds.map((id) => lookup(valueByStat, id));
    const selectValues = record.statIds.map((id) => lookup(selectByStat, id));
    // A block whose stats are all zero grants nothing and is not displayed.
    const variant = selectValues.some((value) => value !== 0) ? selectVariant(record.variants, selectValues, options) : null;

    if (variant?.text) {
      rendered.push({
        line: stripBbcode(fillTemplate(variant.text, applyHandlers(rawValues, variant.handlers))),
        stats: supplied,
        depth,
        order: record.order,
      });
    }

    for (const id of supplied) {
      consumed.add(id);
    }
  }

  if (options.descriptionOrder) {
    rendered.sort((a, b) => b.depth - a.depth || a.order - b.order);
  }

  return {
    lines: rendered.map((entry) => entry.line),
    lineStatIds: rendered.map((entry) => entry.stats),
    unresolved,
  };
}
