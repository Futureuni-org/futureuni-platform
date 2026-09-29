import { afterEach, describe, expect, it } from "vitest";

import { rm } from "node:fs/promises";
import { join } from "node:path";

import { db } from "@/platform/db";

import { deleteFile, getSignedUrl, putFile, readFile } from "./service";

const KEY_PREFIX = `test/${Date.now().toString(36)}`;

async function cleanup(): Promise<void> {
  await db.fileObject.deleteMany({ where: { key: { startsWith: KEY_PREFIX } } });
  await rm(join(process.cwd(), ".storage", "test"), { recursive: true, force: true });
}

afterEach(cleanup);

describe("storage service", () => {
  it("stores a valid PNG and creates a FileObject row", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const key = `${KEY_PREFIX}/sample.png`;
    const result = await putFile({
      key,
      body: png,
      contentType: "image/png",
      purpose: "AUDIT_SCREENSHOT",
    });
    expect(result.key).toBe(key);
    const row = await db.fileObject.findUnique({ where: { key } });
    expect(row?.contentType).toBe("image/png");
    const bytes = await readFile(key);
    expect(bytes.equals(png)).toBe(true);
  });

  it("rejects a file whose content doesn't match the declared type", async () => {
    const html = Buffer.from("<html><script>alert(1)</script></html>", "utf8");
    const key = `${KEY_PREFIX}/malicious.png`;
    await expect(
      putFile({
        key,
        body: html,
        contentType: "image/png",
        purpose: "PORTFOLIO",
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE" });
  });

  it("signed URLs contain a signature and expiry", async () => {
    const key = `${KEY_PREFIX}/for-signing.txt`;
    await putFile({ key, body: "hello", contentType: "text/plain", purpose: "CSV_IMPORT" });
    const url = await getSignedUrl(key, 60);
    expect(url).toMatch(/exp=\d+/);
    expect(url).toMatch(/sig=/);
    await deleteFile(key);
  });
});
