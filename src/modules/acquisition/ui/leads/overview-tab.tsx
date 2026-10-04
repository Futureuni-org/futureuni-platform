import { RelativeTime } from "@/components/ui/relative-time";
import { Section } from "@/components/patterns/section";

import type { DetailCapabilities, OverviewView } from "./detail-types";
import { EvidenceChip } from "./evidence-chip";
import { enumLabel, formatConfidence } from "./format";
import { RegenerateBriefButton, ReviewDecision } from "./overview-controls";
import { Timeline, TimelineItem } from "./timeline";
import { ToneBadge } from "./tone-badge";

const POINTS = new Intl.NumberFormat("en-GB", { signDisplay: "always" });

/**
 * The Overview tab: the brief, its key findings, why the lead scored as it did, and its signals.
 * Each part has a real heading, so the tab can be navigated by heading. The brief, talking points,
 * review reasons and signal text are AI-written or scraped: they render as plain text and wrap.
 */
export function OverviewTab({
  leadId,
  overview,
  needsHumanReview,
  capabilities,
  evidenceHref,
  timezone,
}: {
  leadId: string;
  overview: OverviewView;
  needsHumanReview: boolean;
  capabilities: DetailCapabilities;
  evidenceHref: string;
  timezone: string;
}) {
  const { review } = overview;
  const undecided = review !== null && review.decisionType === null;

  return (
    <div className="flex flex-col gap-12">
      <Section
        title="Brief"
        actions={capabilities.update ? <RegenerateBriefButton leadId={leadId} /> : undefined}
      >
        {overview.brief === null ? (
          <p className="text-muted">
            No brief yet. One is written once the lead has been audited and scored.
          </p>
        ) : (
          <p className="max-w-prose text-lg leading-relaxed break-words text-foreground">
            {overview.brief}
          </p>
        )}
        {overview.talkingPoints.length > 0 && (
          <ul className="flex max-w-prose list-disc flex-col gap-1 pl-5 text-foreground">
            {/* A fixed list saved with the brief; two points can read the same. */}
            {overview.talkingPoints.map((point, position) => (
              <li key={`${String(position)}-${point}`} className="break-words">
                {point}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Key findings">
        {overview.topFindings.length === 0 ? (
          <p className="text-muted">The brief doesn&apos;t cite any findings.</p>
        ) : (
          <ul className="flex max-w-prose flex-col gap-2">
            {overview.topFindings.map((finding) => (
              <li key={finding.id}>
                <EvidenceChip
                  claim={finding.claim}
                  severity={finding.severity}
                  href={`${evidenceHref}#finding-${finding.id}`}
                />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Why this score">
        {overview.reasons.length === 0 ? (
          <p className="text-muted">This lead hasn&apos;t been scored yet.</p>
        ) : (
          <ul className="flex max-w-prose flex-col">
            {overview.reasons.map((reason) => (
              <li
                key={reason.ruleId}
                className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2 last:border-0"
              >
                <span className="min-w-0 break-words text-foreground">{reason.label}</span>
                <span className="font-mono text-sm text-foreground tabular-nums">
                  {POINTS.format(reason.points)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {review !== null && (
        <Section
          title="Borderline review"
          description="An AI review of a lead that scored between the qualify and disqualify lines."
        >
          <div className="flex max-w-prose flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <ToneBadge tone={review.recommendation === "QUALIFY" ? "success" : "warning"}>
                Recommends: {enumLabel(review.recommendation).toLowerCase()}
              </ToneBadge>
              <span className="text-sm text-muted">
                Confidence {formatConfidence(review.confidence)}
              </span>
              {review.decisionType !== null && (
                <ToneBadge tone="neutral">
                  {review.decisionType === "ACCEPTED" ? "Accepted" : "Overridden"}
                </ToneBadge>
              )}
            </div>
            {review.reasons.length > 0 && (
              <ul className="flex list-disc flex-col gap-1 pl-5 text-foreground">
                {review.reasons.map((reason, position) => (
                  <li key={`${String(position)}-${reason}`} className="break-words">
                    {reason}
                  </li>
                ))}
              </ul>
            )}
            {review.riskFlags.length > 0 && (
              <p className="text-sm break-words text-muted">
                Risks noted: {review.riskFlags.join("; ")}
              </p>
            )}
            {review.overrideNote !== null && (
              <p className="text-sm break-words text-muted">Override note: {review.overrideNote}</p>
            )}
            {undecided && needsHumanReview && capabilities.decideReview && (
              <ReviewDecision leadId={leadId} recommendation={review.recommendation} />
            )}
          </div>
        </Section>
      )}

      <Section title="Signals">
        {overview.signals.length === 0 ? (
          <p className="text-muted">No signals are attached to this lead.</p>
        ) : (
          <Timeline className="max-w-prose">
            {overview.signals.map((signal) => (
              <TimelineItem key={signal.id}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-heading">{enumLabel(signal.signalType)}</span>
                  <RelativeTime value={signal.observedAt} timezone={timezone} />
                  <span className="text-muted">· {signal.adapterId}</span>
                </div>
                <p className="break-words text-foreground">{signal.evidenceText}</p>
                {signal.sourceUrl !== null && (
                  <a
                    href={signal.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex min-h-12 w-fit items-center text-sm text-primary hover:underline"
                  >
                    View source
                  </a>
                )}
              </TimelineItem>
            ))}
          </Timeline>
        )}
      </Section>
    </div>
  );
}
