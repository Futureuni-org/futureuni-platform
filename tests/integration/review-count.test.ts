/**
 * Phase 19: the review-queue count that feeds the Review nav badge, the "My review queue" home
 * widget and the "Needs you" tile (all three call `countReviewQueueForUser`, so they agree by
 * construction; the rendered agreement is checked by the e2e smoke suite). Here we prove the
 * underlying scoped count (CR-15-01): all lines, one line, and a member's own leads — counting only
 * DRAFT/NEEDS_EDIT messages.
 */

import { describe, expect, it } from "vitest";

import { countReviewQueue as countReviewQueueRepo } from "@/modules/acquisition/outreach/review/review.repo";
import { createLead, createMessage, createTeamMember, withRollback } from "../factories";

describe("review-queue count scoping", () => {
  it("counts DRAFT/NEEDS_EDIT drafts by line and owner", () =>
    withRollback(async (tx) => {
      const { user: ownerA } = await createTeamMember(tx, { serviceLines: ["WEB_DEVELOPMENT"] });
      const { user: ownerB } = await createTeamMember(tx, { serviceLines: ["WEB_DEVELOPMENT"] });

      // Baselines, so the assertions measure only the rows this test adds (the shared test DB may
      // already hold committed drafts from other suites).
      const web = { serviceLines: ["WEB_DEVELOPMENT"] };
      const webOwnerA = { serviceLines: ["WEB_DEVELOPMENT"], ownerId: ownerA.id };
      const graphic = { serviceLines: ["GRAPHIC_DESIGN"] };
      const base = {
        all: await countReviewQueueRepo(tx, {}),
        web: await countReviewQueueRepo(tx, web),
        webOwnerA: await countReviewQueueRepo(tx, webOwnerA),
        graphic: await countReviewQueueRepo(tx, graphic),
      };

      async function draft(serviceLine: string, ownerId: string, status: "DRAFT" | "NEEDS_EDIT" | "SENT") {
        const lead = await createLead(tx, {
          status: "IN_REVIEW",
          serviceLine: serviceLine as never,
          ownerId,
        });
        await createMessage(tx, { leadId: lead.id, status });
      }

      await draft("WEB_DEVELOPMENT", ownerA.id, "DRAFT");
      await draft("WEB_DEVELOPMENT", ownerA.id, "DRAFT");
      await draft("WEB_DEVELOPMENT", ownerB.id, "DRAFT");
      await draft("WEB_DEVELOPMENT", ownerB.id, "NEEDS_EDIT");
      await draft("UI_UX_DESIGN", ownerA.id, "DRAFT");
      // A sent message is not in the review queue.
      await draft("WEB_DEVELOPMENT", ownerA.id, "SENT");

      // ADMIN / MANAGER scope: every line (+5: 4 web + 1 ui/ux; the SENT one is excluded).
      expect((await countReviewQueueRepo(tx, {})) - base.all).toBe(5);
      // SERVICE_LEAD scope: one line (+4).
      expect((await countReviewQueueRepo(tx, web)) - base.web).toBe(4);
      // MEMBER scope: own leads in their line (+2).
      expect((await countReviewQueueRepo(tx, webOwnerA)) - base.webOwnerA).toBe(2);
      // A line this test added nothing to (+0).
      expect((await countReviewQueueRepo(tx, graphic)) - base.graphic).toBe(0);
    }));
});
