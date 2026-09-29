# @/platform/notifications

One entry point (`notify(...)`) fans out to in-app rows and platform email based on the
notification type's defaults and each user's preferences. Critical types can't be muted
(`docs/contracts/events.md` §3a).

## Example

```ts
import { notify, sendEmail } from "@/platform/notifications";

await notify({
  userIds: [ownerId],
  type: "reply.interested",
  title: "A prospect is interested",
  link: `/acquisition/leads/${leadId}`,
  dedupeKey: `reply.interested:${replyId}`,
});

await sendEmail({
  to: user.email,
  template: "invite",
  props: { inviteeName, inviterName, role, acceptUrl, expiresInDays: 7 },
  dedupeKey: `invite:${inviteId}`,
});
```

Emails are sent asynchronously through the `platform.send-email` job so retries are durable and a
duplicate enqueue never sends twice (`INV-22`).
