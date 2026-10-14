/** `@poe2-toolkit/tree-core`: headless geometry engine for the PoE2 passive tree. No DOM, no canvas, source-agnostic (adapters live in subpaths such as `/ggg`). */

export type {
  TreeData,
  TreeConstants,
  Group,
  TreeNode,
  NodeOption,
  AttributeChoice,
  JewelInfo,
  NodeConnection,
  Size,
  ClassDef,
  CentreArt,
  AscendancyDef,
  SpriteFrame,
  SpriteManifest,
  Point,
  WorldRect,
  Scene,
  PlacedNode,
  NodeKind,
  PlacedConnection,
  PlacedEffect,
  CentreLayout,
  ClassAnchor,
  BuildAllocation,
  WeaponSet,
  AllocMode,
  SceneOptions,
  Viewport,
  ScreenScene,
  ScreenNode,
  ScreenConnection,
  ScreenEffect,
} from './types.js';

export { nodePosition } from './geometry/orbit.js';

export { computeCentreLayout } from './geometry/centre.js';

export { project, projectPoint, screenToWorld, nodeAt } from './geometry/project.js';

export { allocatedBounds, allocatedBoundsWithCentre, classBounds } from './geometry/framing.js';

export { buildScene, chosenAttributeOption, classOverrideNode } from './scene/buildScene.js';
export { ascendancyNodeOwner, findAscendancy } from './scene/ascendancy.js';
export {
  ascendancyStartNode,
  buildAscendancyGraph,
  buildTreeGraph,
  clearAscendancyAllocation,
  freshAllocation,
  pathToNode,
  reachable,
  removalSet,
  toggleAllocation,
  toggleAllocationInMode,
  toggleAscendancyAllocation,
  weaponSetRemovalSet,
} from './scene/allocate.js';
export type { TreeGraph, WeaponSetAllocation } from './scene/allocate.js';
export { placeConnection } from './scene/connections.js';
export { classifyNode, nodeTargetSize } from './scene/nodeSize.js';
export type { NodeSize } from './scene/nodeSize.js';

// Source adapters live in subpaths (e.g. `@poe2-toolkit/tree-core/ggg`) to keep this entry point source-agnostic.
