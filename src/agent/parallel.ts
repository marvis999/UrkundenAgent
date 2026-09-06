/**
 * Bounded fan-out.
 *
 * A run is mostly waiting on the model, so the stages are parallel. Two rules make
 * that safe:
 *
 *  - a limit, because the provider answers a burst of twenty calls with 429s and the
 *    retry that follows costs more wall time than the queue would have;
 *  - failures are collected, never thrown. One unreadable document must not take a run
 *    down with it. The caller decides what a partial result means, and the run log says
 *    which pieces are missing.
 */

export type Settled<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: unknown };

/** Default width. Well under the provider's burst limit, and enough to hide latency. */
export const DEFAULT_LIMIT = 4;

export const inParallel = async <Item, Result>(
  items: readonly Item[],
  work: (item: Item, index: number) => Promise<Result>,
  limit: number = DEFAULT_LIMIT,
): Promise<Settled<Result>[]> => {
  const results: Settled<Result>[] = new Array(items.length);
  let next = 0;

  /** Each worker pulls the next index until there is none left, so a slow item cannot
      leave the remaining workers idle the way a fixed chunking would. */
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next;
      next += 1;
      const item = items[index];
      if (index >= items.length || item === undefined) return;
      try {
        results[index] = { ok: true, value: await work(item, index) };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
};

/** The values that came back, in order, dropping the failures. */
export const fulfilled = <T>(results: readonly Settled<T>[]): T[] =>
  results.flatMap((result) => (result.ok ? [result.value] : []));

/** One line per failure, for the run log. */
export const failures = <T>(results: readonly Settled<T>[], label: (index: number) => string): string[] =>
  results.flatMap((result, index) =>
    result.ok ? [] : [`${label(index)}: ${result.error instanceof Error ? result.error.message : String(result.error)}`],
  );
