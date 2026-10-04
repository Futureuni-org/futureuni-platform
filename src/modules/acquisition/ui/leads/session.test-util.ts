import type { Role, ServiceLine } from "@/contracts/common";
import type { CurrentUser } from "@/platform/auth";

/**
 * Test support for the server-action integration tests: the session user the auth layer would
 * build for a team member made by `createTeamMember`. The tests swap `requireUser` for a function
 * that returns one of these, so everything after authentication (the permission matrix, the
 * repos, the database) runs for real.
 */
export function sessionUser(member: {
  user: { id: string; name: string; email: string; role: Role };
  teamProfile: { serviceLines: ServiceLine[]; canApprove: boolean; timezone: string };
}): CurrentUser {
  return {
    id: member.user.id,
    name: member.user.name,
    email: member.user.email,
    image: null,
    role: member.user.role,
    serviceLines: member.teamProfile.serviceLines,
    canApprove: member.teamProfile.canApprove,
    timezone: member.teamProfile.timezone,
    twoFactorEnabled: true,
    status: "ACTIVE",
    mustSetUp2fa: false,
  };
}
