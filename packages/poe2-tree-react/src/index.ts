/**
 * `@poe2-toolkit/tree-react` — React renderer for the Path of Exile 2 passive tree.
 *
 * A thin view adapter over `@poe2-toolkit/tree-core`: it draws what the core computed
 * and owns pan/zoom/hover/click. It performs no geometry — if this package ever
 * computes a coordinate or a size, that is a bug that belongs in core.
 */

export { TreeView } from './TreeView.js';
export type { TreeViewProps, TreeViewControls, AllocationPreview, CentreSprite, ZoomLimits, HighlightStyle } from './TreeView.js';
export type { RenderResources } from './resources.js';
export { iconKeyFor, frameKeyFor, effectKeyFor, arcConnectorKeyFor, lineConnectorKeyFor } from './spriteKeys.js';
