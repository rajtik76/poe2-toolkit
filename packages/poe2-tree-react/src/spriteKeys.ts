/** Maps a core node to the sprite keys of GGG's passive-tree atlases. Core stays atlas-agnostic; a different atlas set means swapping this module. */

import type { NodeKind } from '@poe2-toolkit/tree-core';

/** Null for nodes without a skill icon (masteries, ascendancy starts). GGG keys icons as `<variant>:<path>`. */
export function iconKeyFor(kind: NodeKind, icon: string): string | null {
  if (!icon || kind === 'mastery' || kind === 'ascendancyStart') {
    return null;
  }

  const variant = kind === 'keystone' ? 'keystone' : kind === 'notable' || kind === 'ascendancyNotable' ? 'notable' : 'normal';

  // One colour icon per node: the unallocated dim is a render-time tint, so there is no Inactive variant.
  return `${variant}Active:${icon}`;
}

/** `masteryEffectActive:` + path + `.png`; the GGG value already has the extension, PoB-era values had none. */
export function effectKeyFor(patternKey: string): string {
  const withExtension = patternKey.endsWith('.png') ? patternKey : `${patternKey}.png`;

  return `masteryEffectActive:${withExtension}`;
}

export function arcConnectorKeyFor(orbit: number, active: boolean): string {
  return `Orbit${orbit}${active ? 'Active' : 'Normal'}`;
}

export function lineConnectorKeyFor(active: boolean): string {
  return `LineConnector${active ? 'Active' : 'Normal'}`;
}

/** Null when the kind has no frame (masteries). */
export function frameKeyFor(kind: NodeKind, allocated: boolean): string | null {
  const state = allocated ? 'Allocated' : 'Unallocated';

  switch (kind) {
    case 'keystone':
      return `KeystoneFrame${state}`;
    case 'notable':
      return `NotableFrame${state}`;
    case 'jewel':
      // The square ornate socket; `JewelSocketAlt*` is the quatrefoil cluster/legion socket, not this.
      return `JewelFrame${state}`;
    case 'ascendancyNotable':
      return `AscendancyFrameNotable${state}`;
    case 'ascendancyNormal':
      return `AscendancyFrameNormal${state}`;
    case 'ascendancyStart':
      return 'AscendancyStartNode';
    case 'mastery':
      return null;
    case 'normal':
    case 'attribute':
    case 'classStart':
    default:
      // The small-node frame uses its own naming (no Allocated/Unallocated).
      return allocated ? 'PSSkillFrameActive' : 'PSSkillFrame';
  }
}
