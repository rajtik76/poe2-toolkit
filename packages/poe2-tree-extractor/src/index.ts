/** Builds passive-tree data and sprite atlases from a {@link GgpkSource}, in the shape `@poe2-toolkit/tree-core` consumes. Source-agnostic: it downloads nothing itself. */

import type { GgpkSource } from '@poe2-toolkit/ggpk';

import { buildCentre  } from './buildCentre.js';
import type {CentreSource} from './buildCentre.js';
import { buildGraphics   } from './buildGraphics.js';
import type {GraphicsResult, GraphicsSource} from './buildGraphics.js';
import { buildTree  } from './buildTree.js';
import type {TreeExport} from './buildTree.js';

export { parsePsg } from './psg.js';
export type { Psg, PsgNode, PsgGroup, PsgConnection, PsgRoot } from './psg.js';

export { packAtlas } from './atlas.js';
export type { AtlasSprite, AtlasFrame, PackedAtlas } from './atlas.js';

export { buildTree } from './buildTree.js';
export type {
  TreeExport,
  ExportNode,
  ExportClass,
  ExportGroup,
  ExportAscendancy,
  ExportEdge,
  ExportRoot,
} from './buildTree.js';

export { buildGraphics } from './buildGraphics.js';
export type { TreeAtlases, GraphicsResult, GraphicsReport, GraphicsSource } from './buildGraphics.js';

export { buildCentre } from './buildCentre.js';
export type { CentreSource } from './buildCentre.js';

export interface TreeBundle {
  data: TreeExport;
  graphics: GraphicsResult;
  centre: Record<string, Buffer>;
}

export type TreeSource = GgpkSource & GraphicsSource & CentreSource;

/** The source is queried for everything; writing the result is the caller's concern. */
export async function extractTree(source: TreeSource): Promise<TreeBundle> {
  const data = await buildTree(source);
  const graphics = await buildGraphics(source, data);
  const centre = await buildCentre(source);

  return { data, graphics, centre };
}
