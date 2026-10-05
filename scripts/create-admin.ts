/**
 * `pnpm create-admin` (Phase 21 follow-up). Creates — or resets — the first ADMIN directly: the one
 * path invite-only sign-up cannot bootstrap, because `createInvite` needs an existing inviter. It
 * mirrors `acceptInvite` exactly — User + credential Account (Better Auth's scrypt hasher) +
 * TeamProfile, in one transaction — so the account signs in through the normal flow. Idempotent on
 * email: re-running resets the password and re-activates the user. Run it once against the
 * production database after the first deploy, then sign in and set up 2FA.
 *
 *   ADMIN_EMAIL=you@futureuni.example ADMIN_PASSWORD='<12+ chars>' pnpm create-admin
 *   # optional: ADMIN_NAME="Your Name"  ADMIN_SKIP_2FA=1 (skip the forced 2FA setup, e.g. for a demo)
 *
 * The password is read from the environment, never a CLI argument, so it stays out of shell history.
 */

import { config as loadEnv } from "dotenv";

import { hashPassword } from "better-auth/crypto";

import type { Tx } from "@/platform/db";

loadEnv({ path: ".env.local" });
loadEnv();

function fail(message: string): never {
  console.error(`error ${message}`);
  process.exit(1);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") fail(`${name} is required.`);
  return value.trim();
}

async function main(): Promise<void> {
  const email = requireEnv("ADMIN_EMAIL").toLowerCase();
  const password = requireEnv("ADMIN_PASSWORD");
  const name = process.env.ADMIN_NAME?.trim() ?? email.split("@")[0] ?? "Admin";
  const skip2fa = process.env.ADMIN_SKIP_2FA === "1";

  const { checkPassword } = await import("@/platform/auth/password");
  const strength = checkPassword(password);
  if (!strength.ok) {
    fail(
      strength.reason === "TOO_SHORT"
        ? "ADMIN_PASSWORD must be at least 12 characters."
        : strength.reason === "COMMON"
          ? "ADMIN_PASSWORD is too common — pick something less predictable."
          : "ADMIN_PASSWORD is too weak — mix upper/lower case, digits and symbols.",
    );
  }

  const passwordHash = await hashPassword(password);
  const { withTransaction } = await import("@/platform/db");

  const admin = await withTransaction(async (tx: Tx) => {
    const existing = await tx.user.findUnique({ where: { email }, select: { id: true } });
    const user =
      existing === null
        ? await tx.user.create({
            data: {
              email,
              name,
              emailVerified: true,
              role: "ADMIN",
              status: "ACTIVE",
              mustSetUp2fa: !skip2fa,
            },
            select: { id: true, email: true },
          })
        : await tx.user.update({
            where: { id: existing.id },
            data: {
              name,
              role: "ADMIN",
              status: "ACTIVE",
              emailVerified: true,
              mustSetUp2fa: !skip2fa,
              deactivatedAt: null,
              banned: false,
            },
            select: { id: true, email: true },
          });

    await tx.account.upsert({
      where: { providerId_accountId: { providerId: "credential", accountId: user.id } },
      create: {
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: passwordHash,
      },
      update: { password: passwordHash },
    });

    await tx.teamProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, serviceLines: [], canApprove: true },
      update: { canApprove: true },
    });

    return user;
  });

  process.stdout.write(`ok admin ready: ${admin.email}\n`);
  process.stdout.write(
    skip2fa
      ? "Sign in with the email + password; 2FA setup was skipped (set it up in settings before launch).\n"
      : "Sign in with the email + password; first sign-in walks you through 2FA setup (have an authenticator app ready).\n",
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
