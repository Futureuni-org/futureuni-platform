# csv-import adapter

Imports a lawfully-collected list of businesses from a CSV file (all lines, both markets).

The adapter entry exists so the registry and Search panel can list it; the real work runs through
the **`importCsv` service** (`src/modules/acquisition/sourcing/csv-import.ts`), not a provider
`search`. The RFC 4180 parser is in `parse-csv.ts`.

## Flow

1. Upload the file through `@/platform/storage` (`createUploadUrl`, purpose `CSV_IMPORT`).
2. **Column mapping** → one of: company name (required), website, phone, email (at least one of the
   three required), contact name, contact role, city, country, notes.
3. **Preview** with per-row validation; rejected rows are downloadable as a CSV error report.
4. **Attestation (required):** the uploader confirms *"I confirm this data was not purchased and was
   collected lawfully."* Without the exact statement the import is refused — purchased lists are
   banned (project-rules §Bans, INV-10). The attestation is stored on the import's `SearchRun`.
5. Valid rows run through the same pipeline as a search (dedupe, early suppression, signal,
   `NEW` lead). The **market is derived per row**; each row records the reserved `manual_lead`
   signal plus any profile signals the uploader selected.

## Limits

- Maximum rows from the setting `acquisition.sourcing.maxCsvRows` (default 5,000).
- No credential, no cost. `sourceUrl` on a CSV signal is optional (a row may still supply one).

Re-verified 2026-10-01.
