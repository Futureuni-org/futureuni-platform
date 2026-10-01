import "server-only";

/**
 * Sending-domain DNS checks (step 4.2): SPF, DKIM (selector from the domain or settings), DMARC and
 * MX, reporting pass/fail with the fix needed. Real lookups use node:dns; with MOCKS the resolver
 * returns deterministic results (a domain containing `no-spf`/`no-dkim`/`no-dmarc`/`no-mx` fails
 * that record) so tests never hit the network.
 */

import { promises as dns } from "node:dns";

import type { Actor, DnsCheckStatus } from "@/contracts/common";
import { env } from "@/env";
import { AppError } from "@/lib/errors";
import { assertActorCan } from "@/platform/auth";

import { getOutreachSetting } from "../settings";
import { findSendingDomainByName, updateSendingDomain } from "./mailbox.repo";

export interface DnsRecordResult {
  status: DnsCheckStatus;
  detail: string;
  fix: string | null;
}

export interface DnsCheckResult {
  domain: string;
  spf: DnsRecordResult;
  dkim: DnsRecordResult;
  dmarc: DnsRecordResult;
  mx: DnsRecordResult;
}

async function resolveTxt(name: string): Promise<string[]> {
  if (env.MOCKS) {
    const lower = name.toLowerCase();
    if (lower.includes("no-spf") && name.endsWith("")) return [];
    if (name.startsWith("_dmarc.")) return lower.includes("no-dmarc") ? [] : ["v=DMARC1; p=quarantine; rua=mailto:dmarc@futureuni.dev"];
    if (name.includes("._domainkey.")) return lower.includes("no-dkim") ? [] : ["v=DKIM1; k=rsa; p=MIGfMA0mock"];
    return lower.includes("no-spf") ? [] : ["v=spf1 include:_spf.google.com ~all"];
  }
  try {
    const records = await dns.resolveTxt(name);
    return records.map((chunks) => chunks.join(""));
  } catch {
    return [];
  }
}

async function resolveMx(name: string): Promise<string[]> {
  if (env.MOCKS) {
    return name.toLowerCase().includes("no-mx") ? [] : ["aspmx.l.google.com"];
  }
  try {
    const records = await dns.resolveMx(name);
    return records.map((r) => r.exchange);
  } catch {
    return [];
  }
}

function pass(detail: string): DnsRecordResult {
  return { status: "PASS", detail, fix: null };
}
function fail(detail: string, fix: string): DnsRecordResult {
  return { status: "FAIL", detail, fix };
}

/** Checks a sending domain's DNS and records the result on the SendingDomain row when one exists. */
export async function checkDomainDns(actor: Actor, domain: string): Promise<DnsCheckResult> {
  await assertActorCan(actor, "acquisition.domain.checkDns");
  const clean = domain.trim().toLowerCase();
  if (clean === "" || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(clean)) {
    throw new AppError("VALIDATION_FAILED", "Enter a valid domain.");
  }

  const existing = await findSendingDomainByName(null, clean);
  const selector = existing?.dkimSelector ?? (await getOutreachSetting("dkimSelector"));

  const [rootTxt, dkimTxt, dmarcTxt, mx] = await Promise.all([
    resolveTxt(clean),
    resolveTxt(`${selector}._domainkey.${clean}`),
    resolveTxt(`_dmarc.${clean}`),
    resolveMx(clean),
  ]);

  const spfRecord = rootTxt.find((t) => t.toLowerCase().startsWith("v=spf1"));
  const dkimRecord = dkimTxt.find((t) => /v=DKIM1|(^|;)\s*p=/i.test(t));
  const dmarcRecord = dmarcTxt.find((t) => t.toLowerCase().startsWith("v=dmarc1"));

  const result: DnsCheckResult = {
    domain: clean,
    spf: spfRecord !== undefined
      ? pass(spfRecord)
      : fail("No SPF record found.", `Add a TXT record at ${clean}: "v=spf1 include:_spf.google.com ~all"`),
    dkim: dkimRecord !== undefined
      ? pass(dkimRecord.slice(0, 80))
      : fail(`No DKIM record for selector "${selector}".`, `Add the Google DKIM TXT record at ${selector}._domainkey.${clean}`),
    dmarc: dmarcRecord !== undefined
      ? pass(dmarcRecord)
      : fail("No DMARC record found.", `Add a TXT record at _dmarc.${clean}: "v=DMARC1; p=quarantine; rua=mailto:dmarc@${clean}"`),
    mx: mx.length > 0
      ? pass(mx.join(", "))
      : fail("No MX records found.", "Point MX records at Google Workspace (aspmx.l.google.com)."),
  };

  if (existing !== null) {
    await updateSendingDomain(null, existing.id, {
      spfStatus: result.spf.status,
      dkimStatus: result.dkim.status,
      dmarcStatus: result.dmarc.status,
      mxStatus: result.mx.status,
      dnsDetails: {
        spf: result.spf.detail,
        dkim: result.dkim.detail,
        dmarc: result.dmarc.detail,
        mx: result.mx.detail,
        fixes: [result.spf.fix, result.dkim.fix, result.dmarc.fix, result.mx.fix].filter((f): f is string => f !== null),
      },
      lastCheckedAt: new Date(),
    });
  }

  return result;
}
