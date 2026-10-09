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

import { updateOwnProfile } from "@/app/(platform)/settings/profile.repo";

import { avatarKey, avatarUrl } from "./key";

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

    // A URL, not a key: every place that renders `User.image` (settings, the user menu, lead
    // owners) already treats it as an image source and needs no change.
    const url = avatarUrl(user.id, Date.now());
    await updateOwnProfile(actorOf(user), user.id, { image: url });
    revalidatePath("/settings");

    return Response.json({ url, key: saved.key });
  } catch (error) {
    return errorResponse(error);
  }
}
