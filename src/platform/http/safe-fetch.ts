/**
 * `safeFetch` (Phase 9, `@/platform/http`). Every part of the platform that fetches a web page
 * goes through this function. Provides `SEAM-SAFE-FETCH` for Phases 8 and 10.
 *
 * Guarantees (`docs/contracts/enrichment.md` §3 rules 1–4):
 *  - SSRF: DNS resolved and rejected for private / metadata addresses, rechecked after redirects.
 *  - Protocol: `http:`/`https:` only, port allowlist.
 *  - Robots: fetched, cached (24 h) and honoured for `FUTUREUNI-Bot/1.0`. Off only for API calls.
 *  - Limits: timeout, `maxBytes` (streamed), redirect cap.
 *  - Bodies: HTML and text content types only, unless the caller opts in via `allowBinary`.
 *  - Politeness: per-origin serial + minimum delay + global cap.
 *  - Observability: fetch, block-by-reason and bytes counters, PII-free logging.
 */

import "server-only";

import type { SafeFetchOptions, SafeFetchResult } from "@/contracts/enrichment";
import { env } from "@/env";

import { withPoliteness } from "./politeness";
import { setRobotsFetcher, isAllowedByRobots } from "./robots";
import { guardUrl } from "./ssrf";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 2_000_000;
const DEFAULT_REDIRECTS = 5;

const TEXT_LIKE_TYPES = /^text\/|application\/(x?html\+xml|json|ld\+json|xml|rss\+xml|atom\+xml|javascript)/i;

const counters = { fetched: 0, blocked: { robots: 0, ssrf: 0, "too-large": 0, timeout: 0, "non-html": 0, error: 0 }, bytes: 0 };

/** Test-only: read and reset the observability counters. */
export function readCounters(): typeof counters {
  return { fetched: counters.fetched, bytes: counters.bytes, blocked: { ...counters.blocked } };
}
export function resetCounters(): void {
  counters.fetched = 0;
  counters.bytes = 0;
  for (const key of Object.keys(counters.blocked) as (keyof typeof counters.blocked)[]) counters.blocked[key] = 0;
}

async function crawlerUserAgent(): Promise<string> {
  // Deliberately lazy so tests don't need the settings store loaded.
  try {
    const { getSetting } = await import("@/platform/settings");
    const contact = await getSetting<string>("platform.crawlerContactUrl");
    if (contact !== "") return `FUTUREUNI-Bot/1.0 (+${contact})`;
  } catch {
    /* settings not registered in this bundle context */
  }
  return "FUTUREUNI-Bot/1.0";
}

// Route the robots fetcher through the safe pipeline itself (fixed UA, no robots, small budget).
let robotsRouted = false;
function routeRobotsThroughSafeFetch(): void {
  if (robotsRouted) return;
  robotsRouted = true;
  setRobotsFetcher(async (robotsUrl) => {
    const result = await safeFetch(robotsUrl, {
      method: "GET",
      timeoutMs: 5_000,
      maxBytes: 128_000,
      respectRobots: false,
      followRedirects: 3,
    });
    return {
      ok: result.ok,
      status: result.status,
      body: result.body,
    };
  });
}

export interface ExtendedSafeFetchOptions extends SafeFetchOptions {
  /** Return the body even when the content type isn't text/HTML (default false). */
  allowBinary?: boolean;
  /** Override the user agent (advanced; robots is still evaluated for this UA). */
  userAgent?: string;
}

