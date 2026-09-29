# /api/dev/emails

Development-only email preview (Phase 6). `GET /api/dev/emails/<template>` renders the template
against its `defaultProps` and returns the HTML. Returns 404 in production.
