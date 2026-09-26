/**
 * The whole development dataset, built in memory from the curated fixtures (data-model §10). It's
 * pure: no database, fixed ids, timestamps relative to `now`. The seeders write it; world.test.ts
 * checks it against the seed plan, the contracts and the database invariants.
 */

import { buildAudits, type AuditsWorld } from "./audits";
import { buildLeadInfos, type LeadInfo } from "./base";
import { buildCompliance, type ComplianceWorld } from "./compliance";
import { buildDirectory, type DirectoryWorld } from "./directory";
import { buildInbox, type InboxWorld } from "./inbox";
import { buildLeads, type LeadsWorld } from "./leads";
import { buildOutreach, type Evidence, type OutreachWorld } from "./outreach";
import { buildPipeline, type PipelineWorld } from "./pipeline";
import { buildPlatform, type PlatformWorld } from "./platform";
import { buildProfiles, type ProfilesWorld } from "./profiles";
import { buildSearch, type SearchWorld } from "./search";

export interface World {
  now: Date;
  leadInfos: readonly LeadInfo[];
  platform: PlatformWorld;
  profiles: ProfilesWorld;
  directory: DirectoryWorld;
  leads: LeadsWorld;
  search: SearchWorld;
  audits: AuditsWorld;
  outreach: OutreachWorld;
  inbox: InboxWorld;
  compliance: ComplianceWorld;
  pipeline: PipelineWorld;
}

export function buildWorld(now: Date): World {
  const leadInfos = buildLeadInfos(now);
  const profiles = buildProfiles(now);
  const directory = buildDirectory(now, leadInfos);
  const audits = buildAudits(leadInfos);

  const firstFindings = new Map<
    number,
    { checkId: string; claim: string; sourceUrl: string | null; capturedAt: Date }
  >();
  const claims = new Map<string, string>();
  for (const finding of audits.findings) {
    claims.set(finding.id, finding.claim);
    const lead = leadInfos.find((info) => info.id === finding.leadId);
    if (lead === undefined || firstFindings.has(lead.n) || finding.dismissedAt != null) continue;
    firstFindings.set(lead.n, {
      checkId: finding.checkId,
      claim: finding.claim,
      sourceUrl: finding.sourceUrl ?? null,
      capturedAt: new Date(finding.capturedAt),
    });
  }

  const leads = buildLeads(now, leadInfos, audits.citableFindings);
  const search = buildSearch(now, leadInfos, firstFindings);

  // A lead's primary (first) signal, when it can be cited: only signals with a source URL (INV-5).
  const signals = new Map<number, string>();
  for (const signal of search.signals) {
    const lead = leadInfos.find((info) => info.id === signal.leadId);
    if (lead !== undefined && !signals.has(lead.n) && signal.sourceUrl != null)
      signals.set(lead.n, signal.id);
  }
  const evidence: Evidence = { findings: audits.citableFindings, claims, signals };

  const outreach = buildOutreach(now, leadInfos, evidence);
  const inbox = buildInbox(now, leadInfos, outreach, evidence);
  const compliance = buildCompliance(now, leadInfos);
  const pipeline = buildPipeline(now, leadInfos, outreach, evidence);
  const platform = buildPlatform(now, leadInfos, outreach, pipeline, compliance);

  return {
    now,
    leadInfos,
    platform,
    profiles,
    directory,
    leads,
    search,
    audits,
    outreach,
    inbox,
    compliance,
    pipeline,
  };
}
