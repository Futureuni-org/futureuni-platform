/**
 * Client Forms' manifest (docs/contracts/module-manifest.md, docs/specs/module-forms.md §3).
 *
 * The second tool on the platform. It registers its own navigation, permissions and notification
 * type, and uses the platform core for everything else. F2 adds the builder's permissions-backed
 * screens; F4 adds jobs and settings.
 *
 * Permission scopes are in the matrix's column order: ADMIN, MANAGER, SERVICE_LEAD, MEMBER.
 */

import { defineModule, permission, scopes } from "@/platform/registry/define";

import { formNotificationTypes } from "./core/notifications";

const EVERYONE = scopes("ALL", "ALL", "ALL", "ALL");
const NOT_MEMBERS = scopes("ALL", "ALL", "ALL", "NONE");
const MANAGE = scopes("ALL", "ALL", "LINES", "NONE");
const ADMIN_ONLY = scopes("ALL", "NONE", "NONE", "NONE");

export default defineModule({
  id: "forms",
  name: "Client Forms",
  description:
    "Build a form for a prospect, send them the link, and read the brief that comes back.",
  icon: "ClipboardList",
  routePrefix: "/forms",
  order: 20,
  enabled: true,
  navigation: [
    {
      id: "forms-index",
      label: "Forms",
      href: "/forms",
      icon: "ClipboardList",
      permission: "forms.form.read",
    },
  ],
  permissions: [
    permission("forms.module.access", "Open Client Forms", EVERYONE),
    permission("forms.form.read", "View forms and their public links", EVERYONE),
    permission("forms.submission.read", "Read submitted briefs", EVERYONE),
    permission("forms.submission.export", "Export briefs", NOT_MEMBERS),
    permission(
      "forms.form.manage",
      "Create and edit forms",
      MANAGE,
      "The form builder (F2); no screen uses it yet.",
    ),
    permission("forms.submission.delete", "Delete a brief", ADMIN_ONLY),
  ],
  jobs: [],
  schedules: [],
  settings: [],
  settingsPanels: [],
  subscribers: [],
  aiTasks: [],
  homeWidgets: [],
  notificationTypes: formNotificationTypes,
  commands: [
    {
      id: "forms-nav-index",
      label: "Go to Client Forms",
      group: "navigate",
      href: "/forms",
      permission: "forms.form.read",
    },
  ],
  badgeResolvers: {},
});
