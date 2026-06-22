import type { NodeKind, Scene, ScreenNode, ScreenScene, Viewport, WorldRect } from '@poe2-tree/core';
import { nodeAt, project, projectPoint, screenToWorld } from '@poe2-tree/core';
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, Ref } from 'react';
import type { RenderResources } from './resources.js';
import { effectKeyFor, frameKeyFor, iconKeyFor } from './spriteKeys.js';

export interface TreeViewProps {
  /** Computed geometry from `@poe2-tree/core`'s `buildScene`. */
  scene: Scene;
  /** Atlas bitmaps + manifest. Omit for the vector debug render (no GGG art). */
  resources?: RenderResources;
  /** Active class id — rotates the active ring onto that class. */
  activeClassId?: number;
  /** Active ascendancy id — its disc is relocated into the hub. */
  activeAscendancy?: string;
  /**
   * Optional centre artwork. Each sprite is a URL + source sub-rect, drawn at
   * the hub sized to the matching core radius:
   *  - `portrait` -> `ring.artRadius` (the inner class illustration)
   *  - `ringStatic` -> `ring.frameRadius` (the ornate ring)
   *  - `ringActive` -> `ring.activeRadius`, rotated by the active class's
   *    `ringRotation` (the gold band pointing at the class)
   * When absent, the vector hub stand-in is drawn instead.
   */
  centreSprites?: {
    portrait?: CentreSprite;
    ringStatic?: CentreSprite;
    ringActive?: CentreSprite;
  };
  /** Single-click intent out: the skill id and the node's centre in canvas px. */
  onNodeClick?: (skill: number, screen: { x: number; y: number }) => void;
  /** Double-click intent out (skill id). */
  onNodeDoubleClick?: (skill: number) => void;
  /** Fires when a press starts on the canvas (pan/empty click) — e.g. to dismiss popovers. */
  onInteractStart?: () => void;
  /**
   * Hover feedback out: the skill id (or null when leaving all nodes) and, when
   * hovering a node, its centre in canvas pixels — so callers can anchor UI
   * (e.g. an attribute picker) to the node.
   */
  onNodeHover?: (skill: number | null, screen?: { x: number; y: number }) => void;
  /**
   * Hover preview to highlight: the nodes/edges that a click would allocate
   * (`add`) or remove (`remove`). Drawn on top of the base render.
   */
  preview?: AllocationPreview | null;
  /** Imperative zoom controls, for external +/- buttons. */
  controls?: Ref<TreeViewControls>;
  /**
   * Enable mouse-wheel zoom. Off by default so the page can scroll over an
   * embedded canvas; turn on in fullscreen, where there's nothing to scroll.
   */
  wheelZoom?: boolean;
  /**
   * World rect to frame (pan + zoom to fit). Whenever the object reference
   * changes the view re-frames it — pass a fresh object to trigger, `null` to
   * keep the current/default view (the hub).
   */
  focus?: WorldRect | null;
  /**
   * Skill ids to emphasise with a standing teal ring (e.g. name-search hits).
   * Unlike `onNodeHover`, this is a persistent set drawn until it changes.
   */
  highlight?: Set<number> | null;
  className?: string;
  style?: CSSProperties;
}

/** Imperative handle exposed via `controls` for external zoom buttons. */
export interface TreeViewControls {
  zoomIn: () => void;
  zoomOut: () => void;
}

/** Hover preview of a pending allocate/remove: node ids + edge keys to glow. */
export interface AllocationPreview {
  kind: 'add' | 'remove';
  nodes: Set<number>;
  /** Edge keys as `min-max` of the two node ids. */
  edges: Set<string>;
}

