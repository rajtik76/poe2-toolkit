/**
 * Builds the passive-tree `data.json` from GGPK tables + the `.psg` graph, in
 * the shape `@poe2-toolkit/tree-core`'s `normalizeGggTree` expects. Source of truth:
 * GGPK only.
 *
 * Linkage (verified): a node's `skill` = PassiveSkillGraphId; the `.psg` keys
 * nodes by the same id; PassiveSkills rows join by PassiveSkillGraphId.
 * Positions are computed from group centre + orbit radius + orbit index (radii
 * derived from the live tree, exact). Stats render via the passive + base
 * stat-description files.
 */

import { buildStatIndex, renderBlock   } from '@poe2-toolkit/ggpk';
import type {GgpkSource, StatIndex} from '@poe2-toolkit/ggpk';

import { parsePsg } from './psg.js';
import type { Psg } from './psg.js';

// Orbit radii derived from the live tree (zero spread per orbit; angle formula
// matched 5150/5150 baked positions). Index = orbit.
const ORBIT_RADII = [0, 82, 164, 334, 488, 657, 839, 250, 1076, 1320];

/** The int32 the `.psg` writes as a per-edge orbit when the edge is a straight line. */
const LINE_SENTINEL = 2147483647;

/** World position of a graph node from its group anchor + orbit ring + slot. */
function orbitPosition(psg: Psg, node: { group: number; orbit: number; orbitIndex: number }): { x: number; y: number } {
  const group = psg.groups[node.group];

  if (!group) {
    return { x: 0, y: 0 };
  }

  const radius = ORBIT_RADII[node.orbit] ?? 0;
  const segments = psg.passivesPerOrbit[node.orbit] || 1;
  const angle = (2 * Math.PI * node.orbitIndex) / segments;

  return { x: group.x + radius * Math.sin(angle), y: group.y - radius * Math.cos(angle) };
}

/**
 * Centre of the radius-`R` circle through `a` and `b`, on the side `side` (the
 * sign of the per-edge orbit word) selects. Null when no such circle exists (the
 * points are coincident or further apart than the diameter) — then it's a line.
 */
function arcCentre(
  a: { x: number; y: number },
  b: { x: number; y: number },
  radius: number,
  side: number,
): { x: number; y: number } | null {
  if (radius <= 0) {
    return null;
  }

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);

  if (dist === 0 || dist > 2 * radius) {
    return null;
  }

  const half = Math.sqrt(radius * radius - (dist / 2) ** 2);
  const sign = side < 0 ? -1 : 1;

  // Midpoint offset along the unit perpendicular to AB. Handedness matches GGG's
  // own renderer (Path of Building's `PassiveTree:BuildConnector`): with `a` the
  // edge's owning node and `b` its target, `+perp·(dy,−dx)/dist`. The mirror of
  // this (negating both) bows every arc the wrong way.
  return { x: (a.x + b.x) / 2 + (sign * half * dy) / dist, y: (a.y + b.y) / 2 - (sign * half * dx) / dist };
}

const ASC_RADIUS = 1332;

const PSG_PATH = 'metadata/passiveskillgraph.psg';
const BASE_STATS_PATH = 'data/statdescriptions/stat_descriptions.csd';
const PASSIVE_STATS_PATH = 'data/statdescriptions/passive_skill_stat_descriptions.csd';

// --- raw GGPK row shapes (only the columns this build reads) -----------------

interface PassiveSkillRow {
  PassiveSkillGraphId?: number | null;
  Name?: string;
  Icon_DDSFile?: string;
  Stats?: number[];
  Stat1Value?: number;
  Stat2Value?: number;
  Stat3Value?: number;
  Stat4Value?: number;
  Stat5Value?: number;
  IsNotable?: boolean;
  IsKeystone?: boolean;
  IsJewelSocket?: boolean;
  IsAttribute?: boolean;
  IsAscendancyStartingNode?: boolean;
  MasteryGroup?: number | null;
  Ascendancy?: number | null;
  Characters?: number[];
  FlavourText?: unknown;
  /** Row indices of the passives that must be allocated for this node to appear. */
  UnlockedBy?: number[];
}

