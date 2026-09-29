import "server-only";

/**
 * Per-provider circuit breaker. Opens after N consecutive failures; one probe is admitted
 * in half-open state; a probe success closes the breaker, a failure keeps it open for
 * another window. Callers see AI_PROVIDER_ERROR with an `open: true` marker when the
 * breaker is open.
 */

import { aiProviderError } from "../errors";
import type { ProviderKind } from "./provider";

interface BreakerState {
  failures: number;
  openedAt: number | null;
}

const state = new Map<ProviderKind, BreakerState>();

const FAILURE_THRESHOLD = 5;
const OPEN_WINDOW_MS = 60_000;

function getState(kind: ProviderKind): BreakerState {
  let s = state.get(kind);
  if (!s) {
    s = { failures: 0, openedAt: null };
    state.set(kind, s);
  }
  return s;
}

export function assertClosed(kind: ProviderKind, now: number = Date.now()): void {
  const s = getState(kind);
  if (s.openedAt === null) return;
  if (now - s.openedAt < OPEN_WINDOW_MS) {
    throw aiProviderError({ open: true, provider: kind });
  }
  // Half-open: admit one probe (this call). The next success/failure decides state.
}

export function recordSuccess(kind: ProviderKind): void {
  const s = getState(kind);
  s.failures = 0;
  s.openedAt = null;
}

export function recordFailure(kind: ProviderKind, now: number = Date.now()): void {
  const s = getState(kind);
  s.failures += 1;
  if (s.failures >= FAILURE_THRESHOLD) s.openedAt = now;
}

/** For tests. */
export function __resetBreakersForTests(): void {
  state.clear();
}
