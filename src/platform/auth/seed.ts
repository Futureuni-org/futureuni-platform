/**
 * Phase 3 seed (docs/prompts/wave-1/phase-03-auth.md Step 7): attaches passwords to the users
 * seeded by Phase 2's `10-users` seeder, marks the seeded admin `mustSetUp2fa = true` (unless
 * `SEED_SKIP_2FA=true`), and inserts 2 pending invites plus 1 expired invite.
 *
 * Order 12 runs after users (order 10) and before platform-scope data (order 15). Idempotent:
 * re-running upserts credentials by (providerId, accountId).
 */

import "server-only";

import { hashPassword } from "better-auth/crypto";

import { defineSeeder } from "@/platform/db";

import { hashToken, newToken } from "./tokens";

const DEFAULT_PASSWORD = "changeme-local-only-12";

export default defineSeeder({
  name: "auth",
  order: 12,
  async run(tx, ctx) {
    const password = process.env.SEED_USER_PASSWORD ?? DEFAULT_PASSWORD;
    if (password.length < 12) {
      throw new Error(
        "SEED_USER_PASSWORD must be at least 12 characters (min. platform password length).",
      );
    }
    const hash = await hashPassword(password);
    const skip2fa = process.env.SEED_SKIP_2FA === "true";

    const users = await tx.user.findMany({
      select: { id: true, email: true, role: true },
      orderBy: { createdAt: "asc" },
    });
    let attached = 0;
    for (const user of users) {
      await tx.account.upsert({
        where: {
          providerId_accountId: { providerId: "credential", accountId: user.id },
        },
        create: {
          userId: user.id,
          providerId: "credential",
          accountId: user.id,
          password: hash,
        },
        update: { password: hash },
      });
      // ADMIN must set up 2FA before signing in, unless SEED_SKIP_2FA is on for the developer's own
      // convenience. Never true in staging or production seeds.
      const mustSetUp2fa = user.role === "ADMIN" && !skip2fa;
      await tx.user.update({
        where: { id: user.id },
        data: { mustSetUp2fa },
      });
      attached += 1;
    }
    ctx.log(`attached credential accounts to ${String(attached)} seed users`);

    const inviter = users.find((user) => user.role === "ADMIN") ?? users[0];
    if (inviter === undefined) return;

    const seedInvites: {
      email: string;
      role: "MEMBER" | "SERVICE_LEAD";
      serviceLines: readonly ("WEB_DEVELOPMENT" | "UI_UX_DESIGN" | "GRAPHIC_DESIGN" | "VIDEO_EDITING")[];
      expiresAt: Date;
    }[] = [
      {
        email: "yemi.pending@futureuni.local",
        role: "MEMBER",
        serviceLines: ["WEB_DEVELOPMENT"],
        expiresAt: new Date(ctx.now.getTime() + 7 * 24 * 60 * 60 * 1000),
      },
      {
        email: "chika.pending@futureuni.local",
        role: "SERVICE_LEAD",
        serviceLines: ["GRAPHIC_DESIGN"],
        expiresAt: new Date(ctx.now.getTime() + 3 * 24 * 60 * 60 * 1000),
      },
      {
        email: "expired.pending@futureuni.local",
        role: "MEMBER",
        serviceLines: ["UI_UX_DESIGN"],
        expiresAt: new Date(ctx.now.getTime() - 24 * 60 * 60 * 1000),
      },
    ];
    for (const seed of seedInvites) {
      const existing = await tx.invite.findFirst({
        where: { email: seed.email },
        select: { id: true },
      });
      const token = newToken();
      const data = {
        email: seed.email,
        role: seed.role,
        serviceLines: [...seed.serviceLines],
        tokenHash: token.hash,
        expiresAt: seed.expiresAt,
        invitedById: inviter.id,
        lastSentAt: ctx.now,
      };
      if (existing === null) {
        await tx.invite.create({ data });
      } else {
        await tx.invite.update({ where: { id: existing.id }, data });
      }
    }
    // Also store an idempotent debug hash so tests can look up the seed invite token pattern.
    // We use a fixed token for the always-fresh dev invite so Playwright can reuse it.
    const knownToken = "development-invite-token-with-enough-length-to-pass-min-check";
    const knownHash = hashToken(knownToken);
    const dev = await tx.invite.findFirst({
      where: { email: "dev.invite@futureuni.local" },
      select: { id: true },
    });
    const devData = {
      email: "dev.invite@futureuni.local",
      role: "MEMBER" as const,
      serviceLines: ["VIDEO_EDITING"] as const,
      tokenHash: knownHash,
      expiresAt: new Date(ctx.now.getTime() + 7 * 24 * 60 * 60 * 1000),
      invitedById: inviter.id,
      lastSentAt: ctx.now,
    };
    if (dev === null) {
      await tx.invite.create({ data: { ...devData, serviceLines: [...devData.serviceLines] } });
    } else {
      await tx.invite.update({
        where: { id: dev.id },
        data: { ...devData, serviceLines: [...devData.serviceLines] },
      });
    }
    ctx.log("seeded 2 pending, 1 expired, 1 known-dev invite");
  },
});
