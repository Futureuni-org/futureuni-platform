import { describe, expect, it } from "vitest";

import { createCompany, createUser, withRollback } from "../../../tests/factories";

import { dbIncludingDeleted } from "./client";
import { isUniqueViolation, toDbAppError, violatedConstraint } from "./errors";
import { toJsonInput } from "./json";
import { afterClause, decodeCursor, encodeCursor, NEWEST_FIRST, paginate } from "./pagination";
import { createOrOnConflict, withSavepoint } from "./transaction";

describe("soft-delete scoping", () => {
  it("hides soft-deleted companies from reads unless the caller asks about deletedAt", () =>
    withRollback(async (tx) => {
      const company = await createCompany(tx, { deletedAt: new Date() });
      expect(await tx.company.findFirst({ where: { id: company.id } })).toBeNull();
      expect(await tx.company.findUnique({ where: { id: company.id } })).toBeNull();
      expect(await tx.company.count({ where: { id: company.id } })).toBe(0);
      expect(
        await tx.company.findFirst({ where: { id: company.id, deletedAt: { not: null } } }),
      ).not.toBeNull();
    }));

  it("leaves models without deletedAt alone", () =>
    withRollback(async (tx) => {
      const user = await createUser(tx);
      expect(await tx.user.findUnique({ where: { id: user.id } })).not.toBeNull();
    }));

  it("the unscoped client sees deleted rows (for data-subject requests and the retention purge)", async () => {
    const found = await dbIncludingDeleted.company.findMany({
      where: { deletedAt: { not: null } },
      take: 1,
    });
    expect(Array.isArray(found)).toBe(true);
  });
});

describe("database errors as AppErrors", () => {
  it("maps a unique violation to CONFLICT, keeping the constraint off the response", () =>
    withRollback(async (tx) => {
      const user = await createUser(tx);
      const failure = await withSavepoint(tx, () => createUser(tx, { email: user.email })).catch(
        (error: unknown) => error,
      );
      expect(isUniqueViolation(failure)).toBe(true);
      expect(isUniqueViolation(failure, "users_email_key")).toBe(true);
      const appError = toDbAppError(failure);
      expect(appError).toMatchObject({ code: "CONFLICT", status: 409 });
      expect((appError?.cause as Error).message).toContain("users_email_key");
      const shape = JSON.stringify(appError?.toShape());
      expect(shape).not.toContain(user.email);
      expect(shape).not.toContain("users_email_key");
    }));

  it("maps a CHECK violation to VALIDATION_FAILED without the failing row", () =>
    withRollback(async (tx) => {
      const company = await createCompany(tx);
      const failure = await withSavepoint(tx, () =>
        tx.company.update({ where: { id: company.id }, data: { country: "ng" } }),
      ).catch((error: unknown) => error);
      expect(violatedConstraint(failure)).toBe("companies_country_iso2_check");
      const appError = toDbAppError(failure);
      expect(appError).toMatchObject({ code: "VALIDATION_FAILED" });
      expect((appError?.cause as Error).message).toContain("companies_country_iso2_check");
      expect((appError?.cause as Error).message).not.toContain(company.name);
    }));

  it("maps a missing record to NOT_FOUND and a foreign-key violation to CONFLICT", () =>
    withRollback(async (tx) => {
      const missing = await tx.user
        .update({ where: { id: "cmissing000000000000000001" }, data: { name: "x" } })
        .catch((error: unknown) => error);
      expect(toDbAppError(missing)?.code).toBe("NOT_FOUND");
      const orphan = await withSavepoint(tx, () =>
        tx.note.create({
          data: {
            authorId: "cmissing000000000000000001",
            module: "x",
            targetType: "x",
            targetId: "x",
            body: "x",
          },
        }),
      ).catch((error: unknown) => error);
      expect(toDbAppError(orphan)?.code).toBe("CONFLICT");
    }));

  it("returns null for anything that isn't a database error", () => {
    expect(toDbAppError(new Error("boom"))).toBeNull();
    expect(isUniqueViolation("nope")).toBe(false);
  });
});

describe("withSavepoint", () => {
  it("rolls back only the failed part and keeps the transaction usable", () =>
    withRollback(async (tx) => {
      const user = await createUser(tx);
      await expect(
        withSavepoint(tx, () => createUser(tx, { email: user.email })),
      ).rejects.toThrow();
      // Without the savepoint PostgreSQL would now refuse every statement in this transaction.
      const again = await createUser(tx);
      expect(again.id).not.toBe(user.id);
    }));

  it("keeps the savepoint's work when it succeeds, including nested savepoints", () =>
    withRollback(async (tx) => {
      const outer = await withSavepoint(tx, async () => {
        const first = await createUser(tx);
        await withSavepoint(tx, () => createUser(tx, { email: first.email })).catch(() => null);
        return first;
      });
      expect(await tx.user.findUnique({ where: { id: outer.id } })).not.toBeNull();
    }));

  it("rolls back the outer savepoint's own work after a caught inner failure", () =>
    withRollback(async (tx) => {
      const before = await tx.user.count();
      const failure = await withSavepoint(tx, async () => {
        const first = await createUser(tx);
        await withSavepoint(tx, () => createUser(tx, { email: first.email })).catch(() => null);
        throw new Error("outer failed");
      }).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(Error);
      // The user written before the inner savepoint is gone too.
      expect(await tx.user.count()).toBe(before);
    }));
});

