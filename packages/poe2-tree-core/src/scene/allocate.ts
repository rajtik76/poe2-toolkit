/**
 * Interactive allocation over the passive tree graph: click a node to allocate
 * the shortest path to it from the class start (and the current allocation), or
 * click an allocated node to remove it and anything it orphaned.
 *
 * Pure graph logic — no rendering. The page owns the allocation state and feeds
 * clicks through {@link toggleAllocation}.
 */

import type { AllocMode, BuildAllocation, TreeData, TreeNode, WeaponSet } from '../types.js';

/** Adjacency list of the walkable tree: node id -> connected node ids. */
export type TreeGraph = Map<number, Set<number>>;

/** Shared empty set, so the common (unblocked) path avoids an allocation. */
const EMPTY_SET: ReadonlySet<number> = new Set();

/**
 * A blank allocation for a class: no nodes and no ascendancy. Switching class
 * must deactivate everything (the previous class's tree and ascendancy paths are
 * meaningless under a new start), so the planner resets to this on class change.
 */
export function freshAllocation(classId: number): BuildAllocation {
  return { classId, allocated: [] };
}

/**
 * Walkable for pathing: real main-tree nodes plus the class-start roots.
 * Masteries (not pathed through), ascendancy nodes (separate panel), hidden
 * sockets and conditional/unlock nodes are excluded.
 *
 * The GGG tree's synthetic centre node (keyed `root`, so it has no numeric skill
 * id and parses to NaN) wires every class start together through the hub. Left
 * walkable, a path could shortcut across the centre and surface at whichever rim
 * gateway is fewest hops from the target — even another class's — so it looks
 * like it starts at "the nearest point of the circle". Pathing must root at the
 * class start (or the nearest allocated node) and stay in the tree, never cross
 * the hub, so the centre node is excluded.
 */
function isWalkable(node: TreeNode): boolean {
  if (Number.isNaN(node.skill)) {
    return false;
  }

  if (node.ascendancyName || node.isMastery || node.conditional) {
    return false;
  }

  if (node.noRadius && node.isJewelSocket) {
    return false;
  }

  return true;
}

/**
 * Build the undirected adjacency graph of walkable nodes. Class-start edges are
 * kept (unlike in the drawn scene) so paths can root at the start node.
 */
export function buildTreeGraph(data: TreeData): TreeGraph {
  const graph: TreeGraph = new Map();
  const link = (from: number, to: number): void => {
    let set = graph.get(from);

    if (!set) {
      set = new Set();
      graph.set(from, set);
    }

    set.add(to);
  };

  for (const node of Object.values(data.nodes)) {
    if (!isWalkable(node)) {
      continue;
    }

    if (!graph.has(node.skill)) {
      graph.set(node.skill, new Set());
    }

    for (const conn of node.connections) {
      const target = data.nodes[conn.id];

      if (!target || !isWalkable(target)) {
        continue;
      }

      link(node.skill, conn.id);
      link(conn.id, node.skill);
    }
  }

  return graph;
}

/**
 * The start node of an ascendancy panel (its pathing root), or undefined when
 * the ascendancy has none in the data.
 */
export function ascendancyStartNode(data: TreeData, ascendancy: string): number | undefined {
  for (const node of Object.values(data.nodes)) {
    if (node.isAscendancyStart && node.ascendancyName === ascendancy) {
      return node.skill;
    }
  }

  return undefined;
}

/**
 * Adjacency graph of a single ascendancy's nodes (its start node included as the
 * root). Ascendancy points are separate from the main tree, so the editor paths
 * within this self-contained subgraph — never across the main-tree boundary.
 */
export function buildAscendancyGraph(data: TreeData, ascendancy: string): TreeGraph {
  const graph: TreeGraph = new Map();
  const link = (from: number, to: number): void => {
    let set = graph.get(from);

    if (!set) {
      set = new Set();
      graph.set(from, set);
    }

    set.add(to);
  };

  for (const node of Object.values(data.nodes)) {
    if (node.ascendancyName !== ascendancy) {
      continue;
    }

    if (!graph.has(node.skill)) {
      graph.set(node.skill, new Set());
    }

    for (const conn of node.connections) {
      const target = data.nodes[conn.id];

      if (!target || target.ascendancyName !== ascendancy) {
        continue;
      }

      link(node.skill, conn.id);
      link(conn.id, node.skill);
    }
  }

  return graph;
}

/**
 * Shortest path (BFS) from any of `sources` to `target`, as the list of nodes
 * to add — excluding the sources, including the target. `[]` when the target is
 * already a source; `null` when unreachable. Nodes in `blocked` are never
 * traversed (used to keep a weapon-set path off the other set's allocated nodes).
 */
export function pathToNode(
  graph: TreeGraph,
  sources: ReadonlySet<number>,
  target: number,
  blocked: ReadonlySet<number> = EMPTY_SET,
): number[] | null {
  if (sources.has(target)) {
    return [];
  }

  const prev = new Map<number, number>();
  const seen = new Set<number>(sources);
  const queue: number[] = [...sources];

  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;

    for (const next of graph.get(current) ?? []) {
      if (seen.has(next) || blocked.has(next)) {
        continue;
      }

      seen.add(next);
      prev.set(next, current);

      if (next === target) {
        const path: number[] = [];
        let step: number | undefined = target;

        while (step !== undefined && !sources.has(step)) {
          path.push(step);
          step = prev.get(step);
        }

        return path.reverse();
      }

      queue.push(next);
    }
  }

  return null;
}

