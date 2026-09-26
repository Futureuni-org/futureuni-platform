import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createModuleFiles, moduleIdProblem } from "./create-module";

const repoRoot = join(import.meta.dirname, "../../..");
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A throwaway root holding a copy of the template and an existing module. */
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "futureuni-create-module-"));
  roots.push(root);
  cpSync(join(repoRoot, "templates", "create-module"), join(root, "templates", "create-module"), {
    recursive: true,
  });
  mkdirSync(join(root, "src", "modules", "acquisition"), { recursive: true });
  return root;
}

describe("create-module", () => {
  it("copies the template with its tokens replaced", () => {
    const root = tempRoot();
    const written = createModuleFiles({ root, id: "sandbox", name: "Sandbox" });
    expect(written).toEqual(
      expect.arrayContaining([
        "src/modules/sandbox/manifest.ts",
        "src/modules/sandbox/jobs.ts",
        "src/modules/sandbox/seed.ts",
        "src/modules/sandbox/README.md",
        "src/modules/sandbox/core/example.ts",
        "src/modules/sandbox/core/example.repo.ts",
        "src/modules/sandbox/core/example.test.ts",
        "src/modules/sandbox/ui/example-panel.tsx",
        "src/app/(platform)/sandbox/page.tsx",
      ]),
    );
    const manifest = readFileSync(join(root, "src/modules/sandbox/manifest.ts"), "utf8");
    expect(manifest).toContain('id: "sandbox"');
    expect(manifest).toContain('routePrefix: "/sandbox"');
    expect(manifest).not.toMatch(/__[A-Z_]+__/);
    expect(readFileSync(join(root, "src/app/(platform)/sandbox/page.tsx"), "utf8")).toContain(
      "export default function SandboxPage()",
    );
    expect(existsSync(join(root, "src/modules/sandbox/manifest.ts.tpl"))).toBe(false);
  });

  it("validates the id: letters only, unused, not reserved", () => {
    const root = tempRoot();
    expect(moduleIdProblem(root, "sales-crm")).toMatch(/lower-case letters/);
    expect(moduleIdProblem(root, "Sales")).toMatch(/lower-case letters/);
    expect(moduleIdProblem(root, "a")).toMatch(/lower-case letters/);
    expect(moduleIdProblem(root, "platform")).toMatch(/reserved/);
    expect(moduleIdProblem(root, "admin")).toMatch(/reserved/);
    expect(moduleIdProblem(root, "acquisition")).toMatch(/already exists/);
    expect(moduleIdProblem(root, "marketing")).toBeNull();
    expect(() => createModuleFiles({ root, id: "acquisition", name: "Again" })).toThrow(
      /already exists/,
    );
  });

  it("refuses a display name that would need escaping in TypeScript or JSX", () => {
    const root = tempRoot();
    expect(() => createModuleFiles({ root, id: "partners", name: "Partners' Hub" })).toThrow(
      /letters, digits/,
    );
    expect(() => createModuleFiles({ root, id: "partners", name: 'Say "hi"' })).toThrow(
      /letters, digits/,
    );
    expect(createModuleFiles({ root, id: "partners", name: "Partners & Referrals" })).toContain(
      "src/modules/partners/manifest.ts",
    );
  });
});
