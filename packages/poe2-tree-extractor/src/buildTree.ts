/** Builds the passive-tree `data.json` from GGPK tables + the `.psg` graph, in the shape `normalizeGggTree` expects. */

import { buildStatIndex, renderBlock   } from '@poe2-toolkit/ggpk';
import type {GgpkSource, StatIndex} from '@poe2-toolkit/ggpk';

import { assertRequiredRows } from './assertRequiredRows.js';
import { parsePsg } from './psg.js';
import type { Psg, PsgNode } from './psg.js';

// Orbit radii derived from the live tree (zero spread per orbit; angle formula
// matched 5150/5150 baked positions). Index = orbit.
const ORBIT_RADII = [0, 82, 164, 334, 488, 657, 839, 250, 1076, 1320];

/** The int32 the `.psg` writes as a per-edge orbit when the edge is a straight line. */
const LINE_SENTINEL = 2147483647;

export function orbitPosition(psg: Psg, node: { group: number; orbit: number; orbitIndex: number }): { x: number; y: number } {
  const group = psg.groups[node.group];

  if (!group) {
    return { x: 0, y: 0 };
  }

  const radius = ORBIT_RADII[node.orbit] ?? 0;
  const segments = psg.passivesPerOrbit[node.orbit] || 1;
  const angle = (2 * Math.PI * node.orbitIndex) / segments;

  return { x: group.x + radius * Math.sin(angle), y: group.y - radius * Math.cos(angle) };
}

/** Centre of the radius-`R` circle through `a` and `b` on the side picked by `side`; null when none exists (then it's a line). */
export function arcCentre(
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

  // Handedness matches PoB's `BuildConnector`; the mirror bows every arc the wrong way.
  return { x: (a.x + b.x) / 2 + (sign * half * dy) / dist, y: (a.y + b.y) / 2 - (sign * half * dx) / dist };
}

/**
 * Arc centre for one directed `.psg` edge, or null for a straight line (as PoB's `BuildConnector`):
 *  - sentinel orbit -> line;
 *  - `0` -> ring arc for a same-group same-orbit pair (centred on the group), else a spoke (line);
 *  - `±N` -> curved connector between ANY two nodes, radius `ORBIT_RADII[N]`, the sign picks the bow side.
 */
export function edgeArcCentre(psg: Psg, owner: PsgNode, other: PsgNode | undefined, orbit: number): { x: number; y: number } | null {
  const group = psg.groups[owner.group];

  if (!group || !other || orbit === LINE_SENTINEL) {
    return null;
  }

  if (orbit === 0) {
    if (other.group === owner.group && other.orbit === owner.orbit && owner.orbit > 0) {
      return { x: group.x, y: group.y };
    }

    return null;
  }

  const radius = ORBIT_RADII[Math.abs(orbit)] ?? 0;

  return arcCentre(orbitPosition(psg, owner), orbitPosition(psg, other), radius, Math.sign(orbit));
}

const ASC_RADIUS = 1332;

const PSG_PATH = 'metadata/passiveskillgraph.psg';
const BASE_STATS_PATH = 'data/statdescriptions/stat_descriptions.csd';
const PASSIVE_STATS_PATH = 'data/statdescriptions/passive_skill_stat_descriptions.csd';

interface PassiveSkillRow {
  Id?: string;
  PassiveSkillGraphId?: number | null;
  Name?: string;
  Icon_DDSFile?: string;
  Stats?: number[];
  Stat1Value?: number;
  Stat2Value?: number;
  Stat3Value?: number;
  Stat4Value?: number;
  Stat5Value?: number;
  Stat6Value?: number;
  Stat7Value?: number;
  IsNotable?: boolean;
  IsKeystone?: boolean;
  IsJewelSocket?: boolean;
  IsAttribute?: boolean;
  IsAscendancyStartingNode?: boolean;
  MasteryGroup?: number | null;
  Ascendancy?: number | null;
  Characters?: number[];
  FlavourText?: unknown;
  UnlockedBy?: number[];
  VisibleForAscendancy?: number | null;
  GrantedSkill?: number | null;
  SkillPointsGranted?: number;
  WeaponPointsGranted?: number;
  IsMultipleChoice?: boolean;
  IsMultipleChoiceOption?: boolean;
  IsAnointmentOnly?: boolean;
  IsFree?: boolean;
  ApplyToArmour?: boolean;
}

