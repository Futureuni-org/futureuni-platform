"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Inbox, Lock, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";

/**
 * States: EmptyState, ErrorState, PermissionState, OfflineBanner + Skeleton variants.
 * Every async view in the platform uses these. Illustration-free (saas-ui dashboards).
 */

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-4 rounded-lg border border-dashed border-border bg-surface px-6 py-10 text-left",
        className,
      )}
    >
      <span className="inline-flex size-10 items-center justify-center rounded-full bg-zone text-muted">
        <Icon aria-hidden className="size-5" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-display text-lg font-semibold text-heading">{title}</p>
        {description !== undefined && (
          <p className="max-w-prose text-sm text-muted">{description}</p>
        )}
      </div>
      {action !== undefined && <div>{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Something didn't load",
  description,
  detail,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  detail?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-4 rounded-lg border border-danger/40 bg-danger-soft/40 px-6 py-6 text-left",
        className,
      )}
    >
      <span className="inline-flex size-10 items-center justify-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle aria-hidden className="size-5" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-display text-lg font-semibold text-heading">{title}</p>
        {description !== undefined && (
          <p className="max-w-prose text-sm text-muted">{description}</p>
        )}
      </div>
      {(onRetry !== undefined || detail !== undefined) && (
        <div className="flex flex-col gap-2">
          {onRetry !== undefined && (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Try again
            </Button>
          )}
          {detail !== undefined && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer">Details</summary>
              <pre className="mt-1 max-w-full overflow-auto whitespace-pre-wrap font-mono">
                {detail}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

export function PermissionState({
  title = "You don't have access to this",
  description,
  className,
}: {
  title?: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-4 rounded-lg border border-border bg-surface px-6 py-10 text-left",
        className,
      )}
    >
      <span className="inline-flex size-10 items-center justify-center rounded-full bg-zone text-muted">
        <Lock aria-hidden className="size-5" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-display text-lg font-semibold text-heading">{title}</p>
        {description !== undefined && (
          <p className="max-w-prose text-sm text-muted">{description}</p>
        )}
      </div>
    </div>
  );
}

export function OfflineBanner() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-md border border-border bg-warning-soft px-3 py-2 text-sm text-warning"
    >
      <WifiOff aria-hidden className="size-4" />
      You&apos;re offline — some data may be stale.
    </div>
  );
}

export function SkeletonRows({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}
