import { createElement, type ReactElement } from "react";

/**
 * Theme plumbing (ADR-011, project-rules §"Theme"). Light is the default; dark is first-class.
 *
 * `data-theme` on <html> drives the tokens. `ThemeScript` sets it before the first paint from
 * the saved choice: an explicit `light`/`dark` wins; `system` follows the OS; anything else
 * (no choice yet) is `light` — the platform defaults to light. So dark mode never flashes.
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
 * The pre-paint script. It must stay tiny, synchronous and dependency-free. An explicit
 * `light`/`dark` wins; `system` follows the OS; no saved choice (or blocked storage) is `light`.
 */
export const THEME_SCRIPT = `(function(){var d=document.documentElement,p=null,t="light";try{p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})}catch(e){}try{t=p==="light"||p==="dark"?p:(p==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):"light")}catch(e){}d.dataset.theme=t;d.style.colorScheme=t})();`;

/** Render inside <head> of the root layout. `nonce` is for a future Content Security Policy. */
export function ThemeScript({ nonce }: { nonce?: string }): ReactElement {
  return createElement("script", {
    nonce,
    dangerouslySetInnerHTML: { __html: THEME_SCRIPT },
  });
}

export { useTheme, type UseThemeResult } from "./use-theme";
