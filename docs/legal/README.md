# Legal review pack: Client Acquisition outreach

**Prepared for review by a qualified lawyer. This is not legal advice.**

Prepared 2026-09-26 · Owner: Prince Amadin, FUTUREUNI · Status: awaiting counsel

## What this folder is

FUTUREUNI's platform finds businesses, researches their public web and social presence, and contacts them:
- by cold B2B email, sent automatically only after a human approves it (by default);
- by WhatsApp, LinkedIn or phone messages that the platform prepares and a person sends by hand.

This folder is the pack for the lawyers who must review that before launch. The platform's launch gate requires it (ADR-034 in `docs/decisions.md`; module spec OQ-9 and OQ-10).

**Not legal advice.** The build team wrote these documents from primary sources, to save counsel time. They are not legal advice and must not be relied on as advice. Every legal statement cites a URL. Where we could not confirm a point from a primary source, the text says **verify with counsel**. Counsel's written answers, not these documents, decide what the platform does.

| File | For | What it contains |
|---|---|---|
| `nigeria-counsel-brief.md` | Nigerian counsel | Who FUTUREUNI is, the processing, recipients, channels, safeguards, relevant NDPA and GAID provisions, 14 questions, what we need back, and how answers map to settings |
| `lia-b2b-outreach-draft.md` | Nigerian counsel and the DPO | A draft Legitimate Interest Assessment in the structure of GAID Schedule 8, pre-filled with platform facts, with marked blanks |
| `country-rules-review.md` | Counsel in each market (or one firm coordinating) | One row per country × legal form: the platform's current default, the law, a summary, a suggested default, unsubscribe and address rules, and blank sign-off columns |

## How to use this pack with counsel

