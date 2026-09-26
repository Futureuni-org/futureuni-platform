import { describe, expect, it } from "vitest";

import { ModuleManifestMetaSchema, NavItemSchema } from "./module-manifest";
import { issuePaths } from "./test-helpers";

const validAcquisition = {
  id: "acquisition",
  name: "Client Acquisition",
  description: "Find, audit, contact and win clients for every FUTUREUNI service line.",
  icon: "Radar",
  routePrefix: "/acquisition",
  order: 10,
  enabled: true,
  navigation: [
    {
      id: "overview",
      label: "Overview",
      href: "/acquisition/overview",
      icon: "LayoutDashboard",
      permission: "acquisition.overview.read",
    },
    {
      id: "web-development",
      label: "Web Development",
      href: "/acquisition/web-development",
      icon: "Globe",
      permission: "acquisition.lead.read",
      resource: { serviceLine: "WEB_DEVELOPMENT" },
      children: [
        {
          id: "web-development.search",
          label: "Search",
          href: "/acquisition/web-development/search",
          permission: "acquisition.search.read",
          resource: { serviceLine: "WEB_DEVELOPMENT" },
        },
        {
          id: "web-development.review",
          label: "Review",
          href: "/acquisition/web-development/review",
          permission: "acquisition.review.read",
          resource: { serviceLine: "WEB_DEVELOPMENT" },
          badge: { source: "acquisition.review-count", tone: "attention" },
        },
        {
          id: "web-development.leads",
          label: "Leads",
          href: "/acquisition/web-development/leads",
          permission: "acquisition.lead.read",
          resource: { serviceLine: "WEB_DEVELOPMENT" },
        },
      ],
    },
  ],
  permissions: [
    {
      action: "acquisition.message.approve",
      label: "Approve outreach messages",
      scopes: { ADMIN: "ALL", MANAGER: "ALL", SERVICE_LEAD: "LINES", MEMBER: "OWN+A" },
      resourceFields: ["serviceLine", "ownerId"],
    },
  ],
  jobs: [],
  schedules: [],
  settings: [],
  settingsPanels: [],
  homeWidgets: [
    {
      id: "acquisition.my-review-queue",
      title: "My review queue",
      permission: "acquisition.review.read",
      size: "md",
      order: 10,
    },
    {
      id: "acquisition.my-inbox",
      title: "My inbox",
      permission: "acquisition.inbox.read",
      size: "md",
      order: 20,
    },
    {
      id: "acquisition.pipeline-value",
      title: "Pipeline value",
      permission: "acquisition.pipeline.read",
      size: "md",
      order: 30,
    },
  ],
  notificationTypes: [],
  commands: [],
};

describe("module-manifest contract", () => {
  it("parses the worked example (docs/contracts/module-manifest.md §5)", () => {
    const meta = ModuleManifestMetaSchema.parse(validAcquisition);
    expect(meta.navigation).toHaveLength(2);
  });

  it("the schema passes a link outside the prefix; codegen rejects it (§6, see the registry tests)", () => {
    const result = ModuleManifestMetaSchema.safeParse({
      ...validAcquisition,
      navigation: [{ id: "oops", label: "Leads", href: "/leads" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects the invalid example (§6): a route prefix without the leading slash", () => {
    expect(
      issuePaths(
        ModuleManifestMetaSchema.safeParse({ ...validAcquisition, routePrefix: "acquisition" }),
      ),
    ).toEqual(["routePrefix"]);
  });

  it("validates nested navigation items and icon names", () => {
    expect(
      NavItemSchema.safeParse({ id: "x", label: "X", href: "/x", icon: "not-an-icon" }).success,
    ).toBe(false);
    expect(
      NavItemSchema.safeParse({
        id: "x",
        label: "X",
        href: "/x",
        children: [{ id: "y", label: "Y", href: "/x/y" }],
      }).success,
    ).toBe(true);
  });
});
