/**
 * Decodes the gem icons and hover-art backgrounds referenced by {@link GemData}
 * into PNGs, keyed by their output path. One PNG per distinct reference.
 * Source: GGPK only.
 *
 * Unlike the legacy script this has no vendored fallback: an icon the source
 * cannot serve is skipped and reported, never pulled from a bundled asset.
 *
 * Art comes referenced two ways, and `SkillGems.UI_Image` switched from the first
 * to the second in patch 4.5.5: a DDS path (`Art/Textures/.../X.dds`), keyed as
 * `<path without extension>.png`, or a UIImages name
 * (`Art/2DArt/UIImages/InGame/...`, no extension) resolved through the sprite
 * index and keyed as `<name>.png`. Both decode here, so the key is always the
 * reference itself plus `.png`.
 */

import { decodeDdsIcons, decodeSpriteIcons } from '@poe2-toolkit/ggpk';
import type { DdsIconsResult, DdsSource, SpriteSource } from '@poe2-toolkit/ggpk';

import type { GemData } from './buildGems.js';

/** Decoded icons plus a count of what was packed or skipped. */
export type GemIconsResult = DdsIconsResult;

/** What a gem icon build needs from a source: DDS decoding, plus sprite resolution. */
export type GemIconSource = DdsSource & SpriteSource;

/** GGPK art references carry the extension; a UIImages sprite name never does. */
function isDdsPath(reference: string): boolean {
  return reference.toLowerCase().endsWith('.dds');
}

/**
 * Decode every distinct gem icon in `data` from the {@link GemIconSource}. The
 * source is responsible for path casing; the returned keys keep the original case.
 */
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
