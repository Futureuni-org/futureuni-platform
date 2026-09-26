import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  compareWithClaudeTable,
  decide,
  denialMessage,
  findDuplicateOwners,
  folderOf,
  loadOwnershipMap,
  matchesGlob,
  type OwnershipMap,
  ownerOf,
  parseClaudeOwnershipTable,
  phaseFromBranch,
} from "./lib.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const map = loadOwnershipMap(join(here, "ownership.json"));

describe("glob matching", () => {
  it("treats ** as any depth, * as one segment, and brackets and parentheses literally", () => {
    expect(matchesGlob("src/platform/ai/tasks/run.ts", "src/platform/ai/**")).toBe(true);
    expect(
      matchesGlob(
        "src/app/(platform)/acquisition/page.tsx",
        "src/app/(platform)/acquisition/*.tsx",
      ),
    ).toBe(true);
    expect(
      matchesGlob(
        "src/app/(platform)/acquisition/[line]/page.tsx",
        "src/app/(platform)/acquisition/*.tsx",
      ),
    ).toBe(false);
    expect(
      matchesGlob(
        "src/app/(platform)/acquisition/[line]/page.tsx",
        "src/app/(platform)/acquisition/[line]/*.tsx",
      ),
    ).toBe(true);
    expect(
      matchesGlob(
        "src/app/(platform)/acquisition/l/page.tsx",
        "src/app/(platform)/acquisition/[line]/*.tsx",
      ),
    ).toBe(false);
    expect(
      matchesGlob(
        "runtime-skills/acquisition/profile-web/SKILL.md",
        "runtime-skills/acquisition/profile-*/**",
      ),
    ).toBe(true);
    expect(matchesGlob("src/README.md", "src/**/README.md")).toBe(true);
    expect(matchesGlob(".prettierrc.mjs", ".prettierrc*")).toBe(true);
  });
});

describe("ownerOf", () => {
  it("lets the most specific pattern win", () => {
    expect(ownerOf("src/lib/motion.ts", map)?.phase).toBe("04");
    expect(ownerOf("src/lib/cn.ts", map)?.phase).toBe("01");
    expect(ownerOf("public/brand/futureuni-mark.png", map)?.phase).toBe("04");
    expect(ownerOf("public/robots.txt", map)?.phase).toBe("01");
    expect(ownerOf("prisma/seed/staging/leads.ts", map)?.phase).toBe("19");
    expect(ownerOf("prisma/schema/lead.prisma", map)?.phase).toBe("02");
  });

  it("finds no owner for an unmapped path", () => {
    expect(ownerOf("src/somewhere-new/file.ts", map)).toBeUndefined();
  });
});

describe("decide", () => {
  it("allows a path the phase owns", () => {
    expect(decide({ path: "src/platform/ai/run-task.ts", phase: "05", map })).toMatchObject({
      allowed: true,
      reason: "owned",
    });
  });

  it("blocks a path another phase owns, naming the owner", () => {
    expect(decide({ path: "src/platform/auth/session.ts", phase: "05", map })).toEqual({
      allowed: false,
      reason: "owned-by-another",
      owner: "03",
    });
  });

  it("always allows the phase's own folder and e2e folder", () => {
    expect(decide({ path: "phases/05/REQUESTS.md", phase: "05", map }).allowed).toBe(true);
    expect(decide({ path: "tests/e2e/phase-05/ai.spec.ts", phase: "05", map }).allowed).toBe(true);
    expect(decide({ path: "phases/06/SUMMARY.md", phase: "05", map }).allowed).toBe(false);
  });

  it("allows alsoAllow grants without making the phase an owner", () => {
    expect(decide({ path: "package.json", phase: "05", map })).toMatchObject({
      allowed: true,
      reason: "granted",
      owner: "01",
    });
    expect(decide({ path: "src/modules/acquisition/manifest.ts", phase: "02", map })).toMatchObject(
      {
        allowed: true,
        reason: "granted",
        owner: "19",
      },
    );
  });

  it("blocks an unowned path", () => {
    expect(decide({ path: "src/somewhere-new/file.ts", phase: "05", map })).toEqual({
      allowed: false,
      reason: "unowned",
      owner: null,
    });
  });
});

describe("messages and branches", () => {
  it("builds the block message", () => {
    expect(denialMessage("05", "src/platform/auth/x.ts", "03")).toBe(
      "Phase 05 does not own src/platform/auth/x.ts (owner: Phase 03). Write the change you need to phases/05/REQUESTS.md instead.",
    );
    expect(denialMessage("05", "src/new/x.ts", null)).toContain("(owner: none)");
  });

  it("reads the phase from phase branches only", () => {
    expect(phaseFromBranch("phase/05-ai-service")).toBe("05");
    expect(phaseFromBranch("main")).toBeNull();
    expect(phaseFromBranch("phase/5-ai")).toBeNull();
    expect(phaseFromBranch(null)).toBeNull();
  });
});

