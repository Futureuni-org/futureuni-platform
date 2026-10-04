import { unstable_rethrow } from "next/navigation";

import type { ActionResult } from "@/lib/result";

/** Shown when a request never reached the server (offline, a dropped connection). */
export const UNREACHABLE = "Couldn't reach the server, so nothing was saved. Try again.";

/**
 * Runs a server action from a client component and returns the message to show if it failed, or
 * null if it worked. A refused action comes back as a result; a request that never arrived comes
 * back as a thrown error, which would otherwise leave a dialog open with no explanation or an
 * optimistic move in place. A redirect (an expired session) is passed on to the framework.
 */
export async function failureOf(run: () => Promise<ActionResult<unknown>>): Promise<string | null> {
  try {
    const result = await run();
    return result.ok ? null : result.error.message;
  } catch (error) {
    unstable_rethrow(error);
    return UNREACHABLE;
  }
}
