/** Extracts the tree's centre art from GGPK as PNGs: class and ascendancy portraits (released only) and the two hub-ring sprites. Art the source can't serve is never pulled from a vendored sheet. */

import { encodePng   } from '@poe2-toolkit/ggpk';
import type {GgpkImageSource, GgpkSource} from '@poe2-toolkit/ggpk';

import { assertRequiredRows } from './assertRequiredRows.js';

interface CharacterRow { Name: string; PassiveTreeImage?: string }
interface AscendancyRow { Name?: string; Character?: number | null; Disabled?: boolean; PassiveTreeImage?: string }

export type CentreSource = GgpkSource & GgpkImageSource;

const RING: { out: string; name: string }[] = [
  { out: 'ring-static', name: 'Art/2DArt/UIImages/InGame/PassiveTree/PassiveTreeMainCircle' },
  { out: 'ring-active', name: 'Art/2DArt/UIImages/InGame/PassiveTree/PassiveTreeMainCircleActive2' },
];

function isReleased(asc: AscendancyRow): boolean {
  return Boolean(asc.Name) && !asc.Name!.includes('[DNT') && !asc.Disabled;
}

/**
 * Decodes a DDS path to PNG, or `null` when the row has no art. A row that names a `.dds` whose bytes can't be fetched or
 * decoded (e.g. the CDN hasn't finished propagating a new version) throws: skipping it would stage an incomplete release.
 */
async function emit(source: CentreSource, ddsPath: string | undefined): Promise<Buffer | null> {
  if (!ddsPath?.toLowerCase().endsWith('.dds')) {
    return null;
  }

  const img = await source.dds(ddsPath);

  if (!img) {
    throw new Error(`centre art source could not serve ${ddsPath}`);
  }

  return encodePng(img.width, img.height, img.rgba);
}

export async function buildCentre(source: CentreSource): Promise<Record<string, Buffer>> {
  const Characters = assertRequiredRows<CharacterRow>(await source.table('Characters'), 'Characters', ['Name']);
  const Ascendancy = (await source.table('Ascendancy')) as AscendancyRow[];

  const out: Record<string, Buffer> = {};

  // Real PoE2 classes only: GGPK still carries 4 PoE1 placeholder classes whose ascendancies are all [DNT-UNUSED].
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

  // Hub ring sprites are never conditionally absent, so an unresolved one is a hard failure too.
  for (const { out: name, name: logical } of RING) {
    const ref = await source.resolveSprite(logical);

    if (!ref) {
      throw new Error(`could not resolve hub ring sprite: ${logical}`);
    }

    const png = await emit(source, ref.path);

    if (png) {
      out[name] = png;
    }
  }

  return out;
}
