/**
 * SQL-level proofs of the database invariants in the init migration (data-model §6; P2-AC3).
 * Each write is plain SQL, so the database itself (not Prisma or app code) refuses the bad row.
 * Everything runs in a rolled-back transaction against the test database.
 */

import { describe, expect, it } from "vitest";

import { violatedConstraint, type Tx } from "@/platform/db";

import {
  createContact,
  createEnrollment,
  createLead,
  createLeadInStatus,
  createMessage,
  createProposal,
  createUser,
  withRollback,
} from "../tests/factories";

/** Runs `write` after `setup` and expects the database to refuse it with `constraint`. */
async function expectRefused(
  constraint: string,
  write: (tx: Tx) => Promise<unknown>,
): Promise<void> {
  let failure: unknown = null;
  try {
    await withRollback(write);
  } catch (error) {
    failure = error;
  }
  expect(failure, `expected ${constraint} to refuse the write`).not.toBeNull();
  expect(violatedConstraint(failure)).toBe(constraint);
}

const newId = (label: string) =>
  `ctest${label}${String(Date.now())}${String(Math.random()).slice(2, 8)}`.slice(0, 25);

describe("INV-9 (ADR-032): one ACTIVE or PAUSED enrolment per company", () => {
  async function insertEnrollment(
    tx: Tx,
    from: { leadId: string; contactId: string; companyId: string; sequenceId: string },
    status: string,
  ) {
    await tx.$executeRaw`
      INSERT INTO acq_enrollments (id, "leadId", "contactId", "companyId", "sequenceId", status, "updatedAt")
      VALUES (${newId("enr")}, ${from.leadId}, ${from.contactId}, ${from.companyId}, ${from.sequenceId},
              ${status}::"EnrollmentStatus", now())`;
  }

  it("refuses a second ACTIVE enrolment for the same company", () =>
    expectRefused("acq_enrollments_one_open_thread", async (tx) => {
      const first = await createEnrollment(tx);
      await insertEnrollment(tx, first, "ACTIVE");
    }));

  it("refuses an ACTIVE enrolment while another is PAUSED", () =>
    expectRefused("acq_enrollments_one_open_thread", async (tx) => {
      const paused = await createEnrollment(tx, { status: "PAUSED", pauseReason: "OUT_OF_OFFICE" });
      await insertEnrollment(tx, paused, "ACTIVE");
    }));

  it("allows a new ACTIVE enrolment once the earlier one has stopped", () =>
    withRollback(async (tx) => {
      const stopped = await createEnrollment(tx, { status: "STOPPED", stoppedReason: "REPLY" });
      const other = await createContact(tx, { companyId: stopped.companyId });
      await insertEnrollment(tx, { ...stopped, contactId: other.id }, "ACTIVE");
      expect(await tx.enrollment.count({ where: { companyId: stopped.companyId } })).toBe(2);
    }));

  it("refuses a STOPPED enrolment with no stop reason (INV-3 traceability)", () =>
    expectRefused("acq_enrollments_stop_reason_check", async (tx) => {
      const enrollment = await createEnrollment(tx);
      await tx.$executeRaw`UPDATE acq_enrollments SET status = 'STOPPED' WHERE id = ${enrollment.id}`;
    }));
});

describe("lead score range (0–100)", () => {
  it("refuses a score of 101", () =>
    expectRefused("acq_leads_score_range", async (tx) => {
      const lead = await createLead(tx);
      await tx.$executeRaw`UPDATE acq_leads SET score = 101 WHERE id = ${lead.id}`;
    }));

  it("refuses a negative score and accepts 0 and 100", async () => {
    await expectRefused("acq_leads_score_range", async (tx) => {
      const lead = await createLead(tx);
      await tx.$executeRaw`UPDATE acq_leads SET score = -1 WHERE id = ${lead.id}`;
    });
    await withRollback(async (tx) => {
      const lead = await createLead(tx);
      await tx.$executeRaw`UPDATE acq_leads SET score = 0 WHERE id = ${lead.id}`;
      await tx.$executeRaw`UPDATE acq_leads SET score = 100 WHERE id = ${lead.id}`;
    });
  });
});

describe("money is never negative (INV-11)", () => {
  it("refuses a negative proposal total", () =>
    expectRefused("acq_proposals_money_nonnegative_check", async (tx) => {
      const proposal = await createProposal(tx);
      await tx.$executeRaw`UPDATE acq_proposals SET "totalMinor" = -1 WHERE id = ${proposal.id}`;
    }));

  it("refuses a negative line-item price and a zero quantity", async () => {
    for (const [column, value] of [
      ["unitPriceMinor", -5],
      ["quantity", 0],
    ] as const) {
      await expectRefused("acq_proposal_line_items_money_check", async (tx) => {
        const proposal = await createProposal(tx);
        await tx.$executeRaw`
          INSERT INTO acq_proposal_line_items (id, "proposalId", description, quantity, "unitPriceMinor", "totalMinor", "updatedAt")
          VALUES (${newId("pli")}, ${proposal.id}, 'Starter site',
                  ${column === "quantity" ? value : 1}, ${column === "unitPriceMinor" ? value : 100}, 100, now())`;
      });
    }
  });

  it("refuses a negative deal value", () =>
    expectRefused("acq_deals_value_nonnegative_check", async (tx) => {
      const lead = await createLeadInStatus(tx, "WON");
      const closer = await createUser(tx);
      await tx.$executeRaw`
        INSERT INTO acq_deals (id, "leadId", "companyId", "serviceLine", market, outcome, "valueMinor", currency, "closedById", "updatedAt")
        VALUES (${newId("deal")}, ${lead.id}, ${lead.companyId}, 'WEB_DEVELOPMENT', 'NIGERIA', 'WON', -100, 'NGN', ${closer.id}, now())`;
    }));

  it("refuses a won deal without a value", () =>
    expectRefused("acq_deals_won_value_check", async (tx) => {
      const lead = await createLeadInStatus(tx, "WON");
      const closer = await createUser(tx);
      await tx.$executeRaw`
        INSERT INTO acq_deals (id, "leadId", "companyId", "serviceLine", market, outcome, "closedById", "updatedAt")
        VALUES (${newId("deal")}, ${lead.id}, ${lead.companyId}, 'WEB_DEVELOPMENT', 'NIGERIA', 'WON', ${closer.id}, now())`;
    }));
});