/**
 * The nodes a click on an allocated `target` removes: the target itself plus
 * everything that loses its connection to the start once it is cut. Matches Path
 * of Building (a node depends on itself), so a click deletes the node and the
 * branches that hung off it — a tip removes just itself.
 */
export function removalSet(
  graph: TreeGraph,
  startNode: number,
  allocated: ReadonlySet<number>,
  target: number,
): Set<number> {
  if (!allocated.has(target)) {
    return new Set();
  }

  const remaining = new Set(allocated);
  remaining.delete(target);
  const keep = reachable(graph, [startNode], remaining);

  const removed = new Set<number>();

  for (const id of allocated) {
    if (!keep.has(id)) {
      removed.add(id);
    }
  }

  return removed;
}

/** The subset of `allowed` still reachable from `roots` through the graph. */
export function reachable(graph: TreeGraph, roots: Iterable<number>, allowed: ReadonlySet<number>): Set<number> {
  const kept = new Set<number>();
  const seen = new Set<number>();
  const queue: number[] = [];

  for (const root of roots) {
    seen.add(root);
    queue.push(root);
  }

  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;

    for (const next of graph.get(current) ?? []) {
      if (seen.has(next) || !allowed.has(next)) {
        continue;
      }

      seen.add(next);
      kept.add(next);
      queue.push(next);
    }
  }

  return kept;
}

/**
 * Toggle a node in a manual build:
 *  - allocated target -> remove it and prune any node it orphaned from the start
 *  - unallocated target -> allocate the shortest path to it
 *
 * Returns the new allocated node ids (start node excluded — it's implicit).
 * Pass a prebuilt `graph` to avoid recomputing it per click.
 */
export function toggleAllocation(
  data: TreeData,
  startNode: number,
  allocated: ReadonlySet<number>,
  target: number,
  graph: TreeGraph = buildTreeGraph(data),
): number[] {
  if (target === startNode) {
    return [...allocated];
  }

  if (allocated.has(target)) {
    const removed = removalSet(graph, startNode, allocated, target);

    return [...allocated].filter((id) => !removed.has(id));
  }

  const sources = new Set<number>(allocated);
  sources.add(startNode);
  const path = pathToNode(graph, sources, target);

  if (!path) {
    return [...allocated];
  }

  return [...new Set([...allocated, ...path])];
}

/**
 * Toggle an ascendancy node, pathing only within that ascendancy's own subgraph
 * (rooted at its start node). The main-tree allocation is carried through
 * untouched, so this is the ascendancy counterpart to {@link toggleAllocation}
 * — clicks allocate the path from the ascendancy start, or remove beyond.
 *
 * Returns the new full allocated set (main tree + this ascendancy's nodes).
 */
/**
 * Drop every allocated node that belongs to `ascendancy`, keeping the main tree
 * and any other ascendancy untouched. Switching ascendancy must deactivate the
 * previous one's nodes (you can only path one ascendancy), so the planner calls
 * this with the OLD ascendancy before activating the new one.
 */
export function clearAscendancyAllocation(data: TreeData, allocated: Iterable<number>, ascendancy: string): number[] {
  return [...allocated].filter((id) => data.nodes[id]?.ascendancyName !== ascendancy);
}

// ---------------------------------------------------------------------------
// Weapon-set aware allocation
// ---------------------------------------------------------------------------

/** A manual build's main-tree state with per-node weapon-set assignment. */
export interface WeaponSetAllocation {
  /** Allocated skill ids across every mode (basic + both weapon sets). */
  allocated: number[];
  /** node id -> weapon set (1 or 2); absent = basic/shared. */
  weaponSets: Record<number, WeaponSet>;
}

/**
 * Nodes that can never belong to a weapon set: keystones, jewel sockets and
 * ascendancy nodes are always shared (mode 0), matching Path of Building. A path
 * may still run through them, but they stay basic regardless of the paint mode.
 */
function isForcedBasic(node: TreeNode | undefined): boolean {
  return !!(node && (node.isKeystone || node.isJewelSocket || node.ascendancyName));
}

/** The weapon set of an allocated node, or 0 when it is basic/shared. */
function modeOf(weaponSets: Readonly<Record<number, WeaponSet>>, id: number): AllocMode {
  return weaponSets[id] ?? 0;
}

/**
 * The allocated nodes that stay connected under weapon-set rules: the basic
 * (mode 0) tree reaches the start through basic nodes alone, and each weapon
 * set's nodes reach the start through that kept basic tree plus their own set.
 * Anything else is orphaned.
 */
