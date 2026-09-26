import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { Role, ServiceLine } from "@/contracts/common";
import type { NavItem } from "@/contracts/module-manifest";
import type { PermissionScope } from "@/contracts/permissions";

import {
  getAllModules,
  getAllPermissions,
  getEnabledModules,
  getHomeWidgets,
  getNavigation,
  resolveBadge,
} from "./registry";

/** A minimal stand-in for Phase 3's can(): evaluates the registered scopes (permissions.md §2). */
function canFor(user: {
  id: string;
  role: Role;
  serviceLines: ServiceLine[];
  canApprove: boolean;
}) {
  const scopesByAction = new Map(
    getAllPermissions().map((definition) => [definition.action, definition.scopes]),
  );
  return (action: string, resource?: object): boolean => {
    const scope = scopesByAction.get(action)?.[user.role];
    const target = (resource ?? {}) as { serviceLine?: ServiceLine; ownerId?: string };
    const inLine =
      target.serviceLine !== undefined && user.serviceLines.includes(target.serviceLine);
    switch (scope) {
      case "ALL":
        return true;
      case "LINES":
        return inLine;
      case "OWN":
        return inLine && target.ownerId === user.id;
      case "OWN+A":
        return inLine && target.ownerId === user.id && user.canApprove;
      default:
        return false;
    }
  };
}

const ids = (items: readonly NavItem[]): string[] =>
  items.flatMap((item) => [item.id, ...ids(item.children ?? [])]);
const allEnabled = { readSettings: () => Promise.resolve(new Map<string, unknown>()) };

describe("registry", () => {
  it("lists the core manifest first, then every module codegen found", () => {
    expect(getAllModules().map((module) => module.id)).toEqual(["platform", "acquisition"]);
  });

  it("shows an ADMIN the core navigation and all 4 acquisition lines with their 7 sections", async () => {
    const admin = canFor({
      id: "cadmin000000000000000001",
      role: "ADMIN",
      serviceLines: [],
      canApprove: true,
    });
    const nav = await getNavigation(
      { can: admin },
      { modules: await getEnabledModules(allEnabled) },
    );
    expect(nav.map((entry) => entry.module)).toEqual(["platform", "acquisition"]);
    expect(ids(nav[0]?.items ?? [])).toEqual(["home", "settings", "admin"]);
    const acquisition = nav[1]?.items ?? [];
    expect(acquisition.map((item) => item.id)).toEqual([
      "overview",
      "web-development",
      "ui-ux-design",
      "graphic-design",
      "video-editing",
    ]);
    expect(acquisition[1]?.children?.map((item) => item.label)).toEqual([
      "Search",
      "Review",
      "Leads",
      "Pipeline",
      "Inbox",
      "Analytics",
      "Settings",
    ]);
  });

  it("shows a Video Editing SERVICE_LEAD every line tab, with review and inbox only in their line", async () => {
    const lead = canFor({
      id: "clead0000000000000000001",
      role: "SERVICE_LEAD",
      serviceLines: ["VIDEO_EDITING"],
      canApprove: false,
    });
    const nav = await getNavigation(
      { can: lead },
      { modules: await getEnabledModules(allEnabled) },
    );
    expect(ids(nav[0]?.items ?? [])).toEqual(["home", "settings"]); // no Admin
    const lines = (nav[1]?.items ?? []).filter((item) => item.id !== "overview");
    expect(lines.map((item) => item.id)).toEqual([
      "web-development",
      "ui-ux-design",
      "graphic-design",
      "video-editing",
    ]);
    const web = lines[0]?.children?.map((item) => item.label);
    const video = lines[3]?.children?.map((item) => item.label);
    expect(web).toEqual(["Search", "Leads", "Pipeline", "Analytics", "Settings"]);
    expect(video).toEqual([
      "Search",
      "Review",
      "Leads",
      "Pipeline",
      "Inbox",
      "Analytics",
      "Settings",
    ]);
  });

  it("shows a Video Editing MEMBER only their line (AC-8.1)", async () => {
    const member = canFor({
      id: "cmember00000000000000001",
      role: "MEMBER",
      serviceLines: ["VIDEO_EDITING"],
      canApprove: false,
    });
    const nav = await getNavigation(
      { id: "cmember00000000000000001", can: member },
      { modules: await getEnabledModules(allEnabled) },
    );
    const acquisition = nav[1]?.items ?? [];
    expect(acquisition.map((item) => item.id)).toEqual(["overview", "video-editing"]);
    // All seven sections, including Review and Inbox, which a MEMBER sees for their own leads.
    expect(acquisition[1]?.children?.map((item) => item.label)).toEqual([
      "Search",
      "Review",
      "Leads",
      "Pipeline",
      "Inbox",
      "Analytics",
      "Settings",
    ]);
  });

  it("hides a disabled module everywhere navigation is built (rule 4)", async () => {
    const admin = canFor({
      id: "cadmin000000000000000001",
      role: "ADMIN",
      serviceLines: [],
      canApprove: true,
    });
    const modules = await getEnabledModules({
      readSettings: () =>
        Promise.resolve(new Map<string, unknown>([["module.acquisition.enabled", false]])),
    });
    expect(modules.map((module) => module.id)).toEqual(["platform"]);
    const nav = await getNavigation({ can: admin }, { modules });
    expect(nav.map((entry) => entry.module)).toEqual(["platform"]);
    expect(getHomeWidgets(modules)).toEqual([]);
  });

  it("ignores a setting override that isn't a boolean", async () => {
    const modules = await getEnabledModules({
      readSettings: () =>
        Promise.resolve(new Map<string, unknown>([["module.acquisition.enabled", "no"]])),
    });
    expect(modules.map((module) => module.id)).toContain("acquisition");
  });

  it("reads module.<id>.enabled from the settings table by default", async () => {
    expect((await getEnabledModules()).map((module) => module.id)).toContain("platform");
  });

  it("lists the acquisition home widgets in order", () => {
    expect(getHomeWidgets().map((widget) => widget.id)).toEqual([
      "acquisition.my-review-queue",
      "acquisition.my-inbox",
      "acquisition.pipeline-value",
    ]);
  });

  it("returns no badge count until a module registers a resolver", async () => {
    expect(
      await resolveBadge("acquisition.review-count", {
        userId: "cuser0000000000000000001",
        clock: { now: () => new Date() },
      }),
    ).toBeNull();
  });
});

