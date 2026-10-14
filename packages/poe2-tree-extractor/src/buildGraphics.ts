/**
 * Builds the passive-tree sprite atlases from GGPK art: skill icons (`skills`), node frames (`frame`), mastery effect
 * patterns (`mastery-effect-active`). Keys mirror the engine's `spriteKeys`. The dimmed look is a render-time tint, so no
 * disabled atlas is baked. A sprite the source can't serve is skipped and reported, with no vendored fallback.
 */

import type { GgpkImageSource, GgpkSource } from '@poe2-toolkit/ggpk';
import { mapConcurrent } from '@poe2-toolkit/ggpk';

import { packAtlas } from './atlas.js';
import type {AtlasSprite, PackedAtlas} from './atlas.js';
import type { ExportNode, TreeExport } from './buildTree.js';

export interface TreeAtlases {
  skills: PackedAtlas;
  frame: PackedAtlas;
  'mastery-effect-active': PackedAtlas;
}

/** Sprites packed and sources missing. `frames` has no `missing` on purpose: its set is a fixed list of UIArt rows. */
export interface GraphicsReport {
  skills: { packed: number; missing: number };
  frames: { packed: number };
  masteryEffects: { packed: number; missing: number };
}

export interface GraphicsResult {
  atlases: TreeAtlases;
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

/** Distinct sprite fetches to run concurrently (I/O-bound: network fetch + decode). */
const CONCURRENCY = 16;

type FrameState = 'Normal' | 'CanAllocate' | 'Active';
type NodeFrameArtRow = Partial<Record<FrameState, string>> & { Id?: string };

export type GraphicsSource = GgpkSource & GgpkImageSource;

function variantOf(node: ExportNode): string | null {
  if (node.isMastery || node.isAscendancyStart) {
    return null; // masteries render as their effect pattern, starts as a frame only
  }

  if (node.isKeystone) {
    return 'keystone';
  }

  if (node.isNotable) {
    return 'notable';
  }

  return 'normal';
}

/** Every skill icon the renderer can ask for with its frame variant key (`<variant>Active:<icon>`): node icons, +attribute choices and class/ascendancy override icons. */
export function wantedSkillIcons(tree: TreeExport): { variant: string; icon: string }[] {
  // variant + icon -> entry; the same icon in the same variant is packed once.
  const wanted = new Map<string, { variant: string; icon: string }>();
  const want = (variant: string | null, icon: string | undefined): void => {
    if (variant && icon && !wanted.has(`${variant}:${icon}`)) {
      wanted.set(`${variant}:${icon}`, { variant, icon });
    }
  };

  // Override nodes have no kind flags: the renderer draws one in a base node's place, so pack its icon in the base node's variant.
  // Older exports may lack a class's pairs or ascendancies.
  const overrides = tree.classes.flatMap((cls) => [
    cls.overridePairs ?? {},
    ...(cls.ascendancies ?? []).map((asc) => asc.overridePairs ?? {}),
  ]);
  const overrideTargets = new Set(overrides.flatMap((pairs) => Object.values(pairs)));

  for (const node of Object.values(tree.nodes)) {
    // An override target is never drawn as itself, only in a base node's frame.
    if (!overrideTargets.has(node.skill)) {
      want(variantOf(node), node.icon);
    }
  }

  // +attribute choice icons (Str/Dex/Int) are not a node's own icon, so add them explicitly.
  for (const override of Object.values(tree.skillOverrides)) {
    if (typeof override.icon === 'string') {
      want('normal', override.icon);
    }
  }

  for (const pairs of overrides) {
    for (const [base, target] of Object.entries(pairs)) {
      const baseNode = tree.nodes[Number(base)];

      if (baseNode) {
        want(variantOf(baseNode), tree.nodes[target]?.icon);
      }
    }
  }

  return [...wanted.values()];
}

export async function buildGraphics(source: GraphicsSource, tree: TreeExport): Promise<GraphicsResult> {
  // skill icons: one colour atlas (`skills`)
  const wantedList = wantedSkillIcons(tree);
  const activeSlots = await mapConcurrent(wantedList, CONCURRENCY, async ({ variant, icon }) => {
    const img = await source.dds(icon);

    return img ? { key: `${variant}Active:${icon}`, width: img.width, height: img.height, rgba: img.rgba } : null;
  });

  const active = activeSlots.filter((s): s is AtlasSprite => s !== null);
  const iconsMissing = activeSlots.length - active.length;

  // node frames: the UIArt "Character" row drives the main tree, "Ascendancy" the disc frames.
  // NodeFrameArt Normal/CanAllocate/Active map to the renderer's states.

  const UIArt = (await source.table('PassiveSkillTreeUIArt')) as UIArtRow[];
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

  // mastery effect patterns, keyed `masteryEffectActive:<ActiveEffectImage>.png`.

  const effectImages = new Set<string>();

  for (const node of Object.values(tree.nodes)) {
    if (node.activeEffectImage) {
      effectImages.add(node.activeEffectImage);
    }
  }

  const effectList = [...effectImages];
  const masterySlots = await mapConcurrent(effectList, CONCURRENCY, async (path) => {
    const img = await source.uiSprite(path);

    return img ? { key: `masteryEffectActive:${path}.png`, width: img.width, height: img.height, rgba: img.rgba } : null;
  });

  const masterySprites = masterySlots.filter((s): s is AtlasSprite => s !== null);
  const masteryMissing = masterySlots.length - masterySprites.length;

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
