/**
 * Capacity-based delivery-owner suggestion for a handoff (module spec §3.13 "Won"). The suggested
 * owner is the active member of the service line with the most headroom (`weeklyCapacity -
 * currentLoad`). A manager can override it with `assignHandoff`, after which `recalculateLoad`
 * (from `@/platform/team`) updates the assignee's load so Phase 11 throttling reacts.
 */

import "server-only";

import type { ServiceLine } from "@/contracts/common";

import { listLineMembersByCapacity } from "../pipeline.repo";

export async function suggestDeliveryOwner(serviceLine: ServiceLine): Promise<string | null> {
  const members = await listLineMembersByCapacity(serviceLine);
  return members[0]?.userId ?? null;
}
