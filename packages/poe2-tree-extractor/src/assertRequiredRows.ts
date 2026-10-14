/** Fails loud if any row misses a required field: a renamed/dropped GGPK column would otherwise propagate `undefined` deep into the pipeline. */

import type { TableRow } from '@poe2-toolkit/ggpk';

export function assertRequiredRows<T>(
  rows: TableRow[],
  tableName: string,
  requiredKeys: readonly (keyof T & string)[],
): T[] {
  for (const row of rows) {
    for (const key of requiredKeys) {
      if (row[key] === undefined) {
        throw new Error(`malformed "${tableName}" row: missing required field "${key}" - the table shape may have changed`);
      }
    }
  }

  return rows as unknown as T[];
}
