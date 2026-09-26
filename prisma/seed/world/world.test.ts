import { describe, expect, it } from "vitest";

import { ReplyClassSchema, type LeadStatus, type ServiceLine } from "@/contracts/common";
import { canTransition, isOpenLeadStatus, NURTURE_REASONS_FROM } from "@/modules/acquisition/core";

import { SEED_USERS } from "../data/users";

import { userId } from "./base";
import { buildWorld } from "./index";

const NOW = new Date("2026-10-03T09:00:00.000Z");
const world = buildWorld(NOW);

function countBy<T>(items: readonly T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return counts;
}

function expectUnique(values: readonly unknown[], what: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    const text = JSON.stringify(value);
    expect(seen.has(text), `${what}: duplicate ${text}`).toBe(false);
    seen.add(text);
  }
}

describe("seed world: companies (§10.4)", () => {
  const companies = world.directory.companies;

  it("has 34 Nigerian companies across the five cities and 30 international ones", () => {
    expect(companies).toHaveLength(64);
    expect(countBy(companies, (company) => company.market)).toEqual({
      NIGERIA: 34,
      INTERNATIONAL: 30,
    });
    const nigeria = companies.filter((company) => company.market === "NIGERIA");
    expect(countBy(nigeria, (company) => company.city ?? "")).toEqual({
      Lagos: 14,
      Abuja: 7,
      "Port Harcourt": 5,
      Warri: 4,
      "Benin City": 4,
    });
    const international = companies.filter((company) => company.market === "INTERNATIONAL");
    expect(countBy(international, (company) => company.country ?? "")).toEqual({
      GB: 14,
      US: 9,
      IE: 4,
      CA: 3,
    });
  });

  it("matches the legal-form mix, including three UK sole traders", () => {
    const nigeria = companies.filter((company) => company.market === "NIGERIA");
    expect(countBy(nigeria, (company) => company.legalForm ?? "")).toEqual({
      NG_REGISTERED_COMPANY: 20,
      NG_BUSINESS_NAME: 10,
      UNKNOWN: 4,
    });
    const uk = companies.filter((company) => company.country === "GB");
    expect(countBy(uk, (company) => company.legalForm ?? "")).toEqual({
      LIMITED: 7,
      LLP: 1,
      PLC: 1,
      SOLE_TRADER: 3,
      PARTNERSHIP: 1,
      UNKNOWN: 1,
    });
  });

  it("has six Nigerian and two international companies with no website, one active client", () => {
    const noSite = companies.filter((company) => company.websiteKind !== "OWN_SITE");
    expect(countBy(noSite, (company) => company.market)).toEqual({ NIGERIA: 6, INTERNATIONAL: 2 });
    expect(companies.filter((company) => company.isActiveClient === true)).toHaveLength(1);
    expect(
      companies.some(
        (company) => company.name.startsWith("Place ") && company.firstSource === "google-places",
      ),
    ).toBe(true);
  });

  it("uses only reserved example domains and one to three contacts per reachable company", () => {
    for (const company of companies) {
      if (company.normalizedDomain != null) expect(company.normalizedDomain).toMatch(/\.example$/);
    }
    for (const contact of world.directory.contacts) {
      if (contact.email != null) expect(contact.email).toMatch(/@([a-z0-9-]+\.)*example(\.com)?$/);
    }
    const perCompany = countBy(world.directory.contacts, (contact) => contact.companyId);
    for (const count of Object.values(perCompany)) expect(count).toBeLessThanOrEqual(3);
    expectUnique(
      world.directory.contacts
        .filter((contact) => contact.email != null)
        .map((contact) => [contact.companyId, contact.email]),
      "contact email per company",
    );
  });
});

