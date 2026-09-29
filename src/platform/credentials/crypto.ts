/**
 * AES-256-GCM encryption for the credentials vault (INV-21).
 *
 * - The key is `CREDENTIALS_ENCRYPTION_KEY` (32 bytes, base64) from `src/env.ts`.
 * - Each record uses a random 12-byte IV; the auth tag is stored alongside so tampering fails.
 * - `keyVersion` is `CREDENTIALS_KEY_VERSION` (integer); on rotation, `rotateEncryptionKey` reads
 *   each record with the old key material and re-encrypts under the new one.
 *
 * Plaintext never touches the database, logs, audit entries or client code.
 */

import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "@/env";
import { AppError } from "@/lib/errors";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV is the AES-GCM standard
const AUTH_TAG_LENGTH = 16;

export interface EncryptedRecord {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
  keyVersion: number;
}

function decodeKey(base64: string): Buffer {
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) {
    throw new AppError("INTERNAL", "The credentials encryption key must be 32 bytes.");
  }
  return key;
}

/** Encrypts a UTF-8 string with the configured key and version. */
export function encrypt(plaintext: string): EncryptedRecord {
  return encryptWith(plaintext, env.CREDENTIALS_ENCRYPTION_KEY, env.CREDENTIALS_KEY_VERSION);
}

/** Decrypts a stored record with the configured key. Throws `PROVIDER_ERROR` on tamper. */
export function decrypt(record: EncryptedRecord): string {
  return decryptWith(record, env.CREDENTIALS_ENCRYPTION_KEY);
}

/** Encrypt with a specific base64-encoded key (used by tests and by rotation). */
export function encryptWith(plaintext: string, keyBase64: string, keyVersion: number): EncryptedRecord {
  const key = decodeKey(keyBase64);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    keyVersion,
  };
}

/** Decrypt with a specific base64-encoded key. Throws `PROVIDER_ERROR` on any tampering. */
export function decryptWith(record: EncryptedRecord, keyBase64: string): string {
  const key = decodeKey(keyBase64);
  try {
    const decipher = createDecipheriv(ALGO, key, Buffer.from(record.iv, "base64"), {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(Buffer.from(record.authTag, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, "base64")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch (cause) {
    throw new AppError("PROVIDER_ERROR", "Stored credential is corrupt or tampered.", { cause });
  }
}
