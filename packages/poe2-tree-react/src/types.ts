/** Prop-level types shared by `TreeView.tsx` and the pure style/interaction modules. Type-only, so those stay free of React and PixiJS imports. */

export interface ZoomLimits {
  /** Hard zoom-in cap as a world scale. Default 4. */
  maxScale?: number;
  /** Zoom-out floor as a multiple of the fit-the-whole-tree scale. Default 0.85. */
  minFitFactor?: number;
  /** How far past the tree's edges you may pan, as a fraction of the viewport. Default 0.5. */
  overscroll?: number;
}

/** Allocation palette. Defaults mirror the in-game weapon-set colours; the removal preview is magenta to read apart from both sets and the gold basic tree. */
export interface TreeColors {
  /** Weapon set I tint (node frames, active rails, add preview). Default `0xe05252` (red). */
  weaponSet1?: number;
  /** Weapon set II tint (node frames, active rails, add preview). Default `0x4fbf7a` (green). */
  weaponSet2?: number;
  /** Removal-preview stroke colour (cut rails and removed-node rings). Default `0xff4fa8` (magenta). */
  removePreview?: number;
}

export interface ResolvedTreeColors {
  weaponSet: Record<1 | 2, number>;
  removePreview: number;
}

/** Search-highlight rings: a soft wide `glow` and a bright thin `core` per matched node, both pulsing in alpha and radius. */
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
  /** Pulse period divisor in ms (larger = slower). Default 320. 0 gives a still ring, drawn once. */
  pulseMs?: number;
  /** Extra radius added at the pulse peak, on-screen px. Default 5. */
  pulseGrow?: number;
  /** Outer ring alpha range `[trough, peak]` over the pulse. Default `[0.2, 0.65]`. */
  glowAlpha?: [number, number];
  /** Inner ring alpha range `[trough, peak]` over the pulse. Default `[0.55, 1]`. */
  coreAlpha?: [number, number];
}

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

export interface AllocationPreview {
  /** `add` is gold (or the weapon set's tint), `remove` uses {@link TreeColors.removePreview}. */
  kind: 'add' | 'remove';
  /** Skill ids the click touches. For a `remove` each is also ringed, so a lone tip with no edge still shows. */
  nodes: Set<number>;
  edges: Set<string>;
  /** Weapon set an `add` preview allocates into; absent = basic. */
  weaponSet?: 1 | 2;
}

/** Edges painted in one colour over the base render. */
export interface EdgeOverlay {
  edges: Set<string>;
  color: number;
  /** Also paint edges whose endpoints are not both allocated (dim base rails), e.g. a missing route. Default false. */
  includeInactive?: boolean;
}

export interface CentreSprite {
  url: string;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}
