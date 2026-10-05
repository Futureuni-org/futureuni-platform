/**
 * `GET /api/notifications/stream` — Phase 6.
 *
 * A polling endpoint the shell hits every N seconds. Returns the unread count and the latest N
 * notifications for the signed-in user, resolved from the session (Phase 19 replaced the Phase-6
 * `x-user-id` stand-in with the real `getCurrentUser`, so a client can never read another user's
 * notifications).
 */

import "server-only";

import { errorResponse } from "@/lib/errors";
import { getCurrentUser } from "@/platform/auth";
import { listForUser, unreadCount } from "@/platform/notifications";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (user === null) {
      return Response.json(
        { error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } },
        { status: 401 },
      );
    }
    const [count, page] = await Promise.all([
      unreadCount(user.id),
      listForUser(user.id, { unreadOnly: true, limit: 10 }),
    ]);
    return Response.json({ unreadCount: count, latest: page.items });
  } catch (error) {
    return errorResponse(error);
  }
}
