/**
 * `TreeData` + friends: source shape, normalised from GGG's skill-tree export
 * (node x/y are baked into the export). `Scene` + friends: computed output,
 * everything positioned and sized in world space.
 */

// Input: source tree data

export interface TreeData {
  /** Tree/patch version, e.g. "0_5". */
  version: string;
  constants: TreeConstants;
  /** Keyed by group id. */
  groups: Record<number, Group>;
  /** Keyed by skill id. */
  nodes: Record<number, TreeNode>;
  classes: ClassDef[];
  /** Skill ids that are jewel sockets. */
  jewelSlots: number[];
  bounds: WorldRect;
}

export interface TreeConstants {
  /** Radius of the central opening. Missing in GGG's export, normalisation supplies it. */
  centreInnerRadius: number;
}

export interface Group {
  x: number;
  y: number;
  orbits: number[];
  /** Member skill ids. */
  nodes: number[];
}

export interface TreeNode {
  /** Canonical skill id (GGG `PassiveSkills.id`). */
  skill: number;
  /** Owning group id. */
  group: number;
  orbit: number;
  orbitIndex: number;
  x: number;
  y: number;
  /** GGG `in` + `out`, merged. */
  connections: NodeConnection[];
  name: string;
  /** Atlas key into the {@link SpriteManifest}. */
  icon: string;
  stats: string[];

  // Kind flags; absence = plain small node.
  isNotable?: boolean;
  isKeystone?: boolean;
  isJewelSocket?: boolean;
  /** Anointment-only sockets, not part of the base tree and hidden from the render. */
  noRadius?: boolean;
  /** Mastery hub: a background pattern, not a connectable node. */
  isMastery?: boolean;
  /** Root node of an ascendancy panel. */
  isAscendancyStart?: boolean;
  /** GGG: `isGenericAttribute`. */
  isAttribute?: boolean;

  /** Background pattern key (masteries and notables). */
  activeEffectImage?: string;
  /** Display name (e.g. "Deadeye"), translated from GGG's internal `ascendancyId`. */
  ascendancyName?: string;
  flavourText?: string;
  recipe?: string[];
  /** Attribute nodes: the interchangeable choices. */
  options?: NodeOption[];
  /** GGG `unlockConstraint`: hidden in the default tree, shown only when unlocked. */
  conditional?: boolean;
  unlockAscendancy?: string;
  /** Skill ids that must ALL be allocated for a conditional node to appear. */
  unlockNodes?: number[];
  /** Class-start nodes: names of the classes that start here. */
  classesStart?: string[];
}

/** One selectable variant of an attribute node. */
export interface NodeOption {
  /** Skill id of the underlying node. */
  id: number;
  name: string;
  stats: string[];
  icon: string;
}

/**
 * An edge to a neighbouring node. Edges without `arcCentre` draw as a straight
 * line, or as an arc around the shared group centre (see {@link placeConnection}).
 */
export interface NodeConnection {
  id: number;
  /** World centre of the arc this edge follows (GGG `orbitX`/`orbitY`). */
  arcCentre?: Point;
}

/** Native pixel/world dimensions of a sprite or hub layer. */
export interface Size {
  width: number;
  height: number;
}

export interface ClassDef {
  name: string;
  /** Index in GGG's `classes` array (Witch = 1). */
  id: number;
  baseStr: number;
  baseDex: number;
  baseInt: number;
  /** Skill id of the start node (derived from `classStartIndex`). */
  startNode: number;
  centre: CentreArt;
  ascendancies: AscendancyDef[];
  /**
   * Per-class display overrides: base node skill id -> skill id whose
   * name/stats/icon this class shows instead. Geometry is unchanged.
   */
  overridePairs?: Record<number, number>;
}

/**
 * The three concentric hub layers of a class, all centred on `x`/`y` (the origin).
 * GGG's export has no layer sizes, so normalisation fills them from the atlas
 * frames. World radius equals the native width.
 */
export interface CentreArt {
  /** Class portrait atlas key (e.g. `ClassesRanger`). */
  image: string;
  x: number;
  y: number;
  /** Class portrait (1500²). */
  art: Size;
  /** Rotating gold ring (2000²). */
  active: Size;
  /** Ornate frame (2000²). */
  frame: Size;
}

