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
].join('\n');

const index = buildStatIndex(SAMPLE);

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
    expect(renderBlock(index, ['attack_speed_+%_per_minute'], [240]).lines).toEqual(['2 Attacks per Second']);
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

  it('reports stats that match no block as unresolved, in input order', () => {
    const out = renderBlock(index, ['no_such_stat', 'maximum_life'], [1, 10]);

    expect(out.unresolved).toEqual(['no_such_stat']);
    expect(out.lines).toEqual(['+10 to maximum Life']);
  });
});
