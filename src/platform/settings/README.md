# @/platform/settings

Typed settings store (`docs/specs/platform.md` §3.8). Every key is registered once with a Zod
schema, a default, a scope (`PLATFORM`, `MODULE`, `USER`) and the permission needed to edit it.
Secrets never go here — they live in `@/platform/credentials`.

## Example

```ts
import { getSetting, setSetting, withSettingsRequest } from "@/platform/settings";

// Read with per-request cache.
await withSettingsRequest(async () => {
  const address = await getSetting<string>("platform.postalAddress");
});

// ADMIN writes a platform-scope value.
await setSetting(actor, "platform.postalAddress", "1 Example St, Lagos");
```

Modules add their own keys through their manifest's `settings: SettingDefinition[]`. The registry
merges them with the platform defaults at read time.
