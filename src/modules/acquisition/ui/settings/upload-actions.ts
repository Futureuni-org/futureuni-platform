"use server";

/**
 * Portfolio media upload for the profile editor. Uploads through `@/platform/storage` with purpose
 * PORTFOLIO and returns the stored key (persisted on the portfolio item) plus a signed URL for an
 * immediate preview. Gated by `acquisition.profile.edit` on the line.
 */

import { randomUUID } from "node:crypto";

import { AppError } from "@/lib/errors";
import { ok, err, type ActionResult } from "@/lib/result";
import { assertCan, requireUser } from "@/platform/auth";
import { getSignedUrl, putFile } from "@/platform/storage";
import { resolveLine } from "@/modules/acquisition/ui/settings/_seams";

export async function uploadPortfolioMediaAction(
  slug: string,
  formData: FormData,
): Promise<ActionResult<{ key: string; url: string }>> {
  try {
    const user = await requireUser();
    const ctx = resolveLine(slug);
    if (ctx === null) return err(new AppError("NOT_FOUND", "Unknown service line."));
    assertCan(user, "acquisition.profile.edit", { serviceLine: ctx.line });

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return err(new AppError("VALIDATION_FAILED", "No file was provided."));
    }
    const ext = file.name.includes(".") ? (file.name.split(".").pop() ?? "bin") : "bin";
    const key = `portfolio/${ctx.line.toLowerCase()}/${randomUUID()}.${ext}`;
    const body = Buffer.from(await file.arrayBuffer());
    const saved = await putFile({
      key,
      body,
      contentType: file.type.length > 0 ? file.type : "application/octet-stream",
      access: "PUBLIC",
      purpose: "PORTFOLIO",
      uploaderId: user.id,
      module: "acquisition",
      originalFilename: file.name,
    });
    const url = await getSignedUrl(saved.key, 3600);
    return ok({ key: saved.key, url });
  } catch (error) {
    return err(error);
  }
}

export async function portfolioMediaUrlAction(key: string): Promise<ActionResult<{ url: string }>> {
  try {
    await requireUser();
    const url = await getSignedUrl(key, 3600);
    return ok({ url });
  } catch (error) {
    return err(error);
  }
}
