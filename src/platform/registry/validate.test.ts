import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { JobDefinition } from "@/contracts/jobs";
import type { ModuleManifest } from "@/contracts/module-manifest";

import { coreManifest } from "./core-manifest";
import { defineJob, defineModule, defineSubscriber, permission, scopes } from "./define";
import { validateManifests } from "./validate";

const everyone = scopes("ALL", "ALL", "ALL", "ALL");

function testModule(overrides: Partial<ModuleManifest> = {}): ModuleManifest {
  return defineModule({
    id: "sandbox",
    name: "Sandbox",
    description: "A module for tests.",
    icon: "Box",
    routePrefix: "/sandbox",
    order: 50,
    enabled: true,
    navigation: [
      {
        id: "home",
        label: "Home",
        href: "/sandbox",
        icon: "House",
        permission: "sandbox.page.read",
      },
    ],
    permissions: [permission("sandbox.page.read", "View the sandbox", everyone)],
    jobs: [],
    schedules: [],
    settings: [],
    settingsPanels: [],
    homeWidgets: [],
    notificationTypes: [],
    commands: [],
    ...overrides,
  });
}

const jobSpec = (
  overrides: Partial<JobDefinition<{ id: string }>> = {},
): JobDefinition<{ id: string }> => ({
  name: "sandbox.nightly",
  description: "A nightly test job.",
  input: z.object({ id: z.string() }),
  handler: { kind: "single", run: () => Promise.resolve({}) },
  concurrency: 1,
  timeoutMs: 60_000,
  retry: { maxAttempts: 3, backoff: "exponential", initialDelayMs: 2_000, maxDelayMs: 60_000 },
  idempotencyKey: ({ id }) => `sandbox.nightly:${id}`,
  ...overrides,
});
const job = defineJob(jobSpec());

const icons = new Set(["Box", "House", "LayoutGrid", "Settings", "ShieldCheck"]);
const validate = (...modules: ModuleManifest[]) =>
  validateManifests([coreManifest, ...modules], { knownIcons: icons });

describe("validateManifests (module-manifest.md rule 2)", () => {
  it("accepts a valid module alongside the core", () => {
    expect(validate(testModule())).toEqual([]);
  });

  it("rejects a navigation link outside the module's prefix (the contract's §6 example)", () => {
    const errors = validate(
      testModule({ navigation: [{ id: "oops", label: "Leads", href: "/leads" }] }),
    );
    expect(errors).toContain(
      "Module 'sandbox': navigation item 'oops' links to '/leads', outside its routePrefix '/sandbox'.",
    );
  });

  it("rejects duplicate module ids, and the reserved 'platform' id", () => {
    expect(validate(testModule(), testModule())).toContain(
      "Module id 'sandbox' is used by more than one manifest.",
    );
    expect(validate(testModule({ id: "platform" }))).toEqual(
      expect.arrayContaining(["Module id 'platform' is reserved for the platform core."]),
    );
  });

  it("rejects overlapping route prefixes, naming both modules (AC-21.2)", () => {
    const other = testModule({
      id: "sandbox-two",
      routePrefix: "/sandbox",
      navigation: [],
      permissions: [permission("sandboxTwo.page.read", "View the second sandbox", everyone)],
    });
    expect(validate(testModule(), other)).toContain(
      "Modules 'sandbox' and 'sandbox-two' have overlapping route prefixes ('/sandbox', '/sandbox').",
    );
  });

  it("rejects a prefix on a core path", () => {
    expect(validate(testModule({ routePrefix: "/admin", navigation: [] }))).toContain(
      "Module 'sandbox': routePrefix '/admin' is a core path.",
    );
  });

  it("rejects a duplicate permission action", () => {
    const errors = validate(
      testModule({
        permissions: [permission("platform.home.read", "View the platform home", everyone)],
      }),
    );
    expect(errors).toContain(
      "Permission action 'platform.home.read' is registered more than once.",
    );
  });

  it("rejects duplicate job names and schedule ids", () => {
    const errors = validate(
      testModule({
        jobs: [job, job],
        schedules: [
          { id: "nightly", job: "sandbox.nightly", cron: "0 2 * * *", timezone: "Africa/Lagos" },
          { id: "nightly", job: "sandbox.nightly", cron: "0 3 * * *", timezone: "Africa/Lagos" },
        ],
      }),
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        "Job 'sandbox.nightly' is declared more than once.",
        "Module 'sandbox': schedule 'nightly' is declared more than once.",
      ]),
    );
  });

  it("rejects an invalid cron, an unknown timezone and a schedule for an undeclared job", () => {
    const errors = validate(
      testModule({
        jobs: [job],
        schedules: [
          { id: "bad-cron", job: "sandbox.nightly", cron: "61 * * * *", timezone: "Africa/Lagos" },
          {
            id: "six-fields",
            job: "sandbox.nightly",
            cron: "0 0 2 * * *",
            timezone: "Africa/Lagos",
          },
          { id: "bad-zone", job: "sandbox.nightly", cron: "0 2 * * *", timezone: "Mars/Olympus" },
          { id: "no-job", job: "sandbox.missing", cron: "0 2 * * *", timezone: "Africa/Lagos" },
        ],
      }),
    );
    expect(
      errors.some((error) =>
        error.startsWith("Module 'sandbox': schedule 'bad-cron' cron '61 * * * *' is invalid"),
      ),
    ).toBe(true);
    expect(errors).toEqual(
      expect.arrayContaining([
        "Module 'sandbox': schedule 'six-fields' cron '0 0 2 * * *' must have 5 fields (minute hour day month weekday).",
        "Module 'sandbox': schedule 'bad-zone' cron '0 2 * * *' has an unknown timezone \"Mars/Olympus\".",
        "Module 'sandbox': schedule 'no-job' runs job 'sandbox.missing', which no manifest declares.",
      ]),
    );
  });

  it("rejects an unknown icon", () => {
    expect(validate(testModule({ icon: "NotAnIcon" }))).toContain(
      "Module 'sandbox': unknown icon 'NotAnIcon' (use a lucide-react icon name).",
    );
  });

  it("rejects duplicate widgets and notification types, and unregistered permissions", () => {
    const widget = {
      id: "sandbox.stats",
      title: "Stats",
      permission: "sandbox.page.read",
      size: "md" as const,
      order: 1,
    };
    const type = {
      id: "sandbox.done",
      label: "Done",
      description: "Something finished.",
      category: "product" as const,
      defaultChannels: ["IN_APP" as const],
      critical: false,
      digestible: true,
    };
    const errors = validate(
      testModule({
        homeWidgets: [
          widget,
          widget,
          { ...widget, id: "sandbox.other", permission: "sandbox.secret.read" },
        ],
        notificationTypes: [type, type],
        navigation: [
          { id: "x", label: "X", href: "/sandbox/x", permission: "sandbox.unknown.read" },
        ],
      }),
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        "Home widget 'sandbox.stats' is declared more than once.",
        "Notification type 'sandbox.done' is declared more than once.",
        "Module 'sandbox': home widget 'sandbox.other' needs 'sandbox.secret.read', which isn't a registered permission.",
        "Module 'sandbox': navigation item 'x' needs 'sandbox.unknown.read', which isn't a registered permission.",
      ]),
    );
  });

  it("rejects schema problems with the field's path", () => {
    const errors = validate(testModule({ routePrefix: "sandbox" }));
    expect(errors.some((error) => error.startsWith("Module 'sandbox': routePrefix:"))).toBe(true);
  });
});

