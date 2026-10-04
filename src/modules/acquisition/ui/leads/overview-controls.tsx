"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

import { ConfirmDialog } from "@/components/admin";
import { Button } from "@/components/ui/button";

import { acceptReviewAction, overrideReviewAction, regenerateBriefAction } from "./detail-actions";

export function RegenerateBriefButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      loading={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await regenerateBriefAction(leadId);
          if (result.ok) {
            toast.success("Brief regenerated.");
            router.refresh();
          } else {
            toast.error(result.error.message);
          }
        });
      }}
    >
      <RefreshCw aria-hidden className="size-4" />
      Regenerate brief
    </Button>
  );
}

/** Accept the borderline review's recommendation, or override it with a note. */
export function ReviewDecision({
  leadId,
  recommendation,
}: {
  leadId: string;
  recommendation: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [override, setOverride] = useState<"QUALIFY" | "DISQUALIFY" | null>(null);
  // Overriding means deciding the opposite of what was recommended.
  const opposite = recommendation === "QUALIFY" ? "DISQUALIFY" : "QUALIFY";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        loading={pending}
        onClick={() => {
          startTransition(async () => {
            const result = await acceptReviewAction(leadId);
            if (result.ok) {
              toast.success("Recommendation accepted.");
              router.refresh();
            } else {
              toast.error(result.error.message);
            }
          });
        }}
      >
        Accept recommendation
      </Button>
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => {
          setOverride(opposite);
        }}
      >
        {opposite === "QUALIFY" ? "Override: qualify" : "Override: disqualify"}
      </Button>

      <ConfirmDialog
        open={override !== null}
        onOpenChange={(next) => {
          if (!next) setOverride(null);
        }}
        title={
          override === "QUALIFY" ? "Qualify this lead anyway?" : "Disqualify this lead anyway?"
        }
        description="Say why you are deciding against the recommendation. The note is kept with the review."
        confirmLabel="Override"
        requireReason
        reasonLabel="Note"
        onConfirm={async (note) => {
          const result = await overrideReviewAction(leadId, override ?? opposite, note);
          if (result.ok) {
            toast.success("Review overridden.");
            router.refresh();
          }
          return result;
        }}
      />
    </div>
  );
}
