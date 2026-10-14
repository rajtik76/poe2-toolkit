import type { Scene, Viewport, WorldRect } from '@poe2-toolkit/tree-core';
import { Application, BitmapText, Container, Graphics, ImageSource, Rectangle, Sprite, Texture } from 'pixi.js';
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, Ref } from 'react';
import { isDragMotion, pinchSpread, resolveZoomLimits, wheelZoomFactor, ZOOM_STEP, zoomedViewport } from './interaction.js';
import type { RenderResources } from './resources.js';
import {
  ascendancyDiscOwner,
  ascendancyOffset,
  DEFAULT_HIGHLIGHT,
  DEFAULT_TREE_COLORS,
  EDGE_OVERLAY_CORE_WIDTH,
  EDGE_OVERLAY_GLOW_WIDTH,
  highlightPulse,
  LABEL_MIN_SCALE,
  nodeVisual,
  outlineBase,
  previewStroke,
  railPasses,
  resolveHighlightStyle,
  resolveTreeColors,
} from './sceneStyle.js';
import { effectKeyFor } from './spriteKeys.js';
import type { AllocationPreview, CentreSprite, EdgeOverlay, HighlightStyle, ResolvedHighlightStyle, ResolvedTreeColors, TreeColors, ZoomLimits } from './types.js';
import type { ResolvedZoom } from './viewport.js';
import { centreViewport, clampViewport, edgeKey, hitTest, viewportForRect, worldToScreen } from './viewport.js';

export type { AllocationPreview, CentreSprite, EdgeOverlay, HighlightStyle, TreeColors, ZoomLimits } from './types.js';

export interface TreeViewProps {
  scene: Scene;
  resources?: RenderResources;
  activeClassId?: number;
  activeAscendancy?: string;
  /** Centre artwork (URL + source sub-rect each): `portrait` -> `ring.artRadius`, `ringStatic` -> `ring.frameRadius`, `ringActive` -> `ring.activeRadius`, rotated by the active class's `ringRotation`. */
  centreSprites?: {
    portrait?: CentreSprite;
    ringStatic?: CentreSprite;
    ringActive?: CentreSprite;
  };
  onNodeClick?: (skill: number, screen: { x: number; y: number }) => void;
  onNodeDoubleClick?: (skill: number) => void;
  onInteractStart?: () => void;
  /** Hover feedback: skill id (null when leaving) and the hovered node's centre in canvas px, to anchor UI to it. */
  onNodeHover?: (skill: number | null, screen?: { x: number; y: number }) => void;
  preview?: AllocationPreview | null;
  /** Edge groups painted over the base render, each in its own colour, in array order (a later group wins on a shared edge). Drawn under the rings. */
  edgeOverlays?: EdgeOverlay[] | null;
  controls?: Ref<TreeViewControls>;
  /** Off by default so the page can scroll over an embedded canvas. */
  wheelZoom?: boolean;
  /** World rect to frame. Re-frames whenever the object reference changes; `null` keeps the current view. */
  focus?: WorldRect | null;
  highlight?: Set<number> | null;
  highlightStyle?: HighlightStyle;
  colors?: TreeColors;
  debugIds?: boolean;
  zoom?: ZoomLimits;
  className?: string;
  style?: CSSProperties;
}

export interface TreeViewControls {
  zoomIn: () => void;
  zoomOut: () => void;
}

