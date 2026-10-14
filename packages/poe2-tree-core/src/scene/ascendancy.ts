/** Ascendancy lookups. One ascendancy can replace another and play on its disc (GGG `replaces`), so every "node belongs to the active ascendancy" check goes through {@link ascendancyNodeOwner}. */

import type { AscendancyDef, TreeData } from '../types.js';

export function findAscendancy(data: TreeData, ascendancy: string): AscendancyDef | undefined {
  for (const cls of data.classes) {
    const found = cls.ascendancies.find((asc) => asc.id === ascendancy);

    if (found) {
      return found;
    }
  }

  return undefined;
}

/** The ascendancy whose nodes `ascendancy` plays on (the replaced one, or itself). Compare a node's `ascendancyName` against this. */
export function ascendancyNodeOwner(data: TreeData, ascendancy: string): string {
  return findAscendancy(data, ascendancy)?.replaces ?? ascendancy;
}

/** The ascendancy wins over the class, and only an ascendancy of the active class counts (a stale `ascendId` from another class lends nothing). */
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
