import { describe, expect, it } from 'vitest';
import { normalizeGggTree } from '../src/ggg/normalize.js';
import type { GggTreeJson } from '../src/ggg/normalize.js';
import { buildScene, computeCentreLayout, project } from '../src/index.js';

const DEG = Math.PI / 180;

/**
 * A miniature GGG export with real-world values: the Ranger start node sits where
 * the live 0_5 data puts it (1308.1, -3294.7), so the derived ring rotation must
 * come out to the verified 21.7°. Exercises baked positions, merged in/out edges,
 * the global attribute overrides, ascendancy-id translation and a class with no
 * start node.
 */
function fixture(): GggTreeJson {
  return {
    groups: {
      '1': { x: 1308.1, y: -3294.7, orbits: [0], nodes: [50459] }, // Ranger start
      '3': { x: 0, y: 0, orbits: [0, 1], nodes: [200, 240, 777, 16] },
    },
    nodes: {
      '50459': {
        skill: 50459,
        group: 1,
        orbit: 0,
        orbitIndex: 0,
        x: 1308.1,
        y: -3294.7,
        out: [200],
        name: 'RANGER',
        icon: 'Art/start.png',
        stats: [],
        classStartIndex: [0],
      },
      '200': {
        skill: 200,
        group: 3,
        orbit: 1,
        orbitIndex: 0,
        x: 0,
        y: -162,
        in: [50459],
        name: 'Some Notable',
        icon: 'Art/notable.png',
        stats: ['+10 to something', '10% increased [Critical|Critical Hit Chance]'],
        isNotable: true,
      },
      '777': {
        skill: 777,
        group: 3,
        orbit: 1,
        orbitIndex: 9,
        x: 162,
        y: 0,
        name: 'Attribute',
        icon: 'Art/attr.png',
        stats: ['+5 to any Attribute'],
        isGenericAttribute: true,
      },
      '240': {
        skill: 240,
        group: 3,
        orbit: 0,
        orbitIndex: 0,
        x: 0,
        y: 0,
        name: 'Lightning Mastery',
        icon: 'Art/mastery.png',
        stats: [],
        isMastery: true,
        activeEffectImage: 'Art/MasteryLightningPattern',
      },
      '16': {
        skill: 16,
        group: 3,
        orbit: 1,
        orbitIndex: 6,
        x: 15451.7,
        y: 1623.2,
        name: 'Pathfinder',
        icon: 'Art/ascend.png',
        stats: [],
        ascendancyId: 'Ranger3',
        isAscendancyStart: true,
      },
    },
    classes: [
      {
        name: 'Ranger',
        base_str: 7,
        base_dex: 15,
        base_int: 7,
        image: 'Art/2DArt/BaseClassIllustrations/RangerBaseIllustration.png',
        ascendancies: [
          { id: 'Ranger1', name: 'Deadeye' }, // no nodes in this fixture -> dropped
          { id: 'Ranger3', name: 'Pathfinder', offsetX: 100, offsetY: 200 },
        ],
      },
      {
        name: 'Sorceress',
        base_str: 7,
        base_dex: 7,
        base_int: 15,
        image: 'Art/2DArt/BaseClassIllustrations/SorceressBaseIllustration.png',
        ascendancies: [],
      },
    ],
    skillOverrides: {
      '26297': { id: 'generic_attribute_strength', skill: 26297, name: 'Strength', icon: 'Art/plusstrength.png', stats: ['+5 to [Strength]'] },
      '14927': { id: 'generic_attribute_dexterity', skill: 14927, name: 'Dexterity', icon: 'Art/plusdexterity.png', stats: ['+5 to [Dexterity]'] },
      '57022': { id: 'generic_attribute_intelligence', skill: 57022, name: 'Intelligence', icon: 'Art/plusintelligence.png', stats: ['+5 to [Intelligence]'] },
    },
    jewelSlots: [200],
    min_x: -100,
    min_y: -200,
    max_x: 300,
    max_y: 400,
  };
}