describe("seed world: leads (§10.5)", () => {
  const leads = world.leadInfos;

  it("has 76 leads: 20 web, 18 UI/UX, 19 graphic, 19 video, half in each market", () => {
    expect(leads).toHaveLength(76);
    expect(countBy(leads, (lead) => lead.spec.line)).toEqual({
      WEB_DEVELOPMENT: 20,
      UI_UX_DESIGN: 18,
      GRAPHIC_DESIGN: 19,
      VIDEO_EDITING: 19,
    });
    expect(countBy(leads, (lead) => lead.market)).toEqual({ NIGERIA: 38, INTERNATIONAL: 38 });
  });

  it("covers every status in every line", () => {
    const statuses: LeadStatus[] = [
      "NEW",
      "ENRICHING",
      "ENRICHED",
      "AUDITING",
      "AUDITED",
      "SCORED",
      "IN_REVIEW",
      "APPROVED",
      "CONTACTED",
      "REPLIED",
      "MEETING_BOOKED",
      "PROPOSAL_SENT",
      "WON",
      "LOST",
      "NURTURE",
      "DISQUALIFIED",
      "SUPPRESSED",
    ];
    const lines: ServiceLine[] = [
      "WEB_DEVELOPMENT",
      "UI_UX_DESIGN",
      "GRAPHIC_DESIGN",
      "VIDEO_EDITING",
    ];
    for (const line of lines) {
      for (const status of statuses) {
        expect(
          leads.some((lead) => lead.spec.line === line && lead.status === status),
          `${line} ${status}`,
        ).toBe(true);
      }
    }
  });

  it("gives every lead a trail from NEW that the lifecycle allows, with an event per step", () => {
    for (const lead of leads) {
      expect(lead.spec.trail[0]).toBe("NEW");
      lead.spec.trail.forEach((to, index) => {
        const from = lead.spec.trail[index - 1];
        if (from !== undefined)
          expect(
            canTransition(from, to, { nurtureReason: lead.spec.nurtureReason ?? null }),
            `lead ${String(lead.n)}: ${from} → ${to}`,
          ).toBe(true);
      });
      const events = world.leads.leadEvents.filter(
        (event) => event.leadId === lead.id && event.kind === "STATUS_CHANGE",
      );
      expect(events.map((event) => event.toStatus)).toEqual([...lead.spec.trail]);
    }
  });

  it("keeps one open lead per company, line and market, and one cross-sell company", () => {
    expectUnique(
      world.leads.leads
        .filter((lead) => isOpenLeadStatus(lead.status ?? "NEW"))
        .map((lead) => [lead.companyId, lead.serviceLine, lead.market]),
      "open lead",
    );
    const qualifiedOpen = world.leads.leads.filter(
      (lead) =>
        isOpenLeadStatus(lead.status ?? "NEW") &&
        lead.score != null &&
        lead.score >= 61 &&
        !["NEW", "ENRICHING", "ENRICHED", "AUDITING", "AUDITED"].includes(lead.status ?? "NEW"),
    );
    const companiesWithTwo = Object.entries(
      countBy(qualifiedOpen, (lead) => lead.companyId),
    ).filter(([, count]) => count > 1);
    expect(companiesWithTwo).toEqual([[world.leads.crossSellGroups[0]?.companyId, 2]]);
    expect(Object.keys(countBy(world.leadInfos, (lead) => String(lead.company.n)))).toHaveLength(
      64,
    );
  });

  it("scores once scoring ran (SCORED, or a hold straight from AUDITED), with scores in range", () => {
    for (const lead of world.leads.leads) {
      const info = leads.find((candidate) => candidate.id === lead.id);
      const trail = info?.spec.trail ?? [];
      const audited = trail.indexOf("AUDITED");
      const scored =
        trail.includes("SCORED") || (audited !== -1 && trail[audited + 1] === "NURTURE");
      expect(lead.score != null, `lead ${lead.id} score`).toBe(scored);
      if (lead.score != null) expect(lead.score).toBeGreaterThanOrEqual(0);
      if (lead.score != null) expect(lead.score).toBeLessThanOrEqual(100);
    }
  });
});

