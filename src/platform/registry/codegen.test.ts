import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  discoverModuleIds,
  formatGenerated,
  loadManifests,
  lucideIconNames,
  renderGenerated,
} from "./codegen";
import { validateManifests } from "./validate";
import { coreManifest } from "./core-manifest";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A throwaway project root with modules whose manifests are plain objects. */
function tempRoot(manifests: Record<string, object>): string {
  const root = mkdtempSync(join(tmpdir(), "futureuni-registry-"));
  roots.push(root);
  for (const [folder, manifest] of Object.entries(manifests)) {
    mkdirSync(join(root, "src", "modules", folder), { recursive: true });
    writeFileSync(
      join(root, "src", "modules", folder, "manifest.ts"),
      `export default ${JSON.stringify(manifest)};\n`,
    );
  }
  mkdirSync(join(root, "src", "modules", "no-manifest"), { recursive: true });
  return root;
}

const manifestFor = (id: string, routePrefix = `/${id}`) => ({
  id,
  name: id.charAt(0).toUpperCase() + id.slice(1),
  description: "A temporary test module.",
  icon: "Box",
  routePrefix,
  order: 50,
  enabled: true,
  navigation: [{ id: "home", label: "Home", href: routePrefix }],
  permissions: [],
  jobs: [],
  schedules: [],
  settings: [],
  settingsPanels: [],
  homeWidgets: [],
  notificationTypes: [],
  commands: [],
});

describe("registry codegen", () => {
  it("picks up every module with a manifest, sorted by id", async () => {
    const root = tempRoot({ zeta: manifestFor("zeta"), alpha: manifestFor("alpha") });
    expect(await discoverModuleIds(root)).toEqual(["alpha", "zeta"]);
  });

  it("imports each manifest statically, sorted, in generated.ts", async () => {
    const source = await formatGenerated(renderGenerated(["alpha", "sales-crm"]), process.cwd());
    expect(source).toContain('import alphaManifest from "@/modules/alpha/manifest";');
    expect(source).toContain('import salesCrmManifest from "@/modules/sales-crm/manifest";');
    expect(source).toContain(
      "export const moduleManifests: readonly ModuleManifest[] = [alphaManifest, salesCrmManifest];",
    );
    // Formatting is stable: formatting the output again changes nothing.
    expect(await formatGenerated(source, process.cwd())).toBe(source);
  });

  it("loads a temporary module and validates it with the core manifest", async () => {
    const root = tempRoot({ sandbox: manifestFor("sandbox") });
    const { manifests, errors } = await loadManifests(root, await discoverModuleIds(root));
    expect(errors).toEqual([]);
    expect(manifests.map((manifest) => manifest.id)).toEqual(["sandbox"]);
    expect(
      validateManifests([coreManifest, ...manifests], { knownIcons: lucideIconNames() }),
    ).toEqual([]);
  });

  it("rejects a manifest whose id doesn't match its folder, and overlapping prefixes", async () => {
    const root = tempRoot({
      one: manifestFor("two"),
      alpha: manifestFor("alpha", "/shared"),
      beta: manifestFor("beta", "/shared"),
    });
    const { manifests, errors } = await loadManifests(root, await discoverModuleIds(root));
    expect(errors).toEqual([
      "src/modules/one/manifest.ts declares id 'two'; it must match its folder 'one'.",
    ]);
    expect(validateManifests([coreManifest, ...manifests])).toContain(
      "Modules 'alpha' and 'beta' have overlapping route prefixes ('/shared', '/shared').",
    );
  });

  it("knows lucide-react's canonical icon names", () => {
    const icons = lucideIconNames();
    expect(icons.size).toBeGreaterThan(1_500);
    expect(icons.has("House")).toBe(true);
    expect(icons.has("Radar")).toBe(true);
  });
});
