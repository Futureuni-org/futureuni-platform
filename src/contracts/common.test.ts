import { describe, expect, it } from "vitest";

import { APP_ERROR_STATUS as LIB_APP_ERROR_STATUS } from "@/lib/errors";

import {
  ActorSchema,
  APP_ERROR_STATUS,
  AppErrorCodeSchema,
  IdSchema,
  Iso8601Schema,
  MARKET_CURRENCIES,
  MoneySchema,
  ProviderIdSchema,
  ServiceLine,
  ServiceLineSchema,
} from "./common";
import { issuePaths } from "./test-helpers";

describe("common contract", () => {
  it("parses the worked example (docs/contracts/common.md §4)", () => {
    expect(MoneySchema.parse({ amountMinor: 25_000_000, currency: "NGN" })).toEqual({
      amountMinor: 25_000_000,
      currency: "NGN",
    });
    expect(
      ActorSchema.parse({
        type: "USER",
        userId: "cm1f2k3j40000abcd1234efgh",
        role: "SERVICE_LEAD",
      }),
    ).toMatchObject({ type: "USER" });
    expect(
      ActorSchema.parse({
        type: "SYSTEM",
        job: "acquisition.outreach.tick",
        jobRunId: "cm1f2k3j40001abcd1234efgh",
      }),
    ).toMatchObject({ type: "SYSTEM" });
    expect(Iso8601Schema.parse("2026-10-03T08:15:00Z")).toBe("2026-10-03T08:15:00Z");
  });

  it("rejects the invalid example (§5): money is integer minor units; timestamps are UTC", () => {
    expect(issuePaths(MoneySchema.safeParse({ amountMinor: 1250.5, currency: "GBP" }))).toEqual([
      "amountMinor",
    ]);
    expect(Iso8601Schema.safeParse("2026-10-03T09:15:00+01:00").success).toBe(false);
  });

  it("re-exports the database enums as values and schemas (rule 1)", () => {
    expect(ServiceLine.VIDEO_EDITING).toBe("VIDEO_EDITING");
    expect(ServiceLineSchema.options).toEqual([
      "WEB_DEVELOPMENT",
      "UI_UX_DESIGN",
      "GRAPHIC_DESIGN",
      "VIDEO_EDITING",
    ]);
  });

  it("takes the error map from src/lib/errors.ts instead of redefining it (CR-01-09)", () => {
    expect(APP_ERROR_STATUS).toBe(LIB_APP_ERROR_STATUS);
    expect(AppErrorCodeSchema.options).toEqual(Object.keys(LIB_APP_ERROR_STATUS));
  });

  it("accepts Prisma cuid ids and rejects other shapes", () => {
    expect(IdSchema.safeParse("cmui6is1c00038wi3bkyncetl").success).toBe(true);
    expect(IdSchema.safeParse("cseedcomp0000000000000001").success).toBe(true);
    expect(IdSchema.safeParse("not-an-id").success).toBe(false);
  });

  it("narrows provider ids to the known list plus outreach-mailbox:<id> (rule 9)", () => {
    expect(ProviderIdSchema.safeParse("serpapi").success).toBe(true);
    expect(ProviderIdSchema.safeParse("outreach-mailbox:cmui6is1c00038wi3bkyncetl").success).toBe(
      true,
    );
    expect(ProviderIdSchema.safeParse("jobs-serpapi").success).toBe(false);
    expect(ProviderIdSchema.safeParse("outreach-mailbox:NOT VALID").success).toBe(false);
  });

  it("maps each market to the currencies it may use (rule 4)", () => {
    expect(MARKET_CURRENCIES.NIGERIA).toEqual(["NGN"]);
    expect(MARKET_CURRENCIES.INTERNATIONAL).toEqual(["USD", "GBP", "EUR"]);
  });
});
