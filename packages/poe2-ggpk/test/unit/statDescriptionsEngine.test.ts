/**
 * Behavioural coverage for the StatDescriptions engine on a hand-written `.csd`
 * sample, so the parser and renderer are exercised without a GGPK extract. The
 * gated test in `statDescriptions.test.ts` proves parity with the legacy engine
 * on the real file; this one pins down the semantics: block indexing, language
 * skipping, condition selection, value handlers, templates and bbcode.
 */

import { describe, expect, it } from 'vitest';

import { buildStatIndex, renderBlock } from '../../src/statDescriptions';

const SAMPLE = [
  'description',
  '\t1 maximum_life',
  '\t2',
  '\t\t1|# "{0:+d} to maximum Life"',
  '\t\t#|-1 "{0} less maximum Life" negate 1',
  '\tlang "French"',
  '\t\t1|# "{0:+d} au maximum de vie"',
  'description',
  '\t2 minimum_added_fire_damage maximum_added_fire_damage',
  '\t1',
  '\t\t# # "Adds {0} to {1} [Fire|Fire] Damage"',
  'description',
  '\t1 base_curse_duration_+%',
  '\t1',
  '\t\t# "{0}% increased Curse Duration"',
  'description',
  '\t1 attack_speed_+%_per_minute',
  '\t1',
  '\t\t# "{0} Attacks per Second" per_minute_to_per_second 1',
  'description',
  '\t1 body_armour_+%',
  '\t1',
  '\t\t# "{}% increased [Armour] from Equipped Body Armour"',
  'description',
  '\t2 minimum_added_cold_damage maximum_added_cold_damage',
  '\t1',
  '\t\t# # "Adds {} to {} [Cold|Cold] Damage"',
  'description',
  '\t1 life_regeneration_rate_per_minute_%',
  '\t1',
  '\t\t# "Regenerate {0}% of maximum Life per second" per_minute_to_per_second 1',
  'description',
  '\t1 charges_gained_per_minute',
  '\t1',
  '\t\t# "Gains {0} Charges per Second" per_minute_to_per_second_2dp_if_required 1',
  'description',
  '\t1 skill_effect_duration_ms',
  '\t2',
  '\t\t1|# "{0:+d} seconds to Duration" milliseconds_to_seconds 1',
  '\t\t#|-1 "{0} seconds less Duration" milliseconds_to_seconds 1 negate 1',
  'description',
  '\t1 crit_chance_+%_if_ready',
  '\t1',
  '\t\t# "{0}% increased Critical Hit Chance" divide_by_ten_1dp_if_required 1',
  'description',
  '\t1 recovery_duration_deciseconds',
  '\t1',
  '\t\t# "{0:+d} seconds of Recovery" deciseconds_to_seconds 1',
  'description',
  '\t1 duration_per_ten_ms',
  '\t1',
  '\t\t# "{0} seconds" divide_by_ten_0dp 1',
  'description',
  '\t2 local_ruby_jewel_limit local_emerald_jewel_limit',
  '\t2',
  '\t\t!0 0 "You can only Socket {0} Ruby Jewels in this item"',
  '\t\t!0 !0 "You can only Socket {0} Ruby and {1} Emerald Jewels in this item"',
  'description',
  '\t2 base_number_of_projectiles skill_can_fire_arrows',
  '\t3',
  '\t\t# 0 gem_quality "Fires {0:+d} Projectiles"',
  '\t\t# # table_only "Projectiles@{0}"',
  '\t\t2|# 0 "Fires {0} Projectiles"',
  'description',
  '\t1 life_cost_+%',
  '\t2',
  '\t\t1|# "{0}% more Life cost"',
  '\t\t#|-1 "{0}% less Life cost" canonical_line negate 1',
].join('\n');

const index = buildStatIndex(SAMPLE);

