import type { Scene, Viewport, WorldRect } from '@poe2-toolkit/tree-core';
import { nodeAt, screenToWorld } from '@poe2-toolkit/tree-core';
import { Application, Container, Graphics, ImageSource, Rectangle, Sprite, Texture } from 'pixi.js';
import { useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, Ref } from 'react';
import type { RenderResources } from './resources.js';
import { effectKeyFor, frameKeyFor, iconKeyFor } from './spriteKeys.js';

export interface TreeViewProps {
  /** Computed geometry from `@poe2-toolkit/tree-core`'s `buildScene`. */
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
const RAIL_COLOR = 0x7d6836;
const RAIL_GAP_ACTIVE = 0xfcde86;
const RAIL_GAP_INACTIVE = 0x000000;

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

/**
 * WebGL view over a core `Scene`, rendered with PixiJS. It owns nothing
 * geometric — pan, zoom, device-pixel sizing and hover hit-testing only;
 * positions, sizes and hit-testing all come from `@poe2-toolkit/tree-core`.
 *
 * The whole tree is built once as a Pixi scene graph in world space; panning and
 * zooming only set the world container's transform, so the GPU recomposites
 * without re-rasterising any sprites. That keeps a full-tree pan/zoom smooth even
 * on machines where Canvas2D `drawImage` falls back to the CPU.
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
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  // World-space layers, back-to-front.
  const centreLayerRef = useRef<Container | null>(null);
  const effectLayerRef = useRef<Container | null>(null);
  const connLayerRef = useRef<Graphics | null>(null);
  const nodeLayerRef = useRef<Container | null>(null);
  const ascLayerRef = useRef<Container | null>(null);
  const overlayRef = useRef<Graphics | null>(null);

  const viewportRef = useRef<Viewport | null>(null);
  const hoverRef = useRef<number | null>(null);
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const texRef = useRef<TexCtx>({ textures: new Map(), sources: new Map(), images: new Map() });
  const readyRef = useRef(false);

  // Latest-value refs the long-lived ticker closure reads without re-subscribing.
  const sceneRef = useRef(scene);
  const highlightRef = useRef<Set<number> | null>(highlight ?? null);
  const previewRef = useRef<AllocationPreview | null>(preview ?? null);
  const highlightActiveRef = useRef(false);
  const rebuildRef = useRef<(() => void) | null>(null);

  // Apply the current viewport to the world container and refresh the overlay.
  // O(1) — no sprite touches. Stable (reads refs), so panning/zooming never
  // rebuilds the scene graph.
  const sync = useCallback(() => {
    const world = worldRef.current;
    const viewport = viewportRef.current;

    if (!world || !viewport) {
      return;
    }

    world.scale.set(viewport.scale);
    world.position.set(viewport.tx, viewport.ty);
    drawOverlay(overlayRef.current, sceneRef.current, viewport, hoverRef.current, highlightRef.current, previewRef.current);
  }, []);

  // ---- Pixi application lifecycle -----------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    let cancelled = false;
    const app = new Application();

    void app
      .init({
        canvas,
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        // CSS sizing is owned by the `width/height: 100%` canvas style, not Pixi —
        // autoDensity would set explicit px and fight it, leaving a gap + scrollbar.
        autoDensity: false,
        preference: 'webgl',
        width: canvas.clientWidth || 800,
        height: canvas.clientHeight || 600,
      })
      .then(() => {
        if (cancelled) {
          app.destroy(true);

          return;
        }

        const world = new Container();
        const centreLayer = new Container();
        const effectLayer = new Container();
        const connLayer = new Graphics();
        const nodeLayer = new Container();
        const ascLayer = new Container();
        const overlay = new Graphics();
        world.addChild(centreLayer, effectLayer, connLayer, nodeLayer, ascLayer, overlay);
        app.stage.addChild(world);

        appRef.current = app;
        worldRef.current = world;
        centreLayerRef.current = centreLayer;
        effectLayerRef.current = effectLayer;
        connLayerRef.current = connLayer;
        nodeLayerRef.current = nodeLayer;
        ascLayerRef.current = ascLayer;
        overlayRef.current = overlay;
        readyRef.current = true;

        // Pulse the highlight rings each frame while a highlight set is active.
        app.ticker.add(() => {
          if (highlightActiveRef.current) {
            drawOverlay(
              overlayRef.current,
              sceneRef.current,
              viewportRef.current,
              hoverRef.current,
              highlightRef.current,
              previewRef.current,
            );
          }
        });

        rebuildRef.current?.();
      });

    return () => {
      cancelled = true;
      readyRef.current = false;

      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
    };
  }, []);

  // Keep the latest-value refs current (in an effect, never during render) and
  // refresh the overlay when its inputs change — no scene-graph rebuild.
  useEffect(() => {
    sceneRef.current = scene;
    highlightRef.current = highlight ?? null;
    previewRef.current = preview ?? null;
    highlightActiveRef.current = Boolean(highlight && highlight.size > 0);
    sync();
  }, [scene, highlight, preview, sync]);

  // ---- Scene graph build ---------------------------------------------------

  const rebuild = useCallback(() => {
    if (!readyRef.current) {
      return;
    }

    buildScene(
      {
        centreLayer: centreLayerRef.current,
        effectLayer: effectLayerRef.current,
        connLayer: connLayerRef.current,
        nodeLayer: nodeLayerRef.current,
        ascLayer: ascLayerRef.current,
      },
      scene,
      resources,
      centreSprites,
      activeClassId,
      activeAscendancy,
      texRef.current,
    );

    // Centre the view on first build, then keep it across rebuilds.
    const canvas = canvasRef.current;

    if (canvas && !viewportRef.current && canvas.clientWidth > 0) {
      viewportRef.current = centreViewport(scene, canvas.clientWidth, canvas.clientHeight);
    }

    sync();
  }, [scene, resources, centreSprites, activeClassId, activeAscendancy, sync]);

  useEffect(() => {
    rebuildRef.current = rebuild;
    rebuild();
  }, [rebuild]);

  // Load centre-art and jewel images (URLs, unlike the already-loaded atlas
  // bitmaps); rebuild as each arrives so its sprite appears.
  useEffect(() => {
    const urls = new Set<string>();

    for (const sprite of [centreSprites?.portrait, centreSprites?.ringStatic, centreSprites?.ringActive]) {
      if (sprite?.url) {
        urls.add(sprite.url);
      }
    }

    for (const node of scene.nodes) {
      if (node.jewel?.icon) {
        urls.add(node.jewel.icon);
      }
    }

    for (const url of urls) {
      if (texRef.current.images.has(url)) {
        continue;
      }

      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        texRef.current.images.set(url, image);
        rebuildRef.current?.();
      };
      image.src = url;
    }
  }, [scene, centreSprites]);

  // ---- Sizing --------------------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const observer = new ResizeObserver(() => {
      const app = appRef.current;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      if (!app || width <= 0 || height <= 0) {
        return;
      }

      app.renderer.resize(width, height);

      if (!viewportRef.current) {
        viewportRef.current = centreViewport(scene, width, height);
      } else {
        clampViewport(viewportRef.current, scene, width, height);
      }

      sync();
    });
    observer.observe(canvas);

    return () => observer.disconnect();
  }, [scene, sync]);

  // ---- Pointer interaction -------------------------------------------------

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
        sync();

        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const hit = hitTest(scene, viewport, event.clientX - rect.left, event.clientY - rect.top, activeAscendancy);

      if (hit !== hoverRef.current) {
        hoverRef.current = hit;
        const node = hit !== null ? scene.nodes.find((candidate) => candidate.skill === hit) : undefined;
        onNodeHover?.(hit, node ? worldToScreen(viewport, node.x, node.y) : undefined);
        drawOverlay(overlayRef.current, scene, viewport, hit, highlight ?? null, preview ?? null);
      }
    },
    [scene, sync, onNodeHover, activeAscendancy, highlight, preview],
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
          onNodeClick(hit, node ? worldToScreen(viewport, node.x, node.y) : { x: 0, y: 0 });
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

      const canvas = canvasRef.current;

      if (canvas) {
        clampViewport(viewport, scene, canvas.clientWidth, canvas.clientHeight);
      }

      sync();
    },
    [scene, sync],
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

  useEffect(() => {
    if (!focus) {
      return;
    }

    const canvas = canvasRef.current;

    if (!canvas || canvas.clientWidth <= 0 || canvas.clientHeight <= 0) {
      return;
    }

    const viewport = viewportForRect(focus, canvas.clientWidth, canvas.clientHeight);
    clampViewport(viewport, scene, canvas.clientWidth, canvas.clientHeight);
    viewportRef.current = viewport;
    sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ touchAction: 'none', cursor: 'grab', display: 'block', width: '100%', height: '100%', background: '#000000', ...style }}
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

// ===========================================================================
// Scene graph construction
// ===========================================================================

interface Layers {
  centreLayer: Container | null;
  effectLayer: Container | null;
  connLayer: Graphics | null;
  nodeLayer: Container | null;
  ascLayer: Container | null;
}

/** (Re)build the whole world scene graph from the scene + resources. */
function buildScene(
  layers: Layers,
  scene: Scene,
  resources: RenderResources | undefined,
  centreSprites: TreeViewProps['centreSprites'],
  activeClassId: number | undefined,
  activeAscendancy: string | undefined,
  tex: TexCtx,
): void {
  const { centreLayer, effectLayer, connLayer, nodeLayer, ascLayer } = layers;

  if (!centreLayer || !effectLayer || !connLayer || !nodeLayer || !ascLayer) {
    return;
  }

  centreLayer.removeChildren().forEach((child) => child.destroy());
  effectLayer.removeChildren().forEach((child) => child.destroy());
  nodeLayer.removeChildren().forEach((child) => child.destroy());
  ascLayer.removeChildren().forEach((child) => child.destroy());
  connLayer.clear();

  buildCentre(centreLayer, scene, centreSprites, activeClassId, tex);

  if (resources) {
    for (const effect of scene.masteryEffects) {
      const sprite = atlasSprite(resources, effectKeyFor(effect.patternKey), effect.x, effect.y, effect.size, tex);

      if (sprite) {
        sprite.alpha = effect.active ? 1 : 0.15;
        effectLayer.addChild(sprite);
      }
    }
  }

  // Main map excludes ascendancy nodes/edges: they live far out in world space
  // and are only drawn relocated into the hub when their disc is active (below).
  buildConnections(connLayer, scene.connections, false);

  for (const node of scene.nodes) {
    if (node.ascendancy) {
      continue;
    }

    buildNode(nodeLayer, node, resources, tex);
  }

  // Active ascendancy disc: its nodes relocated into the hub. The originals stay
  // at their far world anchor in `nodeLayer`; this is the game-style overlay.
  if (activeAscendancy) {
    const disc = scene.centre.ascendancies.find((a) => a.id === activeAscendancy);

    if (disc) {
      ascLayer.position.set(scene.centre.centre.x - disc.worldAnchor.x, scene.centre.centre.y - disc.worldAnchor.y);
      const ascConns = scene.connections.filter((conn) => conn.ascendancy === activeAscendancy);
      const ascGraphics = new Graphics();
      buildConnections(ascGraphics, ascConns, true);
      ascLayer.addChild(ascGraphics);

      for (const node of scene.nodes) {
        if (node.ascendancy === activeAscendancy) {
          buildNode(ascLayer, node, resources, tex);
        }
      }
    }
  }
}

/** Draw all connections as twin parallel rails into a Graphics (world units). */
function buildConnections(g: Graphics, connections: Scene['connections'], ascendancyOnly: boolean | null): void {
  const gap = RAIL_GAP;
  const rail = RAIL_WIDTH;

  // Inactive first (under), then active (on top). For each state a wide rail
  // stroke then a narrow gap stroke gives the twin-rail look.
  for (const active of [false, true]) {
    const want = connections.filter((conn) => {
      if (ascendancyOnly === false && conn.ascendancy) {
        return false;
      }

      return conn.active === active;
    });

    if (want.length === 0) {
      continue;
    }

    // Inactive ascendancy edges are a single solid black rail (matching the game).
    const gapColor = active ? RAIL_GAP_ACTIVE : ascendancyOnly ? null : RAIL_GAP_INACTIVE;

    addConnPaths(g, want);
    g.stroke({ width: gap + rail * 2, color: active ? RAIL_GAP_ACTIVE : RAIL_COLOR, cap: 'round' });

    if (gapColor !== null) {
      addConnPaths(g, want);
      g.stroke({ width: gap, color: gapColor, cap: 'round' });
    }
  }
}

/** Append every connection's path (line or arc) to the current Graphics path. */
function addConnPaths(g: Graphics, connections: Scene['connections']): void {
  for (const conn of connections) {
    if (conn.kind === 'arc' && conn.arc) {
      const { cx, cy, radius, startAngle, endAngle, clockwise } = conn.arc;
      g.moveTo(cx + radius * Math.cos(startAngle), cy + radius * Math.sin(startAngle));
      g.arc(cx, cy, radius, startAngle, endAngle, clockwise);
    } else {
      g.moveTo(conn.a.x, conn.a.y);
      g.lineTo(conn.b.x, conn.b.y);
    }
  }
}

/** Build a node's icon + frame sprites (and jewel gem) into the layer. */
function buildNode(layer: Container, node: Scene['nodes'][number], resources: RenderResources | undefined, tex: TexCtx): void {
  if (node.kind === 'mastery') {
    return; // drawn as its effect pattern
  }

  let drew = false;

  if (resources) {
    const iconKey = iconKeyFor(node.kind, node.icon, node.allocated);
    const icon = iconKey ? atlasSprite(resources, iconKey, node.x, node.y, node.iconSize, tex) : null;

    if (icon) {
      layer.addChild(icon);
      drew = true;
    }

    const frameKey = frameKeyFor(node.kind, node.allocated);
    const frame = frameKey ? atlasSprite(resources, frameKey, node.x, node.y, node.frameSize, tex) : null;

    if (frame) {
      layer.addChild(frame);
      drew = true;
    }
  }

  if (!drew) {
    const radius = Math.max(1.2, node.radius);
    const disc = new Graphics().circle(node.x, node.y, radius).fill({
      color: KIND_COLOR[node.kind] ?? 0xffffff,
      alpha: node.allocated ? 1 : 0.4,
    });
    layer.addChild(disc);
  }

  if (node.kind === 'jewel' && node.jewel) {
    const frame = node.frameSize > 0 ? node.frameSize : node.iconSize;
    const color = RARITY_COLOR[node.jewel.rarity ?? ''] ?? 0xd6d6d6;
    const iconUrl = node.jewel.icon;

    const sprite = iconUrl ? urlSprite(iconUrl, node.x, node.y, frame * 0.62, tex) : null;

    if (sprite) {
      layer.addChild(sprite);
    } else {
      const radius = Math.max(2, frame * 0.2);
      const gem = new Graphics().circle(node.x, node.y, radius).fill({ color });
      layer.addChild(gem);
    }
  }
}

/** Build the hub: portrait, rotating active ring, ornate frame — or a vector stand-in. */
function buildCentre(
  layer: Container,
  scene: Scene,
  centreSprites: TreeViewProps['centreSprites'],
  activeClassId: number | undefined,
  tex: TexCtx,
): void {
  const { centre, ring, classes } = scene.centre;
  const active = classes.find((cls) => cls.classId === activeClassId);

  const portrait = centreSprites?.portrait;
  const ringStatic = centreSprites?.ringStatic;
  const ringActive = centreSprites?.ringActive;
  const haveArt = Boolean(portrait || ringStatic || ringActive);

  const portraitSprite = portrait ? centreSprite(portrait, centre.x, centre.y, ring.artRadius, 0, tex) : null;
  const activeSprite = ringActive && active ? centreSprite(ringActive, centre.x, centre.y, ring.activeRadius, active.ringRotation, tex) : null;
  const staticSprite = ringStatic ? centreSprite(ringStatic, centre.x, centre.y, ring.frameRadius, 0, tex) : null;

  if (portraitSprite) {
    layer.addChild(portraitSprite);
  }

  if (activeSprite) {
    layer.addChild(activeSprite);
  }

  if (staticSprite) {
    layer.addChild(staticSprite);
  }

  if (haveArt) {
    return;
  }

  // Vector stand-in when no art is supplied.
  const g = new Graphics();
  g.circle(centre.x, centre.y, ring.frameRadius).stroke({ width: 3, color: 0xd9b86a, alpha: 0.22 });

  if (active) {
    const span = Math.PI / 5;
    g.arc(centre.x, centre.y, ring.activeRadius, active.startAngle - span, active.startAngle + span).stroke({
      width: 9,
      color: 0xd9b86a,
      cap: 'round',
    });
  }

  g.circle(centre.x, centre.y, scene.centre.innerRadius).stroke({ width: 1.5, color: 0xd9b86a, alpha: 0.6 });
  layer.addChild(g);
}

// ===========================================================================
// Textures & sprites
// ===========================================================================

/**
 * Texture-building context. Atlas bitmaps arrive as already-loaded
 * `HTMLImageElement`s; centre-art and jewel URLs are loaded lazily into
 * `images`. `sources` caches one `ImageSource` per bitmap, `textures` one
 * sub-texture per sprite key.
 */
interface TexCtx {
  textures: Map<string, Texture>;
  sources: Map<string, ImageSource>;
  images: Map<string, HTMLImageElement>;
}

/** One cached `ImageSource` per bitmap id (atlas name or URL). */
function sourceFor(id: string, image: HTMLImageElement, tex: TexCtx): ImageSource {
  let source = tex.sources.get(id);

  if (!source) {
    source = new ImageSource({ resource: image });
    tex.sources.set(id, source);
  }

  return source;
}

/** A Pixi sprite for a manifest key, centred at (x, y) and sized to a world diameter. */
function atlasSprite(resources: RenderResources, key: string, x: number, y: number, size: number, tex: TexCtx): Sprite | null {
  const texture = atlasTexture(resources, key, tex);

  if (!texture) {
    return null;
  }

  return placedSprite(texture, x, y, size);
}

/** Resolve (and cache) a sub-texture for a manifest key. */
function atlasTexture(resources: RenderResources, key: string, tex: TexCtx): Texture | null {
  const cached = tex.textures.get(key);

  if (cached) {
    return cached;
  }

  const frame = resources.manifest.frames[key];

  if (!frame) {
    return null;
  }

  const image = resources.atlases[frame.atlas];

  if (!(image instanceof HTMLImageElement)) {
    return null;
  }

  const source = sourceFor(frame.atlas, image, tex);
  const texture = new Texture({ source, frame: new Rectangle(frame.x, frame.y, frame.w, frame.h) });
  tex.textures.set(key, texture);

  return texture;
}

/**
 * A centre sprite (URL + sub-rect) centred on the hub, sized to a world radius,
 * rotated. Returns null until the source image has loaded (a later rebuild adds it).
 */
function centreSprite(rect: CentreSprite, cx: number, cy: number, radius: number, rotation: number, tex: TexCtx): Sprite | null {
  const image = tex.images.get(rect.url);

  if (!image) {
    return null;
  }

  const key = `${rect.url}#${rect.sx},${rect.sy},${rect.sw},${rect.sh}`;
  let texture = tex.textures.get(key);

  if (!texture) {
    texture = new Texture({ source: sourceFor(rect.url, image, tex), frame: new Rectangle(rect.sx, rect.sy, rect.sw, rect.sh) });
    tex.textures.set(key, texture);
  }

  const sprite = placedSprite(texture, cx, cy, radius * 2);
  sprite.rotation = rotation;

  return sprite;
}

/** A sprite from a plain image URL, centred and sized (jewel item icons). Null until loaded. */
function urlSprite(url: string, x: number, y: number, size: number, tex: TexCtx): Sprite | null {
  const image = tex.images.get(url);

  if (!image) {
    return null;
  }

  let texture = tex.textures.get(url);

  if (!texture) {
    texture = new Texture({ source: sourceFor(url, image, tex) });
    tex.textures.set(url, texture);
  }

  return placedSprite(texture, x, y, size);
}

/** A centred sprite at a world position, sized to a world diameter. */
function placedSprite(texture: Texture, x: number, y: number, size: number): Sprite {
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  sprite.position.set(x, y);
  sprite.setSize(size, size);

  return sprite;
}

// ===========================================================================
// Overlays (hover ring, search highlight, allocation preview) — world space
// ===========================================================================

/** Edge key matching the page's preview set: `min-max` of the two node ids. */
function edgeKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/**
 * Redraw the overlay Graphics: the hover ring, the pulsing search-highlight
 * rings, and the allocation preview rails. World space, so widths are divided by
 * the viewport scale to stay a constant on-screen thickness.
 */
function drawOverlay(
  g: Graphics | null,
  scene: Scene,
  viewport: Viewport | null,
  hover: number | null,
  highlight: Set<number> | null,
  preview: AllocationPreview | null,
): void {
  if (!g || !viewport) {
    return;
  }

  g.clear();
  const scale = viewport.scale;
  const px = (value: number): number => value / scale;

  // Allocation preview rails (under the rings).
  if (preview) {
    const color = preview.kind === 'remove' ? 0xeb6060 : 0xffe296;

    for (const conn of scene.connections) {
      if (!preview.edges.has(edgeKey(conn.from, conn.to))) {
        continue;
      }

      addConnPaths(g, [conn]);
      g.stroke({ width: px(9), color, alpha: 0.38, cap: 'round' });
      addConnPaths(g, [conn]);
      g.stroke({ width: px(4), color, alpha: 0.97, cap: 'round' });
    }
  }

  // Search highlight: soft glow + bright core, pulsing.
  if (highlight && highlight.size > 0) {
    const pulse = (Math.sin(performance.now() / 320) + 1) / 2;
    const glowAlpha = 0.2 + pulse * 0.45;
    const coreAlpha = 0.55 + pulse * 0.45;
    const grow = pulse * 5;

    for (const node of scene.nodes) {
      if (!highlight.has(node.skill) || node.kind === 'mastery') {
        continue;
      }

      const outline = (node.frameSize > 0 ? node.frameSize : node.iconSize) / 2 + px(6 + grow);
      g.circle(node.x, node.y, outline).stroke({ width: px(8), color: 0x3fae9f, alpha: glowAlpha });
      g.circle(node.x, node.y, outline).stroke({ width: px(3), color: 0x7df9e0, alpha: coreAlpha });
    }
  }

  // Hover ring.
  if (hover !== null) {
    const node = scene.nodes.find((candidate) => candidate.skill === hover);

    if (node && node.kind !== 'mastery') {
      const outline = (node.frameSize > 0 ? node.frameSize : node.iconSize) / 2 + px(3);
      g.circle(node.x, node.y, outline).stroke({ width: px(2), color: 0xffffff });
    }
  }
}

// ===========================================================================
// Viewport math & hit-testing (unchanged from the Canvas2D renderer)
// ===========================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Project a world point to screen pixels under a viewport. */
function worldToScreen(viewport: Viewport, x: number, y: number): { x: number; y: number } {
  return { x: x * viewport.scale + viewport.tx, y: y * viewport.scale + viewport.ty };
}

/** The scale at which the main tree fits the viewport. */
function fitScale(scene: Scene, width: number, height: number): number {
  const { minX, minY, maxX, maxY } = scene.mainBounds;
  const worldWidth = Math.max(1, maxX - minX);
  const worldHeight = Math.max(1, maxY - minY);

  return Math.min(width / worldWidth, height / worldHeight) * FIT_PADDING;
}

/** Default view: centred on the hub, zoomed so the portrait and nearby nodes fill the stage. */
function centreViewport(scene: Scene, width: number, height: number): Viewport {
  const { centre, ring } = scene.centre;
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

/** Keep the view sane: don't zoom out past the fit scale, don't pan the tree off-screen. */
function clampViewport(viewport: Viewport, scene: Scene, width: number, height: number): void {
  if (width <= 0 || height <= 0) {
    return;
  }

  viewport.scale = clamp(viewport.scale, fitScale(scene, width, height) * 0.85, MAX_SCALE);

  const { minX, minY, maxX, maxY } = scene.mainBounds;
  const { scale } = viewport;
  const marginX = Math.min(width, (maxX - minX) * scale) * 0.5;
  const marginY = Math.min(height, (maxY - minY) * scale) * 0.5;
  viewport.tx = clamp(viewport.tx, width - marginX - maxX * scale, marginX - minX * scale);
  viewport.ty = clamp(viewport.ty, height - marginY - maxY * scale, marginY - minY * scale);
}

/**
 * Hit-test that accounts for the relocated active ascendancy disc: try its
 * nodes (translated into the hub) first, then the main tree via core's nodeAt.
 */
function hitTest(scene: Scene, viewport: Viewport, sx: number, sy: number, activeAscendancy: string | undefined): number | null {
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
