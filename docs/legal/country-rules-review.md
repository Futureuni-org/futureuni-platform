# Country rules review sheet: cold B2B email

**Prepared for review by a qualified lawyer. This is not legal advice.**

Prepared 2026-09-26 · Status: awaiting counsel · Platform source of truth: `docs/contracts/enrichment.md` rule 15 (defaults set by ADR-034)

## How to use this sheet

- There is one table per country, with one row per legal-form bucket. Each row shows:
  - the platform's **current default**;
  - a **suggested default** for counsel to confirm;
  - blank **Counsel decision** and **Signed off by / date** columns.
- Above each table: the law with a primary-source URL, a short summary of what it appears to require for a **cold, first-contact B2B marketing email**, and the unsubscribe, identity and postal-address rules.
- Anything we could not confirm from a primary source is marked **verify with counsel**.
- **How we set suggestions.** A suggestion is never more permissive than the current default unless a primary source clearly supports it, and every change is flagged **CHANGE**.
- **Values** (`README.md` explains each): `ALLOWED` · `CONSENT_REQUIRED` · `REVIEW` · `PROHIBITED`.
- **Buckets:**
  - `incorporated`: LIMITED, PLC, LLP, NG_REGISTERED_COMPANY, CORPORATION, LLC, NON_PROFIT, PUBLIC_BODY;
  - `soleTrader`: SOLE_TRADER, NG_BUSINESS_NAME;
  - `partnership`: PARTNERSHIP;
  - `unknownForm`: UNKNOWN, OTHER.

**What every email already contains** (INV-4, project rules §"Output/document rules"):
- the sender's real name "at FUTUREUNI";
- a signature;
- "Not interested? Unsubscribe: <link>" plus RFC 8058 one-click headers;
- FUTUREUNI's postal address.

Unsubscribes take effect before any further send (INV-23). There is **no** explicit "this is an advertisement" label and **no** privacy-notice link (see Flags).

**What this sheet does not cover.** It covers email. WhatsApp, LinkedIn and phone are allowed in every country unless suppressed (`docs/contracts/enrichment.md` rule 16). §"Other channels" explains why that may be a problem.

## Summary

Current → suggested. **Bold** marks a suggested change.

| Country | incorporated | soleTrader | partnership | unknownForm |
|---|---|---|---|---|
| NG | REVIEW → REVIEW | REVIEW → REVIEW | REVIEW → REVIEW | REVIEW → REVIEW |
| GB | ALLOWED → ALLOWED | CONSENT_REQUIRED → CONSENT_REQUIRED | CONSENT_REQUIRED → CONSENT_REQUIRED | REVIEW → REVIEW |
| IE | ALLOWED → ALLOWED | REVIEW → REVIEW | REVIEW → REVIEW | REVIEW → REVIEW |
| US | ALLOWED → ALLOWED | REVIEW → **ALLOWED** | REVIEW → **ALLOWED** | REVIEW → **ALLOWED** |
| CA | ALLOWED → **REVIEW** | REVIEW → REVIEW | REVIEW → REVIEW | REVIEW → REVIEW |
| DE | CONSENT_REQUIRED → CONSENT_REQUIRED | CONSENT_REQUIRED → CONSENT_REQUIRED | CONSENT_REQUIRED → CONSENT_REQUIRED | CONSENT_REQUIRED → CONSENT_REQUIRED |
| FR | ALLOWED → ALLOWED | REVIEW → REVIEW | REVIEW → REVIEW | REVIEW → REVIEW |
| NL | ALLOWED → **CONSENT_REQUIRED** | REVIEW → **CONSENT_REQUIRED** | REVIEW → **CONSENT_REQUIRED** | REVIEW → **CONSENT_REQUIRED** |
| ES | CONSENT_REQUIRED → CONSENT_REQUIRED | CONSENT_REQUIRED → CONSENT_REQUIRED | CONSENT_REQUIRED → CONSENT_REQUIRED | CONSENT_REQUIRED → CONSENT_REQUIRED |
| IT | CONSENT_REQUIRED → CONSENT_REQUIRED | CONSENT_REQUIRED → CONSENT_REQUIRED | CONSENT_REQUIRED → CONSENT_REQUIRED | CONSENT_REQUIRED → CONSENT_REQUIRED |
| AT | CONSENT_REQUIRED → CONSENT_REQUIRED | CONSENT_REQUIRED → CONSENT_REQUIRED | CONSENT_REQUIRED → CONSENT_REQUIRED | CONSENT_REQUIRED → CONSENT_REQUIRED |
| BE | CONSENT_REQUIRED → CONSENT_REQUIRED | CONSENT_REQUIRED → CONSENT_REQUIRED | CONSENT_REQUIRED → CONSENT_REQUIRED | CONSENT_REQUIRED → CONSENT_REQUIRED |
| ZA | REVIEW → **CONSENT_REQUIRED** | REVIEW → **CONSENT_REQUIRED** | REVIEW → **CONSENT_REQUIRED** | REVIEW → **CONSENT_REQUIRED** |
| GH | REVIEW → REVIEW | REVIEW → **CONSENT_REQUIRED** | REVIEW → **CONSENT_REQUIRED** | REVIEW → **CONSENT_REQUIRED** |
| KE | REVIEW → **CONSENT_REQUIRED** | REVIEW → **CONSENT_REQUIRED** | REVIEW → **CONSENT_REQUIRED** | REVIEW → **CONSENT_REQUIRED** |
| AE | REVIEW → REVIEW | REVIEW → REVIEW | REVIEW → REVIEW | REVIEW → REVIEW |
| Any other country | REVIEW → REVIEW | REVIEW → REVIEW | REVIEW → REVIEW | REVIEW → REVIEW |

## Flags

**The question that overrides everything else.** If Nigerian counsel finds that GAID Art. 18(1)(a) (consent "For any direct marketing activity") governs FUTUREUNI's outreach to *every* country (`nigeria-counsel-brief.md` question (e)), no row below may be more permissive than the Nigerian answer.

### A. Where the current defaults may be too permissive

1. **Canada: `incorporated` is `ALLOWED`, but CASL is a consent law.**
   - Cold email is lawful only on implied consent: the address was "conspicuously published", there was no statement refusing unsolicited messages, and the message "is relevant to the person's business, role, functions or duties" (CASL s.10(9)(b)).
   - An address a finder tool produced, but that was never published, does not qualify, and the sender must prove consent (s.13).
   - The platform does not check any of this, so the suggestion is `REVIEW` until it can.