/** WebGL view over a core `Scene` (PixiJS). Pan and zoom only set the world container's transform, so nothing is re-rasterised. */
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
  edgeOverlays,
  controls,
  wheelZoom,
  focus,
  highlight,
  highlightStyle,
  colors,
  debugIds,
  zoom,
  className,
  style,
}: TreeViewProps): React.JSX.Element {
  // Pixi gets a private <canvas> inside our stable wrapper <div>: a canvas hosts one WebGL context for
  // life, so sharing one across StrictMode's dev double-mount would inherit the torn-down context.
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const centreLayerRef = useRef<Container | null>(null);
  const effectLayerRef = useRef<Container | null>(null);
  const connLayerRef = useRef<Graphics | null>(null);
  const nodeLayerRef = useRef<Container | null>(null);
  const ascLayerRef = useRef<Container | null>(null);
  const overlayRef = useRef<Graphics | null>(null);
  const labelLayerRef = useRef<Container | null>(null);

  const viewportRef = useRef<Viewport | null>(null);
  const hoverRef = useRef<number | null>(null);
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  // Active touch/pen pointers (client coords): one pans via dragRef, two pinch.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  // Spread between the pinch pointers on the previous move.
  const pinchRef = useRef<number | null>(null);
  const texRef = useRef<TexCtx>({ textures: new Map(), sources: new Map(), images: new Map() });
  const readyRef = useRef(false);

  const sceneRef = useRef(scene);
  const highlightRef = useRef<Set<number> | null>(highlight ?? null);
  const previewRef = useRef<AllocationPreview | null>(preview ?? null);
  const edgeOverlaysRef = useRef<EdgeOverlay[] | null>(edgeOverlays ?? null);
  const highlightActiveRef = useRef(false);
  const activeAscendancyRef = useRef(activeAscendancy);
  const rebuildRef = useRef<(() => void) | null>(null);

  // Refs so the ticker and callbacks read current values without re-subscribing; kept current in the effect below.
  const limitsRef = useRef<ResolvedZoom>(resolveZoomLimits(undefined));

  // Memoised on the fields, not the object, so a fresh inline literal with the same values doesn't retrigger the effects.
  const [glowAlphaTrough, glowAlphaPeak] = highlightStyle?.glowAlpha ?? [];
  const [coreAlphaTrough, coreAlphaPeak] = highlightStyle?.coreAlpha ?? [];
  const resolvedHighlightStyle = useMemo(
    () => resolveHighlightStyle(highlightStyle),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      highlightStyle?.glowColor,
      highlightStyle?.coreColor,
      highlightStyle?.glowWidth,
      highlightStyle?.coreWidth,
      highlightStyle?.radius,
      highlightStyle?.pulseMs,
      highlightStyle?.pulseGrow,
      glowAlphaTrough,
      glowAlphaPeak,
      coreAlphaTrough,
      coreAlphaPeak,
    ],
  );
  const highlightStyleRef = useRef<ResolvedHighlightStyle>(DEFAULT_HIGHLIGHT);

  // Memoised on the fields, not the object, so a fresh literal with the same values never rebuilds the scene graph.
  const resolvedColors = useMemo(
    () => resolveTreeColors(colors),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colors?.weaponSet1, colors?.weaponSet2, colors?.removePreview],
  );
  const colorsRef = useRef<ResolvedTreeColors>(DEFAULT_TREE_COLORS);

  // O(1), stable (reads refs), so panning/zooming never rebuilds the scene graph.
  const sync = useCallback(() => {
    const world = worldRef.current;
    const viewport = viewportRef.current;

    if (!world || !viewport) {
      return;
    }

    world.scale.set(viewport.scale);
    world.position.set(viewport.tx, viewport.ty);
    drawOverlay(
      overlayRef.current,
      sceneRef.current,
      viewport,
      hoverRef.current,
      highlightRef.current,
      previewRef.current,
      activeAscendancyRef.current,
      highlightStyleRef.current,
      colorsRef.current,
      edgeOverlaysRef.current,
    );

    // Debug labels are heavy: shown only once zoomed in far enough, otherwise the layer is skipped.
    if (labelLayerRef.current) {
      labelLayerRef.current.visible = viewport.scale > LABEL_MIN_SCALE;
    }

    // The ticker is stopped while idle (render-on-demand), so every state change reaching here must paint its own frame.
    appRef.current?.render();
  }, []);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    let disposed = false;
    const app = new Application();
    // Cleanup awaits the init promise before destroying, so a StrictMode/fast-remount cleanup never leaks the WebGL context.
    const ready = app
      .init({
        // Private canvas per Application (no `canvas` option).
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        // CSS owns sizing: autoDensity would set explicit px and leave a gap + scrollbar.
        autoDensity: false,
        preference: 'webgl',
        width: container.clientWidth || 800,
        height: container.clientHeight || 600,
        // Render-on-demand: the ticker runs only while the highlight pulse animates, every other change paints via `sync()`.
        autoStart: false,
      })
      .then(() => {
        // StrictMode runs this twice in dev: abandon a stale instance, its teardown is owned by the cleanup's `destroy`.
        if (disposed) {
          return;
        }

        const view = app.canvas;
        view.style.position = 'absolute';
        view.style.inset = '0';
        view.style.display = 'block';
        view.style.width = '100%';
        view.style.height = '100%';
        container.appendChild(view);

        const world = new Container();
        const centreLayer = new Container();
        const effectLayer = new Container();
        const connLayer = new Graphics();
        const nodeLayer = new Container();
        const ascLayer = new Container();
        const overlay = new Graphics();
        const labelLayer = new Container();
        labelLayer.visible = false;
        world.addChild(centreLayer, effectLayer, connLayer, nodeLayer, ascLayer, overlay, labelLayer);
        app.stage.addChild(world);

        appRef.current = app;
        worldRef.current = world;
        centreLayerRef.current = centreLayer;
        effectLayerRef.current = effectLayer;
        connLayerRef.current = connLayer;
        nodeLayerRef.current = nodeLayer;
        ascLayerRef.current = ascLayer;
        overlayRef.current = overlay;
        labelLayerRef.current = labelLayer;
        readyRef.current = true;

        app.ticker.add(() => {
          if (highlightActiveRef.current) {
            drawOverlay(
              overlayRef.current,
              sceneRef.current,
              viewportRef.current,
              hoverRef.current,
              highlightRef.current,
              previewRef.current,
              activeAscendancyRef.current,
              highlightStyleRef.current,
              colorsRef.current,
              edgeOverlaysRef.current,
            );
          }
        });

        rebuildRef.current?.();

        // The state-sync effect may have run while init was pending, when `start()` was a no-op on a null ref.
        // Catch up here, or an initially pulsing highlight would never animate.
        if (highlightActiveRef.current) {
          app.start();
        }
      });

    return () => {
      disposed = true;
      readyRef.current = false;

      if (appRef.current === app) {
        appRef.current = null;
      }

      // Destroy once init settles, releasing the WebGL context and canvas whether or not init had finished.
      void ready.then(() => app.destroy(true, { children: true }));
    };
  }, []);

  useEffect(() => {
    sceneRef.current = scene;
    highlightRef.current = highlight ?? null;
    previewRef.current = preview ?? null;
    edgeOverlaysRef.current = edgeOverlays ?? null;
    highlightStyleRef.current = resolvedHighlightStyle;
    // Per-frame pulse redraw only for a non-empty, animating set; a still ring is drawn once by `sync()`.
    highlightActiveRef.current = Boolean(highlight && highlight.size > 0 && resolvedHighlightStyle.pulseMs > 0);
    activeAscendancyRef.current = activeAscendancy;
    colorsRef.current = resolvedColors;
    limitsRef.current = resolveZoomLimits(zoom);

    // Ticker runs only while the pulse needs a per-frame redraw.
    if (highlightActiveRef.current) {
      appRef.current?.start();
    } else {
      appRef.current?.stop();
    }

    sync();
    // Depend on zoom's fields, not the object: a fresh literal with the same
    // values must not re-run the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, highlight, resolvedHighlightStyle, preview, edgeOverlays, activeAscendancy, resolvedColors, zoom?.maxScale, zoom?.minFitFactor, zoom?.overscroll, sync]);

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
        labelLayer: labelLayerRef.current,
      },
      scene,
      resources,
      centreSprites,
      activeClassId,
      activeAscendancy,
      texRef.current,
      debugIds ?? false,
      resolvedColors,
    );

    const canvas = containerRef.current;

    if (canvas && !viewportRef.current && canvas.clientWidth > 0) {
      viewportRef.current = centreViewport(scene, canvas.clientWidth, canvas.clientHeight);
    }

    sync();
  }, [scene, resources, centreSprites, activeClassId, activeAscendancy, debugIds, resolvedColors, sync]);

  useEffect(() => {
    rebuildRef.current = rebuild;
    rebuild();
  }, [rebuild]);

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

  useEffect(() => {
    const canvas = containerRef.current;

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
        clampViewport(viewportRef.current, scene, width, height, limitsRef.current);
      }

      sync();
    });
    observer.observe(canvas);

    return () => observer.disconnect();
  }, [scene, sync]);

  const zoomAt = useCallback(
    (px: number, py: number, factor: number) => {
      const viewport = viewportRef.current;

      if (!viewport) {
        return;
      }

      const next = zoomedViewport(viewport, px, py, factor, limitsRef.current.maxScale);
      viewport.scale = next.scale;
      viewport.tx = next.tx;
      viewport.ty = next.ty;

      const canvas = containerRef.current;

      if (canvas) {
        clampViewport(viewport, scene, canvas.clientWidth, canvas.clientHeight, limitsRef.current);
      }

      sync();
    },
    [scene, sync],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointersRef.current.size === 2) {
        const [a, b] = [...pointersRef.current.values()];

        if (a && b) {
          pinchRef.current = pinchSpread(a, b);
        }

        dragRef.current = null;
      } else {
        dragRef.current = { x: event.clientX, y: event.clientY, moved: false };
      }

      onInteractStart?.();
    },
    [onInteractStart],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const viewport = viewportRef.current;

      if (!viewport) {
        return;
      }

      const tracked = pointersRef.current;

      if (tracked.has(event.pointerId)) {
        tracked.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }

      if (tracked.size === 2 && pinchRef.current !== null) {
        const [a, b] = [...tracked.values()];

        if (a && b) {
          const dist = pinchSpread(a, b);

          if (pinchRef.current > 0 && dist > 0) {
            const rect = event.currentTarget.getBoundingClientRect();
            const midX = (a.x + b.x) / 2 - rect.left;
            const midY = (a.y + b.y) / 2 - rect.top;
            zoomAt(midX, midY, dist / pinchRef.current);
          }

          pinchRef.current = dist;
        }

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

        if (isDragMotion(dx, dy)) {
          drag.moved = true;
        }

        drag.x = event.clientX;
        drag.y = event.clientY;
        viewport.tx += dx;
        viewport.ty += dy;

        // Clamp the pan so the tree can't be dragged off-screen.
        const canvas = containerRef.current;

        if (canvas) {
          clampViewport(viewport, scene, canvas.clientWidth, canvas.clientHeight, limitsRef.current);
        }

        sync();

        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const hit = hitTest(scene, viewport, event.clientX - rect.left, event.clientY - rect.top, activeAscendancy);

      if (hit !== hoverRef.current) {
        hoverRef.current = hit;
        const node = hit !== null ? scene.nodes.find((candidate) => candidate.skill === hit) : undefined;
        onNodeHover?.(hit, node ? worldToScreen(viewport, node.x, node.y) : undefined);
        sync();
      }
    },
    [scene, sync, onNodeHover, activeAscendancy, zoomAt],
  );

  // Leaving the canvas ends the hover, or a tooltip stays pinned to the last node. Touch pointers are
  // exempt: they always "leave" on lift, which would wipe the tap-driven detail the caller just showed.
  const onPointerLeave = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === 'touch' || hoverRef.current === null) {
        return;
      }

      hoverRef.current = null;
      onNodeHover?.(null);
      sync();
    },
    [onNodeHover, sync],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.currentTarget.releasePointerCapture(event.pointerId);
      pointersRef.current.delete(event.pointerId);

      // Lifting one finger of a pinch: keep panning from the other, seeded at its position so the view doesn't jump.
      if (pinchRef.current !== null) {
        pinchRef.current = null;

        const remaining = [...pointersRef.current.values()][0];

        dragRef.current = remaining ? { x: remaining.x, y: remaining.y, moved: true } : null;

        return;
      }

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
    (event: ReactMouseEvent<HTMLDivElement>) => {
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

  useImperativeHandle(
    controls,
    () => ({
      zoomIn: () => {
        const canvas = containerRef.current;

        if (canvas) {
          zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, ZOOM_STEP);
        }
      },
      zoomOut: () => {
        const canvas = containerRef.current;

        if (canvas) {
          zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, 1 / ZOOM_STEP);
        }
      },
    }),
    [zoomAt],
  );

  useEffect(() => {
    const canvas = containerRef.current;

    if (!canvas || !wheelZoom) {
      return;
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomAt(event.clientX - rect.left, event.clientY - rect.top, wheelZoomFactor(event.deltaY));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => canvas.removeEventListener('wheel', onWheel);
  }, [wheelZoom, zoomAt]);

  useEffect(() => {
    if (!focus) {
      return;
    }

    const canvas = containerRef.current;

    if (!canvas || canvas.clientWidth <= 0 || canvas.clientHeight <= 0) {
      return;
    }

    const viewport = viewportForRect(focus, canvas.clientWidth, canvas.clientHeight);
    clampViewport(viewport, scene, canvas.clientWidth, canvas.clientHeight, limitsRef.current);
    viewportRef.current = viewport;
    sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  return (
    <div
      ref={containerRef}
      className={className}
      // Pixi's <canvas> is appended here. The wrapper is the stable React-owned host, so StrictMode remounts never disturb it.
      style={{ position: 'relative', overflow: 'hidden', touchAction: 'none', cursor: 'grab', width: '100%', height: '100%', background: '#000000', ...style }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerLeave}
      onLostPointerCapture={(event) => {
        dragRef.current = null;
        pointersRef.current.delete(event.pointerId);

        if (pointersRef.current.size < 2) {
          pinchRef.current = null;
        }
      }}
      onDoubleClick={onDoubleClick}
    />
  );
}

interface Layers {
  centreLayer: Container | null;
  effectLayer: Container | null;
  connLayer: Graphics | null;
  nodeLayer: Container | null;
  ascLayer: Container | null;
  labelLayer: Container | null;
}

function buildScene(
  layers: Layers,
  scene: Scene,
  resources: RenderResources | undefined,
  centreSprites: TreeViewProps['centreSprites'],
  activeClassId: number | undefined,
  activeAscendancy: string | undefined,
  tex: TexCtx,
  debugIds: boolean,
  colors: ResolvedTreeColors,
): void {
  const { centreLayer, effectLayer, connLayer, nodeLayer, ascLayer, labelLayer } = layers;

  if (!centreLayer || !effectLayer || !connLayer || !nodeLayer || !ascLayer || !labelLayer) {
    return;
  }

  centreLayer.removeChildren().forEach((child) => child.destroy());
  effectLayer.removeChildren().forEach((child) => child.destroy());
  nodeLayer.removeChildren().forEach((child) => child.destroy());
  ascLayer.removeChildren().forEach((child) => child.destroy());
  labelLayer.removeChildren().forEach((child) => child.destroy());
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

  // Ascendancy nodes/edges live far out in world space; they are drawn relocated into the hub only when their disc is active.
  buildConnections(connLayer, scene.connections, false, colors);

  for (const node of scene.nodes) {
    if (node.ascendancy) {
      continue;
    }

    buildNode(nodeLayer, node, resources, tex, colors);

    if (debugIds) {
      labelLayer.addChild(idLabel(node.skill, node.x, node.y));
    }
  }

  // Active ascendancy disc, relocated into the hub. The originals stay at their far world anchor in `nodeLayer`.
  const offset = ascendancyOffset(scene, activeAscendancy);
  const discOwner = ascendancyDiscOwner(scene, activeAscendancy);

  if (offset) {
    ascLayer.position.set(offset.x, offset.y);
    const ascConns = scene.connections.filter((conn) => conn.ascendancy === discOwner);
    const ascGraphics = new Graphics();
    buildConnections(ascGraphics, ascConns, true, colors);
    ascLayer.addChild(ascGraphics);

    for (const node of scene.nodes) {
      if (node.ascendancy === discOwner) {
        buildNode(ascLayer, node, resources, tex, colors);

        if (debugIds) {
          labelLayer.addChild(idLabel(node.skill, node.x + offset.x, node.y + offset.y));
        }
      }
    }
  }
}

function buildConnections(g: Graphics, connections: Scene['connections'], ascendancyOnly: boolean | null, colors: ResolvedTreeColors): void {
  for (const pass of railPasses(connections, ascendancyOnly, colors)) {
    addConnPaths(g, pass.connections);
    g.stroke({ width: pass.width, color: pass.color, cap: 'round' });
  }
}

/** Appends every connection's path to the current Graphics path, shifted by (ox, oy) to match a relocated ascendancy disc (the overlay layer has no transform). */
function addConnPaths(g: Graphics, connections: Scene['connections'], ox = 0, oy = 0): void {
  for (const conn of connections) {
    if (conn.kind === 'arc' && conn.arc) {
      const { cx, cy, radius, startAngle, endAngle, clockwise } = conn.arc;
      g.moveTo(cx + ox + radius * Math.cos(startAngle), cy + oy + radius * Math.sin(startAngle));
      g.arc(cx + ox, cy + oy, radius, startAngle, endAngle, clockwise);
    } else {
      g.moveTo(conn.a.x + ox, conn.a.y + oy);
      g.lineTo(conn.b.x + ox, conn.b.y + oy);
    }
  }
}

function buildNode(layer: Container, node: Scene['nodes'][number], resources: RenderResources | undefined, tex: TexCtx, colors: ResolvedTreeColors): void {
  const visual = nodeVisual(node, colors);

  if (!visual) {
    return; // mastery - drawn as its effect pattern
  }

  let drew = false;

  if (resources) {
    const icon = visual.icon ? atlasSprite(resources, visual.icon.key, node.x, node.y, node.iconSize, tex) : null;

    if (icon) {
      if (visual.icon!.tint !== null) {
        icon.tint = visual.icon!.tint;
      }

      layer.addChild(icon);
      drew = true;
    }

    const frame = visual.frame ? atlasSprite(resources, visual.frame.key, node.x, node.y, node.frameSize, tex) : null;

    if (frame) {
      if (visual.frame!.tint !== null) {
        frame.tint = visual.frame!.tint;
      }

      layer.addChild(frame);
      drew = true;
    }
  }

  if (!drew) {
    const disc = new Graphics().circle(node.x, node.y, visual.fallback.radius).fill({
      color: visual.fallback.color,
      alpha: visual.fallback.alpha,
    });
    layer.addChild(disc);
  }

  if (visual.jewel) {
    const sprite = visual.jewel.iconUrl ? urlSprite(visual.jewel.iconUrl, node.x, node.y, visual.jewel.spriteSize, tex) : null;

    if (sprite) {
      layer.addChild(sprite);
    } else {
      const gem = new Graphics().circle(node.x, node.y, visual.jewel.gemRadius).fill({ color: visual.jewel.gemColor });
      layer.addChild(gem);
    }
  }
}

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

/** Texture-building context: atlas bitmaps arrive loaded, centre-art and jewel URLs load lazily into `images`. */
interface TexCtx {
  textures: Map<string, Texture>;
  sources: Map<string, ImageSource>;
  images: Map<string, HTMLImageElement>;
}

function sourceFor(id: string, image: HTMLImageElement, tex: TexCtx): ImageSource {
  let source = tex.sources.get(id);

  if (!source) {
    source = new ImageSource({ resource: image });
    tex.sources.set(id, source);
  }

  return source;
}

function atlasSprite(resources: RenderResources, key: string, x: number, y: number, size: number, tex: TexCtx): Sprite | null {
  const texture = atlasTexture(resources, key, tex);

  if (!texture) {
    return null;
  }

  return placedSprite(texture, x, y, size);
}

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

/** Centre sprite sized to a world radius and rotated. Null until the image has loaded (a later rebuild adds it). */
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

function placedSprite(texture: Texture, x: number, y: number, size: number): Sprite {
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  sprite.position.set(x, y);
  sprite.setSize(size, size);

  return sprite;
}

/** Debug: a node's skill id on a black plate. BitmapText shares one glyph atlas, so thousands of labels batch into few draw calls (plain `Text` tanks zoom/pan). */
function idLabel(skill: number, x: number, y: number): Container {
  const label = new BitmapText({
    text: String(skill),
    style: { fontFamily: 'monospace', fontSize: 22, fill: 0xffe066 },
  });
  label.anchor.set(0.5);

  const plate = new Graphics()
    .rect(-label.width / 2 - 4, -label.height / 2 - 2, label.width + 8, label.height + 4)
    .fill({ color: 0x000000, alpha: 0.72 });

  const group = new Container();
  group.addChild(plate, label);
  group.position.set(x, y);

  return group;
}

/** Redraws the overlay. World space, so widths are divided by the viewport scale to keep a constant on-screen thickness. */
function drawOverlay(
  g: Graphics | null,
  scene: Scene,
  viewport: Viewport | null,
  hover: number | null,
  highlight: Set<number> | null,
  preview: AllocationPreview | null,
  activeAscendancy: string | undefined,
  highlightStyle: ResolvedHighlightStyle,
  colors: ResolvedTreeColors,
  edgeOverlays: EdgeOverlay[] | null = null,
): void {
  if (!g || !viewport) {
    return;
  }

  g.clear();
  const scale = viewport.scale;
  const px = (value: number): number => value / scale;

  // The active ascendancy's overlay must carry the same relocation offset as its nodes.
  const ascOffset = ascendancyOffset(scene, activeAscendancy);
  const discOwner = ascendancyDiscOwner(scene, activeAscendancy);
  const offsetFor = (ascendancy?: string): [number, number] =>
    ascOffset && ascendancy && ascendancy === discOwner ? [ascOffset.x, ascOffset.y] : [0, 0];

  if (edgeOverlays) {
    for (const overlay of edgeOverlays) {
      if (overlay.edges.size === 0) {
        continue;
      }

      for (const conn of scene.connections) {
        if (!overlay.edges.has(edgeKey(conn.from, conn.to))) {
          continue;
        }

        if (!conn.active && !overlay.includeInactive) {
          continue;
        }

        const [ox, oy] = offsetFor(conn.ascendancy);
        addConnPaths(g, [conn], ox, oy);
        g.stroke({ width: EDGE_OVERLAY_GLOW_WIDTH, color: overlay.color, alpha: 0.3, cap: 'round' });
        addConnPaths(g, [conn], ox, oy);
        g.stroke({ width: EDGE_OVERLAY_CORE_WIDTH, color: overlay.color, alpha: 0.95, cap: 'round' });
      }
    }
  }

  if (preview) {
    const stroke = previewStroke(preview, scale, colors);

    for (const conn of scene.connections) {
      if (!preview.edges.has(edgeKey(conn.from, conn.to))) {
        continue;
      }

      // A removal only cuts lit rails: never paint a dim connector in the removal colour.
      if (stroke.remove && !conn.active) {
        continue;
      }

      const [ox, oy] = offsetFor(conn.ascendancy);
      addConnPaths(g, [conn], ox, oy);
      g.stroke({ width: stroke.glowWidth, color: stroke.color, alpha: stroke.glowAlpha, cap: 'round' });
      addConnPaths(g, [conn], ox, oy);
      g.stroke({ width: stroke.coreWidth, color: stroke.color, alpha: stroke.coreAlpha, cap: 'round' });
    }

    // Ring every removed node, so a lone tip with no edge between two removed nodes still previews 1:1.
    if (stroke.remove) {
      for (const node of scene.nodes) {
        if (!preview.nodes.has(node.skill)) {
          continue;
        }

        const [ox, oy] = offsetFor(node.ascendancy);
        g.circle(node.x + ox, node.y + oy, node.radius * 0.92);
        g.stroke({ width: stroke.coreWidth, color: stroke.color, alpha: stroke.coreAlpha });
      }
    }
  }

  if (highlight && highlight.size > 0) {
    const hs = highlightStyle;
    const pulse = highlightPulse(hs, performance.now());

    for (const node of scene.nodes) {
      if (!highlight.has(node.skill) || node.kind === 'mastery') {
        continue;
      }

      const [ox, oy] = offsetFor(node.ascendancy);
      const outline = outlineBase(node) + px(hs.radius + pulse.grow);
      g.circle(node.x + ox, node.y + oy, outline).stroke({ width: px(hs.glowWidth), color: hs.glowColor, alpha: pulse.glowAlpha });
      g.circle(node.x + ox, node.y + oy, outline).stroke({ width: px(hs.coreWidth), color: hs.coreColor, alpha: pulse.coreAlpha });
    }
  }

  if (hover !== null) {
    const node = scene.nodes.find((candidate) => candidate.skill === hover);

    if (node && node.kind !== 'mastery') {
      const [ox, oy] = offsetFor(node.ascendancy);
      const outline = outlineBase(node) + px(3);
      g.circle(node.x + ox, node.y + oy, outline).stroke({ width: px(2), color: 0xffffff });
    }
  }
}