interface SkillGemRow { BaseItemType?: number | null }
interface BaseItemTypeRow { Name?: string }

/** Lines for effects outside `Stats` (granted skill, granted passive points), matching PoB's export. */
export function grantedStats(row: PassiveSkillRow, skillGems: SkillGemRow[], baseItemTypes: BaseItemTypeRow[]): string[] {
  const lines: string[] = [];

  if (row.GrantedSkill != null) {
    const gem = skillGems[row.GrantedSkill];
    const name = gem?.BaseItemType != null ? baseItemTypes[gem.BaseItemType]?.Name : undefined;

    if (name) {
      lines.push(`Grants Skill: ${name}`);
    }
  }

  if (row.SkillPointsGranted && row.SkillPointsGranted > 0) {
    lines.push(`Grants ${row.SkillPointsGranted} Passive Skill Point`);
  }

  if (row.WeaponPointsGranted && row.WeaponPointsGranted > 0) {
    lines.push(`${row.WeaponPointsGranted} Passive Skill Points become Weapon Set Skill Points`);
  }

  return lines;
}

/** Strip GGG markup as PoB's `escapeGGGString` does: `<tag>{text}` -> text, `[ref|display]` -> display. */
export function plainName(text: string): string {
  return text
    .replace(/<[^>]+>\{([^}]+)\}/g, '$1')
    .replace(/\[([^|\]]+)\]/g, '$1')
    .replace(/\[[^|\]]+\|([^\]]+)\]/g, '$1');
}

interface StatRow { Id?: string }
interface MasteryGroupRow { Art?: number | null }
interface MasteryArtRow { ActiveEffectImage?: string }
interface CharacterRow { Name: string; BaseStrength: number; BaseDexterity: number; BaseIntelligence: number }
interface AscendancyRow {
  Id: string;
  Name?: string;
  Character?: number | null;
  Disabled?: boolean;
  BaseAscendancy?: number | null;
}
interface AscendancyOverrideRow { AscendancyToOverrideFor: number; SkillToOverride: number; Override: number }
interface BlightResultRow { PassiveSkill?: number | null }
interface BlightRecipeRow { BlightCraftingResult?: number | null; BlightCraftingItems?: number[] }
interface BlightItemRow { NameShort?: string }
interface JewelSlotRow { Slot?: number | null }
interface ClassOverrideRow { SkillToOverride: number; Override: number; CharacterToOverrideFor: number }
interface QuestStaticRewardRow { QuestFlag?: number | null; WeaponPassives?: number | null }
interface ExperienceLevelRow { Level?: number | null }
interface QuestFlagRow { Id?: string | null }

/** A graph node, or a data-only class override (skill/name/icon/stats only). Boolean flags are present-only `true`, never `false`. */
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
  /** Reserved for incoming edges; emitted empty and filled downstream. */
  in?: number[];
  isNotable?: true;
  isKeystone?: true;
  stringId?: string;
  /** Plain jewel socket; a notable/keystone holding one sets `containJewelSocket` instead. */
  isJewelSocket?: true;
  containJewelSocket?: true;
  /** Socket allocated only through an anointment (Sinister sockets); it has no radius. */
  sinister?: true;
  noRadius?: true;
  aliasPassiveSocket?: string;
  isMultipleChoice?: true;
  isMultipleChoiceOption?: true;
  isFreeAllocate?: true;
  applyToArmour?: true;
  recipe?: string[];
  isMastery?: true;
  isGenericAttribute?: true;
  isAscendancyStart?: true;
  /** Mastery background pattern (extensionless), on the mastery and the notables that light it. */
  activeEffectImage?: string;
  ascendancyId?: string;
  classStartIndex?: number[];
  flavourText?: unknown;
  /** Hidden until an unlocking passive is taken: `nodes` unlock it, `ascendancy` owns them. */
  unlockConstraint?: { ascendancy?: string; nodes: number[] };
}

