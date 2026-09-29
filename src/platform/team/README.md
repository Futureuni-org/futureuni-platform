# `@/platform/team` — Phase 3

Team profile services. Every function is `server-only` and permission-checked. Phase 18 wraps these in server actions and screens.

```ts
import {
  getTeamProfile, listTeam, updateTeamProfile,
  recalculateLoad, getLineCapacity, isLineAtCapacity,
  actorFromCurrentUser, type TeamProfileRow, type TeamUserRow, type LineCapacity,
} from "@/platform/team";
```

- **`getTeamProfile(actor, userId)`** — reads a single profile. `platform.team.read` for the profile's first service line.
- **`listTeam(actor, { serviceLine?, role? })`** — lists active team members that match the filter.
- **`updateTeamProfile(actor, userId, patch)`** — updates capacity, timezone, working hours, service lines, `canApprove`, title. Enforces the project-rules matrix (a MANAGER can only update SERVICE_LEAD and MEMBER profiles).
- **`recalculateLoad(userId)`** — sums the user's active `HandoffAssignment` rows and persists `currentLoad`. Phase 11 calls this on every assignment change.
- **`getLineCapacity(serviceLine)`** — `{ capacity, load, available }` per line. Phase 11's throttle uses this.
- **`isLineAtCapacity(serviceLine)`** — convenience: `available <= 0`.

All fields are validated with Zod:

- `weeklyCapacity` — integer, 0..40.
- `workingDays` — integer ISO weekdays 0..6, max 7 entries.
- `workingHoursStart/End` — `HH:MM` (24h); end must be after start.
- `timezone` — validated at runtime against `Intl.DateTimeFormat`.

Every mutation records an audit entry through SEAM-AUDIT.
