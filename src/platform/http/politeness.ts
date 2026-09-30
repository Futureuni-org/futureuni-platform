/**
 * Politeness: per-origin serialisation with a minimum delay (`docs/contracts/enrichment.md` §3
 * rule 3). Also a global concurrency cap so a runaway crawl can't saturate the fetcher.
 */

import "server-only";

interface OriginState {
  chain: Promise<void>;
  lastCompletedAt: number;
}

const origins = new Map<string, OriginState>();

let minDelayMs = 1000;
let globalMax = 8;
let inFlight = 0;
const globalQueue: (() => void)[] = [];

/** Test-only: reconfigure the politeness knobs. */
export function configurePoliteness(opts?: { minDelayMs?: number; globalMax?: number }): void {
  minDelayMs = opts?.minDelayMs ?? 1000;
  globalMax = opts?.globalMax ?? 8;
}

/** Test-only: wipe queued state. */
export function _resetPoliteness(): void {
  origins.clear();
  globalQueue.splice(0, globalQueue.length);
  inFlight = 0;
}

async function acquireGlobal(): Promise<void> {
  if (inFlight < globalMax) {
    inFlight += 1;
    return;
  }
  await new Promise<void>((resolve) => {
    globalQueue.push(() => {
      inFlight += 1;
      resolve();
    });
  });
}

function releaseGlobal(): void {
  inFlight -= 1;
  const next = globalQueue.shift();
  if (next !== undefined) next();
}

/**
 * Run `fn` under the origin's serial lock and the global cap. `fn` starts no earlier than
 * `lastCompletedAt + minDelayMs` for its origin.
 */
export async function withPoliteness<T>(origin: string, fn: () => Promise<T>): Promise<T> {
  const prior = origins.get(origin) ?? { chain: Promise.resolve(), lastCompletedAt: 0 };
  let resolveChain: () => void = () => undefined;
  const newChain = new Promise<void>((resolve) => {
    resolveChain = resolve;
  });
  origins.set(origin, { chain: newChain, lastCompletedAt: prior.lastCompletedAt });

  await prior.chain;
  await acquireGlobal();
  try {
    const wait = prior.lastCompletedAt + minDelayMs - Date.now();
    if (wait > 0) await sleep(wait);
    const value = await fn();
    origins.set(origin, { chain: newChain, lastCompletedAt: Date.now() });
    return value;
  } finally {
    releaseGlobal();
    resolveChain();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
