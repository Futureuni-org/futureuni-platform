/**
 * Factories for the auth, team and platform-core models (prisma/schema/auth.prisma and core.prisma).
 * `build*` returns a valid create input without touching the database; `create*` inserts it,
 * creating any required parent that the overrides don't name.
 */

import type {
  AiCall,
  AuditLog,
  DomainEvent,
  EmailDelivery,
  FileObject,
  IdempotencyKey,
  IntegrationCredential,
  Invite,
  JobRun,
  Notification,
  NotificationPreference,
  Prisma,
  PromptVersion,
  ProviderUsage,
  RateLimit,
  SavedView,
  Session,
  Setting,
  TeamProfile,
  Tx,
  TwoFactor,
  User,
  Verification,
  WebhookEvent,
  Account,
} from "@/platform/db";

import { FIXED_NOW, seq, uniqueEmail, uniqueToken } from "./sequence";

type Input<T> = Partial<T>;

// ---- Users, auth and team ------------------------------------------------------------------

export function buildUser(
  overrides: Input<Prisma.UserUncheckedCreateInput> = {},
): Prisma.UserUncheckedCreateInput {
  const n = seq();
  return {
    name: `User ${String(n)}`,
    email: uniqueEmail("user"),
    emailVerified: true,
    role: "MEMBER",
    ...overrides,
  };
}
export function createUser(
  tx: Tx,
  overrides: Input<Prisma.UserUncheckedCreateInput> = {},
): Promise<User> {
  return tx.user.create({ data: buildUser(overrides) });
}

export function buildTeamProfile(
  overrides: Input<Prisma.TeamProfileUncheckedCreateInput> & { userId: string },
): Prisma.TeamProfileUncheckedCreateInput {
  return {
    serviceLines: ["WEB_DEVELOPMENT"],
    weeklyCapacity: 3,
    timezone: "Africa/Lagos",
    ...overrides,
  };
}
export async function createTeamProfile(
  tx: Tx,
  overrides: Input<Prisma.TeamProfileUncheckedCreateInput> = {},
): Promise<TeamProfile> {
  const userId = overrides.userId ?? (await createUser(tx)).id;
  return tx.teamProfile.create({ data: buildTeamProfile({ ...overrides, userId }) });
}

/** A user with a team profile, the shape permission checks read (role, lines, canApprove). */
export async function createTeamMember(
  tx: Tx,
  options: {
    role?: User["role"];
    serviceLines?: TeamProfile["serviceLines"];
    canApprove?: boolean;
    user?: Input<Prisma.UserUncheckedCreateInput>;
    profile?: Input<Prisma.TeamProfileUncheckedCreateInput>;
  } = {},
): Promise<{ user: User; teamProfile: TeamProfile }> {
  const user = await createUser(tx, { role: options.role ?? "MEMBER", ...options.user });
  const teamProfile = await createTeamProfile(tx, {
    userId: user.id,
    serviceLines: options.serviceLines ?? ["WEB_DEVELOPMENT"],
    canApprove: options.canApprove ?? false,
    ...options.profile,
  });
  return { user, teamProfile };
}

export function buildSession(
  overrides: Input<Prisma.SessionUncheckedCreateInput> & { userId: string },
): Prisma.SessionUncheckedCreateInput {
  return {
    token: `session-${uniqueToken()}`,
    expiresAt: new Date(FIXED_NOW.getTime() + 30 * 86_400_000),
    ...overrides,
  };
}
export async function createSession(
  tx: Tx,
  overrides: Input<Prisma.SessionUncheckedCreateInput> = {},
): Promise<Session> {
  const userId = overrides.userId ?? (await createUser(tx)).id;
  return tx.session.create({ data: buildSession({ ...overrides, userId }) });
}

export function buildAccount(
  overrides: Input<Prisma.AccountUncheckedCreateInput> & { userId: string },
): Prisma.AccountUncheckedCreateInput {
  return {
    providerId: "credential",
    accountId: overrides.userId,
    password: "test-only-hash",
    ...overrides,
  };
}
export async function createAccount(
  tx: Tx,
  overrides: Input<Prisma.AccountUncheckedCreateInput> = {},
): Promise<Account> {
  const userId = overrides.userId ?? (await createUser(tx)).id;
  return tx.account.create({ data: buildAccount({ ...overrides, userId }) });
}

