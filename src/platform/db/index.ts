/**
 * @/platform/db: the only way into the database (with `*.repo.ts` files built on it).
 * Code never imports the generated Prisma client directly (lint-enforced).
 */

import "server-only";

export { db, dbIncludingDeleted, disconnectDb } from "./client";
export {
  dbOr,
  TRANSACTION_MAX_WAIT_MS,
  TRANSACTION_TIMEOUT_MS,
  withSavepoint,
  createOrOnConflict,
  withTransaction,
  type Db,
  type TransactionOptions,
  type Tx,
} from "./transaction";
export {
  afterClause,
  decodeCursor,
  DEFAULT_PAGE_SIZE,
  encodeCursor,
  MAX_PAGE_SIZE,
  NEWEST_FIRST,
  paginate,
  type Cursor,
} from "./pagination";
export {
  isUniqueViolation,
  rethrowDbError,
  sqlState,
  toDbAppError,
  violatedConstraint,
} from "./errors";
export { defineSeeder, type SeedContext, type Seeder } from "./seeder";
export { toJsonInput } from "./json";
export { SOFT_DELETE_MODELS } from "./soft-delete";

/** The Prisma namespace: input types (`Prisma.LeadWhereInput`), `Prisma.JsonNull`, `Prisma.sql`. */
export { Prisma } from "@/generated/prisma/client";

/** Row types for every model. */
export type {
  Account,
  AiCall,
  Audit,
  AuditCacheEntry,
  AuditCheckRun,
  AuditFinding,
  AuditLog,
  Company,
  CompanySourceRef,
  ConsentRecord,
  Contact,
  CrossSellGroup,
  DataSubjectRequest,
  Deal,
  DomainEvent,
  EmailDelivery,
  Enrollment,
  FileObject,
  Handoff,
  HandoffAssignment,
  IdempotencyKey,
  InboxThread,
  IntegrationCredential,
  Invite,
  JobRun,
  Lead,
  LeadEvent,
  LineCapacityState,
  Mailbox,
  MailboxDailyStat,
  MailboxSyncState,
  Meeting,
  Message,
  MessageAttachment,
  MessageCitation,
  Note,
  Notification,
  NotificationPreference,
  PromptVersion,
  Proposal,
  ProposalLineItem,
  ProviderUsage,
  RateLimit,
  Reply,
  ReplyCorrection,
  SavedSearch,
  SavedView,
  ScoreReview,
  SearchRun,
  SendingDomain,
  Sequence,
  SequenceStep,
  ServiceLineProfileVersion,
  Session,
  Setting,
  Signal,
  Suppression,
  TeamProfile,
  TrackingEvent,
  TwoFactor,
  User,
  Verification,
  WebhookEvent,
} from "@/generated/prisma/client";
