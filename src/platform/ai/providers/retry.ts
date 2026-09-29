import "server-only";

/**
 * Exponential-backoff retry helper for provider calls. Retries on 429, 5xx and Anthropic
 * "overload" errors, respecting the response's Retry-After header when present.
 */

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default 4. */
  maxAttempts?: number;
  /** Base delay in ms. Default 300. */
  baseDelayMs?: number;
  /** Cap on delay in ms. Default 15_000. */
  capDelayMs?: number;
  /** ±jitter fraction. Default 0.2. */
  jitter?: number;
  /** Injectable sleep for tests. Default is real setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULTS: Required<Omit<RetryOptions, "sleep">> = {
  maxAttempts: 4,
  baseDelayMs: 300,
  capDelayMs: 15_000,
  jitter: 0.2,
};

export interface RetryableError {
  /** HTTP status when known. */
  status?: number;
  /** Anthropic error type when known. */
  errorType?: string;
  /** Value of the Retry-After header in seconds, when present. */
  retryAfterMs?: number;
}

export function classify(err: unknown): RetryableError | null {
  if (typeof err !== "object" || err === null) return null;
  const e = err as { status?: number; error?: { type?: string }; headers?: Record<string, string> };
  const status = typeof e.status === "number" ? e.status : undefined;
  const errorType = e.error?.type;
  const retryAfter = e.headers?.["retry-after"];
  const retryAfterMs =
    retryAfter !== undefined && retryAfter !== ""
      ? Math.max(0, Math.round(Number.parseFloat(retryAfter) * 1000))
      : undefined;

  const isRetryable =
    (typeof status === "number" && (status === 429 || (status >= 500 && status < 600))) ||
    errorType === "overloaded_error";
  if (!isRetryable) return null;
  return {
    ...(status === undefined ? {} : { status }),
    ...(errorType === undefined ? {} : { errorType }),
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  };
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const cfg = { ...DEFAULTS, ...opts };
  const sleep = opts.sleep ?? defaultSleep;
  let lastError: unknown;

  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const retryable = classify(err);
      if (retryable === null || attempt === cfg.maxAttempts) throw err;

      let delay =
        retryable.retryAfterMs ??
        Math.min(cfg.capDelayMs, cfg.baseDelayMs * 2 ** (attempt - 1));
      const jitterAmount = delay * cfg.jitter * (Math.random() * 2 - 1);
      delay = Math.max(0, Math.round(delay + jitterAmount));
      await sleep(delay);
    }
  }
  // Wrap non-Error throws so eslint's only-throw-error is satisfied.
  if (lastError instanceof Error) throw lastError;
  throw new Error(`withRetry: ${String(lastError)}`);
}
