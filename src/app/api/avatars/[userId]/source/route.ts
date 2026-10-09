import "server-only";

/**
 * Serves the untouched image someone uploaded, so they can reopen their avatar and move or zoom
 * it without finding the original file again.
 *
 * SELF only, unlike the framed avatar: the framed square is a face shown beside a name all over
 * the product, while the original is whatever they happened to choose — more of it than they
 * decided to show, so only its owner gets it back.
 */

import { errorResponse } from "@/lib/errors";
import { getCurrentUser } from "@/platform/auth";
import { db } from "@/platform/db";
import { readFile } from "@/platform/storage";

import { avatarSourceKey } from "../../key";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ userId: string }>;
}

export async function GET(_request: Request, ctx: RouteContext): Promise<Response> {
  try {
    const viewer = await getCurrentUser();
    if (viewer === null) {
      return Response.json(
        { error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } },
        { status: 401 },
      );
    }

    const { userId } = await ctx.params;
    if (userId !== viewer.id) {
      // Not 403: someone else's original is not theirs to know about.
      return Response.json(
        { error: { code: "NOT_FOUND", message: "No image to adjust." } },
        { status: 404 },
      );
    }

    const key = avatarSourceKey(viewer.id);
    const file = await db.fileObject.findFirst({
      where: { key, deletedAt: null },
      select: { contentType: true },
    });
    if (file === null) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: "No image to adjust." } },
        { status: 404 },
      );
    }

    const bytes = await readFile(key);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": file.contentType,
        "cache-control": "private, max-age=3600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({ level: "error", msg: message, route: "GET /api/avatars/[userId]/source" }),
    );
    return errorResponse(error);
  }
}
