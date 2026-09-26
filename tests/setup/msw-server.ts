import { setupServer } from "msw/node";

/**
 * The shared MSW server. It starts with no handlers, so every request fails unless a test
 * adds a handler for it:
 *
 *   import { http, HttpResponse } from "msw";
 *   import { server } from "@/../tests/setup/msw-server";
 *   server.use(http.get("https://api.example.com/x", () => HttpResponse.json({ ok: true })));
 */
export const server = setupServer();
