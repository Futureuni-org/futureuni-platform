# @/modules/acquisition/compliance

Country rules, legal-form detection, contactability, suppression, consent, DSR and retention
purge (Phase 9). The **country rules table** in `country-rules.ts` is marked "requires legal
review. Not legal advice." Every phase-9 rollout must be reviewed with Nigerian and EU counsel
before real cold email begins (see `phases/09/SUMMARY.md`).

## Public API

```ts
import {
  getContactability, assertEmailAllowed,
  addSuppression, removeSuppression, listSuppressions,
  recordConsent, revokeConsent,
  createDataSubjectRequest, fulfilExport, fulfilDelete,
  runAcquisitionRetentionPurge,
  detectUkLegalForm, detectNgLegalForm,
  complianceJobs, complianceSettings, complianceSubscribers,
} from "@/modules/acquisition/compliance";
```

`assertEmailAllowed(tx, { companyId, contactId })` throws `AppError("CONTACT_BLOCKED")` unless
the email verdict is `ALLOWED`; Phase 12 calls it in the same code path as sending (`INV-2`).
