# @poe2-tree/react

[![npm](https://img.shields.io/npm/v/@poe2-tree/react.svg)](https://www.npmjs.com/package/@poe2-tree/react)
[![types: TypeScript](https://img.shields.io/badge/types-TypeScript-3178c6.svg)](src/index.ts)
[![React 18+](https://img.shields.io/badge/react-18%2B-61dafb.svg)](https://react.dev)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

React renderer for the Path of Exile 2 passive tree. It's a thin view layer on
top of [`@poe2-tree/core`](../poe2-tree-core): the core works out where
everything goes, and this package draws it and runs the canvas, panning,
zooming, hovering, and clicking.

It does no geometry of its own. Positions, sizes, rotations, the hub layout, and
hit-testing all come from the core. If you ever catch this package computing a
coordinate, that's a bug.

The geometry lives in a framework-agnostic core, so the same `Scene` can just as
easily be drawn from Vue, Svelte, or anything else. React is what this project
happens to use.

> **Live demo:** see this renderer in a real app at
> [poe.rajtik.com/tree](https://poe.rajtik.com/tree).

## Who does what

| Concern | Owner |
|---|---|
| node positions, sizes, hub geometry, arcs, hit-test math | core |
| canvas, device-pixel sizing, draw loop, layer order | this package |
| pan, zoom, wheel, fullscreen, pointer hover and click | this package |
| loading atlas bitmaps, colors, tooltips, surrounding UI | you |

## Install

```sh
npm install @poe2-tree/react @poe2-tree/core
```

React 18 or newer is a peer dependency.

## Usage

The tree data comes from GGG's official skill-tree export. Run it through the
core's GGG adapter to get a `TreeData`, build a `Scene` from it, and hand that to
`TreeView`.

```tsx
import { buildScene } from '@poe2-tree/core';
import { normalizeGggTree } from '@poe2-tree/core/ggg';
import { TreeView } from '@poe2-tree/react';

// Normalize GGG's data.json into the engine's TreeData (once per tree).
const data = normalizeGggTree(rawGggExport, '0_5');

// Build a render-ready scene for the current build (rebuild it on edits).
const scene = buildScene(data, { allocation });

// Draw it. `resources` (atlas bitmaps + manifest) is optional; leave it out
// and you get the vector debug render.
<TreeView
  scene={scene}
  resources={{ manifest, atlases }}
  activeClassId={allocation.classId}
  activeAscendancy={allocation.ascendId}
  onNodeClick={(skill) => toggle(skill)}
/>;
```

The pattern is state in, intent out. The `scene` already holds everything
visual, so the component just reports what the user did (`onNodeClick`,
`onNodeHover`, and the rest) and never touches the build itself.

## Graphics

`TreeView` doesn't load any images. You give it a `RenderResources`:

```ts
interface RenderResources {
  manifest: SpriteManifest;                     // sprite key -> native atlas rect
  atlases: Record<string, CanvasImageSource>;   // atlas id -> bitmap
}
```

To draw a node, the renderer turns it into a sprite key with the helpers in
[`spriteKeys`](src/spriteKeys.ts) (`iconKeyFor`, `frameKeyFor`, `effectKeyFor`,
and friends), looks that key up in your `manifest`, and blits the rect from the
matching atlas. The keys follow GGG's atlas naming, so pointing the renderer at a
different atlas set comes down to swapping that one file. Leave `resources` out
and you get a plain vector render of discs and rails, which is handy for
debugging without art.

The hub artwork (class portrait and ornate ring) comes in through the optional
`centreSprites` prop. Skip it and the hub falls back to a vector placeholder.

## Component props

```tsx
<TreeView
  scene={scene}                 // required: core.buildScene output
  resources={resources}         // atlas bitmaps + manifest (omit for vector)
  activeClassId={classId}       // rotates the active ring onto the class
  activeAscendancy={ascId}      // relocates that ascendancy disc into the hub
  centreSprites={centreSprites} // optional portrait + ring artwork
  preview={preview}             // hover highlight: pending add (gold) / remove (red)
  focus={worldRect}             // pass a fresh rect to pan + zoom-fit to it
  wheelZoom                     // turn on wheel zoom (off by default)
  controls={controlsRef}        // imperative zoomIn() / zoomOut()
  onNodeClick={(skill, screen) => …}
  onNodeDoubleClick={(skill) => …}
  onNodeHover={(skill, screen) => …}
  onInteractStart={() => …}     // a press started on the canvas (e.g. close popovers)
/>
```

Exported types: `TreeViewProps`, `TreeViewControls`, `AllocationPreview`,
`CentreSprite`, `RenderResources`.

For external +/- buttons, reach for the imperative handle on `controls`:

```tsx
const controls = useRef<TreeViewControls>(null);
// …
<button onClick={() => controls.current?.zoomIn()}>+</button>
```

## Non-goals

This package won't:

- compute or adjust any position, size, rotation, or hub placement;
- carry magic numbers for node, icon, or effect sizing;
- lock itself to one data source (it only knows `Scene` and `SpriteManifest`);
- claim to be the only frontend. A Vue, Svelte, or Livewire renderer on the same
  contract is every bit as valid.

## Local development

In-repo, this package finds `@poe2-tree/core` two ways:

- typecheck and build read it through a `tsconfig` `paths` entry that points at
  the sibling source, so there's no build or link step;
- `npm install` links the sibling through the `file:../poe2-tree-core`
  dependency.

When you split this out into its own repo, change two things: drop the `paths`
block in `tsconfig.json`, and swap the `@poe2-tree/core` dependency from
`file:../poe2-tree-core` to a published version like `^0.1.0`.

```sh
npm install
npm run typecheck
npm run build
```

## Attributions and legal

This is an unofficial, fan-made project, **not** affiliated with, endorsed by, or
sponsored by Grinding Gear Games. "Path of Exile 2" is a trademark of Grinding
Gear Games, and all game content, data, and art are their property. This package
ships code only and stores nothing derived from the game. Thank you to Grinding
Gear Games for making Path of Exile 2. See the repository [NOTICE](../../NOTICE.md).

## License

MIT — see [LICENSE](./LICENSE).
