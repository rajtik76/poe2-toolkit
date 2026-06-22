/**
 * Normalise GGG's official skill-tree export (`data.json`) into the engine's
 * {@link TreeData}.
 *
 * This is the only place that knows GGG's field names and quirks. Everything
 * downstream works against the clean {@link TreeData} contract. The transform is
 * deliberately tolerant: optional fields come and go across patches and missing
 * data should never throw.
 *
 * The GGG quirks handled here:
 *  - node positions are **baked** (`node.x`/`node.y`); the export ships none of
 *    the orbit-radius constants needed to recompute them, so they are read as-is;
 *  - edges are split across `in` + `out` id lists, merged into one set here;
 *  - arc geometry lives in a separate top-level `edges` table, not on the node;
 *  - attribute choices live in a global `skillOverrides` table, not per node;
 *  - ascendancy ids are internal (`Ranger1`) and mapped to display names here;
 *  - centre/ring dimensions are absent — filled from stable atlas frame sizes.
 */

import type {
  AscendancyDef,
  ClassDef,
  Group,
  NodeOption,
  Point,
  TreeData,
  TreeNode,
} from '../types.js';

// --- raw GGG shapes (only the fields we read) ------------------------------

export interface GggTreeJson {
  groups: Record<string, GggGroup>;
  nodes: Record<string, GggNode>;
  classes: GggClass[];
  /** Per-edge geometry: arcs carry `orbit` + the arc centre `orbitX`/`orbitY`. */
  edges?: GggEdge[];
  /** Global attribute-choice definitions, keyed by the (shared) override id. */
  skillOverrides?: Record<string, GggSkillOverride>;
  jewelSlots?: (string | number)[];
  min_x: number;
  min_y: number;
  max_x: number;
  max_y: number;
}

interface GggEdge {
  from: string | number;
  to: string | number;
  /** Present when the edge is an arc; the orbit it follows. */
  orbit?: number;
  /** World centre of the arc, when GGG provides it. */
  orbitX?: number;
  orbitY?: number;
}

interface GggGroup {
  x: number;
  y: number;
  orbits?: number[];
  nodes?: (string | number)[];
}

interface GggNode {
  skill?: number;
  name?: string;
  icon?: string;
  stats?: string[];
  x?: number;
  y?: number;
  group?: number;
  orbit?: number;
  orbitIndex?: number;
  in?: (string | number)[];
  out?: (string | number)[];
  isNotable?: boolean;
  isKeystone?: boolean;
  isMastery?: boolean;
  isJewelSocket?: boolean;
  isGenericAttribute?: boolean;
  isAscendancyStart?: boolean;
  activeEffectImage?: string;
  ascendancyId?: string;
  /** Class indices (into `classes`) that start at this node. */
  classStartIndex?: number[];
  flavourText?: string[] | string;
  recipe?: string[];
  unlockConstraint?: { ascendancy?: string; nodes?: number[] };
}

interface GggSkillOverride {
  id?: string;
  skill?: number;
  name?: string;
  icon?: string;
  stats?: string[];
}

interface GggAscendancy {
  id: string;
  name?: string;
  /** Hub-relative position of the disc centre (radius ~1332 toward the class). */
  offsetX?: number;
  offsetY?: number;
}

interface GggClass {
  name: string;
  base_str: number;
  base_dex: number;
  base_int: number;
  image?: string;
  ascendancies?: GggAscendancy[];
  /** Per-class node display overrides: base skill id -> override skill id. */
  overridePairs?: Record<string | number, number>;
}

// --- centre/ring sizes (GGG atlas frame dimensions, stable across classes) --

/** Class portrait atlas frame (`background-<class>` Class0..3), 1500². */
const PORTRAIT_SIZE = 1500;
/** Ornate + rotating ring atlas frames (`group-background`), 2000². */
const RING_SIZE = 2000;
/** Ascendancy disc portrait, 1500². */
const ASCENDANCY_DISC_SIZE = 1500;
/** Central opening radius — the game's `PSSCentreInnerRadius` constant. */
const CENTRE_INNER_RADIUS = 130;

/**
 * @param raw     parsed GGG `data.json`
 * @param version tree/patch version (e.g. "0_5") — GGG does not store it inside
 *                the file, so it is supplied here
 */
