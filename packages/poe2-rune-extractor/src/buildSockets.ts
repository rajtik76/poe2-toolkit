/**
 * Decodes the item-socket UI textures to PNGs under stable logical paths (`ui/<name>.png`). `socket-empty` is the bare
 * ring drawn for every socket (GGG has no rune-specific one); the filled textures are content only and layered over it.
 */

import { encodePng } from '@poe2-toolkit/ggpk';
import type { GgpkImageSource } from '@poe2-toolkit/ggpk';

type DdsSource = Pick<GgpkImageSource, 'dds'>;

const SOCKET_TEXTURES: Readonly<Record<string, string>> = {
  'ui/rune-socket.png': 'art/textures/interface/2d/2dart/uiimages/ingame/runesocketfilled.dds',
  'ui/soul-core-socket.png': 'art/textures/interface/2d/2dart/uiimages/ingame/soulcoressocketfilled.dds',
  'ui/socket-empty.png': 'art/textures/interface/2d/2dart/uiimages/ingame/soulcoressocketempty.dds',
};

export interface SocketIconsResult {
  icons: Record<string, Buffer>;
  report: {
    packed: number;
    missing: number;
  };
}

/** Missing textures are skipped and counted; the caller decides whether a miss is fatal. */
export async function buildSocketIcons(source: DdsSource): Promise<SocketIconsResult> {
  const icons: Record<string, Buffer> = {};
  let missing = 0;

  for (const [outPath, ddsPath] of Object.entries(SOCKET_TEXTURES)) {
    const img = await source.dds(ddsPath);

    if (!img) {
      missing += 1;
      continue;
    }

    icons[outPath] = encodePng(img.width, img.height, img.rgba);
  }

  return { icons, report: { packed: Object.keys(icons).length, missing } };
}
