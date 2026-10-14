/** Every visual decision of the renderer as pure data (sprite keys, tints, rail layering, stroke looks). `TreeView.tsx` only executes them against PixiJS, so all of it is unit-testable. */

import type { Scene } from '@poe2-toolkit/tree-core';
import { frameKeyFor, iconKeyFor } from './spriteKeys.js';
import type { AllocationPreview, HighlightStyle, ResolvedHighlightStyle, ResolvedTreeColors, TreeColors } from './types.js';

/** Defaults for {@link HighlightStyle}: the teal search pulse. */
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

export const RAIL_WIDTH = 3.6;
export const RAIL_GAP = 4.8;
const RAIL_COLOR = 0x7d6836;
const RAIL_GAP_ACTIVE = 0xfcde86;
const RAIL_GAP_INACTIVE = 0x000000;

/** Defaults for {@link TreeColors}: weapon sets mirror the in-game colours, tinting set nodes' frames and active rails. The removal preview is magenta, distinct from set I red and the gold chrome. */
export const DEFAULT_TREE_COLORS: ResolvedTreeColors = {
  weaponSet: {
    1: 0xe05252,
    2: 0x4fbf7a,
  },
  removePreview: 0xff4fa8,
};

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

const RARITY_COLOR: Record<string, number> = {
  NORMAL: 0xd6d6d6,
  MAGIC: 0x8888ff,
  RARE: 0xe8e84a,
  UNIQUE: 0xcf7a3a,
};

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

export interface RailPass {
  connections: Scene['connections'];
  width: number;
  color: number;
}

/**
 * Layered passes that render connections as twin rails: inactive first (bronze main tree, black for ascendancy), then
 * active per weapon set (basic gold, then the sets over it).
 *
 * @param ascendancyOnly - `false` renders the main map, `true` a relocated ascendancy disc's own edges.
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

export interface NodeVisual {
  icon: { key: string; tint: number | null } | null;
  frame: { key: string; tint: number | null } | null;
  fallback: { radius: number; color: number; alpha: number };
  jewel: { iconUrl: string | null; spriteSize: number; gemRadius: number; gemColor: number } | null;
}

/** Null for mastery nodes: they are drawn as their effect pattern. */
export function nodeVisual(node: Scene['nodes'][number], colors: ResolvedTreeColors = DEFAULT_TREE_COLORS): NodeVisual | null {
  if (node.kind === 'mastery') {
    return null;
  }

  const iconKey = iconKeyFor(node.kind, node.icon);
  const frameKey = frameKeyFor(node.kind, node.allocated);
  // Unallocated nodes draw the icon dimmed as the game does (50% grey multiply keeps hue). A weapon-set node's frame is tinted.
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

/** The ascendancy whose nodes the active disc shows, as tagged on scene nodes: the replaced one (Abyssal Lich -> Lich) or itself. */
export function ascendancyDiscOwner(scene: Scene, activeAscendancy: string | undefined): string | undefined {
  if (!activeAscendancy) {
    return undefined;
  }

  return scene.centre.ascendancies.find((a) => a.id === activeAscendancy)?.replaces ?? activeAscendancy;
}

/** World offset that relocates the active disc into the hub, or null. Overlays over its nodes must carry the same shift. */
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

export const EDGE_OVERLAY_GLOW_WIDTH = RAIL_GAP + RAIL_WIDTH * 2.5;
export const EDGE_OVERLAY_CORE_WIDTH = RAIL_GAP + RAIL_WIDTH * 1.5;

export interface PreviewStroke {
  remove: boolean;
  color: number;
  glowAlpha: number;
  coreAlpha: number;
  glowWidth: number;
  coreWidth: number;
}

/** Add takes the paint mode's tint, removal the palette's colour at the active rail's full width; add stays a slimmer zoom-tracking guide with an on-screen minimum. */
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

export interface HighlightPulse {
  glowAlpha: number;
  coreAlpha: number;
  grow: number;
}

/** Pulse state at time `now` (ms). `pulseMs` 0 freezes it at the peak. */
export function highlightPulse(style: ResolvedHighlightStyle, now: number): HighlightPulse {
  const pulse = style.pulseMs > 0 ? (Math.sin(now / style.pulseMs) + 1) / 2 : 1;
  const lerp = (range: [number, number]): number => range[0] + pulse * (range[1] - range[0]);

  return {
    glowAlpha: lerp(style.glowAlpha),
    coreAlpha: lerp(style.coreAlpha),
    grow: pulse * style.pulseGrow,
  };
}

export function outlineBase(node: Scene['nodes'][number]): number {
  return (node.frameSize > 0 ? node.frameSize : node.iconSize) / 2;
}