/** A sprite to draw at the hub: source image URL + the sub-rect to crop. */
export interface CentreSprite {
  url: string;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

const MIN_SCALE = 0.02;
const MAX_SCALE = 4;
const ZOOM_STEP = 1.3;
const ZOOM_SENSITIVITY = 0.0015;
const FIT_PADDING = 0.92;

/** Connection rail look (world units). Two parallel rails with a gap between. */
const RAIL_WIDTH = 3.6;
const RAIL_GAP = 4.8;
const RAIL_COLOR = '#7d6836';
const RAIL_GAP_ACTIVE = '#fcde86';
const RAIL_GAP_INACTIVE = '#000000';

/**
 * Stroke the current path as twin parallel rails with a gap. One wide stroke in
 * the rail colour lays down both rails; a narrower stroke on top fills the gap
 * (gold when allocated, background otherwise).
 */
function strokeRail(ctx: CanvasRenderingContext2D, active: boolean, scale: number): void {
  const gap = Math.max(0.6, RAIL_GAP * scale);
  const rail = Math.max(0.6, RAIL_WIDTH * scale);
  // Active: both rails and the gap are gold (solid band). Inactive: dark rails
  // around an empty (background) gap.
  ctx.strokeStyle = active ? RAIL_GAP_ACTIVE : RAIL_COLOR;
  ctx.lineWidth = gap + rail * 2;
  ctx.stroke();
  ctx.strokeStyle = active ? RAIL_GAP_ACTIVE : RAIL_GAP_INACTIVE;
  ctx.lineWidth = gap;
  ctx.stroke();
}

/**
 * Ascendancy edges: inactive ones are a single solid black line the full width
 * of a twin rail (matching the in-game ascendancy tree); active ones keep the
 * gold rail used everywhere else.
 */
function strokeAscendancyRail(ctx: CanvasRenderingContext2D, active: boolean, scale: number): void {
  if (active) {
    strokeRail(ctx, true, scale);

    return;
  }

  const gap = Math.max(0.6, RAIL_GAP * scale);
  const rail = Math.max(0.6, RAIL_WIDTH * scale);
  ctx.strokeStyle = RAIL_GAP_INACTIVE;
  ctx.lineWidth = gap + rail * 2;
  ctx.stroke();
}

/** Vector palette by node kind, used when no atlas art is supplied. */
const KIND_COLOR: Record<NodeKind, string> = {
  normal: '#3a5b54',
  notable: '#6fe0d0',
  keystone: '#d9b86a',
  mastery: '#8a6fd0',
  jewel: '#d06f9a',
  attribute: '#4a6a62',
  classStart: '#9aa7a3',
  ascendancyStart: '#d9b86a',
  ascendancyNormal: '#5a7a72',
  ascendancyNotable: '#7fd0c0',
};

/** Item-rarity colours for the gem drawn inside a socketed jewel. */
const RARITY_COLOR: Record<string, string> = {
  NORMAL: '#d6d6d6',
  MAGIC: '#8888ff',
  RARE: '#e8e84a',
  UNIQUE: '#cf7a3a',
};

/**
 * Thin canvas view over a core `Scene`. It owns nothing geometric — pan, zoom,
 * device-pixel sizing, the draw loop, and hover hit-testing only. Positions,
 * sizes, projection and hit-testing all come from `@poe2-tree/core`.
 *
 * Without `resources` it renders a vector debug view (nodes as discs, edges as
 * lines/arcs, the hub opening as a ring) — enough to see the geometry before any
 * GGG atlas art exists.
 */
export function TreeView({
  scene,
  resources,
  activeClassId,
  activeAscendancy,
  centreSprites,
  onNodeClick,
  onNodeDoubleClick,
  onInteractStart,
  onNodeHover,
  preview,
  controls,
  wheelZoom,
  focus,
  highlight,
  className,
  style,
}: TreeViewProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const hoverRef = useRef<number | null>(null);
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const [, forceRedraw] = useState(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (!canvas || !ctx) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;

    // Lazily centre the view on the hub (class portrait) the first time we have
    // a size.
    if (!viewportRef.current && cssWidth > 0 && cssHeight > 0) {
      viewportRef.current = centreViewport(scene, cssWidth, cssHeight);
    }

    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    clampViewport(viewport, scene, cssWidth, cssHeight);

    const screen = project(scene, viewport, { width: cssWidth, height: cssHeight });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    // Solid near-black background.
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    drawVector(ctx, screen, scene, viewport, hoverRef.current, activeClassId, centreSprites, imagesRef.current, resources);

    if (highlight && highlight.size > 0) {
      drawHighlight(ctx, screen, highlight);
    }

    if (preview) {
      drawPreview(ctx, screen, preview);
    }

    if (activeAscendancy) {
      drawAscendancy(ctx, scene, viewport, activeAscendancy, resources, hoverRef.current, preview);
    }
  }, [scene, activeClassId, activeAscendancy, centreSprites, resources, preview, highlight]);