describe('normalizeGggTree', () => {
  const data = normalizeGggTree(fixture(), '0_5');

  it('carries the supplied version and bounds', () => {
    expect(data.version).toBe('0_5');
    expect(data.bounds).toEqual({ minX: -100, minY: -200, maxX: 300, maxY: 400 });
  });

  it('keys groups by their id directly (no 1-based offset)', () => {
    expect(Object.keys(data.groups).sort()).toEqual(['1', '3']);
    expect(data.groups[1]).toEqual({ x: 1308.1, y: -3294.7, orbits: [0], nodes: [50459] });
  });

  it('reads baked node positions', () => {
    expect({ x: data.nodes[50459]!.x, y: data.nodes[50459]!.y }).toEqual({ x: 1308.1, y: -3294.7 });
    expect({ x: data.nodes[200]!.x, y: data.nodes[200]!.y }).toEqual({ x: 0, y: -162 });
  });

  it('merges in + out into a single connection list', () => {
    expect(data.nodes[50459]?.connections).toEqual([{ id: 200 }]);
    expect(data.nodes[200]?.connections).toEqual([{ id: 50459 }]);
  });

  it('keeps isMastery and the effect image; absent flags stay absent', () => {
    expect(data.nodes[240]?.isMastery).toBe(true);
    expect(data.nodes[240]?.activeEffectImage).toBe('Art/MasteryLightningPattern');
    expect(data.nodes[200]?.isMastery).toBeUndefined();
    expect(data.nodes[200]?.isNotable).toBe(true);
  });

  it('fills generic-attribute nodes with the three global choices', () => {
    expect(data.nodes[777]?.isAttribute).toBe(true);
    expect(data.nodes[777]?.options).toEqual([
      { id: 26297, name: 'Strength', stats: ['+5 to Strength'], icon: 'Art/plusstrength.png' },
      { id: 14927, name: 'Dexterity', stats: ['+5 to Dexterity'], icon: 'Art/plusdexterity.png' },
      { id: 57022, name: 'Intelligence', stats: ['+5 to Intelligence'], icon: 'Art/plusintelligence.png' },
    ]);
    expect(data.nodes[200]?.options).toBeUndefined();
  });

  it('strips GGG reference tags from stat lines, keeping the display text', () => {
    // `[ref|display]` -> display (the correct singular/plural label).
    expect(data.nodes[200]?.stats).toEqual(['+10 to something', '10% increased Critical Hit Chance']);
    // `[ref]` with no display falls back to the ref itself.
    expect(data.nodes[777]?.options?.[0]?.stats).toEqual(['+5 to Strength']);
  });

  it('translates ascendancyId to its display name', () => {
    expect(data.nodes[16]?.ascendancyName).toBe('Pathfinder');
  });

  it('supplies the centre inner radius and drops orbit constants', () => {
    expect(data.constants.centreInnerRadius).toBe(130);
    expect((data.constants as { orbitRadii?: unknown }).orbitRadii).toBeUndefined();
  });

  it('resolves each class start node, id-by-index and central art layers', () => {
    const ranger = data.classes.find((c) => c.name === 'Ranger');
    expect(ranger?.id).toBe(0);
    expect(ranger?.startNode).toBe(50459);
    expect(ranger?.centre.art).toEqual({ width: 1500, height: 1500 });
    expect(ranger?.centre.active).toEqual({ width: 2000, height: 2000 });
  });

  it('drops ascendancies with no nodes and anchors the rest at startNode + offset', () => {
    const ascendancies = data.classes[0]?.ascendancies;
    // Deadeye (Ranger1) has no nodes in this fixture -> dropped; Pathfinder kept.
    expect(ascendancies?.map((a) => a.id)).toEqual(['Pathfinder']);
    const pathfinder = ascendancies?.[0];
    expect(pathfinder?.internalId).toBe('Ranger3');
    // worldAnchor = start node (15451.7, 1623.2) + offset (100, 200)
    expect(pathfinder?.worldAnchor.x).toBeCloseTo(15551.7, 5);
    expect(pathfinder?.worldAnchor.y).toBeCloseTo(1823.2, 5);
    expect(pathfinder?.size).toEqual({ width: 1500, height: 1500 });
  });
});

describe('computeCentreLayout', () => {
  const data = normalizeGggTree(fixture(), '0_5');
  const layout = computeCentreLayout(data);

  it('places the hub at the origin with the inner radius and ring sizes', () => {
    expect(layout.centre).toEqual({ x: 0, y: 0 });
    expect(layout.innerRadius).toBe(130);
    // world radius = native layer width (each layer drawn at 2*width centred)
    expect(layout.ring.frameRadius).toBe(2000);
    expect(layout.ring.activeRadius).toBe(2000);
    expect(layout.ring.artRadius).toBe(1500);
  });

  it('derives the Ranger ring rotation as the verified 21.7°', () => {
    const ranger = layout.classes.find((c) => c.name === 'Ranger');
    expect(ranger).toBeDefined();
    expect((ranger!.ringRotation / DEG) % 360).toBeCloseTo(21.7, 1);
  });

  it('skips classes without a start node', () => {
    expect(layout.classes.map((c) => c.name)).toEqual(['Ranger']);
  });

  it('exposes ascendancy discs as relocatable blocks', () => {
    expect(layout.ascendancies.map((a) => a.id)).toContain('Pathfinder');
  });
});

describe('ascendancy nodes', () => {
  const data = normalizeGggTree(fixture(), '0_5');

  it('tags ascendancy nodes and keeps them off the main screen projection', () => {
    const scene = buildScene(data);
    expect(scene.nodes.find((n) => n.skill === 16)?.ascendancy).toBe('Pathfinder');

    // A huge viewport would otherwise include everything; ascendancy nodes are
    // still excluded (the renderer relocates them into the hub).
    const screen = project(scene, { tx: 0, ty: 0, scale: 1 }, { width: 1e6, height: 1e6 });
    expect(screen.nodes.some((n) => n.skill === 16)).toBe(false);
  });
});
