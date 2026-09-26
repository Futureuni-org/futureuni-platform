# Legitimate Interest Assessment (DRAFT): B2B first-contact outreach

**Prepared for review by a qualified lawyer. This is not legal advice.**

Prepared 2026-09-26 · Status: **DRAFT, not approved** · Controller: FUTUREUNI (Nigeria) · Completed by: `[DPO]` · Reviewed by: `[COUNSEL]`

## How to read this draft

- **Structure.** This follows the structure and questions of **GAID Schedule 8, "Legitimate Interest Assessment Template"**, retrieved on 2026-09-26 from https://ndpc.gov.ng/wp-content/uploads/2025/07/NDP-ACT-GAID-2025-MARCH-20TH.pdf. The part headings and questions are reproduced word for word. FUTUREUNI's facts are pre-filled from the platform documents.
- **Placeholders.**
  - `[COUNSEL]` marks a legal judgement for Nigerian counsel.
  - `[DPO]` marks a judgement for the Data Protection Officer.
  - `[FUTUREUNI]` marks a business fact Prince must supply.
  - `[DECISION]` marks a design choice that could change the platform.
- **Why this is needed.** GAID Art. 26(2)(a) makes it "mandatory" to "Carry out Legitimate Interest Assessment (as prescribed in Schedule 8) before embarking on data processing". Art. 26(1) says a controller "shall be required in a compliance audit to show the basis of its preference" (GAID).

### Precondition: this LIA may not be enough on its own