2. **Assisted channels ignore the country rules.** WhatsApp and LinkedIn messages are "electronic mail" or "electronic messages" under UK, EU and Canadian law (see §"Other channels"). A WhatsApp message to a UK sole trader, or to anyone in a consent country, may need consent just as email does.
3. **UK phone calls are not screened against the TPS or CTPS registers** (ICO; see §"Other channels").
4. **Content gaps in every email:**
   - US law requires "clear and conspicuous identification that the message is an advertisement or solicitation" (15 U.S.C. §7704(a)(5)(A)(i)). The UK and EU require commercial emails to be identifiable as commercial.
   - UK GDPR requires privacy information "at the latest at the time of the first communication" when data was not obtained from the person (Art. 14(3)(b)).
   - Canada requires a mailing address **plus** a phone number, email address or web address (SOR/2012-36 s.2).
   - Counsel should confirm whether today's footer is enough.
5. **Netherlands: `incorporated` is `ALLOWED`, but the current Dutch law requires consent from companies too.**
   - Telecommunicatiewet art. 11.7(1) forbids commercial email "tenzij de verzender kan aantonen dat de desbetreffende eindgebruiker daarvoor voorafgaand toestemming heeft verleend" (unless the sender can show the end-user consented beforehand).
   - The only B2B exception, art. 11.7(3)(a), covers contact details that the business has designated and published *for receiving* unsolicited commercial messages. The explanatory memorandum says an ordinary register listing does not qualify.
   - The Dutch regulator's guidance says: send only to people who consented beforehand.
   - The ADR-034 default appears to reflect the older law. Suggest `CONSENT_REQUIRED`.

### B. Other findings

6. **France: the sole-trader position is uncertain.**
   - The CNIL allows B2B email "lorsque l'objet de la sollicitation est en rapport avec la profession de la personne démarchée".
   - But the statute (CPCE art. L34-5) protects every "personne physique", and a sole trader is one.
   - Today's `REVIEW` is kept.
7. **South Africa, Ghana and Kenya: `REVIEW` is safe, but the law points to consent.**
   - South Africa protects companies too. POPIA s.69(1) prohibits electronic direct marketing unless the data subject "has given his, her or its consent" or is a customer.
   - Kenya's 2010 consumer-protection regulations make email marketing "without the prior consent of the subscriber" an offence, and "subscriber" includes companies.
   - Ghana requires "prior written consent" for direct marketing to individuals (Act 843 s.40(1)).
   - Suggested: `CONSENT_REQUIRED`. Unlike `REVIEW`, it lets email go once a consent record exists, which these laws allow. That is the only loosening. Nothing is sent without consent.
   - South Africa allows one consent-request message (POPIA s.69(2)). The platform has no "consent request" message type: **counsel to confirm whether FUTUREUNI should use it**.

### C. Suggestions that loosen anything

- **US `soleTrader`, `partnership` and `unknownForm`: `REVIEW` → `ALLOWED`.**
  - CAN-SPAM "makes no exception for business-to-business email" and does not depend on the recipient's legal form (FTC guide; 15 U.S.C. §7704).
  - Apply this only once the content gaps in flag 4 are fixed.
  - State privacy laws were not reviewed: **verify with counsel**.
- **`REVIEW` → `CONSENT_REQUIRED`** (NL non-incorporated buckets; ZA; GH non-incorporated; KE).
  - This lets email go only for a contact with a recorded consent, which each of those laws allows.
  - Nothing is sent to anyone else.

---

## NG: Nigeria

- **Law:**
  - Nigeria Data Protection Act 2023 (NDPA): https://ndpc.gov.ng/wp-content/uploads/2024/03/Nigeria_Data_Protection_Act_2023.pdf
  - NDPC General Application and Implementation Directive 2025 (GAID): https://ndpc.gov.ng/wp-content/uploads/2025/07/NDP-ACT-GAID-2025-MARCH-20TH.pdf
- **What it appears to require:**
  - GAID Art. 18(1)(a): consent "is required ... For any direct marketing activity", with no B2B carve-out in the text.
  - The NDPA offers legitimate interests (s.25(1)(b)(v)) and a right to object to direct marketing (s.36(3)–(4)).
  - GAID Art. 26 requires a Schedule 8 Legitimate Interest Assessment before relying on legitimate interest.
  - Whether legitimate interest can support cold B2B contact is **unresolved: verify with counsel**. See `nigeria-counsel-brief.md` (a)–(e).
  - The NDPA protects individuals only (s.65 "data subject"), so a Business Name (the business is the person) may differ from an RC company.
- **Unsubscribe / identity / postal address:** no express email-content rule was found in the NDPA or GAID. Objections to direct marketing must be honoured (NDPA s.36(4)). Privacy information is required (NDPA s.27; GAID Art. 27).
- **Platform note:** these values follow the setting `acquisition.compliance.ngDirectMarketingBasis`, not this table directly:
  - `PENDING_LEGAL_REVIEW`: all `REVIEW`;
  - `LEGITIMATE_INTEREST_CONFIRMED`: incorporated `ALLOWED`, others `REVIEW`;
  - `CONSENT_ONLY`: all `CONSENT_REQUIRED`.
- **Wider reach:** if counsel finds that the GAID governs FUTUREUNI's outreach to *every* country (brief question (e)), every other row in this sheet must be at least as strict as the Nigerian answer.

| Bucket | Current default | Suggested default | Why | Counsel decision | Signed off by / date |
|---|---|---|---|---|---|
| incorporated | REVIEW | REVIEW | GAID Art. 18(1)(a) unresolved | | |
| soleTrader (incl. Business Name) | REVIEW | REVIEW | Personal data of the owner; weakest case | | |
| partnership | REVIEW | REVIEW | As soleTrader | | |
| unknownForm | REVIEW | REVIEW | Unknown | | |

## GB: United Kingdom