describe("the map itself", () => {
  it("gives every pattern exactly one owner", () => {
    expect(findDuplicateOwners(map)).toEqual([]);
  });

  it("reports a pattern claimed twice", () => {
    const broken: OwnershipMap = {
      alwaysAllowed: [],
      phases: { "01": { owns: ["a/**"], alsoAllow: [] }, "02": { owns: ["a/**"], alsoAllow: [] } },
    };
    expect(findDuplicateOwners(broken)).toEqual([{ pattern: "a/**", phases: ["01", "02"] }]);
  });

  it("reads the CLAUDE.md table, expanding the A/ and M/ shorthands", () => {
    const table = parseClaudeOwnershipTable(
      readFileSync(join(here, "..", "..", "CLAUDE.md"), "utf8"),
    );
    expect(table["15"]).toContain("src/app/(platform)/acquisition/[line]/search/**");
    expect(table["09"]).toContain("src/modules/acquisition/enrichment/**");
    expect(table["00"]).not.toContain("main");
    // Every CLAUDE.md path is in the JSON map (the JSON may also hold pending additions).
    expect(
      compareWithClaudeTable(map, table).filter((d) => d.missingFrom === "ownership.json"),
    ).toEqual([]);
  });

  it("derives owned folders from directory patterns only", () => {
    expect(folderOf("src/platform/ai/**")).toBe("src/platform/ai");
    expect(folderOf("runtime-skills/acquisition/profile-*/**")).toBeNull();
    expect(folderOf("src/lib/motion.ts")).toBeNull();
  });
});

describe("guard.mjs as a Claude Code hook", () => {
  let repo = "";

  function git(...args: string[]) {
    const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }

  function runGuard(filePath: string, env: Record<string, string> = {}) {
    const input = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_input: { file_path: filePath },
      cwd: repo,
    });
    const base: NodeJS.ProcessEnv = { ...process.env, CLAUDE_PROJECT_DIR: repo };
    delete base.FU_ALLOW_ALL;
    return spawnSync(process.execPath, [join(repo, "scripts", "ownership", "guard.mjs")], {
      input,
      encoding: "utf8",
      env: { ...base, ...env },
    });
  }

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "fu-guard-"));
    mkdirSync(join(repo, "scripts", "ownership"), { recursive: true });
    for (const file of ["guard.mjs", "lib.mjs", "ownership.json"]) {
      copyFileSync(join(here, file), join(repo, "scripts", "ownership", file));
    }
    git("init", "-q", "-b", "phase/05-ai-service");
  });

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("blocks another phase's path on a phase branch, with exit code 2 and the message (P1-AC3)", () => {
    const result = runGuard(join(repo, "src", "platform", "auth", "x.ts"));
    expect(result.status).toBe(2);
    expect(result.stderr.trim()).toBe(
      "Phase 05 does not own src/platform/auth/x.ts (owner: Phase 03). Write the change you need to phases/05/REQUESTS.md instead.",
    );
  });

  it("allows an owned path and the phase folder", () => {
    expect(runGuard(join(repo, "src", "platform", "ai", "run-task.ts")).status).toBe(0);
    expect(runGuard(join(repo, "phases", "05", "REQUESTS.md")).status).toBe(0);
  });

  it("allows everything with FU_ALLOW_ALL=1", () => {
    expect(
      runGuard(join(repo, "src", "platform", "auth", "x.ts"), { FU_ALLOW_ALL: "1" }).status,
    ).toBe(0);
  });

  it("allows paths outside the repository", () => {
    expect(runGuard(join(tmpdir(), "elsewhere", "notes.md")).status).toBe(0);
  });

  it("treats a file named like '..x' inside the repository as inside it", () => {
    const result = runGuard(join(repo, "..hidden.ts"));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("(owner: none)");
  });

  it("allows every edit on a branch that isn't a phase branch", () => {
    // The branch has no commits yet, so switch it with symbolic-ref.
    git("symbolic-ref", "HEAD", "refs/heads/main");
    expect(runGuard(join(repo, "src", "platform", "auth", "x.ts")).status).toBe(0);
    git("symbolic-ref", "HEAD", "refs/heads/phase/05-ai-service");
  });

  it("blocks edits on a malformed phase branch instead of switching the guard off", () => {
    git("symbolic-ref", "HEAD", "refs/heads/phase/5-ai");
    const result = runGuard(join(repo, "src", "platform", "ai", "run-task.ts"));
    git("symbolic-ref", "HEAD", "refs/heads/phase/05-ai-service");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("isn't named phase/<nn>-<slug>");
  });

  it("judges an edit by the branch of the checkout that holds the file", () => {
    // A session started elsewhere (for example the main folder) editing this phase checkout.
    const input = JSON.stringify({
      tool_input: { file_path: join(repo, "src", "platform", "auth", "x.ts") },
    });
    const result = spawnSync(process.execPath, [join(repo, "scripts", "ownership", "guard.mjs")], {
      input,
      encoding: "utf8",
      cwd: tmpdir(),
      env: { ...process.env, CLAUDE_PROJECT_DIR: tmpdir(), FU_ALLOW_ALL: "" },
    });
    expect(result.status).toBe(2);
  });
});
