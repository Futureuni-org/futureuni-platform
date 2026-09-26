# src/app/api/cron/

**Owner: Phase 06 (Platform services).** The single Vercel Cron entry, `/api/cron/tick`, called every 5 minutes (UTC). It rejects anything without `Authorization: Bearer <CRON_SECRET>` and enqueues each due schedule with an idempotency key, so a duplicated tick never runs a job twice (`docs/contracts/jobs.md` rule 5, INV-22). README.md files are ignored by Next.js routing.
