/**
 * The platform.* permission matrix, copied from .claude/project-rules.md §"Permission matrix".
 *
 * This is data, not code. Any drift between:
 *   - the values here
 *   - the values in .claude/project-rules.md
 *   - the values in src/platform/registry/core-manifest.ts
 * is caught by `permissions.test.ts`, which fails if any of the three disagree.
 *
 * Phase 19 asserts the whole permission surface (platform + acquisition) equals a broader
 * fixture. This file only covers platform.* to keep Phase 3's test focused.
 */

import type { Role } from "@/contracts/common";
import type { PermissionScope } from "@/contracts/permissions";

interface Row {
  action: string;
  scopes: Record<Role, PermissionScope>;
}

const scopes = (
  admin: PermissionScope,
  manager: PermissionScope,
  serviceLead: PermissionScope,
  member: PermissionScope,
): Record<Role, PermissionScope> => ({
  ADMIN: admin,
  MANAGER: manager,
  SERVICE_LEAD: serviceLead,
  MEMBER: member,
});

const EVERYONE = scopes("ALL", "ALL", "ALL", "ALL");
const OWN_RECORD = scopes("SELF", "SELF", "SELF", "SELF");
const ADMIN_ONLY = scopes("ALL", "NONE", "NONE", "NONE");
const ADMIN_AND_MANAGER = scopes("ALL", "ALL", "NONE", "NONE");

export const PLATFORM_FIXTURE: Row[] = [
  { action: "platform.home.read", scopes: EVERYONE },
  { action: "platform.notification.read", scopes: OWN_RECORD },
  { action: "platform.notificationPreference.update", scopes: OWN_RECORD },
  { action: "platform.userSettings.update", scopes: OWN_RECORD },
  { action: "platform.security.manage", scopes: OWN_RECORD },
  { action: "platform.admin.access", scopes: ADMIN_AND_MANAGER },
  { action: "platform.user.read", scopes: ADMIN_AND_MANAGER },
  { action: "platform.user.invite", scopes: scopes("ALL", "CEIL", "NONE", "NONE") },
  { action: "platform.user.changeRole", scopes: ADMIN_ONLY },
  { action: "platform.user.deactivate", scopes: ADMIN_ONLY },
  { action: "platform.user.reset2fa", scopes: ADMIN_ONLY },
  { action: "platform.user.forceSignOut", scopes: ADMIN_ONLY },
  { action: "platform.team.read", scopes: scopes("ALL", "ALL", "LINES", "LINES") },
  { action: "platform.team.update", scopes: ADMIN_AND_MANAGER },
  { action: "platform.setting.read", scopes: ADMIN_AND_MANAGER },
  { action: "platform.setting.update", scopes: ADMIN_ONLY },
  { action: "platform.module.toggle", scopes: ADMIN_ONLY },
  { action: "platform.credential.read", scopes: ADMIN_ONLY },
  { action: "platform.credential.manage", scopes: ADMIN_ONLY },
  { action: "platform.credential.test", scopes: ADMIN_ONLY },
  { action: "platform.aiUsage.read", scopes: ADMIN_ONLY },
  { action: "platform.aiBudget.update", scopes: ADMIN_ONLY },
  { action: "platform.prompt.read", scopes: ADMIN_ONLY },
  { action: "platform.prompt.publish", scopes: ADMIN_ONLY },
  { action: "platform.prompt.activate", scopes: ADMIN_ONLY },
  { action: "platform.eval.run", scopes: ADMIN_ONLY },
  { action: "platform.job.read", scopes: ADMIN_AND_MANAGER },
  { action: "platform.job.retry", scopes: ADMIN_AND_MANAGER },
  { action: "platform.job.cancel", scopes: ADMIN_AND_MANAGER },
  { action: "platform.job.runNow", scopes: ADMIN_ONLY },
  { action: "platform.schedule.toggle", scopes: ADMIN_ONLY },
  { action: "platform.audit.read", scopes: ADMIN_ONLY },
  { action: "platform.audit.export", scopes: ADMIN_ONLY },
  { action: "platform.file.upload", scopes: EVERYONE },
  { action: "platform.directory.read", scopes: EVERYONE },
  { action: "platform.directory.update", scopes: EVERYONE },
  { action: "platform.devGallery.read", scopes: ADMIN_ONLY },
];
