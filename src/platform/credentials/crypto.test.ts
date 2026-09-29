import { describe, expect, it } from "vitest";

import { decrypt, decryptWith, encrypt, encryptWith } from "./crypto";

const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");

describe("credentials crypto (AES-256-GCM)", () => {
  it("round-trips a plaintext with the configured key", () => {
    const record = encrypt("sk-live-example-1234");
    expect(record.ciphertext).not.toContain("sk-live");
    expect(record.iv).toHaveLength(16); // 12 bytes base64
    expect(record.authTag).toHaveLength(24); // 16 bytes base64
    expect(record.keyVersion).toBeGreaterThan(0);
    expect(decrypt(record)).toBe("sk-live-example-1234");
  });

  it("uses a different IV every time", () => {
    const a = encrypt("same-value");
    const b = encrypt("same-value");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("rejects tampered ciphertext", () => {
    const record = encryptWith("secret", KEY_A, 1);
    const bytes = Buffer.from(record.ciphertext, "base64");
    bytes[0] = (bytes[0] ?? 0) ^ 0x01;
    const tampered = { ...record, ciphertext: bytes.toString("base64") };
    expect(() => decryptWith(tampered, KEY_A)).toThrow(/corrupt or tampered/i);
  });

  it("rejects a wrong key", () => {
    const record = encryptWith("secret", KEY_A, 1);
    expect(() => decryptWith(record, KEY_B)).toThrow(/corrupt or tampered/i);
  });

  it("rejects a wrong auth tag", () => {
    const record = encryptWith("secret", KEY_A, 1);
    const tag = Buffer.from(record.authTag, "base64");
    tag[0] = (tag[0] ?? 0) ^ 0xff;
    const tampered = { ...record, authTag: tag.toString("base64") };
    expect(() => decryptWith(tampered, KEY_A)).toThrow(/corrupt or tampered/i);
  });

  it("supports rotation: decrypts with the old key and re-encrypts with the new one", () => {
    const oldRecord = encryptWith("api-key-42", KEY_A, 1);
    const plaintext = decryptWith(oldRecord, KEY_A);
    const newRecord = encryptWith(plaintext, KEY_B, 2);
    expect(newRecord.keyVersion).toBe(2);
    expect(decryptWith(newRecord, KEY_B)).toBe("api-key-42");
    expect(() => decryptWith(newRecord, KEY_A)).toThrow();
  });
});