export function buildVerification(
  overrides: Input<Prisma.VerificationUncheckedCreateInput> = {},
): Prisma.VerificationUncheckedCreateInput {
  return {
    identifier: `reset-password:${uniqueToken()}`,
    value: uniqueToken(),
    expiresAt: new Date(FIXED_NOW.getTime() + 3_600_000),
    ...overrides,
  };
}
export function createVerification(
  tx: Tx,
  overrides: Input<Prisma.VerificationUncheckedCreateInput> = {},
): Promise<Verification> {
  return tx.verification.create({ data: buildVerification(overrides) });
}

export function buildTwoFactor(
  overrides: Input<Prisma.TwoFactorUncheckedCreateInput> & { userId: string },
): Prisma.TwoFactorUncheckedCreateInput {
  return { secret: `test-secret-${uniqueToken()}`, backupCodes: "test-backup-codes", ...overrides };
}
export async function createTwoFactor(
  tx: Tx,
  overrides: Input<Prisma.TwoFactorUncheckedCreateInput> = {},
): Promise<TwoFactor> {
  const userId = overrides.userId ?? (await createUser(tx)).id;
  return tx.twoFactor.create({ data: buildTwoFactor({ ...overrides, userId }) });
}

export function buildRateLimit(
  overrides: Input<Prisma.RateLimitUncheckedCreateInput> = {},
): Prisma.RateLimitUncheckedCreateInput {
  return {
    key: `127.0.0.1:/sign-in:${uniqueToken()}`,
    count: 1,
    lastRequest: BigInt(FIXED_NOW.getTime()),
    ...overrides,
  };
}
export function createRateLimit(
  tx: Tx,
  overrides: Input<Prisma.RateLimitUncheckedCreateInput> = {},
): Promise<RateLimit> {
  return tx.rateLimit.create({ data: buildRateLimit(overrides) });
}

export function buildInvite(
  overrides: Input<Prisma.InviteUncheckedCreateInput> & { invitedById: string },
): Prisma.InviteUncheckedCreateInput {
  return {
    email: uniqueEmail("invitee"),
    role: "MEMBER",
    serviceLines: ["WEB_DEVELOPMENT"],
    tokenHash: `hash-${uniqueToken()}`,
    expiresAt: new Date(FIXED_NOW.getTime() + 7 * 86_400_000),
    ...overrides,
  };
}
export async function createInvite(
  tx: Tx,
  overrides: Input<Prisma.InviteUncheckedCreateInput> = {},
): Promise<Invite> {
  const invitedById = overrides.invitedById ?? (await createUser(tx, { role: "ADMIN" })).id;
  return tx.invite.create({ data: buildInvite({ ...overrides, invitedById }) });
}

// ---- Audit log, notifications, email ----------------------------------------------------------

export function buildAuditLog(
  overrides: Input<Prisma.AuditLogUncheckedCreateInput> = {},
): Prisma.AuditLogUncheckedCreateInput {
  return {
    actorType: "SYSTEM",
    actorLabel: "platform.test",
    action: "platform.setting.update",
    targetType: "platform.setting",
    targetId: `setting-${uniqueToken()}`,
    ...overrides,
  };
}
export function createAuditLog(
  tx: Tx,
  overrides: Input<Prisma.AuditLogUncheckedCreateInput> = {},
): Promise<AuditLog> {
  return tx.auditLog.create({ data: buildAuditLog(overrides) });
}

export function buildNotification(
  overrides: Input<Prisma.NotificationUncheckedCreateInput> & { userId: string },
): Prisma.NotificationUncheckedCreateInput {
  return {
    type: "job.failed",
    title: `Notification ${String(seq())}`,
    channelsSent: ["IN_APP"],
    ...overrides,
  };
}
export async function createNotification(
  tx: Tx,
  overrides: Input<Prisma.NotificationUncheckedCreateInput> = {},
): Promise<Notification> {
  const userId = overrides.userId ?? (await createUser(tx)).id;
  return tx.notification.create({ data: buildNotification({ ...overrides, userId }) });
}

export function buildNotificationPreference(
  overrides: Input<Prisma.NotificationPreferenceUncheckedCreateInput> & { userId: string },
): Prisma.NotificationPreferenceUncheckedCreateInput {
  return { type: `test.type-${String(seq())}`, channel: "EMAIL", enabled: false, ...overrides };
}
export async function createNotificationPreference(
  tx: Tx,
  overrides: Input<Prisma.NotificationPreferenceUncheckedCreateInput> = {},
): Promise<NotificationPreference> {
  const userId = overrides.userId ?? (await createUser(tx)).id;
  return tx.notificationPreference.create({
    data: buildNotificationPreference({ ...overrides, userId }),
  });
}

