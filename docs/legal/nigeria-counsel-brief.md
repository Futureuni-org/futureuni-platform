# Brief for Nigerian counsel: FUTUREUNI client-acquisition outreach

**Prepared for review by a qualified lawyer. This is not legal advice.**

Prepared 2026-09-26 · Status: draft, awaiting counsel · Owner: Prince Amadin, FUTUREUNI

This brief describes what FUTUREUNI's internal platform will do with prospects' data, what we think the law says, and what we need counsel to decide. Every legal statement cites its source. Anything we could not confirm from a primary source says **verify with counsel**. Nothing here is a conclusion; it is a list of facts and questions.

**Primary sources used**
- Nigeria Data Protection Act 2023 (NDPA), NDPC-hosted copy: https://ndpc.gov.ng/wp-content/uploads/2024/03/Nigeria_Data_Protection_Act_2023.pdf
- NDPA General Application and Implementation Directive 2025 (GAID), issued 20 March 2025: https://ndpc.gov.ng/wp-content/uploads/2025/07/NDP-ACT-GAID-2025-MARCH-20TH.pdf. It is reported to have taken effect on 19 September 2025 (for example https://www.aluko-oyebode.com/insights/ndpc-gaid-takes-effect-on-19-september-is-your-organisation-prepared/). We found no NDPC text stating that date: **verify with counsel**.

Platform references (for example INV-4, ADR-034) point to the repository documents `.claude/project-rules.md` and `docs/decisions.md`.

---

## 1. Who FUTUREUNI is

- A digital agency based in Nigeria. It sells four services: web development, UI/UX design, graphic design and video editing.
- It is domiciled in Nigeria, so the NDPA applies to its processing: the Act applies where the "data controller or data processor is domiciled in, resident in, or operating in Nigeria" (NDPA s.2(2)(a)).
- Legal form, CAC number and registered address: **TODO (Prince to fill in)**.
- Data Protection Officer: **none designated yet** (see question (f)).
- It is building an internal, invite-only platform. Only FUTUREUNI staff use it. Its "Client Acquisition" module finds prospective clients, researches their public presence and helps staff contact them.
- **Planned volume:** new first contacts are capped at 30 per service line per day (4 lines), and 10 per line per day for the first two weeks (`docs/specs/module-acquisition.md` §3.10 and A3). Over six months that is far more than 200 people.

## 2. Processing activities

"Personal data" below means data about an individual (NDPA s.65). Data about a company alone is not personal data. Data about a sole proprietor's business usually is, because the business is the person.

