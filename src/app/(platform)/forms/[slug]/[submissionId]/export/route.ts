/**
 * `/forms/<slug>/<submissionId>/export` — download one brief as `.xlsx`.
 *
 * Guarded by `forms.submission.export` on the active session; a browser without a cookie is
 * redirected to `/login` by `src/proxy.ts` long before this handler sees the request. The export
 * code (`@/modules/forms/core/export`) is pure; this file is just the HTTP shell around it.
 */

import type { NextRequest } from "next/server";

import { AppError, errorResponse } from "@/lib/errors";
import { canFromUser, requireUser } from "@/platform/auth";
import { submissionToXlsx, exportFilename } from "@/modules/forms/core/export";
import { getFormSubmission } from "@/modules/forms/core/submissions";
import { getForm } from "@/modules/forms/definitions";

interface RouteParams {
  params: Promise<{ slug: string; submissionId: string }>;
}

export async function GET(_: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const user = await requireUser();
    if (!canFromUser(user, "forms.submission.export")) {
      throw new AppError("FORBIDDEN", "You cannot export briefs.");
    }
    const { slug, submissionId } = await params;
    const definition = getForm(slug);
    if (definition === undefined) throw new AppError("NOT_FOUND");

    const submission = await getFormSubmission(slug, submissionId);
    if (submission === null) throw new AppError("NOT_FOUND");

    const buffer = await submissionToXlsx(definition, submission);
    const filename = exportFilename(definition, submission);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
