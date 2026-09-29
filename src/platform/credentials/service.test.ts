import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/platform/db";

import {
  deleteCredential,
  getCredential,
  getCredentialStatus,
  resolveProviderKey,
  saveCredential,
} from "./service";

async function makeAdmin(): Promise<{ id: string }> {
  const email = `p6-test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const user = await db.user.create({
    data: {
      email,
      name: "Test Admin",
      role: "ADMIN",
      status: "ACTIVE",
      emailVerified: true,
    } as never,
    select: { id: true },
  });
  return user;
}

afterEach(async () => {
  await db.integrationCredential.deleteMany({ where: { provider: "anthropic" } });
  await db.user.deleteMany({ where: { email: { startsWith: "p6-test-" } } });
});

describe("credentials service", () => {
  it("stores only ciphertext but returns plaintext on getCredential", async () => {
    const admin = await makeAdmin();
    const actor = { type: "USER" as const, userId: admin.id, role: "ADMIN" as const };
    await saveCredential(actor, "anthropic", { apiKey: "sk-abcd1234wxyz" });

    const raw = await db.integrationCredential.findUnique({
      where: { provider: "anthropic" },
      select: { ciphertext: true, maskedHint: true },
    });
    expect(raw?.ciphertext).not.toContain("sk-abcd");
    expect(raw?.maskedHint).toBe("sk-a…wxyz");

    const payload = await getCredential<{ apiKey: string }>("anthropic");
    expect(payload?.apiKey).toBe("sk-abcd1234wxyz");

    const status = await getCredentialStatus("anthropic");
    expect(status.status).toBe("NOT_TESTED");
    expect(status.maskedHint).toBe("sk-a…wxyz");
  });

  it("resolveProviderKey returns the stored key over the env variable", async () => {
    const admin = await makeAdmin();
    const actor = { type: "USER" as const, userId: admin.id, role: "ADMIN" as const };
    await saveCredential(actor, "anthropic", { apiKey: "vault-wins" });
    const key = await resolveProviderKey("anthropic");
    expect(key).toBe("vault-wins");
    await deleteCredential(actor, "anthropic");
  });

  it("refuses a non-admin user via SEAM-PERMISSION", async () => {
    // Use a MEMBER; the seam denies save/delete.
    const email = `p6-test-mem-${Date.now().toString(36)}@example.com`;
    const member = await db.user.create({
      data: { email, name: "Mem", role: "MEMBER", status: "ACTIVE", emailVerified: true } as never,
      select: { id: true },
    });
    await expect(
      saveCredential({ type: "USER", userId: member.id, role: "MEMBER" }, "anthropic", { apiKey: "x" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.user.delete({ where: { id: member.id } });
  });
});
