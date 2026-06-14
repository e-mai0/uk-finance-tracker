/**
 * Run an async mapper over `items` with bounded concurrency, preserving input
 * order in the returned results. Used by the sync layer so a daily run can pull
 * many I/O-bound sources in parallel and finish within the function's duration
 * limit (Hobby caps at 300s; sequential over ~20 sources blew past it).
 *
 * The mapper is expected not to reject (the sync layer catches per-source); if it
 * does, the rejection propagates and aborts the pool.
 */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
