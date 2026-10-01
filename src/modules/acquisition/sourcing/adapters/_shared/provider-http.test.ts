import { afterEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";

import { server } from "@/tests/setup/msw-server";

import { fetchJson } from "./provider-http";

const noSleep = (): Promise<void> => Promise.resolve();
const URL = "https://provider.test/search";

afterEach(() => {
  server.resetHandlers();
});

describe("fetchJson", () => {
  it("retries a 5xx and then succeeds", async () => {
    let calls = 0;
    server.use(
      http.get(URL, () => {
        calls += 1;
        return calls < 2 ? new HttpResponse(null, { status: 503 }) : HttpResponse.json({ ok: 1 });
      }),
    );
    const res = await fetchJson<{ ok: number }>(URL, { sleep: noSleep });
    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ ok: 1 });
    expect(calls).toBe(2);
  });

  it("retries a 429 honouring Retry-After, then succeeds", async () => {
    let calls = 0;
    server.use(
      http.get(URL, () => {
        calls += 1;
        return calls < 2
          ? new HttpResponse(null, { status: 429, headers: { "retry-after": "0" } })
          : HttpResponse.json({ ok: 1 });
      }),
    );
    const res = await fetchJson<{ ok: number }>(URL, { sleep: noSleep });
    expect(res.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it("does not retry a 4xx validation error", async () => {
    let calls = 0;
    server.use(
      http.get(URL, () => {
        calls += 1;
        return new HttpResponse(null, { status: 400 });
      }),
    );
    const res = await fetchJson(URL, { sleep: noSleep });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(res.exhausted).toBe(false);
    expect(calls).toBe(1);
  });

  it("gives up after exhausting retries on persistent 5xx", async () => {
    let calls = 0;
    server.use(
      http.get(URL, () => {
        calls += 1;
        return new HttpResponse(null, { status: 500 });
      }),
    );
    const res = await fetchJson(URL, { sleep: noSleep, retry: { maxAttempts: 3 } });
    expect(res.ok).toBe(false);
    expect(res.exhausted).toBe(true);
    expect(calls).toBe(3);
  });
});