/** Each value handler: raw value in, printed value out. */
const HANDLER_CASES: [handler: string, raw: number, printed: string][] = [
  ['negate', 5, '-5'],
  ['negate_and_double', 5, '-10'],
  ['invert_chance', 30, '70'],
  ['double', 5, '10'],
  ['times_one_point_five', 4, '6'],
  ['multiply_by_four', 3, '12'],
  ['multiply_by_four_and_negate', 3, '-12'],
  ['multiply_by_ten', 3, '30'],
  ['times_twenty', 3, '60'],
  ['multiply_by_one_hundred', 3, '300'],
  ['plus_two_hundred', 5, '205'],
  ['30%_of_value', 10, '3'],
  ['60%_of_value', 10, '6'],
  ['multiplicative_damage_modifier', 50, '150'],
  ['multiplicative_permyriad_damage_modifier', 2550, '125.5'],
  ['one_hundred_divide_by_value', 3, '33.33'],
  ['divide_by_two_0dp', 5, '3'],
  ['divide_by_three', 10, '3.33333'],
  ['divide_by_four', 10, '2.5'],
  ['divide_by_five', 12, '2.4'],
  ['divide_by_six', 9, '1.5'],
  ['divide_by_ten_0dp', 25, '3'],
  ['divide_by_ten_1dp', 125, '12.5'],
  ['divide_by_ten_1dp_if_required', 120, '12'],
  ['divide_by_twelve', 18, '1.5'],
  ['divide_by_fifteen_0dp', 40, '3'],
  ['divide_by_twenty', 30, '1.5'],
  ['divide_by_twenty_then_double_0dp', 50, '6'],
  ['divide_by_fifty', 75, '1.5'],
  ['divide_by_one_hundred', 125, '1.25'],
  ['divide_by_one_hundred_0dp', 150, '2'],
  ['divide_by_one_hundred_1dp', 125, '1.3'],
  ['divide_by_one_hundred_2dp', 1234, '12.34'],
  ['divide_by_one_hundred_2dp_if_required', 1200, '12'],
  ['divide_by_one_hundred_and_negate', 125, '-1.25'],
  ['divide_by_one_thousand', 1500, '1.5'],
  ['divide_by_ten_thousand_1dp', 12500, '1.3'],
  ['per_minute_to_per_second', 100, '1.6'],
  ['per_minute_to_per_second_0dp', 90, '2'],
  ['per_minute_to_per_second_1dp', 100, '1.7'],
  ['per_minute_to_per_second_2dp', 100, '1.67'],
  ['per_minute_to_per_second_2dp_if_required', 120, '2'],
  ['milliseconds_to_seconds', 1250, '1.25'],
  ['milliseconds_to_seconds_halved', 1500, '0.75'],
  ['milliseconds_to_seconds_0dp', 1500, '2'],
  ['milliseconds_to_seconds_1dp', 1250, '1.3'],
  ['milliseconds_to_seconds_2dp', 1234, '1.23'],
  ['milliseconds_to_seconds_2dp_if_required', 1000, '1'],
  ['deciseconds_to_seconds', 15, '1.50'],
];

const handlerIndex = buildStatIndex(
  HANDLER_CASES.flatMap(([handler]) => ['description', `\t1 stat_${handler}`, '\t1', `\t\t# "{0}" ${handler} 1`]).join('\n'),
);

describe('value handlers', () => {
  it.each(HANDLER_CASES)('%s turns %d into %s', (handler, raw, printed) => {
    expect(renderBlock(handlerIndex, [`stat_${handler}`], [raw]).lines).toEqual([printed]);
  });
});

describe('buildStatIndex', () => {
  it('indexes a multi-stat block under each of its stats', () => {
    const min = index.byStat.get('minimum_added_fire_damage');
    const max = index.byStat.get('maximum_added_fire_damage');

    expect(min).toBeDefined();
    expect(min).toStrictEqual(max);
  });

  it('keeps only the English lines, skipping later language blocks', () => {
    const life = index.byStat.get('maximum_life')!;

    expect(life.variants).toHaveLength(2);
    expect(life.variants.every((v) => !v.text.includes('vie'))).toBe(true);
  });

  it('drops a leading byte-order mark', () => {
    const bom = buildStatIndex('﻿' + SAMPLE);

    expect(bom.byStat.has('maximum_life')).toBe(true);
  });
});

