/**
 * Users and team profiles (§10.2), and the platform rows (§10.9): settings, AI calls, the active
 * prompt version, job runs, notifications, audit log entries and 14 days of provider usage.
 * No IntegrationCredential rows: mock mode needs no keys, and seeding secrets is banned.
 */

import { createHash } from "node:crypto";

import type { AiOutcome, Role, ServiceLine, UserStatus } from "@/contracts/common";
import { JobCountsSchema, JobProgressSchema } from "@/contracts/jobs";
import { NotificationDataSchema } from "@/contracts/events";
import { toJsonInput, type Prisma } from "@/platform/db";

import { PLACEHOLDER_NOTE } from "../data/profiles";
import { ALL_LINES, SEED_USERS } from "../data/users";
import { seedId } from "../lib/ids";
import { ago, dayOf } from "../lib/time";

import { byLead, leadId, userId, type LeadInfo, type Row } from "./base";
import type { ComplianceWorld } from "./compliance";
import { AI_CALL } from "./leads";
import { DEV_POSTAL_ADDRESS, type OutreachWorld } from "./outreach";
import type { PipelineWorld } from "./pipeline";
import { profileVersionId } from "./profiles";
import { searchJobRunId } from "./search";

export interface PlatformWorld {
  users: (Row<Prisma.UserUncheckedCreateInput> & {
    email: string;
    role: Role;
    status: UserStatus;
  })[];
  teamProfiles: Row<Prisma.TeamProfileUncheckedCreateInput>[];
  settings: Row<Prisma.SettingUncheckedCreateInput>[];
  aiCalls: Row<Prisma.AiCallUncheckedCreateInput>[];
  promptVersions: Row<Prisma.PromptVersionUncheckedCreateInput>[];
  jobRuns: Row<Prisma.JobRunUncheckedCreateInput>[];
  notifications: Row<Prisma.NotificationUncheckedCreateInput>[];
  auditLogs: Row<Prisma.AuditLogUncheckedCreateInput>[];
  providerUsages: Row<Prisma.ProviderUsageUncheckedCreateInput>[];
}

export const LINE_SLUG: Readonly<Record<ServiceLine, string>> = {
  WEB_DEVELOPMENT: "web-development",
  UI_UX_DESIGN: "ui-ux-design",
  GRAPHIC_DESIGN: "graphic-design",
  VIDEO_EDITING: "video-editing",
};

/** Per-token prices in micro-USD (ADR-027: $ per million tokens = micro-USD per token). */
const MODELS = {
  fast: { model: "claude-haiku-4-5", input: 1, output: 5 },
  balanced: { model: "claude-sonnet-5", input: 2, output: 10 },
  deep: { model: "claude-opus-5", input: 5, output: 25 },
} as const;

const TASKS: readonly { task: string; tier: keyof typeof MODELS }[] = [
  { task: "acquisition.source-classify-job-post", tier: "fast" },
  { task: "acquisition.source-extract-company", tier: "fast" },
  { task: "acquisition.enrich-pick-contact", tier: "fast" },
  { task: "acquisition.enrich-extract-people", tier: "fast" },
  { task: "acquisition.audit-web-first-impression", tier: "balanced" },
  { task: "acquisition.audit-uiux-heuristics", tier: "balanced" },
  { task: "acquisition.audit-uiux-review-analysis", tier: "fast" },
  { task: "acquisition.audit-graphic-consistency", tier: "balanced" },
  { task: "acquisition.audit-video-thumbnails", tier: "balanced" },
  { task: "acquisition.audit-video-titles", tier: "fast" },
  { task: "acquisition.score-lead-brief", tier: "fast" },
  { task: "acquisition.outreach-draft", tier: "balanced" },
  { task: "acquisition.outreach-draft-edit", tier: "balanced" },
  { task: "acquisition.inbox-classify", tier: "fast" },
  { task: "acquisition.inbox-draft-reply", tier: "balanced" },
  { task: "acquisition.pipeline-meeting-summary", tier: "balanced" },
  { task: "acquisition.analytics-weekly-insight", tier: "balanced" },
  { task: "platform.summarize-company", tier: "fast" },
];

