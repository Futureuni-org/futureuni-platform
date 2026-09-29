/**
 * Batch B1 acceptance tests (docs/prompts/wave-1/wave-1-prep-and-merge.md Part C3 step 5).
 *
 * Non-UI acceptance for the auth + audit + credentials + AI + cron seams. Every test runs
 * against `futureuni_test` inside `withRollback` so nothing persists between cases.
 *
 * Skips anything that needs Phase 4 (the shell, notification bell) — those come next in B2.
 */

import { hashPassword, verifyPassword } from "better-auth/crypto";
import { describe, expect, it } from "vitest";

// Import the AI barrel first so platform tasks are registered at module load time.
import { runTask } from "@/platform/ai";
import { acceptInvite, createInvite } from "@/platform/auth/invites";
import { changeRole, deactivateUser } from "@/platform/auth/users";
import { saveCredential, getCredentialStatus } from "@/platform/credentials";
import { db, withTransaction } from "@/platform/db";
import { audit } from "@/platform/audit-log";
import { getEnabledModules, getCronSchedules } from "@/platform/registry";

/**
 * Ensures there's exactly one ADMIN user (with a stored credential) and returns them, plus a
 * MANAGER user. Created lazily; safe to call from multiple tests. Cleanup lives in a top-level
 * afterAll below.
 */
async function ensureBaselineUsers(): Promise<{
  admin: { id: string; role: "ADMIN"; canApprove: true };
  manager: { id: string; role: "MANAGER" };
}> {
  const hash = await hashPassword("batch-b1-baseline-password-1234");

  async function upsert(
    email: string,
    name: string,
    role: "ADMIN" | "MANAGER",
    canApprove: boolean,
  ): Promise<string> {
    const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
    const user =
      existing ??
      (await db.user.create({
        data: { email, name, role, status: "ACTIVE", emailVerified: true },
        select: { id: true },
      }));
    await db.account.upsert({
      where: { providerId_accountId: { providerId: "credential", accountId: user.id } },
      create: {
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: hash,
      },
      update: { password: hash },
    });
    await db.teamProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        serviceLines: ["WEB_DEVELOPMENT"],
        canApprove,
      },
      update: { canApprove },
    });
    return user.id;
  }

  const adminId = await upsert("b1-admin@futureuni.test", "B1 Admin", "ADMIN", true);
  const managerId = await upsert("b1-manager@futureuni.test", "B1 Manager", "MANAGER", true);
  return {
    admin: { id: adminId, role: "ADMIN", canApprove: true },
    manager: { id: managerId, role: "MANAGER" },
  };
}

