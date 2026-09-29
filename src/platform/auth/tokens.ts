/**
 * Random token generation and hashing for invites and one-off tokens.
 *
 * Tokens are 32 bytes of `crypto.randomBytes`, printed as base64url (no padding). Storage is
 * SHA-256 (hex) so a database read never yields a usable token, and comparisons run in constant
 * time when we look invites up.
 */

import "server-only";

import { createHash, randomBytes } from "node:crypto";

export interface Token {
  /** The plaintext token to send in the invite/reset link. */
  plain: string;
  /** The SHA-256 hex hash to store in the database. */
  hash: string;
}

export function newToken(): Token {
  const plain = randomBytes(32).toString("base64url");
  return { plain, hash: hashToken(plain) };
}

export function hashToken(plain: string): string {
  return createHash("sha256").update(plain, "utf8").digest("hex");
}
