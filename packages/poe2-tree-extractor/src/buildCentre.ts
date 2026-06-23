/**
 * Extracts the tree's centre art from GGPK: per-class portraits (real PoE2
 * classes only — those with a released ascendancy), per-ascendancy portraits
 * (released only), and the two hub-ring sprites. All decoded to PNG.
 *
 * Like the rest of the rewrite this is GGPK-only: art the source cannot serve is
 * skipped, never pulled from a vendored GGG sheet.
 */

import { encodePng   } from '@poe2-toolkit/ggpk';
import type {GgpkImageSource, GgpkSource} from '@poe2-toolkit/ggpk';

interface CharacterRow { Name: string; PassiveTreeImage?: string }
interface AscendancyRow { Name?: string; Character?: number | null; Disabled?: boolean; PassiveTreeImage?: string }

/** A source able to both read tables and fetch images. */
export type CentreSource = GgpkSource & GgpkImageSource;

/** The hub-ring sprites, by output name and UIImages logical name. */
const RING: { out: string; name: string }[] = [
  { out: 'ring-static', name: 'Art/2DArt/UIImages/InGame/PassiveTree/PassiveTreeMainCircle' },
  { out: 'ring-active', name: 'Art/2DArt/UIImages/InGame/PassiveTree/PassiveTreeMainCircleActive2' },
];

function isReleased(asc: AscendancyRow): boolean {
  return Boolean(asc.Name) && !asc.Name!.includes('[DNT') && !asc.Disabled;
}

/** Decode a DDS path to a PNG buffer, or `null` if the source can't serve it. */
async function emit(source: CentreSource, ddsPath: string | undefined): Promise<Buffer | null> {
  if (!ddsPath?.toLowerCase().endsWith('.dds')) {
    return null;
  }

  const img = await source.dds(ddsPath);

  return img ? encodePng(img.width, img.height, img.rgba) : null;
}

/**
 * Build the centre art. Returns a map of output name (without extension, e.g.
 * `portrait-ranger`, `ascendancy-deadeye`, `ring-static`) to its PNG bytes.
 */
export async function buildCentre(source: CentreSource): Promise<Record<string, Buffer>> {
  const Characters = (await source.table('Characters')) as unknown as CharacterRow[];
  const Ascendancy = (await source.table('Ascendancy')) as unknown as AscendancyRow[];

  const out: Record<string, Buffer> = {};

  // Real PoE2 classes only: the ones with a released ascendancy. GGPK still
  // carries 4 PoE1 placeholder classes whose ascendancies are all [DNT-UNUSED].
  const realClassIndex = new Set<number>();

  for (const asc of Ascendancy) {
    if (isReleased(asc) && asc.Character != null) {
      realClassIndex.add(asc.Character);
    }
  }

  for (const [index, character] of Characters.entries()) {
    if (!realClassIndex.has(index)) {
      continue;
    }

    const png = await emit(source, character.PassiveTreeImage);

    if (png) {
      out[`portrait-${character.Name.toLowerCase()}`] = png;
    }
  }

  for (const asc of Ascendancy) {
    if (!isReleased(asc)) {
      continue;
    }

    const slug = asc.Name!.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const png = await emit(source, asc.PassiveTreeImage);

    if (png) {
      out[`ascendancy-${slug}`] = png;
    }
  }

  // Hub ring: static ornate circle + active-class edge marker.
  for (const { out: name, name: logical } of RING) {
    const ref = await source.resolveSprite(logical);
    const png = ref ? await emit(source, ref.path) : null;

    if (png) {
      out[name] = png;
    }
  }

  return out;
}
