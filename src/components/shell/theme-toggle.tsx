"use client";

import { Moon, Sun, SunMoon } from "lucide-react";

import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { THEME_PREFERENCES, type ThemePreference, useTheme } from "@/lib/theme";

const LABEL: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

const ICON: Record<ThemePreference, React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  light: Sun,
  dark: Moon,
  system: SunMoon,
};

/** Renders inside a DropdownMenuContent (see `user-menu.tsx`). */
export function ThemeToggleMenu() {
  const { preference, setPreference } = useTheme();
  return (
    <>
      <DropdownMenuLabel>Theme</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={preference}
        onValueChange={(value) => {
          if (value === "light" || value === "dark" || value === "system") {
            setPreference(value);
          }
        }}
      >
        {THEME_PREFERENCES.map((option) => {
          const Icon = ICON[option];
          return (
            <DropdownMenuRadioItem key={option} value={option}>
              <Icon aria-hidden className="size-4 text-muted" />
              <span>{LABEL[option]}</span>
            </DropdownMenuRadioItem>
          );
        })}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
    </>
  );
}

/** For any consumer that needs a quick self-contained trigger + menu item flow. */
export function useThemeSwitcher() {
  const state = useTheme();
  return state;
}

export { DropdownMenuItem as ThemeMenuItem };
