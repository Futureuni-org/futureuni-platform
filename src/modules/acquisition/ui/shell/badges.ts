"use server";

/**
 * Live section-badge counts for a line's section nav: items waiting in Review, actionable Inbox
 * replies, and overdue Pipeline next actions. Derived from existing services (there is no single
 * count endpoint yet — see `phases/15/REQUESTS.md`). Resilient: a failing source yields 0 for that
 * badge rather than breaking the nav. The nav polls this lightly and after mutations.
 */

import { ok, err, type ActionResult } from "@/lib/result";
import { AppError } from "@/lib/errors";
import { actorOf, requireUser } from "@/platform/auth";
import { getReviewQueue } from "@/modules/acquisition/outreach";
import { getInboxCounts } from "@/modules/acquisition/inbox";
import { getOverdueNextActions } from "@/modules/acquisition/pipeline";
import type { ServiceLine } from "@/contracts/common";

import { resolveLine } from "./line-context";
import type { SectionBadgeCounts } from "./sections";

const REVIEW_BADGE_CAP = 50;

async function reviewCount(
  user: Awaited<ReturnType<typeof requireUser>>,
  line: ServiceLine,
): Promise<{ count: number; more: boolean }> {
  try {
    const actor = actorOf(user);
    const { items, nextCursor } = await getReviewQueue(actor, {
      serviceLine: line,
      limit: REVIEW_BADGE_CAP,
      // Members can only read their own leads (OWN scope), so scope the fetch to them.
      ...(user.role === "MEMBER" ? { ownerId: user.id } : {}),
    });
    return { count: items.length, more: nextCursor !== null };
  } catch {
    return { count: 0, more: false };
  }
}

async function inboxCount(
  user: Awaited<ReturnType<typeof requireUser>>,
  line: ServiceLine,
): Promise<number> {
  try {
    const { byLine } = await getInboxCounts(actorOf(user), user.id);
    return byLine.find((l) => l.serviceLine === line)?.actionable ?? 0;
  } catch {
    return 0;
  }
}

async function pipelineCount(
  user: Awaited<ReturnType<typeof requireUser>>,
  line: ServiceLine,
): Promise<number> {
  try {
    const overdue = await getOverdueNextActions(actorOf(user));
    return overdue.filter((o) => o.serviceLine === line).length;
  } catch {
    return 0;
  }
}

export async function getSectionBadges(slug: string): Promise<ActionResult<SectionBadgeCounts>> {
  try {
    const user = await requireUser();
    const ctx = resolveLine(slug);
    if (ctx === null) return err(new AppError("NOT_FOUND", "Unknown service line."));

    const [review, inbox, pipeline] = await Promise.all([
      reviewCount(user, ctx.line),
      inboxCount(user, ctx.line),
      pipelineCount(user, ctx.line),
    ]);

    return ok({
      review: review.count,
      reviewMore: review.more,
      inbox,
      pipeline,
    });
  } catch (error) {
    return err(error);
  }
}
