# @/platform/events

The domain-event bus (`docs/contracts/events.md`). Modules react to each other without importing
each other: they publish typed events; anyone subscribes.

## Example

```ts
import { publish, publishAfterCommit } from "@/platform/events";
import { withTransaction } from "@/platform/db";

// Standalone publish (immediate delivery).
await publish({
  name: "settings.changed",
  actor: { type: "USER", userId, role: "ADMIN" },
  payload: { key: "platform.postalAddress", scope: "PLATFORM", userId: null },
});

// After-commit: writes to the DomainEvent outbox; a rollback emits nothing.
await withTransaction(async (tx) => {
  // …update rows…
  await publishAfterCommit(tx, {
    name: "lead.statusChanged",
    actor,
    payload: { /* … */ },
  });
});
```

Platform subscribers `platform.notification-router` and `platform.audit-bridge` are always
active. Modules add their own subscribers via `AnySubscriberDefinition[]` on their manifest.
