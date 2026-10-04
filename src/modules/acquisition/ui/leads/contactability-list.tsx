import { Ban, Check, CircleAlert, type LucideIcon } from "lucide-react";

import { Badge, type BadgeProps } from "@/components/ui/badge";

import { enumLabel } from "./format";

/**
 * The contactability verdict per channel: its status with a label and an icon (never colour alone)
 * and the plain-language reason. Shared by the lead side rail and the inbox context rail.
 */

const VERDICT: Record<
  string,
  { label: string; tone: NonNullable<BadgeProps["tone"]>; icon: LucideIcon }
> = {
  ALLOWED: { label: "Allowed", tone: "success", icon: Check },
  ASSISTED_ALLOWED: { label: "Assisted send allowed", tone: "success", icon: Check },
  CALL_TASK_ALLOWED: { label: "Call task allowed", tone: "success", icon: Check },
  CONSENT_REQUIRED: { label: "Consent required", tone: "warning", icon: CircleAlert },
  REVIEW: { label: "Needs review", tone: "warning", icon: CircleAlert },
  BLOCKED: { label: "Blocked", tone: "danger", icon: Ban },
};

export interface ChannelVerdict {
  name: string;
  status: string;
  reason: string;
}

export function ContactabilityList({ channels }: { channels: ChannelVerdict[] }) {
  if (channels.length === 0) {
    return (
      <p className="text-sm text-muted">Not evaluated yet. It is worked out during enrichment.</p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {channels.map((channel) => {
        const meta = VERDICT[channel.status] ?? {
          label: enumLabel(channel.status),
          tone: "neutral" as const,
          icon: CircleAlert,
        };
        const Icon = meta.icon;
        return (
          <li key={channel.name} className="flex flex-col gap-1 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-foreground">{channel.name}</span>
              <Badge tone={meta.tone}>
                <Icon aria-hidden className="size-3" />
                {meta.label}
              </Badge>
            </div>
            <p className="break-words text-muted">{channel.reason}</p>
          </li>
        );
      })}
    </ul>
  );
}
