/**
 * Data contracts for the engine.
 *
 * Two families of types live here:
 *  - `TreeData` + friends: the **source** shape, normalised from GGG's official
 *    skill-tree export (`data.json`). GGG bakes world `x`/`y` into every node;
 *    the engine consumes those positions directly.
 *  - `Scene` + friends: the **computed** shape the engine produces, with every
 *    node/effect already positioned and sized in world space.
 *
 * Sizes are still *derived* (Path of Building's `GetNodeTargetSize` cascade);
 * only positions come baked, because GGG does not ship the orbit-radius
 * constants needed to recompute them and instead pre-bakes the coordinates.
 */

// ---------------------------------------------------------------------------
// Input: source tree data (normalised from GGG's skill-tree export)
// ---------------------------------------------------------------------------

export interface TreeData {
  /** Tree/patch version, e.g. "0_5". */
  version: string;
  /** Geometry backbone shared by every node. */
  constants: TreeConstants;
  /** Orbit anchor clusters, keyed by group id. */
  groups: Record<number, Group>;
  /** Every node, keyed by skill id. */
  nodes: Record<number, TreeNode>;
  /** Central class art + ascendancy metadata. */
  classes: ClassDef[];
  /** Skill ids that are jewel sockets. */
  jewelSlots: number[];
  /** World-space extent of the whole tree (for fit-to-view). */
  bounds: WorldRect;
}

export interface TreeConstants {
  /**
   * Radius of the central opening. PoB ships this as `PSSCentreInnerRadius`;
   * GGG's export omits it, so normalisation supplies the (stable) game value.
   */
  centreInnerRadius: number;
}

export interface Group {
  /** World x of the orbit cluster's centre. */
  x: number;
  /** World y of the orbit cluster's centre. */
  y: number;
  /** Which orbits are populated in this group. */
  orbits: number[];
  /** Member skill ids. */
  nodes: number[];
}

export interface TreeNode {
  // --- required core ---
  /** Canonical skill id (matches GGG `PassiveSkills.id`). */
  skill: number;
  /** Owning group id (direct index into {@link TreeData.groups}). */
  group: number;
  /** Orbit number within the group. */
  orbit: number;
  /** Slot index along the orbit. */
  orbitIndex: number;
  /** World x, baked by GGG's export. */
  x: number;
  /** World y, baked by GGG's export. */
  y: number;
  /** Edges to neighbouring nodes (GGG `in` + `out`, merged). */
  connections: NodeConnection[];
  /** Display name (e.g. "Spell Damage"). */
  name: string;
  /** Atlas key into the {@link SpriteManifest}. */
  icon: string;
  /** Granted modifier lines, ready to show in a tooltip. */
  stats: string[];

  // --- kind flags (optional; absence = plain small node) ---
  /** Larger named passive (drawn with a notable frame + effect pattern). */
  isNotable?: boolean;
  /** Build-defining keystone (largest frame; carries {@link TreeNode.flavourText}). */
  isKeystone?: boolean;
  /** A jewel socket. */
  isJewelSocket?: boolean;
  /**
   * Special sockets (e.g. "Sinister Jewel Socket") that are not part of the base
   * tree and are hidden from the normal render. Derived from the node name, as
   * GGG carries no dedicated flag (PoB shipped this as `noRadius`).
   */
  noRadius?: boolean;
  /** Mastery hub: renders as a background pattern, not a connectable node. GGG: `isMastery` (PoB: `isOnlyImage`). */
  isMastery?: boolean;
  /** The root node of an ascendancy panel (its pathing root). */
  isAscendancyStart?: boolean;
  /** GGG: `isGenericAttribute`. */
  isAttribute?: boolean;

  // --- optional metadata / extensions ---
  /** Background pattern key (masteries AND notables). */
  activeEffectImage?: string;
  /**
   * Ascendancy display name (e.g. "Deadeye"), translated from GGG's internal
   * `ascendancyId` ("Ranger1") so it matches a build's chosen ascendancy.
   */
  ascendancyName?: string;
  /** Keystone lore. */
  flavourText?: string;
  /** Crafting/recipe hint lines carried through from the export, when present. */
  recipe?: string[];
  /** Attribute nodes: the interchangeable choices (e.g. Str / Dex / Int). */
  options?: NodeOption[];
  /**
   * Conditional node (GGG `unlockConstraint`): not part of the base tree, shown
   * only when unlocked (e.g. by an ascendancy). The official default tree hides
   * these.
   */
  conditional?: boolean;
  /** Ascendancy id that unlocks this conditional node, when specified. */
  unlockAscendancy?: string;
  /**
   * Skill ids that must ALL be allocated for this conditional node to appear
   * (GGG `unlockConstraint.nodes`). Absent/empty means it can't be revealed.
   */
  unlockNodes?: number[];
  /** Present on class-start nodes: names of the classes that start here. */
  classesStart?: string[];
}

