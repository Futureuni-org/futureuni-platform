import type { z } from "zod";

/** The issue paths of a failed parse, as "a.b.0" strings (root issues as ""), for asserting. */
export function issuePaths(result: z.ZodSafeParseResult<unknown>): string[] {
  return result.success ? [] : result.error.issues.map((issue) => issue.path.map(String).join("."));
}
