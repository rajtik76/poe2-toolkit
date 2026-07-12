/**
 * Behavioural coverage for the pure visual decisions extracted from the
 * renderer: node visuals, rail layering, overlay strokes, pulse math and the
 * ascendancy relocation offset. These pin what the canvas draws without pixi.
 */

import type { Scene } from '@poe2-toolkit/tree-core';
import { describe, expect, it } from 'vitest';

import {
  ascendancyOffset,
  DEFAULT_HIGHLIGHT,
  DEFAULT_TREE_COLORS,
  highlightPulse,
  nodeVisual,
  outlineBase,
  previewStroke,
  railPasses,
  resolveHighlightStyle,
  resolveTreeColors,
} from '../src/sceneStyle';
import type { AllocationPreview } from '../src/types';

type SceneNode = Scene['nodes'][number];
type SceneConnection = Scene['connections'][number];

function node(overrides: Partial<SceneNode>): SceneNode {
  return {
    skill: 1,
    x: 0,
    y: 0,
    kind: 'normal',
    icon: 'Art/passives/foo.png',
    iconSize: 40,
    frameSize: 50,
    radius: 25,
    allocated: false,
    ...overrides,
  } as SceneNode;
}

function conn(overrides: Partial<SceneConnection>): SceneConnection {
  return {
    from: 1,
    to: 2,
    kind: 'line',
    a: { x: 0, y: 0 },
    b: { x: 10, y: 0 },
    active: false,
    ...overrides,
  } as SceneConnection;
}

describe('nodeVisual', () => {
  it('returns null for masteries — they draw as their effect pattern', () => {
    expect(nodeVisual(node({ kind: 'mastery' }))).toBeNull();
  });

  it('dims an unallocated icon and leaves an allocated one untinted', () => {
    expect(nodeVisual(node({ allocated: false }))!.icon).toEqual({ key: 'normalActive:Art/passives/foo.png', tint: 0x808080 });
    expect(nodeVisual(node({ allocated: true }))!.icon).toEqual({ key: 'normalActive:Art/passives/foo.png', tint: null });
  });

  it('tints an allocated weapon-set frame but never a basic or unallocated one', () => {
    expect(nodeVisual(node({ allocated: true, weaponSet: 1 }))!.frame!.tint).toBe(0xe05252);
    expect(nodeVisual(node({ allocated: true, weaponSet: 2 }))!.frame!.tint).toBe(0x4fbf7a);
    expect(nodeVisual(node({ allocated: true }))!.frame!.tint).toBeNull();
    expect(nodeVisual(node({ allocated: false, weaponSet: 1 }))!.frame!.tint).toBeNull();
  });

  it('tints a weapon-set frame with the caller\'s palette', () => {
    const colors = resolveTreeColors({ weaponSet1: 0x111111 });

    expect(nodeVisual(node({ allocated: true, weaponSet: 1 }), colors)!.frame!.tint).toBe(0x111111);
  });

  it('describes the vector fall-back disc by kind and allocation', () => {
    const allocated = nodeVisual(node({ kind: 'keystone', allocated: true }))!;
    const unallocated = nodeVisual(node({ kind: 'keystone', radius: 0.5 }))!;

    expect(allocated.fallback).toEqual({ radius: 25, color: 0xd9b86a, alpha: 1 });
    expect(unallocated.fallback).toEqual({ radius: 1.2, color: 0xd9b86a, alpha: 0.4 }); // radius floored
  });

  it('sizes a jewel adornment from the frame and colours the gem by rarity', () => {
    const jewel = nodeVisual(node({ kind: 'jewel', jewel: { icon: 'https://x/gem.png', rarity: 'UNIQUE' } as NonNullable<SceneNode['jewel']> }))!.jewel!;

    expect(jewel).toEqual({ iconUrl: 'https://x/gem.png', spriteSize: 31, gemRadius: 10, gemColor: 0xcf7a3a });
  });

  it('falls back to a plain gem for a jewel with no icon or unknown rarity', () => {
    const jewel = nodeVisual(node({ kind: 'jewel', frameSize: 0, iconSize: 40, jewel: {} as NonNullable<SceneNode['jewel']> }))!.jewel!;

    expect(jewel.iconUrl).toBeNull();
    expect(jewel.spriteSize).toBeCloseTo(24.8); // falls back to iconSize
    expect(jewel.gemColor).toBe(0xd6d6d6);
  });
});

describe('railPasses', () => {
  const inactive = conn({ from: 1, to: 2 });
  const activeBasic = conn({ from: 2, to: 3, active: true });
  const activeSet2 = conn({ from: 3, to: 4, active: true, weaponSet: 2 });
  const ascendancyConn = conn({ from: 5, to: 6, ascendancy: 'Titan' });

  it('layers inactive rails under active ones, gold under weapon sets', () => {
    const passes = railPasses([inactive, activeBasic, activeSet2], false);

    expect(passes.map((pass) => pass.color)).toEqual([
      0x7d6836, // bronze outer rail
      0x000000, // its gap
      0xfcde86, 0xfcde86, // basic gold outer + gap
      0x4fbf7a, 0x4fbf7a, // set II over it
    ]);
    expect(passes[0]!.width).toBeGreaterThan(passes[1]!.width);
    expect(passes[0]!.connections).toEqual([inactive]);
    expect(passes[2]!.connections).toEqual([activeBasic]);
    expect(passes[4]!.connections).toEqual([activeSet2]);
  });

  it('excludes ascendancy edges from the main map', () => {
    const passes = railPasses([inactive, ascendancyConn], false);

    expect(passes).toHaveLength(2);
    expect(passes[0]!.connections).toEqual([inactive]);
  });

  it('paints a relocated disc\'s inactive rails black, with no gap pass', () => {
    const passes = railPasses([ascendancyConn], true);

    expect(passes).toHaveLength(1);
    expect(passes[0]!.color).toBe(0x000000);
  });

  it('returns nothing for no connections', () => {
    expect(railPasses([], false)).toEqual([]);
  });

  it('paints active set rails with the caller\'s palette', () => {
    const colors = resolveTreeColors({ weaponSet2: 0x222222 });
    const passes = railPasses([activeSet2], false, colors);

    expect(passes.map((pass) => pass.color)).toEqual([0x222222, 0x222222]);
  });
});

