"use server";

/**
 * Server actions for the data-subject-requests admin screen. saas-api shape; the compliance
 * service owns authorisation (`acquisition.dsr.manage`, ADMIN) and auditing.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AppError } from "@/lib/errors";
import { ok, err, type ActionResult } from "@/lib/result";
import { actorOf, requireUser } from "@/platform/auth";
import {
  createDataSubjectRequest,
  fulfilExport,
  fulfilDelete,
} from "@/modules/acquisition/compliance";

function fail(issues: unknown): AppError {
  return new AppError("VALIDATION_FAILED", "Please check the form and try again.", {
    details: { issues },
  });
}

const CreateSchema = z
  .object({
    type: z.enum(["EXPORT", "DELETE"]),
    email: z.email().optional().or(z.literal("")),
    phone: z.string().trim().max(32).optional().or(z.literal("")),
    requestedBy: z.string().trim().min(1).max(200),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine((v) => (v.email ?? "") !== "" || (v.phone ?? "") !== "", {
    message: "Provide an email or a phone number",
    path: ["email"],
  });

export async function createDsrAction(
  input: z.input<typeof CreateSchema>,
): Promise<ActionResult<{ id: string; status: string }>> {
  try {
    const actor = actorOf(await requireUser());
    const parsed = CreateSchema.safeParse(input);
    if (!parsed.success) return err(fail(parsed.error.issues));
    const { type, email, phone, requestedBy, notes } = parsed.data;
    const result = await createDataSubjectRequest(actor, {
      type,
      ...(email !== undefined && email !== "" ? { email } : {}),
      ...(phone !== undefined && phone !== "" ? { phone } : {}),
      requestedBy,
      ...(notes === undefined || notes === "" ? {} : { notes }),
    });
    revalidatePath("/admin/data-requests");
    return ok(result);
  } catch (error) {
    return err(error);
  }
}

export async function fulfilExportAction(id: string): Promise<ActionResult<{ url: string }>> {
  try {
    const actor = actorOf(await requireUser());
    const parsed = z.object({ id: z.string().min(1) }).safeParse({ id });
    if (!parsed.success) return err(fail(parsed.error.issues));
    const result = await fulfilExport(actor, parsed.data.id);
    revalidatePath("/admin/data-requests");
    return ok(result);
  } catch (error) {
    return err(error);
  }
}

export async function fulfilDeleteAction(
  id: string,
): Promise<ActionResult<{ anonymisedContacts: number }>> {
  try {
    const actor = actorOf(await requireUser());
    const parsed = z.object({ id: z.string().min(1) }).safeParse({ id });
    if (!parsed.success) return err(fail(parsed.error.issues));
    const result = await fulfilDelete(actor, parsed.data.id);
    revalidatePath("/admin/data-requests");
    return ok(result);
  } catch (error) {
    return err(error);
  }
}
