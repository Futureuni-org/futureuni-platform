import "server-only";

/**
 * Mailbox health (step 4.2). Auto-pauses a mailbox whose hard-bounce rate over the recent sample
 * exceeds the threshold (default 3%), which emits `mailbox.paused`; the outreach subscriber then
 * notifies admins. Called after a bounce is recorded and by the `mailbox-health` job.
 */

import type { Actor } from "@/contracts/common";

import { getOutreachSetting } from "../settings";
import { pauseMailbox } from "./mailboxes";
import { findMailbox, recentHardBounceRate, updateMailbox as updateMailboxRow } from "./mailbox.repo";

const MIN_SAMPLE_FOR_PAUSE = 10;
const HEALTH_ACTOR: Actor = { type: "SYSTEM", job: "acquisition.outreach.mailbox-health" };

export interface HealthResult {
  paused: boolean;
  hardBounceRate: number | null;
  sampled: number;
}

/** Evaluates one mailbox and pauses it if unhealthy. Returns the computed rate and whether it paused. */
export async function evaluateMailboxHealth(mailboxId: string, now: Date = new Date()): Promise<HealthResult> {
  const mailbox = await findMailbox(null, mailboxId);
  if (mailbox === null) return { paused: false, hardBounceRate: null, sampled: 0 };

  const threshold = await getOutreachSetting("bounceRatePauseThreshold");
  const sampleSize = await getOutreachSetting("healthSampleSize");
  const recent = await recentHardBounceRate(null, mailboxId, sampleSize);

  await updateMailboxRow(null, mailboxId, {
    healthScore: recent === null ? null : Math.max(0, 1 - recent.rate),
    lastHealthCheckAt: now,
  });

  const unhealthy =
    recent !== null &&
    recent.sampled >= MIN_SAMPLE_FOR_PAUSE &&
    recent.rate > threshold &&
    (mailbox.status === "ACTIVE" || mailbox.status === "WARMING");

  if (unhealthy) {
    await pauseMailbox(HEALTH_ACTOR, mailboxId, `bounce-rate ${(recent.rate * 100).toFixed(1)}%`);
    return { paused: true, hardBounceRate: recent.rate, sampled: recent.sampled };
  }
  return { paused: false, hardBounceRate: recent?.rate ?? null, sampled: recent?.sampled ?? 0 };
}

/** Evaluates every sendable mailbox (the `acquisition.outreach.mailbox-health` job). */
export async function evaluateAllMailboxHealth(now: Date = new Date()): Promise<{ checked: number; paused: number }> {
  const { listSendableMailboxes } = await import("./mailbox.repo");
  const mailboxes = await listSendableMailboxes(null);
  let paused = 0;
  for (const mailbox of mailboxes) {
    const result = await evaluateMailboxHealth(mailbox.id, now);
    if (result.paused) paused += 1;
  }
  return { checked: mailboxes.length, paused };
}
