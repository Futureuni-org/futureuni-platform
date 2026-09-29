/**
 * Credentials vault service (Phase 6, INV-21). Every function is server-only.
 *
 * Storage is AES-256-GCM ciphertext (`crypto.ts`), plus the masked hint, the current status, and
 * timestamps. Plaintext never appears in the database, in logs, in audit entries or in the shape
 * returned by `getCredentialStatus`.
 *
 * Permission checks use `SEAM-PERMISSION` (Phase 6 stand-in; replaced by `assertCan` at merge).
 */

import "server-only";

import type { Actor, ProviderId } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { db } from "@/platform/db";
import { assertActorCan } from "@/platform/auth";
import { audit } from "@/platform/audit-log";

import { decrypt, encrypt } from "./crypto";
import {
  getProvider,
  listProviders,
  maskHint,
  readProviderEnvKey,
  type CredentialPayload,
  type ProviderDefinition,
} from "./providers";

export interface CredentialStatus {
  provider: ProviderId;
  label: string;
  category: ProviderDefinition["category"];
  configured: boolean;
  status: "NOT_TESTED" | "OK" | "FAILING";
  maskedHint: string | null;
  lastTestedAt: Date | null;
  lastError: string | null;
  keyVersion: number | null;
  updatedAt: Date | null;
}

function requireProvider(id: ProviderId): ProviderDefinition {
  const provider = getProvider(id);
  if (provider === null) {
    throw new AppError("NOT_FOUND", `Unknown provider: ${id}`);
  }
  return provider;
}

/** Validate `payload` with the provider's schema. Throws VALIDATION_FAILED with field details. */
function parsePayload(provider: ProviderDefinition, payload: unknown): CredentialPayload {
  const result = provider.schema.safeParse(payload);
  if (!result.success) {
    const details = result.error.issues.reduce<Record<string, string>>((acc, issue) => {
      acc[issue.path.join(".") || "(payload)"] = issue.message;
      return acc;
    }, {});
    throw new AppError("VALIDATION_FAILED", "Invalid credential payload.", { details });
  }
  return result.data;
}

/** Store or replace a provider's credential. `ADMIN` only. Audited without the payload. */
export async function saveCredential(
  actor: Actor,
  providerId: ProviderId,
  rawPayload: unknown,
): Promise<CredentialStatus> {
  await assertActorCan(actor, "platform.credential.manage");
  if (actor.type !== "USER") throw new AppError("FORBIDDEN", "Only a user can save credentials.");
  const provider = requireProvider(providerId);
  const payload = parsePayload(provider, rawPayload);
  const record = encrypt(JSON.stringify(payload));
  const maskedHint = maskHint(payload, provider.hintFrom);

  const before = await db.integrationCredential.findUnique({
    where: { provider: providerId },
    select: { id: true, status: true, maskedHint: true },
  });

  const row = await db.integrationCredential.upsert({
    where: { provider: providerId },
    create: {
      provider: providerId,
      ciphertext: record.ciphertext,
      iv: record.iv,
      authTag: record.authTag,
      keyVersion: record.keyVersion,
      maskedHint,
      status: "NOT_TESTED",
      createdById: actor.userId,
    },
    update: {
      ciphertext: record.ciphertext,
      iv: record.iv,
      authTag: record.authTag,
      keyVersion: record.keyVersion,
      maskedHint,
      status: "NOT_TESTED",
      lastTestedAt: null,
      lastError: null,
      updatedById: actor.userId,
    },
    select: {
      status: true,
      maskedHint: true,
      lastTestedAt: true,
      lastError: true,
      keyVersion: true,
      updatedAt: true,
    },
  });

  await audit.record(null, {
    actor,
    action: "platform.credential.manage",
    targetType: "IntegrationCredential",
    targetId: providerId,
    before: before === null ? null : { status: before.status, maskedHint: before.maskedHint },
    after: { status: row.status, maskedHint: row.maskedHint },
  });

  return toStatus(provider, row);
}

/** Server-only: returns the decrypted payload. Adapters use it; `SEAM-AI-CREDENTIALS` wires here. */
export async function getCredential<T extends CredentialPayload = CredentialPayload>(
  providerId: ProviderId,
): Promise<T | null> {
  const row = await db.integrationCredential.findUnique({
    where: { provider: providerId },
    select: { ciphertext: true, iv: true, authTag: true, keyVersion: true },
  });
  if (row === null) return null;
  const plaintext = decrypt(row);
  return JSON.parse(plaintext) as T;
}

