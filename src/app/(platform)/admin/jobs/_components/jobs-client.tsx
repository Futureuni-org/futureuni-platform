"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cancelJobAction, retryJobAction, runScheduleNowAction } from "../actions";

export function RunActions({
  jobRunId,
  status,
  canRetry,
  canCancel,
}: {
  jobRunId: string;
  status: string;
  canRetry: boolean;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const retryable = status === "FAILED" || status === "CANCELLED";
  const cancellable = status === "QUEUED" || status === "RUNNING";

  function retry() {
    startTransition(async () => {
      const result = await retryJobAction(jobRunId);
      if (result.ok) { toast.success("Job re-queued."); router.refresh(); }
      else toast.error(result.error.message);
    });
  }
  function cancel() {
    startTransition(async () => {
      const result = await cancelJobAction(jobRunId);
      if (result.ok) { toast.success("Job cancelled."); router.refresh(); }
      else toast.error(result.error.message);
    });
  }

  if (!(canRetry && retryable) && !(canCancel && cancellable)) return null;
  return (
    <div className="flex justify-end gap-1">
      {canRetry && retryable && (
        <Button variant="ghost" size="sm" onClick={retry} disabled={pending}>Retry</Button>
      )}
      {canCancel && cancellable && (
        <Button variant="ghost" size="sm" className="text-danger" onClick={cancel} disabled={pending}>Cancel</Button>
      )}
    </div>
  );
}

export function RunNowButton({ jobName, input }: { jobName: string; input: unknown }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function run() {
    startTransition(async () => {
      const result = await runScheduleNowAction(jobName, input);
      if (result.ok) {
        toast.success(result.data.deduplicated ? "Already queued." : "Job queued.");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }
  return (
    <Button variant="secondary" size="sm" onClick={run} loading={pending}>Run now</Button>
  );
}
