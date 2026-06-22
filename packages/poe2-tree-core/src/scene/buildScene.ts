/**
 * Assemble a render-ready {@link Scene} from {@link TreeData} and the current
 * build state. Every node is positioned and sized, every connection resolved to
 * a line or arc, every effect pattern placed — nothing left for the renderer to
 * compute.
 */

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
  WorldRect,
} from '../types.js';
import { placeConnection } from './connections.js';
import { classifyNode, nodeTargetSize } from './nodeSize.js';

export function buildScene(data: TreeData, opts: SceneOptions = {}): Scene {
  const allocated = new Set(opts.allocation?.allocated ?? []);

  // The active ascendancy's start node (the diamond every first node launches
  // from) is implicitly allocated — you have the ascendancy — so its rails into
  // the first allocated nodes render as active instead of looking disconnected.
  const ascId = opts.allocation?.ascendId;

  if (ascId) {
    for (const node of Object.values(data.nodes)) {
      if (node.isAscendancyStart && node.ascendancyName === ascId) {
        allocated.add(node.skill);
        break;
      }
    }
  }

  // Active class's per-node display overrides (the Witch's "Spell and Minion
  // Damage" for the generic "Spell Damage" node, etc.).
  const overridePairs = data.classes.find((cls) => cls.id === opts.allocation?.classId)?.overridePairs;

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

    // Class-start nodes are invisible launch points; edges start from the first
    // real nodes, not from the start point. Keep them out of the scene entirely
    // (the centre layout reads them from the data, not from here).
    if (isClassStart(node)) {
      continue;
    }

    // Hidden special sockets (the "Sinister Jewel Socket" decorations): not part
    // of the base tree, so the official tree never draws them. Keep them out.
    if (isHiddenSocket(node)) {
      continue;
    }

    // Conditional nodes (GGG `unlockConstraint`, e.g. Oracle-locked passives):
    // the official tree never renders these — they only surface in-game when the
    // constraint is met — so keep them out entirely.
    if (node.conditional) {
      continue;
    }

    let position;

    try {
      position = nodePosition(data, node.skill);
    } catch {
      continue;
    }

    const size = nodeTargetSize(node);
    // The active class's override icon for this node, if any (e.g. the Witch's
    // "Spell and Minion Damage" art over the generic "Spell Damage").
    const overrideTarget = overridePairs?.[node.skill];
    const overrideIcon = overrideTarget !== undefined ? data.nodes[overrideTarget]?.icon : undefined;

    nodes.push({
      skill: node.skill,
      x: position.x,
      y: position.y,
      kind: classifyNode(node),
      // Attribute choice wins, then the class override, then the base icon.
      icon: chosenAttributeOption(node, opts.allocation)?.icon || overrideIcon || node.icon,
      // The game draws each sprite at 2*width centred on the node, so the world
      // diameter is twice the target width. Same rule as the centre ring layers.
      iconSize: size.icon * 2,
      frameSize: size.overlay * 2,
      radius: Math.max(size.icon, size.overlay),
      allocated: allocated.has(node.skill),
      ...(node.ascendancyName !== undefined ? { ascendancy: node.ascendancyName } : {}),
      // Display-only jewel socketed here (from the build); no radius effect.
      ...(opts.allocation?.jewels?.[node.skill] ? { jewel: opts.allocation.jewels[node.skill] } : {}),
    });

    if (!node.ascendancyName) {
      const reach = Math.max(size.icon, size.overlay) / 2;
      mainExtent.add(position.x, position.y, reach);
    }

    if (node.activeEffectImage) {
      // Notables carry an explicit effect size; masteries *are* the pattern
      // (their icon size doubles as the effect size). Same 2*width world rule.
      const effectSize = (size.effect > 0 ? size.effect : size.icon) * 2;
      // A mastery isn't allocatable itself; it lights up when any node it links
      // to (its merged in/out neighbours) is allocated — matching the in-game
      // tree, where unconnected masteries in the same cluster stay dim.
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

      // Drop edges to/from class-start nodes (the invisible launch point) and
      // mastery nodes (drawn as a background pattern, not a connectable node —
      // their edges would dangle into nothing, as they don't on the live tree).
      if (
        !target ||
        isClassStart(target) ||
        isHiddenSocket(target) ||
        target.conditional ||
        node.isMastery ||
        target.isMastery
      ) {
        continue;
      }

      // Drop edges that cross the main-tree <-> ascendancy boundary: the
      // ascendancy start's link into the main tree is never drawn (the
      // ascendancy is a separate, relocated panel).
      if (Boolean(node.ascendancyName) !== Boolean(target.ascendancyName)) {
        continue;
      }

      const key = node.skill < conn.id ? `${node.skill}|${conn.id}` : `${conn.id}|${node.skill}`;

      if (seenEdges.has(key)) {
        continue;
      }

      seenEdges.add(key);

      try {
        const active = allocated.has(node.skill) && allocated.has(conn.id);
        const placed = placeConnection(data, node.skill, conn.id, conn.arcCentre, active);

        // Tag intra-ascendancy edges so the renderer can relocate them too.
        if (node.ascendancyName && node.ascendancyName === target.ascendancyName) {
          placed.ascendancy = node.ascendancyName;
        }

        connections.push(placed);
      } catch {
        // One unplaceable endpoint — drop the edge rather than fail the scene.
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

/** A class-start node: the invisible point a class's tree launches from. */
function isClassStart(node: TreeNode): boolean {
  return (node.classesStart?.length ?? 0) > 0;
}

/** Attribute-choice key -> the option name to match in the node's options. */
const ATTRIBUTE_OPTION_NAME = { str: 'Strength', dex: 'Dexterity', int: 'Intelligence' } as const;

/**
 * The attribute option a build assigned to a generic +attribute node, or
 * undefined when the node isn't an assigned attribute node.
 */
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

/**
 * The node a class actually shows at `node`'s position. When the active class
 * overrides it (e.g. the Witch's "Spell and Minion Damage" for the generic
 * "Spell Damage"), the override's name/stats/icon replace the base node's; the
 * geometry and kind flags stay. Returns the node unchanged otherwise.
 */
export function classOverrideNode(
  data: TreeData,
  classId: number | null | undefined,
  node: TreeNode,
): TreeNode {
  if (classId == null) {
    return node;
  }

  const target = data.classes.find((cls) => cls.id === classId)?.overridePairs?.[node.skill];
  const override = target !== undefined ? data.nodes[target] : undefined;

  if (!override) {
    return node;
  }

  return { ...node, name: override.name, stats: override.stats, icon: override.icon };
}

/** A hidden special socket (the Sinister sockets): never drawn on the base tree. */
function isHiddenSocket(node: TreeNode): boolean {
  return node.noRadius === true && node.isJewelSocket === true;
}

/** Accumulates a bounding box from points + their reach; empty -> a fallback. */
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
