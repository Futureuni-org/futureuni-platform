import "server-only";

import type { JobResult } from "@/contracts/jobs";
import { db } from "@/platform/db";
import { getSetting } from "@/platform/settings";

export async function runRetentionPurge(): Promise<JobResult> {
  const now = new Date();
  // Expired files: FileObject.retentionUntil past now → soft delete.
  const expiredFiles = await db.fileObject.updateMany({
    where: { retentionUntil: { lt: now }, deletedAt: null },
    data: { deletedAt: now },
  });

  // Job-runs cleanup uses its own job; here we only handle audit log if configured.
  const auditMonths = await getSetting<number | null>("platform.retention.auditLogMonths");
  let auditDeleted = 0;
  if (auditMonths !== null) {
    const cutoff = new Date(now.getTime() - auditMonths * 30 * 24 * 60 * 60 * 1000);
    const { count } = await db.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    auditDeleted = count;
  }

  return { counts: { filesExpired: expiredFiles.count, auditDeleted } };
}
