# After Phase 21: Adding the Next Tool (for example Marketing)

The platform was built so that a new internal tool is a **new module**, not a rebuild. A module uses the platform core (auth, shell, AI service, jobs, notifications, settings, credentials, storage, audit log, the shared company and contact directory) and **never edits it**.

---

## The flow

### Module Wave 0: Spec and skeleton (sequential)

1. **Spec.** In Claude Code on `main`:

   > "Use saas-plan to write docs/specs/module-marketing.md for a Marketing module. It must use the platform core and the shared companies/contacts directory and must not change them. Include a data model section, a route map under /marketing, permissions, jobs, AI tasks, screens with states, and a phase plan in waves like the acquisition module."

   Review and approve it.
2. **Generate the module:**

   ```bash
   pnpm create-module marketing "Marketing"
   ```

   This creates `src/modules/marketing/` (manifest, core, UI, an example job, seed and test) and `src/app/(platform)/marketing/`.
3. **Schema and contracts.** Add `prisma/schema/marketing.prisma`, with every table prefixed `mkt_` (mapped with `@@map`), relating to the shared `Company` and `Contact` models only by foreign key. Add the module's contracts under `src/contracts/marketing/`. Create one migration.
4. **Ownership.** Add the module's phases to `scripts/ownership/ownership.json` and the `CLAUDE.md` table, following the acquisition pattern: one owner per folder.

### Module Waves 1–N: Build (parallel, like the acquisition waves)

- Write phase prompts the same way the acquisition ones were written: read-first list, what you own, steps, seams for same-wave dependencies, `REQUESTS.md`, "Done when".
- Use `pnpm phase start <nn> <slug>` for each parallel phase, and a prep-and-merge guide per wave.
- Screens follow `phases/04/SUMMARY.md` ("How to build a screen") and the Wave 4 UI quality bar.
- AI features register tasks with runtime skills and evals through `src/platform/ai`.

### Final module wave: Integration and hardening

- Complete the manifest, run the end-to-end journeys, run a full `saas-review`, and update the runbook and onboarding guide with the module's sections.

---

## Rules that keep the platform clean

- **Never edit the platform core from a module phase.** If the core genuinely needs a new capability (for example a new notification channel), run a separate, small **platform phase** for it first. Give it its own prompt, tests and review, and merge it before the module waves that need it.
- **Modules don't import each other.** Lint enforces this. If Marketing needs acquisition data, it reads the shared directory, or it subscribes to acquisition **events** (for example `deal.won`) through the event bus.
- **The shared directory is shared.** Company and contact dedupe always goes through `@/platform/directory`. Suppression and contactability rules apply to every module that contacts people.
- **Same compliance bar.** Any module that sends messages uses the same suppression, consent, unsubscribe and footer rules. Reuse the compliance services; don't rebuild them.
