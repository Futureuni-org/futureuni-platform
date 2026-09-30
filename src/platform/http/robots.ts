/**
 * `robots.txt` parsing and per-origin cache (Phase 9, `docs/contracts/enrichment.md` §3 rule 2).
 *
 * Only the standard subset is honoured (`User-agent`, `Disallow`, `Allow`); wildcards `*` and `$`
 * in paths are supported. The cache is in-memory with a 24 h TTL. Fetch failures cache a
 * permissive result (empty rules) for 1 h so a broken robots.txt doesn't stop a crawl.
 */

import "server-only";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 60 * 60 * 1000;

interface RobotsRule {
  allow: boolean;
  pattern: string;
}

interface OriginRules {
  fetchedAt: number;
  rulesByUa: Map<string, RobotsRule[]>;
}

const cache = new Map<string, OriginRules>();

export function _resetRobotsCache(): void {
  cache.clear();
}

export type RobotsFetcher = (robotsUrl: string) => Promise<{ ok: boolean; status: number; body: string | null }>;

/** Default fetcher used when the caller doesn't inject one. `safe-fetch.ts` swaps in `safeFetch`. */
let defaultFetcher: RobotsFetcher = async (url) => {
  const response = await fetch(url, { method: "GET" });
  const body = response.ok && response.headers.get("content-type")?.includes("text") !== false
    ? await response.text()
    : null;
  return { ok: response.ok, status: response.status, body };
};

/** Test-only: inject a fetcher (used by `safe-fetch.ts` to route through the safe pipeline). */
export function setRobotsFetcher(fetcher: RobotsFetcher): void {
  defaultFetcher = fetcher;
}

export interface EvaluateRobotsInput {
  url: string;
  userAgent: string;
  fetcher?: RobotsFetcher;
  now?: number;
}

/** Public API: returns true when the given URL is allowed for `userAgent`. */
export async function isAllowedByRobots(url: string, userAgent = "FUTUREUNI-Bot/1.0"): Promise<boolean> {
  return evaluate({ url, userAgent });
}

/** Test seam: same as above but injectable. */
export async function evaluate({ url, userAgent, fetcher, now }: EvaluateRobotsInput): Promise<boolean> {
  const parsed = new URL(url);
  const origin = `${parsed.protocol}//${parsed.host}`;
  const rules = await load(origin, fetcher ?? defaultFetcher, now ?? Date.now());
  return isPathAllowed(parsed.pathname + parsed.search, rules, userAgent);
}

async function load(origin: string, fetcher: RobotsFetcher, now: number): Promise<Map<string, RobotsRule[]>> {
  const cached = cache.get(origin);
  if (cached !== undefined && now - cached.fetchedAt < CACHE_TTL_MS) return cached.rulesByUa;

  const robotsUrl = `${origin}/robots.txt`;
  let rulesByUa: Map<string, RobotsRule[]>;
  let ttl = CACHE_TTL_MS;
  try {
    const response = await fetcher(robotsUrl);
    if (response.ok && response.body !== null) {
      rulesByUa = parse(response.body);
    } else {
      rulesByUa = new Map();
      ttl = NEGATIVE_CACHE_TTL_MS;
    }
  } catch {
    rulesByUa = new Map();
    ttl = NEGATIVE_CACHE_TTL_MS;
  }

  cache.set(origin, { fetchedAt: now - (CACHE_TTL_MS - ttl), rulesByUa });
  return rulesByUa;
}

/** Parse a robots.txt into rules grouped by lowercase user-agent. Everything else is ignored. */
export function parse(body: string): Map<string, RobotsRule[]> {
  const result = new Map<string, RobotsRule[]>();
  let currentAgents: string[] = [];
  let expectAgents = true;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (line === "") {
      expectAgents = true;
      continue;
    }
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === "user-agent") {
      if (expectAgents) {
        currentAgents = [value.toLowerCase()];
        expectAgents = false;
      } else {
        currentAgents.push(value.toLowerCase());
      }
      for (const agent of currentAgents) if (!result.has(agent)) result.set(agent, []);
    } else if (field === "allow" || field === "disallow") {
      expectAgents = false;
      for (const agent of currentAgents) {
        const list = result.get(agent) ?? [];
        list.push({ allow: field === "allow", pattern: value });
        result.set(agent, list);
      }
    }
  }
  return result;
}

/** Match a request path against the parsed rules. */
export function isPathAllowed(path: string, rulesByUa: Map<string, RobotsRule[]>, userAgent: string): boolean {
  const uaLower = userAgent.toLowerCase();
  // The most specific matching agent group wins; fall back to '*'.
  let group: RobotsRule[] | undefined;
  for (const [agent, rules] of rulesByUa) {
    if (agent === "*") continue;
    if (uaLower.includes(agent)) {
      group = rules;
      break;
    }
  }
  group ??= rulesByUa.get("*");
  if (group === undefined || group.length === 0) return true;

  // Longest matching pattern wins; Allow beats Disallow on ties (Google-compatible).
  let best: RobotsRule | null = null;
  for (const rule of group) {
    if (matches(rule.pattern, path)) {
      if (
        best === null ||
        rule.pattern.length > best.pattern.length ||
        (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
      ) {
        best = rule;
      }
    }
  }
  if (best === null) return true;
  return best.allow;
}

function matches(pattern: string, path: string): boolean {
  if (pattern === "") return false; // "Disallow:" empty means allow all
  // Translate the wildcard mini-language: `*` = any-chars, `$` at the end = end-of-path anchor.
  const anchored = pattern.endsWith("$");
  const literal = anchored ? pattern.slice(0, -1) : pattern;
  const parts = literal.split("*");
  let cursor = 0;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (part === undefined || part === "") {
      if (i === 0) continue;
      if (i === parts.length - 1) continue;
      continue;
    }
    const idx = path.indexOf(part, cursor);
    if (idx < 0) return false;
    if (i === 0 && idx !== 0) return false;
    cursor = idx + part.length;
  }
  if (anchored) {
    const lastPart = parts[parts.length - 1] ?? "";
    if (!path.endsWith(lastPart)) return false;
  }
  return true;
}
