/**
 * Normalises GGG's skill-tree export (`data.json`) into {@link TreeData}. The only place that knows GGG's quirks,
 * deliberately tolerant of fields that come and go across patches:
 *  - node positions are baked (`node.x`/`node.y`), read as-is;
 *  - edges are split across `in` + `out`, merged here;
 *  - arc geometry lives in a top-level `edges` table;
 *  - attribute choices live in a global `skillOverrides` table;
 *  - ascendancy ids are internal (`Ranger1`), mapped to display names;
 *  - centre/ring dimensions are absent, filled from atlas frame sizes.
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

export interface GggTreeJson {
  groups: Record<string, GggGroup>;
  nodes: Record<string, GggNode>;
  classes: GggClass[];
  edges?: GggEdge[];
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
  orbit?: number;
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
  noRadius?: boolean;
  isGenericAttribute?: boolean;
  isAscendancyStart?: boolean;
  isMultipleChoice?: boolean;
  isMultipleChoiceOption?: boolean;
  isFreeAllocate?: boolean;
  containJewelSocket?: boolean;
  applyToArmour?: boolean;
  activeEffectImage?: string;
  ascendancyId?: string;
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
  offsetX?: number;
  offsetY?: number;
  replaces?: string;
  overridePairs?: Record<string | number, number>;
}

interface GggClass {
  name: string;
  base_str: number;
  base_dex: number;
  base_int: number;
  image?: string;
  ascendancies?: GggAscendancy[];
  overridePairs?: Record<string | number, number>;
}

const PORTRAIT_SIZE = 1500;
const RING_SIZE = 2000;
const ASCENDANCY_DISC_SIZE = 1500;
const CENTRE_INNER_RADIUS = 130;

/**
 * @param raw     parsed GGG `data.json`
 * @param version tree/patch version (e.g. "0_5"), not stored in the file
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
      normalizeClass(cls, index, startNodeByClass, ascendancyStarts, ascendancyNames),
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

/** Arcs by undirected edge key; only entries with a centre are kept (others fall back to the geometric rule). */
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
    ...(raw.isNotable ? { isNotable: true } : {}),
    ...(raw.isKeystone ? { isKeystone: true } : {}),
    ...(raw.isJewelSocket ? { isJewelSocket: true } : {}),
    // Hidden Sinister sockets: the extractor flags `noRadius`; older exports only had the raw bbcode name.
    ...(raw.noRadius || (raw.isJewelSocket && name.includes('SinisterJewelSocket')) ? { noRadius: true } : {}),
    ...(raw.isMastery ? { isMastery: true } : {}),
    ...(raw.isAscendancyStart ? { isAscendancyStart: true } : {}),
    ...(raw.isGenericAttribute ? { isAttribute: true } : {}),
    ...(raw.isMultipleChoice ? { isMultipleChoice: true } : {}),
    ...(raw.isMultipleChoiceOption ? { isMultipleChoiceOption: true } : {}),
    ...(raw.isFreeAllocate ? { isFreeAllocate: true } : {}),
    ...(raw.containJewelSocket ? { containJewelSocket: true } : {}),
    ...(raw.applyToArmour ? { applyToArmour: true } : {}),
    ...(raw.activeEffectImage !== undefined ? { activeEffectImage: raw.activeEffectImage } : {}),
    ...(ascendancyName !== undefined ? { ascendancyName } : {}),
    ...(raw.flavourText !== undefined ? { flavourText: joinFlavour(raw.flavourText) } : {}),
    ...(raw.recipe !== undefined ? { recipe: raw.recipe } : {}),
    // Generic +attribute nodes share the three global Str/Dex/Int choices.
    ...(raw.isGenericAttribute && attributeOptions.length > 0 ? { options: attributeOptions } : {}),
    ...(raw.unlockConstraint ? { conditional: true } : {}),
    ...(raw.unlockConstraint?.ascendancy !== undefined ? { unlockAscendancy: raw.unlockConstraint.ascendancy } : {}),
    ...(raw.unlockConstraint?.nodes?.length ? { unlockNodes: raw.unlockConstraint.nodes.map(Number) } : {}),
    ...(raw.classStartIndex && raw.classStartIndex.length > 0
      ? { classesStart: raw.classStartIndex.map((i) => classNames[i] ?? String(i)) }
      : {}),
  };
}

function joinFlavour(flavour: string[] | string): string {
  return Array.isArray(flavour) ? flavour.join('\n') : flavour;
}

/** Strips inline reference tags to the player-facing text: `[ref|display]` -> `display`, `[ref]` -> `ref`. */
function cleanStatText(line: string): string {
  return line.replace(/\[(?:[^|\]]*\|)?([^\]]+)\]/g, '$1');
}

function cleanStats(stats: string[] | undefined): string[] {
  return (stats ?? []).map(cleanStatText);
}

/** Internal ascendancy ids ("Ranger1") to display names ("Deadeye"), which is what a build keys by. Unnamed (unreleased) ones are skipped. */
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

const ATTRIBUTE_ORDER = ['Strength', 'Dexterity', 'Intelligence'];

/** The Str/Dex/Int choices from `skillOverrides`, filtered to `generic_attribute` (the table also holds Pathfinder alternates and per-class swaps). */
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

/** World position of each ascendancy's start node, the anchor the renderer relocates onto the hub. Ascendancies without nodes of their own are absent. */
function mapAscendancyStarts(nodes: Record<string, GggNode>): Map<string, Point> {
  const starts = new Map<string, Point>();

  for (const node of Object.values(nodes)) {
    if (node.isAscendancyStart && node.ascendancyId && node.x !== undefined && node.y !== undefined) {
      starts.set(node.ascendancyId, { x: node.x, y: node.y });
    }
  }

  return starts;
}

/** Class index -> start node. One start node can serve several classes (`classStartIndex`). */
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
  ascendancyNames: Map<string, string>,
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
    // Released = a name AND a start node, own or the replaced ascendancy's (Abyssal Lich plays on the Lich's nodes).
    ascendancies: (raw.ascendancies ?? [])
      .filter((asc): asc is GggAscendancy & { name: string } =>
        Boolean(asc.name) && ascendancyStarts.has(asc.replaces ?? asc.id),
      )
      .map((asc) => normalizeAscendancy(asc, ascendancyStarts, ascendancyNames)),
    ...(raw.overridePairs ? { overridePairs: normalizeOverrides(raw.overridePairs) } : {}),
  };
}

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
  ascendancyNames: Map<string, string>,
): AscendancyDef {
  const start = ascendancyStarts.get(raw.replaces ?? raw.id) ?? { x: 0, y: 0 };
  // The renderer relocates each disc node by `centre - worldAnchor`. GGG's `offsetX/offsetY` is where the start diamond
  // must land on the class's quatrefoil axis, 1332u out (exact to ~10u vs the original PoB layout).
  const offsetX = raw.offsetX ?? 0;
  const offsetY = raw.offsetY ?? 0;

  return {
    id: raw.name,
    name: raw.name,
    internalId: raw.id,
    image: `Classes${raw.name.replace(/\s+/g, '')}`,
    worldAnchor: { x: start.x + offsetX, y: start.y + offsetY },
    size: { width: ASCENDANCY_DISC_SIZE, height: ASCENDANCY_DISC_SIZE },
    ...(raw.replaces !== undefined ? { replaces: ascendancyNames.get(raw.replaces) ?? raw.replaces } : {}),
    ...(raw.overridePairs ? { overridePairs: normalizeOverrides(raw.overridePairs) } : {}),
  };
}
