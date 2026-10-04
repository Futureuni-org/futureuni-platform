import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentUser } from "@/platform/auth";
import type * as AuthModule from "@/platform/auth";
import { db } from "@/platform/db";
import type * as JobsModule from "@/platform/jobs";
import type * as ComplianceModule from "@/modules/acquisition/compliance";
import { createContact, createLeadInStatus, createTeamMember } from "@/tests/factories";

import {
  bulkReauditAction,
  bulkRescoreAction,
  bulkSuppressAction,
  loadMoreLeadsAction,
  saveLeadViewAction,
} from "./actions";
import { MAX_SAVED_VIEWS, listSavedViews } from "./saved-views.repo";
import { sessionUser } from "./session.test-util";

/**
 * The rules the leads-list actions enforce themselves, because no service does it for them: who
 * may suppress a lead, which leads a queued re-score or re-audit may touch, which line's leads a
 * "load more" may read, and what a saved view may hold. Authentication is replaced by a session
 * user; the permission matrix, the repos and the database are real. The job queue and the
 * suppression list are replaced, and each test asserts whether they were reached.
 */

const session = vi.hoisted(() => ({ user: null as CurrentUser | null }));
const services = vi.hoisted(() => ({ enqueueJob: vi.fn(), addSuppression: vi.fn() }));

vi.mock("@/platform/auth", async () => {
  const actual = await vi.importActual<typeof AuthModule>("@/platform/auth");
  return {
    ...actual,
    requireUser: () => {
      if (session.user === null) throw new Error("The test has no signed-in user.");
      return Promise.resolve(session.user);
    },
  };
});
vi.mock("@/platform/jobs", async () => ({
  ...(await vi.importActual<typeof JobsModule>("@/platform/jobs")),
  enqueueJob: services.enqueueJob,
}));
vi.mock("@/modules/acquisition/compliance", async () => ({
  ...(await vi.importActual<typeof ComplianceModule>("@/modules/acquisition/compliance")),
  addSuppression: services.addSuppression,
}));

let admin: CurrentUser;
let manager: CurrentUser;
let owner: CurrentUser;
let otherMember: CurrentUser;
let videoMember: CurrentUser;

beforeAll(async () => {
  admin = sessionUser(await createTeamMember(db, { role: "ADMIN", serviceLines: [] }));
  manager = sessionUser(await createTeamMember(db, { role: "MANAGER", serviceLines: [] }));
  owner = sessionUser(
    await createTeamMember(db, { role: "MEMBER", serviceLines: ["WEB_DEVELOPMENT"] }),
  );
  otherMember = sessionUser(
    await createTeamMember(db, { role: "MEMBER", serviceLines: ["WEB_DEVELOPMENT"] }),
  );
  videoMember = sessionUser(
    await createTeamMember(db, { role: "MEMBER", serviceLines: ["VIDEO_EDITING"] }),
  );
});

beforeEach(() => {
  session.user = null;
  services.enqueueJob.mockReset();
  services.enqueueJob.mockResolvedValue({ jobRunId: "run", deduplicated: false });
  services.addSuppression.mockReset();
});

function ownedLead(status: Parameters<typeof createLeadInStatus>[1]) {
  return createLeadInStatus(db, status, { serviceLine: "WEB_DEVELOPMENT", ownerId: owner.id });
}

describe("bulkSuppressAction", () => {
  it("refuses a manager: only someone who can undo a suppression may add one from a lead", async () => {
    const lead = await ownedLead("REPLIED");
    session.user = manager;

    const result = await bulkSuppressAction([lead.id], "Asked us to stop");

    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(services.addSuppression).not.toHaveBeenCalled();
  });

  it("suppresses the primary contact's email for an admin", async () => {
    const lead = await ownedLead("REPLIED");
    const contact = await createContact(db, { companyId: lead.companyId });
    await db.lead.update({ where: { id: lead.id }, data: { primaryContactId: contact.id } });
    session.user = admin;

    const result = await bulkSuppressAction([lead.id], "Asked us to stop");

    expect(result).toEqual({ ok: true, data: { succeeded: 1, failed: [] } });
    expect(services.addSuppression).toHaveBeenCalledOnce();
    expect(services.addSuppression).toHaveBeenCalledWith(
      { type: "USER", userId: admin.id, role: "ADMIN" },
      expect.objectContaining({ type: "EMAIL", value: contact.email, note: "Asked us to stop" }),
    );
  });

  it("reports a lead that no longer exists instead of failing the whole batch", async () => {
    const lead = await ownedLead("REPLIED");
    const contact = await createContact(db, { companyId: lead.companyId });
    await db.lead.update({ where: { id: lead.id }, data: { primaryContactId: contact.id } });
    session.user = admin;

    const result = await bulkSuppressAction([lead.id, "cmissingleadid0000000000"], "Opt-out");

    expect(result).toMatchObject({ ok: true, data: { succeeded: 1 } });
    expect(result.ok && result.data.failed).toEqual([
      { leadId: "cmissingleadid0000000000", message: "This lead no longer exists." },
    ]);
  });

  it("acts once on a lead id that is repeated", async () => {
    const lead = await ownedLead("REPLIED");
    const contact = await createContact(db, { companyId: lead.companyId });
    await db.lead.update({ where: { id: lead.id }, data: { primaryContactId: contact.id } });
    session.user = admin;

    const result = await bulkSuppressAction([lead.id, lead.id, lead.id], "Opt-out");

    expect(result).toEqual({ ok: true, data: { succeeded: 1, failed: [] } });
    expect(services.addSuppression).toHaveBeenCalledOnce();
  });
});

