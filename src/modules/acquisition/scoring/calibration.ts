import "server-only";

/**
 * Calibration data (phase-11 Step 7): score bands against outcomes (replied, meeting, won, lost) plus
 * override counts, so Phase 17 can chart it and the team can tune the profile's rules.
 */

import type { ScoreBand, ServiceLine } from "@/contracts/common";

import {
  findOutcomeStatuses,
  findOverriddenLeadIds,
  findScoredLeadsInRange,
} from "./calibration.repo";

export interface CalibrationBucket {
  band: ScoreBand;
  scored: number;
  replied: number;
  meeting: number;
  won: number;
  lost: number;
  overrides: number;
}

export interface ScoreCalibration {
  line: ServiceLine;
  from: string;
  to: string;
  buckets: CalibrationBucket[];
}

const BANDS: ScoreBand[] = ["QUALIFIED", "BORDERLINE", "BELOW"];

export async function getScoreCalibrationData(args: {
  line: ServiceLine;
  from: Date;
  to: Date;
}): Promise<ScoreCalibration> {
  const leads = await findScoredLeadsInRange(args.line, args.from, args.to);
  const leadIds = leads.map((l) => l.id);
  const [outcomes, overriddenIds] = await Promise.all([
    findOutcomeStatuses(leadIds),
    findOverriddenLeadIds(leadIds),
  ]);

  const reached = new Map<string, Set<string>>();
  for (const o of outcomes) {
    const set = reached.get(o.leadId) ?? new Set<string>();
    set.add(o.toStatus);
    reached.set(o.leadId, set);
  }
  const overridden = new Set(overriddenIds);

  const emptyBucket = (band: ScoreBand): CalibrationBucket => ({
    band,
    scored: 0,
    replied: 0,
    meeting: 0,
    won: 0,
    lost: 0,
    overrides: 0,
  });
  const byBand: Record<ScoreBand, CalibrationBucket> = {
    QUALIFIED: emptyBucket("QUALIFIED"),
    BORDERLINE: emptyBucket("BORDERLINE"),
    BELOW: emptyBucket("BELOW"),
  };

  for (const lead of leads) {
    const b = byBand[lead.scoreBand ?? "BELOW"];
    b.scored += 1;
    const r = reached.get(lead.id);
    if (r?.has("REPLIED")) b.replied += 1;
    if (r?.has("MEETING_BOOKED")) b.meeting += 1;
    if (r?.has("WON")) b.won += 1;
    if (r?.has("LOST")) b.lost += 1;
    if (overridden.has(lead.id)) b.overrides += 1;
  }

  return {
    line: args.line,
    from: args.from.toISOString(),
    to: args.to.toISOString(),
    buckets: BANDS.map((band) => byBand[band]),
  };
}