  // While a highlight set is active, drive its pulse by redrawing every frame.
  // Idle (no matches) keeps the tree static — no animation cost.
  useEffect(() => {
    if (!highlight || highlight.size === 0) {
      return;
    }

    let raf = 0;
    const tick = (): void => {
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [highlight, draw]);

  // Load centre sprite images; redraw as each arrives.
  useEffect(() => {
    const urls = [centreSprites?.portrait?.url, centreSprites?.ringStatic?.url, centreSprites?.ringActive?.url].filter(
      (url): url is string => Boolean(url),
    );

    for (const url of urls) {
      if (imagesRef.current.has(url)) {
        continue;
      }

      const img = new Image();
      img.onload = () => {
        imagesRef.current.set(url, img);
        draw();
      };
      img.src = url;
    }
  }, [centreSprites, draw]);

  // Load socketed-jewel icons (item art keyed by base type); redraw as each
  // arrives. Same image cache as the centre sprites.
  useEffect(() => {
    const urls = new Set<string>();

    for (const node of scene.nodes) {
      if (node.jewel?.icon) {
        urls.add(node.jewel.icon);
      }
    }

    for (const url of urls) {
      if (imagesRef.current.has(url)) {
        continue;
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        imagesRef.current.set(url, img);
        draw();
      };
      img.src = url;
    }
  }, [scene, draw]);

  // Redraw on size change (device-pixel backing store + CSS size).
  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const observer = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      draw();
    });
    observer.observe(canvas);