function validReachable(
  graph: TreeGraph,
  startNode: number,
  allocated: ReadonlySet<number>,
  weaponSets: Readonly<Record<number, WeaponSet>>,
): Set<number> {
  const byMode = (mode: AllocMode): Set<number> => {
    const set = new Set<number>();

    for (const id of allocated) {
      if (modeOf(weaponSets, id) === mode) {
        set.add(id);
      }
    }

    return set;
  };

  const keepBasic = reachable(graph, [startNode], byMode(0));

  const keepSet = (set: WeaponSet): Set<number> => {
    const own = byMode(set);
    const reached = reachable(graph, [startNode], new Set<number>([...keepBasic, ...own]));

    return new Set([...reached].filter((id) => own.has(id)));
  };

  return new Set<number>([...keepBasic, ...keepSet(1), ...keepSet(2)]);
}

/**
 * The nodes a click on an allocated `target` removes under weapon-set rules:
 * everything that loses its connection to the start once the target is cut,
 * keeping the target itself; or the target alone when it is a tip. Mirrors
 * {@link removalSet}, but reachability respects each set's connectivity. Exposed
 * so the hover preview can show exactly what a click will remove.
 */
export function weaponSetRemovalSet(
  graph: TreeGraph,
  startNode: number,
  allocated: ReadonlySet<number>,
  weaponSets: Readonly<Record<number, WeaponSet>>,
  target: number,
): Set<number> {
  // Cut the target, then drop every allocated node that can no longer reach the
  // start — the target itself plus anything that depended on it. This matches
  // Path of Building's `depends` (a node depends on itself), so clicking removes
  // the node and its branches, and the hover paints all those edges 1:1.
  const remaining = new Set(allocated);
  remaining.delete(target);
  const keep = validReachable(graph, startNode, remaining, weaponSets);

  const removed = new Set<number>();

  for (const id of allocated) {
    if (!keep.has(id)) {
      removed.add(id);
    }
  }

  return removed;
}

/**
 * Toggle a node in a given paint mode (0 basic, 1 weapon set I, 2 weapon set II):
 *  - allocated target -> remove it and everything that depended on it (the nodes
 *    orphaned from the start once it is cut), per set, matching Path of Building
 *  - unallocated target -> path to it through basic + same-set nodes, tagging the
 *    new nodes with the mode (forced-basic nodes stay shared)
 *
 * Pathing cannot cross the other weapon set's nodes, so a set branch always
 * sprouts from the shared tree. The caller owns the point budget — this only
 * computes the next allocation. Pass a prebuilt `graph` to avoid recomputing it.
 */
export function toggleAllocationInMode(
  data: TreeData,
  startNode: number,
  current: WeaponSetAllocation,
  target: number,
  mode: AllocMode,
  graph: TreeGraph = buildTreeGraph(data),
): WeaponSetAllocation {
  if (target === startNode) {
    return current;
  }

  const allocated = new Set(current.allocated);
  const weaponSets = current.weaponSets;

  if (allocated.has(target)) {
    const removed = weaponSetRemovalSet(graph, startNode, allocated, weaponSets, target);
    const nextWeaponSets: Record<number, WeaponSet> = {};

    for (const id of allocated) {
      if (!removed.has(id) && weaponSets[id] !== undefined) {
        nextWeaponSets[id] = weaponSets[id]!;
      }
    }

    return {
      allocated: [...allocated].filter((id) => !removed.has(id)),
      weaponSets: nextWeaponSets,
    };
  }

  // Forced-basic nodes ignore the paint mode and allocate as shared.
  const effectiveMode: AllocMode = isForcedBasic(data.nodes[target]) ? 0 : mode;

  // Sources: the start plus allocated nodes this mode can branch from (basic or
  // same set). The other set's allocated nodes are blocked from the path.
  const sources = new Set<number>([startNode]);
  const blocked = new Set<number>();

  for (const id of allocated) {
    const nodeMode = modeOf(weaponSets, id);

    if (nodeMode === 0 || nodeMode === effectiveMode) {
      sources.add(id);
    } else {
      blocked.add(id);
    }
  }

  const path = pathToNode(graph, sources, target, blocked);

  if (!path) {
    return current;
  }

  const nextWeaponSets: Record<number, WeaponSet> = { ...weaponSets };

  for (const id of path) {
    if (effectiveMode === 0 || isForcedBasic(data.nodes[id])) {
      delete nextWeaponSets[id];
    } else {
      nextWeaponSets[id] = effectiveMode;
    }
  }

  return { allocated: [...allocated, ...path], weaponSets: nextWeaponSets };
}

export function toggleAscendancyAllocation(
  data: TreeData,
  ascendancy: string,
  allocated: ReadonlySet<number>,
  target: number,
  graph: TreeGraph = buildAscendancyGraph(data, ascendancy),
): number[] {
  const start = ascendancyStartNode(data, ascendancy);

  if (start === undefined) {
    return [...allocated];
  }

  // Split off this ascendancy's slice; everything else stays exactly as-is.
  const ascAllocated = new Set<number>();
  const rest: number[] = [];

  for (const id of allocated) {
    if (graph.has(id)) {
      ascAllocated.add(id);
    } else {
      rest.push(id);
    }
  }

  const nextAsc = toggleAllocation(data, start, ascAllocated, target, graph);

  return [...rest, ...nextAsc];
}
