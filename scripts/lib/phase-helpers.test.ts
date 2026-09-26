import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  branchName,
  mergeProcedure,
  parsePhaseArgs,
  parseWorktreeList,
  phaseDatabases,
  phaseEnvValues,
  phasePort,
  worktreePath,
} from "./phase-helpers.mjs";

describe("parsePhaseArgs", () => {
  it("reads each command", () => {
    expect(parsePhaseArgs(["start", "05", "ai-service"])).toEqual({
      command: "start",
      nn: "05",
      slug: "ai-service",
    });
    expect(parsePhaseArgs(["list"])).toEqual({ command: "list" });
    expect(parsePhaseArgs(["finish", "06"])).toEqual({
      command: "finish",
      nn: "06",
      yes: false,
      force: false,
    });
    expect(parsePhaseArgs(["remove", "99", "--yes"])).toEqual({
      command: "remove",
      nn: "99",
      yes: true,
      force: false,
    });
  });

  it("rejects bad phase numbers, slugs and options", () => {
    expect(() => parsePhaseArgs(["start", "5", "ai"])).toThrow(/two digits/);
    expect(() => parsePhaseArgs(["start", "05", "AI Service"])).toThrow(/slug/);
    expect(() => parsePhaseArgs(["remove", "05", "--everything"])).toThrow(/Unknown option/);
    expect(() => parsePhaseArgs(["merge", "05"])).toThrow(/Usage/);
  });
});

describe("names and ports", () => {
  it("derives the branch, sibling folder, port and databases (P1-AC4)", () => {
    expect(branchName("99", "test")).toBe("phase/99-test");
    expect(worktreePath(join("C:", "code", "futureuni-platform"), "99", "test")).toBe(
      join("C:", "code", "futureuni-platform-99-test"),
    );
    expect(phasePort("99")).toBe(3099);
    expect(phaseDatabases("05")).toEqual({ dev: "futureuni_p05", test: "futureuni_test_p05" });
  });
});

describe("phaseEnvValues", () => {
  it("points the copy at the phase databases and port", () => {
    const values = phaseEnvValues(
      {
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/futureuni_dev",
        DIRECT_URL: "postgresql://postgres:postgres@localhost:5432/futureuni_dev",
        DATABASE_URL_TEST: "postgresql://postgres:postgres@localhost:5432/futureuni_test",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
        BETTER_AUTH_URL: "http://localhost:3000",
      },
      "05",
    );
    expect(values).toEqual({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/futureuni_p05",
      DIRECT_URL: "postgresql://postgres:postgres@localhost:5432/futureuni_p05",
      DATABASE_URL_TEST: "postgresql://postgres:postgres@localhost:5432/futureuni_test_p05",
      PORT: "3005",
      NEXT_PUBLIC_APP_URL: "http://localhost:3005",
      BETTER_AUTH_URL: "http://localhost:3005",
    });
  });

  it("needs DATABASE_URL", () => {
    expect(() => phaseEnvValues({}, "05")).toThrow(/DATABASE_URL/);
  });
});

describe("mergeProcedure", () => {
  it("extracts the merge section of phases/README.md", () => {
    const readme =
      "# Phases\n\n## Worktrees\ntext\n\n## Merge procedure\n\n1. Merge.\n2. Apply.\n\n## Completed phases\n";
    expect(mergeProcedure(readme)).toBe("## Merge procedure\n\n1. Merge.\n2. Apply.");
  });
});

describe("parseWorktreeList", () => {
  it("reads paths and branches", () => {
    const porcelain = [
      "worktree C:/code/futureuni-platform",
      "HEAD 1111111",
      "branch refs/heads/main",
      "",
      "worktree C:/code/futureuni-platform-05-ai-service",
      "HEAD 2222222",
      "branch refs/heads/phase/05-ai-service",
      "",
    ].join("\n");
    expect(parseWorktreeList(porcelain)).toEqual([
      { path: "C:/code/futureuni-platform", branch: "main" },
      { path: "C:/code/futureuni-platform-05-ai-service", branch: "phase/05-ai-service" },
    ]);
  });
});