- GAID Art. 18(1)(a) says consent "is required ... For any direct marketing activity" (GAID). If counsel concludes that Art. 18(1)(a) applies to this outreach, legitimate interest cannot be the basis for it, whatever this LIA says. See `nigeria-counsel-brief.md` questions (a)–(e).
- NDPA s.25(2) says interests "shall not be legitimate" where they:
  - "override the fundamental rights, freedoms and the interests of the data subject";
  - "are incompatible with other lawful basis of processing under subsection (1)(b) (i)-(iv)"; or
  - where "the data subject would not have a reasonable expectation that the personal data would be processed in the manner envisaged".
  (NDPA: https://ndpc.gov.ng/wp-content/uploads/2024/03/Nigeria_Data_Protection_Act_2023.pdf)
- GAID Art. 26(2)(c) requires the controller to "Identify and document the lawful basis of processing which is compatible with the legitimate interest pursued".
  - Compatible basis (draft): `[COUNSEL]`. We have not identified one. "Steps at the request of the data subject prior to entering into a contract" (NDPA s.25(1)(b)(i)) needs a request from the prospect, which a cold first contact does not have.

### Processing covered

| Item | Description |
|---|---|
| Purpose | Finding businesses that visibly need web, UI/UX, graphic or video services, and contacting them once with a relevant, evidence-based offer, followed by a short sequence that stops on any reply |
| Activities | Sourcing, website enrichment, email finding and verification, audit of public presence, scoring, AI-assisted drafting, human review, sending (email) or preparing (WhatsApp, LinkedIn, phone), reply handling, suppression, retention. Details: `nigeria-counsel-brief.md` §2 |
| Not covered | Meetings and proposals after a prospect engages (proposed basis: steps at the prospect's request, NDPA s.25(1)(b)(i)); staff data; cookies |
| Data subjects | Owners, founders and staff of prospect businesses, in their business capacity. Sole proprietors trading under a Business Name (BN) |
| Personal data | Name, job title, business email, business phone or WhatsApp number, LinkedIn profile URL (never scraped), a sole trader's business address, message and reply content |
| Recipients (processors) | Vercel, Neon, Anthropic, Google, Hunter, Cal.com, Sentry (Resend carries staff email only). See brief question (g) |

---

## Part 1: Purpose test

*"You need to assess whether there is a legitimate interest behind the processing."* (GAID Schedule 8)

| Schedule 8 question | Draft answer (FUTUREUNI facts) | Review |
|---|---|---|
| Why do you want to process the data? | To find businesses whose public presence shows a specific need for FUTUREUNI's services (for example no website, a slow mobile site, job posts for a designer, poor app reviews) and to offer help to the right person there. Each message is about that business's own situation. | `[DPO]` |
| What benefit do you expect to get from the processing? | New client work for FUTUREUNI's four service lines. Targeted contact, rather than mass mailing, keeps volume low (at most 30 first contacts per line per day; module spec §3.10). | `[FUTUREUNI]` confirm expected volumes and conversion |
| Do any third parties benefit from the processing? | The prospect business gets a free, specific observation about its web or social presence (for example "Your homepage took 7.2s to show its main content on mobile in our test on 3 Oct"), whether or not it replies. Processors are paid for their service and do not reuse the data (to be confirmed from each DPA). | `[DPO]` confirm processor terms |
| Are there any wider public benefits to the processing? | FUTUREUNI's view, not evidence: better digital presence for small Nigerian businesses, and service exports by a Nigerian firm. | `[COUNSEL]` weight, if any |
| How important are the benefits that you have identified? | Direct outreach is FUTUREUNI's main planned route to new clients. | `[FUTUREUNI]` |
| What would the impact be if you couldn't go ahead with the processing? | FUTUREUNI would rely on referrals, inbound enquiries, paid advertising and consent-based lists. Growth would be slower, and Nigerian SMEs that never advertise a need would not be reached. | `[FUTUREUNI]` |
| Are you complying with any specific data protection rules that apply to your processing (e.g. profiling requirements)? | Leads are scored by a deterministic function; below 40 they are disqualified (never contacted); borderline scores go to a human. That is "evaluation or scoring", a mandatory DPIA trigger under GAID Art. 28(3)(a). No sensitive personal data (NDPA s.65) is collected on purpose. Churches and church media are off by default (module spec OQ-6). | `[DPO]` DPIA status (see Part 3) |
| Are you complying with other relevant laws? | **Open.** GAID Art. 18(1)(a) (consent for direct marketing) is unresolved. International recipients follow the country rules table (`country-rules-review.md`). Provider terms are respected (INV-14). | `[COUNSEL]` |
| Are you complying with industry guidelines or codes of practice? | No Nigerian code identified. Email follows mailbox-provider sender rules (one-click unsubscribe per RFC 8058, SPF/DKIM/DMARC; ADR-016). | `[COUNSEL]` any Nigerian code or NDPC guidance on marketing? |
| Are there any other ethical issues with the processing? | AI drafting could state something untrue. Controls: every claim must cite a stored finding with a source (INV-5); dismissed findings can't be cited (INV-18); a human confirms any edited claims; no false urgency or fake "Re:" subjects; no tracking pixels (ADR-031). GAID Art. 41 asks controllers to "prioritise the principles of data ethics". | `[DPO]` |
| Will the processing involve the personal data of a child in anyway? | Not intended: targets are businesses. **Risk:** the video line targets YouTube creators ("the creator or their manager", module spec §3.6), and some creators may be children. "Child" takes its meaning from the Child's Rights Act 2003 (NDPA s.65); we understand that to be under 18: **verify with counsel**. GAID Art. 18(1)(d) requires consent for a child's data. | `[DECISION]` |
| Do you have an effective means of carrying out age verification? | **No.** Proposal: contact creators only through a business entity or named manager, and let reviewers reject any lead that appears to be a minor (reject reason `NOT_A_FIT`). | `[DECISION]` `[DPO]` |

**Part 1 conclusion (draft):** FUTUREUNI has a commercial interest in finding clients. Whether it is a *legitimate* interest in Nigerian law depends on GAID Art. 18(1)(a) and NDPA s.25(2). `[COUNSEL]`

## Part 2: Necessity test

*"You need to assess whether the processing is necessary for the purpose you have identified."* (GAID Schedule 8)

| Schedule 8 question | Draft answer | Review |
|---|---|---|
| Will this processing actually help you achieve your purpose? | Yes. Evidence of a need (findings with sources) lets each message be specific and relevant to the business, rather than generic. | `[DPO]` |
| Is the processing proportionate to that purpose? | Collection is limited to business contact details. At most 10 pages of the business's own site are crawled. One active conversation per company (INV-9). Sequences are 4–5 steps and stop on any reply, bounce or unsubscribe (INV-3). Daily caps apply, and sends happen only in the recipient's business hours (INV-8). | `[DPO]` |
| Can you achieve the same purpose without the processing? | Partly. Company-level data (no individual) would be enough to write to a role address such as info@. A named person makes the message more likely to reach a decision-maker. | `[DECISION]` below |
| Can you achieve the same purpose by processing less data, or by processing the data in another more obvious or less intrusive way? | Already minimised: no tracking pixels or rewritten links (ADR-031); Google Places content other than `place_id` is never stored; reviewers are stored as review IDs, not names; screenshots expire after 90 days; AI content (if logged) after 30 days; Hunter is used only when the crawl found no verified personal email. **Less intrusive options not yet adopted:** (1) prefer role addresses to named people. Today a role email scores −5 and is primary only when no person is found (module spec §3.3, §3.6). (2) Email before WhatsApp: the Nigerian sequence starts with WhatsApp, which often reaches a personal phone. | `[DECISION]` `[COUNSEL]` |

## Part 3: Balancing test

*"You need to consider the impact on individuals' interests and rights and freedoms and assess whether this overrides your legitimate interests."* (GAID Schedule 8)

**DPIA screen first.** Schedule 8 says: *"First, use the DPIA "what to note sections" in Schedule 4 of the GAID. If you answer yes to any of the questions on what to note, then you need to conduct a DPIA instead to assess risks in more detail."* (GAID Schedule 8)

Schedule 4's "what to note" prompts include "Will any third-party companies be involved in processing the data?" and "Will this processing involve sending data to other countries (cross-border transfers)?". Our answer to both is **yes**.

GAID Art. 28(3) says a DPIA "is mandatory and shall be filed with the Commission" for, among others:
- "a. Evaluation or scoring (profiling)": **yes** (lead scoring);
- "f. When considering the deployment of innovative processes or applications": **likely** (AI-assisted research and drafting);
- "g. Development of software for the purposes of enabling communication with data subjects": **likely** (the outreach engine);
- "o. Cross-border data transfer": **yes** (US and EU processors).

A DPIA must be "vetted by a certified DPO duly accredited by the Commission" (Art. 28(4)) and submitted "before the commencement of data processing" (Art. 28(9)).

**Draft view:** a DPIA is very likely required in addition to this LIA. `[DPO]` `[COUNSEL]`

### Nature of the Personal Data

| Schedule 8 question | Draft answer | Review |
|---|---|---|
| Is it special category data or criminal offence data? | No. None of the NDPA s.65 "sensitive personal data" categories (for example religious beliefs, health, political opinions) is collected on purpose. Church targeting is off by default. | `[DPO]` |
| Is it data which people are likely to consider particularly `private'? | Mostly no: the details are published by the business for business contact. **Exception:** a Business Name owner's published WhatsApp number is often their personal mobile. | `[DPO]` |
| Are you processing children's data or data relating to other vulnerable people? | Not intended. Possible minors among YouTube creators (Part 1). GAID Schedule 6 lists vulnerability factors (for example "Financial Difficulty", lack of "digital literacy"), which may apply to some very small traders. | `[DPO]` |
| Is the data about people in their personal or professional capacity? | Professional capacity: owners, founders and staff acting for a business. For sole proprietors the two overlap. | `[COUNSEL]` |

### Reasonable expectations

| Schedule 8 question | Draft answer | Review |
|---|---|---|
| Do you have an existing relationship with the individual? | **No.** This is first contact. GAID Art. 17(3)(f) lists "Prior relationship between the data controller and the data subject" as a Special Rule of Law Index, and Art. 17(5) says a non-consent basis "not supported by any SRLI shall be strictly scrutinised". | `[COUNSEL]` |
| What's the nature of the relationship and how have you used data in the past? | None. | — |
| Did you collect the data directly from the individual? What did you tell them at the time? | No. It comes from the business's own website, public listings, or Hunter. FUTUREUNI told them nothing at collection. NDPA s.27(2) information duties apply (brief question (j)). | `[COUNSEL]` |
| If you obtained the data from a third party, what did they tell the individuals about reuse by third parties for other purposes and does this cover you? | Hunter's privacy policy (https://hunter.io/privacy-policy, §2.f, read 2026-09-26) says it "crawls public web pages to collect data related to professional profiles". Where an address "is not published, Hunter may generate a professional email address using pattern analysis". It relies on "legitimate interest in providing comprehensive professional contact databases for business-to-business purposes", and offers a "Claim" feature to update or delete data (https://hunter.io/claim). The platform turns Hunter's HTTP 451 `claimed_email` into an automatic suppression (ADR-020). **Note:** a Hunter-generated address was never published by the person, which weakens their "reasonable expectation" (NDPA s.25(2)(c)). | `[COUNSEL]` `[DECISION]` limit Nigerian outreach to addresses found on the business's own site? |
| How long ago did you collect the data? Are there any changes in technology or context since then that would affect expectations? | Collected shortly before outreach. Email verification is reused for at most 30 days. YouTube data is kept for at most 30 days. | — |
| Is your intended purpose and method widely understood? | B2B prospecting by agencies is common. AI-assisted research is newer. We have no Nigerian evidence either way. | `[FUTUREUNI]` |
| Are you intending to do anything new or innovative? | Yes: automated audits of public web presence and AI-drafted, evidence-cited messages. | `[DPO]` |
| Do you have any evidence about expectations, for example from market research, focus groups or other forms of consultation? | No. Option: a small, measured pilot tracking replies, complaints and unsubscribes before scaling. | `[DECISION]` |
| Are there any other factors in the particular circumstances that mean they would or would not expect the processing? | **For:** the business published the contact point for enquiries, sometimes as a `wa.me` "chat with us" link; the message is about their own public presence. **Against:** the NDPC's standard grievance notice lists "Unsolicited Messages" as a violation (GAID Schedule 9); GAID Art. 18(1)(a). | `[COUNSEL]` |

### Likely impact

| Schedule 8 question | Draft answer | Review |
|---|---|---|
| What are the possible impacts of the processing on people? | Time and annoyance; an unwanted WhatsApp message on a personal phone; concern about how they were found; embarrassment if a message states something untrue about their business. | `[DPO]` |
| Will individuals lose any control over the use of their personal data? | Limited. They can unsubscribe with one click (email), reply "stop" (any channel), or ask for export or deletion. Deletion leaves only a keyed hash, so they are never contacted again (data model §8.3). | `[DPO]` |
| What is the likelihood and severity of any potential impact? | Draft: low severity; a moderate likelihood of minor annoyance. | `[DPO]` |
| Are some people likely to object to the processing or find it intrusive? | Yes, some. Any objection stops all outreach to the company at once (INV-3) and is honoured permanently (NDPA s.36(4)). | `[DPO]` |
| Would you be happy to explain the processing to individuals? | Yes. A prospect privacy notice is needed (brief question (j)). | `[DECISION]` add a notice link to the email footer |
| Can you adopt any safeguards to minimise the impact? | Already designed: suppression check at every send (INV-2); one-click unsubscribe and postal address (INV-4); unsubscribe honoured before any further send (INV-23); human review by default; compliance flag on every Nigerian lead (ADR-034); cited claims (INV-5); no purchased lists; no LinkedIn scraping; no WhatsApp API; logs without personal data (INV-13); retention purge (ADR-015). **Proposed extra safeguards:** a standard "reply STOP" line in WhatsApp texts; a privacy-notice link; email before WhatsApp for Business Names; retention cut to six months (GAID Art. 49(3)). | `[DECISION]` |

**Can you offer individuals an opt-out?** Yes / No: **Yes (draft).**
- Email: one-click unsubscribe and a link in every message (INV-4).
- WhatsApp, LinkedIn and phone: a staff member logs the reply, which is classified as an unsubscribe. This relies on staff logging assisted replies (module spec US-31). `[DECISION]` add explicit opt-out wording to assisted messages.

## Making the decision

*"This is where you use your answers to Parts 1, 2 and 3 to decide whether or not you can apply the legitimate interest basis."* (GAID Schedule 8)

**Can you rely on legitimate interests for this processing?** Yes / No: `[COUNSEL]` `[DPO]`. Answer per recipient type, using the table below.

| Recipient type | Personal data? | Main risk | Draft view (not a conclusion) | Decision |
|---|---|---|---|---|
| RC company, role address (info@) | Possibly none, if no individual is identifiable (NDPA s.65) | Low | Strongest case | `[COUNSEL]` |
| RC company, named employee's business email | Yes | Low to moderate | Depends on GAID Art. 18(1)(a) | `[COUNSEL]` |
| RC company, published business phone or WhatsApp | Yes, if it is a person's mobile | Moderate | Depends on Art. 18(1)(a); assisted only | `[COUNSEL]` |
| Business Name (sole proprietor or partnership), any channel | Yes: the business is the person | Moderate to high | Weakest case; the platform keeps BN on `REVIEW` even after legitimate interest is confirmed | `[COUNSEL]` |
| Non-profit or incorporated trustees | As for RC | Low to moderate | As RC | `[COUNSEL]` |
| Individual creator (YouTube) with no business entity | Yes; possibly a child | High | Exclude unless a business or manager is identified | `[DECISION]` |

**Do you have any comments to justify your answer? (optional)**

`[COUNSEL]` `[DPO]`

**LIA completed by:** `[DPO name, role]`

**Date:** `[date]`

## What is next

GAID Schedule 8 lists these steps. FUTUREUNI's plan for each is noted below.

- **a. Keep a record of this LIA, and keep it under review.**
  - Store the signed version in `docs/legal/` with the date.
  - Review it at least yearly, and whenever the processing changes (new channel, new source, new country, auto-send).
  - Record its reference in the audit entry made when `acquisition.compliance.ngDirectMarketingBasis` is changed (ADR-034).
- **b. Do a DPIA if necessary.**
  - Likely mandatory: see the DPIA screen above (GAID Art. 28(3)).
- **c. Include details of your purposes and lawful bases for processing in your privacy information, including an outline of your legitimate interests.**
  - Needs the prospect privacy notice (brief question (j)).

---

## Annex A: GAID Art. 26(2) mandatory measures

GAID Art. 26(2) says it "shall be mandatory" for a controller relying on legitimate interest to do the following.

| Art. 26(2) | Requirement (quoted) | Platform measure today | Gap |
|---|---|---|---|
| (a) | "Carry out Legitimate Interest Assessment (as prescribed in Schedule 8) before embarking on data processing" | This draft; the launch gate in ADR-034 | Needs completion and sign-off |
| (b) | "Prioritise privacy by design and by default – taking into consideration the suitability of anonymisation or pseudonymisation" | Hashed re-suppression; anonymisation purge; minimal Places storage; IDs-only event payloads | Consider preferring role addresses (Part 2) |
| (c) | "Identify and document the lawful basis of processing which is compatible with the legitimate interest pursued" | None identified | `[COUNSEL]` |
| (d) | "Identify and eliminate data processing that may overreach the fundamental rights and freedoms of data subjects – particularly such processing that may lead to behavioural monitoring or profiling, or lead to targeted advertisement by third parties or partners" | No tracking pixels; no data shared with third parties for advertising; scoring uses business signals | Scoring is profiling where the business is a person; `[DPO]` |
| (e) | "Identify and eliminate data processing that may lead to a breach of data confidentiality, integrity and availability – taking into account vulnerable data subjects" | Encrypted credentials (INV-21); role-based access; private file storage; Sentry scrubbing | A breach procedure is still needed (brief question (h)) |
| (f) | "Provide transparent information to data subjects in accordance with Section 27 of the NDP Act" | Sender identity, postal address and unsubscribe in every email | **No privacy notice or link yet** |
| (g) | "Provide for prompt remediation of data subjects' rights" | Export and delete from the admin screen; suppression | Correction and restriction are not separate tools (brief question (l)) |
| (h) | "Prioritise data ethics and utmost duty of care" | Honesty rules; cited claims (INV-5); human review | — |

## Annex B: Sign-off

| Role | Name | Decision | Date | Signature |
|---|---|---|---|---|
| Data Protection Officer | | | | |
| Nigerian counsel | | | | |
| FUTUREUNI (Prince Amadin) | | | | |