/** The permission matrix in .claude/project-rules.md, parsed: action → scopes in column order. */
function projectRulesMatrix(): Map<string, Record<Role, PermissionScope>> {
  const rules = readFileSync(
    join(import.meta.dirname, "../../../.claude/project-rules.md"),
    "utf8",
  );
  const table = rules.split("### Permission matrix")[1]?.split("\n## ")[0] ?? "";
  const matrix = new Map<string, Record<Role, PermissionScope>>();
  for (const row of table.matchAll(
    /^\| `([\w.]+)`[^|]*\| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm,
  )) {
    const [, action = "", ...cells] = row;
    const [admin, manager, lead, member] = cells.map((cell): PermissionScope => {
      const code = cell.trim().split(/\s+/)[0] ?? "";
      return code === "—" ? "NONE" : (code as PermissionScope);
    });
    matrix.set(action, {
      ADMIN: admin ?? "NONE",
      MANAGER: manager ?? "NONE",
      SERVICE_LEAD: lead ?? "NONE",
      MEMBER: member ?? "NONE",
    });
  }
  return matrix;
}

describe("the manifests register exactly the project-rules permission matrix", () => {
  it("has every action with the matrix's scopes, and nothing else", () => {
    const matrix = projectRulesMatrix();
    expect(matrix.size).toBe(94);
    const registered = new Map(
      getAllPermissions().map((definition) => [definition.action, definition.scopes]),
    );
    expect([...registered.keys()].sort()).toEqual([...matrix.keys()].sort());
    for (const [action, scopes] of matrix) expect(registered.get(action), action).toEqual(scopes);
  });

  it("puts platform actions in the core manifest and acquisition actions in the module's", () => {
    const [core, acquisition] = getAllModules();
    expect(core?.permissions.every((definition) => definition.action.startsWith("platform."))).toBe(
      true,
    );
    expect(
      acquisition?.permissions.every((definition) => definition.action.startsWith("acquisition.")),
    ).toBe(true);
    expect(acquisition?.permissions).toHaveLength(57);
  });

  it("derives the resource fields each scope needs", () => {
    const approve = getAllPermissions().find(
      (definition) => definition.action === "acquisition.message.approve",
    );
    expect(approve?.resourceFields).toEqual(["serviceLine", "ownerId"]);
    const invite = getAllPermissions().find(
      (definition) => definition.action === "platform.user.invite",
    );
    expect(invite?.resourceFields).toEqual(["targetRole"]);
  });
});