    return () => observer.disconnect();
  }, [draw]);

  // Repaint whenever anything affecting the render changes (scene/allocation,
  // atlases finishing loading, centre art, active class/ascendancy) — WITHOUT
  // touching the viewport. The view is centred lazily on first draw and then
  // preserved, so editing the build or panning never snaps it back to the hub.
  useEffect(() => {
    draw();
  }, [draw]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { x: event.clientX, y: event.clientY, moved: false };
      onInteractStart?.();
    },
    [onInteractStart],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const viewport = viewportRef.current;

      if (!viewport) {
        return;
      }

      const drag = dragRef.current;

      // Recover from a missed pointerup: if the primary button is no longer held
      // (e.g. the release landed outside the canvas, or fullscreen stole pointer
      // capture), `buttons` is 0 — end the drag so the tree stops following the
      // cursor instead of panning forever.
      if (drag && (event.buttons & 1) === 0) {
        dragRef.current = null;

        return;
      }

      if (drag) {
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;

        if (Math.abs(dx) + Math.abs(dy) > 2) {
          drag.moved = true;
        }

        drag.x = event.clientX;
        drag.y = event.clientY;
        viewport.tx += dx;
        viewport.ty += dy;
        draw();

        return;
      }

      // Hover hit-test.
      const rect = event.currentTarget.getBoundingClientRect();
      const hit = hitTest(scene, viewport, event.clientX - rect.left, event.clientY - rect.top, activeAscendancy);

      if (hit !== hoverRef.current) {
        hoverRef.current = hit;
        const node = hit !== null ? scene.nodes.find((candidate) => candidate.skill === hit) : undefined;
        onNodeHover?.(hit, node ? projectPoint(viewport, { x: node.x, y: node.y }) : undefined);
        draw();
      }
    },
    [scene, draw, onNodeHover, activeAscendancy],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      event.currentTarget.releasePointerCapture(event.pointerId);
      const drag = dragRef.current;
      dragRef.current = null;
      const viewport = viewportRef.current;

      if (drag && !drag.moved && viewport && onNodeClick) {
        const rect = event.currentTarget.getBoundingClientRect();
        const hit = hitTest(scene, viewport, event.clientX - rect.left, event.clientY - rect.top, activeAscendancy);

        if (hit !== null) {
          const node = scene.nodes.find((candidate) => candidate.skill === hit);
          onNodeClick(hit, node ? projectPoint(viewport, { x: node.x, y: node.y }) : { x: 0, y: 0 });
        }
      }
    },
    [scene, onNodeClick, activeAscendancy],
  );

  const onDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLCanvasElement>) => {
      const viewport = viewportRef.current;

      if (!viewport || !onNodeDoubleClick) {
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const hit = hitTest(scene, viewport, event.clientX - rect.left, event.clientY - rect.top, activeAscendancy);

      if (hit !== null) {
        onNodeDoubleClick(hit);
      }
    },
    [scene, onNodeDoubleClick, activeAscendancy],
  );

  // Zoom keeping a screen point fixed. Wheel zoom is intentionally omitted so
  // the page can scroll over the canvas; zooming is driven by external buttons.
  const zoomAt = useCallback(
    (px: number, py: number, factor: number) => {
      const viewport = viewportRef.current;

      if (!viewport) {
        return;
      }

      const scale = clamp(viewport.scale * factor, MIN_SCALE, MAX_SCALE);
      const ratio = scale / viewport.scale;
      viewport.tx = px - (px - viewport.tx) * ratio;
      viewport.ty = py - (py - viewport.ty) * ratio;
      viewport.scale = scale;
      draw();
      forceRedraw((n) => n + 1);
    },
    [draw],
  );

  useImperativeHandle(
    controls,
    () => ({
      zoomIn: () => {
        const canvas = canvasRef.current;

        if (canvas) {
          zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, ZOOM_STEP);
        }
      },
      zoomOut: () => {
        const canvas = canvasRef.current;

        if (canvas) {
          zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, 1 / ZOOM_STEP);
        }
      },
    }),
    [zoomAt],
  );

  // Wheel zoom (fullscreen only): native non-passive listener so we can
  // preventDefault and zoom toward the cursor instead of scrolling.
  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || !wheelZoom) {
      return;
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * ZOOM_SENSITIVITY);
      zoomAt(event.clientX - rect.left, event.clientY - rect.top, factor);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => canvas.removeEventListener('wheel', onWheel);
  }, [wheelZoom, zoomAt]);

  // Frame a requested world rect (e.g. a freshly imported build's allocation).
  // One-shot: keyed on `focus` only, so it fires when the caller passes a new
  // rect — not on every class/ascendancy redraw.
  useEffect(() => {
    if (!focus) {
      return;
    }

    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (width <= 0 || height <= 0) {
      return;
    }

    const viewport = viewportForRect(focus, width, height);
    clampViewport(viewport, scene, width, height);
    viewportRef.current = viewport;
    draw();
    forceRedraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  // Suppress unused-resources warning while the atlas path is not yet wired.
  void resources;

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ touchAction: 'none', cursor: 'grab', width: '100%', height: '100%', background: '#000000', ...style }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={() => {
        dragRef.current = null;
      }}
      onDoubleClick={onDoubleClick}
    />
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** The scale at which the main tree fits the viewport. */
function fitScale(scene: Scene, width: number, height: number): number {
  const { minX, minY, maxX, maxY } = scene.mainBounds;
  const worldWidth = Math.max(1, maxX - minX);
  const worldHeight = Math.max(1, maxY - minY);

  return Math.min(width / worldWidth, height / worldHeight) * FIT_PADDING;
}

/**
 * Default view: centred on the hub (class portrait), zoomed so the portrait and
 * its nearest nodes fill the stage.
 */
function centreViewport(scene: Scene, width: number, height: number): Viewport {
  const { centre, ring } = scene.centre;
  // Window radius a bit larger than the portrait so nearby nodes show too.
  const windowRadius = Math.max(ring.artRadius * 1.6, 2000);
  const scale = Math.min(width, height) / (windowRadius * 2);

  return { tx: width / 2 - centre.x * scale, ty: height / 2 - centre.y * scale, scale };
}

/** A viewport that fits a world rect into the viewport, centred, with padding. */
function viewportForRect(rect: WorldRect, width: number, height: number): Viewport {
  const worldWidth = Math.max(1, rect.maxX - rect.minX);
  const worldHeight = Math.max(1, rect.maxY - rect.minY);
  const scale = Math.min(width / worldWidth, height / worldHeight) * FIT_PADDING;
  const cx = (rect.minX + rect.maxX) / 2;
  const cy = (rect.minY + rect.maxY) / 2;

  return { tx: width / 2 - cx * scale, ty: height / 2 - cy * scale, scale };
}

/**
 * Keep the view sane: don't zoom out past ~the fit scale, and don't pan the main
 * tree fully off-screen (the world bounds include far-out ascendancy anchors, so
 * unclamped panning wanders into huge empty space).
 */
function clampViewport(viewport: Viewport, scene: Scene, width: number, height: number): void {
  if (width <= 0 || height <= 0) {
    return;
  }

  viewport.scale = clamp(viewport.scale, fitScale(scene, width, height) * 0.85, MAX_SCALE);

  const { minX, minY, maxX, maxY } = scene.mainBounds;
  const { scale } = viewport;
  // Keep at least this much of the tree's extent inside the viewport.
  const marginX = Math.min(width, (maxX - minX) * scale) * 0.5;
  const marginY = Math.min(height, (maxY - minY) * scale) * 0.5;
  viewport.tx = clamp(viewport.tx, width - marginX - maxX * scale, marginX - minX * scale);
  viewport.ty = clamp(viewport.ty, height - marginY - maxY * scale, marginY - minY * scale);
}

/** Vector debug render: hub, then edges, then nodes. */
function drawVector(
  ctx: CanvasRenderingContext2D,
  screen: ScreenScene,
  scene: Scene,
  viewport: Viewport,
  hover: number | null,
  activeClassId: number | undefined,
  centreSprites: TreeViewProps['centreSprites'],
  images: Map<string, HTMLImageElement>,
  resources: RenderResources | undefined,
): void {
  drawCentre(ctx, scene, viewport, activeClassId, centreSprites, images);

  // Effect patterns (mastery/notable backgrounds), behind everything. Faint
  // until the mastery is allocated, then lit to full strength — matching the
  // in-game tree.
  if (resources) {
    for (const effect of screen.masteryEffects) {
      const key = effectKeyFor(effect.patternKey);
      ctx.globalAlpha = effect.active ? 1 : 0.15;
      blitFromAtlas(ctx, resources, key, effect.x, effect.y, effect.size);
      ctx.globalAlpha = 1;
    }
  }

  // Connections: vector arcs/lines as twin parallel rails with a gap, matching
  // the in-game tree. Geometrically exact; ornate sprite art would need a
  // kite-quad texture warp (WebGL).
  ctx.lineCap = 'round';

  // Inactive first, then active — active rails always sit on top.
  for (const conn of [...screen.connections].sort((a, b) => Number(a.active) - Number(b.active))) {
    ctx.beginPath();

    if (conn.kind === 'arc' && conn.arc) {
      ctx.arc(conn.arc.cx, conn.arc.cy, conn.arc.radius, conn.arc.startAngle, conn.arc.endAngle, conn.arc.clockwise);
    } else {
      ctx.moveTo(conn.a.x, conn.a.y);
      ctx.lineTo(conn.b.x, conn.b.y);
    }

    strokeRail(ctx, conn.active, screen.scale);
  }

  // Nodes: real atlas art when supplied, else a vector disc.
  for (const node of screen.nodes) {
    const drew = resources ? blitNode(ctx, node, resources) : false;

    if (!drew) {
      const r = Math.max(1.2, node.radius);
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fillStyle = node.allocated ? KIND_COLOR[node.kind] : withAlpha(KIND_COLOR[node.kind], 0.4);
      ctx.fill();
    }

    // A socketed jewel: draw its item icon in the socket (rarity gem fallback).
    if (node.kind === 'jewel' && node.jewel) {
      drawJewelGem(ctx, node, images);
    }

    // Hover ring sized to the node's frame/icon, not its (large) footprint
    // radius — masteries have no disc to outline, so skip them.
    if (node.skill === hover && node.kind !== 'mastery') {
      const outline = (node.frameSize > 0 ? node.frameSize : node.iconSize) / 2 + 3;
      ctx.beginPath();
      ctx.arc(node.x, node.y, outline, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

/**
 * Standing emphasis for a set of skills (name-search hits): a soft teal glow
 * under a bright core ring, sized to each node's frame like the hover ring. The
 * ring pulses — opacity and radius breathe on a time phase, so matches stay
 * eye-catching against the static tree. Masteries have no disc to outline, so
 * skip them. Driven by the highlight rAF loop, which redraws every frame.
 */
function drawHighlight(ctx: CanvasRenderingContext2D, screen: ScreenScene, highlight: Set<number>): void {
  const pulse = (Math.sin(performance.now() / 320) + 1) / 2; // 0..1, ~2s period
  const glowAlpha = 0.2 + pulse * 0.45;
  const coreAlpha = 0.55 + pulse * 0.45;
  const grow = pulse * 5;

  for (const node of screen.nodes) {
    if (!highlight.has(node.skill) || node.kind === 'mastery') {
      continue;
    }

    const outline = (node.frameSize > 0 ? node.frameSize : node.iconSize) / 2 + 6 + grow;

    ctx.beginPath();
    ctx.arc(node.x, node.y, outline, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(63, 174, 159, ${glowAlpha})`;
    ctx.lineWidth = 8;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(node.x, node.y, outline, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(125, 249, 224, ${coreAlpha})`;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

/** Edge key matching the page's preview set: `min-max` of the two node ids. */
function edgeKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/**
 * Draw the hover preview on top of the base render: the path's edges as a glowing
 * line and its nodes ringed. Gold for an allocate preview, red for a removal.
 */
function drawPreview(ctx: CanvasRenderingContext2D, screen: ScreenScene, preview: AllocationPreview): void {
  ctx.lineCap = 'round';

  for (const conn of screen.connections) {
    if (!preview.edges.has(edgeKey(conn.from, conn.to))) {
      continue;
    }

    ctx.beginPath();

    if (conn.kind === 'arc' && conn.arc) {
      ctx.arc(conn.arc.cx, conn.arc.cy, conn.arc.radius, conn.arc.startAngle, conn.arc.endAngle, conn.arc.clockwise);
    } else {
      ctx.moveTo(conn.a.x, conn.a.y);
      ctx.lineTo(conn.b.x, conn.b.y);
    }

    strokePreview(ctx, preview.kind, screen.scale);
  }
}

/** Stroke the current path as a preview rail: a soft glow under a bright core. */
function strokePreview(ctx: CanvasRenderingContext2D, kind: AllocationPreview['kind'], scale: number): void {
  const color = kind === 'remove' ? 'rgba(235, 96, 96, 0.95)' : 'rgba(255, 226, 150, 0.98)';
  const glow = kind === 'remove' ? 'rgba(235, 96, 96, 0.35)' : 'rgba(255, 226, 150, 0.4)';

  ctx.strokeStyle = glow;
  ctx.lineWidth = Math.max(3, 9 * scale);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, 4 * scale);
  ctx.stroke();
}

/**
 * Hit-test that accounts for the relocated active ascendancy disc: try its
 * nodes (translated into the hub) first, then the main tree via core's nodeAt.
 */
function hitTest(
  scene: Scene,
  viewport: Viewport,
  sx: number,
  sy: number,
  activeAscendancy: string | undefined,
): number | null {
  if (activeAscendancy) {
    const disc = scene.centre.ascendancies.find((a) => a.id === activeAscendancy);

    if (disc) {
      const dx = scene.centre.centre.x - disc.worldAnchor.x;
      const dy = scene.centre.centre.y - disc.worldAnchor.y;
      const world = screenToWorld(viewport, sx, sy);
      let best: number | null = null;
      let bestDistSq = Infinity;

      for (const node of scene.nodes) {
        if (node.ascendancy !== activeAscendancy || node.radius <= 0) {
          continue;
        }

        const ddx = node.x + dx - world.x;
        const ddy = node.y + dy - world.y;
        const distSq = ddx * ddx + ddy * ddy;

        if (distSq <= node.radius * node.radius && distSq < bestDistSq) {
          best = node.skill;
          bestDistSq = distSq;
        }
      }

      if (best !== null) {
        return best;
      }
    }
  }

  return nodeAt(scene, viewport, sx, sy);
}

/**
 * Draw the active ascendancy disc relocated into the hub: each of its nodes is
 * translated from the disc's world anchor to the centre, then projected and
 * blitted. Drawing them at their raw world anchor is the identity of this
 * transform.
 */
function drawAscendancy(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  viewport: Viewport,
  activeAscendancy: string,
  resources: RenderResources | undefined,
  hover: number | null,
  preview: AllocationPreview | null | undefined,
): void {
  const disc = scene.centre.ascendancies.find((a) => a.id === activeAscendancy);

  if (!disc) {
    return;
  }

  const { centre } = scene.centre;
  const dx = centre.x - disc.worldAnchor.x;
  const dy = centre.y - disc.worldAnchor.y;
  const scale = viewport.scale;

  // Edges first (under the nodes), relocated by the same translation.
  ctx.lineCap = 'round';
  // Inactive first, then active — active rails always sit on top.
  const ascConnections = scene.connections
    .filter((conn) => conn.ascendancy === activeAscendancy)
    .sort((a, b) => Number(a.active) - Number(b.active));

  for (const conn of ascConnections) {
    const a = projectPoint(viewport, { x: conn.a.x + dx, y: conn.a.y + dy });
    const b = projectPoint(viewport, { x: conn.b.x + dx, y: conn.b.y + dy });
    ctx.beginPath();

    if (conn.kind === 'arc' && conn.arc) {
      const c = projectPoint(viewport, { x: conn.arc.cx + dx, y: conn.arc.cy + dy });
      ctx.arc(c.x, c.y, conn.arc.radius * scale, conn.arc.startAngle, conn.arc.endAngle, conn.arc.clockwise);
    } else {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }

    strokeAscendancyRail(ctx, conn.active, scale);
  }

  for (const node of scene.nodes) {
    if (node.ascendancy !== activeAscendancy) {
      continue;
    }

    const screen = projectPoint(viewport, { x: node.x + dx, y: node.y + dy });
    const placed: ScreenNode = {
      skill: node.skill,
      x: screen.x,
      y: screen.y,
      kind: node.kind,
      icon: node.icon,
      iconSize: node.iconSize * scale,
      frameSize: node.frameSize * scale,
      radius: node.radius * scale,
      allocated: node.allocated,
    };
    const drew = resources ? blitNode(ctx, placed, resources) : false;

    if (!drew) {
      ctx.beginPath();
      ctx.arc(placed.x, placed.y, Math.max(1.5, placed.radius), 0, Math.PI * 2);
      ctx.fillStyle = placed.allocated ? KIND_COLOR[placed.kind] : withAlpha(KIND_COLOR[placed.kind], 0.5);
      ctx.fill();
    }

    if (node.skill === hover && node.kind !== 'mastery') {
      const outline = (placed.frameSize > 0 ? placed.frameSize : placed.iconSize) / 2 + 3;
      ctx.beginPath();
      ctx.arc(placed.x, placed.y, outline, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // Hover preview on top, relocated like the edges: the gold path a click would
  // allocate within the ascendancy, or the red set it would remove.
  if (preview) {
    ctx.lineCap = 'round';

    for (const conn of ascConnections) {
      if (!preview.edges.has(edgeKey(conn.from, conn.to))) {
        continue;
      }

      ctx.beginPath();

      if (conn.kind === 'arc' && conn.arc) {
        const c = projectPoint(viewport, { x: conn.arc.cx + dx, y: conn.arc.cy + dy });
        ctx.arc(c.x, c.y, conn.arc.radius * scale, conn.arc.startAngle, conn.arc.endAngle, conn.arc.clockwise);
      } else {
        const a = projectPoint(viewport, { x: conn.a.x + dx, y: conn.a.y + dy });
        const b = projectPoint(viewport, { x: conn.b.x + dx, y: conn.b.y + dy });
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }

      strokePreview(ctx, preview.kind, scale);
    }
  }
}

/**
 * Draw a socketed jewel inside its socket: the jewel's own item icon when its
 * art has loaded, otherwise a rarity-coloured gem disc as a fallback. The art is
 * tinted with a soft rarity glow so the socket reads as filled at a glance.
 */
function drawJewelGem(ctx: CanvasRenderingContext2D, node: ScreenNode, images: Map<string, HTMLImageElement>): void {
  const frame = node.frameSize > 0 ? node.frameSize : node.iconSize;
  const color = RARITY_COLOR[node.jewel?.rarity ?? ''] ?? '#d6d6d6';
  const iconUrl = node.jewel?.icon;
  const art = iconUrl ? images.get(iconUrl) : undefined;

  if (art) {
    // Jewel item icons are square; fit them inside the ornate socket opening.
    const size = frame * 0.62;
    ctx.save();
    ctx.shadowColor = withAlpha(color, 0.8);
    ctx.shadowBlur = size * 0.35;
    ctx.drawImage(art, node.x - size / 2, node.y - size / 2, size, size);
    ctx.restore();

    return;
  }

  const radius = Math.max(2, frame * 0.2);
  ctx.save();
  ctx.beginPath();
  ctx.arc(node.x, node.y, radius, 0, TWO_PI);
  const gradient = ctx.createRadialGradient(node.x, node.y, radius * 0.1, node.x, node.y, radius);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.45, color);
  gradient.addColorStop(1, withAlpha(color, 0.65));
  ctx.fillStyle = gradient;
  ctx.shadowColor = color;
  ctx.shadowBlur = radius;
  ctx.fill();
  ctx.restore();
}

/** Blit a node's skill icon and overlay frame from the atlases. */
function blitNode(ctx: CanvasRenderingContext2D, node: ScreenNode, resources: RenderResources): boolean {
  // Masteries are drawn as their effect pattern, not as a node disc/icon.
  if (node.kind === 'mastery') {
    return true;
  }

  const iconKey = iconKeyFor(node.kind, node.icon, node.allocated);
  const drewIcon = iconKey ? blitFromAtlas(ctx, resources, iconKey, node.x, node.y, node.iconSize) : false;
  const frameKey = frameKeyFor(node.kind, node.allocated);
  const drewFrame = frameKey ? blitFromAtlas(ctx, resources, frameKey, node.x, node.y, node.frameSize) : false;

  // Drawing a frame counts as handled (e.g. an empty jewel socket has no icon).
  return drewIcon || drewFrame;
}

/** Draw a manifest sprite centred at (cx, cy) at the given screen size. */
function blitFromAtlas(
  ctx: CanvasRenderingContext2D,
  resources: RenderResources,
  key: string,
  cx: number,
  cy: number,
  size: number,
): boolean {
  const frame = resources.manifest.frames[key];

  if (!frame) {
    return false;
  }

  const img = resources.atlases[frame.atlas];

  if (!img) {
    return false;
  }

  ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, cx - size / 2, cy - size / 2, size, size);

  return true;
}

const TWO_PI = Math.PI * 2;

/**
 * Vector stand-in for the centre art: the ornate frame ring, a marker per class
 * at its rim position (`startAngle`), and a highlighted band pointing at the
 * active class — the visible proof of the core-derived rotation. Real atlas art
 * replaces this later; the geometry it sits on is identical.
 */
function drawCentre(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  viewport: Viewport,
  activeClassId: number | undefined,
  centreSprites: TreeViewProps['centreSprites'],
  images: Map<string, HTMLImageElement>,
): void {
  const layout = scene.centre;
  const c = projectPoint(viewport, layout.centre);
  const scale = viewport.scale;
  const active = layout.classes.find((cls) => cls.classId === activeClassId);

  const portrait = centreSprites?.portrait;
  const ringStatic = centreSprites?.ringStatic;
  const ringActive = centreSprites?.ringActive;
  const haveArt = Boolean(portrait || ringStatic || ringActive);

  // Layers back-to-front: portrait, rotating active band, ornate frame.
  if (portrait) {
    blitCentre(ctx, images.get(portrait.url), portrait, c.x, c.y, layout.ring.artRadius * scale, 0);
  }

  if (ringActive && active) {
    blitCentre(ctx, images.get(ringActive.url), ringActive, c.x, c.y, layout.ring.activeRadius * scale, active.ringRotation);
  }

  if (ringStatic) {
    blitCentre(ctx, images.get(ringStatic.url), ringStatic, c.x, c.y, layout.ring.frameRadius * scale, 0);
  }

  if (haveArt) {
    return;
  }

  // Vector stand-in when no art is supplied.
  ctx.beginPath();
  ctx.arc(c.x, c.y, layout.ring.frameRadius * scale, 0, TWO_PI);
  ctx.strokeStyle = 'rgba(217, 184, 106, 0.22)';
  ctx.lineWidth = Math.max(1, 3 * scale);
  ctx.stroke();

  if (active) {
    const span = Math.PI / 5;
    ctx.beginPath();
    ctx.arc(c.x, c.y, layout.ring.activeRadius * scale, active.startAngle - span, active.startAngle + span);
    ctx.strokeStyle = '#d9b86a';
    ctx.lineWidth = Math.max(2, 9 * scale);
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(c.x, c.y, layout.innerRadius * scale, 0, TWO_PI);
  ctx.strokeStyle = 'rgba(217, 184, 106, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** Blit a centre sprite centred on the hub, sized to a screen radius, rotated. */
function blitCentre(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | undefined,
  rect: CentreSprite,
  cx: number,
  cy: number,
  radius: number,
  rotation: number,
): void {
  if (!img) {
    return;
  }

  ctx.save();
  ctx.translate(cx, cy);

  if (rotation !== 0) {
    ctx.rotate(rotation);
  }

  ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, -radius, -radius, radius * 2, radius * 2);
  ctx.restore();
}

function withAlpha(hex: string, alpha: number): string {
  const value = parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
