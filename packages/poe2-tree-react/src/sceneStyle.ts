/**
 * Every visual decision the renderer makes, as pure data: which sprite keys and
 * tints a node draws with, how connection rails layer, what colour and width an
 * overlay stroke gets. `TreeView.tsx` only executes these decisions against
 * PixiJS; nothing in here touches a canvas, so all of it is unit-testable.
 */

import type { Scene } from '@poe2-toolkit/tree-core';
import { frameKeyFor, iconKeyFor } from './spriteKeys.js';
import type { AllocationPreview, HighlightStyle, ResolvedHighlightStyle, ResolvedTreeColors, TreeColors } from './types.js';

/** Defaults for {@link HighlightStyle} — the standing teal search pulse. */
export const DEFAULT_HIGHLIGHT: ResolvedHighlightStyle = {
  glowColor: 0x3fae9f,
  coreColor: 0x7df9e0,
  glowWidth: 8,
  coreWidth: 3,
  radius: 6,
  pulseMs: 320,
  pulseGrow: 5,
  glowAlpha: [0.2, 0.65],
  coreAlpha: [0.55, 1],
};

/** Below this zoom the debug id labels are hidden (a tiny, costly, unreadable mess). */
export const LABEL_MIN_SCALE = 0.35;

/** Connection rail look (world units). Two parallel rails with a gap between. */
export const RAIL_WIDTH = 3.6;
export const RAIL_GAP = 4.8;
const RAIL_COLOR = 0x7d6836;
const RAIL_GAP_ACTIVE = 0xfcde86;
const RAIL_GAP_INACTIVE = 0x000000;

/**
 * Defaults for {@link TreeColors}. Weapon sets mirror the in-game colours (set I
 * red, set II green), keeping the basic tree on its gold rail; the tint is
 * applied to set nodes' frames and their active rails so each weapon set reads
 * apart in the single combined view. The removal preview is magenta: still a
 * warning hue, but distinct from the red of set I and the gold chrome.
 */
export const DEFAULT_TREE_COLORS: ResolvedTreeColors = {
  weaponSet: {
    1: 0xe05252,
    2: 0x4fbf7a,
  },
  removePreview: 0xff4fa8,
};

/** Resolve a caller-supplied palette against the in-game-colour defaults. */
export function resolveTreeColors(colors: TreeColors | undefined): ResolvedTreeColors {
  return {
    weaponSet: {
      1: colors?.weaponSet1 ?? DEFAULT_TREE_COLORS.weaponSet[1],
      2: colors?.weaponSet2 ?? DEFAULT_TREE_COLORS.weaponSet[2],
    },
    removePreview: colors?.removePreview ?? DEFAULT_TREE_COLORS.removePreview,
  };
}

/** Multiply tint for unallocated node icons: 50% grey = half brightness, hue kept. */
const ICON_DIM = 0x808080;

/** Vector palette by node kind, used when no atlas art is supplied. */
const KIND_COLOR: Record<string, number> = {
  normal: 0x3a5b54,
  notable: 0x6fe0d0,
  keystone: 0xd9b86a,
  mastery: 0x8a6fd0,
  jewel: 0xd06f9a,
  attribute: 0x4a6a62,
  classStart: 0x9aa7a3,
  ascendancyStart: 0xd9b86a,
  ascendancyNormal: 0x5a7a72,
  ascendancyNotable: 0x7fd0c0,
};

/** Item-rarity colours for the gem drawn inside a socketed jewel. */
const RARITY_COLOR: Record<string, number> = {
  NORMAL: 0xd6d6d6,
  MAGIC: 0x8888ff,
  RARE: 0xe8e84a,
  UNIQUE: 0xcf7a3a,
};

/** Resolve a caller-supplied highlight style against the teal-pulse defaults. */
export function resolveHighlightStyle(style: HighlightStyle | undefined): ResolvedHighlightStyle {
  return {
    glowColor: style?.glowColor ?? DEFAULT_HIGHLIGHT.glowColor,
    coreColor: style?.coreColor ?? DEFAULT_HIGHLIGHT.coreColor,
    glowWidth: style?.glowWidth ?? DEFAULT_HIGHLIGHT.glowWidth,
    coreWidth: style?.coreWidth ?? DEFAULT_HIGHLIGHT.coreWidth,
    radius: style?.radius ?? DEFAULT_HIGHLIGHT.radius,
    pulseMs: style?.pulseMs ?? DEFAULT_HIGHLIGHT.pulseMs,
    pulseGrow: style?.pulseGrow ?? DEFAULT_HIGHLIGHT.pulseGrow,
    glowAlpha: style?.glowAlpha ?? DEFAULT_HIGHLIGHT.glowAlpha,
    coreAlpha: style?.coreAlpha ?? DEFAULT_HIGHLIGHT.coreAlpha,
  };
}

