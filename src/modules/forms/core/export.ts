/**
 * Export one submitted brief as a real `.xlsx` file (docs/specs/module-forms.md §6).
 *
 * `.xlsx` not `.csv` because contact details — phone numbers that start with `+`, pasted URLs,
 * decimal durations — need their type preserved. Excel also auto-strips a leading apostrophe from
 * a CSV cell and may interpret long digit strings as scientific notation; both bite the team the
 * one time it matters. Each export opens with the brief as rows, plus a Meta sheet with the
 * contact snapshot and the submission id — enough for traceability without exposing a route id.
 */

import "server-only";

import ExcelJS from "exceljs";

import type { FormDefinition, FormSubmissionRecord } from "@/contracts/forms";

import { answerToText, normalizeAnswers } from "./answers";

/** The FUTUREUNI header fill (deep navy from `--sidebar`), hard-coded here — Excel can't read tokens. */
const HEADER_FILL = "FF0C1148";
const HEADER_INK = "FFFFFFFF";

/**
 * Returns the `.xlsx` bytes for one submission. The caller sets the HTTP response headers and
 * decides who's allowed to download it (route handler enforces `forms.submission.export`).
 */
export async function submissionToXlsx(
  definition: FormDefinition,
  submission: FormSubmissionRecord,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FUTUREUNI";
  workbook.created = new Date();

  // Excel limits sheet names to 31 characters and forbids `: \ / ? * [ ]`.
  const sheetName = sanitiseSheetName(definition.title);
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "Section", key: "section", width: 28 },
    { header: "Question", key: "question", width: 44 },
    { header: "Answer", key: "answer", width: 72 },
  ];
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: HEADER_INK } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  header.alignment = { vertical: "middle" };

  const answers = normalizeAnswers(definition, submission.answers);
  for (const section of definition.sections) {
    for (const field of section.fields) {
      const value = answerToText(answers[field.key]);
      const row = sheet.addRow({
        section: section.title,
        question: field.label,
        answer: value === "" ? null : value,
      });
      row.getCell("answer").alignment = { wrapText: true, vertical: "top" };
      if (value === "") row.getCell("answer").font = { italic: true, color: { argb: "FF7C81A0" } };
    }
  }

  // The brief as a human sheet; a smaller Meta sheet with the context the team needs.
  const meta = workbook.addWorksheet("Meta", { views: [{ state: "frozen", ySplit: 1 }] });
  meta.columns = [
    { header: "Field", key: "k", width: 24 },
    { header: "Value", key: "v", width: 60 },
  ];
  const metaHeader = meta.getRow(1);
  metaHeader.font = { bold: true, color: { argb: HEADER_INK } };
  metaHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  for (const [k, v] of [
    ["Form", definition.title],
    ["Form slug", definition.slug],
    ["Form version", submission.formVersion.toString()],
    ["Contact name", submission.contactName ?? ""],
    ["Contact email", submission.contactEmail ?? ""],
    ["Submitted (UTC)", submission.submittedAt.toISOString()],
    ["Submission id", submission.id],
  ]) {
    meta.addRow({ k, v });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** A download filename that is safe on Windows / macOS and tells the team what they got. */
export function exportFilename(
  definition: FormDefinition,
  submission: FormSubmissionRecord,
): string {
  const who = (submission.contactName ?? "response")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const when = submission.submittedAt.toISOString().slice(0, 10);
  return `${definition.slug}-${who || "response"}-${when}.xlsx`;
}

function sanitiseSheetName(name: string): string {
  return (
    name
      .replace(/[:\\/?*[\]]/g, " ")
      .slice(0, 31)
      .trim() || "Brief"
  );
}
