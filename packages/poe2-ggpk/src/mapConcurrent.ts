/**
 * Runs `fn` over `items` with at most `concurrency` calls in flight at once,
 * for the I/O-bound "many independent awaited fetches" shape ({@link decodeDdsIcons}
 * and the tree extractor's graphics build). Results land at their original
 * index regardless of completion order, so callers that care about a stable
 * output order (e.g. sprite-atlas packing, pinned byte-for-byte in golden
 * tests) get the same order a plain sequential loop would produce.
 */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const idx = next;
      next += 1;
      results[idx] = await fn(items[idx] as T, idx);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));

  return results;
}
