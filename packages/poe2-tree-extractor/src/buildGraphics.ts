/**
 * Builds the passive-tree sprite atlases from GGPK art, in the shape the
 * renderer reads: skill icons (`skills`), node frames (`frame`), and mastery
 * effect patterns (`mastery-effect-active`). One colour icon per node; the
 * unallocated/dimmed look is a render-time tint (matching the game), so no
 * separate disabled atlas is baked. Atlas keys mirror the engine's
 * `spriteKeys`. Source: GGPK only.
 *
 * Unlike the legacy script this has no GGG-export fallback: a sprite the source
 * cannot serve is skipped and reported, never pulled from a vendored asset.
 */

import type { GgpkImageSource, GgpkSource } from '@poe2-toolkit/ggpk';

import { packAtlas } from './atlas.js';
import type {AtlasSprite, PackedAtlas} from './atlas.js';
import type { ExportNode, TreeExport } from './buildTree.js';

/** The three atlases this build produces, keyed by atlas name. */
export interface TreeAtlases {
  /** Skill-icon atlas: one colour sprite per node icon. */
  skills: PackedAtlas;
  /** Node-frame atlas: the frame states for each node kind. */
  frame: PackedAtlas;
  /** Mastery effect-pattern atlas (packed on a wider sheet). */
  'mastery-effect-active': PackedAtlas;
}

/**
 * Per-atlas counts of sprites packed and sources missing, for reporting.
 *
 * `skills` and `masteryEffects` carry a `missing` count because their sprites
 * come from per-node icon/effect DDS paths that the source may fail to serve.
 * `frames` has no `missing`: the frame set is a fixed, known list built from
 * dedicated UIArt rows, so there is nothing to "miss" — a frame either exists
 * or the row simply isn't there. The asymmetry is intentional, not a gap.
 */
export interface GraphicsReport {
  /** Skill icons: sprites packed and DDS sources that could not be served. */
  skills: { packed: number; missing: number };
  /** Node frames packed. No `missing`: the frame set is fixed (see above). */
  frames: { packed: number };
  /** Mastery effects: sprites packed and effect images that could not be served. */
  masteryEffects: { packed: number; missing: number };
}

/** The build's atlases plus a report of what was packed or skipped. */
export interface GraphicsResult {
  /** The three packed sprite atlases. */
  atlases: TreeAtlases;
  /** What packed vs. what the source could not serve. */
  report: GraphicsReport;
}

interface UIArtRow {
  Id?: string;
  PassiveFrame?: number | null;
  NotableFrame?: number | null;
  KeystoneFrame?: number | null;
  JewelFrame?: number | null;
  AscendancyStart?: number | null;
}

type FrameState = 'Normal' | 'CanAllocate' | 'Active';
type NodeFrameArtRow = Partial<Record<FrameState, string>> & { Id?: string };

/** A source able to both read tables and fetch images. */
export type GraphicsSource = GgpkSource & GgpkImageSource;

/** Engine variant prefix for a node's skill icon (mirrors `iconKeyFor`). */
function variantOf(node: ExportNode): string | null {
  if (node.isMastery) {
    return null; // masteries render as their effect pattern
  }

  if (node.isKeystone) {
    return 'keystone';
  }

  if (node.isNotable) {
    return 'notable';
  }

  return 'normal';
}

