/**
 * Team profile services (docs/specs/platform.md §"Team" + §7):
 *
 *   - getTeamProfile / listTeam: read.
 *   - updateTeamProfile: capacity, timezone, working hours, service lines, canApprove.
 *   - recalculateLoad: sums active handoff assignments for one user.
 *   - getLineCapacity / isLineAtCapacity: line-wide roll-up used by Phase 11 throttling.
 *
 * Every mutation is permission-checked with `assertCan` against the .claude/project-rules
 * matrix, and writes an audit entry through SEAM-AUDIT. Phase 18 wraps these in server actions
 * and screens; Phase 3 ships services only.
 */

import "server-only";

import { z } from "zod";

import type { Role, ServiceLine } from "@/contracts/common";
import { RoleSchema, ServiceLineSchema } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { actorOf, assertCan, type CurrentUser } from "@/platform/auth";
import { audit } from "@/platform/audit-log";
import { withTransaction } from "@/platform/db";

import {
  aggregateLineCapacity,
  countActiveAssignments,
  findTeamProfile,
  listTeamMembers,
  setCurrentLoad,
  updateTeamProfileRow,
  type TeamProfileRow,
  type TeamUserRow,
} from "./team.repo";

export interface Actor {
  id: string;
  role: Role;
  serviceLines: ServiceLine[];
  canApprove: boolean;
}

export function actorFromCurrentUser(user: CurrentUser): Actor {
  return {
    id: user.id,
    role: user.role,
    serviceLines: user.serviceLines,
    canApprove: user.canApprove,
  };
}

export async function getTeamProfile(actor: Actor, userId: string): Promise<TeamProfileRow> {
  const row = await findTeamProfile(userId);
  if (row === null) throw new AppError("NOT_FOUND");
  // A profile can carry several service lines; the LINES scope in the matrix says a
  // SERVICE_LEAD or MEMBER may read it when any of their lines is in that set. Passing the
  // first line unconditionally would deny an actor whose overlap sits later in the array.
  const scope = pickScopedLine(actor, row.serviceLines);
  assertCan(actorSubject(actor), "platform.team.read", {
    ...(scope === undefined ? {} : { serviceLine: scope }),
  });
  return row;
}

export const ListTeamInputSchema = z.object({
  serviceLine: ServiceLineSchema.optional(),
  role: RoleSchema.optional(),
});
export type ListTeamInput = z.infer<typeof ListTeamInputSchema>;

export async function listTeam(actor: Actor, raw: ListTeamInput): Promise<TeamUserRow[]> {
  const input = ListTeamInputSchema.parse(raw);
  assertCan(actorSubject(actor), "platform.team.read", {
    ...(input.serviceLine === undefined ? {} : { serviceLine: input.serviceLine }),
  });
  return listTeamMembers({
    ...(input.serviceLine === undefined ? {} : { serviceLine: input.serviceLine }),
    ...(input.role === undefined ? {} : { role: input.role }),
  });
}

const TimeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24h)");
const IsoWeekday = z.number().int().min(0).max(6);

export const UpdateTeamProfileInputSchema = z.object({
  serviceLines: z.array(ServiceLineSchema).optional(),
  weeklyCapacity: z.number().int().min(0).max(40).optional(),
  timezone: z.string().min(3).max(64).optional(),
  canApprove: z.boolean().optional(),
  workingDays: z.array(IsoWeekday).max(7).optional(),
  workingHoursStart: TimeOfDay.optional(),
  workingHoursEnd: TimeOfDay.optional(),
  title: z.string().max(80).nullable().optional(),
});
export type UpdateTeamProfileInput = z.infer<typeof UpdateTeamProfileInputSchema>;

