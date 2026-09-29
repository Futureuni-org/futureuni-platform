# /api/cron

Vercel Cron endpoints owned by Phase 6. The single entry `GET /api/cron/tick` runs every 5
minutes and dispatches every due manifest schedule (`docs/contracts/jobs.md`, ADR-033). Modules
never edit `vercel.json`; a request to add or change a cron entry goes through the module's
manifest.