describe("seed world: compliance rules", () => {
  const leads = world.leadInfos;

  it("parks leads in NURTURE only for a reason their status allows (§5.2)", () => {
    for (const lead of leads) {
      lead.spec.trail.forEach((to, index) => {
        const from = lead.spec.trail[index - 1];
        if (to !== "NURTURE" || from === undefined) return;
        const reason = lead.spec.nurtureReason ?? "MANUAL";
        expect(
          NURTURE_REASONS_FROM[from] ?? [],
          `lead ${String(lead.n)}: ${from} → NURTURE`,
        ).toContain(reason);
      });
    }
  });

  it("sends no cold email to Nigerian leads while the legal basis is pending, and flags them (INV-25)", () => {
    const nigerian = new Set(
      leads.filter((lead) => lead.market === "NIGERIA").map((lead) => lead.id),
    );
    const coldEmails = world.outreach.messages.filter(
      (message) =>
        message.kind === "SEQUENCE" && message.channel === "EMAIL" && message.status === "SENT",
    );
    expect(coldEmails.some((message) => nigerian.has(message.leadId))).toBe(false);
    for (const lead of world.leads.leads) {
      if (lead.market === "NIGERIA" && lead.contactability !== undefined)
        expect(lead.complianceReview, lead.id).toBe(true);
    }
  });

  it("emails a UK sole trader or partnership only after consent is recorded (INV-6)", () => {
    const individual = new Set(
      leads
        .filter(
          (lead) =>
            lead.country === "GB" &&
            ["SOLE_TRADER", "PARTNERSHIP"].includes(lead.company.legalForm),
        )
        .map((lead) => lead.id),
    );
    for (const message of world.outreach.messages) {
      if (message.kind !== "SEQUENCE" || message.channel !== "EMAIL" || message.status !== "SENT")
        continue;
      if (!individual.has(message.leadId)) continue;
      const consent = world.compliance.consentRecords.find(
        (record) => record.contactId === message.contactId,
      );
      expect(consent, `message ${message.id}`).toBeDefined();
      expect(new Date(consent?.recordedAt ?? 0).getTime()).toBeLessThan(
        new Date(message.sentAt ?? 0).getTime(),
      );
    }
  });

  it("records approvals only by people who may approve", () => {
    const approvers = new Set(
      SEED_USERS.filter((user) => user.canApprove).map((user) => userId(user.key)),
    );
    for (const message of world.outreach.messages) {
      if (message.approvedById != null)
        expect(approvers.has(message.approvedById), message.id).toBe(true);
    }
    for (const event of world.leads.leadEvents) {
      if (event.toStatus === "APPROVED" && event.actorId != null)
        expect(approvers.has(event.actorId), event.id).toBe(true);
    }
  });

  it("keeps only a hash of a fulfilled deletion's subject", () => {
    const completed = world.compliance.dataSubjectRequests.filter(
      (request) => request.type === "DELETE" && request.status === "COMPLETED",
    );
    for (const request of completed) expect(request.hashSubjectEmailOf).toBeDefined();
  });
});

describe("seed world: search, audits and findings (§10.6)", () => {
  it("has 8 saved searches, 12 runs and a signal for every lead", () => {
    expect(world.search.savedSearches).toHaveLength(8);
    expect(world.search.searchRuns).toHaveLength(12);
    const statuses = new Set(world.search.searchRuns.map((run) => run.status));
    for (const status of ["SUCCEEDED", "PARTIAL", "SKIPPED"])
      expect(statuses.has(status as never)).toBe(true);
    const triggers = new Set(world.search.searchRuns.map((run) => run.trigger));
    expect(triggers).toEqual(new Set(["SCHEDULED", "MANUAL", "CSV_IMPORT", "MANUAL_ADD"]));
    const csv = world.search.searchRuns.find((run) => run.trigger === "CSV_IMPORT");
    expect(csv?.attestation).toBeTruthy();
    expect(csv?.csvFileId).toBeTruthy();
    for (const lead of world.leadInfos)
      expect(
        world.search.signals.some((signal) => signal.leadId === lead.id),
        `lead ${String(lead.n)} signal`,
      ).toBe(true);
    for (const signal of world.search.signals) {
      expect(
        signal.sourceUrl != null ||
          signal.adapterId === "manual" ||
          signal.adapterId === "csv-import",
      ).toBe(true);
    }
    expect(
      world.search.signals.filter((signal) => signal.crossLineHint !== undefined),
    ).toHaveLength(1);
    expectUnique(
      world.search.signals
        .filter((signal) => signal.externalRef != null)
        .map((signal) => [
          signal.companyId,
          signal.serviceLine,
          signal.signalType,
          signal.adapterId,
          signal.externalRef,
        ]),
      "signal external ref",
    );
  });

  it("has about 120 findings, each with a source or an artifact, and one dismissed", () => {
    const findings = world.audits.findings;
    expect(findings.length).toBeGreaterThanOrEqual(100);
    expect(findings.length).toBeLessThanOrEqual(140);
    for (const finding of findings)
      expect(finding.sourceUrl != null || finding.artifactKey != null).toBe(true);
    expect(findings.filter((finding) => finding.dismissedAt != null)).toHaveLength(1);
    const statuses = new Set(world.audits.checkRuns.map((run) => run.status));
    for (const status of ["OK", "NOT_APPLICABLE", "NOT_ASSESSED", "CHECK_FAILED"])
      expect(statuses.has(status as never)).toBe(true);
    for (const finding of findings) {
      if (finding.artifactKey != null)
        expect(world.audits.files.some((file) => file.row.key === finding.artifactKey)).toBe(true);
    }
  });
});

