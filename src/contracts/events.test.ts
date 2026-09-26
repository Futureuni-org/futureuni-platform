import { describe, expect, expectTypeOf, it } from "vitest";

import { DomainEventSchema, NotificationDataSchema, type EventOf, type NewEvent } from "./events";
import { issuePaths } from "./test-helpers";

const dealWon: NewEvent<"deal.won"> = {
  name: "deal.won",
  actor: { type: "USER", userId: "cm1owner000000000000000001", role: "SERVICE_LEAD" },
  payload: {
    dealId: "cm1deal0000000000000000001",
    leadId: "cm1lead0000000000000000042",
    companyId: "cm1comp0000000000000000007",
    serviceLine: "WEB_DEVELOPMENT",
    market: "NIGERIA",
    valueMinor: 180_000_000,
    currency: "NGN",
    services: ["WEB_DEVELOPMENT"],
  },
};

describe("events contract", () => {
  it("parses the worked example (docs/contracts/events.md §5) once the platform fills id and occurredAt", () => {
    const event = DomainEventSchema.parse({
      ...dealWon,
      id: "cm1evt00000000000000000001",
      occurredAt: "2026-10-03T10:00:00Z",
    });
    expect(event.name).toBe("deal.won");
  });

  it("rejects the invalid example (§6): fractional money and no services", () => {
    const result = DomainEventSchema.safeParse({
      id: "cm1evt00000000000000000001",
      name: "deal.won",
      occurredAt: "2026-10-03T10:00:00Z",
      actor: { type: "SYSTEM", job: "acquisition.pipeline" },
      payload: { ...dealWon.payload, valueMinor: 1800000.5, services: [] },
    });
    expect(issuePaths(result).sort()).toEqual(["payload.services", "payload.valueMinor"]);
  });

  it("rejects an unknown event name", () => {
    expect(
      DomainEventSchema.safeParse({
        ...dealWon,
        name: "deal.maybe",
        id: "cm1evt00000000000000000001",
        occurredAt: "2026-10-03T10:00:00Z",
      }).success,
    ).toBe(false);
  });

  it("narrows an event by name, and publishers pass events without id and occurredAt", () => {
    expectTypeOf<EventOf<"deal.won">["payload"]["valueMinor"]>().toEqualTypeOf<number>();
    expectTypeOf<NewEvent<"deal.won">>().not.toHaveProperty("id");
  });

  it("only pairs an event name with its own payload", () => {
    interface Mismatched {
      name: "deal.won";
      actor: NewEvent<"deal.won">["actor"];
      payload: NewEvent<"user.invited">["payload"];
    }
    expectTypeOf<Mismatched>().not.toExtend<NewEvent>();
    expectTypeOf<NewEvent<"deal.won">>().toExtend<NewEvent>();
  });

  it("notification data defaults its values", () => {
    expect(NotificationDataSchema.parse({}).values).toEqual({});
  });
});