export interface ExportAscendancy {
  id: string;
  name: string;
  offsetX: number;
  offsetY: number;
  /** Ascendancy this one replaces (Abyssal Lich -> Lich); its nodes are reused, some swapped per `overridePairs`. */
  replaces?: string;
  overridePairs?: Record<number, number>;
}

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
  /** Raw `.psg` group flag word; purpose not yet decoded, kept so nothing is lost. */
  flag: number;
  /** Second raw `.psg` group word; purpose not yet decoded, kept verbatim. */
  unknown1: number;
}

export interface ExportEdge {
  from: number;
  to: number;
  orbit: number;
  /** World x of the arc centre (renderer sweeps the short way `from`->`to`). */
  orbitX: number;
  orbitY: number;
}

export interface ExportRoot {
  id: number;
  /** Raw curvature word; purpose not yet decoded, kept verbatim. */
  curvature: number;
}

export interface TreeExport {
  tree: string;
  classes: ExportClass[];
  groups: Record<number, ExportGroup>;
  nodes: Record<number, ExportNode>;
  edges: ExportEdge[];
  roots: ExportRoot[];
  /** Synthesized +attribute choices by skill id: allocating a generic attribute node forces Str/Dex/Int. */
  skillOverrides: Record<number, Record<string, unknown>>;
  jewelSlots: number[];
  min_x: number;
  min_y: number;
  max_x: number;
  max_y: number;
  /** Points spendable on the main tree at the level cap, derived from GGPK (ExperienceLevels + QuestStaticRewards). */
  maxBasicPoints: number;
  /** Points each weapon set can diverge by (campaign weapon-set grants, from QuestStaticRewards). */
  maxWeaponSetPoints: number;
}

async function readCsd(source: GgpkSource, path: string): Promise<string> {
  const bytes = await source.file(path);

  if (!bytes) {
    throw new Error(`stat descriptions not found: ${path}`);
  }

  return Buffer.from(bytes).toString('utf16le');
}

