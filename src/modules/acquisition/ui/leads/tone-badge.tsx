import type { ComponentType, ReactNode, SVGProps } from "react";
import { AlertTriangle, CheckCircle2, Circle, CircleDot, Info, XCircle } from "lucide-react";

import { Badge, type BadgeProps } from "@/components/ui/badge";

/**
 * A `Badge` that always carries an icon. Project rules: status is never shown by colour alone, so
 * every badge pairs its colour with a label and an icon. `StatusBadge` does that for the statuses
 * in its map; this covers the other badges on these screens (flags, audit status, email status,
 * proposal status, channel verdicts). Each tone has a default icon, and a badge with a more specific
 * meaning passes its own. Listed as a promotion candidate in phases/16/REQUESTS.md: `Badge` itself
 * could take an `icon`.
 */

export type Tone = NonNullable<BadgeProps["tone"]>;
type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const TONE_ICON: Record<Tone, Icon> = {
  neutral: Circle,
  primary: CircleDot,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
};

export function ToneBadge({
  tone = "neutral",
  icon,
  className,
  children,
}: {
  tone?: Tone;
  icon?: Icon;
  className?: string;
  children: ReactNode;
}) {
  const IconComponent = icon ?? TONE_ICON[tone];
  return (
    <Badge tone={tone} {...(className === undefined ? {} : { className })}>
      <IconComponent aria-hidden className="size-3 shrink-0" />
      {children}
    </Badge>
  );
}