describe('previewStroke', () => {
  const preview = (kind: 'add' | 'remove', weaponSet?: 1 | 2): AllocationPreview =>
    ({ kind, nodes: new Set(), edges: new Set(), weaponSet }) as AllocationPreview;

  it('paints an add preview gold, or in the weapon set\'s colour', () => {
    expect(previewStroke(preview('add'), 1).color).toBe(0xffe296);
    expect(previewStroke(preview('add', 1), 1).color).toBe(0xe05252);
  });

  it('paints a removal magenta at the full rail width regardless of zoom', () => {
    const stroke = previewStroke(preview('remove'), 0.1);

    expect(stroke).toMatchObject({ remove: true, color: 0xff4fa8, glowWidth: 4.8 + 3.6 * 3, coreWidth: 4.8 + 3.6 * 2 });
  });

  it('paints with the caller\'s palette when supplied', () => {
    const colors = resolveTreeColors({ weaponSet1: 0x111111, removePreview: 0x333333 });

    expect(previewStroke(preview('add', 1), 1, colors).color).toBe(0x111111);
    expect(previewStroke(preview('remove'), 1, colors).color).toBe(0x333333);
  });

  it('clamps the add guide to an on-screen minimum when zoomed in', () => {
    // Zoomed in (scale 2): the world-unit floor wins over the px-derived width.
    expect(previewStroke(preview('add'), 2)).toMatchObject({ glowWidth: 9, coreWidth: 4 });
    // Zoomed out (scale 0.1): widths track the zoom to stay readable.
    expect(previewStroke(preview('add'), 0.1)).toMatchObject({ glowWidth: 30, coreWidth: 15 });
  });
});

describe('resolveTreeColors', () => {
  it('resolves a partial palette against the in-game-colour defaults', () => {
    const resolved = resolveTreeColors({ removePreview: 0x123456 });

    expect(resolved.removePreview).toBe(0x123456);
    expect(resolved.weaponSet).toEqual(DEFAULT_TREE_COLORS.weaponSet);
    expect(resolveTreeColors(undefined)).toEqual(DEFAULT_TREE_COLORS);
  });

  it('defaults to the in-game weapon-set colours: set I red, set II green', () => {
    expect(DEFAULT_TREE_COLORS.weaponSet[1]).toBe(0xe05252);
    expect(DEFAULT_TREE_COLORS.weaponSet[2]).toBe(0x4fbf7a);
  });
});

describe('highlight style and pulse', () => {
  it('resolves a partial style against the teal defaults', () => {
    const resolved = resolveHighlightStyle({ glowColor: 0x123456, pulseMs: 0 });

    expect(resolved.glowColor).toBe(0x123456);
    expect(resolved.pulseMs).toBe(0);
    expect(resolved.coreColor).toBe(DEFAULT_HIGHLIGHT.coreColor);
    expect(resolveHighlightStyle(undefined)).toEqual(DEFAULT_HIGHLIGHT);
  });

  it('freezes at the peak when pulseMs is 0', () => {
    const pulse = highlightPulse({ ...DEFAULT_HIGHLIGHT, pulseMs: 0 }, 12345);

    expect(pulse.glowAlpha).toBe(DEFAULT_HIGHLIGHT.glowAlpha[1]);
    expect(pulse.coreAlpha).toBe(DEFAULT_HIGHLIGHT.coreAlpha[1]);
    expect(pulse.grow).toBe(DEFAULT_HIGHLIGHT.pulseGrow);
  });

  it('sweeps alphas across their ranges over a period', () => {
    const style = { ...DEFAULT_HIGHLIGHT, pulseMs: 100 };
    // sin(t/100) peaks at t = 100 * pi/2 and troughs at t = 100 * 3pi/2.
    const peak = highlightPulse(style, 100 * (Math.PI / 2));
    const trough = highlightPulse(style, 100 * (3 * Math.PI / 2));

    expect(peak.glowAlpha).toBeCloseTo(DEFAULT_HIGHLIGHT.glowAlpha[1]);
    expect(trough.glowAlpha).toBeCloseTo(DEFAULT_HIGHLIGHT.glowAlpha[0]);
    expect(trough.grow).toBeCloseTo(0);
  });
});

describe('ascendancyOffset', () => {
  const scene = {
    centre: {
      centre: { x: 100, y: 200 },
      ascendancies: [{ id: 'Titan', worldAnchor: { x: 5000, y: 7000 } }],
    },
  } as unknown as Scene;

  it('relocates the active disc onto the hub', () => {
    expect(ascendancyOffset(scene, 'Titan')).toEqual({ x: 100 - 5000, y: 200 - 7000 });
  });

  it('returns null with no active disc or an unknown id', () => {
    expect(ascendancyOffset(scene, undefined)).toBeNull();
    expect(ascendancyOffset(scene, 'Nope')).toBeNull();
  });
});

describe('outlineBase', () => {
  it('uses half the frame, falling back to half the icon for frameless nodes', () => {
    expect(outlineBase(node({ frameSize: 50 }))).toBe(25);
    expect(outlineBase(node({ frameSize: 0, iconSize: 40 }))).toBe(20);
  });
});
