/** Assembles a render-ready {@link Scene} from {@link TreeData} and the build state: nothing is left for the renderer to compute. */

import { computeCentreLayout } from '../geometry/centre.js';
import { nodePosition } from '../geometry/orbit.js';
import type {
  BuildAllocation,
  NodeOption,
  PlacedConnection,
  PlacedEffect,
  PlacedNode,
  Scene,
  SceneOptions,
  TreeData,
  TreeNode,
  WeaponSet,
  WorldRect,
} from '../types.js';
import { ascendancyStartNode } from './allocate.js';
import { activeOverrides } from './ascendancy.js';
import { placeConnection } from './connections.js';
import { classifyNode, nodeTargetSize } from './nodeSize.js';

export function buildScene(data: TreeData, opts: SceneOptions = {}): Scene {
  const allocated = new Set(opts.allocation?.allocated ?? []);

  const weaponSets = opts.allocation?.weaponSets ?? {};
  const weaponSetOf = (id: number): WeaponSet | undefined => weaponSets[id];

  // A set tints an edge when both endpoints sit in that set or the shared tree. An edge bridging set 1 and 2 stays basic.
  const edgeWeaponSet = (a: number, b: number): WeaponSet | undefined => {
    const ma = weaponSetOf(a);
    const mb = weaponSetOf(b);

    if (ma === undefined) {
      return mb;
    }

    if (mb === undefined || mb === ma) {
      return ma;
    }

    return undefined;
  };

  // The active ascendancy's start node is implicitly allocated, so its rails into the first allocated nodes render active.
  // A replacing ascendancy (Abyssal Lich) starts from the disc it plays on.
  const ascId = opts.allocation?.ascendId;
  const ascStart = ascId ? ascendancyStartNode(data, ascId) : undefined;

  if (ascStart !== undefined) {
    allocated.add(ascStart);
  }

  // A conditional node (GGG `unlockConstraint`) shows only once ALL its unlock nodes are allocated (PoB's checkUnlockConstraints); one without unlock nodes stays hidden.
  const isRevealed = (node: TreeNode): boolean =>
    !node.conditional || (node.unlockNodes !== undefined && node.unlockNodes.every((id) => allocated.has(id)));

  // Active class's and ascendancy's per-node display overrides.
  const overrideOf = activeOverrides(data, opts.allocation?.classId, ascId);

  const nodes: PlacedNode[] = [];
  const masteryEffects: PlacedEffect[] = [];
  const connections: PlacedConnection[] = [];
  const seenEdges = new Set<string>();
  const mainExtent = new Extent();

  for (const node of Object.values(data.nodes)) {
    // Skip nodes we can't place (missing/holed group, unknown orbit).
    if (!data.groups[node.group]) {
      continue;
    }

    // Class-start nodes are invisible launch points: keep them out of the scene (the centre layout reads them from the data).
    if (isClassStart(node)) {
      continue;
    }

    // Hidden Sinister sockets are not part of the base tree.
    if (isHiddenSocket(node)) {
      continue;
    }

    if (!isRevealed(node)) {
      continue;
    }

    let position;

    try {
      position = nodePosition(data, node.skill);
    } catch {
      continue;
    }

    const size = nodeTargetSize(node);
    const overrideTarget = overrideOf(node.skill);
    const overrideIcon = overrideTarget !== undefined ? data.nodes[overrideTarget]?.icon : undefined;
    const isAllocated = allocated.has(node.skill);
    const weaponSet = weaponSetOf(node.skill);

    nodes.push({
      skill: node.skill,
      x: position.x,
      y: position.y,
      kind: classifyNode(node),
      // Attribute choice wins, then the class override, then the base icon.
      icon: chosenAttributeOption(node, opts.allocation)?.icon || overrideIcon || node.icon,
      // The game draws each sprite at 2*width centred on the node, so the world diameter is twice the target width.
      iconSize: size.icon * 2,
      frameSize: size.overlay * 2,
      radius: Math.max(size.icon, size.overlay),
      allocated: isAllocated,
      ...(isAllocated && weaponSet !== undefined ? { weaponSet } : {}),
      ...(node.ascendancyName !== undefined ? { ascendancy: node.ascendancyName } : {}),
      ...(opts.allocation?.jewels?.[node.skill] ? { jewel: opts.allocation.jewels[node.skill] } : {}),
    });

    if (!node.ascendancyName) {
      const reach = Math.max(size.icon, size.overlay) / 2;
      mainExtent.add(position.x, position.y, reach);
    }

    if (node.activeEffectImage) {
      // Notables carry an explicit effect size; masteries are the pattern (icon size doubles as effect size).
      const effectSize = (size.effect > 0 ? size.effect : size.icon) * 2;
      // A mastery lights up when any node it links to is allocated, as in-game.
      masteryEffects.push({
        skill: node.skill,
        x: position.x,
        y: position.y,
        size: effectSize,
        patternKey: node.activeEffectImage,
        active: node.connections.some((conn) => allocated.has(conn.id)),
      });
    }

    for (const conn of node.connections) {
      const target = data.nodes[conn.id];

      // Drop edges to/from class-start and mastery nodes (they would dangle, as they don't on the live tree).
      if (
        !target ||
        isClassStart(target) ||
        isHiddenSocket(target) ||
        !isRevealed(target) ||
        node.isMastery ||
        target.isMastery
      ) {
        continue;
      }

      // Drop edges crossing the main-tree/ascendancy boundary: the ascendancy is a separate, relocated panel.
      if (Boolean(node.ascendancyName) !== Boolean(target.ascendancyName)) {
        continue;
      }

      const key = node.skill < conn.id ? `${node.skill}|${conn.id}` : `${conn.id}|${node.skill}`;

      if (seenEdges.has(key)) {
        continue;
      }

      seenEdges.add(key);

      try {
        // An edge bridging the two weapon sets is active in neither set's view.
        const setA = weaponSetOf(node.skill);
        const setB = weaponSetOf(conn.id);
        const crossSet = setA !== undefined && setB !== undefined && setA !== setB;
        const active = allocated.has(node.skill) && allocated.has(conn.id) && !crossSet;
        const placed = placeConnection(data, node.skill, conn.id, conn.arcCentre, active);

        if (active) {
          const set = edgeWeaponSet(node.skill, conn.id);

          if (set !== undefined) {
            placed.weaponSet = set;
          }
        }

        if (node.ascendancyName && node.ascendancyName === target.ascendancyName) {
          placed.ascendancy = node.ascendancyName;
        }

        connections.push(placed);
      } catch {
        // One unplaceable endpoint - drop the edge rather than fail the scene.
      }
    }
  }

  return {
    nodes,
    connections,
    masteryEffects,
    centre: computeCentreLayout(data),
    bounds: data.bounds,
    mainBounds: mainExtent.toRect(data.bounds),
  };
}