/** Non-OK outcomes among the generic calls (by call number); the rest are OK. */
const OUTCOMES: Readonly<Record<number, AiOutcome>> = {
  9: "REPAIRED",
  14: "REPAIRED",
  20: "REPAIRED",
  23: "INVALID",
  29: "INVALID",
  26: "TIMEOUT",
  33: "TIMEOUT",
  38: "QUOTA_BLOCKED",
};

const ERROR_CODE: Partial<Record<AiOutcome, string>> = {
  INVALID: "AI_OUTPUT_INVALID",
  TIMEOUT: "AI_TIMEOUT",
  QUOTA_BLOCKED: "AI_QUOTA_EXCEEDED",
};

export function buildPlatform(
  now: Date,
  leads: readonly LeadInfo[],
  outreach: OutreachWorld,
  pipeline: PipelineWorld,
  compliance: ComplianceWorld,
): PlatformWorld {
  const admin = userId("admin");
  const users = SEED_USERS.map((user) => ({
    id: userId(user.key),
    name: user.name,
    email: user.email,
    emailVerified: true,
    role: user.role,
    status: "ACTIVE" as const,
    mustSetUp2fa: user.role === "ADMIN",
    lastActiveAt: ago(now, { hours: user.n }),
    createdAt: ago(now, { days: 150 - user.n }),
  }));
  const teamProfiles = SEED_USERS.map((user) => ({
    id: seedId("tmpr", user.n),
    userId: userId(user.key),
    serviceLines: [...user.serviceLines],
    weeklyCapacity: user.weeklyCapacity,
    timezone: user.timezone,
    canApprove: user.canApprove,
    title: user.title,
    createdAt: ago(now, { days: 150 - user.n }),
  }));

  // ---- Settings (§10.9) ----
  const setting = (
    n: number,
    key: string,
    scope: "PLATFORM" | "MODULE",
    value: Prisma.InputJsonValue,
    module: string | null = null,
  ) => ({
    id: seedId("sett", n),
    key,
    scope,
    module,
    value,
    updatedById: admin,
    createdAt: ago(now, { days: 100 }),
  });
  const settings = [
    setting(1, "platform.timezone", "PLATFORM", "Africa/Lagos"),
    setting(2, "platform.companyName", "PLATFORM", "FUTUREUNI"),
    setting(3, "module.acquisition.enabled", "PLATFORM", true),
    setting(4, "acquisition.unsubscribeScope", "MODULE", "COMPANY", "acquisition"),
    setting(
      5,
      "acquisition.defaultBookingUrl",
      "MODULE",
      "https://cal.example/futureuni",
      "acquisition",
    ),
    setting(6, "platform.postalAddress", "PLATFORM", DEV_POSTAL_ADDRESS),
  ];

  // ---- AI calls: 8 that other rows point at, then 32 across every acquisition task ----
  const aiCalls: PlatformWorld["aiCalls"] = [];
  const call = (
    id: string,
    n: number,
    task: string,
    tier: keyof typeof MODELS,
    lead: LeadInfo | null,
    outcome: AiOutcome = "OK",
  ) => {
    const price = MODELS[tier];
    const blocked = outcome === "QUOTA_BLOCKED";
    const inputTokens = blocked ? 0 : 1_200 + ((n * 677) % 4_800);
    const outputTokens = blocked ? 0 : 150 + ((n * 131) % 750);
    const cacheReadTokens = blocked || n % 3 !== 0 ? 0 : 900;
    aiCalls.push({
      id,
      task,
      promptVersion: task === "platform.summarize-company" ? 1 : null,
      model: price.model,
      provider: "anthropic",
      actorType: n % 5 === 0 && lead !== null ? "USER" : "SYSTEM",
      actorId: n % 5 === 0 && lead !== null ? lead.ownerId : null,
      module: task.split(".")[0] ?? null,
      leadId: lead?.id ?? null,
      companyId: lead?.companyId ?? null,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      costMicros:
        inputTokens * price.input +
        outputTokens * price.output +
        Math.round(cacheReadTokens * price.input * 0.1),
      latencyMs: blocked ? 3 : outcome === "TIMEOUT" ? 60_000 : 800 + ((n * 373) % 8_200),
      outcome,
      errorCode: ERROR_CODE[outcome] ?? null,
      stopReason:
        outcome === "OK" || outcome === "REPAIRED"
          ? "end_turn"
          : outcome === "INVALID"
            ? "max_tokens"
            : null,
      logContent: "NONE",
      createdAt: ago(now, { days: (n * 5) % 14, hours: n % 7 }),
    });
  };
  call(
    AI_CALL.borderlineReview,
    1,
    "acquisition.score-borderline-review",
    "balanced",
    byLead(leads, 7),
  );
  call(
    AI_CALL.acceptedReview,
    2,
    "acquisition.score-borderline-review",
    "balanced",
    byLead(leads, 9),
  );
  call(
    AI_CALL.overriddenReview,
    3,
    "acquisition.score-borderline-review",
    "balanced",
    byLead(leads, 65),
  );
  call(AI_CALL.replyClassification, 4, "acquisition.inbox-classify", "fast", byLead(leads, 31));
  call(
    AI_CALL.precallBrief,
    5,
    "acquisition.pipeline-precall-brief",
    "balanced",
    byLead(leads, 32),
  );
  call(
    AI_CALL.meetingSummary,
    6,
    "acquisition.pipeline-meeting-summary",
    "balanced",
    byLead(leads, 70),
  );
  call(AI_CALL.proposalDraft, 7, "acquisition.pipeline-proposal-draft", "deep", byLead(leads, 70));
  call(AI_CALL.firstDraft, 8, "acquisition.outreach-draft", "balanced", byLead(leads, 8));
  for (let n = 9; n <= 40; n += 1) {
    const task = TASKS[(n - 9) % TASKS.length];
    if (task === undefined) continue;
    const lead = task.task.startsWith("platform.") ? null : byLead(leads, ((n * 7) % 76) + 1);
    call(seedId("aicl", n), n, task.task, task.tier, lead, OUTCOMES[n]);
  }

  const compiledPrompt =
    "Summarise what this company does in two plain sentences, using only the text provided.";
  const promptVersions = [
    {
      id: seedId("prmv", 1),
      task: "platform.summarize-company",
      version: 1,
      contentHash: createHash("sha256").update(compiledPrompt).digest("hex"),
      compiledPrompt,
      changelog: "Initial version",
      authorId: admin,
      evalScore: 0.91,
      isActive: true,
      publishedAt: ago(now, { days: 90 }),
      activatedAt: ago(now, { days: 90 }),
      createdAt: ago(now, { days: 90 }),
    },
  ];

  // ---- Job runs: one per search run (1–12), then enrichment, audits, tick, poll and the rest ----
  const jobRuns: PlatformWorld["jobRuns"] = [];
  const job = (
    row: Omit<Row<Prisma.JobRunUncheckedCreateInput>, "idempotencyKey" | "actorType"> & {
      actorType?: "USER" | "SYSTEM";
    },
  ) => jobRuns.push({ actorType: "SYSTEM", idempotencyKey: `seed:${row.id}`, ...row });
  for (let n = 1; n <= 12; n += 1) {
    const startedAt = ago(now, {
      days: [21, 16, 19, 23, 1, 26, 18, 27, 24, 12, 33, 30][n - 1] ?? 1,
    });
    job({
      id: searchJobRunId(n),
      name: "acquisition.sourcing.run",
      status: "SUCCEEDED",
      input: { searchRunId: seedId("srun", n) },
      attempt: 1,
      queuedAt: startedAt,
      startedAt,
      finishedAt: new Date(startedAt.getTime() + 60_000),
      counts: JobCountsSchema.parse(
        n === 5
          ? { skipped: 1 }
          : n === 2
            ? { fetched: 26, created: 3, errors: 1 }
            : { fetched: 14 + n, created: 3 },
      ),
      createdAt: startedAt,
    });
  }
  const failedAt = ago(now, { days: 1, hours: 3 });
  job({
    id: seedId("jobr", 13),
    name: "acquisition.enrichment.lead",
    status: "FAILED",
    input: { leadId: leadId(2) },
    attempt: 3,
    queuedAt: failedAt,
    startedAt: failedAt,
    finishedAt: new Date(failedAt.getTime() + 95_000),
    errorSummary: "The website crawl timed out after 3 attempts.",
    createdAt: failedAt,
  });
  job({
    id: seedId("jobr", 14),
    name: "acquisition.enrichment.lead",
    status: "SUCCEEDED",
    input: { leadId: leadId(2) },
    parentRunId: seedId("jobr", 13),
    attempt: 1,
    queuedAt: ago(now, { hours: 20 }),
    startedAt: ago(now, { hours: 20 }),
    finishedAt: ago(now, { hours: 19.9 }),
    counts: JobCountsSchema.parse({ pagesCrawled: 6, contactsFound: 1 }),
    createdAt: ago(now, { hours: 20 }),
  });
  job({
    id: seedId("jobr", 15),
    name: "acquisition.audits.lead",
    status: "RUNNING",
    input: { leadId: leadId(4) },
    attempt: 1,
    queuedAt: ago(now, { hours: 2.5 }),
    startedAt: ago(now, { hours: 2.4 }),
    progress: toJsonInput(
      JobProgressSchema.parse({
        step: "web.mobile_viewport",
        message: "2 of 5 checks done",
        done: 2,
        total: 5,
        updatedAt: ago(now, { minutes: 4 }).toISOString(),
      }),
    ),
    createdAt: ago(now, { hours: 2.5 }),
  });
  job({
    id: seedId("jobr", 16),
    name: "acquisition.outreach.tick",
    status: "SUCCEEDED",
    attempt: 1,
    queuedAt: ago(now, { minutes: 15 }),
    startedAt: ago(now, { minutes: 15 }),
    finishedAt: ago(now, { minutes: 14 }),
    counts: JobCountsSchema.parse({ due: 3, sent: 2, skipped: 1 }),
    createdAt: ago(now, { minutes: 15 }),
  });
  job({
    id: seedId("jobr", 17),
    name: "acquisition.inbox.poll",
    status: "SUCCEEDED",
    attempt: 1,
    queuedAt: ago(now, { minutes: 5 }),
    startedAt: ago(now, { minutes: 5 }),
    finishedAt: ago(now, { minutes: 4.5 }),
    counts: JobCountsSchema.parse({ fetched: 4, matched: 3, unmatched: 1 }),
    createdAt: ago(now, { minutes: 5 }),
  });
  job({
    id: seedId("jobr", 18),
    name: "acquisition.inbox.poll",
    status: "CANCELLED",
    attempt: 1,
    queuedAt: ago(now, { hours: 6 }),
    startedAt: ago(now, { hours: 6 }),
    finishedAt: ago(now, { hours: 5.9 }),
    errorSummary: "Cancelled by a manager during mailbox maintenance.",
    actorType: "USER",
    actorId: userId("manager"),
    createdAt: ago(now, { hours: 6 }),
  });
  job({
    id: seedId("jobr", 19),
    name: "acquisition.pipeline.reengage",
    status: "SUCCEEDED",
    attempt: 1,
    queuedAt: ago(now, { days: 2 }),
    startedAt: ago(now, { days: 2 }),
    finishedAt: ago(now, { days: 2 }),
    counts: JobCountsSchema.parse({ reengaged: 1 }),
    createdAt: ago(now, { days: 2 }),
  });
  job({
    id: seedId("jobr", 20),
    name: "acquisition.crosssell.detect",
    status: "SUCCEEDED",
    attempt: 1,
    queuedAt: ago(now, { days: 6 }),
    startedAt: ago(now, { days: 6 }),
    finishedAt: ago(now, { days: 6 }),
    counts: JobCountsSchema.parse({ groupsCreated: 1 }),
    createdAt: ago(now, { days: 6 }),
  });

  // ---- Notifications (~25) ----
  const notifications: PlatformWorld["notifications"] = [];
  const notify = (
    userKey: Parameters<typeof userId>[0],
    type: string,
    title: string,
    lead: LeadInfo | null,
    read: boolean,
    hoursAgo: number,
    email = false,
  ) => {
    const n = notifications.length + 1;
    const line = lead?.spec.line;
    notifications.push({
      id: seedId("noti", n),
      userId: userId(userKey),
      type,
      title,
      link:
        lead === null
          ? type.startsWith("job")
            ? "/admin/jobs"
            : type.startsWith("integration")
              ? "/admin/integrations"
              : "/acquisition"
          : `/acquisition/${LINE_SLUG[lead.spec.line]}/leads/${lead.id}`,
      data: toJsonInput(
        NotificationDataSchema.parse({
          ...(lead === null ? {} : { entity: { type: "acquisition.lead", id: lead.id } }),
          ...(line === undefined ? {} : { serviceLine: line }),
          values: lead === null ? {} : { company: lead.company.name },
        }),
      ),
      readAt: read ? ago(now, { hours: Math.max(hoursAgo - 1, 0) }) : null,
      dedupeKey: `seed:${type}:${String(n)}`,
      channelsSent: email ? ["IN_APP", "EMAIL"] : ["IN_APP"],
      createdAt: ago(now, { hours: hoursAgo }),
    });
  };
  notify(
    "webLead",
    "reply.interested",
    "Interested reply from Harbor & Pine Realty",
    byLead(leads, 13),
    false,
    1,
    true,
  );
  notify(
    "zainab",
    "reply.interested",
    "Interested reply from Tom Reid Plumbing",
    byLead(leads, 70),
    true,
    130,
    true,
  );
  notify(
    "webLead",
    "reply.interested",
    "Interested reply from Harbourview Properties",
    byLead(leads, 14),
    true,
    70,
    true,
  );
  notify(
    "uiuxLead",
    "reply.needs-action",
    "A question needs an answer: Maitama Suites",
    byLead(leads, 31),
    false,
    3,
  );
  notify(
    "zainab",
    "reply.needs-action",
    "Unclear reply needs a look: Mesa Home Services",
    byLead(leads, 68),
    false,
    24,
  );
  notify(
    "webLead",
    "meeting.reminder",
    "Meeting in 90 minutes: Harbourview Properties",
    byLead(leads, 14),
    false,
    0.5,
    true,
  );
  notify(
    "zainab",
    "meeting.reminder",
    "Meeting tomorrow: Sunfield Pediatrics",
    byLead(leads, 32),
    false,
    2,
    true,
  );
  notify(
    "graphicLead",
    "meeting.reminder",
    "WhatsApp call in 3 days: Mainland Pharmacy",
    byLead(leads, 50),
    true,
    20,
  );
  for (const [key, n] of [
    ["kelechi", 15],
    ["uiuxLead", 33],
    ["graphicLead", 51],
    ["videoLead", 71],
  ] as const) {
    notify(
      key,
      "meeting.reminder",
      `Meeting held: ${byLead(leads, n).company.name}`,
      byLead(leads, n),
      true,
      24 * 8,
    );
  }
  for (const key of [
    "webLead",
    "uiuxLead",
    "graphicLead",
    "videoLead",
    "zainab",
    "manager",
  ] as const) {
    notify(
      key,
      "review.queue-waiting",
      "Drafts are waiting for your review",
      null,
      key === "manager",
      4,
    );
  }
  notify(
    "graphicLead",
    "capacity.line-full",
    "Graphic Design is at capacity: new leads go to nurture",
    null,
    false,
    72,
    true,
  );
  notify("manager", "capacity.line-full", "Graphic Design is at capacity", null, true, 72, true);
  notify(
    "uiuxLead",
    "capacity.line-full",
    "UI/UX Design is slowing down (80% of capacity)",
    null,
    true,
    70,
    true,
  );
  notify("manager", "capacity.line-full", "UI/UX Design is slowing down", null, true, 70);
  notify(
    "admin",
    "job.failed",
    "Background job failed: acquisition.enrichment.lead",
    null,
    true,
    27,
    true,
  );
  notify(
    "admin",
    "integration.failing",
    "SerpAPI is failing: 503 from the provider",
    null,
    false,
    16 * 24,
    true,
  );
  notify("admin", "integration.failing", "Hunter daily quota reached", null, true, 3 * 24, true);

  // ---- Audit log (~30): role changes, a credential save (redacted), publishes, suppressions, DSRs ----
  const auditLogs: PlatformWorld["auditLogs"] = [];
  const audit = (
    action: string,
    targetType: string,
    targetId: string,
    daysAgo: number,
    before: Prisma.InputJsonValue | null,
    after: Prisma.InputJsonValue | null,
    actor = admin,
  ) =>
    auditLogs.push({
      id: seedId("audl", auditLogs.length + 1),
      actorType: "USER",
      actorId: actor,
      action,
      targetType,
      targetId,
      ...(before === null ? {} : { before }),
      ...(after === null ? {} : { after }),
      ip: "127.0.0.1",
      userAgent: "seed",
      createdAt: ago(now, { days: daysAgo }),
    });
  audit(
    "platform.user.changeRole",
    "platform.user",
    userId("manager"),
    140,
    { role: "SERVICE_LEAD" },
    { role: "MANAGER" },
  );
  audit(
    "platform.user.changeRole",
    "platform.user",
    userId("kelechi"),
    120,
    { role: "SERVICE_LEAD" },
    { role: "MEMBER" },
  );
  audit("platform.credential.manage", "platform.credential", "google-places", 110, null, {
    provider: "google-places",
    value: "[REDACTED]",
    maskedHint: "••••",
  });
  ALL_LINES.forEach((line) =>
    audit(
      "acquisition.profile.publish",
      "acquisition.profileVersion",
      profileVersionId(line),
      120,
      null,
      { serviceLine: line, version: 1, note: PLACEHOLDER_NOTE },
    ),
  );
  for (const suppression of compliance.suppressions.filter(
    (row) => row.createdById !== undefined && row.createdById !== null,
  )) {
    audit("acquisition.suppression.add", "acquisition.suppression", suppression.id, 20, null, {
      type: suppression.type,
      reason: suppression.reason,
      source: suppression.source,
    });
  }
  for (const request of compliance.dataSubjectRequests) {
    audit(
      "acquisition.dsr.manage",
      "acquisition.dsr",
      request.id,
      request.status === "COMPLETED" ? 20 : 3,
      null,
      { type: request.type, status: request.status },
    );
  }
  for (const row of settings.filter(
    (candidate) =>
      candidate.key !== "platform.companyName" && candidate.key !== "module.acquisition.enabled",
  )) {
    audit("platform.setting.update", "platform.setting", row.key, 95, null, { key: row.key });
  }
  audit(
    "platform.module.toggle",
    "platform.module",
    "acquisition",
    100,
    { enabled: false },
    { enabled: true },
  );
  for (const message of outreach.messages.filter(
    (row) => row.status === "SCHEDULED" || row.status === "PREPARED",
  )) {
    audit(
      "acquisition.message.approve",
      "acquisition.message",
      message.id,
      0.5,
      { status: "DRAFT" },
      { status: message.status },
      message.approvedById ?? admin,
    );
  }
  for (const deal of pipeline.deals) {
    audit(
      "acquisition.deal.close",
      "acquisition.deal",
      deal.id,
      10,
      null,
      { outcome: deal.outcome },
      deal.closedById,
    );
  }
  audit("platform.prompt.publish", "platform.promptVersion", seedId("prmv", 1), 90, null, {
    task: "platform.summarize-company",
    version: 1,
  });

  // ---- Provider usage: 14 days of daily counters ----
  const providerUsages: PlatformWorld["providerUsages"] = [];
  const PROVIDERS = [
    { provider: "google-places", calls: [8, 30], costPerCall: 32_000 },
    { provider: "serpapi", calls: [4, 20], costPerCall: 15_000 },
    { provider: "youtube-data", calls: [20, 90], costPerCall: 0 },
    { provider: "hunter", calls: [6, 25], costPerCall: 34_000 },
    { provider: "pagespeed", calls: [15, 60], costPerCall: 0 },
  ] as const;
  for (const {
    provider,
    calls: [low, high],
    costPerCall,
  } of PROVIDERS) {
    for (let back = 13; back >= 0; back -= 1) {
      const capHit = provider === "serpapi" && back === 3;
      const calls = capHit ? high : low + ((back * 7 + provider.length * 3) % (high - low));
      providerUsages.push({
        id: seedId("pusg", providerUsages.length + 1),
        provider,
        day: dayOf(now, back),
        calls,
        costMicros: calls * costPerCall,
        capHit,
      });
    }
  }

  return {
    users,
    teamProfiles,
    settings,
    aiCalls,
    promptVersions,
    jobRuns,
    notifications,
    auditLogs,
    providerUsages,
  };
}
