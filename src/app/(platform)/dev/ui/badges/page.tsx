import { Badge } from "@/components/ui/badge";
import { MarketBadge } from "@/components/ui/market-badge";
import { ServiceLineBadge } from "@/components/ui/service-line-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Section } from "@/components/patterns/section";
import type { LeadStatus, MessageStatus, ReplyClass } from "@/contracts/common";

const LEAD_STATUSES: LeadStatus[] = [
  "NEW", "ENRICHED", "SCORED", "IN_REVIEW", "APPROVED", "CONTACTED", "REPLIED",
  "MEETING_BOOKED", "PROPOSAL_SENT", "WON", "LOST", "NURTURE", "DISQUALIFIED", "SUPPRESSED",
];
const MESSAGE_STATUSES: MessageStatus[] = [
  "DRAFT", "APPROVED", "SENT", "SENT_ASSISTED", "REJECTED", "FAILED", "BLOCKED",
];
const REPLY_CLASSES: ReplyClass[] = [
  "INTERESTED", "NOT_NOW", "OBJECTION_PRICE", "QUESTION", "OUT_OF_OFFICE", "UNSUBSCRIBE", "BOUNCE",
];

export default function BadgesGalleryPage() {
  return (
    <div className="flex flex-col gap-10">
      <Section title="Tones">
        <div className="flex flex-wrap items-center gap-2">
          {(["neutral", "primary", "success", "warning", "danger", "info"] as const).map((tone) => (
            <Badge key={tone} tone={tone}>{tone}</Badge>
          ))}
        </div>
      </Section>
      <Section title="Lead statuses">
        <div className="flex flex-wrap gap-2">
          {LEAD_STATUSES.map((status) => (
            <StatusBadge key={status} kind="lead" value={status} />
          ))}
        </div>
      </Section>
      <Section title="Message statuses">
        <div className="flex flex-wrap gap-2">
          {MESSAGE_STATUSES.map((status) => (
            <StatusBadge key={status} kind="message" value={status} />
          ))}
        </div>
      </Section>
      <Section title="Reply classes">
        <div className="flex flex-wrap gap-2">
          {REPLY_CLASSES.map((c) => (
            <StatusBadge key={c} kind="reply" value={c} />
          ))}
        </div>
      </Section>
      <Section title="Service lines">
        <div className="flex flex-wrap gap-2">
          <ServiceLineBadge line="WEB_DEVELOPMENT" />
          <ServiceLineBadge line="UI_UX_DESIGN" />
          <ServiceLineBadge line="GRAPHIC_DESIGN" />
          <ServiceLineBadge line="VIDEO_EDITING" />
        </div>
      </Section>
      <Section title="Markets">
        <div className="flex flex-wrap gap-2">
          <MarketBadge market="NIGERIA" country="NG" />
          <MarketBadge market="INTERNATIONAL" country="GB" />
        </div>
      </Section>
    </div>
  );
}
