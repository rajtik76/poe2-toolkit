/** Interactive allocation: click allocates the shortest path from the class start, or removes an allocated node and what it orphaned. Pure graph logic, the page owns the state. */

import type { AllocMode, BuildAllocation, TreeData, TreeNode, WeaponSet } from '../types.js';
import { ascendancyNodeOwner } from './ascendancy.js';

export type TreeGraph = Map<number, Set<number>>;

/** Shared empty set, so the common (unblocked) path avoids an allocation. */
const EMPTY_SET: ReadonlySet<number> = new Set();

/** Switching class must deactivate everything (the old tree and ascendancy are meaningless under a new start). */
export function freshAllocation(classId: number): BuildAllocation {
  return { classId, allocated: [] };
}

/**
 * Walkable for pathing: main-tree nodes plus class-start roots. Excludes masteries, ascendancy nodes, hidden sockets,
 * conditional nodes and the synthetic centre node (`root`, parses to NaN) that wires every start through the hub:
 * walkable, a path could shortcut across the hub. With `activeStart`, every other class's start is excluded too,
 * or a path could bridge the gateways flanking a foreign start by stepping through it.
 */
function isWalkable(node: TreeNode, activeStart?: number): boolean {
  if (Number.isNaN(node.skill)) {
    return false;
  }

  if (node.ascendancyName || node.isMastery || node.conditional) {
    return false;
  }

  if (node.noRadius && node.isJewelSocket) {
    return false;
  }

  if (activeStart !== undefined && node.classesStart?.length && node.skill !== activeStart) {
    return false;
  }

  return true;
}

/** Undirected adjacency of walkable nodes. Class-start edges are kept (unlike in the drawn scene) so paths can root there. */
export function buildTreeGraph(data: TreeData, activeStart?: number): TreeGraph {
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
    if (!isWalkable(node, activeStart)) {
      continue;
    }

    if (!graph.has(node.skill)) {
      graph.set(node.skill, new Set());
    }

    for (const conn of node.connections) {
      const target = data.nodes[conn.id];

      if (!target || !isWalkable(target, activeStart)) {
        continue;
      }

      link(node.skill, conn.id);
      link(conn.id, node.skill);
    }
  }

  return graph;
}

/** The pathing root of an ascendancy panel, or undefined when the data has none. */
export function ascendancyStartNode(data: TreeData, ascendancy: string): number | undefined {
  const owner = ascendancyNodeOwner(data, ascendancy);

  for (const node of Object.values(data.nodes)) {
    if (node.isAscendancyStart && node.ascendancyName === owner) {
      return node.skill;
    }
  }

  return undefined;
}

/** Self-contained subgraph of one ascendancy (start node as root): ascendancy points are separate from the main tree. */
export function buildAscendancyGraph(data: TreeData, ascendancy: string): TreeGraph {
  const owner = ascendancyNodeOwner(data, ascendancy);
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
    if (node.ascendancyName !== owner) {
      continue;
    }

    if (!graph.has(node.skill)) {
      graph.set(node.skill, new Set());
    }

    for (const conn of node.connections) {
      const target = data.nodes[conn.id];

      if (!target || target.ascendancyName !== owner) {
        continue;
      }

      link(node.skill, conn.id);
      link(conn.id, node.skill);
    }
  }

  return graph;
}

/** BFS path from any of `sources` to `target`, excluding the sources, including the target. `[]` if the target is a source, `null` if unreachable. `blocked` nodes are never traversed. */
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

/** What a click on an allocated `target` removes: the target plus everything that loses its connection to the start. Matches PoB (a node depends on itself). */
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

/** Toggles a node: removes an allocated one with its orphans, or allocates the shortest path. Returns the new ids (start implicit). Pass a prebuilt `graph` to avoid recomputing it. */
export function toggleAllocation(
  data: TreeData,
  startNode: number,
  allocated: ReadonlySet<number>,
  target: number,
  graph: TreeGraph = buildTreeGraph(data, startNode),
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

/** Like {@link toggleAllocation}, but pathing only within the ascendancy subgraph. The main-tree allocation is carried through untouched. Returns the full allocated set. */
/** Drops every allocated node of `ascendancy`. Called with the OLD ascendancy before activating a new one. */
export function clearAscendancyAllocation(data: TreeData, allocated: Iterable<number>, ascendancy: string): number[] {
  const owner = ascendancyNodeOwner(data, ascendancy);

  return [...allocated].filter((id) => data.nodes[id]?.ascendancyName !== owner);
}

export interface WeaponSetAllocation {
  allocated: number[];
  weaponSets: Record<number, WeaponSet>;
}

/** Keystones, jewel sockets and ascendancy nodes are always shared (mode 0), as in PoB. A path may run through them. */
function isForcedBasic(node: TreeNode | undefined): boolean {
  return !!(node && (node.isKeystone || node.isJewelSocket || node.ascendancyName));
}

function modeOf(weaponSets: Readonly<Record<number, WeaponSet>>, id: number): AllocMode {
  return weaponSets[id] ?? 0;
}

/** Allocated nodes still connected under weapon-set rules: basic nodes reach the start alone, each set's nodes through the kept basic tree plus their own set. */
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

/** Like {@link removalSet} under weapon-set rules. Exposed so the hover preview shows exactly what a click removes. */
export function weaponSetRemovalSet(
  graph: TreeGraph,
  startNode: number,
  allocated: ReadonlySet<number>,
  weaponSets: Readonly<Record<number, WeaponSet>>,
  target: number,
): Set<number> {
  // Cut the target, then drop every node that can no longer reach the start (PoB's `depends`).
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
 * Toggles a node in a paint mode (0 basic, 1 weapon set I, 2 weapon set II). Removal drops what depended on the
 * target, per set. Allocation paths through basic + same-set nodes and tags the new nodes with the mode (forced-basic
 * stay shared). The caller owns the point budget.
 */
export function toggleAllocationInMode(
  data: TreeData,
  startNode: number,
  current: WeaponSetAllocation,
  target: number,
  mode: AllocMode,
  graph: TreeGraph = buildTreeGraph(data, startNode),
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

  // Sources: the start plus allocated nodes of this mode or basic. The other set's nodes are blocked.
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
