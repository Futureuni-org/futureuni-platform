/**
 * One placeholder profile version per line and its materialised sequences, one per line × market
 * (data-model §10.3). Phase 7's seeder may later publish version 2 over a placeholder.
 */

import type { Market, ServiceLine } from "@/contracts/common";
import type { ServiceLineProfile } from "@/contracts/service-line-profile";
import { toJsonInput, type Prisma } from "@/platform/db";

import { INITIAL_PROFILES, PLACEHOLDER_NOTE } from "../data/profiles";
import { ALL_LINES } from "../data/users";
import { seedId } from "../lib/ids";
import { ago } from "../lib/time";

import { userId, type Row } from "./base";

const MARKETS: readonly Market[] = ["NIGERIA", "INTERNATIONAL"];

export interface ProfilesWorld {
  profileVersions: Row<Prisma.ServiceLineProfileVersionUncheckedCreateInput>[];
  sequences: Row<Prisma.SequenceUncheckedCreateInput>[];
  sequenceSteps: Row<Prisma.SequenceStepUncheckedCreateInput>[];
}

export const profileVersionId = (line: ServiceLine): string =>
  seedId("prof", ALL_LINES.indexOf(line) + 1);
export const sequenceId = (line: ServiceLine, market: Market): string =>
  seedId("sequ", ALL_LINES.indexOf(line) * 2 + MARKETS.indexOf(market) + 1);

export function profileOf(line: ServiceLine): ServiceLineProfile {
  return INITIAL_PROFILES[line];
}

type SequenceDefinition = ServiceLineProfile["sequences"][Market][number];

/** The default sequence a line uses in a market. */
export function defaultSequence(line: ServiceLine, market: Market): SequenceDefinition {
  const sequence = profileOf(line).sequences[market].find((candidate) => candidate.isDefault);
  if (sequence === undefined) throw new Error(`No default ${market} sequence for ${line}.`);
  return sequence;
}

/**
 * The pitch angle a seeded lead's drafts use: the "no website" angle only for a company without
 * one, otherwise the line's first other angle for the market.
 */
export function angleIdFor(line: ServiceLine, market: Market, hasWebsite: boolean): string {
  const angles = profileOf(line).pitchAngles[market];
  const aboutNoWebsite = (angle: (typeof angles)[number]) =>
    angle.whenToUse.signals.includes("no_website");
  const angle = angles.find((candidate) => aboutNoWebsite(candidate) === !hasWebsite) ?? angles[0];
  if (angle === undefined) throw new Error(`No ${market} pitch angle for ${line}.`);
  return angle.id;
}

export function buildProfiles(now: Date): ProfilesWorld {
  const publishedAt = ago(now, { days: 120 });
  const admin = userId("admin");
  const profileVersions = ALL_LINES.map((line) => ({
    id: profileVersionId(line),
    serviceLine: line,
    version: 1,
    status: "PUBLISHED" as const,
    isActive: true,
    profile: toJsonInput(profileOf(line)),
    note: PLACEHOLDER_NOTE,
    createdById: admin,
    publishedById: admin,
    publishedAt,
    createdAt: publishedAt,
  }));

  const sequences: ProfilesWorld["sequences"] = [];
  const sequenceSteps: ProfilesWorld["sequenceSteps"] = [];
  for (const line of ALL_LINES) {
    for (const market of MARKETS) {
      const definition = defaultSequence(line, market);
      const id = sequenceId(line, market);
      sequences.push({
        id,
        serviceLine: line,
        market,
        profileVersionId: profileVersionId(line),
        sequenceKey: definition.id,
        name: definition.name,
        createdAt: publishedAt,
      });
      for (const step of definition.steps) {
        sequenceSteps.push({
          id: seedId("sstp", sequenceSteps.length + 1),
          sequenceId: id,
          stepIndex: step.index,
          channel: step.channel,
          delayBusinessDays: step.delayBusinessDays,
          purpose: step.purpose,
          pitchAngleId: step.pitchAngleId ?? null,
          stopConditions: [...step.stopConditions],
          createdAt: publishedAt,
        });
      }
    }
  }
  return { profileVersions, sequences, sequenceSteps };
}
