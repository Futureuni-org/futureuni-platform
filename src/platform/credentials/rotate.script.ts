/**
 * `pnpm credentials:rotate` entry point (Phase 6).
 *
 * Reads the OLD key from `CREDENTIALS_ENCRYPTION_KEY_OLD` and the NEW key from
 * `CREDENTIALS_ENCRYPTION_KEY`, then rotates every stored credential to the new key and version.
 * A row already at the new version is skipped, so the script is idempotent.
 *
 * Run with:  tsx src/platform/credentials/rotate.script.ts
 */

import { disconnectDb } from "@/platform/db";

import { rotateEncryptionKey } from "./rotate";

const say = (message: string): void => {
  process.stdout.write(`[credentials:rotate] ${message}\n`);
};

async function main(): Promise<void> {
  const oldKey = process.env.CREDENTIALS_ENCRYPTION_KEY_OLD;
  const newKey = process.env.CREDENTIALS_ENCRYPTION_KEY;
  const newVersion = Number.parseInt(process.env.CREDENTIALS_KEY_VERSION ?? "1", 10);
  if (oldKey === undefined || oldKey.trim() === "") {
    say("CREDENTIALS_ENCRYPTION_KEY_OLD is not set. Nothing to do.");
    process.exit(1);
  }
  if (newKey === undefined || newKey.trim() === "") {
    say("CREDENTIALS_ENCRYPTION_KEY is not set. Nothing to do.");
    process.exit(1);
  }
  if (!Number.isInteger(newVersion) || newVersion < 1) {
    say("CREDENTIALS_KEY_VERSION must be a positive integer.");
    process.exit(1);
  }
  const result = await rotateEncryptionKey(oldKey, newKey, newVersion);
  say(`scanned ${String(result.scanned)}, rotated ${String(result.rotated)}, skipped ${String(result.skipped)}`);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`[credentials:rotate] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => disconnectDb());