export function buildEmailDelivery(
  overrides: Input<Prisma.EmailDeliveryUncheckedCreateInput> = {},
): Prisma.EmailDeliveryUncheckedCreateInput {
  return {
    to: uniqueEmail("recipient"),
    template: "invite",
    subject: "You're invited to FUTUREUNI",
    provider: "mock",
    dedupeKey: `email-${uniqueToken()}`,
    ...overrides,
  };
}
export function createEmailDelivery(
  tx: Tx,
  overrides: Input<Prisma.EmailDeliveryUncheckedCreateInput> = {},
): Promise<EmailDelivery> {
  return tx.emailDelivery.create({ data: buildEmailDelivery(overrides) });
}

// ---- Settings and credentials ----------------------------------------------------------------

/** A PLATFORM-scope setting by default; pass scope "USER" with a userId for a user setting. */
export function buildSetting(
  overrides: Input<Prisma.SettingUncheckedCreateInput> = {},
): Prisma.SettingUncheckedCreateInput {
  return { key: `platform.test-${uniqueToken()}`, scope: "PLATFORM", value: true, ...overrides };
}
export function createSetting(
  tx: Tx,
  overrides: Input<Prisma.SettingUncheckedCreateInput> = {},
): Promise<Setting> {
  return tx.setting.create({ data: buildSetting(overrides) });
}

/** Fake ciphertext only: tests never store real secrets (INV-21). */
export function buildIntegrationCredential(
  overrides: Input<Prisma.IntegrationCredentialUncheckedCreateInput> & { createdById: string },
): Prisma.IntegrationCredentialUncheckedCreateInput {
  return {
    provider: `test-provider-${uniqueToken()}`,
    ciphertext: "dGVzdC1vbmx5LWNpcGhlcnRleHQ=",
    iv: "dGVzdC1pdi0xMg==",
    authTag: "dGVzdC1hdXRoLXRhZw==",
    keyVersion: 1,
    maskedHint: "sk-…test",
    ...overrides,
  };
}
export async function createIntegrationCredential(
  tx: Tx,
  overrides: Input<Prisma.IntegrationCredentialUncheckedCreateInput> = {},
): Promise<IntegrationCredential> {
  const createdById = overrides.createdById ?? (await createUser(tx, { role: "ADMIN" })).id;
  return tx.integrationCredential.create({
    data: buildIntegrationCredential({ ...overrides, createdById }),
  });
}

// ---- AI usage and prompt versions ---------------------------------------------------------------

export function buildAiCall(
  overrides: Input<Prisma.AiCallUncheckedCreateInput> = {},
): Prisma.AiCallUncheckedCreateInput {
  return {
    task: "platform.summarize-company",
    promptVersion: 1,
    model: "mock-model",
    provider: "mock",
    actorType: "SYSTEM",
    module: "platform",
    inputTokens: 1_200,
    outputTokens: 180,
    costMicros: 410,
    latencyMs: 850,
    outcome: "OK",
    ...overrides,
  };
}
export function createAiCall(
  tx: Tx,
  overrides: Input<Prisma.AiCallUncheckedCreateInput> = {},
): Promise<AiCall> {
  return tx.aiCall.create({ data: buildAiCall(overrides) });
}

export function buildPromptVersion(
  overrides: Input<Prisma.PromptVersionUncheckedCreateInput> & { authorId: string },
): Prisma.PromptVersionUncheckedCreateInput {
  return {
    task: `platform.test-task-${uniqueToken()}`,
    version: 1,
    contentHash: `sha256-${uniqueToken()}`,
    compiledPrompt: "You summarise companies from supplied facts only.",
    changelog: "First version",
    ...overrides,
  };
}
export async function createPromptVersion(
  tx: Tx,
  overrides: Input<Prisma.PromptVersionUncheckedCreateInput> = {},
): Promise<PromptVersion> {
  const authorId = overrides.authorId ?? (await createUser(tx, { role: "ADMIN" })).id;
  return tx.promptVersion.create({ data: buildPromptVersion({ ...overrides, authorId }) });
}

// ---- Jobs, events, webhooks, idempotency ------------------------------------------------------

