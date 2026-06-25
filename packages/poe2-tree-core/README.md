# @poe2-toolkit/tree-core

[![npm](https://img.shields.io/npm/v/@poe2-toolkit/tree-core.svg)](https://www.npmjs.com/package/@poe2-toolkit/tree-core)
[![types included](https://img.shields.io/badge/types-included-blue.svg)](#)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](#)
[![ESM only](https://img.shields.io/badge/module-ESM-f7df1e.svg)](#)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Headless, framework-agnostic geometry engine for the **Path of Exile 2 passive
tree**. Feed it the official tree data and a build's allocation; get back a fully
positioned, correctly sized `Scene` that any renderer can draw.

Pure TypeScript, zero runtime dependencies, no DOM, no canvas, no framework.

> **Live demo:** this engine drives the passive tree at
> [poe.rajtik.com/tree](https://poe.rajtik.com/tree) (rendered via
> [`@poe2-toolkit/tree-react`](../poe2-tree-react)).

```ts
import { buildScene, project } from '@poe2-toolkit/tree-core';
import { normalizeGggTree } from '@poe2-toolkit/tree-core/ggg'; // data adapter, opt-in

const data = normalizeGggTree(rawDataJson, '0_5');
const scene = buildScene(data, { allocation });
const screen = project(scene, viewport, { width: 1280, height: 720 });
// `screen` is pixel-space: walk the arrays and blit. No math left for the view.
```

The engine entry point is **source-agnostic**: it works against the `TreeData`
contract and never imports anything GGG-specific. Turning a particular export
into `TreeData` is a separate, swappable adapter; the one for GGG's official
`data.json` lives in the `@poe2-toolkit/tree-core/ggg` subpath.

## Contents

- [Why](#why)
- [Install](#install)
- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [The data model (`TreeData`)](#the-data-model-treedata)
- [The output (`Scene`)](#the-output-scene)
- [Coordinate spaces and projection](#coordinate-spaces-and-projection)
- [Build allocation](#build-allocation)
- [Interactive editing](#interactive-editing)
- [Graphics: the sprite manifest](#graphics-the-sprite-manifest)
- [Geometry rules](#geometry-rules)
- [What gets filtered out](#what-gets-filtered-out)
- [API reference](#api-reference)
- [Design principles](#design-principles)
- [License and credits](#license-and-credits)

## Why

Existing PoE2 tree renderers ship as whole applications, not reusable libraries,
and they tend to hard-code node sizes and positions as magic constants. The goal
here is the opposite: **from the input data alone, the engine knows exactly where
everything is and how big it is.** Sizes, connections, and the central hub
geometry are derived from the source data, never hand-tuned. "Looks like the
game" becomes a property of the data, not of each author's guesswork.

The package is deliberately split into two halves so the geometry can be reused
anywhere:

- **`@poe2-toolkit/tree-core`** (this package) does all the math and owns no pixels.
- A thin view adapter (e.g. `@poe2-toolkit/tree-react`) draws what core computed and owns
  no math. The same `Scene` contract is open to Vue, Svelte, or any other view.

## Install

```sh
npm install @poe2-toolkit/tree-core
```

ESM only. Node 18+. Ships its own `.d.ts`.

## How it works

The engine is a small pipeline. Each stage has one job and a plain data contract
between it and the next:

```
your data --[adapter]--> TreeData --[buildScene]--> Scene --[project]--> ScreenScene
                         (source)                    (world)             (pixels)
```

1. **Adapter:** turn a source export into the clean
   [`TreeData`](#the-data-model-treedata) contract. The engine ships one adapter,
   `normalizeGggTree(raw, version)` from `@poe2-toolkit/tree-core/ggg`, for GGG's official
   `data.json`. It is the only code that knows GGG's field names and quirks, and
   it is tolerant by design: optional fields come and go across patches, and
   missing data never throws. To support another source, write another adapter
   that returns `TreeData`, and nothing downstream changes.

2. **`buildScene(data, { allocation })`** assembles a render-ready
   [`Scene`](#the-output-scene): every node positioned and sized in world space,
   every edge resolved to a line or an arc, every effect pattern placed, the
   central hub laid out, and each node marked allocated or not for the given
   build. Nothing geometric is left for the renderer.

3. **`project(scene, viewport, size)`** maps the world-space `Scene` to a
   `ScreenScene` of pixel coordinates, culled to the viewport. The renderer walks
   the resulting arrays and blits, with no `* scale` or `+ offset` of its own.

`nodeAt`, `toggleAllocation`, `allocatedBounds`, and friends sit alongside the
pipeline to cover what an interactive UI needs (hit-testing, click-to-allocate,
view framing).

## Quick start

```ts
import { buildScene, project, nodeAt, toggleAllocation } from '@poe2-toolkit/tree-core';
import { normalizeGggTree } from '@poe2-toolkit/tree-core/ggg';

// 1. Normalize the official export once (cache the result per tree version).
const data = normalizeGggTree(rawDataJson, '0_5');

// 2. Build a scene for the current allocation. Omit `allocation` for an
//    unallocated tree.
const allocation = { classId: 1, ascendId: 'Lich', allocated: [/* skill ids */] };
const scene = buildScene(data, { allocation });

// 3. Project to the viewport, then draw `screen.nodes` / `.connections` /
//    `.masteryEffects` however you like.
const viewport = { tx: 640, ty: 360, scale: 0.1 };
const screen = project(scene, viewport, { width: 1280, height: 720 });

// 4. Hit-test a click and toggle that node in a manual build.
const hit = nodeAt(scene, viewport, mouseX, mouseY);
if (hit !== null) {
  const next = toggleAllocation(data, data.classes[1].startNode, new Set(allocation.allocated), hit);
  // re-run buildScene with the new `next` array.
}
```

## The data model (`TreeData`)

`TreeData` is the normalized source shape. Everything downstream reads from it;
nothing downstream knows about GGG's raw field names.

```ts
interface TreeData {
  version: string;                 // tree/patch version, e.g. "0_5"
  constants: { centreInnerRadius: number };
  groups: Record<number, Group>;   // orbit clusters, keyed by group id
  nodes: Record<number, TreeNode>; // every node, keyed by skill id
  classes: ClassDef[];             // central art + ascendancy metadata per class
  jewelSlots: number[];            // skill ids that are jewel sockets
  bounds: WorldRect;               // world extent of the whole tree
}
```

A `TreeNode` carries baked world coordinates plus the flags and metadata the
engine needs:

```ts
interface TreeNode {
  skill: number;
  group: number;                   // direct index into `groups`
  orbit: number;
  orbitIndex: number;
  x: number; y: number;            // world position, baked by GGG's export
  connections: NodeConnection[];   // neighbours (in + out, merged)
  name: string;
  icon: string;                    // atlas key into the sprite manifest
  stats: string[];

  // kind flags (optional; absence = plain small node)
  isNotable?: boolean;
  isKeystone?: boolean;
  isJewelSocket?: boolean;
  isMastery?: boolean;
  isAscendancyStart?: boolean;
  isAttribute?: boolean;
  noRadius?: boolean;              // hidden special socket (Sinister sockets)

  // metadata
  activeEffectImage?: string;      // background pattern key (notables + masteries)
  ascendancyName?: string;         // e.g. "Deadeye"
  flavourText?: string;            // keystone lore
  options?: NodeOption[];          // attribute nodes: Str / Dex / Int choices
  conditional?: boolean;           // hidden unless unlocked (e.g. by ascendancy)
  unlockAscendancy?: string;
  unlockNodes?: number[];          // ids that must all be allocated to reveal it
  classesStart?: string[];         // class-start node: which classes start here
}
```

The source of all this is GGG's official skill-tree export. Two things matter for
understanding the shape:

- **Positions are baked.** GGG ships each node's world `x`/`y` directly and omits
  the orbit-radius constants needed to recompute them, so the engine reads the
  coordinates as-is. `orbit`/`orbitIndex` are kept for reference but positions do
  not depend on them.
- **Sizes are derived.** GGG ships no per-node sizes, so the engine derives them
  from a fixed size per node type (see [Geometry rules](#geometry-rules)).

## The output (`Scene`)

`buildScene` returns a `Scene`: everything positioned and sized in world space,
ready to project and draw.

```ts
interface Scene {
  nodes: PlacedNode[];             // positioned + sized + allocation state
  connections: PlacedConnection[]; // each resolved to a line or an arc
  masteryEffects: PlacedEffect[];  // background patterns (notables + masteries)
  centre: CentreLayout;            // hub geometry + per-class ring rotation
  bounds: WorldRect;               // whole tree, including far ascendancy discs
  mainBounds: WorldRect;           // main tree only (use this to fit the view)
}
```

Each `PlacedNode` carries its world centre, icon and frame diameters, a hit-test
radius, its `kind` (`normal`, `notable`, `keystone`, `mastery`, `jewel`,
`attribute`, `classStart`, `ascendancyStart`, `ascendancyNormal`,
`ascendancyNotable`), whether it is allocated, its owning ascendancy if any, and
any jewel socketed into it.

> Use `mainBounds`, not `bounds`, to frame the initial view. Ascendancy discs sit
> thousands of world units out from the main tree, so fitting `bounds` would
> leave the main tree a tiny speck in the middle.

## Coordinate spaces and projection

There are two spaces, and the boundary between them is `project`:

- **World space:** the tree's own coordinate system, as it comes out of
  `buildScene`. Stable, view-independent.
- **Screen space:** pixels, after applying a `Viewport`
  (`screen = world * scale + (tx, ty)`).

```ts
const screen = project(scene, viewport, { width, height });
// screen.nodes / .connections / .masteryEffects are in pixels and culled
// to the viewport. screen.scale is provided for line widths and LOD.
```

Going the other way:

- `projectPoint(viewport, point)`: world point to pixels.
- `screenToWorld(viewport, sx, sy)`: pixels to a world point.
- `nodeAt(scene, viewport, sx, sy)`: the skill id under a pixel, or `null`
  (the closest node whose footprint contains the point). Masteries and ascendancy
  nodes are excluded from hit-testing.

`project` culls to the viewport and drops nodes whose projected radius is below
a fraction of a pixel (a cheap level-of-detail pass), so it stays fast even fully
zoomed out.

## Build allocation

A character's tree state is the only build input the engine needs. Whatever
produces it (a Path of Building export decoder, the GGG OAuth API, a manual
editor) is none of the engine's concern. Gems and items do not affect the tree
and are deliberately absent.

```ts
interface BuildAllocation {
  classId?: number;                // matches ClassDef.id; only the editable planner needs it (to find the class start node for pathing)
  ascendId?: string;               // matches AscendancyDef.id, e.g. "Lich"
  allocated: number[];             // allocated skill ids (basic + both weapon sets)
  weaponSets?: Record<number, 1 | 2>; // node id -> weapon set; absent = basic/shared
  attributeChoices?: Record<number, 'str' | 'dex' | 'int'>;
  jewels?: Record<number, JewelInfo>; // display-only, keyed by socket node id
  treeVersion?: string;
}
```

`attributeChoices` lets a generic `+attribute` node render its chosen Str/Dex/Int
icon and stat instead of the generic "any". `jewels` is display-only metadata
keyed by socket node id; the engine never applies a jewel's radius to nearby
nodes (PoE2 jewels grant global stats).

`weaponSets` carries PoE2's two weapon sets: a node tagged `1` or `2` is active
only when that set is equipped, while an untagged (basic) node is active in both.
Keystones, jewel sockets and ascendancy nodes are always basic. `buildScene`
stamps each placed node and active rail with its `weaponSet` so a renderer can
tint the two sets apart from the shared tree.

## Interactive editing

For a build editor, the allocation helpers turn clicks into a new allocated set.
They are pure graph functions, free of any rendering concern.

```ts
import { buildTreeGraph, toggleAllocation } from '@poe2-toolkit/tree-core';

// Build the walkable adjacency graph once and reuse it across clicks.
const graph = buildTreeGraph(data);

// Click a node: allocate the shortest path to it from the class start, or, if it
// is already allocated, remove it and everything beyond it.
const next = toggleAllocation(data, classStartNode, new Set(allocated), clickedSkill, graph);
```

The model:

- **Allocate:** clicking an unallocated node allocates the shortest path to it
  from the class start (plus the current allocation). `pathToNode` is the
  underlying breadth-first search.
- **Remove:** clicking an allocated node removes the node and everything that
  depended on it (the nodes orphaned from the start once it is cut), matching
  Path of Building — a node depends on itself, so a tip removes just itself.
  `removalSet` computes exactly which nodes a click removes, so a UI can preview
  the removal before committing it.

For **weapon sets**, `toggleAllocationInMode` is the mode-aware counterpart: it
takes a `{ allocated, weaponSets }` state and a paint mode (`0` basic, `1`/`2`
for the sets) and returns the next state. A set path roots only at the shared
tree or the same set — it never crosses the other set — and forced-basic nodes
(keystones, jewel sockets, ascendancy) stay shared whatever the mode.
`weaponSetRemovalSet` is the set-aware `removalSet`.

Ascendancy points are a separate pool. `toggleAscendancyAllocation` paths within
a single ascendancy's own subgraph (rooted at its start node) and leaves the
main-tree allocation untouched, using `buildAscendancyGraph` and
`ascendancyStartNode`.

For framing the view, `allocatedBounds(scene)` returns the world bounds of the
allocated nodes (handy to zoom to a freshly imported build), and
`classBounds(scene, classId)` returns the bounds of one class's sector of the
tree.

## Graphics: the sprite manifest

Core owns no pixels. It produces atlas **keys** (`node.icon`, the centre art
keys, effect pattern keys) and leaves the bitmaps to the renderer. The renderer
supplies a `SpriteManifest` that maps each key to a sub-rect inside an atlas, and
resolves atlas ids to actual images itself:

```ts
interface SpriteManifest {
  frames: Record<string, { atlas: string; x: number; y: number; w: number; h: number }>;
}
```

This keeps the engine atlas-agnostic and lets the consumer ship whatever
graphics it has rights to. Art is never bundled with the package.

## Geometry rules

Everything the engine computes is derived from the data. The rules worth knowing:

- **Positions are read, not computed.** GGG bakes world `x`/`y` into every node;
  `buildScene` reads them. (The convention behind the baked coordinates: angle 0
  points up and increases clockwise, so a node sits at
  `x = group.x + r·sin(angle)`, `y = group.y − r·cos(angle)`.)
- **Sizes follow a fixed per-type table.** Icon, overlay frame, and effect-pattern
  diameters come from `nodeTargetSize`, whose constants and cascade order match
  Path of Building's `GetNodeTargetSize` (the reference renderer). The first
  matching type wins.
- **The 2× rule.** The game draws each sprite at twice its native width, centred
  on the node, so the world diameter is `2 × targetWidth`. `buildScene` folds the
  factor in; the renderer just scales by the viewport.
- **Connections are lines or arcs.** Each edge carries its arc centre when it
  bows; the renderer sweeps the minor arc around that centre, and draws a straight
  line when there is none. The centre comes from GGG's `edges` table (`orbitX`/`orbitY`);
  the renderer sweeps the shorter arc around it (handedness matching Path of
  Building's `BuildConnector`), and curved connectors span different groups too,
  not just same-orbit chords. No geometric guessing from shared group/orbit.
- **The hub rotates per class.** The central gold ring rotates to point at the
  active class. The rotation is derived from the direction of the class's start
  node: `ringRotation = π/2 + atan2(start.y − cy, start.x − cx)`. That same
  direction is where the class sits on the rim.
- **Ascendancies are relocatable blocks.** GGG bakes each ascendancy's nodes at a
  far-flung cluster. The engine exposes the disc's `worldAnchor` so the renderer
  can translate it into the hub (how the game shows it) or leave it where the
  export put it.

## What gets filtered out

`buildScene` drops a few things that exist in the data but are not part of the
playable, drawn tree, to match what the official tree shows:

- **Class-start nodes:** invisible launch points; their edges would dangle.
- **Hidden special sockets:** the "Sinister Jewel Socket" decorations, which the
  official tree never draws.
- **Conditional nodes:** entries gated by `unlockConstraint` (such as the
  Oracle-only passives). Hidden on the default tree and revealed (with their
  edges) once all their unlock nodes are allocated, matching the game.
- **Mastery edges:** masteries render as a background pattern, not a connectable
  node, so edges to and from them are dropped.
- **Main-tree to ascendancy edges:** the ascendancy is a separate, relocated
  panel, so the link crossing that boundary is not drawn.

These are skipped in the scene; the data still contains them.

## API reference

**Pipeline** (from `@poe2-toolkit/tree-core`)

| Export | Signature | Purpose |
| --- | --- | --- |
| `buildScene` | `(data: TreeData, opts?: SceneOptions) => Scene` | World-space, render-ready scene. |
| `project` | `(scene: Scene, viewport: Viewport, size: Size) => ScreenScene` | Project + cull to pixels. |

**Source adapter** (from `@poe2-toolkit/tree-core/ggg`)

| Export | Signature | Purpose |
| --- | --- | --- |
| `normalizeGggTree` | `(raw: GggTreeJson, version: string) => TreeData` | Normalize GGG's official export into `TreeData`. |

**Projection and hit-testing**

| Export | Purpose |
| --- | --- |
| `projectPoint` | World point to pixels. |
| `screenToWorld` | Pixels to a world point. |
| `nodeAt` | Skill id under a pixel, or `null`. |
| `nodePosition` | World position of a node by skill id. |

**Layout helpers**

| Export | Purpose |
| --- | --- |
| `computeCentreLayout` | Hub geometry + per-class ring rotation. |
| `placeConnection` | Resolve one edge to a line or an arc. |
| `classifyNode` | Node's render `kind`. |
| `nodeTargetSize` | Derived icon/overlay/effect sizes. |
| `chosenAttributeOption` | The Str/Dex/Int option a build picked for a node. |
| `classOverrideNode` | The node a class shows at a position (per-class name/stats/icon override). |
| `allocatedBounds` | World bounds of the allocated nodes. |
| `allocatedBoundsWithCentre` | Allocated bounds grown to include the centre hub (for framing a fresh import). |
| `classBounds` | World bounds of a class's tree sector. |

**Interactive editing**

| Export | Purpose |
| --- | --- |
| `buildTreeGraph` | Walkable adjacency graph of the main tree. |
| `toggleAllocation` | Allocate the path to a node, or remove the node and its dependents. |
| `toggleAllocationInMode` | Weapon-set-aware `toggleAllocation` (basic / set I / set II paint mode). |
| `pathToNode` | Shortest path (BFS) between a node set and a target (with an optional blocked set). |
| `reachable` | Nodes still connected to a set of roots. |
| `removalSet` | Exactly which nodes a removal click drops. |
| `weaponSetRemovalSet` | Set-aware `removalSet`, respecting each set's connectivity. |
| `buildAscendancyGraph` | Adjacency graph of one ascendancy. |
| `ascendancyStartNode` | An ascendancy's pathing root. |
| `toggleAscendancyAllocation` | Edit within one ascendancy's subgraph. |
| `clearAscendancyAllocation` | Drop one ascendancy's allocated nodes (on ascendancy switch). |
| `freshAllocation` | A blank allocation for a class (on class switch). |

All types are exported from the main entry as well (`TreeData`, `TreeNode`,
`Scene`, `PlacedNode`, `BuildAllocation`, `WeaponSet`, `AllocMode`,
`WeaponSetAllocation`, `Viewport`, `ScreenScene`, `SpriteManifest`, `TreeGraph`,
`NodeSize`, and the rest). The GGG raw shape `GggTreeJson` is exported from the
`@poe2-toolkit/tree-core/ggg` subpath.

## Design principles

- **Data in, scene out.** Fidelity is a property of the data. No magic-constant
  positioning or sizing leaks into application code.
- **Pure and headless.** Zero runtime dependencies. No DOM, no canvas, no
  framework. Every function is a deterministic transform over plain data.
- **Source-agnostic core.** The engine entry point knows only the `TreeData`
  contract; data-source adapters live in their own subpaths (`@poe2-toolkit/tree-core/ggg`
  today). Swapping or adding a source touches nothing downstream.
- **One boundary, many producers.** The engine takes an allocation and nothing
  more. Import/export formats, OAuth, and manual editors all just produce that
  allocation.
- **Tolerant normalization.** An adapter is the only code that knows a raw export
  shape, and it never throws on missing or shifting fields.

## License and credits

MIT.

Path of Exile 2 and its passive-tree data are © Grinding Gear Games. This package
ships **no game art or data**, only code. Consumers supply the tree data and
graphics themselves and are responsible for their own use of GGG's assets. This
project is not affiliated with or endorsed by Grinding Gear Games.

The derived node sizes and the central-hub rendering rules follow the conventions
established by [Path of Building Community](https://github.com/PathOfBuildingCommunity),
the reference open-source Path of Exile tool.
