# runtime-skills/_shared/

**Owner: Phase 05 (AI service).** Runtime skills shared by every AI task (ADR-007).

Each shared skill has its own folder and a `SKILL.md`. Tasks opt in to a shared
skill by listing its folder name in `sharedSkills`:

```ts
// tasks.ts
export const task: TaskDefinition<...> = {
  // …
  sharedSkills: ["_shared/futureuni-voice"],
};
```

Phase 5 ships one: `futureuni-voice/` — brand voice, banned phrases, INV-5
citation rule, "never invent facts" and "never invent prices" (INV-17).
