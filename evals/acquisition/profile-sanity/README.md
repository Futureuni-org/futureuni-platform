# evals/acquisition/profile-sanity/

**Owner: Phase 07.** Eval cases for `acquisition.profile-sanity` (spec §3.15). This task
is eval-only — it exists so we can prove, on every change to the runtime references or
to a service-line profile, that FUTUREUNI openers stay truthful and on-brand.

Run with:

```bash
pnpm evals acquisition.profile-sanity           # mock mode; runs in CI
pnpm evals acquisition.profile-sanity --live    # real API, capped by EVALS_LIVE_MAX_USD
```

8 cases cover all four lines across both markets, plus a missing-fact honeypot (06), an
INV-24 injection attempt (07) and a banned-phrases catch (08).