1. **Nigeria first.** Send `nigeria-counsel-brief.md` and `lia-b2b-outreach-draft.md` to Nigerian counsel. The answer to question (e) (does Nigerian law govern FUTUREUNI's outreach abroad?) can change every other country's row, so ask for it early.
2. **Countries next.** Send `country-rules-review.md` to counsel for the target markets, starting with GB, IE, US and CA (the first international targets, module spec §3.4). Ask them to fill in the "Counsel decision" and "Signed off by / date" columns.
3. **Record the answers.** Keep each signed opinion, LIA and completed sheet in this folder, with the date. Do not overwrite the drafts; add the signed versions next to them.
4. **Change the platform only from signed answers.** An `ADMIN` changes settings; every change is audited (INV-20). Country rules are typed data in `src/modules/acquisition/compliance/country-rules.ts` (Phase 9). Each rule carries a `sourceUrl`, `notes` and `reviewedAt` (`docs/contracts/enrichment.md`, `CountryRuleSchema`). Set `reviewedAt` to the date of counsel's sign-off.
5. **Re-review** at least yearly, and whenever a law changes or the platform adds a channel, source or country.

## What the platform needs back

### 1. Nigeria: `acquisition.compliance.ngDirectMarketingBasis`

| Value | When to use it | What the platform does |
|---|---|---|
| `PENDING_LEGAL_REVIEW` (default) | Counsel has not answered | Nigerian email is `REVIEW` for every legal form, so none is sent. Every Nigerian lead is flagged `complianceReview`, and every first touch on any channel shows a compliance notice. The launch gate blocks all Nigerian outreach |
| `LEGITIMATE_INTEREST_CONFIRMED` | Counsel confirms in writing that legitimate interest (NDPA s.25(1)(b)(v)) can support B2B first contact, and a signed Schedule 8 LIA exists (GAID Art. 26) | Email to incorporated bodies (`NG_REGISTERED_COMPANY`, and anything else in the incorporated bucket) becomes `ALLOWED`. Business Names, partnerships and unknown forms stay `REVIEW` |
| `CONSENT_ONLY` | Counsel says GAID Art. 18(1)(a) requires consent for this direct marketing | Email becomes `CONSENT_REQUIRED` for every legal form. It is `ALLOWED` only for a contact with a stored `ConsentRecord` |

Source of these rules: ADR-034; `docs/contracts/enrichment.md` rule 15; INV-25 and the `complianceReview` definition in `.claude/project-rules.md`.

**Known limit.** None of the three values blocks the *assisted* channels (WhatsApp, LinkedIn, phone). INV-25 lets them go ahead with a compliance notice shown to the reviewer. If counsel says consent is needed on every channel, the platform needs a change. Until then, remove the assisted steps from the Nigerian sequences (the Nigerian sequence *starts* with WhatsApp).

### 2. Every country: the country rules table

For each country, counsel picks one value per legal-form bucket.

| Value | Meaning in the platform |
|---|---|
| `ALLOWED` | Cold B2B email may be sent (after review, with one-click unsubscribe and the postal address, INV-4) |
| `CONSENT_REQUIRED` | Email is held until a `ConsentRecord` exists for the contact. The lead waits in `NURTURE` (reason `COMPLIANCE`) if no assisted channel exists |
| `REVIEW` | Email is held until a fact is resolved, or counsel decides. Same holding behaviour as above |
| `PROHIBITED` | Email is `BLOCKED` (rule ID `<CC>.prohibited`). With no assisted channel, the lead is disqualified with reason `compliance:<ruleId>` |

The four legal-form buckets (`LEGAL_FORM_BUCKET` in `docs/contracts/enrichment.md`):

| Bucket | Legal forms in it |
|---|---|
| `incorporated` | `LIMITED`, `PLC`, `LLP`, `NG_REGISTERED_COMPANY`, `CORPORATION`, `LLC`, `NON_PROFIT`, `PUBLIC_BODY` |
| `soleTrader` | `SOLE_TRADER`, `NG_BUSINESS_NAME` |
| `partnership` | `PARTNERSHIP` |
| `unknownForm` | `UNKNOWN`, `OTHER` |

Each rule also records whether an unsubscribe link and a postal address are required (`unsubscribeRequired`, `postalAddressRequired`). The platform includes both in every email regardless (INV-4).

**Known limit.** The table decides **email only**. WhatsApp and LinkedIn are `ASSISTED_ALLOWED` and phone is `CALL_TASK_ALLOWED` in every country, unless suppressed (`docs/contracts/enrichment.md` rule 16). See the channel note in `country-rules-review.md`.

### 3. Other answers

Other answers (registration, DPO, DPIA, transfers, breach procedure, retention, privacy notice) map to launch-gate tasks and to settings such as `platform.retention.personalDataMonths`. See `nigeria-counsel-brief.md` §8 and §9.

## Where our research suggests the current defaults may be too permissive

These are research findings for counsel to confirm, not conclusions. The details and sources are in the linked files.

1. **Netherlands (`incorporated` = `ALLOWED`).** The current Telecommunicatiewet art. 11.7(1) requires prior consent from every "eindgebruiker" (end-user), companies included. The only exception is for addresses a business has published *for receiving* such messages. Suggested: `CONSENT_REQUIRED` (`country-rules-review.md` §NL).
2. **Canada (`incorporated` = `ALLOWED`).**
   - CASL requires consent. Implied consent needs a "conspicuously published" address, no "no unsolicited messages" statement, and relevance to the recipient's role (s.10(9)(b)). The sender must prove it (s.13).
   - The platform does not check this, and finder-generated addresses fail it.
   - Suggested: `REVIEW` (§CA).
3. **Assisted WhatsApp and LinkedIn messages ignore the country rules.**
   - The UK regulator says the electronic-mail marketing rules also apply to "direct messages via social media or any similar message that is stored electronically" (ICO, https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/electronic-mail-marketing/).
   - So a WhatsApp or LinkedIn message to a UK sole trader may need consent, just like email.
   - GAID Art. 18(1)(a) ("any direct marketing activity") is not limited to email either.
4. **Phone call tasks are not screened against the UK's TPS/CTPS.**
   - The ICO says you "must not make marketing calls to any number listed on the Telephone Preference Service (TPS) or Corporate TPS (CTPS)" without consent (https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/telephone-marketing/).
5. **Retention may be too long for Nigeria.**
   - GAID Art. 49(3) and Art. 21(2) point to six months, not twelve.
   - The purge also misses leads left in `CONTACTED`, `NURTURE` or `SUPPRESSED` (brief question (i)).
6. **Missing email content.**
   - No privacy-notice link in outreach messages (NDPA s.27; GAID Art. 26(2)(f); UK GDPR Art. 14(3)(b)).
   - No "advertisement" identification (US 15 U.S.C. §7704(a)(5)(A)(i)).
   - Canada also needs a phone number, email address or web address alongside the mailing address (SOR/2012-36 s.2).
7. **Compliance steps missing from the launch gate.** A DPIA filed with the NDPC, major-importance registration and a DPO may be mandatory before processing (GAID Art. 28(3), Schedule 7; NDPA s.32, s.44). ADR-034's launch gate lists only counsel's view and the LIA.
8. **Other country findings** are in `country-rules-review.md` §"Flags". They include:
   - Suggested `CONSENT_REQUIRED` for ZA, KE and parts of GH, where today's `REVIEW` is safe but the law points to consent.
   - One loosening: US sole traders, partnerships and unknown forms to `ALLOWED`, since CAN-SPAM does not depend on legal form.