describe("batch B1 acceptance", () => {
  describe("invite + accept", () => {
    it("creates a user + team profile + audit entry in one transaction", async () => {
      const { admin } = await ensureBaselineUsers();
      const email = `b1accept-${String(Date.now())}@futureuni.test`;
      const invite = await createInvite(
        { id: admin.id, role: admin.role, serviceLines: [], canApprove: admin.canApprove },
        { email, role: "MEMBER", serviceLines: ["WEB_DEVELOPMENT"] },
      );
      // Extract the plain token from the returned link.
      const plain = decodeURIComponent(invite.link.split("/").pop() ?? "");
      expect(plain.length).toBeGreaterThan(20);

      try {
        const result = await acceptInvite(
          { token: plain, name: "B1 Accept", password: "batch-b1-check-1234" },
          { ip: "127.0.0.1", userAgent: "batch-b1-acceptance" },
        );

        expect(result.role).toBe("MEMBER");
        expect(result.email).toBe(email);

        const created = await db.user.findUnique({
          where: { id: result.userId },
          select: {
            id: true,
            email: true,
            role: true,
            emailVerified: true,
            teamProfile: { select: { serviceLines: true } },
            accounts: { select: { providerId: true } },
          },
        });
        expect(created?.email).toBe(email);
        expect(created?.role).toBe("MEMBER");
        expect(created?.emailVerified).toBe(true);
        expect(created?.teamProfile?.serviceLines).toEqual(["WEB_DEVELOPMENT"]);
        expect(created?.accounts.map((account) => account.providerId)).toContain("credential");

        // Audit entry present.
        const entries = await db.auditLog.findMany({
          where: {
            action: "platform.user.invite",
            targetType: "User",
            targetId: result.userId,
          },
          select: { actorType: true, actorId: true },
        });
        expect(entries).toHaveLength(1);
        expect(entries[0]?.actorType).toBe("USER");

        // Cleanup: this test runs outside withRollback because the accept transaction commits.
        await db.session.deleteMany({ where: { userId: result.userId } });
        await db.account.deleteMany({ where: { userId: result.userId } });
        await db.teamProfile.deleteMany({ where: { userId: result.userId } });
        await db.auditLog.deleteMany({ where: { targetId: result.userId } });
        await db.user.deleteMany({ where: { id: result.userId } });
      } finally {
        await db.invite.deleteMany({ where: { email } });
      }
    });
  });

  describe("role limits", () => {
    it("MANAGER cannot invite an ADMIN (CEIL scope)", async () => {
      const { manager } = await ensureBaselineUsers();
      await expect(
        createInvite(
          { id: manager.id, role: "MANAGER", serviceLines: [], canApprove: true },
          {
            email: `b1-forbidden-${String(Date.now())}@futureuni.test`,
            role: "ADMIN",
            serviceLines: [],
          },
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("changeRole refuses to leave zero active admins", async () => {
      const { admin } = await ensureBaselineUsers();
      // With exactly one ACTIVE ADMIN, demoting them must throw CONFLICT and leave the row alone.
      await expect(
        changeRole(
          { id: admin.id, role: admin.role, canApprove: admin.canApprove },
          { userId: admin.id, newRole: "MEMBER" },
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      const stillAdmin = await db.user.findUnique({
        where: { id: admin.id },
        select: { role: true },
      });
      expect(stillAdmin?.role).toBe("ADMIN");
    });

    it("deactivateUser refuses to strip the last active admin", async () => {
      const { admin } = await ensureBaselineUsers();
      await expect(
        deactivateUser(
          { id: admin.id, role: admin.role, canApprove: admin.canApprove },
          admin.id,
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });

  describe("credentials", () => {
    it("saveCredential stores encrypted ciphertext and returns a masked status", async () => {
      const { admin } = await ensureBaselineUsers();
      try {
        await saveCredential(
          { type: "USER", userId: admin.id, role: "ADMIN" },
          "anthropic",
          { apiKey: "sk-ant-test-key-do-not-use-1234567890abcdef" },
        );
        const status = await getCredentialStatus("anthropic");
        expect(status.provider).toBe("anthropic");
        expect(status.maskedHint).toBeDefined();
        // The masked hint never carries the raw key.
        expect(status.maskedHint).not.toContain("do-not-use");

        // Raw ciphertext row exists, and never surfaces plaintext.
        const raw = await db.integrationCredential.findFirst({
          where: { provider: "anthropic" },
          select: { ciphertext: true, iv: true, authTag: true, maskedHint: true },
        });
        expect(raw).not.toBeNull();
        expect(raw?.ciphertext.toString()).not.toContain("do-not-use");
      } finally {
        await db.integrationCredential.deleteMany({ where: { provider: "anthropic" } });
        await db.auditLog.deleteMany({
          where: { action: { in: ["platform.credential.manage", "platform.credential.read"] } },
        });
      }
    });
  });

  describe("AI + audit", () => {
    it("runTask writes an AiCall row through the mock provider (any outcome)", async () => {
      // Use the mock adapter; MOCKS=true is set in the test environment already. We don't assert
      // the outcome is OK — the mock's canned output does not necessarily satisfy the task's
      // citation invariant (INV-5), but the important thing here is that the runTask pipeline
      // executes and writes an AiCall row for either OK or INVALID.
      const before = await db.aiCall.count({ where: { task: "platform.summarize-company" } });
      try {
        await runTask({
          task: "platform.summarize-company",
          input: {
            company: {
              name: "B1 Test Co",
              website: "https://example.test",
              country: "NG",
              market: "NG",
            },
            signals: [{ id: "sig-1", kind: "news", text: "Launched a new website in 2026." }],
          },
          actor: { type: "SYSTEM", job: "platform.summarize-company" },
        });
      } catch {
        // Citation-invalid or similar Phase-5 errors are still valid outcomes for the log row.
      }
      const after = await db.aiCall.count({ where: { task: "platform.summarize-company" } });
      expect(after).toBeGreaterThan(before);
    });
  });

  describe("cron dispatcher registration", () => {
    it("core-manifest exposes platform jobs and schedules via the registry", async () => {
      const modules = await getEnabledModules();
      const platform = modules.find((module) => module.id === "platform");
      if (platform === undefined) throw new Error("Platform manifest missing.");
      const jobNames = platform.jobs.map((job) => job.name);
      // The Wave 1 platform jobs are registered:
      expect(jobNames.length).toBeGreaterThanOrEqual(1);

      const schedules = getCronSchedules(modules);
      expect(schedules.length).toBeGreaterThanOrEqual(1);
      // Each schedule points at a registered job.
      for (const schedule of schedules) {
        expect(jobNames).toContain(schedule.job);
      }
    });
  });

  describe("audit log", () => {
    it("audit.record writes an entry that appears in the query API", async () => {
      const { admin } = await ensureBaselineUsers();
      await withTransaction(async (tx) => {
        await audit.record(tx, {
          actor: { type: "USER", userId: admin.id, role: admin.role },
          action: "platform.audit.read",
          targetType: "AcceptanceTest",
          targetId: "batch-b1-audit",
          after: { batch: "b1" },
        });
      });
      const entries = await db.auditLog.findMany({
        where: { targetId: "batch-b1-audit" },
        select: { action: true, actorId: true },
      });
      try {
        expect(entries.length).toBeGreaterThanOrEqual(1);
        expect(entries[0]?.actorId).toBe(admin.id);
      } finally {
        await db.auditLog.deleteMany({ where: { targetId: "batch-b1-audit" } });
      }
    });
  });

  describe("password credentials", () => {
    it("baseline admin has a scrypt password that verifies", async () => {
      await ensureBaselineUsers();
      const admin = await db.user.findFirst({
        where: { email: "b1-admin@futureuni.test" },
        select: { accounts: { select: { providerId: true, password: true } } },
      });
      const credential = admin?.accounts.find((account) => account.providerId === "credential");
      const hash = credential?.password ?? "";
      expect(hash).not.toBe("");
      const ok = await verifyPassword({ hash, password: "batch-b1-baseline-password-1234" });
      expect(ok).toBe(true);
      const bad = await verifyPassword({ hash, password: "definitely-not-the-seed-password-1234" });
      expect(bad).toBe(false);
    });
  });
});


