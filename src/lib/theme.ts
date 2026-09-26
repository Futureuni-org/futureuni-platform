import { createElement, type ReactElement } from "react";

/**
 * Theme plumbing (ADR-011, project-rules §"Theme"). Light is the default; dark is first-class.
 *
 * `data-theme` on <html> drives the tokens. `ThemeScript` sets it before the first paint from
 * the saved choice, then the OS preference, then light, so dark mode never flashes.
 * `useTheme` (a client hook, re-exported below) reads and changes it. Phase 4 builds the
 * toggle UI on it, and later persists the choice as the user setting `user.theme`.
 */

export const THEME_STORAGE_KEY = "futureuni-theme";

export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = "light" | "dark";

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && (THEME_PREFERENCES as readonly string[]).includes(value);
}

/**
 * The pre-paint script. It must stay tiny, synchronous and dependency-free. Blocked storage
 * counts as "no saved choice", so the OS preference still applies; only if that fails too is
 * the theme light.
 */
export const THEME_SCRIPT = `(function(){var d=document.documentElement,p=null,t="light";try{p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})}catch(e){}try{t=p==="light"||p==="dark"?p:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}catch(e){}d.dataset.theme=t;d.style.colorScheme=t})();`;

/** Render inside <head> of the root layout. `nonce` is for a future Content Security Policy. */
export function ThemeScript({ nonce }: { nonce?: string }): ReactElement {
  return createElement("script", {
    nonce,
    dangerouslySetInnerHTML: { __html: THEME_SCRIPT },
  });
}

export { useTheme, type UseThemeResult } from "./use-theme";