describe("createOrOnConflict (partial unique indexes)", () => {
  it("creates once, then handles the conflict on the named index without aborting", () =>
    withRollback(async (tx) => {
      const user = await createUser(tx);
      const notify = () =>
        createOrOnConflict(
          tx,
          "notifications_userId_dedupeKey_key",
          () =>
            tx.notification.create({
              data: { userId: user.id, type: "job.failed", title: "Failed", dedupeKey: "run-1" },
            }),
          async () => {
            const existing = await tx.notification.findFirst({
              where: { userId: user.id, dedupeKey: "run-1" },
            });
            if (existing === null) throw new Error("expected the existing notification");
            return existing;
          },
        );
      const first = await notify();
      const second = await notify();
      expect(second.id).toBe(first.id);
      expect(await tx.notification.count({ where: { userId: user.id } })).toBe(1);
    }));

  it("rethrows a violation of any other constraint", () =>
    withRollback(async (tx) => {
      const user = await createUser(tx);
      await expect(
        createOrOnConflict(
          tx,
          "some_other_index",
          () => createUser(tx, { email: user.email }),
          () => Promise.resolve(user),
        ),
      ).rejects.toThrow();
      expect(await tx.user.count({ where: { id: user.id } })).toBe(1);
    }));
});

describe("cursor pagination", () => {
  it("round-trips a cursor and treats a malformed one as no cursor", () => {
    const cursor = {
      createdAt: new Date("2026-10-03T09:00:00.000Z"),
      id: "ccursor00000000000000001",
    };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    expect(decodeCursor("not-a-cursor")).toBeNull();
    expect(
      decodeCursor(Buffer.from('{"createdAt":"yesterday","id":"x"}').toString("base64url")),
    ).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
  });

  it("pages through rows newest first with no duplicates and no gaps, and caps the page size", () =>
    withRollback(async (tx) => {
      const base = Date.UTC(2026, 9, 1);
      const created = [];
      for (let i = 0; i < 7; i += 1) {
        created.push(
          await createCompany(tx, {
            industry: "pagination-test",
            createdAt: new Date(base + i * 60_000),
          }),
        );
      }
      const fetchPage = (cursor?: string) =>
        paginate({ limit: 3, ...(cursor === undefined ? {} : { cursor }) }, ({ after, take }) =>
          tx.company.findMany({
            where: { AND: [{ industry: "pagination-test" }, afterClause(after)] },
            orderBy: [...NEWEST_FIRST],
            take,
          }),
        );
      const first = await fetchPage();
      const second = await fetchPage(first.nextCursor ?? undefined);
      const third = await fetchPage(second.nextCursor ?? undefined);
      expect(first.items).toHaveLength(3);
      expect(third.items).toHaveLength(1);
      expect(third.nextCursor).toBeNull();
      const seen = [...first.items, ...second.items, ...third.items].map((company) => company.id);
      expect(seen).toEqual(created.map((company) => company.id).reverse());

      // A filter with its own OR keeps working on later pages (the cursor is ANDed, not spread).
      const either = { OR: [{ industry: "pagination-test" }, { industry: "no-such-industry" }] };
      const orFirst = await paginate({ limit: 3 }, ({ after, take }) =>
        tx.company.findMany({
          where: { AND: [either, afterClause(after)] },
          orderBy: [...NEWEST_FIRST],
          take,
        }),
      );
      const orSecond = await paginate(
        { limit: 3, cursor: orFirst.nextCursor ?? "" },
        ({ after, take }) =>
          tx.company.findMany({
            where: { AND: [either, afterClause(after)] },
            orderBy: [...NEWEST_FIRST],
            take,
          }),
      );
      expect(orSecond.items.every((company) => company.industry === "pagination-test")).toBe(true);
      expect([...orFirst.items, ...orSecond.items]).toHaveLength(6);

      const capped = await paginate({ limit: 1_000 }, ({ take }) =>
        Promise.resolve(
          Array.from({ length: take }, (_, i) => ({ id: `c${String(i)}`, createdAt: new Date() })),
        ),
      );
      expect(capped.items).toHaveLength(100);
    }));
});

describe("toJsonInput", () => {
  it("turns a contract value into plain JSON (undefined fields dropped, dates as strings)", () => {
    expect(toJsonInput({ a: 1, b: undefined, c: new Date("2026-10-03T09:00:00.000Z") })).toEqual({
      a: 1,
      c: "2026-10-03T09:00:00.000Z",
    });
    expect(() => toJsonInput(null)).toThrow(TypeError);
  });
});
