# src/app/(platform)/forms/

**Owner: Client Forms (docs/specs/module-forms.md §5).** The internal screens: every form and its
public link (`/forms`), the briefs one form has collected (`/forms/<slug>`), and one brief
(`/forms/<slug>/<submissionId>`).

Each page checks its own permission (`forms.form.read`, `forms.submission.read`) and renders
`PermissionState` rather than redirecting. The components live in
`src/modules/forms/ui/internal/`. README.md files are ignored by Next.js routing.
