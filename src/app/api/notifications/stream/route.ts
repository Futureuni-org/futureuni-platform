/**
 * `GET /api/notifications/stream` — Phase 6.
 *
 * A polling endpoint the shell hits every N seconds. Returns the unread count and the latest N
 * notifications for the signed-in user. Uses the SEAM-PERMISSION stand-in until Phase 3 replaces
 * it with the real `getCurrentUser`.
 */

import "server-only";

import { errorResponse } from "@/lib/errors";
import { listForUser, unreadCount } from "@/platform/notifications";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    // Stand-in: read the user id from a header for now; Phase 3's session takes over at merge.
    const userId = request.headers.get("x-user-id");
    if (userId === null || userId === "") {
      return Response.json({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } }, { status: 401 });
    }
    const [count, page] = await Promise.all([unreadCount(userId), listForUser(userId, { unreadOnly: true, limit: 10 })]);
    return Response.json({ unreadCount: count, latest: page.items });
  } catch (error) {
    return errorResponse(error);
  }
}
