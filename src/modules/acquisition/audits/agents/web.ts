/**
 * `audit.web` — the Web Development audit agent. Runs `web.no_website` first; when there is no real
 * website, every other website check is NOT_APPLICABLE (contract §3).
 */

import "server-only";

import type {
  AuditAgent,
  AuditCheckDefinitionSchema,
  AuditCompanyInput,
  AuditContext,
  AuditResult,
} from "@/contracts/audit-agent";
import type { z } from "zod";

import { COST_MICROS } from "../checks/cost";
import { WEB_CHECK_FNS, hasRealWebsite, webNoWebsite } from "../checks/web";
import { computeAuditStatus, runChecks, type NamedCheck } from "./support";

type CheckDef = z.infer<typeof AuditCheckDefinitionSchema>;

const CHECKS: CheckDef[] = [
  { id: "web.no_website", label: "No real website", method: "OBSERVED", defaultRequired: true, estimatedCostMicros: 0, cacheScope: "company" },
  { id: "web.pagespeed_mobile", label: "Mobile performance", method: "MEASURED", defaultRequired: true, estimatedCostMicros: COST_MICROS.pagespeed, cacheScope: "domain" },
  { id: "web.pagespeed_desktop", label: "Desktop performance", method: "MEASURED", defaultRequired: false, estimatedCostMicros: COST_MICROS.pagespeed, cacheScope: "domain" },
  { id: "web.ssl", label: "HTTPS and certificate", method: "MEASURED", defaultRequired: true, estimatedCostMicros: 0, cacheScope: "domain" },
  { id: "web.mobile_viewport", label: "Mobile viewport", method: "MEASURED", defaultRequired: true, estimatedCostMicros: COST_MICROS.capture, cacheScope: "domain" },
  { id: "web.broken_links", label: "Broken links", method: "MEASURED", defaultRequired: false, estimatedCostMicros: 0, cacheScope: "domain" },
  { id: "web.seo_basics", label: "SEO basics", method: "MEASURED", defaultRequired: false, estimatedCostMicros: 0, cacheScope: "domain" },
  { id: "web.outdated", label: "Outdated signs", method: "OBSERVED", defaultRequired: false, estimatedCostMicros: 0, cacheScope: "domain" },
  { id: "web.contact_path", label: "Contact path", method: "OBSERVED", defaultRequired: false, estimatedCostMicros: 0, cacheScope: "domain" },
  { id: "web.visual_first_impression", label: "Visual first impression", method: "AI_JUDGED", defaultRequired: false, aiTask: "acquisition.audit-web-first-impression", estimatedCostMicros: COST_MICROS.aiVision, cacheScope: "domain" },
];

const ORDER: NamedCheck[] = CHECKS.map((c) => ({ id: c.id, fn: WEB_CHECK_FNS[c.id] ?? webNoWebsite }));

export const webAuditAgent: AuditAgent = {
  id: "audit.web",
  serviceLine: "WEB_DEVELOPMENT",
  checks: CHECKS,
  async run(company: AuditCompanyInput, ctx: AuditContext): Promise<AuditResult> {
    if (hasRealWebsite(company)) {
      const res = await runChecks(company, ctx, ORDER);
      return {
        agentId: "audit.web",
        status: computeAuditStatus(res.checks, ctx.requiredChecks),
        checks: res.checks,
        findings: res.findings,
        costMicros: res.costMicros,
      };
    }
    // No real website: only no_website runs; the rest are NOT_APPLICABLE.
    const res = await runChecks(company, ctx, [{ id: "web.no_website", fn: webNoWebsite }]);
    for (const def of CHECKS) {
      if (def.id === "web.no_website") continue;
      res.checks.push({ checkId: def.id, status: "NOT_APPLICABLE", reason: "No website.", durationMs: 0, costMicros: 0 });
    }
    return {
      agentId: "audit.web",
      status: computeAuditStatus(res.checks, ctx.requiredChecks),
      checks: res.checks,
      findings: res.findings,
      costMicros: res.costMicros,
    };
  },
};
