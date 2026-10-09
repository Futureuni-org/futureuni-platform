import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { postAvatar, UPLOAD_TIMEOUT_MS } from "./avatar-upload";

/**
 * The upload's one job the UI depends on: the promise it returns must always settle. The real bug
 * was a server that accepted the POST and never answered — XHR has no timeout by default, so the
 * promise hung and the page sat on "Saving 90%" forever with no way out. These prove each ending
 * resolves or rejects, especially the stalled one, so that state can never recur.
 */

interface FakeXhr {
  open: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
  timeout: number;
  responseType: string;
  status: number;
  response: unknown;
  upload: { addEventListener: (type: string, fn: (e: unknown) => void) => void };
  addEventListener: (type: string, fn: () => void) => void;
  fire: (type: string) => void;
  fireProgress: (loaded: number, total: number) => void;
}

let xhr: FakeXhr;

beforeEach(() => {
  vi.useFakeTimers();
  const listeners = new Map<string, () => void>();
  const uploadListeners = new Map<string, (e: unknown) => void>();
  xhr = {
    open: vi.fn(),
    send: vi.fn(),
    abort: vi.fn(() => {
      xhr.fire("abort");
    }),
    timeout: 0,
    responseType: "",
    status: 0,
    response: null,
    upload: {
      addEventListener: (type, fn) => uploadListeners.set(type, fn),
    },
    addEventListener: (type, fn) => listeners.set(type, fn),
    fire: (type) => listeners.get(type)?.(),
    fireProgress: (loaded, total) =>
      uploadListeners.get("progress")?.({ lengthComputable: true, loaded, total }),
  };
  // `new XMLHttpRequest()` needs a constructor, so stub one that hands back the fake.
  function FakeXMLHttpRequest(this: unknown): FakeXhr {
    return xhr;
  }
  vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("postAvatar", () => {
  it("resolves with the URL the server returns", async () => {
    const handle = postAvatar(new FormData(), () => undefined);
    xhr.status = 200;
    xhr.response = { url: "/api/avatars/u1?v=9" };
    xhr.fire("load");

    await expect(handle.done).resolves.toBe("/api/avatars/u1?v=9");
  });

  it("sets a timeout and rejects when the server never answers", async () => {
    // The exact failure from production: the request is accepted, the bytes finish, and then
    // nothing comes back.
    const handle = postAvatar(new FormData(), () => undefined);
    const settled = vi.fn();
    void handle.done.then(settled, settled);

    expect(xhr.timeout).toBe(UPLOAD_TIMEOUT_MS);

    xhr.fireProgress(100, 100);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled(); // still waiting on the server — this is the hang

    xhr.fire("timeout");
    await expect(handle.done).rejects.toThrow(/too long/i);
  });

  it("surfaces the server's own message on an error status", async () => {
    const handle = postAvatar(new FormData(), () => undefined);
    xhr.status = 415;
    xhr.response = { error: { message: "Choose an image file." } };
    xhr.fire("load");

    await expect(handle.done).rejects.toThrow("Choose an image file.");
  });

  it("rejects as cancelled when aborted", async () => {
    const handle = postAvatar(new FormData(), () => undefined);
    handle.cancel();

    expect(xhr.abort).toHaveBeenCalledOnce();
    await expect(handle.done).rejects.toThrow(/cancel/i);
  });

  it("reports upload progress as a fraction", () => {
    const seen: number[] = [];
    postAvatar(new FormData(), (f) => seen.push(f));
    xhr.fireProgress(40, 160);

    expect(seen).toEqual([0.25]);
  });
});
