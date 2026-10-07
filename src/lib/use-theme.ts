"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  isThemePreference,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "./theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Components subscribed to theme changes made in this tab. */
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * The choice made on this page when browser storage can't save it (private browsing, strict
 * settings, a full quota). It then lasts until the page reloads.
 */
let unsavedPreference: ThemePreference | null = null;

function readPreference(): ThemePreference {
  if (unsavedPreference !== null) return unsavedPreference;
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(saved) ? saved : "light";
  } catch {
    // Storage can't be read: fall back to the platform default, light.
    return "light";
  }
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== "system") return preference;
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function applyTheme(theme: ResolvedTheme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const media = window.matchMedia(DARK_QUERY);
  const onSystemChange = () => {
    if (readPreference() === "system") applyTheme(resolveTheme("system"));
    onChange();
  };
  // Another tab changed the saved choice.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    applyTheme(resolveTheme(readPreference()));
    onChange();
  };
  media.addEventListener("change", onSystemChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    media.removeEventListener("change", onSystemChange);
    window.removeEventListener("storage", onStorage);
  };
}

function preferenceSnapshot(): ThemePreference {
  return readPreference();
}

function themeSnapshot(): ResolvedTheme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** Applies the saved choice (or the OS preference). For pages rendered without ThemeScript. */
export function applySavedTheme(): void {
  applyTheme(resolveTheme(readPreference()));
}

export interface UseThemeResult {
  /** What the user chose: light, dark, or follow the system. */
  preference: ThemePreference;
  /** What is showing now. */
  theme: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
}

/** Reads and changes the theme. The server render assumes the defaults (light, light). */
export function useTheme(): UseThemeResult {
  const preference = useSyncExternalStore(subscribe, preferenceSnapshot, () => "light" as const);
  const theme = useSyncExternalStore(subscribe, themeSnapshot, () => "light" as const);

  const setPreference = useCallback((next: ThemePreference) => {
    try {
      // Store every choice explicitly, "system" included, so an absent key means "no choice
      // yet" and resolves to the light default rather than silently following the OS.
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
      unsavedPreference = null;
    } catch {
      // Storage unavailable: keep the choice for this page, so the controls stay truthful.
      unsavedPreference = next;
    }
    applyTheme(resolveTheme(next));
    notify();
  }, []);

  return { preference, theme, setPreference };
}
