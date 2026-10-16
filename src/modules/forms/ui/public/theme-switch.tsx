"use client";

/**
 * Light / dark on the public form.
 *
 * The platform's own toggle (`@/components/shell/theme-toggle`) is a dropdown
 * fragment, so it can't be dropped onto a page a prospect sees. This is the
 * same preference the platform uses (same storage key via `useTheme`) rendered
 * as a two-state button that reads the **resolved** theme — `useTheme()`
 * returns `theme` as `"light" | "dark"`, see `src/lib/use-theme.ts` — and
 * flips to the opposite. "System" is deliberately not an option: a prospect
 * wants one tap to go light or dark, not a cycle. If a FUTUREUNI teammate
 * opened the form with "system" stored from the signed-in platform, the first
 * click resolves straight to an explicit `light` or `dark`.
 *
 * `tone` picks colour against two very different backgrounds: the mobile navy
 * band uses `"navy"`, the desktop header on the page background uses `"page"`.
 */

import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/cn";

export interface ThemeSwitchProps {
  tone?: "page" | "navy";
  className?: string;
}

export function ThemeSwitch({ tone = "page", className }: ThemeSwitchProps) {
  const { theme, setPreference } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  const Icon = theme === "dark" ? Sun : Moon;

  return (
    <button
      type="button"
      aria-label={`Switch to ${next} mode`}
      onClick={() => {
        setPreference(next);
      }}
      className={cn(
        "inline-flex size-10 items-center justify-center rounded-md",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none",
        "transition-colors",
        tone === "navy"
          ? "text-sidebar-foreground/70 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
          : "text-muted hover:bg-zone hover:text-foreground",
        className,
      )}
    >
      <Icon aria-hidden className="size-5" />
    </button>
  );
}
