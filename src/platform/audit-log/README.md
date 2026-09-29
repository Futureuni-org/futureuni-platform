# @/platform/audit-log

Append-only audit log (`INV-20`). `audit.record` is the exact `SEAM-AUDIT` shape used by Phases 3
and 5. `before` and `after` are redacted for sensitive keys before being stored.

## Example

```ts
import { audit, withAudit } from "@/platform/audit-log";
import { withTransaction } from "@/platform/db";

// One-shot audit (outside a transaction).
await audit.record(null, {
  actor: { type: "USER", userId, role: "ADMIN" },
  action: "platform.setting.update",
  targetType: "Setting",
  targetId: "platform.postalAddress",
  before: { value: null },
  after: { value: "…" },
});

// Audit that must live or die with a mutation.
await withTransaction((tx) =>
  withAudit(tx, entry, async (tx) => {
    await tx.setting.upsert({ where: /* … */, create: /* … */, update: /* … */ });
  }),
);
```
