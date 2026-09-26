# Pricing and portfolio: worksheet for Prince

Every price and portfolio item in the initial service-line profiles (`docs/specs/module-acquisition.md` §3.3) is a **placeholder**. The platform won't quote a price to a prospect while `pricing.needsReview` is true, and it never attaches a placeholder portfolio item to outreach or proposals (INV-19). This sheet is where you replace the placeholders with FUTUREUNI's real figures and work.

**How to fill it in:**
1. Edit the "Your figure" columns below, or reply with the numbers.
2. Leave a cell blank to keep the placeholder for now. Write "drop" to remove a package.
3. Add packages FUTUREUNI actually sells if they're missing.
4. EUR is optional (module spec OQ-4). If it's left blank, eurozone prospects are quoted in USD.

Figures are ranges (the low and high end of what you'd normally quote). Proposals are priced inside these ranges; a discount above 10%, or a total outside the range, needs a manager's approval. Amounts are stored in minor units (kobo, cents, pence), so whole naira, dollars or pounds are fine here.

Once it's filled in, the module spec §3.3 is updated. Phase 7 seeds the profiles from it and clears `needsReview` only for the lines you've confirmed.

---

## 1. Prices

### Web Development

| Package id | Name | Includes | Placeholder NGN | **Your NGN** | Placeholder USD | **Your USD** | Placeholder GBP | **Your GBP** | **Your EUR** (optional) |
|---|---|---|---|---|---|---|---|---|---|
| `web_starter` | Starter site | Up to 5 responsive pages, contact form, basic SEO | ₦450,000–₦900,000 | | $1,500–$3,000 | | £1,200–£2,500 | | |
| `web_business` | Business site | Up to 12 pages, CMS, analytics, speed optimisation | ₦1,200,000–₦2,500,000 | | $3,500–$7,500 | | £3,000–£6,000 | | |
| `web_ecommerce` | Online store | Catalogue, checkout, payments, order emails | ₦2,000,000–₦5,000,000 | | $6,000–$15,000 | | £5,000–£12,000 | | |
| `web_care` | Care plan (monthly) | Hosting oversight, updates, small edits | ₦50,000–₦150,000 / month | | $150–$400 / month | | £120–£320 / month | | |

### UI/UX Design

| Package id | Name | Includes | Placeholder NGN | **Your NGN** | Placeholder USD | **Your USD** | Placeholder GBP | **Your GBP** | **Your EUR** (optional) |
|---|---|---|---|---|---|---|---|---|---|
| `uiux_audit` | UX audit | Heuristic review, review analysis, prioritised fixes | ₦350,000–₦700,000 | | $1,200–$2,500 | | £1,000–£2,000 | | |
| `uiux_flow_redesign` | Flow redesign | One critical flow (for example onboarding) redesigned and prototyped | ₦800,000–₦1,800,000 | | $3,000–$6,000 | | £2,500–£5,000 | | |
| `uiux_product_design` | Product design | MVP or major feature design, prototype, handoff | ₦2,000,000–₦5,000,000 | | $8,000–$20,000 | | £6,500–£16,000 | | |
| `uiux_design_system` | Design system | Tokens, components, documentation | ₦1,500,000–₦4,000,000 | | $5,000–$12,000 | | £4,000–£10,000 | | |

### Graphic Design

| Package id | Name | Includes | Placeholder NGN | **Your NGN** | Placeholder USD | **Your USD** | Placeholder GBP | **Your GBP** | **Your EUR** (optional) |
|---|---|---|---|---|---|---|---|---|---|
| `graphic_logo_kit` | Logo and mini brand kit | Logo, palette, type pairing, usage sheet | ₦150,000–₦400,000 | | $400–$1,200 | | £350–£1,000 | | |
| `graphic_brand_identity` | Brand identity | Full identity, guidelines, templates | ₦500,000–₦1,500,000 | | $1,500–$4,000 | | £1,200–£3,200 | | |
| `graphic_social_pack` | Social design pack (monthly) | 12–20 designed posts per month | ₦100,000–₦300,000 / month | | $300–$900 / month | | £250–£750 / month | | |
| `graphic_retainer` | Design retainer (monthly) | Agreed hours of design per month | ₦250,000–₦600,000 / month | | $800–$2,000 / month | | £650–£1,600 / month | | |

### Video Editing

| Package id | Name | Includes | Placeholder NGN | **Your NGN** | Placeholder USD | **Your USD** | Placeholder GBP | **Your GBP** | **Your EUR** (optional) |
|---|---|---|---|---|---|---|---|---|---|
| `video_shorts_pack` | Shorts and Reels pack (monthly) | 8 short-form edits with captions | ₦120,000–₦300,000 / month | | $300–$800 / month | | £250–£650 / month | | |
| `video_long_form` | Long-form edit (per video) | Edit, captions, colour, sound clean-up | ₦40,000–₦120,000 / video | | $120–$400 / video | | £100–£320 / video | | |
| `video_channel_retainer` | Channel retainer (monthly) | 4 long-form + 8 shorts + thumbnails | ₦350,000–₦900,000 / month | | $1,000–$2,800 / month | | £800–£2,200 / month | | |
| `video_thumbnail_pack` | Thumbnail system | Template set + 10 thumbnails | ₦60,000–₦150,000 | | $150–$400 | | £120–£320 | | |

**Also confirm:**

| Question | Default in the pack | **Your answer** |
|---|---|---|
| Does FUTUREUNI charge Nigerian VAT on proposals? (module spec OQ-8) | No (tax off) | |
| Discount a line owner can give without a manager's approval | 10% | |
| How long a proposal is valid | Not set (Phase 14 picks a default; 30 days suggested) | |
| Payment terms to print on proposals (for example 50% upfront, 50% on delivery) | Not set | |

---

## 2. Portfolio items

Outreach and proposals attach **only** real items (never placeholders). Each pitch angle in the profiles asks for proof carrying certain **tags**, so a real item with a matching tag lets that angle cite it. An angle with no matching real item still works, just without proof attached.

For each item: a title, one or two sentences on what FUTUREUNI did, a public URL (live site, Behance, YouTube…), an image or video (a screenshot is fine; send the file), the markets it suits (Nigeria, international or both), an outcome metric if there's a **true, provable** one (for example "load time 7.1s → 1.9s"; leave it blank rather than estimate), and the tags from the table below. Please also confirm the client is happy to be named.

| Line | Tags the pitch angles look for | What would be ideal proof |
|---|---|---|
| Web Development | `website-launch`, `local-business`, `ecommerce`, `whatsapp-integration`, `performance`, `redesign`, `case-study`, `process`, `retainer` | A new site for a Nigerian SME; an online store with WhatsApp kept for questions; a before/after speed fix; a redesign; one international case study |
| UI/UX Design | `app-redesign`, `onboarding`, `fintech`, `design-system`, `case-study` | An app redesign driven by user feedback; a shorter signup flow; a fintech or health product; a design system |
| Graphic Design | `brand-identity`, `social-pack`, `brand-system`, `retainer`, `process`, `case-study` | A brand identity with guidelines; a month of social posts; a brand system used across channels |
| Video Editing | `youtube`, `retainer`, `captions`, `shorts`, `thumbnails`, `case-study` | A creator you edit for regularly; captioned shorts or reels; a thumbnail system |

**Your items** (copy the block for each one):

| Field | Value |
|---|---|
| Line | |
| Title | |
| What we did (1–2 sentences) | |
| Public URL | |
| Image or video file | |
| Markets (Nigeria / international / both) | |
| Tags | |
| Outcome metric (only if true and provable) | |
| Client agrees to be named? | |
