"use client";

import { ExternalLink, ShieldAlert, Sparkles, Users } from "lucide-react";

import { Button } from "@/components/ui";
import { lineLabel } from "@/modules/acquisition/ui/shell/line-context";

import { ScoreMeter } from "./score-meter";
import type { ChannelVerdictView, ReviewContext } from "./view";

/**
 * The context rail: the score meter with reasons, the per-channel contactability verdict, any
 * compliance-review or cross-sell notice, and — for a borderline lead — Claude's recommendation
 * with accept/override.
 */

const CHANNEL_NAME: Record<ChannelVerdictView["channel"], string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn",
  phone: "Phone",
};

function verdictTone(status: string): string {
  if (status === "ALLOWED" || status === "ASSISTED_ALLOWED" || status === "CALL_TASK_ALLOWED") {
    return "text-success";
  }
  if (status === "BLOCKED") return "text-danger";
  return "text-warning";
}

function verdictLabel(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function ContextPanel({
  context,
  website,
  canDecideReview,
  decideBusy,
  onAcceptReview,
  onOverrideReview,
}: {
  context: ReviewContext;
  website: string | null;
  canDecideReview: boolean;
  decideBusy: boolean;
  onAcceptReview: () => void;
  onOverrideReview: () => void;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-5">
      <ScoreMeter score={context.score} band={context.band} reasons={context.reasons} />

      {context.complianceReason !== null ? (
        <div className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{context.complianceReason}</span>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Contactability</p>
        <ul className="flex flex-col gap-1.5">
          {context.verdicts.map((verdict) => (
            <li key={verdict.channel} className="flex items-start justify-between gap-3 text-sm">
              <span className="text-foreground">{CHANNEL_NAME[verdict.channel]}</span>
              <span className="flex min-w-0 flex-col items-end text-right">
                <span className={`font-medium ${verdictTone(verdict.status)}`}>
                  {verdictLabel(verdict.status)}
                </span>
                <span className="truncate text-xs text-muted">{verdict.reason}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {context.crossSell !== null && context.crossSell.otherLines.length > 0 ? (
        <div className="flex items-start gap-2 rounded-md bg-info-soft px-3 py-2 text-sm text-info">
          <Users className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {context.crossSell.isLeading
              ? "Leading line of a cross-sell group with "
              : "Part of a cross-sell group led by another line; drafting is held. Other lines: "}
            {context.crossSell.otherLines.map((l) => lineLabel(l)).join(", ")}.
          </span>
        </div>
      ) : null}

      {context.recommendation !== null ? (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-heading">
            <Sparkles className="size-4 text-primary" aria-hidden />
            Borderline — Claude recommends {verdictLabel(context.recommendation.recommendation)}
          </p>
          <p className="text-xs text-muted">
            Confidence {Math.round(context.recommendation.confidence * 100)}%. Your decision is final.
          </p>
          {canDecideReview ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={onAcceptReview} disabled={decideBusy}>
                Accept (Y)
              </Button>
              <Button variant="secondary" size="sm" onClick={onOverrideReview} disabled={decideBusy}>
                Override (N)
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {website !== null ? (
        <a
          href={website.startsWith("http") ? website : `https://${website}`}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
        >
          <ExternalLink className="size-3.5" aria-hidden />
          Visit website
        </a>
      ) : null}
    </div>
  );
}