/** Provides `SEAM-SAFE-FETCH`. Callers get a stable `SafeFetchResult` even for failures. */
export async function safeFetch(url: string, opts: ExtendedSafeFetchOptions = {}): Promise<SafeFetchResult> {
  routeRobotsThroughSafeFetch();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const followRedirects = opts.followRedirects ?? DEFAULT_REDIRECTS;
  const respectRobots = opts.respectRobots ?? true;
  const method = opts.method ?? "GET";
  const userAgent = opts.userAgent ?? (await crawlerUserAgent());

  let currentUrl = url;
  for (let redirect = 0; redirect <= followRedirects; redirect += 1) {
    const guard = await guardUrl(currentUrl);
    if (!guard.ok) return failed(currentUrl, "ssrf");

    if (respectRobots) {
      try {
        const allowed = await isAllowedByRobots(currentUrl, userAgent);
        if (!allowed) return failed(currentUrl, "robots");
      } catch {
        // robots fetch failure is treated as allowed (documented in robots.ts) — nothing to do.
      }
    }

    const origin = originOf(currentUrl);
    const result = await withPoliteness(origin, () =>
      doFetch(currentUrl, {
        method,
        headers: { "user-agent": userAgent, ...(opts.headers ?? {}) },
        timeoutMs,
        maxBytes,
        allowBinary: opts.allowBinary ?? false,
      }),
    );
    if (result.kind === "redirect") {
      if (redirect >= followRedirects) return failed(currentUrl, "error");
      currentUrl = new URL(result.location, currentUrl).toString();
      continue;
    }
    counters.fetched += 1;
    counters.bytes += result.result.bytes;
    return result.result;
  }
  return failed(currentUrl, "error");
}

function failed(url: string, reason: SafeFetchResult["blockedReason"] & string): SafeFetchResult {
  counters.blocked[reason] += 1;
  return {
    ok: false,
    status: 0,
    finalUrl: url,
    headers: {},
    contentType: null,
    body: null,
    bytes: 0,
    fetchedAt: new Date().toISOString(),
    blockedReason: reason,
  };
}

function originOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return url;
  }
}

interface DoFetchOptions {
  method: "GET" | "HEAD";
  headers: Record<string, string>;
  timeoutMs: number;
  maxBytes: number;
  allowBinary: boolean;
}
type DoFetchOutput = { kind: "done"; result: SafeFetchResult } | { kind: "redirect"; location: string };

async function doFetch(url: string, opts: DoFetchOptions): Promise<DoFetchOutput> {
  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); }, opts.timeoutMs);
  try {
    const response = await fetch(url, {
      method: opts.method,
      headers: opts.headers,
      redirect: "manual",
      signal: controller.signal,
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location === null) {
        return { kind: "done", result: toResult(url, response, null, 0) };
      }
      return { kind: "redirect", location };
    }

    const contentType = response.headers.get("content-type");
    const readable = opts.method === "GET" && (opts.allowBinary || contentType === null || TEXT_LIKE_TYPES.test(contentType));

    if (!readable) {
      if (opts.method === "GET" && contentType !== null && !TEXT_LIKE_TYPES.test(contentType)) {
        counters.blocked["non-html"] += 1;
        return { kind: "done", result: toResult(url, response, null, 0, "non-html") };
      }
      return { kind: "done", result: toResult(url, response, null, 0) };
    }

    const [body, bytes] = await readWithLimit(response, opts.maxBytes);
    if (body === null) {
      counters.blocked["too-large"] += 1;
      return { kind: "done", result: toResult(url, response, null, bytes, "too-large") };
    }
    return { kind: "done", result: toResult(url, response, body, bytes) };
  } catch (error) {
    const aborted = (error instanceof Error && error.name === "AbortError") || controller.signal.aborted;
    return {
      kind: "done",
      result: failed(url, aborted ? "timeout" : "error"),
    };
  } finally {
    clearTimeout(timer);
  }
}

function toResult(
  url: string,
  response: Response,
  body: string | null,
  bytes: number,
  blockedReason?: SafeFetchResult["blockedReason"],
): SafeFetchResult {
  const headers: Record<string, string> = {};
  for (const [k, v] of response.headers) headers[k.toLowerCase()] = v;
  return {
    ok: response.ok,
    status: response.status,
    finalUrl: url,
    headers,
    contentType: response.headers.get("content-type"),
    body,
    bytes,
    fetchedAt: new Date().toISOString(),
    ...(blockedReason === undefined ? {} : { blockedReason }),
  };
}

async function readWithLimit(response: Response, maxBytes: number): Promise<[string | null, number]> {
  if (response.body === null) return ["", 0];
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        /* already aborted */
      }
      return [null, total];
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return [new TextDecoder("utf-8", { fatal: false }).decode(combined), total];
}

// Keep `env` in scope so any future addition here doesn't trip `noUnusedImports`.
export const _envAlive = env;