function isClassStart(node: TreeNode): boolean {
  return (node.classesStart?.length ?? 0) > 0;
}

const ATTRIBUTE_OPTION_NAME = { str: 'Strength', dex: 'Dexterity', int: 'Intelligence' } as const;

/** The attribute option a build assigned to a generic +attribute node, if any. */
export function chosenAttributeOption(node: TreeNode, allocation: BuildAllocation | undefined): NodeOption | undefined {
  if (!node.isAttribute || !node.options) {
    return undefined;
  }

  const choice = allocation?.attributeChoices?.[node.skill];

  if (!choice) {
    return undefined;
  }

  const wanted = ATTRIBUTE_OPTION_NAME[choice];

  return node.options.find((option) => option.name === wanted);
}

/** The node a class (or the active ascendancy over the nodes it plays on) shows at this position: the override's name/stats/icon replace the base's, geometry and kind flags stay. */
export function classOverrideNode(
  data: TreeData,
  classId: number | null | undefined,
  node: TreeNode,
  ascendId?: string | null,
): TreeNode {
  const target = activeOverrides(data, classId, ascendId)(node.skill);
  const override = target !== undefined ? data.nodes[target] : undefined;

  if (!override) {
    return node;
  }

  return { ...node, name: override.name, stats: override.stats, icon: override.icon };
}

function isHiddenSocket(node: TreeNode): boolean {
  return node.noRadius === true && node.isJewelSocket === true;
}

class Extent {
  private minX = Infinity;
  private minY = Infinity;
  private maxX = -Infinity;
  private maxY = -Infinity;

  add(x: number, y: number, reach: number): void {
    this.minX = Math.min(this.minX, x - reach);
    this.minY = Math.min(this.minY, y - reach);
    this.maxX = Math.max(this.maxX, x + reach);
    this.maxY = Math.max(this.maxY, y + reach);
  }

  toRect(fallback: WorldRect): WorldRect {
    if (this.minX > this.maxX) {
      return fallback;
    }

    return { minX: this.minX, minY: this.minY, maxX: this.maxX, maxY: this.maxY };
  }
}
