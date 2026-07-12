/**
 * Prop-level types shared between the React component (`TreeView.tsx`) and the
 * pure style/interaction modules. Type-only: keeping them here lets the pure
 * modules stay free of React and PixiJS imports.
 */

/** Tunable zoom and pan extents (all optional; see defaults on each field). */
export interface ZoomLimits {
  /** Hard zoom-in cap as a world scale. Default 4. */
  maxScale?: number;
  /**
   * Zoom-out floor as a multiple of the fit-the-whole-tree scale. 1 means you
   * cannot zoom out past seeing the whole tree; below 1 leaves empty margin
   * around it. Default 0.85.
   */
  minFitFactor?: number;
  /**
   * How far past the tree's edges you may pan, as a fraction of the viewport.
   * Smaller keeps the tree tighter in frame. Default 0.5.
   */
  overscroll?: number;
}

/**
 * Tunable allocation palette (all optional; see defaults on each field). The
 * defaults mirror the in-game weapon-set colours: set I red, set II green. The
 * removal preview defaults to magenta so it reads apart from both sets and from
 * the gold basic tree.
 */
export interface TreeColors {
  /** Weapon set I tint (node frames, active rails, add preview). Default `0xe05252` (red). */
  weaponSet1?: number;
  /** Weapon set II tint (node frames, active rails, add preview). Default `0x4fbf7a` (green). */
  weaponSet2?: number;
  /** Removal-preview stroke colour (cut rails and removed-node rings). Default `0xff4fa8` (magenta). */
  removePreview?: number;
}

/** {@link TreeColors} with every field resolved to a concrete value. */
export interface ResolvedTreeColors {
  weaponSet: Record<1 | 2, number>;
  removePreview: number;
}

/**
 * Tunable look of the search-highlight rings (all optional; see defaults on
 * each field). Two concentric strokes are drawn per matched node: a soft wide
 * `glow` and a bright thin `core`, both pulsing in alpha and radius.
 */
export interface HighlightStyle {
  /** Soft outer ring colour. Default `0x3fae9f` (teal). */
  glowColor?: number;
  /** Bright inner ring colour. Default `0x7df9e0` (light teal). */
  coreColor?: number;
  /** Outer ring stroke width, on-screen px. Default 8. */
  glowWidth?: number;
  /** Inner ring stroke width, on-screen px. Default 3. */
  coreWidth?: number;
  /** Gap between the node's frame and the ring, on-screen px. Default 6. */
  radius?: number;
  /**
   * Pulse period divisor in ms (larger = slower). Default 320. Set to 0 for a
   * still ring (no per-frame redraw — the ring is drawn once and left).
   */
  pulseMs?: number;
  /** Extra radius added at the pulse peak, on-screen px. Default 5. */
  pulseGrow?: number;
  /** Outer ring alpha range `[trough, peak]` over the pulse. Default `[0.2, 0.65]`. */
  glowAlpha?: [number, number];
  /** Inner ring alpha range `[trough, peak]` over the pulse. Default `[0.55, 1]`. */
  coreAlpha?: [number, number];
}

/** {@link HighlightStyle} with every field resolved to a concrete value. */
export interface ResolvedHighlightStyle {
  glowColor: number;
  coreColor: number;
  glowWidth: number;
  coreWidth: number;
  radius: number;
  pulseMs: number;
  pulseGrow: number;
  glowAlpha: [number, number];
  coreAlpha: [number, number];
}

/** Hover preview of a pending allocate/remove: node ids + edge keys to glow. */
export interface AllocationPreview {
  /**
   * Whether the pending click would allocate (`add`) or deallocate (`remove`).
   * Drives the colour: `add` uses gold (or the weapon set's tint), `remove` the
   * removal colour ({@link TreeColors.removePreview}).
   */
  kind: 'add' | 'remove';
  /**
   * Skill ids the click would touch. For a `remove`, each is also ringed so a
   * lone tip with no edge between two removed nodes still shows in the preview.
   */
  nodes: Set<number>;
  /** Edge keys as `min-max` of the two node ids. */
  edges: Set<string>;
  /**
   * Weapon set an `add` preview would allocate into (1 or 2); absent means basic.
   * Tints the planned path in the set's colour so it matches the paint mode.
   */
  weaponSet?: 1 | 2;
}

/**
 * A group of edges to paint in one colour over the base render. The renderer is
 * agnostic about what the group means and only strokes the matching connectors.
 */
export interface EdgeOverlay {
  /** Edge keys (`min-max` of the two node ids) to paint. */
  edges: Set<string>;
  /** Stroke colour, `0xRRGGBB`. */
  color: number;
  /**
   * Also paint edges whose endpoints are not both allocated (the dim base rails).
   * Default false, so only lit connectors are painted. Set true to surface edges
   * that the build does not yet hold, such as a route it is missing.
   */
  includeInactive?: boolean;
}

/** A sprite to draw at the hub: source image URL + the sub-rect to crop. */
export interface CentreSprite {
  /** Source image URL to load and crop from (e.g. a spritesheet). */
  url: string;
  /** Sub-rect left edge in the source image, px. */
  sx: number;
  /** Sub-rect top edge in the source image, px. */
  sy: number;
  /** Sub-rect width in the source image, px. */
  sw: number;
  /** Sub-rect height in the source image, px. */
  sh: number;
}
