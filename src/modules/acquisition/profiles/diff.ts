import "server-only";

/**
 * Structured, human-readable diff between two service-line profiles. Phase 18 uses this in
 * the version-history screen to show what changed between two published versions.
 *
 * The diff is field-level: for each top-level profile section, we return added, removed and
 * modified items keyed by their `id` where applicable (signals, disqualifiers, portfolio,
 * scoring rules, pitch angles per market, sequences per market, pricing packages).
 */

import type { ServiceLineProfile } from "@/contracts/service-line-profile";

export interface ProfileDiffEntry {
  path: string;
  kind: "added" | "removed" | "modified";
  before?: unknown;
  after?: unknown;
}

export interface ProfileDiff {
  entries: ProfileDiffEntry[];
  hasChanges: boolean;
}

function diffKeyedList<T extends { id: string }>(
  path: string,
  before: readonly T[],
  after: readonly T[],
): ProfileDiffEntry[] {
  const beforeMap = new Map(before.map((it) => [it.id, it]));
  const afterMap = new Map(after.map((it) => [it.id, it]));
  const out: ProfileDiffEntry[] = [];
  for (const [id, item] of beforeMap) {
    if (!afterMap.has(id)) out.push({ path: `${path}.${id}`, kind: "removed", before: item });
  }
  for (const [id, item] of afterMap) {
    if (!beforeMap.has(id)) {
      out.push({ path: `${path}.${id}`, kind: "added", after: item });
    } else if (JSON.stringify(beforeMap.get(id)) !== JSON.stringify(item)) {
      out.push({
        path: `${path}.${id}`,
        kind: "modified",
        before: beforeMap.get(id),
        after: item,
      });
    }
  }
  return out;
}

function diffScalar(path: string, before: unknown, after: unknown): ProfileDiffEntry | null {
  if (JSON.stringify(before) === JSON.stringify(after)) return null;
  return { path, kind: "modified", before, after };
}

export function diffProfiles(a: ServiceLineProfile, b: ServiceLineProfile): ProfileDiff {
  const entries: ProfileDiffEntry[] = [];

  // Scalars / small blocks
  for (const key of ["label", "description", "approvalMode", "autoSendMinScore"] as const) {
    const d = diffScalar(key, a[key], b[key]);
    if (d) entries.push(d);
  }
  const ownersDiff = diffScalar("owners", a.owners, b.owners);
  if (ownersDiff) entries.push(ownersDiff);
  const contactPriorityDiff = diffScalar("contactRolePriority", a.contactRolePriority, b.contactRolePriority);
  if (contactPriorityDiff) entries.push(contactPriorityDiff);
  const capacityDiff = diffScalar("capacityPolicy", a.capacityPolicy, b.capacityPolicy);
  if (capacityDiff) entries.push(capacityDiff);
  const scoringBaseDiff = diffScalar(
    "scoring.thresholds",
    {
      qualifyThreshold: a.scoring.qualifyThreshold,
      borderlineBand: a.scoring.borderlineBand,
      lowScoreAction: a.scoring.lowScoreAction,
    },
    {
      qualifyThreshold: b.scoring.qualifyThreshold,
      borderlineBand: b.scoring.borderlineBand,
      lowScoreAction: b.scoring.lowScoreAction,
    },
  );
  if (scoringBaseDiff) entries.push(scoringBaseDiff);

  // Keyed lists
  entries.push(...diffKeyedList("signals", a.signals, b.signals));
  entries.push(...diffKeyedList("disqualifiers", a.disqualifiers, b.disqualifiers));
  entries.push(...diffKeyedList("portfolio", a.portfolio, b.portfolio));
  entries.push(...diffKeyedList("scoring.rules", a.scoring.rules, b.scoring.rules));
  entries.push(
    ...diffKeyedList(
      "pricing.packages",
      a.pricing.packages,
      b.pricing.packages,
    ),
  );
  entries.push(
    ...diffKeyedList("pitchAngles.NIGERIA", a.pitchAngles.NIGERIA, b.pitchAngles.NIGERIA),
  );
  entries.push(
    ...diffKeyedList(
      "pitchAngles.INTERNATIONAL",
      a.pitchAngles.INTERNATIONAL,
      b.pitchAngles.INTERNATIONAL,
    ),
  );
  entries.push(
    ...diffKeyedList("sequences.NIGERIA", a.sequences.NIGERIA, b.sequences.NIGERIA),
  );
  entries.push(
    ...diffKeyedList(
      "sequences.INTERNATIONAL",
      a.sequences.INTERNATIONAL,
      b.sequences.INTERNATIONAL,
    ),
  );

  // Sources — no `id`, so key on adapterId
  entries.push(
    ...diffKeyedList(
      "sources",
      a.sources.map((s) => ({ id: s.adapterId, ...s })),
      b.sources.map((s) => ({ id: s.adapterId, ...s })),
    ),
  );

  // Audits — key on agentId
  entries.push(
    ...diffKeyedList(
      "audits",
      a.audits.map((au) => ({ id: au.agentId, ...au })),
      b.audits.map((au) => ({ id: au.agentId, ...au })),
    ),
  );

  return { entries, hasChanges: entries.length > 0 };
}
