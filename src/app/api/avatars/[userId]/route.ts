import "server-only";

/**
 * Serves a user's avatar from the private Blob store (Vercel Blob is private by default here, so
 * the object has no public URL, and `img-src 'self'` in the proxy's CSP would refuse a remote one
 * anyway). Same-origin bytes satisfy both, and the local driver works through the same path.
 *
 * Any signed-in user may read any user's avatar: faces appear beside colleagues' names in the
 * leads table and the lead side rail, not only in your own settings.
 */

import { errorResponse } from "@/lib/errors";
import { getCurrentUser } from "@/platform/auth";
import { db } from "@/platform/db";
import { readFile } from "@/platform/storage";

import { avatarKey } from "../key";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ userId: string }>;
}

export async function GET(_request: Request, ctx: RouteContext): Promise<Response> {
  try {
    // `getCurrentUser`, not `requireUser`: the latter redirects to /login, and an <img> that
    // follows a redirect to an HTML page renders as a broken image instead of failing cleanly.
    const viewer = await getCurrentUser();
    if (viewer === null) {
      return Response.json(
        { error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } },
        { status: 401 },
      );
    }

    const { userId } = await ctx.params;
    const key = avatarKey(userId);
    const file = await db.fileObject.findFirst({
      where: { key, deletedAt: null },
      select: { contentType: true },
    });
    if (file === null) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: "No avatar for that user." } },
        { status: 404 },
      );
    }

    const bytes = await readFile(key);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": file.contentType,
        // Private: it is one person's face behind a session. The URL carries a `v` stamp that
        // changes on every upload, so a cached copy is replaced as soon as the avatar is.
        "cache-control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