/** One selectable variant of an attribute node. */
export interface NodeOption {
  /** Skill id of this choice's underlying node. */
  id: number;
  /** Display name of this choice (e.g. "Intelligence"). */
  name: string;
  /** Modifier lines granted by this choice. */
  stats: string[];
  /** Skill-icon path for this specific choice (e.g. plusintelligence.png). */
  icon: string;
}

/**
 * An edge to a neighbouring node. GGG's top-level `edges` table marks which edges
 * are arcs and gives the arc centre directly (`orbitX`/`orbitY`); that centre is
 * carried here as {@link NodeConnection.arcCentre}. Edges without it draw as a
 * straight line (or, as a fallback, an arc around the shared group centre — see
 * {@link placeConnection}).
 */
export interface NodeConnection {
  /** Skill id of the connected node. */
  id: number;
  /** World centre of the arc this edge follows (GGG `orbitX`/`orbitY`), if any. */
  arcCentre?: Point;
}

/** Native pixel/world dimensions of a sprite or hub layer. */
export interface Size {
  width: number;
  height: number;
}

/** A character class: its start node, base attributes, hub art and ascendancies. */
export interface ClassDef {
  /** Display name (e.g. "Ranger"). */
  name: string;
  /** Integer class id = index in GGG's `classes` array (Witch = 1). */
  id: number;
  /** Starting strength granted by the class. */
  baseStr: number;
  /** Starting dexterity granted by the class. */
  baseDex: number;
  /** Starting intelligence granted by the class. */
  baseInt: number;
  /** Skill id of this class's start node (derived from `classStartIndex`). */
  startNode: number;
  /** Central art + ring geometry for this class. */
  centre: CentreArt;
  /** The class's ascendancy subclasses. */
  ascendancies: AscendancyDef[];
  /**
   * Per-class node display overrides: base node skill id -> the skill id whose
   * name/stats/icon this class shows instead (e.g. the Witch sees the generic
   * "Spell Damage" node as "Spell and Minion Damage"). Geometry is unchanged.
   */
  overridePairs?: Record<number, number>;
}

/**
 * The three concentric layers drawn at the tree hub for a class. All share the
 * same world centre (`x`/`y`, pinned at the origin).
 *
 * GGG's `data.json` carries no layer dimensions, so normalisation fills these
 * from the stable atlas frame sizes: the class portrait (`background-<class>`)
 * is 1500², the ornate + rotating rings (`group-background`) are 2000². World
 * radius equals the native width (the DrawAsset 2× rule folds in downstream).
 */
export interface CentreArt {
  /** Class portrait atlas key (e.g. `ClassesRanger`). */
  image: string;
  /** World centre of the hub (origin: 0,0). */
  x: number;
  y: number;
  /** Static class-portrait layer native size (1500²). */
  art: Size;
  /** Rotating gold ring layer native size (2000²). */
  active: Size;
  /** Static ornate frame layer native size (2000²). */
  frame: Size;
}

/**
 * An ascendancy disc as a relocatable block. GGG bakes each ascendancy's nodes
 * at a far-flung cluster; `worldAnchor` is where that cluster sits. The renderer
 * chooses where to draw it — translated into the hub (how the game shows it) or
 * left at `worldAnchor` (the raw export layout).
 */
export interface AscendancyDef {
  /** Display name, also the build's ascendancy key (e.g. "Deadeye"). */
  id: string;
  /** Display name (usually equal to {@link AscendancyDef.id}). */
  name: string;
  /** GGG internal id, e.g. `Ranger1`. */
  internalId: string;
  /** Disc background atlas key. */
  image: string;
  /**
   * World anchor of the disc: the centroid of its nodes (GGG bakes each
   * ascendancy's nodes at a far-flung cluster). The renderer translates this
   * onto the hub to draw the disc game-style.
   */
  worldAnchor: Point;
  /** Disc native size (1500²). */
  size: Size;
}

