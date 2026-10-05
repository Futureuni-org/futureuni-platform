/**
 * `pnpm seed:staging` (Phase 19). A larger, realistic acquisition dataset for preview deployments:
 * a few hundred leads across every service line, market and status, with status-change histories
 * spread over the last 90 days so the analytics screens are meaningful. Pricing uses integer minor
 * units per currency (INV-11).
 *
 * It **refuses production** (reuses the dev-seed guard) and layers on top of the base world, so run
 * `pnpm db:seed` first (it needs the base users to own and close leads). It is additive — run it on
 * a fresh or reset database.
 */

import { config as loadEnv } from "dotenv";

import { seedTargetProblem } from "../lib/guard";

loadEnv({ path: ".env.local" });
loadEnv(); // fall back to .env

const LINES = ["WEB_DEVELOPMENT", "UI_UX_DESIGN", "GRAPHIC_DESIGN", "VIDEO_EDITING"] as const;
const MARKETS = ["NIGERIA", "INTERNATIONAL"] as const;

/** Resting statuses, in funnel order, for building a lead's event history. */
const MAIN: readonly string[] = [
  "NEW",
  "ENRICHED",
  "AUDITED",
  "SCORED",
  "IN_REVIEW",
  "APPROVED",
  "CONTACTED",
  "REPLIED",
  "MEETING_BOOKED",
  "PROPOSAL_SENT",
  "WON",
];

/** How many leads land in each status (per line × market); roughly a real funnel. */
const DISTRIBUTION: readonly [string, number][] = [
  ["NEW", 6],
  ["ENRICHED", 5],
  ["AUDITED", 5],
  ["SCORED", 4],
  ["IN_REVIEW", 2],
  ["APPROVED", 1],
  ["CONTACTED", 5],
  ["REPLIED", 3],
  ["MEETING_BOOKED", 2],
  ["PROPOSAL_SENT", 2],
  ["WON", 2],
  ["LOST", 3],
  ["NURTURE", 3],
  ["DISQUALIFIED", 4],
];

function pathFor(status: string): string[] {
  const idx = MAIN.indexOf(status);
  if (idx >= 0) return MAIN.slice(0, idx + 1);
  if (status === "NURTURE") return ["NEW", "ENRICHED", "AUDITED", "SCORED", "NURTURE"];
  if (status === "DISQUALIFIED") return ["NEW", "ENRICHED", "AUDITED", "DISQUALIFIED"];
  if (status === "LOST")
    return ["NEW", "ENRICHED", "AUDITED", "SCORED", "IN_REVIEW", "APPROVED", "CONTACTED", "LOST"];
  return ["NEW"];
}

const SCORED_OR_LATER = new Set([
  "SCORED",
  "IN_REVIEW",
  "APPROVED",
  "CONTACTED",
  "REPLIED",
  "MEETING_BOOKED",
  "PROPOSAL_SENT",
  "WON",
  "LOST",
  "NURTURE",
]);

function currencyFor(market: string): string {
  return market === "NIGERIA" ? "NGN" : "USD";
}