export function normalizeGggTree(raw: GggTreeJson, version: string): TreeData {
  const ascendancyNames = mapAscendancyNames(raw.classes);
  const attributeOptions = mapAttributeOptions(raw.skillOverrides);
  const classNames = raw.classes.map((cls) => cls.name);
  const edgeArcs = mapEdgeArcs(raw.edges);
  const nodes = normalizeNodes(raw, ascendancyNames, attributeOptions, classNames, edgeArcs);
  const ascendancyStarts = mapAscendancyStarts(raw.nodes);
  const startNodeByClass = mapClassStartNodes(raw.nodes);

  return {
    version,
    constants: { centreInnerRadius: CENTRE_INNER_RADIUS },
    groups: normalizeGroups(raw.groups),
    nodes,
    classes: raw.classes.map((cls, index) =>
      normalizeClass(cls, index, startNodeByClass, ascendancyStarts),
    ),
    jewelSlots: (raw.jewelSlots ?? []).map(Number),
    bounds: { minX: raw.min_x, minY: raw.min_y, maxX: raw.max_x, maxY: raw.max_y },
  };
}

/** GGG `groups` is keyed by group id (1-based numeric strings) with no holes. */
function normalizeGroups(raw: Record<string, GggGroup>): Record<number, Group> {
  const groups: Record<number, Group> = {};

  for (const [key, group] of Object.entries(raw)) {
    groups[Number(key)] = {
      x: group.x,
      y: group.y,
      orbits: group.orbits ?? [],
      nodes: (group.nodes ?? []).map(Number),
    };
  }

  return groups;
}

/** Undirected key for an edge between two skill ids. */
function edgeKey(a: number, b: number): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * GGG's top-level `edges` table marks arcs and gives each arc's world centre
 * directly (`orbitX`/`orbitY`). Map it by undirected edge key; only entries with
 * a centre are kept (arcs without one fall back to the geometric rule).
 */
function mapEdgeArcs(edges: GggEdge[] | undefined): Map<string, Point> {
  const arcs = new Map<string, Point>();

  for (const edge of edges ?? []) {
    if (edge.orbitX !== undefined && edge.orbitY !== undefined) {
      arcs.set(edgeKey(Number(edge.from), Number(edge.to)), { x: edge.orbitX, y: edge.orbitY });
    }
  }

  return arcs;
}

function normalizeNodes(
  raw: GggTreeJson,
  ascendancyNames: Map<string, string>,
  attributeOptions: NodeOption[],
  classNames: string[],
  edgeArcs: Map<string, Point>,
): Record<number, TreeNode> {
  const nodes: Record<number, TreeNode> = {};

  for (const [key, node] of Object.entries(raw.nodes)) {
    const skill = node.skill ?? Number(key);
    nodes[skill] = normalizeNode(skill, node, ascendancyNames, attributeOptions, classNames, edgeArcs);
  }

  return nodes;
}

