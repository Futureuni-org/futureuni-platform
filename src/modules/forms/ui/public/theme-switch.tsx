"use client";

/**
 * Light / dark / system, on the public form.
 *
 * The platform's own toggle (`@/components/shell/theme-toggle`) is a fragment of the signed-in
 * user menu's dropdown, so it can't be dropped onto a page a prospect sees. This is the same
 * three-state preference from `@/lib/theme` — the same storage key, so a FUTUREUNI teammate who
 * opens the form sees the theme they chose in the platform — as one button that cycles. No
 * tooltip: there is no `TooltipProvider` on a public page, and the state is named in the label.
 */

import { Moon, Sun, SunMoon } from "lucide-react";

import { type ThemePreference, useTheme } from "@/lib/theme";
import { cn } from "@/lib/cn";

const NEXT: Record<ThemePreference, ThemePreference> = {
  light: "dark",
  dark: "system",
  system: "light",
};

const LABEL: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "Device",
};

const ICON: Record<
  ThemePreference,
  React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
> = {
  light: Sun,
  dark: Moon,
  system: SunMoon,
};

export function ThemeSwitch({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  const Icon = ICON[preference];
  const next = NEXT[preference];

  return (
    <button
      type="button"
      aria-label={`Appearance: ${LABEL[preference]}. Switch to ${LABEL[next]}.`}
      onClick={() => {
        setPreference(next);
      }}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-md px-3",
        "text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
        "transition-colors",
        className,
      )}
    >
      <Icon aria-hidden className="size-5 shrink-0" />
      <span className="font-mono text-xs tracking-[0.08em] uppercase">{LABEL[preference]}</span>
    </button>
  );
}
