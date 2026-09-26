import { Prisma } from "@/generated/prisma/client";

/**
 * The only soft-deletable models (project-rules §"Soft-delete policy", data-model §2).
 * Every other model is closed by status, append-only, or deleted by an explicit purge.
 */
export const SOFT_DELETE_MODELS: ReadonlySet<string> = new Set([
  "Company",
  "Contact",
  "FileObject",
]);

const READ_OPERATIONS: ReadonlySet<string> = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Adds `deletedAt: null` to a read's `where`, unless the caller set `deletedAt` itself (for
 * example `{ deletedAt: { not: null } }` to list deleted rows).
 */
function excludeDeleted(args: unknown): void {
  if (!isRecord(args)) return;
  const where = args.where;
  if (where === undefined) args.where = { deletedAt: null };
  else if (isRecord(where) && !("deletedAt" in where)) args.where = { ...where, deletedAt: null };
}

/**
 * Default scoping: reads of Company, Contact and FileObject never return soft-deleted rows.
 * Relation includes (a lead's company) are not filtered, so history stays readable. Writes are
 * untouched: soft-deleting is an explicit `update({ data: { deletedAt } })`.
 */
export const softDelete = Prisma.defineExtension({
  name: "soft-delete",
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        if (SOFT_DELETE_MODELS.has(model) && READ_OPERATIONS.has(operation)) excludeDeleted(args);
        return query(args);
      },
    },
  },
});
