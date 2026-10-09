import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Vercel Blob adapter. The one behaviour production actually depended on and the test suite
 * never checked: `put` must allow overwriting an existing key. Avatars use one fixed key per user,
 * so the first upload created the blob and every upload after it hit "This blob already exists" —
 * invisible here because the service tests run on the local driver, which overwrites silently.
 */

const blob = vi.hoisted(() => ({ put: vi.fn() }));
vi.mock("@vercel/blob", () => ({
  put: blob.put,
  get: vi.fn(),
  del: vi.fn(),
  issueSignedToken: vi.fn(),
  presignUrl: vi.fn(),
}));

const { blobAdapter } = await import("./blob");

beforeEach(() => {
  blob.put.mockReset().mockResolvedValue({ url: "https://store.example/avatars/u1" });
});

describe("blobAdapter.put", () => {
  it("allows overwriting, so a second upload to the same key replaces the first", async () => {
    await blobAdapter.put({
      key: "avatars/u1",
      body: Buffer.from([1, 2, 3]),
      contentType: "image/webp",
      access: "PRIVATE",
    });

    expect(blob.put).toHaveBeenCalledWith(
      "avatars/u1",
      expect.anything(),
      expect.objectContaining({ allowOverwrite: true, addRandomSuffix: false }),
    );
  });

  it("stores a PRIVATE object as private and a PUBLIC one as public", async () => {
    await blobAdapter.put({
      key: "k",
      body: Buffer.from([1]),
      contentType: "image/png",
      access: "PRIVATE",
    });
    expect(blob.put).toHaveBeenLastCalledWith(
      "k",
      expect.anything(),
      expect.objectContaining({ access: "private" }),
    );

    await blobAdapter.put({
      key: "k",
      body: Buffer.from([1]),
      contentType: "image/png",
      access: "PUBLIC",
    });
    expect(blob.put).toHaveBeenLastCalledWith(
      "k",
      expect.anything(),
      expect.objectContaining({ access: "public" }),
    );
  });

  it("reports the byte length it wrote", async () => {
    const result = await blobAdapter.put({
      key: "k",
      body: Buffer.from([1, 2, 3, 4, 5]),
      contentType: "image/png",
      access: "PRIVATE",
    });
    expect(result.size).toBe(5);
  });
});