/** One stroke pass over a set of connections: the paths, then one stroke call. */
export interface RailPass {
  connections: Scene['connections'];
  width: number;
  color: number;
}

/**
 * The layered stroke passes that render a set of connections as twin rails.
 * Inactive rails first (under): bronze for the main tree, solid black for
 * ascendancy edges. Active rails on top, per weapon set so each reads in its
 * own colour: basic gold first, then the two sets over it (the set II overlay
 * stays visible even where it shares geometry with the basic tree).
 *
 * @param ascendancyOnly - `false` renders the main map (ascendancy edges are
 *   skipped); `true` renders a relocated ascendancy disc's own edges.
 */
export function railPasses(connections: Scene['connections'], ascendancyOnly: boolean | null, colors: ResolvedTreeColors = DEFAULT_TREE_COLORS): RailPass[] {
  const visible = (conn: Scene['connections'][number]): boolean =>
    !(ascendancyOnly === false && conn.ascendancy);

  const passes: RailPass[] = [];
  const inactive = connections.filter((conn) => visible(conn) && !conn.active);

  if (inactive.length > 0) {
    passes.push({ connections: inactive, width: RAIL_GAP + RAIL_WIDTH * 2, color: ascendancyOnly ? RAIL_GAP_INACTIVE : RAIL_COLOR });

    if (!ascendancyOnly) {
      passes.push({ connections: inactive, width: RAIL_GAP, color: RAIL_GAP_INACTIVE });
    }
  }

  const active = connections.filter((conn) => visible(conn) && conn.active);

  for (const set of [undefined, 1, 2] as const) {
    const want = active.filter((conn) => conn.weaponSet === set);

    if (want.length === 0) {
      continue;
    }

    const color = set === undefined ? RAIL_GAP_ACTIVE : colors.weaponSet[set];
    passes.push({ connections: want, width: RAIL_GAP + RAIL_WIDTH * 2, color });
    passes.push({ connections: want, width: RAIL_GAP, color });
  }

  return passes;
}

/** How one node draws: atlas sprites with tints, plus the vector fall-backs. */
export interface NodeVisual {
  /** Atlas icon to draw, or null when the kind has no icon key. */
  icon: { key: string; tint: number | null } | null;
  /** Atlas frame to draw over the icon, or null when the kind has no frame. */
  frame: { key: string; tint: number | null } | null;
  /** Vector disc drawn when no atlas sprite could be placed. */
  fallback: { radius: number; color: number; alpha: number };
  /** Socketed-jewel adornment (item icon, or a rarity-coloured gem). */
  jewel: { iconUrl: string | null; spriteSize: number; gemRadius: number; gemColor: number } | null;
}

/**
 * Every visual decision for one node: sprite keys, tints and fall-backs.
 * Returns null for mastery nodes — they are drawn as their effect pattern.
 */
export function nodeVisual(node: Scene['nodes'][number], colors: ResolvedTreeColors = DEFAULT_TREE_COLORS): NodeVisual | null {
  if (node.kind === 'mastery') {
    return null;
  }

  const iconKey = iconKeyFor(node.kind, node.icon);
  const frameKey = frameKeyFor(node.kind, node.allocated);
  // Unallocated nodes draw the same colour icon dimmed, as the game does: a
  // 50% grey multiply (no desaturation — hue is kept, brightness halved).
  // A weapon-set node's frame is tinted so it reads apart from the gold basic
  // tree; basic nodes keep the untinted frame.
  const visual: NodeVisual = {
    icon: iconKey ? { key: iconKey, tint: node.allocated ? null : ICON_DIM } : null,
    frame: frameKey ? { key: frameKey, tint: node.allocated && node.weaponSet ? colors.weaponSet[node.weaponSet] : null } : null,
    fallback: {
      radius: Math.max(1.2, node.radius),
      color: KIND_COLOR[node.kind] ?? 0xffffff,
      alpha: node.allocated ? 1 : 0.4,
    },
    jewel: null,
  };

  if (node.kind === 'jewel' && node.jewel) {
    const frame = node.frameSize > 0 ? node.frameSize : node.iconSize;
    visual.jewel = {
      iconUrl: node.jewel.icon ?? null,
      spriteSize: frame * 0.62,
      gemRadius: Math.max(2, frame * 0.2),
      gemColor: RARITY_COLOR[node.jewel.rarity ?? ''] ?? 0xd6d6d6,
    };
  }

  return visual;
}