function normalizeNode(
  skill: number,
  raw: GggNode,
  ascendancyNames: Map<string, string>,
  attributeOptions: NodeOption[],
  classNames: string[],
  edgeArcs: Map<string, Point>,
): TreeNode {
  const name = raw.name ?? '';
  // GGG ships edges split across `in` and `out`; merge + dedupe into one set.
  const neighbours = new Set<number>([
    ...(raw.in ?? []).map(Number),
    ...(raw.out ?? []).map(Number),
  ]);
  const ascendancyName = raw.ascendancyId
    ? ascendancyNames.get(raw.ascendancyId) ?? raw.ascendancyId
    : undefined;

  return {
    skill,
    group: raw.group ?? -1,
    orbit: raw.orbit ?? 0,
    orbitIndex: raw.orbitIndex ?? 0,
    x: raw.x ?? 0,
    y: raw.y ?? 0,
    connections: [...neighbours].map((id) => {
      const arcCentre = edgeArcs.get(edgeKey(skill, id));

      return arcCentre ? { id, arcCentre } : { id };
    }),
    name,
    icon: raw.icon ?? '',
    stats: cleanStats(raw.stats),
    // Kind flags and metadata are added only when present, so absence stays
    // absent (exactOptionalPropertyTypes-friendly).
    ...(raw.isNotable ? { isNotable: true } : {}),
    ...(raw.isKeystone ? { isKeystone: true } : {}),
    ...(raw.isJewelSocket ? { isJewelSocket: true } : {}),
    // GGG has no `noRadius`; the hidden Sinister sockets are identified by name.
    ...(raw.isJewelSocket && name.includes('SinisterJewelSocket') ? { noRadius: true } : {}),
    ...(raw.isMastery ? { isMastery: true } : {}),
    ...(raw.isAscendancyStart ? { isAscendancyStart: true } : {}),
    ...(raw.isGenericAttribute ? { isAttribute: true } : {}),
    ...(raw.activeEffectImage !== undefined ? { activeEffectImage: raw.activeEffectImage } : {}),
    ...(ascendancyName !== undefined ? { ascendancyName } : {}),
    ...(raw.flavourText !== undefined ? { flavourText: joinFlavour(raw.flavourText) } : {}),
    ...(raw.recipe !== undefined ? { recipe: raw.recipe } : {}),
    // Generic +attribute nodes share the three global Str/Dex/Int choices.
    ...(raw.isGenericAttribute && attributeOptions.length > 0 ? { options: attributeOptions } : {}),
    ...(raw.unlockConstraint ? { conditional: true } : {}),
    ...(raw.unlockConstraint?.ascendancy !== undefined ? { unlockAscendancy: raw.unlockConstraint.ascendancy } : {}),
    ...(raw.classStartIndex && raw.classStartIndex.length > 0
      ? { classesStart: raw.classStartIndex.map((i) => classNames[i] ?? String(i)) }
      : {}),
  };
}

/** GGG ships keystone flavour text as an array of lines; join into one string. */
function joinFlavour(flavour: string[] | string): string {
  return Array.isArray(flavour) ? flavour.join('\n') : flavour;
}

/**
 * GGG stat lines carry inline reference tags: `[ref|display]` renders as
 * `display`, `[ref]` as `ref` (e.g. `[Critical|Critical Hit Chance]` ->
 * "Critical Hit Chance", `[Curse|Curses]` -> "Curses", `[Shock]` -> "Shock").
 * The `display` side is the player-facing text, including the correct plural —
 * strip the tags down to it.
 */
function cleanStatText(line: string): string {
  return line.replace(/\[(?:[^|\]]*\|)?([^\]]+)\]/g, '$1');
}

/** Apply {@link cleanStatText} across a list of stat lines. */
function cleanStats(stats: string[] | undefined): string[] {
  return (stats ?? []).map(cleanStatText);
}

/**
 * Map GGG's internal ascendancy ids ("Ranger1") to display names ("Deadeye").
 * The display name is what a build's chosen ascendancy is keyed by, so node and
 * allocation agree. Unreleased ascendancies carry no name and are skipped.
 */
function mapAscendancyNames(classes: GggClass[]): Map<string, string> {
  const names = new Map<string, string>();

  for (const cls of classes) {
    for (const asc of cls.ascendancies ?? []) {
      if (asc.name) {
        names.set(asc.id, asc.name);
      }
    }
  }

  return names;
}

/** Preferred display order of attribute choices (GGG keys them by numeric id). */
const ATTRIBUTE_ORDER = ['Strength', 'Dexterity', 'Intelligence'];

/**
 * The three shared attribute choices (Str / Dex / Int), read from GGG's global
 * `skillOverrides` table. That table also holds unrelated overrides (Pathfinder
 * alternates, per-class node swaps), so it is filtered to the `generic_attribute`
 * entries. Every generic-attribute node reuses these, ordered Str/Dex/Int.
 */
function mapAttributeOptions(overrides: Record<string, GggSkillOverride> | undefined): NodeOption[] {
  if (!overrides) {
    return [];
  }

  return Object.entries(overrides)
    .filter(([, override]) => override.id?.startsWith('generic_attribute'))
    .map(([key, override]) => ({
      id: override.skill ?? Number(key),
      name: override.name ?? '',
      stats: cleanStats(override.stats),
      icon: override.icon ?? '',
    }))
    .sort((a, b) => orderIndex(a.name) - orderIndex(b.name));
}

