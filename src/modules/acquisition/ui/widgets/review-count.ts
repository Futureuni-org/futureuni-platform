import "server-only";

/**
 * The `acquisition.review-count` nav-badge resolver's data source (Phase 19). It shares
 * `countReviewQueueForUser` with the "My review queue" home widget, so the badge and the widget can
 * never disagree.
 */

import { countReviewQueueForUser } from "@/modules/acquisition/outreach";

export async function getReviewCountForUser(userId: string): Promise<number> {
  return countReviewQueueForUser(userId);
}