/** Masked status of one provider, without any plaintext. */
export async function getCredentialStatus(providerId: ProviderId): Promise<CredentialStatus> {
  const provider = requireProvider(providerId);
  const row = await db.integrationCredential.findUnique({
    where: { provider: providerId },
    select: {
      status: true,
      maskedHint: true,
      lastTestedAt: true,
      lastError: true,
      keyVersion: true,
      updatedAt: true,
    },
  });
  return toStatus(provider, row);
}

/** All providers with their statuses. */
export async function listCredentialStatuses(actor: Actor): Promise<CredentialStatus[]> {
  await assertActorCan(actor, "platform.credential.read");
  const rows = await db.integrationCredential.findMany({
    select: {
      provider: true,
      status: true,
      maskedHint: true,
      lastTestedAt: true,
      lastError: true,
      keyVersion: true,
      updatedAt: true,
    },
  });
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  return listProviders().map((p) => toStatus(p, byProvider.get(p.id) ?? null));
}

function toStatus(
  provider: ProviderDefinition,
  row: {
    status: "NOT_TESTED" | "OK" | "FAILING";
    maskedHint: string;
    lastTestedAt: Date | null;
    lastError: string | null;
    keyVersion: number;
    updatedAt: Date;
  } | null,
): CredentialStatus {
  return {
    provider: provider.id,
    label: provider.label,
    category: provider.category,
    configured: row !== null,
    status: row?.status ?? "NOT_TESTED",
    maskedHint: row?.maskedHint ?? null,
    lastTestedAt: row?.lastTestedAt ?? null,
    lastError: row?.lastError ?? null,
    keyVersion: row?.keyVersion ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

/** Run the provider's test call. In mock mode it succeeds without network access. */
export async function testCredential(actor: Actor, providerId: ProviderId): Promise<CredentialStatus> {
  await assertActorCan(actor, "platform.credential.test");
  const provider = requireProvider(providerId);
  const payload = await getCredential(providerId);
  if (payload === null) {
    throw new AppError("NOT_FOUND", `No credential stored for ${providerId}.`);
  }
  const result = await provider.test(payload);
  const row = await db.integrationCredential.update({
    where: { provider: providerId },
    data: {
      status: result.ok ? "OK" : "FAILING",
      lastTestedAt: new Date(),
      lastError: result.ok ? null : result.error.slice(0, 500),
    },
    select: {
      status: true,
      maskedHint: true,
      lastTestedAt: true,
      lastError: true,
      keyVersion: true,
      updatedAt: true,
    },
  });
  await audit.record(null, {
    actor,
    action: "platform.credential.test",
    targetType: "IntegrationCredential",
    targetId: providerId,
    after: { status: row.status, lastError: row.lastError },
  });
  return toStatus(provider, row);
}

/** Remove a provider's stored credential. `ADMIN` only. */
export async function deleteCredential(actor: Actor, providerId: ProviderId): Promise<void> {
  await assertActorCan(actor, "platform.credential.manage");
  requireProvider(providerId);
  const before = await db.integrationCredential.findUnique({
    where: { provider: providerId },
    select: { status: true, maskedHint: true },
  });
  if (before === null) return;
  await db.integrationCredential.delete({ where: { provider: providerId } });
  await audit.record(null, {
    actor,
    action: "platform.credential.manage",
    targetType: "IntegrationCredential",
    targetId: providerId,
    before: { status: before.status, maskedHint: before.maskedHint },
    after: null,
  });
}

/**
 * Adapters use this to reach the outside world: the vault first, then the env variable, then
 * `null` (mock mode never has real keys). Payload is decoded to a plain string API key when the
 * provider stores `{ apiKey }`; other shapes are returned as a JSON string so the adapter can
 * parse them itself.
 */
export async function resolveProviderKey(providerId: ProviderId): Promise<string | null> {
  const payload = await getCredential(providerId);
  if (payload !== null) {
    if ("apiKey" in payload) return payload.apiKey;
    return JSON.stringify(payload);
  }
  return readProviderEnvKey(providerId);
}
