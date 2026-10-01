import type { RawSignal } from "@/contracts/source-adapter";

/**
 * An empty result stream, for adapters whose data arrives through a service rather than a provider
 * search (csv-import, manual) and for disabled adapters with no compliant data source (jobberman).
 * Written without an async generator so it needs no `yield`/`await` placeholder.
 */
export function emptyResults(): AsyncIterable<RawSignal> {
  return {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<RawSignal>> {
          return Promise.resolve({ value: undefined as unknown as RawSignal, done: true });
        },
      };
    },
  };
}