interface StatRow { Id?: string }
interface MasteryGroupRow { Art?: number | null }
interface MasteryArtRow { ActiveEffectImage?: string }
interface CharacterRow { Name: string; BaseStrength: number; BaseDexterity: number; BaseIntelligence: number }
interface AscendancyRow { Id: string; Name?: string; Character?: number | null; Disabled?: boolean }
interface JewelSlotRow { Slot?: number | null }
interface ClassOverrideRow { SkillToOverride: number; Override: number; CharacterToOverrideFor: number }

// --- exported tree shape -----------------------------------------------------

/** A tree node as serialized to `data.json` (graph node, or data-only override). */
export interface ExportNode {
  skill: number;
  name: string;
  icon: string;
  stats: string[];
  group?: number;
  orbit?: number;
  orbitIndex?: number;
  x?: number;
  y?: number;
  out?: number[];
  in?: number[];
  isNotable?: true;
  isKeystone?: true;
  isJewelSocket?: true;
  isMastery?: true;
  isGenericAttribute?: true;
  isAscendancyStart?: true;
  activeEffectImage?: string;
  ascendancyId?: string;
  classStartIndex?: number[];
  flavourText?: unknown;
  /**
   * Allocation gate: GGG hides this node on the base tree until an unlocking
   * passive is taken (e.g. the Oracle "The Unseen Path" clusters). `nodes` are
   * the skill ids that unlock it; `ascendancy` is the ascendancy that owns them.
   * Absent when the node is unconditional.
   */
  unlockConstraint?: { ascendancy?: string; nodes: number[] };
}

export interface ExportAscendancy { id: string; name: string; offsetX: number; offsetY: number }

export interface ExportClass {
  name: string;
  base_str: number;
  base_dex: number;
  base_int: number;
  ascendancies: ExportAscendancy[];
  overridePairs: Record<number, number>;
}

export interface ExportGroup {
  x: number;
  y: number;
  orbits: number[];
  nodes: number[];
  /** Raw `.psg` group words; purpose not yet decoded, kept so nothing is lost. */
  flag: number;
  unknown1: number;
}

/** A directed arc edge: the orbit it follows and that orbit's world centre. */
export interface ExportEdge {
  from: number;
  to: number;
  orbit: number;
  orbitX: number;
  orbitY: number;
}

/** A graph root with its raw `.psg` curvature word (kept verbatim). */
export interface ExportRoot {
  id: number;
  curvature: number;
}

/** The full `data.json` payload. */
export interface TreeExport {
  tree: string;
  classes: ExportClass[];
  groups: Record<number, ExportGroup>;
  nodes: Record<number, ExportNode>;
  edges: ExportEdge[];
  roots: ExportRoot[];
  skillOverrides: Record<number, Record<string, unknown>>;
  jewelSlots: number[];
  min_x: number;
  min_y: number;
  max_x: number;
  max_y: number;
}

/** Read a UTF-16 `.csd` stat-description file from the source into a string. */
async function readCsd(source: GgpkSource, path: string): Promise<string> {
  const bytes = await source.file(path);

  if (!bytes) {
    throw new Error(`stat descriptions not found: ${path}`);
  }

  return Buffer.from(bytes).toString('utf16le');
}

/**
 * Build the passive-tree export. All data comes from the supplied
 * {@link GgpkSource}; this function performs no I/O of its own beyond what the
 * source serves.
 */
