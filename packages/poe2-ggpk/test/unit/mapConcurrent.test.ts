import { describe, expect, it } from 'vitest';

import { mapConcurrent } from '../../src/mapConcurrent';

describe('mapConcurrent', () => {
  it('preserves output order regardless of completion order', async () => {
    const delays = [30, 10, 20, 0];

    const result = await mapConcurrent(delays, 4, async (ms, i) => {
      await new Promise((resolve) => setTimeout(resolve, ms));

      return i;
    });

    expect(result).toEqual([0, 1, 2, 3]);
  });

  it('caps in-flight calls at the concurrency limit', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    const items = Array.from({ length: 10 }, (_, i) => i);

    await mapConcurrent(items, 3, async (i) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);

      await Promise.resolve();

      inFlight -= 1;

      return i;
    });

    expect(maxInFlight).toBe(3);
  });

  it('returns an empty array for no items', async () => {
    const result = await mapConcurrent([], 4, async (i) => i);

    expect(result).toEqual([]);
  });
});