export function buildJobRun(
  overrides: Input<Prisma.JobRunUncheckedCreateInput> = {},
): Prisma.JobRunUncheckedCreateInput {
  return {
    name: "platform.test-job",
    idempotencyKey: `platform.test-job:${uniqueToken()}`,
    actorType: "SYSTEM",
    status: "SUCCEEDED",
    attempt: 1,
    ...overrides,
  };
}
export function createJobRun(
  tx: Tx,
  overrides: Input<Prisma.JobRunUncheckedCreateInput> = {},
): Promise<JobRun> {
  return tx.jobRun.create({ data: buildJobRun(overrides) });
}

export function buildDomainEvent(
  overrides: Input<Prisma.DomainEventUncheckedCreateInput> = {},
): Prisma.DomainEventUncheckedCreateInput {
  return {
    name: "job.failed",
    payload: {
      jobRunId: "cm1job00000000000000000001",
      name: "platform.test-job",
      errorSummary: "Failed",
    },
    actorType: "SYSTEM",
    ...overrides,
  };
}
export function createDomainEvent(
  tx: Tx,
  overrides: Input<Prisma.DomainEventUncheckedCreateInput> = {},
): Promise<DomainEvent> {
  return tx.domainEvent.create({ data: buildDomainEvent(overrides) });
}

export function buildWebhookEvent(
  overrides: Input<Prisma.WebhookEventUncheckedCreateInput> = {},
): Prisma.WebhookEventUncheckedCreateInput {
  return {
    provider: "mock",
    eventId: `evt-${uniqueToken()}`,
    payloadHash: "0".repeat(64),
    ...overrides,
  };
}
export function createWebhookEvent(
  tx: Tx,
  overrides: Input<Prisma.WebhookEventUncheckedCreateInput> = {},
): Promise<WebhookEvent> {
  return tx.webhookEvent.create({ data: buildWebhookEvent(overrides) });
}

export function buildIdempotencyKey(
  overrides: Input<Prisma.IdempotencyKeyUncheckedCreateInput> = {},
): Prisma.IdempotencyKeyUncheckedCreateInput {
  return {
    scope: "action:acquisition.search.run",
    key: `key-${uniqueToken()}`,
    requestHash: "0".repeat(64),
    expiresAt: new Date(FIXED_NOW.getTime() + 86_400_000),
    ...overrides,
  };
}
export function createIdempotencyKey(
  tx: Tx,
  overrides: Input<Prisma.IdempotencyKeyUncheckedCreateInput> = {},
): Promise<IdempotencyKey> {
  return tx.idempotencyKey.create({ data: buildIdempotencyKey(overrides) });
}

export function buildProviderUsage(
  overrides: Input<Prisma.ProviderUsageUncheckedCreateInput> = {},
): Prisma.ProviderUsageUncheckedCreateInput {
  return {
    provider: `test-provider-${uniqueToken()}`,
    day: new Date("2026-10-03T00:00:00.000Z"),
    calls: 12,
    costMicros: 34_000,
    ...overrides,
  };
}
export function createProviderUsage(
  tx: Tx,
  overrides: Input<Prisma.ProviderUsageUncheckedCreateInput> = {},
): Promise<ProviderUsage> {
  return tx.providerUsage.create({ data: buildProviderUsage(overrides) });
}

// ---- Files and saved views -----------------------------------------------------------------

export function buildFileObject(
  overrides: Input<Prisma.FileObjectUncheckedCreateInput> = {},
): Prisma.FileObjectUncheckedCreateInput {
  return {
    key: `test/${uniqueToken()}.webp`,
    purpose: "AUDIT_SCREENSHOT",
    contentType: "image/webp",
    sizeBytes: 2_048,
    ...overrides,
  };
}
export function createFileObject(
  tx: Tx,
  overrides: Input<Prisma.FileObjectUncheckedCreateInput> = {},
): Promise<FileObject> {
  return tx.fileObject.create({ data: buildFileObject(overrides) });
}

export function buildSavedView(
  overrides: Input<Prisma.SavedViewUncheckedCreateInput> & { userId: string },
): Prisma.SavedViewUncheckedCreateInput {
  return {
    scope: "acquisition.leads",
    name: `View ${String(seq())}`,
    query: { status: ["IN_REVIEW"] },
    ...overrides,
  };
}
export async function createSavedView(
  tx: Tx,
  overrides: Input<Prisma.SavedViewUncheckedCreateInput> = {},
): Promise<SavedView> {
  const userId = overrides.userId ?? (await createUser(tx)).id;
  return tx.savedView.create({ data: buildSavedView({ ...overrides, userId }) });
}
