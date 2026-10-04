"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { ReplyClass } from "@/contracts/common";
import { ConfirmDialog, Select } from "@/components/admin";
import { statusMeta } from "@/components/ui/status-badge";

import { reclassifyReplyAction } from "./actions";
import { REPLY_CLASSES, reclassifyNotice } from "./inbox-types";

function classLabel(value: ReplyClass): string {
  return statusMeta("reply", value).label;
}

/**
 * Change a reply's class. Nothing changes until the consequence has been read and confirmed:
 * moving to "unsubscribe" suppresses the contact and stops outreach to the company; moving away
 * from it leaves the suppression in place for an admin to remove.
 */
export function ReclassifyControl({
  replyId,
  current,
}: {
  replyId: string;
  current: ReplyClass | null;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<ReplyClass | null>(null);
  const notice = target === null ? null : reclassifyNotice(current, target, classLabel);

  return (
    <>
      <label className="flex min-w-[12rem] flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-muted">Reply class</span>
        <Select
          aria-label="Reply class"
          value={current ?? ""}
          placeholder="Not classified"
          options={REPLY_CLASSES.map((value) => ({ value, label: classLabel(value) }))}
          onChange={(e) => {
            const next = REPLY_CLASSES.find((value) => value === e.target.value);
            if (next !== undefined && next !== current) setTarget(next);
          }}
        />
      </label>

      <ConfirmDialog
        open={notice !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        title={notice?.title ?? ""}
        description={notice?.consequence}
        confirmLabel={notice?.confirmLabel ?? "Reclassify"}
        tone={notice?.tone ?? "default"}
        onConfirm={async () => {
          if (target === null) return { ok: true, data: null };
          const result = await reclassifyReplyAction(replyId, target, null);
          if (result.ok) {
            toast.success(`Reclassified as ${classLabel(target).toLowerCase()}.`);
            router.refresh();
          }
          return result;
        }}
      />
    </>
  );
}
