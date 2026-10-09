import "server-only";

/**
 * Uploads the signed-in user's avatar. A route handler rather than a server action, because only
 * a real request reports upload progress to the browser (`XMLHttpRequest.upload.onprogress`), and
 * the settings page shows a percentage. saas-api shape: authenticate → parse → authorize → store.
 *
 * SELF-scoped by construction: the key comes from the session, never from the request.
 */

import { revalidatePath } from "next/cache";

import { AppError, errorResponse } from "@/lib/errors";
import { actorOf, getCurrentUser } from "@/platform/auth";
import { putFile } from "@/platform/storage";
import { redactLogData } from "@/platform/audit-log/redact";

import { updateOwnProfile } from "@/app/(platform)/settings/profile.repo";

import { avatarKey, avatarSourceKey, avatarUrl } from "./key";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (user === null) {
      return Response.json(
        { error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } },
        { status: 401 },
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AppError("VALIDATION_FAILED", "No file provided.");
    }
    const contentType = file.type;
    if (!contentType.startsWith("image/")) {
      throw new AppError("UNSUPPORTED_MEDIA_TYPE", "Choose an image file.");
    }

    const key = avatarKey(user.id);
    // PRIVATE: the store is private, and `putFile` enforces the size and magic-byte checks.
    const saved = await putFile({
      key,
      body: Buffer.from(await file.arrayBuffer()),
      contentType,
      access: "PRIVATE",
      purpose: "AVATAR",
      uploaderId: user.id,
      originalFilename: file.name,
    });

    // The untouched original, when one is sent. Keeping it is what lets someone reopen their
    // avatar and move it later instead of hunting for the file again; a re-frame sends only the
    // framed image, so the source already on record stays as it is.
    const source = form.get("source");
    if (source instanceof File && source.type.startsWith("image/")) {
      await putFile({
        key: avatarSourceKey(user.id),
        body: Buffer.from(await source.arrayBuffer()),
        contentType: source.type,
        access: "PRIVATE",
        purpose: "AVATAR",
        uploaderId: user.id,
        originalFilename: source.name,
      });
    }

    // A URL, not a key: every place that renders `User.image` (settings, the user menu, lead
    // owners) already treats it as an image source and needs no change.
    const url = avatarUrl(user.id, Date.now());
    await updateOwnProfile(actorOf(user), user.id, { image: url });
    revalidatePath("/settings");

    return Response.json({ url, key: saved.key });
  } catch (error) {
    // Logged here as well as returned: `errorResponse` only shapes the body, so without this a
    // failed upload is invisible in the logs, which is exactly how the last two went unnoticed.
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({ level: "error", msg: redactLogData(message), route: "POST /api/avatars" }),
    );
    return errorResponse(error);
  }
}