export async function buildGraphics(source: GraphicsSource, tree: TreeExport): Promise<GraphicsResult> {
  // --- skill icons: one colour atlas (`skills`) -----------------------------
  // The unallocated dimming is a render-time tint, not a baked desaturation, so
  // this packs a single colour sprite per node icon.

  // icon-path -> variant; first node wins, same icon shares a variant.
  const wanted = new Map<string, { variant: string; icon: string }>();

  for (const node of Object.values(tree.nodes)) {
    const variant = variantOf(node);

    if (variant && node.icon && !wanted.has(`${variant}:${node.icon}`)) {
      wanted.set(`${variant}:${node.icon}`, { variant, icon: node.icon });
    }
  }

  // +attribute choice icons (Str/Dex/Int) — shown on the node once an attribute
  // is picked; not a node's own icon, so add them explicitly.
  for (const override of Object.values(tree.skillOverrides)) {
    const icon = override.icon;

    if (typeof icon === 'string' && icon && !wanted.has(`normal:${icon}`)) {
      wanted.set(`normal:${icon}`, { variant: 'normal', icon });
    }
  }

  const active: AtlasSprite[] = [];
  let iconsMissing = 0;

  for (const { variant, icon } of wanted.values()) {
    const img = await source.dds(icon);

    if (!img) {
      iconsMissing += 1;
      continue;
    }

    active.push({ key: `${variant}Active:${icon}`, width: img.width, height: img.height, rgba: img.rgba });
  }

  // --- node frames: frame atlas ----------------------------------------------
  // The UIArt "Character" row drives the main tree, "Ascendancy" the disc frames.
  // NodeFrameArt Normal/CanAllocate/Active map to the renderer's states.

  const UIArt = (await source.table('PassiveSkillTreeUIArt')) as unknown as UIArtRow[];
  const NodeFrameArt = (await source.table('PassiveSkillTreeNodeFrameArt')) as NodeFrameArtRow[];
  const mainUi = UIArt.find((r) => r.Id === 'Character');
  const ascUi = UIArt.find((r) => r.Id === 'Ascendancy');

  const frameSprites: AtlasSprite[] = [];
  const addFrame = async (key: string, frameArtIndex: number | null | undefined, state: FrameState): Promise<void> => {
    const art = frameArtIndex != null ? NodeFrameArt[frameArtIndex] : undefined;
    const path = art?.[state];
    const img = path ? await source.uiSprite(path) : null;

    if (img) {
      frameSprites.push({ key, width: img.width, height: img.height, rgba: img.rgba });
    }
  };

  // Main-tree frames (engine keys from frameKeyFor).
  await addFrame('KeystoneFrameUnallocated', mainUi?.KeystoneFrame, 'Normal');
  await addFrame('KeystoneFrameCanAllocate', mainUi?.KeystoneFrame, 'CanAllocate');
  await addFrame('KeystoneFrameAllocated', mainUi?.KeystoneFrame, 'Active');
  await addFrame('NotableFrameUnallocated', mainUi?.NotableFrame, 'Normal');
  await addFrame('NotableFrameCanAllocate', mainUi?.NotableFrame, 'CanAllocate');
  await addFrame('NotableFrameAllocated', mainUi?.NotableFrame, 'Active');
  await addFrame('JewelFrameUnallocated', mainUi?.JewelFrame, 'Normal');
  await addFrame('JewelFrameCanAllocate', mainUi?.JewelFrame, 'CanAllocate');
  await addFrame('JewelFrameAllocated', mainUi?.JewelFrame, 'Active');
  await addFrame('PSSkillFrame', mainUi?.PassiveFrame, 'Normal');
  await addFrame('PSSkillFrameHighlighted', mainUi?.PassiveFrame, 'CanAllocate');
  await addFrame('PSSkillFrameActive', mainUi?.PassiveFrame, 'Active');
  // Ascendancy disc frames.
  await addFrame('AscendancyFrameNormalUnallocated', ascUi?.PassiveFrame, 'Normal');
  await addFrame('AscendancyFrameNormalAllocated', ascUi?.PassiveFrame, 'Active');
  await addFrame('AscendancyFrameNotableUnallocated', ascUi?.NotableFrame, 'Normal');
  await addFrame('AscendancyFrameNotableAllocated', ascUi?.NotableFrame, 'Active');
  await addFrame('AscendancyStartNode', ascUi?.AscendancyStart, 'Active');

  // --- mastery effect patterns: mastery-effect-active atlas ------------------
  // Renderer keys them `masteryEffectActive:<ActiveEffectImage>.png`.

  const effectImages = new Set<string>();

  for (const node of Object.values(tree.nodes)) {
    if (node.activeEffectImage) {
      effectImages.add(node.activeEffectImage);
    }
  }

  const masterySprites: AtlasSprite[] = [];
  let masteryMissing = 0;

  for (const path of effectImages) {
    const img = await source.uiSprite(path);

    if (!img) {
      masteryMissing += 1;
      continue;
    }

    masterySprites.push({ key: `masteryEffectActive:${path}.png`, width: img.width, height: img.height, rgba: img.rgba });
  }

  // Patterns are large (~775²); a wide sheet keeps both dimensions under webp's
  // 16383px cap.
  const atlases: TreeAtlases = {
    'skills': packAtlas(active),
    'frame': packAtlas(frameSprites),
    'mastery-effect-active': packAtlas(masterySprites, 6000),
  };

  return {
    atlases,
    report: {
      skills: { packed: active.length, missing: iconsMissing },
      frames: { packed: frameSprites.length },
      masteryEffects: { packed: masterySprites.length, missing: masteryMissing },
    },
  };
}