- **Law:**
  - PECR 2003 reg 22 (https://www.legislation.gov.uk/uksi/2003/2426/regulation/22), reg 23 (https://www.legislation.gov.uk/uksi/2003/2426/regulation/23) and reg 2 definitions (https://www.legislation.gov.uk/uksi/2003/2426/regulation/2).
  - UK GDPR Art. 6 (https://www.legislation.gov.uk/eur/2016/679/article/6), Art. 14 (https://www.legislation.gov.uk/eur/2016/679/article/14) and Art. 21 (https://www.legislation.gov.uk/eur/2016/679/article/21).
  - Electronic Commerce (EC Directive) Regulations 2002 reg 7 (https://www.legislation.gov.uk/uksi/2002/2013/regulation/7).
  - ICO B2B guidance: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/business-to-business-marketing/
- **What it appears to require:**
  - Reg 22 protects "individual subscribers". The ICO says: "Sole traders and some partnerships are treated as individuals – so you can only email or text them if they have specifically consented, or if they bought a similar product from you in the past", and "You can email or text any corporate body (a company, Scottish partnership, limited liability partnership or government body)" (https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/electronic-mail-marketing/).
  - The soft opt-in "does not apply to prospective customers or new contacts" (same page).
  - A named employee's address is personal data. UK GDPR therefore applies: legitimate interests, where "processing ... for the purposes of direct marketing" is listed as an example in Art. 6(11)(a), which DUAA 2025 inserted; privacy information "at the latest at the time of the first communication" (Art. 14(3)(b)); and an absolute right to object (Art. 21(3)).
  - Fines: DUAA 2025 raised PECR fines to "up to £17.5 million or 4% of global turnover" from 5 February 2026 (commencement: https://www.legislation.gov.uk/uksi/2026/82/made; ICO statement: https://ico.org.uk/about-the-ico/media-centre/news-and-blogs/2026/02/statement-on-the-commencement-of-the-data-use-and-access-act-duaa/).
  - If it is unclear whether an address belongs to an individual or a corporate subscriber, the ICO warns this "puts you at risk of breaching PECR. To mitigate that risk you should treat the details as belonging to an individual subscriber" (ICO B2B guidance). The same page says it is "under review" after the Data (Use and Access) Act, so **re-check it before sign-off**.
- **Unsubscribe / identity / postal address:**
  - Reg 23 forbids concealing the sender's identity and requires "a valid address to which the recipient ... may send a request that such communications cease". This applies to corporate subscribers too.
  - E-Commerce reg 7 requires a commercial communication to be clearly identifiable as one.
  - We found no postal-address requirement in PECR.
  - No statutory deadline for opt-outs. The ICO says stop "immediately or as soon as possible" (https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/direct-marketing-guidance/respect-peoples-preferences/).
- **Platform note:** INV-6. Companies House decides the legal form. The Companies House type `limited-partnership` maps to `PARTNERSHIP` (consent needed), which is stricter than PECR requires for a Scottish limited partnership.

| Bucket | Current default | Suggested default | Why | Counsel decision | Signed off by / date |
|---|---|---|---|---|---|
| incorporated | ALLOWED | ALLOWED | Corporate subscriber (PECR reg 22 does not apply); reg 23 and UK GDPR still apply | | |
| soleTrader | CONSENT_REQUIRED | CONSENT_REQUIRED | Individual subscriber; soft opt-in not available for prospects | | |
| partnership | CONSENT_REQUIRED | CONSENT_REQUIRED | Most partnerships are individual subscribers (Scottish partnerships and LLPs are corporate) | | |
| unknownForm | REVIEW | REVIEW | The ICO warns about unknown subscriber type | | |

## IE: Ireland

- **Law:**
  - S.I. No. 336/2011 (ePrivacy Regulations 2011), reg 13: https://www.irishstatutebook.ie/eli/2011/si/336/made/en/print. This is the text as made; later amendments were not checked, so **verify with counsel**.
  - DPC guidance "Rules for Direct Electronic Marketing": https://www.dataprotection.ie/en/organisations/rules-electronic-and-direct-marketing. The live page refused automated access; we read the archived copy at https://web.archive.org/web/20260512174238id_/https://www.dataprotection.ie/en/organisations/rules-electronic-and-direct-marketing.
- **What it appears to require:**
  - Email marketing to "a subscriber or user who is a natural person" needs consent (reg 13(1)). There is an exception for "an email address that reasonably appears to the sender to be an email address used mainly by the subscriber or user in the context of their commercial or official activity" where "the unsolicited communication relates solely to that commercial or official activity" (reg 13(2)).
  - For a subscriber "other than a natural person" (a company), email is allowed unless the company has said it does not consent (reg 13(4)).
  - The DPC's Guerin Media case study says it is "a common misconception" that a work address makes an email B2B. The sender "must be able to show that the email sent related solely to the recipient's commercial or official activity" (https://www.dataprotection.ie/en/pre-gdpr/case-studies; read via https://web.archive.org/web/20250806051114id_/https://dataprotection.ie/en/pre-gdpr/case-studies).
  - Each email is a separate offence (reg 13(13)(b)). On indictment, fines reach €250,000 for a body corporate (reg 13(15)).
- **Unsubscribe / identity / postal address:**
  - No concealing the sender's identity, and "a valid address to which the recipient may send a request that such communication shall cease" (reg 13(12)).
  - The message must "include a valid address at which that person may be contacted" (reg 13(10)(c)).
  - No statutory opt-out deadline was found.
- **Platform note:** relevance to the recipient's role matters. The contact picker targets owners, founders and marketing roles (module spec §3.6), which helps. Sole traders could lawfully be `ALLOWED` under reg 13(2), but that turns on the facts, so no change is suggested.

| Bucket | Current default | Suggested default | Why | Counsel decision | Signed off by / date |
|---|---|---|---|---|---|
| incorporated | ALLOWED | ALLOWED | Reg 13(4) opt-out regime for non-natural persons; the message must relate to the recipient's role | | |
| soleTrader | REVIEW | REVIEW | Natural person: consent, unless the reg 13(2) business-address exception applies (fact-specific) | | |
| partnership | REVIEW | REVIEW | Unclear whether a partnership is a "natural person" (**verify with counsel**) | | |
| unknownForm | REVIEW | REVIEW | Unknown | | |

## US: United States

- **Law:**
  - CAN-SPAM Act, 15 U.S.C. §7704 (https://www.law.cornell.edu/uscode/text/15/7704) and §7707 (https://www.law.cornell.edu/uscode/text/15/7707).
  - FTC, "CAN-SPAM Act: A Compliance Guide for Business": https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- **What it appears to require:**
  - An opt-out regime: no prior consent is needed. The FTC says: "The law makes no exception for business-to-business email." The recipient's legal form does not matter.
  - State email laws are superseded "except to the extent that any such statute ... prohibits falsity or deception" (§7707(b)(1)).
  - Penalty: up to $53,088 per violating email (FTC guide; 16 CFR 1.98, read via https://www.ecfr.gov/api/versioner/v1/full/2026-09-20/title-16.xml?part=1&section=1.98). The FTC left amounts unchanged for 2026 (FR Doc 2026-18853, https://www.federalregister.gov/documents/full_text/text/2026/09/15/2026-18853.txt).
  - Using addresses generated "by combining names, letters, or numbers into numerous permutations" is an aggravating factor (§7704(b)(1)(A)(ii)). The platform never uses unverified guessed addresses (`docs/contracts/enrichment.md` rule 11).
  - State privacy laws were not reviewed: **verify with counsel**.
- **Unsubscribe / identity / postal address:**
  - Accurate headers and a subject line that is not deceptive.
  - "clear and conspicuous identification that the message is an advertisement or solicitation" (§7704(a)(5)(A)(i)).
  - Notice of the opportunity to opt out (§7704(a)(5)(A)(ii)).
  - "a valid physical postal address of the sender" (§7704(a)(5)(A)(iii)).
  - The opt-out mechanism must work for at least 30 days after sending (§7704(a)(3)), and requests must be honoured within 10 business days (§7704(a)(4)).
- **Platform note:** the footer has the opt-out and postal address, but **no advertisement or solicitation identification** (flag 4).

| Bucket | Current default | Suggested default | Why | Counsel decision | Signed off by / date |
|---|---|---|---|---|---|
| incorporated | ALLOWED | ALLOWED | Opt-out regime | | |
| soleTrader | REVIEW | **ALLOWED (CHANGE: more permissive)** | CAN-SPAM does not depend on legal form (FTC: no B2B exception, and no consent requirement). Only after the ad-identification gap is fixed | | |
| partnership | REVIEW | **ALLOWED (CHANGE: more permissive)** | As above | | |
| unknownForm | REVIEW | **ALLOWED (CHANGE: more permissive)** | As above | | |

## CA: Canada

- **Law:**
  - Canada's Anti-Spam Legislation (CASL), S.C. 2010, c. 23: https://laws-lois.justice.gc.ca/eng/acts/E-1.6/page-1.html (s.1, s.6) and https://laws-lois.justice.gc.ca/eng/acts/E-1.6/page-2.html (ss.10–13, 20).
  - Electronic Commerce Protection Regulations (CRTC), SOR/2012-36: https://laws-lois.justice.gc.ca/eng/regulations/SOR-2012-36/FullText.html
  - Electronic Commerce Protection Regulations, SOR/2013-221: https://laws-lois.justice.gc.ca/eng/regulations/SOR-2013-221/FullText.html
  - CRTC guidance on implied consent: https://crtc.gc.ca/eng/com500/guide.htm. The live page refused automated access; we read https://web.archive.org/web/20260916043407id_/https://crtc.gc.ca/eng/com500/guide.htm.
- **What it appears to require:**
  - No commercial electronic message may be sent unless the recipient "has consented ..., whether the consent is express or implied" (s.6(1)).
  - Implied consent exists where the person "has conspicuously published, or has caused to be conspicuously published, the electronic address", the publication "is not accompanied by a statement that the person does not wish to receive unsolicited commercial electronic messages", and "the message is relevant to the person's business, role, functions or duties in a business or official capacity" (s.10(9)(b)).
  - The sender "has the onus of proving" consent (s.13).
  - "Person" includes "an individual, partnership, corporation" (s.1(1)), so legal form does not change the rule.
  - The business-to-business exemption applies only "if the organizations have a relationship" (SOR/2013-221 s.3(a)(ii)), so it does not cover cold prospecting.
  - CASL applies where "a computer system located in Canada is used to send or access" the message (s.12(1)).
  - Maximum administrative penalty: $10 million for an organisation (s.20(4)).
- **Unsubscribe / identity / postal address:**
  - Identify the sender, with contact information and an unsubscribe mechanism (s.6(2)).
  - The message must include "the mailing address, and either a telephone number providing access to an agent or a voice messaging system, an email address or a web address" (SOR/2012-36 s.2).
  - The unsubscribe must stay valid for 60 days and be honoured "without delay, and in any event no later than 10 business days" (s.11(3)).
- **Platform note:** the current `ALLOWED` for incorporated bodies assumes consent is not needed. Under CASL, a cold email is lawful only where s.10(9)(b) is met, so the platform would need to record:
  - the address was found published (the page URL and date, which the CRTC guide suggests keeping as screenshots);
  - no "no unsolicited messages" statement appeared;
  - the message is relevant to the person's role.

  Finder-generated addresses fail the first test. Hunter says that where an address "is not published, Hunter may generate a professional email address using pattern analysis" (https://hunter.io/privacy-policy, §2.f).
- **Suggestion:** `REVIEW` for every bucket until the platform can check these conditions. After that, `ALLOWED` for crawl-published addresses in every bucket (CASL does not depend on legal form), and `CONSENT_REQUIRED` otherwise.

| Bucket | Current default | Suggested default | Why | Counsel decision | Signed off by / date |
|---|---|---|---|---|---|
| incorporated | ALLOWED | **REVIEW (CHANGE: stricter)** | Consent law; implied consent needs a conspicuously published address and role relevance, which the platform does not yet check | | |
| soleTrader | REVIEW | REVIEW | As above | | |
| partnership | REVIEW | REVIEW | As above | | |
| unknownForm | REVIEW | REVIEW | As above | | |

## EU baseline (applies to DE, FR, NL, ES, IT, AT, BE)

- **Directive 2002/58/EC (ePrivacy), consolidated text:** https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:02002L0058-20091219
- **Art. 13(1):** email "for the purposes of direct marketing may be allowed only in respect of subscribers or users who have given their prior consent".
- **Art. 13(5):** the consent rule applies to "subscribers who are natural persons". Each member state decides how to protect "the legitimate interests of subscribers other than natural persons". That is why the B2B rules differ by country.
- **Art. 13(4):** forbids messages that "disguise or conceal the identity of the sender", breach Art. 6 of the E-Commerce Directive, or "do not have a valid address to which the recipient may send a request that such communications cease".
- **GDPR:** a named person's address is personal data, so the GDPR also applies (lawful basis, Art. 14 notice, right to object). The GDPR duties were not researched country by country: **verify with counsel**.

## DE: Germany

- **Law:**
  - UWG §7 (Act against Unfair Competition): https://www.gesetze-im-internet.de/uwg_2004/__7.html
  - DDG §6 (Digital Services Act, commercial communications): https://www.gesetze-im-internet.de/ddg/__6.html
- **What it appears to require:**
  - §7(2) Nr. 2: an unreasonable nuisance is always assumed "bei Werbung unter Verwendung ... elektronischer Post, ohne dass eine vorherige ausdrückliche Einwilligung des Adressaten vorliegt" (advertising by email without the recipient's prior express consent). There is no B2B exception, and role versus named addresses make no difference.
  - The Federal Court of Justice held that "Bereits die einmalige unverlangte Zusendung einer E-Mail mit Werbung kann einen rechtswidrigen Eingriff in das Recht am eingerichteten und ausgeübten Gewerbebetrieb darstellen": a single unsolicited ad email to a business can be unlawful. The claimant was a partnership (BGH, 20 May 2009, I ZR 218/07, https://www.bundesgerichtshof.de/SharedDocs/Entscheidungen/DE/Zivilsenate/I_ZS/2007/I_ZR_218-07.pdf).
  - The §7(3) existing-customer exception does not help with prospects.
  - How German law applies to a sender in Nigeria was not researched: **verify with counsel**.
- **Unsubscribe / identity / postal address:**
  - Do not conceal the sender, and give a valid address for opt-out requests (§7(2) Nr. 3).
  - The advertisement must be recognisable as commercial and its sender identifiable (DDG §6(1)).
  - No postal-address rule for the email itself was found.

| Bucket | Current default | Suggested default | Why | Counsel decision | Signed off by / date |
|---|---|---|---|---|---|
| incorporated | CONSENT_REQUIRED | CONSENT_REQUIRED | UWG §7(2) Nr. 2: prior express consent for all recipients | | |
| soleTrader | CONSENT_REQUIRED | CONSENT_REQUIRED | As above | | |
| partnership | CONSENT_REQUIRED | CONSENT_REQUIRED | As above; BGH case concerned a partnership | | |
| unknownForm | CONSENT_REQUIRED | CONSENT_REQUIRED | As above | | |

## FR: France

- **Law:**
  - Code des postes et des communications électroniques (CPCE) art. L34-5: https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000042155961/. Légifrance blocked automated access; the text came through a fetch tool, so check it by hand.
  - CNIL guidance: https://www.cnil.fr/fr/la-prospection-commerciale-par-courrier-electronique
- **What it appears to require:**
  - L34-5 forbids direct marketing by email "utilisant les coordonnées d'une personne physique ... qui n'a pas exprimé préalablement son consentement" (using a natural person's details without prior consent).
  - The CNIL says prospecting professionals "peut être fondée sur l'intérêt légitime de l'organisme lorsque l'objet de la sollicitation est en rapport avec la profession de la personne démarchée": it can rest on legitimate interest when the offer relates to the recipient's profession, and the recipient must be able to object.
  - Generic addresses "de type info[@]nomsociete.fr, contact[@]... qui concernent de personnes morales" are outside those rules.
  - A Conseil constitutionnel decision of 25 June 2026 (n° 2026-1210 QPC, https://www.conseil-constitutionnel.fr/decision/2026/20261210QPC.htm) strikes out some L34-5 paragraphs from 31 October 2027. They concern which authority imposes sanctions, not the consent rule: **verify with counsel**.
- **Unsubscribe / identity / postal address:** "Dans tous les cas" (in all cases), each message must give valid contact details for opt-out requests and must not hide the sender's identity (L34-5). No postal-address rule was found.

| Bucket | Current default | Suggested default | Why | Counsel decision | Signed off by / date |
|---|---|---|---|---|---|
| incorporated | ALLOWED | ALLOWED | CNIL B2B rule: the offer must relate to the recipient's profession, with an easy opt-out | | |
| soleTrader | REVIEW | REVIEW | A sole trader is a "personne physique" under L34-5; the CNIL's B2B rule may still apply (**verify with counsel**) | | |
| partnership | REVIEW | REVIEW | Most French partnerships (SNC, SCS) are legal persons, but the platform can't confirm the form | | |
| unknownForm | REVIEW | REVIEW | Unknown | | |

## NL: Netherlands

- **Law:**
  - Telecommunicatiewet art. 11.7: https://wetten.overheid.nl/BWBR0009950/ (version of 15 August 2026).
  - Explanatory memorandum, Kamerstuk 35421 nr. 3: https://zoek.officielebekendmakingen.nl/kst-35421-3.html
  - ACM guidance: https://www.acm.nl/nl/verkoop-aan-consumenten/reclame-en-verleiden/spam-voorkomen-uw-reclame
- **What it appears to require:**
  - Art. 11.7(1) forbids commercial email "tenzij de verzender kan aantonen dat de desbetreffende eindgebruiker daarvoor voorafgaand toestemming heeft verleend" (unless the sender can show the end-user gave prior consent). The rule covers every end-user, including legal persons.
  - Art. 11.7(3)(a) exempts legal persons and professionals only where the sender uses contact details the business has designated and published ("bestemd en bekendgemaakt") *for receiving* such messages. The memorandum says this means details the recipient "hier expliciet voor heeft bestemd en bekendgemaakt". An ordinary info@ published for general contact probably does not qualify. That is our reading; there is no official ruling on a plain info@ (**verify with counsel**).
  - The ACM's guidance: "Verstuur uw berichten alleen naar mensen die vooraf toestemming gaven" (send only to people who gave prior consent).
  - The predecessor regulator (OPTA) fined a firm €100,000 for spam sent mainly to business recipients (https://www.acm.nl/nl/publicaties/publicatie/10417/OPTA-beboet-spam-aan-ondernemers-met-100000-euro).
- **Unsubscribe / identity / postal address:** each message must state the sender's real identity and "een geldig postadres of nummer" (a valid postal address or number) for opt-out requests (art. 11.7(7)).

| Bucket | Current default | Suggested default | Why | Counsel decision | Signed off by / date |
|---|---|---|---|---|---|
| incorporated | ALLOWED | **CONSENT_REQUIRED (CHANGE: stricter)** | Art. 11.7(1) consent rule covers legal persons; the 11.7(3)(a) exception needs addresses published for receiving such messages | | |
| soleTrader | REVIEW | **CONSENT_REQUIRED (CHANGE)** | Consent is the rule; a recorded consent unlocks email | | |
| partnership | REVIEW | **CONSENT_REQUIRED (CHANGE)** | As above | | |
| unknownForm | REVIEW | **CONSENT_REQUIRED (CHANGE)** | As above | | |

## ES: Spain

- **Law:**
  - Ley 34/2002 (LSSI), consolidated text: https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758
  - AEPD FAQ: https://www.aepd.es/preguntas-frecuentes/5-publicidad-no-deseada
- **What it appears to require:**
  - Art. 21.1 forbids email advertising "que previamente no hubieran sido solicitadas o expresamente autorizadas por los destinatarios" (not previously requested or expressly authorised by the recipients).
  - A "destinatario" is a "persona física o jurídica que utiliza, sea o no por motivos profesionales" an information-society service (annex (d)). So companies and professionals are covered.
  - Art. 4 applies the law to providers outside the EU/EEA "que dirijan sus servicios específicamente al territorio español" (who direct their services specifically at Spain).
  - The AEPD enforces art. 21 (art. 43).
  - We found no AEPD statement that expressly addresses legal persons; the conclusion rests on the statutory definition (**verify with counsel**).
- **Unsubscribe / identity / postal address:**
  - The message must be identifiable as commercial, with the sender clearly identified (art. 20).
  - The opt-out must include "una dirección de correo electrónico u otra dirección electrónica válida" (a valid email or other electronic address) (arts. 21.2, 22.1).

| Bucket | Current default | Suggested default | Why | Counsel decision | Signed off by / date |
|---|---|---|---|---|---|
| incorporated | CONSENT_REQUIRED | CONSENT_REQUIRED | LSSI art. 21.1; companies are "destinatarios" | | |
| soleTrader | CONSENT_REQUIRED | CONSENT_REQUIRED | As above | | |
| partnership | CONSENT_REQUIRED | CONSENT_REQUIRED | As above | | |
| unknownForm | CONSENT_REQUIRED | CONSENT_REQUIRED | As above | | |

## IT: Italy

- **Law:**
  - Codice Privacy (D.Lgs. 196/2003) art. 130: https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2003-06-30;196~art130. Art. 121 (definitions): https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2003-06-30;196~art121
  - Garante guidelines on promotional activity and spam, 4 July 2013: https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/2542348
- **What it appears to require:**
  - Marketing by email "è consentito con il consenso del contraente o utente" (is allowed with the subscriber's or user's consent) (art. 130(1)–(2)).
  - A "contraente" is "qualunque persona fisica, persona giuridica, ente o associazione" (any natural person, legal person, body or association) (art. 121). So companies are covered.
  - The Garante's 2013 guidelines say prior consent is needed even where addresses are taken from public registers, lists or websites.
  - Garante decisions after 2013 were not reviewed (**verify with counsel**).
- **Unsubscribe / identity / postal address:** do not conceal the sender, and give "un idoneo recapito" (a suitable contact point) for exercising rights (art. 130(5)).

| Bucket | Current default | Suggested default | Why | Counsel decision | Signed off by / date |
|---|---|---|---|---|---|
| incorporated | CONSENT_REQUIRED | CONSENT_REQUIRED | Art. 130 consent; legal persons are "contraenti" | | |
| soleTrader | CONSENT_REQUIRED | CONSENT_REQUIRED | As above | | |
| partnership | CONSENT_REQUIRED | CONSENT_REQUIRED | As above | | |
| unknownForm | CONSENT_REQUIRED | CONSENT_REQUIRED | As above | | |

## AT: Austria

- **Law:**
  - Telekommunikationsgesetz 2021 (TKG 2021) §174, via the official RIS open-data copy: https://ogd.ris.bka.gv.at/Dokumente/Bundesnormen/NOR40238632/NOR40238632.html
  - RTR guidance: https://www.rtr.at/ecg
- **What it appears to require:**
  - §174(3): "Die Zusendung einer elektronischen Post ... ist ohne vorherige Einwilligung des Empfängers unzulässig, wenn die Zusendung zu Zwecken der Direktwerbung erfolgt" (email for direct marketing is unlawful without the recipient's prior consent). There is no business or consumer distinction.
  - §174(4) is an existing-customer exception only.
  - §174(6): an offence committed abroad counts as committed where the message is received.
- **Unsubscribe / identity / postal address:** the sender must not be concealed. A message is unlawful if it has "keine authentische Adresse" (no authentic address) for opt-out requests (§174(5)).

| Bucket | Current default | Suggested default | Why | Counsel decision | Signed off by / date |
|---|---|---|---|---|---|
| incorporated | CONSENT_REQUIRED | CONSENT_REQUIRED | TKG 2021 §174(3) | | |
| soleTrader | CONSENT_REQUIRED | CONSENT_REQUIRED | As above | | |
| partnership | CONSENT_REQUIRED | CONSENT_REQUIRED | As above | | |
| unknownForm | CONSENT_REQUIRED | CONSENT_REQUIRED | As above | | |

## BE: Belgium

- **Law:**
  - Code of Economic Law art. XII.13, original 2013 text: https://etaamb.openjustice.be/fr/loi-du-15-decembre-2013_n2013011667.html. The current consolidated text was not reached (**verify with counsel**).
  - Royal Decree of 4 April 2003 on advertising by email: https://www.ejustice.just.fgov.be/eli/arrete/2003/04/04/2003011238/justel
  - FPS Economy FAQ: https://economie.fgov.be/fr/themes/line/commerce-electronique/spam/questions-frequemment-posees
- **What it appears to require:**
  - Art. XII.13 §1 forbids email advertising "sans le consentement préalable, libre, spécifique et informé du destinataire" (without the recipient's prior, free, specific and informed consent). The sender bears the burden of proving the advertising was solicited (§4).
  - The Royal Decree, art. 1, 2°, exempts advertising sent "auprès de personnes morales si les coordonnées électroniques qu'il utilise à cette fin sont impersonnelles" (to legal persons at impersonal addresses such as info@).
  - The report to the King says "nom.prénom@company.be" addresses are "adresses de personnes physiques" and need prior consent.
  - The FPS FAQ says the exemption applies "même si la personne morale n'est pas cliente" (even if the legal person is not a client).
- **Unsubscribe / identity / postal address:**
  - Each message must explain the right to object and give an electronic means to do so (XII.13 §2).
  - The sender must be clearly identifiable (XII.12).
  - Objections must be acknowledged and suppression lists kept (Royal Decree art. 2).
- **Platform note:** the platform's rules can't tell a role address from a named one, so no change is suggested now. If a rule for role addresses is added later, `incorporated` + role address could become `ALLOWED` (**counsel to confirm**).

| Bucket | Current default | Suggested default | Why | Counsel decision | Signed off by / date |
|---|---|---|---|---|---|
| incorporated | CONSENT_REQUIRED | CONSENT_REQUIRED | Consent rule; the exemption only covers impersonal addresses, which the platform can't yet separate | | |
| soleTrader | CONSENT_REQUIRED | CONSENT_REQUIRED | Natural person | | |
| partnership | CONSENT_REQUIRED | CONSENT_REQUIRED | Depends on legal personality (not researched) | | |
| unknownForm | CONSENT_REQUIRED | CONSENT_REQUIRED | Sender must prove the advertising was solicited (XII.13 §4) | | |

## ZA: South Africa

- **Law:**
  - Protection of Personal Information Act 4 of 2013 (POPIA): https://www.gov.za/sites/default/files/gcis_document/201409/3706726-11act4of2013popi.pdf
  - Information Regulator, Guidance Note on Direct Marketing: https://inforegulator.org.za/wp-content/uploads/2020/07/GUIDANCE-NOTE-ON-DIRECT-MARKETING-IN-TERMS-OF-THE-PROTECTION-OF-PERSONAL-INFORMATION-ACT-4-OF-2013-POPIA.pdf
  - Amended POPIA Regulations (tabled text): https://inforegulator.org.za/wp-content/uploads/2025/04/POPIA-2021-Regulations-FINAL-21-Jan-2025.pdf
- **What it appears to require:**
  - POPIA protects juristic persons. A "person" is "a natural person or a juristic person" (s.1), and personal information includes, "where it is applicable, an identifiable, existing juristic person" (s.1).
  - s.69(1): direct marketing "by means of any form of electronic communication, including ... e-mail is prohibited unless the data subject— (a) has given his, her or its consent ...; or (b) is ... a customer".
  - s.69(2)(a): the sender may approach a person "who has not previously withheld such consent, only once in order to request the consent", in the prescribed form (Form 4).
  - The Regulator's guidance note (§7.2.1) says "the first communication which the responsible party sends ... must be a communication requesting consent". It has no B2B carve-out.
  - POPIA reaches a responsible party outside South Africa that "makes use of automated or non-automated means in the Republic" (s.3(1)(b)(ii)). Whether that covers FUTUREUNI: **verify with counsel**.
  - The final gazetted version of the amended regulations was not read: **verify with counsel**.
- **Unsubscribe / identity / postal address:** every message must contain "(a) details of the identity of the sender ...; and (b) an address or other contact details to which the recipient may send a request that such communications cease" (s.69(4)).

| Bucket | Current default | Suggested default | Why | Counsel decision | Signed off by / date |
|---|---|---|---|---|---|
| incorporated | REVIEW | **CONSENT_REQUIRED (CHANGE)** | s.69(1) consent; juristic persons are data subjects | | |
| soleTrader | REVIEW | **CONSENT_REQUIRED (CHANGE)** | As above | | |
| partnership | REVIEW | **CONSENT_REQUIRED (CHANGE)** | As above | | |
| unknownForm | REVIEW | **CONSENT_REQUIRED (CHANGE)** | As above | | |

## GH: Ghana

- **Law:**
  - Data Protection Act 2012 (Act 843): https://dpc.gov.gh/wp-content/uploads/2025/05/data-protection-act-2012-act-843.pdf
  - Electronic Transactions Act 2008 (Act 772): https://www.csa.gov.gh/resources/Electronic%20Transactions%20Act.pdf
- **What it appears to require:**
  - Act 843 s.40(1): "A data controller shall not provide, use, obtain, procure or provide information related to a data subject for the purposes of direct marketing without the prior written consent of the data subject."
  - A "data subject" is "an individual who is the subject of personal data" (s.96), so a named person, a sole trader or an identifiable partner is protected, but a company is not.
  - The Act applies where processing concerns information "which originates partly or wholly from this country" (s.45(1)(c)).
  - Act 772 s.50(1) requires prior consent for unsolicited electronic communications to a "consumer" (an individual end user). s.50(5) makes it an offence to send "unsolicited commercial communications to another person". Whether that reaches a company's role address is **unclear: verify with counsel**.
  - A Data Protection Bill 2025 was published in draft (https://dpc.gov.gh/wp-content/uploads/2025/11/DATA_PROTECTION_BILL1_DRAFT-1.pdf). We found no evidence it has passed, so Act 843 is treated as current (**verify with counsel**).
- **Unsubscribe / identity / postal address:** the sender must give an "option to cancel the subscription" and, at the consumer's request, the "source from which that person obtained the consumer's personal information" (Act 772 s.50(2)).

| Bucket | Current default | Suggested default | Why | Counsel decision | Signed off by / date |
|---|---|---|---|---|---|
| incorporated | REVIEW | REVIEW | Act 843 does not protect companies, but a named employee does need consent, and ETA s.50(5) is unclear | | |
| soleTrader | REVIEW | **CONSENT_REQUIRED (CHANGE)** | An individual: prior written consent (s.40(1)) | | |
| partnership | REVIEW | **CONSENT_REQUIRED (CHANGE)** | Partners are individuals | | |
| unknownForm | REVIEW | **CONSENT_REQUIRED (CHANGE)** | Cautious default | | |

## KE: Kenya

- **Law:**
  - Data Protection Act 2019: https://new.kenyalaw.org/akn/ke/act/2019/24/eng@2022-12-31
  - Data Protection (General) Regulations 2021: https://new.kenyalaw.org/akn/ke/act/ln/2021/263/eng@2022-12-31
  - Kenya Information and Communications (Consumer Protection) Regulations 2010: https://new.kenyalaw.org/akn/ke/act/ln/2010/54/eng@2022-12-31
- **What it appears to require:**
  - DPA s.37(1): no use "for commercial purposes" unless the person "has sought and obtained express consent from a data subject" or is authorised by written law.
  - A "data subject" is "an identified or identifiable natural person" (s.2).
  - The Act reaches controllers "not established or ordinarily resident in Kenya, but processing personal data of data subjects located in Kenya" (s.4(b)(ii)).
  - General Regulations reg. 15(1) lists the conditions for direct marketing, including that the controller "has collected the personal data from the data subject". Whether all the conditions must be met is ambiguous (**verify with counsel**).
  - The 2010 regulations, reg. 17(1): "A person who uses ... electronic mail for purposes of direct marketing without the prior consent of the subscriber commits an offence". A "subscriber" is "any person who purchases a communications service", which includes companies. Whether reg. 17 binds a foreign sender: **verify with counsel**.
- **Unsubscribe / identity / postal address:** no email may be sent where the sender's identity "has been disguised or concealed" or "a valid address ... that such communications cease has not been provided" (General Regulations reg. 15(3)). The opt-out must be prominent and free (regs. 16–17).

| Bucket | Current default | Suggested default | Why | Counsel decision | Signed off by / date |
|---|---|---|---|---|---|
| incorporated | REVIEW | **CONSENT_REQUIRED (CHANGE)** | 2010 regulations reg. 17 (the subscriber includes companies) | | |
| soleTrader | REVIEW | **CONSENT_REQUIRED (CHANGE)** | DPA s.37 express consent; reg. 17 | | |
| partnership | REVIEW | **CONSENT_REQUIRED (CHANGE)** | As above | | |
| unknownForm | REVIEW | **CONSENT_REQUIRED (CHANGE)** | As above | | |

## AE: United Arab Emirates

- **Law:**
  - Federal Decree-Law No. 45 of 2021 on Personal Data Protection (PDPL): https://uaelegislation.gov.ae/en/legislations/1972
  - Official portal: https://u.ae/en/about-the-uae/digital-uae/data/data-protection-laws
- **What it appears to require:**
  - The PDPL protects natural persons only ("Data Subject: A Natural Person", Art. 1).
  - It applies to a "Controller or Processor residing outside the State ... processing Personal Data of Data Subjects inside the State" (Art. 2(1)(c)). It does not apply to free zones with their own laws, such as DIFC and ADGM (Art. 2(2)(g)).
  - Art. 4: "It is prohibited to process Personal Data without the consent of its owner", subject to listed exceptions. One covers data "which has become available and known to all by an act of the Data Subject" (Art. 4(2)); whether that covers a published business email is **unclear**.
  - There is a right to object to direct marketing (Art. 17(1)).
  - We found no executive regulations on any official source, and compliance runs from their issue (Arts. 28–29): **verify with counsel**.
  - No federal statute specifically regulating commercial email was found. The telecom regulator's (TDRA) unsolicited-communications policy binds licensed telecom operators, not private senders (https://tdra.gov.ae/-/media/About/regulations-and-ruling/EN/Unsolicited-Elrctronic-Commuincations--pdf.ashx).
  - DIFC (Data Protection Law 2020, Art. 34) and ADGM (Data Protection Regulations 2021, s.19) have their own direct-marketing objection rules: **verify with counsel** for free-zone recipients.
- **Unsubscribe / identity / postal address:** no general statutory email content rule was found. Honour objections (PDPL Art. 17).
- **Platform note:** a company role address may be lawful to email. The platform can't separate role from named addresses in the rules, so keep `REVIEW`.

| Bucket | Current default | Suggested default | Why | Counsel decision | Signed off by / date |
|---|---|---|---|---|---|
| incorporated | REVIEW | REVIEW | Role address possibly allowed; named employee needs consent (Art. 4); regulations unclear | | |
| soleTrader | REVIEW | REVIEW | Consent (Art. 4) unless the "made public" exception applies (unclear) | | |
| partnership | REVIEW | REVIEW | As soleTrader | | |
| unknownForm | REVIEW | REVIEW | Unknown | | |

## Any other country

- **Law:** varies. Unknown countries default to `REVIEW` (`docs/contracts/enrichment.md` rule 15).
- **Note:** the ePrivacy Directive lets each EU state choose protection for businesses (Art. 13(3) and (5), https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:02002L0058-20091219), so no EU-wide rule can be assumed.
- **Examples of how much rules vary:**
  - **Australia**, Spam Act 2003 (https://www.legislation.gov.au/C2004A01214/latest/text): unsolicited commercial messages are banned (s.16). Consent may be inferred from a "conspicuously published" work address when the message is relevant to the person's role (Schedule 2, clause 4), as in Canada. Sender information (s.17) and a working unsubscribe (s.18) are required.
  - **Singapore**, Spam Control Act 2007 (https://sso.agc.gov.sg/Act/SCA2007?WholeDoc=1): applies only to messages sent "in bulk" (s.6). It is an opt-out regime requiring an "<ADV>" label in the subject line and an unsubscribe facility (Second Schedule).
- **Suggestion:** keep `REVIEW`. Add a country to this sheet, with a primary source and counsel's sign-off, before emailing it.

| Bucket | Current default | Suggested default | Why | Counsel decision | Signed off by / date |
|---|---|---|---|---|---|
| incorporated | REVIEW | REVIEW | No review yet | | |
| soleTrader | REVIEW | REVIEW | No review yet | | |
| partnership | REVIEW | REVIEW | No review yet | | |
| unknownForm | REVIEW | REVIEW | No review yet | | |

---

## Other channels (WhatsApp, LinkedIn, phone)

The country rules table decides email only. Today:
- WhatsApp and LinkedIn are `ASSISTED_ALLOWED` in every country;
- phone is `CALL_TASK_ALLOWED`;
- only suppression blocks them (`docs/contracts/enrichment.md` rule 16; INV-25 lets assisted channels go ahead with a notice).

Our research suggests these messages are often covered by the same rules as email.

| Jurisdiction | Finding | Source |
|---|---|---|
| UK | The electronic-mail rules apply to "emails, texts, picture messages, video messages, voicemails, direct messages via social media or any similar message that is stored electronically". "If you are marketing using direct messaging via social media, the electronic mail marketing rules apply." So a WhatsApp or LinkedIn message to a sole trader or partnership needs consent, as email does | https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/electronic-mail-marketing/ |
| UK (phone) | "you must not make marketing calls to any number listed on the Telephone Preference Service (TPS) or Corporate TPS (CTPS), unless that person has specifically consented to your calls ... So you need to screen call lists against the TPS and CTPS." The platform does not screen | https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/telephone-marketing/ |
| EU | The ePrivacy Directive defines "electronic mail" as "any text, voice, sound or image message sent over a public communications network which can be stored in the network or in the recipient's terminal equipment until it is collected by the recipient" (Art. 2(h)). Whether each state treats WhatsApp or LinkedIn messages as electronic mail: **verify with counsel** | https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:02002L0058-20091219 |
| Canada | An "electronic address" includes "(b) an instant messaging account; (c) a telephone account; or (d) any similar account", so WhatsApp messages are commercial electronic messages under CASL | https://laws-lois.justice.gc.ca/eng/acts/E-1.6/page-1.html |
| Nigeria | GAID Art. 18(1)(a) covers "any direct marketing activity", not only email | https://ndpc.gov.ng/wp-content/uploads/2025/07/NDP-ACT-GAID-2025-MARCH-20TH.pdf |
| Germany (phone) | Advertising calls to businesses need at least presumed consent (UWG §7(2) Nr. 1, contrasted with the express consent required for email in Nr. 2). The exact wording was not quoted here: **verify with counsel** | https://www.gesetze-im-internet.de/uwg_2004/__7.html |
| South Africa | The Regulator lists "Direct messaging in Instagram or LinkedIn" among electronic communications (guidance note §7.1). POPIA s.69 applies to "any form of electronic communication" | https://inforegulator.org.za/wp-content/uploads/2020/07/GUIDANCE-NOTE-ON-DIRECT-MARKETING-IN-TERMS-OF-THE-PROTECTION-OF-PERSONAL-INFORMATION-ACT-4-OF-2013-POPIA.pdf |
| UAE | Cabinet Resolution 56 of 2024 on telemarketing covers "marketing text messages and marketing messages through social media applications", for companies licensed in the UAE. Whether it reaches a foreign sender: **verify with counsel** | https://www.moet.gov.ae/documents/20121/0/English+%D9%82%D8%B1%D8%A7%D8%B1+%D9%85%D8%AC%D9%84%D8%B3+%D8%A7%D9%84%D9%88%D8%B2%D8%B1%D8%A7%D8%A1+%D8%B1%D9%82%D9%85+56+%D9%84%D8%B3%D9%86%D8%A9+2024+%D8%A8%D8%B4%D8%A7%D9%94%D9%86+%D8%AA%D9%86%D8%B8%D9%8A%D9%85+%D8%A7%D9%84%D8%AA%D8%B3%D9%88%D9%8A%D9%82+%D8%B9%D8%A8%D8%B1+%D8%A7%D9%84%D9%85%D9%83%D8%A7%D9%84%D9%85%D8%A7%D8%AA+%D8%A7%D9%84%D9%87%D8%A7%D8%AA%D9%81%D9%8A%D8%A9.pdf/8a81f5d0-ab74-b8a2-653b-657bf9b2544f?t=1725007365303 |

**Suggestion for counsel to confirm:**
- Apply each country's email verdict to WhatsApp and LinkedIn messages too, so that a `CONSENT_REQUIRED` or `REVIEW` email verdict also holds the assisted message.
- Add TPS/CTPS screening before UK call tasks.
- Both need a platform change (a contract change to `docs/contracts/enrichment.md` rule 16).
