import "server-only";

/**
 * A small JSON HTTP client for sourcing's official provider APIs (Google Places, SerpAPI, Adzuna,
 * YouTube, iTunes). These are fixed, first-party API hosts, not arbitrary web pages, so they don't
 * go through `safeFetch` (which is for robots-checked page crawling, SEAM-SAFE-FETCH). It applies
 * the saas-api outbound rules: a timeout, and retries with exponential backoff + jitter on 429 and
 * 5xx only, honouring `Retry-After`; 4xx validation errors are never retried (source-adapter.md
 * rule 9). Uses the global `fetch`, so tests intercept it with MSW (no real network in tests).
 */

export interface FetchJsonOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  /** Cancels the request (the run's AbortSignal). */
  signal?: AbortSignal;
  timeoutMs?: number;
  retry?: { maxAttempts?: number; baseDelayMs?: number; maxDelayMs?: number };
  /** Injectable sleep for deterministic tests. */
  sleep?: (ms: number) => Promise<void>;
}

export interface JsonResponse<T> {
  ok: boolean;
  status: number;
  data: T | null;
  /** True when the request failed after exhausting retries (network error or persistent 5xx/429). */
  exhausted: boolean;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function retryAfterMs(headerValue: string | null): number | null {
  if (headerValue === null) return null;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(headerValue);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

function backoffMs(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  return Math.floor(exp / 2 + Math.random() * (exp / 2)); // full-ish jitter
}

export async function fetchJson<T>(
  url: string,
  options: FetchJsonOptions = {},
): Promise<JsonResponse<T>> {
  const maxAttempts = options.retry?.maxAttempts ?? 3;
  const baseDelayMs = options.retry?.baseDelayMs ?? 500;
  const maxDelayMs = options.retry?.maxDelayMs ?? 8_000;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const sleep = options.sleep ?? defaultSleep;

  let lastStatus = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const onAbort = (): void => {
      controller.abort();
    };
    if (options.signal !== undefined) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener("abort", onAbort, { once: true });
    }
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          accept: "application/json",
          ...(options.body === undefined ? {} : { "content-type": "application/json" }),
          ...options.headers,
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        signal: controller.signal,
      });
      lastStatus = response.status;

      if (response.status === 429 || response.status >= 500) {
        if (attempt < maxAttempts) {
          const wait = retryAfterMs(response.headers.get("retry-after")) ?? backoffMs(attempt, baseDelayMs, maxDelayMs);
          await sleep(wait);
          continue;
        }
        return { ok: false, status: response.status, data: null, exhausted: true };
      }
      if (!response.ok) {
        // A non-retryable 4xx (bad request, unauthorised, not found).
        return { ok: false, status: response.status, data: null, exhausted: false };
      }
      const data = (await response.json()) as T;
      return { ok: true, status: response.status, data, exhausted: false };
    } catch {
      // Network error or timeout: retry if attempts remain, else give up.
      if (options.signal?.aborted === true) {
        return { ok: false, status: lastStatus, data: null, exhausted: true };
      }
      if (attempt < maxAttempts) {
        await sleep(backoffMs(attempt, baseDelayMs, maxDelayMs));
        continue;
      }
      return { ok: false, status: lastStatus, data: null, exhausted: true };
    } finally {
      clearTimeout(timer);
      if (options.signal !== undefined) options.signal.removeEventListener("abort", onAbort);
    }
  }
  return { ok: false, status: lastStatus, data: null, exhausted: true };
}
