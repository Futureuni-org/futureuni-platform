import "server-only";

import type { SelectOption } from "@/components/admin";
import type { ServiceLine } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { actorFromCurrentUser, listTeam } from "@/platform/team";

/**
 * The people who work a service line, as select options (owner filters, reassignment, mentions,
 * delivery owners). Returns an empty list when the viewer may not read the team, so the controls
 * that depend on it simply don't offer a choice. Any other failure is a real one and is thrown.
 */
export async function loadLineOwners(
  user: Parameters<typeof actorFromCurrentUser>[0],
  line: ServiceLine,
): Promise<SelectOption[]> {
  try {
    const team = await listTeam(actorFromCurrentUser(user), { serviceLine: line });
    return team.map((member) => ({ value: member.id, label: member.name }));
  } catch (error) {
    if (error instanceof AppError && error.code === "FORBIDDEN") return [];
    throw error;
  }
}

/** The team of each line in `lines`, loaded together, for a control that assigns per line. */
export async function loadOwnersByLine(
  user: Parameters<typeof actorFromCurrentUser>[0],
  lines: readonly ServiceLine[],
): Promise<Partial<Record<ServiceLine, SelectOption[]>>> {
  const unique = [...new Set(lines)];
  const teams = await Promise.all(unique.map((line) => loadLineOwners(user, line)));
  const byLine: Partial<Record<ServiceLine, SelectOption[]>> = {};
  unique.forEach((line, index) => {
    const team = teams[index];
    if (team !== undefined) byLine[line] = team;
  });
  return byLine;
}