| # | Activity | Personal data involved | Source | Lawful basis we propose (pending counsel) | Retention today |
|---|---|---|---|---|---|
| 1 | **Sourcing:** find businesses showing a need (no website, job posts for designers, poor app reviews, inactive YouTube channel) | Mostly company data. A sole trader's business name, phone or address. Job posts or reviews may quote a named person | Google Places (only the `place_id` is stored), SerpApi Google Jobs, MyJobMag public feeds, YouTube Data API, Apple App Store, CSV import (with an attestation that the list was not bought) and manual entry | Legitimate interest (NDPA s.25(1)(b)(v)) | Company records kept. Personal fields follow row 2 |
| 2 | **Enrichment:** crawl up to 10 pages of the business's own website (robots.txt respected); extract contacts; find and verify email addresses; detect legal form | Names and job titles of people listed on the site; business email (role such as info@, or a named person's); business phone; whether the number has a WhatsApp link; LinkedIn URL (stored, never scraped); a sole trader's address | The business's own website; Hunter (email finder and verifier; where an address "is not published, Hunter may generate a professional email address using pattern analysis", https://hunter.io/privacy-policy §2.f); UK Companies House (UK only); CAC "RC"/"BN" numbers shown on the site | Legitimate interest | Anonymised 12 months after the lead becomes `DISQUALIFIED` or `LOST` (ADR-015, setting `platform.retention.personalDataMonths`). See question (i) for gaps |
| 3 | **Audit** of the public web and social presence | Screenshots may show people; app-review quotes (reviewers kept as review IDs, not names) | Public web pages, Google PageSpeed, public YouTube data | Legitimate interest | Screenshots 90 days; YouTube data at most 30 days |
| 4 | **Scoring and AI briefs:** a deterministic score; Claude writes a short brief and drafts messages | Contact name and role, only where each AI task's personal-data policy allows | Rows 1–3 | Legitimate interest | AI prompt and response text is stored only when a task logs content, then deleted after 30 days (INV-13) |
| 5 | **Email outreach:** part of a sequence of 4 steps (Nigeria) or 5 steps (international) across channels, stopped by any reply | Name, business email, message text | Row 2 | Legitimate interest, or consent where a country rule requires it | As row 2 |
| 6 | **Assisted outreach:** WhatsApp, LinkedIn or phone. The platform prepares the text; a staff member sends it by hand | Business phone or WhatsApp number, name, message text | Row 2 | Legitimate interest | As row 2 |
| 7 | **Replies:** read replies, classify them (AI), honour unsubscribes | Reply content, sender address, any referral names | The prospect | Legitimate interest; honouring objections (NDPA s.36(4)) | As row 2 |
| 8 | **Meetings and proposals** once a prospect engages | Attendee name and email, meeting notes, proposal content | The prospect (Cal.com booking) | Steps taken at the prospect's request before a contract (NDPA s.25(1)(b)(i)) | As row 2; a won client moves to the client relationship |
| 9 | **Suppression list** (do not contact) | Email, phone or domain; stored as a keyed hash after a deletion request | Unsubscribes, objections, bounces, Hunter's "claimed email" signal | Honouring objections (NDPA s.36(4)) | Kept indefinitely so the person is never contacted again |
| 10 | **Data-subject requests and consent records** | Requester's email or phone; consent evidence | The requester | Accountability; honouring rights | Export files expire after 30 days. Emails in consent and request records are hashed on deletion |

## 3. Who we contact

**Nigerian businesses** (market `NIGERIA`):
- Companies registered with CAC under an RC number (legal form `NG_REGISTERED_COMPANY`).
- Businesses registered as Business Names under a BN number: sole proprietors and partnerships (legal form `NG_BUSINESS_NAME`). The platform puts these in the "sole trader" bucket (`docs/contracts/enrichment.md`, `LEGAL_FORM_BUCKET`).
- Non-profits, including incorporated trustees (legal form `NON_PROFIT`, currently in the "incorporated" bucket).
- Contact points: role addresses (info@), named employees' business emails, published business phone numbers (often a WhatsApp number shown on the site), and LinkedIn company pages.

**Non-Nigerian businesses** (market `INTERNATIONAL`): targets are mainly in the UK, Ireland, the US and Canada, plus other countries by search. They are contacted by FUTUREUNI, a Nigeria-domiciled controller. Each country has its own rule in the platform's country rules table (see `country-rules-review.md`).

## 4. Channels

| Channel | How it is sent | Who presses send | Default sequence position |
|---|---|---|---|
| Email | Automatically, from a dedicated outreach mailbox (Google Workspace, Gmail API), after a human approves the draft. `ALWAYS_REVIEW` is the default approval mode. Auto-approval is optional, and never applies to a lead flagged for compliance review | The system, after human approval | Nigeria: steps 2 and 4. International: steps 1, 2, 4 and 5 |
| WhatsApp | A `wa.me` click-to-chat link with pre-filled text. Never through any WhatsApp API (INV-7) | A staff member, by hand | **Nigeria: first contact (step 1)** and step 3 |
| LinkedIn | Text to copy, plus the company page URL. No automation or scraping | A staff member, by hand | International: step 3 |
| Phone | A call task with talking points and an outcome log | A staff member | Optional |

Default sequences are in `docs/specs/module-acquisition.md` §3.3.1. Any reply, bounce or unsubscribe stops every sequence at that company (INV-3).

## 5. Safeguards already designed

- **Suppression checked at every send** for the email, phone and domain, in the same code path that sends. A suppressed contact can never be messaged (INV-2).
- **One-click unsubscribe** in every email (RFC 8058 headers plus a link in the body). It takes effect before any further send and is never answered with a message (INV-4, INV-23).
- **FUTUREUNI's postal address** is in every email. Sending is blocked if the address setting is empty (INV-4).
- **Stop on reply:** any reply, bounce or unsubscribe stops all outreach to that company (INV-3).
- **Human review** of every first-contact draft by default. Every Nigerian lead is flagged for compliance review while the Nigerian basis is pending (ADR-034).
- **Evidence for every claim:** each personalised claim in an AI draft must cite a stored finding with a source URL, and edited text needs a human's confirmation (INV-5).
- **Provenance:** each contact stores its source, when it was collected and its lawful basis (INV-10).
- **Data-subject export and delete** from the admin screen. Delete anonymises the person's fields and keeps only a keyed hash (HMAC-SHA256) of their email or phone, so they are never sourced again (`docs/specs/data-model.md` §8.3).
- **12-month retention** for prospects who are disqualified or lost (ADR-015).
- **No purchased lists:** CSV imports require an attestation. **No LinkedIn scraping or automation.** No scraping behind logins; robots.txt and provider terms are respected (INV-14).
- **No tracking pixels or rewritten links** (ADR-031).
- **Logs without personal data:** events and job payloads carry IDs only. AI calls are logged without personal data beyond each task's policy. Sentry scrubs emails, phones and message bodies (INV-13, ADR-030).
- **Low volume:** daily caps per line and per mailbox, sends only on weekdays 09:00–17:00 in the recipient's time zone (INV-8), and a global pause.

## 6. Provisions we think are relevant

| Provision | What it says (quoted) | Why it matters |
|---|---|---|
| GAID Art. 18(1)(a) | "consent is required: a) For any direct marketing activity" | No B2B carve-out appears in the text |
| GAID Art. 18(1)(e) | Consent is required "Before personal data may be transferred to a country in respect of which the Commission has not made an adequacy decision" | Our processors are outside Nigeria (question (g)) |
| NDPA s.25(1)(b)(v), s.25(2) | Legitimate interests are a lawful basis, but interests "shall not be legitimate" where they override the data subject's rights, are "incompatible with other lawful basis of processing under subsection (1)(b)(i)-(iv)", or "the data subject would not have a reasonable expectation that the personal data would be processed in the manner envisaged" | The test any legitimate-interest case must pass |
| GAID Art. 26(1)–(2) | A controller "shall cautiously consider reliance on legitimate interest" and must "Carry out Legitimate Interest Assessment (as prescribed in Schedule 8) before embarking on data processing" and "Identify and document the lawful basis of processing which is compatible with the legitimate interest pursued" | Draft LIA: `lia-b2b-outreach-draft.md` |
| GAID Art. 17(3)–(5) | "Reliance on any lawful bases of data processing which is not consent and not supported by any SRLI shall be strictly scrutinised". The Special Rule of Law Indexes include "(f) Prior relationship between the data controller and the data subject" | Cold outreach has no prior relationship |
| NDPA s.36(3)–(4) | A data subject may object "at any time" to direct marketing, and then "the personal data shall no longer be processed for such purposes" | Our suppression list implements this |
| NDPA s.27(1)–(2); GAID Art. 27(3) | Information duties, including where data is collected "other than directly from the data subject", unless "impossible or would involve a disproportionate effort or expense" | Question (j) |
| GAID Art. 28(3) | A DPIA "is mandatory and shall be filed with the Commission" for, among others, "a. Evaluation or scoring (profiling)", "g. Development of software for the purposes of enabling communication with data subjects" and "o. Cross-border data transfer" | The platform may hit all three (question (k)) |
| GAID Art. 49(3) | Where no law sets a time, "the storage time ... shall lapse not later than six (6) calendar months when the original purpose of the processing has been accomplished" | Our default is 12 months (question (i)) |
| GAID Art. 21(2) | "Where the contract did not materialise, any personal data collected relating to the data subject shall be destroyed within six (6) months unless there is a justifiable ground to archive the data for the purposes of any future legal claim" | As above |
| GAID Schedule 7 §1(1)(a) | A controller is of major importance if it keeps a filing system and "Processes the personal data of more than Two-Hundred (200) data subjects in six (6) months" | Question (f) |
| NDPA s.40(2) | Notify the Commission "within 72 hours of becoming aware of a breach which is likely to result in a risk to the rights and freedoms of individuals" | Question (h) |
| NDPA s.48(3)–(5) | Penalties up to the greater of ₦10,000,000 or 2% of annual gross revenue (major importance), or ₦2,000,000 or 2% (others) | Exposure |
| GAID Schedule 2, item 1(D) | The compliance audit return asks for the lawful basis for "PROFILING AND MARKETING", with "Legitimate Interest" among the options | May be relevant to question (c) |
| GAID Schedule 9 | The standard grievance notice (SNAG) lists "Unsolicited Messages" as a type of violation | Shows the NDPC expects complaints about unsolicited messages |

## 7. Questions for counsel

For each question: why we ask, what the platform does today, and the options.

**(a) Email: does GAID Art. 18(1)(a) require prior consent for a first-contact B2B email?**
Please answer separately for (i) a company's role address (info@) and (ii) a named employee's business email.
- Why we ask: Art. 18(1)(a) requires consent "For any direct marketing activity" (GAID). The NDPA itself provides a legitimate-interest basis (s.25(1)(b)(v)) and a right to object to direct marketing (s.36(3)–(4)). Art. 18(1) opens "Without prejudice to the provisions of the NDP Act".
- Sub-questions:
  - Is a role address with no identifiable individual "personal data" at all? The NDPA covers information "relating to an individual" (s.65).
  - How do NDPA s.25(1)(b)(v) and s.36(3) interact with Art. 18(1)(a)?
  - Is a single message asking for consent itself "direct marketing"?
  - Does "direct marketing" have a defined meaning? We found no definition in NDPA s.65 or GAID Art. 52.
- Platform today: Nigerian email is `REVIEW` for every legal form, so no Nigerian email can be sent.

**(b) WhatsApp: same question for an assisted WhatsApp message to a business's published number.**
- Why we ask: Art. 18(1)(a) is not limited to email. A Business Name's published number is often the owner's personal mobile.
- WhatsApp's own business messaging policy (https://business.whatsapp.com/policy) is reported to require the recipient's opt-in before a business messages them. We could not open the page to confirm (it redirected to a host we could not reach): **verify with counsel**.
- Platform today: WhatsApp is the **first** step of the Nigerian sequence. Assisted channels are allowed with a compliance notice even while email is held (INV-25). **The `ngDirectMarketingBasis` setting has no value that blocks assisted channels.**

**(c) Legitimate interest: can NDPA s.25(1)(b)(v) with GAID Art. 26 and a Schedule 8 LIA support B2B first contact? Under what conditions?**
- Please tell us how to meet:
  - GAID Art. 26(2)(c), which requires us to identify a lawful basis "compatible with the legitimate interest pursued";
  - NDPA s.25(2)(b), which denies legitimacy to interests "incompatible with" the contract, legal obligation, vital interest and public interest bases;
  - the "strict scrutiny" of GAID Art. 17(5) where there is no prior relationship.
- Is the compliance audit return's option of "Legitimate Interest" for "profiling and marketing" (GAID Schedule 2, item 1(D)) relevant?
- Is collecting contact details from a business's own website, and through Hunter, within reasonable expectations (NDPA s.25(2)(c))?
- Draft LIA: `lia-b2b-outreach-draft.md`.

**(d) Business Name (BN) vs Registered Company (RC): does the answer differ?**
- Why we ask: a BN is one or more individuals trading, so its business contact data is probably personal data, while an RC is a separate legal person.
- Platform today:
  - `NG_BUSINESS_NAME` is in the sole-trader bucket. Even with `LEGITIMATE_INTEREST_CONFIRMED`, BN email stays `REVIEW` and only RC email becomes `ALLOWED`.
  - Non-profits (incorporated trustees) are in the incorporated bucket.
  - Please confirm both mappings.

**(e) Does the NDPA/GAID govern outreach to recipients outside Nigeria?**
- Why we ask: NDPA s.2(2)(a) applies wherever the controller is domiciled in Nigeria. GAID Art. 1(4) lists who may enjoy data-subject rights, including "(b) A data subject whose personal data has been transferred to Nigeria".
- If GAID Art. 18(1)(a) applies to FUTUREUNI's emails to UK, US or EU businesses, the platform's `ALLOWED` rules for other countries could be too permissive for FUTUREUNI in every country.
- Please also say whether collecting a foreign contact's data from a foreign website into our systems is a "transfer to Nigeria".

**(f) Is FUTUREUNI a "data controller of major importance"? What follows?**
- Why we ask:
  - GAID Schedule 7 §1(1)(a) designates any controller with a filing system that processes personal data of more than 200 data subjects in six months. Tiers: more than 5,000 in six months is Ultra-High; 1,000–5,000 is Extra-High; 200–1,000 is Ordinary-High (Schedule 7 §3(1)(b), (d), (f)).
  - The NDPA definition counts data subjects "who are within Nigeria" (s.65).
- Consequences to confirm:
  - registration "within six months after the commencement of the Act or on becoming" one (NDPA s.44(1); GAID Art. 9), and fees;
  - a DPO (NDPA s.32(1); GAID Art. 11–13, including a semi-annual DPO report);
  - annual compliance audit returns (GAID Art. 10(6)–(8)), and whether they are filed through a licensed DPCO (Art. 10(14));
  - the general duty to "Conduct a NDP Act compliance audit within Fifteen (15) months of commencement of business" (GAID Art. 7(b)).
- Please give us the likely tier and a timetable.

**(g) Cross-border transfers to our US and EU processors.**
- Processors: Vercel (hosting and file storage), Neon (database), Anthropic (AI), Google (Workspace mailboxes, Places, PageSpeed and YouTube APIs), Hunter (email finder; hosted on Google Cloud in Belgium according to ADR-020), Resend (staff email only), Cal.com (bookings) and Sentry (error tracking). Each data location must be **confirmed from the provider's DPA**.
- Why we ask:
  - NDPA s.41(1) allows a transfer where the recipient is subject to adequate "law, binding corporate rules, contractual clauses, code of conduct, or certification mechanism", or where a s.43 condition applies. s.41(2) requires us to "record the basis for transfer".
  - GAID Art. 18(1)(e) requires consent before a transfer to a country without an NDPC adequacy decision.
  - GAID Schedule 5 §1 lists the grounds: adequacy decision, a "Cross-Border Data Transfer Instrument (CBDTI) approved by the Commission", or other lawful bases.
  - Secondary sources report that the NDPC has issued no adequacy decisions and that the old NDPR "whitelist" no longer applies (for example https://www.techhiveadvisory.africa/insights/changing-trend-in-international-data-transfer-in-nigeria-reassessing-the-adequacy-of-the-whitelist-and-the-implications-for-businesses): **verify with counsel**.
- Questions:
  - Are the providers' standard contractual clauses enough without NDPC approval?
  - How do s.41 and Art. 18(1)(e) fit together?
  - What must our transfer record contain?

**(h) Breach notification: duties and timeline.**
- What the texts say:
  - Notify the NDPC within 72 hours where a breach is "likely to result in a risk" (NDPA s.40(2)).
  - Tell data subjects "immediately" where the risk is high (s.40(3)).
  - Processors must notify us (s.40(1)).
  - Keep a record of all breaches (s.40(8)).
  - The notice must contain the items listed in GAID Art. 33(5).
- Questions:
  - Is there an NDPC portal or address for notices?
  - Does the duty cover breaches affecting only non-Nigerian prospects?
  - What must our processor contracts contain (GAID Art. 34(2))?

**(i) Is 12-month retention for disqualified and lost prospects acceptable?**
- Why we ask:
  - GAID Art. 49(3) sets a six-month outer limit after the purpose is accomplished, where no law sets a time. Art. 21(2) sets six months where a contract "did not materialise".
  - Our default is 12 months (ADR-015).
- Please also advise on these gaps (from `docs/specs/module-acquisition.md` §5.2 and `docs/specs/data-model.md` §8.3):
  - The purge covers only leads in `DISQUALIFIED` or `LOST`. A lead that was contacted and never replied stays `CONTACTED` until a human marks it lost, and leads held in `NURTURE` or `SUPPRESSED` are not purged.
  - The suppression list is kept indefinitely.
  - The audit log is kept indefinitely unless a period is set.
  - The retention policy must be communicated to data subjects (GAID Schedule 1 §4(vii)).

**(j) What privacy information must prospects get, and must the first message include it?**
- Why we ask:
  - NDPA s.27(1) lists the required information. s.27(2) applies it to data "collected ... other than directly from the data subject", unless providing it "is impossible or would involve a disproportionate effort or expense".
  - GAID Art. 27(3) lists the content.
  - GAID Art. 26(2)(f) makes transparency a condition of relying on legitimate interest.
- Platform today: the email footer has the sender's signature, an unsubscribe link and the postal address, but **no privacy-notice link**. WhatsApp texts are limited to 600 characters and one link.
- Please tell us the minimum wording and whether a short link is enough.

**(k) Is a DPIA mandatory, must it be filed with the NDPC, and who signs it?**
- What the texts say: GAID Art. 28(3)(a), (g) and (o) (scoring, software for communicating with data subjects, cross-border transfer). A DPIA must be "vetted by a certified DPO duly accredited by the Commission" (Art. 28(4)) and submitted "before the commencement of data processing" (Art. 28(9)).

**(l) Data-subject rights coverage.**
- The platform supports export and delete, plus objection through the suppression list.
- The NDPA also gives rights to correction and restriction (s.34(1)(c), (e)) and a portability right (s.38). GAID Art. 37(2) says portability applies to data provided on consent or contract.
- Questions:
  - Is our tooling sufficient?
  - Is there a response deadline beyond "without constraint or unreasonable delay" (s.34(1))?

**(m) Automated scoring.**
- Leads scoring below 40 are disqualified automatically (never contacted). Borderline leads always go to a human.
- Is this a decision with "legal or similar significant effects" under NDPA s.37? Does GAID Art. 26(2)(d) (processing "that may lead to behavioural monitoring or profiling") limit it?

**(n) Other Nigerian rules on unsolicited messages or calls.**
- We have not researched sector rules, such as telecom rules on unsolicited messages or consumer-protection law: **verify with counsel**. Does anything beyond the NDPA and GAID apply to email, WhatsApp or phone marketing between businesses?

## 8. What we need back in writing

- [ ] A written opinion on (a)–(e), with a clear choice for each recipient type (RC role address, RC named employee, BN, non-profit): legitimate interest allowed / consent required / do not contact.
- [ ] The same answer for assisted WhatsApp, LinkedIn and phone first contact.
- [ ] If legitimate interest is available: a completed and signed Schedule 8 LIA (from our draft), and the conditions we must meet.
- [ ] The answer on territorial reach (e), and what it means for the other countries.
- [ ] Major-importance status and tier; registration, DPO, CAR and audit steps with dates (f).
- [ ] Whether a DPIA is required and must be filed, who signs it, and by when (k).
- [ ] The transfer basis for each processor, and the record we must keep (g).
- [ ] A breach procedure: who notifies whom, when and how (h).
- [ ] The retention period(s), including the suppression list, audit log and the status gaps in (i).
- [ ] Privacy-notice wording for prospects, and whether it must be in the first message (j).
- [ ] Any other Nigerian law affecting these channels (n).
- [ ] Counsel's name, firm, date, and confirmation that FUTUREUNI may rely on the advice for its launch gate (ADR-034).

## 9. How counsel's answers map to platform settings

The setting `acquisition.compliance.ngDirectMarketingBasis` is changed only by an `ADMIN`, after recording counsel's view and the Art. 26 assessment. Every change is audited (ADR-034). The country rule values are explained in `README.md`.

| If counsel says… | Set `ngDirectMarketingBasis` to | Nigerian email verdict | Other changes needed |
|---|---|---|---|
| No answer yet | `PENDING_LEGAL_REVIEW` (default) | `REVIEW` for every legal form; every Nigerian lead flagged for compliance review | None. No Nigerian outreach at launch (ADR-034 launch gate) |
| Legitimate interest is available for companies (RC) only | `LEGITIMATE_INTEREST_CONFIRMED` | RC `ALLOWED`; BN, partnership and unknown form stay `REVIEW` | Record the signed LIA |
| Legitimate interest is available for RC **and** BN | `LEGITIMATE_INTEREST_CONFIRMED` | As above: **the setting alone cannot allow BN email** | A change request to the `NG` rule mapping |
| Consent is required for email, but assisted first contact is allowed | `CONSENT_ONLY` | `CONSENT_REQUIRED` for every form (`ALLOWED` once a `ConsentRecord` exists) | None |
| Consent is required for **every** channel (email, WhatsApp, LinkedIn, phone) | `CONSENT_ONLY` | `CONSENT_REQUIRED` for every form | **A platform change:** today no setting blocks assisted channels (INV-25). Until then, turn off the Nigerian assisted steps in the sequences |
| Role addresses with no identifiable individual are not personal data | No setting exists | No change | A new rule would be needed to treat `ROLE` and `PERSONAL` emails differently. Keep today's behaviour until it is built |
| The GAID governs FUTUREUNI's outreach to other countries | No setting exists | No change | Review every country rule in `country-rules-review.md` against the Nigerian answer. Likely a new ADR |
| Retention must be six months | `platform.retention.personalDataMonths = 6` | No change | Also fix the purge gaps listed in (i) |
