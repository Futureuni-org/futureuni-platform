"use client";

/**
 * The two things the team does to a submitted brief: download it as `.xlsx`, and (admin only)
 * delete it.
 *
 * Export is a plain `<a href="…/export">` with `download`: the route handler returns the file
 * with `Content-Disposition: attachment`, so the browser never navigates away. Delete is a
 * two-tap confirmation (same pattern as the public form's Clear button) that posts a server
 * action; on success the parent revalidates and the row disappears. A failure keeps the row and
 * surfaces the error inline — the user can retry or walk away without the row changing silently.
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Download, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

import { deleteSubmissionAction } from "@/app/(platform)/forms/[slug]/actions";

export interface ResponseActionsProps {
  slug: string;
  submissionId: string;
  canDelete: boolean;
  /** Compact buttons for the list row; full-size for the brief page header. */
  size?: "sm" | "md";
  className?: string;
  /** After a successful delete, where to send the viewer. On the list page this is unset. */
  redirectAfterDeleteTo?: string;
}

export function ResponseActions({
  slug,
  submissionId,
  canDelete,
  size = "sm",
  className,
  redirectAfterDeleteTo,
}: ResponseActionsProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const exportHref = `/forms/${slug}/${submissionId}/export`;

  function runDelete(): void {
    setError(null);
    startDelete(async () => {
      const result = await deleteSubmissionAction({ slug, submissionId });
      if (!result.ok) {
        setError(result.error.message);
        setConfirming(false);
        return;
      }
      if (redirectAfterDeleteTo !== undefined) {
        router.push(redirectAfterDeleteTo);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className={cn("flex flex-col items-start gap-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {/* The platform's Button has no `asChild`, so this is an `<a>` styled to match the
            secondary variant. `download` tells the browser to save instead of navigate, even when
            the server already sends Content-Disposition: attachment — belt and braces. */}
        <a
          href={exportHref}
          download
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-md text-sm font-semibold whitespace-nowrap transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "bg-surface text-foreground border border-input hover:bg-primary-soft",
            size === "sm" ? "h-9 px-3" : "h-12 px-5",
          )}
        >
          <Download aria-hidden className="size-4" />
          Export response to Excel
        </a>

        {canDelete &&
          (confirming ? (
            <>
              <Button
                variant="danger"
                size={size}
                loading={deleting}
                onClick={() => {
                  runDelete();
                }}
              >
                {deleting ? "Deleting" : "Yes, delete"}
              </Button>
              <Button
                variant="ghost"
                size={size}
                onClick={() => {
                  setConfirming(false);
                }}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size={size}
              onClick={() => {
                setConfirming(true);
                setError(null);
              }}
              aria-label="Delete this response"
            >
              <Trash2 aria-hidden className="size-4" />
              Delete
            </Button>
          ))}

        {deleting && !confirming && (
          <Loader2 aria-hidden className="size-4 animate-spin text-muted" />
        )}
      </div>

      {error !== null && (
        <p role="alert" className="text-sm font-medium text-danger">
          Couldn&apos;t delete: {error}
        </p>
      )}
    </div>
  );
}
