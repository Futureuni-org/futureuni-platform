import { Brush, Code, Film, Palette } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import type { ServiceLine } from "@/contracts/common";
import { cn } from "@/lib/cn";

const META: Record<
  ServiceLine,
  { label: string; icon: ComponentType<SVGProps<SVGSVGElement>>; accentVar: string }
> = {
  WEB_DEVELOPMENT: { label: "Web", icon: Code, accentVar: "var(--accent-web)" },
  UI_UX_DESIGN: { label: "UI/UX", icon: Palette, accentVar: "var(--accent-uiux)" },
  GRAPHIC_DESIGN: { label: "Graphic", icon: Brush, accentVar: "var(--accent-graphic)" },
  VIDEO_EDITING: { label: "Video", icon: Film, accentVar: "var(--accent-video)" },
};

export function ServiceLineBadge({
  line,
  className,
  hideIcon,
}: {
  line: ServiceLine;
  className?: string;
  hideIcon?: boolean;
}) {
  const meta = META[line];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-0.5 text-xs font-medium text-foreground",
        className,
      )}
    >
      {hideIcon !== true && (
        <span
          aria-hidden
          className="inline-block size-1.5 rounded-full"
          style={{ backgroundColor: meta.accentVar }}
        />
      )}
      <Icon aria-hidden className="size-3" />
      {meta.label}
    </span>
  );
}
