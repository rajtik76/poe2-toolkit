/**
 * The skill atlas keys every icon by the frame variant it is drawn in. An
 * override node sits off the tree with no kind flags of its own, yet the renderer
 * draws it in a base node's place, framed as that node - so its icon must be packed
 * in the base node's variant, or a swapped notable renders as an empty frame.
 */

import { describe, expect, it } from 'vitest';

import { wantedSkillIcons } from '../../src/buildGraphics';
import type { TreeExport } from '../../src/buildTree';

function tree(): TreeExport {
  return {
    nodes: {
      1: { skill: 1, name: 'Price of Power', icon: 'Art/PriceOfPower.dds', isNotable: true },
      2: { skill: 2, name: 'Curse Area', icon: 'Art/LichNode.dds' },
      3: { skill: 3, name: 'Raw Power', icon: 'Art/RawPower.dds', isNotable: true },
      901: { skill: 901, name: 'Steward of Kulemak', icon: 'Art/Steward.dds' },
      902: { skill: 902, name: 'Curse Area', icon: 'Art/AbyssalNode.dds' },
      903: { skill: 903, name: 'Raw Destruction', icon: 'Art/RawDestruction.dds' },
    },
    skillOverrides: {},
    classes: [
      {
        name: 'Witch',
        base_str: 7,
        base_dex: 7,
        base_int: 15,
        overridePairs: { 3: 903 },
        ascendancies: [
          { id: 'Witch3', name: 'Lich', offsetX: 0, offsetY: 0 },
          { id: 'Witch3b', name: 'Abyssal Lich', offsetX: 0, offsetY: 0, replaces: 'Witch3', overridePairs: { 1: 901, 2: 902 } },
        ],
      },
    ],
  } as unknown as TreeExport;
}

describe('wantedSkillIcons', () => {
  it('packs an override icon in the variant of the node it replaces', () => {
    const keys = wantedSkillIcons(tree()).map(({ variant, icon }) => `${variant}:${icon}`);

    expect(keys).toEqual(expect.arrayContaining([
      'notable:Art/Steward.dds',
      'normal:Art/AbyssalNode.dds',
      'notable:Art/RawDestruction.dds',
    ]));
  });

  it('does not pack an override target under its own (normal) variant', () => {
    const keys = wantedSkillIcons(tree()).map(({ variant, icon }) => `${variant}:${icon}`);

    expect(keys).not.toContain('normal:Art/Steward.dds');
    expect(keys).not.toContain('normal:Art/RawDestruction.dds');
  });

  it('skips ascendancy start icons, which the renderer never asks for', () => {
    const data = tree();
    data.nodes[4] = { skill: 4, name: 'Lich', icon: 'Art/LichStart.dds', isAscendancyStart: true } as TreeExport['nodes'][number];

    expect(wantedSkillIcons(data).map(({ icon }) => icon)).not.toContain('Art/LichStart.dds');
  });

  it('tolerates an older export without override pairs', () => {
    const data = tree();
    delete (data.classes[0] as { overridePairs?: unknown }).overridePairs;

    expect(() => wantedSkillIcons(data)).not.toThrow();
  });
});