describe('renderBlock', () => {
  it('renders a positive value through the {0:+d} template', () => {
    expect(renderBlock(index, ['maximum_life'], [30]).lines).toEqual(['+30 to maximum Life']);
  });

  it('selects the negative variant by condition and applies the negate handler', () => {
    expect(renderBlock(index, ['maximum_life'], [-20]).lines).toEqual(['20 less maximum Life']);
  });

  it('renders a two-stat block once and marks both stats consumed', () => {
    const out = renderBlock(index, ['minimum_added_fire_damage', 'maximum_added_fire_damage'], [3, 7]);

    expect(out.lines).toEqual(['Adds 3 to 7 Fire Damage']);
    expect(out.unresolved).toEqual([]);
  });

  it('strips bbcode down to the display side of the pipe', () => {
    const out = renderBlock(index, ['minimum_added_fire_damage'], [1]);

    expect(out.lines[0]).not.toContain('[');
  });

  it('falls back to the base_-prefixed block for an unprefixed stat', () => {
    expect(renderBlock(index, ['curse_duration_+%'], [25]).lines).toEqual(['25% increased Curse Duration']);
  });

  it('applies value-scaling handlers before filling the template', () => {
    expect(renderBlock(index, ['attack_speed_+%_per_minute'], [240]).lines).toEqual(['4 Attacks per Second']);
  });

  it('converts per minute to per second and keeps the fraction', () => {
    expect(renderBlock(index, ['life_regeneration_rate_per_minute_%'], [30]).lines).toEqual([
      'Regenerate 0.5% of maximum Life per second',
    ]);
  });

  it('rounds the undecorated per-second conversion down to one decimal', () => {
    expect(renderBlock(index, ['life_regeneration_rate_per_minute_%'], [100]).lines).toEqual([
      'Regenerate 1.6% of maximum Life per second',
    ]);
  });

  it('rounds a 2dp per-second conversion half up and drops trailing zeros', () => {
    expect(renderBlock(index, ['charges_gained_per_minute'], [100]).lines).toEqual(['Gains 1.67 Charges per Second']);
    expect(renderBlock(index, ['charges_gained_per_minute'], [15]).lines).toEqual(['Gains 0.25 Charges per Second']);
    expect(renderBlock(index, ['charges_gained_per_minute'], [120]).lines).toEqual(['Gains 2 Charges per Second']);
  });

  it('keeps the full fraction for a division without a precision suffix', () => {
    expect(renderBlock(index, ['skill_effect_duration_ms'], [1500]).lines).toEqual(['+1.5 seconds to Duration']);
  });

  it('keeps the fraction through a negate that follows a division', () => {
    expect(renderBlock(index, ['skill_effect_duration_ms'], [-250]).lines).toEqual(['0.25 seconds less Duration']);
  });

  it('rounds a 1dp division to one decimal', () => {
    expect(renderBlock(index, ['crit_chance_+%_if_ready'], [125]).lines).toEqual(['12.5% increased Critical Hit Chance']);
    expect(renderBlock(index, ['crit_chance_+%_if_ready'], [10]).lines).toEqual(['1% increased Critical Hit Chance']);
  });

  it('prints deciseconds with exactly two decimals', () => {
    expect(renderBlock(index, ['recovery_duration_deciseconds'], [15]).lines).toEqual(['+1.50 seconds of Recovery']);
  });

  it('rounds a 0dp division to a whole number', () => {
    expect(renderBlock(index, ['duration_per_ten_ms'], [25]).lines).toEqual(['3 seconds']);
  });

  it('fills a bare {} placeholder as the implicit next value', () => {
    expect(renderBlock(index, ['body_armour_+%'], [80]).lines).toEqual([
      '80% increased Armour from Equipped Body Armour',
    ]);
  });

  it('fills successive bare {} placeholders from successive values, in order', () => {
    const out = renderBlock(index, ['minimum_added_cold_damage', 'maximum_added_cold_damage'], [3, 7]);

    expect(out.lines).toEqual(['Adds 3 to 7 Cold Damage']);
  });

  it('renders nothing for a value no variant accepts', () => {
    const out = renderBlock(index, ['maximum_life', 'curse_duration_+%'], [0, 25]);

    expect(out.lines).toEqual(['25% increased Curse Duration']);
    expect(out.unresolved).toEqual([]);
  });

  it('renders nothing for a block whose values are all zero, even under a catch-all line', () => {
    expect(renderBlock(index, ['body_armour_+%'], [0]).lines).toEqual([]);
  });

  it('still renders a multi-stat block when only some of its values are zero', () => {
    expect(renderBlock(index, ['minimum_added_fire_damage', 'maximum_added_fire_damage'], [0, 7]).lines).toEqual([
      'Adds 0 to 7 Fire Damage',
    ]);
  });

  it('picks the line by selectBy while rendering the given values', () => {
    expect(renderBlock(index, ['maximum_life'], [0], { selectBy: [1] }).lines).toEqual(['+0 to maximum Life']);
    expect(renderBlock(index, ['body_armour_+%'], [80], { selectBy: [0] }).lines).toEqual([]);
  });

  it('honours !n conditions as any value but n', () => {
    expect(renderBlock(index, ['local_ruby_jewel_limit'], [2]).lines).toEqual([
      'You can only Socket 2 Ruby Jewels in this item',
    ]);
    expect(renderBlock(index, ['local_ruby_jewel_limit', 'local_emerald_jewel_limit'], [1, 3]).lines).toEqual([
      'You can only Socket 1 Ruby and 3 Emerald Jewels in this item',
    ]);
  });

  it('keeps gem_quality lines for quality bonuses and table_only lines out of tooltips', () => {
    expect(renderBlock(index, ['base_number_of_projectiles'], [1]).lines).toEqual([]);
    expect(renderBlock(index, ['base_number_of_projectiles'], [3]).lines).toEqual(['Fires 3 Projectiles']);
    expect(renderBlock(index, ['base_number_of_projectiles'], [1], { quality: true }).lines).toEqual([
      'Fires +1 Projectiles',
    ]);
  });

  it('falls back to a table_only row for a gem stat table, after the regular lines', () => {
    expect(renderBlock(index, ['base_number_of_projectiles'], [1], { table: true }).lines).toEqual(['Projectiles@1']);
    expect(renderBlock(index, ['base_number_of_projectiles'], [3], { table: true }).lines).toEqual([
      'Fires 3 Projectiles',
    ]);
  });

  it('reads canonical_line as a bare marker, so the handler after it still applies', () => {
    expect(renderBlock(index, ['life_cost_+%'], [-20]).lines).toEqual(['20% less Life cost']);
  });

  it('reports stats that match no block as unresolved, in input order', () => {
    const out = renderBlock(index, ['no_such_stat', 'maximum_life'], [1, 10]);

    expect(out.unresolved).toEqual(['no_such_stat']);
    expect(out.lines).toEqual(['+10 to maximum Life']);
  });
});
