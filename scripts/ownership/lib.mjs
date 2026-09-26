// Ownership map logic shared by guard.mjs (the Claude Code hook), check.mjs (CI) and tests.
// Plain Node, no dependencies. Paths are repository-relative with forward slashes.

import { readFileSync } from "node:fs";

/** Reads and minimally validates scripts/ownership/ownership.json. */
export function loadOwnershipMap(file) {
  const map = JSON.parse(readFileSync(file, "utf8"));
  if (
    typeof map !== "object" ||
    map === null ||
    typeof map.phases !== "object" ||
    map.phases === null
  ) {
    throw new Error(`${file}: expected an object with "phases"`);
  }
  if (!Array.isArray(map.alwaysAllowed))
    throw new Error(`${file}: "alwaysAllowed" must be an array`);
  for (const [phase, entry] of Object.entries(map.phases)) {
    if (!/^\d{2}$/.test(phase)) throw new Error(`${file}: phase key "${phase}" must be two digits`);
    if (!Array.isArray(entry.owns) || !Array.isArray(entry.alsoAllow)) {
      throw new Error(`${file}: phase ${phase} needs "owns" and "alsoAllow" arrays`);
    }
  }
  return map;
}

const regexCache = new Map();

/**
 * Glob to RegExp. `**` matches any number of path segments (including none), `*` matches
 * within one segment. Every other character is literal, including ( ) [ ] and dots.
 */
export function globToRegExp(pattern) {
  const cached = regexCache.get(pattern);
  if (cached !== undefined) return cached;
  let source = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        const atSegmentEnd = pattern[i + 2] === "/";
        // "**/" matches zero or more whole segments; a trailing "**" matches everything below.
        source += atSegmentEnd ? "(?:.*/)?" : ".*";
        i += atSegmentEnd ? 2 : 1;
      } else {
        source += "[^/]*";
      }
    } else {
      source += char.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  const regex = new RegExp(`^${source}$`);
  regexCache.set(pattern, regex);
  return regex;
}

export function matchesGlob(path, pattern) {
  return globToRegExp(pattern).test(path);
}

/**
 * How specific a pattern is: an exact path beats any glob; otherwise the longer literal
 * prefix (before the first `*`) wins, then the longer pattern.
 */
export function specificity(pattern) {
  const firstWildcard = pattern.indexOf("*");
  const exact = firstWildcard === -1;
  return [exact ? 1 : 0, exact ? pattern.length : firstWildcard, pattern.length];
}

function compareSpecificity(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/** The owning phase of a path: the phase whose most specific `owns` pattern matches it. */
export function ownerOf(path, map) {
  let best;
  for (const [phase, entry] of Object.entries(map.phases)) {
    for (const pattern of entry.owns) {
      if (!matchesGlob(path, pattern)) continue;
      const rank = specificity(pattern);
      if (best === undefined || compareSpecificity(rank, best.rank) > 0)
        best = { phase, pattern, rank };
    }
  }
  return best === undefined ? undefined : { phase: best.phase, pattern: best.pattern };
}

/** Can `phase` edit `path`? */
export function decide({ path, phase, map }) {
  const always = map.alwaysAllowed.map((pattern) => pattern.replaceAll("{phase}", phase));
  if (always.some((pattern) => matchesGlob(path, pattern)))
    return { allowed: true, reason: "always-allowed" };

  const owner = ownerOf(path, map);
  if (owner?.phase === phase) return { allowed: true, reason: "owned", owner: owner.phase };

  const grants = map.phases[phase]?.alsoAllow ?? [];
  if (grants.some((pattern) => matchesGlob(path, pattern))) {
    return { allowed: true, reason: "granted", owner: owner?.phase ?? null };
  }
  return {
    allowed: false,
    reason: owner === undefined ? "unowned" : "owned-by-another",
    owner: owner?.phase ?? null,
  };
}

/** The block message shown to Claude (and the phase) when a write is refused. */
export function denialMessage(phase, path, owner) {
  const ownerText = owner === null ? "none" : `Phase ${owner}`;
  return `Phase ${phase} does not own ${path} (owner: ${ownerText}). Write the change you need to phases/${phase}/REQUESTS.md instead.`;
}

/** The phase number from a branch name such as "phase/05-ai-service", or null. */
export function phaseFromBranch(branch) {
  const match = /^phase\/(\d{2})-[a-z0-9][a-z0-9-]*$/.exec(branch ?? "");
  return match === null ? null : match[1];
}

/** Patterns listed in `owns` by more than one phase: each path must have exactly one owner. */
export function findDuplicateOwners(map) {
  const owners = new Map();
  for (const [phase, entry] of Object.entries(map.phases)) {
    for (const pattern of entry.owns) {
      const list = owners.get(pattern) ?? [];
      list.push(phase);
      owners.set(pattern, list);
    }
  }
  return [...owners.entries()]
    .filter(([, phases]) => phases.length > 1)
    .map(([pattern, phases]) => ({ pattern, phases }));
}

const TABLE_ALIASES = { "A/": "src/app/(platform)/acquisition/", "M/": "src/modules/acquisition/" };

/**
 * The `owns` paths per phase from the CLAUDE.md "Ownership map" table (the first table after
 * that heading), with the A/ and M/ shorthands expanded.
 */
export function parseClaudeOwnershipTable(markdown) {
  const start = markdown.indexOf("## Ownership map");
  if (start === -1) throw new Error("CLAUDE.md has no '## Ownership map' section");
  const lines = markdown.slice(start).split(/\r?\n/);
  const result = {};
  let inTable = false;
  for (const line of lines) {
    const row = /^\|\s*(\d{1,2})\s*\|(.*)\|\s*$/.exec(line);
    if (row === null) {
      if (inTable) break;
      continue;
    }
    inTable = true;
    const phase = row[1].padStart(2, "0");
    // Backticked tokens that look like paths (prose such as `main` in a note is skipped).
    const paths = [...row[2].matchAll(/`([^`]+)`/g)]
      .map((match) => match[1])
      .filter((token) => /[./*]/.test(token));
    result[phase] = paths.map((path) => {
      for (const [alias, full] of Object.entries(TABLE_ALIASES)) {
        if (path.startsWith(alias)) return full + path.slice(alias.length);
      }
      return path;
    });
  }
  return result;
}

/** Differences between the CLAUDE.md table and the JSON map, per phase. */
export function compareWithClaudeTable(map, table) {
  const differences = [];
  const phases = new Set([...Object.keys(map.phases), ...Object.keys(table)]);
  for (const phase of [...phases].sort()) {
    const inJson = new Set(map.phases[phase]?.owns ?? []);
    const inTable = new Set(table[phase] ?? []);
    for (const pattern of inJson)
      if (!inTable.has(pattern)) differences.push({ phase, pattern, missingFrom: "CLAUDE.md" });
    for (const pattern of inTable)
      if (!inJson.has(pattern)) differences.push({ phase, pattern, missingFrom: "ownership.json" });
  }
  return differences;
}

/**
 * The folder a pattern owns outright ("src/platform/ai/**" → "src/platform/ai"), or null for
 * files and per-task globs such as "runtime-skills/acquisition/profile-*\/**". Owned folders
 * get a skeleton README.md.
 */
export function folderOf(pattern) {
  const match = /^([^*]+)\/\*\*$/.exec(pattern);
  return match === null ? null : match[1];
}