function totalMinorFor(market: string): number {
  // ₦2.5m–₦8m (kobo) for Nigeria; $3,500–$9,000 (cents) for international.
  return market === "NIGERIA"
    ? (250 + Math.floor(Math.random() * 550)) * 100_000
    : (3_500 + Math.floor(Math.random() * 5_500)) * 100;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function main(): Promise<void> {
  const problem = seedTargetProblem(process.env);
  if (problem !== null) {
    console.error(`error ${problem}`);
    process.exit(1);
  }

  const { db } = await import("@/platform/db");

  const users = await db.user.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, role: true },
  });
  if (users.length === 0) {
    console.error("error No users found. Run `pnpm db:seed` first so leads have owners.");
    process.exit(1);
  }
  const workers = users.filter((u) => u.role === "MEMBER" || u.role === "SERVICE_LEAD");
  const owners = workers.length > 0 ? workers : users;
  const closer = users.find((u) => u.role === "ADMIN") ?? users[0];
  if (closer === undefined) {
    console.error("error No active user to close deals with.");
    process.exit(1);
  }

  let leadCount = 0;
  let proposalCount = 0;
  let dealCount = 0;
  let eventCount = 0;
  let n = 0;

  for (const serviceLine of LINES) {
    for (const market of MARKETS) {
      for (const [status, count] of DISTRIBUTION) {
        for (let i = 0; i < count; i += 1) {
          n += 1;
          const ageDays = Math.floor(Math.random() * 90);
          const createdAt = daysAgo(ageDays);
          const owner = owners[n % owners.length];
          if (owner === undefined) continue;
          const linePrefix = (serviceLine.split("_")[0] ?? serviceLine).toLowerCase();
          const name = `${market === "NIGERIA" ? "Lagos" : "London"} ${linePrefix} co ${String(n)}`;

          const company = await db.company.create({
            data: {
              name,
              normalizedName: normalize(name),
              market: market as never,
              firstSource: "staging-seed",
              createdAt,
            },
            select: { id: true },
          });
          const contact = await db.contact.create({
            data: {
              companyId: company.id,
              source: "staging-seed",
              name: `Owner ${String(n)}`,
              email: `owner${String(n)}@example.${market === "NIGERIA" ? "ng" : "com"}`,
              createdAt,
            },
            select: { id: true },
          });

          const isClosed = status === "WON" || status === "LOST" || status === "DISQUALIFIED";
          const lead = await db.lead.create({
            data: {
              companyId: company.id,
              primaryContactId: contact.id,
              serviceLine: serviceLine as never,
              market: market as never,
              country: market === "NIGERIA" ? "NG" : "GB",
              status: status as never,
              ownerId: owner.id,
              ...(SCORED_OR_LATER.has(status)
                ? { score: 50 + Math.floor(Math.random() * 45), scoreBand: "QUALIFIED" as never, scoredAt: createdAt }
                : {}),
              ...(isClosed ? { closedAt: daysAgo(Math.max(0, ageDays - 3)) } : {}),
              createdAt,
            },
            select: { id: true },
          });
          leadCount += 1;

          // Status-change history, spread from creation to the lead's end time.
          const path = pathFor(status);
          const endMs = (isClosed ? daysAgo(Math.max(0, ageDays - 3)) : new Date()).getTime();
          const span = Math.max(1, endMs - createdAt.getTime());
          const events = path.map((to, idx) => ({
            leadId: lead.id,
            kind: "STATUS_CHANGE" as never,
            fromStatus: (idx === 0 ? null : path[idx - 1]) as never,
            toStatus: to as never,
            actorType: "SYSTEM" as never,
            actorLabel: "staging-seed",
            createdAt: new Date(createdAt.getTime() + (span * idx) / path.length),
          }));
          await db.leadEvent.createMany({ data: events });
          eventCount += events.length;

          // A proposal for PROPOSAL_SENT (open) and WON (accepted); a deal for WON/LOST.
          if (status === "PROPOSAL_SENT" || status === "WON") {
            const total = totalMinorFor(market);
            await db.proposal.create({
              data: {
                leadId: lead.id,
                proposalGroupId: lead.id,
                currency: currencyFor(market) as never,
                subtotalMinor: total,
                totalMinor: total,
                validUntil: daysAgo(-14),
                status: (status === "WON" ? "ACCEPTED" : "SENT") as never,
                sentAt: daysAgo(Math.max(0, ageDays - 2)),
                ...(status === "WON" ? { acceptedAt: daysAgo(Math.max(0, ageDays - 3)) } : {}),
                createdById: closer.id,
                createdAt: daysAgo(Math.max(0, ageDays - 2)),
              },
            });
            proposalCount += 1;
          }
          if (status === "WON" || status === "LOST") {
            await db.deal.create({
              data: {
                leadId: lead.id,
                companyId: company.id,
                serviceLine: serviceLine as never,
                market: market as never,
                outcome: (status === "WON" ? "WON" : "LOST") as never,
                closedById: closer.id,
                createdAt: daysAgo(Math.max(0, ageDays - 3)),
              },
            });
            dealCount += 1;
          }
        }
      }
    }
  }

  process.stdout.write(
    `ok staging seed: ${String(leadCount)} leads, ${String(eventCount)} lead events, ${String(proposalCount)} proposals, ${String(dealCount)} deals across ${String(LINES.length)} lines × ${String(MARKETS.length)} markets.\n`,
  );
  await db.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
