"use server";

/**
 * Server actions for the line-settings profile editor. saas-api shape; the profiles module owns
 * authorisation (`acquisition.profile.edit` / `.publish` / `.rollback`, all LINES-scoped) and
 * auditing. The editor works only through these services (contract §3 rule 15).
 */

import { revalidatePath } from "next/cache";

import type { ServiceLine } from "@/contracts/common";
import {
  ScoringSchema,
  ServiceLineProfileSchema,
  type ProfileValidationIssue,
  type ScoreReason,
} from "@/contracts/service-line-profile";
import { AppError } from "@/lib/errors";
import { ok, err, type ActionResult } from "@/lib/result";
import { actorOf, assertCan, requireUser } from "@/platform/auth";
import {
  diffProfiles,
  getActiveProfile,
  getDraft,
  getProfileVersion,
  publishProfile,
  rollbackProfile,
  saveDraft,
  validateProfile,
  type ProfileDiff,
} from "@/modules/acquisition/profiles";
import { scoreLead } from "@/modules/acquisition/scoring";
import { resolveLine } from "@/modules/acquisition/ui/shell";
import { getSampleLeadsForLine } from "@/modules/acquisition/ui/settings/sample-leads.repo";

import { discardDraft } from "./profile-draft.repo";

function lineFromSlug(slug: string): ServiceLine {
  const ctx = resolveLine(slug);
  if (ctx === null) throw new AppError("NOT_FOUND", "Unknown service line.");
  return ctx.line;
}

function revalidate(slug: string): void {
  revalidatePath(`/acquisition/${slug}/settings`);
}

function invalid(issues: unknown): AppError {
  return new AppError("VALIDATION_FAILED", "The draft isn't valid yet.", { details: { issues } });
}

export async function saveDraftAction(
  slug: string,
  profile: unknown,
): Promise<ActionResult<{ version: number }>> {
  try {
    const actor = actorOf(await requireUser());
    const line = lineFromSlug(slug);
    const parsed = ServiceLineProfileSchema.safeParse(profile);
    if (!parsed.success) return err(invalid(parsed.error.issues));
    const result = await saveDraft(actor, line, parsed.data);
    revalidate(slug);
    return ok({ version: result.version });
  } catch (error) {
    return err(error);
  }
}

export async function validateDraftAction(
  profile: unknown,
): Promise<ActionResult<ProfileValidationIssue[]>> {
  try {
    await requireUser();
    return ok(validateProfile(profile));
  } catch (error) {
    return err(error);
  }
}

export async function discardDraftAction(slug: string): Promise<ActionResult<{ discarded: boolean }>> {
  try {
    const user = await requireUser();
    const line = lineFromSlug(slug);
    assertCan(user, "acquisition.profile.edit", { serviceLine: line });
    const result = await discardDraft(actorOf(user), line);
    revalidate(slug);
    return ok(result);
  } catch (error) {
    return err(error);
  }
}

export async function diffDraftAction(slug: string): Promise<ActionResult<ProfileDiff>> {
  try {
    const user = await requireUser();
    const line = lineFromSlug(slug);
    assertCan(user, "acquisition.profile.read", { serviceLine: line });
    const draft = await getDraft(line);
    if (draft === null) return err(new AppError("NOT_FOUND", "There's no draft to compare."));
    const active = await getActiveProfile(line).catch(() => null);
    return ok(diffProfiles(active ?? draft.profile, draft.profile));
  } catch (error) {
    return err(error);
  }
}

export async function diffProfileAction(
  slug: string,
  profile: unknown,
): Promise<ActionResult<ProfileDiff>> {
  try {
    const user = await requireUser();
    const line = lineFromSlug(slug);
    assertCan(user, "acquisition.profile.read", { serviceLine: line });
    const parsed = ServiceLineProfileSchema.safeParse(profile);
    if (!parsed.success) return err(invalid(parsed.error.issues));
    const active = await getActiveProfile(line).catch(() => null);
    return ok(diffProfiles(active ?? parsed.data, parsed.data));
  } catch (error) {
    return err(error);
  }
}

export async function diffVersionsAction(
  slug: string,
  versionA: number,
  versionB: number,
): Promise<ActionResult<ProfileDiff>> {
  try {
    const user = await requireUser();
    const line = lineFromSlug(slug);
    assertCan(user, "acquisition.profile.read", { serviceLine: line });
    const [a, b] = await Promise.all([
      getProfileVersion(line, versionA),
      getProfileVersion(line, versionB),
    ]);
    return ok(diffProfiles(a.profile, b.profile));
  } catch (error) {
    return err(error);
  }
}

export async function publishDraftAction(
  slug: string,
  profile: unknown,
  note: string,
): Promise<ActionResult<{ version: number; warnings: ProfileValidationIssue[] }>> {
  try {
    const actor = actorOf(await requireUser());
    const line = lineFromSlug(slug);
    if (note.trim().length === 0) {
      return err(new AppError("VALIDATION_FAILED", "A changelog note is required to publish."));
    }
    const parsed = ServiceLineProfileSchema.safeParse(profile);
    if (!parsed.success) return err(invalid(parsed.error.issues));
    // Persist the editor's draft, then publish it (publishProfile validates reference errors).
    await saveDraft(actor, line, parsed.data);
    const result = await publishProfile(actor, line, note.trim());
    revalidate(slug);
    return ok({ version: result.version, warnings: result.warnings });
  } catch (error) {
    return err(error);
  }
}

export async function rollbackAction(
  slug: string,
  version: number,
  note: string,
): Promise<ActionResult<{ version: number }>> {
  try {
    const actor = actorOf(await requireUser());
    const line = lineFromSlug(slug);
    if (note.trim().length === 0) {
      return err(new AppError("VALIDATION_FAILED", "A note is required to roll back."));
    }
    const result = await rollbackProfile(actor, line, version, note.trim());
    revalidate(slug);
    return ok({ version: result.version });
  } catch (error) {
    return err(error);
  }
}

export interface ScorePreviewRow {
  leadId: string;
  companyName: string;
  currentScore: number | null;
  currentBand: string | null;
  draftScore: number;
  draftBand: string;
  draftReasons: ScoreReason[];
}

export async function scorePreviewAction(
  slug: string,
  scoring: unknown,
): Promise<ActionResult<ScorePreviewRow[]>> {
  try {
    const user = await requireUser();
    const line = lineFromSlug(slug);
    assertCan(user, "acquisition.profile.edit", { serviceLine: line });
    const parsed = ScoringSchema.safeParse(scoring);
    if (!parsed.success) return err(invalid(parsed.error.issues));
    const samples = await getSampleLeadsForLine(line, 8);
    const rows: ScorePreviewRow[] = samples.map((s) => {
      const result = scoreLead({ facts: s.facts, scoring: parsed.data });
      return {
        leadId: s.leadId,
        companyName: s.companyName,
        currentScore: s.currentScore,
        currentBand: s.currentBand,
        draftScore: result.score,
        draftBand: result.band,
        draftReasons: result.reasons,
      };
    });
    return ok(rows);
  } catch (error) {
    return err(error);
  }
}
