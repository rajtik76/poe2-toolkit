/**
 * A DDS the source lists but cannot serve (the classic half-propagated patch
 * CDN case) must fail the whole build loudly, never be skipped in silence -
 * a silent skip is exactly what shipped 4.5.4.4 with 28 of 33 centre images
 * missing. These tests use a hand-rolled fake source so they run without any
 * network access or golden fixtures.
 */

import { describe, expect, it } from 'vitest';
import type { CentreSource } from '../../src/buildCentre';
import { buildCentre } from '../../src/buildCentre';

const CHARACTERS = [{ Name: 'Warrior', PassiveTreeImage: 'Art/Warrior.dds' }];
const ASCENDANCY = [{ Name: 'Titan', Character: 0, PassiveTreeImage: 'Art/Titan.dds' }];

/** A source whose `dds()` fails for exactly the given paths, succeeds for the rest. */
function fakeSource(failingPaths: Set<string>, resolvedSprites = true): CentreSource {
  return {
    table: async (name: string) => (name === 'Characters' ? CHARACTERS : ASCENDANCY) as never,
    file: async () => null,
    dds: async (path: string) =>
      failingPaths.has(path) ? null : { width: 1, height: 1, rgba: new Uint8Array(4) },
    resolveSprite: async (name: string) =>
      resolvedSprites ? { path: `Art/${name.split('/').pop()}.dds`, top: 0, left: 0, width: 1, height: 1 } : null,
    uiSprite: async () => ({ width: 1, height: 1, rgba: new Uint8Array(4) }),
  };
}

describe('buildCentre fails loud instead of silently skipping', () => {
  it('succeeds when every referenced DDS decodes', async () => {
    const art = await buildCentre(fakeSource(new Set()));

    expect(Object.keys(art).sort()).toEqual(['ascendancy-titan', 'portrait-warrior', 'ring-active', 'ring-static'].sort());
  });

  it('throws when a class portrait DDS cannot be fetched/decoded', async () => {
    await expect(buildCentre(fakeSource(new Set(['Art/Warrior.dds'])))).rejects.toThrow(/Art\/Warrior\.dds/);
  });

  it('throws when an ascendancy portrait DDS cannot be fetched/decoded', async () => {
    await expect(buildCentre(fakeSource(new Set(['Art/Titan.dds'])))).rejects.toThrow(/Art\/Titan\.dds/);
  });

  it('throws when a hub ring sprite cannot be resolved at all', async () => {
    await expect(buildCentre(fakeSource(new Set(), false))).rejects.toThrow(/hub ring sprite/);
  });

  it('throws when a hub ring DDS resolves but cannot be fetched/decoded', async () => {
    await expect(buildCentre(fakeSource(new Set(['Art/PassiveTreeMainCircle.dds'])))).rejects.toThrow(
      /PassiveTreeMainCircle\.dds/,
    );
  });
});
