import { afterAll, afterEach, beforeAll } from "vitest";

import { server } from "./msw-server";

// No real network calls in tests (project-rules §Bans). A request without a handler fails
// itself and, even if the code under test catches that error, fails the test afterwards.
const unhandled: string[] = [];

beforeAll(() => {
  server.listen({
    onUnhandledRequest(request, print) {
      unhandled.push(`${request.method} ${request.url}`);
      print.error();
    },
  });
});

afterEach(() => {
  server.resetHandlers();
  if (unhandled.length > 0) {
    const requests = unhandled.splice(0).join(", ");
    throw new Error(
      `Unhandled network request(s): ${requests}. Add an MSW handler (tests/setup/msw-server.ts).`,
    );
  }
});

afterAll(() => {
  server.close();
});
