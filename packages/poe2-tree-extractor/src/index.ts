/**
 * @poe2-tree/extractor — builds the Path of Exile 2 passive-tree data and sprite
 * atlases from a {@link GgpkSource}, in the shape `@poe2-tree/core` consumes.
 *
 * The package is source-agnostic: it never downloads anything itself. Pass any
 * `@poe2/ggpk` source (the CDN-backed `createCdnSource`, or your own) and it
 * returns the `data.json` payload, the four sprite atlases, and the centre art —
 * all as plain data, ready to write wherever you publish them.
 */

import type { GgpkSource } from '@poe2/ggpk';

import { buildCentre  } from './buildCentre.js';
import type {CentreSource} from './buildCentre.js';
import { buildGraphics   } from './buildGraphics.js';
import type {GraphicsResult, GraphicsSource} from './buildGraphics.js';
import { buildTree  } from './buildTree.js';
import type {TreeExport} from './buildTree.js';

export { parsePsg } from './psg.js';
export type { Psg, PsgNode, PsgGroup } from './psg.js';

export { packAtlas, desaturate } from './atlas.js';
export type { AtlasSprite, AtlasFrame, PackedAtlas } from './atlas.js';

export { buildTree } from './buildTree.js';
export type {
  TreeExport,
  ExportNode,
  ExportClass,
  ExportGroup,
  ExportAscendancy,
} from './buildTree.js';

export { buildGraphics } from './buildGraphics.js';
export type { TreeAtlases, GraphicsResult, GraphicsReport, GraphicsSource } from './buildGraphics.js';

export { buildCentre } from './buildCentre.js';
export type { CentreSource } from './buildCentre.js';

/** Everything the extractor produces for one tree version. */
export interface TreeBundle {
  /** The `data.json` payload (`@poe2-tree/core`'s normalize input). */
  data: TreeExport;
  /** The four sprite atlases plus a report of what packed or was skipped. */
  graphics: GraphicsResult;
  /** Centre art keyed by output name (e.g. `portrait-ranger`), PNG bytes. */
  centre: Record<string, Buffer>;
}

/** A source that can serve both tables/files and images (tree + graphics). */
export type TreeSource = GgpkSource & GraphicsSource & CentreSource;

/**
 * Run the full passive-tree extraction against a source: tree data, atlases and
 * centre art in one pass. The source is queried for everything; no other I/O is
 * performed (writing the result is the caller's concern).
 */
export async function extractTree(source: TreeSource): Promise<TreeBundle> {
  const data = await buildTree(source);
  const graphics = await buildGraphics(source, data);
  const centre = await buildCentre(source);

  return { data, graphics, centre };
}
