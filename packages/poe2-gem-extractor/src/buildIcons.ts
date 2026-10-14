/**
 * Decodes the gem icons and hover-art backgrounds referenced by {@link GemData} to PNGs. No vendored fallback: an
 * unservable icon is skipped and reported. `SkillGems.UI_Image` switched in patch 4.5.5 from a DDS path to a UIImages
 * name (resolved via the sprite index); both decode here, keyed as the reference plus `.png`.
 */

import { decodeDdsIcons, decodeSpriteIcons } from '@poe2-toolkit/ggpk';
import type { DdsIconsResult, DdsSource, SpriteSource } from '@poe2-toolkit/ggpk';

import type { GemData } from './buildGems.js';

export type GemIconsResult = DdsIconsResult;

export type GemIconSource = DdsSource & SpriteSource;

function isDdsPath(reference: string): boolean {
  return reference.toLowerCase().endsWith('.dds');
}

/** The source is responsible for path casing; keys keep the original case. */
export async function buildGemIcons(source: GemIconSource, data: GemData): Promise<GemIconsResult> {
  const ddsPaths: string[] = [];
  const spriteNames: string[] = [];

  for (const gem of Object.values(data.gems)) {
    if (gem.icon && isDdsPath(gem.icon)) {
      ddsPaths.push(gem.icon);
    }

    if (gem.hoverImage) {
      (isDdsPath(gem.hoverImage) ? ddsPaths : spriteNames).push(gem.hoverImage);
    }
  }

  const [fromPaths, fromSprites] = await Promise.all([
    decodeDdsIcons(source, ddsPaths),
    decodeSpriteIcons(source, spriteNames),
  ]);

  return {
    icons: { ...fromPaths.icons, ...fromSprites.icons },
    report: {
      packed: fromPaths.report.packed + fromSprites.report.packed,
      missing: fromPaths.report.missing + fromSprites.report.missing,
    },
  };
}
