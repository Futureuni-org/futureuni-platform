/**
 * The platform core's own manifest (docs/contracts/module-manifest.md rule 3): Home, Settings and
 * Admin navigation, and every `platform.*` action in the .claude/project-rules.md permission
 * matrix (scopes in the table's order: ADMIN, MANAGER, SERVICE_LEAD, MEMBER; "—" is NONE).
 * Platform jobs, settings and notification types arrive through the Wave 1 integration.
 */

import { defineModule, permission, scopes } from "./define";

const EVERYONE = scopes("ALL", "ALL", "ALL", "ALL");
const OWN_RECORD = scopes("SELF", "SELF", "SELF", "SELF");
const ADMIN_ONLY = scopes("ALL", "NONE", "NONE", "NONE");
const ADMIN_AND_MANAGER = scopes("ALL", "ALL", "NONE", "NONE");

export const coreManifest = defineModule({
  id: "platform",
  name: "Platform",
  description: "The FUTUREUNI platform core: home, your settings and administration.",
  icon: "LayoutGrid",
  routePrefix: "/",
  order: 0,
  enabled: true,
  navigation: [
    { id: "home", label: "Home", href: "/", icon: "House", permission: "platform.home.read" },
    // Everyone has their own settings; the page gates each section.
    { id: "settings", label: "Settings", href: "/settings", icon: "Settings" },
    // ADMIN and MANAGER (the contract's rule 3); each admin section has its own action.
    {
      id: "admin",
      label: "Admin",
      href: "/admin",
      icon: "ShieldCheck",
      permission: "platform.admin.access",
    },
  ],
  permissions: [
    permission("platform.home.read", "View the platform home", EVERYONE),
    permission("platform.notification.read", "Read your notifications", OWN_RECORD),
    permission(
      "platform.notificationPreference.update",
      "Change your notification preferences",
      OWN_RECORD,
    ),
    permission(
      "platform.userSettings.update",
      "Change your own settings",
      OWN_RECORD,
      "Own name, avatar, timezone, working hours and appearance.",
    ),
    permission(
      "platform.security.manage",
      "Manage your own sign-in security",
      OWN_RECORD,
      "Own password, 2FA and sessions.",
    ),
    permission(
      "platform.admin.access",
      "Open the admin area",
      ADMIN_AND_MANAGER,
      "The /admin frame and its navigation entry.",
    ),
    permission("platform.user.read", "View users", ADMIN_AND_MANAGER),
    permission(
      "platform.user.invite",
      "Invite users",
      scopes("ALL", "CEIL", "NONE", "NONE"),
      "A MANAGER invites MANAGER, SERVICE_LEAD or MEMBER, never ADMIN.",
    ),
    permission("platform.user.changeRole", "Change a user's role", ADMIN_ONLY),
    permission("platform.user.deactivate", "Deactivate or reactivate a user", ADMIN_ONLY),
    permission("platform.user.reset2fa", "Reset a user's two-factor authentication", ADMIN_ONLY),
    permission("platform.user.forceSignOut", "Sign a user out everywhere", ADMIN_ONLY),
    permission("platform.team.read", "View team profiles", scopes("ALL", "ALL", "LINES", "LINES")),
    permission(
      "platform.team.update",
      "Update team profiles",
      ADMIN_AND_MANAGER,
      "Capacity, timezone, working hours, lines and canApprove. A MANAGER may update SERVICE_LEAD and MEMBER profiles only.",
    ),
    permission("platform.setting.read", "View platform settings", ADMIN_AND_MANAGER),
    permission(
      "platform.setting.update",
      "Change platform settings",
      ADMIN_ONLY,
      "Platform-scope settings.",
    ),
    permission("platform.module.toggle", "Turn modules on or off", ADMIN_ONLY),
    permission(
      "platform.credential.read",
      "View integration credential status",
      ADMIN_ONLY,
      "Masked status only.",
    ),
    permission("platform.credential.manage", "Save, replace or delete credentials", ADMIN_ONLY),
    permission("platform.credential.test", "Test an integration credential", ADMIN_ONLY),
    permission("platform.aiUsage.read", "View AI usage and cost", ADMIN_ONLY),
    permission("platform.aiBudget.update", "Change AI budgets and model tiers", ADMIN_ONLY),
    permission("platform.prompt.read", "View prompt versions", ADMIN_ONLY),
    permission(
      "platform.prompt.publish",
      "Publish a prompt version",
      ADMIN_ONLY,
      "Including a forced publish.",
    ),
    permission("platform.prompt.activate", "Activate or roll back a prompt version", ADMIN_ONLY),
    permission("platform.eval.run", "Run AI evals", ADMIN_ONLY),
    permission("platform.job.read", "View background jobs", ADMIN_AND_MANAGER),
    permission("platform.job.retry", "Retry a failed job", ADMIN_AND_MANAGER),
    permission("platform.job.cancel", "Cancel a job", ADMIN_AND_MANAGER),
    permission("platform.job.runNow", "Run a job now", ADMIN_ONLY),
    permission("platform.schedule.toggle", "Turn job schedules on or off", ADMIN_ONLY),
    permission("platform.audit.read", "View the audit log", ADMIN_ONLY),
    permission("platform.audit.export", "Export the audit log", ADMIN_ONLY),
    permission(
      "platform.file.upload",
      "Upload files",
      EVERYONE,
      "The calling service checks the file's purpose.",
    ),
    permission("platform.directory.read", "View the companies and contacts directory", EVERYONE),
    permission(
      "platform.directory.update",
      "Edit companies and contacts",
      EVERYONE,
      "Company and contact fields; every edit is audited.",
    ),
    permission(
      "platform.devGallery.read",
      "View the UI gallery in production",
      ADMIN_ONLY,
      "/dev/ui in production.",
    ),
  ],
  jobs: [],
  schedules: [],
  settings: [],
  settingsPanels: [],
  homeWidgets: [],
  notificationTypes: [],
  commands: [],
});
