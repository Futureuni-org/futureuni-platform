/**
 * Key rotation. Re-encrypts every `IntegrationCredential` row with a new key and key version.
 *
 * Called from `pnpm credentials:rotate` (`scripts/credentials-rotate.mjs`). The old and new keys
 * are passed by the caller so this module never reads two conflicting values from the env.
 */

import "server-only";

import { db } from "@/platform/db";

import { decryptWith, encryptWith } from "./crypto";

export interface RotateResult {
  scanned: number;
  rotated: number;
  skipped: number;
}

/**
 * Rotate every stored credential to `newKeyBase64` with `newKeyVersion`.
 * A row already at `newKeyVersion` is skipped (idempotent).
 * On decryption failure the caller sees an error naming the provider; nothing is written.
 */
export async function rotateEncryptionKey(
  oldKeyBase64: string,
  newKeyBase64: string,
  newKeyVersion: number,
): Promise<RotateResult> {
  const rows = await db.integrationCredential.findMany({
    select: {
      id: true,
      provider: true,
      ciphertext: true,
      iv: true,
      authTag: true,
      keyVersion: true,
    },
  });
  let rotated = 0;
  let skipped = 0;
  for (const row of rows) {
    if (row.keyVersion === newKeyVersion) {
      skipped += 1;
      continue;
    }
    const plaintext = decryptWith(row, oldKeyBase64);
    const next = encryptWith(plaintext, newKeyBase64, newKeyVersion);
    await db.integrationCredential.update({
      where: { id: row.id },
      data: {
        ciphertext: next.ciphertext,
        iv: next.iv,
        authTag: next.authTag,
        keyVersion: next.keyVersion,
      },
    });
    rotated += 1;
  }
  return { scanned: rows.length, rotated, skipped };
}