describe("bulkRescoreAction", () => {
  it("queues only the leads the person may re-score, in a status where a re-score runs", async () => {
    const mine = await ownedLead("SCORED");
    const inReview = await ownedLead("IN_REVIEW");
    const someoneElses = await createLeadInStatus(db, "SCORED", {
      serviceLine: "WEB_DEVELOPMENT",
      ownerId: otherMember.id,
    });
    session.user = owner;

    const result = await bulkRescoreAction([mine.id, inReview.id, someoneElses.id]);

    expect(result).toMatchObject({ ok: true, data: { succeeded: 1 } });
    expect(result.ok && result.data.failed.map((failure) => failure.leadId).sort()).toEqual(
      [inReview.id, someoneElses.id].sort(),
    );
    expect(services.enqueueJob).toHaveBeenCalledOnce();
    expect(services.enqueueJob).toHaveBeenCalledWith(
      "acquisition.scoring.lead",
      { leadId: mine.id },
      { actor: { type: "USER", userId: owner.id, role: "MEMBER" } },
    );
  });

  it("queues nothing for someone from another line", async () => {
    const lead = await ownedLead("SCORED");
    session.user = videoMember;

    const result = await bulkRescoreAction([lead.id]);

    expect(result).toMatchObject({ ok: true, data: { succeeded: 0 } });
    expect(services.enqueueJob).not.toHaveBeenCalled();
  });
});

describe("bulkReauditAction", () => {
  it("queues a forced audit under its own key and records who asked", async () => {
    const lead = await ownedLead("AUDITED");
    session.user = owner;

    const result = await bulkReauditAction([lead.id]);

    expect(result).toEqual({ ok: true, data: { succeeded: 1, failed: [] } });
    expect(services.enqueueJob).toHaveBeenCalledOnce();
    const [job, input, options] = services.enqueueJob.mock.calls[0] as [
      string,
      { leadId: string; force: boolean },
      { idempotencyKey: string },
    ];
    expect(job).toBe("acquisition.audits.lead");
    expect(input).toEqual({ leadId: lead.id, force: true });
    // The job's own key is one per lead, which would drop a second audit as a duplicate.
    expect(options.idempotencyKey).toMatch(
      new RegExp(`^acquisition\\.audits\\.lead:${lead.id}:reaudit:`),
    );
    const trail = await db.auditLog.findMany({
      where: { action: "acquisition.lead.reaudit", targetId: lead.id },
    });
    expect(trail).toHaveLength(1);
    expect(trail[0]?.actorId).toBe(owner.id);
  });

  it("leaves out a lead that is past the audit stage, and records nothing for it", async () => {
    const lead = await ownedLead("REPLIED");
    session.user = owner;

    const result = await bulkReauditAction([lead.id]);

    expect(result).toMatchObject({ ok: true, data: { succeeded: 0 } });
    expect(services.enqueueJob).not.toHaveBeenCalled();
    const trail = await db.auditLog.count({
      where: { action: "acquisition.lead.reaudit", targetId: lead.id },
    });
    expect(trail).toBe(0);
  });
});

describe("loadMoreLeadsAction", () => {
  it("refuses a line the person doesn't work on", async () => {
    session.user = videoMember;
    const result = await loadMoreLeadsAction("WEB_DEVELOPMENT", {}, "cursor");
    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("refuses a service line that doesn't exist", async () => {
    session.user = manager;
    const result = await loadMoreLeadsAction("constructor", {}, "cursor");
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });
});

describe("saveLeadViewAction", () => {
  it("saves the list's own filters", async () => {
    session.user = owner;

    const result = await saveLeadViewAction("WEB_DEVELOPMENT", "Hot Lagos", {
      group: "replied",
      scoreMin: "70",
    });

    expect(result).toMatchObject({ ok: true });
    const views = await listSavedViews(owner.id, "WEB_DEVELOPMENT");
    expect(views.find((view) => view.name === "Hot Lagos")?.query).toEqual({
      group: "replied",
      scoreMin: "70",
    });
  });

  it("refuses a view that carries anything other than a list filter", async () => {
    session.user = owner;

    const result = await saveLeadViewAction("WEB_DEVELOPMENT", "Sneaky", {
      group: "replied",
      redirect: "https://example.com",
    });

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    const views = await listSavedViews(owner.id, "WEB_DEVELOPMENT");
    expect(views.some((view) => view.name === "Sneaky")).toBe(false);
  });

  it("refuses a line the person doesn't work on", async () => {
    session.user = videoMember;
    const result = await saveLeadViewAction("WEB_DEVELOPMENT", "Not mine", { group: "replied" });
    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("stops at the limit, but still lets an existing view be replaced", async () => {
    const hoarder = sessionUser(
      await createTeamMember(db, { role: "MEMBER", serviceLines: ["WEB_DEVELOPMENT"] }),
    );
    session.user = hoarder;
    for (let index = 0; index < MAX_SAVED_VIEWS; index += 1) {
      const saved = await saveLeadViewAction("WEB_DEVELOPMENT", `View ${String(index)}`, {
        scoreMin: String(index),
      });
      expect(saved.ok).toBe(true);
    }

    const oneTooMany = await saveLeadViewAction("WEB_DEVELOPMENT", "One too many", { q: "x" });
    expect(oneTooMany).toMatchObject({ ok: false, error: { code: "CONFLICT" } });

    const replaced = await saveLeadViewAction("WEB_DEVELOPMENT", "View 0", { scoreMin: "99" });
    expect(replaced.ok).toBe(true);
    const views = await listSavedViews(hoarder.id, "WEB_DEVELOPMENT");
    expect(views).toHaveLength(MAX_SAVED_VIEWS);
    expect(views.find((view) => view.name === "View 0")?.query).toEqual({ scoreMin: "99" });
  });
});
