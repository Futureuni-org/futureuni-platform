import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/patterns/page-header";
import { PermissionState } from "@/components/patterns/states";
import { canFromUser, requireUser } from "@/platform/auth";
import { resolveLine } from "@/modules/acquisition/ui/shell";
import { CsvImportClient } from "@/modules/acquisition/ui/search/csv-import-client";

export const metadata: Metadata = { title: "Import CSV" };

export default async function ImportPage({
  params,
}: {
  params: Promise<{ line: string }>;
}): Promise<React.ReactElement> {
  const { line: slug } = await params;
  const ctx = resolveLine(slug);
  if (ctx === null) notFound();

  const user = await requireUser();
  if (!canFromUser(user, "acquisition.import.run", { serviceLine: ctx.line })) {
    return (
      <PermissionState
        title="No access to import"
        description="Only leads and managers can import a CSV for their lines."
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <PageHeader
        eyebrow={ctx.label}
        title="Import a CSV"
        description="Bring in a lawfully collected list of businesses. They follow the same pipeline as a search."
      />
      <CsvImportClient slug={slug} line={ctx.line} />
    </div>
  );
}
