/**
 * __MODULE_NAME__'s manifest (docs/contracts/module-manifest.md). Everything the platform needs to
 * host the module: navigation, permissions, jobs, schedules, settings, widgets, notification types
 * and commands. After editing it, run `pnpm registry:gen`.
 *
 * Every permission here must also be added to the permission matrix in .claude/project-rules.md.
 */

import { defineModule, permission, scopes } from "@/platform/registry/define";

import { __MODULE_ID__Jobs } from "./jobs";

export default defineModule({
  id: "__MODULE_ID__",
  name: "__MODULE_NAME__",
  description: "__MODULE_NAME__ for the FUTUREUNI team.",
  icon: "Box",
  routePrefix: "__ROUTE_PREFIX__",
  order: 100,
  enabled: true,
  navigation: [
    {
      id: "home",
      label: "__MODULE_NAME__",
      href: "__ROUTE_PREFIX__",
      icon: "Box",
      permission: "__MODULE_ID__.module.access",
    },
  ],
  permissions: [
    permission("__MODULE_ID__.module.access", "Open __MODULE_NAME__", scopes("ALL", "ALL", "ALL", "ALL")),
  ],
  jobs: __MODULE_ID__Jobs,
  schedules: [],
  settings: [],
  settingsPanels: [],
  homeWidgets: [],
  notificationTypes: [],
  commands: [],
});
