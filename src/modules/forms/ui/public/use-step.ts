"use client";

/**
 * Which step of the form is open, kept in the URL (`?step=<section key>`).
 *
 * The URL is the source of truth, so the browser's Back button walks back through the sections
 * instead of leaving the form, a step can be linked or refreshed, and the server renders step one
 * without guessing. It is read through `useSyncExternalStore` — history is an external system, so
 * there is no state-setting effect and no hydration mismatch.
 */

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

/** A string or null — a primitive, so `useSyncExternalStore` can compare snapshots by identity. */
function readStep(): string | null {
  try {
    return new URLSearchParams(window.location.search).get("step");
  } catch {
    return null;
  }
}

/** The `step` query parameter, or null on the server and before any navigation. */
export function useUrlStep(): string | null {
  return useSyncExternalStore(subscribe, readStep, () => null);
}

/**
 * Opens a step. `push` adds a history entry (so Back returns to the previous section); the first
 * step of a fresh visit replaces instead, so Back leaves the form rather than looping on step one.
 */
export function openStep(key: string, options: { push?: boolean } = {}): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("step", key);
    const state = { step: key };
    if (options.push === false) window.history.replaceState(state, "", url);
    else window.history.pushState(state, "", url);
  } catch {
    // A browser that refuses history writes still gets a working form; only the URL goes stale.
  }
  for (const listener of listeners) listener();
}
