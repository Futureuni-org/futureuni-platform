# src/modules/forms/

**Client Forms** — the platform's second tool. Spec: `docs/specs/module-forms.md`.

FUTUREUNI sends a prospect a link, the prospect answers questions about the job, and the answers
arrive here as a brief the team can read and quote from.

| Folder | What it holds |
|---|---|
| `definitions/` | The forms themselves, as typed data, plus the registry that validates and serves them. F2 moves them into `frm_form_definitions` behind the same three functions. |
| `core/` | Answer normalisation and the required-field rule (`answers.ts`, pure — the renderer imports it too), the plain-text brief (`brief.ts`, pure), the submission service (`submissions.ts`) and its only Prisma access (`submissions.repo.ts`). |
| `ui/public/` | The form a prospect fills in. Client components, driven entirely by a `FormDefinition`. |
| `ui/internal/` | What the team sees: one brief, and the copy-the-link button. |
| `manifest.ts` | Navigation, permissions and the "a brief arrived" notification type. |

Routes live in `src/app/(forms)/f/[slug]/` (public) and `src/app/(platform)/forms/` (internal).

**Rules this module keeps.** It never edits the platform core, it does not import another module,
and every rule about what a valid answer is lives in `core/answers.ts` so the browser and the
server cannot disagree.

**Adding a form today:** write a definition in `definitions/`, export it from `definitions/index.ts`
and bump nothing else — the registry validates it on first read and the public route serves it as
soon as its status is `PUBLISHED`.
