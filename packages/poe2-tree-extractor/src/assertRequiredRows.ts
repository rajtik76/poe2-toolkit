/**
 * Cast a decoded table to a row shape with required fields, failing loud if any
 * row is actually missing one - the GGPK column may have been renamed or
 * dropped upstream, and a silent `as` cast would otherwise let `undefined`
 * propagate deep into the pipeline instead of erroring at the table boundary.
 */

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

  // Validated above: every row actually carries the fields T declares required.
  return rows as unknown as T[];
}