/**
 * World offset that relocates the active ascendancy disc into the hub, or null
 * when no disc is active (or the id is unknown). The disc's nodes and edges are
 * drawn shifted by this; overlays over them must carry the same shift.
 */
export function ascendancyOffset(scene: Scene, activeAscendancy: string | undefined): { x: number; y: number } | null {
  if (!activeAscendancy) {
    return null;
  }

  const disc = scene.centre.ascendancies.find((a) => a.id === activeAscendancy);

  if (!disc) {
    return null;
  }

  return {
    x: scene.centre.centre.x - disc.worldAnchor.x,
    y: scene.centre.centre.y - disc.worldAnchor.y,
  };
}

/** Stroke widths for caller-defined edge overlays, matching the lit rail. */
export const EDGE_OVERLAY_GLOW_WIDTH = RAIL_GAP + RAIL_WIDTH * 2.5;
export const EDGE_OVERLAY_CORE_WIDTH = RAIL_GAP + RAIL_WIDTH * 1.5;

/** Colour, alpha and stroke widths of an allocation preview at a zoom level. */
export interface PreviewStroke {
  remove: boolean;
  color: number;
  glowAlpha: number;
  coreAlpha: number;
  glowWidth: number;
  coreWidth: number;
}

/**
 * The allocation preview's stroke: add takes the paint mode's tint (gold basic,
 * set colours for I/II), removal always the palette's removal colour. The
 * removal line matches the active rail's full width (gap + rail*2) so it reads
 * as thick as the gold connector it would cut; the add preview stays a slimmer
 * zoom-tracking guide, clamped to a small on-screen minimum (matching the
 * Canvas2D `max(3, 9 * scale)` / `max(1.5, 4 * scale)`).
 */
export function previewStroke(preview: AllocationPreview, scale: number, colors: ResolvedTreeColors = DEFAULT_TREE_COLORS): PreviewStroke {
  const remove = preview.kind === 'remove';

  return {
    remove,
    color: remove ? colors.removePreview : preview.weaponSet ? colors.weaponSet[preview.weaponSet] : 0xffe296,
    glowAlpha: remove ? 0.35 : 0.4,
    coreAlpha: remove ? 0.95 : 0.98,
    glowWidth: remove ? RAIL_GAP + RAIL_WIDTH * 3 : Math.max(9, 3 / scale),
    coreWidth: remove ? RAIL_GAP + RAIL_WIDTH * 2 : Math.max(4, 1.5 / scale),
  };
}

/** The highlight rings' pulse state at a moment: alphas and radius growth. */
export interface HighlightPulse {
  glowAlpha: number;
  coreAlpha: number;
  grow: number;
}

/**
 * Where the pulse sits at time `now` (ms): alphas lerped over their ranges and
 * the extra ring radius. `pulseMs` 0 freezes it at the peak.
 */
export function highlightPulse(style: ResolvedHighlightStyle, now: number): HighlightPulse {
  const pulse = style.pulseMs > 0 ? (Math.sin(now / style.pulseMs) + 1) / 2 : 1;
  const lerp = (range: [number, number]): number => range[0] + pulse * (range[1] - range[0]);

  return {
    glowAlpha: lerp(style.glowAlpha),
    coreAlpha: lerp(style.coreAlpha),
    grow: pulse * style.pulseGrow,
  };
}

/** A node's ring outline base radius: half its frame (or icon, if frameless). */
export function outlineBase(node: Scene['nodes'][number]): number {
  return (node.frameSize > 0 ? node.frameSize : node.iconSize) / 2;
}
