import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The avatar endpoints. What matters here is the contract the browser depends on: a signed-out
 * request is answered with 401 rather than a redirect (an <img> following a redirect to the
 * sign-in page renders as a broken image), the object is stored PRIVATE because the Blob store is
 * private, and `User.image` ends up holding a same-origin URL the CSP allows.
 */

const session = vi.hoisted(() => ({ user: null as { id: string; role: string } | null }));
const storage = vi.hoisted(() => ({ putFile: vi.fn(), readFile: vi.fn() }));
const repo = vi.hoisted(() => ({ updateOwnProfile: vi.fn() }));
const database = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/platform/auth", () => ({
  getCurrentUser: () => Promise.resolve(session.user),
  actorOf: (user: { id: string }) => ({ type: "USER", userId: user.id, role: "ADMIN" }),
}));
vi.mock("@/platform/storage", () => ({
  putFile: storage.putFile,
  readFile: storage.readFile,
}));
vi.mock("@/app/(platform)/settings/profile.repo", () => ({
  updateOwnProfile: repo.updateOwnProfile,
}));
vi.mock("@/platform/db", () => ({ db: { fileObject: { findFirst: database.findFirst } } }));

const { POST } = await import("./route");
const { GET } = await import("./[userId]/route");
const { GET: GET_SOURCE } = await import("./[userId]/source/route");

function imageForm(type = "image/webp"): FormData {
  const form = new FormData();
  form.append("file", new File([new Uint8Array([1, 2, 3, 4])], "avatar.webp", { type }));
  return form;
}

function request(form: FormData): Request {
  return new Request("http://localhost/api/avatars", { method: "POST", body: form });
}

beforeEach(() => {
  session.user = { id: "usr_1", role: "ADMIN" };
  storage.putFile.mockReset().mockResolvedValue({ id: "f1", key: "avatars/usr_1", url: "blob://x" });
  storage.readFile.mockReset().mockResolvedValue(Buffer.from([1, 2, 3]));
  repo.updateOwnProfile.mockReset().mockResolvedValue(undefined);
  database.findFirst.mockReset().mockResolvedValue({ contentType: "image/webp" });
});

describe("POST /api/avatars", () => {
  it("stores the avatar privately and saves a same-origin URL", async () => {
    const response = await POST(request(imageForm()));

    expect(response.status).toBe(200);
    expect(storage.putFile).toHaveBeenCalledWith(
      expect.objectContaining({ key: "avatars/usr_1", access: "PRIVATE", purpose: "AVATAR" }),
    );
    const saved = repo.updateOwnProfile.mock.calls[0]?.[2] as { image: string };
    expect(saved.image).toMatch(/^\/api\/avatars\/usr_1\?v=\d+$/);
    expect(((await response.json()) as { url: string }).url).toBe(saved.image);
  });

  it("stores the untouched original under its own key when one is sent", async () => {
    const form = imageForm();
    form.append("source", new File([new Uint8Array([9, 9, 9, 9])], "orig.png", { type: "image/png" }));

    await POST(request(form));

    const keys = storage.putFile.mock.calls.map((c) => (c[0] as { key: string }).key);
    expect(keys).toContain("avatars/usr_1");
    expect(keys).toContain("avatars/usr_1/source");
  });

  it("stores no source when the upload is just a re-frame", async () => {
    await POST(request(imageForm()));

    const keys = storage.putFile.mock.calls.map((c) => (c[0] as { key: string }).key);
    expect(keys).toEqual(["avatars/usr_1"]);
  });

  it("answers 401 when signed out, instead of redirecting", async () => {
    session.user = null;

    const response = await POST(request(imageForm()));

    expect(response.status).toBe(401);
    expect(storage.putFile).not.toHaveBeenCalled();
  });

  it("refuses a file that isn't an image", async () => {
    const form = new FormData();
    form.append("file", new File(["hello"], "notes.txt", { type: "text/plain" }));

    const response = await POST(request(form));

    expect(response.status).toBe(415);
    expect(storage.putFile).not.toHaveBeenCalled();
  });
});

describe("GET /api/avatars/[userId]", () => {
  const ctx = { params: Promise.resolve({ userId: "usr_1" }) };

  it("returns the bytes with the stored content type", async () => {
    const response = await GET(new Request("http://localhost/api/avatars/usr_1"), ctx);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toContain("private");
    expect(storage.readFile).toHaveBeenCalledWith("avatars/usr_1");
  });

  it("answers 401 when signed out", async () => {
    session.user = null;

    expect((await GET(new Request("http://localhost/api/avatars/usr_1"), ctx)).status).toBe(401);
  });

  it("answers 404 when the user has no avatar", async () => {
    database.findFirst.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/avatars/usr_1"), ctx);

    expect(response.status).toBe(404);
    expect(storage.readFile).not.toHaveBeenCalled();
  });
});

describe("GET /api/avatars/[userId]/source", () => {
  it("returns the owner's own original", async () => {
    const response = await GET_SOURCE(new Request("http://localhost/api/avatars/usr_1/source"), {
      params: Promise.resolve({ userId: "usr_1" }),
    });

    expect(response.status).toBe(200);
    expect(storage.readFile).toHaveBeenCalledWith("avatars/usr_1/source");
  });

  it("will not serve someone else's original", async () => {
    const response = await GET_SOURCE(new Request("http://localhost/api/avatars/usr_2/source"), {
      params: Promise.resolve({ userId: "usr_2" }),
    });

    // 404, not 403: another person's original is not theirs to know exists.
    expect(response.status).toBe(404);
    expect(storage.readFile).not.toHaveBeenCalled();
  });

  it("answers 401 when signed out", async () => {
    session.user = null;

    const response = await GET_SOURCE(new Request("http://localhost/api/avatars/usr_1/source"), {
      params: Promise.resolve({ userId: "usr_1" }),
    });

    expect(response.status).toBe(401);
  });

  it("answers 404 when there is no stored original", async () => {
    database.findFirst.mockResolvedValue(null);

    const response = await GET_SOURCE(new Request("http://localhost/api/avatars/usr_1/source"), {
      params: Promise.resolve({ userId: "usr_1" }),
    });

    expect(response.status).toBe(404);
    expect(storage.readFile).not.toHaveBeenCalled();
  });
});
