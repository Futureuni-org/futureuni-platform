import { describe, expect, it } from "vitest";

import { AuditFindingInputSchema, AuditResultSchema } from "./audit-agent";
import { issuePaths } from "./test-helpers";

const validFinding = {
  checkId: "web.pagespeed_mobile",
  severity: "HIGH",
  claim: "Your homepage took 7.2s to show its main content on mobile in our test on 3 Oct 2026.",
  evidence: {
    metrics: { lcpSeconds: 7.2, performanceScore: 34, cls: 0.31, totalBytes: 4812000 },
    thresholds: { lcpSeconds: 4, performanceScore: 50 },
  },
  sourceUrl:
    "https://pagespeed.web.dev/analysis?url=https%3A%2F%2Fexample.com.ng%2F&form_factor=mobile",
  capturedAt: "2026-10-03T09:40:00Z",
  method: "MEASURED",
  confidence: 1,
  pitchable: true,
};

describe("audit-agent contract", () => {
  it("parses the worked example (docs/contracts/audit-agent.md §5)", () => {
    expect(AuditFindingInputSchema.parse(validFinding).severity).toBe("HIGH");
  });

  it("rejects the invalid example (§6): no source, low-confidence pitch, no references", () => {
    const result = AuditFindingInputSchema.safeParse({
      checkId: "graphic.consistency",
      severity: "MEDIUM",
      claim: "Your brand looks inconsistent across channels.",
      evidence: {},
      capturedAt: "2026-10-03T09:40:00Z",
      method: "AI_JUDGED",
      confidence: 0.55,
      pitchable: true,
    });
    expect(issuePaths(result).sort()).toEqual(["evidence.referenceIds", "pitchable", "sourceUrl"]);
  });

  it("an audit result carries only terminal statuses", () => {
    const base = { agentId: "audit.web", checks: [], findings: [validFinding], costMicros: 1200 };
    expect(AuditResultSchema.safeParse({ ...base, status: "SUCCEEDED" }).success).toBe(true);
    expect(AuditResultSchema.safeParse({ ...base, status: "RUNNING" }).success).toBe(false);
  });
});