describe("seed world: outreach, replies and inbox (§10.7)", () => {
  it("has two sending domains and four mailboxes in every state", () => {
    expect(world.outreach.sendingDomains.map((domain) => domain.dmarcStatus)).toEqual([
      "PASS",
      "FAIL",
    ]);
    expect(world.outreach.mailboxes.map((box) => box.status)).toEqual([
      "ACTIVE",
      "WARMING",
      "WARMING",
      "PAUSED",
    ]);
    expectUnique(
      world.outreach.mailboxDailyStats.map((stat) => [stat.mailboxId, stat.day]),
      "mailbox day",
    );
  });

  it("keeps at most one ACTIVE or PAUSED enrolment per company (INV-9) and a reason for every stop", () => {
    const open = world.outreach.enrollments.filter(
      (enrollment) => enrollment.status === "ACTIVE" || enrollment.status === "PAUSED",
    );
    expectUnique(
      open.map((enrollment) => enrollment.companyId),
      "open enrolment per company",
    );
    expect(open.filter((enrollment) => enrollment.status === "PAUSED")).toHaveLength(1);
    const stopped = world.outreach.enrollments.filter(
      (enrollment) => enrollment.status === "STOPPED",
    );
    for (const enrollment of stopped) expect(enrollment.stoppedReason).toBeTruthy();
    expect(new Set(stopped.map((enrollment) => enrollment.stoppedReason))).toEqual(
      new Set(["REPLY", "UNSUBSCRIBE", "BOUNCE", "MEETING_BOOKED", "WON", "LOST", "SUPPRESSED"]),
    );
    expect(world.outreach.enrollments.some((enrollment) => enrollment.status === "COMPLETED")).toBe(
      true,
    );
  });

  it("cites a finding or a signal in every message, never a dismissed finding", () => {
    const messages = [
      ...world.outreach.messages,
      ...world.inbox.answers,
      ...world.pipeline.proposalMessages,
    ];
    const citations = [
      ...world.outreach.citations,
      ...world.inbox.answerCitations,
      ...world.pipeline.proposalCitations,
    ];
    const dismissed = new Set(
      world.audits.findings
        .filter((finding) => finding.dismissedAt != null)
        .map((finding) => finding.id),
    );
    const findingLead = new Map(
      world.audits.findings.map((finding) => [finding.id, finding.leadId]),
    );
    const signalLead = new Map(world.search.signals.map((signal) => [signal.id, signal.leadId]));
    for (const message of messages) {
      const own = citations.filter((citation) => citation.messageId === message.id);
      expect(own.length, `message ${message.id} citations`).toBeGreaterThan(0);
      for (const citation of own) {
        expect((citation.findingId == null) !== (citation.signalId == null)).toBe(true);
        if (citation.findingId != null) {
          expect(dismissed.has(citation.findingId)).toBe(false);
          expect(findingLead.get(citation.findingId)).toBe(message.leadId);
        }
        if (citation.signalId != null)
          expect(signalLead.get(citation.signalId)).toBe(message.leadId);
      }
    }
    expectUnique(
      messages
        .filter((message) => message.providerMessageId != null)
        .map((message) => message.providerMessageId),
      "providerMessageId",
    );
    expectUnique(
      messages
        .filter((message) => message.unsubscribeTokenId != null)
        .map((message) => message.unsubscribeTokenId),
      "unsubscribe token",
    );
    const statuses = new Set(messages.map((message) => message.status));
    for (const status of [
      "DRAFT",
      "NEEDS_EDIT",
      "REJECTED",
      "SCHEDULED",
      "PREPARED",
      "SENT",
      "SENT_ASSISTED",
      "BLOCKED",
    ])
      expect(statuses.has(status as never), status).toBe(true);
    for (const message of messages.filter(
      (row) => row.status === "SENT" && row.channel === "EMAIL",
    )) {
      expect(message.footerSnapshot).toContain(
        "[DEV PLACEHOLDER] FUTUREUNI, 1 Example Street, Lagos, Nigeria",
      );
    }
  });

  it("has 16 replies covering every class, with an unmatched email, a pasted WhatsApp reply and a correction", () => {
    const replies = world.inbox.replies;
    expect(replies).toHaveLength(16);
    const classes = countBy(
      replies.filter((reply) => reply.classification != null),
      (reply) => reply.classification ?? "",
    );
    for (const replyClass of ReplyClassSchema.options)
      expect(classes[replyClass], replyClass).toBeGreaterThan(0);
    expect(classes.INTERESTED).toBe(3);
    expect(replies.filter((reply) => reply.matchMethod === "UNMATCHED")).toHaveLength(1);
    expect(
      replies.filter((reply) => reply.channel === "WHATSAPP" && reply.loggedById != null),
    ).toHaveLength(1);
    expect(new Set(replies.map((reply) => reply.slaStatus))).toEqual(
      new Set(["NONE", "ON_TRACK", "WARNING", "BREACHED", "MET"]),
    );
    expect(world.inbox.replyCorrections).toHaveLength(1);
    expectUnique(
      replies
        .filter((reply) => reply.mailboxId != null && reply.providerMessageId != null)
        .map((reply) => [reply.mailboxId, reply.providerMessageId]),
      "reply per mailbox",
    );
  });

  it("has five suppressions (one hashed), one consent record and two data-subject requests", () => {
    expect(world.compliance.suppressions.map((row) => [row.type, row.reason])).toEqual([
      ["EMAIL", "UNSUBSCRIBE"],
      ["PHONE", "MANUAL"],
      ["DOMAIN", "MANUAL"],
      ["EMAIL", "BOUNCE"],
      ["EMAIL", "DSR_DELETE"],
    ]);
    expect(
      world.compliance.suppressions.filter(
        (row) => row.isHashed === true && row.hashValueOf !== undefined,
      ),
    ).toHaveLength(1);
    expect(world.compliance.consentRecords).toHaveLength(1);
    expect(
      world.compliance.dataSubjectRequests.map((request) => [request.type, request.status]),
    ).toEqual([
      ["EXPORT", "OPEN"],
      ["DELETE", "COMPLETED"],
    ]);
  });
});

