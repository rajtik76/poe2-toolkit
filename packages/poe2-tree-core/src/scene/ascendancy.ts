/**
 * Ascendancy lookups shared by allocation and scene building. Most ascendancies
 * own their nodes, but one can replace another and play on its disc instead (GGG
 * `replaces`: the Abyssal Lich uses the Lich's nodes, a few of them shown as other
 * passives). Nodes are always tagged with the ascendancy that owns them, so every
 * "does this node belong to the active ascendancy" check goes through
 * {@link ascendancyNodeOwner}.
 */

import type { AscendancyDef, TreeData } from '../types.js';

/** The ascendancy with display id `ascendancy`, from whichever class has it. */
export function findAscendancy(data: TreeData, ascendancy: string): AscendancyDef | undefined {
  for (const cls of data.classes) {
    const found = cls.ascendancies.find((asc) => asc.id === ascendancy);

    if (found) {
      return found;
    }
  }

  return undefined;
}

/**
 * The ascendancy whose nodes `ascendancy` plays on: the one it replaces (the
 * Abyssal Lich -> the Lich), or itself. Compare a node's `ascendancyName` against
 * this, not against the ascendancy id itself.
 */
export function ascendancyNodeOwner(data: TreeData, ascendancy: string): string {
  return findAscendancy(data, ascendancy)?.replaces ?? ascendancy;
}

/**
 * Which skill id `skill` shows for the active class and ascendancy, or undefined
 * when neither overrides it. The ascendancy wins over the class (it is the more
 * specific choice), and only an ascendancy of the active class counts, so a stale
 * `ascendId` left over from another class lends nothing.
 */
export function activeOverrides(
  data: TreeData,
  classId: number | null | undefined,
  ascendId?: string | null,
): (skill: number) => number | undefined {
  const cls = classId == null ? undefined : data.classes.find((c) => c.id === classId);
  const classPairs = cls?.overridePairs;
  const ascPairs = ascendId ? cls?.ascendancies.find((asc) => asc.id === ascendId)?.overridePairs : undefined;

  return (skill) => ascPairs?.[skill] ?? classPairs?.[skill];
}
