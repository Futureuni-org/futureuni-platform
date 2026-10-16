# src/app/(forms)/

**Owner: Client Forms (docs/specs/module-forms.md §5).** The client-facing route group: the form a
prospect fills in at `/f/<slug>`, with no session and none of the platform shell.

Its own group rather than `(public)` because `(public)` is a narrow centred card for the
unsubscribe page, and a brief needs a reading column. `/f/` is allowlisted in `src/proxy.ts`, and
every page here is `noindex` — the link goes to one client, it is not published.

README.md files are ignored by Next.js routing.
