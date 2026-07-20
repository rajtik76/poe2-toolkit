import type { PlacedNode, Scene } from '@poe2-toolkit/tree-core';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no ResizeObserver; TreeView only uses it to trigger a resize
// render, which none of these tests exercise.
class StubResizeObserver {
  observe(): void {}
  disconnect(): void {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = StubResizeObserver;

// jsdom never runs layout, so clientWidth/clientHeight are always 0 — TreeView
// treats that as "not laid out yet" and skips centring the viewport (and, with
// it, the first render). Stub a fixed size so the mount path behaves like a
// real, sized container.
Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 800 });
Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 600 });

// pixi.js needs a real WebGL context, which jsdom doesn't provide. Mock it with
// a minimal fake that records the calls the render-on-demand fix depends on:
// `init({ autoStart })`, `render()`, `start()`/`stop()`. Scene-graph classes
// (`Container`/`Graphics`/...) just need to support the chained calls
// `buildScene`/`drawOverlay` make against them.
class FakeContainer {
  children: FakeContainer[] = [];
  visible = true;
  position = { set: vi.fn() };
  scale = { set: vi.fn() };
  addChild(...kids: FakeContainer[]): FakeContainer | undefined {
    this.children.push(...kids);

    return kids[0];
  }
  removeChildren(): FakeContainer[] {
    const removed = this.children;
    this.children = [];

    return removed;
  }
  destroy = vi.fn();
}

class FakeGraphics extends FakeContainer {
  clear(): this {
    return this;
  }
  circle(): this {
    return this;
  }
  rect(): this {
    return this;
  }
  arc(): this {
    return this;
  }
  moveTo(): this {
    return this;
  }
  lineTo(): this {
    return this;
  }
  stroke(): this {
    return this;
  }
  fill(): this {
    return this;
  }
}

const appInstances: FakeApplication[] = [];

class FakeApplication {
  canvas = document.createElement('canvas');
  stage = new FakeContainer();
  ticker = { add: vi.fn() };
  renderer = { resize: vi.fn() };
  render = vi.fn();
  start = vi.fn();
  stop = vi.fn();
  destroy = vi.fn();
  initOptions: Record<string, unknown> | null = null;

  constructor() {
    appInstances.push(this);
  }

  async init(options: Record<string, unknown>): Promise<void> {
    this.initOptions = options;
  }
}

function latestApp(): FakeApplication | undefined {
  return appInstances.at(-1);
}

vi.mock('pixi.js', () => ({
  Application: FakeApplication,
  Container: FakeContainer,
  Graphics: FakeGraphics,
  Sprite: class extends FakeContainer {
    anchor = { set: vi.fn() };
    setSize = vi.fn();
  },
  BitmapText: class extends FakeContainer {
    anchor = { set: vi.fn() };
    width = 0;
    height = 0;
  },
  Texture: class {},
  ImageSource: class {},
  Rectangle: class {
    constructor(
      public x: number,
      public y: number,
      public w: number,
      public h: number,
    ) {}
  },
}));

const { TreeView } = await import('../src/TreeView.js');

function makeScene(over: { nodes?: PlacedNode[] } = {}): Scene {
  const mainBounds = { minX: 0, minY: 0, maxX: 1000, maxY: 500 };

  return {
    nodes: over.nodes ?? [],
    connections: [],
    masteryEffects: [],
    bounds: mainBounds,
    mainBounds,
    centre: {
      centre: { x: 0, y: 0 },
      innerRadius: 100,
      ring: { artRadius: 1000, activeRadius: 1100, frameRadius: 1200 },
      classes: [],
      ascendancies: [],
    },
  };
}

// Flush the microtask queue so `app.init(...).then(...)` (unawaited by
// TreeView itself) settles before assertions run.
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('TreeView render-on-demand', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    appInstances.length = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('initialises the Pixi application with autoStart disabled', async () => {
    await act(async () => {
      root.render(<TreeView scene={makeScene()} />);
    });
    await flush();

    expect(latestApp()?.initOptions).toMatchObject({ autoStart: false });
  });

  it('renders one frame after the initial scene build, with the ticker left stopped', async () => {
    await act(async () => {
      root.render(<TreeView scene={makeScene()} />);
    });
    await flush();

    expect(latestApp()?.render).toHaveBeenCalled();
    expect(latestApp()?.start).not.toHaveBeenCalled();
  });

  it('does not render additional frames while idle (no perpetual loop)', async () => {
    // A stable scene reference: TreeView legitimately rebuilds (and repaints)
    // whenever `scene` changes identity, so re-rendering with a *fresh* scene
    // object each time wouldn't test idleness — it'd just retrigger the
    // rebuild path, same as a real prop change.
    const scene = makeScene();

    await act(async () => {
      root.render(<TreeView scene={scene} />);
    });
    await flush();

    // Pin down an exact count (not just "unchanged from whatever it was") so
    // this test can't pass vacuously if mount itself stopped rendering: with
    // the fix reverted (`render` never wired up) both counts would be equal
    // at 0 and this assertion would still catch it.
    const callsAfterMount = latestApp()?.render.mock.calls.length ?? 0;
    expect(callsAfterMount).toBeGreaterThan(0);

    // Re-rendering with wholly unchanged props must not paint extra frames —
    // otherwise the fix regresses back into a per-frame loop.
    await act(async () => {
      root.render(<TreeView scene={scene} />);
    });
    await flush();

    expect(latestApp()?.render.mock.calls.length).toBe(callsAfterMount);
  });

  it('starts the ticker for a pulsing highlight that is already active on the first render', async () => {
    // Regression test: mounting directly with an active highlight raced the
    // async `app.init()` against the state-sync effect that toggles
    // start()/stop() — the toggle used to run while `appRef.current` was
    // still null, silently no-op'ing and leaving the pulse un-started.
    await act(async () => {
      root.render(<TreeView scene={makeScene()} highlight={new Set([1])} />);
    });
    await flush();

    expect(latestApp()?.start).toHaveBeenCalledTimes(1);
  });

  it('starts the ticker only while a pulsing highlight is active, and stops it once cleared', async () => {
    await act(async () => {
      root.render(<TreeView scene={makeScene()} />);
    });
    await flush();

    expect(latestApp()?.start).not.toHaveBeenCalled();

    await act(async () => {
      root.render(<TreeView scene={makeScene()} highlight={new Set([1])} />);
    });
    await flush();

    expect(latestApp()?.start).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(<TreeView scene={makeScene()} highlight={null} />);
    });
    await flush();

    expect(latestApp()?.stop).toHaveBeenCalled();
  });

  it('renders a frame when a still (non-pulsing) highlight is set, without starting the ticker', async () => {
    await act(async () => {
      root.render(<TreeView scene={makeScene()} />);
    });
    await flush();
    const callsBefore = latestApp()?.render.mock.calls.length ?? 0;

    await act(async () => {
      root.render(<TreeView scene={makeScene()} highlight={new Set([1])} highlightStyle={{ pulseMs: 0 }} />);
    });
    await flush();

    expect(latestApp()?.start).not.toHaveBeenCalled();
    expect(latestApp()?.render.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});
