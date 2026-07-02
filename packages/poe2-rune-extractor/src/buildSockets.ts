/**
 * Decodes the item-socket UI textures into PNGs, keyed by a stable logical output
 * path (not the GGPK path). Source: GGPK only.
 *
 * These are not per-rune data - they are the fixed UI chrome a build front-end
 * draws for an item's socket, so they carry stable logical names rather than the
 * raw GGG texture paths (which are noisy and version-specific). All three are
 * distinct layers: `socket-empty` is the bare metal ring, drawn for every socket;
 * the filled textures are only the content (the rune star, the soul-core orb) and
 * are layered over that ring for an occupied socket. The ring is never baked into
 * the filled textures, so it stays visible regardless of a socket's contents.
 *
 * GGG ships no rune-specific empty socket; `soulcoressocketempty` is the generic
 * empty ring, shared by rune and soul-core sockets alike.
 */

import { encodePng } from '@poe2-toolkit/ggpk';
import type { GgpkImageSource } from '@poe2-toolkit/ggpk';

/** The only capability the socket build needs: decode a DDS by its GGPK path. */
type DdsSource = Pick<GgpkImageSource, 'dds'>;

/**
 * The three socket textures, mapped from stable logical output path to the GGPK
 * DDS path that backs it. `socket-empty` is the shared bare ring; the filled
 * textures are content only (no ring) and are layered over that ring.
 */
const SOCKET_TEXTURES: Readonly<Record<string, string>> = {
  'ui/rune-socket.png': 'art/textures/interface/2d/2dart/uiimages/ingame/runesocketfilled.dds',
  'ui/soul-core-socket.png': 'art/textures/interface/2d/2dart/uiimages/ingame/soulcoressocketfilled.dds',
  'ui/socket-empty.png': 'art/textures/interface/2d/2dart/uiimages/ingame/soulcoressocketempty.dds',
};

/** Decoded socket textures plus a count of what was packed or skipped. */
export interface SocketIconsResult {
  /** PNG bytes keyed by stable logical output path (`ui/<name>.png`). */
  icons: Record<string, Buffer>;
  /** How the decode went. */
  report: {
    /** Socket textures decoded to PNG successfully. */
    packed: number;
    /** Socket textures the source could not serve or decode (skipped, never substituted). */
    missing: number;
  };
}

/**
 * Decode the fixed socket UI textures from the {@link GgpkImageSource}. Missing
 * textures are skipped and counted (never substituted), mirroring
 * {@link buildRuneIcons}; the caller decides whether a miss is fatal.
 */
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
