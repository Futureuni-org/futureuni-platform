# src/platform/http/

**Owner: Phase 09 (Enrichment and compliance).** The safe web fetcher (Phase 9) that every crawl uses: it checks `robots.txt` for the `FUTUREUNI-Bot/1.0` user agent, skips disallowed paths and never fetches pages behind a login (INV-14). It provides SEAM-SAFE-FETCH to other phases.
