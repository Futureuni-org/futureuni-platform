# src/platform/directory/

**Owner: Phase 02 (Core schema and registry).** The shared company and contact directory, so
every module works with one record per company. Modules write companies and contacts only through
here.

| Export | What |
|---|---|
| `normalizeDomain(url)` | The registrable domain (Public Suffix List, private suffixes included), or null for social, marketplace and link-in-bio hosts |
| `classifyWebsite(url)` | `OWN_SITE`, `SOCIAL_ONLY`, `MARKETPLACE_ONLY` or `NONE` |
| `normalizePhone(raw, defaultCountry)` | E.164, or null when it isn't a possible number (`080…`, `+234…`, `234…`, `00…`, UK) |
| `normalizeEmail(raw)`, `emailDomain(email)` | Lower-case, trimmed |
| `normalizeCompanyName(name)` | For matching: no accents, `&` → and, no punctuation or legal suffixes (ltd, plc, llc, inc, …) |
| `findMatchingCompany(tx, candidate)` | Match by source ref, then domain, then phone, then name + city similarity (trigram ≥ 0.6) |
| `upsertCompany(tx, candidate, source)` | Match or create, then merge: fill empty fields; replace only with verified data or over a transient source; union phones; merge socials. A race on the domain index re-matches once |
| `upsertContact(tx, companyId, candidate, source)` | The same for contacts (by email, phone, then name) |

Every write records where each field came from (`fieldSources`), the first source, when it was
collected and the lawful basis (INV-10). A `google-places` candidate stores only its place id,
the `Place <last 6>` placeholder name and our own location facts (INV-14).
