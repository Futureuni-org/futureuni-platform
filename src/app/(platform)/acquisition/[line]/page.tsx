import { notFound, redirect } from "next/navigation";

import { actorOf, canFromUser, requireUser } from "@/platform/auth";
import { getReviewQueue } from "@/modules/acquisition/outreach";
import { resolveLine, lineHref } from "@/modules/acquisition/ui/shell";

/**
 * R-A3: `/acquisition/[line]` redirects to Review when the queue has items for the viewer, else to
 * Search. A viewer who can only read the line (a SERVICE_LEAD outside their own lines) goes to
 * Leads.
 */

export default async function LineIndexPage({
  params,
}: {
  params: Promise<{ line: string }>;
}): Promise<never> {
  const { line: slug } = await params;
  const ctx = resolveLine(slug);
  if (ctx === null) notFound();

  const user = await requireUser();

  if (!canFromUser(user, "acquisition.review.read", { serviceLine: ctx.line })) {
    redirect(lineHref(ctx.line, "leads"));
  }

  let hasItems = false;
  try {
    const { items } = await getReviewQueue(actorOf(user), {
      serviceLine: ctx.line,
      limit: 1,
      ...(user.role === "MEMBER" ? { ownerId: user.id } : {}),
    });
    hasItems = items.length > 0;
  } catch {
    hasItems = false;
  }

  redirect(lineHref(ctx.line, hasItems ? "review" : "search"));
}
