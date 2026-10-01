/**
 * Browser-capture safety (ADR-017, `docs/contracts/audit-agent.md` §4 rule 8), enforced in code:
 *
 *  - SSRF guard and `robots.txt` run **before** any capture, reusing `@/platform/http`.
 *  - Actions may only navigate by visible text or scroll. The browser never types, submits forms,
 *    logs in, or accepts cookie banners beyond closing them — so any other action is rejected here.
 */

import "server-only";

import { guardUrl, isAllowedByRobots } from "@/platform/http";

import { CRAWLER_USER_AGENT, type NormalizedCaptureRequest } from "./types";

export class UnsafeActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeActionError";
  }
}

/**
 * Rejects any action that isn't navigation-only. The `CaptureRequest` type already forbids typing
 * and submitting at compile time; this is the defence in depth the contract requires, and it also
 * rejects empty click targets that could match unintended controls.
 */
export function assertActionsAreNavigationOnly(actions: NormalizedCaptureRequest["actions"]): void {
  // Treated as loosely typed so an untrusted caller's forged action (e.g. typing/submitting) is
  // rejected at runtime, not just at compile time.
  const raw = actions as readonly { type: string; text?: string }[];
  for (const action of raw) {
    if (action.type === "scroll") continue;
    if (action.type === "click-text") {
      if ((action.text ?? "").trim() === "") {
        throw new UnsafeActionError("A click-text action needs a non-empty visible-text target.");
      }
      continue;
    }
    throw new UnsafeActionError(
      `Only navigation (click-text) and scroll actions are allowed; got "${action.type}".`,
    );
  }
}

export type CaptureGuardResult =
  | { allowed: true }
  | { allowed: false; reason: "ssrf" | "robots" };

/** SSRF + robots check for a single URL, run before every capture and after each navigation. */
export async function guardCaptureUrl(url: string): Promise<CaptureGuardResult> {
  const guard = await guardUrl(url);
  if (!guard.ok) return { allowed: false, reason: "ssrf" };

  try {
    const allowed = await isAllowedByRobots(url, CRAWLER_USER_AGENT);
    if (!allowed) return { allowed: false, reason: "robots" };
  } catch {
    // A robots-fetch failure is treated as allowed (documented in @/platform/http robots.ts).
  }
  return { allowed: true };
}
