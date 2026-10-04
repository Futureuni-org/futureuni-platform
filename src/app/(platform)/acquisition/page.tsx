import { redirect } from "next/navigation";

import { EmptyState } from "@/components/patterns/states";
import { PageHeader } from "@/components/patterns/page-header";
import { requireUser } from "@/platform/auth";
import { lineHref } from "@/modules/acquisition/ui/shell";

/**
 * R-A1: `/acquisition` redirects managers and admins to the cross-line Overview, and everyone else
 * to their first service line (which then redirects to Review or Search). A user on no line sees a
 * prompt to ask a manager.
 */

export default async function AcquisitionIndexPage(): Promise<React.ReactElement> {
  const user = await requireUser();

  if (user.role === "ADMIN" || user.role === "MANAGER") {
    redirect("/acquisition/overview");
  }

  const first = user.serviceLines[0];
  if (first !== undefined) {
    redirect(lineHref(first));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Client Acquisition" title="No service line yet" />
      <EmptyState
        title="You're not on a service line yet"
        description="Ask a manager to add you to a service line, then your work will appear here."
      />
    </div>
  );
}
