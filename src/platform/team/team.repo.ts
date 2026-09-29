/**
 * Team profile repository. This is the only file in `@/platform/team` allowed to import Prisma
 * types directly (`*.repo.ts` boundary rule from CLAUDE.md).
 */

import "server-only";

import type { ServiceLine } from "@/contracts/common";
import { db, type Tx } from "@/platform/db";

export interface TeamProfileRow {
  userId: string;
  serviceLines: ServiceLine[];
  weeklyCapacity: number;
  currentLoad: number;
  timezone: string;
  canApprove: boolean;
  workingDays: number[];
  workingHoursStart: string;
  workingHoursEnd: string;
  title: string | null;
}

const teamSelect = {
  userId: true,
  serviceLines: true,
  weeklyCapacity: true,
  currentLoad: true,
  timezone: true,
  canApprove: true,
  workingDays: true,
  workingHoursStart: true,
  workingHoursEnd: true,
  title: true,
} as const;

export interface TeamUserRow extends TeamProfileRow {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "SERVICE_LEAD" | "MEMBER";
  status: "ACTIVE" | "DEACTIVATED";
}

export async function findTeamProfile(userId: string): Promise<TeamProfileRow | null> {
  const row = await db.teamProfile.findUnique({
    where: { userId },
    select: teamSelect,
  });
  return row;
}

export async function listTeamMembers(filter: {
  serviceLine?: ServiceLine;
  role?: "ADMIN" | "MANAGER" | "SERVICE_LEAD" | "MEMBER";
  activeOnly?: boolean;
}): Promise<TeamUserRow[]> {
  const rows = await db.user.findMany({
    where: {
      ...(filter.activeOnly === false ? {} : { status: "ACTIVE" as const }),
      ...(filter.role === undefined ? {} : { role: filter.role }),
      teamProfile: {
        ...(filter.serviceLine === undefined
          ? {}
          : { serviceLines: { has: filter.serviceLine } }),
      },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      teamProfile: { select: teamSelect },
    },
  });
  return rows
    .filter((row): row is typeof row & { teamProfile: TeamProfileRow } => row.teamProfile !== null)
    .map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      status: row.status,
      ...row.teamProfile,
    }));
}

export async function updateTeamProfileRow(
  tx: Tx,
  userId: string,
  patch: Partial<Omit<TeamProfileRow, "userId" | "currentLoad">>,
): Promise<TeamProfileRow> {
  const row = await tx.teamProfile.update({
    where: { userId },
    data: patch,
    select: teamSelect,
  });
  return row;
}

export async function countActiveAssignments(userId: string): Promise<number> {
  return db.handoffAssignment.count({
    where: { assignedUserId: userId, acknowledgedAt: null },
  });
}

export async function setCurrentLoad(tx: Tx, userId: string, load: number): Promise<void> {
  await tx.teamProfile.update({ where: { userId }, data: { currentLoad: load } });
}

export async function aggregateLineCapacity(
  serviceLine: ServiceLine,
): Promise<{ capacity: number; load: number; available: number }> {
  const rows = await db.teamProfile.findMany({
    where: {
      serviceLines: { has: serviceLine },
      user: { status: "ACTIVE" },
    },
    select: { weeklyCapacity: true, currentLoad: true },
  });
  const capacity = rows.reduce((sum, row) => sum + row.weeklyCapacity, 0);
  const load = rows.reduce((sum, row) => sum + row.currentLoad, 0);
  return { capacity, load, available: Math.max(0, capacity - load) };
}
