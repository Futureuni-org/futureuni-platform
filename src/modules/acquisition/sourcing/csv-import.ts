import "server-only";

/**
 * CSV import (Phase 8, source-adapter.md rule 12): column mapping, row-level validation, the
 * lawful-collection attestation (purchased lists are banned), and a downloadable error report.
 * Valid rows run through the same pipeline as a search, creating companies, signals and `NEW`
 * leads. The market is derived per row.
 */

import type { Actor, ServiceLine } from "@/contracts/common";
import { CsvAttestationSchema, type CsvAttestation, type RawSignal } from "@/contracts/source-adapter";
import { AppError } from "@/lib/errors";
import { assertActorCan } from "@/platform/auth";
import { db, type SearchRun } from "@/platform/db";
import { readFile } from "@/platform/storage";

import { parseCsv, toCsv } from "./adapters/csv-import/parse-csv";
import { emptyCounts, processRawSignal, type PipelineContext } from "./pipeline";
import { getSourcingSetting } from "./settings";
import { createSearchRun, finishSearchRun } from "./sourcing.repo";

export const CSV_FIELDS = [
  "companyName",
  "website",
  "phone",
  "email",
  "contactName",
  "contactRole",
  "city",
  "country",
  "notes",
] as const;
export type CsvField = (typeof CSV_FIELDS)[number];

export type ColumnMapping = Record<string, CsvField>;

export interface CsvRowError {
  rowNumber: number; // 1-based data row (excludes the header)
  reasons: string[];
  cells: string[];
}

export interface ParsedCsvRow {
  rowNumber: number;
  values: Partial<Record<CsvField, string>>;
}

export interface CsvPreview {
  header: string[];
  totalRows: number;
  validRows: ParsedCsvRow[];
  errors: CsvRowError[];
}

/** Parses and validates a CSV against the mapping. A valid row needs a company name and one of */
/** website, phone or email. */
export function previewCsv(content: string, mapping: ColumnMapping): CsvPreview {
  const rows = parseCsv(content);
  const header = rows[0] ?? [];
  const dataRows = rows.slice(1);
  const columnIndex = new Map<CsvField, number>();
  header.forEach((name, index) => {
    const field = mapping[name];
    if (field !== undefined) columnIndex.set(field, index);
  });

  const validRows: ParsedCsvRow[] = [];
  const errors: CsvRowError[] = [];
  dataRows.forEach((cells, i) => {
    const rowNumber = i + 1;
    if (cells.every((c) => c.trim() === "")) return; // skip blank lines
    const values: Partial<Record<CsvField, string>> = {};
    for (const [field, index] of columnIndex) {
      const value = (cells[index] ?? "").trim();
      if (value !== "") values[field] = value;
    }
    const reasons: string[] = [];
    if (values.companyName === undefined) reasons.push("Missing company name");
    if (values.website === undefined && values.phone === undefined && values.email === undefined) {
      reasons.push("Needs a website, phone or email");
    }
    if (reasons.length > 0) errors.push({ rowNumber, reasons, cells });
    else validRows.push({ rowNumber, values });
  });

  return { header, totalRows: dataRows.length, validRows, errors };
}

/** A CSV of the rejected rows plus a reason column, for download (source-adapter.md rule 12). */
export function csvErrorReport(header: string[], errors: readonly CsvRowError[]): string {
  const rows: string[][] = [[...header, "error"]];
  for (const error of errors) rows.push([...error.cells, error.reasons.join("; ")]);
  return toCsv(rows);
}

function rowToSignals(row: ParsedCsvRow, signalTypes: readonly string[], now: Date): RawSignal[] {
  const base = {
    adapterId: "csv-import" as const,
    companyName: row.values.companyName ?? "",
    ...(row.values.website === undefined ? {} : { website: row.values.website }),
    ...(row.values.phone === undefined ? {} : { phone: row.values.phone }),
    ...(row.values.email === undefined ? {} : { email: row.values.email }),
    ...(row.values.country === undefined && row.values.city === undefined
      ? {}
      : {
          address: {
            ...(row.values.city === undefined ? {} : { city: row.values.city }),
            ...(row.values.country === undefined ? {} : { country: row.values.country }),
          },
        }),
    ...(row.values.country === undefined ? {} : { country: row.values.country }),
    contact:
      row.values.contactName === undefined &&
      row.values.contactRole === undefined &&
      row.values.email === undefined
        ? undefined
        : {
            ...(row.values.contactName === undefined ? {} : { name: row.values.contactName }),
            ...(row.values.contactRole === undefined ? {} : { role: row.values.contactRole }),
            ...(row.values.email === undefined ? {} : { email: row.values.email }),
          },
    observedAt: now.toISOString(),
  };
  const types = ["manual_lead", ...signalTypes.filter((t) => t !== "manual_lead")];
  return types.map((signalType) => ({
    ...base,
    signalType,
    evidenceText:
      signalType === "manual_lead"
        ? "Imported from a lawfully-collected CSV list."
        : `Imported from CSV; the uploader marked this business as "${signalType}".`,
  }));
}