// ---------------------------------------------------------------------------
// Input: graphics manifest (supplied separately, never loaded by core)
// ---------------------------------------------------------------------------

/** One sprite's location: which atlas, and its native pixel sub-rect within it. */
export interface SpriteFrame {
  /** Atlas id the render package resolves to a bitmap. */
  atlas: string;
  /** Native pixel sub-rect inside the atlas. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The graphics contract: maps every atlas key core emits (node icons, centre
 * art, effect patterns) to a frame. Supplied by the renderer; core never loads
 * it or resolves atlas ids to images.
 */
export interface SpriteManifest {
  /** Atlas key -> native pixel rect. */
  frames: Record<string, SpriteFrame>;
}

// ---------------------------------------------------------------------------
// Geometry primitives
// ---------------------------------------------------------------------------

/** A world-space point. */
export interface Point {
  x: number;
  y: number;
}

/** An axis-aligned world-space rectangle (bounds), min/max on each axis. */
export interface WorldRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// ---------------------------------------------------------------------------
// Output: computed scene (render-ready)
// ---------------------------------------------------------------------------

/**
 * The engine's world-space output: every node positioned and sized, every edge
 * resolved, the hub laid out — everything a renderer needs, with no geometry
 * left to compute. Feed it to {@link project} to get pixels.
 */
export interface Scene {
  /** Every drawn node, positioned + sized + marked allocated. */
  nodes: PlacedNode[];
  /** Every drawn edge, each resolved to a line or an arc. */
  connections: PlacedConnection[];
  /** Background effect patterns behind notables/keystones/masteries. */
  masteryEffects: PlacedEffect[];
  /** Hub geometry + per-class ring rotation. */
  centre: CentreLayout;
  /** Extent of the whole tree, including the far-flung ascendancy discs. */
  bounds: WorldRect;
  /**
   * Extent of the main tree only (ascendancy nodes excluded). Use this to fit
   * the initial view: the ascendancy discs sit thousands of units out, so
   * fitting `bounds` leaves the main tree tiny in the middle.
   */
  mainBounds: WorldRect;
}

/** A node placed in world space: centre, sizes, hit radius and allocation state. */
export interface PlacedNode {
  /** Skill id (matches {@link TreeNode.skill}). */
  skill: number;
  /** Absolute world centre. */
  x: number;
  y: number;
  /** Render kind (drives colour/frame). */
  kind: NodeKind;
  /** Skill-icon atlas key (carried through from {@link TreeNode.icon}). */
  icon: string;
  /** World diameter of the skill icon. */
  iconSize: number;
  /** World diameter of the overlay frame (0 = none, e.g. masteries). */
  frameSize: number;
  /** Hit-test radius: half the larger of icon/frame. */
  radius: number;
  /** Allocated in the current build. */
  allocated: boolean;
  /**
   * Weapon set this allocated node is assigned to (1 or 2); absent means it is a
   * shared/basic node active in both sets. Lets the renderer tint set-specific
   * allocations apart from the main tree.
   */
  weaponSet?: WeaponSet;
  /** Owning ascendancy id, if this node belongs to an ascendancy. */
  ascendancy?: string;
  /** Jewel socketed into this node (jewel sockets only), if the build has one. */
  jewel?: JewelInfo;
}

/**
 * A jewel socketed into a tree socket. Display-only metadata — the engine never
 * applies a jewel's radius effect to nearby nodes (PoE2 jewels are global stats).
 */
export interface JewelInfo {
  /** Item name (the unique's name, or the rare's rolled name). */
  name: string;
  /** Item rarity, upper-case PoB form: NORMAL / MAGIC / RARE / UNIQUE. */
  rarity: string;
  /** Base type of the jewel (e.g. "Time-Lost Diamond"). */
  baseType: string;
  /** Granted modifier lines. */
  mods: string[];
  /** Item-icon URL for the jewel's base type, when resolved. */
  icon?: string;
}

/** Render kind of a placed node — picks its colour, frame and size. */
export type NodeKind =
  /** Plain small passive. */
  | 'normal'
  /** Larger named passive. */
  | 'notable'
  /** Build-defining keystone. */
  | 'keystone'
  /** Mastery hub (drawn as a background pattern). */
  | 'mastery'
  /** Jewel socket. */
  | 'jewel'
  /** Generic +attribute node (Str/Dex/Int choice). */
  | 'attribute'
  /** A class's start node. */
  | 'classStart'
  /** Root node of an ascendancy panel. */
  | 'ascendancyStart'
  /** Plain node inside an ascendancy. */
  | 'ascendancyNormal'
  /** Notable inside an ascendancy. */
  | 'ascendancyNotable';

/** An edge placed in world space: its two endpoints, resolved to a line or arc. */
export interface PlacedConnection {
  /** Skill id of the edge's first endpoint. */
  from: number;
  /** Skill id of the edge's second endpoint. */
  to: number;
  /** Straight line, or an arc following an orbit. */
  kind: 'line' | 'arc';
  /** World position of the `from` endpoint. */
  a: Point;
  /** World position of the `to` endpoint. */
  b: Point;
  /** Both endpoints allocated — the edge is part of the build. */
  active: boolean;
  /** Weapon set this active edge belongs to (1 or 2); absent means basic/shared. */
  weaponSet?: WeaponSet;
  /** Owning ascendancy id, if this edge is inside an ascendancy. */
  ascendancy?: string;
  /** Arc only: centre, radius, signed sweep (radians), and the orbit it follows. */
  arc?: { cx: number; cy: number; radius: number; startAngle: number; endAngle: number; clockwise: boolean; orbit: number };
}

/** A background effect pattern placed behind a notable/keystone/mastery. */
export interface PlacedEffect {
  /** Node the effect pattern belongs to. */
  skill: number;
  /** World centre of the pattern (the node's centre). */
  x: number;
  y: number;
  /** World diameter of the pattern. */
  size: number;
  /** Atlas key of the pattern sprite. */
  patternKey: string;
  /** The mastery's cluster (group) has an allocated node — the pattern is lit. */
  active: boolean;
}

/**
 * The hub layout: where the centre is, how big the opening is, and one anchor
 * per class describing how its ring rotates and where it sits on the rim. All
 * derived from the data — none of it eyeballed.
 */
export interface CentreLayout {
  /** World centre of the hub (the origin). */
  centre: Point;
  /** Radius of the central opening. */
  innerRadius: number;
  /**
   * World radii of the three hub layers (shared across classes). Each layer is
   * drawn at `2 * width` centred on the hub, so the world radius equals the
   * native `width` — already folded in here so the renderer just scales these.
   */
  ring: { artRadius: number; activeRadius: number; frameRadius: number };
  /** One anchor per class: where it sits on the rim and how its ring rotates. */
  classes: ClassAnchor[];
  /** Every ascendancy disc (relocatable block: world anchor + size). */
  ascendancies: AscendancyDef[];
}

/** Where a class sits on the hub rim and how its gold ring rotates onto it. */
export interface ClassAnchor {
  /** Integer class id (matches {@link ClassDef.id}). */
  classId: number;
  /** Class display name. */
  name: string;
  /** Class-start skill id. */
  startNode: number;
  /** Radians, direction centre -> start node: the class's spot on the rim. */
  startAngle: number;
  /** Radians to rotate the active ring onto this class: `π/2 + atan2(dy, dx)`. */
  ringRotation: number;
}

// ---------------------------------------------------------------------------
// Build allocation — the clean input boundary
// ---------------------------------------------------------------------------

/**
 * A character's tree state, and the ONLY build input the engine needs. Whatever
 * produces it — a POB code / `.build` decoder, the GGG OAuth API, a manual
 * editor — is none of the engine's concern. Gems and items are irrelevant to
 * drawing the tree and deliberately absent.
 */
export interface BuildAllocation {
  /**
   * Integer class id (matches `ClassDef.id`). Optional: a read-only allocation
   * identifies its class by name at the call site (the imported PoB `classId`
   * is not stable across versions), and only the editable planner needs the id
   * — to find the class start node for pathing.
   */
  classId?: number;
  /** Active ascendancy id (matches `AscendancyDef.id`), if any. */
  ascendId?: string;
  /** Allocated skill ids (every mode: basic + both weapon sets). */
  allocated: number[];
  /**
   * Weapon-set assignment for allocated nodes: node id -> set 1 or 2. A node
   * absent from this map is a shared/basic node (active in both weapon sets).
   * Keystones, jewel sockets and ascendancy nodes are always basic, so they
   * never appear here.
   */
  weaponSets?: Record<number, WeaponSet>;
  /**
   * Chosen attribute per generic +attribute node (node id -> str/dex/int). Lets
   * the renderer show the specific icon/stat instead of the generic "any".
   */
  attributeChoices?: Record<number, AttributeChoice>;
  /** Jewels socketed into the tree, keyed by socket node id. Display-only. */
  jewels?: Record<number, JewelInfo>;
  /** Tree/patch version the allocation was made against, e.g. "0_5". */
  treeVersion?: string;
}

/** The attribute a generic +attribute node was assigned to. */
export type AttributeChoice = 'str' | 'dex' | 'int';

/**
 * Which weapon set a set-specific passive belongs to. PoE2 characters carry two
 * weapon sets; a node tagged 1 or 2 is active only when that set is equipped,
 * while an untagged (basic) node is active in both.
 */
export type WeaponSet = 1 | 2;

/** Allocation paint mode: 0 = basic/shared, 1 = weapon set I, 2 = weapon set II. */
export type AllocMode = 0 | WeaponSet;

/** Inputs to {@link Scene} construction beyond the static tree data. */
export interface SceneOptions {
  /** Current build state; omit for an unallocated tree. */
  allocation?: BuildAllocation;
}

// ---------------------------------------------------------------------------
// Projection: world -> screen
// ---------------------------------------------------------------------------

/** View transform: `screen = world * scale + (tx, ty)`. */
export interface Viewport {
  /** Screen-pixel x translation (pan). */
  tx: number;
  /** Screen-pixel y translation (pan). */
  ty: number;
  /** World-to-screen scale factor (zoom). */
  scale: number;
}

/**
 * A {@link Scene} projected to screen pixels and culled to the viewport. The
 * renderer walks these arrays and blits — no `* scale`, no `+ offset`, no math.
 */
export interface ScreenScene {
  /** The viewport scale, for line widths / LOD decisions in the renderer. */
  scale: number;
  /** Visible nodes in pixel space. */
  nodes: ScreenNode[];
  /** Visible edges in pixel space. */
  connections: ScreenConnection[];
  /** Visible effect patterns in pixel space. */
  masteryEffects: ScreenEffect[];
}

/** A {@link PlacedNode} projected to screen pixels. */
export interface ScreenNode {
  /** Skill id (matches {@link PlacedNode.skill}). */
  skill: number;
  /** Screen-pixel centre. */
  x: number;
  y: number;
  /** Render kind (drives colour/frame). */
  kind: NodeKind;
  /** Skill-icon atlas key. */
  icon: string;
  /** Screen-pixel diameters. */
  iconSize: number;
  frameSize: number;
  /** Hit-test radius in screen pixels. */
  radius: number;
  /** Allocated in the current build. */
  allocated: boolean;
  /** Weapon set this allocated node is assigned to (1 or 2); absent = basic. */
  weaponSet?: WeaponSet;
  /** Jewel socketed into this node (jewel sockets only), if the build has one. */
  jewel?: JewelInfo;
}

/** A {@link PlacedConnection} projected to screen pixels. */
export interface ScreenConnection {
  /** Skill id of the edge's first endpoint. */
  from: number;
  /** Skill id of the edge's second endpoint. */
  to: number;
  /** Straight line, or an arc following an orbit. */
  kind: 'line' | 'arc';
  /** Screen position of the `from` endpoint. */
  a: Point;
  /** Screen position of the `to` endpoint. */
  b: Point;
  /** Both endpoints allocated — the edge is part of the build. */
  active: boolean;
  /** Weapon set this active edge belongs to (1 or 2); absent = basic/shared. */
  weaponSet?: WeaponSet;
  /** Arc only, in screen space (angles are unchanged by uniform scale). */
  arc?: { cx: number; cy: number; radius: number; startAngle: number; endAngle: number; clockwise: boolean; orbit: number };
}

/** A {@link PlacedEffect} projected to screen pixels. */
export interface ScreenEffect {
  /** Node the effect pattern belongs to. */
  skill: number;
  /** Screen-pixel centre. */
  x: number;
  y: number;
  /** Screen-pixel diameter of the pattern. */
  size: number;
  /** Atlas key of the pattern sprite. */
  patternKey: string;
  /** The mastery's cluster (group) has an allocated node — the pattern is lit. */
  active: boolean;
}