/**
 * An ascendancy disc as a relocatable block. GGG bakes its nodes at a far-flung
 * cluster (`worldAnchor`); the renderer either translates it into the hub or
 * leaves it there.
 */
export interface AscendancyDef {
  /** Display name, also the build's ascendancy key (e.g. "Deadeye"). */
  id: string;
  name: string;
  /** GGG internal id, e.g. `Ranger1`. */
  internalId: string;
  /** Disc background atlas key. */
  image: string;
  /** Centroid of the disc's nodes. */
  worldAnchor: Point;
  /** Disc native size (1500²). */
  size: Size;
  /**
   * Display id of the ascendancy whose disc and nodes this one plays on (GGG
   * `replaces`). See {@link ascendancyNodeOwner}.
   */
  replaces?: string;
  /**
   * Display overrides while this ascendancy is active: a node of the replaced
   * ascendancy -> the skill id whose name/stats/icon it shows. Geometry and
   * allocation stay on the base node.
   */
  overridePairs?: Record<number, number>;
}

// Input: graphics manifest (supplied separately, never loaded by core)

/** One sprite's location: atlas id and its native pixel sub-rect. */
export interface SpriteFrame {
  atlas: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Maps every atlas key core emits to a frame. Supplied by the renderer. */
export interface SpriteManifest {
  frames: Record<string, SpriteFrame>;
}

// Geometry primitives

export interface Point {
  x: number;
  y: number;
}

export interface WorldRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// Output: computed scene

/** World-space output: everything a renderer needs. Feed it to {@link project} to get pixels. */
export interface Scene {
  nodes: PlacedNode[];
  connections: PlacedConnection[];
  /** Background patterns behind notables/keystones/masteries. */
  masteryEffects: PlacedEffect[];
  centre: CentreLayout;
  /** Extent of the whole tree, including the far-flung ascendancy discs. */
  bounds: WorldRect;
  /** Extent of the main tree only. Fit the initial view to this, not `bounds`. */
  mainBounds: WorldRect;
}

export interface PlacedNode {
  /** Skill id (matches {@link TreeNode.skill}). */
  skill: number;
  x: number;
  y: number;
  kind: NodeKind;
  /** Skill-icon atlas key. */
  icon: string;
  /** World diameter of the skill icon. */
  iconSize: number;
  /** World diameter of the overlay frame (0 = none, e.g. masteries). */
  frameSize: number;
  /** Hit-test radius: half the larger of icon/frame. */
  radius: number;
  allocated: boolean;
  /** Absent = shared/basic node, active in both weapon sets. */
  weaponSet?: WeaponSet;
  /** Owning ascendancy id. */
  ascendancy?: string;
  /** Jewel socketed into this node (sockets only). */
  jewel?: JewelInfo;
}

/** Display-only: the engine never applies a jewel's radius effect (PoE2 jewels are global stats). */
export interface JewelInfo {
  name: string;
  /** Upper-case PoB form: NORMAL / MAGIC / RARE / UNIQUE. */
  rarity: string;
  baseType: string;
  mods: string[];
  /** Item-icon URL, when resolved. */
  icon?: string;
}

export type NodeKind =
  | 'normal'
  | 'notable'
  | 'keystone'
  /** Drawn as a background pattern. */
  | 'mastery'
  | 'jewel'
  /** Generic +attribute node (Str/Dex/Int choice). */
  | 'attribute'
  | 'classStart'
  /** Root node of an ascendancy panel. */
  | 'ascendancyStart'
  | 'ascendancyNormal'
  | 'ascendancyNotable';

export interface PlacedConnection {
  /** Skill id of the first endpoint. */
  from: number;
  /** Skill id of the second endpoint. */
  to: number;
  kind: 'line' | 'arc';
  /** World position of `from`. */
  a: Point;
  /** World position of `to`. */
  b: Point;
  /** Both endpoints allocated. */
  active: boolean;
  /** Absent = basic/shared. */
  weaponSet?: WeaponSet;
  ascendancy?: string;
  /** Arc only: centre, radius, signed sweep (radians), and the orbit it follows. */
  arc?: { cx: number; cy: number; radius: number; startAngle: number; endAngle: number; clockwise: boolean; orbit: number };
}

/** A background pattern placed behind a notable/keystone/mastery. */
export interface PlacedEffect {
  /** Node the pattern belongs to. */
  skill: number;
  x: number;
  y: number;
  /** World diameter. */
  size: number;
  /** Atlas key of the pattern sprite. */
  patternKey: string;
  /** The mastery's group has an allocated node. */
  active: boolean;
}

/** Hub layout, all derived from the data. */
export interface CentreLayout {
  centre: Point;
  /** Radius of the central opening. */
  innerRadius: number;
  /** World radii of the three hub layers (equal to native width, the 2x draw rule is folded in). */
  ring: { artRadius: number; activeRadius: number; frameRadius: number };
  classes: ClassAnchor[];
  ascendancies: AscendancyDef[];
}

/** Where a class sits on the hub rim and how its gold ring rotates onto it. */
export interface ClassAnchor {
  /** Matches {@link ClassDef.id}. */
  classId: number;
  name: string;
  startNode: number;
  /** Radians, direction centre -> start node. */
  startAngle: number;
  /** Radians to rotate the active ring onto this class: `π/2 + atan2(dy, dx)`. */
  ringRotation: number;
}

// Build allocation: the only build input the engine needs

/**
 * A character's tree state. Whatever produces it (PoB code decoder, GGG OAuth
 * API, editor) is not the engine's concern. Gems and items are deliberately absent.
 */
export interface BuildAllocation {
  /**
   * Matches `ClassDef.id`. Optional: a read-only allocation identifies its class
   * by name at the call site, only the editable planner needs the id (pathing).
   */
  classId?: number;
  /** Matches `AscendancyDef.id`. */
  ascendId?: string;
  /** Allocated skill ids (basic + both weapon sets). */
  allocated: number[];
  /**
   * Node id -> weapon set 1 or 2. Absent = shared/basic node. Keystones, jewel
   * sockets and ascendancy nodes are always basic and never appear here.
   */
  weaponSets?: Record<number, WeaponSet>;
  /** Node id -> chosen attribute of a generic +attribute node. */
  attributeChoices?: Record<number, AttributeChoice>;
  /** Keyed by socket node id. Display-only. */
  jewels?: Record<number, JewelInfo>;
  /** Tree/patch version the allocation was made against, e.g. "0_5". */
  treeVersion?: string;
}

export type AttributeChoice = 'str' | 'dex' | 'int';

/** A node tagged 1 or 2 is active only when that weapon set is equipped; untagged nodes are active in both. */
export type WeaponSet = 1 | 2;

/** Allocation paint mode: 0 = basic/shared, 1 = weapon set I, 2 = weapon set II. */
export type AllocMode = 0 | WeaponSet;

export interface SceneOptions {
  /** Omit for an unallocated tree. */
  allocation?: BuildAllocation;
}

// Projection: world -> screen

/** `screen = world * scale + (tx, ty)`. */
export interface Viewport {
  tx: number;
  ty: number;
  scale: number;
}

/** A {@link Scene} projected to screen pixels and culled to the viewport. */
export interface ScreenScene {
  /** Viewport scale, for line widths / LOD. */
  scale: number;
  nodes: ScreenNode[];
  connections: ScreenConnection[];
  masteryEffects: ScreenEffect[];
}

/** A {@link PlacedNode} in screen pixels. */
export interface ScreenNode {
  skill: number;
  x: number;
  y: number;
  kind: NodeKind;
  icon: string;
  iconSize: number;
  frameSize: number;
  radius: number;
  allocated: boolean;
  weaponSet?: WeaponSet;
  jewel?: JewelInfo;
}

/** A {@link PlacedConnection} in screen pixels. */
export interface ScreenConnection {
  from: number;
  to: number;
  kind: 'line' | 'arc';
  a: Point;
  b: Point;
  active: boolean;
  weaponSet?: WeaponSet;
  /** Arc only; angles are unchanged by uniform scale. */
  arc?: { cx: number; cy: number; radius: number; startAngle: number; endAngle: number; clockwise: boolean; orbit: number };
}

/** A {@link PlacedEffect} in screen pixels. */
export interface ScreenEffect {
  skill: number;
  x: number;
  y: number;
  size: number;
  patternKey: string;
  active: boolean;
}
