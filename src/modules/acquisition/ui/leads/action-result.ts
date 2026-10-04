import "server-only";

import { unstable_rethrow } from "next/navigation";

import { err, type ActionResult } from "@/lib/result";

import { getMessageDelivery } from "./lead-detail.repo";
import { deliveryOf, type SendResult } from "./send-outcome";

/**
 * Turns a thrown value into a failed `ActionResult`, for the `catch` block of a server action.
 *
 * Next.js signals a redirect or a not-found by throwing, and `requireUser()` redirects to the
 * sign-in page when the session has expired. Those must reach the framework rather than be turned
 * into an error result, or an expired session would read as "Something went wrong" instead of
 * sending the person to sign in. `unstable_rethrow` passes them on (Next.js docs: call it first in
 * the catch block); everything else becomes a safe, typed error.
 */
export function failed<T = never>(error: unknown): ActionResult<T> {
  unstable_rethrow(error);
  return err(error);
}

/**
 * What happened to a message after a send service returned its id: sent, scheduled for later, or
 * blocked. Read from the message itself, because the services don't return the outcome.
 */
export async function sendResultFor(messageId: string): Promise<SendResult> {
  const message = await getMessageDelivery(messageId);
  return {
    messageId,
    delivery: deliveryOf(message?.status ?? null),
    scheduledFor: message?.scheduledFor?.toISOString() ?? null,
  };
}