export async function updateTeamProfile(
  actor: Actor,
  userId: string,
  raw: UpdateTeamProfileInput,
): Promise<TeamProfileRow> {
  const input = UpdateTeamProfileInputSchema.parse(raw);
  if (input.timezone !== undefined && !isValidIanaTimezone(input.timezone)) {
    throw new AppError("VALIDATION_FAILED", "Unrecognised timezone.", {
      details: { field: "timezone" },
    });
  }
  if (
    input.workingHoursStart !== undefined &&
    input.workingHoursEnd !== undefined &&
    input.workingHoursStart >= input.workingHoursEnd
  ) {
    throw new AppError("VALIDATION_FAILED", "Working hours end must be after the start.", {
      details: { field: "workingHoursEnd" },
    });
  }

  return withTransaction(async (tx) => {
    const existing = await tx.teamProfile.findUnique({
      where: { userId },
      select: {
        serviceLines: true,
        weeklyCapacity: true,
        currentLoad: true,
        timezone: true,
        canApprove: true,
        workingDays: true,
        workingHoursStart: true,
        workingHoursEnd: true,
        title: true,
        user: { select: { role: true } },
      },
    });
    if (existing === null) throw new AppError("NOT_FOUND");

    const targetRole = existing.user.role;
    // A MANAGER can update SERVICE_LEAD and MEMBER profiles only (project-rules).
    if (actor.role === "MANAGER" && (targetRole === "ADMIN" || targetRole === "MANAGER")) {
      throw new AppError("FORBIDDEN", "Managers can only update service leads and members.");
    }
    const scopeLine = pickScopedLine(actor, existing.serviceLines);
    assertCan(actorSubject(actor), "platform.team.update", {
      ...(scopeLine === undefined ? {} : { serviceLine: scopeLine }),
    });

    const patch: Parameters<typeof updateTeamProfileRow>[2] = {};
    if (input.serviceLines !== undefined) patch.serviceLines = input.serviceLines;
    if (input.weeklyCapacity !== undefined) patch.weeklyCapacity = input.weeklyCapacity;
    if (input.timezone !== undefined) patch.timezone = input.timezone;
    if (input.canApprove !== undefined) patch.canApprove = input.canApprove;
    if (input.workingDays !== undefined) patch.workingDays = input.workingDays;
    if (input.workingHoursStart !== undefined) patch.workingHoursStart = input.workingHoursStart;
    if (input.workingHoursEnd !== undefined) patch.workingHoursEnd = input.workingHoursEnd;
    if (input.title !== undefined) patch.title = input.title;

    const updated = await updateTeamProfileRow(tx, userId, patch);
    await audit.record(tx, {
      actor: actorOf({ id: actor.id, role: actor.role }),
      action: "platform.team.update",
      targetType: "TeamProfile",
      targetId: userId,
      before: {
        serviceLines: existing.serviceLines,
        weeklyCapacity: existing.weeklyCapacity,
        canApprove: existing.canApprove,
        timezone: existing.timezone,
      },
      after: patch,
    });
    return updated;
  });
}

/**
 * Recompute the user's `currentLoad` from active handoff assignments and persist it.
 * Later phases call this after any assignment change.
 */
export async function recalculateLoad(userId: string): Promise<number> {
  return withTransaction(async (tx) => {
    const load = await countActiveAssignments(userId);
    await setCurrentLoad(tx, userId, load);
    return load;
  });
}

export interface LineCapacity {
  serviceLine: ServiceLine;
  capacity: number;
  load: number;
  available: number;
}

export async function getLineCapacity(serviceLine: ServiceLine): Promise<LineCapacity> {
  const roll = await aggregateLineCapacity(serviceLine);
  return { serviceLine, ...roll };
}

export async function isLineAtCapacity(serviceLine: ServiceLine): Promise<boolean> {
  const { available } = await aggregateLineCapacity(serviceLine);
  return available <= 0;
}

function actorSubject(actor: Actor) {
  return {
    id: actor.id,
    role: actor.role,
    serviceLines: actor.serviceLines,
    canApprove: actor.canApprove,
  };
}

/**
 * Pick a service line to use as the resource scope. When any of the profile's lines is in the
 * actor's lines, pick that one so a LINES-scoped role (SERVICE_LEAD, MEMBER) is allowed. When
 * there is no overlap, fall back to the first line: LINES then correctly denies, while ALL-
 * scoped roles (ADMIN, MANAGER) ignore the line entirely.
 */
function pickScopedLine(actor: Actor, profileLines: readonly ServiceLine[]): ServiceLine | undefined {
  const actorLines = new Set(actor.serviceLines);
  return profileLines.find((line) => actorLines.has(line)) ?? profileLines[0];
}

function isValidIanaTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

// Convenience re-exports for tests / seed / phase-18.
export type { TeamProfileRow, TeamUserRow };
