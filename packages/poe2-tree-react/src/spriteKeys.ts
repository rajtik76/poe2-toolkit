/**
 * Maps a core node (kind + allocation + icon path) to the sprite keys used by
 * GGG's official passive-tree atlases. This is PoE2 domain naming, not engine
 * geometry — the core stays atlas-agnostic and only describes *what* a node is;
 * here we name *which* sprite draws it.
 *
 * A {@link RenderResources.manifest} is expected to be keyed by these names.
 * Supplying a different atlas set means swapping this one module.
 */

import type { NodeKind } from '@poe2-toolkit/tree-core';

/**
 * Skill-icon atlas key for a node, or null when the node has no skill icon
 * (e.g. masteries, which are drawn as effect patterns, and ascendancy starts).
 *
 * GGG keys icons as `<variant>:<path>`, where `<path>` is the node's icon path
 * straight from the data (e.g. `Art/2DArt/SkillIcons/passives/Foo.png`).
 */
export function iconKeyFor(kind: NodeKind, icon: string): string | null {
  if (!icon || kind === 'mastery' || kind === 'ascendancyStart') {
    return null;
  }

  const variant = kind === 'keystone' ? 'keystone' : kind === 'notable' || kind === 'ascendancyNotable' ? 'notable' : 'normal';

  // One colour icon per node (the `skills` atlas, Active). The unallocated dim
  // is a render-time tint, not a separate sprite — matching how the game draws
  // it (a multiply over the same icon), so there is no Inactive variant.
  return `${variant}Active:${icon}`;
}

/**
 * Effect-pattern atlas key for a node's `activeEffectImage` (the background
 * pattern behind masteries and notables). GGG keys these `masteryEffectActive:`
 * + path + `.png`. The GGG-sourced value already carries the `.png` extension,
 * so only append it when it is missing (PoB-era values had none).
 */
export function effectKeyFor(patternKey: string): string {
  const withExtension = patternKey.endsWith('.png') ? patternKey : `${patternKey}.png`;

  return `masteryEffectActive:${withExtension}`;
}

/** Orbit-arc connector sprite key for the given orbit and allocation state. */
export function arcConnectorKeyFor(orbit: number, active: boolean): string {
  return `Orbit${orbit}${active ? 'Active' : 'Normal'}`;
}

/** Straight-line connector sprite key for the given allocation state. */
export function lineConnectorKeyFor(active: boolean): string {
  return `LineConnector${active ? 'Active' : 'Normal'}`;
}

/**
 * Overlay-frame atlas key for a node in a given allocation state, or null when
 * the kind has no frame (masteries).
 */
export function frameKeyFor(kind: NodeKind, allocated: boolean): string | null {
  const state = allocated ? 'Allocated' : 'Unallocated';

  switch (kind) {
    case 'keystone':
      return `KeystoneFrame${state}`;
    case 'notable':
      return `NotableFrame${state}`;
    case 'jewel':
      // The square ornate socket (matches the official tree). `JewelSocketAlt*`
      // is the quatrefoil cluster/legion socket — not this.
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
