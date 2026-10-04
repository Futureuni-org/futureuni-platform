"use server";

/**
 * CSV import actions: validate a mapping against the uploaded text (pure `previewCsv`), and commit
 * the import after the lawful-collection attestation. The file is stored through `@/platform/storage`
 * so the attestation can reference a real `FileObject` (INV-10); `importCsv` re-reads the canonical
 * stored copy by key.
 */

import { randomUUID } from "node:crypto";

import { AppError } from "@/lib/errors";
import { ok, err, type ActionResult } from "@/lib/result";
import { actorOf, assertCan, requireUser } from "@/platform/auth";
import { putFile } from "@/platform/storage";
import {
  CSV_FIELDS,
  csvErrorReport,
  importCsv,
  previewCsv,
  type ColumnMapping,
  type CsvField,
  type CsvPreview,
} from "@/modules/acquisition/sourcing";
import { resolveLine } from "@/modules/acquisition/ui/shell";

import { CSV_ATTESTATION_STATEMENT } from "./types";

const FIELD_SET = new Set<string>(CSV_FIELDS);

function cleanMapping(raw: Record<string, string>): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const [header, field] of Object.entries(raw)) {
    if (FIELD_SET.has(field)) mapping[header] = field as CsvField;
  }
  return mapping;
}

export async function previewCsvAction(
  slug: string,
  content: string,
  mapping: Record<string, string>,
): Promise<ActionResult<{ preview: CsvPreview; errorReport: string | null }>> {
  try {
    const user = await requireUser();
    const ctx = resolveLine(slug);
    if (ctx === null) return err(new AppError("NOT_FOUND", "Unknown service line."));
    assertCan(user, "acquisition.import.run", { serviceLine: ctx.line });

    const preview = previewCsv(content, cleanMapping(mapping));
    const errorReport = preview.errors.length > 0 ? csvErrorReport(preview.header, preview.errors) : null;
    return ok({ preview, errorReport });
  } catch (error) {
    return err(error);
  }
}

export async function commitImportAction(
  slug: string,
  formData: FormData,
): Promise<ActionResult<{ runId: string }>> {
  try {
    const user = await requireUser();
    const ctx = resolveLine(slug);
    if (ctx === null) return err(new AppError("NOT_FOUND", "Unknown service line."));
    assertCan(user, "acquisition.import.run", { serviceLine: ctx.line });

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return err(new AppError("VALIDATION_FAILED", "No CSV file was provided."));
    }
    const attested = formData.get("attested") === "true";
    if (!attested) {
      return err(new AppError("VALIDATION_FAILED", "Tick the confirmation to import."));
    }
    const mappingRaw = formData.get("mapping");
    let mapping: ColumnMapping = {};
    if (typeof mappingRaw === "string") {
      try {
        mapping = cleanMapping(JSON.parse(mappingRaw) as Record<string, string>);
      } catch {
        return err(new AppError("VALIDATION_FAILED", "The column mapping was malformed."));
      }
    }

    const body = Buffer.from(await file.arrayBuffer());
    const stored = await putFile({
      key: `csv-import/${ctx.line.toLowerCase()}/${randomUUID()}.csv`,
      body,
      contentType: "text/csv",
      access: "PRIVATE",
      purpose: "CSV_IMPORT",
      uploaderId: user.id,
      module: "acquisition",
      originalFilename: file.name,
    });

    const result = await importCsv(actorOf(user), {
      serviceLine: ctx.line,
      mapping,
      attestation: {
        statement: CSV_ATTESTATION_STATEMENT,
        attestedById: user.id,
        fileObjectId: stored.id,
      },
      fileKey: stored.key,
    });
    return ok({ runId: result.searchRun.id });
  } catch (error) {
    return err(error);
  }
}