describe("seed world: pipeline (§10.8) and team load (§10.2)", () => {
  it("has meetings in every state and proposals with consistent money", () => {
    expect(new Set(world.pipeline.meetings.map((meeting) => meeting.status))).toEqual(
      new Set(["SCHEDULED", "HELD", "NO_SHOW", "CANCELLED", "UNMATCHED"]),
    );
    for (const meeting of world.pipeline.meetings)
      expect(new Date(meeting.endsAt).getTime()).toBeGreaterThan(
        new Date(meeting.startsAt).getTime(),
      );
    expectUnique(
      world.pipeline.meetings
        .filter((meeting) => meeting.externalId != null)
        .map((meeting) => [meeting.source, meeting.externalId]),
      "meeting external id",
    );
    const proposals = world.pipeline.proposals;
    expect(proposals).toHaveLength(12);
    expect(countBy(proposals, (proposal) => proposal.status ?? "")).toEqual({
      SUPERSEDED: 1,
      SENT: 3,
      EXPIRED: 1,
      DRAFT: 1,
      PENDING_APPROVAL: 1,
      ACCEPTED: 3,
      DECLINED: 2,
    });
    for (const proposal of proposals) {
      const items = world.pipeline.proposalLineItems.filter(
        (item) => item.proposalId === proposal.id,
      );
      const subtotal = items.reduce((sum, item) => sum + item.totalMinor, 0);
      expect(proposal.subtotalMinor).toBe(subtotal);
      expect(proposal.totalMinor).toBe(
        proposal.subtotalMinor - (proposal.discountMinor ?? 0) + (proposal.taxMinor ?? 0),
      );
    }
  });

  it("closes 4 won deals with the §10.8 values and 4 lost ones with reasons", () => {
    const won = world.pipeline.deals.filter((deal) => deal.outcome === "WON");
    expect(won.map((deal) => [deal.valueMinor, deal.currency])).toEqual([
      [185_000_000, "NGN"],
      [680_000, "USD"],
      [210_000, "GBP"],
      [65_000_000, "NGN"],
    ]);
    const lost = world.pipeline.deals.filter((deal) => deal.outcome === "LOST");
    expect(lost.map((deal) => deal.lostReason)).toEqual([
      "PRICE",
      "CHOSE_COMPETITOR",
      "NO_RESPONSE",
      "TIMING",
    ]);
    expect(lost.find((deal) => deal.lostReason === "TIMING")?.reengageAt).toBeTruthy();
  });

  it("produces exactly the §10.2 team loads from the active handoff assignments", () => {
    const loads = countBy(
      world.pipeline.handoffAssignments.filter((assignment) => assignment.active !== false),
      (assignment) => assignment.assignedUserId ?? "",
    );
    for (const user of SEED_USERS)
      expect(loads[userId(user.key)] ?? 0, user.name).toBe(user.expectedLoad);
    expect(world.pipeline.handoffs.map((handoff) => handoff.status)).toEqual([
      "ACKNOWLEDGED",
      "ACKNOWLEDGED",
      "NEW",
      "NEW",
    ]);
  });
});

