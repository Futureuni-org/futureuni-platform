import { describe, expect, it } from "vitest";

import type { AuditCheckId, CheckRunResultSchema } from "@/contracts/audit-agent";
import type { z } from "zod";

import { computeAuditStatus, requiredChecksSatisfied } from "./support";

type CheckRun = z.infer<typeof CheckRunResultSchema>;

function run(checkId: AuditCheckId, status: CheckRun["status"]): CheckRun {
  return { checkId, status, durationMs: 10, costMicros: 0 };
}

const REQUIRED = new Set<AuditCheckId>(["web.no_website", "web.pagespeed_mobile", "web.mobile_viewport"]);

describe("computeAuditStatus / requiredChecksSatisfied", () => {
  it("is SUCCEEDED when every required check is OK", () => {
    const checks = [run("web.no_website", "OK"), run("web.pagespeed_mobile", "OK"), run("web.mobile_viewport", "OK")];
    expect(requiredChecksSatisfied(checks, REQUIRED)).toBe(true);
    expect(computeAuditStatus(checks, REQUIRED)).toBe("SUCCEEDED");
  });

  it("a failing OPTIONAL check does not block AUDITED (AC-12.3): required satisfied, status PARTIAL", () => {
    const checks = [
      run("web.no_website", "OK"),
      run("web.pagespeed_mobile", "OK"),
      run("web.mobile_viewport", "OK"),
      run("web.broken_links", "CHECK_FAILED"),
    ];
    expect(requiredChecksSatisfied(checks, REQUIRED)).toBe(true);
    expect(computeAuditStatus(checks, REQUIRED)).toBe("PARTIAL");
  });

  it("a failing REQUIRED check is not satisfied and the agent status is FAILED (AC-12.4)", () => {
    const checks = [
      run("web.no_website", "OK"),
      run("web.pagespeed_mobile", "OK"),
      run("web.mobile_viewport", "CHECK_FAILED"),
    ];
    expect(requiredChecksSatisfied(checks, REQUIRED)).toBe(false);
    expect(computeAuditStatus(checks, REQUIRED)).toBe("FAILED");
  });

  it("treats NOT_APPLICABLE and NOT_ASSESSED as satisfied for a required check", () => {
    const checks = [
      run("web.no_website", "OK"),
      run("web.pagespeed_mobile", "NOT_APPLICABLE"),
      run("web.mobile_viewport", "NOT_ASSESSED"),
    ];
    expect(requiredChecksSatisfied(checks, REQUIRED)).toBe(true);
  });

  it("is NOT_APPLICABLE when every check is not applicable", () => {
    const checks = [run("web.pagespeed_mobile", "NOT_APPLICABLE"), run("web.mobile_viewport", "NOT_APPLICABLE")];
    expect(computeAuditStatus(checks, new Set())).toBe("NOT_APPLICABLE");
  });
});