describe("validateManifests: owned names, schedule inputs and system actions", () => {
  it("requires a module's permissions, jobs and settings to start with its id", () => {
    const foreignJob = defineJob(jobSpec({ name: "platform.nightly" }));
    const errors = validate(
      testModule({
        permissions: [
          permission("sandbox.page.read", "View", everyone),
          permission("platform.x.read", "Steal", everyone),
        ],
        jobs: [foreignJob],
      }),
    );
    expect(errors).toContain(
      "Module 'sandbox': permission 'platform.x.read' must start with 'sandbox.'.",
    );
    expect(errors).toContain(
      "Module 'sandbox': job 'platform.nightly' must start with 'sandbox.'.",
    );
  });

  it("refuses a schedule whose input the job would reject, and unregistered system actions", () => {
    const withActions = defineJob(jobSpec({ systemActions: ["sandbox.nothing.do"] }));
    const errors = validate(
      testModule({
        jobs: [withActions],
        schedules: [
          {
            id: "nightly",
            job: "sandbox.nightly",
            cron: "0 2 * * *",
            timezone: "Africa/Lagos",
            input: { id: 42 },
          },
        ],
      }),
    );
    expect(errors).toContain(
      "Module 'sandbox': schedule 'nightly' has an input that job 'sandbox.nightly' would reject.",
    );
    expect(errors).toContain(
      "Module 'sandbox': job 'sandbox.nightly' (systemActions) needs 'sandbox.nothing.do', which isn't a registered permission.",
    );
  });
});

describe("defineJob", () => {
  it("parses input with the job's own schema before the handler and the idempotency key", async () => {
    expect(job.idempotencyKey({ id: "42" })).toBe("sandbox.nightly:42");
    expect(() => job.idempotencyKey({ id: 42 })).toThrow();
    if (job.handler.kind !== "single") throw new Error("expected a single handler");
    await expect(job.handler.run({ nope: true }, {} as never)).rejects.toThrow();
  });

  it("keeps a workflow entry as the same function (the Workflow build tags it)", () => {
    const entry = (input: { id: string }) => Promise.resolve({ summary: input.id });
    const workflowJob = defineJob<{ id: string }>({
      name: "sandbox.long-run",
      description: "A workflow job.",
      input: z.object({ id: z.string() }),
      handler: { kind: "workflow", entry, steps: ["one"] },
      concurrency: 1,
      timeoutMs: 60_000,
      retry: { maxAttempts: 3, backoff: "exponential", initialDelayMs: 2_000, maxDelayMs: 300_000 },
      idempotencyKey: (input) => input.id,
    });
    expect(workflowJob.handler).toMatchObject({ kind: "workflow", entry });
  });
});

describe("defineSubscriber", () => {
  it("erases the event type and refuses events it didn't subscribe to", async () => {
    const seen: string[] = [];
    const subscriber = defineSubscriber({
      id: "sandbox.on-deal-won",
      events: ["deal.won"],
      mode: "inline",
      handler: (event) => {
        seen.push(event.payload.dealId);
        return Promise.resolve();
      },
    });
    const ctx = { clock: { now: () => new Date() } };
    const won = {
      name: "deal.won",
      payload: { dealId: "cm1deal0000000000000000001" },
    } as unknown as Parameters<typeof subscriber.handler>[0];
    const invited = { name: "user.invited", payload: {} } as unknown as Parameters<
      typeof subscriber.handler
    >[0];
    await subscriber.handler(won, ctx);
    expect(seen).toEqual(["cm1deal0000000000000000001"]);
    await expect(subscriber.handler(invited, ctx)).rejects.toThrow(/doesn't subscribe/);
  });
});
