import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  Eye,
  Gauge,
  Info,
  ShieldAlert,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

/**
 * Severity and method presentation for audit findings, plus the EvidenceChip that cites a finding.
 * One severity-meta map, so the label, tone and icon always travel together (never colour alone).
 * EvidenceChip is a Phase 16 candidate for promotion.
 */

const SEVERITY_META: Record<
  string,
  { label: string; tone: NonNullable<BadgeProps["tone"]>; icon: LucideIcon }
> = {
  CRITICAL: { label: "Critical", tone: "danger", icon: ShieldAlert },
  HIGH: { label: "High", tone: "danger", icon: AlertTriangle },
  MEDIUM: { label: "Medium", tone: "warning", icon: AlertCircle },
  LOW: { label: "Low", tone: "info", icon: Info },
  INFO: { label: "Info", tone: "neutral", icon: Info },
};

const METHOD_META: Record<string, { label: string; icon: LucideIcon }> = {
  MEASURED: { label: "Measured", icon: Gauge },
  OBSERVED: { label: "Observed", icon: Eye },
  AI_JUDGED: { label: "AI-judged", icon: Sparkles },
};

export function severityMeta(severity: string) {
  return SEVERITY_META[severity] ?? { label: severity, tone: "neutral" as const, icon: Info };
}

export function SeverityBadge({ severity }: { severity: string }) {
  const meta = severityMeta(severity);
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone}>
      <Icon aria-hidden className="size-3.5" />
      {meta.label}
    </Badge>
  );
}

export function MethodBadge({ method }: { method: string }) {
  const meta = METHOD_META[method] ?? { label: method, icon: Info };
  const Icon = meta.icon;
  return (
    <Badge tone="neutral">
      <Icon aria-hidden className="size-3.5" />
      {meta.label}
    </Badge>
  );
}

/** A compact citation of one finding: severity icon + claim. Links to the evidence when `href` is set. */
export function EvidenceChip({
  claim,
  severity,
  href,
  className,
}: {
  claim: string;
  severity: string;
  href?: string;
  className?: string;
}) {
  const meta = severityMeta(severity);
  const Icon = meta.icon;
  const body = (
    <>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
      <span className="min-w-0 break-words">
        <span className="sr-only">{meta.label} finding: </span>
        {claim}
      </span>
    </>
  );
  const classes = cn(
    "flex items-start gap-2 rounded-md bg-zone px-3 py-2 text-sm text-foreground",
    className,
  );
  if (href === undefined) return <span className={classes}>{body}</span>;
  return (
    // A link is a touch target: 48px tall at least, however short the claim.
    <Link href={href} className={cn(classes, "min-h-12 items-center hover:bg-primary-soft")}>
      {body}
    </Link>
  );
}
