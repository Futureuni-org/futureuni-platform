import { describe, expect, it } from "vitest";

import { isLoopbackServer, seedTargetProblem } from "./guard";

const local = "postgresql://postgres:postgres@localhost:5432/futureuni_dev";
const remote = "postgresql://user:secret@ep-example-123.eu-west-2.aws.neon.tech/neondb";

describe("seedTargetProblem (data-model §10.1)", () => {
  it("allows a local database", () => {
    expect(seedTargetProblem({ DATABASE_URL: local })).toBeNull();
    expect(seedTargetProblem({ DATABASE_URL: local.replace("localhost", "127.0.0.1") })).toBeNull();
  });

  it("never runs in production, whatever else is set", () => {
    expect(seedTargetProblem({ DATABASE_URL: local, NODE_ENV: "production" })).toMatch(
      /production/,
    );
    expect(
      seedTargetProblem({ DATABASE_URL: remote, VERCEL_ENV: "production", SEED_ALLOW_REMOTE: "1" }),
    ).toMatch(/production/);
  });

  it("refuses a remote database unless it's a preview branch explicitly allowed", () => {
    expect(seedTargetProblem({ DATABASE_URL: remote })).toMatch(/non-local/);
    expect(seedTargetProblem({ DATABASE_URL: remote, SEED_ALLOW_REMOTE: "1" })).toMatch(
      /non-local/,
    );
    expect(
      seedTargetProblem({ DATABASE_URL: remote, SEED_ALLOW_REMOTE: "1", VERCEL_ENV: "preview" }),
    ).toBeNull();
  });

  it("refuses a local-looking URL that redirects the connection with a parameter", () => {
    expect(seedTargetProblem({ DATABASE_URL: `${local}?host=db.example.com` })).toMatch(/"host"/);
    expect(seedTargetProblem({ DATABASE_URL: `${local}?hostaddr=10.0.0.5` })).toMatch(/"hostaddr"/);
  });

  it("refuses a missing or malformed URL", () => {
    expect(seedTargetProblem({})).toMatch(/isn't set/);
    expect(seedTargetProblem({ DATABASE_URL: "not a url" })).toMatch(/valid/);
  });
});

describe("isLoopbackServer", () => {
  it("accepts only this machine", () => {
    expect(isLoopbackServer("127.0.0.1")).toBe(true);
    expect(isLoopbackServer("::1")).toBe(true);
    expect(isLoopbackServer(null)).toBe(true);
    expect(isLoopbackServer("10.1.2.3")).toBe(false);
  });
});
