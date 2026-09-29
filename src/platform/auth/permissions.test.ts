/**
 * Permission matrix walker (docs/prompts/wave-1/phase-03-auth.md Step 4, permissions contract §3).
 *
 * The fixture below is copied from the .claude/project-rules.md matrix (platform.* rows). The
 * test asserts that:
 *
 *   1. Every fixture action is registered by the core manifest, with identical scopes.
 *   2. Every core-manifest action is present in the fixture (drift in either direction fails).
 *   3. For every (action × role × resource case), `can()` returns the verdict the fixture rules
 *      dictate.
 *
 * Phase 19 extends this pattern for `acquisition.*` actions; those are exercised here only via
 * a smaller sample to keep the fixture readable.
 */

import { describe, expect, it } from "vitest";

import type { Role, ServiceLine } from "@/contracts/common";
import type { PermissionResource, PermissionScope, PermissionSubject } from "@/contracts/permissions";
import { getAllPermissions } from "@/platform/registry";

import { can, explainCan, _resetPermissionCache } from "./permissions";
import { PLATFORM_FIXTURE } from "./permissions.fixture";

const ROLES: Role[] = ["ADMIN", "MANAGER", "SERVICE_LEAD", "MEMBER"];
const ALL_LINES: ServiceLine[] = ["WEB_DEVELOPMENT", "UI_UX_DESIGN", "GRAPHIC_DESIGN", "VIDEO_EDITING"];

function makeSubject(role: Role, over: Partial<PermissionSubject> = {}): PermissionSubject {
  return {
    id: "cusr0000000000000000000001",
    role,
    serviceLines: over.serviceLines ?? ALL_LINES,
    canApprove: over.canApprove ?? false,
    status: "ACTIVE",
    ...over,
  };
}

_resetPermissionCache();

const registered = new Map(getAllPermissions().map((row) => [row.action, row] as const));

describe("permission matrix parity", () => {
  it("every platform.* fixture row is registered with matching scopes", () => {
    for (const row of PLATFORM_FIXTURE) {
      const def = registered.get(row.action);
      expect(def, `missing manifest entry for ${row.action}`).toBeDefined();
      if (def === undefined) continue;
      expect(def.scopes).toEqual(row.scopes);
    }
  });

  it("every registered platform.* action is in the fixture", () => {
    const fixtureActions = new Set(PLATFORM_FIXTURE.map((row) => row.action));
    for (const [action] of registered) {
      if (!action.startsWith("platform.")) continue;
      expect(fixtureActions.has(action), `fixture missing ${action}`).toBe(true);
    }
  });
});

describe("can() walks the matrix", () => {
  for (const row of PLATFORM_FIXTURE) {
    for (const role of ROLES) {
      const scope: PermissionScope = row.scopes[role];
      it(`${row.action} · ${role} · ${scope}`, () => {
        checkScope(row.action, role, scope);
      });
    }
  }
});

function checkScope(action: string, role: Role, scope: PermissionScope) {
  const anyone = makeSubject(role);
  switch (scope) {
    case "ALL":
      expect(can(anyone, action)).toBe(true);
      return;
    case "NONE":
      expect(can(anyone, action)).toBe(false);
      expect(can(anyone, action, { userId: anyone.id })).toBe(false);
      return;
    case "SELF": {
      expect(can(anyone, action, { userId: anyone.id })).toBe(true);
      expect(can(anyone, action, { userId: "cusr0000000000000000000099" })).toBe(false);
      expect(can(anyone, action)).toBe(false);
      return;
    }
    case "LINES": {
      const inLine = makeSubject(role, { serviceLines: ["WEB_DEVELOPMENT"] });
      expect(can(inLine, action, { serviceLine: "WEB_DEVELOPMENT" })).toBe(true);
      expect(can(inLine, action, { serviceLine: "VIDEO_EDITING" })).toBe(false);
      expect(can(inLine, action)).toBe(false);
      return;
    }
    case "OWN": {
      const owner = makeSubject(role, { serviceLines: ["WEB_DEVELOPMENT"] });
      expect(
        can(owner, action, { serviceLine: "WEB_DEVELOPMENT", ownerId: owner.id }),
      ).toBe(true);
      expect(
        can(owner, action, { serviceLine: "WEB_DEVELOPMENT", ownerId: "cother" }),
      ).toBe(false);
      expect(can(owner, action, { serviceLine: "VIDEO_EDITING", ownerId: owner.id })).toBe(
        false,
      );
      return;
    }
    case "OWN+A": {
      const approver = makeSubject(role, {
        serviceLines: ["WEB_DEVELOPMENT"],
        canApprove: true,
      });
      const notApprover = makeSubject(role, {
        serviceLines: ["WEB_DEVELOPMENT"],
        canApprove: false,
      });
      const resource: PermissionResource = {
        serviceLine: "WEB_DEVELOPMENT",
        ownerId: approver.id,
      };
      expect(can(approver, action, resource)).toBe(true);
      expect(can(notApprover, action, { ...resource, ownerId: notApprover.id })).toBe(false);
      return;
    }
    case "CEIL": {
      // Managers may target MANAGER/SERVICE_LEAD/MEMBER but never ADMIN.
      expect(can(anyone, action, { targetRole: "MEMBER" })).toBe(role === "MANAGER" || role === "ADMIN");
      expect(can(anyone, action, { targetRole: "ADMIN" })).toBe(role === "ADMIN");
      expect(can(anyone, action)).toBe(false);
      return;
    }
    default: {
      const _exhaustive: never = scope;
      throw new Error(`unhandled scope ${String(_exhaustive)}`);
    }
  }
}

describe("deactivated user is denied everything", () => {
  it("denies platform.home.read for a DEACTIVATED user", () => {
    const gone = makeSubject("ADMIN", { status: "DEACTIVATED" });
    expect(can(gone, "platform.home.read")).toBe(false);
    expect(explainCan(gone, "platform.home.read").reason).toBe("USER_INACTIVE");
  });
});

describe("unregistered actions are denied", () => {
  it("denies with UNREGISTERED_ACTION reason", () => {
    const user = makeSubject("ADMIN");
    expect(can(user, "platform.nonexistent.verb")).toBe(false);
    expect(explainCan(user, "platform.nonexistent.verb").reason).toBe("UNREGISTERED_ACTION");
  });
});
