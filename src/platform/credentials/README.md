# @/platform/credentials

Encrypted vault for third-party API keys (`INV-21`, Phase 6). Every payload is stored as
AES-256-GCM ciphertext with a random IV, an auth tag and a key version. Plaintext never touches
the database, logs, audit entries or client code.

## Example

```ts
import { saveCredential, getCredential, resolveProviderKey } from "@/platform/credentials";

// ADMIN saves the Anthropic key.
await saveCredential(actor, "anthropic", { apiKey: process.env.ANTHROPIC_API_KEY! });

// A server adapter (Phase 5, 8, 9, ...) fetches whatever key it needs.
const key = await resolveProviderKey("anthropic"); // vault → env → null in mocks
```

## Rotation

`pnpm credentials:rotate` (implemented by `scripts/credentials-rotate.mjs`) reads the old key from
`CREDENTIALS_ENCRYPTION_KEY_OLD` and the new key from `CREDENTIALS_ENCRYPTION_KEY`, then calls
`rotateEncryptionKey(old, new, versionFromEnv)`. Every row is re-encrypted; a row already at the
new version is left alone.

## Providers

The static list is in `providers.ts`. Adding a real `test()` implementation is the job of the
phase that owns the adapter (Phase 5 for Anthropic, Phase 8 for sourcing, Phase 9 for enrichment,
etc.). In mock mode every `test()` succeeds without network access.