export async function buildTree(source: GgpkSource): Promise<TreeExport> {
  const PassiveSkills = (await source.table('PassiveSkills')) as PassiveSkillRow[];
  const Stats = (await source.table('Stats')) as StatRow[];
  const MasteryGroups = (await source.table('PassiveSkillMasteryGroups')) as MasteryGroupRow[];
  const MasteryArt = (await source.table('PassiveSkillTreeMasteryArt')) as MasteryArtRow[];
  const Characters = assertRequiredRows<CharacterRow>(
    await source.table('Characters'), 'Characters', ['Name', 'BaseStrength', 'BaseDexterity', 'BaseIntelligence'],
  );
  const Ascendancy = assertRequiredRows<AscendancyRow>(await source.table('Ascendancy'), 'Ascendancy', ['Id']);
  const JewelSlots = (await source.table('PassiveJewelSlots')) as JewelSlotRow[];
  const ClassOverrides = assertRequiredRows<ClassOverrideRow>(
    await source.table('ClassPassiveSkillOverrides'), 'ClassPassiveSkillOverrides',
    ['SkillToOverride', 'Override', 'CharacterToOverrideFor'],
  );
  const QuestStaticRewards = (await source.table('QuestStaticRewards')) as QuestStaticRewardRow[];
  const ExperienceLevels = (await source.table('ExperienceLevels')) as ExperienceLevelRow[];
  const QuestFlags = (await source.table('QuestFlags')) as QuestFlagRow[];
  // Some nodes describe themselves via a granted skill or passive points rather
  // than `Stats`; resolve the skill's display name through SkillGems -> BaseItemTypes.
  const SkillGems = (await source.table('SkillGems')) as SkillGemRow[];
  const BaseItemTypes = (await source.table('BaseItemTypes')) as BaseItemTypeRow[];
  const AscendancyOverrides = assertRequiredRows<AscendancyOverrideRow>(
    await source.table('AscendancyPassiveSkillOverrides'), 'AscendancyPassiveSkillOverrides',
    ['AscendancyToOverrideFor', 'SkillToOverride', 'Override'],
  );
  // Anointment recipes: BlightCraftingResults ties a passive to a result, a recipe
  // lists the distilled emotions that craft that result.
  const BlightResults = (await source.table('BlightCraftingResults')) as BlightResultRow[];
  const BlightRecipes = (await source.table('BlightCraftingRecipes')) as BlightRecipeRow[];
  const BlightItems = (await source.table('BlightCraftingItems')) as BlightItemRow[];

  // The passive file `include`s the base one but the parser doesn't follow includes: index base text then
  // passive text, so passive blocks supersede base ones and keep their position (orders a node's stat lines).
  const statIdx: StatIndex = buildStatIndex(
    `${await readCsd(source, BASE_STATS_PATH)}\n${await readCsd(source, PASSIVE_STATS_PATH)}`,
  );

  const psgBytes = await source.file(PSG_PATH);

  if (!psgBytes) {
    throw new Error(`passive skill graph not found: ${PSG_PATH}`);
  }

  const psg = parsePsg(psgBytes);

  const byGraphId = new Map<number, PassiveSkillRow>();

  for (const row of PassiveSkills) {
    if (row.PassiveSkillGraphId != null) {
      byGraphId.set(row.PassiveSkillGraphId, row);
    }
  }

  function renderStats(row: PassiveSkillRow): string[] {
    const values = [
      row.Stat1Value, row.Stat2Value, row.Stat3Value, row.Stat4Value, row.Stat5Value, row.Stat6Value, row.Stat7Value,
    ];
    // Pair each stat with its value before dropping unresolvable stat rows, so a
    // gap never shifts the values onto the wrong stats.
    const pairs = (row.Stats ?? [])
      .map((index, slot) => ({ id: Stats[index]?.Id, value: values[slot] ?? 0 }))
      .filter((pair): pair is { id: string; value: number } => Boolean(pair.id));

    if (!pairs.length) {
      return [];
    }

    // GGG templates carry literal "\n" for multi-line stats; make it a real newline.
    return renderBlock(statIdx, pairs.map((pair) => pair.id), pairs.map((pair) => pair.value), { descriptionOrder: true })
      .lines.map((line) => line.replace(/\\n/g, '\n'));
  }

  // Released content only, as PoB's passivetree export keeps it: nodes with a name
  // that isn't a [DNT ...] placeholder, outside disabled or [DNT ...] ascendancies.
  const DNT = (s: unknown): boolean => typeof s === 'string' && s.startsWith('[DNT');
  const isReleasedAscendancy = (a: AscendancyRow): boolean => Boolean(a.Name) && !DNT(a.Name) && !a.Disabled;
  const isReleasedNode = (row: PassiveSkillRow | undefined): row is PassiveSkillRow => {
    if (!row?.Name || DNT(row.Name)) {
      return false;
    }

    const ascendancy = row.Ascendancy != null ? Ascendancy[row.Ascendancy] : undefined;

    return !ascendancy || isReleasedAscendancy(ascendancy);
  };
  const released = new Set(psg.nodes.filter((node) => isReleasedNode(byGraphId.get(node.skillId))).map((node) => node.skillId));

  const recipes = new Map<number, string[]>();

  for (const recipe of BlightRecipes) {
    const passive = recipe.BlightCraftingResult != null ? BlightResults[recipe.BlightCraftingResult]?.PassiveSkill : undefined;

    if (passive != null) {
      recipes.set(passive, (recipe.BlightCraftingItems ?? []).map((item) => BlightItems[item]?.NameShort ?? ''));
    }
  }

  const rowIndex = new Map(PassiveSkills.map((row, index) => [row, index]));

  // A mastery's cluster all carry MasteryGroup; the mastery node itself grants
  // nothing (no stats) and isn't a notable/keystone.
  function isMasteryNode(row: PassiveSkillRow): boolean {
    return row.MasteryGroup != null && (!row.Stats || row.Stats.length === 0) && !row.IsNotable && !row.IsKeystone;
  }

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
  // given node - that's what activates a mastery.
  const adjacency = new Map<number, Set<number>>();
  const incoming = new Map<number, Set<number>>();
  const addEdge = (a: number, b: number): void => {
    if (!adjacency.has(a)) {
      adjacency.set(a, new Set());
    }

    adjacency.get(a)!.add(b);
  };

  const psgById = new Map(psg.nodes.map((node) => [node.skillId, node]));

  // Arc geometry from the `.psg` per-edge orbit word: sentinel -> line; `0` -> ring arc (same group + orbit only,
  // else a spoke); `±N` -> curved connector between ANY two nodes, radius `ORBIT_RADII[N]`, sign picks the bow.
  // The centre is resolved here so the renderer just sweeps the short way A->B.
  const edges: ExportEdge[] = [];

  for (const node of psg.nodes) {
    if (!released.has(node.skillId)) {
      continue;
    }

    for (const target of node.connections) {
      if (!released.has(target.id)) {
        continue;
      }

      addEdge(node.skillId, target.id);
      addEdge(target.id, node.skillId);

      if (!incoming.has(target.id)) {
        incoming.set(target.id, new Set());
      }

      incoming.get(target.id)!.add(node.skillId);

      const other = psgById.get(target.id);
      const centre = edgeArcCentre(psg, node, other, target.orbit);

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
  const realClassIndices = [...Characters.keys()].filter((index) =>
    Ascendancy.some((a) => a.Character === index && isReleasedAscendancy(a)),
  );
  const classRemap = new Map(realClassIndices.map((oldIndex, newIndex) => [oldIndex, newIndex]));

  const nodes: Record<number, ExportNode> = {};

  for (const pnode of psg.nodes) {
    const row = byGraphId.get(pnode.skillId);

    if (!row || !released.has(pnode.skillId)) {
      continue;
    }

    const { x, y } = position(pnode);
    const ascendancy = row.Ascendancy != null ? Ascendancy[row.Ascendancy] : undefined;
    const characters = Array.isArray(row.Characters) ? row.Characters : [];
    const classStart = characters.filter((i) => classRemap.has(i)).map((i) => classRemap.get(i)!);
    const mastery = isMasteryNode(row);
    const effect = activeEffectImage(row);
    const recipe = recipes.get(rowIndex.get(row)!);
    // PoB's flag order: a keystone or notable that holds a socket is not itself a
    // jewel socket; on an ascendancy it is marked as containing one instead.
    const plainSocket = row.IsJewelSocket && !row.IsKeystone && !row.IsNotable && !mastery;
    // An anointment-only socket (Sinister) has no radius; anointments refer to it by its string id.
    const sinister = row.IsJewelSocket && row.IsAnointmentOnly;
    // Nodes hidden until an unlocking passive is allocated. `UnlockedBy` holds rows mapped to skill ids;
    // `VisibleForAscendancy` names the ascendancy that reveals them.
    const unlockNodes = (row.UnlockedBy ?? [])
      .map((i) => PassiveSkills[i]?.PassiveSkillGraphId)
      .filter((id): id is number => id != null);
    const unlockAscendancy = row.VisibleForAscendancy != null ? Ascendancy[row.VisibleForAscendancy]?.Name : undefined;
    const unlockConstraint = unlockNodes.length
      ? { ...(unlockAscendancy ? { ascendancy: unlockAscendancy } : {}), nodes: unlockNodes }
      : undefined;
    // A mastery's effect lights when any node sharing a `.psg` edge with it (either direction) is allocated.
    // Masteries nothing points into never light, so they get no activators.
    const connections = mastery
      ? (incoming.has(pnode.skillId) ? [...(adjacency.get(pnode.skillId) ?? [])] : [])
      : [...(adjacency.get(pnode.skillId) ?? [])];

    nodes[pnode.skillId] = {
      skill: pnode.skillId,
      // An ascendancy's start node carries an internal name; it shows as the ascendancy.
      name: row.IsAscendancyStartingNode && ascendancy?.Name ? ascendancy.Name : plainName(row.Name ?? ''),
      icon: row.Icon_DDSFile ?? '',
      stats: [...renderStats(row), ...grantedStats(row, SkillGems, BaseItemTypes)],
      group: pnode.group,
      orbit: pnode.orbit,
      orbitIndex: pnode.orbitIndex,
      x: Number(x.toFixed(3)),
      y: Number(y.toFixed(3)),
      out: connections,
      in: [],
      ...(row.Id ? { stringId: row.Id } : {}),
      ...(row.IsNotable ? { isNotable: true } : {}),
      ...(row.IsKeystone ? { isKeystone: true } : {}),
      ...(plainSocket ? { isJewelSocket: true } : {}),
      ...(row.IsJewelSocket && ascendancy ? { containJewelSocket: true } : {}),
      ...(sinister ? { sinister: true, noRadius: true, aliasPassiveSocket: row.Id ?? '' } : {}),
      ...(mastery ? { isMastery: true } : {}),
      ...(row.IsAttribute ? { isGenericAttribute: true } : {}),
      ...(row.IsAscendancyStartingNode ? { isAscendancyStart: true } : {}),
      ...(row.IsMultipleChoice ? { isMultipleChoice: true } : {}),
      ...(row.IsMultipleChoiceOption ? { isMultipleChoiceOption: true } : {}),
      ...(row.IsFree ? { isFreeAllocate: true } : {}),
      ...(row.ApplyToArmour ? { applyToArmour: true } : {}),
      ...(effect ? { activeEffectImage: effect } : {}),
      ...(ascendancy ? { ascendancyId: ascendancy.Id } : {}),
      ...(unlockConstraint ? { unlockConstraint } : {}),
      ...(classStart.length ? { classStartIndex: classStart } : {}),
      // GGG writes line breaks as CRLF; keep plain newlines like PoB does.
      ...(typeof row.FlavourText === 'string' && row.FlavourText ? { flavourText: row.FlavourText.replace(/\r/g, '') } : {}),
      ...(recipe ? { recipe } : {}),
    };
  }

  // A group lists only its exported nodes; one left with none (an unreleased
  // ascendancy's cluster) is dropped, so every group key is backed by a node.
  const groups: Record<number, ExportGroup> = {};
  psg.groups.forEach((group, index) => {
    const members = group.nodes.filter((id) => nodes[id]);

    if (!members.length) {
      return;
    }

    const orbits = new Set<number>(members.map((id) => nodes[id]!.orbit!));

    groups[index] = {
      x: Number(group.x.toFixed(3)),
      y: Number(group.y.toFixed(3)),
      orbits: [...orbits].sort((a, b) => a - b),
      nodes: members,
      flag: group.flag,
      unknown1: group.unknown1,
    };
  });

  // Hub centre = centroid of the class-start nodes; ascendancy discs sit 1332u
  // out along each class's axis (derived from GGPK geometry, matches GGG layout).
  const startNodes = Object.values(nodes).filter((n) => n.classStartIndex);
  const hub = {
    x: startNodes.reduce((s, n) => s + n.x!, 0) / startNodes.length,
    y: startNodes.reduce((s, n) => s + n.y!, 0) / startNodes.length,
  };

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

    // GGG keeps overrides for nodes it has since taken off the tree; skip those.
    if (base == null || target == null || !nodes[base]) {
      continue;
    }

    if (!overrideByClass.has(row.CharacterToOverrideFor)) {
      overrideByClass.set(row.CharacterToOverrideFor, {});
    }

    overrideByClass.get(row.CharacterToOverrideFor)![base] = target;
  }

  // Per-ascendancy node overrides: an ascendancy that replaces another (Abyssal
  // Lich -> Lich) reuses its nodes but swaps some for its own variant.
  const overrideByAscendancy = new Map<number, Record<number, number>>();

  for (const row of AscendancyOverrides) {
    const base = PassiveSkills[row.SkillToOverride]?.PassiveSkillGraphId;
    const target = PassiveSkills[row.Override]?.PassiveSkillGraphId;

    if (base == null || target == null || !nodes[base]) {
      continue;
    }

    if (!overrideByAscendancy.has(row.AscendancyToOverrideFor)) {
      overrideByAscendancy.set(row.AscendancyToOverrideFor, {});
    }

    overrideByAscendancy.get(row.AscendancyToOverrideFor)![base] = target;
  }

  const classes = realClassIndices.map((oldIndex, newIndex) => {
    const character = Characters[oldIndex]!;
    const offset = ascendancyOffset(newIndex);
    const ascendancies = [...Ascendancy.entries()]
      .filter(([, a]) => a.Character === oldIndex && isReleasedAscendancy(a))
      .map(([index, a]): ExportAscendancy => {
        const replaced = a.BaseAscendancy != null ? Ascendancy[a.BaseAscendancy] : undefined;
        const overridePairs = overrideByAscendancy.get(index);

        return {
          id: a.Id,
          name: a.Name!,
          offsetX: offset.x,
          offsetY: offset.y,
          ...(replaced ? { replaces: replaced.Id } : {}),
          ...(overridePairs ? { overridePairs } : {}),
        };
      });

    return {
      name: character.Name,
      base_str: character.BaseStrength,
      base_dex: character.BaseDexterity,
      base_int: character.BaseIntelligence,
      ascendancies,
      overridePairs: overrideByClass.get(oldIndex) ?? {},
    };
  });

  // Override target nodes aren't in the graph - they only supply display data
  // when a class or ascendancy override swaps them in at the base node's
  // position. Add them as data-only entries (no geometry) so the renderer can
  // resolve their fields.
  for (const pairs of [...overrideByClass.values(), ...overrideByAscendancy.values()]) {
    for (const target of Object.values(pairs)) {
      if (nodes[target]) {
        continue;
      }

      const row = byGraphId.get(target);

      if (!row) {
        continue;
      }

      nodes[target] = { skill: target, name: plainName(row.Name ?? ''), icon: row.Icon_DDSFile ?? '', stats: renderStats(row) };
    }
  }

  // A generic +attribute node shows "+N to any Attribute"; allocating it in-game forces Str/Dex/Int.
  // GGG's PassiveSkillOverrides table is empty in PoE2, so synthesise the three here.
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

  // Level points: (maxLevel - 1) from ExperienceLevels. Weapon-set quest points: every campaign grant from
  // QuestStaticRewards; grants from optional content (fishing, logbook runes) are filtered out by id, as PoB does.
  const NON_CAMPAIGN_WEAPON_GRANT = /logbook|fish/i;
  const flagId = (index?: number | null): string => (index != null ? QuestFlags[index]?.Id ?? '' : '');
  const maxLevel = ExperienceLevels.reduce((max, row) => Math.max(max, row.Level ?? 0), 0);
  const maxWeaponSetPoints = QuestStaticRewards.reduce(
    (sum, row) => (NON_CAMPAIGN_WEAPON_GRANT.test(flagId(row.QuestFlag)) ? sum : sum + (row.WeaponPassives ?? 0)),
    0,
  );
  const maxBasicPoints = Math.max(0, maxLevel - 1) + maxWeaponSetPoints;

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
    maxBasicPoints,
    maxWeaponSetPoints,
  };
}
