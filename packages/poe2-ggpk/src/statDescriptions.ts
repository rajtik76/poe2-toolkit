/**
 * Renders GGG's numeric `(stat_id, value)` pairs into text using `stat_descriptions.csd` (plain UTF-16 text despite
 * the extension), shared by passive nodes, item mods and gem stats.
 *
 * File format, one block per description:
 * ```
 *   description
 *   \t<N> <stat_id_1> ... <stat_id_N>
 *   \t<lineCount>
 *   \t\t<cond_1> ... <cond_N> "text with {0} {1}" [handler index]...
 *   \tlang "French"          <- other languages follow; English is read here
 * ```
 * Every stat id is indexed to the block that renders it; rendering picks the line whose conditions all accept the values.
 */

interface Condition {
  min: number;
  max: number;
  except?: number;
}

interface Variant {
  conditions: Condition[];
  text: string;
  handlers: string[];
  gemQuality: boolean;
  tableOnly: boolean;
}

interface StatRecord {
  statIds: string[];
  variants: Variant[];
  order: number;
}

/** Opaque handle from {@link buildStatIndex}, consumed by {@link renderBlock}. */
export interface StatIndex {
  byStat: Map<string, StatRecord>;
}

export interface RenderOptions {
  /** Values (parallel to `statIds`) that pick each block's line and whether it shows, instead of the rendered values. Lets a range renderer give a zero end the line of its other end. */
  selectBy?: number[];
  quality?: boolean;
  descriptionOrder?: boolean;
}

export interface RenderedBlock {
  lines: string[];
  lineStatIds: string[][];
  unresolved: string[];
}

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

const LINE_FLAG = /^[a-z_]+$/;

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
 * Per-stat lookup from the decoded text of a `stat_descriptions.csd`. Only the first (English) language block is kept.
 * A stat described by several blocks keeps the last, as PoB resolves it: `skill_stat_descriptions.csd` ends with
 * skill-table blocks that supersede some tooltip blocks (e.g. `projectile_speed_+%`), so gem tooltips read through
 * each skill's own statset file, which describes those stats again.
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
    // `no_description <stat>` hides a stat: an empty block that supersedes any earlier one.
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

    const lineCount = Number(lines[i]!.trim());

    if (!Number.isInteger(lineCount) || lineCount < 0) {
      throw new Error(`malformed stat_descriptions.csd: bad line count "${lines[i]}" at line ${i}`);
    }

    i += 1;

    const variants: Variant[] = [];

    for (let k = 0; k < lineCount && i < lines.length; k += 1, i += 1) {
      variants.push(parseDescriptionLine(lines[i]!));
    }

    for (const id of statIds) {
      byStat.set(id, { statIds, variants, order });
    }

    order += 1;
  }

  return { byStat };
}

/** printf terms: `d` integer, `g` shortest decimal, `.2f` exactly two decimals. */
type ValueFormat = 'd' | 'g' | '.2f';

interface DisplayValue {
  value: number;
  format: ValueFormat;
}

interface ValueHandler {
  apply: (value: number) => number;
  format?: ValueFormat;
}

function roundTo(value: number, decimals = 0): number {
  const factor = 10 ** decimals;

  return Math.floor(value * factor + 0.5) / factor;
}

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
 * GGG's numeric value handlers by name. `_Ndp` rounds to N decimals, otherwise a division keeps its full fraction.
 * A handler that doesn't set `format` keeps the current one. Non-numeric and unknown handlers leave the value untouched.
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

/** Runs a line's handlers in order. They come as `name argument` pairs, except the bare marker `canonical_line`. */
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

function formatValue({ value, format }: DisplayValue): string {
  if (format === '.2f') {
    return value.toFixed(2);
  }

  return String(format === 'g' ? Number(value.toPrecision(6)) : Math.round(value));
}

/**
 * Variant whose per-stat conditions all accept the values, or `null`: a value with no line is not displayed (`1|#`
 * and `#|-1` leave 0 out on purpose). `gem_quality` lines count only for a gem's quality bonus, `table_only` never (PoB drops them).
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

/** Fills `{0}`, `{0:+d}`, `{0:d}` and the bare `{}` (implicit next index). */
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

function stripBbcode(text: string): string {
  return text.replace(/\[([^\]]+)\]/g, (_, inner: string) => {
    const pipe = inner.lastIndexOf('|');

    return pipe === -1 ? inner : inner.slice(pipe + 1);
  });
}

export function csdInclude(csd: string): string | null {
  return csd.match(/^\uFEFF?\s*include "([^"]+)"/m)?.[1] ?? null;
}

function findRecord(index: StatIndex, statId: string): StatRecord | undefined {
  // Some stats are keyed with a "base_" prefix in the description file (curse_duration_+% -> base_curse_duration_+%).
  return index.byStat.get(statId) ?? index.byStat.get(`base_${statId}`);
}

/**
 * Renders a full stat block. A block may render several stats together (e.g. min/max added damage): its placeholders
 * come from whichever of them it provides (others 0) and all are marked consumed. No line when all values are zero or
 * no variant accepts them.
 *
 * Given a chain of indexes (a file followed by its includes, see {@link csdInclude}), each stat resolves in the first
 * index describing it, as in PoB. With `descriptionOrder`, lines from included files come first.
 *
 * @param index - A {@link StatIndex} from {@link buildStatIndex}, or a chain of them, most specific first.
 * @param statIds - Stat ids to render.
 * @param vals - Raw stat values, parallel to `statIds`.
 * @param options - See {@link RenderOptions}.
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

    // The block's stat ids may carry a "base_" prefix the source stat lacks: fall back to the stripped id.
    const lookup = (values: Map<string, number>, id: string): number =>
      values.get(id) ?? values.get(id.replace(/^base_/, '')) ?? 0;
    const rawValues = record.statIds.map((id) => lookup(valueByStat, id));
    const selectValues = record.statIds.map((id) => lookup(selectByStat, id));
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
