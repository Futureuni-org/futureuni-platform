"use client";

import { useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { exportAuditCsvAction } from "../actions";

/** Exports the current filtered audit range to a CSV the browser downloads. */
export function AuditExportButton() {
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function run() {
    const filters = {
      actorId: searchParams.get("actorId") ?? undefined,
      action: searchParams.get("action") ?? undefined,
      targetType: searchParams.get("targetType") ?? undefined,
      targetId: searchParams.get("targetId") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
    };
    startTransition(async () => {
      const result = await exportAuditCsvAction(filters);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      const blob = new Blob([result.data.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(
        `Exported ${String(result.data.rows)} entr${result.data.rows === 1 ? "y" : "ies"}.`,
      );
    });
  }

  return (
    <Button variant="secondary" size="sm" className="gap-2" onClick={run} loading={pending}>
      <Download aria-hidden className="size-4" />
      Export CSV
    </Button>
  );
}
