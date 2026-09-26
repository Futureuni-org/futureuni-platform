import { describe, expectTypeOf, it } from "vitest";
import type { z } from "zod";

import type {
  Actor,
  AnyJobDefinition,
  AnyTaskDefinition,
  AuditAgent,
  AuditResult,
  Can,
  EmailSender,
  JobDefinition,
  ModuleManifest,
  ModuleManifestMeta,
  PermissionSubject,
  ProviderId,
  RawSignal,
  SourceAdapter,
  SourceAdapterId,
  TaskDefinition,
} from "./index";
import { type ActorSchema } from "./index";

describe("contract types (expectTypeOf)", () => {
  it("Actor is the parsed ActorSchema, narrowed by `type`", () => {
    expectTypeOf<Actor>().toEqualTypeOf<z.infer<typeof ActorSchema>>();
    expectTypeOf<Extract<Actor, { type: "SYSTEM" }>["job"]>().toBeString();
    expectTypeOf<Extract<Actor, { type: "USER" }>>().toHaveProperty("role");
  });

  it("ProviderId stays narrow (never widened to string)", () => {
    expectTypeOf<"serpapi">().toExtend<ProviderId>();
    expectTypeOf<"outreach-mailbox:cm1x">().toExtend<ProviderId>();
    expectTypeOf<string>().not.toExtend<ProviderId>();
  });

  it("a typed job definition only reaches a manifest through defineJob (type erasure)", () => {
    type Typed = JobDefinition<{ leadId: string }>;
    expectTypeOf<Typed["idempotencyKey"]>().parameter(0).toEqualTypeOf<{ leadId: string }>();
    expectTypeOf<AnyJobDefinition["idempotencyKey"]>().parameter(0).toBeUnknown();
    expectTypeOf<ModuleManifest["jobs"]>().toEqualTypeOf<AnyJobDefinition[]>();
  });

  it("a manifest keeps the serialisable metadata beside its behaviour", () => {
    expectTypeOf<ModuleManifest["navigation"]>().toEqualTypeOf<ModuleManifestMeta["navigation"]>();
    expectTypeOf<ModuleManifest["aiTasks"]>().toEqualTypeOf<AnyTaskDefinition[] | undefined>();
  });

  it("task definitions carry their input and output schemas", () => {
    type Task = TaskDefinition<{ name: string }, { summary: string }>;
    expectTypeOf<Task["inputSchema"]>().toEqualTypeOf<z.ZodType<{ name: string }>>();
    expectTypeOf<Task["outputSchema"]>().toEqualTypeOf<z.ZodType<{ summary: string }>>();
  });

  it("adapters, agents and senders have the documented shapes", () => {
    expectTypeOf<SourceAdapter["id"]>().toEqualTypeOf<SourceAdapterId>();
    expectTypeOf<ReturnType<SourceAdapter["search"]>>().toEqualTypeOf<AsyncIterable<RawSignal>>();
    expectTypeOf<ReturnType<AuditAgent["run"]>>().toEqualTypeOf<Promise<AuditResult>>();
    expectTypeOf<EmailSender["id"]>().toEqualTypeOf<"gmail-api" | "smtp" | "mock">();
  });

  it("can() is a pure boolean check over a permission subject", () => {
    expectTypeOf<Can>().parameter(0).toEqualTypeOf<PermissionSubject>();
    expectTypeOf<Can>().returns.toBeBoolean();
  });
});
