import type { ReactNode } from "react";

import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * DangerZone — a danger-tinted band that gathers destructive or irreversible actions so they
 * never sit beside ordinary controls. Each row pairs a description with its action.
 */
export function DangerZone({
  title = "Danger zone",
  description,
  children,
  className,
}: {
  title?: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "-mx-4 flex flex-col gap-4 rounded-lg bg-danger-soft/40 px-4 py-6 sm:-mx-6 sm:px-6",
        className,
      )}
    >
      <header className="flex items-center gap-2">
        <AlertTriangle aria-hidden className="size-4 text-danger" />
        <h3 className="text-sm font-semibold text-danger">{title}</h3>
      </header>
      {description !== undefined && <p className="max-w-prose text-sm text-muted">{description}</p>}
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

/** One row inside a DangerZone: an explanation on the left, the action on the right. */
export function DangerRow({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description !== undefined && <p className="text-sm text-muted">{description}</p>}
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}