describe("other database invariants (data-model §6)", () => {
  it("one open lead per company × line × market (#3), while a closed one doesn't count", async () => {
    await expectRefused("acq_leads_one_open", async (tx) => {
      const lead = await createLead(tx);
      await tx.$executeRaw`
        INSERT INTO acq_leads (id, "companyId", "serviceLine", market, status, "updatedAt")
        VALUES (${newId("lead")}, ${lead.companyId}, 'WEB_DEVELOPMENT', 'NIGERIA', 'SCORED', now())`;
    });
    await withRollback(async (tx) => {
      const lost = await createLeadInStatus(tx, "LOST");
      await tx.$executeRaw`
        INSERT INTO acq_leads (id, "companyId", "serviceLine", market, status, "updatedAt")
        VALUES (${newId("lead")}, ${lost.companyId}, 'WEB_DEVELOPMENT', 'NIGERIA', 'NEW', now())`;
    });
  });

  it("a citation points at exactly one finding or signal (#8, INV-5)", () =>
    expectRefused("acq_message_citations_one_source_check", async (tx) => {
      const message = await createMessage(tx);
      await tx.$executeRaw`
        INSERT INTO acq_message_citations (id, "messageId", "updatedAt") VALUES (${newId("cit")}, ${message.id}, now())`;
    }));

  it("a finding has a source URL or an artifact (#9, INV-18)", () =>
    expectRefused("acq_audit_findings_source_check", async (tx) => {
      const lead = await createLeadInStatus(tx, "AUDITED");
      const audit = await tx.audit.create({
        data: {
          leadId: lead.id,
          companyId: lead.companyId,
          agentId: "audit.web",
          serviceLine: "WEB_DEVELOPMENT",
        },
      });
      await tx.$executeRaw`
        INSERT INTO acq_audit_findings (id, "auditId", "leadId", "companyId", "checkId", severity, claim, evidence, "capturedAt", method, "updatedAt")
        VALUES (${newId("fnd")}, ${audit.id}, ${lead.id}, ${lead.companyId}, 'web.ssl', 'HIGH',
                'The site has no SSL certificate.', '{}', now(), 'OBSERVED', now())`;
    }));

  it("a signal has a source URL unless it was entered by hand or imported (#29)", async () => {
    const insertSignal = (tx: Tx, companyId: string, adapterId: string) => tx.$executeRaw`
      INSERT INTO acq_signals (id, "companyId", "serviceLine", "signalType", "evidenceText", "observedAt", "adapterId", "updatedAt")
      VALUES (${newId("sig")}, ${companyId}, 'WEB_DEVELOPMENT', 'manual_lead', 'Added by hand.', now(), ${adapterId}, now())`;
    await expectRefused("acq_signals_source_check", async (tx) => {
      const lead = await createLead(tx);
      await insertSignal(tx, lead.companyId, "google-places");
    });
    await withRollback(async (tx) => {
      const lead = await createLead(tx);
      await insertSignal(tx, lead.companyId, "manual");
      await insertSignal(tx, lead.companyId, "csv-import");
    });
  });

  it("country codes are ISO 3166-1 alpha-2 in upper case (#15)", () =>
    expectRefused("companies_country_iso2_check", async (tx) => {
      const lead = await createLead(tx);
      await tx.$executeRaw`UPDATE companies SET country = 'ng' WHERE id = ${lead.companyId}`;
    }));

  it("a USER setting has a user and a PLATFORM setting doesn't (#17)", () =>
    expectRefused("settings_user_scope_check", async (tx) => {
      await tx.$executeRaw`
        INSERT INTO settings (id, key, scope, value, "updatedAt")
        VALUES (${newId("set")}, 'user.theme', 'USER', '"dark"', now())`;
    }));

  it("a meeting ends after it starts (#26)", () =>
    expectRefused("acq_meetings_time_order_check", async (tx) => {
      await tx.$executeRaw`
        INSERT INTO acq_meetings (id, source, status, "startsAt", "endsAt", timezone, "updatedAt")
        VALUES (${newId("mtg")}, 'MANUAL', 'UNMATCHED', now(), now(), 'Africa/Lagos', now())`;
    }));
});
