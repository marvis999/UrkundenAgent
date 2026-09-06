/**
 * Bounded fan-out.
 *
 * A run is mostly waiting on the model, so the stages are parallel. Two rules make
 * that safe: a limit, because the provider answers a burst of twenty calls with 429s and
 * the retry costs more wall time than the queue would have; and failures are collected,
 * never thrown, so one unreadable document cannot take a run down with it. The caller
 * decides what a partial result means, and the run log says which pieces are missing.
 */

/** Default width. Well under the provider's burst limit, and enough to hide latency. */
export const DEFAULT_LIMIT = 4;

export const inParallel = async <Item, Result>(
  items: readonly Item[],
  work: (item: Item, index: number) => Promise<Result>,
  limit: number = DEFAULT_LIMIT,
): Promise<PromiseSettledResult<Result>[]> => {
  const results: PromiseSettledResult<Result>[] = [];
  let next = 0;
  // Each worker pulls the next index until none is left, so a slow item cannot idle the rest.
  const worker = async () => {
    for (let index = next++; index < items.length; index = next++) {
      [results[index]] = await Promise.allSettled([work(items[index] as Item, index)]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
};

/** The values that came back, in order, dropping the failures. */
export const fulfilled = <T>(results: readonly PromiseSettledResult<T>[]): T[] =>
  results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));

/** One line per failure, for the run log. */
export const failures = <T>(results: readonly PromiseSettledResult<T>[], label: (index: number) => string): string[] =>
  results.flatMap((result, index) =>
    result.status === "rejected"
      ? [`${label(index)}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`]
      : [],
  );
