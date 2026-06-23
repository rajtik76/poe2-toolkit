/**
 * Pure-geometry regressions for the passive-tree connection arcs and the
 * granted-skill / passive-point descriptions. These guard four bugs that must
 * never recur:
 *  - arc rotation: the centre was offset along the negated perpendicular,
 *    mirroring every arc to the wrong side;
 *  - missing arcs: cross-group edges were skipped and drawn as straight lines;
 *  - granted descriptions: nodes that grant a skill / passive point showed no text.
 * No GGPK data needed — everything runs on synthetic inputs.
 */

import { describe, expect, it } from 'vitest';

import { arcCentre, edgeArcCentre, grantedStats } from '../../src/buildTree';
import type { Psg, PsgNode } from '../../src/psg';

const LINE_SENTINEL = 2147483647;

describe('arcCentre — GGG/PoB BuildConnector handedness', () => {
  it('bows to the -perp side for sign +1 and mirrors for -1', () => {
    // a -> b along +x; the centre sits below (-y) for +1, above (+y) for -1.
    expect(arcCentre({ x: 0, y: 0 }, { x: 100, y: 0 }, 100, 1)).toEqual({ x: 50, y: -86.60254037844386 });
    expect(arcCentre({ x: 0, y: 0 }, { x: 100, y: 0 }, 100, -1)).toEqual({ x: 50, y: 86.60254037844386 });
  });

  it('reproduces the Druid/Oracle 35426-6015 centre (was mirrored)', () => {
    const owner6015 = { x: -3085.779, y: 236.709 };
    const target35426 = { x: -3688.605, y: 0.535 };
    const centre = arcCentre(owner6015, target35426, 839, 1);

    expect(centre).not.toBeNull();
    expect(centre!.x).toBeCloseTo(-3669.544, 1);
    expect(centre!.y).toBeCloseTo(839.318, 1);
  });

  it('returns null when the points are further apart than the diameter', () => {
    expect(arcCentre({ x: 0, y: 0 }, { x: 300, y: 0 }, 100, 1)).toBeNull();
  });
});

function node(partial: Partial<PsgNode> & { skillId: number; group: number }): PsgNode {
  return { orbit: 0, orbitIndex: 0, connections: [], ...partial };
}

function psgWith(nodes: PsgNode[], groups: Array<{ x: number; y: number }>): Psg {
  return {
    version: 3,
    graphType: 0,
    passivesPerOrbit: [1, 12, 24, 24, 72, 72, 72, 24, 72, 144],
    roots: [],
    groups: groups.map((g) => ({ x: g.x, y: g.y, isProxy: false, flag: 0, unknown1: 0, nodes: [] })),
    nodes,
  };
}

describe('edgeArcCentre — when an edge is an arc vs a line', () => {
  it('arcs a cross-group connector (orbit != 0) instead of dropping it to a line', () => {
    const a = node({ skillId: 1, group: 0, orbit: 4, orbitIndex: 0 });
    const b = node({ skillId: 2, group: 1, orbit: 2, orbitIndex: 0 });
    const psg = psgWith([a, b], [{ x: 0, y: 0 }, { x: 500, y: 0 }]);

    const centre = edgeArcCentre(psg, a, b, 6);

    expect(centre).not.toBeNull(); // regression: cross-group used to be skipped
  });

  it('centres a same-group same-orbit ring arc (orbit 0) on the group', () => {
    const a = node({ skillId: 1, group: 0, orbit: 2, orbitIndex: 0 });
    const b = node({ skillId: 2, group: 0, orbit: 2, orbitIndex: 3 });
    const psg = psgWith([a, b], [{ x: 7, y: 9 }]);

    expect(edgeArcCentre(psg, a, b, 0)).toEqual({ x: 7, y: 9 });
  });

  it('draws a straight line (null) for an orbit-0 cross-group spoke', () => {
    const a = node({ skillId: 1, group: 0, orbit: 2, orbitIndex: 0 });
    const b = node({ skillId: 2, group: 1, orbit: 2, orbitIndex: 0 });
    const psg = psgWith([a, b], [{ x: 0, y: 0 }, { x: 500, y: 0 }]);

    expect(edgeArcCentre(psg, a, b, 0)).toBeNull();
  });

  it('draws a straight line (null) for the sentinel orbit', () => {
    const a = node({ skillId: 1, group: 0, orbit: 2, orbitIndex: 0 });
    const b = node({ skillId: 2, group: 0, orbit: 2, orbitIndex: 3 });
    const psg = psgWith([a, b], [{ x: 0, y: 0 }]);

    expect(edgeArcCentre(psg, a, b, LINE_SENTINEL)).toBeNull();
  });
});

describe('grantedStats — descriptions for granted-skill / passive-point nodes', () => {
  const skillGems = [{ BaseItemType: 0 }, { BaseItemType: 5 }];
  const baseItemTypes = [{ Name: 'Unused' }, {}, {}, {}, {}, { Name: 'Moment of Vulnerability' }];

  it('resolves a granted skill name via SkillGems -> BaseItemTypes', () => {
    expect(grantedStats({ GrantedSkill: 1 }, skillGems, baseItemTypes)).toEqual(['Grants Skill: Moment of Vulnerability']);
  });

  it('describes granted passive points', () => {
    expect(grantedStats({ SkillPointsGranted: 1 }, skillGems, baseItemTypes)).toEqual(['Grants 1 Passive Skill Point']);
  });

  it('returns nothing when the node grants neither', () => {
    expect(grantedStats({}, skillGems, baseItemTypes)).toEqual([]);
  });
});