export async function buildTree(source: GgpkSource): Promise<TreeExport> {
  const PassiveSkills = (await source.table('PassiveSkills')) as PassiveSkillRow[];
  const Stats = (await source.table('Stats')) as StatRow[];
  const MasteryGroups = (await source.table('PassiveSkillMasteryGroups')) as MasteryGroupRow[];
  const MasteryArt = (await source.table('PassiveSkillTreeMasteryArt')) as MasteryArtRow[];
  const Characters = (await source.table('Characters')) as unknown as CharacterRow[];
  const Ascendancy = (await source.table('Ascendancy')) as unknown as AscendancyRow[];
  const JewelSlots = (await source.table('PassiveJewelSlots')) as JewelSlotRow[];
  const ClassOverrides = (await source.table('ClassPassiveSkillOverrides')) as unknown as ClassOverrideRow[];

  // Combined stat index: the passive file `include`s the base one, but the
  // parser doesn't follow includes — merge both, passive entries win on conflict.
  const baseIdx = buildStatIndex(await readCsd(source, BASE_STATS_PATH));
  const passiveIdx = buildStatIndex(await readCsd(source, PASSIVE_STATS_PATH));
  const statIdx: StatIndex = { byStat: new Map([...baseIdx.byStat, ...passiveIdx.byStat]) };

  const psgBytes = await source.file(PSG_PATH);

  if (!psgBytes) {
    throw new Error(`passive skill graph not found: ${PSG_PATH}`);
  }

  const psg = parsePsg(psgBytes);

  // --- joins -----------------------------------------------------------------

  const byGraphId = new Map<number, PassiveSkillRow>();

  for (const row of PassiveSkills) {
    if (row.PassiveSkillGraphId != null) {
      byGraphId.set(row.PassiveSkillGraphId, row);
    }
  }

  /** Render a passive's stat lines from its Stats foreign rows + Stat1..5Value. */
  function renderStats(row: PassiveSkillRow): string[] {
    const statIds = (row.Stats ?? []).map((i) => Stats[i]?.Id).filter((id): id is string => Boolean(id));

    if (!statIds.length) {
      return [];
    }

    const vals = [row.Stat1Value, row.Stat2Value, row.Stat3Value, row.Stat4Value, row.Stat5Value];

    // GGG templates carry literal "\n" for multi-line stats; make it a real newline.
    return renderBlock(statIdx, statIds, vals as number[]).lines.map((line) => line.replace(/\\n/g, '\n'));
  }

  // A mastery's cluster all carry MasteryGroup; the mastery node itself grants
  // nothing (no stats) and isn't a notable/keystone.
  function isMasteryNode(row: PassiveSkillRow): boolean {
    return row.MasteryGroup != null && (!row.Stats || row.Stats.length === 0) && !row.IsNotable && !row.IsKeystone;
  }

  /** Mastery node's background pattern image (extensionless, like GGG ships it). */
  function activeEffectImage(row: PassiveSkillRow): string | undefined {
    if (row.MasteryGroup == null) {
      return undefined;
    }

    const group = MasteryGroups[row.MasteryGroup];
    const art = group?.Art != null ? MasteryArt[group.Art] : undefined;

    return art?.ActiveEffectImage || undefined;
  }

  // Bidirectional adjacency (the `.psg` stores each edge once, directed, so
  // mirror it). `incoming` keeps the raw direction: the nodes that point INTO a
  // given node — that's what activates a mastery.
  const adjacency = new Map<number, Set<number>>();
  const incoming = new Map<number, Set<number>>();
  const addEdge = (a: number, b: number): void => {
    if (!adjacency.has(a)) {
      adjacency.set(a, new Set());
    }

    adjacency.get(a)!.add(b);
  };

  const psgById = new Map(psg.nodes.map((node) => [node.skillId, node]));

  // Per-edge arc geometry, decoded from the `.psg`'s raw per-edge orbit word:
  //  - the int32 sentinel  -> a straight line (e.g. a same-orbit chord, "Shockproof");
  //  - `0`                 -> arc along the shared orbit (same group + orbit only),
  //                           centred on the group; any other endpoints are a spoke;
  //  - `±N` (1..9)         -> a curved connector between ANY two nodes (cross-group
  //                           included, matching GGG/PoB), radius `ORBIT_RADII[N]`,
  //                           the sign choosing which equidistant centre (arc bow).
  // The arc centre is resolved here (the renderer just sweeps the short way A->B
  // around it) so nothing downstream has to guess from shared group/orbit.
  const edges: ExportEdge[] = [];

  for (const node of psg.nodes) {
    const group = psg.groups[node.group];

    for (const target of node.connections) {
      addEdge(node.skillId, target.id);
      addEdge(target.id, node.skillId);

      if (!incoming.has(target.id)) {
        incoming.set(target.id, new Set());
      }

      incoming.get(target.id)!.add(node.skillId);

      const other = psgById.get(target.id);

      if (!group || !other || target.orbit === LINE_SENTINEL) {
        continue; // missing or explicit-line edge -> straight
      }

      let centre: { x: number; y: number } | null = null;

      if (target.orbit === 0) {
        // Default ring arc: same group AND same orbit only, centred on the group
        // (PoB BuildConnector case B). Any other `0` edge is a straight spoke.
        if (other.group === node.group && other.orbit === node.orbit && node.orbit > 0) {
          centre = { x: group.x, y: group.y };
        }
      } else {
        // Explicit curved connector (PoB case A): a circle of the orbit's radius
        // through both nodes, on the side the sign selects. No same-group check —
        // GGG bows these across groups too; the world positions already differ.
        const radius = ORBIT_RADII[Math.abs(target.orbit)] ?? 0;
        centre = arcCentre(orbitPosition(psg, node), orbitPosition(psg, other), radius, Math.sign(target.orbit));
      }

      if (centre) {
        edges.push({
          from: node.skillId,
          to: target.id,
          orbit: Math.abs(target.orbit),
          orbitX: Number(centre.x.toFixed(3)),
          orbitY: Number(centre.y.toFixed(3)),
        });
      }
    }
  }

  // --- nodes -----------------------------------------------------------------

  function position(node: { group: number; orbit: number; orbitIndex: number }): { x: number; y: number } {
    const group = psg.groups[node.group]!;
    const radius = ORBIT_RADII[node.orbit] ?? 0;
    const segments = psg.passivesPerOrbit[node.orbit] || 1;
    const angle = (2 * Math.PI * node.orbitIndex) / segments;

    return { x: group.x + radius * Math.sin(angle), y: group.y - radius * Math.cos(angle) };
  }

  // Real PoE2 classes only: GGPK still carries 4 PoE1 placeholder classes whose
  // ascendancies are all [DNT-UNUSED]. Keep classes with a released ascendancy;
  // remap the class-start indices a node lists onto the filtered class array.
  const DNT = (s: unknown): boolean => typeof s === 'string' && s.includes('[DNT');
  const isReleasedAscendancy = (a: AscendancyRow): boolean => Boolean(a.Name) && !DNT(a.Name) && !a.Disabled;
  const realClassIndices = [...Characters.keys()].filter((index) =>
    Ascendancy.some((a) => a.Character === index && isReleasedAscendancy(a)),
  );
  const classRemap = new Map(realClassIndices.map((oldIndex, newIndex) => [oldIndex, newIndex]));

  const nodes: Record<number, ExportNode> = {};

  for (const pnode of psg.nodes) {
    const row = byGraphId.get(pnode.skillId);

    if (!row) {
      continue;
    }

    const { x, y } = position(pnode);
    const ascId = row.Ascendancy != null ? Ascendancy[row.Ascendancy]?.Id : undefined;
    const characters = Array.isArray(row.Characters) ? row.Characters : [];
    const classStart = characters.filter((i) => classRemap.has(i)).map((i) => classRemap.get(i)!);
    const mastery = isMasteryNode(row);
    const effect = mastery ? activeEffectImage(row) : undefined;
    // Nodes GGG hides until an unlocking passive is allocated (e.g. Oracle's "The
    // Unseen Path" clusters). `UnlockedBy` holds the unlocking rows by index; map
    // them to skill ids and pick the ascendancy that owns them.
    const unlockRows = (row.UnlockedBy ?? []).map((i) => PassiveSkills[i]).filter((r): r is PassiveSkillRow => r != null);
    const unlockNodes = unlockRows.map((r) => r.PassiveSkillGraphId).filter((id): id is number => id != null);
    const unlockAscendancy = unlockRows
      .map((r) => (r.Ascendancy != null ? Ascendancy[r.Ascendancy]?.Name : undefined))
      .find((name): name is string => Boolean(name));
    const unlockConstraint = unlockNodes.length
      ? { ...(unlockAscendancy ? { ascendancy: unlockAscendancy } : {}), nodes: unlockNodes }
      : undefined;
    // A mastery's effect lights when any node it shares a `.psg` edge with (either
    // direction) is allocated. Masteries nothing points into never light, so they
    // get no activators. Pure data: when GGG re-wires the graph this just follows.
    const connections = mastery
      ? (incoming.has(pnode.skillId) ? [...(adjacency.get(pnode.skillId) ?? [])] : [])
      : [...(adjacency.get(pnode.skillId) ?? [])];

    nodes[pnode.skillId] = {
      skill: pnode.skillId,
      name: row.Name ?? '',
      icon: row.Icon_DDSFile ?? '',
      stats: renderStats(row),
      group: pnode.group,
      orbit: pnode.orbit,
      orbitIndex: pnode.orbitIndex,
      x: Number(x.toFixed(3)),
      y: Number(y.toFixed(3)),
      out: connections,
      in: [],
      ...(row.IsNotable ? { isNotable: true } : {}),
      ...(row.IsKeystone ? { isKeystone: true } : {}),
      ...(row.IsJewelSocket ? { isJewelSocket: true } : {}),
      ...(mastery ? { isMastery: true } : {}),
      ...(row.IsAttribute ? { isGenericAttribute: true } : {}),
      ...(row.IsAscendancyStartingNode ? { isAscendancyStart: true } : {}),
      ...(effect ? { activeEffectImage: effect } : {}),
      ...(ascId ? { ascendancyId: ascId } : {}),
      ...(unlockConstraint ? { unlockConstraint } : {}),
      ...(classStart.length ? { classStartIndex: classStart } : {}),
      ...(row.FlavourText ? { flavourText: row.FlavourText } : {}),
    };
  }

  // --- groups ----------------------------------------------------------------

  const groups: Record<number, ExportGroup> = {};
  psg.groups.forEach((group, index) => {
    const orbits = new Set<number>();

    for (const id of group.nodes) {
      const node = nodes[id];

      if (node && node.orbit !== undefined) {
        orbits.add(node.orbit);
      }
    }

    groups[index] = {
      x: Number(group.x.toFixed(3)),
      y: Number(group.y.toFixed(3)),
      orbits: [...orbits].sort((a, b) => a - b),
      nodes: group.nodes,
      flag: group.flag,
      unknown1: group.unknown1,
    };
  });

  // --- classes + ascendancies ------------------------------------------------

  // Hub centre = centroid of the class-start nodes; ascendancy discs sit 1332u
  // out along each class's axis (derived from GGPK geometry, matches GGG layout).
  const startNodes = Object.values(nodes).filter((n) => n.classStartIndex);
  const hub = {
    x: startNodes.reduce((s, n) => s + n.x!, 0) / startNodes.length,
    y: startNodes.reduce((s, n) => s + n.y!, 0) / startNodes.length,
  };

  /** Class-start node for a class index (each start serves two classes). */
  function classStartFor(classIndex: number): ExportNode | undefined {
    return startNodes.find((n) => n.classStartIndex?.includes(classIndex));
  }

  function ascendancyOffset(classIndex: number): { x: number; y: number } {
    const start = classStartFor(classIndex);

    if (!start) {
      return { x: 0, y: 0 };
    }

    const dx = start.x! - hub.x;
    const dy = start.y! - hub.y;
    const len = Math.hypot(dx, dy) || 1;

    // The renderer relocates the disc so its start diamond lands at `centre - offset`.
    // To put that diamond on the class quatrefoil (out along +direction), the offset
    // must point the opposite way: -direction * radius.
    return { x: -(dx / len) * ASC_RADIUS, y: -(dy / len) * ASC_RADIUS };
  }

  // Per-class node overrides: GGG swaps some nodes for a class-specific variant
  // (e.g. the Witch sees the generic "Spell Damage" as "Spell and Minion
  // Damage"). Keyed by the base node's graph id -> the override node's, per class.
  const overrideByClass = new Map<number, Record<number, number>>();

  for (const row of ClassOverrides) {
    const base = PassiveSkills[row.SkillToOverride]?.PassiveSkillGraphId;
    const target = PassiveSkills[row.Override]?.PassiveSkillGraphId;

    if (base == null || target == null) {
      continue;
    }

    if (!overrideByClass.has(row.CharacterToOverrideFor)) {
      overrideByClass.set(row.CharacterToOverrideFor, {});
    }

    overrideByClass.get(row.CharacterToOverrideFor)![base] = target;
  }

  const classes = realClassIndices.map((oldIndex, newIndex) => {
    const character = Characters[oldIndex]!;
    const offset = ascendancyOffset(newIndex);
    const ascendancies = Ascendancy
      .filter((a) => a.Character === oldIndex && isReleasedAscendancy(a))
      .map((a) => ({ id: a.Id, name: a.Name!, offsetX: offset.x, offsetY: offset.y }));

    return {
      name: character.Name,
      base_str: character.BaseStrength,
      base_dex: character.BaseDexterity,
      base_int: character.BaseIntelligence,
      ascendancies,
      overridePairs: overrideByClass.get(oldIndex) ?? {},
    };
  });

  // Override target nodes aren't in the graph — they only supply display data
  // when a class override swaps them in at the base node's position. Add them as
  // data-only entries (no geometry) so the renderer can resolve their fields.
  for (const pairs of overrideByClass.values()) {
    for (const target of Object.values(pairs)) {
      if (nodes[target]) {
        continue;
      }

      const row = byGraphId.get(target);

      if (!row) {
        continue;
      }

      nodes[target] = { skill: target, name: row.Name ?? '', icon: row.Icon_DDSFile ?? '', stats: renderStats(row) };
    }
  }

  // --- skillOverrides: the +attribute choices --------------------------------
  //
  // A generic +attribute node shows "+N to any Attribute" (the default state
  // planners use). Allocating it in-game forces Str/Dex/Int. GGG's
  // PassiveSkillOverrides table is empty in PoE2, so synthesise the three here.
  const skillOverrides: Record<number, Record<string, unknown>> = {};
  const anyAttribute = Object.values(nodes).find((node) => node.isGenericAttribute)?.stats?.[0] ?? '';
  const attributeValue = Number(anyAttribute.match(/\d+/)?.[0] ?? 5);
  const ATTRIBUTE_CHOICES = [
    { skill: 26297, key: 'strength', name: 'Strength', grant: 'grantedStrength', icon: 'plusstrength' },
    { skill: 14927, key: 'dexterity', name: 'Dexterity', grant: 'grantedDexterity', icon: 'plusdexterity' },
    { skill: 57022, key: 'intelligence', name: 'Intelligence', grant: 'grantedIntelligence', icon: 'plusintelligence' },
  ];

  for (const choice of ATTRIBUTE_CHOICES) {
    skillOverrides[choice.skill] = {
      id: `generic_attribute_${choice.key}`,
      skill: choice.skill,
      name: choice.name,
      icon: `Art/2DArt/SkillIcons/passives/${choice.icon}.dds`,
      [choice.grant]: attributeValue,
      stats: [`+${attributeValue} to ${choice.name}`],
    };
  }

  // --- jewel slots + bounds --------------------------------------------------

  const jewelSlots = JewelSlots
    .map((s) => (s.Slot != null ? PassiveSkills[s.Slot]?.PassiveSkillGraphId : undefined))
    .filter((v): v is number => v != null);

  // KNOWN BUG, preserved for parity: the data-only override nodes appended above
  // carry no x/y, so these collapse to NaN and serialize to null.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const n of Object.values(nodes)) {
    minX = Math.min(minX, n.x as number);
    minY = Math.min(minY, n.y as number);
    maxX = Math.max(maxX, n.x as number);
    maxY = Math.max(maxY, n.y as number);
  }

  return {
    tree: 'Default',
    classes,
    groups,
    nodes,
    edges,
    roots: psg.roots.map((root) => ({ id: root.id, curvature: root.curvature })),
    skillOverrides,
    jewelSlots,
    min_x: Math.round(minX),
    min_y: Math.round(minY),
    max_x: Math.round(maxX),
    max_y: Math.round(maxY),
  };
}
