/**
 * Node positions are baked by GGG (`x`/`y`), so the engine reads them directly. Convention (as GGG and PoB): angle 0 points
 * up and increases clockwise, `x = group.x + radius * sin(angle)`, `y = group.y - radius * cos(angle)`.
 */

import type { Point, TreeData } from '../types.js';

/** Throws if the node is missing. */
export function nodePosition(data: TreeData, skill: number): Point {
  const node = data.nodes[skill];

  if (!node) {
    throw new RangeError(`unknown skill id ${skill}`);
  }

  return { x: node.x, y: node.y };
}
