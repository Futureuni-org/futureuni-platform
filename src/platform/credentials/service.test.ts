import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/platform/db";

import {
  deleteCredential,
  getCredential,
  getCredentialStatus,
  resolveProviderKey,
  resolveWebhookSecret,
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

  it("withholds a vaulted key while the provider is mocked, without weakening webhook checks", async () => {
    const admin = await makeAdmin();
    const actor = { type: "USER" as const, userId: admin.id, role: "ADMIN" as const };
    await saveCredential(actor, "anthropic", { apiKey: "vault-wins" });

    // Tests run with MOCKS=true and no LIVE_PROVIDERS, so an adapter must not receive a usable
    // key. Guarding only the env variable left this open: a key saved through
    // /admin/integrations came back from the vault and reached the real service.
    await expect(resolveProviderKey("anthropic")).resolves.toBeNull();

    // The admin "test this credential" flow reads the vault directly, so it still works.
    await expect(getCredential<{ apiKey: string }>("anthropic")).resolves.toMatchObject({
      apiKey: "vault-wins",
    });

    // Inbound webhook verification must never be downgraded by mock mode.
    await expect(resolveWebhookSecret("anthropic")).resolves.toBe("vault-wins");

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
      saveCredential({ type: "USER", userId: member.id, role: "MEMBER" }, "anthropic", {
        apiKey: "x",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.user.delete({ where: { id: member.id } });
  });
});