function orderIndex(name: string): number {
  const index = ATTRIBUTE_ORDER.indexOf(name);

  return index === -1 ? ATTRIBUTE_ORDER.length : index;
}

/**
 * The world position of each ascendancy's start node (the diamond), keyed by
 * GGG ascendancy id. GGG bakes every ascendancy at a far-flung cluster; the
 * start node is the anchor the renderer relocates onto the hub. Ascendancies
 * with no nodes (e.g. unreleased "Abyssal Lich") are simply absent.
 */
function mapAscendancyStarts(nodes: Record<string, GggNode>): Map<string, Point> {
  const starts = new Map<string, Point>();

  for (const node of Object.values(nodes)) {
    if (node.isAscendancyStart && node.ascendancyId && node.x !== undefined && node.y !== undefined) {
      starts.set(node.ascendancyId, { x: node.x, y: node.y });
    }
  }

  return starts;
}

/**
 * Build a class-index -> start-node-skill-id map. A class-start node lists the
 * class indices that start there in `classStartIndex` (often two); the same node
 * can serve several classes.
 */
function mapClassStartNodes(nodes: Record<string, GggNode>): Map<number, number> {
  const byClass = new Map<number, number>();

  for (const [key, node] of Object.entries(nodes)) {
    const skill = node.skill ?? Number(key);

    for (const classIndex of node.classStartIndex ?? []) {
      if (!byClass.has(classIndex)) {
        byClass.set(classIndex, skill);
      }
    }
  }

  return byClass;
}

function normalizeClass(
  raw: GggClass,
  index: number,
  startNodeByClass: Map<number, number>,
  ascendancyStarts: Map<string, Point>,
): ClassDef {
  return {
    name: raw.name,
    id: index,
    baseStr: raw.base_str,
    baseDex: raw.base_dex,
    baseInt: raw.base_int,
    startNode: startNodeByClass.get(index) ?? -1,
    centre: {
      image: `Classes${raw.name}`,
      x: 0,
      y: 0,
      art: { width: PORTRAIT_SIZE, height: PORTRAIT_SIZE },
      active: { width: RING_SIZE, height: RING_SIZE },
      frame: { width: RING_SIZE, height: RING_SIZE },
    },
    // Keep only released ascendancies — ones with a name AND a start node (i.e.
    // actual nodes; e.g. "Abyssal Lich" is named but has none yet, so dropped).
    ascendancies: (raw.ascendancies ?? [])
      .filter((asc): asc is GggAscendancy & { name: string } =>
        Boolean(asc.name) && ascendancyStarts.has(asc.id),
      )
      .map((asc) => normalizeAscendancy(asc, ascendancyStarts)),
    ...(raw.overridePairs ? { overridePairs: normalizeOverrides(raw.overridePairs) } : {}),
  };
}

/** Normalise the override map's string keys to numeric skill ids. */
function normalizeOverrides(raw: Record<string | number, number>): Record<number, number> {
  const out: Record<number, number> = {};

  for (const [base, target] of Object.entries(raw)) {
    out[Number(base)] = target;
  }

  return out;
}

function normalizeAscendancy(
  raw: GggAscendancy & { name: string },
  ascendancyStarts: Map<string, Point>,
): AscendancyDef {
  const start = ascendancyStarts.get(raw.id) ?? { x: 0, y: 0 };
  // The renderer relocates each disc node by `centre − worldAnchor`. GGG's
  // `offsetX/offsetY` is where the start diamond must land in the hub — on the
  // class's quatrefoil axis, 1332u out (verified against the original PoB
  // layout, exact to ~10u). So worldAnchor = startNode + offset places the
  // diamond on the quatrefoil axis and the rest of the cluster around it.
  const offsetX = raw.offsetX ?? 0;
  const offsetY = raw.offsetY ?? 0;

  return {
    id: raw.name,
    name: raw.name,
    internalId: raw.id,
    image: `Classes${raw.name.replace(/\s+/g, '')}`,
    worldAnchor: { x: start.x + offsetX, y: start.y + offsetY },
    size: { width: ASCENDANCY_DISC_SIZE, height: ASCENDANCY_DISC_SIZE },
  };
}
