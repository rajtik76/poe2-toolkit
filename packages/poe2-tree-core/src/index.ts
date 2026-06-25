/**
 * `@poe2-toolkit/tree-core` — headless geometry engine for the Path of Exile 2 passive
 * tree. Pure TypeScript, zero runtime dependencies, no DOM, no canvas.
 *
 * This entry point is **source-agnostic**: it works against the {@link TreeData}
 * contract and knows nothing about where the data came from. The pipeline is
 * `TreeData` → `buildScene` → `project` / `nodeAt`, plus the helpers a UI needs
 * (interactive allocation, hit-testing, view framing).
 *
 * Producing `TreeData` is a separate, swappable adapter. The one for GGG's
 * official export lives in the `@poe2-toolkit/tree-core/ggg` subpath, so the engine
 * itself carries no dependency on any particular source shape.
 */

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

// Data-source adapters live in their own subpaths (e.g. `@poe2-toolkit/tree-core/ggg`)
// so this entry point stays source-agnostic — see ./ggg/normalize.ts.
