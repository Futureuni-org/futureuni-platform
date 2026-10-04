import { formatInTimeZone } from "date-fns-tz";

import { AppError, errorResponse } from "@/lib/errors";
import { getCurrentUser, canFromUser } from "@/platform/auth";
import { resolveLine } from "@/modules/acquisition/ui/leads/_seams";
import { parseLeadFilters } from "@/modules/acquisition/ui/leads/lead-filters";
import {
  EXPORT_ROW_LIMIT,
  listLeadsForExport,
  type LeadExportRow,
} from "@/modules/acquisition/ui/leads/leads-list.repo";

/**
 * CSV export of the filtered leads for a line (`acquisition.lead.export`). UTF-8 with a BOM, a
 * header row, ISO-8601 UTC timestamps (project-rules §"Output/document rules" → CSV exports). The
 * filters are the same ones the list shows, read in the viewer's timezone. An export larger than
 * `EXPORT_ROW_LIMIT` is cut to the newest rows and says so in its file name and a response header.
 */

const HEADERS = [
  "id",
  "company",
  "domain",
  "market",
  "status",
  "score",
  "scoreBand",
  "owner",
  "source",
  "nextActionAt",
  "createdAt",
] as const;

/** The byte-order mark that tells Excel the file is UTF-8. */
const BOM = String.fromCharCode(0xfeff);

/**
 * One CSV cell. Text is always quoted. Text that starts with `=`, `+`, `-`, `@`, a tab or a carriage
 * return gets a leading apostrophe: a spreadsheet runs such a cell as a formula, and company names,
 * domains and sources come from scraped pages and imports, so a company called `=HYPERLINK(...)`
 * would otherwise run on the machine of whoever opens the export.
 */
function cell(value: string | number | null): string {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${text.replace(/"/g, '""')}"`;
}

function toRow(lead: LeadExportRow): string {
  return [
    lead.id,
    lead.company,
    lead.domain,
    lead.market,
    lead.status,
    lead.score,
    lead.scoreBand,
    lead.owner,
    lead.source,
    lead.nextActionAt === null ? null : lead.nextActionAt.toISOString(),
    lead.createdAt.toISOString(),
  ]
    .map(cell)
    .join(",");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ line: string }> },
): Promise<Response> {
  try {
    const { line: slug } = await params;
    const ctx = resolveLine(slug);
    if (ctx === null) throw new AppError("NOT_FOUND");

    const user = await getCurrentUser();
    if (user === null) throw new AppError("UNAUTHENTICATED");
    if (!canFromUser(user, "acquisition.lead.export", { serviceLine: ctx.line })) {
      throw new AppError("FORBIDDEN");
    }

    const record: Record<string, string> = {};
    for (const [key, value] of new URL(request.url).searchParams.entries()) record[key] = value;
    const filter = parseLeadFilters(record, user.timezone);

    const { rows, truncated } = await listLeadsForExport(ctx.line, filter);
    const csv = BOM + [HEADERS.join(","), ...rows.map(toRow)].join("\r\n");

    const day = formatInTimeZone(new Date(), user.timezone, "yyyy-MM-dd");
    const suffix = truncated ? `-first-${String(EXPORT_ROW_LIMIT)}` : "";
    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="leads-${ctx.slug}-${day}${suffix}.csv"`,
        "cache-control": "no-store",
        "x-export-truncated": String(truncated),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