export interface ImportCsvInput {
  serviceLine: ServiceLine;
  mapping: ColumnMapping;
  /** `statement` is free text from the uploader; it must match the fixed wording exactly. */
  attestation: { statement: string; attestedById: string; fileObjectId: string };
  /** Profile signal ids the uploader asserts for every row (besides the reserved manual_lead). */
  signalTypes?: string[];
  /** Inline content (tests), or a storage key to read the uploaded file from. */
  content?: string;
  fileKey?: string;
}

export interface ImportCsvResult {
  searchRun: SearchRun;
  preview: CsvPreview;
  errorReport: string | null;
}

export async function importCsv(actor: Actor, input: ImportCsvInput): Promise<ImportCsvResult> {
  await assertActorCan(actor, "acquisition.import.run", { serviceLine: input.serviceLine });

  // The attestation is mandatory and its wording is fixed (purchased lists are banned).
  if (input.attestation.statement !== CsvAttestationSchema.shape.statement.value) {
    throw new AppError("VALIDATION_FAILED", "A valid lawful-collection attestation is required.");
  }

  const content = input.content ?? (await readFile(input.fileKey ?? "")).toString("utf8");
  const maxRows = await getSourcingSetting("maxCsvRows");
  const preview = previewCsv(content, input.mapping);
  if (preview.totalRows > maxRows) {
    throw new AppError("PAYLOAD_TOO_LARGE", `This import has more than the ${String(maxRows)}-row limit.`, {
      details: { maxRows, rows: preview.totalRows },
    });
  }

  const now = new Date();
  const attestation: CsvAttestation = {
    statement: CsvAttestationSchema.shape.statement.value,
    attestedById: input.attestation.attestedById,
    attestedAt: now.toISOString(),
    fileObjectId: input.attestation.fileObjectId,
    rowCount: Math.max(1, preview.validRows.length),
  };

  const searchRun = await createSearchRun(db, {
    serviceLine: input.serviceLine,
    markets: ["NIGERIA", "INTERNATIONAL"],
    spec: { serviceLine: input.serviceLine, source: "csv-import", mapping: input.mapping },
    trigger: "CSV_IMPORT",
    actor,
    status: "RUNNING",
    attestation,
    csvFileId: input.attestation.fileObjectId,
    startedAt: now,
  });

  const allowed = await allowedSignalTypesFor(input.serviceLine, input.signalTypes ?? []);
  const counts = emptyCounts();
  const started = Date.now();
  const pctx: PipelineContext = {
    searchRunId: searchRun.id,
    serviceLine: input.serviceLine,
    requestedMarkets: ["NIGERIA", "INTERNATIONAL"],
    fallbackMarket: "NIGERIA",
    actor,
    clock: { now: () => new Date() },
    counts,
    allowedSignalTypes: allowed,
    sourceId: "csv-import",
    log: { warn: () => undefined },
  };

  for (const row of preview.validRows) {
    counts.fetched += 1;
    for (const signal of rowToSignals(row, input.signalTypes ?? [], now)) {
      await processRawSignal(signal, pctx);
    }
  }

  const finished = await finishSearchRun(searchRun.id, {
    status: "SUCCEEDED",
    counts: { ...counts },
    perSource: [
      {
        adapterId: "csv-import",
        market: "NIGERIA",
        status: "DONE",
        fetched: preview.validRows.length,
        calls: 0,
        costMicros: 0,
      },
    ],
    costMicros: 0,
    durationMs: Date.now() - started,
  });

  return {
    searchRun: finished,
    preview,
    errorReport: preview.errors.length === 0 ? null : csvErrorReport(preview.header, preview.errors),
  };
}

async function allowedSignalTypesFor(
  serviceLine: ServiceLine,
  selected: readonly string[],
): Promise<Set<string>> {
  const allowed = new Set<string>(["manual_lead", ...selected]);
  try {
    const { getActiveProfile } = await import("@/modules/acquisition/profiles");
    const profile = await getActiveProfile(serviceLine);
    for (const signal of profile.signals) allowed.add(signal.id);
  } catch {
    // No active profile in this environment: manual_lead plus the uploader's selections stand.
  }
  return allowed;
}