describe("seed world: platform rows (§10.9)", () => {
  it("has the listed settings, including the clearly marked dev postal address", () => {
    const settings = Object.fromEntries(world.platform.settings.map((row) => [row.key, row.value]));
    expect(settings).toEqual({
      "platform.timezone": "Africa/Lagos",
      "platform.companyName": "FUTUREUNI",
      "module.acquisition.enabled": true,
      "acquisition.unsubscribeScope": "COMPANY",
      "acquisition.defaultBookingUrl": "https://cal.example/futureuni",
      "platform.postalAddress": "[DEV PLACEHOLDER] FUTUREUNI, 1 Example Street, Lagos, Nigeria",
    });
  });

  it("has about 40 AI calls, 20 job runs, 25 notifications, 30 audit entries and 14 days of usage", () => {
    expect(world.platform.aiCalls).toHaveLength(40);
    expect(new Set(world.platform.aiCalls.map((row) => row.outcome))).toEqual(
      new Set(["OK", "REPAIRED", "INVALID", "TIMEOUT", "QUOTA_BLOCKED"]),
    );
    expect(world.platform.jobRuns).toHaveLength(20);
    expect(new Set(world.platform.jobRuns.map((row) => row.status))).toEqual(
      new Set(["SUCCEEDED", "FAILED", "RUNNING", "CANCELLED"]),
    );
    expect(world.platform.jobRuns.some((row) => row.parentRunId != null)).toBe(true);
    expect(world.platform.notifications).toHaveLength(25);
    expect(world.platform.auditLogs).toHaveLength(30);
    expect(world.platform.providerUsages).toHaveLength(70);
    expectUnique(
      world.platform.providerUsages.map((row) => [row.provider, row.day]),
      "provider day",
    );
    expectUnique(
      world.platform.notifications.map((row) => [row.userId, row.dedupeKey]),
      "notification dedupe",
    );
  });
});

describe("seed world: ids", () => {
  it("uses deterministic, unique 25-character ids that don't depend on the run time", () => {
    const again = buildWorld(new Date("2026-11-20T15:30:00.000Z"));
    const ids = (w: typeof world) =>
      Object.values(w)
        .filter(
          (part): part is Record<string, unknown> =>
            typeof part === "object" &&
            part !== null &&
            !(part instanceof Date) &&
            !Array.isArray(part),
        )
        .flatMap((part) => Object.values(part))
        .filter((rows): rows is { id?: unknown; row?: { id?: unknown } }[] => Array.isArray(rows))
        .flatMap((rows) => rows.map((row) => (typeof row.id === "string" ? row.id : row.row?.id)))
        .filter((id): id is string => typeof id === "string");
    const first = ids(world);
    expect(first.length).toBeGreaterThan(1_000);
    for (const id of first) expect(id).toMatch(/^cseed[a-z]{4}[0-9]+$/);
    for (const id of first) expect(id).toHaveLength(25);
    expect(ids(again)).toEqual(first);
  });
});
