import { describe, expect, it } from "vitest";

import {
  PermissionDefinitionSchema,
  PermissionResourceSchema,
  PermissionSubjectSchema,
  ROLE_RANK,
} from "./permissions";
import { issuePaths } from "./test-helpers";

describe("permissions contract", () => {
  it("parses the worked example (docs/contracts/permissions.md §4)", () => {
    const approve = PermissionDefinitionSchema.parse({
      action: "acquisition.message.approve",
      label: "Approve outreach messages",
      scopes: { ADMIN: "ALL", MANAGER: "ALL", SERVICE_LEAD: "LINES", MEMBER: "OWN+A" },
      resourceFields: ["serviceLine", "ownerId"],
    });
    expect(approve.scopes.MEMBER).toBe("OWN+A");

    // The doc writes "cm1memberA0000000000000001"; a cuid is lower case, so that id fails IdSchema
    // (z.cuid() too). Lower-cased here; the doc fix is in phases/02/REQUESTS.md.
    const lead = {
      serviceLine: "VIDEO_EDITING",
      ownerId: "cm1membera0000000000000001",
      market: "NIGERIA",
    };
    expect(PermissionResourceSchema.parse(lead)).toEqual(lead);
    expect(
      PermissionSubjectSchema.parse({
        id: "cm1lead00000000000000000001",
        role: "SERVICE_LEAD",
        serviceLines: ["VIDEO_EDITING"],
        canApprove: false,
        status: "ACTIVE",
      }).role,
    ).toBe("SERVICE_LEAD");
  });

  it("rejects the invalid example (§5): two-segment action and a missing role", () => {
    const result = PermissionDefinitionSchema.safeParse({
      action: "acquisition.approveMessage",
      label: "Approve",
      scopes: { ADMIN: "ALL", MANAGER: "ALL", SERVICE_LEAD: "LINES" },
    });
    expect(issuePaths(result)).toEqual(expect.arrayContaining(["action", "scopes.MEMBER"]));
    if (!result.success) {
      expect(result.error.issues.find((issue) => issue.path[0] === "action")?.message).toBe(
        "Use module.resource.verb",
      );
    }
  });

  it("ranks roles from MEMBER to ADMIN (used by CEIL)", () => {
    expect(ROLE_RANK.MEMBER).toBeLessThan(ROLE_RANK.SERVICE_LEAD);
    expect(ROLE_RANK.SERVICE_LEAD).toBeLessThan(ROLE_RANK.MANAGER);
    expect(ROLE_RANK.MANAGER).toBeLessThan(ROLE_RANK.ADMIN);
  });
});
