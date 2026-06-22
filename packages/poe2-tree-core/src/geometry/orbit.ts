/**
 * Node positions.
 *
 * GGG's skill-tree export bakes a world `x`/`y` into every node, so the engine
 * reads those directly rather than recomputing them from orbit radii + angles.
 * (GGG omits the orbit-radius constants PoB used for that computation; baking the
 * coordinates is GGG's substitute.)
 *
 * Convention (matches GGG and PoB): angle `0` points straight up and increases
 * clockwise, so a node on `orbit`/`orbitIndex` sits at
 *
 *   x = group.x + radius * sin(angle)
 *   y = group.y - radius * cos(angle)
 *
 * which is exactly what the baked coordinates already encode.
 */

import type { Point, TreeData } from '../types.js';

/**
 * World position of a node identified by skill id, read from its baked
 * coordinates. Throws if the node is missing.
 */
export function nodePosition(data: TreeData, skill: number): Point {
  const node = data.nodes[skill];

  if (!node) {
    throw new RangeError(`unknown skill id ${skill}`);
  }

  return { x: node.x, y: node.y };
}
